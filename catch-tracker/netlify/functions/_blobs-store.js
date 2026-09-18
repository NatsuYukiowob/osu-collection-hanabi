/* Netlify Blobs store getters for this site. Same explicit siteID/token
   pattern as the main site's _blobs-store.js (automatic env injection only
   works on the Functions v2 runtime, not the classic Lambda-style handlers
   used here) — but pointed at THIS site's own NETLIFY_BLOBS_SITE_ID /
   NETLIFY_BLOBS_TOKEN, which must be freshly generated for this Netlify
   site (see SETUP.md), not copied from the main site. */
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
// Also holds the daily rank-history snapshots used for the player page's
// rank-delta arrows (see _rank-snapshot-core.js): `rank-history:index`
// (plain JSON array of YYYY-MM-DD strings we have a snapshot for) +
// `rank-history:{date}` (gzip {user_id: [global_rank, country_rank, pp]}).
function getRankingsStore() {
    return store('catch-tracker-rankings');
}

// Score-poll sweep: `feed:recent` (gzip ring buffer of detected scores) +
// `scores-poll-state` (plain JSON cursor/diagnostics) +
// `player-scores:{user_id}` (plain JSON per-player de-dup cache).
function getFeedStore() {
    return store('catch-tracker-feed');
}

// Map catalog sweep: `maps:catch` (gzip array of every ranked+loved catch
// beatmap) + `maps-crawl-state` (plain JSON cursor/diagnostics).
function getMapsStore() {
    return store('catch-tracker-maps');
}

// Public skin catalog (skins-upload/list/download/image.js) — a browsable
// community skin-file catalog (anyone can upload/download), NOT the same
// thing as the main site's skins feature (a private per-user login-gated
// cloud *backup* of your own skins — nobody else can see or download
// those). `index` (plain JSON array of metadata), `file:{id}` (binary
// .osk), `preview:{id}` (binary preview image, optional).
function getSkinsStore() {
    return store('catch-tracker-skins');
}

// Peer best-plays sweep (farm helper — see _peer-crawl-core.js):
// `peer-bestplays:{user_id}` (plain JSON, one key per player, that
// player's own top-100 best plays) + `peer-crawl-state` (plain JSON
// cursor/diagnostics). One key per tracked player rather than one big
// blob — farm-helper.js only ever needs ~100 of these per request
// (a target player's rank-adjacent peer window), not the whole set.
function getPeerStore() {
    return store('catch-tracker-peers');
}

// Site login (osu-replay-login/callback.js, _user-auth.js):
// `user-token:{user_id}` → encrypted {access_token, refresh_token,
// expires_at} (see _token-crypto.js) so a login-gated feature can call
// osu!'s API again on a later visit without asking the user to re-login
// every time.
function getAuthStore() {
    return store('catch-tracker-auth');
}

// Farm helper per-user feedback (太難了/太簡單 — see farm-helper-prefs.js):
// `prefs:{user_id}` -> { hidden: [beatmap_id...], easy: [beatmap_id...] }.
// Bound to the target's own login-signed identity, not the viewer's, since
// the preference belongs to whoever the recommendations are "for".
function getFarmHelperStore() {
    return store('catch-tracker-farm-prefs');
}

// Watch Replay's forever-cache of downloaded .osr bytes (replay-download.js
// — `replay:{score_id}` -> raw arrayBuffer). A finished score's replay
// never changes, so this is never invalidated; it just avoids re-hitting
// osu!'s download endpoint (and the requesting user's own rate limit) on
// every repeat view of the same score.
function getReplayCacheStore() {
    return store('catch-tracker-replay-cache');
}

// Watch Replay's theater background (beatmap-bg.js) — `bg:
// {beatmapset_id}` -> { bytes: base64, contentType }. osu!'s CDN cover.jpg
// is a pre-cropped ~3.6:1 promo banner, not the actual in-game background;
// this caches the REAL background image extracted once from the mapset's
// .osz (downloaded from a mirror, unzipped, matched against the first
// difficulty's .osu [Events] Background line) so every later view of the
// same mapset is a cache hit, not a repeat .osz download + unzip.
function getBeatmapBackgroundStore() {
    return store('catch-tracker-beatmap-bg');
}

// Personal goal tracking (goals.js) — `goals:{user_id}` -> array of
// {id, type, target, achieved, achievedAt, createdAt}. Scoped to just the
// "reach a total pp target" type for now (see goals.js).
function getGoalsStore() {
    return store('catch-tracker-goals');
}

// Community-submitted Discord server directory (communities.js) —
// mania-tracker.com's own "Discord 服務器" tab, scoped to catch. Single
// key `index` -> array of {id, name, inviteUrl, description, tags,
// iconUrl, submittedById, submittedByName, createdAt}.
function getCommunitiesStore() {
    return store('catch-tracker-communities');
}

module.exports = { getRankingsStore, getFeedStore, getMapsStore, getSkinsStore, getPeerStore, getAuthStore, getFarmHelperStore, getReplayCacheStore, getBeatmapBackgroundStore, getGoalsStore, getCommunitiesStore };
