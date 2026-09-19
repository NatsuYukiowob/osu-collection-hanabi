/* Per-map stats: aggregates grade/mod counts + FC rate for one beatmap,
   derived on-demand from feed:recent filtered to that beatmap_id — no
   dedicated crawled dataset. This is explicitly NOT exhaustive (only scores
   this tracker has actually observed from the tracked player pool). Ported
   from catch-tracker's own map-stats.js, minus its maps-catalog fallback
   (this site doesn't build a Maps catalog crawler for v1 — status is always
   null; a map with zero observed scores among tracked players just shows an
   empty state instead of falling back to catalog metadata). */
const { getFeedStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');

const DS_CACHE_TTL_MS = 20_000;
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
    const beatmapId = parseInt(qs.beatmap_id, 10);
    if (!Number.isFinite(beatmapId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'beatmap_id is required' }) };
    }

    try {
        const store = getFeedStore();
        const feed = await loadFeed(store);
        const scores = feed.filter(r => r.beatmap_id === beatmapId).sort((a, b) => (b.pp || 0) - (a.pp || 0));

        const gradeCounts = {};
        const modCounts = {};
        let fcCount = 0;
        for (const s of scores) {
            gradeCounts[s.rank || '?'] = (gradeCounts[s.rank || '?'] || 0) + 1;
            const modKey = (s.mods || []).length ? s.mods.join('') : 'NM';
            modCounts[modKey] = (modCounts[modKey] || 0) + 1;
            if (s.is_fc) fcCount++;
        }

        const meta = scores[0] ? {
            beatmap_id: scores[0].beatmap_id,
            beatmapset_id: scores[0].beatmapset_id,
            artist: scores[0].artist,
            title: scores[0].title,
            version: scores[0].version,
            creator: scores[0].creator,
            difficulty_rating: scores[0].difficulty_rating,
            status: null,
        } : null;

        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=30' },
            body: JSON.stringify({
                beatmap_id: beatmapId,
                meta,
                scores,
                gradeCounts,
                modCounts,
                fcCount,
                sampleSize: scores.length,
                note: 'Aggregated only from scores this tracker has observed among tracked players — not exhaustive.',
            }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
