/* Proxy + cache for a beatmap's raw .osu file text (hit objects, timing
   points, difficulty settings) — needed client-side by the Watch Replay
   renderer (js/render-replay.js) to regenerate real catch hit objects via
   osu-catch-stable's BeatmapDecoder. Public, unauthenticated source
   (https://osu.ppy.sh/osu/{id}, the same URL the game client itself uses
   to fetch beatmap files) — this proxy exists to sidestep any client-side
   CORS uncertainty and to avoid re-fetching the same file on every replay
   view, not because the source needs auth.

   Cached indefinitely once fetched (key osu-file:{beatmap_id} in
   getMapsStore()) — a ranked beatmap's hit objects never change after
   ranking; a loved map's rarely do. Accepted simplification for v1: no
   checksum-based invalidation (the crawled maps:catch catalog doesn't
   capture checksums either). If a stale cached file ever becomes a real
   problem, add checksum invalidation then rather than pre-building it. */
const { getMapsStore } = require('./_blobs-store');

exports.handler = async (event) => {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const beatmapId = (event.queryStringParameters || {}).beatmap_id;
    if (!beatmapId || !/^\d+$/.test(beatmapId)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'beatmap_id is required' }) };
    }

    try {
        const store = getMapsStore();
        const cacheKey = `osu-file:${beatmapId}`;
        let content = await store.get(cacheKey, { type: 'text' });

        if (!content) {
            const res = await fetch(`https://osu.ppy.sh/osu/${beatmapId}`);
            if (!res.ok) {
                return { statusCode: res.status === 404 ? 404 : 502, headers: corsHeaders, body: JSON.stringify({ error: `osu! returned ${res.status}` }) };
            }
            content = await res.text();
            await store.set(cacheKey, content);
        }

        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=86400' },
            body: JSON.stringify({ content }),
        };
    } catch (err) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
};
