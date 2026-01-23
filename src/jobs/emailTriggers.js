/**
 * Email Triggers Job
 *
 * Scheduled job that processes automated email triggers.
 * Runs every 15 minutes to check for users matching trigger conditions.
 */

const cron = require('node-cron');
const { processTriggers } = require('../services/triggerEngine');

// Flag to prevent overlapping runs
let isRunning = false;

/**
 * Process email triggers
 * Called by the cron job
 */
async function runEmailTriggers() {
  // Prevent overlapping runs
  if (isRunning) {
    console.log('[EmailTriggers] Previous run still in progress, skipping...');
    return;
  }

  isRunning = true;

  try {
    console.log('[EmailTriggers] Starting scheduled trigger processing...');
    const startTime = Date.now();

    const results = await processTriggers();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[EmailTriggers] Completed in ${duration}s - Sent: ${results.sent}, Skipped: ${results.skipped}, Errors: ${results.errors}`);

  } catch (error) {
    console.error('[EmailTriggers] Error in scheduled job:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the email triggers cron job
 * Runs every 15 minutes
 */
function startEmailTriggersJob() {
  console.log('[EmailTriggers] Starting email triggers job (runs every 15 minutes)...');

  // Run every 15 minutes at minute 0, 15, 30, 45
  cron.schedule('0,15,30,45 * * * *', () => {
    runEmailTriggers();
  });

  // Optional: Run on startup (with a small delay to let server fully initialize)
  // Uncomment the following if you want triggers to run immediately on server start
  // setTimeout(() => runEmailTriggers(), 10000);
}

module.exports = {
  startEmailTriggersJob,
  runEmailTriggers, // Exported for manual triggering via API
};
