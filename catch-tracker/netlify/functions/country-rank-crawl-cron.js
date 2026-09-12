/* Scheduled entry point for the country-rank backfill sweep — see
   netlify.toml for the cron declaration and _country-rank-crawl-core.js
   for why this exists (the bulk rankings endpoint never returns
   country_rank). No auth needed — Netlify doesn't expose scheduled
   functions over a public URL. See country-rank-crawl-run.js for the
   manual/backfill counterpart. */
const { runCountryRankCrawl } = require('./_country-rank-crawl-core');
const { COUNTRY_RANK_CRAWL_PER_RUN_CRON } = require('./_catch-constants');

const RUN_BUDGET_MS = 25000;

exports.handler = async () => {
    let result;
    try {
        result = await runCountryRankCrawl(RUN_BUDGET_MS, COUNTRY_RANK_CRAWL_PER_RUN_CRON);
    } catch (err) {
        result = { error: err.message };
    }
    return { statusCode: 200, body: JSON.stringify(result) };
};
