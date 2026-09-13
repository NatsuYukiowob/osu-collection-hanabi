/* Streams a score's raw .osr replay bytes to a logged-in visitor.
   GET ?score_id=<id>, Authorization: Bearer <signed identity token from
   _auth-token.js — see osu-replay-callback.js>.

   Checks getReplayCacheStore() first (a finished score's replay never
   changes, so caching it forever avoids re-hitting osu!'s download
   endpoint — and the requesting user's own rate limit — on every repeat
   view). On a cache miss, resolves the caller's own valid osu! bearer
   token via _user-auth.js (general-login primitive restored after this
   feature's first removal — see that file's own header comment).

   Real, confirmed-live bug this session: osu! has TWO non-overlapping score
   id namespaces — legacy (pre-lazer, the `scores` table) and "solo score"
   (lazer-era, the `solo_scores` table, a completely separate id sequence).
   `GET /api/v2/scores/{id}/download` only resolves a LEGACY id; a solo-score
   id 404s there. `GET /api/v2/scores/{ruleset}/{id}/download` is the
   reverse — resolves a solo-score id, 404s on a legacy one. Every score
   this site's own crawlers/API calls surface today (`/users/{id}/scores/
   best`, `/scores/recent`, `GET /scores/{id}`) returns a solo-score id, so
   the mode-scoped route is tried FIRST (covers virtually everything now),
   falling back to the legacy generic route only if that 404s (keeps any
   older legacy id — e.g. a score cached from before osu!'s lazer
   transition — working too). Before this fix, every non-legacy score's
   "看回放" link 404'd regardless of whether a real replay existed.

   Unverified assumption (flagged in the implementation plan): whether
   osu! allows downloading ANY visible score's replay once logged in (like
   the website's own "Download replay" button) or only the score owner's.
   If osu! rejects a non-owner request, that surfaces as a 403 here and the
   frontend shows replay_owner_only rather than a generic error — nothing
   else about this design changes either way. */
const { verifyAuthToken } = require('./_auth-token');
const { getValidUserAccessToken, UserAuthError } = require('./_user-auth');
const { getReplayCacheStore } = require('./_blobs-store');
const { MODE } = require('./_catch-constants');

exports.handler = async (event) => {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
    const scoreId = (event.queryStringParameters || {}).score_id;
    if (!scoreId || !/^\d+$/.test(scoreId)) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'score_id is required' }) };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const identity = verifyAuthToken(bearerToken);
    if (!identity) {
        return { statusCode: 401, headers: jsonHeaders, body: JSON.stringify({ error: 'not_logged_in' }) };
    }

    try {
        const cacheStore = getReplayCacheStore();
        const cacheKey = `replay:${scoreId}`;
        let bytes = await cacheStore.get(cacheKey, { type: 'arrayBuffer' });

        if (!bytes) {
            let accessToken;
            try {
                accessToken = await getValidUserAccessToken(identity.id);
            } catch (err) {
                if (err instanceof UserAuthError) {
                    return { statusCode: 401, headers: jsonHeaders, body: JSON.stringify({ error: err.code }) };
                }
                throw err;
            }

            let res = await fetch(`https://osu.ppy.sh/api/v2/scores/${MODE}/${scoreId}/download`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (res.status === 404) {
                res = await fetch(`https://osu.ppy.sh/api/v2/scores/${scoreId}/download`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
            }
            if (res.status === 403 || res.status === 401) {
                return { statusCode: 403, headers: jsonHeaders, body: JSON.stringify({ error: 'owner_only' }) };
            }
            if (res.status === 404) {
                return { statusCode: 404, headers: jsonHeaders, body: JSON.stringify({ error: 'not_found' }) };
            }
            if (!res.ok) {
                return { statusCode: 502, headers: jsonHeaders, body: JSON.stringify({ error: `osu! returned ${res.status}` }) };
            }
            bytes = await res.arrayBuffer();
            await cacheStore.set(cacheKey, bytes);
        }

        return {
            statusCode: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${scoreId}.osr"`,
                'Cache-Control': 'private, max-age=86400',
            },
            body: Buffer.from(bytes).toString('base64'),
            isBase64Encoded: true,
        };
    } catch (err) {
        return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: err.message }) };
    }
};
