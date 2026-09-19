/* Manual/backfill trigger for the score-poll sweep — same core logic as
   scores-poll-cron.js (see _scores-poll-core.js), but reachable over plain
   HTTP, so it requires a shared secret (STD_TRACKER_CRAWL_SECRET env var)
   via the x-std-tracker-secret header. Useful for seeding the feed right
   after setup, and for testing de-dup (calling it twice in a row should add
   zero new feed entries the second time if no real new scores landed). */
const { runScorePollBatch } = require('./_scores-poll-core');
const { SCORE_POLL_PER_RUN_MANUAL } = require('./_std-constants');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const RUN_BUDGET_MS = 9000; // regular (non-scheduled) functions get a much shorter timeout than the 30s scheduled budget

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }

    const secret = event.headers['x-std-tracker-secret'] || event.headers['X-Std-Tracker-Secret'];
    if (!process.env.STD_TRACKER_CRAWL_SECRET || secret !== process.env.STD_TRACKER_CRAWL_SECRET) {
        return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    try {
        const result = await runScorePollBatch(RUN_BUDGET_MS, SCORE_POLL_PER_RUN_MANUAL);
        return { statusCode: 200, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }, body: JSON.stringify(result) };
    } catch (err) {
        return { statusCode: 500, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: err.message }) };
    }
};
