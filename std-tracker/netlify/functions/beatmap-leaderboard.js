/* A beatmap's real global top scores (osu!standard) — for the Watch Replay
   page's leaderboard panel. Ported from catch-tracker's own
   beatmap-leaderboard.js: the map's other leaderboard scores, with the
   score currently being watched highlighted and live-updating from the
   client's own simulated stats. No real-time backend needed, just the
   map's leaderboard.

   GET /beatmaps/{beatmap}/scores is a standard public osu! API v2
   endpoint, works fine with the site's existing client_credentials token
   (_osu-auth.js). Short in-module TTL cache since a beatmap's top scores
   rarely change within a few minutes. */
const { getOsuToken } = require('./_osu-auth');
const { MODE } = require('./_std-constants');

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // beatmapId -> { at, data }

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

    const cached = cache.get(beatmapId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=30' }, body: JSON.stringify(cached.data) };
    }

    try {
        const token = await getOsuToken();
        const res = await fetch(`https://osu.ppy.sh/api/v2/beatmaps/${beatmapId}/scores?${new URLSearchParams({ mode: MODE })}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) {
            return { statusCode: res.status === 404 ? 404 : 502, headers, body: JSON.stringify({ error: `osu! returned ${res.status}` }) };
        }
        const raw = await res.json();
        // GET /beatmaps/{beatmap}/scores does NOT reliably come back sorted
        // by score (confirmed live on catch-tracker's own port of this
        // file) — re-sort by score ourselves to match osu!'s own beatmap
        // page's real leaderboard order.
        const sortedScores = [...(raw.scores || [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const scores = sortedScores.slice(0, 50).map(s => ({
            score_id: s.id,
            user_id: s.user_id,
            username: (s.user && s.user.username) || null,
            avatar_url: (s.user && s.user.avatar_url) || (s.user_id ? `https://a.ppy.sh/${s.user_id}` : null),
            total_score: s.total_score ?? s.legacy_total_score ?? s.score ?? 0,
            max_combo: s.max_combo ?? 0,
            accuracy: s.accuracy ?? null,
            rank: s.rank || null,
            mods: Array.isArray(s.mods) ? s.mods.map(m => (typeof m === 'string' ? m : m.acronym)) : [],
        }));

        const data = { beatmap_id: beatmapId, scores };
        cache.set(beatmapId, { at: Date.now(), data });
        return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=30' }, body: JSON.stringify(data) };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
