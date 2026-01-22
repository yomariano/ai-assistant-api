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
const vapiTools = require('../services/vapiTools');

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
      case 'assistant-request':
        // VAPI calls this at the start of each call to get assistant config
        // We use this to inject the current date into the system prompt
        const assistantResponse = await handleAssistantRequest(message);
        return res.status(200).json(assistantResponse);

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
// VAPI TOOLS TEST ENDPOINT (Development Only)
// ============================================

/**
 * POST /api/vapi/tools/test
 * Test endpoint for booking tools - bypasses authentication
 * Use this to test tool functionality without making a phone call
 *
 * WARNING: This endpoint should be disabled in production!
 */
router.post('/tools/test', express.json(), async (req, res) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoint disabled in production' });
  }

  try {
    const { userId, toolName, toolArgs, customerPhone } = req.body;

    if (!userId || !toolName) {
      return res.status(400).json({
        error: 'userId and toolName are required',
        example: {
          userId: 'your-user-uuid',
          toolName: 'check_availability',
          toolArgs: { date: '2024-01-20' },
          customerPhone: '+1234567890'
        }
      });
    }

    console.log(`[Vapi Tools Test] Testing tool: ${toolName}`, toolArgs);

    // Build call context
    const callContext = {
      callId: `test-${Date.now()}`,
      customerPhone: customerPhone || '+15551234567',
      assistantId: 'test-assistant',
    };

    // Execute the tool
    const result = await vapiTools.handleToolCall(userId, toolName, toolArgs || {}, callContext);

    console.log(`[Vapi Tools Test] Result:`, result);

    res.json({
      success: true,
      toolName,
      toolArgs,
      result,
    });
  } catch (error) {
    console.error('[Vapi Tools Test] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// VAPI TOOLS ENDPOINT
// ============================================

/**
 * POST /api/vapi/tools
 * Handle tool calls from VAPI for booking operations
 * This endpoint is called by VAPI when the assistant invokes a tool
 */
router.post('/tools', express.json(), async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      console.warn('[Vapi Tools] Invalid tool call payload:', req.body);
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Extract tool call information
    const toolCall = message.toolCalls?.[0];
    const call = message.call;

    if (!toolCall) {
      console.warn('[Vapi Tools] No tool call in message');
      return res.status(400).json({ error: 'No tool call found' });
    }

    const toolName = toolCall.function?.name;
    const toolArgs = typeof toolCall.function?.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function?.arguments || {};

    console.log(`[Vapi Tools] Tool call: ${toolName}`, toolArgs);

    // Find the user associated with this call
    const userId = await findUserForCall(call);

    if (!userId) {
      console.warn(`[Vapi Tools] Could not find user for call: ${call?.id}`);
      return res.json({
        results: [{
          toolCallId: toolCall.id,
          result: JSON.stringify({
            success: false,
            error: 'Could not identify user for this call',
          }),
        }],
      });
    }

    // Build call context for the tool handler
    const callContext = {
      callId: call?.id,
      customerPhone: call?.customer?.number,
      assistantId: call?.assistantId,
    };

    // Execute the tool through the vapiTools service
    const result = await vapiTools.handleToolCall(userId, toolName, toolArgs, callContext);

    console.log(`[Vapi Tools] Tool result:`, result);

    // Return result in VAPI expected format
    res.json({
      results: [{
        toolCallId: toolCall.id,
        result: JSON.stringify(result),
      }],
    });
  } catch (error) {
    console.error('[Vapi Tools] Error handling tool call:', error);
    res.json({
      results: [{
        toolCallId: req.body?.message?.toolCalls?.[0]?.id || 'unknown',
        result: JSON.stringify({
          success: false,
          error: 'An error occurred while processing your request',
        }),
      }],
    });
  }
});

// ============================================
// EVENT HANDLERS
// ============================================

/**
 * Handle assistant-request event
 * VAPI calls this at the START of each call to get the assistant configuration.
 * We use this to dynamically inject the current date into the system prompt.
 */
async function handleAssistantRequest(message) {
  const { call } = message;

  console.log(`[Vapi Webhook] Assistant request for call from: ${call?.customer?.number || 'unknown'}`);

  try {
    // Find the user from the phone number or assistant ID
    const phoneNumberId = call?.phoneNumberId;
    const assistantId = call?.assistantId;

    let userId = null;
    let assistant = null;

    // Try to get assistant info from our database
    if (assistantId) {
      const { data } = await supabase
        .from('user_assistants')
        .select('*, users(email)')
        .eq('vapi_assistant_id', assistantId)
        .single();

      if (data) {
        userId = data.user_id;
        assistant = data;
      }
    }

    // If we found the assistant, inject current date into system prompt
    if (assistant) {
      const now = new Date();
      const currentDate = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Build the date-aware system prompt
      const datePrefix = `IMPORTANT: Today is ${currentDate}. The current timezone is ${timezone}. Use this as the reference for "today", "tomorrow", "next week", etc.\n\n`;

      const originalPrompt = assistant.system_prompt || '';
      const enhancedPrompt = datePrefix + originalPrompt;

      console.log(`[Vapi Webhook] Injecting current date (${currentDate}) into assistant prompt`);

      // Get booking tools if user has connected provider
      let tools = [];
      try {
        const { data: connections } = await supabase
          .from('provider_connections')
          .select('status')
          .eq('user_id', userId)
          .eq('status', 'connected');

        if (connections && connections.length > 0) {
          const serverUrl = process.env.VAPI_SERVER_URL || process.env.API_BASE_URL || 'https://dev.voicefleet.ai';
          tools = vapiTools.getBookingToolDefinitions(serverUrl);
          console.log(`[Vapi Webhook] Including ${tools.length} booking tools`);
        }
      } catch (toolsError) {
        console.error('[Vapi Webhook] Error fetching booking tools:', toolsError);
      }

      // Return the assistant configuration with updated prompt and tools
      return {
        assistant: {
          firstMessage: assistant.first_message,
          model: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            messages: [{ role: 'system', content: enhancedPrompt }],
            tools: tools
          },
          voice: {
            provider: assistant.voice_provider || 'vapi',
            voiceId: assistant.voice_id || 'Jess'
          }
        }
      };
    }
  } catch (error) {
    console.error('[Vapi Webhook] Error in assistant-request:', error);
  }

  // If anything fails, return empty to use default assistant config
  return {};
}

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

  // Update call history record (pass userId for inbound call inserts)
  await updateCallHistory(call.id, callData, userId);

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

  // Check if call record exists
  let existingCall = null;
  try {
    const { data } = await supabase
      .from('call_history')
      .select('id')
      .eq('vapi_call_id', call.id)
      .single();
    existingCall = data;
  } catch (e) {
    // Record doesn't exist, will create below
  }

  // If no record exists (inbound call), create one
  if (!existingCall) {
    const userId = await findUserForCall(call);
    if (userId) {
      console.log(`[Vapi Webhook] Creating call_history record for inbound call: ${call.id}`);
      try {
        const { error: insertError } = await supabase
          .from('call_history')
          .insert({
            user_id: userId,
            phone_number: call.customer?.number || 'Unknown',
            message: 'Inbound call',
            language: 'en',
            vapi_call_id: call.id,
            status: mapVapiStatus(call.status),
            created_at: new Date().toISOString(),
          });
        if (insertError) {
          console.error('[Vapi Webhook] Failed to insert inbound call:', insertError);
        }
      } catch (queryError) {
        console.error('💥 Query exception (handleStatusUpdate insert):', queryError);
      }
    } else {
      console.warn(`[Vapi Webhook] Cannot create call record - no user found for call: ${call.id}`);
    }
    return;
  }

  // Update existing call history record
  let error = null;
  try {
    const result = await supabase
      .from('call_history')
      .update({
        status: mapVapiStatus(call.status),
        updated_at: new Date().toISOString(),
      })
      .eq('vapi_call_id', call.id);
    error = result.error;
  } catch (queryError) {
    console.error('💥 Query exception (handleStatusUpdate):', queryError);
    error = queryError;
  }

  if (error) console.error('[Vapi Webhook] Failed to update call status:', error);
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
  let error = null;
  try {
    const result = await supabase
      .from('call_history')
      .update({
        transcript: artifact.transcript,
        updated_at: new Date().toISOString(),
      })
      .eq('vapi_call_id', call.id);
    error = result.error;
  } catch (queryError) {
    console.error('💥 Query exception (handleTranscript):', queryError);
    error = queryError;
  }

  if (error) console.error('[Vapi Webhook] Failed to update transcript:', error);
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
  let error = null;
  try {
    const result = await supabase.from('call_history').update({
      escalated: true,
      escalation_reason: 'Transfer requested',
      updated_at: new Date().toISOString(),
    }).eq('vapi_call_id', call.id);
    error = result.error;
  } catch (queryError) {
    console.error('💥 Query exception (handleTransferCall log escalation):', queryError);
    error = queryError;
  }

  if (error) console.error('[Vapi Webhook] Failed to log escalation:', error);

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
  try {
    const result = await supabase
      .from('call_history')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('vapi_call_id', call.id);
    if (result.error) {
      console.error('[Vapi Webhook] Failed to update hang status:', result.error);
    }
  } catch (queryError) {
    console.error('💥 Query exception (handleHang):', queryError);
  }
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
    try {
      const { data: phoneNumber, error } = await supabase
        .from('user_phone_numbers')
        .select('user_id')
        .eq('vapi_phone_id', call.phoneNumberId)
        .single();

      if (error) {
        console.error('[Vapi Webhook] Failed to lookup user by phoneNumberId:', error);
      } else if (phoneNumber?.user_id) {
        return phoneNumber.user_id;
      }
    } catch (queryError) {
      console.error('💥 Query exception (findUserForCall by phoneNumberId):', queryError);
    }
  }

  // Try to find by vapi_call_id in call_history
  try {
    const { data: callHistory, error } = await supabase
      .from('call_history')
      .select('user_id')
      .eq('vapi_call_id', call.id)
      .single();

    if (error) {
      console.error('[Vapi Webhook] Failed to lookup user by vapi_call_id:', error);
    } else if (callHistory?.user_id) {
      return callHistory.user_id;
    }
  } catch (queryError) {
    console.error('💥 Query exception (findUserForCall by vapi_call_id):', queryError);
  }

  // Try to find by assistant ID
  if (call.assistantId) {
    try {
      const { data: assistant, error } = await supabase
        .from('user_assistants')
        .select('user_id')
        .eq('vapi_assistant_id', call.assistantId)
        .single();

      if (error) {
        console.error('[Vapi Webhook] Failed to lookup user by assistantId:', error);
      } else if (assistant?.user_id) {
        return assistant.user_id;
      }
    } catch (queryError) {
      console.error('💥 Query exception (findUserForCall by assistantId):', queryError);
    }
  }

  return null;
}

/**
 * Get call history ID from Vapi call ID
 */
async function getCallHistoryId(vapiCallId) {
  try {
    const { data, error } = await supabase
      .from('call_history')
      .select('id')
      .eq('vapi_call_id', vapiCallId)
      .single();
    if (error) {
      console.error('[Vapi Webhook] Failed to get call_history id:', error);
      return null;
    }
    return data?.id || null;
  } catch (queryError) {
    console.error('💥 Query exception (getCallHistoryId):', queryError);
    return null;
  }
}

/**
 * Update call history with end-of-call data
 * Also handles inserting if record doesn't exist (inbound calls)
 */
async function updateCallHistory(vapiCallId, callData, userId = null) {
  try {
    // Check if record exists first
    const { data: existingCall } = await supabase
      .from('call_history')
      .select('id')
      .eq('vapi_call_id', vapiCallId)
      .single();

    if (!existingCall && userId) {
      // Insert new record for inbound call
      console.log(`[Vapi Webhook] Inserting call_history record for inbound call: ${vapiCallId}`);
      const { error: insertError } = await supabase
        .from('call_history')
        .insert({
          user_id: userId,
          phone_number: callData.customerNumber || 'Unknown',
          message: callData.summary || 'Inbound call',
          language: 'en',
          vapi_call_id: vapiCallId,
          status: 'completed',
          duration_seconds: callData.duration,
          transcript: callData.transcript,
          recording_url: callData.recordingUrl,
          ended_reason: callData.endedReason,
          ended_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('[Vapi Webhook] Failed to insert call history:', insertError);
      }
      return;
    }

    // Update existing record
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

    if (error) console.error('[Vapi Webhook] Failed to update call history:', error);
  } catch (queryError) {
    console.error('💥 Query exception (updateCallHistory):', queryError);
  }
}

/**
 * Get user's subscription plan info
 */
async function getUserPlanInfo(userId) {
  let subscription = null;
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('plan_id, status, trial_ends_at')
      .eq('user_id', userId)
      .single();
    if (error) {
      console.error('[Vapi Webhook] Failed to get subscription:', error);
    } else {
      subscription = data;
    }
  } catch (queryError) {
    console.error('💥 Query exception (getUserPlanInfo):', queryError);
  }

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
  try {
    const { data: assistant, error } = await supabase
      .from('user_assistants')
      .select('business_name')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('[Vapi Webhook] Failed to get business name:', error);
      return 'Your Business';
    }

    return assistant?.business_name || 'Your Business';
  } catch (queryError) {
    console.error('💥 Query exception (getBusinessName):', queryError);
    return 'Your Business';
  }
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
