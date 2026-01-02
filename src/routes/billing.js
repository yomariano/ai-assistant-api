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
  getSubscription,
  getPlans,
  calculateOverage,
  getPlanLimits,
  getOverageRate,
  PLAN_LIMITS,
  PAYMENT_LINKS
} = require('../services/stripe');

const router = express.Router();

/**
 * GET /api/billing/plans
 * Get all available subscription plans
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
 */
router.get('/payment-link/:planId', authenticate, async (req, res, next) => {
  try {
    const { planId } = req.params;

    if (!planId || !['starter', 'growth', 'scale'].includes(planId)) {
      return res.status(400).json({ error: { message: 'Invalid plan ID' } });
    }

    // Check if user already has an active subscription
    const existingSubscription = await getSubscription(req.userId);
    if (existingSubscription && ['active', 'trialing'].includes(existingSubscription.status)) {
      return res.status(400).json({
        error: { message: 'You already have an active subscription. Use the portal to change plans.' }
      });
    }

    const url = getPaymentLink(planId, req.userId);
    res.json({ url });
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
        scale: getPaymentLink('scale', req.userId)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/billing/portal
 * Create a Stripe customer portal session
 */
router.post('/portal', authenticate, async (req, res, next) => {
  try {
    const session = await createPortalSession(req.user);
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
 * Get current usage for the billing period
 */
router.get('/usage', authenticate, async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.userId);

    if (!subscription) {
      return res.json({
        minutesUsed: 0,
        minutesIncluded: 0,
        callsMade: 0,
        percentUsed: 0,
        overage: null
      });
    }

    const planId = subscription.plan_id || 'starter';
    const planLimits = getPlanLimits(planId);
    const overageRate = getOverageRate(planId);

    // Get current period usage
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const { data: usage } = await supabaseAdmin
      .from('usage_tracking')
      .select('*')
      .eq('user_id', req.userId)
      .eq('period_start', periodStart.toISOString().slice(0, 10))
      .single();

    const minutesUsed = usage?.minutes_used || 0;
    const minutesIncluded = planLimits.minutesIncluded;

    // Calculate overage
    const overageMinutes = Math.max(0, minutesUsed - minutesIncluded);
    const overageAmountCents = overageMinutes * overageRate;

    res.json({
      minutesUsed,
      minutesIncluded,
      callsMade: usage?.calls_made || 0,
      minutesRemaining: Math.max(0, minutesIncluded - minutesUsed),
      percentUsed: minutesIncluded > 0 ? Math.round((minutesUsed / minutesIncluded) * 100) : 0,
      maxMinutesPerCall: planLimits.maxMinutesPerCall,
      planLimits: {
        phoneNumbers: planLimits.phoneNumbers,
        maxConcurrentCalls: planLimits.maxConcurrentCalls
      },
      overage: {
        minutes: overageMinutes,
        ratePerMinuteCents: overageRate,
        ratePerMinute: `$${(overageRate / 100).toFixed(2)}`,
        totalCents: overageAmountCents,
        total: `$${(overageAmountCents / 100).toFixed(2)}`
      }
    });
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
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
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
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await handleSubscriptionChange(subscription);
        }
        break;

      case 'invoice.payment_failed':
        // Handle failed payment
        console.log('Payment failed for invoice:', event.data.object.id);
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

    res.json({
      provisioning: queue || null,
      numbers: numbers || [],
      isComplete: !queue || queue.status === 'completed',
      hasFailed: queue?.status === 'failed'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
