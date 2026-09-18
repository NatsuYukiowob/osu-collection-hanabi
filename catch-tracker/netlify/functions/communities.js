/* Community-submitted Discord server directory — mania-tracker.com's own
   "Discord 服務器" tab (a crowd-sourced list anyone can add to, no
   moderation queue — confirmed live: their own listing includes some
   pretty inactive-looking servers), scoped to catch here. Simplified per
   request: no region/multi-tag filter grid, just a search box + free-text
   tags. Same signed-token write-auth pattern as goals.js/farm-helper-
   prefs.js — no new auth mechanism. */
const { verifyAuthToken } = require('./_auth-token');
const { getCommunitiesStore } = require('./_blobs-store');

const INDEX_KEY = 'index';
const MAX_PER_USER = 5;
const MAX_NAME_LEN = 60;
const MAX_DESC_LEN = 300;
const MAX_TAGS = 8;

async function loadIndex(store) {
    const raw = await store.get(INDEX_KEY, { type: 'json' }).catch(() => null);
    return Array.isArray(raw) ? raw : [];
}

function isDiscordInvite(url) {
    try {
        const u = new URL(url);
        return /(^|\.)discord\.(gg|com)$/.test(u.hostname) && /^\/(?:invite\/)?[\w-]+$/i.test(u.pathname);
    } catch {
        return false;
    }
}

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const store = getCommunitiesStore();

    if (event.httpMethod === 'GET') {
        const qs = event.queryStringParameters || {};
        const q = (qs.q || '').trim().toLowerCase().slice(0, 100);
        let items = await loadIndex(store);
        if (q) {
            items = items.filter(c =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.description || '').toLowerCase().includes(q) ||
                (c.tags || []).some(t => t.toLowerCase().includes(q))
            );
        }
        items = [...items].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        // No Cache-Control: this list is re-fetched right after the
        // viewer's own submit/remove (render-discord.js), and the browser
        // would otherwise serve its own cached copy of the pre-mutation
        // response for up to max-age seconds — confirmed live this
        // session (server-side state was correct immediately, the UI
        // just kept showing the stale cached list). skins-list.js has the
        // exact same submit-then-reload pattern and the same latent bug;
        // see its own fix, done alongside this one.
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ items, total: items.length }),
        };
    }

    if (event.httpMethod === 'POST' || event.httpMethod === 'DELETE') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid JSON body' }) };
        }

        const authHeader = event.headers['x-ct-auth-token'] || event.headers['X-CT-Auth-Token'];
        const identity = verifyAuthToken(authHeader);
        if (!identity) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'login required' }) };
        }

        let items = await loadIndex(store);

        if (event.httpMethod === 'DELETE') {
            const { id } = body;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const target = items.find(c => c.id === id);
            if (!target) return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found' }) };
            if (String(target.submittedById) !== String(identity.id)) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'not your listing' }) };
            }
            items = items.filter(c => c.id !== id);
            await store.setJSON(INDEX_KEY, items);
            return { statusCode: 200, headers, body: JSON.stringify({ items }) };
        }

        // POST: submit a new server.
        const name = (body.name || '').trim().slice(0, MAX_NAME_LEN);
        const inviteUrl = (body.inviteUrl || '').trim();
        const description = (body.description || '').trim().slice(0, MAX_DESC_LEN);
        const iconUrl = (body.iconUrl || '').trim().slice(0, 500);
        const tags = Array.isArray(body.tags)
            ? body.tags.map(t => String(t).trim().slice(0, 24)).filter(Boolean).slice(0, MAX_TAGS)
            : [];

        if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'name is required' }) };
        if (!isDiscordInvite(inviteUrl)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'inviteUrl must be a discord.gg or discord.com/invite link' }) };
        }
        if (iconUrl && !/^https:\/\//i.test(iconUrl)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'iconUrl must be an https URL' }) };
        }
        const mine = items.filter(c => String(c.submittedById) === String(identity.id));
        if (mine.length >= MAX_PER_USER) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'submission limit reached' }) };
        }

        const entry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name, inviteUrl, description, tags, iconUrl: iconUrl || null,
            submittedById: identity.id,
            submittedByName: identity.username || '',
            createdAt: new Date().toISOString(),
        };
        items.push(entry);
        await store.setJSON(INDEX_KEY, items);
        return { statusCode: 200, headers, body: JSON.stringify({ items }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
