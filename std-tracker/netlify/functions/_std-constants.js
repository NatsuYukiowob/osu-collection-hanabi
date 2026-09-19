/* Shared knobs for the std (osu!standard) tracker. Sibling to catch-tracker's
   own _catch-constants.js — same shape, different ruleset. Global from day
   one (catch-tracker started TW-only and expanded later; no reason to
   repeat that here now that the global-rankings pattern is proven). osu!
   API v2's performance-rankings endpoint caps out around page 200 (~10,000
   players) for every ruleset, standard included, so the pool size and the
   crawl/poll cadences below are the same order of magnitude as catch-
   tracker's own, despite standard having a vastly larger REGISTERED player
   base overall. */
const MODE = 'osu';
const MODE_NUM = 0; // osu! API v2 ruleset id for standard

// Ring-buffer cap for feed:recent — old entries just fall off the end.
const FEED_CAP = 2000;

// Per-player de-dup cache: how many recent score ids to remember so a
// re-poll doesn't re-emit the same score into the feed.
const LAST_SEEN_CAP = 100;

// Score-poll round-robin: item-count cap per invocation, on top of the
// wall-clock budgetMs cap — see catch-tracker's _catch-constants.js for the
// full rationale (two independent levers, same as the main site's
// _community-mappools-shared.js).
const SCORE_POLL_PER_RUN_CRON = 300;
const SCORE_POLL_PER_RUN_MANUAL = 30;

const VALID_GRADES = new Set(['XH', 'X', 'SH', 'S', 'A', 'B', 'C', 'D', 'F']);

// Statuses swept by the maps catalog crawler, in order — see
// _maps-crawl-core.js. osu! API v2's /beatmapsets/search `s` param takes
// one status per request, so these are crawled as separate passes.
const MAP_STATUSES = ['ranked', 'loved'];

module.exports = {
    MODE, MODE_NUM, FEED_CAP, LAST_SEEN_CAP,
    SCORE_POLL_PER_RUN_CRON, SCORE_POLL_PER_RUN_MANUAL,
    VALID_GRADES, MAP_STATUSES,
};
