/* Shared score-polling logic for the std Tracker's live feed, used by both
   the scheduled cron handler (scores-poll-cron.js) and the manual/backfill
   HTTP endpoint (scores-poll-run.js). This is the "live" half of the
   tracker — see _rankings-crawl-core.js for the player-discovery half.
   Ported from catch-tracker's own _scores-poll-core.js.

   Round-robins over players:index (built by the rankings sweep), bounded by
   BOTH budgetMs (wall-clock) AND perRun (a hard item-count cap per
   invocation). Per player: GET /users/{id}/scores/recent?mode=osu&
   include_fails=1&limit=50 (ppy/osu-web's UsersController::scores() — plain
   limit/offset pagination, include_fails is a real, current param), diff
   the returned score ids against `player-scores:{user_id}.lastSeenScoreIds`
   (last poll's snapshot), and prepend any newly-seen score into
   `feed:recent`.

   Sequential awaited requests only (one player at a time) — no
   Promise.all burst against osu! API v2, matching this repo's established
   implicit rate-limit strategy. The round-robin cursor means a tick that
   can't finish the whole player pool just sweeps partially and picks up
   where it left off next tick — `playersPolledThisSweep`/`totalPlayers` in
   scores-poll-state make that regime visible to the frontend via
   feed-list.js's coverage block. */
const { getOsuToken } = require('./_osu-auth');
const { getRankingsStore, getFeedStore } = require('./_blobs-store');
const { setJSONGz, getJSONGz } = require('./_blob-json');
const { MODE, FEED_CAP, LAST_SEEN_CAP } = require('./_std-constants');

const STATE_KEY = 'scores-poll-state';
const FEED_KEY = 'feed:recent';
const PLAYERS_INDEX_KEY = 'players:index';
const playerScoresKey = (userId) => `player-scores:${userId}`;

const WRITE_RESERVE_MS = 4000;

async function loadState(store) {
    const state = await store.get(STATE_KEY, { type: 'json' });
    return state || {
        cursor: 0,
        lastRunAt: null,
        lastOkAt: null,
        lastError: null,
        consecutiveWriteFails: 0,
        playersPolledThisSweep: 0,
        totalPlayers: 0,
    };
}

function isFC(s) {
    if (s.perfect === true || s.perfect === 1) return true;
    const st = s.statistics || {};
    const miss = st.count_miss ?? st.miss ?? null;
    return miss === 0;
}

function toFeedRecord(score, player) {
    const bm = score.beatmap || {};
    const bms = score.beatmapset || bm.beatmapset || {};
    return {
        score_id: score.id,
        user_id: player.user_id,
        username: player.username || null,
        country_code: player.country_code || null,
        avatar_url: `https://a.ppy.sh/${player.user_id}`,
        beatmap_id: bm.id ?? score.beatmap_id ?? null,
        beatmapset_id: bms.id ?? null,
        artist: bms.artist || null,
        title: bms.title || null,
        version: bm.version || null,
        creator: bms.creator || null,
        difficulty_rating: bm.difficulty_rating ?? null,
        mods: Array.isArray(score.mods) ? score.mods.map(m => (typeof m === 'string' ? m : m.acronym)) : [],
        rank: score.rank || null,
        accuracy: score.accuracy ?? null,
        max_combo: score.max_combo ?? null,
        pp: score.pp ?? null,
        statistics: score.statistics || {},
        is_fc: isFC(score),
        passed: score.passed !== false,
        // GET /users/{id}/scores/recent uses a plain `replay: boolean` field
        // (confirmed against catch-tracker's own real-API check this same
        // month) — not used by this site yet (no replay viewer), kept for
        // parity with the feed record shape in case a later feature needs
        // it.
        has_replay: score.replay === true,
        created_at: score.created_at || null,
        seenAt: new Date().toISOString(),
    };
}

async function pollOnePlayer(player, token) {
    const params = new URLSearchParams({ mode: MODE, include_fails: '1', limit: '50' });
    const res = await fetch(`https://osu.ppy.sh/api/v2/users/${player.user_id}/scores/recent?${params}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`scores/recent failed for ${player.user_id}: ${res.status}`);
    const scores = await res.json();
    return Array.isArray(scores) ? scores : [];
}

async function runScorePollBatch(budgetMs, perRun) {
    const start = Date.now();
    const rankingsStore = getRankingsStore();
    const feedStore = getFeedStore();

    const state = await loadState(feedStore);
    const snapshot = JSON.parse(JSON.stringify(state));
    const players = (await rankingsStore.get(PLAYERS_INDEX_KEY, { type: 'json' })) || [];
    const feed = (await getJSONGz(feedStore, FEED_KEY)) || [];

    state.totalPlayers = players.length;

    const writeReserve = Math.min(WRITE_RESERVE_MS, Math.floor(budgetMs * 0.4));
    const deadline = start + (budgetMs - writeReserve);

    const newScores = [];
    let polled = 0, error = null;

    if (players.length > 0) {
        try {
            const token = await getOsuToken();
            while (Date.now() < deadline && polled < perRun) {
                const idx = (state.cursor || 0) % players.length;
                const player = players[idx];

                try {
                    const scores = await pollOnePlayer(player, token);
                    const prevKey = playerScoresKey(player.user_id);
                    const prev = (await feedStore.get(prevKey, { type: 'json' })) || { lastSeenScoreIds: [] };
                    const prevSeen = new Set(prev.lastSeenScoreIds || []);

                    for (const score of scores) {
                        if (score.id != null && !prevSeen.has(score.id)) {
                            newScores.push(toFeedRecord(score, player));
                        }
                    }

                    const nowIds = scores.map(s => s.id).filter(id => id != null).slice(0, LAST_SEEN_CAP);
                    await feedStore.setJSON(prevKey, { user_id: player.user_id, lastSeenScoreIds: nowIds, lastPolledAt: new Date().toISOString() });
                } catch (perPlayerErr) {
                    // One player's fetch failing shouldn't abort the whole
                    // batch — log it and move on.
                    error = perPlayerErr.message;
                }

                const nextCursor = idx + 1;
                state.cursor = nextCursor >= players.length ? 0 : nextCursor;
                state.playersPolledThisSweep = (state.playersPolledThisSweep || 0) + 1;
                if (state.cursor === 0) state.playersPolledThisSweep = 0; // sweep wrapped
                polled++;
            }
        } catch (err) {
            error = err.message;
        }
    }

    let mergedFeed = feed;
    if (newScores.length > 0) {
        newScores.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        mergedFeed = [...newScores, ...feed].slice(0, FEED_CAP);
    }

    const now = new Date().toISOString();
    let writeOk = true;
    if (newScores.length > 0) {
        try {
            await setJSONGz(feedStore, FEED_KEY, mergedFeed);
        } catch (err) {
            writeOk = false;
            error = `feed write failed: ${err.message}`;
        }
    }

    if (writeOk) {
        state.lastRunAt = now;
        state.lastOkAt = now;
        state.lastError = error;
        state.consecutiveWriteFails = 0;
        await feedStore.setJSON(STATE_KEY, state);
    } else {
        await feedStore.setJSON(STATE_KEY, {
            ...snapshot,
            totalPlayers: state.totalPlayers,
            lastRunAt: now,
            lastError: error,
            consecutiveWriteFails: (snapshot.consecutiveWriteFails || 0) + 1,
        });
    }

    return { polled, newScoreCount: newScores.length, feedSize: mergedFeed.length, writeOk, error };
}

module.exports = { runScorePollBatch };
