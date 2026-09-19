/* Netlify "ignore" command for the std Tracker site — decides whether a
   push actually needs a fresh build+deploy of THIS site. Wired up in
   std-tracker/netlify.toml as `ignore = "node scripts/should-build.mjs"`.
   Ported from catch-tracker's own scripts/should-build.mjs, which fixed a
   real, 100%-reproducible bug the hard way — see that file's own comment
   for the full story. Short version: Netlify's "Base directory" for this
   site is std-tracker/, and Netlify runs the ignore command with CWD
   already inside that base directory — so a root-relative pathspec like
   `std-tracker/js` resolved from that CWD would ask git for changes under
   std-tracker/std-tracker/js, which never exists, and every diff would
   always come back empty. Fixed by resolving the true repo root with `git
   rev-parse --show-toplevel` and pinning the diff there via `-C`.

   Also carries catch-tracker's other fix: on a brand-new site with no prior
   successful build, Netlify sets CACHED_COMMIT_REF to the SAME commit as
   COMMIT_REF (not empty) — treat base===head as "no usable cache info" too,
   not just an unset/missing CACHED_COMMIT_REF, or the very first deploy
   would skip itself. */
import { execFileSync } from 'node:child_process';

const RELEVANT = [
    'std-tracker/index.html', 'std-tracker/rankings.html', 'std-tracker/feed.html',
    'std-tracker/player.html', 'std-tracker/map.html', 'std-tracker/maps.html',
    'std-tracker/goals.html', 'std-tracker/discord.html',
    'std-tracker/top-plays.html', 'std-tracker/farm-trending.html',
    'std-tracker/farm-helper.html',
    'std-tracker/css', 'std-tracker/js', 'std-tracker/assets',
    'std-tracker/netlify', 'std-tracker/netlify.toml',
    'std-tracker/package.json', 'std-tracker/package-lock.json',
];

const head = process.env.COMMIT_REF || 'HEAD';
const cached = process.env.CACHED_COMMIT_REF;
const base = (cached && cached !== head) ? cached : 'HEAD^';
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

try {
    execFileSync('git', ['-C', repoRoot, 'diff', '--quiet', base, head, '--', ...RELEVANT], { stdio: 'ignore' });
    console.log(`should-build (std-tracker): no relevant changes in ${base}..${head} — skipping build.`);
    process.exit(0); // skip
} catch {
    console.log(`should-build (std-tracker): relevant changes in ${base}..${head} — building.`);
    process.exit(1); // build
}
