const { supabaseAdmin } = require('../services/supabase');
const { getPlanLimits, getOverageRate } = require('../services/stripe');

/**
 * Check if user can make a call based on subscription and usage
 */
const checkCallAllowed = async (req, res, next) => {
  try {
    // Dev mode bypass (but NOT in E2E mode - we want to test subscription checks)
    if (process.env.DEV_MODE === 'true' && process.env.E2E_MODE !== 'true') {
      req.callLimits = {
        allowed: true,
        maxMinutes: 10,
        isDevMode: true
      };
      return next();
    }

    const userId = req.userId;

    // Get subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('user_subscriptions')
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq('user_id', userId)
      .single();

    if (subError && subError.code !== 'PGRST116') {
      throw subError;
    }

    // No subscription
    if (!subscription) {
      return res.status(402).json({
        error: {
          code: 'NO_SUBSCRIPTION',
          message: 'Please subscribe to make calls'
        }
      });
    }

    const plan = subscription.plan;
    const now = new Date();

    // Check if in trial
    if (subscription.status === 'trialing') {
      const trialEnds = new Date(subscription.trial_ends_at);

      // Trial expired
      if (now > trialEnds) {
        // Update status
        await supabaseAdmin
          .from('user_subscriptions')
          .update({ status: 'expired', updated_at: now.toISOString() })
          .eq('id', subscription.id);

        return res.status(402).json({
          error: {
            code: 'TRIAL_EXPIRED',
            message: 'Your trial has expired. Please subscribe to continue.'
          }
        });
      }

      // Check trial usage
      const { data: trialUsage } = await supabaseAdmin
        .from('trial_usage')
        .select('*')
        .eq('user_id', userId)
        .single();

      const maxTrialCalls = parseInt(process.env.TRIAL_CALLS) || 3;
      const callsMade = trialUsage?.calls_made || 0;

      if (callsMade >= maxTrialCalls) {
        return res.status(402).json({
          error: {
            code: 'TRIAL_CALLS_EXHAUSTED',
            message: `You have used all ${maxTrialCalls} trial calls. Please subscribe to continue.`
          }
        });
      }

      // Trial is valid
      req.callLimits = {
        allowed: true,
        isTrial: true,
        trialCallsRemaining: maxTrialCalls - callsMade,
        maxMinutes: plan.max_minutes_per_call,
        trialEndsAt: subscription.trial_ends_at
      };
      return next();
    }

    // Check subscription status
    if (!['active'].includes(subscription.status)) {
      return res.status(402).json({
        error: {
          code: 'SUBSCRIPTION_' + subscription.status.toUpperCase(),
          message: `Your subscription is ${subscription.status}. Please update your payment method.`
        }
      });
    }

    // Check usage limits
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    let { data: usage } = await supabaseAdmin
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .eq('period_start', periodStart.toISOString().slice(0, 10))
      .single();

    // Create usage record if doesn't exist
    if (!usage) {
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(0);

      const { data: newUsage } = await supabaseAdmin
        .from('usage_tracking')
        .insert({
          user_id: userId,
          period_start: periodStart.toISOString().slice(0, 10),
          period_end: periodEnd.toISOString().slice(0, 10),
          minutes_used: 0,
          calls_made: 0
        })
        .select()
        .single();

      usage = newUsage;
    }

    const minutesUsed = usage?.minutes_used || 0;
    const planId = subscription.plan_id || 'starter';
    const planLimits = getPlanLimits(planId);
    const overageRate = getOverageRate(planId);

    const minutesIncluded = planLimits.minutesIncluded;
    const remainingIncluded = Math.max(0, minutesIncluded - minutesUsed);
    const isOverage = minutesUsed >= minutesIncluded;

    // All checks passed - allow calls with overage billing
    req.callLimits = {
      allowed: true,
      isTrial: false,
      minutesUsed,
      minutesIncluded,
      minutesRemaining: remainingIncluded,
      isOverage,
      overageRate, // cents per minute
      maxMinutes: planLimits.maxMinutesPerCall,
      maxConcurrentCalls: planLimits.maxConcurrentCalls,
      planId: planId
    };
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    next(error);
  }
};

/**
 * Record call usage after a call is made
 */
const recordCallUsage = async (userId, durationMinutes, isTrial = false) => {
  try {
    if (isTrial) {
      // Use RPC function to increment trial usage
      await supabaseAdmin.rpc('increment_trial_usage', {
        p_user_id: userId,
        p_minutes: durationMinutes
      });
    } else {
      // Use RPC function to increment regular usage
      await supabaseAdmin.rpc('increment_usage', {
        p_user_id: userId,
        p_minutes: durationMinutes
      });
    }
  } catch (error) {
    console.error('Error recording usage:', error);
    // Don't throw - usage recording failure shouldn't break the call
  }
};

module.exports = {
  checkCallAllowed,
  recordCallUsage
};
