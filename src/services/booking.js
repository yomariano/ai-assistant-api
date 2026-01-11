const { supabaseAdmin } = require('./supabase');

/**
 * Get all industry templates
 */
async function getIndustryTemplates() {
  const { data, error } = await supabaseAdmin
    .from('industry_templates')
    .select('*')
    .order('sort_order');

  if (error) throw error;
  return data;
}

/**
 * Get a specific industry template
 */
async function getIndustryTemplate(templateId) {
  const { data, error } = await supabaseAdmin
    .from('industry_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get user's booking configuration
 */
async function getBookingConfig(userId) {
  const { data, error } = await supabaseAdmin
    .from('booking_configs')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Create or update user's booking configuration
 */
async function upsertBookingConfig(userId, config) {
  const { data: existing } = await supabaseAdmin
    .from('booking_configs')
    .select('id')
    .eq('user_id', userId)
    .single();

  const configData = {
    user_id: userId,
    industry_template_id: config.industryTemplateId,
    booking_fields: config.bookingFields || [],
    verification_enabled: config.verificationEnabled || false,
    verification_fields: config.verificationFields || [],
    verification_on_fail: config.verificationOnFail || 'transfer_to_staff',
    new_customer_action: config.newCustomerAction || 'create_record',
    new_customer_fields: config.newCustomerFields || [],
    payment_required: config.paymentRequired || false,
    payment_type: config.paymentType || 'none',
    deposit_amount_cents: config.depositAmountCents || 0,
    calendar_provider: config.calendarProvider || null,
    calendar_id: config.calendarId || null,
    sms_confirmation: config.smsConfirmation !== false,
    email_confirmation: config.emailConfirmation || false,
    confirmation_template: config.confirmationTemplate || null,
    is_active: config.isActive !== false,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    // Update
    const { data, error } = await supabaseAdmin
      .from('booking_configs')
      .update(configData)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Insert
    const { data, error } = await supabaseAdmin
      .from('booking_configs')
      .insert(configData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

/**
 * Delete user's booking configuration
 */
async function deleteBookingConfig(userId) {
  const { error } = await supabaseAdmin
    .from('booking_configs')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

/**
 * List bookings for a user
 */
async function listBookings(userId, options = {}) {
  const { status, startDate, endDate, limit = 50, offset = 0 } = options;

  let query = supabaseAdmin
    .from('bookings')
    .select('*, customers(full_name, phone, email)')
    .eq('user_id', userId)
    .order('booking_date', { ascending: false })
    .order('booking_time', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  if (startDate) {
    query = query.gte('booking_date', startDate);
  }

  if (endDate) {
    query = query.lte('booking_date', endDate);
  }

  const { data, error, count } = await query;

  if (error) throw error;
  return { bookings: data, total: count };
}

/**
 * Get a specific booking
 */
async function getBooking(userId, bookingId) {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*, customers(*)')
    .eq('user_id', userId)
    .eq('id', bookingId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Create a new booking
 */
async function createBooking(userId, bookingData) {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .insert({
      user_id: userId,
      customer_id: bookingData.customerId || null,
      status: bookingData.status || 'pending',
      booking_data: bookingData.bookingData || {},
      booking_date: bookingData.bookingDate,
      booking_time: bookingData.bookingTime,
      duration_minutes: bookingData.durationMinutes || null,
      customer_name: bookingData.customerName,
      customer_phone: bookingData.customerPhone || null,
      customer_email: bookingData.customerEmail || null,
      payment_required: bookingData.paymentRequired || false,
      payment_amount_cents: bookingData.paymentAmountCents || null,
      source: bookingData.source || 'phone',
      call_id: bookingData.callId || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a booking
 */
async function updateBooking(userId, bookingId, updates) {
  const updateData = { updated_at: new Date().toISOString() };

  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.bookingData !== undefined) updateData.booking_data = updates.bookingData;
  if (updates.bookingDate !== undefined) updateData.booking_date = updates.bookingDate;
  if (updates.bookingTime !== undefined) updateData.booking_time = updates.bookingTime;
  if (updates.durationMinutes !== undefined) updateData.duration_minutes = updates.durationMinutes;
  if (updates.customerName !== undefined) updateData.customer_name = updates.customerName;
  if (updates.customerPhone !== undefined) updateData.customer_phone = updates.customerPhone;
  if (updates.customerEmail !== undefined) updateData.customer_email = updates.customerEmail;
  if (updates.paymentStatus !== undefined) updateData.payment_status = updates.paymentStatus;
  if (updates.stripeSessionId !== undefined) updateData.stripe_session_id = updates.stripeSessionId;
  if (updates.stripePaymentIntentId !== undefined) updateData.stripe_payment_intent_id = updates.stripePaymentIntentId;
  if (updates.calendarEventId !== undefined) updateData.calendar_event_id = updates.calendarEventId;

  if (updates.status === 'confirmed') {
    updateData.confirmed_at = new Date().toISOString();
  } else if (updates.status === 'cancelled') {
    updateData.cancelled_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update(updateData)
    .eq('user_id', userId)
    .eq('id', bookingId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete/cancel a booking
 */
async function deleteBooking(userId, bookingId) {
  // Soft delete by setting status to cancelled
  return updateBooking(userId, bookingId, { status: 'cancelled' });
}

/**
 * Confirm a booking (after payment if required)
 */
async function confirmBooking(userId, bookingId, paymentDetails = {}) {
  const updates = {
    status: 'confirmed',
    ...paymentDetails
  };

  return updateBooking(userId, bookingId, updates);
}

module.exports = {
  getIndustryTemplates,
  getIndustryTemplate,
  getBookingConfig,
  upsertBookingConfig,
  deleteBookingConfig,
  listBookings,
  getBooking,
  createBooking,
  updateBooking,
  deleteBooking,
  confirmBooking
};
