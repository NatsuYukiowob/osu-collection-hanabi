/* Netlify Blobs store getters for this site. Same explicit siteID/token
   pattern as catch-tracker's own _blobs-store.js (automatic env injection
   only works on the Functions v2 runtime, not the classic Lambda-style
   handlers used here) — but pointed at THIS site's own
   NETLIFY_BLOBS_SITE_ID / NETLIFY_BLOBS_TOKEN, which must be freshly
   generated for this Netlify site (see SETUP.md), not copied from another
   site. */
const { getStore } = require('@netlify/blobs');

function store(name) {
    return getStore({
        name,
        siteID: process.env.NETLIFY_BLOBS_SITE_ID,
        token: process.env.NETLIFY_BLOBS_TOKEN,
    });
}

// Rankings sweep: `rankings:global` (gzip array of player records) +
// `rankings-crawl-state` (plain JSON cursor/diagnostics) +
// `players:index` (plain JSON polling queue, derived from rankings:global).
function getRankingsStore() {
    return store('std-tracker-rankings');
}

// Score-poll sweep: `feed:recent` (gzip ring buffer of detected scores) +
// `scores-poll-state` (plain JSON cursor/diagnostics) +
// `player-scores:{user_id}` (plain JSON per-player de-dup cache).
function getFeedStore() {
    return store('std-tracker-feed');
}

// Map catalog sweep: `maps:global` (gzip array of every ranked+loved std
// beatmap) + `maps-crawl-state` (plain JSON cursor/diagnostics).
function getMapsStore() {
    return store('std-tracker-maps');
}

module.exports = { getRankingsStore, getFeedStore, getMapsStore };
