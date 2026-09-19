/* Scheduled entry point for the score-poll sweep — see netlify.toml for the
   cron declaration (every 5 minutes: this is the "live" part of "live score
   tracker," so it needs the tightest cadence the repo's cron conventions
   comfortably support). No auth needed — Netlify doesn't expose scheduled
   functions over a public URL. See scores-poll-run.js for the manual/
   backfill counterpart. */
const { runScorePollBatch } = require('./_scores-poll-core');
const { SCORE_POLL_PER_RUN_CRON } = require('./_std-constants');

const RUN_BUDGET_MS = 25000;

exports.handler = async () => {
    let result;
    try {
        result = await runScorePollBatch(RUN_BUDGET_MS, SCORE_POLL_PER_RUN_CRON);
    } catch (err) {
        result = { error: err.message };
    }
    return { statusCode: 200, body: JSON.stringify(result) };
};
