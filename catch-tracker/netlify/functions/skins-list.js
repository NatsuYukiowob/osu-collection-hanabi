/* Public, paginated, searchable listing of the community skin catalog —
   metadata only, no file bytes (see skins-download.js / skins-image.js).
   No auth: unlike the main site's private skins-list.js (your own backed-
   up skins only), this catalog is public by design. */
const { getSkinsStore } = require('./_blobs-store');

const PAGE_SIZE = 20;
const SORTERS = {
    newest: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
    downloads: (a, b) => (b.downloadCount || 0) - (a.downloadCount || 0),
    size: (a, b) => (b.fileSize || 0) - (a.fileSize || 0),
};

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const qs = event.queryStringParameters || {};
    const q = (qs.q || '').trim().toLowerCase().slice(0, 100);
    const uploader = (qs.uploader || '').trim().toLowerCase().slice(0, 100);
    const previewOnly = qs.hasPreview === '1';
    const page = Math.max(0, parseInt(qs.page, 10) || 0);
    const pageSize = Math.max(1, Math.min(60, parseInt(qs.limit, 10) || PAGE_SIZE));
    const sortKey = SORTERS[qs.sort] ? qs.sort : 'newest';

    try {
        const store = getSkinsStore();
        const index = (await store.get('index', { type: 'json' })) || [];

        let items = index;
        if (q) {
            items = items.filter(r =>
                (r.name || '').toLowerCase().includes(q) ||
                (r.uploaderName || '').toLowerCase().includes(q)
            );
        }
        if (uploader) {
            items = items.filter(r => (r.uploaderName || '').toLowerCase() === uploader);
        }
        if (previewOnly) items = items.filter(r => r.hasPreview);
        items = [...items].sort(SORTERS[sortKey]);

        const total = items.length;
        const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);

        // No Cache-Control: render-skins.js reloads this list right after
        // a successful upload, and a cached response here made the
        // viewer's own new skin invisible to them until the cache expired
        // — a real, pre-existing bug caught while fixing the identical
        // pattern in communities.js (see that file's own note).
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ items: pageItems, total, page, pageSize }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
