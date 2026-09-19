/* Personal goal tracking — ported from catch-tracker's own goals.js
   (itself mania-tracker.com's 目標 page, scoped down to just its
   "個人 > 總PP" goal type for a first pass; the other 7 types — grade
   counts / play counts / rank / single-map clear / FC / accuracy / rank
   letter — need more per-type osu! API calls and are deliberately left
   for later rather than half-built now).

   Auth: reads are public-by-user-id (harmless, no sensitive data), writes
   require the signed token proving "this request really is that osu!
   user", minted at login (osu-callback.js / _auth-token.js). */
const { verifyAuthToken } = require('./_auth-token');
const { getOsuToken } = require('./_osu-auth');
const { getGoalsStore } = require('./_blobs-store');
const { MODE } = require('./_std-constants');

const MAX_GOALS_PER_USER = 20;
const goalsKey = (userId) => `goals:${userId}`;

async function loadGoals(store, userId) {
    const raw = await store.get(goalsKey(userId), { type: 'json' }).catch(() => null);
    return Array.isArray(raw) ? raw : [];
}

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const store = getGoalsStore();

    if (event.httpMethod === 'GET') {
        const userId = (event.queryStringParameters || {}).user_id;
        if (!userId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id is required' }) };
        }

        let goals = await loadGoals(store, userId);
        let currentPp = null;
        try {
            const token = await getOsuToken();
            const res = await fetch(`https://osu.ppy.sh/api/v2/users/${userId}/${MODE}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            if (res.ok) {
                const liveUser = await res.json();
                currentPp = (liveUser.statistics || {}).pp ?? null;
            }
        } catch { /* progress just comes back null below, goals still list */ }

        // Mark any goal the player's already reached — checked fresh
        // against the LIVE osu! API on every load rather than only at
        // creation time, so a goal set before a big pp gain (or one that
        // was already met the moment it was created) still flips to
        // achieved without the player needing to do anything else.
        if (currentPp != null) {
            let changed = false;
            goals = goals.map(g => {
                if (!g.achieved && g.type === 'total_pp' && currentPp >= g.target) {
                    changed = true;
                    return { ...g, achieved: true, achievedAt: new Date().toISOString() };
                }
                return g;
            });
            if (changed) await store.setJSON(goalsKey(userId), goals);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ goals, currentPp }),
        };
    }

    if (event.httpMethod === 'POST' || event.httpMethod === 'DELETE') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid JSON body' }) };
        }
        const { user_id } = body;
        if (!user_id) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id is required' }) };
        }

        const authHeader = event.headers['x-st-auth-token'] || event.headers['X-St-Auth-Token'];
        const identity = verifyAuthToken(authHeader);
        if (!identity || String(identity.id) !== String(user_id)) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'not authorized to edit this player’s goals' }) };
        }

        let goals = await loadGoals(store, user_id);

        if (event.httpMethod === 'POST') {
            const target = parseFloat(body.target);
            if (!Number.isFinite(target) || target <= 0 || target > 100000) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'target must be a positive pp value' }) };
            }
            if (goals.length >= MAX_GOALS_PER_USER) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'goal limit reached' }) };
            }
            goals.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'total_pp',
                target,
                achieved: false,
                achievedAt: null,
                createdAt: new Date().toISOString(),
            });
        } else {
            const { id } = body;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            goals = goals.filter(g => g.id !== id);
        }

        await store.setJSON(goalsKey(user_id), goals);
        return { statusCode: 200, headers, body: JSON.stringify({ goals }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
