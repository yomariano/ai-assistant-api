const cron = require('node-cron');
const { supabaseAdmin } = require('../services/supabase');
const { createCall } = require('../services/vapi');

/**
 * Process pending scheduled calls
 * Runs every minute to check for calls that need to be executed
 */
async function processScheduledCalls() {
  try {
    const now = new Date().toISOString();

    // Get all pending calls that are due
    const { data: dueCalls, error } = await supabaseAdmin
      .from('scheduled_calls')
      .select(`
        *,
        users:user_id (
          full_name,
          date_of_birth,
          address
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_time', now);

    if (error) {
      console.error('Failed to fetch scheduled calls:', error);
      return;
    }

    if (!dueCalls || dueCalls.length === 0) {
      return;
    }

    console.log(`Processing ${dueCalls.length} scheduled call(s)...`);

    for (const scheduledCall of dueCalls) {
      try {
        // Mark as processing
        await supabaseAdmin
          .from('scheduled_calls')
          .update({ status: 'processing' })
          .eq('id', scheduledCall.id);

        // Get user profile
        const userProfile = {
          fullName: scheduledCall.users?.full_name,
          dateOfBirth: scheduledCall.users?.date_of_birth,
          address: scheduledCall.users?.address
        };

        // Create the call via VAPI
        const vapiResponse = await createCall({
          phoneNumber: scheduledCall.phone_number.replace(/[\s\-()]/g, ''),
          message: scheduledCall.message,
          language: scheduledCall.language,
          userProfile
        });

        // Store in call history
        await supabaseAdmin
          .from('call_history')
          .insert({
            user_id: scheduledCall.user_id,
            phone_number: scheduledCall.phone_number,
            contact_name: scheduledCall.contact_name,
            message: scheduledCall.message,
            language: scheduledCall.language,
            vapi_call_id: vapiResponse.id,
            status: 'initiated',
            created_at: new Date().toISOString()
          });

        // Mark scheduled call as completed
        await supabaseAdmin
          .from('scheduled_calls')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', scheduledCall.id);

        console.log(`Successfully executed scheduled call ${scheduledCall.id}`);
      } catch (callError) {
        console.error(`Failed to execute scheduled call ${scheduledCall.id}:`, callError);

        // Mark as failed
        await supabaseAdmin
          .from('scheduled_calls')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', scheduledCall.id);
      }
    }
  } catch (error) {
    console.error('Error in scheduled calls job:', error);
  }
}

/**
 * Start the scheduled calls cron job
 * Runs every minute
 */
function startScheduledCallsJob() {
  console.log('Starting scheduled calls job...');

  // Run every minute
  cron.schedule('* * * * *', () => {
    processScheduledCalls();
  });

  // Also run immediately on startup
  processScheduledCalls();
}

module.exports = {
  startScheduledCallsJob,
  processScheduledCalls
};
