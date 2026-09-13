/* Watch Replay — canvas playback, theater layout.

   Verified live against a real replay: has_replay/download only lights up
   for scores that are notable enough on their beatmap for osu! to retain
   the replay server-side. A #1-world-rank catch score (Story — "Double
   Helix" [Polymerized Nucleotide], score 6141982961) DID have one, and the
   full pipeline was confirmed end-to-end: download → real .osr →
   BeatmapDecoder/ScoreDecoder/CatchRuleset → this canvas renderer.
   CatchReplayConverter was tried for the replay side but turned out
   broken (26239 raw frames collapsed to 24, wrong timestamps) AND
   unnecessary — ScoreDecoder's raw parsedScore.replay.frames already carry
   position.x directly, in the same coordinate space as the raw decoded
   beatmap hit objects (confirmed by comparing raw frame X against hit
   object X on a real HR replay: diffs of a few px, vs 100-400px when
   compared against a manually-512-mirrored X) — so nothing here manually
   mirrors for HR either; both sides are used exactly as decoded. Also
   verified: full-song audio (mirror.hinamizawa.ai) and client-side .osk
   skin sprites (fflate) — see git history.

   This pass matches mania-tracker.com's replay-viewer PRESENTATION (full-
   bleed dark theater over a blurred cover, borderless floating HUD text,
   big top-left accuracy / top-right combo, a leaderboard panel) without
   copying its actual technique — mania-tracker draws its ENTIRE UI
   (verified live: a single ~2500x1100px canvas, no real DOM text at all)
   on canvas; this uses ordinary HTML/CSS positioned over a background
   image + the gameplay canvas, which looks the same to a viewer at a
   fraction of the implementation cost and keeps text selectable/i18n'd
   normally.

   Also corrects an earlier assumption: mania-tracker's "Spectators (2)"
   panel is NOT a real-time presence/viewer system — live-verified by
   actually clicking play and watching the current replay's own row
   (username + score) appear in that same list, starting at 0 and counting
   up live. It's the beatmap's own leaderboard with the score being
   watched highlighted/appended — no real-time backend needed, just
   GET /beatmaps/{id}/scores (see beatmap-leaderboard.js). This is a
   genuinely cheaper feature than the "phase 2" write-up assumed, so it's
   included in this pass rather than deferred.

   Judgement is a simulated position-at-catch-time check against the
   catcher (see computeJudgements()) — catch-native stats (combo/accuracy/
   caught/miss/HP), not mania's timing-judgement MAX/300/.../UR, which
   don't exist in a positional game. Labeled as an estimate throughout.

   Loaded as a <script type="module"> — this site has no CSP, so esm.sh
   imports work directly, no build step needed. common.js/api.js are
   loaded first as classic scripts and expose their top-level functions as
   globals. */

const PARSERS_URL = 'https://esm.sh/osu-parsers@4.1.7';
const CATCH_STABLE_URL = 'https://esm.sh/osu-catch-stable@4.0.1';
const FFLATE_URL = 'https://esm.sh/fflate@0.8.2';
const PLAYFIELD_X = 512; // osu! catch coordinate space width, in osu!pixels

const AUDIO_URL = beatmapsetId => `https://mirror.hinamizawa.ai/v3/osu/music/audio/${beatmapsetId}`;

const SKIN_FILES = {
    catcher: 'fruit-catcher-idle',
    catcher_fail: 'fruit-catcher-fail',
    catcher_kiai: 'fruit-catcher-kiai',
    banana: 'fruit-bananas',
    droplet: 'fruit-drop',
    fruit_apple: 'fruit-apple',
    fruit_grapes: 'fruit-grapes',
    fruit_orange: 'fruit-orange',
    fruit_pear: 'fruit-pear',
};
const FRUIT_TYPE_CYCLE = ['apple', 'grapes', 'orange', 'pear'];

const HP_GAIN = 0.5;
const HP_LOSS = 4;
const POPUP_DURATION_MS = 600;
const SETTINGS_KEY = 'ct_replay_settings';
// blur/brightness default to the same values the .replay-theater-scrim CSS
// rule used before these became adjustable — see applyBackgroundSettings().
const DEFAULT_SETTINGS = { blur: 26, brightness: 50, popups: true, bananaRain: false, volume: 70 };

const main = document.getElementById('replay-main');

function setStatus(html) {
    main.innerHTML = html;
}

function loginGateHtml() {
    return `
        <div class="card" style="max-width:480px;margin:60px auto;text-align:center;padding:32px">
            <p style="margin-top:0">${escapeHtml(t('replay_login_prompt'))}</p>
            <a class="ct-login-btn" href="${ctLoginUrl()}" style="display:inline-flex">${escapeHtml(t('login_with_osu'))}</a>
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
        headers: { Authorization: `Bearer ${getCtAuthToken()}` },
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

async function fetchLeaderboard(beatmapId) {
    try {
        const res = await fetch(`${API_BASE}/beatmap-leaderboard?beatmap_id=${encodeURIComponent(beatmapId)}`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.scores || [];
    } catch {
        return []; // decorative panel — never blocks the replay itself
    }
}

/* ---------- faithful port of osu!lazer's CatchBeatmapProcessor.ApplyPositionOffsets ----------
   osu-catch-stable (the decode library used here) does NOT apply this at
   all — live-verified: effectiveX===originalX for every object it decodes
   regardless of mods, and the library's own exported CatchBeatmapProcessor
   (it has one!) had zero effect when invoked directly (postProcess() and
   its private _applyXOffsets() both ran with no error but left every
   object's position completely unchanged — tried both the ruleset-
   converted beatmap and calling it before conversion; whatever internal
   state it expects isn't what either produces). Rather than keep guessing
   at an undocumented minified library, this is a direct port of the real
   game's algorithm from osu.Game.Rulesets.Catch/Beatmaps/
   CatchBeatmapProcessor.cs (ppy/osu, MIT licensed), including its own
   documented stable-compatibility quirks — those are deliberate bugs in
   the real game being preserved for parity, not mistakes introduced here.
   This was a real, verified source of judgement error (a wrong-score-ID
   test aside, even a CORRECTLY fetched HR replay showed catcher-to-object
   distances the un-offset positions couldn't explain), not cosmetic:
   - Regular Fruit objects get NO offset unless Hard Rock is active, in
     which case consecutive fruits close in time get "trilled" apart.
   - JuiceStream-nested TinyDroplets ALWAYS get a small random jitter
     (±20px), regardless of mods.
   - BananaShower's Bananas ALWAYS get scattered across the full playfield
     width, regardless of mods.
   All three draw from ONE shared, seeded RNG stream advanced in beatmap
   order — the exact call sequence (including calls whose results are
   discarded, e.g. droplet rotation) has to match or every offset after
   the first divergence would desync from the real game's. */
const HR_OFFSET_RNG_SEED = 1337;

class LegacyRandom {
    constructor(seed) {
        this.x = seed >>> 0;
        this.y = 842502087;
        this.z = 3579807591;
        this.w = 273326509;
        this.bitBuffer = 0;
        this.bitIndex = 32;
    }
    nextUInt() {
        const t = (this.x ^ (this.x << 11)) >>> 0;
        this.x = this.y; this.y = this.z; this.z = this.w;
        this.w = (this.w ^ (this.w >>> 19) ^ t ^ (t >>> 8)) >>> 0;
        return this.w;
    }
    next() { return this.nextUInt() & 0x7fffffff; }
    nextDouble() { return (1.0 / 2147483648.0) * this.next(); }
    nextRange(lowerBound, upperBound) { return Math.trunc(lowerBound + this.nextDouble() * (upperBound - lowerBound)); }
    nextBool() {
        if (this.bitIndex === 32) {
            this.bitBuffer = this.nextUInt();
            this.bitIndex = 1;
            return (this.bitBuffer & 1) === 1;
        }
        this.bitIndex++;
        this.bitBuffer = this.bitBuffer >>> 1;
        return (this.bitBuffer & 1) === 1;
    }
}

function hrApplyRandomOffset(position, maxOffset, rng) {
    const right = rng.nextBool();
    const rand = Math.min(20, rng.nextRange(0, Math.max(0, maxOffset)));
    if (right) return (position + rand <= PLAYFIELD_X) ? position + rand : position - rand;
    return (position - rand >= 0) ? position - rand : position + rand;
}

function hrApplyOffset(position, amount) {
    if (amount > 0) return (position + amount < PLAYFIELD_X) ? position + amount : position;
    return (position + amount > 0) ? position + amount : position;
}

// Returns a Map<hitObject, xOffset> covering every top-level object and
// every nested object (juice stream droplets, banana-shower bananas).
// Objects with no applicable offset are simply absent from the map — treat
// a missing entry as 0.
function computePositionOffsets(hitObjects, classes, hardRockOffsets) {
    const { Fruit, Banana, JuiceStream, JuiceDroplet, JuiceTinyDroplet } = classes;
    const rng = new LegacyRandom(HR_OFFSET_RNG_SEED);
    const offsets = new Map();
    let lastPosition = null;
    let lastStartTime = 0;

    for (const obj of hitObjects) {
        if (Fruit && obj instanceof Fruit) {
            if (!hardRockOffsets) continue;
            const originalX = getObjectX(obj);

            if (lastPosition === null || lastPosition === 0) {
                lastPosition = originalX;
                lastStartTime = obj.startTime;
                continue;
            }

            const positionDiff = originalX - lastPosition;
            const timeDiff = Math.trunc(obj.startTime - lastStartTime);

            if (timeDiff > 1000) {
                lastPosition = originalX;
                lastStartTime = obj.startTime;
                continue;
            }

            if (positionDiff === 0) {
                const offsetPosition = hrApplyRandomOffset(originalX, timeDiff / 4, rng);
                offsets.set(obj, offsetPosition - originalX);
                continue; // preserved stable bug: lastPosition/lastStartTime NOT updated here
            }

            let offsetPosition = originalX;
            if (Math.abs(positionDiff) < timeDiff / 3) offsetPosition = hrApplyOffset(originalX, positionDiff);
            offsets.set(obj, offsetPosition - originalX);
            lastPosition = offsetPosition;
            lastStartTime = obj.startTime;
        } else if (JuiceStream && obj instanceof JuiceStream) {
            // BUG preserved from stable (see real source comment): uses the
            // stream's start position + its path's LAST CONTROL POINT x
            // (not the actual computed curve endpoint), and its START time
            // (not end time) — intentionally not "fixed" here either.
            const originalX = getObjectX(obj);
            const cps = obj.path && (obj.path.controlPoints || obj.path._controlPoints);
            const lastCp = cps && cps.length ? cps[cps.length - 1] : null;
            const lastCpX = lastCp && (lastCp.position ? lastCp.position.x : lastCp.x);
            lastPosition = originalX + (typeof lastCpX === 'number' ? lastCpX : 0);
            lastStartTime = obj.startTime;

            for (const n of (obj.nestedHitObjects || [])) {
                if (JuiceTinyDroplet && n instanceof JuiceTinyDroplet) {
                    const nx = getObjectX(n);
                    const off = rng.nextRange(-20, 20);
                    offsets.set(n, Math.max(-nx, Math.min(PLAYFIELD_X - nx, off)));
                } else if (JuiceDroplet && n instanceof JuiceDroplet) {
                    rng.next(); // discarded — matches stable's "random droplet rotation" draw, keeps the RNG stream aligned
                }
            }
        } else if (Banana && obj.nestedHitObjects && obj.nestedHitObjects.length && obj.nestedHitObjects[0] instanceof Banana) {
            // BananaShower — matched by its nested objects (osu-catch-stable
            // doesn't export a BananaShower class distinguishable the same
            // way Fruit/JuiceStream are here).
            for (const n of obj.nestedHitObjects) {
                const nx = getObjectX(n);
                offsets.set(n, rng.nextDouble() * PLAYFIELD_X - nx);
                rng.next(); rng.next(); rng.next(); // discarded — type/rotation/colour draws in stable
            }
        }
    }

    return offsets;
}

/* ---------- data-shape helpers ----------
   Confirmed correct on a real replay — kept as a candidate list rather
   than collapsed to a single property access since it costs nothing and
   hedges against a future osu-catch-stable/osu-parsers field rename. */

function getObjectX(h) {
    const candidates = [h.effectiveX, h.originalX, h.x, h._originalX];
    for (const c of candidates) if (typeof c === 'number' && Number.isFinite(c)) return c;
    return 0;
}

function getFrameX(frame) {
    const candidates = [frame.position && frame.position.x, frame.x, frame.catcherPosition];
    for (const c of candidates) if (typeof c === 'number' && Number.isFinite(c)) return c;
    return null;
}

function classifyObject(h, classes) {
    const { Fruit, Banana, JuiceDroplet, JuiceTinyDroplet } = classes;
    if (Banana && h instanceof Banana) return 'banana';
    if (JuiceTinyDroplet && h instanceof JuiceTinyDroplet) return 'tiny';
    if (JuiceDroplet && h instanceof JuiceDroplet) return 'droplet';
    if (Fruit && h instanceof Fruit) return 'fruit';
    return 'fruit';
}

function getFruitType(h, index) {
    const candidates = [h.visualRepresentation, h.VisualRepresentation, h.fruitVisualRepresentation];
    for (const c of candidates) if (typeof c === 'string') return c.toLowerCase();
    return FRUIT_TYPE_CYCLE[index % FRUIT_TYPE_CYCLE.length];
}

function buildDropItem(h, classes, index, offsets) {
    const x = getObjectX(h) + (offsets.get(h) || 0);
    const preempt = (typeof h.timePreempt === 'number' && h.timePreempt > 0) ? h.timePreempt : 800;
    const kind = classifyObject(h, classes);
    return {
        time: h.startTime, spawnTime: h.startTime - preempt, x, kind,
        fruitType: kind === 'fruit' ? getFruitType(h, index) : null,
        caught: false,
    };
}

function flattenHitObjects(hitObjects, classes, offsets) {
    const out = [];
    let i = 0;
    for (const h of hitObjects) {
        if (Array.isArray(h.nestedHitObjects) && h.nestedHitObjects.length) {
            for (const n of h.nestedHitObjects) out.push(buildDropItem(n, classes, i++, offsets));
        } else {
            out.push(buildDropItem(h, classes, i++, offsets));
        }
    }
    out.sort((a, b) => a.time - b.time);
    return out;
}

// NOT mirroring for HR is deliberate, confirmed against a real HR replay
// this session: raw replay-frame X (parsedScore.replay.frames) matches the
// RAW/undecoded beatmap hit-object X directly (within a few osu!pixels —
// diff ~1-20px across sampled objects), not a 512-mirrored value (which was
// off by 100-400px on the same objects). osu! evidently records replay
// cursor position in the beatmap's original coordinate space regardless of
// HR — the mirror is a display/input transform only, not a coordinate
// transform — so both hit objects and replay frames are decoded/used as-is
// with no manual mirroring anywhere in this file.
function clockRateForMods(mods) {
    if (mods.includes('DT') || mods.includes('NC')) return 1.5;
    if (mods.includes('HT') || mods.includes('DC')) return 0.75;
    return 1;
}

// Confirmed against osu!lazer's real source this session (Catcher.cs +
// LegacyRulesetExtensions.cs — no third-party site does catch skin/hitbox
// positioning, so the game's own code is the only real reference):
//   scale = LegacyRulesetExtensions.CalculateScaleFromCircleSize(cs)
//         = (1 - 0.7*(cs-5)/5) / 2, doubled for the catcher's actual
//           drawable scale — the /2 and *2 cancel, leaving this form.
//   CATCHER_BASE_SIZE = Catcher.BASE_SIZE (106.75, confirmed exact).
//   CATCHER_ALLOWED_CATCH_RANGE = Catcher.ALLOWED_CATCH_RANGE (0.8,
//   confirmed exact) — only this fraction of the catcher's VISUAL width
//   is the real judged hitbox; the plate looks wider than what actually
//   counts for a catch. Previously this file used the visual width for
//   judgement too (with a made-up +10px "leniency" fudge) — 25% too
//   generous. Now visual and hit width are computed separately and
//   correctly, with no invented fudge factor.
function catcherScaleFor(cs) {
    return 1 - 0.7 * ((cs ?? 5) - 5) / 5;
}
const CATCHER_BASE_SIZE = 106.75;
const CATCHER_ALLOWED_CATCH_RANGE = 0.8;
function catcherVisualWidth(cs) {
    return Math.max(20, CATCHER_BASE_SIZE * catcherScaleFor(cs));
}
function catcherHitWidth(cs) {
    return catcherVisualWidth(cs) * CATCHER_ALLOWED_CATCH_RANGE;
}

function catcherXAt(frames, t) {
    if (!frames.length) return PLAYFIELD_X / 2;
    if (t <= frames[0].time) return frames[0].x;
    if (t >= frames[frames.length - 1].time) return frames[frames.length - 1].x;
    let lo = 0, hi = frames.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].time <= t) lo = mid; else hi = mid;
    }
    const a = frames[lo], b = frames[hi];
    const span = b.time - a.time;
    const frac = span > 0 ? (t - a.time) / span : 0;
    return a.x + (b.x - a.x) * frac;
}

// Live-verified this session on a real 7.5-minute marathon map's replay:
// osu!'s stored .osr for it only actually contained ~68s of frames (15%
// of the map) despite downloading successfully with no error — not a
// decode bug on our end (confirmed by re-decoding the raw bytes directly
// and checking the last frame's own timestamp against the beatmap's last
// object). Past the last real frame, catcherXAt() has nothing to
// interpolate toward and holds the catcher frozen at wherever it last
// was, which would silently manufacture a "miss" for every object after
// that point — actively misleading rather than a harmless gap. Anything
// beyond the recorded frame range is marked `unknown` instead of judged,
// so stats/popups stop rather than lie past the point our data runs out.
function computeJudgements(items, frames, catcherHitWidthPx) {
    const halfWidth = catcherHitWidthPx / 2;
    const coverageEnd = frames.length ? frames[frames.length - 1].time : -Infinity;
    for (const it of items) {
        if (it.time > coverageEnd) { it.unknown = true; continue; }
        it.caught = Math.abs(catcherXAt(frames, it.time) - it.x) <= halfWidth;
    }
    return items;
}

// Confirmed against osu!lazer's real source this session
// (CatchBeatmapProcessor.initialiseHyperDash() + Catcher.BASE_DASH_SPEED).
// Ported as faithfully as practical: same "palpable objects" filter
// (fruit + non-tiny droplets, no bananas), same distance/timing formula.
// Since our catcher X already comes from real replay data (not a movement
// simulation), this is used purely to decide WHEN to show the hyperdash
// glow/trigger-fruit tint — not to move the catcher, which is unaffected.
const CATCHER_BASE_DASH_SPEED = 1.0; // osu!pixels/ms, confirmed exact

function computeHyperdash(items, catcherVisualWidthPx) {
    const palpable = items.filter(it => it.kind === 'fruit' || it.kind === 'droplet');
    const halfCatcherWidth = catcherVisualWidthPx / 2;
    let lastDirection = 0;
    let lastExcess = halfCatcherWidth;
    const windows = [];
    for (let i = 0; i < palpable.length - 1; i++) {
        const cur = palpable[i], next = palpable[i + 1];
        const thisDirection = next.x > cur.x ? 1 : -1;
        const timeToNext = next.time - cur.time - 1000 / 60 / 4;
        const distanceToNext = Math.abs(next.x - cur.x) - (lastDirection === thisDirection ? lastExcess : halfCatcherWidth);
        const distanceToHyper = timeToNext * CATCHER_BASE_DASH_SPEED - distanceToNext;
        if (distanceToHyper < 0) {
            cur.isHyperDashTrigger = true;
            windows.push({ start: cur.time, end: next.time });
            lastExcess = halfCatcherWidth;
        } else {
            lastExcess = Math.max(0, Math.min(distanceToHyper, halfCatcherWidth));
        }
        lastDirection = thisDirection;
    }
    return windows;
}

// Extracts the beatmap's kiai (hype-section) time ranges, used only to
// pick the catcher's kiai skin sprite when one's loaded. Field name
// confirmed live against a real decoded beatmap this session: osu-parsers'
// EffectPoint exposes `kiai` (not `kiaiMode`).
function extractKiaiRanges(beatmap) {
    try {
        const points = beatmap?.controlPoints?.effectPoints ?? null;
        if (!Array.isArray(points) || !points.length) return [];
        const sorted = [...points].sort((a, b) => a.startTime - b.startTime);
        const ranges = [];
        for (let i = 0; i < sorted.length; i++) {
            const p = sorted[i];
            if (!p.kiai) continue;
            const end = sorted[i + 1] ? sorted[i + 1].startTime : Infinity;
            ranges.push({ start: p.startTime, end });
        }
        return ranges;
    } catch {
        return [];
    }
}

// Judgement weighting confirmed against the real source (CatchScoreProcessor.cs):
// Fruit/Droplet/TinyDroplet are "dirty-hack"ed to weigh EQUALLY (300 each)
// toward accuracy on purpose (matches stable) — so tiny droplets belong in
// the accuracy ratio, not excluded. Banana is HitResult.LargeBonus: bonus
// results never affect combo or accuracy at all, in any osu! ruleset.
// Combo, separately, only breaks on Fruit/Droplet (HitResult.AffectsCombo
// lists Great/LargeTickHit but not SmallTickHit) — a missed tiny droplet
// or banana never resets it.
function computeStats(items, mapTime) {
    let combo = 0, maxCombo = 0, caught = 0, miss = 0, hp = 100;
    for (const it of items) {
        if (it.time > mapTime) break;
        if (it.kind === 'banana' || it.unknown) continue;
        const affectsCombo = it.kind !== 'tiny';
        if (it.caught) {
            if (affectsCombo) combo++;
            caught++;
            hp = Math.min(100, hp + HP_GAIN);
        } else {
            if (affectsCombo) combo = 0;
            miss++;
            hp = Math.max(0, hp - HP_LOSS);
        }
        if (combo > maxCombo) maxCombo = combo;
    }
    const total = caught + miss;
    return { combo, maxCombo, caught, miss, accuracy: total > 0 ? caught / total : 1, hp };
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* per-viewer convenience only */ }
}

const COLORS = { fruit: '#fb5a8c', droplet: '#60a5fa', tiny: '#93c5fd', banana: '#facc15' };

/* ---------- skin import (opt-in, client-side only) ----------
   Three techniques below were confirmed this session by downloading and
   reading mania-tracker.com's actual replay-skin-import bundle — their
   code has ZERO catch-mode logic (verified: no fruit-/CatchTheBeat/
   HyperDash/CatcherWidth strings anywhere, every "catch" match was just
   JS's own try/catch syntax — mania-tracker never built catch support, so
   there's nothing catch-specific to port), but three mode-agnostic
   techniques from it are worth adopting regardless: the onload/decoding
   hint pairing, capping oversized source textures, and persisting the
   imported skin so a visitor doesn't have to re-upload every visit. */

const MAX_SPRITE_TEXTURE = 1024; // sprites are drawn small on screen here; no need for their 4096/2048 device-tiered cap
const SKIN_DB_NAME = 'ct-replay-skin';
const SKIN_DB_STORE = 'skins';
const SKIN_DB_KEY = 'last';

function spriteSize(sprite) {
    return { w: sprite.naturalWidth || sprite.width || 1, h: sprite.naturalHeight || sprite.height || 1 };
}

function downscaleToCanvas(img, maxSize) {
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
}

// The load event (not img.decode()) — found live that decode() can hang
// indefinitely (never resolves OR rejects) on a real skin sprite while the
// tab is backgrounded, silently stalling the whole skin forever with no
// error surfaced. The classic load/error events fire reliably regardless
// of tab visibility, so the 5s timeout here is just a safety net.
function loadOneSprite(bytes) {
    return new Promise((resolve, reject) => {
        const blob = new Blob([bytes], { type: 'image/png' });
        const img = new Image();
        img.decoding = 'async';
        const timer = setTimeout(() => reject(new Error('sprite load timed out')), 5000);
        img.onload = () => {
            clearTimeout(timer);
            const oversized = img.naturalWidth > MAX_SPRITE_TEXTURE || img.naturalHeight > MAX_SPRITE_TEXTURE;
            resolve(oversized ? downscaleToCanvas(img, MAX_SPRITE_TEXTURE) : img);
        };
        img.onerror = () => { clearTimeout(timer); reject(new Error('sprite failed to decode')); };
        img.src = URL.createObjectURL(blob);
    });
}

async function decodeSpritesFromBytes(rawBytesByKey) {
    const sprites = {};
    await Promise.all(Object.entries(rawBytesByKey).map(async ([key, bytes]) => {
        try { sprites[key] = await loadOneSprite(bytes); } catch { /* keep procedural fallback for this one */ }
    }));
    return sprites;
}

function openSkinDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(SKIN_DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(SKIN_DB_STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Persistence is purely a convenience (skip re-uploading next visit) —
// every call site treats a failure here as a no-op, never a hard error.
async function saveSkinToDB(rawBytesByKey) {
    try {
        const db = await openSkinDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(SKIN_DB_STORE, 'readwrite');
            tx.objectStore(SKIN_DB_STORE).put(rawBytesByKey, SKIN_DB_KEY);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch { /* not fatal — the skin just won't be there next visit */ }
}

async function loadSkinBytesFromDB() {
    try {
        const db = await openSkinDB();
        const result = await new Promise((resolve, reject) => {
            const req = db.transaction(SKIN_DB_STORE, 'readonly').objectStore(SKIN_DB_STORE).get(SKIN_DB_KEY);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return result || null;
    } catch { return null; }
}

async function clearSkinDB() {
    try {
        const db = await openSkinDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(SKIN_DB_STORE, 'readwrite');
            tx.objectStore(SKIN_DB_STORE).delete(SKIN_DB_KEY);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch { /* nothing to clean up if this fails */ }
}

async function loadSkinSprites(file) {
    const { unzipSync } = await import(FFLATE_URL);
    const buf = new Uint8Array(await file.arrayBuffer());

    const wanted = new Set(Object.values(SKIN_FILES));
    const matchesWanted = name => {
        const base = name.split('/').pop().replace(/@2x/i, '').replace(/\.png$/i, '');
        return wanted.has(base.toLowerCase());
    };
    const unzipped = unzipSync(buf, { filter: f => !f.dir && matchesWanted(f.name) });

    const byBase = {};
    for (const [name, bytes] of Object.entries(unzipped)) {
        const base = name.split('/').pop().replace(/@2x/i, '').replace(/\.png$/i, '').toLowerCase();
        const isHiRes = /@2x/i.test(name);
        if (!byBase[base] || (isHiRes && !byBase[base].isHiRes)) byBase[base] = { bytes, isHiRes };
    }

    const rawBytesByKey = {};
    for (const [key, base] of Object.entries(SKIN_FILES)) {
        const entry = byBase[base];
        if (entry) rawBytesByKey[key] = entry.bytes;
    }

    const sprites = await decodeSpritesFromBytes(rawBytesByKey);
    saveSkinToDB(rawBytesByKey); // best-effort, not awaited — never blocks showing the skin
    return sprites;
}

/* ---------- canvas player ---------- */

class ReplayPlayer {
    constructor(canvas, items, frames, opts) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.items = items;
        this.frames = frames;
        this.clockRate = opts.clockRate;
        this.catcherWidth = opts.catcherWidth;
        this.hyperdashWindows = opts.hyperdashWindows || [];
        this.kiaiRanges = opts.kiaiRanges || [];
        this.sprites = {};
        this.showPopups = true;
        this.popups = [];
        this.lastPoppedTime = null;
        const itemMin = items.length ? items[0].spawnTime : 0;
        const itemMax = items.length ? items[items.length - 1].time : 0;
        const frameMin = frames.length ? frames[0].time : itemMin;
        const frameMax = frames.length ? frames[frames.length - 1].time : itemMax;
        this.minTime = Math.min(itemMin, frameMin);
        this.maxTime = Math.max(itemMax, frameMax) + 500;
        this.mapTime = this.minTime;
        this.playing = false;
        this.speed = 1;
        this.rafId = null;
        this.lastWall = 0;
        this.onTick = opts.onTick || (() => {});

        this.audio = opts.audio || null;
        this.audioReady = false;
        if (this.audio) {
            this.audio.addEventListener('canplay', () => {
                this.audioReady = true;
                if (this.playing) {
                    this.audio.currentTime = Math.max(0, this.mapTime / 1000);
                    this.audio.playbackRate = this.speed * this.clockRate;
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

    setSprites(sprites) { this.sprites = sprites || {}; }
    // Blur/brightness intentionally do NOT touch the canvas — those settings
    // are about the ambient background banner, not the gameplay itself
    // (blurring fruit/catcher would hurt playback legibility). See run()'s
    // applyBackgroundSettings(), which targets the scrim instead.
    setVisualSettings(s) {
        this.showPopups = s.popups;
    }
    resize(w, h) {
        this.canvas.width = Math.max(1, Math.round(w));
        this.canvas.height = Math.max(1, Math.round(h));
        this.draw();
    }

    catcherXAt(t) { return catcherXAt(this.frames, t); }
    currentStats() { return computeStats(this.items, this.mapTime); }

    // Both lists are small/sparse (hyperdash moments and kiai sections are
    // occasional, not per-frame), so a linear scan per draw() call is fine
    // — no need for the binary-search treatment catcherXAt() needs.
    isHyperDashingAt(t) {
        return this.hyperdashWindows.some(w => t >= w.start && t <= w.end);
    }
    isKiaiAt(t) {
        return this.kiaiRanges.some(r => t >= r.start && t < r.end);
    }
    catcherSpriteFor(t) {
        const recentMiss = this.popups.some(p => !p.caught && t - p.time >= 0 && t - p.time < 300);
        if (recentMiss && this.sprites.catcher_fail) return this.sprites.catcher_fail;
        if (this.isKiaiAt(t) && this.sprites.catcher_kiai) return this.sprites.catcher_kiai;
        return this.sprites.catcher;
    }

    updatePopups(prevTime) {
        if (this.lastPoppedTime === null) { this.lastPoppedTime = prevTime; }
        const jumped = Math.abs(prevTime - this.lastPoppedTime) > 50 || this.mapTime < this.lastPoppedTime;
        if (this.showPopups && !jumped && this.mapTime > this.lastPoppedTime) {
            for (const it of this.items) {
                if (it.kind === 'tiny' || it.unknown) continue;
                if (it.time > this.lastPoppedTime && it.time <= this.mapTime) {
                    this.popups.push({ time: it.time, x: it.x, caught: it.caught });
                }
            }
        }
        this.lastPoppedTime = this.mapTime;
        if (this.popups.length) this.popups = this.popups.filter(p => this.mapTime - p.time < POPUP_DURATION_MS);
    }

    draw() {
        const { ctx, canvas } = this;
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const catchLineY = h * 0.86;
        const toPx = x => (x / PLAYFIELD_X) * w;
        const fruitSize = w * 0.016;
        const sizeFor = kind => kind === 'tiny' ? w * 0.006 : kind === 'droplet' ? w * 0.011 : kind === 'banana' ? w * 0.014 : fruitSize;

        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.moveTo(0, catchLineY); ctx.lineTo(w, catchLineY); ctx.stroke();

        for (const it of this.items) {
            if (this.mapTime < it.spawnTime - 50 || this.mapTime > it.time + 150) continue;
            const span = it.time - it.spawnTime || 1;
            const progress = Math.min(1, Math.max(0, (this.mapTime - it.spawnTime) / span));
            const y = progress * catchLineY;
            const px = toPx(it.x);
            const size = sizeFor(it.kind);
            ctx.globalAlpha = this.mapTime > it.time ? Math.max(0, 1 - (this.mapTime - it.time) / 150) : 1;

            const spriteKey = it.kind === 'fruit' ? `fruit_${it.fruitType}` : it.kind === 'tiny' ? 'droplet' : it.kind;
            const sprite = this.sprites[spriteKey];
            if (sprite) {
                // Fit within a (size*2.4)-square box rather than stretching
                // to it — real skin fruit art is documented square, but
                // this stays correct for a skin whose art isn't (e.g. a
                // taller banana), instead of distorting it.
                const box = size * 2.4;
                const spriteWH = spriteSize(sprite);
                const aspect = spriteWH.w / spriteWH.h;
                let dw = box, dh = box / aspect;
                if (dh > box) { dh = box; dw = box * aspect; }
                ctx.drawImage(sprite, px - dw / 2, y - dh / 2, dw, dh);
            } else {
                ctx.fillStyle = COLORS[it.kind] || COLORS.fruit;
                ctx.beginPath();
                ctx.arc(px, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
            // Real catch tints the object that forces a hyperdash — this
            // draws a small orange ring around it regardless of whether a
            // skin sprite or the procedural fallback is in use, matching
            // the real "warning" cue without needing a skin's own colour.
            if (it.isHyperDashTrigger) {
                ctx.strokeStyle = '#fb923c';
                ctx.lineWidth = Math.max(1.5, size * 0.15);
                ctx.beginPath();
                ctx.arc(px, y, size * 1.3, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;

        const catcherX = toPx(this.catcherXAt(this.mapTime));
        const cw = (this.catcherWidth / PLAYFIELD_X) * w;
        const ch = h * 0.045;
        const catcherSprite = this.catcherSpriteFor(this.mapTime);
        const hyperDashing = this.isHyperDashingAt(this.mapTime);
        if (hyperDashing) {
            // Real catch tints the catcher and its dash trail red/orange
            // during a hyperdash window (CatchBeatmapProcessor-triggered) —
            // approximate with a glow behind the sprite rather than
            // recolouring the sprite itself (which would fight a skin's
            // own art).
            ctx.save();
            ctx.shadowColor = '#fb923c';
            ctx.shadowBlur = w * 0.02;
        }
        if (catcherSprite) {
            // Real catcher skin art is often a tall full-character sprite
            // (much taller than the actual catch hitbox) — scaling that to
            // the catch-hitbox WIDTH and preserving aspect blows the height
            // up hugely (found live with a real default skin: the catcher
            // covered a third of the screen). Fit within a bounded box
            // instead of deriving height purely from width x aspect.
            //
            // Anchor: measured a real default-skin fruit-catcher-idle.png's
            // alpha-channel width profile top-to-bottom — the WIDEST point
            // (the plate the character holds up, i.e. where fruits actually
            // land) is right near the top (~5% down), not the bottom/feet.
            // Anchoring near the bottom (as a first pass did) put the catch
            // line at the character's legs, with fruit falling through the
            // whole body before "landing" — anchoring near the top instead
            // so the plate sits at the catch line, with the rest of the
            // character extending down (and naturally clipping off the
            // bottom of the theater, same as real gameplay framing).
            const boxW = cw * 1.15;
            const boxH = h * 0.16;
            const catcherWH = spriteSize(catcherSprite);
            const aspect = catcherWH.w / catcherWH.h;
            let spriteW = boxW, spriteH = boxW / aspect;
            if (spriteH > boxH) { spriteH = boxH; spriteW = boxH * aspect; }
            ctx.drawImage(catcherSprite, catcherX - spriteW / 2, catchLineY - spriteH * 0.06, spriteW, spriteH);
        } else {
            ctx.fillStyle = '#e2e2f0';
            ctx.beginPath();
            ctx.moveTo(catcherX - cw / 2, catchLineY + ch / 2);
            ctx.lineTo(catcherX - cw / 3, catchLineY - ch / 2);
            ctx.lineTo(catcherX + cw / 3, catchLineY - ch / 2);
            ctx.lineTo(catcherX + cw / 2, catchLineY + ch / 2);
            ctx.closePath();
            ctx.fill();
        }
        if (hyperDashing) ctx.restore();

        if (this.showPopups) {
            const fontSize = Math.max(12, w * 0.014);
            for (const p of this.popups) {
                const age = this.mapTime - p.time;
                if (age < 0 || age > POPUP_DURATION_MS) continue;
                const alpha = 1 - age / POPUP_DURATION_MS;
                const py = catchLineY - fontSize - age * 0.06;
                ctx.globalAlpha = Math.max(0, alpha);
                ctx.fillStyle = p.caught ? '#4ade80' : '#f87171';
                ctx.font = `700 ${fontSize}px "Chakra Petch", sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(p.caught ? t('replay_stat_caught') : t('replay_stat_miss'), toPx(p.x), py);
            }
            ctx.globalAlpha = 1;
            ctx.textAlign = 'start';
        }
    }

    tick(wallNow) {
        const prevTime = this.mapTime;
        if (this.playing) {
            const dt = wallNow - this.lastWall;
            this.mapTime += dt * this.speed * this.clockRate;
            if (this.audioReady) {
                // Advance from the rAF wall clock every frame (smooth,
                // ~60fps) rather than overwriting mapTime with
                // audio.currentTime directly each tick — the audio
                // element's own clock doesn't update every single rAF
                // frame on every browser/backend, so doing that produced
                // a visible staircase-step fall motion instead of smooth
                // interpolation. Stay locked to the real audio over time
                // by continuously blending a fraction of the drift back
                // in every frame (exponential smoothing) rather than a
                // hard snap once a threshold is crossed — a snap is
                // itself a small visible jump; this converges just as
                // fast but never produces one.
                const audioMs = this.audio.currentTime * 1000;
                const drift = audioMs - this.mapTime;
                this.mapTime += drift * Math.min(1, dt / 200);
            }
            if (this.mapTime >= this.maxTime) {
                this.mapTime = this.maxTime;
                this.playing = false;
                if (this.audioReady) this.audio.pause();
            }
        }
        this.lastWall = wallNow;
        this.updatePopups(prevTime);
        this.draw();
        this.onTick(this.mapTime, this.minTime, this.maxTime, this.playing, this.currentStats());
        this.rafId = requestAnimationFrame(t => this.tick(t));
    }

    start() { this.lastWall = performance.now(); this.rafId = requestAnimationFrame(t => this.tick(t)); }
    stop() { if (this.rafId) cancelAnimationFrame(this.rafId); }

    play() {
        if (this.mapTime >= this.maxTime) this.mapTime = this.minTime;
        this.playing = true;
        if (this.audioReady) {
            this.audio.currentTime = Math.max(0, this.mapTime / 1000);
            this.audio.playbackRate = this.speed * this.clockRate;
            this.audio.play().catch(() => { this.audioReady = false; });
        }
    }
    pause() {
        this.playing = false;
        if (this.audioReady) this.audio.pause();
    }
    seek(t) {
        this.mapTime = Math.min(this.maxTime, Math.max(this.minTime, t));
        if (this.audioReady) this.audio.currentTime = Math.max(0, this.mapTime / 1000);
        this.lastPoppedTime = this.mapTime;
        this.popups = [];
        this.draw();
        this.onTick(this.mapTime, this.minTime, this.maxTime, this.playing, this.currentStats());
    }
    setSpeed(speed) {
        this.speed = speed;
        if (this.audioReady) this.audio.playbackRate = this.speed * this.clockRate;
    }
}

/* ---------- theater layout ---------- */

function fmtScore(n) {
    return Math.round(n || 0).toLocaleString();
}

function leaderboardRowHtml(row, isCurrent) {
    return `
        <div class="replay-lb-row${isCurrent ? ' replay-lb-current' : ''}" data-user-id="${row.user_id ?? ''}">
            <img class="replay-lb-avatar" src="${escapeHtml(row.avatar_url || '')}" alt="">
            <span class="replay-lb-name">${escapeHtml(row.username || '?')}</span>
            <span class="replay-lb-score">${fmtScore(row.total_score)}</span>
            <span class="replay-lb-combo">${row.max_combo ?? 0}x</span>
        </div>
    `;
}

function theaterHtml(meta) {
    const bgUrl = meta.beatmapsetId ? coverArtUrl(meta.beatmapsetId) : '';
    const title = [meta.artist, meta.title].filter(Boolean).join(' - ');
    return `
        <div class="replay-theater" id="replay-theater"${bgUrl ? ` style="background-image:url('${bgUrl.replace(/'/g, '%27')}')"` : ''}>
            <div class="replay-theater-scrim"></div>
            <canvas id="replay-canvas" class="replay-canvas-full"></canvas>
            <audio id="replay-audio" preload="auto"></audio>

            <div class="replay-hud-acc" id="replay-hud-acc">100.00%</div>
            <div class="replay-hud-combo" id="replay-hud-combo">0</div>
            <div class="replay-coverage-note" id="replay-coverage-note" hidden>${escapeHtml(t('replay_coverage_incomplete'))}</div>

            <div class="replay-hud-info">
                <div class="replay-hud-title">${escapeHtml(title || '')}</div>
                <div class="replay-hud-sub">
                    ${meta.version ? `[${escapeHtml(meta.version)}]` : ''}
                    ${meta.username ? escapeHtml(t('replay_info_by', { name: meta.username })) : ''}
                </div>
                <div class="replay-hud-tags">
                    ${meta.rank ? gradeBadge(meta.rank) : ''}
                    ${meta.mods.length ? modsTag(meta.mods) : ''}
                </div>
            </div>

            <aside class="replay-hud-leaderboard" id="replay-leaderboard"></aside>

            <aside class="replay-hud-stats">
                <div class="replay-hud-stat"><span>${escapeHtml(t('replay_stat_combo'))}</span><strong id="replay-stat-combo">0</strong></div>
                <div class="replay-hud-stat"><span>${escapeHtml(t('replay_stat_maxcombo'))}</span><strong id="replay-stat-maxcombo">0</strong></div>
                <div class="replay-hud-stat"><span>${escapeHtml(t('replay_stat_accuracy'))}</span><strong id="replay-stat-accuracy">100%</strong></div>
                <div class="replay-hud-stat"><span>${escapeHtml(t('replay_stat_caught'))}</span><strong id="replay-stat-caught">0</strong></div>
                <div class="replay-hud-stat"><span>${escapeHtml(t('replay_stat_miss'))}</span><strong id="replay-stat-miss">0</strong></div>
                <div class="replay-hp-bar"><div class="replay-hp-fill" id="replay-hp-fill"></div></div>
            </aside>

            <div class="replay-bottom-bar">
                <input type="range" id="replay-scrub" class="replay-scrub-full" min="0" max="1000" value="0">
                <div class="replay-bottom-controls">
                    <button type="button" id="replay-playpause" class="replay-play-btn">▶</button>
                    <div class="replay-speed-pills" id="replay-speed-pills">
                        <button type="button" data-speed="0.5">0.5x</button>
                        <button type="button" data-speed="1" class="active">1x</button>
                        <button type="button" data-speed="2">2x</button>
                    </div>
                    <label class="replay-icon-btn" for="replay-skin-input">${escapeHtml(t('replay_use_skin'))}</label>
                    <input type="file" id="replay-skin-input" accept=".osk" hidden>
                    <button type="button" id="replay-skin-clear" class="replay-icon-btn" hidden>${escapeHtml(t('replay_clear_skin'))}</button>
                    <span id="replay-skin-status" class="replay-skin-status"></span>
                    <button type="button" id="replay-settings-toggle" class="replay-icon-btn">${escapeHtml(t('replay_settings'))}</button>
                    <button type="button" id="replay-fullscreen-toggle" class="replay-icon-btn" title="Fullscreen">⤢</button>
                </div>
            </div>

            <div class="replay-settings-drawer" id="replay-settings-drawer" hidden></div>
        </div>
    `;
}

function settingsDrawerHtml(s) {
    return `
        <label>${escapeHtml(t('replay_settings_volume'))}
            <input type="range" id="replay-set-volume" min="0" max="100" step="5" value="${s.volume}">
        </label>
        <label>${escapeHtml(t('replay_settings_blur'))}
            <input type="range" id="replay-set-blur" min="0" max="50" step="2" value="${s.blur}">
        </label>
        <label>${escapeHtml(t('replay_settings_brightness'))}
            <input type="range" id="replay-set-brightness" min="10" max="100" step="5" value="${s.brightness}">
        </label>
        <label><input type="checkbox" id="replay-set-popups" ${s.popups ? 'checked' : ''}> ${escapeHtml(t('replay_settings_judgements'))}</label>
        <label><input type="checkbox" id="replay-set-banana" ${s.bananaRain ? 'checked' : ''}> ${escapeHtml(t('replay_settings_banana_rain'))}</label>
        <p style="margin:0;font-size:0.7rem;color:rgba(255,255,255,0.45);line-height:1.4">${escapeHtml(t('replay_disclaimer'))}</p>
    `;
}

function resizeCanvasToDisplaySize(player, canvas) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) player.resize(rect.width, rect.height);
}

// Blur/brightness settings apply to the background banner (the blurred
// cover-art scrim), not the gameplay canvas — see ReplayPlayer.
// setVisualSettings()'s comment for why.
function applyBackgroundSettings(scrim, s) {
    const filter = `blur(${s.blur}px) brightness(${s.brightness}%) saturate(1.15)`;
    scrim.style.backdropFilter = filter;
    scrim.style.webkitBackdropFilter = filter;
}

async function run() {
    const params = new URLSearchParams(location.search);
    const scoreId = params.get('score_id');
    const beatmapId = params.get('beatmap_id');
    const beatmapsetId = params.get('beatmapset_id');
    const userId = params.get('user_id');
    const mods = (params.get('mods') || '').split(',').filter(Boolean);
    const meta = {
        title: params.get('title') || '',
        artist: params.get('artist') || '',
        version: params.get('version') || '',
        username: params.get('username') || '',
        rank: params.get('rank') || '',
        beatmapsetId,
        mods,
    };

    if (!scoreId || !beatmapId) {
        setStatus(errorHtml(t('replay_not_found')));
        return;
    }
    if (!getCtLoggedInUser()) {
        setStatus(loginGateHtml());
        return;
    }

    setStatus(errorHtml(t('replay_loading')));

    try {
        const [osuText, replayBuffer] = await Promise.all([
            fetchBeatmapFile(beatmapId),
            fetchReplayBytes(scoreId),
        ]);

        const { BeatmapDecoder, ScoreDecoder } = await import(PARSERS_URL);
        const catchStable = await import(CATCH_STABLE_URL);
        const { CatchRuleset, Fruit, Banana, JuiceDroplet, JuiceTinyDroplet, JuiceStream } = catchStable;
        const objectClasses = { Fruit, Banana, JuiceDroplet, JuiceTinyDroplet, JuiceStream };

        const ruleset = new CatchRuleset();
        const parsedBeatmap = new BeatmapDecoder().decodeFromString(osuText);
        const catchBeatmap = ruleset.applyToBeatmap(parsedBeatmap);
        const cs = (catchBeatmap.difficulty && catchBeatmap.difficulty.circleSize)
            ?? (parsedBeatmap.difficulty && parsedBeatmap.difficulty.circleSize) ?? 5;

        const positionOffsets = computePositionOffsets(catchBeatmap.hitObjects, objectClasses, mods.includes('HR'));
        const items = flattenHitObjects(catchBeatmap.hitObjects, objectClasses, positionOffsets);

        const parsedScore = await new ScoreDecoder().decodeFromBuffer(new Uint8Array(replayBuffer));
        console.log('[replay] parsed score:', parsedScore);

        // Use the raw decoded replay frames directly — CatchReplayConverter
        // was tried first but produced garbage on a real replay (26239 raw
        // frames collapsed to 24, with wildly wrong timestamps). The raw
        // frames already carry exactly what's needed (position.x, in the
        // same coordinate space as the raw beatmap hit objects — see the
        // no-mirroring note near clockRateForMods above), so the converter
        // step turned out to be unnecessary as well as broken.
        const frames = (parsedScore.replay && parsedScore.replay.frames ? parsedScore.replay.frames : [])
            .map(f => ({ time: f.startTime, x: getFrameX(f) }))
            .filter(f => typeof f.time === 'number' && f.x !== null)
            .sort((a, b) => a.time - b.time);

        if (!items.length) {
            setStatus(errorHtml(t('replay_not_found')));
            return;
        }

        const catcherWidth = catcherVisualWidth(cs);
        computeJudgements(items, frames, catcherHitWidth(cs));
        const hyperdashWindows = computeHyperdash(items, catcherWidth);
        const kiaiRanges = extractKiaiRanges(catchBeatmap);

        // See computeJudgements()'s own comment — a stored .osr can end well
        // before the map does (live-verified on a 7.5-minute marathon map
        // whose replay only actually covered the first 15%). Only worth
        // surfacing if the gap is more than a couple seconds — a replay
        // ending a beat or two before the last object is normal/expected.
        const frameCoverageEnd = frames.length ? frames[frames.length - 1].time : -Infinity;
        const lastItemTime = items.length ? items[items.length - 1].time : 0;
        const coverageIncomplete = lastItemTime - frameCoverageEnd > 2000;

        const settings = loadSettings();
        setStatus(theaterHtml(meta));
        const theater = document.getElementById('replay-theater');
        const canvas = document.getElementById('replay-canvas');
        const audioEl = document.getElementById('replay-audio');
        const playBtn = document.getElementById('replay-playpause');
        const scrub = document.getElementById('replay-scrub');
        const speedPills = document.getElementById('replay-speed-pills');
        const skinInput = document.getElementById('replay-skin-input');
        const skinClearBtn = document.getElementById('replay-skin-clear');
        const skinStatus = document.getElementById('replay-skin-status');
        const hudAcc = document.getElementById('replay-hud-acc');
        const hudCombo = document.getElementById('replay-hud-combo');
        const hpFill = document.getElementById('replay-hp-fill');
        const statCombo = document.getElementById('replay-stat-combo');
        const statMaxCombo = document.getElementById('replay-stat-maxcombo');
        const statAccuracy = document.getElementById('replay-stat-accuracy');
        const statCaught = document.getElementById('replay-stat-caught');
        const statMiss = document.getElementById('replay-stat-miss');
        const leaderboardEl = document.getElementById('replay-leaderboard');
        const settingsToggle = document.getElementById('replay-settings-toggle');
        const settingsDrawer = document.getElementById('replay-settings-drawer');
        const fullscreenToggle = document.getElementById('replay-fullscreen-toggle');
        const coverageNote = document.getElementById('replay-coverage-note');

        audioEl.volume = settings.volume / 100;
        if (beatmapsetId) {
            audioEl.src = AUDIO_URL(beatmapsetId);
            audioEl.load();
        }

        const player = new ReplayPlayer(canvas, items, frames, {
            clockRate: clockRateForMods(mods),
            catcherWidth,
            hyperdashWindows,
            kiaiRanges,
            audio: beatmapsetId ? audioEl : null,
            onTick: (mapTime, minTime, maxTime, playing, stats) => {
                const pct = maxTime > minTime ? ((mapTime - minTime) / (maxTime - minTime)) * 1000 : 0;
                scrub.value = String(pct);
                playBtn.textContent = playing ? '⏸' : '▶';
                hpFill.style.width = `${stats.hp}%`;
                statCombo.textContent = stats.combo;
                statMaxCombo.textContent = stats.maxCombo;
                statAccuracy.textContent = `${(stats.accuracy * 100).toFixed(1)}%`;
                statCaught.textContent = stats.caught;
                statMiss.textContent = stats.miss;
                hudAcc.textContent = `${(stats.accuracy * 100).toFixed(2)}%`;
                hudCombo.textContent = String(stats.combo).padStart(4, '0');
                if (coverageIncomplete) coverageNote.hidden = mapTime <= frameCoverageEnd;
                const currentLbRow = leaderboardEl.querySelector('.replay-lb-current');
                if (currentLbRow) {
                    const comboEl = currentLbRow.querySelector('.replay-lb-combo');
                    if (comboEl) comboEl.textContent = `${stats.combo}x`;
                }
            },
        });
        player.setVisualSettings(settings);
        document.body.classList.toggle('show-banana-rain', settings.bananaRain);
        const scrim = theater.querySelector('.replay-theater-scrim');
        applyBackgroundSettings(scrim, settings);

        resizeCanvasToDisplaySize(player, canvas);
        // ResizeObserver (not just resize/fullscreenchange listeners) is the
        // primary correctness mechanism here — it fires on ANY change to the
        // theater's actual rendered box, regardless of what caused it, so a
        // browser settling a fullscreen transition on a different tick than
        // its fullscreenchange event can't leave the canvas measuring a
        // stale rect (the bug that killed the previous build of this
        // feature — see the CSS comment above .replay-theater). The other
        // two listeners are kept as a cheap belt-and-suspenders fallback.
        const theaterResizeObserver = new ResizeObserver(() => resizeCanvasToDisplaySize(player, canvas));
        theaterResizeObserver.observe(theater);
        window.addEventListener('resize', () => resizeCanvasToDisplaySize(player, canvas));
        document.addEventListener('fullscreenchange', () => resizeCanvasToDisplaySize(player, canvas));

        // Hover-to-reveal controls, matching mania-tracker.com's own replay
        // viewer (live-verified this session: its bottom control/settings
        // panel is hidden by default and only fades in on real mouse
        // movement over the player, auto-hiding again after a few seconds
        // idle — not a permanently-visible bar like a first pass of this
        // rebuild had). `mousemove` bubbles from every descendant (the
        // scrub bar, speed pills, settings drawer), so interacting with any
        // control also keeps this alive without a separate listener per
        // element; touchstart covers devices with no hover concept.
        let hideControlsTimer = null;
        function showControls() {
            theater.classList.add('controls-visible');
            if (hideControlsTimer) clearTimeout(hideControlsTimer);
            hideControlsTimer = setTimeout(() => {
                if (!settingsDrawer.hidden) return; // keep controls up while the settings drawer itself is open
                theater.classList.remove('controls-visible');
            }, 3000);
        }
        theater.addEventListener('mousemove', showControls);
        theater.addEventListener('touchstart', showControls, { passive: true });
        showControls(); // brief reveal on load so the play button is discoverable

        fullscreenToggle.addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (theater.requestFullscreen) {
                theater.requestFullscreen().catch(() => { /* not fatal — theater already fills most of the viewport without it */ });
            }
        });

        playBtn.addEventListener('click', () => {
            if (player.playing) player.pause(); else player.play();
        });
        scrub.addEventListener('input', () => {
            player.pause();
            const frac = Number(scrub.value) / 1000;
            player.seek(player.minTime + frac * (player.maxTime - player.minTime));
        });
        speedPills.addEventListener('click', e => {
            const btn = e.target.closest('button[data-speed]');
            if (!btn) return;
            speedPills.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
            player.setSpeed(Number(btn.dataset.speed));
        });

        skinInput.addEventListener('change', async () => {
            const file = skinInput.files && skinInput.files[0];
            if (!file) return;
            skinStatus.textContent = t('replay_skin_loading');
            try {
                const sprites = await loadSkinSprites(file);
                player.setSprites(sprites);
                skinStatus.textContent = t('replay_skin_loaded', { n: Object.keys(sprites).length });
                skinClearBtn.hidden = false;
            } catch (skinErr) {
                console.warn('[replay] skin load failed:', skinErr);
                skinStatus.textContent = t('replay_skin_invalid');
            }
        });
        skinClearBtn.addEventListener('click', () => {
            player.setSprites({});
            skinInput.value = '';
            skinStatus.textContent = '';
            skinClearBtn.hidden = true;
            clearSkinDB();
        });

        // Auto-load a previously-imported skin (IndexedDB) so a visitor
        // doesn't have to re-upload every visit — best-effort, silently
        // does nothing if there's no cached skin or it fails to decode.
        loadSkinBytesFromDB().then(async rawBytesByKey => {
            if (!rawBytesByKey) return;
            try {
                const sprites = await decodeSpritesFromBytes(rawBytesByKey);
                if (Object.keys(sprites).length) {
                    player.setSprites(sprites);
                    skinStatus.textContent = t('replay_skin_loaded', { n: Object.keys(sprites).length });
                    skinClearBtn.hidden = false;
                }
            } catch { /* cached skin is a convenience — a decode failure just means no skin applied */ }
        });

        settingsDrawer.innerHTML = settingsDrawerHtml(settings);
        settingsToggle.addEventListener('click', () => {
            settingsDrawer.hidden = !settingsDrawer.hidden;
            showControls();
        });
        const volumeInput = document.getElementById('replay-set-volume');
        const blurInput = document.getElementById('replay-set-blur');
        const brightnessInput = document.getElementById('replay-set-brightness');
        const popupsInput = document.getElementById('replay-set-popups');
        const bananaInput = document.getElementById('replay-set-banana');
        const onSettingsChange = () => {
            settings.volume = Number(volumeInput.value);
            settings.blur = Number(blurInput.value);
            settings.brightness = Number(brightnessInput.value);
            settings.popups = popupsInput.checked;
            settings.bananaRain = bananaInput.checked;
            audioEl.volume = settings.volume / 100;
            player.setVisualSettings(settings);
            document.body.classList.toggle('show-banana-rain', settings.bananaRain);
            applyBackgroundSettings(scrim, settings);
            saveSettings(settings);
        };
        [volumeInput, blurInput, brightnessInput, popupsInput, bananaInput].forEach(el => {
            el.addEventListener('input', onSettingsChange);
        });

        // Leaderboard panel — the map's real top scores, with the score
        // being watched highlighted (or appended if it's not already in
        // the top ones shown). Best-effort/decorative: never blocks setup.
        fetchLeaderboard(beatmapId).then(rows => {
            const currentIdIdx = userId ? rows.findIndex(r => String(r.user_id) === String(userId)) : -1;
            let html = '';
            rows.forEach((row, i) => { html += leaderboardRowHtml(row, i === currentIdIdx); });
            if (currentIdIdx === -1 && (userId || meta.username)) {
                html += leaderboardRowHtml({
                    user_id: userId, username: meta.username,
                    avatar_url: userId ? `https://a.ppy.sh/${userId}` : '',
                    total_score: 0, max_combo: 0,
                }, true);
            }
            leaderboardEl.innerHTML = html;
        });

        player.start();
    } catch (err) {
        console.error('[replay] failed:', err);
        setStatus(errorHtml(err.message));
    }
}

run();
