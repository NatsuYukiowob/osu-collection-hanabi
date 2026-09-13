/* Single-player profile: combines the cached rankings:global record (rank/pp
   maintained by our own crawler) with a LIVE call to GET /users/{id}/fruits
   for fields we don't crawl ourselves (join_date, play_time, career
   grade_counts) and a LIVE call to GET /users/{id}/scores/best for "best
   plays" — these live calls aren't cached; a single profile-page view is
   cheap enough that a second cache/de-dup layer isn't worth it for v1 (see
   catch-tracker's implementation plan). If the player isn't in the cached
   rankings (e.g. queried by id directly, not yet swept), the live /fruits
   call also backfills the rank/pp/accuracy fields instead of failing
   outright. mostUsedMod is derived here from bestPlays so the client
   doesn't need to re-implement the tally. */
const { getOsuToken } = require('./_osu-auth');
const { getFeedStore, getRankingsStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');
const { MODE } = require('./_catch-constants');
const { INDEX_KEY: RANK_HISTORY_INDEX_KEY, snapshotKey: rankSnapshotKey } = require('./_rank-snapshot-core');

function isFC(s) {
    if (s.perfect === true || s.perfect === 1) return true;
    const st = s.statistics || {};
    const miss = st.count_miss ?? st.miss ?? null;
    return miss === 0;
}
function modAcronyms(mods) {
    return Array.isArray(mods) ? mods.map(m => (typeof m === 'string' ? m : m.acronym)) : [];
}
function normalizeScore(score) {
    const bm = score.beatmap || {};
    const bms = score.beatmapset || bm.beatmapset || {};
    return {
        score_id: score.id,
        beatmap_id: bm.id ?? score.beatmap_id ?? null,
        beatmapset_id: bms.id ?? null,
        artist: bms.artist || null,
        title: bms.title || null,
        version: bm.version || null,
        creator: bms.creator || null,
        difficulty_rating: bm.difficulty_rating ?? null,
        bpm: bm.bpm ?? null,
        mods: modAcronyms(score.mods),
        rank: score.rank || null,
        accuracy: score.accuracy ?? null,
        max_combo: score.max_combo ?? null,
        pp: score.pp ?? null,
        is_fc: isFC(score),
        passed: score.passed !== false,
        // score.has_replay doesn't exist on the real API payload (GET
        // /users/{id}/scores/best uses a plain `replay: boolean` — checked
        // live this session, same real bug as _scores-poll-core.js's
        // toFeedRecord()) — was hard-false for every best-play regardless
        // of whether a replay actually existed.
        has_replay: score.replay === true,
        created_at: score.created_at || null,
        score_id: score.id ?? score.best_id ?? null,
        // Same shape _scores-poll-core.js already stores on feed records —
        // the score-detail modal (score-modal.js) reads count_300/100/50/
        // miss out of this for the judgement breakdown.
        statistics: score.statistics || {},
    };
}

function mostUsedMod(bestPlays) {
    const counts = new Map();
    for (const s of bestPlays) {
        const key = s.mods.length ? s.mods.slice().sort().join('') : 'NM';
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = null, bestCount = 0;
    for (const [key, n] of counts) {
        if (n > bestCount) { best = key; bestCount = n; }
    }
    return best ? { mod: best, count: bestCount, total: bestPlays.length } : null;
}

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const qs = event.queryStringParameters || {};
    const userId = parseInt(qs.user_id, 10);
    if (!Number.isFinite(userId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id is required' }) };
    }

    try {
        const rankingsStore = getRankingsStore();
        const feedStore = getFeedStore();
        const token = await getOsuToken();

        const rankings = (await getJSONGz(rankingsStore, 'rankings:global')) || [];
        let profile = rankings.find(r => r.user_id === userId) || null;

        // Always fetched live — join_date/play_time/grade_counts aren't
        // crawled/cached anywhere, and this also backfills a profile for a
        // player not yet in our rankings sweep.
        let liveUser = null;
        try {
            const res = await fetch(`https://osu.ppy.sh/api/v2/users/${userId}/${MODE}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            if (res.ok) liveUser = await res.json();
        } catch { /* profile still renders from cache if this fails */ }

        if (!profile && liveUser) {
            const stats = liveUser.statistics || {};
            profile = {
                user_id: liveUser.id, username: liveUser.username,
                country_code: liveUser.country_code || (liveUser.country && liveUser.country.code) || null,
                avatar_url: liveUser.avatar_url || `https://a.ppy.sh/${liveUser.id}`,
                cover_url: (liveUser.cover && liveUser.cover.url) || null,
                global_rank: stats.global_rank ?? null,
                country_rank: stats.country_rank ?? null,
                pp: stats.pp ?? null,
                accuracy: typeof stats.hit_accuracy === 'number' ? stats.hit_accuracy / 100 : null,
                play_count: stats.play_count ?? null,
                level: (stats.level && stats.level.current) ?? null,
                is_online: !!liveUser.is_online, last_visit: liveUser.last_visit || null,
                updatedAt: new Date().toISOString(),
            };
        }

        if (!profile) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'player not found' }) };
        }

        if (liveUser) {
            const stats = liveUser.statistics || {};
            profile.join_date = liveUser.join_date || null;
            profile.play_time_seconds = stats.play_time ?? null;
            profile.grade_counts = stats.grade_counts || null;
            // Player's own osu! bio, already BBCode from the API — no crawl
            // needed, just pass it through for the 關于 tab to render.
            profile.page_raw = (liveUser.page && liveUser.page.raw) || null;
            // Official per-month play history straight from the API — used
            // for the 活躍度 tab instead of a day-level heatmap, since we
            // only started polling scores ourselves on 2026-09-11 and have
            // no historical per-day data of our own to show.
            profile.monthly_playcounts = Array.isArray(liveUser.monthly_playcounts) ? liveUser.monthly_playcounts : null;
            // Username/avatar can drift (name changes, new avatar) between
            // our last rankings sweep and now — the live call is fresher.
            profile.username = liveUser.username || profile.username;
            profile.avatar_url = liveUser.avatar_url || profile.avatar_url;
            profile.cover_url = (liveUser.cover && liveUser.cover.url) || profile.cover_url;
            // Post-global-expansion gap: GET /rankings/fruits/performance
            // (no country filter) comes back with country_rank always null
            // on every entry (confirmed live) — only the per-user endpoint
            // reliably has it, so backfill from here rather than leaving the
            // cached rankings sweep's null in place.
            profile.country_rank = stats.country_rank ?? profile.country_rank;
        }

        // Rank-delta arrows: diff today's live numbers against the OLDEST
        // daily snapshot still retained (see _rank-snapshot-core.js) — not
        // a fixed "N days ago", since this only started 2026-09-12 and the
        // real window grows day by day until it hits RETENTION_DAYS.
        // Positive global/country = moved UP (rank number went down);
        // positive pp = gained pp. Silently omitted if we have no snapshot
        // yet or this player wasn't in it.
        try {
            const historyIndex = (await rankingsStore.get(RANK_HISTORY_INDEX_KEY, { type: 'json' })) || [];
            if (historyIndex.length) {
                const oldestDate = historyIndex[0];
                const oldSnapshot = (await getJSONGz(rankingsStore, rankSnapshotKey(oldestDate))) || {};
                const old = oldSnapshot[userId];
                if (old) {
                    const [oldGlobal, oldCountry, oldPp] = old;
                    const days = Math.max(1, Math.round((Date.now() - new Date(`${oldestDate}T00:00:00Z`).getTime()) / 86400000));
                    const delta = { days };
                    if (oldGlobal != null && profile.global_rank != null) delta.global = oldGlobal - profile.global_rank;
                    if (oldCountry != null && profile.country_rank != null) delta.country = oldCountry - profile.country_rank;
                    if (oldPp != null && profile.pp != null) delta.pp = Math.round((profile.pp - oldPp) * 10) / 10;
                    profile.rank_delta = delta;
                }
            }
        } catch { /* delta is a nice-to-have; profile still renders without it */ }

        const feed = (await getJSONGz(feedStore, 'feed:recent')) || [];
        const recentPlays = feed.filter(r => r.user_id === userId).slice(0, 50);

        let bestPlays = [];
        try {
            const bestRes = await fetch(
                `https://osu.ppy.sh/api/v2/users/${userId}/scores/best?${new URLSearchParams({ mode: MODE, limit: '100' })}`,
                { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
            );
            if (bestRes.ok) bestPlays = (await bestRes.json()).map(normalizeScore);
        } catch {
            // best-plays is a live nice-to-have; profile still renders without it
        }

        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=30' },
            body: JSON.stringify({ profile, recentPlays, bestPlays, mostUsedMod: mostUsedMod(bestPlays) }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
