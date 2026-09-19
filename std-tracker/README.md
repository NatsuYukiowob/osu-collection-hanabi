# Std Tracker

A live score tracker for osu!standard, modeled on catch-tracker (this
repo's own osu!catch equivalent) and, through that, on
[mania-tracker.com](https://mania-tracker.com/). This is the "core MVP"
first cut — rankings + a live score feed + player/map profiles — meant to
grow feature-by-feature the same way catch-tracker did, not a full port of
every catch-tracker feature at once.

Standalone Netlify site, sibling to the main
[osu-collection-hanabi](https://osu-collection-hanabi.netlify.app/) site and
to `catch-tracker/` — lives in the same git repo (`std-tracker/`) but
deploys separately, with its own Netlify site, own Blobs storage, own cron
schedule. See `SETUP.md` for first-time deployment.

This site is meant to be one entry point in a future mode-picker hub (osu!
standard / taiko / catch / mania) alongside catch-tracker and a linked-out
mania-tracker.com — that hub isn't built yet.

## What it does

- **Rankings** (`index.html` / `rankings.html`) — std players ranked by pp,
  globally (filterable by country, searchable by name).
- **Live Feed** (`feed.html`) — a rolling feed of recently-detected scores
  from tracked players, filterable by grade / FC / choke / country.
- **Player** (`player.html?id=`) — one player's best + recent plays, rank
  badges (with ▲/▼ rank-delta arrows once at least two days' snapshots
  exist), SR/mod/BPM/pp-range stat cards, grade tally, and an activity tab
  (osu!'s own monthly playcount history).
- **Map** (`map.html?id=`) — grade/mod distribution for one beatmap, among
  the tracked cohort's observed scores; falls back to the Maps catalog's
  basic metadata when no scores have been observed yet.
- **Maps** (`maps.html`) — a lightweight catalog of every ranked + loved
  osu!standard beatmap (search / status / sort by star, BPM, length, or
  newest). No audio preview, download button, or favourite-count sort yet
  — those were catch-tracker's own later additions to this same page.
- **Login** (header "Login with osu!") — a real osu! OAuth login (same
  authorization_code + encrypted-token-at-rest design as catch-tracker's
  own), ready for the next login-gated feature to use. Nothing actually
  gates on it yet — it's infrastructure built ahead of its first consumer.

Not built yet (all present on catch-tracker, deliberately deferred here):
replay viewing, Farm Helper, Goals, a Discord server directory, a Discord
bot — all of which need the login system above, which now exists. Skins
is deliberately skipped for good, not deferred — a skin file isn't
mode-specific, so a second, disconnected skins catalog per tracker would
just be a wasteful duplicate; if this ever gets built it should be one
shared catalog across every tracker, not std-tracker's own.

## How the data gets there

Two independent crons (see `netlify.toml`):

1. **`rankings-crawl-cron`** (hourly) — walks
   `GET /rankings/osu/performance` (global — no country filter, capped
   around the API's own ~10,000-player ceiling regardless, same as every
   other ruleset), keeps `rankings:global` fresh, and rebuilds the score-
   poller's player queue (`players:index`) whenever a full sweep completes.
2. **`scores-poll-cron`** (every 5 min) — round-robins over `players:index`,
   polling each player's `GET /users/{id}/scores/recent?mode=osu` and
   detecting new scores by diffing against last poll's snapshot. New scores
   get prepended to the `feed:recent` ring buffer.
3. **`maps-crawl-cron`** (every 30 min) — walks
   `GET /beatmapsets/search?m=0` once per status in `MAP_STATUSES`
   (`ranked`, `loved`), upserting into `maps:global`. Metadata only (star
   rating, bpm, length, CS/AR/OD/HP straight from the search response) — no
   local PP computation.
4. **`rank-snapshot-cron`** (daily) — makes no osu! API calls of its own;
   just reads the already-fresh `rankings:global` dataset and writes today's
   `{global_rank, country_rank, pp}` for every tracked player into a
   compact per-day blob. `rankings-list.js`/`player-get.js` diff a
   player's current numbers against the OLDEST retained snapshot to power
   the rank-delta arrows.

Both are time-boxed (`budgetMs`) AND item-capped (`perRun`) per invocation,
so a tick that can't finish the whole player pool just does a partial sweep
and picks up where it left off next tick — see the `coverage` blocks on
`feed-list.js` / `rankings-list.js` for the actual freshness/coverage state.

## Local development

No build step — it's plain HTML/CSS/JS. Netlify Functions need real env
vars to hit Netlify Blobs / the osu! API (see `SETUP.md`), so local testing
without `netlify dev` is limited to frontend logic against a stubbed
`fetch`. Full end-to-end testing happens on the live deploy, same pattern
the other sites in this repo use.
