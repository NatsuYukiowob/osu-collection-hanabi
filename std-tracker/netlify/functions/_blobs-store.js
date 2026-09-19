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

// Site login (osu-login.js/osu-callback.js, _user-auth.js):
// `user-token:{user_id}` → encrypted {access_token, refresh_token,
// expires_at} (see _token-crypto.js) so a login-gated feature can call
// osu!'s API again on a later visit without asking the user to re-login
// every time.
function getAuthStore() {
    return store('std-tracker-auth');
}

// Personal goal tracking (goals.js) — `goals:{user_id}` -> array of
// {id, type, target, achieved, achievedAt, createdAt}. Scoped to just the
// "reach a total pp target" type for now (see goals.js), same as
// catch-tracker's own first pass.
function getGoalsStore() {
    return store('std-tracker-goals');
}

// Community-submitted Discord server directory (communities.js) — scoped
// to std the same way catch-tracker's own is scoped to catch (a Discord
// community for one mode's players is genuinely different from another's,
// unlike a skin file — this is NOT the same "shouldn't be duplicated"
// case as Skins). Single key `index` -> array of {id, name, inviteUrl,
// description, tags, iconUrl, submittedById, submittedByName, createdAt}.
function getCommunitiesStore() {
    return store('std-tracker-communities');
}

// Farm helper (farm-helper.js / _peer-crawl-core.js): `peer-bestplays:
// {user_id}` (lean cache of each tracked player's own top-100 best plays)
// + `peer-crawl-state` (plain JSON cursor/diagnostics).
function getPeerStore() {
    return store('std-tracker-peer');
}

// Farm helper per-user feedback (farm-helper-prefs.js): `prefs:{user_id}`
// -> {hidden: [beatmap_id], easy: [beatmap_id]}.
function getFarmHelperStore() {
    return store('std-tracker-farm-helper');
}

// Watch Replay's forever-cache of downloaded .osr bytes (replay-download.js
// — `replay:{score_id}` -> raw arrayBuffer). A finished score's replay
// never changes, so this is never invalidated; it just avoids re-hitting
// osu!'s download endpoint (and the requesting user's own rate limit) on
// every repeat view of the same score.
function getReplayCacheStore() {
    return store('std-tracker-replay-cache');
}

module.exports = {
    getRankingsStore, getFeedStore, getMapsStore, getAuthStore, getGoalsStore, getCommunitiesStore,
    getPeerStore, getFarmHelperStore, getReplayCacheStore,
};
