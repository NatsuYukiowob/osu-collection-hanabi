/* Streams a score's raw .osr replay bytes to a logged-in visitor.
   GET ?score_id=<id>, Authorization: Bearer <signed identity token from
   _auth-token.js — see osu-callback.js>. Ported from catch-tracker's own
   replay-download.js.

   Checks getReplayCacheStore() first (a finished score's replay never
   changes, so caching it forever avoids re-hitting osu!'s download
   endpoint — and the requesting user's own rate limit — on every repeat
   view). On a cache miss, resolves the caller's own valid osu! bearer
   token via _user-auth.js.

   osu! has TWO non-overlapping score id namespaces — legacy (pre-lazer)
   and "solo score" (lazer-era) — with two different download routes
   (`/scores/{ruleset}/{id}/download` resolves a solo-score id,
   `/scores/{id}/download` resolves a legacy id). Every score this site's
   own crawlers surface today is a solo-score id, so the mode-scoped
   route is tried first, falling back to the legacy generic route only on
   a 404 — same order catch-tracker's own port of this fix uses. */
const { verifyAuthToken } = require('./_auth-token');
const { getValidUserAccessToken, UserAuthError } = require('./_user-auth');
const { getReplayCacheStore } = require('./_blobs-store');
const { MODE } = require('./_std-constants');

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
