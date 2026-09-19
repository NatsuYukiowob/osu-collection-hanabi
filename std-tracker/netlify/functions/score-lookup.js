/* Resolves an arbitrary score id into everything replay.html needs on its
   query string. Public, unauthenticated — `client_credentials` is enough
   since this only reads public score/beatmap metadata (the actual replay
   bytes still require the viewer's own login, via replay-download.js).
   Ported from catch-tracker's own score-lookup.js.

   Tries the mode-scoped GET /api/v2/scores/osu/{id} FIRST, falling back
   to the unscoped GET /api/v2/scores/{id} only on a 404 — same two-tier
   order as replay-download.js's own /download variant of osu!'s legacy/
   solo-score id-namespace split.

   Rejects anything that isn't ruleset "osu" — this site only knows how to
   render standard replays, and pointing it at a catch/mania/taiko score
   would silently produce garbage (wrong hit-object types, wrong judgement
   math) rather than a clear error. */
const { getOsuToken } = require('./_osu-auth');
const { MODE } = require('./_std-constants');

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const scoreId = (event.queryStringParameters || {}).score_id;
    if (!scoreId || !/^\d+$/.test(scoreId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'score_id is required' }) };
    }

    try {
        const token = await getOsuToken();
        const authHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
        let res = await fetch(`https://osu.ppy.sh/api/v2/scores/${MODE}/${scoreId}`, { headers: authHeaders });
        if (res.status === 404) {
            res = await fetch(`https://osu.ppy.sh/api/v2/scores/${scoreId}`, { headers: authHeaders });
        }
        if (res.status === 404) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'not_found' }) };
        }
        if (!res.ok) {
            return { statusCode: 502, headers, body: JSON.stringify({ error: `osu! returned ${res.status}` }) };
        }
        const s = await res.json();
        if (s.mode !== 'osu') {
            return { statusCode: 422, headers, body: JSON.stringify({ error: 'wrong_mode', mode: s.mode }) };
        }

        const bm = s.beatmap || {};
        const bms = s.beatmapset || {};
        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=300' },
            body: JSON.stringify({
                score_id: scoreId,
                beatmap_id: bm.id ?? null,
                beatmapset_id: bm.beatmapset_id ?? bms.id ?? null,
                artist: bms.artist || null,
                title: bms.title || null,
                version: bm.version || null,
                user_id: s.user_id ?? (s.user && s.user.id) ?? null,
                username: (s.user && s.user.username) || null,
                avatar_url: (s.user && s.user.avatar_url) || null,
                country_code: (s.user && (s.user.country_code || (s.user.country && s.user.country.code))) || null,
                rank: s.rank || null,
                mods: Array.isArray(s.mods) ? s.mods.map(m => (typeof m === 'string' ? m : m.acronym)) : [],
                has_replay: s.replay === true,
                pp: s.pp ?? null,
                accuracy: s.accuracy ?? null,
                max_combo: s.max_combo ?? null,
                created_at: s.ended_at || s.created_at || null,
            }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
