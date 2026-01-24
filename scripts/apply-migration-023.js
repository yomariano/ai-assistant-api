/**
 * Apply migration 023 - Update subscription_plans with feature columns
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('Applying migration 023_update_subscription_plans_features...\n');

  // Step 1: Add feature columns
  console.log('Step 1: Adding feature columns...');

  const alterStatements = [
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS inbound_calls_limit INTEGER DEFAULT 100',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS outbound_calls_limit INTEGER DEFAULT 0',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS google_calendar_enabled BOOLEAN DEFAULT false',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS outlook_calendar_enabled BOOLEAN DEFAULT false',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS multi_staff_calendar_enabled BOOLEAN DEFAULT false',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS customer_sms_confirmation_enabled BOOLEAN DEFAULT false',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS customer_sms_reminders_enabled BOOLEAN DEFAULT false',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS customer_voice_reminders_enabled BOOLEAN DEFAULT false',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS business_email_enabled BOOLEAN DEFAULT true',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS business_sms_enabled BOOLEAN DEFAULT false',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS business_webhook_enabled BOOLEAN DEFAULT false',
    'ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 5',
    "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS support_level TEXT DEFAULT 'docs'",
  ];

  for (const sql of alterStatements) {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error && !error.message.includes('already exists')) {
      console.log('  Warning:', error.message);
    }
  }
  console.log('  Columns added.\n');

  // Step 2: Update STARTER plan
  console.log('Step 2: Updating Starter plan...');
  const { error: starterErr } = await supabase
    .from('subscription_plans')
    .update({
      name: 'Starter',
      description: 'Perfect for solo businesses getting started with AI call handling',
      price_cents: 4900,
      interval: 'month',
      inbound_calls_limit: 100,
      outbound_calls_limit: 0,
      google_calendar_enabled: true,
      outlook_calendar_enabled: false,
      multi_staff_calendar_enabled: false,
      customer_sms_confirmation_enabled: false,
      customer_sms_reminders_enabled: false,
      customer_voice_reminders_enabled: false,
      business_email_enabled: true,
      business_sms_enabled: false,
      business_webhook_enabled: false,
      trial_days: 5,
      support_level: 'docs',
      features: ['100 inbound calls/month', 'Google Calendar integration', 'Email notifications', '5-day free trial'],
      is_active: true,
      sort_order: 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'starter');

  if (starterErr) console.log('  Error:', starterErr.message);
  else console.log('  Starter updated: €49/mo, 100 calls\n');

  // Step 3: Update GROWTH plan
  console.log('Step 3: Updating Growth plan...');
  const { error: growthErr } = await supabase
    .from('subscription_plans')
    .update({
      name: 'Growth',
      description: 'For growing businesses that need SMS confirmations and reminders',
      price_cents: 19900,
      interval: 'month',
      inbound_calls_limit: 500,
      outbound_calls_limit: 0,
      google_calendar_enabled: true,
      outlook_calendar_enabled: true,
      multi_staff_calendar_enabled: false,
      customer_sms_confirmation_enabled: true,
      customer_sms_reminders_enabled: true,
      customer_voice_reminders_enabled: false,
      business_email_enabled: true,
      business_sms_enabled: true,
      business_webhook_enabled: false,
      trial_days: 5,
      support_level: 'business_hours',
      features: ['500 inbound calls/month', 'Google + Outlook Calendar', 'Customer SMS confirmations', 'SMS reminders (24h before)', 'Business hours support (9-5)', '5-day free trial'],
      is_active: true,
      sort_order: 2,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'growth');

  if (growthErr) console.log('  Error:', growthErr.message);
  else console.log('  Growth updated: €199/mo, 500 calls\n');

  // Step 4: Update PRO plan (formerly scale)
  console.log('Step 4: Updating Pro plan...');

  // First check if 'pro' exists
  const { data: proExists } = await supabase
    .from('subscription_plans')
    .select('id')
    .eq('id', 'pro')
    .single();

  if (proExists) {
    // Update existing pro plan
    const { error: proErr } = await supabase
      .from('subscription_plans')
      .update({
        name: 'Pro',
        description: 'For high-volume businesses with outbound reminder calls',
        price_cents: 59900,
        interval: 'month',
        inbound_calls_limit: 1500,
        outbound_calls_limit: 200,
        google_calendar_enabled: true,
        outlook_calendar_enabled: true,
        multi_staff_calendar_enabled: true,
        customer_sms_confirmation_enabled: true,
        customer_sms_reminders_enabled: true,
        customer_voice_reminders_enabled: true,
        business_email_enabled: true,
        business_sms_enabled: true,
        business_webhook_enabled: true,
        trial_days: 5,
        support_level: 'priority_24_7',
        features: ['1,500 inbound calls/month', '200 outbound reminder calls/month', 'Multi-staff calendar', 'AI voice reminders', 'Webhook notifications', '24/7 priority support', '5-day free trial'],
        is_active: true,
        sort_order: 3,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'pro');

    if (proErr) console.log('  Error:', proErr.message);
    else console.log('  Pro updated: €599/mo, 1500 inbound + 200 outbound calls\n');
  } else {
    // Update scale to be the pro plan
    const { error: scaleErr } = await supabase
      .from('subscription_plans')
      .update({
        name: 'Pro',
        description: 'For high-volume businesses with outbound reminder calls',
        price_cents: 59900,
        interval: 'month',
        inbound_calls_limit: 1500,
        outbound_calls_limit: 200,
        google_calendar_enabled: true,
        outlook_calendar_enabled: true,
        multi_staff_calendar_enabled: true,
        customer_sms_confirmation_enabled: true,
        customer_sms_reminders_enabled: true,
        customer_voice_reminders_enabled: true,
        business_email_enabled: true,
        business_sms_enabled: true,
        business_webhook_enabled: true,
        trial_days: 5,
        support_level: 'priority_24_7',
        features: ['1,500 inbound calls/month', '200 outbound reminder calls/month', 'Multi-staff calendar', 'AI voice reminders', 'Webhook notifications', '24/7 priority support', '5-day free trial'],
        is_active: true,
        sort_order: 3,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'scale');

    if (scaleErr) console.log('  Error:', scaleErr.message);
    else console.log('  Scale -> Pro updated: €599/mo, 1500 inbound + 200 outbound calls\n');
  }

  // Step 5: Deactivate old plans
  console.log('Step 5: Deactivating old plans...');
  const { error: deactivateErr } = await supabase
    .from('subscription_plans')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .in('id', ['business', 'agency'])
    .neq('id', 'starter')
    .neq('id', 'growth')
    .neq('id', 'scale')
    .neq('id', 'pro');

  if (deactivateErr) console.log('  Error:', deactivateErr.message);
  else console.log('  Old plans deactivated.\n');

  // Step 6: Create user_feature_overrides table
  console.log('Step 6: Creating user_feature_overrides table...');
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS user_feature_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      inbound_calls_limit_override INTEGER,
      outbound_calls_limit_override INTEGER,
      google_calendar_override BOOLEAN,
      outlook_calendar_override BOOLEAN,
      multi_staff_calendar_override BOOLEAN,
      customer_sms_confirmation_override BOOLEAN,
      customer_sms_reminders_override BOOLEAN,
      customer_voice_reminders_override BOOLEAN,
      business_email_override BOOLEAN,
      business_sms_override BOOLEAN,
      business_webhook_override BOOLEAN,
      trial_days_override INTEGER,
      notes TEXT,
      modified_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id)
    )
  `;
  const { error: createErr } = await supabase.rpc('exec_sql', { sql_query: createTableSql });
  if (createErr && !createErr.message.includes('already exists')) {
    console.log('  Note: Table may need to be created manually:', createErr.message);
  } else {
    console.log('  user_feature_overrides table ready.\n');
  }

  // Verify
  console.log('='.repeat(50));
  console.log('Verification:');
  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('id, name, price_cents, inbound_calls_limit, outbound_calls_limit, google_calendar_enabled, is_active')
    .order('sort_order');

  console.log('\nCurrent plans:');
  for (const plan of plans || []) {
    const price = (plan.price_cents / 100).toFixed(0);
    const status = plan.is_active ? '✅' : '❌';
    console.log(`  ${status} ${plan.id}: ${plan.name} - €${price}/mo, ${plan.inbound_calls_limit || '?'} inbound, ${plan.outbound_calls_limit || 0} outbound, gcal: ${plan.google_calendar_enabled}`);
  }

  console.log('\n✨ Migration complete!');
}

runMigration().catch(console.error);
