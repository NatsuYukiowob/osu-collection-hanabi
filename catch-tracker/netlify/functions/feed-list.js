/* Public, filtered/paginated view over the live score feed
   (feed:recent, written by scores-poll-cron.js / scores-poll-run.js — see
   _scores-poll-core.js). Modeled on the main site's farm-maps-list.js: pure
   read-only GET, no auth, in-module TTL cache over the gzip'd dataset, and
   an honest `coverage` block read fresh from scores-poll-state every call
   so the frontend can show real freshness instead of implying the feed is
   exhaustive. */
const { getFeedStore, getRankingsStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');
const { VALID_GRADES } = require('./_catch-constants');

const PAGE_SIZE = 30;
const DS_CACHE_TTL_MS = 20_000; // shorter than Farm's 60s — this data is meant to feel live
let _dsCache = { at: 0, feed: null };

async function loadFeed(store) {
    const now = Date.now();
    if (_dsCache.feed && now - _dsCache.at < DS_CACHE_TTL_MS) return _dsCache.feed;
    const feed = (await getJSONGz(store, 'feed:recent')) || [];
    _dsCache = { at: now, feed };
    return feed;
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
    const grade = VALID_GRADES.has(qs.grade) ? qs.grade : null;
    const mods = (qs.mods || '').trim().toUpperCase() || null; // exact-match on the acronym set, e.g. "HDDT"
    const fcOnly = qs.fcOnly === '1';
    const chokeOnly = qs.chokeOnly === '1';
    const country = (qs.country || '').trim().toUpperCase().slice(0, 2);
    const page = Math.max(0, parseInt(qs.page, 10) || 0);
    const pageSize = Math.max(1, Math.min(100, parseInt(qs.limit, 10) || PAGE_SIZE));
    // 'pp' powers the homepage's "Recent Best Plays" highlight strip
    // (highest-pp plays first); default is newest-first, the live-feed view.
    const sort = qs.sort === 'pp' ? 'pp' : 'recent';

    try {
        const feedStore = getFeedStore();
        const feed = await loadFeed(feedStore);

        // Distinct countries + counts across the full feed (not the
        // filtered/paginated result) so the filter dropdown always lists
        // every option that currently has at least one feed entry.
        const countryCounts = new Map();
        for (const r of feed) {
            if (!r.country_code) continue;
            countryCounts.set(r.country_code, (countryCounts.get(r.country_code) || 0) + 1);
        }
        const countries = [...countryCounts.entries()]
            .map(([code, count]) => ({ code, count }))
            .sort((a, b) => b.count - a.count);

        // Approximate "currently playing" — real presence would need a
        // websocket/spectator feed we don't have, so this just surfaces
        // whoever the score-poller most recently caught a new score from.
        // Skewed toward whoever the round-robin cursor has passed lately
        // rather than true concurrency, but still reads as "live" — see
        // ACTIVE_WINDOW_MS below.
        const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
        const now = Date.now();
        const activeMap = new Map();
        for (const r of feed) {
            const seenAtMs = r.seenAt ? new Date(r.seenAt).getTime() : NaN;
            if (!Number.isFinite(seenAtMs) || now - seenAtMs > ACTIVE_WINDOW_MS) continue;
            if (!activeMap.has(r.user_id)) {
                activeMap.set(r.user_id, {
                    user_id: r.user_id, username: r.username,
                    avatar_url: r.avatar_url, country_code: r.country_code, seenAt: r.seenAt,
                });
            }
        }
        const activePlayers = [...activeMap.values()]
            .sort((a, b) => new Date(b.seenAt) - new Date(a.seenAt))
            .slice(0, 16);

        let items = feed;
        if (grade) items = items.filter(r => r.rank === grade);
        if (mods) items = items.filter(r => (r.mods || []).join('') === mods);
        if (fcOnly) items = items.filter(r => r.is_fc);
        if (chokeOnly) items = items.filter(r => !r.is_fc);
        if (country) items = items.filter(r => r.country_code === country);
        if (sort === 'pp') {
            items = items.filter(r => r.pp != null).sort((a, b) => b.pp - a.pp);
        }

        const total = items.length;
        const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);

        const state = (await feedStore.get('scores-poll-state', { type: 'json' })) || {};
        const rankingsState = (await getRankingsStore().get('rankings-crawl-state', { type: 'json' })) || {};

        const coverage = {
            feedSize: feed.length,
            totalPlayers: state.totalPlayers || 0,
            playersPolledThisSweep: state.playersPolledThisSweep || 0,
            lastRunAt: state.lastRunAt || null,
            lastOkAt: state.lastOkAt || null,
            lastError: state.lastError || null,
            rankingsLastOkAt: rankingsState.lastOkAt || null,
            rankingsSweepCount: rankingsState.sweepCount || 0,
        };

        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=20' },
            body: JSON.stringify({ items: pageItems, total, page, pageSize, coverage, countries, activePlayers }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
