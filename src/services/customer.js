const { supabaseAdmin } = require('./supabase');

/**
 * List customers for a user
 */
async function listCustomers(userId, options = {}) {
  const { search, limit = 50, offset = 0 } = options;

  let query = supabaseAdmin
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) throw error;
  return { customers: data, total: count };
}

/**
 * Get a specific customer
 */
async function getCustomer(userId, customerId) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .eq('id', customerId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Find customer by phone number
 */
async function findCustomerByPhone(userId, phone) {
  // Normalize phone number (remove spaces, dashes, etc.)
  const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .or(`phone.eq.${phone},phone.eq.${normalizedPhone}`)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Find customer by email
 */
async function findCustomerByEmail(userId, email) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .ilike('email', email)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Create a new customer
 */
async function createCustomer(userId, customerData) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .insert({
      user_id: userId,
      full_name: customerData.fullName,
      date_of_birth: customerData.dateOfBirth || null,
      phone: customerData.phone || null,
      email: customerData.email || null,
      address_line1: customerData.addressLine1 || null,
      address_line2: customerData.addressLine2 || null,
      city: customerData.city || null,
      postcode: customerData.postcode || null,
      country: customerData.country || 'IE',
      custom_fields: customerData.customFields || {},
      notes: customerData.notes || null,
      tags: customerData.tags || []
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a customer
 */
async function updateCustomer(userId, customerId, updates) {
  const updateData = { updated_at: new Date().toISOString() };

  if (updates.fullName !== undefined) updateData.full_name = updates.fullName;
  if (updates.dateOfBirth !== undefined) updateData.date_of_birth = updates.dateOfBirth;
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.addressLine1 !== undefined) updateData.address_line1 = updates.addressLine1;
  if (updates.addressLine2 !== undefined) updateData.address_line2 = updates.addressLine2;
  if (updates.city !== undefined) updateData.city = updates.city;
  if (updates.postcode !== undefined) updateData.postcode = updates.postcode;
  if (updates.country !== undefined) updateData.country = updates.country;
  if (updates.customFields !== undefined) updateData.custom_fields = updates.customFields;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.tags !== undefined) updateData.tags = updates.tags;

  const { data, error } = await supabaseAdmin
    .from('customers')
    .update(updateData)
    .eq('user_id', userId)
    .eq('id', customerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a customer
 */
async function deleteCustomer(userId, customerId) {
  const { error } = await supabaseAdmin
    .from('customers')
    .delete()
    .eq('user_id', userId)
    .eq('id', customerId);

  if (error) throw error;
  return true;
}

/**
 * Update customer's last booking timestamp
 */
async function updateLastBooking(userId, customerId) {
  const { error } = await supabaseAdmin
    .from('customers')
    .update({
      last_booking_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('id', customerId);

  if (error) throw error;
  return true;
}

/**
 * Verify customer identity
 * Returns true if verification passes, false otherwise
 */
async function verifyCustomer(userId, verificationData, requiredFields) {
  // Find customer by phone or email
  let customer = null;

  if (verificationData.phone) {
    customer = await findCustomerByPhone(userId, verificationData.phone);
  } else if (verificationData.email) {
    customer = await findCustomerByEmail(userId, verificationData.email);
  }

  if (!customer) {
    return { success: false, error: 'customer_not_found' };
  }

  // Check required fields
  const mismatches = [];

  for (const field of requiredFields) {
    switch (field) {
      case 'full_name':
        if (verificationData.fullName &&
            customer.full_name.toLowerCase() !== verificationData.fullName.toLowerCase()) {
          mismatches.push('full_name');
        }
        break;
      case 'date_of_birth':
        if (verificationData.dateOfBirth &&
            customer.date_of_birth !== verificationData.dateOfBirth) {
          mismatches.push('date_of_birth');
        }
        break;
      case 'postcode':
        if (verificationData.postcode &&
            customer.postcode?.toLowerCase() !== verificationData.postcode.toLowerCase()) {
          mismatches.push('postcode');
        }
        break;
      case 'phone':
        // Phone already matched to find customer
        break;
      case 'email':
        // Email already matched to find customer
        break;
    }
  }

  if (mismatches.length > 0) {
    return {
      success: false,
      error: 'verification_failed',
      mismatches
    };
  }

  return {
    success: true,
    customer
  };
}

/**
 * Get customer's booking history
 */
async function getCustomerBookings(userId, customerId, limit = 10) {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .eq('customer_id', customerId)
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

module.exports = {
  listCustomers,
  getCustomer,
  findCustomerByPhone,
  findCustomerByEmail,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  updateLastBooking,
  verifyCustomer,
  getCustomerBookings
};
