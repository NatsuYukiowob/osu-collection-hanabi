/* Netlify "ignore" command for the Catch Tracker site — decides whether a
   push actually needs a fresh build+deploy of THIS site. Wired up in
   catch-tracker/netlify.toml as `ignore = "node scripts/should-build.mjs"`.
   Mirrors the main site's scripts/should-build.mjs exactly in contract
   (exit 0 = skip, exit !0 = build), but scoped the other way around: this
   site only cares about changes under catch-tracker/, and should skip when
   a push only touched the main site (or mp-bot, or docs).

   Netlify's "base directory" setting for this site is catch-tracker/, but
   CACHED_COMMIT_REF/COMMIT_REF are still whole-repo commit SHAs and `git
   diff` runs from the repo root — so paths here are repo-root-relative
   (prefixed with catch-tracker/), same as the main script's paths are
   root-relative too.

   Gotcha found on this site's actual first deploy: on a brand-new site with
   no prior successful build, Netlify sets CACHED_COMMIT_REF to the SAME
   commit as COMMIT_REF (not empty) — `git diff SHA..SHA` is then trivially
   empty, so the naive `CACHED_COMMIT_REF || 'HEAD^'` fallback never
   triggers and every first deploy skips itself. Treat base===head as "no
   usable cache info" too, not just an unset/missing CACHED_COMMIT_REF. */
import { execFileSync } from 'node:child_process';

const RELEVANT = [
    'catch-tracker/index.html', 'catch-tracker/feed.html', 'catch-tracker/player.html', 'catch-tracker/map.html',
    'catch-tracker/maps.html', 'catch-tracker/skins.html', 'catch-tracker/farm-helper.html',
    'catch-tracker/css', 'catch-tracker/js', 'catch-tracker/assets',
    'catch-tracker/netlify', 'catch-tracker/netlify.toml',
    'catch-tracker/package.json', 'catch-tracker/package-lock.json',
];

const head = process.env.COMMIT_REF || 'HEAD';
const cached = process.env.CACHED_COMMIT_REF;
const base = (cached && cached !== head) ? cached : 'HEAD^';

try {
    execFileSync('git', ['diff', '--quiet', base, head, '--', ...RELEVANT], { stdio: 'ignore' });
    console.log(`should-build (catch-tracker): no relevant changes in ${base}..${head} — skipping build.`);
    process.exit(0); // skip
} catch {
    console.log(`should-build (catch-tracker): relevant changes in ${base}..${head} — building.`);
    process.exit(1); // build
}
