#!/usr/bin/env node
/**
 * Admin script to sync assistant to phone numbers for existing users
 *
 * Usage:
 *   node scripts/sync-phone-numbers.js                    # Sync all users
 *   node scripts/sync-phone-numbers.js <user-id>          # Sync specific user
 *   node scripts/sync-phone-numbers.js --dry-run          # Preview without making changes
 */

require('dotenv').config();

const { supabaseAdmin } = require('../src/services/supabase');
const { syncAssistantToPhoneNumbers } = require('../src/services/assistant');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const specificUserId = args.find(arg => !arg.startsWith('--'));

  console.log('=== Phone Number Sync Script ===\n');

  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made\n');
  }

  try {
    let users;

    if (specificUserId) {
      // Sync specific user
      console.log(`Syncing user: ${specificUserId}\n`);
      users = [{ user_id: specificUserId }];
    } else {
      // Get all users with active assistants and phone numbers
      const { data, error } = await supabaseAdmin
        .from('user_assistants')
        .select(`
          user_id,
          vapi_assistant_id,
          greeting_name,
          business_name
        `)
        .eq('status', 'active')
        .not('vapi_assistant_id', 'is', null);

      if (error) throw error;
      users = data || [];
    }

    console.log(`Found ${users.length} user(s) with active assistants\n`);

    let totalSynced = 0;
    let totalErrors = 0;

    for (const user of users) {
      console.log(`--- User: ${user.user_id} ---`);
      if (user.business_name) {
        console.log(`    Business: ${user.business_name}`);
      }
      if (user.greeting_name) {
        console.log(`    Assistant: ${user.greeting_name}`);
      }

      // Get user's phone numbers
      const { data: phones } = await supabaseAdmin
        .from('user_phone_numbers')
        .select('phone_number, vapi_id')
        .eq('user_id', user.user_id)
        .eq('status', 'active');

      if (!phones || phones.length === 0) {
        console.log('    No active phone numbers found\n');
        continue;
      }

      console.log(`    Phone numbers: ${phones.map(p => p.phone_number).join(', ')}`);

      if (dryRun) {
        console.log('    [DRY RUN] Would sync assistant to phone numbers\n');
        continue;
      }

      try {
        const result = await syncAssistantToPhoneNumbers(user.user_id);
        console.log(`    ✓ Synced: ${result.synced} number(s)`);

        if (result.errors.length > 0) {
          console.log(`    ✗ Errors: ${result.errors.length}`);
          result.errors.forEach(e => {
            console.log(`      - ${e.phone}: ${e.error}`);
          });
        }

        totalSynced += result.synced;
        totalErrors += result.errors.length;
      } catch (err) {
        console.log(`    ✗ Failed: ${err.message}`);
        totalErrors++;
      }

      console.log('');
    }

    console.log('=== Summary ===');
    console.log(`Users processed: ${users.length}`);
    console.log(`Phone numbers synced: ${totalSynced}`);
    console.log(`Errors: ${totalErrors}`);

  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  }
}

main();
