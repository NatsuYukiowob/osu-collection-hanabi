/* Shared crawl logic for the std map catalog — every ranked + loved
   osu!standard beatmap, harvested for a lightweight browsable/searchable
   Maps page (see maps-list.js). Ported from catch-tracker's own
   _maps-crawl-core.js (itself modeled on the main site's
   _farm-crawl-core.js's discoverBatch()): no local PP computation — the
   /beatmapsets/search response already carries star rating, bpm, length,
   CS/AR/OD/HP directly, so this is metadata harvesting only.

   Sweeps MAP_STATUSES (['ranked', 'loved']) as separate passes — osu! API
   v2's /beatmapsets/search `s` param takes one status per request. State
   tracks which status is current and that status's own search cursor;
   when a status's cursor is exhausted, moves to the next status and wraps
   back to the first after a full lap (perpetual refresh — newly-ranked/
   loved maps get picked up automatically over time). */
const { getOsuToken } = require('./_osu-auth');
const { getMapsStore } = require('./_blobs-store');
const { setJSONGz, getJSONGz } = require('./_blob-json');
const { MODE_NUM, MAP_STATUSES } = require('./_std-constants');

const STATE_KEY = 'maps-crawl-state';
const DATASET_KEY = 'maps:global';

const WRITE_RESERVE_MS = 8000;

async function loadState(store) {
    const state = await store.get(STATE_KEY, { type: 'json' });
    return state || {
        statusIndex: 0,
        searchCursor: null,
        sweepCount: 0,
        countsByStatus: {},
        lastRunAt: null,
        lastOkAt: null,
        lastError: null,
        consecutiveWriteFails: 0,
    };
}

function toRecord(set, b, status) {
    return {
        beatmap_id: b.id,
        beatmapset_id: set.id,
        artist: set.artist,
        title: set.title,
        version: b.version,
        creator: set.creator,
        bpm: b.bpm ?? null,
        total_length: b.total_length ?? null,
        hit_length: b.hit_length ?? null,
        cs: b.cs, ar: b.ar, od: b.accuracy, hp: b.drain,
        difficulty_rating: b.difficulty_rating ?? null,
        play_count: b.playcount ?? null,
        favourite_count: set.favourite_count ?? null,
        status,
        ranked_date: set.ranked_date || null,
        updatedAt: new Date().toISOString(),
    };
}

async function runMapsCrawl(budgetMs) {
    const start = Date.now();
    const store = getMapsStore();
    const state = await loadState(store);
    const snapshot = JSON.parse(JSON.stringify(state));
    const dataset = (await getJSONGz(store, DATASET_KEY)) || [];
    const index = new Map(dataset.map((r, i) => [r.beatmap_id, i]));

    const writeReserve = Math.min(WRITE_RESERVE_MS, Math.floor(budgetMs * 0.4));
    const deadline = start + (budgetMs - writeReserve);

    let pagesFetched = 0, discovered = 0, error = null;
    try {
        const token = await getOsuToken();
        while (Date.now() < deadline) {
            const status = MAP_STATUSES[state.statusIndex % MAP_STATUSES.length];
            const params = new URLSearchParams({ s: status, m: String(MODE_NUM), sort: 'ranked_desc' });
            if (state.searchCursor) params.set('cursor_string', state.searchCursor);

            const res = await fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?${params}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            if (!res.ok) throw new Error(`beatmapsets/search failed: ${res.status}`);
            const data = await res.json();
            const sets = data.beatmapsets || [];
            pagesFetched++;

            for (const set of sets) {
                for (const b of (set.beatmaps || [])) {
                    if (b.mode_int !== MODE_NUM) continue;
                    const record = toRecord(set, b, status);
                    const idx = index.get(record.beatmap_id);
                    if (idx === undefined) {
                        dataset.push(record);
                        index.set(record.beatmap_id, dataset.length - 1);
                    } else {
                        dataset[idx] = record;
                    }
                    discovered++;
                }
            }

            state.searchCursor = data.cursor_string || null;
            if (!state.searchCursor || sets.length === 0) {
                state.countsByStatus[status] = dataset.filter(r => r.status === status).length;
                state.statusIndex = (state.statusIndex + 1) % MAP_STATUSES.length;
                state.searchCursor = null;
                if (state.statusIndex === 0) state.sweepCount = (state.sweepCount || 0) + 1;
            }
        }
    } catch (err) {
        error = err.message;
    }

    const now = new Date().toISOString();
    let writeOk = true;
    try {
        await setJSONGz(store, DATASET_KEY, dataset);
    } catch (err) {
        writeOk = false;
        error = `maps dataset write failed: ${err.message}`;
    }

    if (writeOk) {
        state.lastRunAt = now;
        state.lastOkAt = now;
        state.lastError = error;
        state.consecutiveWriteFails = 0;
        await store.setJSON(STATE_KEY, state);
    } else {
        await store.setJSON(STATE_KEY, {
            ...snapshot,
            lastRunAt: now,
            lastError: error,
            consecutiveWriteFails: (snapshot.consecutiveWriteFails || 0) + 1,
        });
    }

    return { pagesFetched, discovered, datasetSize: dataset.length, writeOk, error };
}

module.exports = { runMapsCrawl };
