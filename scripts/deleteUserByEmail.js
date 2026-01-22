/**
 * Delete a user and all their data by email
 * Usage: node scripts/deleteUserByEmail.js <email>
 * Example: node scripts/deleteUserByEmail.js yomariano05@gmail.com
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/deleteUserByEmail.js <email>');
  process.exit(1);
}

async function deleteUser() {
  console.log(`\nLooking up user: ${email}\n`);

  // Find user by email
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('email', email)
    .single();

  if (userErr || !user) {
    console.error('User not found in users table, checking auth.users...');

    // Try to find in auth.users
    const { data: { users: authUsers }, error: authErr } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.find(u => u.email === email);

    if (!authUser) {
      console.error('User not found in auth.users either. Nothing to delete.');
      process.exit(1);
    }

    console.log(`Found in auth.users: ${authUser.id}`);
    await deleteUserData(authUser.id);
    return;
  }

  console.log(`Found user: ${user.full_name} (${user.id})\n`);
  await deleteUserData(user.id);
}

async function deleteUserData(userId) {
  console.log('Deleting user data...\n');

  const tables = [
    'provider_sync_logs',
    'provider_connections',
    'bookings',
    'customers',
    'booking_configs',
    'call_notifications',
    'escalation_settings',
    'notification_preferences',
    'call_history',
    'scheduled_calls',
    'saved_calls',
    'user_assistants',
    'user_onboarding',
    'provisioning_queue',
    'number_assignment_history',
    'user_phone_numbers',
    'usage_tracking',
    'trial_usage',
    'user_subscriptions',
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    const status = error ? `error: ${error.message}` : 'deleted';
    console.log(`  ${table}: ${status}`);
  }

  // Delete from users table (uses 'id' not 'user_id')
  const { error: usersErr } = await supabase.from('users').delete().eq('id', userId);
  console.log(`  users: ${usersErr ? `error: ${usersErr.message}` : 'deleted'}`);

  // Release phone numbers back to pool
  const { error: poolErr } = await supabase
    .from('phone_number_pool')
    .update({
      assigned_to: null,
      assigned_at: null,
      reserved_at: null,
      reserved_until: null,
      status: 'available'
    })
    .eq('assigned_to', userId);
  console.log(`  phone_number_pool: ${poolErr ? `error: ${poolErr.message}` : 'released'}`);

  // Delete from auth.users
  const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
  console.log(`  auth.users: ${authErr ? `error: ${authErr.message}` : 'deleted'}`);

  console.log('\n✅ User completely removed!\n');
}

deleteUser().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
