/* Netlify "ignore" command for the Catch Tracker site — decides whether a
   push actually needs a fresh build+deploy of THIS site. Wired up in
   catch-tracker/netlify.toml as `ignore = "node scripts/should-build.mjs"`.
   Mirrors the main site's scripts/should-build.mjs exactly in contract
   (exit 0 = skip, exit !0 = build), but scoped the other way around: this
   site only cares about changes under catch-tracker/, and should skip when
   a push only touched the main site (or mp-bot, or docs).

   Root-caused a real, 100%-reproducible bug this session (previously just
   worked around per-push, see git history/memory — "Second should-build.mjs
   false-skip"): this site's Netlify "Base directory" is set to
   catch-tracker/ in the site's own dashboard settings (confirmed live via
   `netlify dev`'s own config resolution, separately from anything in this
   repo), and Netlify runs the ignore command with CWD already inside that
   base directory — so a root-relative pathspec like `catch-tracker/js`
   resolved against `git diff -- catch-tracker/js` from that CWD actually
   asked git for changes under catch-tracker/catch-tracker/js, which never
   exists. Every `git diff --quiet` therefore ALWAYS came back empty
   regardless of what really changed, and the ONLY reason a manual retry
   (`netlify api createSiteBuild`) ever fixed it is that a manual trigger
   bypasses this ignore-command check entirely — it was never actually
   re-evaluating anything. Fixed by resolving the true repo root with `git
   rev-parse --show-toplevel` (works from any CWD) and running the diff
   pinned there via `-C`, so these repo-root-relative paths are correct
   regardless of Netlify's own working directory for this step.

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
    'catch-tracker/replays.html', 'catch-tracker/replay.html', 'catch-tracker/replay-compare.html',
    'catch-tracker/css', 'catch-tracker/js', 'catch-tracker/assets',
    'catch-tracker/netlify', 'catch-tracker/netlify.toml',
    'catch-tracker/package.json', 'catch-tracker/package-lock.json',
];

const head = process.env.COMMIT_REF || 'HEAD';
const cached = process.env.CACHED_COMMIT_REF;
const base = (cached && cached !== head) ? cached : 'HEAD^';
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

try {
    execFileSync('git', ['-C', repoRoot, 'diff', '--quiet', base, head, '--', ...RELEVANT], { stdio: 'ignore' });
    console.log(`should-build (catch-tracker): no relevant changes in ${base}..${head} — skipping build.`);
    process.exit(0); // skip
} catch {
    console.log(`should-build (catch-tracker): relevant changes in ${base}..${head} — building.`);
    process.exit(1); // build
}
