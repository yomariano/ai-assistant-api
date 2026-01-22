/**
 * Assign a phone number to a dev user
 * Run: node scripts/assignDevNumber.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PHONE_NUMBER = '+35312655193';
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'; // starter plan dev user

async function main() {
  console.log('Assigning phone number to dev user...');
  console.log('Phone:', PHONE_NUMBER);
  console.log('User:', DEV_USER_ID);

  try {
    // 1. Check if number exists in pool
    let { data: poolNumber, error: findError } = await supabase
      .from('phone_number_pool')
      .select('*')
      .eq('phone_number', PHONE_NUMBER)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      throw findError;
    }

    // 2. If not in pool, add it
    if (!poolNumber) {
      console.log('Number not in pool, adding...');
      const { data: newNumber, error: insertError } = await supabase
        .from('phone_number_pool')
        .insert({
          phone_number: PHONE_NUMBER,
          region: 'IE',
          provider: 'voipcloud',
          status: 'available',
          capabilities: { voice: true, sms: false },
          notes: 'Dev testing number'
        })
        .select()
        .single();

      if (insertError) throw insertError;
      poolNumber = newNumber;
      console.log('Added to pool:', poolNumber.id);
    } else {
      console.log('Number already in pool:', poolNumber.id, 'Status:', poolNumber.status);
    }

    // 3. Assign to dev user
    const { data: updatedNumber, error: updateError } = await supabase
      .from('phone_number_pool')
      .update({
        status: 'assigned',
        assigned_to: DEV_USER_ID,
        assigned_at: new Date().toISOString(),
        reserved_at: null,
        reserved_until: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', poolNumber.id)
      .select()
      .single();

    if (updateError) throw updateError;
    console.log('Assigned to dev user!');

    // 4. Check if user_phone_numbers entry exists
    const { data: existingUserPhone } = await supabase
      .from('user_phone_numbers')
      .select('*')
      .eq('user_id', DEV_USER_ID)
      .eq('phone_number', PHONE_NUMBER)
      .single();

    if (!existingUserPhone) {
      // Create user_phone_numbers entry
      const { data: userPhone, error: userPhoneError } = await supabase
        .from('user_phone_numbers')
        .insert({
          user_id: DEV_USER_ID,
          phone_number: PHONE_NUMBER,
          provider: 'voipcloud',
          status: 'active',
          region: 'IE',
          pool_number_id: poolNumber.id
        })
        .select()
        .single();

      if (userPhoneError) throw userPhoneError;
      console.log('Created user_phone_numbers entry:', userPhone.id);
    } else {
      // Update existing entry
      await supabase
        .from('user_phone_numbers')
        .update({
          status: 'active',
          pool_number_id: poolNumber.id
        })
        .eq('id', existingUserPhone.id);
      console.log('Updated existing user_phone_numbers entry');
    }

    console.log('\n=== SUCCESS ===');
    console.log('Phone number', PHONE_NUMBER, 'is now assigned to dev user');
    console.log('Pool ID:', poolNumber.id);

  } catch (error) {
    console.error('Error:', error.message || error);
    process.exit(1);
  }
}

main();
