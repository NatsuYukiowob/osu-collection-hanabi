/* Resolves an arbitrary score id (pasted by a visitor on the new 回放 hub
   page, replays.html) into everything replay.html needs on its query
   string. Public, unauthenticated — `client_credentials` is enough since
   this only reads public score/beatmap metadata (the actual replay bytes
   still require the viewer's own login, same as ever, via
   replay-download.js).

   GET ?score_id=<id>. Tries the mode-scoped GET /api/v2/scores/fruits/{id}
   FIRST, falling back to the unscoped GET /api/v2/scores/{id} only on a
   404 — same two-tier order as replay-download.js's own /download variant
   of this same id-namespace problem. Real bug found wiring up the
   side-by-side compare picker's "pick from this beatmap's leaderboard"
   convenience list (beatmap-leaderboard.js's ids, sourced from GET
   /beatmaps/{id}/scores, are legacy-namespace): the unscoped route does
   NOT 404 on a legacy id from a DIFFERENT mode's own legacy sequence — it
   silently returns THAT unrelated score instead (confirmed live: beatmap
   1899627's own #1 fruits score id 223330834 resolved on the unscoped
   route to some unrelated 2014 std score with the same raw number). The
   existing `mode !== 'fruits'` check below already caught this safely
   (never shows a wrong replay), but it wrongly rejected every genuinely
   valid fruits score reached this way as "wrong_mode" — the mode-scoped
   route resolves the SAME id to the real fruits score instead. Single-
   namespace ids from the site's own crawlers (e.g. fixture
   score_id=6141982961) still resolve identically either way, so this
   changes nothing for the existing paste-a-link flow.

   Rejects anything that isn't ruleset "fruits" — this site only knows how
   to render catch replays, and pointing it at a std/mania/taiko score
   would silently produce garbage (wrong hit-object types, wrong catcher
   math) rather than a clear error. */
const { getOsuToken } = require('./_osu-auth');
const { MODE } = require('./_catch-constants');

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
                avatar_url: (s.user && s.user.avatar_url) || null,
                country_code: (s.user && (s.user.country_code || (s.user.country && s.user.country.code))) || null,
                rank: s.rank || null,
                mods: Array.isArray(s.mods) ? s.mods.map(m => (typeof m === 'string' ? m : m.acronym)) : [],
                has_replay: s.replay === true,
                // Added for the side-by-side compare picker's score header
                // (avatar/pp/accuracy/date strip) — every other existing
                // caller (replays.html's paste-a-score flow) only reads the
                // fields above, so these are purely additive.
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
