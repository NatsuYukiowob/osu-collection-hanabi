/* Public, filtered/paginated view over the catch map catalog (maps:catch,
   written by maps-crawl-cron.js / maps-crawl-run.js — see
   _maps-crawl-core.js). Same pure read-only GET + TTL cache + honest
   coverage-block shape as this site's other *-list.js endpoints.

   The crawled dataset has one record per DIFFICULTY. Grouped here into one
   item per beatmapSET (each carrying a `diffs` array, ascending by star)
   so a 6-diff map shows as one catalog card instead of 6 — matching how
   the main site's own catalog/beatmap listings treat a set as the unit,
   not a single difficulty. Filtering/sorting/pagination all operate on
   the grouped sets, not the raw per-diff rows, so a set never gets split
   across a page boundary. */
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
                // Set-level (same across every diff of a set, unlike
                // play_count which is captured per-diff and summed below),
                // so just take it from whichever record creates this
                // set's entry — no need to touch it again per diff.
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
        // Sum across diffs, matching the osu! API's own Beatmapset.play_count
        // (the aggregate across all of a set's difficulties) — captured
        // per-DIFFICULTY in _maps-crawl-core.js instead of duplicating the
        // set-level total on every record, so a future per-diff play-count
        // display has the data too. null (not 0) for a set where the
        // crawler hasn't backfilled play_count on any diff yet, so the
        // frontend can tell "not counted" apart from "genuinely zero".
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
    const maps = (await getJSONGz(store, 'maps:catch')) || [];
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
    playcount_desc: (a, b) => (b.play_count || 0) - (a.play_count || 0),
    favourites_desc: (a, b) => (b.favourite_count || 0) - (a.favourite_count || 0),
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

    const num = (v) => (v !== undefined && v !== '' && Number.isFinite(parseFloat(v)) ? parseFloat(v) : null);
    const starMin = num(qs.starMin), starMax = num(qs.starMax);
    const bpmMin = num(qs.bpmMin), bpmMax = num(qs.bpmMax);
    const lengthMin = num(qs.lengthMin), lengthMax = num(qs.lengthMax);

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
        // A set matches a star range if ANY of its difficulties fall in
        // it — a 1★-9★ set shouldn't disappear just because starMax=5.
        if (starMin !== null) items = items.filter(r => (r.star_max ?? 0) >= starMin);
        if (starMax !== null) items = items.filter(r => (r.star_min ?? 0) <= starMax);
        if (bpmMin !== null) items = items.filter(r => (r.bpm || 0) >= bpmMin);
        if (bpmMax !== null) items = items.filter(r => (r.bpm || 0) <= bpmMax);
        if (lengthMin !== null) items = items.filter(r => (r.total_length || 0) >= lengthMin);
        if (lengthMax !== null) items = items.filter(r => (r.total_length || 0) <= lengthMax);

        // Random-pick mode ("隨機" button): honours every filter above but
        // ignores sort/pagination — ties the pick to the SAME filtered
        // pool the viewer is currently looking at, not the whole catalog,
        // matching what "隨機" implies when a search/status/star filter is
        // already active.
        if (qs.random === '1') {
            const pick = items.length ? items[Math.floor(Math.random() * items.length)] : null;
            return {
                statusCode: 200,
                headers: { ...headers, 'Cache-Control': 'no-store' },
                body: JSON.stringify({ item: pick }),
            };
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
