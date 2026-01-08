const Stripe = require('stripe');
const { supabaseAdmin } = require('./supabase');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Lazy load provisioning to avoid circular dependency
let provisioningService = null;
function getProvisioningService() {
  if (!provisioningService) {
    provisioningService = require('./provisioning');
  }
  return provisioningService;
}

// Lazy load notifications to avoid circular dependency
let notificationService = null;
function getNotificationService() {
  if (!notificationService) {
    notificationService = require('./notifications');
  }
  return notificationService;
}

// Lazy load email service to avoid circular dependency
let emailService = null;
function getEmailService() {
  if (!emailService) {
    emailService = require('./emailService');
  }
  return emailService;
}

// Lazy load number pool service for Ireland provisioning
let numberPoolService = null;
function getNumberPoolService() {
  if (!numberPoolService) {
    numberPoolService = require('./numberPool');
  }
  return numberPoolService;
}

// Payment Links - create these in Stripe Dashboard and add URLs to .env
// Pass ?client_reference_id={userId} when redirecting users
const PAYMENT_LINKS = {
  starter: process.env.STRIPE_PAYMENT_LINK_STARTER,
  growth: process.env.STRIPE_PAYMENT_LINK_GROWTH,
  scale: process.env.STRIPE_PAYMENT_LINK_SCALE
};

// Map Stripe Price IDs to plan IDs (supports both EUR and USD prices)
const PRICE_TO_PLAN = {
  // EUR prices (OrderBot Ireland)
  [process.env.STRIPE_STARTER_PRICE_EUR]: 'starter',
  [process.env.STRIPE_GROWTH_PRICE_EUR]: 'growth',
  [process.env.STRIPE_SCALE_PRICE_EUR]: 'scale',
  // USD prices (US market)
  [process.env.STRIPE_STARTER_PRICE_USD]: 'starter',
  [process.env.STRIPE_GROWTH_PRICE_USD]: 'growth',
  [process.env.STRIPE_SCALE_PRICE_USD]: 'scale',
  // Legacy (deprecated)
  [process.env.STRIPE_STARTER_PRICE_ID]: 'starter',
  [process.env.STRIPE_GROWTH_PRICE_ID]: 'growth',
  [process.env.STRIPE_SCALE_PRICE_ID]: 'scale'
};

// OrderBot Plan pricing (in cents) - EUR
// Lite: €19/mo | Growth: €99/mo | Pro: €249/mo
const PLAN_PRICES = {
  starter: 1900,  // €19/mo (Lite)
  growth: 9900,   // €99/mo (Growth)
  scale: 24900    // €249/mo (Pro)
};

// Per-call rates (in cents) - used for usage tracking
const PER_CALL_RATES = {
  starter: 95,   // €0.95/call (Lite)
  growth: 45,    // €0.45/call (Growth)
  scale: 0       // €0/call (Pro - unlimited)
};

// Fair use caps (calls per month)
const FAIR_USE_CAPS = {
  starter: null,  // No cap (pay per call)
  growth: null,   // No cap (pay per call)
  scale: 1500     // 1500 calls/month
};

// Overage pricing per minute (in cents) by plan - legacy, not used in OrderBot
const OVERAGE_RATES = {
  starter: 25,
  growth: 22,
  scale: 18
};

// Plan limits (OrderBot model)
const PLAN_LIMITS = {
  starter: {
    minutesIncluded: 0,  // Pay per call
    phoneNumbers: 1,
    maxConcurrentCalls: 1,
    maxMinutesPerCall: 15,
    hoursType: 'all'  // 24/7 for AI
  },
  growth: {
    minutesIncluded: 0,  // Pay per call
    phoneNumbers: 2,
    maxConcurrentCalls: 3,
    maxMinutesPerCall: 15,
    hoursType: 'all'
  },
  scale: {
    minutesIncluded: 0,  // Unlimited (1500 fair use cap)
    phoneNumbers: 5,
    maxConcurrentCalls: 10,
    maxMinutesPerCall: 30,
    hoursType: 'all',  // 24/7 for AI
    callsCap: 1500     // Fair use cap
  }
};

/**
 * Create or get Stripe customer for a user
 */
async function getOrCreateCustomer(user) {
  // Check if user already has a Stripe customer ID
  if (user.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(user.stripe_customer_id);
      if (!customer.deleted) {
        return customer;
      }
    } catch (error) {
      console.error('Error retrieving customer:', error);
    }
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.full_name,
    metadata: {
      user_id: user.id
    }
  });

  // Update user with Stripe customer ID
  await supabaseAdmin
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('id', user.id);

  return customer;
}

/**
 * Get Payment Link URL for a plan (with user ID for tracking)
 */
function getPaymentLink(planId, userId) {
  const baseUrl = PAYMENT_LINKS[planId];
  if (!baseUrl) {
    throw new Error(`Invalid plan ID: ${planId}`);
  }
  // Append client_reference_id so we can identify the user in webhooks
  return `${baseUrl}?client_reference_id=${userId}`;
}

/**
 * Handle checkout.session.completed from Payment Links
 */
async function handleCheckoutCompleted(session) {
  const userId = session.client_reference_id;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!userId) {
    console.error('No client_reference_id in checkout session');
    return;
  }

  // Determine plan from the price ID
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
  const priceId = lineItems.data[0]?.price?.id;
  const planId = PRICE_TO_PLAN[priceId] || 'starter';

  // Update user with Stripe customer ID
  await supabaseAdmin
    .from('users')
    .update({ stripe_customer_id: customerId })
    .eq('id', userId);

  // Get the subscription to populate dates
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Update subscription metadata with user_id for future webhook events
  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      user_id: userId,
      plan_id: planId
    }
  });

  const status = mapStripeStatus(subscription.status);

  // Create subscription record
  const { error } = await supabaseAdmin
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      plan_id: planId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: status,
      trial_starts_at: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
      trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : new Date().toISOString(),
      current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('Error creating subscription from checkout:', error);
    throw error;
  }

  console.log(`Subscription created for user ${userId}, plan: ${planId}`);

  // Get user details for notifications
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  // Send welcome email (async, non-blocking)
  setImmediate(async () => {
    try {
      const { sendWelcomeEmail } = getEmailService();
      await sendWelcomeEmail(userId, { planId });
      console.log(`[Stripe] Welcome email sent to user ${userId}`);
    } catch (emailError) {
      console.error('[Stripe] Failed to send welcome email:', emailError);
      // Don't throw - email failure shouldn't block subscription
    }
  });

  // Check if this is an Ireland/EUR subscription (VoIPCloud - manual provisioning)
  const currency = session.currency?.toLowerCase();
  const isIrelandSubscription = currency === 'eur';

  if (isIrelandSubscription) {
    console.log(`[Stripe] Ireland subscription detected - provisioning from VoIPCloud number pool`);

    // Provision Ireland phone numbers from the pool (async, non-blocking)
    setImmediate(async () => {
      try {
        const { provisionIrelandUser } = getProvisioningService();
        const result = await provisionIrelandUser(userId, planId, {
          email: user?.email,
          fullName: user?.full_name,
        });
        console.log(`[Stripe] Ireland provisioning completed for user ${userId}:`, result);

        // Send success notification
        const { notifyIrelandSubscription } = getNotificationService();
        await notifyIrelandSubscription({
          userId,
          userEmail: user?.email,
          userName: user?.full_name,
          planId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          phoneNumbersRequired: PLAN_LIMITS[planId]?.phoneNumbers || 1,
          phoneNumber: result?.phoneNumber,
          status: 'provisioned',
        });
      } catch (provisionError) {
        console.error(`[Stripe] Ireland provisioning failed for user ${userId}:`, provisionError);

        // Notify support about the failure
        const { notifyIrelandSubscription } = getNotificationService();
        await notifyIrelandSubscription({
          userId,
          userEmail: user?.email,
          userName: user?.full_name,
          planId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          phoneNumbersRequired: PLAN_LIMITS[planId]?.phoneNumbers || 1,
          status: 'failed',
          error: provisionError.message,
        });

        // Queue for retry
        await supabaseAdmin.from('provisioning_queue').insert({
          user_id: userId,
          plan_id: planId,
          numbers_requested: PLAN_LIMITS[planId]?.phoneNumbers || 1,
          status: 'failed',
          error_message: provisionError.message,
          region: 'IE',
          attempts: 1,
          last_attempt_at: new Date().toISOString()
        });
      }
    });

    return;
  }

  // Provision phone numbers for the user (async, non-blocking)
  // This runs in the background so webhook responds quickly
  setImmediate(async () => {
    try {
      const { provisionUserPhoneNumbers } = getProvisioningService();
      const result = await provisionUserPhoneNumbers(userId, planId);
      console.log(`Phone provisioning completed for user ${userId}:`, result);
    } catch (provisionError) {
      console.error(`Phone provisioning failed for user ${userId}:`, provisionError);
      // Queue for retry - save to provisioning_queue table
      await supabaseAdmin.from('provisioning_queue').insert({
        user_id: userId,
        plan_id: planId,
        numbers_requested: PLAN_LIMITS[planId]?.phoneNumbers || 1,
        status: 'failed',
        error_message: provisionError.message,
        attempts: 1,
        last_attempt_at: new Date().toISOString()
      });
    }
  });
}

/**
 * Create a customer portal session
 */
async function createPortalSession(user) {
  if (!user.stripe_customer_id) {
    throw new Error('User has no Stripe customer');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${process.env.FRONTEND_URL}/settings`
  });

  return session;
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionChange(subscription) {
  const userId = subscription.metadata?.user_id;
  const newPlanId = subscription.metadata?.plan_id;

  if (!userId) {
    console.error('No user_id in subscription metadata');
    return;
  }

  const status = mapStripeStatus(subscription.status);

  // Get current subscription to detect plan changes
  const { data: currentSub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .single();

  const oldPlanId = currentSub?.plan_id;
  const isPlanChange = oldPlanId && newPlanId && oldPlanId !== newPlanId;

  // Upsert subscription record
  const { error } = await supabaseAdmin
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      plan_id: newPlanId || 'starter',
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      status: status,
      trial_starts_at: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
      trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : new Date().toISOString(),
      current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }

  // Handle plan change (upgrade/downgrade)
  if (isPlanChange && status === 'active') {
    console.log(`Plan change detected: ${oldPlanId} → ${newPlanId}`);
    setImmediate(async () => {
      try {
        const { handlePlanChange } = require('./planChanges');
        const result = await handlePlanChange(userId, oldPlanId, newPlanId);
        console.log(`Plan change completed for user ${userId}:`, result);
      } catch (planError) {
        console.error(`Plan change failed for user ${userId}:`, planError);
      }
    });
  }

  // Initialize trial usage if in trial
  if (status === 'trialing') {
    await supabaseAdmin
      .from('trial_usage')
      .upsert({
        user_id: userId,
        calls_made: 0,
        minutes_used: 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
  }
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(subscription) {
  let userId = subscription.metadata?.user_id;

  if (!userId) {
    // Try to find by stripe_subscription_id
    const { data } = await supabaseAdmin
      .from('user_subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', subscription.id)
      .single();

    if (data) {
      userId = data.user_id;
    }
  }

  if (!userId) {
    console.error('Could not find user for deleted subscription');
    return;
  }

  // Get subscription details before updating
  const { data: currentSub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id, current_period_end')
    .eq('user_id', userId)
    .single();

  // Update subscription status
  await supabaseAdmin
    .from('user_subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  // Send cancellation email (async, non-blocking)
  setImmediate(async () => {
    try {
      const { sendSubscriptionCancelledEmail } = getEmailService();
      await sendSubscriptionCancelledEmail(userId, {
        planId: currentSub?.plan_id || 'starter',
        endDate: currentSub?.current_period_end || new Date().toISOString(),
      });
      console.log(`[Stripe] Cancellation email sent to user ${userId}`);
    } catch (emailError) {
      console.error('[Stripe] Failed to send cancellation email:', emailError);
    }
  });

  // Handle cancellation (release numbers, delete assistant) in background
  setImmediate(async () => {
    try {
      const { handleCancellation } = require('./planChanges');
      const result = await handleCancellation(userId);
      console.log(`Cancellation completed for user ${userId}:`, result);
    } catch (cancelError) {
      console.error(`Cancellation handling failed for user ${userId}:`, cancelError);
    }
  });
}

/**
 * Handle invoice.payment_failed - send payment failed email
 */
async function handleInvoicePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) {
    console.log('[Stripe] Invoice payment failed - no subscription attached');
    return;
  }

  // Get user from subscription
  const { data: subData } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id, plan_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!subData?.user_id) {
    console.error('[Stripe] Could not find user for failed invoice');
    return;
  }

  const { sendPaymentFailedEmail } = getEmailService();

  try {
    await sendPaymentFailedEmail(subData.user_id, {
      planId: subData.plan_id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      retryDate: invoice.next_payment_attempt
        ? new Date(invoice.next_payment_attempt * 1000).toISOString()
        : null,
    });
    console.log(`[Stripe] Payment failed email sent for invoice ${invoice.id}`);
  } catch (emailError) {
    console.error('[Stripe] Failed to send payment failed email:', emailError);
  }
}

/**
 * Handle invoice.payment_succeeded - send subscription confirmation
 */
async function handleInvoicePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) {
    // One-time payment, not a subscription
    return;
  }

  // Skip sending confirmation for the first invoice (welcome email covers this)
  // Only send for renewals (billing_reason = 'subscription_cycle')
  if (invoice.billing_reason !== 'subscription_cycle') {
    console.log(`[Stripe] Skipping confirmation email for billing_reason: ${invoice.billing_reason}`);
    return;
  }

  // Get user from subscription
  const { data: subData } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id, plan_id, current_period_end')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!subData?.user_id) {
    console.error('[Stripe] Could not find user for invoice payment');
    return;
  }

  const { sendSubscriptionConfirmation } = getEmailService();

  try {
    await sendSubscriptionConfirmation(subData.user_id, {
      planId: subData.plan_id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      nextBillingDate: subData.current_period_end,
      invoiceUrl: invoice.hosted_invoice_url,
    });
    console.log(`[Stripe] Subscription confirmation email sent for invoice ${invoice.id}`);
  } catch (emailError) {
    console.error('[Stripe] Failed to send confirmation email:', emailError);
  }
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(stripeStatus) {
  const statusMap = {
    'trialing': 'trialing',
    'active': 'active',
    'past_due': 'past_due',
    'canceled': 'canceled',
    'unpaid': 'past_due',
    'incomplete': 'past_due',
    'incomplete_expired': 'expired',
    'paused': 'canceled'
  };
  return statusMap[stripeStatus] || 'expired';
}

/**
 * Get subscription for a user
 */
async function getSubscription(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_subscriptions')
    .select(`
      *,
      plan:subscription_plans(*)
    `)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data;
}

/**
 * Get all available plans
 */
async function getPlans() {
  const { data, error } = await supabaseAdmin
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return data;
}

/**
 * Calculate overage charges for a user
 */
async function calculateOverage(userId, planId) {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const { data: usage } = await supabaseAdmin
    .from('usage_tracking')
    .select('minutes_used, overage_minutes, overage_charged')
    .eq('user_id', userId)
    .eq('period_start', periodStart.toISOString().slice(0, 10))
    .single();

  if (!usage) return { overageMinutes: 0, overageAmountCents: 0 };

  const planLimits = PLAN_LIMITS[planId] || PLAN_LIMITS.starter;
  const overageRate = OVERAGE_RATES[planId] || OVERAGE_RATES.starter;

  const overageMinutes = Math.max(0, usage.minutes_used - planLimits.minutesIncluded);
  const overageAmountCents = overageMinutes * overageRate;

  return {
    overageMinutes,
    overageAmountCents,
    overageRate
  };
}

/**
 * Create a usage record for overage billing
 */
async function createOverageInvoiceItem(customerId, overageMinutes, overageRate, planId) {
  if (overageMinutes <= 0) return null;

  const amount = overageMinutes * overageRate;

  const invoiceItem = await stripe.invoiceItems.create({
    customer: customerId,
    amount: amount,
    currency: 'usd',
    description: `Overage: ${overageMinutes} minutes @ $${(overageRate / 100).toFixed(2)}/min (${planId} plan)`
  });

  return invoiceItem;
}

/**
 * Get plan limits by plan ID
 */
function getPlanLimits(planId) {
  return PLAN_LIMITS[planId] || PLAN_LIMITS.starter;
}

/**
 * Get overage rate by plan ID (in cents)
 */
function getOverageRate(planId) {
  return OVERAGE_RATES[planId] || OVERAGE_RATES.starter;
}

module.exports = {
  stripe,
  getOrCreateCustomer,
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
  createOverageInvoiceItem,
  getPlanLimits,
  getOverageRate,
  PLAN_LIMITS,
  OVERAGE_RATES,
  PAYMENT_LINKS
};
