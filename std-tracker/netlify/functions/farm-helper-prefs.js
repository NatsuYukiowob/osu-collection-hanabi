/* Per-user farm-helper feedback (太難了/太簡單 — see render-farm-helper.js's
   detail panel). Reads are public (this is personalization data, not
   sensitive, and farm-helper.js itself needs to read another user's prefs
   to filter their recommendations for anyone viewing them). Writes require
   the signed login token minted by osu-callback.js (_auth-token.js) so
   only the account the recommendations are "for" can tune them — same
   identity-proof pattern already used by goals.js. */
const { verifyAuthToken } = require('./_auth-token');
const { getFarmHelperStore } = require('./_blobs-store');

const prefsKey = (userId) => `prefs:${userId}`;

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const store = getFarmHelperStore();

    if (event.httpMethod === 'GET') {
        const userId = (event.queryStringParameters || {}).user_id;
        if (!userId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id is required' }) };
        }
        const raw = await store.get(prefsKey(userId), { type: 'json' }).catch(() => null);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                hidden: raw && Array.isArray(raw.hidden) ? raw.hidden : [],
                easy: raw && Array.isArray(raw.easy) ? raw.easy : [],
            }),
        };
    }

    if (event.httpMethod === 'POST') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid JSON body' }) };
        }
        const { user_id, beatmap_id, action } = body;
        if (!user_id || !beatmap_id || !['hide', 'easy', 'clear'].includes(action)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id, beatmap_id, and a valid action are required' }) };
        }

        const authHeader = event.headers['x-st-auth-token'] || event.headers['X-St-Auth-Token'];
        const identity = verifyAuthToken(authHeader);
        if (!identity || String(identity.id) !== String(user_id)) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'not authorized to edit this player’s preferences' }) };
        }

        const key = prefsKey(user_id);
        const raw = await store.get(key, { type: 'json' }).catch(() => null);
        const hidden = new Set(raw && Array.isArray(raw.hidden) ? raw.hidden.map(String) : []);
        const easy = new Set(raw && Array.isArray(raw.easy) ? raw.easy.map(String) : []);
        const beatmapIdStr = String(beatmap_id);

        hidden.delete(beatmapIdStr);
        easy.delete(beatmapIdStr);
        if (action === 'hide') hidden.add(beatmapIdStr);
        else if (action === 'easy') easy.add(beatmapIdStr);
        // action === 'clear' just leaves the map removed from both sets.

        const next = { hidden: [...hidden], easy: [...easy], updatedAt: new Date().toISOString() };
        await store.setJSON(key, next);

        return { statusCode: 200, headers, body: JSON.stringify(next) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
