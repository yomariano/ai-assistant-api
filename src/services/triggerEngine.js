/**
 * Trigger Engine Service
 *
 * Handles automated behavioral email triggers based on user activity patterns.
 * Processes usage alerts, inactivity reminders, abandoned upgrades, welcome sequences, and social proof.
 */

const { supabaseAdmin } = require('./supabase');
const { getTemplate, fillTemplate, sendCampaignEmail, EMAIL_CONFIG } = require('./campaignService');

// ============================================
// CONFIGURATION
// ============================================

// Batch limit per trigger per run (to avoid overwhelming email service)
const BATCH_LIMIT = 10;

// ============================================
// TRIGGER FETCHING
// ============================================

/**
 * Get all active triggers ordered by priority
 */
async function getActiveTriggers() {
  const { data, error } = await supabaseAdmin
    .from('automated_triggers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('[TriggerEngine] Error fetching triggers:', error);
    return [];
  }

  return data;
}

/**
 * Get a single trigger by ID
 */
async function getTrigger(triggerId) {
  const { data, error } = await supabaseAdmin
    .from('automated_triggers')
    .select('*')
    .eq('id', triggerId)
    .single();

  if (error) {
    console.error('[TriggerEngine] Error fetching trigger:', error);
    return null;
  }

  return data;
}

// ============================================
// DEDUPLICATION
// ============================================

/**
 * Check if a trigger has already been sent to a user recently (within cooldown)
 */
async function checkAlreadySent(userId, triggerId, cooldownDays, maxSends) {
  // Check cooldown
  if (cooldownDays) {
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);

    const { data: recentSend } = await supabaseAdmin
      .from('trigger_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('trigger_id', triggerId)
      .gte('sent_at', cooldownDate.toISOString())
      .limit(1);

    if (recentSend && recentSend.length > 0) {
      return true; // Still in cooldown
    }
  }

  // Check max sends
  if (maxSends) {
    const { count } = await supabaseAdmin
      .from('trigger_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('trigger_id', triggerId);

    if (count >= maxSends) {
      return true; // Max sends reached
    }
  }

  return false;
}

/**
 * Log a trigger send
 */
async function logTriggerSend(userId, trigger, emailAddress, subject, variablesUsed) {
  const { error } = await supabaseAdmin
    .from('trigger_logs')
    .insert({
      user_id: userId,
      trigger_id: trigger.id,
      template_id: trigger.template_id,
      email_address: emailAddress,
      subject,
      discount_code: trigger.discount_code,
      variables_used: variablesUsed,
    });

  if (error) {
    console.error('[TriggerEngine] Error logging trigger:', error);
  }
}

// ============================================
// USER MATCHING
// ============================================

/**
 * Get users matching a specific trigger's conditions
 */
async function getUsersForTrigger(trigger) {
  const condition = trigger.condition_json;

  switch (trigger.trigger_type) {
    case 'usage':
      return getUsersForUsageTrigger(condition);
    case 'inactivity':
      return getUsersForInactivityTrigger(condition);
    case 'abandoned_upgrade':
      return getUsersForAbandonedUpgradeTrigger(condition);
    case 'welcome_sequence':
      return getUsersForWelcomeSequenceTrigger(condition);
    case 'social_proof':
      return getUsersForSocialProofTrigger(condition);
    default:
      console.warn(`[TriggerEngine] Unknown trigger type: ${trigger.trigger_type}`);
      return [];
  }
}

/**
 * Usage triggers: users at X% of fair use cap
 */
async function getUsersForUsageTrigger(condition) {
  const targetPercent = condition.usage_percent;

  // Get users with pro plan (which has fair use cap)
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select(`
      id,
      email,
      full_name,
      user_subscriptions!inner(plan_id, status),
      usage_tracking(calls_made, period_start, period_end),
      notification_preferences(marketing_emails)
    `)
    .eq('user_subscriptions.status', 'active')
    .eq('user_subscriptions.plan_id', 'pro')
    .not('email', 'is', null);

  if (error) {
    console.error('[TriggerEngine] Error fetching usage users:', error);
    return [];
  }

  // Fair use cap for pro plan
  const FAIR_USE_CAP = 1500;

  return users
    .filter(user => {
      // Check marketing email opt-in
      const prefs = user.notification_preferences;
      if (prefs && prefs.marketing_emails === false) return false;

      // Get current period usage
      const now = new Date();
      const currentUsage = user.usage_tracking?.find(ut => {
        const start = new Date(ut.period_start);
        const end = new Date(ut.period_end);
        return now >= start && now <= end;
      });

      if (!currentUsage) return false;

      const percentUsed = (currentUsage.calls_made / FAIR_USE_CAP) * 100;

      // Match if at target percent (with 5% buffer to catch boundary)
      return percentUsed >= targetPercent && percentUsed < targetPercent + 10;
    })
    .map(user => ({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      planId: 'pro',
      currentUsage: user.usage_tracking?.find(ut => {
        const now = new Date();
        const start = new Date(ut.period_start);
        const end = new Date(ut.period_end);
        return now >= start && now <= end;
      })?.calls_made || 0,
      limit: FAIR_USE_CAP,
    }));
}

/**
 * Inactivity triggers: users with no calls in X days
 */
async function getUsersForInactivityTrigger(condition) {
  const daysInactive = condition.days_inactive;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

  // Buffer: don't include users who became inactive very recently
  const bufferDate = new Date();
  bufferDate.setDate(bufferDate.getDate() - (daysInactive + 1));

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select(`
      id,
      email,
      full_name,
      last_active_at,
      user_subscriptions!inner(plan_id, status),
      notification_preferences(marketing_emails)
    `)
    .eq('user_subscriptions.status', 'active')
    .lte('last_active_at', cutoffDate.toISOString())
    .gte('last_active_at', bufferDate.toISOString())
    .not('email', 'is', null);

  if (error) {
    console.error('[TriggerEngine] Error fetching inactive users:', error);
    return [];
  }

  return users
    .filter(user => {
      const prefs = user.notification_preferences;
      return !prefs || prefs.marketing_emails !== false;
    })
    .map(user => ({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      planId: user.user_subscriptions?.plan_id,
      lastActiveAt: user.last_active_at,
    }));
}

/**
 * Abandoned upgrade triggers: users who viewed pricing X hours ago
 */
async function getUsersForAbandonedUpgradeTrigger(condition) {
  const hoursSinceView = condition.hours_since_view;

  // Look for pricing_view events from around the target time
  const targetTime = new Date();
  targetTime.setHours(targetTime.getHours() - hoursSinceView);

  // Buffer of 1 hour
  const startTime = new Date(targetTime);
  startTime.setHours(startTime.getHours() - 1);
  const endTime = new Date(targetTime);
  endTime.setHours(endTime.getHours() + 1);

  const { data: events, error } = await supabaseAdmin
    .from('user_events')
    .select(`
      user_id,
      created_at,
      users!inner(
        id,
        email,
        full_name,
        user_subscriptions(plan_id, status),
        notification_preferences(marketing_emails)
      )
    `)
    .eq('event_type', 'pricing_view')
    .gte('created_at', startTime.toISOString())
    .lte('created_at', endTime.toISOString());

  if (error) {
    console.error('[TriggerEngine] Error fetching abandoned upgrade users:', error);
    return [];
  }

  // Filter to users who are still on lower plans and haven't upgraded
  return events
    .filter(event => {
      const user = event.users;
      if (!user || !user.email) return false;

      // Check marketing opt-in
      const prefs = user.notification_preferences;
      if (prefs && prefs.marketing_emails === false) return false;

      // Only target starter/growth users (not already on pro)
      const subscription = user.user_subscriptions;
      if (!subscription || subscription.status !== 'active') return false;
      if (subscription.plan_id === 'pro') return false;

      return true;
    })
    .map(event => ({
      id: event.users.id,
      email: event.users.email,
      fullName: event.users.full_name,
      planId: event.users.user_subscriptions?.plan_id,
      pricingViewedAt: event.created_at,
    }));
}

/**
 * Welcome sequence triggers: users X days after signup
 */
async function getUsersForWelcomeSequenceTrigger(condition) {
  const daysSinceSignup = condition.days_since_signup;

  // Target users who signed up exactly X days ago (within 24h window)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - daysSinceSignup);
  targetDate.setHours(0, 0, 0, 0);

  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select(`
      id,
      email,
      full_name,
      created_at,
      user_subscriptions(plan_id, status),
      notification_preferences(marketing_emails)
    `)
    .gte('created_at', targetDate.toISOString())
    .lt('created_at', nextDay.toISOString())
    .not('email', 'is', null);

  if (error) {
    console.error('[TriggerEngine] Error fetching welcome sequence users:', error);
    return [];
  }

  return users
    .filter(user => {
      const prefs = user.notification_preferences;
      return !prefs || prefs.marketing_emails !== false;
    })
    .map(user => ({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      planId: user.user_subscriptions?.plan_id,
      signupDate: user.created_at,
    }));
}

/**
 * Social proof triggers: active users (min X calls last week)
 */
async function getUsersForSocialProofTrigger(condition) {
  const minCallsLastWeek = condition.min_calls_last_week || 1;

  // Get users with calls in the last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: callStats, error } = await supabaseAdmin
    .from('call_history')
    .select('user_id')
    .gte('created_at', weekAgo.toISOString());

  if (error) {
    console.error('[TriggerEngine] Error fetching social proof users:', error);
    return [];
  }

  // Count calls per user
  const callCounts = {};
  callStats.forEach(call => {
    callCounts[call.user_id] = (callCounts[call.user_id] || 0) + 1;
  });

  // Get users with minimum calls
  const eligibleUserIds = Object.entries(callCounts)
    .filter(([_, count]) => count >= minCallsLastWeek)
    .map(([userId]) => userId);

  if (eligibleUserIds.length === 0) return [];

  const { data: users, error: userError } = await supabaseAdmin
    .from('users')
    .select(`
      id,
      email,
      full_name,
      user_subscriptions(plan_id, status),
      notification_preferences(marketing_emails)
    `)
    .in('id', eligibleUserIds)
    .not('email', 'is', null);

  if (userError) {
    console.error('[TriggerEngine] Error fetching social proof user details:', userError);
    return [];
  }

  // Get network-wide stats for the week
  const totalCallsNetwork = callStats.length;

  return users
    .filter(user => {
      const prefs = user.notification_preferences;
      if (prefs && prefs.marketing_emails === false) return false;

      const subscription = user.user_subscriptions;
      return subscription && subscription.status === 'active';
    })
    .map(user => ({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      planId: user.user_subscriptions?.plan_id,
      callsThisWeek: callCounts[user.id] || 0,
      totalCallsNetwork,
    }));
}

// ============================================
// EMAIL SENDING
// ============================================

/**
 * Send a trigger email to a user
 */
async function sendTriggerEmail(trigger, user) {
  const template = await getTemplate(trigger.template_id);
  if (!template) {
    console.error(`[TriggerEngine] Template not found: ${trigger.template_id}`);
    return { success: false, error: 'Template not found' };
  }

  // Build variables
  const variables = {
    firstName: user.fullName?.split(' ')[0] || 'there',
    fullName: user.fullName || '',
    email: user.email,
    dashboardUrl: `${EMAIL_CONFIG.baseUrl}/dashboard`,
    upgradeUrl: `${EMAIL_CONFIG.baseUrl}/billing`,
    bookingUrl: `${EMAIL_CONFIG.baseUrl}/setup-call`,
    discountCode: trigger.discount_code || '',
    discountPercent: trigger.discount_percent?.toString() || '',

    // Usage-specific
    currentUsage: user.currentUsage?.toString() || '',
    limit: user.limit?.toString() || '',
    remaining: user.limit && user.currentUsage ? (user.limit - user.currentUsage).toString() : '',

    // Social proof-specific
    callsThisWeek: user.callsThisWeek?.toString() || '',
    hoursHandled: user.callsThisWeek ? (user.callsThisWeek * 3 / 60).toFixed(1) : '', // Assume 3 min avg call
    totalCallsNetwork: user.totalCallsNetwork?.toString() || '',
    totalOrdersNetwork: user.totalCallsNetwork ? Math.floor(user.totalCallsNetwork * 0.7).toString() : '', // Assume 70% are orders
  };

  const { subject, html, text } = fillTemplate(template, variables);

  const result = await sendCampaignEmail({
    to: user.email,
    subject,
    html,
    text,
  });

  if (result.success) {
    await logTriggerSend(user.id, trigger, user.email, subject, variables);
    console.log(`[TriggerEngine] Sent ${trigger.id} to ${user.email}`);
  } else {
    console.error(`[TriggerEngine] Failed to send ${trigger.id} to ${user.email}:`, result.error);
  }

  return result;
}

// ============================================
// MAIN PROCESSOR
// ============================================

/**
 * Process all active triggers
 * Called by the scheduled job
 */
async function processTriggers() {
  console.log('[TriggerEngine] Starting trigger processing...');

  const triggers = await getActiveTriggers();
  console.log(`[TriggerEngine] Found ${triggers.length} active triggers`);

  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const trigger of triggers) {
    try {
      console.log(`[TriggerEngine] Processing trigger: ${trigger.id} (${trigger.name})`);

      const users = await getUsersForTrigger(trigger);
      console.log(`[TriggerEngine] Found ${users.length} eligible users for ${trigger.id}`);

      let batchSent = 0;

      for (const user of users) {
        // Stop if batch limit reached
        if (batchSent >= BATCH_LIMIT) {
          console.log(`[TriggerEngine] Batch limit reached for ${trigger.id}`);
          break;
        }

        // Check deduplication
        const alreadySent = await checkAlreadySent(
          user.id,
          trigger.id,
          trigger.cooldown_days,
          trigger.max_sends_per_user
        );

        if (alreadySent) {
          totalSkipped++;
          continue;
        }

        // Send the email
        const result = await sendTriggerEmail(trigger, user);

        if (result.success) {
          totalSent++;
          batchSent++;
        } else {
          totalErrors++;
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`[TriggerEngine] Error processing trigger ${trigger.id}:`, error);
      totalErrors++;
    }
  }

  console.log(`[TriggerEngine] Processing complete: ${totalSent} sent, ${totalSkipped} skipped, ${totalErrors} errors`);

  return {
    sent: totalSent,
    skipped: totalSkipped,
    errors: totalErrors,
  };
}

/**
 * Process a single trigger (for manual testing)
 */
async function processSingleTrigger(triggerId) {
  const trigger = await getTrigger(triggerId);
  if (!trigger) {
    throw new Error(`Trigger not found: ${triggerId}`);
  }

  console.log(`[TriggerEngine] Processing single trigger: ${triggerId}`);

  const users = await getUsersForTrigger(trigger);
  console.log(`[TriggerEngine] Found ${users.length} eligible users`);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users.slice(0, BATCH_LIMIT)) {
    const alreadySent = await checkAlreadySent(
      user.id,
      trigger.id,
      trigger.cooldown_days,
      trigger.max_sends_per_user
    );

    if (alreadySent) {
      skipped++;
      continue;
    }

    const result = await sendTriggerEmail(trigger, user);

    if (result.success) {
      sent++;
    } else {
      errors++;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return { triggerId, sent, skipped, errors, totalEligible: users.length };
}

// ============================================
// TRIGGER MANAGEMENT
// ============================================

/**
 * Enable or disable a trigger
 */
async function setTriggerActive(triggerId, isActive) {
  const { data, error } = await supabaseAdmin
    .from('automated_triggers')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', triggerId)
    .select()
    .single();

  if (error) {
    console.error('[TriggerEngine] Error updating trigger:', error);
    throw error;
  }

  return data;
}

/**
 * Update trigger settings
 */
async function updateTrigger(triggerId, updates) {
  const { data, error } = await supabaseAdmin
    .from('automated_triggers')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', triggerId)
    .select()
    .single();

  if (error) {
    console.error('[TriggerEngine] Error updating trigger:', error);
    throw error;
  }

  return data;
}

// ============================================
// E2E TESTING
// ============================================

/**
 * Test a trigger with a mock user for E2E testing
 * Creates a test user matching the trigger conditions, runs the trigger,
 * verifies the email was sent, and cleans up.
 */
async function testTriggerWithMockUser(triggerId) {
  const trigger = await getTrigger(triggerId);
  if (!trigger) {
    return { success: false, error: `Trigger not found: ${triggerId}` };
  }

  const testEmail = `e2e-test-${Date.now()}@test.voicefleet.ai`;
  let testUserId = null;

  try {
    // Step 1: Create a test user with backdated data matching the trigger
    const testUserData = await createTestUserForTrigger(trigger, testEmail);
    testUserId = testUserData.userId;

    console.log(`[TriggerEngine] Created test user ${testUserId} for trigger ${triggerId}`);

    // Step 2: Clear any existing trigger logs for this user (from previous test runs)
    await supabaseAdmin
      .from('trigger_logs')
      .delete()
      .eq('user_id', testUserId)
      .eq('trigger_id', triggerId);

    // Step 3: Process the trigger - it should find and email our test user
    const users = await getUsersForTrigger(trigger);
    const testUser = users.find(u => u.id === testUserId);

    if (!testUser) {
      // Clean up and return error
      await cleanupTestUser(testUserId);
      return {
        success: false,
        error: 'Test user did not match trigger conditions',
        testUserId,
        usersFound: users.length,
      };
    }

    // Step 4: Send the trigger email to the test user
    const sendResult = await sendTriggerEmail(trigger, testUser);

    // Step 5: Check trigger_logs for the sent email
    const { data: triggerLog } = await supabaseAdmin
      .from('trigger_logs')
      .select('*')
      .eq('user_id', testUserId)
      .eq('trigger_id', triggerId)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    // Step 6: Clean up the test user
    await cleanupTestUser(testUserId);

    return {
      success: sendResult.success,
      testUserId,
      emailSent: sendResult.success,
      triggerLog: triggerLog || null,
      error: sendResult.error,
    };
  } catch (error) {
    console.error(`[TriggerEngine] E2E test error for ${triggerId}:`, error);

    // Clean up on error
    if (testUserId) {
      await cleanupTestUser(testUserId);
    }

    return {
      success: false,
      error: error.message,
      testUserId,
    };
  }
}

/**
 * Create a test user with data matching a trigger's conditions
 */
async function createTestUserForTrigger(trigger, testEmail) {
  const condition = trigger.condition_json;
  const now = new Date();

  // Create base user
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .insert({
      email: testEmail,
      full_name: 'E2E Test User',
      created_at: now.toISOString(),
      last_active_at: now.toISOString(),
    })
    .select()
    .single();

  if (userError) {
    throw new Error(`Failed to create test user: ${userError.message}`);
  }

  const userId = user.id;

  // Create subscription based on trigger type
  let planId = 'starter';
  if (trigger.trigger_type === 'usage') {
    planId = 'pro'; // Usage triggers target pro plan
  }

  await supabaseAdmin
    .from('user_subscriptions')
    .insert({
      user_id: userId,
      plan_id: planId,
      status: 'active',
      current_period_start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      current_period_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

  // Create notification preferences (marketing emails enabled)
  await supabaseAdmin
    .from('notification_preferences')
    .insert({
      user_id: userId,
      marketing_emails: true,
    });

  // Set up trigger-specific data
  switch (trigger.trigger_type) {
    case 'usage': {
      // Create usage tracking at the target percentage
      const targetPercent = condition.usage_percent || 80;
      const fairUseCap = 1500;
      const callsMade = Math.floor((fairUseCap * targetPercent) / 100);

      const periodStart = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      await supabaseAdmin
        .from('usage_tracking')
        .insert({
          user_id: userId,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          calls_made: callsMade,
        });
      break;
    }

    case 'inactivity': {
      // Backdate last_active_at to match inactivity condition
      const daysInactive = condition.days_inactive || 7;
      const lastActiveAt = new Date(now.getTime() - daysInactive * 24 * 60 * 60 * 1000);

      await supabaseAdmin
        .from('users')
        .update({ last_active_at: lastActiveAt.toISOString() })
        .eq('id', userId);
      break;
    }

    case 'abandoned_upgrade': {
      // Create a pricing_view event at the target time
      const hoursSinceView = condition.hours_since_view || 1;
      const viewedAt = new Date(now.getTime() - hoursSinceView * 60 * 60 * 1000);

      await supabaseAdmin
        .from('user_events')
        .insert({
          user_id: userId,
          event_type: 'pricing_view',
          created_at: viewedAt.toISOString(),
        });
      break;
    }

    case 'welcome_sequence': {
      // Backdate created_at to match days since signup
      const daysSinceSignup = condition.days_since_signup || 2;
      const createdAt = new Date(now.getTime() - daysSinceSignup * 24 * 60 * 60 * 1000);

      await supabaseAdmin
        .from('users')
        .update({ created_at: createdAt.toISOString() })
        .eq('id', userId);
      break;
    }

    case 'social_proof': {
      // Create call history entries
      const minCalls = condition.min_calls_last_week || 1;
      const calls = [];
      for (let i = 0; i < minCalls; i++) {
        calls.push({
          user_id: userId,
          call_id: `e2e-test-call-${Date.now()}-${i}`,
          status: 'completed',
          created_at: new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      if (calls.length > 0) {
        await supabaseAdmin.from('call_history').insert(calls);
      }
      break;
    }
  }

  return { userId };
}

/**
 * Clean up a test user and all related data
 */
async function cleanupTestUser(userId) {
  try {
    // Delete in order of dependencies
    await supabaseAdmin.from('trigger_logs').delete().eq('user_id', userId);
    await supabaseAdmin.from('call_history').delete().eq('user_id', userId);
    await supabaseAdmin.from('user_events').delete().eq('user_id', userId);
    await supabaseAdmin.from('usage_tracking').delete().eq('user_id', userId);
    await supabaseAdmin.from('notification_preferences').delete().eq('user_id', userId);
    await supabaseAdmin.from('user_subscriptions').delete().eq('user_id', userId);
    await supabaseAdmin.from('users').delete().eq('id', userId);

    console.log(`[TriggerEngine] Cleaned up test user ${userId}`);
  } catch (error) {
    console.error(`[TriggerEngine] Error cleaning up test user ${userId}:`, error);
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Processing
  processTriggers,
  processSingleTrigger,

  // Trigger management
  getActiveTriggers,
  getTrigger,
  setTriggerActive,
  updateTrigger,

  // User matching (exported for testing)
  getUsersForTrigger,
  checkAlreadySent,
  sendTriggerEmail,

  // E2E testing
  testTriggerWithMockUser,
};
