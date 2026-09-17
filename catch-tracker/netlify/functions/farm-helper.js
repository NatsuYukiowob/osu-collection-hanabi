/* Farm helper (刷圖助手): recommends specific maps by estimated pp gain,
   using a peer's own real achieved score as the recommendation target
   (mirrors mania-tracker.com's farm helper) rather than any difficulty/pp
   estimation — no rosu-pp-js or similar needed.

   Peer data comes from peer-bestplays:{user_id} (see _peer-crawl-core.js),
   a lean cache of each tracked player's own top-100 best plays, built up
   over time by peer-crawl-cron.js. This endpoint itself only makes ONE
   osu! API call (the target's own best plays, same call player-get.js
   already makes) — everything else is reads from our own cached data.

   PP-gain formula ported from netlify/functions/practice-generate.js (the
   main site's practice-collection generator, already implements osu!'s
   real weighted-pp-total math: weightedPpSum(topPpDesc) + bonusPp). bonusPp
   is constant per player and cancels out in a before/after delta, so the
   gain from inserting one candidate score is just the weighted-sum delta
   with no need to know the player's real total pp at all.

   Three candidate categories (mirrors mania-tracker's farm helper):
     - 'new': target has no score at all on this beatmap.
     - 'improve': target has a score, but the nearby-peer median clears it
       by more than IMPROVE_MARGIN_PP.
     - 'achieved': target already has a score peers aren't meaningfully
       beating — no pp upside, but still useful as the "熱門" (popularity)
       view's content, sorted by how many nearby peers also have it rather
       than by pp gain.
   `peer_count` (how many peers in the window have a cached score on this
   beatmap at all) is computed for every category — it's the one shared
   field that powers 為你推薦 (sort by gain) vs 熱門 (sort by peer_count)
   entirely client-side from one fetched result set. */
const { getOsuToken } = require('./_osu-auth');
const { getRankingsStore, getPeerStore, getMapsStore, getFarmHelperStore } = require('./_blobs-store');
const { getJSONGz } = require('./_blob-json');
const { MODE } = require('./_catch-constants');

const PEER_WINDOW_EACH_SIDE = 50; // ~100 peers total, per the approved plan
// Returned candidates are the union of the top N by pp gain (feeds 為你推薦)
// and the top N by peer popularity (feeds 熱門) — one fetch covers both tabs.
const MAX_RESULTS_PER_SORT = 50;
const TOP_PEERS_PER_CANDIDATE = 5;
// How many peers to hand back for the "pp ladder" strip — deliberately not
// all ~100 (would need scrolling to read), just enough rows for the
// viewer's own position among them to be legible at a glance.
const GRAPH_PEER_COUNT = 24;
// A peer median needs to beat the target's own pp on a map by more than
// this to count as "可提升" — filters out noise-level differences that
// aren't a meaningful recommendation.
const IMPROVE_MARGIN_PP = 3;

const weightedPpSum = (desc) => desc.reduce((sum, pp, i) => sum + pp * Math.pow(0.95, i), 0);

function median(nums) {
    const s = nums.slice().sort((a, b) => a - b);
    const n = s.length;
    if (!n) return null;
    const mid = n >> 1;
    return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function modAcronyms(mods) {
    return Array.isArray(mods) ? mods.map(m => (typeof m === 'string' ? m : m.acronym)) : [];
}

async function fetchTargetBestPlays(userId, token) {
    const res = await fetch(
        `https://osu.ppy.sh/api/v2/users/${userId}/scores/best?${new URLSearchParams({ mode: MODE, limit: '100' })}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`scores/best failed: ${res.status}`);
    const scores = await res.json();
    return Array.isArray(scores) ? scores : [];
}

async function fetchPrefs(userId) {
    const store = getFarmHelperStore();
    const raw = await store.get(`prefs:${userId}`, { type: 'json' }).catch(() => null);
    return {
        hidden: raw && Array.isArray(raw.hidden) ? raw.hidden.map(String) : [],
        easy: raw && Array.isArray(raw.easy) ? raw.easy.map(String) : [],
    };
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
        const peerStore = getPeerStore();
        const mapsStore = getMapsStore();

        const [rankings, maps, token, prefs] = await Promise.all([
            getJSONGz(rankingsStore, 'rankings:global').then(r => r || []),
            getJSONGz(mapsStore, 'maps:catch').then(m => m || []),
            getOsuToken(),
            fetchPrefs(userId),
        ]);
        const mapIndex = new Map(maps.map(m => [m.beatmap_id, m]));
        const hiddenSet = new Set(prefs.hidden);
        const easySet = new Set(prefs.easy);

        const sortedRankings = [...rankings].sort((a, b) => (b.pp || 0) - (a.pp || 0));
        const myIndex = sortedRankings.findIndex(r => r.user_id === userId);

        const targetRaw = await fetchTargetBestPlays(userId, token);
        if (!targetRaw.length) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'no best plays found for this player' }) };
        }

        // Target's own best pp per beatmap_id (their max across mods, if a
        // beatmap appears more than once in their own top 100).
        const targetPpList = [];
        const targetBestByMap = new Map();
        for (const s of targetRaw) {
            const bm = s.beatmap || {};
            const beatmapId = bm.id ?? s.beatmap_id ?? null;
            const pp = s.pp ?? null;
            if (pp == null) continue;
            targetPpList.push(pp);
            if (beatmapId != null) {
                const prev = targetBestByMap.get(beatmapId);
                if (prev == null || pp > prev) targetBestByMap.set(beatmapId, pp);
            }
        }
        targetPpList.sort((a, b) => b - a);
        const baseWeighted = weightedPpSum(targetPpList);

        let peerWindow = [];
        let coveragePeers = 0;
        if (myIndex !== -1) {
            const lo = Math.max(0, myIndex - PEER_WINDOW_EACH_SIDE);
            const hi = Math.min(sortedRankings.length, myIndex + PEER_WINDOW_EACH_SIDE + 1);
            peerWindow = sortedRankings.slice(lo, hi).filter((_, i) => lo + i !== myIndex);
        }

        const peerRecords = await Promise.all(
            peerWindow.map(p => peerStore.get(`peer-bestplays:${p.user_id}`, { type: 'json' }).catch(() => null))
        );

        // beatmap_id -> array of peer scores on it (best plays we've cached
        // for peers in the window), each score carrying its scorer's
        // identity so a candidate can list "who's actually playing this."
        const perMapPeerPp = new Map();
        for (let i = 0; i < peerRecords.length; i++) {
            const record = peerRecords[i];
            if (!record || !Array.isArray(record.bestPlays)) continue;
            coveragePeers++;
            const peer = peerWindow[i];
            for (const s of record.bestPlays) {
                if (s.beatmap_id == null || s.pp == null) continue;
                if (!perMapPeerPp.has(s.beatmap_id)) perMapPeerPp.set(s.beatmap_id, []);
                perMapPeerPp.get(s.beatmap_id).push({
                    ...s,
                    user_id: peer.user_id,
                    username: peer.username,
                    avatar_url: peer.avatar_url,
                    country_code: peer.country_code,
                });
            }
        }

        const candidates = [];
        for (const [beatmapId, peerScores] of perMapPeerPp) {
            const beatmapIdStr = String(beatmapId);
            const ownPp = targetBestByMap.get(beatmapId);

            // A hidden map (the target clicked 太難了) stays hidden until
            // they actually have a score on it — at that point playing it
            // is itself the "unhide," no separate action needed.
            if (hiddenSet.has(beatmapIdStr) && ownPp == null) continue;

            // A map flagged 太簡單 uses the strongest nearby peer score as
            // the target instead of the median, raising the bar as asked.
            const peerPpValues = peerScores.map(s => s.pp);
            const peerTargetPp = easySet.has(beatmapIdStr) ? Math.max(...peerPpValues) : median(peerPpValues);

            let category;
            if (ownPp == null) {
                category = 'new';
            } else if (peerTargetPp - ownPp > IMPROVE_MARGIN_PP) {
                category = 'improve';
            } else {
                category = 'achieved';
            }

            const mapMeta = mapIndex.get(beatmapId) || {};
            const sortedPeerScores = peerScores.slice().sort((a, b) => b.pp - a.pp);
            const topPeers = sortedPeerScores.slice(0, TOP_PEERS_PER_CANDIDATE).map(s => ({
                user_id: s.user_id, username: s.username, avatar_url: s.avatar_url,
                pp: Math.round(s.pp * 10) / 10, mods: s.mods, accuracy: s.accuracy, rank: s.rank,
            }));

            const base = { beatmap_id: beatmapId, category, peer_count: peerScores.length, top_peers: topPeers, own_pp: ownPp != null ? Math.round(ownPp * 10) / 10 : null, title: mapMeta.title || null, artist: mapMeta.artist || null, version: mapMeta.version || null, difficulty_rating: mapMeta.difficulty_rating ?? null, beatmapset_id: mapMeta.beatmapset_id ?? null };

            if (category === 'achieved') {
                candidates.push({
                    ...base,
                    coverage_pct: coveragePeers ? Math.round((peerScores.length / coveragePeers) * 100) : 0,
                    gain: null,
                    peer_pp: Math.round(peerTargetPp * 10) / 10,
                });
                continue;
            }

            // A new score for a beatmap you've already set a PB on
            // REPLACES that old entry in your top 100 (osu! only keeps
            // your best score per beatmap) — for "improve" candidates,
            // remove the one old ownPp entry before inserting the
            // hypothetical new one, rather than simulating both existing
            // at once.
            let baseList = targetPpList;
            if (category === 'improve') {
                const cut = targetPpList.indexOf(ownPp);
                baseList = cut === -1 ? targetPpList : [...targetPpList.slice(0, cut), ...targetPpList.slice(cut + 1)];
            }
            const merged = [...baseList, peerTargetPp].sort((a, b) => b - a).slice(0, 100);
            const gain = weightedPpSum(merged) - baseWeighted;
            if (gain <= 0) continue;

            // Reference row: the peer closest to the target value (most
            // representative single example to show, rather than an
            // aggregate stat with no concrete score behind it).
            const ref = sortedPeerScores.slice().sort((a, b) => Math.abs(a.pp - peerTargetPp) - Math.abs(b.pp - peerTargetPp))[0];

            candidates.push({
                ...base,
                gain: Math.round(gain * 10) / 10,
                peer_pp: Math.round(peerTargetPp * 10) / 10,
                ref_mods: modAcronyms(ref.mods),
                ref_accuracy: ref.accuracy ?? null,
                ref_rank: ref.rank ?? null,
            });
        }

        const byGain = candidates.filter(c => c.category !== 'achieved').sort((a, b) => b.gain - a.gain).slice(0, MAX_RESULTS_PER_SORT);
        const byPopularity = candidates.slice().sort((a, b) => b.peer_count - a.peer_count).slice(0, MAX_RESULTS_PER_SORT);
        const seen = new Set();
        const items = [];
        for (const c of [...byGain, ...byPopularity]) {
            if (seen.has(c.beatmap_id)) continue;
            seen.add(c.beatmap_id);
            items.push(c);
        }

        // Lean peer list for the decorative "pp ladder" strip — just enough
        // to draw rows (avatar + username + pp), not the full ranking
        // record. Evenly sampled across the window rather than just the
        // first N, so the ladder doesn't skew toward one side of the pp
        // range on a lightly-populated window.
        const graphStep = Math.max(1, Math.floor(peerWindow.length / GRAPH_PEER_COUNT));
        const peers = peerWindow
            .filter((_, i) => i % graphStep === 0)
            .slice(0, GRAPH_PEER_COUNT)
            .map(p => ({ user_id: p.user_id, username: p.username, avatar_url: p.avatar_url, pp: p.pp || 0 }));

        return {
            statusCode: 200,
            headers: { ...headers, 'Cache-Control': 'public, max-age=60' },
            body: JSON.stringify({
                items,
                peers,
                coverage: {
                    peerWindowSize: peerWindow.length,
                    peersCovered: coveragePeers,
                    inRankings: myIndex !== -1,
                    myPp: myIndex !== -1 ? (sortedRankings[myIndex].pp || 0) : null,
                },
            }),
        };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
