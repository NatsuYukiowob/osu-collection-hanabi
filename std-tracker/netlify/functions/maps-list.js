/* Public, filtered/paginated view over the std map catalog (maps:global,
   written by maps-crawl-cron.js / maps-crawl-run.js — see
   _maps-crawl-core.js). Ported from catch-tracker's own maps-list.js: pure
   read-only GET + TTL cache + honest coverage-block shape.

   The crawled dataset has one record per DIFFICULTY. Grouped here into one
   item per beatmapSET (each carrying a `diffs` array, ascending by star)
   so a multi-diff map shows as one catalog card instead of one per diff.
   Filtering/sorting/pagination all operate on the grouped sets. */
const { getMapsStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');

const PAGE_SIZE = 24;
const DS_CACHE_TTL_MS = 60_000;
let _dsCache = { at: 0, maps: null, sets: null };

function groupIntoSets(maps) {
    const bySet = new Map();
    for (const r of maps) {
        let set = bySet.get(r.beatmapset_id);
        if (!set) {
            set = {
                beatmapset_id: r.beatmapset_id,
                artist: r.artist,
                title: r.title,
                creator: r.creator,
                status: r.status,
                ranked_date: r.ranked_date,
                bpm: r.bpm,
                total_length: r.total_length,
                favourite_count: r.favourite_count,
                diffs: [],
            };
            bySet.set(r.beatmapset_id, set);
        }
        set.diffs.push({
            beatmap_id: r.beatmap_id,
            version: r.version,
            difficulty_rating: r.difficulty_rating,
            play_count: r.play_count,
            cs: r.cs, ar: r.ar, od: r.od, hp: r.hp,
        });
    }
    const sets = [...bySet.values()];
    for (const set of sets) {
        set.diffs.sort((a, b) => (a.difficulty_rating || 0) - (b.difficulty_rating || 0));
        set.star_min = set.diffs.length ? set.diffs[0].difficulty_rating : null;
        set.star_max = set.diffs.length ? set.diffs[set.diffs.length - 1].difficulty_rating : null;
        set.play_count = set.diffs.some(d => d.play_count != null)
            ? set.diffs.reduce((sum, d) => sum + (d.play_count || 0), 0)
            : null;
        // Representative id for "click the card body" — the middle
        // difficulty reads as more typical of the set than the hardest.
        set.primary_beatmap_id = set.diffs[Math.floor((set.diffs.length - 1) / 2)]?.beatmap_id ?? null;
    }
    return sets;
}

async function loadSets(store) {
    const now = Date.now();
    if (_dsCache.sets && now - _dsCache.at < DS_CACHE_TTL_MS) return _dsCache;
    const maps = (await getJSONGz(store, 'maps:global')) || [];
    const sets = groupIntoSets(maps);
    _dsCache = { at: now, maps, sets };
    return _dsCache;
}

const SORTERS = {
    star_desc: (a, b) => (b.star_max || 0) - (a.star_max || 0),
    star_asc: (a, b) => (a.star_min || 0) - (b.star_min || 0),
    bpm_desc: (a, b) => (b.bpm || 0) - (a.bpm || 0),
    length_desc: (a, b) => (b.total_length || 0) - (a.total_length || 0),
    newest: (a, b) => new Date(b.ranked_date || 0) - new Date(a.ranked_date || 0),
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
    const status = qs.status === 'ranked' || qs.status === 'loved' ? qs.status : null;
    const page = Math.max(0, parseInt(qs.page, 10) || 0);
    const pageSize = Math.max(1, Math.min(60, parseInt(qs.limit, 10) || PAGE_SIZE));
    const sortKey = SORTERS[qs.sort] ? qs.sort : 'star_desc';

    try {
        const store = getMapsStore();
        const { maps, sets } = await loadSets(store);

        let items = sets;
        if (status) items = items.filter(r => r.status === status);
        if (q) {
            items = items.filter(r =>
                (r.title || '').toLowerCase().includes(q) ||
                (r.artist || '').toLowerCase().includes(q) ||
                (r.creator || '').toLowerCase().includes(q)
            );
        }

        items = [...items].sort(SORTERS[sortKey]);
        const total = items.length;
        const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);

        const state = (await store.get('maps-crawl-state', { type: 'json' })) || {};
        const coverage = {
            datasetSize: maps.length,
            setCount: sets.length,
            countsByStatus: state.countsByStatus || {},
            sweepCount: state.sweepCount || 0,
            lastRunAt: state.lastRunAt || null,
            lastOkAt: state.lastOkAt || null,
            lastError: state.lastError || null,
        };

        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=120' },
            body: JSON.stringify({ items: pageItems, total, page, pageSize, coverage }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
