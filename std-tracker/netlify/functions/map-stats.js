/* Per-map stats: aggregates grade/mod counts + FC rate for one beatmap,
   derived on-demand from feed:recent filtered to that beatmap_id — no
   dedicated crawled dataset. This is explicitly NOT exhaustive (only scores
   this tracker has actually observed from the tracked player pool).

   Falls back to the maps:global catalog (_maps-crawl-core.js) for basic
   meta when no scores have been observed yet — the Maps catalog page links
   here for every ranked/loved map, most of which won't have any
   tracked-player scores yet, and showing nothing at all would be a dead
   end for that flow. Ported from catch-tracker's own map-stats.js, now
   that this site's own Maps catalog crawler exists too. */
const { getFeedStore, getMapsStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');

const DS_CACHE_TTL_MS = 20_000;
let _dsCache = { at: 0, feed: null };
let _mapsCache = { at: 0, maps: null };

async function loadFeed(store) {
    const now = Date.now();
    if (_dsCache.feed && now - _dsCache.at < DS_CACHE_TTL_MS) return _dsCache.feed;
    const feed = (await getJSONGz(store, 'feed:recent')) || [];
    _dsCache = { at: now, feed };
    return feed;
}

async function loadMaps() {
    const now = Date.now();
    if (_mapsCache.maps && now - _mapsCache.at < DS_CACHE_TTL_MS) return _mapsCache.maps;
    const maps = (await getJSONGz(getMapsStore(), 'maps:global')) || [];
    _mapsCache = { at: now, maps };
    return maps;
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

        let meta = scores[0] ? {
            beatmap_id: scores[0].beatmap_id,
            beatmapset_id: scores[0].beatmapset_id,
            artist: scores[0].artist,
            title: scores[0].title,
            version: scores[0].version,
            creator: scores[0].creator,
            difficulty_rating: scores[0].difficulty_rating,
        } : null;

        // The catalog is also the only source for ranked/loved status —
        // feed records (from observed scores) don't carry it — so look it
        // up regardless of whether `meta` already came from a score.
        const maps = await loadMaps();
        const cataloged = maps.find(m => m.beatmap_id === beatmapId);

        if (!meta && cataloged) {
            meta = {
                beatmap_id: cataloged.beatmap_id,
                beatmapset_id: cataloged.beatmapset_id,
                artist: cataloged.artist,
                title: cataloged.title,
                version: cataloged.version,
                creator: cataloged.creator,
                difficulty_rating: cataloged.difficulty_rating,
            };
        }
        if (meta) meta.status = cataloged ? cataloged.status : null;

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
