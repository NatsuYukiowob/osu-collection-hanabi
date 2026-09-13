/* Resolves an arbitrary score id (pasted by a visitor on the new 回放 hub
   page, replays.html) into everything replay.html needs on its query
   string. Public, unauthenticated — `client_credentials` is enough since
   this only reads public score/beatmap metadata (the actual replay bytes
   still require the viewer's own login, same as ever, via
   replay-download.js).

   GET ?score_id=<id>. Calls osu!'s newer unified GET /api/v2/scores/{id}
   (confirmed live this session — works with the same numeric id
   replay-download.js's GET /scores/{id}/download already uses, e.g. the
   catch-tracker fixture score_id=6141982961; note the response's OWN `id`
   field can come back as a different number (osu! has more than one score
   id namespace internally) — deliberately NOT used here, since only the
   INPUT id is confirmed to work with the /download route this site
   already relies on).

   Rejects anything that isn't ruleset "fruits" — this site only knows how
   to render catch replays, and pointing it at a std/mania/taiko score
   would silently produce garbage (wrong hit-object types, wrong catcher
   math) rather than a clear error. */
const { getOsuToken } = require('./_osu-auth');

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
        const res = await fetch(`https://osu.ppy.sh/api/v2/scores/${scoreId}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (res.status === 404) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'not_found' }) };
        }
        if (!res.ok) {
            return { statusCode: 502, headers, body: JSON.stringify({ error: `osu! returned ${res.status}` }) };
        }
        const s = await res.json();
        if (s.mode !== 'fruits') {
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
                rank: s.rank || null,
                mods: Array.isArray(s.mods) ? s.mods.map(m => (typeof m === 'string' ? m : m.acronym)) : [],
                has_replay: s.replay === true,
            }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
