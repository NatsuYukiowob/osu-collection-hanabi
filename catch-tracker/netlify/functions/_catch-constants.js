/* Shared knobs for the catch (osu!fruits) tracker. v1 was scoped to a
   single country (TW); expanded 2026-09 to global rankings — osu! API v2's
   performance-rankings endpoint caps out around page 200 (~10,000 players)
   regardless, so "global" means that same ceiling, not literally every
   registered player. See docs in _scores-poll-core.js /
   _rankings-crawl-core.js for how the design degrades gracefully (slower
   full-sweep cadence, not breakage) if the real pool turns out bigger than
   a single poll cycle can cover. */
const MODE = 'fruits';
const MODE_NUM = 2; // osu! API v2 ruleset id for fruits/catch

// Statuses swept by the maps catalog crawler, in order — see
// _maps-crawl-core.js. osu! API v2's /beatmapsets/search `s` param takes
// one status per request, so these are crawled as separate passes.
const MAP_STATUSES = ['ranked', 'loved'];

// Ring-buffer cap for feed:recent — old entries just fall off the end.
const FEED_CAP = 2000;

// Per-player de-dup cache: how many recent score ids to remember so a
// re-poll doesn't re-emit the same score into the feed.
const LAST_SEEN_CAP = 100;

// Score-poll round-robin: item-count cap per invocation, on top of the
// wall-clock budgetMs cap (two independent levers, same as
// crawlWybinMappools's {budgetMs, perRun} in the main site's
// _community-mappools-shared.js). Sized for the original TW-only pool
// (~5k players); against the post-expansion global pool (up to ~10k) a full
// round-robin sweep just spans roughly 2x as many ticks — coverage, not
// breakage — see scores-poll-state's playersPolledThisSweep/totalPlayers
// fields, already surfaced in feed-list.js's coverage block.
const SCORE_POLL_PER_RUN_CRON = 300;
const SCORE_POLL_PER_RUN_MANUAL = 30;

// Peer best-plays crawler (farm helper — _peer-crawl-core.js): one
// GET /scores/best per player (a heavier ~100-score response than the
// score-poller's ~50-score /scores/recent), so a lower cap — budgetMs is
// expected to be the binding constraint in practice, same as the other
// crawlers, this is just the safety ceiling.
const PEER_CRAWL_PER_RUN_CRON = 150;
const PEER_CRAWL_PER_RUN_MANUAL = 20;

// Country-rank backfill (_country-rank-crawl-core.js): one GET
// /users/{id}/{mode} call per player — the bulk rankings endpoint never
// returns country_rank (see _rankings-crawl-core.js's toRecord()), so this
// fills it in for the daily rank-history snapshot. Similar per-request
// cost to the peer crawler above.
const COUNTRY_RANK_CRAWL_PER_RUN_CRON = 200;
const COUNTRY_RANK_CRAWL_PER_RUN_MANUAL = 20;

const VALID_GRADES = new Set(['XH', 'X', 'SH', 'S', 'A', 'B', 'C', 'D', 'F']);

module.exports = {
    MODE, MODE_NUM, MAP_STATUSES, FEED_CAP, LAST_SEEN_CAP,
    SCORE_POLL_PER_RUN_CRON, SCORE_POLL_PER_RUN_MANUAL,
    PEER_CRAWL_PER_RUN_CRON, PEER_CRAWL_PER_RUN_MANUAL,
    COUNTRY_RANK_CRAWL_PER_RUN_CRON, COUNTRY_RANK_CRAWL_PER_RUN_MANUAL,
    VALID_GRADES,
};
