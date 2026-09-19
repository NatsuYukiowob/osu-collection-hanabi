# Setup

## 1. Create the Netlify site

1. In Netlify: **Add new site → Import an existing project**, pick the same
   `hanabirn/osu-collection-hanabi` GitHub repo the main site and
   catch-tracker use.
2. Under **Build settings**, set the **Base directory** to `std-tracker`.
   Build command / publish directory / functions directory are already set
   via `std-tracker/netlify.toml` (`publish = "."`,
   `functions = "netlify/functions"`) — Netlify picks that file up
   automatically once the base directory points at this folder.
3. Deploy. This is a genuinely separate Netlify site from the main one and
   from catch-tracker — separate site id, separate URL, separate build-
   minute usage — it just happens to share a repo.
4. Rename the site (Site configuration → General → Site details → Change
   site name) to something like **`std-tracker-hanabi`**, matching the
   naming convention of the other two sites in this repo.

## 2. Environment variables

Set these on the **new** site (Site configuration → Environment variables).
Nothing is inherited from the other sites automatically. Unlike
catch-tracker, this site has no site-login feature yet, so it needs no
`OSU_REPLAY_*`/`OSU_AUTH_SECRET`/`TOKEN_ENC_KEY` variables at all.

| Variable | Value | Notes |
|---|---|---|
| `OSU_CLIENT_ID` | same as the main site's / catch-tracker's | `client_credentials` grant has no redirect-URI/domain binding, so reusing the same osu! OAuth app is safe |
| `OSU_CLIENT_SECRET` | same as the main site's / catch-tracker's | ditto |
| `NETLIFY_BLOBS_SITE_ID` | **new** — this site's own Project ID | Site configuration → General → Project information. Must NOT be another site's id — reusing one would write into that site's blob storage. |
| `NETLIFY_BLOBS_TOKEN` | **new** — a personal access token | User settings → Applications → New access token |
| `STD_TRACKER_CRAWL_SECRET` | freshly generated random string | gates `rankings-crawl-run` / `scores-poll-run` |

## 3. Seed the data

Cron won't fire until the next scheduled tick (rankings: top of the hour;
scores: next 5-minute mark). To seed immediately after first deploy, call
the manual endpoints a few times with the secret header:

```
curl -X POST https://<std-tracker-site>.netlify.app/.netlify/functions/rankings-crawl-run \
  -H "x-std-tracker-secret: <STD_TRACKER_CRAWL_SECRET>"

curl -X POST https://<std-tracker-site>.netlify.app/.netlify/functions/scores-poll-run \
  -H "x-std-tracker-secret: <STD_TRACKER_CRAWL_SECRET>"
```

Run `rankings-crawl-run` first (and enough times to complete a full sweep —
watch the response's `sweepCompleted` field) so `players:index` exists
before `scores-poll-run` has anything to poll. Running `scores-poll-run`
twice in a row with no real new scores in between should report
`newScoreCount: 0` the second time — that's the de-dup logic working.

## 4. Verify

- Watch this site's function logs (Netlify UI) for `rankings-crawl-cron`
  and `scores-poll-cron` completing within budget.
- Open the deployed URL, confirm all pages render with data once the feed
  has a few entries.
