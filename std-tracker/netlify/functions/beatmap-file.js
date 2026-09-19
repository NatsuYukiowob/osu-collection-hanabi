/* Proxy + cache for a beatmap's raw .osu file text (hit objects, timing
   points, difficulty settings) — needed client-side by the Watch Replay
   renderer (js/render-replay.js) to regenerate real standard hit objects
   via osu-standard-stable's BeatmapDecoder. Ported from catch-tracker's
   own beatmap-file.js — fully mode-agnostic, no changes needed beyond the
   store name.

   Public, unauthenticated source (https://osu.ppy.sh/osu/{id}, the same
   URL the game client itself uses to fetch beatmap files) — this proxy
   exists to sidestep any client-side CORS uncertainty and to avoid
   re-fetching the same file on every replay view, not because the source
   needs auth.

   Cached indefinitely once fetched (key osu-file:{beatmap_id} in
   getMapsStore()) — a ranked beatmap's hit objects never change after
   ranking; a loved map's rarely do. */
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
