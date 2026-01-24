const { supabaseAdmin } = require('../services/supabase');
const { sendWelcomeEmail, isEmailConfigured } = require('../services/emailService');

// Map plan to dev user UUID (must match seedDevUsers.js)
const DEV_USER_IDS = {
  starter: '00000000-0000-0000-0000-000000000001',
  growth: '00000000-0000-0000-0000-000000000002',
  pro: '00000000-0000-0000-0000-000000000003',
};

// Store current dev user plan in memory (for simplicity)
let currentDevPlan = 'starter';

// E2E mode: support custom user ID override
let customUserId = null;

/**
 * Set the current dev user plan
 */
const setDevPlan = (plan) => {
  if (DEV_USER_IDS[plan]) {
    currentDevPlan = plan;
    return true;
  }
  return false;
};

/**
 * Get current dev plan
 */
const getDevPlan = () => currentDevPlan;

/**
 * Set custom user ID override (for E2E tests)
 */
const setCustomUserId = (userId) => {
  customUserId = userId;
};

/**
 * Get custom user ID
 */
const getCustomUserId = () => customUserId;

/**
 * Clear custom user ID
 */
const clearCustomUserId = () => {
  customUserId = null;
};

/**
 * Get or create dev user for local development
 * @param {string} plan - Optional plan to get specific dev user (starter, growth, pro)
 */
const getDevUser = async (plan = null) => {
  // E2E mode: if custom user ID is set, use that first
  if (customUserId) {
    const { data: customUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', customUserId)
      .single();

    if (customUser) {
      return customUser;
    }
  }

  const targetPlan = plan || currentDevPlan;
  const devUserId = DEV_USER_IDS[targetPlan];

  if (devUserId) {
    // Try to get seeded dev user by ID
    const { data: seededUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', devUserId)
      .single();

    if (seededUser) {
      return seededUser;
    }
  }

  // Fallback to legacy dev user
  const devEmail = process.env.DEV_USER_EMAIL || 'dev@localhost.com';

  let { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', devEmail)
    .single();

  if (!user) {
    const { data: newUser, error } = await supabaseAdmin
      .from('users')
      .insert({
        email: devEmail,
        full_name: 'Dev User',
        date_of_birth: '1990-01-01',
        address: '123 Dev Street, Localhost, LC 00000',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create dev user:', error);
      return null;
    }
    user = newUser;
    console.log('Created dev user:', devEmail);
  }

  return user;
};

/**
 * Middleware to verify Supabase Auth token and attach user to request
 * In dev mode, bypasses auth and uses dev user
 */
const authenticate = async (req, res, next) => {
  try {
    // Dev mode bypass
    if (process.env.DEV_MODE === 'true') {
      const devUser = await getDevUser();
      if (devUser) {
        req.user = devUser;
        req.userId = devUser.id;
        return next();
      }
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase Auth
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authUser) {
      return res.status(401).json({ error: { message: 'Invalid token' } });
    }


    // Get or create user profile in our users table
    let { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    // Create user profile if doesn't exist (first time login)
    if (!user) {
      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('Failed to create user profile:', createError);
        return res.status(500).json({ error: { message: 'Failed to create user profile' } });
      }
      user = newUser;

      // Send welcome email for first-time signup (async, don't block request)
      if (isEmailConfigured()) {
        sendWelcomeEmail(user.id, { planId: 'starter' })
          .then(() => console.log(`[Auth] Welcome email sent to ${user.email}`))
          .catch((err) => console.error('[Auth] Failed to send welcome email:', err.message));
      }
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;
    req.authUser = authUser;

    next();
  } catch (error) {
    console.error('Auth error:', error);
    next(error);
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    // Dev mode bypass
    if (process.env.DEV_MODE === 'true') {
      const devUser = await getDevUser();
      if (devUser) {
        req.user = devUser;
        req.userId = devUser.id;
      }
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const { data: { user: authUser } } = await supabaseAdmin.auth.getUser(token);

    if (authUser) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  getDevUser,
  setDevPlan,
  getDevPlan,
  setCustomUserId,
  getCustomUserId,
  clearCustomUserId,
  DEV_USER_IDS
};
