const express = require('express');
const { supabaseAdmin } = require('../services/supabase');
const { authenticate, getDevUser, setDevPlan, getDevPlan, setCustomUserId, clearCustomUserId, DEV_USER_IDS } = require('../middleware/auth');
const { getSubscription } = require('../services/stripe');

const router = express.Router();

/**
 * GET /api/auth/config
 * Get auth configuration (dev mode status, etc.)
 */
router.get('/config', (req, res) => {
  res.json({
    devMode: process.env.DEV_MODE === 'true',
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

/**
 * GET /api/auth/dev-login
 * Auto-login with dev user (only works in dev mode)
 * Query params:
 *   - plan: starter | growth | scale (optional, switches active dev user)
 *   - userId: custom user ID (optional, for E2E tests with dynamic users)
 */
router.get('/dev-login', async (req, res, next) => {
  try {
    if (process.env.DEV_MODE !== 'true') {
      return res.status(403).json({ error: { message: 'Dev mode is not enabled' } });
    }

    const { plan, userId } = req.query;

    // E2E mode: support custom user ID for dynamic test users
    if (userId) {
      setCustomUserId(userId);
      // If userId matches a known dev user, also set the plan
      for (const [planName, devUserId] of Object.entries(DEV_USER_IDS)) {
        if (devUserId === userId) {
          setDevPlan(planName);
          break;
        }
      }
    } else if (plan && DEV_USER_IDS[plan]) {
      // Switch to predefined dev user
      clearCustomUserId();
      setDevPlan(plan);
    }

    const user = await getDevUser();
    if (!user) {
      return res.status(500).json({
        error: {
          message: 'Failed to get dev user. Run: node scripts/seedDevUsers.js'
        }
      });
    }

    // Get subscription info
    let subscription = null;
    try {
      subscription = await getSubscription(user.id);
    } catch (e) {
      // Subscription might not exist
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        dateOfBirth: user.date_of_birth,
        address: user.address
      },
      subscription: subscription ? {
        planId: subscription.plan_id,
        status: subscription.status
      } : null,
      currentPlan: getDevPlan(),
      availablePlans: Object.keys(DEV_USER_IDS),
      devMode: true
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/dev-users
 * List available dev users (only works in dev mode)
 */
router.get('/dev-users', async (req, res) => {
  if (process.env.DEV_MODE !== 'true') {
    return res.status(403).json({ error: { message: 'Dev mode is not enabled' } });
  }

  const users = [];
  for (const [plan, userId] of Object.entries(DEV_USER_IDS)) {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name')
      .eq('id', userId)
      .single();

    if (user) {
      const { data: sub } = await supabaseAdmin
        .from('user_subscriptions')
        .select('plan_id, status')
        .eq('user_id', userId)
        .single();

      const { data: phones } = await supabaseAdmin
        .from('user_phone_numbers')
        .select('phone_number')
        .eq('user_id', userId)
        .eq('status', 'active');

      users.push({
        plan,
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
        subscription: sub,
        phoneCount: phones?.length || 0,
        isCurrent: plan === getDevPlan()
      });
    }
  }

  res.json({
    currentPlan: getDevPlan(),
    users,
    hint: 'Use GET /api/auth/dev-login?plan=starter|growth|scale to switch users'
  });
});

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      fullName: req.user.full_name,
      dateOfBirth: req.user.date_of_birth,
      address: req.user.address
    }
  });
});

module.exports = router;
