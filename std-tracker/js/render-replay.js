/* Watch Replay (osu!standard) — STEP 2 of the incremental build described
   in the saved plan (.claude/plans/synthetic-wibbling-hennessy.md,
   summarized in memory as an 8-step order). This step only proves the
   parsing + canvas geometry pipeline: real beatmap decode (osu-parsers +
   osu-standard-stable), real hit-object timing/position/radius, a
   wall-clock-driven approach-circle animation. Deliberately NOT yet
   included (later steps): cursor rendering (needs the real replay-frame
   interpolation + audio-sync clock, step 3), any judgement/combo/HP/pp
   (step 4-6), slider path tessellation / spinner rotation art (rendered
   here as a generic circle placeholder at the object's own start
   position + a kind marker, not a real slider body/spinner disc yet),
   mods (step 7), and all polish (skin import, settings drawer, hit
   sounds, leaderboard panel — step 8).

   Backend calls ported from catch-tracker's own render-replay.js:
   beatmap-file.js (raw .osu text, cached) and replay-download.js (auth'd
   .osr bytes, cached). Loaded as a <script type="module"> — this site has
   no CSP, so esm.sh imports work directly, no build step needed.
   common.js/api.js are loaded first as classic scripts and expose their
   top-level functions as globals. */

const PARSERS_URL = 'https://esm.sh/osu-parsers@4.1.7';
const STANDARD_STABLE_URL = 'https://esm.sh/osu-standard-stable@5.0.1';
const PLAYFIELD_W = 512;
const PLAYFIELD_H = 384;

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
   Hit-circle radius and approach-rate timing share the exact same
   underlying formulas across every osu! ruleset (LegacyRulesetExtensions.
   CalculateScaleFromCircleSize + IBeatmapDifficultyInfo.DifficultyRange in
   the real ppy/osu source) — catch-tracker's own catcherScaleFor()/
   fruitRadius()/timePreemptForAR() in its render-replay.js already port
   these for its catcher/fruit; reused here verbatim for std's own hit
   circles, just under standard-mode names. */
const OBJECT_RADIUS = 64;
function scaleFromCS(cs) {
    return (1 - 0.7 * ((cs ?? 5) - 5) / 5) / 2;
}
function circleRadius(cs) {
    return OBJECT_RADIUS * scaleFromCS(cs);
}
function difficultyRange(difficulty, min, mid, max) {
    if (difficulty > 5) return mid + (max - mid) * (difficulty - 5) / 5;
    if (difficulty < 5) return mid + (mid - min) * (difficulty - 5) / 5;
    return mid;
}
function preemptForAR(ar) {
    return difficultyRange(ar ?? 5, 1800, 1200, 450);
}
// Approximation, not yet the exact ppy/osu TimeFadeIn curve — good enough
// for this step's own goal (prove the parsing/timing pipeline), revisit
// alongside the real judgement work in a later step if the feel is off.
function fadeInForPreempt(preempt) {
    return preempt * 0.4;
}

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
    const p = h.stackedPosition || h.position || { x: PLAYFIELD_W / 2, y: PLAYFIELD_H / 2 };
    return { x: p.x, y: p.y };
}

/* ---------- canvas playback (step 2 scope: no cursor, no judgement) ----------
   Wall-clock only for now — real audio-sync (ReplayPlayer.tick()'s
   exponential-blend-toward-audio-clock technique) lands in step 3
   alongside real cursor interpolation, since both need the same replay
   frame data this step doesn't touch yet. */
class ReplayPlayerStep2 {
    constructor(canvas, items, minTime, maxTime, onTick) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.items = items;
        this.minTime = minTime;
        this.maxTime = maxTime;
        this.mapTime = minTime;
        this.playing = false;
        this.speed = 1;
        this.lastWall = 0;
        this.rafId = null;
        this.onTick = onTick || (() => {});
    }
    resize(w, h) {
        this.canvas.width = Math.max(1, Math.round(w));
        this.canvas.height = Math.max(1, Math.round(h));
        this.draw();
    }
    seek(mapTime) {
        this.mapTime = Math.max(this.minTime, Math.min(this.maxTime, mapTime));
        this.draw();
        this.onTick(this.mapTime, this.minTime, this.maxTime, this.playing);
    }
    play() {
        if (this.playing) return;
        this.playing = true;
        this.lastWall = performance.now();
        this.tick(this.lastWall);
    }
    pause() {
        this.playing = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }
    tick(wallNow) {
        const dt = wallNow - this.lastWall;
        this.lastWall = wallNow;
        if (this.playing) {
            this.mapTime += dt * this.speed;
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

            let alpha = 1;
            if (this.mapTime < it.startTime) {
                alpha = Math.min(1, (this.mapTime - it.spawnTime) / it.fadeIn);
            } else {
                alpha = Math.max(0, 1 - (this.mapTime - it.startTime) / (it.hideTime - it.startTime));
            }
            ctx.globalAlpha = Math.max(0, alpha);

            // Hit circle body, tinted by combo colour.
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = it.color;
            ctx.globalAlpha *= 0.35;
            ctx.fill();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.lineWidth = 2;
            ctx.strokeStyle = it.color;
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
            const label = it.kind === 'slider' ? 'S' : it.kind === 'spinner' ? '◎' : String(it.number);
            ctx.fillText(label, p.x, p.y);
        }
        ctx.globalAlpha = 1;
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
            Watch Replay 開發中,目前只有圖譜幾何與時間軸,還沒有游標、判定、滑條/轉盤真實外觀。
        </p>
        <div class="replay-theater-wrap">
            <div class="replay-theater" id="replay-theater">
                <div class="replay-theater-scrim"></div>
                <canvas id="replay-canvas" class="replay-canvas-full"></canvas>
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
        const { StandardRuleset, Slider, Spinner } = standardStable;
        const classes = { Slider, Spinner };

        const ruleset = new StandardRuleset();
        const parsedBeatmap = new BeatmapDecoder().decodeFromString(osuText);
        const standardBeatmap = ruleset.applyToBeatmap(parsedBeatmap);
        const cs = (standardBeatmap.difficulty && standardBeatmap.difficulty.circleSize) ?? 5;
        const ar = (standardBeatmap.difficulty && standardBeatmap.difficulty.approachRate) ?? 5;
        const radius = circleRadius(cs);
        const preempt = preemptForAR(ar);
        const fadeIn = fadeInForPreempt(preempt);

        const comboColours = (standardBeatmap.colors && standardBeatmap.colors.comboColors) || [];
        const { colourOf, numberOf } = computeComboColourMap(standardBeatmap.hitObjects, comboColours);

        const items = standardBeatmap.hitObjects.map(h => {
            const pos = objectPos(h);
            const kind = objectKind(h, classes);
            const startTime = h.startTime;
            return {
                kind, x: pos.x, y: pos.y, startTime,
                spawnTime: startTime - preempt,
                // Placeholder visual-hide window — real per-object judgement
                // (and its exact hit-window-based fade) lands in step 4.
                hideTime: startTime + 250,
                preempt, fadeIn, radius,
                color: colourOf.get(h),
                number: numberOf.get(h),
            };
        }).sort((a, b) => a.spawnTime - b.spawnTime);

        // Parsed here (and reported) purely to confirm the replay itself
        // decodes correctly — not rendered/used until step 3's cursor
        // interpolation.
        const parsedScore = await new ScoreDecoder().decodeFromBuffer(new Uint8Array(replayBuffer));
        const frameCount = (parsedScore.replay && parsedScore.replay.frames) ? parsedScore.replay.frames.length : 0;
        console.log(`[replay] parsed ${items.length} hit objects, ${frameCount} replay frames`);

        if (!items.length) {
            setStatus(errorHtml(t('replay_not_found')));
            return;
        }

        setStatus(theaterHtml(meta));
        const canvas = document.getElementById('replay-canvas');
        const playBtn = document.getElementById('replay-playpause');
        const scrub = document.getElementById('replay-scrub');
        const timeDisplay = document.getElementById('replay-time');

        const minTime = items[0].spawnTime;
        const maxTime = items[items.length - 1].startTime + 2000;

        const player = new ReplayPlayerStep2(canvas, items, minTime, maxTime, (mapTime, lo, hi, playing) => {
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

        player.draw();
    } catch (err) {
        setStatus(errorHtml(err.message || String(err)));
    }
}

run();
