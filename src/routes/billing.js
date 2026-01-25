const express = require('express');
const { authenticate } = require('../middleware/auth');
const { supabaseAdmin } = require('../services/supabase');
const {
  stripe,
  getPaymentLink,
  handleCheckoutCompleted,
  createPortalSession,
  handleSubscriptionChange,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  getSubscription,
  getPlans,
  calculateOverage,
  getPlanLimits,
  getOverageRate,
  PLAN_LIMITS,
  PAYMENT_LINKS,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_MODE
} = require('../services/stripe');
const {
  detectRegion,
  getRegionConfig,
  getAllPricingForRegion,
  getPaymentLinkForRegion,
  getClientIp,
} = require('../services/geoLocation');
const usageTracking = require('../services/usageTracking');
const numberPool = require('../services/numberPool');

const router = express.Router();

/**
 * GET /api/billing/region
 * Detect user's region and return geo-targeted pricing
 */
router.get('/region', async (req, res, next) => {
  try {
    // Allow override via query param for testing
    let region = req.query.region;

    if (!region) {
      const clientIp = getClientIp(req);
      region = await detectRegion(clientIp);
    }

    const pricing = getAllPricingForRegion(region);

    res.json({
      detected: !req.query.region,
      ...pricing,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/plans
 * Get all available subscription plans (legacy - use /region instead)
 */
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await getPlans();
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/subscription
 * Get current user's subscription
 */
router.get('/subscription', authenticate, async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.userId);

    if (!subscription) {
      return res.json({
        status: 'none',
        message: 'No active subscription'
      });
    }

    // Get usage for current period
    const { data: usage } = await supabaseAdmin
      .from('usage_tracking')
      .select('*')
      .eq('user_id', req.userId)
      .gte('period_start', new Date().toISOString().slice(0, 7) + '-01')
      .single();

    // Get trial usage if in trial
    let trialUsage = null;
    if (subscription.status === 'trialing') {
      const { data } = await supabaseAdmin
        .from('trial_usage')
        .select('*')
        .eq('user_id', req.userId)
        .single();
      trialUsage = data;
    }

    res.json({
      ...subscription,
      usage: usage || { minutes_used: 0, calls_made: 0 },
      trialUsage: trialUsage
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/payment-link/:planId
 * Get Stripe Payment Link URL for a plan
 * Supports region query param for geo-targeted pricing
 */
router.get('/payment-link/:planId', authenticate, async (req, res, next) => {
  try {
    const { planId } = req.params;
    const { region: regionOverride } = req.query;

    if (!planId || !['starter', 'growth', 'pro'].includes(planId)) {
      return res.status(400).json({ error: { message: 'Invalid plan ID' } });
    }

    // Check if user already has an active subscription
    const existingSubscription = await getSubscription(req.userId);
    if (existingSubscription && ['active', 'trialing'].includes(existingSubscription.status)) {
      return res.status(400).json({
        error: { message: 'You already have an active subscription. Use the portal to change plans.' }
      });
    }

    // Detect region for geo-targeted pricing
    let region = regionOverride;
    if (!region) {
      const clientIp = getClientIp(req);
      region = await detectRegion(clientIp);
    }

    // Ireland (VoIPCloud pool): reserve a number during checkout so we can show a real number
    // immediately after purchase, even if provisioning is still running.
    if (region === 'IE') {
      try {
        await numberPool.reserveNumber(req.userId, 'IE', 30);
      } catch (reserveError) {
        // Don't block checkout on reservation issues (pool may be empty, etc.)
        console.warn('[Billing] Failed to reserve pool number during checkout:', reserveError?.message || reserveError);
      }
    }

    // Try to get region-specific payment link first
    let url = getPaymentLinkForRegion(region, planId);

    // Fall back to default payment link if region-specific not available
    if (!url) {
      url = getPaymentLink(planId, req.userId);
    } else {
      // Append client_reference_id to the payment link
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}client_reference_id=${req.userId}`;
    }

    res.json({ url, region });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/payment-links
 * Get all Payment Link URLs for authenticated user
 */
router.get('/payment-links', authenticate, async (req, res, next) => {
  try {
    // Check if user already has an active subscription
    const existingSubscription = await getSubscription(req.userId);
    if (existingSubscription && ['active', 'trialing'].includes(existingSubscription.status)) {
      return res.json({
        hasActiveSubscription: true,
        currentPlan: existingSubscription.plan_id,
        links: null
      });
    }

    res.json({
      hasActiveSubscription: false,
      links: {
        starter: getPaymentLink('starter', req.userId),
        growth: getPaymentLink('growth', req.userId),
        pro: getPaymentLink('pro', req.userId)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/redirect
 * Determine where to redirect user based on subscription status
 * - New users (no subscription) → Payment Link URL
 * - Existing subscribers → Customer Portal URL
 */
router.get('/redirect', authenticate, async (req, res, next) => {
  try {
    const { planId } = req.query;

    // Check if user has an existing subscription
    const existingSubscription = await getSubscription(req.userId);
    const hasActiveSubscription = existingSubscription &&
      ['active', 'trialing'].includes(existingSubscription.status);

    if (hasActiveSubscription) {
      // Existing subscriber - redirect to portal for upgrades/management
      // Get customer ID from subscription or user
      let stripeCustomerId = existingSubscription.stripe_customer_id;

      if (!stripeCustomerId) {
        const { data: subscription } = await supabaseAdmin
          .from('user_subscriptions')
          .select('stripe_customer_id')
          .eq('user_id', req.userId)
          .single();
        stripeCustomerId = subscription?.stripe_customer_id;
      }

      if (!stripeCustomerId) {
        return res.status(400).json({
          error: { message: 'No billing account found. Please contact support.' }
        });
      }

      // Create portal session
      const session = await createPortalSession({ stripe_customer_id: stripeCustomerId });

      return res.json({
        type: 'portal',
        url: session.url,
        currentPlan: existingSubscription.plan_id,
        message: 'You have an existing subscription. Use the portal to manage or change your plan.'
      });
    }

    // New user - redirect to payment link
    if (!planId || !['starter', 'growth', 'pro'].includes(planId)) {
      // No plan specified, return info only
      return res.json({
        type: 'none',
        hasSubscription: false,
        message: 'No active subscription. Choose a plan to get started.'
      });
    }

    // Get payment link for the requested plan
    const url = getPaymentLink(planId, req.userId);

    return res.json({
      type: 'payment',
      url,
      planId,
      message: 'Redirecting to checkout...'
    });
  } catch (error) {
    console.error('[Billing] Redirect error:', error);
    next(error);
  }
});

/**
 * POST /api/billing/portal
 * Create a Stripe customer portal session
 */
router.post('/portal', authenticate, async (req, res, next) => {
  try {
    // If user doesn't have stripe_customer_id, look it up from user_subscriptions
    let user = req.user;
    if (!user.stripe_customer_id) {
      const { data: subscription } = await supabaseAdmin
        .from('user_subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', req.userId)
        .single();

      if (subscription?.stripe_customer_id) {
        user = { ...user, stripe_customer_id: subscription.stripe_customer_id };
      }
    }

    const session = await createPortalSession(user);
    res.json({ url: session.url });
  } catch (error) {
    if (error.message === 'User has no Stripe customer') {
      return res.status(400).json({ error: { message: 'No billing account found. Please subscribe first.' } });
    }
    next(error);
  }
});

/**
 * GET /api/billing/usage
 * Get current usage for the billing period (VoiceFleet pay-per-call model)
 */
router.get('/usage', authenticate, async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.userId);
    const planId = subscription?.plan_id || 'starter';

    // Use new usageTracking service for per-call billing
    const usage = await usageTracking.getUsageSummary(req.userId, planId);
    const planLimits = getPlanLimits(planId);

    res.json({
      // Per-call billing fields
      callsMade: usage.callsMade,
      totalChargesCents: usage.totalChargesCents,
      totalChargesFormatted: usage.totalChargesFormatted,
      perCallRateCents: usage.perCallRateCents,
      perCallRateFormatted: usage.perCallRateFormatted,
      fairUseCap: usage.fairUseCap,
      callsRemaining: usage.callsRemaining,
      isUnlimited: usage.isUnlimited,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,

      // Plan limits
      planLimits: {
        phoneNumbers: planLimits.phoneNumbers,
        maxConcurrentCalls: planLimits.maxConcurrentCalls
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/can-make-call
 * Check if user can make a call (fair use cap enforcement)
 */
router.get('/can-make-call', authenticate, async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.userId);
    const planId = subscription?.plan_id || 'starter';

    const result = await usageTracking.canMakeCall(req.userId, planId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/trial-usage
 * Get trial usage for current user
 */
router.get('/trial-usage', authenticate, async (req, res, next) => {
  try {
    const usage = await usageTracking.getTrialUsage(req.userId);
    res.json(usage);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/webhook
 * Stripe webhook handler
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Use mode-aware webhook secret
    const webhookSecret = STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        // Subscription payment successful - ensure subscription is active
        const invoiceSuccess = event.data.object;
        if (invoiceSuccess.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoiceSuccess.subscription);
          await handleSubscriptionChange(subscription);
        }
        // Send confirmation email for renewals
        await handleInvoicePaymentSucceeded(invoiceSuccess);
        break;

      case 'invoice.payment_failed':
        // Handle failed payment - send email notification
        const invoiceFailed = event.data.object;
        console.log('Payment failed for invoice:', invoiceFailed.id);
        await handleInvoicePaymentFailed(invoiceFailed);
        break;

      case 'checkout.session.completed':
        // Payment Link checkout completed - create subscription record
        await handleCheckoutCompleted(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * POST /api/billing/start-trial
 * Start a trial for a plan (creates subscription record without Stripe)
 */
router.post('/start-trial', authenticate, async (req, res, next) => {
  try {
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: { message: 'Plan ID is required' } });
    }

    // Check if user already has a subscription
    const existingSubscription = await getSubscription(req.userId);
    if (existingSubscription) {
      return res.status(400).json({
        error: { message: 'You already have a subscription or have used your trial.' }
      });
    }

    // Verify plan exists
    const { data: plan } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (!plan) {
      return res.status(400).json({ error: { message: 'Invalid plan' } });
    }

    const trialDays = parseInt(process.env.TRIAL_DAYS) || 3;
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + trialDays);

    // Create trial subscription
    const { data: subscription, error } = await supabaseAdmin
      .from('user_subscriptions')
      .insert({
        user_id: req.userId,
        plan_id: planId,
        status: 'trialing',
        trial_starts_at: new Date().toISOString(),
        trial_ends_at: trialEnds.toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Initialize trial usage
    await supabaseAdmin
      .from('trial_usage')
      .insert({
        user_id: req.userId,
        calls_made: 0,
        minutes_used: 0
      });

    res.json({
      message: 'Trial started successfully',
      subscription,
      trialEndsAt: trialEnds.toISOString(),
      trialCalls: parseInt(process.env.TRIAL_CALLS) || 3
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/phone-numbers
 * Get user's provisioned phone numbers
 */
router.get('/phone-numbers', authenticate, async (req, res, next) => {
  try {
    const { data: numbers, error } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('*')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Get plan limits for context
    const subscription = await getSubscription(req.userId);
    const planId = subscription?.plan_id || 'starter';
    const planLimits = getPlanLimits(planId);

    res.json({
      numbers: numbers || [],
      count: numbers?.length || 0,
      maxAllowed: planLimits.phoneNumbers,
      canAddMore: (numbers?.length || 0) < planLimits.phoneNumbers
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/provisioning-status
 * Check phone number provisioning status
 */
router.get('/provisioning-status', authenticate, async (req, res, next) => {
  try {
    // Get latest provisioning queue entry
    const { data: queue, error: queueError } = await supabaseAdmin
      .from('provisioning_queue')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get current phone numbers
    const { data: numbers } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('phone_number, status, created_at')
      .eq('user_id', req.userId)
      .eq('status', 'active');

    // Get reserved pool number (if any) for this user
    let reserved = null;
    try {
      const { data: reservedRow, error: reservedError } = await supabaseAdmin
        .from('phone_number_pool')
        .select('phone_number, reserved_until, region')
        .eq('assigned_to', req.userId)
        .eq('status', 'reserved')
        .order('reserved_at', { ascending: false })
        .limit(1)
        .single();

      if (!reservedError && reservedRow) {
        reserved = reservedRow;
      }
    } catch (reservedQueryError) {
      console.warn('[Billing] Failed to fetch reserved pool number:', reservedQueryError?.message || reservedQueryError);
    }

    res.json({
      provisioning: queue || null,
      numbers: numbers || [],
      reserved,
      isComplete: !queue || queue.status === 'completed',
      hasFailed: queue?.status === 'failed'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// TEST ENDPOINTS (Dev mode only)
// ============================================

/**
 * POST /api/billing/test/simulate-call
 * Simulate a call for E2E testing
 */
router.post('/test/simulate-call', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { userId, planId, vapiCostCents = 50, isTrial = false } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ error: 'userId and planId are required' });
    }

    const result = await usageTracking.recordCall(
      userId,
      planId,
      vapiCostCents,
      null, // No call ID for simulated calls
      isTrial
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-checkout
 * Simulate a Stripe checkout completion for E2E testing
 */
router.post('/test/simulate-checkout', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { userId, planId, customerId, subscriptionId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ error: 'userId and planId are required' });
    }

    // Create or update subscription
    const { error } = await supabaseAdmin
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        plan_id: planId,
        status: 'active',
        stripe_customer_id: customerId || `cus_test_${Date.now()}`,
        stripe_subscription_id: subscriptionId || `sub_test_${Date.now()}`,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;

    res.json({ success: true, message: `Simulated checkout for ${planId} plan` });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-plan-change
 * Simulate a plan upgrade/downgrade for E2E testing
 */
router.post('/test/simulate-plan-change', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { userId, newPlanId } = req.body;

    if (!userId || !newPlanId) {
      return res.status(400).json({ error: 'userId and newPlanId are required' });
    }

    const { error } = await supabaseAdmin
      .from('user_subscriptions')
      .update({
        plan_id: newPlanId,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true, message: `Changed to ${newPlanId} plan` });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-cancellation
 * Simulate subscription cancellation for E2E testing
 */
router.post('/test/simulate-cancellation', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { error } = await supabaseAdmin
      .from('user_subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true, message: 'Subscription canceled' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/reset-user
 * Reset test user to clean state for E2E testing
 */
router.post('/test/reset-user', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Delete subscription
    await supabaseAdmin
      .from('user_subscriptions')
      .delete()
      .eq('user_id', userId);

    // Delete usage tracking
    await supabaseAdmin
      .from('usage_tracking')
      .delete()
      .eq('user_id', userId);

    // Delete trial usage
    await supabaseAdmin
      .from('trial_usage')
      .delete()
      .eq('user_id', userId);

    // Delete phone numbers
    await supabaseAdmin
      .from('user_phone_numbers')
      .delete()
      .eq('user_id', userId);

    // Delete assistants
    await supabaseAdmin
      .from('user_assistants')
      .delete()
      .eq('user_id', userId);

    // Release pool numbers assigned to this user
    await supabaseAdmin
      .from('phone_number_pool')
      .update({
        status: 'available',
        assigned_to: null,
        assigned_at: null,
        reserved_at: null,
        reserved_until: null
      })
      .eq('assigned_to', userId);

    // Delete number assignment history
    await supabaseAdmin
      .from('number_assignment_history')
      .delete()
      .eq('user_id', userId);

    res.json({ success: true, message: 'User reset complete' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/test/simulate-ireland-checkout
 * Simulate an Ireland (EUR) checkout with full provisioning
 * This triggers the number pool assignment flow
 */
router.post('/test/simulate-ireland-checkout', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { userId, planId = 'starter', email, fullName } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Create subscription first
    const customerId = `cus_ireland_test_${Date.now()}`;
    const subscriptionId = `sub_ireland_test_${Date.now()}`;

    const { error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        plan_id: planId,
        status: 'active',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (subError) throw subError;

    // Trigger Ireland provisioning
    const { provisionIrelandUser } = require('../services/provisioning');

    const result = await provisionIrelandUser(userId, planId, {
      email: email || 'test@example.com',
      fullName: fullName || 'Test User'
    });

    res.json({
      success: true,
      message: `Ireland provisioning complete for ${planId} plan`,
      provisioning: result,
      subscription: {
        customerId,
        subscriptionId,
        planId
      }
    });
  } catch (error) {
    console.error('[Test] Ireland checkout simulation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

/**
 * POST /api/billing/test/release-pool-number
 * Release a pool number back to available (for testing)
 */
router.post('/test/release-pool-number', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { userId } = req.body;

    // Find assigned pool number
    const { data: poolNumber } = await supabaseAdmin
      .from('phone_number_pool')
      .select('*')
      .eq('assigned_to', userId)
      .single();

    if (!poolNumber) {
      // Try to find any assigned number and release it
      const { data: anyAssigned } = await supabaseAdmin
        .from('phone_number_pool')
        .select('*')
        .eq('status', 'assigned')
        .limit(1)
        .single();

      if (anyAssigned) {
        await supabaseAdmin
          .from('phone_number_pool')
          .update({
            status: 'available',
            assigned_to: null,
            assigned_at: null
          })
          .eq('id', anyAssigned.id);

        // Also clean up user_phone_numbers
        await supabaseAdmin
          .from('user_phone_numbers')
          .delete()
          .eq('pool_number_id', anyAssigned.id);

        return res.json({ success: true, released: anyAssigned.phone_number });
      }

      return res.json({ success: false, message: 'No assigned numbers found' });
    }

    // Release the number
    await supabaseAdmin
      .from('phone_number_pool')
      .update({
        status: 'available',
        assigned_to: null,
        assigned_at: null
      })
      .eq('id', poolNumber.id);

    // Clean up user_phone_numbers
    await supabaseAdmin
      .from('user_phone_numbers')
      .delete()
      .eq('pool_number_id', poolNumber.id);

    res.json({ success: true, released: poolNumber.phone_number });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/pool-stats
 * Get number pool statistics (for admin/testing)
 */
router.get('/pool-stats', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.headers['x-admin-key']) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const numberPool = require('../services/numberPool');
    const stats = await numberPool.getPoolStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
