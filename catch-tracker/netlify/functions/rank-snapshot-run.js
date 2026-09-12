/* Manual/backfill trigger for the daily rank-history snapshot — same core
   logic as rank-snapshot-cron.js (see _rank-snapshot-core.js), but
   reachable over plain HTTP, so it requires a shared secret
   (CATCH_TRACKER_CRAWL_SECRET env var) via the x-catch-tracker-secret
   header. Used to seed the first day's snapshot right after this feature
   ships, rather than waiting on the daily cron. */
const { runRankSnapshot } = require('./_rank-snapshot-core');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }

    const secret = event.headers['x-catch-tracker-secret'] || event.headers['X-Catch-Tracker-Secret'];
    if (!process.env.CATCH_TRACKER_CRAWL_SECRET || secret !== process.env.CATCH_TRACKER_CRAWL_SECRET) {
        return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    try {
        const result = await runRankSnapshot();
        return { statusCode: 200, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }, body: JSON.stringify(result) };
    } catch (err) {
        return { statusCode: 500, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: err.message }) };
    }
};
