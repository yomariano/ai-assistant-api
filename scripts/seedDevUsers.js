/**
 * Seed script to create 3 dev users with different subscription plans
 * Run with: node scripts/seedDevUsers.js
 */
require('dotenv').config();
const { supabaseAdmin: supabase } = require('../src/services/supabase');

// Fixed UUIDs for dev users (so they're consistent across runs)
const DEV_USERS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'starter@dev.local',
    full_name: 'Dev User (Starter)',
    plan_id: 'starter',
    phone_numbers: ['+15551000001'],
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'growth@dev.local',
    full_name: 'Dev User (Growth)',
    plan_id: 'growth',
    phone_numbers: ['+15552000001', '+15552000002'],
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'pro@dev.local',
    full_name: 'Dev User (Pro)',
    plan_id: 'pro',
    phone_numbers: ['+15553000001'],
  },
];

async function seedDevUsers() {
  console.log('Seeding dev users...\n');

  // First, ensure subscription plans exist (OrderBot per-call pricing model)
  console.log('Checking subscription plans...');
  const plans = [
    { id: 'starter', name: 'Starter', price_cents: 4900, minutes_included: 0, max_minutes_per_call: 15, per_call_rate_cents: 0, calls_cap: 100 },
    { id: 'growth', name: 'Growth', price_cents: 19900, minutes_included: 0, max_minutes_per_call: 15, per_call_rate_cents: 0, calls_cap: 500 },
    { id: 'pro', name: 'Pro', price_cents: 59900, minutes_included: 0, max_minutes_per_call: 30, per_call_rate_cents: 0, calls_cap: 1500 },
  ];

  for (const plan of plans) {
    const { error } = await supabase
      .from('subscription_plans')
      .upsert(plan, { onConflict: 'id' });

    if (error) {
      console.error(`  Failed to create plan ${plan.id}:`, error.message);
    }
  }
  console.log('  ✓ Subscription plans ready\n');

  for (const devUser of DEV_USERS) {
    console.log(`Creating ${devUser.plan_id} user: ${devUser.email}`);

    try {
      // 1. Create or update user
      const { error: userError } = await supabase
        .from('users')
        .upsert({
          id: devUser.id,
          email: devUser.email,
          full_name: devUser.full_name,
          stripe_customer_id: `cus_dev_${devUser.plan_id}`,
          created_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (userError) {
        console.error(`  Error creating user:`, userError.message);
        continue;
      }
      console.log(`  ✓ User created`);

      // 2. Create subscription
      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const { error: subError } = await supabase
        .from('user_subscriptions')
        .upsert({
          user_id: devUser.id,
          plan_id: devUser.plan_id,
          stripe_customer_id: `cus_dev_${devUser.plan_id}`,
          stripe_subscription_id: `sub_dev_${devUser.plan_id}`,
          status: 'active',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (subError) {
        console.error(`  Error creating subscription:`, subError.message);
        continue;
      }
      console.log(`  ✓ Subscription created (${devUser.plan_id})`);

      // 3. Create assistant
      const { error: assistantError } = await supabase
        .from('user_assistants')
        .upsert({
          user_id: devUser.id,
          vapi_assistant_id: `vapi_dev_${devUser.plan_id}`,
          name: `${devUser.full_name}'s Assistant`,
          first_message: `Hi! This is ${devUser.full_name.split(' ')[0]}'s AI assistant. How can I help you today?`,
          system_prompt: `You are a helpful AI assistant for ${devUser.full_name}. Be professional, friendly, and concise.`,
          voice_id: 'jennifer',
          voice_provider: 'playht',
          business_name: `${devUser.plan_id.charAt(0).toUpperCase() + devUser.plan_id.slice(1)} Test Business`,
          business_description: `A test business on the ${devUser.plan_id} plan.`,
          greeting_name: devUser.full_name.split(' ')[0],
          voice_cloning_enabled: ['growth', 'pro'].includes(devUser.plan_id),
          custom_knowledge_base: devUser.plan_id === 'pro',
          last_synced_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (assistantError) {
        console.error(`  Error creating assistant:`, assistantError.message);
        continue;
      }
      console.log(`  ✓ Assistant created`);

      // 4. Get assistant ID for phone numbers
      const { data: assistant } = await supabase
        .from('user_assistants')
        .select('id')
        .eq('user_id', devUser.id)
        .single();

      // 5. Delete existing phone numbers for this user
      await supabase
        .from('user_phone_numbers')
        .delete()
        .eq('user_id', devUser.id);

      // 6. Create phone numbers
      for (let i = 0; i < devUser.phone_numbers.length; i++) {
        const { error: phoneError } = await supabase
          .from('user_phone_numbers')
          .insert({
            user_id: devUser.id,
            phone_number: devUser.phone_numbers[i],
            telnyx_id: `telnyx_dev_${devUser.plan_id}_${i + 1}`,
            vapi_id: `vapi_phone_dev_${devUser.plan_id}_${i + 1}`,
            assistant_id: assistant?.id,
            label: `Phone ${i + 1}`,
            status: 'active',
            created_at: new Date().toISOString(),
          });

        if (phoneError) {
          console.error(`  Error creating phone ${i + 1}:`, phoneError.message);
        }
      }
      console.log(`  ✓ ${devUser.phone_numbers.length} phone number(s) created`);

      // 7. Create usage tracking
      const usageStart = new Date();
      usageStart.setDate(1);
      usageStart.setHours(0, 0, 0, 0);

      const usageEnd = new Date(usageStart);
      usageEnd.setMonth(usageEnd.getMonth() + 1);
      usageEnd.setDate(0); // Last day of the month

      // Simulate different usage levels per plan
      const usageMinutes = {
        starter: 75,   // 75% of 100 calls
        growth: 300,   // 60% of 500 calls
        pro: 750,      // 50% of 1500 calls
      };

      const { error: usageError } = await supabase
        .from('usage_tracking')
        .upsert({
          user_id: devUser.id,
          period_start: usageStart.toISOString().slice(0, 10),
          period_end: usageEnd.toISOString().slice(0, 10),
          calls_made: Math.floor(usageMinutes[devUser.plan_id] / 3),
          minutes_used: usageMinutes[devUser.plan_id],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,period_start' });

      if (usageError) {
        console.error(`  Error creating usage:`, usageError.message);
      } else {
        console.log(`  ✓ Usage tracking created (${usageMinutes[devUser.plan_id]} mins used)`);
      }

      console.log('');
    } catch (err) {
      console.error(`  Unexpected error:`, err.message);
    }
  }

  console.log('Done! Dev users created:');
  console.log('  - starter@dev.local (Starter plan, 1 number)');
  console.log('  - growth@dev.local (Growth plan, 1 number)');
  console.log('  - pro@dev.local (Pro plan, 1 number)');
  console.log('\nUse /api/auth/dev-login?plan=starter|growth|pro to switch users');
}

seedDevUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
