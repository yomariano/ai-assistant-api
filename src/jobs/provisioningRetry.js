const { supabaseAdmin } = require('../services/supabase');
const { provisionUserPhoneNumbers } = require('../services/provisioning');

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [60, 300, 900, 3600, 7200]; // 1min, 5min, 15min, 1hr, 2hr

let isRunning = false;

/**
 * Process failed provisioning queue items
 * Runs every minute to check for items that need retry
 */
async function processProvisioningQueue() {
  if (isRunning) {
    console.log('Provisioning retry job already running, skipping');
    return;
  }

  isRunning = true;

  try {
    // Get items ready for retry
    const { data: queueItems, error } = await supabaseAdmin
      .from('provisioning_queue')
      .select('*')
      .in('status', ['failed', 'pending'])
      .lt('attempts', MAX_ATTEMPTS)
      .lte('next_retry_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Failed to fetch provisioning queue:', error);
      return;
    }

    if (!queueItems || queueItems.length === 0) {
      return;
    }

    console.log(`Processing ${queueItems.length} provisioning queue item(s)`);

    for (const item of queueItems) {
      await processQueueItem(item);
    }
  } catch (error) {
    console.error('Provisioning retry job error:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Process a single queue item
 */
async function processQueueItem(item) {
  const { id, user_id, plan_id, numbers_requested, attempts } = item;

  console.log(`Retrying provisioning for user ${user_id}, attempt ${attempts + 1}`);

  // Mark as processing
  await supabaseAdmin
    .from('provisioning_queue')
    .update({
      status: 'processing',
      last_attempt_at: new Date().toISOString()
    })
    .eq('id', id);

  try {
    // Attempt provisioning
    const result = await provisionUserPhoneNumbers(user_id, plan_id);

    if (result.provisioned >= numbers_requested) {
      // Success - mark as completed
      await supabaseAdmin
        .from('provisioning_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          attempts: attempts + 1,
          result: result
        })
        .eq('id', id);

      console.log(`Provisioning succeeded for user ${user_id}`);
    } else {
      // Partial success - update and schedule retry if needed
      const remaining = numbers_requested - result.provisioned;
      await handlePartialSuccess(item, result, remaining);
    }
  } catch (error) {
    await handleRetryFailure(item, error);
  }
}

/**
 * Handle partial provisioning success
 */
async function handlePartialSuccess(item, result, remaining) {
  const { id, attempts } = item;
  const newAttempts = attempts + 1;

  if (newAttempts >= MAX_ATTEMPTS) {
    // Max attempts reached
    await supabaseAdmin
      .from('provisioning_queue')
      .update({
        status: 'partial',
        attempts: newAttempts,
        error_message: `Provisioned ${result.provisioned} of ${item.numbers_requested} numbers`,
        result: result
      })
      .eq('id', id);
  } else {
    // Schedule retry for remaining numbers
    const delay = RETRY_DELAYS[Math.min(newAttempts, RETRY_DELAYS.length - 1)];
    const nextRetry = new Date(Date.now() + delay * 1000);

    await supabaseAdmin
      .from('provisioning_queue')
      .update({
        status: 'pending',
        attempts: newAttempts,
        numbers_requested: remaining,
        next_retry_at: nextRetry.toISOString(),
        error_message: `Partial success: ${result.provisioned} provisioned, ${remaining} remaining`
      })
      .eq('id', id);
  }
}

/**
 * Handle provisioning retry failure
 */
async function handleRetryFailure(item, error) {
  const { id, attempts } = item;
  const newAttempts = attempts + 1;

  if (newAttempts >= MAX_ATTEMPTS) {
    // Max attempts reached - mark as permanently failed
    await supabaseAdmin
      .from('provisioning_queue')
      .update({
        status: 'max_attempts_reached',
        attempts: newAttempts,
        error_message: error.message
      })
      .eq('id', id);

    console.error(`Provisioning permanently failed for user ${item.user_id} after ${MAX_ATTEMPTS} attempts`);

    // TODO: Send alert to admin or notify user
  } else {
    // Schedule retry with exponential backoff
    const delay = RETRY_DELAYS[Math.min(newAttempts - 1, RETRY_DELAYS.length - 1)];
    const nextRetry = new Date(Date.now() + delay * 1000);

    await supabaseAdmin
      .from('provisioning_queue')
      .update({
        status: 'failed',
        attempts: newAttempts,
        error_message: error.message,
        next_retry_at: nextRetry.toISOString()
      })
      .eq('id', id);

    console.log(`Provisioning retry scheduled for user ${item.user_id} at ${nextRetry.toISOString()}`);
  }
}

/**
 * Start the provisioning retry job
 * Runs every 60 seconds
 */
function startProvisioningRetryJob() {
  console.log('Starting provisioning retry job');

  // Run immediately on startup
  processProvisioningQueue();

  // Then run every 60 seconds
  setInterval(processProvisioningQueue, 60 * 1000);
}

/**
 * Manually add item to provisioning queue
 */
async function queueProvisioning(userId, planId, numbersRequested) {
  const { data, error } = await supabaseAdmin
    .from('provisioning_queue')
    .insert({
      user_id: userId,
      plan_id: planId,
      numbers_requested: numbersRequested,
      status: 'pending',
      attempts: 0,
      next_retry_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  startProvisioningRetryJob,
  processProvisioningQueue,
  queueProvisioning
};
