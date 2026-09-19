/* Scheduled entry point for the daily rank-history snapshot — see
   netlify.toml for the cron declaration (once a day; rank movement is
   slow enough that anything tighter would be wasted runs — see
   _rank-snapshot-core.js for what this actually stores). No auth needed
   — Netlify doesn't expose scheduled functions over a public URL. See
   rank-snapshot-run.js for the manual/backfill counterpart. */
const { runRankSnapshot } = require('./_rank-snapshot-core');

exports.handler = async () => {
    let result;
    try {
        result = await runRankSnapshot();
    } catch (err) {
        result = { error: err.message };
    }
    return { statusCode: 200, body: JSON.stringify(result) };
};
