/* Scheduled entry point for the rankings sweep — see netlify.toml for the
   cron declaration (hourly: pp-rankings move slowly, and this cron doubles
   as "discover newly-ranked players" for the score-poller's queue). No auth
   needed — Netlify doesn't expose scheduled functions over a public URL.
   See rankings-crawl-run.js for the manual/backfill counterpart. */
const { runRankingsCrawl } = require('./_rankings-crawl-core');

const RUN_BUDGET_MS = 25000;

exports.handler = async () => {
    let result;
    try {
        result = await runRankingsCrawl(RUN_BUDGET_MS);
    } catch (err) {
        result = { error: err.message };
    }
    return { statusCode: 200, body: JSON.stringify(result) };
};
