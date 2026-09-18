# Setup

## 1. Create the Netlify site

1. In Netlify: **Add new site → Import an existing project**, pick the same
   `hanabirn/osu-collection-hanabi` GitHub repo the main site uses.
2. Under **Build settings**, set the **Base directory** to `catch-tracker`.
   Build command / publish directory / functions directory are already set
   via `catch-tracker/netlify.toml` (`publish = "."`,
   `functions = "netlify/functions"`) — Netlify picks that file up
   automatically once the base directory points at this folder.
3. Deploy. This is a genuinely separate Netlify site from the main one —
   separate site id, separate URL, separate build-minute usage — it just
   happens to share a repo.
4. Rename the site (Site configuration → General → Site details → Change
   site name) to **`catch-tracker-hanabi`**, matching the main site's
   `osu-collection-hanabi` naming — this is the URL already hardcoded into
   `js/resources-data.js`'s Resources-tab entry on the main site. If a
   different name is used instead, update that entry to match.

## 2. Environment variables

Set these on the **new** site (Site configuration → Environment variables).
Nothing is inherited from the main site automatically.

| Variable | Value | Notes |
|---|---|---|
| `OSU_CLIENT_ID` | same as the main site's | `client_credentials` grant has no redirect-URI/domain binding, so reusing the same osu! OAuth app is safe |
| `OSU_CLIENT_SECRET` | same as the main site's | ditto |
| `NETLIFY_BLOBS_SITE_ID` | **new** — this site's own Project ID | Site configuration → General → Project information. Must NOT be the main site's id — reusing it would write into the main site's blob storage. |
| `NETLIFY_BLOBS_TOKEN` | **new** — a personal access token | User settings → Applications → New access token |
| `CATCH_TRACKER_CRAWL_SECRET` | freshly generated random string | gates `rankings-crawl-run` / `scores-poll-run` |
| `OSU_REPLAY_CLIENT_ID` | **new osu! OAuth app**, separate from `OSU_CLIENT_ID` | `authorization_code` binds a redirect URI to one app — see below |
| `OSU_REPLAY_CLIENT_SECRET` | that new app's secret | |
| `OSU_REPLAY_REDIRECT_URI` | `https://<catch-tracker-site>.netlify.app/.netlify/functions/osu-replay-callback` | must exactly match the callback URL registered on the new osu! OAuth app |
| `OSU_AUTH_SECRET` | freshly generated random string | signs the site login's identity token — do NOT reuse the main site's value |
| `TOKEN_ENC_KEY` | `openssl rand -base64 32` | encrypts each logged-in user's osu! access/refresh token at rest (see `_token-crypto.js`) |

### The site login's osu! OAuth app

1. On osu!, go to Account Settings → OAuth → **New OAuth Application**.
2. Application Callback URLs: the exact `OSU_REPLAY_REDIRECT_URI` above.
3. Copy the generated Client ID/Secret into the two env vars above.
4. This app is used ONLY for the user-login flow — the existing
   `OSU_CLIENT_ID`/`OSU_CLIENT_SECRET` (shared with the main site,
   `client_credentials` only) are untouched and keep working exactly as
   before. Route filenames/env var names keep their original
   `osu-replay-*`/`OSU_REPLAY_*` naming from when this was built
   Watch-Replay-only — it's since been rebuilt as general site login, but
   renaming these would mean going back into osu!'s developer settings to
   update the registered callback URL for no real benefit.

## 3. Seed the data

Cron won't fire until the next scheduled tick (rankings: top of the hour;
scores: next 5-minute mark). To seed immediately after first deploy, call
the manual endpoints a few times with the secret header:

```
curl -X POST https://<catch-tracker-site>.netlify.app/.netlify/functions/rankings-crawl-run \
  -H "x-catch-tracker-secret: <CATCH_TRACKER_CRAWL_SECRET>"

curl -X POST https://<catch-tracker-site>.netlify.app/.netlify/functions/scores-poll-run \
  -H "x-catch-tracker-secret: <CATCH_TRACKER_CRAWL_SECRET>"
```

Run `rankings-crawl-run` first (and enough times to complete a full sweep —
watch the response's `sweepCompleted` field) so `players:index` exists
before `scores-poll-run` has anything to poll. Running `scores-poll-run`
twice in a row with no real new scores in between should report
`newScoreCount: 0` the second time — that's the de-dup logic working.

## 4. Verify

- Watch this site's function logs (Netlify UI) for `rankings-crawl-cron`
  and `scores-poll-cron` completing within budget.
- Open the deployed URL, confirm all four pages render with data once the
  feed has a few entries.
- Note the actual full-sweep wall-clock time once real global catch player
  counts are known (rankings went TW-only → global in 2026-09, capped
  around osu! API's own ~10,000-player performance-rankings ceiling — see
  `netlify/functions/_catch-constants.js`) — this validates or invalidates
  the `perRun`/cadence choices there.

## 5. Discord bot (optional)

Catch Tracker has its own Discord bot (`/pp` `/recent` `/top` `/replay`
`/link` `/unlink`) — same HTTP-interactions architecture as the main site's
bot, no persistent host needed. Designed as the first of a bot meant to
later grow into one shared bot across future taiko/standard trackers too,
so it's worth registering under a dedicated Discord Application (e.g.
"osu Tracker") rather than reusing the main site's own bot.

1. In the [Discord Developer Portal](https://discord.com/developers/applications),
   create a new Application, add a Bot to it.
2. Set **Interactions Endpoint URL** to `https://<this-site>.netlify.app/discord`
   (Discord verifies this URL immediately — it must already be deployed
   with `DISCORD_PUBLIC_KEY` set below before you can save it).
3. Add these env vars on this Netlify site:

   | Variable | Value |
   |---|---|
   | `DISCORD_PUBLIC_KEY` | Application → General Information → Public Key |

4. Register the slash commands (also needs `DISCORD_APP_ID` /
   `DISCORD_BOT_TOKEN` — from the same page / Bot tab — but only as local
   env for this one-off script, not on Netlify):

   ```
   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... npm run discord:register
   ```

5. Invite the bot to a server (OAuth2 URL Generator → scope `applications.commands`)
   and try `/pp username:<any osu! name>`.

## 6. Link back from the main site

Once the URL is live, add it to the main site's `js/resources-data.js`
`OSU_RESOURCES` array (see that file's own comment for the pattern) and add
the matching `resource_catchtracker_desc` i18n key to the 8 hand-edited
locale files under `js/i18n/`.
