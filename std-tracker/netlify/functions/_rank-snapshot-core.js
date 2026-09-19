/* Daily rank-history snapshot, powering the player page's rank-delta
   arrows (▲/▼ next to the global/country/pp badges). Ported from
   catch-tracker's own _rank-snapshot-core.js. Unlike the other crawlers
   here this makes NO osu! API calls of its own — it just reads the
   already-fresh `rankings:global` dataset (kept current by
   _rankings-crawl-core.js's hourly sweep) and writes today's
   {global_rank, country_rank, pp} for every tracked player into a single
   compact per-day blob. player-get.js/rankings-list.js later read the
   OLDEST snapshot still within RETENTION_DAYS and diff it against current
   live numbers.

   One snapshot per calendar day (UTC) — re-running the same day is a
   no-op, so the cron can fire more than once without corrupting anything.
   Snapshots older than RETENTION_DAYS are pruned on each run. Since this
   only started with this site's own launch, deltas will be against
   whatever the oldest available day is (a few days old at first, growing
   toward RETENTION_DAYS) rather than a fixed window — see
   rankDelta()-style callers for how that's surfaced honestly. */
const { getRankingsStore } = require('./_blobs-store');
const { getJSONGz, setJSONGz } = require('./_blob-json');

const RANKINGS_KEY = 'rankings:global';
const INDEX_KEY = 'rank-history:index';
const RETENTION_DAYS = 35;

function snapshotKey(date) {
    return `rank-history:${date}`;
}

function todayUTC() {
    return new Date().toISOString().slice(0, 10);
}

async function runRankSnapshot() {
    const store = getRankingsStore();
    const date = todayUTC();

    const dataset = (await getJSONGz(store, RANKINGS_KEY)) || [];
    if (!dataset.length) {
        return { skipped: true, reason: 'rankings:global is empty — nothing to snapshot' };
    }

    let index = (await store.get(INDEX_KEY, { type: 'json' })) || [];
    if (index.includes(date)) {
        return { skipped: true, reason: `already have a snapshot for ${date}`, playerCount: null };
    }

    const snapshot = {};
    for (const r of dataset) {
        if (r.user_id == null) continue;
        snapshot[r.user_id] = [r.global_rank ?? null, r.country_rank ?? null, r.pp ?? null];
    }
    await setJSONGz(store, snapshotKey(date), snapshot);

    index = [...index, date].sort();

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const keep = index.filter(d => d >= cutoffStr);
    const drop = index.filter(d => d < cutoffStr);

    for (const d of drop) {
        try { await store.delete(snapshotKey(d)); } catch { /* best effort — an orphaned blob just sits unused */ }
    }
    await store.setJSON(INDEX_KEY, keep);

    return { skipped: false, date, playerCount: Object.keys(snapshot).length, pruned: drop.length, retained: keep.length };
}

module.exports = { runRankSnapshot, snapshotKey, INDEX_KEY, RETENTION_DAYS };
