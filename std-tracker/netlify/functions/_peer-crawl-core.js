/* Shared peer-best-plays sweep logic for the farm helper (see
   farm-helper.js), used by both the scheduled cron handler
   (peer-crawl-cron.js) and the manual/backfill HTTP endpoint
   (peer-crawl-run.js). Ported from catch-tracker's own _peer-crawl-core.js
   — same budget/perRun/rollback shape as every other crawler in this repo
   (_rankings-crawl-core.js, _maps-crawl-core.js, _scores-poll-core.js).

   Walks rankings:global (already cached, sorted by pp desc) in rank order
   via a cursor, fetching each player's own top-100 best plays
   (GET /users/{id}/scores/best?mode=osu&limit=100 — same call
   player-get.js already makes for a single profile view) and caching a
   lean, normalized copy under peer-bestplays:{user_id}. farm-helper.js
   only ever reads ~100 of these per request (a target player's rank-
   adjacent window), so this stays one small key per player rather than
   one giant blob.

   Sequential requests only (no Promise.all against the osu! API) — same
   rate-limit discipline as every other crawler here. Cursor wraps to 0 on
   exhaustion — perpetual refresh, so peer data stays current as pp
   changes over time. */
const { getOsuToken } = require('./_osu-auth');
const { getRankingsStore, getPeerStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');
const { MODE } = require('./_std-constants');

const STATE_KEY = 'peer-crawl-state';
const RANKINGS_KEY = 'rankings:global';
const peerKey = (userId) => `peer-bestplays:${userId}`;

const WRITE_RESERVE_MS = 2000;

async function loadState(store) {
    const state = await store.get(STATE_KEY, { type: 'json' });
    return state || {
        cursor: 0,
        sweepCount: 0,
        lastRunAt: null,
        lastOkAt: null,
        lastError: null,
        consecutiveWriteFails: 0,
    };
}

function modAcronyms(mods) {
    return Array.isArray(mods) ? mods.map(m => (typeof m === 'string' ? m : m.acronym)) : [];
}

// Lean on purpose — beatmap title/artist/etc. get joined from maps:global
// at request time in farm-helper.js, so this doesn't duplicate that across
// up to 10,000 cached player records.
function normalizePeerScore(score) {
    const bm = score.beatmap || {};
    return {
        beatmap_id: bm.id ?? score.beatmap_id ?? null,
        pp: score.pp ?? null,
        mods: modAcronyms(score.mods),
        accuracy: score.accuracy ?? null,
        rank: score.rank || null,
    };
}

async function fetchBestPlays(userId, token) {
    const res = await fetch(
        `https://osu.ppy.sh/api/v2/users/${userId}/scores/best?${new URLSearchParams({ mode: MODE, limit: '100' })}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`scores/best failed for ${userId}: ${res.status}`);
    const scores = await res.json();
    return Array.isArray(scores) ? scores.map(normalizePeerScore).filter(s => s.beatmap_id != null && s.pp != null) : [];
}

async function runPeerCrawl(budgetMs, perRun) {
    const start = Date.now();
    const rankingsStore = getRankingsStore();
    const peerStore = getPeerStore();

    const state = await loadState(peerStore);
    const snapshot = JSON.parse(JSON.stringify(state));
    const players = (await getJSONGz(rankingsStore, RANKINGS_KEY)) || [];

    const writeReserve = Math.min(WRITE_RESERVE_MS, Math.floor(budgetMs * 0.2));
    const deadline = start + (budgetMs - writeReserve);

    let crawled = 0, error = null;

    if (players.length > 0) {
        try {
            const token = await getOsuToken();
            while (Date.now() < deadline && crawled < perRun) {
                const idx = (state.cursor || 0) % players.length;
                const player = players[idx];

                try {
                    const bestPlays = await fetchBestPlays(player.user_id, token);
                    await peerStore.setJSON(peerKey(player.user_id), { user_id: player.user_id, bestPlays, updatedAt: new Date().toISOString() });
                } catch (perPlayerErr) {
                    // One player's fetch failing shouldn't abort the whole
                    // batch — same "keep going" spirit as the score-poller.
                    error = perPlayerErr.message;
                }

                const nextCursor = idx + 1;
                state.cursor = nextCursor >= players.length ? 0 : nextCursor;
                if (state.cursor === 0) state.sweepCount = (state.sweepCount || 0) + 1;
                crawled++;
            }
        } catch (err) {
            error = err.message;
        }
    }

    const now = new Date().toISOString();
    state.lastRunAt = now;
    state.lastOkAt = now;
    state.lastError = error;
    state.consecutiveWriteFails = 0;
    try {
        await peerStore.setJSON(STATE_KEY, state);
    } catch (err) {
        await peerStore.setJSON(STATE_KEY, {
            ...snapshot,
            lastRunAt: now,
            lastError: `state write failed: ${err.message}`,
            consecutiveWriteFails: (snapshot.consecutiveWriteFails || 0) + 1,
        });
    }

    return { crawled, totalPlayers: players.length, sweepCount: state.sweepCount, error };
}

module.exports = { runPeerCrawl };
