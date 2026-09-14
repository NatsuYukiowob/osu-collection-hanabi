/* Public, filtered/sorted/paginated listing over the precomputed ranked-
   catalog metadata index — modeled on farm-maps-list.js. No auth: a
   read-only view over a server-built index. The dataset (built by
   catalog-crawl-cron.js, see _catalog-crawl-core.js) is necessarily
   partial/growing rather than a complete ranked snapshot, so the response
   carries a `coverage` block for the frontend to say so honestly.

   `limit` (<=300) switches to a lean mode: no pagination, no facets, items
   are bare { id } — used by the "build a collection from this facet" action
   on the frontend. */
const { getCatalogStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');

const PAGE_SIZE = 20;
const MAX_LIMIT = 300;

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const qs = event.queryStringParameters || {};
    const page = Math.max(0, parseInt(qs.page, 10) || 0);
    // Optional page-size override from the frontend (the grid shows a fixed
    // 3xN, so the client picks how many rows). Clamped; falls back to the
    // default. Ignored on the `limit` lean path below.
    const pageSize = qs.pageSize ? Math.min(50, Math.max(1, parseInt(qs.pageSize, 10) || 0)) : PAGE_SIZE;
    const q = (qs.q || '').trim().toLowerCase().slice(0, 100);
    const artist = (qs.artist || '').trim();
    const language = (qs.language || '').trim();      // '' | 'unknown' | '<id>'
    const genre = (qs.genre || '').trim();            // '' | 'unknown' | '<id>'
    const source = (qs.source || '').trim();          // '' | 'none' | '<source>'
    // Star-rating range — an overlap test against the set's own star_min/
    // star_max (any difficulty of the set falling in range is a match), not
    // an exact containment test. starMax absent/blank means "no upper bound".
    const starMin = qs.starMin !== undefined && qs.starMin !== '' ? parseFloat(qs.starMin) : null;
    const starMax = qs.starMax !== undefined && qs.starMax !== '' ? parseFloat(qs.starMax) : null;
    const modeRaw = parseInt(qs.mode, 10);
    const mode = (modeRaw === 0 || modeRaw === 1 || modeRaw === 2 || modeRaw === 3) ? modeRaw : null;
    const includeNsfw = qs.includeNsfw === '1';
    const limit = qs.limit ? Math.min(MAX_LIMIT, Math.max(1, parseInt(qs.limit, 10) || 0)) : 0;

    const [sortField, sortDir] = (qs.sort || 'ranked_desc').split('_');
    const SORT = {
        ranked: r => r.ranked_date || '',
        title: r => (r.title_unicode || r.title || '').toLowerCase(),
        artist: r => (r.primary_artist || r.artist || '').toLowerCase(),
        new: r => r.firstSeenAt || 0,
    };
    const sortKey = SORT[sortField] ? sortField : 'ranked';
    const sortMul = sortDir === 'asc' ? 1 : -1;

    try {
        const store = getCatalogStore();
        const dataset = (await getJSONGz(store, 'catalog:all')) || [];
        const state = (await store.get('catalog-state', { type: 'json' })) || {};

        // Context filter (mode + nsfw): facet counts are computed against
        // this so switching between facets shows meaningful numbers, but not
        // against the facet selections themselves.
        let ctx = dataset;
        if (!includeNsfw) ctx = ctx.filter(r => !r.nsfw);
        if (mode !== null) ctx = ctx.filter(r => Array.isArray(r.modes) && r.modes.includes(mode));

        let items = ctx;
        if (language) {
            items = language === 'unknown'
                ? items.filter(r => r.language_id == null)
                : items.filter(r => r.language_id === Number(language));
        }
        if (genre) {
            items = genre === 'unknown'
                ? items.filter(r => r.genre_id == null)
                : items.filter(r => r.genre_id === Number(genre));
        }
        if (source) {
            items = source === 'none'
                ? items.filter(r => !r.source)
                : items.filter(r => (r.source || '').toLowerCase() === source.toLowerCase());
        }
        if (artist) {
            items = items.filter(r => Array.isArray(r.artist_keys) && r.artist_keys.includes(artist));
        }
        if (Number.isFinite(starMin) || Number.isFinite(starMax)) {
            items = items.filter(r => {
                if (r.star_min == null || r.star_max == null) return false;
                if (Number.isFinite(starMin) && r.star_max < starMin) return false;
                if (Number.isFinite(starMax) && r.star_min > starMax) return false;
                return true;
            });
        }
        if (q) {
            items = items.filter(r =>
                (r.artist || '').toLowerCase().includes(q) ||
                (r.artist_unicode || '').toLowerCase().includes(q) ||
                (r.title || '').toLowerCase().includes(q) ||
                (r.title_unicode || '').toLowerCase().includes(q) ||
                (r.creator || '').toLowerCase().includes(q) ||
                (r.source || '').toLowerCase().includes(q)
            );
        }

        items.sort((a, b) => {
            const va = SORT[sortKey](a), vb = SORT[sortKey](b);
            if (va < vb) return -1 * sortMul;
            if (va > vb) return 1 * sortMul;
            return (a.id || 0) - (b.id || 0);
        });

        const total = items.length;

        if (limit) {
            return {
                statusCode: 200,
                headers: { ...headers, 'Cache-Control': 'public, max-age=120' },
                body: JSON.stringify({ items: items.slice(0, limit).map(r => ({ id: r.id })), total }),
            };
        }

        // Facets over the context set (pre facet-selection).
        const langCounts = new Map();
        const genreCounts = new Map();
        const artistCounts = new Map();
        const sourceCounts = new Map();
        let noSourceCount = 0;
        for (const r of ctx) {
            const lk = r.language_id == null ? 'unknown' : r.language_id;
            langCounts.set(lk, (langCounts.get(lk) || 0) + 1);
            const gk = r.genre_id == null ? 'unknown' : r.genre_id;
            genreCounts.set(gk, (genreCounts.get(gk) || 0) + 1);
            if (r.source) sourceCounts.set(r.source, (sourceCounts.get(r.source) || 0) + 1);
            else noSourceCount++;
            if (Array.isArray(r.artist_keys)) {
                for (const k of r.artist_keys) artistCounts.set(k, (artistCounts.get(k) || 0) + 1);
            }
        }
        // Every name carrying >30 maps (rarer ones fold into "all"/"none"),
        // sorted alphabetically for display — no top-N cap, the frontend is a
        // searchable combobox rather than a plain <select> so a long list is
        // fine. 'ja' locale collation orders kana by あいうえお reading order
        // while still sorting Latin names A-Z.
        const topBy = (map, keyName) => [...map.entries()]
            .filter(([, c]) => c > 30)
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ja'))
            .map(([k, c]) => ({ [keyName]: k, count: c }));

        const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);

        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=300' },
            body: JSON.stringify({
                items: pageItems,
                total,
                page,
                pageSize,
                facets: {
                    languages: [...langCounts.entries()]
                        .sort((a, b) => (a[0] === 'unknown' ? 1e9 : a[0]) - (b[0] === 'unknown' ? 1e9 : b[0]))
                        .map(([id, count]) => ({ id, count })),
                    genres: [...genreCounts.entries()]
                        .sort((a, b) => (a[0] === 'unknown' ? 1e9 : a[0]) - (b[0] === 'unknown' ? 1e9 : b[0]))
                        .map(([id, count]) => ({ id, count })),
                    topArtists: topBy(artistCounts, 'key'),
                    topSources: topBy(sourceCounts, 'name'),
                    noSourceCount,
                },
                coverage: {
                    datasetSize: dataset.length,
                    discoveredCount: state.discoveredCount || 0,
                    sweepCount: state.sweepCount || 0,
                    lastRunAt: state.lastRunAt || null,
                    lastOkAt: state.lastOkAt || null,
                    lastError: state.lastError || null,
                    consecutiveWriteFails: state.consecutiveWriteFails || 0,
                },
            }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
