/* Shared rankings-sweep logic for the std Tracker, used by both the
   scheduled cron handler (rankings-crawl-cron.js) and the manual/backfill
   HTTP endpoint (rankings-crawl-run.js). Ported from catch-tracker's own
   _rankings-crawl-core.js (discover/write/rollback shape, itself modeled on
   the main site's _farm-crawl-core.js) — global from day one, no per-
   ruleset behavior differences: just a straight page-walk over
   GET /rankings/osu/performance.

   osu! API v2's RankingController (app/Http/Controllers/RankingController.php
   in ppy/osu-web) accepts a plain `page` query param for pagination (it also
   accepts `cursor[page]`, but plain `page` is simpler and equally valid) and
   returns { ranking: [...], total, cursor }. Global performance rankings are
   capped around page 200 (~10,000 players) by the API itself for every
   ruleset — "global" here means that same ceiling, not literally every
   registered player (osu!standard has vastly more registered players than
   catch, but the same crawlable-rankings ceiling). An empty `ranking` array
   (or a clamped repeat — see below) means the sweep has reached the end of
   that pool.

   State lives in the rankings Blobs store:
     - `rankings-crawl-state` (plain JSON): { cursorPage, totalKnown,
       sweepCount, lastRunAt, lastOkAt, lastError, consecutiveWriteFails }
     - `rankings:global` (gzip array): one record per ranked std player,
       upserted by user_id — never shrinks reactively (a player who drops
       off the live rankings stays in the dataset/pollable until we
       explicitly decide to prune, which v1 doesn't do).
     - `players:index` (plain JSON): the score-poller's round-robin queue,
       rebuilt from rankings:global whenever a full sweep completes.

   The cursor wraps to page 1 on exhaustion instead of stopping — this is a
   perpetual refresh, not a one-time backfill, so newly-ranked players get
   picked up automatically over time. */
const { getOsuToken } = require('./_osu-auth');
const { getRankingsStore } = require('./_blobs-store');
const { setJSONGz, getJSONGz } = require('./_blob-json');
const { MODE } = require('./_std-constants');

const STATE_KEY = 'rankings-crawl-state';
const RANKINGS_KEY = 'rankings:global';
const PLAYERS_INDEX_KEY = 'players:index';

// Reserve this much of the budget for the (small, but still gzip+upload)
// dataset write, same rationale as Farm's WRITE_RESERVE_MS.
const WRITE_RESERVE_MS = 5000;

async function loadState(store) {
    const state = await store.get(STATE_KEY, { type: 'json' });
    return state || {
        cursorPage: 1,
        totalKnown: null,
        pageSize: null,
        sweepCount: 0,
        lastRunAt: null,
        lastOkAt: null,
        lastError: null,
        consecutiveWriteFails: 0,
    };
}

function toRecord(entry) {
    const u = entry.user || {};
    return {
        user_id: u.id,
        username: u.username || null,
        country_code: u.country_code || (u.country && u.country.code) || null,
        avatar_url: u.avatar_url || null,
        cover_url: (u.cover && u.cover.url) || null,
        global_rank: entry.global_rank ?? null,
        country_rank: entry.country_rank ?? null,
        pp: entry.pp ?? null,
        // hit_accuracy comes back 0-100 (e.g. 99.89); normalize to the same
        // 0-1 scale player-get.js/feed records use for score.accuracy.
        accuracy: typeof entry.hit_accuracy === 'number' ? entry.hit_accuracy / 100 : null,
        play_count: entry.play_count ?? null,
        // SS/S/A grade tallies for the rankings-table columns — ssh/sh fold
        // into the plain ss/s counts (Hidden-mod variants of the same
        // grade), matching catch-tracker's own 3-column SS/S/A display.
        grade_counts: entry.grade_counts ? {
            ss: (entry.grade_counts.ss || 0) + (entry.grade_counts.ssh || 0),
            s: (entry.grade_counts.s || 0) + (entry.grade_counts.sh || 0),
            a: entry.grade_counts.a || 0,
        } : null,
        level: (entry.level && entry.level.current) ?? null,
        is_online: !!u.is_online,
        last_visit: u.last_visit || null,
        updatedAt: new Date().toISOString(),
    };
}

async function runRankingsCrawl(budgetMs) {
    const start = Date.now();
    const store = getRankingsStore();
    const state = await loadState(store);
    const snapshot = JSON.parse(JSON.stringify(state));
    const dataset = (await getJSONGz(store, RANKINGS_KEY)) || [];
    const index = new Map(dataset.map((r, i) => [r.user_id, i]));

    const writeReserve = Math.min(WRITE_RESERVE_MS, Math.floor(budgetMs * 0.4));
    const deadline = start + (budgetMs - writeReserve);

    let pagesFetched = 0, sweepCompleted = false, error = null;
    try {
        const token = await getOsuToken();
        while (Date.now() < deadline) {
            const page = state.cursorPage || 1;

            // osu!'s RankingController clamps an out-of-range `page` back to
            // the last valid page instead of returning an empty result, so
            // an ever-incrementing cursor waiting for `ranking.length === 0`
            // never terminates. Once `total` + the page size learned from
            // page 1 are known, stop BEFORE issuing a request that would
            // just get clamped.
            if (state.totalKnown != null && state.pageSize) {
                const maxPages = Math.max(1, Math.ceil(state.totalKnown / state.pageSize));
                if (page > maxPages) {
                    state.cursorPage = 1;
                    state.sweepCount = (state.sweepCount || 0) + 1;
                    sweepCompleted = true;
                    break;
                }
            }

            const res = await fetch(
                `https://osu.ppy.sh/api/v2/rankings/${MODE}/performance?page=${page}`,
                { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
            );
            if (!res.ok) throw new Error(`rankings fetch failed: ${res.status}`);
            const data = await res.json();
            const ranking = data.ranking || [];
            pagesFetched++;
            if (typeof data.total === 'number') state.totalKnown = data.total;
            // Learn from the largest page seen so far, not just page 1 —
            // self-heals even if cursorPage is already stuck past the real
            // end from before this fix existed (every full page has the
            // same length; only the last/partial page is shorter).
            if (ranking.length > 0) state.pageSize = Math.max(state.pageSize || 0, ranking.length);

            if (ranking.length === 0) {
                // Fallback safety net in case osu! ever changes to a
                // 404/empty response instead of clamping.
                state.cursorPage = 1;
                state.sweepCount = (state.sweepCount || 0) + 1;
                sweepCompleted = true;
                break;
            }

            for (const entry of ranking) {
                const record = toRecord(entry);
                if (record.user_id == null) continue;
                const idx = index.get(record.user_id);
                if (idx === undefined) {
                    dataset.push(record);
                    index.set(record.user_id, dataset.length - 1);
                } else {
                    dataset[idx] = record;
                }
            }
            state.cursorPage = page + 1;
        }
    } catch (err) {
        error = err.message;
    }

    const now = new Date().toISOString();
    let writeOk = true;
    try {
        await setJSONGz(store, RANKINGS_KEY, dataset);
    } catch (err) {
        writeOk = false;
        error = `rankings write failed: ${err.message}`;
    }

    if (writeOk) {
        if (sweepCompleted) {
            // Rebuild the poll queue from the fresh dataset, preserving each
            // player's lastPolledAt so the score-poller's round-robin cursor
            // position stays meaningful across a rankings refresh.
            try {
                const existingIndex = (await store.get(PLAYERS_INDEX_KEY, { type: 'json' })) || [];
                const lastPolled = new Map(existingIndex.map(p => [p.user_id, p.lastPolledAt]));
                const playersIndex = dataset.map(r => ({
                    user_id: r.user_id,
                    username: r.username,
                    country_code: r.country_code,
                    lastPolledAt: lastPolled.get(r.user_id) || null,
                }));
                await store.setJSON(PLAYERS_INDEX_KEY, playersIndex);
            } catch (err) {
                error = error || `players:index rebuild failed: ${err.message}`;
            }
        }
        state.lastRunAt = now;
        state.lastOkAt = now;
        state.lastError = error;
        state.consecutiveWriteFails = 0;
        await store.setJSON(STATE_KEY, state);
    } else {
        await store.setJSON(STATE_KEY, {
            ...snapshot,
            lastRunAt: now,
            lastError: error,
            consecutiveWriteFails: (snapshot.consecutiveWriteFails || 0) + 1,
        });
    }

    return { pagesFetched, sweepCompleted, datasetSize: dataset.length, writeOk, error };
}

module.exports = { runRankingsCrawl };
