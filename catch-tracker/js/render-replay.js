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
// Self-hosted, NOT esm.sh like the imports above — wasm-bindgen's web
// build resolves its .wasm file relative to its own `import.meta.url`,
// and esm.sh's URL-rewriting for wasm-backed packages isn't something to
// risk for a pp *number* being silently wrong. The exact files from
// rosu-pp-js's own "_web" release build are vendored as-is (js/vendor/
// rosu-pp/, MIT-licensed, https://github.com/MaxOhn/rosu-pp-js).
const ROSU_PP_URL = '/js/vendor/rosu-pp/rosu_pp_js.js';
const PLAYFIELD_X = 512; // osu! catch coordinate space width, in osu!pixels

const AUDIO_URL = beatmapsetId => `https://mirror.hinamizawa.ai/v3/osu/music/audio/${beatmapsetId}`;

// A real skin's fruit/droplet/banana each draw as TWO layered sprites —
// confirmed against replayviewer.com's own bundled source (blitPiece()):
// the base gets the combo-colour multiply tint, then the "-overlay" sprite
// draws on top completely UNTINTED. This renderer previously only ever
// loaded the base, which happens to be invisible for most skins (a truly
// grayscale base with a transparent overlay just adding a highlight/
// outline) but breaks badly for a skin whose overlay is a full opaque
// copy of the base (a real, live-tested example: a user-reported
// "Motionctb (white)" skin ships fruit-apple-overlay.png BYTE-IDENTICAL to
// fruit-apple.png) — the untinted overlay was designed to always paint
// over the tint, and without drawing it at all we showed the raw
// combo-tinted base instead, i.e. the wrong colour entirely.
const SKIN_FILES = {
    catcher: 'fruit-catcher-idle',
    catcher_fail: 'fruit-catcher-fail',
    catcher_kiai: 'fruit-catcher-kiai',
    banana: 'fruit-bananas',
    banana_overlay: 'fruit-bananas-overlay',
    droplet: 'fruit-drop',
    droplet_overlay: 'fruit-drop-overlay',
    fruit_apple: 'fruit-apple',
    fruit_apple_overlay: 'fruit-apple-overlay',
    fruit_grapes: 'fruit-grapes',
    fruit_grapes_overlay: 'fruit-grapes-overlay',
    fruit_orange: 'fruit-orange',
    fruit_orange_overlay: 'fruit-orange-overlay',
    fruit_pear: 'fruit-pear',
    fruit_pear_overlay: 'fruit-pear-overlay',
};
const FRUIT_TYPE_CYCLE = ['apple', 'grapes', 'orange', 'pear'];

const HP_GAIN = 0.5;
const HP_LOSS = 4;
const POPUP_DURATION_MS = 600;
const PLATE_STACK_MAX = 8;
const PLATE_EXPLODE_MS = 750;
const PLATE_Y_OFFSET_OSU = 5;
const LEADERBOARD_WINDOW = 6;
const PLATE_BURST_RISE_OSU = 35;
const SETTINGS_KEY = 'ct_replay_settings';
// blur/brightness default to the same values the .replay-theater-scrim CSS
// rule used before these became adjustable — see applyBackgroundSettings().
const DEFAULT_SETTINGS = { blur: 26, brightness: 50, popups: true, bananaRain: false, volume: 70, effectsVolume: 70 };

const main = document.getElementById('replay-main');

function setStatus(html) {
    main.innerHTML = html;
}

function loginGateHtml() {
    // Inside a compare-mode iframe, an un-targeted OAuth redirect would
    // navigate the iframe itself off-site instead of the actual page —
    // break out to the top window so the login flow (and its eventual
    // redirect back) lands on the real compare page, not a stranded iframe.
    const embed = new URLSearchParams(location.search).get('embed') === 'compare';
    return `
        <div class="card" style="max-width:480px;margin:60px auto;text-align:center;padding:32px">
            <p style="margin-top:0">${escapeHtml(t('replay_login_prompt'))}</p>
            <a class="ct-login-btn" href="${ctLoginUrl()}"${embed ? ' target="_top"' : ''} style="display:inline-flex">${escapeHtml(t('login_with_osu'))}</a>
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

/* ---------- partial port of osu!lazer's CatchBeatmapProcessor.ApplyPositionOffsets ----------
   CORRECTION (2026-09-13, from a real user-reported wrong accuracy/miss
   count): the original note here claimed osu-catch-stable never applies
   ANY of this and that effectiveX===originalX unconditionally — that was
   only ever checked against Fruit objects (true for Fruit when HR is
   off, since Fruit trilling IS HR-gated). Direct inspection this session
   (dumping a real decoded JuiceTinyDroplet's own fields) found the
   library DOES already bake a real ±20px-range jitter into every
   TinyDroplet's own .effectiveX (a real, non-zero `.offsetX` field is
   set on it — confirmed a plain Droplet in the same stream has no such
   field, and a Fruit's is exactly 0 with no HR active). getObjectX()
   reads .effectiveX first, so this function was ADDING A SECOND,
   independently-seeded ±20px jitter on top of the library's already-
   correct one for every TinyDroplet — the actual cause of the reported
   bug (real score: 189/196 tiny droplets caught; this bug's double-
   jitter simulated only 172/196). Fixed by no longer re-deriving
   TinyDroplet (or BananaShower) offsets here at all — trust the
   library's own .effectiveX for those, since they're unconditional
   (mod-independent) per the real game's own algorithm anyway, so there
   was never a reason to reimplement them. Verified live against a real
   fresh non-HR score (6631538453): tiny-droplet catch count went from
   172/196 (sim) to 190/196, essentially matching the real 189/196 (the
   remaining 1-object gap is ordinary frame-interpolation slop, not this
   bug).
   What's left here is now ONLY the Fruit hard-rock "trilling" offset
   (consecutive fruits close in time get pushed apart under HR) — this
   library's CatchModHardRock is a stub that never fires it, so that
   piece is still a manual port of osu.Game.Rulesets.Catch/Beatmaps/
   CatchBeatmapProcessor.cs (ppy/osu, MIT licensed). Caveat carried over
   from before: the real algorithm draws Fruit-trilling and TinyDroplet-
   jitter from ONE shared RNG stream in beatmap order, so on an HR score
   this function's own RNG stream (which no longer advances for
   TinyDroplets, since those aren't computed here anymore) is not
   guaranteed to stay in lockstep with the real client's trilling values
   — HR fruit positions were already flagged as not fully verified before
   this fix and still aren't; this fix only addresses the confirmed
   non-HR TinyDroplet bug. */
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

// osu-wiki/Skinning/osu!catch: fruit-apple/orange/pear/grapes.png and
// fruit-drop.png are all "tinted depend[ing] on the fruit's combo colour"
// (a grayscale template recoloured at runtime, same mechanism as standard
// mode's hit circles) — confirmed live by loading replayviewer.com's own
// "Default" skin PNGs into this renderer: their fruit-pear.png etc. sample
// as near-white (rgb 253,253,253), not actually coloured, and fruit-
// bananas.png samples as dark gray, matching the wiki's separate "Tinted
// yellow" + "Multiplicative blend mode" note for bananas. Previously this
// renderer used one flat colour per KIND (COLORS.fruit/droplet/tiny) —
// visibly wrong (and part of why a real Default-skin comparison looked
// "off"): real fruit/droplet colour cycles through the beatmap's own
// [Colours] combo palette exactly like standard-mode combo colours, not a
// fixed hue per object kind.
function resolveComboColour(comboColours, index) {
    if (!comboColours || !comboColours.length) return null;
    const c = comboColours[((index % comboColours.length) + comboColours.length) % comboColours.length];
    return `rgb(${c.red},${c.green},${c.blue})`;
}

// Walks top-level hit objects in beatmap order (bananas/spinners included,
// so they still consume a combo-index slot even though bananas render with
// a fixed colour, not this one) and assigns each one — and by extension
// every nested droplet/fruit inside it — the active combo colour. Mirrors
// the real rule: the first object always starts a new combo (index 0 +
// its own comboOffset); afterwards the index advances by 1 + comboOffset
// each time isNewCombo is set, otherwise nested/non-new-combo objects
// share the previous object's colour.
function computeComboColourMap(hitObjects, comboColours) {
    const map = new Map();
    let comboIndex = -1;
    let first = true;
    for (const h of hitObjects) {
        if (first || h.isNewCombo) {
            comboIndex += 1 + (h.comboOffset || 0);
            first = false;
        }
        map.set(h, resolveComboColour(comboColours, comboIndex));
    }
    return map;
}

// Returns a Map<hitObject, xOffset> covering every top-level object and
// every nested object (juice stream droplets, banana-shower bananas).
// Objects with no applicable offset are simply absent from the map — treat
// a missing entry as 0.
function computePositionOffsets(hitObjects, classes, hardRockOffsets) {
    const { Fruit, JuiceStream } = classes;
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

            // timeDiff/3 is INTEGER division in the real source (a documented
            // ReSharper-suppressed "possible loss of fraction" — preserved on
            // purpose, not a float divide) — confirmed against an independent
            // TypeScript port (replayviewer-js) of this exact function.
            let offsetPosition = originalX;
            if (Math.abs(positionDiff) < Math.trunc(timeDiff / 3)) offsetPosition = hrApplyOffset(originalX, positionDiff);
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
            // TinyDroplet jitter is NOT re-derived here — see the note below
            // this function: osu-catch-stable already bakes it into each
            // nested object's own .effectiveX (getObjectX() reads that
            // first), so re-rolling it here was double-applying a second,
            // independently-seeded ±20px jitter on top of the library's
            // already-correct one.
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

function buildDropItem(h, classes, index, offsets, preemptOverride, comboColour) {
    // CatchHitObject.EffectiveX in the real game is always clamped to
    // [0, WIDTH] — our offset port didn't clamp its output, so a jittered
    // position landing slightly past either edge would draw/judge there
    // instead (live-verified: a fruit visibly pinned to the theater's
    // edge). Clamp here, matching the real getter exactly.
    const x = Math.max(0, Math.min(PLAYFIELD_X, getObjectX(h) + (offsets.get(h) || 0)));
    const preempt = preemptOverride ?? ((typeof h.timePreempt === 'number' && h.timePreempt > 0) ? h.timePreempt : 800);
    const kind = classifyObject(h, classes);
    return {
        time: h.startTime, spawnTime: h.startTime - preempt, x, kind, preempt,
        fruitType: kind === 'fruit' ? getFruitType(h, index) : null,
        // Bananas are always a fixed tint (see the wiki comment above
        // computeComboColourMap), never the beatmap's combo palette.
        color: kind === 'banana' ? null : comboColour,
        caught: false,
    };
}

function flattenHitObjects(hitObjects, classes, offsets, preemptOverride, colourMap) {
    const out = [];
    let i = 0;
    for (const h of hitObjects) {
        const comboColour = colourMap ? colourMap.get(h) : null;
        if (Array.isArray(h.nestedHitObjects) && h.nestedHitObjects.length) {
            for (const n of h.nestedHitObjects) out.push(buildDropItem(n, classes, i++, offsets, preemptOverride, comboColour));
        } else {
            out.push(buildDropItem(h, classes, i++, offsets, preemptOverride, comboColour));
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

// Both difficulty-changing mods rescale CS/AR/OD/HP BEFORE any of catch's
// own gameplay math runs — the ruleset library used here has no mod
// system at all (CatchHardRock is an empty stub, confirmed live), so
// without this our catcher width and fall-preempt were silently computed
// from the UN-modded difficulty for every HR/EZ score, not just the
// position offsets from computePositionOffsets().
//   HR (osu.Game.Rulesets.Catch/Mods/CatchModHardRock.cs): CS*1.3 (catch's
//   own ratio, not the shared 1.4 used for AR/OD/HP), AR*1.4, both capped
//   at 10.
//   EZ (osu.Game/Rulesets/Mods/ModEasy.cs): CS*0.5, AR*0.5 — no cap needed,
//   halving can't leave [0,10]. HR/EZ are mutually incompatible in the
//   real game (ModHardRock/ModEasy both list each other in
//   IncompatibleMods), so this never has to combine them.
function modAdjustedCS(cs, mods) {
    if (mods.includes('HR')) return Math.min(cs * 1.3, 10);
    if (mods.includes('EZ')) return cs * 0.5;
    return cs;
}
function modAdjustedAR(ar, mods) {
    if (mods.includes('HR')) return Math.min(ar * 1.4, 10);
    if (mods.includes('EZ')) return ar * 0.5;
    return ar;
}

// osu.Game/Beatmaps/IBeatmapDifficultyInfo.cs's DifficultyRange(value, min,
// mid, max) two-piece linear map, and CatchHitObject's own PREEMPT_RANGE =
// new DifficultyRange(PREEMPT_MAX:1800, PREEMPT_MID:1200, PREEMPT_MIN:450)
// — used to recompute fall-preempt from an HR-adjusted AR, since the
// per-object h.timePreempt the decode library provides was computed from
// the un-modded AR and can't be patched after the fact.
function difficultyRange(difficulty, min, mid, max) {
    if (difficulty > 5) return mid + (max - mid) * (difficulty - 5) / 5;
    if (difficulty < 5) return mid + (mid - min) * (difficulty - 5) / 5;
    return mid;
}
function timePreemptForAR(ar) {
    return difficultyRange(ar, 1800, 1200, 450);
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

// Fruit/droplet/banana visual radius was a flat made-up percentage of the
// canvas before (never tied to CS) — live-verified this feels wrong/too
// small compared to every real skin, and got MORE wrong once the theater
// went 16:9 (the playfield sub-rect shrank, so a flat percentage of it
// shrank too). Real sizing, from CatchHitObject.ApplyDefaultsToSelf +
// OBJECT_RADIUS (osu.Game.Rulesets.Catch/Objects/CatchHitObject.cs) +
// DrawableTinyDroplet.cs's ScaleFactor override:
//   object scale  = CalculateScaleFromCircleSize(cs) = catcherScaleFor(cs)/2
//     (the catcher DOUBLES this same base scale — see the comment above
//     catcherScaleFor(); fruit/droplet/banana do NOT double it)
//   radius (osu!px) = OBJECT_RADIUS(64) * scale, for Fruit/Droplet/Banana
//   TinyDroplet is exactly HALF that radius (DrawableTinyDroplet's
//   ScaleFactor => base/2) — the only kind with a different scale at all;
//   Droplet and Banana are otherwise the same physical size as Fruit.
// Banana also has a real falling wobble (2.2x shrinking to 0.6x) that
// isn't reproduced here — a decorative animation detail, not load-bearing
// for anything this renderer needs to be correct about.
const OBJECT_RADIUS = 64;
function objectScaleFromCS(cs) {
    return catcherScaleFor(cs) / 2;
}
function fruitRadius(cs) {
    return OBJECT_RADIUS * objectScaleFromCS(cs);
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
// The displayed "Miss" count follows the same split, confirmed against a
// real score this session (osu.ppy.sh's own score page: 7 missed tiny
// droplets, shown only via the "SMALL DROPLET 189/196" fraction — its
// "MISS" stat itself read 0). A missed TinyDroplet is HitResult.SmallTickMiss,
// not HitResult.Miss, so it was never meant to be lumped into this counter —
// doing so is what made "miss數是錯的" true even after the position-jitter
// fix above got the underlying catch/miss calls themselves right.
function computeStats(items, mapTime) {
    let combo = 0, maxCombo = 0, caught = 0, miss = 0, notCaught = 0, hp = 100;
    // rosu-pp's CatchHitResults buckets (fruits/droplets/tinyDroplets/
    // tinyDropletMisses, plus `miss` above which already matches its own
    // "misses" field exactly — both only ever count fruit/droplet misses,
    // never tiny-droplet ones) — verified against a real live score
    // (Story's 6141982961, HDHR: real 686.117pp vs rosu-pp's 686.42pp,
    // ~0.04% off, normal calculator-version drift) before wiring this in.
    let fruits = 0, droplets = 0, tinyDroplets = 0, tinyDropletMisses = 0;
    for (const it of items) {
        if (it.time > mapTime) break;
        if (it.kind === 'banana' || it.unknown) continue;
        const affectsCombo = it.kind !== 'tiny';
        if (it.caught) {
            if (affectsCombo) combo++;
            caught++;
            hp = Math.min(100, hp + HP_GAIN);
        } else {
            if (affectsCombo) { combo = 0; miss++; }
            notCaught++;
            hp = Math.max(0, hp - HP_LOSS);
        }
        if (combo > maxCombo) maxCombo = combo;
        if (it.kind === 'fruit') { if (it.caught) fruits++; }
        else if (it.kind === 'droplet') { if (it.caught) droplets++; }
        else if (it.kind === 'tiny') { if (it.caught) tinyDroplets++; else tinyDropletMisses++; }
    }
    const total = caught + notCaught;
    return {
        combo, maxCombo, caught, miss, accuracy: total > 0 ? caught / total : 1, hp,
        fruits, droplets, tinyDroplets, tinyDropletMisses,
    };
}

// osu!'s real rank thresholds (ppy/osu CatchScoreProcessor.cs
// RankFromScore — catch doesn't use the `results` param the base
// ScoreProcessor signature carries, purely accuracy-based) — X only at
// EXACTLY 100% accuracy, which `caught/total` reaches exactly since both
// are integers. Hidden/Flashlight silver-promote X→XH and S→SH only
// (ModHidden.cs/ModFlashlight.cs AdjustRank, identical in both), same
// mods this replay is already being played back with.
function computeLiveRank(accuracy, mods) {
    let rank;
    if (accuracy === 1) rank = 'X';
    else if (accuracy >= 0.98) rank = 'S';
    else if (accuracy >= 0.94) rank = 'A';
    else if (accuracy >= 0.90) rank = 'B';
    else if (accuracy >= 0.85) rank = 'C';
    else rank = 'D';
    if (mods.includes('HD') || mods.includes('FL')) {
        if (rank === 'X') rank = 'XH';
        else if (rank === 'S') rank = 'SH';
    }
    return rank;
}

/* ---------- live pp (rosu-pp WASM) ----------
   A pp readout that recalculates as the replay plays back, matching what
   replayviewer.com's own "PP Counter (Legacy)" setting shows — confirmed
   (via that site's own network activity while testing this) to be a pure
   client-side WASM calculation, not anything server- or game-memory-based.
   Never allowed to break the replay itself: any failure (slow network,
   an unparseable map) just means the badge stays on whatever static pp
   the caller passed in (or hidden), same philosophy as the leaderboard
   fetch below. */
let rosuModulePromise = null;
function loadRosuPp() {
    if (!rosuModulePromise) {
        rosuModulePromise = import(ROSU_PP_URL).then(async mod => {
            await mod.default();
            return mod;
        });
    }
    return rosuModulePromise;
}

// Parses the beatmap and caches its difficulty attributes ONCE (the
// expensive step); the returned calculator's ppFor() then only redoes the
// cheap Performance step per call, and even that is skipped unless the
// underlying judgement counts actually changed since the last call, since
// onTick fires every animation frame but hit results only land at
// discrete moments.
async function createLivePpCalculator(osuText, mods, clockRate) {
    try {
        const rosu = await loadRosuPp();
        const map = new rosu.Beatmap(osuText);
        map.convert(rosu.GameMode.Catch);
        const diffAttrs = new rosu.Difficulty({ mods, clockRate }).calculate(map);
        map.free();
        let lastKey = null;
        let lastPp = null;
        return {
            ppFor(stats) {
                const key = `${stats.fruits}|${stats.droplets}|${stats.tinyDroplets}|${stats.tinyDropletMisses}|${stats.miss}|${stats.maxCombo}`;
                if (key === lastKey) return lastPp;
                lastKey = key;
                const perf = new rosu.Performance({
                    mods, clockRate,
                    combo: stats.maxCombo,
                    misses: stats.miss,
                    n300: stats.fruits,
                    n100: stats.droplets,
                    n50: stats.tinyDroplets,
                    nKatu: stats.tinyDropletMisses,
                }).calculate(diffAttrs);
                lastPp = perf.pp;
                return lastPp;
            },
        };
    } catch {
        return null;
    }
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

// Feeds replays.html's "recently viewed" strip (js/render-replays.js reads
// the same key) — per-browser only, recorded once a replay actually loads
// successfully (not on every navigation attempt), most-recent-first,
// de-duplicated by score id, capped so it can't grow unbounded.
const RECENT_REPLAYS_KEY = 'ct_recent_replays';
const RECENT_REPLAYS_MAX = 12;
// Stored snake_case to match replay.html's own URL param names (and what
// render-replays.js reads back) rather than this file's internal camelCase
// locals — keeps the localStorage shape a stable external contract.
function recordRecentlyViewedReplay({ scoreId, beatmapId, userId, title, artist, version, username, rank, beatmapsetId, mods }) {
    try {
        const entry = {
            score_id: scoreId, beatmap_id: beatmapId, beatmapset_id: beatmapsetId, user_id: userId,
            title, artist, version, username, rank, mods,
        };
        const list = JSON.parse(localStorage.getItem(RECENT_REPLAYS_KEY) || '[]')
            .filter(r => r.score_id !== entry.score_id);
        list.unshift(entry);
        localStorage.setItem(RECENT_REPLAYS_KEY, JSON.stringify(list.slice(0, RECENT_REPLAYS_MAX)));
    } catch { /* per-viewer convenience only */ }
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

// The size draw() actually multiplies by CS-scale to place a sprite on
// screen — its LOGICAL size (raw pixels halved for an @2x asset, see
// loadOneSprite()), not its raw/possibly-downscaled pixel dimensions.
// Falls back to spriteSize() (1x-assumed) for anything without the
// __logicalW/__logicalH stamp, e.g. a sprite loaded by older cached code.
function logicalSpriteSize(sprite) {
    if (typeof sprite.__logicalW === 'number') return { w: sprite.__logicalW, h: sprite.__logicalH };
    return spriteSize(sprite);
}

// Quintic ease-out, clamped to [0,1] — matches replayviewer.com's own
// outQuint(), used for every hyperdash-related fade/scale below so the
// timing FEEL matches theirs, not just the colours.
function outQuint(p) {
    const x = p < 0 ? 0 : p > 1 ? 1 : p;
    const u = 1 - x;
    return 1 - u * u * u * u * u;
}

// How "hyper" the catcher should look at time t: 0 outside any hyperdash
// window, ramping to 1 over HYPER_TRANSITION_MS at the start of a window
// and back down over the same span after it ends — ported from
// replayviewer.com's hyperFactorAt(). Previously this renderer only had a
// binary isHyperDashingAt() (instant on/off glow), missing both the smooth
// crossfade AND the actual full-red catcher tint + afterimage burst real
// catch has — see the catcher-drawing block in draw() for what this feeds.
const HYPER_TRANSITION_MS = 180;
function hyperFactorAt(windows, t) {
    let f = 0;
    for (const win of windows) {
        if (win.start > t + HYPER_TRANSITION_MS) continue;
        if (win.end + HYPER_TRANSITION_MS < t) continue;
        if (t <= win.end) f = Math.max(f, outQuint((t - win.start) / HYPER_TRANSITION_MS));
        else f = Math.max(f, 1 - outQuint((t - win.end) / HYPER_TRANSITION_MS));
    }
    return f;
}

// Deterministic per-object "random" in [0,1) — ported from replayviewer.
// com's own bundled randomSingle() (an integer hash, not a stream RNG), so
// object rotation is stable across re-renders/scrubbing without needing to
// track any RNG state. `series` lets the same seed produce independent
// values for different uses (only one use here, series=1, matching theirs).
function seededRandom01(seed, series) {
    let h = (Math.imul(Math.trunc(seed) | 0, 2654435761) + Math.imul(series | 0, 40503)) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 3266489917) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// Catch/miss hit-sound effects — synthesized (a short sine blip through a
// quick decay envelope), not sampled from a skin: this renderer never
// parses a skin's own hitsound bank (normal-hitnormal.wav etc.), and
// synthesizing avoids needing to add that whole loader just for this.
// Lazily created since browsers refuse to start an AudioContext before a
// user gesture — the first real playback (a genuine user click) creates it.
let _sfxCtx = null;
function getSfxContext() {
    if (!_sfxCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) _sfxCtx = new Ctx();
    }
    return _sfxCtx;
}
function playHitSound(caught, volume01) {
    if (volume01 <= 0) return;
    const ctx = getSfxContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    // A caught object gets a short, bright, slightly-rising blip; a miss
    // gets a lower, flat, slightly longer thud — enough to tell the two
    // apart by ear without either being an actual game's hitsound.
    const now = ctx.currentTime;
    if (caught) {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);
        gain.gain.setValueAtTime(0.22 * volume01, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    } else {
        osc.frequency.setValueAtTime(180, now);
        gain.gain.setValueAtTime(0.22 * volume01, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    }
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
}

function downscaleToCanvas(img, maxSize) {
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
}

// Real fruit/droplet/banana skin sprites are grayscale templates recoloured
// at runtime (see the comment above computeComboColourMap) — 'multiply' the
// target colour over the sprite (approximates the real shader: a near-white
// pixel * colour ≈ colour, a darker shaded/outline pixel * colour stays
// darker, so shading is preserved), then punch the original alpha back in
// with 'destination-in' so transparency outside the fruit's silhouette
// survives the multiply pass untouched.
function tintSprite(sprite, colorRgb) {
    const { w, h } = spriteSize(sprite);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cctx = c.getContext('2d');
    cctx.drawImage(sprite, 0, 0, w, h);
    cctx.globalCompositeOperation = 'multiply';
    cctx.fillStyle = colorRgb;
    cctx.fillRect(0, 0, w, h);
    cctx.globalCompositeOperation = 'destination-in';
    cctx.drawImage(sprite, 0, 0, w, h);
    // Carry the source's logical (post-@2x-halving) size over — see
    // logicalSpriteSize() — since the tinted canvas is what draw() actually
    // measures for on-screen sizing after tintCache substitutes it in.
    c.__logicalW = sprite.__logicalW;
    c.__logicalH = sprite.__logicalH;
    return c;
}

// A flat solid-colour silhouette (alpha preserved, RGB fully replaced),
// unlike tintSprite()'s multiply-based recolour which leaves any already-
// dark/black pixel black no matter the tint colour (correct for combo-
// tinting a grayscale template — real osu! skins keep their black outline
// black too — but wrong for the hyperdash red GLOW: that's meant to be a
// solid red halo, and a skin whose sprite has a black outline, like a
// user-reported real skin's square fruit, was multiply-tinting that
// outline to black-stays-black, so the additive glow contributed zero red
// exactly at the object's own edge — the outermost ring a viewer actually
// looks at to judge "is this glowing red or not". Live-reported as "抓套
// 方塊的加速水果...最外框還是黑色的".
function solidTintSprite(sprite, colorRgb) {
    const { w, h } = spriteSize(sprite);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cctx = c.getContext('2d');
    cctx.drawImage(sprite, 0, 0, w, h);
    cctx.globalCompositeOperation = 'source-in';
    cctx.fillStyle = colorRgb;
    cctx.fillRect(0, 0, w, h);
    c.__logicalW = sprite.__logicalW;
    c.__logicalH = sprite.__logicalH;
    return c;
}

// The load event (not img.decode()) — found live that decode() can hang
// indefinitely (never resolves OR rejects) on a real skin sprite while the
// tab is backgrounded, silently stalling the whole skin forever with no
// error surfaced. The classic load/error events fire reliably regardless
// of tab visibility, so the 5s timeout here is just a safety net.
// isHiRes (an "@2x" filename) means the PNG's raw pixel dimensions are
// double its real/"logical" size — real osu! skinning draws a sprite at
// its logical size × the object's CS-derived scale, not its raw pixel
// size (confirmed against replayviewer.com's own bundled source:
// `skinSprite()` halves an @2x asset's width/height before anything else
// uses it). __logicalW/__logicalH are stashed on the decoded element so
// draw()'s sizing math (logicalSpriteSize()) can read them regardless of
// whether MAX_SPRITE_TEXTURE downscaling below also shrunk the drawable.
function loadOneSprite(bytes, isHiRes) {
    return new Promise((resolve, reject) => {
        const blob = new Blob([bytes], { type: 'image/png' });
        const img = new Image();
        img.decoding = 'async';
        const timer = setTimeout(() => reject(new Error('sprite load timed out')), 5000);
        img.onload = () => {
            clearTimeout(timer);
            const logicalScale = isHiRes ? 0.5 : 1;
            const logicalW = img.naturalWidth * logicalScale;
            const logicalH = img.naturalHeight * logicalScale;
            const oversized = img.naturalWidth > MAX_SPRITE_TEXTURE || img.naturalHeight > MAX_SPRITE_TEXTURE;
            const drawable = oversized ? downscaleToCanvas(img, MAX_SPRITE_TEXTURE) : img;
            drawable.__logicalW = logicalW;
            drawable.__logicalH = logicalH;
            resolve(drawable);
        };
        img.onerror = () => { clearTimeout(timer); reject(new Error('sprite failed to decode')); };
        img.src = URL.createObjectURL(blob);
    });
}

async function decodeSpritesFromBytes(entriesByKey) {
    const sprites = {};
    await Promise.all(Object.entries(entriesByKey).map(async ([key, entry]) => {
        try { sprites[key] = await loadOneSprite(entry.bytes, entry.isHiRes); } catch { /* keep procedural fallback for this one */ }
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

    // Root-level files ONLY — real osu! never recurses into subfolders for
    // skin elements, it only ever reads the flat root of the .osk/skin
    // folder. A live user-reported .osk proved this matters: it was a
    // multi-skin PACK (several complete alternate skins bundled in named
    // subfolders alongside the real root skin, a common author convention
    // for "pick one and copy its files to root yourself") — matching by
    // basename anywhere in the archive let an unrelated subfolder's own
    // fruit-catcher-idle@2x.png win over the real root fruit-catcher-idle.
    // png purely for being "@2x", silently swapping in a completely
    // different sub-skin's catcher art. Requiring no "/" in the stored
    // path keeps every lookup confined to the one skin osu! itself would
    // actually load.
    const wanted = new Set(Object.values(SKIN_FILES));
    const matchesWanted = name => {
        if (name.includes('/')) return false;
        const base = name.replace(/@2x/i, '').replace(/\.png$/i, '');
        return wanted.has(base.toLowerCase());
    };
    const unzipped = unzipSync(buf, { filter: f => !f.dir && matchesWanted(f.name) });

    const byBase = {};
    for (const [name, bytes] of Object.entries(unzipped)) {
        const base = name.replace(/@2x/i, '').replace(/\.png$/i, '').toLowerCase();
        const isHiRes = /@2x/i.test(name);
        if (!byBase[base] || (isHiRes && !byBase[base].isHiRes)) byBase[base] = { bytes, isHiRes };
    }

    const entriesByKey = {};
    for (const [key, base] of Object.entries(SKIN_FILES)) {
        const entry = byBase[base];
        if (entry) entriesByKey[key] = entry; // already { bytes, isHiRes }
    }

    const sprites = await decodeSpritesFromBytes(entriesByKey);
    saveSkinToDB(entriesByKey); // best-effort, not awaited — never blocks showing the skin
    return sprites;
}

// Built-in default skins — a viewer with no .osk of their own can still
// pick something other than the plain procedural shapes. Bundled as
// individual PNGs (not a re-hosted .osk) under assets/default-skins/<id>/,
// extracted from each skin's real root files (see SKIN_FILES for the
// exact filenames expected). Real community skins, used with permission
// of this site's owner to bundle as built-in options — credited here so
// that's visible wherever this list is read from, not just in a commit
// message.
// 'squares' is a real bundled skin too (the user's own square-fruit
// skin, previously referred to throughout this project as "方塊" while
// debugging its rendering) — NOT the bare no-skin procedural fallback.
// Confusing those two was a real live bug: the dropdown's "squares"
// option briefly cleared sprites entirely (player.setSprites({})),
// which actually renders as plain CIRCLES (see the procedural fallback
// in draw()), not the square fruit shapes this option is named for and
// that a viewer picking it expects to see.
const DEFAULT_SKINS = [
    { id: 'vanilla', nameKey: 'replay_skin_default_vanilla' },
    { id: 'bubble', nameKey: 'replay_skin_default_bubble', credit: 'BubbleSkin — skins.osuck.net' },
    { id: 'squares', nameKey: 'replay_skin_default_squares' },
];
// A visitor who's never picked anything (no saved preference, no custom
// upload) gets the plain unskinned look — no bundled skin has any special
// claim to being "the" default, so this matches vanilla osu!'s own look.
const INITIAL_DEFAULT_SKIN = 'vanilla';

async function loadBundledSkinSprites(id) {
    // Not a real bundled skin — no assets folder to fetch at all.
    if (id === 'vanilla') return {};
    const entriesByKey = {};
    await Promise.all(Object.entries(SKIN_FILES).map(async ([key, base]) => {
        try {
            const res = await fetch(`/assets/default-skins/${id}/${base}.png`);
            if (!res.ok) return;
            entriesByKey[key] = { bytes: new Uint8Array(await res.arrayBuffer()), isHiRes: false };
        } catch { /* this element just isn't in this bundled skin */ }
    }));
    return decodeSpritesFromBytes(entriesByKey);
}

/* ---------- canvas player ---------- */

class ReplayPlayer {
    constructor(canvas, items, frames, opts) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.items = items;
        this.frames = frames;
        this.clockRate = opts.clockRate;
        this.offsetMs = 0;
        this.catcherWidth = opts.catcherWidth;
        this.fruitRadiusOsuPx = opts.fruitRadiusOsuPx || 32;
        this.objectScale = opts.objectScale || 0.5;
        this.hiddenMod = !!opts.hiddenMod;
        this.hyperdashWindows = opts.hyperdashWindows || [];
        this.kiaiRanges = opts.kiaiRanges || [];
        this.sprites = {};
        this.tintCache = new Map();
        this.showPopups = true;
        this.popups = [];
        this.plateStack = [];
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

    // The tint cache is keyed by spriteKey+colour (e.g. "fruit_apple|rgb(...)"),
    // not by which skin is active — switching skins without clearing it left
    // stale tinted canvases from the PREVIOUS skin's bitmaps sitting under
    // the same keys, so a viewer switching skins saw a confusing mix of old
    // and new artwork (whichever combo-colour/kind combinations happened to
    // already be cached kept showing the old skin; only genuinely new ones
    // re-tinted from the new bitmaps). Real bug, live-reported this session
    // after adding the skin-switcher: "why did the other two skins change".
    setSprites(sprites) { this.sprites = sprites || {}; this.tintCache.clear(); }
    // Blur/brightness intentionally do NOT touch the canvas — those settings
    // are about the ambient background banner, not the gameplay itself
    // (blurring fruit/catcher would hurt playback legibility). See run()'s
    // applyBackgroundSettings(), which targets the scrim instead.
    setVisualSettings(s) {
        this.showPopups = s.popups;
        this.effectsVolume = (s.effectsVolume ?? 70) / 100;
    }
    resize(w, h) {
        this.canvas.width = Math.max(1, Math.round(w));
        this.canvas.height = Math.max(1, Math.round(h));
        this.draw();
    }

    catcherXAt(t) { return catcherXAt(this.frames, t); }
    currentStats() { return computeStats(this.items, this.mapTime); }

    // Small/sparse (kiai sections are occasional, not per-frame), so a
    // linear scan per draw() call is fine — no need for the binary-search
    // treatment catcherXAt() needs.
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
        // Hit-sound effects use the same "don't fire in a burst across a
        // seek/scrub jump" guard as popups, but are otherwise independent
        // of the popup-text visibility toggle (sound and on-screen text are
        // separate settings) and only play during actual playback — a
        // paused frame-by-frame scrub would otherwise replay every sound
        // between the old and new position at once.
        if (!jumped && this.playing && this.mapTime > this.lastPoppedTime) {
            for (const it of this.items) {
                if (it.kind === 'tiny' || it.unknown) continue;
                if (it.time > this.lastPoppedTime && it.time <= this.mapTime) {
                    if (this.showPopups) this.popups.push({ time: it.time, x: it.x, caught: it.caught });
                    if (this.effectsVolume > 0) playHitSound(it.caught, this.effectsVolume);
                    // A caught fruit doesn't just vanish — confirmed against
                    // replayviewer.com's own bundled source (drawCaughtPlate/
                    // drawPlateFruit in its beatmap-visuals chunk): a caught
                    // FRUIT rides along resting on the catcher's plate until
                    // the current combo run ends (their `plated[].explodeAt`,
                    // computed from newCombo boundaries — NOT specifically
                    // hyperdash, though the two often line up), at which
                    // point the whole little pile pops up and flings outward
                    // while fading over 750ms. Their own plated[] excludes
                    // bananas (they get a separate, non-persistent catch-
                    // flash instead) — but live-reported directly that
                    // bananas should still pile up too, resting through the
                    // WHOLE banana-shower "rest section" and only ejecting
                    // once the shower itself ends ("香蕉基本上都是一首歌的
                    // 休息段會出現，休息段過了後，香蕉就會自然噴出去") — see
                    // the per-shower groupEndTime computed right after the
                    // combo-colour one fruit uses, just below where `items`
                    // is built. Ours previously despawned instantly on
                    // catch. After an initial version used a tiny generic
                    // dot for this, "它是圓形的而且很小，請仔細看一下
                    // replayview 那邊是怎麼用的" — their real version draws
                    // the actual (tinted) fruit sprite at half the normal
                    // falling size, not a flat dot.
                    if (it.caught && (it.kind === 'fruit' || it.kind === 'banana')) {
                        const halfCatchOsu = this.catcherWidth / 2;
                        const landOffsetOsu = Math.max(-halfCatchOsu, Math.min(halfCatchOsu, it.x - this.catcherXAt(it.time)));
                        this.plateStack.push({
                            time: it.time,
                            kind: it.kind,
                            explodeAt: it.groupEndTime ?? it.time,
                            color: it.kind === 'banana' ? COLORS.banana : (it.color || COLORS.fruit),
                            fruitType: it.fruitType,
                            landOffsetOsu,
                            jitterXOsu: (seededRandom01(it.time, 7) - 0.5) * halfCatchOsu * 0.5,
                            jitterYOsu: seededRandom01(it.time, 8) * 6,
                        });
                        if (this.plateStack.length > PLATE_STACK_MAX) this.plateStack.shift();
                    }
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

        // The theater box is 16:9 (see the CSS comment on .replay-theater
        // for why — full cover art visibility, matching replayviewer.com's
        // own measured 16:9 canvas), but osu!'s real playfield is 512x384
        // (4:3). Mapping fruit X across the FULL 16:9 width would stretch
        // horizontal motion relative to the vertical fall — the exact
        // "proportions look wrong" bug from earlier in this pass. Real
        // osu!'s own "widescreen support" solves this by keeping the
        // playfield a fixed proportion and centering it, with extra
        // width on a wider window just showing more background/
        // storyboard — same technique here: a centered playfieldW-wide
        // sub-rect of this canvas carries all the gameplay math, sized
        // and positioned independently of the canvas's own (background-
        // driven) shape.
        //
        // The exact fractions below (not "fill all available height", which
        // this used to do) are read directly out of replayviewer.com's own
        // bundled source: its internal canvas is a fixed 1280x720, playfield
        // width = 512 osu!px * their S3(1.4) scale = 716.8px (56% of 1280),
        // catch line at 628/720 (87.2%) down. Filling all available height
        // instead made our playfield — and everything sized relative to it,
        // i.e. every fruit/catcher/droplet — visibly ~34% larger than
        // theirs at the same window size, which is what "fruit size doesn't
        // match replayviewer.com" actually was.
        const playfieldW = w * (512 * 1.4 / 1280);
        const playfieldOffsetX = (w - playfieldW) / 2;
        const catchLineY = h * (628 / 720);
        const toPx = x => playfieldOffsetX + (x / PLAYFIELD_X) * playfieldW;
        const osuPxToScreenPx = playfieldW / PLAYFIELD_X;
        // Real proportions (see the comment on fruitRadius()): a Fruit's
        // radius is OBJECT_RADIUS(64) * CalculateScaleFromCircleSize(cs).
        // Droplet and TinyDroplet are NOT the same size as Fruit though —
        // also verified against replayviewer.com's source (drawLegacyDroplet):
        // Droplet is drawn at 0.8x a Fruit's scale, TinyDroplet at a further
        // 0.5x on top of that (0.4x total) — this file previously used the
        // same size for Fruit and Droplet and a flat 0.5x for TinyDroplet,
        // which was never checked against a real source.
        const fruitPx = (this.fruitRadiusOsuPx / PLAYFIELD_X) * playfieldW;
        const kindScale = kind => kind === 'droplet' ? 0.8 : kind === 'tiny' ? 0.4 : 1;
        const sizeFor = kind => fruitPx * kindScale(kind);

        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.moveTo(playfieldOffsetX, catchLineY); ctx.lineTo(playfieldOffsetX + playfieldW, catchLineY); ctx.stroke();

        for (const it of this.items) {
            if (this.mapTime < it.spawnTime - 50 || this.mapTime > it.time + 150) continue;
            const span = it.time - it.spawnTime || 1;
            const progress = Math.min(1, Math.max(0, (this.mapTime - it.spawnTime) / span));
            const y = progress * catchLineY;
            const px = toPx(it.x);
            const size = sizeFor(it.kind);
            let alpha = this.mapTime > it.time ? Math.max(0, 1 - (this.mapTime - it.time) / 150) : 1;
            // CatchModHidden.cs: fades each object out well before it reaches
            // the catch line — starting at preempt*0.6 before its start time,
            // over a duration of preempt*0.16 — rather than a uniform dim, so
            // Hidden actually hides the object's final approach like the real
            // mod, not just a flat opacity reduction.
            if (this.hiddenMod && it.preempt) {
                const fadeStart = it.time - it.preempt * 0.6;
                if (this.mapTime >= fadeStart) {
                    alpha = Math.min(alpha, Math.max(0, 1 - (this.mapTime - fadeStart) / (it.preempt * 0.16)));
                }
            }
            ctx.globalAlpha = alpha;

            const spriteKey = it.kind === 'fruit' ? `fruit_${it.fruitType}` : it.kind === 'tiny' ? 'droplet' : it.kind;
            let sprite = this.sprites[spriteKey];
            const overlaySprite = this.sprites[spriteKey + '_overlay'];
            // Bananas are always tinted a fixed yellow; fruit/droplet/tiny
            // are tinted by the beatmap's own combo colour (it.color, from
            // computeComboColourMap) — see the wiki-sourced comment above
            // tintSprite(). Cached per sprite+colour so a fresh tinted
            // canvas isn't redrawn every animation frame.
            const tintColor = it.kind === 'banana' ? COLORS.banana : it.color;
            if (sprite && tintColor) {
                const cacheKey = spriteKey + '|' + tintColor;
                let tinted = this.tintCache.get(cacheKey);
                if (!tinted) {
                    tinted = tintSprite(sprite, tintColor);
                    this.tintCache.set(cacheKey, tinted);
                }
                sprite = tinted;
            }
            // Falling fruit/droplet/tiny rotate — confirmed against
            // replayviewer.com's own source (drawLegacyFruit/
            // drawLegacyDroplet): a Fruit gets one fixed random tilt for its
            // whole fall (±20°, seeded by its own startTime so it's stable
            // across re-renders/scrubbing); a Droplet/TinyDroplet instead
            // spins continuously as it falls (~2 full turns over the fall,
            // from a small random starting angle). Not load-bearing for
            // judgement (computeJudgements never looks at rotation), purely
            // a visual-parity detail that was previously just always 0.
            let rotation = 0;
            if (it.kind === 'fruit') {
                rotation = (seededRandom01(it.time, 1) - 0.5) * 40 * Math.PI / 180;
            } else if (it.kind === 'droplet' || it.kind === 'tiny') {
                const startRotDeg = seededRandom01(it.time, 1) * 20;
                rotation = (startRotDeg + 720 * progress) * Math.PI / 180;
            }
            if (sprite) {
                // Real osu! skin sizing (osu.Game.Rulesets.Catch/Skinning/
                // Legacy — confirmed against replayviewer.com's own bundled
                // source, blitPiece()): a sprite is drawn at its own LOGICAL
                // pixel size (raw pixels halved for an @2x asset) times
                // CalculateScaleFromCircleSize(cs), times the same per-kind
                // multiplier as the procedural fallback above — NOT fit into
                // a made-up box independent of the sprite's own dimensions
                // (the previous size*2.4 heuristic), which over- or under-
                // sized any skin whose sprite pixel dimensions didn't happen
                // to match what that heuristic assumed.
                const logical = logicalSpriteSize(sprite);
                const scale = this.objectScale * osuPxToScreenPx * kindScale(it.kind);
                const dw = logical.w * scale;
                const dh = logical.h * scale;
                ctx.save();
                ctx.translate(px, y);
                ctx.rotate(rotation);
                // Real catch draws a second, additive-blended copy of the
                // BASE sprite tinted pure red at 1.2x scale behind the
                // normal draw for the object that forces a hyperdash —
                // confirmed against replayviewer.com's own blitPiece()
                // (globalCompositeOperation "lighter" + a fixed red tint +
                // 1.2x size, drawn before the real tinted sprite). Previously
                // approximated with a thin orange ring instead, which looked
                // nothing like the real glow.
                if (it.isHyperDashTrigger) {
                    const hyperKey = spriteKey + '|hyper';
                    let hyperSprite = this.tintCache.get(hyperKey);
                    if (!hyperSprite) {
                        hyperSprite = solidTintSprite(sprite, '#ff0000');
                        this.tintCache.set(hyperKey, hyperSprite);
                    }
                    const prevOp = ctx.globalCompositeOperation, prevAlpha = ctx.globalAlpha;
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = 0.7 * prevAlpha;
                    ctx.drawImage(hyperSprite, -dw * 0.6, -dh * 0.6, dw * 1.2, dh * 1.2);
                    ctx.globalCompositeOperation = prevOp;
                    ctx.globalAlpha = prevAlpha;
                }
                ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
                // The enlarged halo above sits BEHIND the base sprite, so on
                // a skin whose own art has a dark/black outline (like a
                // real user-reported square skin) that outline still paints
                // over the halo at the object's own edge — the one place a
                // viewer is actually looking to judge "is this red or not".
                // Overlay the same solid-red silhouette again at the
                // object's own native size, additively, so the object's own
                // border also picks up red instead of staying whatever dark
                // colour the base art used. Live-reported as "最外框還是有
                // 黑色的" even after the halo itself was already fully red.
                if (it.isHyperDashTrigger) {
                    const hyperSprite = this.tintCache.get(spriteKey + '|hyper');
                    if (hyperSprite) {
                        const prevOp = ctx.globalCompositeOperation, prevAlpha = ctx.globalAlpha;
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.globalAlpha = 0.9 * prevAlpha;
                        ctx.drawImage(hyperSprite, -dw / 2, -dh / 2, dw, dh);
                        ctx.globalCompositeOperation = prevOp;
                        ctx.globalAlpha = prevAlpha;
                    }
                }
                // The "-overlay" sprite draws UNTINTED on top of the tinted
                // base, at its OWN logical size (real skins can ship an
                // overlay whose pixel dimensions differ from the base's) —
                // see the SKIN_FILES comment above for why skipping this
                // isn't just a missing highlight for some skins.
                if (overlaySprite) {
                    const oLogical = logicalSpriteSize(overlaySprite);
                    const ow = oLogical.w * scale;
                    const oh = oLogical.h * scale;
                    ctx.drawImage(overlaySprite, -ow / 2, -oh / 2, ow, oh);
                }
                ctx.restore();
            } else {
                // No base sprite for this element — a skin can ship only
                // the "-overlay" without a base (a real user-reported .osk
                // does exactly this for bananas: fruit-bananas-overlay.png
                // at root with no fruit-bananas.png). Real osu! falls back
                // to the DEFAULT skin's own base there, which this renderer
                // has no bundled copy of — drawing the overlay ALONE as a
                // first attempt at this looked worse in practice (a real
                // overlay is often just a faint highlight/ring meant to sit
                // ON a coloured base, so alone it rendered as a barely-
                // visible pale ring instead of a recognisable banana). Keep
                // the coloured procedural shape as the base plane instead,
                // and layer the overlay on top of THAT for whatever extra
                // fidelity it adds — never worse than before, sometimes better.
                ctx.fillStyle = it.kind === 'banana' ? (it.color || COLORS.banana) : (it.color || COLORS[it.kind] || COLORS.fruit);
                ctx.beginPath();
                ctx.arc(px, y, size, 0, Math.PI * 2);
                ctx.fill();
                if (overlaySprite) {
                    const oLogical = logicalSpriteSize(overlaySprite);
                    const scale = this.objectScale * osuPxToScreenPx * kindScale(it.kind);
                    const ow = oLogical.w * scale;
                    const oh = oLogical.h * scale;
                    ctx.save();
                    ctx.translate(px, y);
                    ctx.rotate(rotation);
                    ctx.drawImage(overlaySprite, -ow / 2, -oh / 2, ow, oh);
                    ctx.restore();
                }
                // No base sprite to glow here — keep the ring as a
                // reasonable substitute "warning" cue for the procedural
                // fallback shape only.
                if (it.isHyperDashTrigger) {
                    ctx.strokeStyle = '#fb923c';
                    ctx.lineWidth = Math.max(1.5, size * 0.15);
                    ctx.beginPath();
                    ctx.arc(px, y, size * 1.3, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }
        ctx.globalAlpha = 1;

        const cw = (this.catcherWidth / PLAYFIELD_X) * playfieldW;
        const ch = h * 0.045;
        const catcherSprite = this.catcherSpriteFor(this.mapTime);
        const idleSprite = this.sprites.catcher;
        const hyperFactor = hyperFactorAt(this.hyperdashWindows, this.mapTime);

        // Real osu! catcher rendering during a hyperdash (confirmed against
        // replayviewer.com's drawCatcherAndFeedback/blitCatcher/
        // drawHyperAfterimages): the catcher itself smoothly crossfades to a
        // fully red-tinted copy of its own sprite (not a generic glow), AND
        // an expanding, fading, fully-red "afterimage" copy bursts outward
        // from the exact spot the hyperdash started, additively blended.
        // Previously this renderer only drew a flat orange drop-shadow
        // behind the sprite — nothing close to either real effect, which is
        // what "分身的感覺" (the clone/afterimage feeling) was pointing at.
        const drawCatcherSprite = (sprite, catcherOsuX, { alpha = 1, scale = 1, yOffset = 0, additive = false, redAmount = 0, redCacheKey } = {}) => {
            const cx = toPx(catcherOsuX);
            ctx.save();
            ctx.globalAlpha = alpha;
            if (additive) ctx.globalCompositeOperation = 'lighter';
            if (sprite) {
                // Size purely from the real catch-hitbox width, same as
                // replayviewer.com's own blitCatcher (dw = widthScreen; dh =
                // widthScreen * bitmap.height/bitmap.width — no separate
                // height cap at all). An earlier version of this renderer
                // added a bounding-box height cap here because an early,
                // since-fixed version of the sizing math (before the
                // playfieldW/S3 correction and the CS-derived catcherWidth
                // formula both landed) made a real default-skin catcher
                // blow up to a third of the screen — with those since
                // corrected, the cap no longer protects against that and
                // instead just makes ordinary (non-extreme-aspect) catcher
                // art render noticeably smaller than the real proportion,
                // which is what a user directly comparing against
                // replayviewer.com's own sizing flagged live this session.
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
                const spriteW = cw * scale;
                const catcherWH = spriteSize(sprite);
                const spriteH = spriteW * (catcherWH.h / catcherWH.w);
                const topY = catchLineY - spriteH * 0.06 + yOffset;
                ctx.drawImage(sprite, cx - spriteW / 2, topY, spriteW, spriteH);
                if (redAmount > 0.02 && redCacheKey) {
                    let redSprite = this.tintCache.get(redCacheKey);
                    if (!redSprite) {
                        redSprite = solidTintSprite(sprite, '#ff0000');
                        this.tintCache.set(redCacheKey, redSprite);
                    }
                    ctx.globalAlpha = alpha * redAmount;
                    ctx.drawImage(redSprite, cx - spriteW / 2, topY, spriteW, spriteH);
                }
            } else {
                const boxCw = cw * scale, boxCh = ch * scale;
                // No skin loaded — lerp the flat fallback shape's own fill
                // colour toward red instead, so there's still SOME visible
                // hyperdash feedback without a sprite to tint.
                ctx.fillStyle = redAmount > 0.02
                    ? `color-mix(in srgb, #e2e2f0, #ff0000 ${Math.round(redAmount * 100)}%)`
                    : '#e2e2f0';
                const topY = catchLineY + yOffset;
                ctx.beginPath();
                ctx.moveTo(cx - boxCw / 2, topY + boxCh / 2);
                ctx.lineTo(cx - boxCw / 3, topY - boxCh / 2);
                ctx.lineTo(cx + boxCw / 3, topY - boxCh / 2);
                ctx.lineTo(cx + boxCw / 2, topY + boxCh / 2);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        };

        // Hyper dash trail: ghost copies of the catcher along its recent
        // path, fully red-tinted, fading out — ported from replayviewer.
        // com's drawDashTrail(), restricted to its `hyper` branch only
        // (the other branch trails during ANY fast dash, which needs the
        // replay's own dash-key state that isn't parsed here — hyperdash
        // windows alone are enough to reproduce the trail during a boost).
        const TRAIL_STEP_MS = 16, TRAIL_FADE_MS = 800;
        const newestStep = Math.floor(this.mapTime / TRAIL_STEP_MS) * TRAIL_STEP_MS;
        for (let gt = newestStep; gt > this.mapTime - TRAIL_FADE_MS; gt -= TRAIL_STEP_MS) {
            if (hyperFactorAt(this.hyperdashWindows, gt) <= 0.5) continue;
            const age = this.mapTime - gt;
            const alpha = 0.4 * (1 - outQuint(age / TRAIL_FADE_MS));
            if (alpha <= 0.01) continue;
            drawCatcherSprite(idleSprite, this.catcherXAt(gt), { alpha, additive: true, redAmount: 1, redCacheKey: 'catcher_idle|red' });
        }

        // Hyper afterimage burst: one expanding/fading copy anchored to
        // where each hyperdash actually started (not following the
        // catcher's current position) — ported from replayviewer.com's
        // drawHyperAfterimages().
        const AFTERIMAGE_MS = 1200;
        for (const win of this.hyperdashWindows) {
            if (win.start > this.mapTime) continue;
            const p = (this.mapTime - win.start) / AFTERIMAGE_MS;
            if (p < 0 || p > 1) continue;
            const e = outQuint(p);
            const scale = 0.95 + (1.2 - 0.95) * e;
            const yOffset = -h * 0.012 * e;
            drawCatcherSprite(idleSprite, this.catcherXAt(win.start), {
                alpha: 1 - p, scale, yOffset, additive: true, redAmount: 1, redCacheKey: 'catcher_idle|red',
            });
        }

        // The live catcher itself, crossfaded toward fully red as
        // hyperFactor rises (smooth, not the old instant on/off glow).
        let redCacheKey = 'catcher_idle|red';
        if (catcherSprite === this.sprites.catcher_fail) redCacheKey = 'catcher_fail|red';
        else if (catcherSprite === this.sprites.catcher_kiai) redCacheKey = 'catcher_kiai|red';
        drawCatcherSprite(catcherSprite, this.catcherXAt(this.mapTime), { redAmount: hyperFactor, redCacheKey });

        // Caught-fruit pile on the plate (see the push in updatePopups) —
        // ported from replayviewer.com's own drawCaughtPlate/drawPlateFruit:
        // the real fruit sprite at HALF the normal falling size (not a flat
        // dot — a first pass here used one, live-reported as "圓形的而且很
        // 小"), resting with a small jitter until its combo run's group end
        // time, then popping up and sliding outward (amplifying its own
        // original catch-offset from the catcher's centre) while fading
        // over PLATE_EXPLODE_MS.
        if (this.plateStack.length) {
            const plateScale = this.objectScale * osuPxToScreenPx * 0.5;
            for (let i = this.plateStack.length - 1; i >= 0; i--) {
                const item = this.plateStack[i];
                const exploded = this.mapTime >= item.explodeAt;
                let xOsu, yOffsetPx, alpha;
                if (exploded) {
                    // An outward-and-up burst, no vertical bob. Ported this
                    // closer to replayviewer.com's own pop-up-then-fall arc
                    // at first, but live-reported that the initial downward
                    // dip read as "先往下再上去", not a clean burst — and
                    // once that was removed, "可以往上爆開而不是左右爆開而
                    // 已" — so it now rises steadily while flying outward,
                    // never dipping down first.
                    const age = this.mapTime - item.explodeAt;
                    if (age >= PLATE_EXPLODE_MS) { this.plateStack.splice(i, 1); continue; }
                    const xProg = Math.min(1, age / 1000);
                    const upProg = Math.min(1, age / 500);
                    xOsu = this.catcherXAt(item.explodeAt) + item.landOffsetOsu * (1 + 6 * xProg);
                    yOffsetPx = (PLATE_Y_OFFSET_OSU + PLATE_BURST_RISE_OSU * upProg) * osuPxToScreenPx;
                    alpha = 1 - age / PLATE_EXPLODE_MS;
                } else {
                    xOsu = this.catcherXAt(this.mapTime) + item.jitterXOsu;
                    yOffsetPx = (PLATE_Y_OFFSET_OSU + item.jitterYOsu) * osuPxToScreenPx;
                    alpha = 0.95;
                }
                const x = toPx(xOsu);
                const y = catchLineY - yOffsetPx;
                const spriteKey = item.kind === 'banana' ? 'banana' : `fruit_${item.fruitType}`;
                const sprite = this.sprites[spriteKey];
                const overlaySprite = this.sprites[spriteKey + '_overlay'];
                ctx.globalAlpha = alpha;
                if (sprite) {
                    const cacheKey = spriteKey + '|' + item.color;
                    let tinted = this.tintCache.get(cacheKey);
                    if (!tinted) { tinted = tintSprite(sprite, item.color); this.tintCache.set(cacheKey, tinted); }
                    const logical = logicalSpriteSize(tinted);
                    const dw = logical.w * plateScale, dh = logical.h * plateScale;
                    ctx.drawImage(tinted, x - dw / 2, y - dh / 2, dw, dh);
                    if (overlaySprite) {
                        const oLogical = logicalSpriteSize(overlaySprite);
                        const ow = oLogical.w * plateScale, oh = oLogical.h * plateScale;
                        ctx.drawImage(overlaySprite, x - ow / 2, y - oh / 2, ow, oh);
                    }
                } else {
                    ctx.fillStyle = item.color;
                    ctx.beginPath();
                    ctx.arc(x, y, sizeFor('fruit') * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }

        if (this.showPopups) {
            const fontSize = Math.max(12, playfieldW * 0.014);
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
                const audioMs = this.audio.currentTime * 1000 - this.offsetMs;
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
            this.audio.currentTime = Math.max(0, (this.mapTime + this.offsetMs) / 1000);
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
        if (this.audioReady) this.audio.currentTime = Math.max(0, (this.mapTime + this.offsetMs) / 1000);
        this.lastPoppedTime = this.mapTime;
        this.popups = [];
        this.plateStack = [];
        this.draw();
        this.onTick(this.mapTime, this.minTime, this.maxTime, this.playing, this.currentStats());
    }
    setOffset(ms) {
        this.offsetMs = ms;
        if (this.audioReady) this.audio.currentTime = Math.max(0, (this.mapTime + this.offsetMs) / 1000);
    }
    setSpeed(speed) {
        this.speed = speed;
        if (this.audioReady) this.audio.playbackRate = this.speed * this.clockRate;
    }
    // Compare mode's silent (no-audio) side only: unlike the audio-anchored
    // side, which re-syncs to its own <audio> element every single tick (see
    // tick() above), this side's mapTime free-runs purely on rAF wall-clock
    // deltas with nothing pulling it back — any per-frame jank from running
    // two heavy canvas renderers in separate iframes accumulates as
    // permanent drift over a full song instead of averaging out. The parent
    // compare page periodically sends the audio-anchored side's real
    // position here as a correction. Blended (not snapped) so a several-
    // hundred-ms correction doesn't read as a visible jump — resync calls
    // are infrequent (parent throttles them), so a larger per-call blend
    // than the audio case's per-frame one is fine.
    resyncTo(frac) {
        if (!this.playing) return;
        const target = this.minTime + frac * (this.maxTime - this.minTime);
        this.mapTime += (target - this.mapTime) * 0.5;
    }
}

/* ---------- theater layout ---------- */

function fmtScore(n) {
    return Math.round(n || 0).toLocaleString();
}

function fmtClockTime(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function leaderboardRowHtml(row, isCurrent, rank) {
    return `
        <div class="replay-lb-row${isCurrent ? ' replay-lb-current' : ''}" data-user-id="${row.user_id ?? ''}">
            ${rank ? `<span class="replay-lb-rank">#${rank}</span>` : ''}
            <img class="replay-lb-avatar" src="${escapeHtml(row.avatar_url || '')}" alt="">
            <span class="replay-lb-name">${escapeHtml(row.username || '?')}</span>
            <span class="replay-lb-score">${fmtScore(row.total_score)}</span>
            <span class="replay-lb-combo">${row.max_combo ?? 0}x</span>
        </div>
    `;
}

// Layout matches replayviewer.com's replay viewer (live-verified against
// the same fixture score there): a persistent (not hover-hidden — see the
// CSS comment on .replay-top-bar/.replay-bottom-bar for why this reverses
// an earlier mania-tracker-style pass) top settings strip with inline
// volume/rate/background-dim sliders and mod badges, HUD score/accuracy
// top-right, a bottom scrub bar with a time readout. Less-common settings
// (blur, judgement popups, banana rain, skin upload) stay in the
// click-to-open drawer rather than cluttering the always-visible strip.
function theaterHtml(meta, settings) {
    const bgUrl = meta.beatmapsetId ? coverArtUrl(meta.beatmapsetId) : '';
    const title = [meta.artist, meta.title].filter(Boolean).join(' - ');
    const dim = 100 - settings.brightness;
    return `
        <div class="replay-theater-wrap" id="replay-theater-wrap">
            <div class="replay-top-bar">
                <div class="replay-top-group">
                    <span class="replay-top-label">🍎 ${escapeHtml(t('replay_settings_music'))}</span>
                    <input type="range" id="replay-set-volume" class="replay-top-slider" min="0" max="100" step="5" value="${settings.volume}">
                    <span class="replay-top-value" id="replay-volume-value">${settings.volume}%</span>
                </div>
                <div class="replay-top-group">
                    <span class="replay-top-label">🍊 ${escapeHtml(t('replay_settings_effects'))}</span>
                    <input type="range" id="replay-set-effects-volume" class="replay-top-slider" min="0" max="100" step="5" value="${settings.effectsVolume}">
                    <span class="replay-top-value" id="replay-effects-volume-value">${settings.effectsVolume}%</span>
                </div>
                <div class="replay-top-group">
                    <span class="replay-top-label">🍇 ${escapeHtml(t('replay_settings_rate'))}</span>
                    <input type="range" id="replay-set-rate" class="replay-top-slider" min="0.25" max="2" step="0.05" value="1">
                    <span class="replay-top-value" id="replay-rate-value">1.00x</span>
                    <button type="button" id="replay-reset-rate" class="replay-top-reset" title="${escapeHtml(t('replay_reset_rate'))}">↺</button>
                </div>
                <div class="replay-top-group">
                    <span class="replay-top-label">🍐 ${escapeHtml(t('replay_settings_offset'))}</span>
                    <button type="button" id="replay-offset-minus" class="replay-top-step">−</button>
                    <span class="replay-top-value" id="replay-offset-value">+0 ms</span>
                    <button type="button" id="replay-offset-plus" class="replay-top-step">+</button>
                    <button type="button" id="replay-offset-reset" class="replay-top-reset" title="${escapeHtml(t('replay_reset_offset'))}">↺</button>
                </div>
                <div class="replay-top-group">
                    <span class="replay-top-label">🍑 ${escapeHtml(t('replay_settings_dim'))}</span>
                    <input type="range" id="replay-set-dim" class="replay-top-slider" min="0" max="90" step="5" value="${dim}">
                    <span class="replay-top-value" id="replay-dim-value">${dim}%</span>
                </div>
                <div class="replay-top-spacer"></div>
                <div class="replay-top-mods">
                    <img class="grade-badge" id="replay-rank-badge" src="assets/grades/${meta.rank && /^(XH|X|SH|S|A|B|C|D|F)$/.test(meta.rank) ? meta.rank : 'D'}.svg" alt="${escapeHtml(meta.rank || '')}"${meta.rank ? '' : ' hidden'}>
                    ${meta.mods.length ? modsTag(meta.mods) : ''}
                </div>
            </div>

        <div class="replay-theater" id="replay-theater"${bgUrl ? ` style="background-image:url('${bgUrl.replace(/'/g, '%27')}')"` : ''}>
            <div class="replay-theater-scrim"></div>
            <canvas id="replay-canvas" class="replay-canvas-full"></canvas>
            <audio id="replay-audio" preload="auto"></audio>

            <!-- Top-left, matching replayviewer.com's own "PP Counter" placement
                 (confirmed live against that site before building this) — a plain
                 recalculating number, not a badge/pill like the static mods group. -->
            <div class="replay-hud-pp" id="replay-hud-pp"${meta.pp ? '' : ' hidden'}>${meta.pp ? escapeHtml(fmtPP(Number(meta.pp))) : ''}</div>
            <div class="replay-hud-acc" id="replay-hud-acc">100.00%</div>
            <div class="replay-hud-combo" id="replay-hud-combo">0</div>
            <div class="replay-coverage-note" id="replay-coverage-note" hidden>${escapeHtml(t('replay_coverage_incomplete'))}</div>

            <div class="replay-hud-info">
                <div class="replay-hud-title">${escapeHtml(title || '')}</div>
                <div class="replay-hud-sub">
                    ${meta.version ? `[${escapeHtml(meta.version)}]` : ''}
                    ${meta.username ? escapeHtml(t('replay_info_by', { name: meta.username })) : ''}
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
                    <span class="replay-time" id="replay-time">0:00 / 0:00</span>
                    <div class="replay-bottom-spacer"></div>
                    <select id="replay-default-skin" class="replay-skin-select" title="${escapeHtml(t('replay_default_skin'))}">
                        <option value="" hidden>${escapeHtml(t('replay_skin_custom_option'))}</option>
                        ${DEFAULT_SKINS.map(s => `<option value="${s.id}">${escapeHtml(t(s.nameKey))}</option>`).join('')}
                    </select>
                    <label class="replay-icon-btn" for="replay-skin-input">${escapeHtml(t('replay_use_skin'))}</label>
                    <input type="file" id="replay-skin-input" accept=".osk" hidden>
                    <button type="button" id="replay-skin-clear" class="replay-icon-btn" hidden>${escapeHtml(t('replay_clear_skin'))}</button>
                    <span id="replay-skin-status" class="replay-skin-status"></span>
                    <span id="replay-skin-credit" class="replay-skin-credit"></span>
                    <button type="button" id="replay-settings-toggle" class="replay-icon-btn">${escapeHtml(t('replay_settings'))}</button>
                    <button type="button" id="replay-fullscreen-toggle" class="replay-icon-btn" title="Fullscreen">⤢</button>
                </div>
            </div>

            <div class="replay-settings-drawer" id="replay-settings-drawer" hidden></div>
        </div>
        </div>
    `;
}

function settingsDrawerHtml(s) {
    return `
        <label>${escapeHtml(t('replay_settings_blur'))}
            <input type="range" id="replay-set-blur" min="0" max="50" step="2" value="${s.blur}">
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
    // Side-by-side compare mode (replay-compare.html): this exact page
    // loaded inside one of the compare page's two iframes. Reuses the
    // WHOLE normal pipeline below completely unmodified (parsing, judging,
    // skin/hyperdash/plate-stack rendering) — only its own per-instance
    // chrome (top settings bar, bottom transport, leaderboard) is hidden via
    // the ct-replay-embed body class below (see style.css), replaced by the
    // compare page's single shared transport, and a small postMessage
    // bridge (added further down, next to the existing control wiring)
    // lets that parent drive play/pause/seek/rate and read live stats
    // instead of this page's own now-hidden controls.
    const embed = params.get('embed') === 'compare';
    if (embed) document.body.classList.add('ct-replay-embed');
    const meta = {
        title: params.get('title') || '',
        artist: params.get('artist') || '',
        version: params.get('version') || '',
        username: params.get('username') || '',
        rank: params.get('rank') || '',
        pp: params.get('pp') || '',
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

        // Fire-and-forget: the ~830KB rosu-pp wasm starts downloading
        // alongside the rest of this setup instead of blocking it. `livePp`
        // stays null (onTick below just skips updating the badge) until
        // this resolves, and forever if it fails.
        let livePp = null;
        createLivePpCalculator(osuText, mods, clockRateForMods(mods)).then(calc => { livePp = calc; });

        const { BeatmapDecoder, ScoreDecoder } = await import(PARSERS_URL);
        const catchStable = await import(CATCH_STABLE_URL);
        const { CatchRuleset, Fruit, Banana, JuiceDroplet, JuiceTinyDroplet, JuiceStream } = catchStable;
        const objectClasses = { Fruit, Banana, JuiceDroplet, JuiceTinyDroplet, JuiceStream };

        const ruleset = new CatchRuleset();
        const parsedBeatmap = new BeatmapDecoder().decodeFromString(osuText);
        const catchBeatmap = ruleset.applyToBeatmap(parsedBeatmap);
        const hrActive = mods.includes('HR');
        const baseCS = (catchBeatmap.difficulty && catchBeatmap.difficulty.circleSize)
            ?? (parsedBeatmap.difficulty && parsedBeatmap.difficulty.circleSize) ?? 5;
        const baseAR = (catchBeatmap.difficulty && catchBeatmap.difficulty.approachRate)
            ?? (parsedBeatmap.difficulty && parsedBeatmap.difficulty.approachRate) ?? 5;
        const cs = modAdjustedCS(baseCS, mods);
        const preempt = timePreemptForAR(modAdjustedAR(baseAR, mods));

        const positionOffsets = computePositionOffsets(catchBeatmap.hitObjects, objectClasses, hrActive);
        const comboColours = (catchBeatmap.colors && catchBeatmap.colors.comboColors) || [];
        const comboColourMap = computeComboColourMap(catchBeatmap.hitObjects, comboColours);
        const items = flattenHitObjects(catchBeatmap.hitObjects, objectClasses, positionOffsets, preempt, comboColourMap);

        // Each item's "group end time" — the time the current combo-colour
        // run finishes (i.e. the next newCombo boundary) — confirmed against
        // replayviewer.com's own source as exactly how it computes when a
        // catcher's plate-fruit pile pops (its `clearTimes`, derived from
        // consecutive non-newCombo hit-object runs). A run of same-coloured
        // items IS one of those runs, since comboColourMap only advances on
        // isNewCombo — so grouping this flattened, time-ordered list by
        // colour transitions is an equivalent, much simpler way to get the
        // same boundaries without re-deriving hitObject source-index groups.
        // Bananas are excluded from the scan (real replayviewer never plates
        // them either, and their colour isn't part of the normal combo run).
        {
            const seq = items.filter(it => it.kind !== 'banana' && !it.unknown);
            let groupStart = 0;
            for (let i = 1; i <= seq.length; i++) {
                if (i === seq.length || seq[i].color !== seq[groupStart].color) {
                    const endTime = seq[i - 1].time;
                    for (let j = groupStart; j < i; j++) seq[j].groupEndTime = endTime;
                    groupStart = i;
                }
            }
        }
        // Bananas get the same `groupEndTime` field, but grouped by their
        // own contiguous run instead of combo colour — a banana shower is a
        // map's "rest section" ("休息段"), and live-reported: the pile of
        // caught bananas should sit on the plate for the WHOLE shower, only
        // ejecting once the shower actually ends, not on some fixed timer.
        {
            let i = 0;
            while (i < items.length) {
                if (items[i].kind !== 'banana') { i++; continue; }
                let j = i;
                while (j < items.length && items[j].kind === 'banana') j++;
                const endTime = items[j - 1].time;
                for (let k = i; k < j; k++) items[k].groupEndTime = endTime;
                i = j;
            }
        }

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

        // The real final score, straight from the decoded replay itself —
        // used to drive the leaderboard panel's live score column for the
        // viewer's own row (see onTick below), the same way stats.combo
        // already drives that row's live combo column.
        const realTotalScore = (parsedScore.info && parsedScore.info.totalScore) || 0;
        const finalCatchableCount = items.filter(it => it.kind !== 'banana' && !it.unknown).length;

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
        setStatus(theaterHtml(meta, settings));
        // Compare mode has its own "recently compared" concept on the
        // parent page — an iframe load shouldn't also pollute the regular
        // single-view "recently viewed" strip on replays.html.
        if (!embed) recordRecentlyViewedReplay({ scoreId, beatmapId, userId, ...meta });
        const theater = document.getElementById('replay-theater');
        const theaterWrap = document.getElementById('replay-theater-wrap');
        // Upgrade from cover.jpg (osu!'s own pre-cropped ~3.6:1 promo
        // banner, shown immediately above via theaterHtml's bgUrl) to the
        // REAL in-game background once beatmap-bg.js has it ready
        // (downloads+unzips the mapset server-side, so this can take a
        // couple seconds on a cold cache) — never blocks the theater on it,
        // and silently keeps cover.jpg if the mirror/extraction fails.
        if (meta.beatmapsetId) {
            const realBgUrl = `${API_BASE}/beatmap-bg?beatmapset_id=${encodeURIComponent(meta.beatmapsetId)}`;
            const realBg = new Image();
            realBg.onload = () => { theater.style.backgroundImage = `url('${realBgUrl.replace(/'/g, '%27')}')`; };
            realBg.src = realBgUrl;
        }
        const canvas = document.getElementById('replay-canvas');
        const audioEl = document.getElementById('replay-audio');
        const playBtn = document.getElementById('replay-playpause');
        const scrub = document.getElementById('replay-scrub');
        const timeDisplay = document.getElementById('replay-time');
        const skinInput = document.getElementById('replay-skin-input');
        const skinClearBtn = document.getElementById('replay-skin-clear');
        const skinStatus = document.getElementById('replay-skin-status');
        const hudAcc = document.getElementById('replay-hud-acc');
        const hudCombo = document.getElementById('replay-hud-combo');
        const hudPp = document.getElementById('replay-hud-pp');
        const rankBadge = document.getElementById('replay-rank-badge');
        let lastLiveRank = null;
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
        // Two iframes on the same compare page would otherwise both play
        // the SAME song's full audio at once (and, whenever the two scores
        // carry different DT/HT mods, at two different clock rates) —
        // audibly doubled/phasing. The compare page only asks ONE side
        // (?audio=1, its "primary"/left pick) to actually play music; the
        // other stays silent — still gets its own hit-sound effects either
        // way (playHitSound() is a self-contained Web Audio synth, not tied
        // to this <audio> element at all), just no second overlapping copy
        // of the song. A real user report after the first live test: no
        // audio at all read as a bug ("只有聽到音效而已，卻沒有音樂"), so
        // silence-on-both was too conservative — this keeps a real music
        // track while still avoiding the double-audio/drift case.
        const embedAudio = params.get('audio') === '1';
        if ((!embed || embedAudio) && beatmapsetId) {
            audioEl.src = AUDIO_URL(beatmapsetId);
            audioEl.load();
        }

        // Populated once the leaderboard fetch resolves (see below) — kept
        // outside that closure so onTick can read the live-climbing window
        // every frame. `otherLbRows` excludes the watched player's own real
        // row (if they're actually in the top 50) so it never gets shown
        // twice; `playerRowMeta` is the identity used for the player's own
        // sliding row.
        let otherLbRows = null;
        let playerRowMeta = null;
        let lastRenderedRank = null;

        const player = new ReplayPlayer(canvas, items, frames, {
            clockRate: clockRateForMods(mods),
            catcherWidth,
            fruitRadiusOsuPx: fruitRadius(cs),
            objectScale: objectScaleFromCS(cs),
            hiddenMod: mods.includes('HD'),
            hyperdashWindows,
            kiaiRanges,
            audio: ((!embed || embedAudio) && beatmapsetId) ? audioEl : null,
            onTick: (mapTime, minTime, maxTime, playing, stats) => {
                const pct = maxTime > minTime ? ((mapTime - minTime) / (maxTime - minTime)) * 1000 : 0;
                scrub.value = String(pct);
                playBtn.textContent = playing ? '⏸' : '▶';
                timeDisplay.textContent = `${fmtClockTime(mapTime - minTime)} / ${fmtClockTime(maxTime - minTime)}`;
                hpFill.style.width = `${stats.hp}%`;
                statCombo.textContent = stats.combo;
                statMaxCombo.textContent = stats.maxCombo;
                statAccuracy.textContent = `${(stats.accuracy * 100).toFixed(1)}%`;
                statCaught.textContent = stats.caught;
                statMiss.textContent = stats.miss;
                hudAcc.textContent = `${(stats.accuracy * 100).toFixed(2)}%`;
                hudCombo.textContent = String(stats.combo).padStart(4, '0');
                if (livePp) {
                    const pp = livePp.ppFor(stats);
                    if (pp != null) {
                        hudPp.textContent = fmtPP(pp);
                        hudPp.hidden = false;
                    }
                }
                const liveRank = computeLiveRank(stats.accuracy, mods);
                if (liveRank !== lastLiveRank) {
                    lastLiveRank = liveRank;
                    rankBadge.src = `assets/grades/${liveRank}.svg`;
                    rankBadge.alt = liveRank;
                    rankBadge.hidden = false;
                }
                if (coverageIncomplete) coverageNote.hidden = mapTime <= frameCoverageEnd;
                // Compare mode: this page's own scrub/HUD text above just
                // updated as normal (harmless — hidden via the
                // ct-replay-embed CSS class), but the parent compare page
                // has no other way to see this side's live progress/stats,
                // since it drives everything through the postMessage bridge
                // below instead of this page's own (now-hidden) controls.
                if (embed) {
                    // Same live-interpolated-score formula as the leaderboard
                    // panel's own "you" row above (realTotalScore scaled by
                    // how far through the map's catchable objects this tick
                    // is) — the actual SCORE number, not yet covered by any
                    // of the accuracy/combo/pp stats already in the panel.
                    const liveScore = (realTotalScore && finalCatchableCount > 0)
                        ? Math.round(realTotalScore * stats.caught / finalCatchableCount) : 0;
                    window.parent.postMessage({
                        ctCompare: true, type: 'tick', playing,
                        frac: maxTime > minTime ? (mapTime - minTime) / (maxTime - minTime) : 0,
                        stats: { accuracy: stats.accuracy, combo: stats.combo, maxCombo: stats.maxCombo, caught: stats.caught, miss: stats.miss, hp: stats.hp, score: liveScore },
                        pp: livePp ? livePp.ppFor(stats) : null,
                    }, location.origin);
                }
                // Leaderboard: a live-climbing sliding window, not a static
                // top-50 list — the watched player sits at the bottom and
                // rises past a real name the moment their own live score
                // actually overtakes it, rather than showing all 50 names
                // at once. Live-reported: "回放者的名字會在最下面...不是把
                // 所有50名都顯示出來而是先從後面的排名45-50名先列出來，如
                // 果回放者打超過這些名次再逐一顯示".
                //
                // This depends on otherLbRows actually being sorted by
                // score — briefly wasn't: beatmap-leaderboard.js's upstream
                // osu! endpoint doesn't reliably return scores in score
                // order (confirmed by dumping the raw response directly),
                // which surfaced here as "分數跟排名對不上、爬名次的動機也
                // 不對" before that function started re-sorting its own
                // response. With that fixed at the source, comparing the
                // live score against each real row's total_score is valid
                // again.
                if (otherLbRows) {
                    const liveScore = (realTotalScore && finalCatchableCount > 0)
                        ? Math.round(realTotalScore * stats.caught / finalCatchableCount) : 0;
                    const currentRank = 1 + otherLbRows.filter(r => r.total_score > liveScore).length;
                    if (currentRank !== lastRenderedRank) {
                        lastRenderedRank = currentRank;
                        const better = otherLbRows.filter(r => r.rank < currentRank);
                        const windowRows = better.slice(Math.max(0, better.length - LEADERBOARD_WINDOW));
                        let html = '';
                        windowRows.forEach(row => { html += leaderboardRowHtml(row, false, row.rank); });
                        html += leaderboardRowHtml(playerRowMeta, true, currentRank <= otherLbRows.length + 1 ? currentRank : null);
                        leaderboardEl.innerHTML = html;
                    }
                    const currentLbRow = leaderboardEl.querySelector('.replay-lb-current');
                    if (currentLbRow) {
                        const comboEl = currentLbRow.querySelector('.replay-lb-combo');
                        if (comboEl) comboEl.textContent = `${stats.combo}x`;
                        const scoreEl = currentLbRow.querySelector('.replay-lb-score');
                        if (scoreEl) scoreEl.textContent = fmtScore(liveScore);
                    }
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

        // Controls are permanently visible — matches replayviewer.com
        // (live-verified this session: its top settings strip and bottom
        // bar are never hover-hidden), superseding an earlier
        // mania-tracker-style hover-to-reveal pass per later direction.

        fullscreenToggle.addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (theaterWrap.requestFullscreen) {
                // Fullscreen the WRAPPER, not just the canvas box, so the
                // top toolbar (volume/rate/offset/dim — now living outside
                // the bordered .replay-theater) stays reachable while
                // fullscreen instead of disappearing with it.
                theaterWrap.requestFullscreen().catch(() => { /* not fatal — theater already fills most of the viewport without it */ });
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
        const rateInput = document.getElementById('replay-set-rate');
        const rateValue = document.getElementById('replay-rate-value');
        const applyRate = rate => {
            rateInput.value = String(rate);
            player.setSpeed(rate);
            rateValue.textContent = `${rate.toFixed(2)}x`;
        };
        rateInput.addEventListener('input', () => applyRate(Number(rateInput.value)));
        document.getElementById('replay-reset-rate').addEventListener('click', () => applyRate(1));

        // Offset nudges audio playback a few ms relative to the visual
        // gameplay clock — useful when a viewer's own audio/video pipeline
        // has a bit of latency skew. Purely a local per-viewer convenience
        // (not from the real replay/beatmap), so it isn't persisted.
        const OFFSET_STEP_MS = 5;
        let offsetMs = 0;
        const offsetValue = document.getElementById('replay-offset-value');
        const applyOffset = ms => {
            offsetMs = ms;
            player.setOffset(offsetMs);
            offsetValue.textContent = `${offsetMs >= 0 ? '+' : ''}${offsetMs} ms`;
        };
        document.getElementById('replay-offset-minus').addEventListener('click', () => applyOffset(offsetMs - OFFSET_STEP_MS));
        document.getElementById('replay-offset-plus').addEventListener('click', () => applyOffset(offsetMs + OFFSET_STEP_MS));
        document.getElementById('replay-offset-reset').addEventListener('click', () => applyOffset(0));

        const skinCredit = document.getElementById('replay-skin-credit');
        // Shared across every skin-changing action (custom upload, clear,
        // built-in default pick) — each bumps this before its own async
        // work and checks it's still current before applying the result,
        // so switching again mid-fetch can't have a stale, slower request
        // land on top of whatever was picked more recently.
        let skinRequestGen = 0;
        skinInput.addEventListener('change', async () => {
            const file = skinInput.files && skinInput.files[0];
            if (!file) return;
            const myGen = ++skinRequestGen;
            skinStatus.textContent = t('replay_skin_loading');
            skinCredit.textContent = '';
            try {
                const sprites = await loadSkinSprites(file);
                if (myGen !== skinRequestGen) return;
                player.setSprites(sprites);
                skinStatus.textContent = t('replay_skin_loaded', { n: Object.keys(sprites).length });
                skinClearBtn.hidden = false;
                // A custom upload wins over any built-in default pick —
                // reset the dropdown to its hidden "custom" placeholder so
                // it doesn't keep showing a bundled skin that's no longer
                // actually applied ('squares' is itself a real bundled
                // skin now, not a stand-in for "nothing selected").
                document.getElementById('replay-default-skin').value = '';
            } catch (skinErr) {
                if (myGen !== skinRequestGen) return;
                console.warn('[replay] skin load failed:', skinErr);
                skinStatus.textContent = t('replay_skin_invalid');
            }
        });
        skinClearBtn.addEventListener('click', () => {
            skinRequestGen++; // invalidate any in-flight upload/default-skin fetch
            player.setSprites({});
            skinInput.value = '';
            skinStatus.textContent = '';
            skinCredit.textContent = '';
            skinClearBtn.hidden = true;
            clearSkinDB();
            document.getElementById('replay-default-skin').value = '';
        });

        // Built-in default skins (see DEFAULT_SKINS) — a viewer with no
        // .osk of their own can still pick something other than the plain
        // procedural shapes. Picking one here always wins over whatever a
        // custom upload had set, same as a fresh upload would. Each
        // bundled skin's real creator is shown next to it, not just noted
        // in a code comment — these are other people's work, credited
        // wherever a viewer actually sees the skin applied.
        const CT_DEFAULT_SKIN_KEY = 'ct_default_skin';
        const defaultSkinSelect = document.getElementById('replay-default-skin');
        const applyDefaultSkin = async (id, persist) => {
            const myGen = ++skinRequestGen;
            const sprites = await loadBundledSkinSprites(id);
            // A viewer who switches skins again before this fetch finishes
            // (e.g. quickly clicking through several options) shouldn't
            // have this now-stale result land on top of whatever they
            // picked more recently — only the most recent request may
            // still apply its own result.
            if (myGen !== skinRequestGen) return;
            player.setSprites(sprites);
            skinInput.value = '';
            skinClearBtn.hidden = true;
            skinStatus.textContent = Object.keys(sprites).length
                ? t('replay_skin_loaded', { n: Object.keys(sprites).length })
                : '';
            const meta = DEFAULT_SKINS.find(s => s.id === id);
            skinCredit.textContent = meta && meta.credit ? t('replay_skin_credit', { credit: meta.credit }) : '';
            if (persist) { try { localStorage.setItem(CT_DEFAULT_SKIN_KEY, id); } catch { /* per-viewer convenience only */ } }
        };
        defaultSkinSelect.addEventListener('change', () => applyDefaultSkin(defaultSkinSelect.value, true));

        // Auto-load a previously-imported CUSTOM skin (IndexedDB) so a
        // visitor doesn't have to re-upload every visit — best-effort,
        // silently does nothing if there's no cached skin or it fails to
        // decode. A custom upload still wins over a saved default-skin
        // pick, matching how picking a default always overrides a custom
        // upload the other way — whichever was set most recently wins.
        loadSkinBytesFromDB().then(async rawBytesByKey => {
            if (!rawBytesByKey) {
                try {
                    // No saved preference at all (a genuinely first-time
                    // visitor) starts on INITIAL_DEFAULT_SKIN rather than
                    // whatever was last picked. Also falls back here if the
                    // saved id no longer matches a real option (e.g. a skin
                    // that was later removed from DEFAULT_SKINS) instead of
                    // leaving the <select> on an unmatched, blank value.
                    let savedDefault = localStorage.getItem(CT_DEFAULT_SKIN_KEY) || INITIAL_DEFAULT_SKIN;
                    if (!DEFAULT_SKINS.some(s => s.id === savedDefault)) savedDefault = INITIAL_DEFAULT_SKIN;
                    defaultSkinSelect.value = savedDefault;
                    await applyDefaultSkin(savedDefault, false);
                } catch { /* per-viewer convenience only */ }
                return;
            }
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
        });

        // Top-bar sliders (always visible — see the comment above
        // theaterHtml()): volume and background dim live here, matching
        // replayviewer.com's layout. "Dim" is presented inverted from our
        // underlying brightness setting (dim% = 100 - brightness%) purely
        // for label clarity — 0% dim reads as "not dimmed" either way.
        const volumeInput = document.getElementById('replay-set-volume');
        const volumeValue = document.getElementById('replay-volume-value');
        const effectsVolumeInput = document.getElementById('replay-set-effects-volume');
        const effectsVolumeValue = document.getElementById('replay-effects-volume-value');
        const dimInput = document.getElementById('replay-set-dim');
        const dimValue = document.getElementById('replay-dim-value');
        volumeInput.addEventListener('input', () => {
            settings.volume = Number(volumeInput.value);
            audioEl.volume = settings.volume / 100;
            volumeValue.textContent = `${settings.volume}%`;
            saveSettings(settings);
        });
        effectsVolumeInput.addEventListener('input', () => {
            settings.effectsVolume = Number(effectsVolumeInput.value);
            player.setVisualSettings(settings);
            effectsVolumeValue.textContent = `${settings.effectsVolume}%`;
            saveSettings(settings);
        });
        dimInput.addEventListener('input', () => {
            const dim = Number(dimInput.value);
            settings.brightness = 100 - dim;
            dimValue.textContent = `${dim}%`;
            applyBackgroundSettings(scrim, settings);
            saveSettings(settings);
        });

        // Less-common settings stay in the click-to-open drawer.
        const blurInput = document.getElementById('replay-set-blur');
        const popupsInput = document.getElementById('replay-set-popups');
        const bananaInput = document.getElementById('replay-set-banana');
        const onSettingsChange = () => {
            settings.blur = Number(blurInput.value);
            settings.popups = popupsInput.checked;
            settings.bananaRain = bananaInput.checked;
            player.setVisualSettings(settings);
            document.body.classList.toggle('show-banana-rain', settings.bananaRain);
            applyBackgroundSettings(scrim, settings);
            saveSettings(settings);
        };
        [blurInput, popupsInput, bananaInput].forEach(el => {
            el.addEventListener('input', onSettingsChange);
        });

        // Leaderboard panel — the map's real top scores, rendered as a
        // sliding window that climbs live as the watched score rises (see
        // onTick above), rather than a static top-50 dump. Best-effort/
        // decorative: never blocks setup. Skipped in compare mode — its
        // aside is hidden by ct-replay-embed anyway, and skipping the fetch
        // saves a beatmap-leaderboard.js call per side on every compare load.
        if (embed) {
            // Compare page control bridge: the parent drives this iframe's
            // playback entirely through postMessage instead of this page's
            // own (CSS-hidden) play/scrub/rate controls, reusing the exact
            // same ReplayPlayer methods those controls call normally.
            window.addEventListener('message', (e) => {
                if (e.source !== window.parent || e.origin !== location.origin) return;
                const msg = e.data;
                if (!msg || msg.ctCompare !== true) return;
                if (msg.type === 'play') { if (!player.playing) player.play(); }
                else if (msg.type === 'pause') { if (player.playing) player.pause(); }
                else if (msg.type === 'seek') { player.seek(player.minTime + msg.frac * (player.maxTime - player.minTime)); }
                else if (msg.type === 'resync') { player.resyncTo(msg.frac); }
                else if (msg.type === 'rate') { player.setSpeed(msg.rate); }
                // Music volume/offset only do anything on the side that
                // actually has audio (embedAudio — see above); harmless
                // no-ops on the silent side since audioEl.volume just sits
                // unused and setOffset()'s own audioReady guard already
                // no-ops cleanly with no audio element driving it.
                else if (msg.type === 'volume') { audioEl.volume = msg.value / 100; }
                else if (msg.type === 'offset') { player.setOffset(msg.value); }
                // Effects (hit-sound sfx) and background dim apply
                // independently on EVERY side — not tied to embedAudio.
                else if (msg.type === 'effectsVolume') { player.effectsVolume = msg.value / 100; }
                else if (msg.type === 'dim') { applyBackgroundSettings(scrim, { blur: settings.blur, brightness: 100 - msg.value }); }
                // Skin controls: reuse the exact same handlers the (now
                // hidden) skin picker UI already calls, rather than
                // duplicating any decode/apply logic here. A built-in pick
                // just calls the same function the dropdown's own change
                // listener calls; a custom upload replays the same trick
                // used to feed a synthetic skin into that file input
                // during dev/testing — wrap the received bytes in a File,
                // hand it to the input via DataTransfer, fire 'change'.
                else if (msg.type === 'skinDefault') { defaultSkinSelect.value = msg.id; applyDefaultSkin(msg.id, true); }
                else if (msg.type === 'skinCustom') {
                    try {
                        const file = new File([msg.bytes], msg.name || 'skin.osk');
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        skinInput.files = dt.files;
                        skinInput.dispatchEvent(new Event('change'));
                    } catch { /* ignore */ }
                }
                else if (msg.type === 'skinClear') { skinClearBtn.click(); }
            });
            window.parent.postMessage({
                ctCompare: true, type: 'ready',
                durationMs: player.maxTime - player.minTime,
                totalCatchable: finalCatchableCount,
                meta: { username: meta.username, rank: meta.rank, mods: meta.mods, pp: meta.pp },
            }, location.origin);
            player.start();
            return;
        }
        fetchLeaderboard(beatmapId).then(rows => {
            const selfRow = userId ? rows.find(r => String(r.user_id) === String(userId)) : null;
            playerRowMeta = selfRow || {
                user_id: userId, username: meta.username,
                avatar_url: userId ? `https://a.ppy.sh/${userId}` : '',
            };
            otherLbRows = selfRow ? rows.filter(r => r !== selfRow) : rows;
            // Rank labels must be assigned AFTER removing the watched
            // player's own real row, numbered purely by position among the
            // remaining opponents (1..N) — NOT by each row's original
            // position in the full fetched list. onTick's currentRank is
            // "1 + how many of these opponents still beat my live score",
            // which is already a 1..N+1 scale over exactly this filtered
            // set. Labelling survivors with their pre-removal position
            // instead (e.g. 2..50, if the watched player's real score
            // happened to be #1) put opponents on a different numbering
            // scale than
            // currentRank — live-reported and confirmed: a real player
            // whose score genuinely still beat the live-interpolated score
            // was silently dropped from the visible window the moment
            // their leftover original rank number collided with the
            // player's own newly-computed one, even though they hadn't
            // actually been overtaken yet ("story 還是2開頭卻直接超過3開頭
            // 的了").
            otherLbRows.forEach((row, i) => { row.rank = i + 1; });
        });

        player.start();
    } catch (err) {
        console.error('[replay] failed:', err);
        setStatus(errorHtml(err.message));
    }
}

run();
