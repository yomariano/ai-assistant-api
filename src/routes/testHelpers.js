/**
 * Test Helper Routes
 * Only available when E2E_MODE=true
 * Used by Playwright E2E tests to simulate Stripe webhooks and other events
 */
const express = require('express');
const { supabaseAdmin } = require('../services/supabase');
const { PLAN_LIMITS } = require('../services/stripe');

const router = express.Router();

// Middleware to only allow in E2E mode
router.use((req, res, next) => {
  if (process.env.E2E_MODE !== 'true') {
    return res.status(403).json({
      error: { message: 'Test helpers only available in E2E mode' }
    });
  }
  next();
});

/**
 * POST /api/billing/test/simulate-checkout
 * Simulates a successful Stripe checkout.session.completed webhook
 * Creates all mock data directly in DB - no real API calls
 */
router.post('/simulate-checkout', async (req, res, next) => {
  try {
    const { userId, planId, customerId, subscriptionId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({
        error: { message: 'userId and planId are required' }
      });
    }

    const mockCustomerId = customerId || `cus_test_${Date.now()}`;
    const mockSubscriptionId = subscriptionId || `sub_test_${Date.now()}`;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // 1. Create or update user (in case it doesn't exist)
    const { error: userError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        email: `test_${userId.slice(-8)}@test.local`,
        full_name: 'Test User',
        stripe_customer_id: mockCustomerId,
        created_at: now.toISOString(),
      }, { onConflict: 'id' });

    if (userError) {
      throw userError;
    }

    // 2. Create subscription record
    const { error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        plan_id: planId,
        stripe_customer_id: mockCustomerId,
        stripe_subscription_id: mockSubscriptionId,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        updated_at: now.toISOString(),
      }, { onConflict: 'user_id' });

    if (subError) {
      throw subError;
    }

    // 3. Create mock assistant
    const { error: assistantError } = await supabaseAdmin
      .from('user_assistants')
      .upsert({
        user_id: userId,
        vapi_assistant_id: `vapi_test_${Date.now()}`,
        name: 'Test Assistant',
        first_message: 'Hi! How can I help you today?',
        system_prompt: 'You are a helpful AI assistant.',
        voice_id: 'jennifer',
        voice_provider: 'playht',
        business_name: 'Test Business',
        greeting_name: 'Test',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: 'user_id' });

    if (assistantError) {
      console.error('Error creating assistant:', assistantError);
    }

    // Get assistant ID
    const { data: assistant } = await supabaseAdmin
      .from('user_assistants')
      .select('id')
      .eq('user_id', userId)
      .single();

    // 4. Create mock phone numbers based on plan
    const phoneCount = PLAN_LIMITS[planId]?.phoneNumbers || 1;
    const phoneNumbers = [];

    // Delete existing phone numbers for this user
    await supabaseAdmin
      .from('user_phone_numbers')
      .delete()
      .eq('user_id', userId);

    for (let i = 0; i < phoneCount; i++) {
      const phoneNumber = `+1555${planId === 'starter' ? '100' : planId === 'growth' ? '200' : '300'}${String(i + 1).padStart(4, '0')}`;

      const { data: phone, error: phoneError } = await supabaseAdmin
        .from('user_phone_numbers')
        .insert({
          user_id: userId,
          phone_number: phoneNumber,
          telnyx_id: `telnyx_test_${Date.now()}_${i}`,
          vapi_id: `vapi_phone_test_${Date.now()}_${i}`,
          assistant_id: assistant?.id,
          label: `Phone ${i + 1}`,
          status: 'active',
          created_at: now.toISOString(),
        })
        .select()
        .single();

      if (!phoneError) {
        phoneNumbers.push(phone);
      }
    }

    res.json({
      success: true,
      message: 'Checkout simulation completed',
      subscription: {
        id: mockSubscriptionId,
        planId,
        status: 'active',
      },
      phoneNumbers: phoneNumbers.map(p => p.phone_number),
      assistant: assistant?.id,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-plan-change
 * Simulates a plan upgrade or downgrade (creates mock data, no real API calls)
 */
router.post('/simulate-plan-change', async (req, res, next) => {
  try {
    const { userId, oldPlanId, newPlanId } = req.body;

    if (!userId || !oldPlanId || !newPlanId) {
      return res.status(400).json({
        error: { message: 'userId, oldPlanId, and newPlanId are required' }
      });
    }

    const oldLimit = PLAN_LIMITS[oldPlanId]?.phoneNumbers || 1;
    const newLimit = PLAN_LIMITS[newPlanId]?.phoneNumbers || 1;

    // Update subscription
    await supabaseAdmin
      .from('user_subscriptions')
      .update({
        plan_id: newPlanId,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    // Get current phone count
    const { data: currentPhones } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    const currentCount = currentPhones?.length || 0;
    let result = { action: 'none' };

    if (newLimit > currentCount) {
      // UPGRADE: Add mock phone numbers
      const toAdd = newLimit - currentCount;
      for (let i = 0; i < toAdd; i++) {
        await supabaseAdmin
          .from('user_phone_numbers')
          .insert({
            user_id: userId,
            phone_number: `+1555${newPlanId === 'growth' ? '200' : '300'}${String(Date.now()).slice(-4)}${i}`,
            telnyx_id: `telnyx_test_upgrade_${Date.now()}_${i}`,
            vapi_id: `vapi_test_upgrade_${Date.now()}_${i}`,
            label: `Phone ${currentCount + i + 1}`,
            status: 'active',
            created_at: new Date().toISOString(),
          });
      }
      result = { action: 'upgrade', added: toAdd };
    } else if (newLimit < currentCount) {
      // DOWNGRADE: Release excess phone numbers (mark as released)
      const toRelease = currentCount - newLimit;
      const phonesToRelease = currentPhones.slice(-toRelease);
      for (const phone of phonesToRelease) {
        await supabaseAdmin
          .from('user_phone_numbers')
          .update({
            status: 'released',
            released_at: new Date().toISOString(),
          })
          .eq('id', phone.id);
      }
      result = { action: 'downgrade', released: toRelease };
    }

    res.json({
      success: true,
      message: `Plan changed from ${oldPlanId} to ${newPlanId}`,
      result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-cancellation
 * Simulates subscription cancellation (creates mock data, no real API calls)
 */
router.post('/simulate-cancellation', async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    // Update subscription status
    await supabaseAdmin
      .from('user_subscriptions')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    // Release all phone numbers (just update status, no real API calls)
    await supabaseAdmin
      .from('user_phone_numbers')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('status', 'active');

    // Delete assistant
    await supabaseAdmin
      .from('user_assistants')
      .delete()
      .eq('user_id', userId);

    res.json({
      success: true,
      message: 'Cancellation simulation completed',
      result: { numbersReleased: true, assistantDeleted: true },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/reset-user
 * Resets a test user to clean state (no subscription, no numbers, no assistant)
 */
router.post('/reset-user', async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    // Delete phone numbers
    await supabaseAdmin
      .from('user_phone_numbers')
      .delete()
      .eq('user_id', userId);

    // Delete assistant
    await supabaseAdmin
      .from('user_assistants')
      .delete()
      .eq('user_id', userId);

    // Delete subscription
    await supabaseAdmin
      .from('user_subscriptions')
      .delete()
      .eq('user_id', userId);

    // Delete usage
    await supabaseAdmin
      .from('usage_tracking')
      .delete()
      .eq('user_id', userId);

    // Delete trial usage
    await supabaseAdmin
      .from('trial_usage')
      .delete()
      .eq('user_id', userId);

    res.json({
      success: true,
      message: 'User reset to clean state',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/test/status
 * Check E2E mode status
 */
router.get('/status', (req, res) => {
  res.json({
    e2eMode: true,
    message: 'Test helpers are enabled',
  });
});

/**
 * GET /api/billing/test/db-state/:userId
 * Get raw database state for a user (for test verification)
 * Returns all related records directly from Supabase
 */
router.get('/db-state/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    // Get user record
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    // Get subscription record
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Get all phone numbers (including released)
    const { data: phoneNumbers, error: phoneError } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    // Get active phone numbers only
    const activePhones = phoneNumbers?.filter(p => p.status === 'active') || [];
    const releasedPhones = phoneNumbers?.filter(p => p.status === 'released') || [];

    // Get assistant record
    const { data: assistant, error: assistantError } = await supabaseAdmin
      .from('user_assistants')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Get usage tracking
    const { data: usage, error: usageError } = await supabaseAdmin
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
      .limit(1)
      .single();

    // Get provisioning queue
    const { data: provisioningQueue, error: provError } = await supabaseAdmin
      .from('provisioning_queue')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get trial usage
    const { data: trialUsage, error: trialError } = await supabaseAdmin
      .from('trial_usage')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Get call history (last 10 calls)
    const { data: callHistory, error: callHistoryError } = await supabaseAdmin
      .from('call_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      user: user || null,
      subscription: subscription || null,
      phoneNumbers: {
        all: phoneNumbers || [],
        active: activePhones,
        released: releasedPhones,
        activeCount: activePhones.length,
        releasedCount: releasedPhones.length,
      },
      assistant: assistant || null,
      usage: usage || null,
      trialUsage: trialUsage || null,
      callHistory: callHistory || [],
      provisioningQueue: provisioningQueue || [],
      _meta: {
        timestamp: new Date().toISOString(),
        userId,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/create-test-user
 * Creates a test user (required before start-trial since reset-user just deletes)
 */
router.post('/create-test-user', async (req, res, next) => {
  try {
    const { userId, email } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    const userEmail = email || `test_${userId.slice(-8)}@test.local`;
    const now = new Date();

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        email: userEmail,
        full_name: 'Test User',
        created_at: now.toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Test user created',
      user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-trial-usage
 * Simulates trial usage for testing
 */
router.post('/simulate-trial-usage', async (req, res, next) => {
  try {
    const { userId, callsMade, minutesUsed } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    // Update or insert trial usage
    const { data, error } = await supabaseAdmin
      .from('trial_usage')
      .upsert({
        user_id: userId,
        calls_made: callsMade || 0,
        minutes_used: minutesUsed || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Trial usage updated',
      trialUsage: data,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-call
 * Simulates a completed call for testing (creates call history and updates usage)
 */
router.post('/simulate-call', async (req, res, next) => {
  try {
    const { userId, phoneNumber, durationSeconds, status, message } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    const callPhoneNumber = phoneNumber || '+15551234567';
    const callDuration = durationSeconds || 60;
    const callStatus = status || 'completed';
    const callMessage = message || 'Test call message';
    const now = new Date();

    // Create call history record
    const { data: callHistory, error: callError } = await supabaseAdmin
      .from('call_history')
      .insert({
        user_id: userId,
        phone_number: callPhoneNumber,
        contact_name: 'Test Contact',
        message: callMessage,
        language: 'en',
        status: callStatus,
        duration_seconds: callStatus === 'completed' ? callDuration : null,
        vapi_call_id: `vapi_test_${Date.now()}`,
        created_at: now.toISOString(),
        ended_at: callStatus === 'completed' ? new Date(now.getTime() + callDuration * 1000).toISOString() : null,
      })
      .select()
      .single();

    if (callError) {
      throw callError;
    }

    // Update usage if call completed
    if (callStatus === 'completed') {
      const minutes = Math.ceil(callDuration / 60);

      // Check if user is on trial
      const { data: subscription } = await supabaseAdmin
        .from('user_subscriptions')
        .select('status')
        .eq('user_id', userId)
        .single();

      if (subscription?.status === 'trialing') {
        // Update trial usage - get existing first
        const { data: existingTrialUsage } = await supabaseAdmin
          .from('trial_usage')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (!existingTrialUsage) {
          // Create new record
          await supabaseAdmin
            .from('trial_usage')
            .insert({
              user_id: userId,
              calls_made: 1,
              minutes_used: minutes,
              updated_at: now.toISOString(),
            });
        } else {
          // Increment existing record
          await supabaseAdmin
            .from('trial_usage')
            .update({
              calls_made: existingTrialUsage.calls_made + 1,
              minutes_used: existingTrialUsage.minutes_used + minutes,
              updated_at: now.toISOString(),
            })
            .eq('user_id', userId);
        }
      } else {
        // Update regular usage - get or create period
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // First ensure the record exists
        const { data: existingUsage } = await supabaseAdmin
          .from('usage_tracking')
          .select('*')
          .eq('user_id', userId)
          .eq('period_start', periodStart.toISOString().split('T')[0])
          .single();

        if (!existingUsage) {
          // Create new record
          await supabaseAdmin
            .from('usage_tracking')
            .insert({
              user_id: userId,
              period_start: periodStart.toISOString().split('T')[0],
              period_end: periodEnd.toISOString().split('T')[0],
              minutes_used: minutes,
              calls_made: 1,
              updated_at: now.toISOString(),
            });
        } else {
          // Increment existing record
          await supabaseAdmin
            .from('usage_tracking')
            .update({
              minutes_used: existingUsage.minutes_used + minutes,
              calls_made: existingUsage.calls_made + 1,
              updated_at: now.toISOString(),
            })
            .eq('user_id', userId)
            .eq('period_start', periodStart.toISOString().split('T')[0]);
        }
      }
    }

    res.json({
      success: true,
      message: 'Call simulated',
      call: callHistory,
      durationMinutes: Math.ceil(callDuration / 60),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/set-usage
 * Sets usage to a specific value for testing limits
 */
router.post('/set-usage', async (req, res, next) => {
  try {
    const { userId, minutesUsed, callsMade, isTrial } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    const now = new Date();

    if (isTrial) {
      const { error } = await supabaseAdmin
        .from('trial_usage')
        .upsert({
          user_id: userId,
          calls_made: callsMade || 0,
          minutes_used: minutesUsed || 0,
          updated_at: now.toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
    } else {
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { error } = await supabaseAdmin
        .from('usage_tracking')
        .upsert({
          user_id: userId,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          minutes_used: minutesUsed || 0,
          calls_made: callsMade || 0,
          updated_at: now.toISOString(),
        }, { onConflict: 'user_id,period_start' });

      if (error) throw error;
    }

    res.json({
      success: true,
      message: 'Usage set',
      minutesUsed: minutesUsed || 0,
      callsMade: callsMade || 0,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-trial-expiry
 * Simulates trial expiration for testing
 */
router.post('/simulate-trial-expiry', async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    // Set trial end date to the past
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

    const { error } = await supabaseAdmin
      .from('user_subscriptions')
      .update({
        trial_ends_at: pastDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Trial expiry simulated',
      trialEndedAt: pastDate.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-webhook
 * Simulates a Stripe webhook event for testing
 */
router.post('/simulate-webhook', async (req, res, next) => {
  try {
    const { eventType, userId, data } = req.body;

    if (!eventType || !userId) {
      return res.status(400).json({
        error: { message: 'eventType and userId are required' }
      });
    }

    const {
      handleCheckoutCompleted,
      handleSubscriptionChange,
      handleSubscriptionDeleted
    } = require('../services/stripe');

    const now = new Date();
    let result = {};

    switch (eventType) {
      case 'checkout.session.completed':
        // For E2E testing, we can't call real Stripe APIs, so simulate the effect
        // directly in the database instead of calling handleCheckoutCompleted
        const planId = data?.planId || 'starter';
        const mockCustomerId = data?.customerId || `cus_test_${Date.now()}`;
        const mockSubscriptionId = data?.subscriptionId || `sub_test_${Date.now()}`;
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        // Update user with customer ID
        await supabaseAdmin
          .from('users')
          .update({ stripe_customer_id: mockCustomerId })
          .eq('id', userId);

        // Create subscription
        await supabaseAdmin
          .from('user_subscriptions')
          .upsert({
            user_id: userId,
            plan_id: planId,
            stripe_customer_id: mockCustomerId,
            stripe_subscription_id: mockSubscriptionId,
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            cancel_at_period_end: false,
            updated_at: now.toISOString()
          }, { onConflict: 'user_id' });

        // Create assistant
        await supabaseAdmin
          .from('user_assistants')
          .upsert({
            user_id: userId,
            vapi_assistant_id: `vapi_test_${Date.now()}`,
            name: 'Test Assistant',
            first_message: 'Hi! How can I help you today?',
            system_prompt: 'You are a helpful AI assistant.',
            voice_id: 'jennifer',
            voice_provider: 'playht',
            business_name: 'Test Business',
            greeting_name: 'Test',
            created_at: now.toISOString(),
            updated_at: now.toISOString()
          }, { onConflict: 'user_id' });

        // Get assistant ID
        const { data: assistant } = await supabaseAdmin
          .from('user_assistants')
          .select('id')
          .eq('user_id', userId)
          .single();

        // Create phone number(s)
        const phoneCount = PLAN_LIMITS[planId]?.phoneNumbers || 1;
        for (let i = 0; i < phoneCount; i++) {
          await supabaseAdmin
            .from('user_phone_numbers')
            .insert({
              user_id: userId,
              phone_number: `+1555${Date.now().toString().slice(-6)}${i}`,
              telnyx_id: `telnyx_webhook_${Date.now()}_${i}`,
              vapi_id: `vapi_webhook_${Date.now()}_${i}`,
              assistant_id: assistant?.id,
              label: `Phone ${i + 1}`,
              status: 'active',
              created_at: now.toISOString()
            });
        }

        result = { handled: 'checkout.session.completed', planId, phoneCount };
        break;

      case 'customer.subscription.updated':
        // Simulate subscription update
        const mockSubUpdate = {
          id: data?.subscriptionId || `sub_test_${Date.now()}`,
          customer: data?.customerId || `cus_test_${Date.now()}`,
          status: data?.status || 'active',
          metadata: {
            user_id: userId,
            plan_id: data?.planId || 'starter'
          },
          trial_start: data?.trialStart ? Math.floor(new Date(data.trialStart).getTime() / 1000) : null,
          trial_end: data?.trialEnd ? Math.floor(new Date(data.trialEnd).getTime() / 1000) : null,
          current_period_start: Math.floor(now.getTime() / 1000),
          current_period_end: Math.floor((now.getTime() + 30 * 24 * 60 * 60 * 1000) / 1000),
          cancel_at_period_end: data?.cancelAtPeriodEnd || false
        };
        await handleSubscriptionChange(mockSubUpdate);
        result = { handled: 'customer.subscription.updated', subscription: mockSubUpdate };
        break;

      case 'customer.subscription.deleted':
        // Simulate subscription deletion
        const mockSubDeleted = {
          id: data?.subscriptionId || `sub_test_${Date.now()}`,
          customer: data?.customerId,
          metadata: { user_id: userId }
        };
        await handleSubscriptionDeleted(mockSubDeleted);
        result = { handled: 'customer.subscription.deleted' };
        break;

      case 'invoice.payment_failed':
        // Update subscription to past_due
        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            status: 'past_due',
            updated_at: now.toISOString()
          })
          .eq('user_id', userId);
        result = { handled: 'invoice.payment_failed', newStatus: 'past_due' };
        break;

      case 'invoice.payment_succeeded':
        // Update subscription to active (simulate successful payment retry)
        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            status: 'active',
            updated_at: now.toISOString()
          })
          .eq('user_id', userId);
        result = { handled: 'invoice.payment_succeeded', newStatus: 'active' };
        break;

      default:
        return res.status(400).json({
          error: { message: `Unsupported event type: ${eventType}` }
        });
    }

    res.json({
      success: true,
      message: `Webhook ${eventType} simulated`,
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/add-phone-number
 * Simulates adding a phone number for a user (within plan limits)
 */
router.post('/add-phone-number', async (req, res, next) => {
  try {
    const { userId, phoneNumber, label } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    // Get user's subscription and plan limits
    const { data: subscription } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .single();

    if (!subscription) {
      return res.status(400).json({
        error: { code: 'NO_SUBSCRIPTION', message: 'User has no subscription' }
      });
    }

    const planLimits = PLAN_LIMITS[subscription.plan_id] || PLAN_LIMITS.starter;

    // Count current active phone numbers
    const { count: currentCount } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (currentCount >= planLimits.phoneNumbers) {
      return res.status(400).json({
        error: {
          code: 'PHONE_LIMIT_REACHED',
          message: `Plan allows ${planLimits.phoneNumbers} phone numbers. You have ${currentCount}.`
        }
      });
    }

    // Get assistant for linking
    const { data: assistant } = await supabaseAdmin
      .from('user_assistants')
      .select('id')
      .eq('user_id', userId)
      .single();

    const now = new Date();
    const newPhoneNumber = phoneNumber || `+1555${Date.now().toString().slice(-7)}`;

    const { data: phone, error } = await supabaseAdmin
      .from('user_phone_numbers')
      .insert({
        user_id: userId,
        phone_number: newPhoneNumber,
        telnyx_id: `telnyx_test_${Date.now()}`,
        vapi_id: `vapi_test_${Date.now()}`,
        assistant_id: assistant?.id,
        label: label || `Phone ${currentCount + 1}`,
        status: 'active',
        created_at: now.toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Phone number added',
      phone,
      currentCount: currentCount + 1,
      maxAllowed: planLimits.phoneNumbers
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/remove-phone-number
 * Simulates removing a phone number for a user
 */
router.post('/remove-phone-number', async (req, res, next) => {
  try {
    const { userId, phoneId, phoneNumber } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    let query = supabaseAdmin
      .from('user_phone_numbers')
      .update({
        status: 'released',
        released_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (phoneId) {
      query = query.eq('id', phoneId);
    } else if (phoneNumber) {
      query = query.eq('phone_number', phoneNumber);
    } else {
      // Remove the most recently added phone
      const { data: latestPhone } = await supabaseAdmin
        .from('user_phone_numbers')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!latestPhone) {
        return res.status(400).json({
          error: { message: 'No active phone numbers to remove' }
        });
      }

      query = supabaseAdmin
        .from('user_phone_numbers')
        .update({
          status: 'released',
          released_at: new Date().toISOString()
        })
        .eq('id', latestPhone.id);
    }

    const { error } = await query;
    if (error) throw error;

    // Get updated count
    const { count } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    res.json({
      success: true,
      message: 'Phone number removed',
      remainingCount: count
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/set-active-calls
 * Sets the number of active calls for a user (for testing concurrent limits)
 */
router.post('/set-active-calls', async (req, res, next) => {
  try {
    const { userId, activeCalls } = req.body;

    if (!userId || activeCalls === undefined) {
      return res.status(400).json({
        error: { message: 'userId and activeCalls are required' }
      });
    }

    const now = new Date();

    // Delete existing in-progress calls for this user
    await supabaseAdmin
      .from('call_history')
      .delete()
      .eq('user_id', userId)
      .eq('status', 'in-progress');

    // Create the specified number of in-progress calls
    const calls = [];
    for (let i = 0; i < activeCalls; i++) {
      const { data: call, error } = await supabaseAdmin
        .from('call_history')
        .insert({
          user_id: userId,
          phone_number: `+1555000${String(i).padStart(4, '0')}`,
          message: `Active call ${i + 1}`,
          status: 'in-progress',
          vapi_call_id: `vapi_active_${Date.now()}_${i}`,
          created_at: now.toISOString()
        })
        .select()
        .single();

      if (!error) calls.push(call);
    }

    res.json({
      success: true,
      message: `Set ${activeCalls} active calls`,
      activeCalls: calls.length,
      callIds: calls.map(c => c.id)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/test/active-calls/:userId
 * Get count of active (in-progress) calls for a user
 */
router.get('/active-calls/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    const { count, error } = await supabaseAdmin
      .from('call_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'in-progress');

    if (error) throw error;

    // Get plan limits
    const { data: subscription } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .single();

    const planLimits = subscription
      ? (PLAN_LIMITS[subscription.plan_id] || PLAN_LIMITS.starter)
      : PLAN_LIMITS.starter;

    res.json({
      activeCalls: count || 0,
      maxConcurrentCalls: planLimits.maxConcurrentCalls,
      canMakeMore: (count || 0) < planLimits.maxConcurrentCalls
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/real-provision
 * Triggers REAL provisioning with actual Telnyx/Vapi APIs
 * Use with caution - this costs money!
 */
router.post('/real-provision', async (req, res, next) => {
  try {
    const { userId, planId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({
        error: { message: 'userId and planId are required' }
      });
    }

    // Temporarily override E2E_MODE to use real providers
    const originalE2EMode = process.env.E2E_MODE;
    process.env.E2E_MODE = 'false';

    try {
      // Reset provider singletons and force new instances with real providers
      const { resetTelephonyProvider, getTelephonyProvider } = require('../adapters/telephony');
      const { resetVoiceProvider, getVoiceProvider } = require('../adapters/voice');

      // Reset the singletons
      resetTelephonyProvider();
      resetVoiceProvider();

      // Force new instances with the real providers (E2E_MODE is now 'false')
      getTelephonyProvider({ forceNew: true });
      getVoiceProvider({ forceNew: true });

      const { provisionUserPhoneNumbers } = require('../services/provisioning');

      console.log('[RealProvision] Starting REAL provisioning for user:', userId);
      const result = await provisionUserPhoneNumbers(userId, planId);
      console.log('[RealProvision] Result:', result);

      res.json({
        success: true,
        message: 'Real provisioning completed',
        result
      });
    } finally {
      // Restore E2E_MODE
      process.env.E2E_MODE = originalE2EMode;

      // Reset and reinitialize with mock providers
      const { resetTelephonyProvider, getTelephonyProvider } = require('../adapters/telephony');
      const { resetVoiceProvider, getVoiceProvider } = require('../adapters/voice');
      resetTelephonyProvider();
      resetVoiceProvider();
      getTelephonyProvider({ forceNew: true });
      getVoiceProvider({ forceNew: true });
    }
  } catch (error) {
    console.error('[RealProvision] Error:', error);
    next(error);
  }
});

/**
 * POST /api/billing/test/real-release
 * Releases a phone number using REAL Telnyx/Vapi APIs
 * Use with caution!
 */
router.post('/real-release', async (req, res, next) => {
  try {
    const { userId, phoneId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: { message: 'userId is required' }
      });
    }

    // Get the phone number record
    let query = supabaseAdmin
      .from('user_phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (phoneId) {
      query = query.eq('id', phoneId);
    }

    const { data: phones, error: fetchError } = await query;

    if (fetchError || !phones || phones.length === 0) {
      return res.status(404).json({
        error: { message: 'No active phone numbers found' }
      });
    }

    // Temporarily override E2E_MODE
    const originalE2EMode = process.env.E2E_MODE;
    process.env.E2E_MODE = 'false';

    try {
      // Reset provider singletons and force new instances with real providers
      const { resetTelephonyProvider, getTelephonyProvider } = require('../adapters/telephony');
      const { resetVoiceProvider, getVoiceProvider } = require('../adapters/voice');

      resetTelephonyProvider();
      resetVoiceProvider();
      getTelephonyProvider({ forceNew: true });
      getVoiceProvider({ forceNew: true });

      const { releasePhoneNumber } = require('../services/provisioning');

      const results = [];
      for (const phone of phones) {
        try {
          console.log('[RealRelease] Releasing:', phone.phone_number);
          await releasePhoneNumber(phone);
          results.push({ phoneNumber: phone.phone_number, released: true });
        } catch (releaseError) {
          console.error('[RealRelease] Failed:', releaseError.message);
          results.push({ phoneNumber: phone.phone_number, released: false, error: releaseError.message });
        }
      }

      res.json({
        success: true,
        message: 'Real release completed',
        results
      });
    } finally {
      process.env.E2E_MODE = originalE2EMode;

      // Reset and reinitialize with mock providers
      const { resetTelephonyProvider, getTelephonyProvider } = require('../adapters/telephony');
      const { resetVoiceProvider, getVoiceProvider } = require('../adapters/voice');
      resetTelephonyProvider();
      resetVoiceProvider();
      getTelephonyProvider({ forceNew: true });
      getVoiceProvider({ forceNew: true });
    }
  } catch (error) {
    console.error('[RealRelease] Error:', error);
    next(error);
  }
});

/**
 * DELETE /api/billing/test/real-cleanup/:userId
 * Full cleanup: cancel subscription, release all real numbers, delete assistant
 * Use after real integration tests
 */
router.delete('/real-cleanup/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const results = {
      subscriptionCanceled: false,
      numbersReleased: 0,
      assistantDeleted: false
    };

    // 1. Get all active phone numbers
    const { data: phones } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    // 2. Release real numbers (only if they have real Telnyx/Vapi IDs)
    if (phones && phones.length > 0) {
      const realPhones = phones.filter(p =>
        p.telnyx_id && !p.telnyx_id.includes('test') && !p.telnyx_id.includes('mock')
      );

      if (realPhones.length > 0) {
        const originalE2EMode = process.env.E2E_MODE;
        process.env.E2E_MODE = 'false';

        try {
          const { resetTelephonyProvider, getTelephonyProvider } = require('../adapters/telephony');
          const { resetVoiceProvider, getVoiceProvider } = require('../adapters/voice');

          resetTelephonyProvider();
          resetVoiceProvider();
          getTelephonyProvider({ forceNew: true });
          getVoiceProvider({ forceNew: true });

          const { releasePhoneNumber } = require('../services/provisioning');

          for (const phone of realPhones) {
            try {
              await releasePhoneNumber(phone);
              results.numbersReleased++;
            } catch (e) {
              console.error('[RealCleanup] Failed to release:', phone.phone_number, e.message);
            }
          }
        } finally {
          process.env.E2E_MODE = originalE2EMode;

          const { resetTelephonyProvider, getTelephonyProvider } = require('../adapters/telephony');
          const { resetVoiceProvider, getVoiceProvider } = require('../adapters/voice');
          resetTelephonyProvider();
          resetVoiceProvider();
          getTelephonyProvider({ forceNew: true });
          getVoiceProvider({ forceNew: true });
        }
      }
    }

    // 3. Delete assistant from Vapi (only if it has a real Vapi ID)
    const { data: assistant } = await supabaseAdmin
      .from('user_assistants')
      .select('vapi_assistant_id')
      .eq('user_id', userId)
      .single();

    if (assistant?.vapi_assistant_id && !assistant.vapi_assistant_id.includes('test') && !assistant.vapi_assistant_id.includes('mock')) {
      const originalE2EMode = process.env.E2E_MODE;
      process.env.E2E_MODE = 'false';

      try {
        const { resetVoiceProvider, getVoiceProvider } = require('../adapters/voice');
        resetVoiceProvider();
        const voiceProvider = getVoiceProvider({ forceNew: true });
        await voiceProvider.deleteAssistant(assistant.vapi_assistant_id);
        results.assistantDeleted = true;
      } catch (e) {
        console.error('[RealCleanup] Failed to delete assistant:', e.message);
      } finally {
        process.env.E2E_MODE = originalE2EMode;

        const { resetVoiceProvider, getVoiceProvider } = require('../adapters/voice');
        resetVoiceProvider();
        getVoiceProvider({ forceNew: true });
      }
    }

    // 4. Clean up database
    await supabaseAdmin.from('user_assistants').delete().eq('user_id', userId);
    await supabaseAdmin.from('user_phone_numbers').delete().eq('user_id', userId);
    await supabaseAdmin.from('user_subscriptions').delete().eq('user_id', userId);
    await supabaseAdmin.from('trial_usage').delete().eq('user_id', userId);
    await supabaseAdmin.from('usage_tracking').delete().eq('user_id', userId);
    await supabaseAdmin.from('call_history').delete().eq('user_id', userId);
    results.subscriptionCanceled = true;

    res.json({
      success: true,
      message: 'Real cleanup completed',
      results
    });
  } catch (error) {
    console.error('[RealCleanup] Error:', error);
    next(error);
  }
});

module.exports = router;
