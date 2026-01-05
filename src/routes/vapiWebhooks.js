/**
 * Vapi Webhook Routes
 *
 * Handles webhook events from Vapi including:
 * - end-of-call-report: Call completed, trigger notifications
 * - status-update: Real-time call status changes
 * - transcript: Transcript updates
 * - function-call: Tool invocations (e.g., transferCall)
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const notificationService = require('../services/notifications');
const usageTracking = require('../services/usageTracking');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// WEBHOOK ENDPOINT
// ============================================

/**
 * POST /api/vapi/webhook
 * Main webhook endpoint for all Vapi events
 */
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.type) {
      console.warn('Invalid Vapi webhook payload:', req.body);
      return res.status(400).json({ error: 'Invalid payload' });
    }

    console.log(`[Vapi Webhook] Received event: ${message.type}`);

    // Route to appropriate handler based on event type
    switch (message.type) {
      case 'end-of-call-report':
        await handleEndOfCallReport(message);
        break;

      case 'status-update':
        await handleStatusUpdate(message);
        break;

      case 'transcript':
        await handleTranscript(message);
        break;

      case 'function-call':
        await handleFunctionCall(message);
        break;

      case 'hang':
        await handleHang(message);
        break;

      case 'speech-update':
        // Ignore speech updates, too frequent
        break;

      default:
        console.log(`[Vapi Webhook] Unhandled event type: ${message.type}`);
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Vapi Webhook] Error processing webhook:', error);
    // Still return 200 to prevent retries for processing errors
    res.status(200).json({ received: true, error: error.message });
  }
});

// ============================================
// EVENT HANDLERS
// ============================================

/**
 * Handle end-of-call-report event
 * This is the main event for triggering notifications
 */
async function handleEndOfCallReport(message) {
  const { call, artifact } = message;

  if (!call) {
    console.warn('[Vapi Webhook] end-of-call-report missing call data');
    return;
  }

  console.log(`[Vapi Webhook] Call ended: ${call.id}, reason: ${call.endedReason}`);

  // Extract call data
  const callData = {
    vapiCallId: call.id,
    status: call.status || 'ended',
    endedReason: call.endedReason,
    duration: call.duration || 0,
    cost: call.cost || 0,
    customerNumber: call.customer?.number,
    phoneNumberId: call.phoneNumberId,
    transcript: artifact?.transcript,
    summary: artifact?.summary,
    recordingUrl: artifact?.recordingUrl,
    stereoRecordingUrl: artifact?.stereoRecordingUrl,
    messages: artifact?.messages,
  };

  // Find the user associated with this call
  const userId = await findUserForCall(call);

  if (!userId) {
    console.warn(`[Vapi Webhook] Could not find user for call: ${call.id}`);
    return;
  }

  // Get user's subscription plan for billing
  const { planId, isTrial } = await getUserPlanInfo(userId);

  // Update call history record
  await updateCallHistory(call.id, callData);

  // Get call history ID for usage tracking
  const callHistoryId = await getCallHistoryId(call.id);

  // Record call usage and calculate charges
  const vapiCostCents = Math.round((call.cost || 0) * 100);
  try {
    const usageResult = await usageTracking.recordCall(
      userId,
      planId,
      vapiCostCents,
      callHistoryId,
      isTrial
    );
    console.log(`[Vapi Webhook] Usage recorded: ${usageResult.callsUsed} calls, ${usageResult.costCents} cents charged`);
  } catch (usageError) {
    console.error(`[Vapi Webhook] Failed to record usage:`, usageError);
  }

  // Determine event type for notifications
  let eventType = 'call_complete';

  if (call.endedReason === 'customer-did-not-answer') {
    eventType = 'missed_call';
  } else if (call.endedReason === 'voicemail') {
    eventType = 'voicemail';
  } else if (callData.summary?.toLowerCase().includes('message')) {
    eventType = 'message_taken';
  }

  // Check if call was escalated
  const wasEscalated = artifact?.messages?.some(
    (m) => m.toolCalls?.some((tc) => tc.function?.name === 'transferCall')
  );

  if (wasEscalated) {
    eventType = 'escalation';
    callData.escalationReason = 'Call transferred to human';
  }

  // Send notifications
  try {
    const notificationResult = await notificationService.notifyCallEvent({
      userId,
      callId: await getCallHistoryId(call.id),
      eventType,
      callData: {
        ...callData,
        businessName: await getBusinessName(userId),
      },
    });

    console.log(`[Vapi Webhook] Notification result:`, notificationResult);
  } catch (error) {
    console.error(`[Vapi Webhook] Failed to send notifications:`, error);
  }
}

/**
 * Handle status-update event
 * Real-time call status changes
 */
async function handleStatusUpdate(message) {
  const { call } = message;

  if (!call) return;

  console.log(`[Vapi Webhook] Status update: ${call.id} -> ${call.status}`);

  // Update call history with current status
  const { error } = await supabase
    .from('call_history')
    .update({
      status: mapVapiStatus(call.status),
      updated_at: new Date().toISOString(),
    })
    .eq('vapi_call_id', call.id);

  if (error) {
    console.error('[Vapi Webhook] Failed to update call status:', error);
  }
}

/**
 * Handle transcript event
 * Partial or final transcript updates
 */
async function handleTranscript(message) {
  const { call, artifact } = message;

  if (!call || !artifact?.transcript) return;

  // Store transcript update (could be used for real-time display)
  console.log(`[Vapi Webhook] Transcript update for call: ${call.id}`);

  // Update call history with latest transcript
  const { error } = await supabase
    .from('call_history')
    .update({
      transcript: artifact.transcript,
      updated_at: new Date().toISOString(),
    })
    .eq('vapi_call_id', call.id);

  if (error) {
    console.error('[Vapi Webhook] Failed to update transcript:', error);
  }
}

/**
 * Handle function-call event
 * Tool invocations like transferCall
 */
async function handleFunctionCall(message) {
  const { call, functionCall } = message;

  if (!call || !functionCall) return;

  console.log(`[Vapi Webhook] Function call: ${functionCall.name} for call: ${call.id}`);

  // Handle specific function calls
  if (functionCall.name === 'transferCall') {
    await handleTransferCall(call, functionCall);
  }
}

/**
 * Handle transfer call function
 */
async function handleTransferCall(call, functionCall) {
  const userId = await findUserForCall(call);

  if (!userId) return;

  // Log the escalation
  const { error } = await supabase.from('call_history').update({
    escalated: true,
    escalation_reason: 'Transfer requested',
    updated_at: new Date().toISOString(),
  }).eq('vapi_call_id', call.id);

  if (error) {
    console.error('[Vapi Webhook] Failed to log escalation:', error);
  }

  // Send immediate escalation notification
  try {
    await notificationService.notifyCallEvent({
      userId,
      callId: await getCallHistoryId(call.id),
      eventType: 'escalation',
      callData: {
        customerNumber: call.customer?.number,
        escalationReason: 'Customer requested transfer to human',
        businessName: await getBusinessName(userId),
      },
    });
  } catch (error) {
    console.error('[Vapi Webhook] Failed to send escalation notification:', error);
  }
}

/**
 * Handle hang event
 * Call was hung up
 */
async function handleHang(message) {
  const { call } = message;

  if (!call) return;

  console.log(`[Vapi Webhook] Call hung up: ${call.id}`);

  // Update call history
  await supabase
    .from('call_history')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('vapi_call_id', call.id);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Find the user ID associated with a call
 */
async function findUserForCall(call) {
  // Try to find by phoneNumberId in user_phone_numbers
  if (call.phoneNumberId) {
    const { data: phoneNumber } = await supabase
      .from('user_phone_numbers')
      .select('user_id')
      .eq('vapi_phone_id', call.phoneNumberId)
      .single();

    if (phoneNumber?.user_id) {
      return phoneNumber.user_id;
    }
  }

  // Try to find by vapi_call_id in call_history
  const { data: callHistory } = await supabase
    .from('call_history')
    .select('user_id')
    .eq('vapi_call_id', call.id)
    .single();

  if (callHistory?.user_id) {
    return callHistory.user_id;
  }

  // Try to find by assistant ID
  if (call.assistantId) {
    const { data: assistant } = await supabase
      .from('user_assistants')
      .select('user_id')
      .eq('vapi_assistant_id', call.assistantId)
      .single();

    if (assistant?.user_id) {
      return assistant.user_id;
    }
  }

  return null;
}

/**
 * Get call history ID from Vapi call ID
 */
async function getCallHistoryId(vapiCallId) {
  const { data } = await supabase
    .from('call_history')
    .select('id')
    .eq('vapi_call_id', vapiCallId)
    .single();

  return data?.id;
}

/**
 * Update call history with end-of-call data
 */
async function updateCallHistory(vapiCallId, callData) {
  const { error } = await supabase
    .from('call_history')
    .update({
      status: 'completed',
      duration_seconds: callData.duration,
      cost: callData.cost,
      transcript: callData.transcript,
      summary: callData.summary,
      recording_url: callData.recordingUrl,
      ended_reason: callData.endedReason,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('vapi_call_id', vapiCallId);

  if (error) {
    console.error('[Vapi Webhook] Failed to update call history:', error);
  }
}

/**
 * Get user's subscription plan info
 */
async function getUserPlanInfo(userId) {
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('plan_id, status, trial_ends_at')
    .eq('user_id', userId)
    .single();

  if (!subscription) {
    // Default to starter plan if no subscription found
    return { planId: 'starter', isTrial: false };
  }

  const isTrial = subscription.status === 'trialing' ||
    (subscription.trial_ends_at && new Date(subscription.trial_ends_at) > new Date());

  return {
    planId: subscription.plan_id || 'starter',
    isTrial
  };
}

/**
 * Get business name for a user
 */
async function getBusinessName(userId) {
  const { data: assistant } = await supabase
    .from('user_assistants')
    .select('business_name')
    .eq('user_id', userId)
    .single();

  return assistant?.business_name || 'Your Business';
}

/**
 * Map Vapi status to our status
 */
function mapVapiStatus(vapiStatus) {
  const statusMap = {
    queued: 'initiated',
    ringing: 'ringing',
    'in-progress': 'in-progress',
    forwarding: 'forwarding',
    ended: 'completed',
  };

  return statusMap[vapiStatus] || vapiStatus;
}

// ============================================
// WEBHOOK VERIFICATION (Optional)
// ============================================

/**
 * Verify Vapi webhook signature (if configured)
 */
function verifyWebhookSignature(req) {
  const signature = req.headers['x-vapi-signature'];
  const secret = process.env.VAPI_WEBHOOK_SECRET;

  if (!secret) {
    // No secret configured, skip verification
    return true;
  }

  if (!signature) {
    console.warn('[Vapi Webhook] Missing signature header');
    return false;
  }

  // TODO: Implement actual signature verification when Vapi supports it
  return true;
}

module.exports = router;
