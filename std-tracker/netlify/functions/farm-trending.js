/* "刷分熱門" — ported from catch-tracker's own farm-trending.js: which maps
   the tracked pool has actually been grinding lately. Derived entirely
   from feed:recent (the same dataset feed-list.js already reads), grouped
   by beatmap_id, rather than a new crawler/dataset: feed:recent is a real
   recent-activity window (FEED_CAP-capped, see _std-constants.js), so
   "most scores in it" already IS a genuine live "trending now" signal —
   arguably a better one than a lifetime play_count total, which never
   resets and always favours old maps. */
const { getFeedStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');

const PAGE_SIZE = 20;
const MAX_RECENT_PLAYERS = 6;

const SORTERS = {
    playcount: (a, b) => b.playCount - a.playCount,
    avgpp: (a, b) => (b.avgPp || 0) - (a.avgPp || 0),
    maxpp: (a, b) => (b.maxPp || 0) - (a.maxPp || 0),
    recent: (a, b) => new Date(b.latestAt || 0) - new Date(a.latestAt || 0),
};

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
    const pageSize = Math.max(1, Math.min(60, parseInt(qs.limit, 10) || PAGE_SIZE));
    const sortKey = SORTERS[qs.sort] ? qs.sort : 'playcount';
    const minPp = Number.isFinite(parseFloat(qs.minPp)) ? parseFloat(qs.minPp) : null;

    try {
        const store = getFeedStore();
        const feed = (await getJSONGz(store, 'feed:recent')) || [];

        const byMap = new Map();
        for (const r of feed) {
            if (!r.beatmap_id) continue;
            let m = byMap.get(r.beatmap_id);
            if (!m) {
                m = {
                    beatmap_id: r.beatmap_id, beatmapset_id: r.beatmapset_id,
                    artist: r.artist, title: r.title, version: r.version,
                    difficulty_rating: r.difficulty_rating,
                    playCount: 0, ppSum: 0, ppCount: 0, maxPp: 0,
                    latestAt: null,
                    recentPlayers: [], // de-duplicated below, most-recent-first
                };
                byMap.set(r.beatmap_id, m);
            }
            m.playCount++;
            if (r.pp != null) {
                m.ppSum += r.pp;
                m.ppCount++;
                if (r.pp > m.maxPp) m.maxPp = r.pp;
            }
            if (!m.latestAt || new Date(r.created_at) > new Date(m.latestAt)) m.latestAt = r.created_at;
            if (!m.recentPlayers.some(p => p.user_id === r.user_id)) {
                m.recentPlayers.push({ user_id: r.user_id, username: r.username, avatar_url: r.avatar_url, country_code: r.country_code });
            }
        }

        let items = [...byMap.values()].map(m => ({
            beatmap_id: m.beatmap_id, beatmapset_id: m.beatmapset_id,
            artist: m.artist, title: m.title, version: m.version,
            difficulty_rating: m.difficulty_rating,
            playCount: m.playCount,
            avgPp: m.ppCount ? Math.round(m.ppSum / m.ppCount) : null,
            maxPp: m.ppCount ? Math.round(m.maxPp) : null,
            latestAt: m.latestAt,
            recentPlayers: m.recentPlayers.slice(0, MAX_RECENT_PLAYERS),
            recentPlayerCount: m.recentPlayers.length,
        }));

        if (minPp !== null) items = items.filter(m => (m.avgPp || 0) >= minPp);
        items = items.sort(SORTERS[sortKey]);

        const total = items.length;
        const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);

        const state = (await store.get('scores-poll-state', { type: 'json' })) || {};
        const coverage = {
            feedSize: feed.length,
            mapCount: byMap.size,
            lastOkAt: state.lastOkAt || null,
        };

        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=30' },
            body: JSON.stringify({ items: pageItems, total, page, pageSize, coverage }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
