/* Public, paginated view over the global catch pp-rankings (rankings:global,
   written by rankings-crawl-cron.js / rankings-crawl-run.js — see
   _rankings-crawl-core.js; was rankings:TW pre-expansion, renamed not
   migrated). Same pure read-only GET + TTL cache + honest coverage-block
   shape as feed-list.js / the main site's farm-maps-list.js. */
const { getRankingsStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');
const { INDEX_KEY: RANK_HISTORY_INDEX_KEY, snapshotKey: rankSnapshotKey } = require('./_rank-snapshot-core');

const PAGE_SIZE = 50;
const DS_CACHE_TTL_MS = 60_000; // rankings move slowly, fine to cache longer than the feed
let _dsCache = { at: 0, rankings: null };

async function loadRankings(store) {
    const now = Date.now();
    if (_dsCache.rankings && now - _dsCache.at < DS_CACHE_TTL_MS) return _dsCache.rankings;
    const rankings = (await getJSONGz(store, 'rankings:global')) || [];
    _dsCache = { at: now, rankings };
    return rankings;
}

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const qs = event.queryStringParameters || {};
    const page = Math.max(0, parseInt(qs.page, 10) || 0);
    const pageSize = Math.max(1, Math.min(100, parseInt(qs.limit, 10) || PAGE_SIZE));
    // Username search (header search widget) — substring match over the
    // full cached dataset, bypassing normal pagination since a search is
    // expected to return a short list, not a page-by-page browse.
    const q = (qs.q || '').trim().toLowerCase().slice(0, 50);
    // Country filter (post-global-expansion) — plain equality over the
    // 2-letter code, applied server-side so the frontend's filter dropdown
    // doesn't need to pull the whole (up to ~10k-row) dataset to the client
    // just to narrow it down.
    const country = (qs.country || '').trim().toUpperCase().slice(0, 2);

    try {
        const store = getRankingsStore();
        const rankings = await loadRankings(store);

        // Distinct countries + counts across the FULL dataset (not just the
        // current page/filter) so the dropdown can list every option
        // regardless of what's currently selected.
        const countryCounts = new Map();
        for (const r of rankings) {
            if (!r.country_code) continue;
            countryCounts.set(r.country_code, (countryCounts.get(r.country_code) || 0) + 1);
        }
        const countries = [...countryCounts.entries()]
            .map(([code, count]) => ({ code, count }))
            .sort((a, b) => b.count - a.count);

        let sorted = [...rankings].sort((a, b) => (b.pp || 0) - (a.pp || 0));
        if (country) sorted = sorted.filter(r => r.country_code === country);
        if (q) sorted = sorted.filter(r => (r.username || '').toLowerCase().includes(q));
        const total = sorted.length;
        let pageItems = sorted.slice(page * pageSize, (page + 1) * pageSize);

        // Rank-delta columns (mania-tracker's rankings-table "7天全球"/
        // "7天國內" columns) — same diff player-get.js already does
        // per-player, but batched: load the oldest retained daily snapshot
        // ONCE per request and diff every row on this page against it,
        // instead of one blob read per player. Not actually a fixed 7 days
        // (see _rank-snapshot-core.js — the window grows day by day since
        // this started 2026-09-12), so `days` rides along per-row for the
        // frontend to show as a tooltip rather than a header lying about
        // the window. Best-effort — a page still renders fine without
        // deltas if there's no snapshot yet or a player isn't in it (e.g.
        // newly ranked since).
        try {
            const historyIndex = (await store.get(RANK_HISTORY_INDEX_KEY, { type: 'json' })) || [];
            if (historyIndex.length) {
                const oldestDate = historyIndex[0];
                const oldSnapshot = (await getJSONGz(store, rankSnapshotKey(oldestDate))) || {};
                const days = Math.max(1, Math.round((Date.now() - new Date(`${oldestDate}T00:00:00Z`).getTime()) / 86400000));
                pageItems = pageItems.map(r => {
                    const old = oldSnapshot[r.user_id];
                    if (!old) return r;
                    const [oldGlobal, oldCountry] = old;
                    const delta = { days };
                    if (oldGlobal != null && r.global_rank != null) delta.global = oldGlobal - r.global_rank;
                    if (oldCountry != null && r.country_rank != null) delta.country = oldCountry - r.country_rank;
                    return (delta.global != null || delta.country != null) ? { ...r, rank_delta: delta } : r;
                });
            }
        } catch { /* delta is a nice-to-have; the table still renders without it */ }

        const state = (await store.get('rankings-crawl-state', { type: 'json' })) || {};
        const coverage = {
            datasetSize: rankings.length,
            totalKnown: state.totalKnown || null,
            sweepCount: state.sweepCount || 0,
            lastRunAt: state.lastRunAt || null,
            lastOkAt: state.lastOkAt || null,
            lastError: state.lastError || null,
        };

        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=120' },
            body: JSON.stringify({ items: pageItems, total, page, pageSize, coverage, countries }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
