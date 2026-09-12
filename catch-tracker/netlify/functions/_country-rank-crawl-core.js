/* Country-rank backfill for rankings:global. GET /rankings/fruits/performance
   (the bulk endpoint _rankings-crawl-core.js sweeps) always comes back with
   country_rank null on every entry (confirmed live — see that file's
   toRecord()) — only the per-user endpoint reliably has it, which is why
   player-get.js backfills a single viewed profile's country_rank live on
   every request. This does the same GET /users/{id}/{mode} call, but as a
   background round-robin sweep over every tracked player, writing the
   result straight into that player's rankings:global record so the daily
   rank-history snapshot (_rank-snapshot-core.js) picks up a real
   country_rank going forward instead of null.

   Same round-robin shape as _scores-poll-core.js / _peer-crawl-core.js:
   sequential awaited requests (no Promise.all burst), budgetMs + perRun
   dual caps, a wrapping cursor so a slow tick just resumes next time —
   full coverage over many ticks, not a one-shot sweep.

   Shares rankings:global with _rankings-crawl-core.js's own hourly
   read-modify-write sweep. Both read the whole array, mutate, and write
   the whole array back, so two overlapping runs could in principle clobber
   each other's writes for players neither one touched this tick — low
   stakes for a rank-display field, and not worth a distributed lock
   Netlify Blobs doesn't make easy anyway, but worth knowing about if
   country_rank ever seems to "flicker" back to a stale value. */
const { getOsuToken } = require('./_osu-auth');
const { getRankingsStore } = require('./_blobs-store');
const { setJSONGz, getJSONGz } = require('./_blob-json');
const { MODE } = require('./_catch-constants');

const STATE_KEY = 'country-rank-crawl-state';
const RANKINGS_KEY = 'rankings:global';
const PLAYERS_INDEX_KEY = 'players:index';

const WRITE_RESERVE_MS = 4000;

async function loadState(store) {
    const state = await store.get(STATE_KEY, { type: 'json' });
    return state || {
        cursor: 0,
        sweepCount: 0,
        lastRunAt: null,
        lastOkAt: null,
        lastError: null,
        consecutiveWriteFails: 0,
        playersPolledThisSweep: 0,
        totalPlayers: 0,
    };
}

async function fetchCountryRank(userId, token) {
    const res = await fetch(`https://osu.ppy.sh/api/v2/users/${userId}/${MODE}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`user fetch failed for ${userId}: ${res.status}`);
    const data = await res.json();
    const stats = data.statistics || {};
    return stats.country_rank ?? null;
}

async function runCountryRankCrawl(budgetMs, perRun) {
    const start = Date.now();
    const store = getRankingsStore();
    const state = await loadState(store);
    const snapshot = JSON.parse(JSON.stringify(state));

    const players = (await store.get(PLAYERS_INDEX_KEY, { type: 'json' })) || [];
    const dataset = (await getJSONGz(store, RANKINGS_KEY)) || [];
    const byId = new Map(dataset.map((r, i) => [r.user_id, i]));

    state.totalPlayers = players.length;

    const writeReserve = Math.min(WRITE_RESERVE_MS, Math.floor(budgetMs * 0.4));
    const deadline = start + (budgetMs - writeReserve);

    let polled = 0, updated = 0, error = null;

    if (players.length > 0) {
        try {
            const token = await getOsuToken();
            while (Date.now() < deadline && polled < perRun) {
                const idx = (state.cursor || 0) % players.length;
                const player = players[idx];

                try {
                    const countryRank = await fetchCountryRank(player.user_id, token);
                    const dIdx = byId.get(player.user_id);
                    if (dIdx !== undefined) {
                        dataset[dIdx].country_rank = countryRank;
                        updated++;
                    }
                } catch (perPlayerErr) {
                    // One player's fetch failing shouldn't abort the whole
                    // batch — same "keep going" spirit as the other crawlers.
                    error = perPlayerErr.message;
                }

                const nextCursor = idx + 1;
                state.cursor = nextCursor >= players.length ? 0 : nextCursor;
                state.playersPolledThisSweep = (state.playersPolledThisSweep || 0) + 1;
                if (state.cursor === 0) {
                    state.sweepCount = (state.sweepCount || 0) + 1;
                    state.playersPolledThisSweep = 0;
                }
                polled++;
            }
        } catch (err) {
            error = err.message;
        }
    }

    const now = new Date().toISOString();
    let writeOk = true;
    if (updated > 0) {
        try {
            await setJSONGz(store, RANKINGS_KEY, dataset);
        } catch (err) {
            writeOk = false;
            error = `rankings write failed: ${err.message}`;
        }
    }

    if (writeOk) {
        state.lastRunAt = now;
        state.lastOkAt = now;
        state.lastError = error;
        state.consecutiveWriteFails = 0;
        await store.setJSON(STATE_KEY, state);
    } else {
        await store.setJSON(STATE_KEY, {
            ...snapshot,
            totalPlayers: state.totalPlayers,
            lastRunAt: now,
            lastError: error,
            consecutiveWriteFails: (snapshot.consecutiveWriteFails || 0) + 1,
        });
    }

    return { polled, updated, writeOk, error };
}

module.exports = { runCountryRankCrawl };
