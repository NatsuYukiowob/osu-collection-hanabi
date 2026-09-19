/* Scheduled entry point for the peer best-plays sweep (farm helper) — see
   netlify.toml for the cron declaration (every 10 minutes: between
   rankings' hourly and score-poll's 5-min cadence). No auth needed —
   Netlify doesn't expose scheduled functions over a public URL. See
   peer-crawl-run.js for the manual/backfill counterpart. */
const { runPeerCrawl } = require('./_peer-crawl-core');
const { PEER_CRAWL_PER_RUN_CRON } = require('./_std-constants');

const RUN_BUDGET_MS = 25000;

exports.handler = async () => {
    let result;
    try {
        result = await runPeerCrawl(RUN_BUDGET_MS, PEER_CRAWL_PER_RUN_CRON);
    } catch (err) {
        result = { error: err.message };
    }
    return { statusCode: 200, body: JSON.stringify(result) };
};
