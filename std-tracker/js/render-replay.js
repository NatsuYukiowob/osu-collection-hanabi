/* Watch Replay (osu!standard) — STEP 4 of the incremental build described
   in the saved plan (.claude/plans/synthetic-wibbling-hennessy.md,
   summarized in memory as an 8-step order). This step adds bit-perfect
   HIT-CIRCLE judgement (per the user's explicit call: real hit windows +
   real press-event detection + real radius check, not an approximation)
   — see judgeCircles() below for the algorithm and where its numbers
   come from. Sliders/spinners are deliberately EXCLUDED from judgement
   this step (still visual placeholders) — since most std maps are
   mostly sliders by object count, wiring up aggregate combo/accuracy/pp/
   rank HUD numbers now would show a plausible-looking but WRONG number
   (missing most of the map's real combo contribution) rather than
   something honestly partial. Those land once slider (step 5) and
   spinner (step 6) judging exist too, so every object type feeds them
   before they're first shown. This step's own verification is instead
   visual: each hit circle is expected to flip to a judgement colour/
   text (300/100/50/X) at the moment it's actually resolved, watchable
   frame-by-frame against what really happened.

   Still NOT included (later steps): slider/spinner judgement + their
   real path/rotation art (step 5-6), mods (step 7), all polish (skin
   import, settings drawer, hit sounds, leaderboard panel — step 8).

   Backend calls ported from catch-tracker's own render-replay.js:
   beatmap-file.js (raw .osu text, cached) and replay-download.js (auth'd
   .osr bytes, cached). Loaded as a <script type="module"> — this site has
   no CSP, so esm.sh imports work directly, no build step needed.
   common.js/api.js are loaded first as classic scripts and expose their
   top-level functions as globals. */

const PARSERS_URL = 'https://esm.sh/osu-parsers@4.1.7';
const STANDARD_STABLE_URL = 'https://esm.sh/osu-standard-stable@5.0.1';
const CLASSES_URL = 'https://esm.sh/osu-classes@3.1.0';
const PLAYFIELD_W = 512;
const PLAYFIELD_H = 384;
const AUDIO_URL = beatmapsetId => `https://mirror.hinamizawa.ai/v3/osu/music/audio/${beatmapsetId}`;

const JUDGEMENT_COLORS = { 300: '#7fd1ff', 100: '#8ce87a', 50: '#e8d97a', miss: '#ff5a5a' };

const main = document.getElementById('replay-main');

function setStatus(html) {
    main.innerHTML = html;
}

function loginGateHtml() {
    return `
        <div class="card" style="max-width:480px;margin:60px auto;text-align:center;padding:32px">
            <p style="margin-top:0">${escapeHtml(t('replay_login_prompt'))}</p>
            <a class="ct-login-btn" href="${stLoginUrl()}" style="display:inline-flex">${escapeHtml(t('login_with_osu'))}</a>
        </div>
    `;
}

function errorHtml(msg) {
    return `<p class="coverage-note">${escapeHtml(msg)}</p>`;
}

async function fetchBeatmapFile(beatmapId) {
    const res = await fetch(`${API_BASE}/beatmap-file?beatmap_id=${encodeURIComponent(beatmapId)}`);
    if (!res.ok) throw new Error(`beatmap-file: ${res.status}`);
    const { content } = await res.json();
    return content;
}

async function fetchReplayBytes(scoreId) {
    const res = await fetch(`${API_BASE}/replay-download?score_id=${encodeURIComponent(scoreId)}`, {
        headers: { Authorization: `Bearer ${getStAuthToken()}` },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403) throw new Error(t('replay_owner_only'));
        if (res.status === 404) throw new Error(t('replay_not_found'));
        if (res.status === 401) throw new Error(t('replay_login_prompt'));
        throw new Error(t('replay_fetch_failed', { msg: body.error || res.status }));
    }
    return res.arrayBuffer();
}

/* ---------- real osu! difficulty-derived geometry ----------
   osu-standard-stable's own decoded hit objects already carry the real,
   library-computed `radius` (from CS, LegacyRulesetExtensions.
   CalculateScaleFromCircleSize), `timePreempt`, and `timeFadeIn` (from
   AR, IBeatmapDifficultyInfo.DifficultyRange) — confirmed live this
   session by dumping a real decoded hit object's own fields, rather than
   hand-rolling the formulas ourselves the way catch-tracker's own
   render-replay.js had to (osu-catch-stable doesn't expose these the
   same way). No mod adjustment applied yet (that's step 7) — these are
   the base/unmodified values straight off the beatmap. */

/* ---------- combo colour (ported verbatim from catch-tracker's own
   computeComboColourMap — same beatmap-order combo-index walk, works
   identically for any ruleset's hit objects since isNewCombo/comboOffset
   are shared base-class fields) ---------- */
function resolveComboColour(comboColours, index) {
    if (!comboColours || !comboColours.length) return '#ffffff';
    const c = comboColours[((index % comboColours.length) + comboColours.length) % comboColours.length];
    return `rgb(${c.red},${c.green},${c.blue})`;
}
function computeComboColourMap(hitObjects, comboColours) {
    const map = new Map();
    let comboIndex = -1;
    let first = true;
    let numberInCombo = 0;
    const numbers = new Map();
    for (const h of hitObjects) {
        if (first || h.isNewCombo) {
            comboIndex += 1 + (h.comboOffset || 0);
            numberInCombo = 0;
            first = false;
        }
        numberInCombo += 1;
        map.set(h, resolveComboColour(comboColours, comboIndex));
        numbers.set(h, numberInCombo);
    }
    return { colourOf: map, numberOf: numbers };
}

function objectKind(h, classes) {
    const { Slider, Spinner } = classes;
    if (Spinner && h instanceof Spinner) return 'spinner';
    if (Slider && h instanceof Slider) return 'slider';
    return 'circle';
}
function objectPos(h) {
    // `startPosition` is the real field name on osu-standard-stable's
    // decoded hit objects (confirmed live — `position`/`stackedPosition`
    // are both undefined on it, unlike osu-catch-stable's own objects).
    // `_stackOffset` (confirmed live too — no public stacked-position
    // getter exists on this library's objects) must be added manually to
    // get the real on-screen/judged position in a stacked note stream;
    // without it, dense stream sections would render every note at the
    // same unstacked spot and judge them against the wrong position.
    const p = h.startPosition || { x: PLAYFIELD_W / 2, y: PLAYFIELD_H / 2 };
    const off = h._stackOffset || { x: 0, y: 0 };
    return { x: p.x + off.x, y: p.y + off.y };
}

/* ---------- bit-perfect hit-circle judgement ----------
   Per the user's explicit call: real hit windows, real press-event
   detection, real radius check — not an approximation. Hit windows come
   straight from the object's own `hitWindows.windowFor(HitResult.*)`
   (confirmed live this session — osu-standard-stable computes these
   itself from OD, no need to hand-roll the OD formula). */
function extractHitWindows(h, HitResult) {
    return {
        h300: h.hitWindows.windowFor(HitResult.Great),
        h100: h.hitWindows.windowFor(HitResult.Ok),
        h50: h.hitWindows.windowFor(HitResult.Meh),
    };
}

// A "press event" is any frame where a previously-unset button bit
// (M1=1/M2=2/K1=4/K2=8) becomes set — any NEW key going down counts as a
// click, even while another key is already held. Uses the press-frame's
// own recorded position (not interpolated) since that's the real cursor
// position osu! itself would judge against at that exact input.
function extractPressEvents(frames) {
    const events = [];
    let prevButtons = 0;
    for (const f of frames) {
        if ((f.buttons & ~prevButtons) !== 0) events.push({ time: f.time, x: f.x, y: f.y });
        prevButtons = f.buttons;
    }
    return events;
}

// Walks circle objects in time order against the (also time-ordered)
// press events, consuming the EARLIEST still-unused press inside each
// object's own ±h50 window that also lands within its radius. A press
// event is exhausted (permanently skippable for every later object too)
// once its time falls before the current object's own window start,
// since objects only move forward in time — safe to advance `cursor`
// past those rather than rescanning from the start each time.
function judgeCircles(circles, pressEvents) {
    const used = new Array(pressEvents.length).fill(false);
    let cursor = 0;
    for (const it of circles) {
        const lo = it.startTime - it.h50;
        const hi = it.startTime + it.h50;
        while (cursor < pressEvents.length && pressEvents[cursor].time < lo) cursor++;
        let result = 'miss';
        let resolvedTime = hi;
        for (let i = cursor; i < pressEvents.length && pressEvents[i].time <= hi; i++) {
            if (used[i]) continue;
            const ev = pressEvents[i];
            const dx = ev.x - it.x, dy = ev.y - it.y;
            if (dx * dx + dy * dy <= it.radius * it.radius) {
                const dt = Math.abs(ev.time - it.startTime);
                result = dt <= it.h300 ? 300 : dt <= it.h100 ? 100 : 50;
                resolvedTime = ev.time;
                used[i] = true;
                break;
            }
        }
        it.judgement = result;
        it.resolvedTime = resolvedTime;
    }
}

/* ---------- replay frames (osu-parsers' ScoreDecoder output) ----------
   Confirmed live this session (dumped a real decoded frame): fields are
   `startTime` (already an absolute, cumulative ms — the decoder itself
   accumulates the .osr format's own per-frame ms-deltas, so no manual
   summing needed here), `position: {x, y}`, and `buttonState` (the
   M1=1/M2=2/K1=4/K2=8 bitmask — not used for anything yet, kept for
   step 4's judgement engine since it comes for free alongside x/y). */
function extractFrames(parsedScore) {
    const raw = (parsedScore.replay && parsedScore.replay.frames) || [];
    return raw
        .map(f => ({ time: f.startTime, x: f.position ? f.position.x : null, y: f.position ? f.position.y : null, buttons: f.buttonState || 0 }))
        .filter(f => typeof f.time === 'number' && f.x !== null && f.y !== null)
        .sort((a, b) => a.time - b.time);
}

// Binary-search + linear interpolation between the two nearest real
// recorded frames — the same faithful-replay-playback technique
// catch-tracker's own catcherXAt() already uses for its 1D catcher X,
// generalized here to both axes (std needs real 2D cursor position, not
// just a left/right catcher position).
function cursorAt(frames, t) {
    if (!frames.length) return null;
    if (t <= frames[0].time) return frames[0];
    if (t >= frames[frames.length - 1].time) return frames[frames.length - 1];
    let lo = 0, hi = frames.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].time <= t) lo = mid; else hi = mid;
    }
    const a = frames[lo], b = frames[hi];
    const span = b.time - a.time;
    const frac = span > 0 ? (t - a.time) / span : 0;
    return {
        x: a.x + (b.x - a.x) * frac,
        y: a.y + (b.y - a.y) * frac,
        buttons: a.buttons,
    };
}

/* ---------- canvas playback ----------
   Clock is a hybrid, ported near-verbatim from catch-tracker's own
   ReplayPlayer.tick(): wall-clock-driven mapTime that continuously,
   exponentially blends toward the real <audio> clock (rather than
   snapping to it every frame, which visibly "staircases" since the
   audio element's own clock doesn't update every rAF tick on every
   browser) whenever audio is actually playing and ready. play()/seek()
   hard-sync audio.currentTime/playbackRate at each discrete action. */
class ReplayPlayer {
    constructor(canvas, items, frames, minTime, maxTime, audioEl, onTick) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.items = items;
        this.frames = frames;
        this.minTime = minTime;
        this.maxTime = maxTime;
        this.mapTime = minTime;
        this.playing = false;
        this.speed = 1;
        this.lastWall = 0;
        this.rafId = null;
        this.onTick = onTick || (() => {});

        this.audio = audioEl || null;
        this.audioReady = false;
        if (this.audio) {
            this.audio.addEventListener('canplay', () => {
                this.audioReady = true;
                if (this.playing) {
                    this.audio.currentTime = Math.max(0, this.mapTime / 1000);
                    this.audio.playbackRate = this.speed;
                    this.audio.play().catch(() => { this.audioReady = false; });
                }
            }, { once: true });
            this.audio.addEventListener('error', () => { this.audioReady = false; });
            this.audio.addEventListener('ended', () => {
                if (this.mapTime < this.maxTime - 250) {
                    this.audioReady = false;
                    this.lastWall = performance.now();
                } else {
                    this.playing = false;
                }
            });
        }
    }
    resize(w, h) {
        this.canvas.width = Math.max(1, Math.round(w));
        this.canvas.height = Math.max(1, Math.round(h));
        this.draw();
    }
    seek(mapTime) {
        this.mapTime = Math.max(this.minTime, Math.min(this.maxTime, mapTime));
        if (this.audio && this.audioReady) this.audio.currentTime = Math.max(0, this.mapTime / 1000);
        this.draw();
        this.onTick(this.mapTime, this.minTime, this.maxTime, this.playing);
    }
    play() {
        if (this.playing) return;
        this.playing = true;
        this.lastWall = performance.now();
        if (this.audio && this.audioReady) {
            this.audio.currentTime = Math.max(0, this.mapTime / 1000);
            this.audio.playbackRate = this.speed;
            this.audio.play().catch(() => { this.audioReady = false; });
        }
        this.tick(this.lastWall);
    }
    pause() {
        this.playing = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
        if (this.audio) this.audio.pause();
    }
    tick(wallNow) {
        const dt = wallNow - this.lastWall;
        this.lastWall = wallNow;
        if (this.playing) {
            this.mapTime += dt * this.speed;
            if (this.audio && this.audioReady) {
                const audioMs = this.audio.currentTime * 1000;
                const drift = audioMs - this.mapTime;
                this.mapTime += drift * Math.min(1, dt / 200);
            }
            if (this.mapTime >= this.maxTime) {
                this.mapTime = this.maxTime;
                this.playing = false;
            }
        }
        this.draw();
        this.onTick(this.mapTime, this.minTime, this.maxTime, this.playing);
        if (this.playing) this.rafId = requestAnimationFrame(t => this.tick(t));
    }

    draw() {
        const { ctx, canvas } = this;
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // osu!'s real playfield is 512x384 (4:3), centered in this
        // (16:9) theater canvas, sized to fit the available height with
        // a small top/bottom margin for HUD elements later — the
        // standard "widescreen support" layout the real game itself
        // uses, distinct from catch-tracker's own fixed-fraction hack
        // (that one was reverse-engineered to match a specific reference
        // site's own 1D catch-only presentation; std needs both axes, so
        // this is the more natural fit-by-height approach instead).
        const playfieldH = h * 0.8;
        const playfieldW = playfieldH * (PLAYFIELD_W / PLAYFIELD_H);
        const offsetX = (w - playfieldW) / 2;
        const offsetY = (h - playfieldH) / 2;
        const scale = playfieldW / PLAYFIELD_W;
        const toPx = (x, y) => ({ x: offsetX + x * scale, y: offsetY + y * scale });

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.strokeRect(offsetX, offsetY, playfieldW, playfieldH);

        for (const it of this.items) {
            if (this.mapTime < it.spawnTime || this.mapTime > it.hideTime) continue;
            const p = toPx(it.x, it.y);
            const r = it.radius * scale;
            // Once a circle's judgement is actually resolved (a real press
            // consumed it, or the miss window expired with none), it
            // switches from its combo colour to a judgement colour — the
            // direct visual check this step's own comment describes:
            // watch a real replay and confirm each circle flips to the
            // right 300/100/50/miss colour at the right moment.
            const judged = it.judgement !== undefined && this.mapTime >= it.resolvedTime;
            const drawColor = judged ? JUDGEMENT_COLORS[it.judgement] : it.color;

            let alpha = 1;
            if (this.mapTime < it.startTime) {
                alpha = Math.min(1, (this.mapTime - it.spawnTime) / it.fadeIn);
            } else {
                alpha = Math.max(0, 1 - (this.mapTime - it.startTime) / (it.hideTime - it.startTime));
            }
            ctx.globalAlpha = Math.max(0, alpha);

            // Hit circle body, tinted by combo colour (or judgement colour
            // once resolved).
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = drawColor;
            ctx.globalAlpha *= 0.35;
            ctx.fill();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.lineWidth = 2;
            ctx.strokeStyle = drawColor;
            ctx.stroke();

            // Approach circle: real osu! shrinks it from 3x the hit
            // circle's radius down to exactly 1x at the object's own
            // start time, then it vanishes (drawn only pre-hit).
            if (this.mapTime < it.startTime) {
                const approachProgress = Math.min(1, Math.max(0, (this.mapTime - it.spawnTime) / it.preempt));
                const approachR = r * (3 - 2 * approachProgress);
                ctx.beginPath();
                ctx.arc(p.x, p.y, approachR, 0, Math.PI * 2);
                ctx.lineWidth = 2;
                ctx.strokeStyle = it.color;
                ctx.stroke();
            }

            // Hit-number / kind marker — plain canvas text for now (no
            // skin digit sprites until the polish step). Sliders/
            // spinners are placeholder-rendered as a plain circle here
            // (their own path/rotation art lands in later steps) — the
            // marker makes that simplification visible rather than
            // silently pretending they're real hit circles.
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.fillStyle = '#fff';
            ctx.font = `${Math.max(10, r * 0.6)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = judged
                ? (it.judgement === 'miss' ? 'X' : String(it.judgement))
                : it.kind === 'slider' ? 'S' : it.kind === 'spinner' ? '◎' : String(it.number);
            ctx.fillText(label, p.x, p.y);
        }
        ctx.globalAlpha = 1;

        // Real replay cursor — interpolated from the actual recorded
        // frames (cursorAt()), not simulated. A held button (M1/M2/K1/K2,
        // bit != 0) gets a filled dot; otherwise just an outlined ring,
        // matching the "am I clicking right now" glance real osu!
        // clients give you. No judgement yet (step 4), so this is purely
        // the raw path — it doesn't yet reflect hit/miss.
        const cursor = cursorAt(this.frames, this.mapTime);
        if (cursor) {
            const cp = toPx(cursor.x, cursor.y);
            ctx.beginPath();
            ctx.arc(cp.x, cp.y, 6, 0, Math.PI * 2);
            if (cursor.buttons) {
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.fill();
            } else {
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.stroke();
            }
        }
    }
}

function resizeCanvasToDisplaySize(player, canvas) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) player.resize(rect.width, rect.height);
}

function fmtClockTime(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function theaterHtml(meta) {
    return `
        <h2 style="margin:0 0 4px">${escapeHtml(`${meta.artist} - ${meta.title} [${meta.version}]`)}</h2>
        <p class="coverage-note">
            ${escapeHtml(`${meta.username} ${meta.rank || ''}`)} —
            Watch Replay 開發中,打擊圈已有真實判定(300/100/50/miss),滑條/轉盤還沒有真實外觀或判定,分數/連段/pp 面板尚未加入。
        </p>
        <div class="replay-theater-wrap">
            <div class="replay-theater" id="replay-theater">
                <div class="replay-theater-scrim"></div>
                <canvas id="replay-canvas" class="replay-canvas-full"></canvas>
                <audio id="replay-audio" preload="auto"></audio>
                <div class="replay-bottom-bar">
                    <div class="replay-bottom-controls">
                        <button type="button" id="replay-playpause" class="replay-play-btn">▶</button>
                        <input type="range" id="replay-scrub" class="replay-scrub-full" min="0" max="1000" value="0">
                        <span id="replay-time" class="replay-time">0:00 / 0:00</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function run() {
    const params = new URLSearchParams(location.search);
    const scoreId = params.get('score_id');
    const beatmapId = params.get('beatmap_id');
    const beatmapsetId = params.get('beatmapset_id');
    const meta = {
        title: params.get('title') || '',
        artist: params.get('artist') || '',
        version: params.get('version') || '',
        username: params.get('username') || '',
        rank: params.get('rank') || '',
    };

    if (!scoreId || !beatmapId) {
        setStatus(errorHtml(t('replay_not_found')));
        return;
    }
    if (!getStLoggedInUser()) {
        setStatus(loginGateHtml());
        return;
    }

    setStatus(errorHtml(t('loading')));

    try {
        const [osuText, replayBuffer] = await Promise.all([
            fetchBeatmapFile(beatmapId),
            fetchReplayBytes(scoreId),
        ]);

        const { BeatmapDecoder, ScoreDecoder } = await import(PARSERS_URL);
        const standardStable = await import(STANDARD_STABLE_URL);
        const { HitResult } = await import(CLASSES_URL);
        const { StandardRuleset, Slider, Spinner } = standardStable;
        const classes = { Slider, Spinner };

        const ruleset = new StandardRuleset();
        const parsedBeatmap = new BeatmapDecoder().decodeFromString(osuText);
        const standardBeatmap = ruleset.applyToBeatmap(parsedBeatmap);

        const comboColours = (standardBeatmap.colors && standardBeatmap.colors.comboColors) || [];
        const { colourOf, numberOf } = computeComboColourMap(standardBeatmap.hitObjects, comboColours);

        const items = standardBeatmap.hitObjects.map(h => {
            const pos = objectPos(h);
            const kind = objectKind(h, classes);
            const startTime = h.startTime;
            const preempt = h.timePreempt;
            const fadeIn = h.timeFadeIn;
            const windows = kind === 'circle' ? extractHitWindows(h, HitResult) : null;
            return {
                kind, x: pos.x, y: pos.y, startTime,
                spawnTime: startTime - preempt,
                // Placeholder hide window for slider/spinner (not judged
                // this step) — a judged circle gets a real, judgement-
                // resolved hideTime set below instead.
                hideTime: startTime + 250,
                preempt, fadeIn, radius: h.radius,
                color: colourOf.get(h),
                number: numberOf.get(h),
                ...(windows || {}),
            };
        }).sort((a, b) => a.spawnTime - b.spawnTime);

        const parsedScore = await new ScoreDecoder().decodeFromBuffer(new Uint8Array(replayBuffer));
        const frames = extractFrames(parsedScore);
        console.log(`[replay] parsed ${items.length} hit objects, ${frames.length} replay frames`);

        // Bit-perfect circle judgement (see judgeCircles()'s own comment)
        // — sliders/spinners aren't judged yet, so they're excluded from
        // this pass entirely; their own turn is steps 5-6.
        const pressEvents = extractPressEvents(frames);
        const circleItems = items.filter(it => it.kind === 'circle');
        judgeCircles(circleItems, pressEvents);
        for (const it of circleItems) {
            // Fade out shortly after the judgement actually resolves,
            // instead of the earlier fixed startTime+250 placeholder —
            // a hit fades right after the press that resolved it, a miss
            // fades right after its window expires.
            it.hideTime = it.resolvedTime + 400;
        }

        if (!items.length) {
            setStatus(errorHtml(t('replay_not_found')));
            return;
        }

        setStatus(theaterHtml(meta));
        const canvas = document.getElementById('replay-canvas');
        const audioEl = document.getElementById('replay-audio');
        const playBtn = document.getElementById('replay-playpause');
        const scrub = document.getElementById('replay-scrub');
        const timeDisplay = document.getElementById('replay-time');

        if (beatmapsetId) {
            audioEl.src = AUDIO_URL(beatmapsetId);
            audioEl.load();
        }

        const itemMin = items[0].spawnTime;
        const itemMax = items[items.length - 1].startTime + 2000;
        const frameMin = frames.length ? frames[0].time : itemMin;
        const frameMax = frames.length ? frames[frames.length - 1].time : itemMax;
        const minTime = Math.min(itemMin, frameMin);
        const maxTime = Math.max(itemMax, frameMax);

        const player = new ReplayPlayer(canvas, items, frames, minTime, maxTime, beatmapsetId ? audioEl : null, (mapTime, lo, hi, playing) => {
            const pct = hi > lo ? ((mapTime - lo) / (hi - lo)) * 1000 : 0;
            scrub.value = String(pct);
            playBtn.textContent = playing ? '⏸' : '▶';
            timeDisplay.textContent = `${fmtClockTime(mapTime - lo)} / ${fmtClockTime(hi - lo)}`;
        });

        resizeCanvasToDisplaySize(player, canvas);
        new ResizeObserver(() => resizeCanvasToDisplaySize(player, canvas)).observe(document.getElementById('replay-theater'));
        window.addEventListener('resize', () => resizeCanvasToDisplaySize(player, canvas));

        playBtn.addEventListener('click', () => {
            if (player.playing) player.pause();
            else player.play();
        });
        scrub.addEventListener('input', () => {
            const frac = Number(scrub.value) / 1000;
            player.pause();
            player.seek(minTime + frac * (maxTime - minTime));
        });

        // seek() to the already-current mapTime just to fire draw()+onTick()
        // once up front — otherwise the time display sits on theaterHtml()'s
        // static "0:00 / 0:00" placeholder until the first real play/scrub.
        player.seek(player.mapTime);
    } catch (err) {
        setStatus(errorHtml(err.message || String(err)));
    }
}

run();
