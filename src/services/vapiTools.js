/**
 * VAPI Tools Service
 *
 * Defines and handles VAPI tool calls for booking operations.
 * Routes tool calls through the Generic Provider Router to connected providers.
 */

const providerService = require('./providers');
const bookingService = require('./booking');
const customerService = require('./customer');
const { supabaseAdmin } = require('./supabase');

// ============================================
// TOOL DEFINITIONS
// ============================================

/**
 * Get booking tool definitions for VAPI assistant
 * These tools use serverUrl to call back to our API
 */
function getBookingToolDefinitions(serverUrl) {
  return [
    {
      type: 'function',
      function: {
        name: 'check_availability',
        description: 'Check available time slots for booking an appointment. Use this when a customer wants to book or asks about availability.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'The date to check availability for (YYYY-MM-DD format). If customer says "tomorrow", calculate the actual date.',
            },
            service_type: {
              type: 'string',
              description: 'The type of service or appointment (e.g., "haircut", "consultation", "table for 2"). Optional.',
            },
          },
          required: ['date'],
        },
      },
      server: {
        url: `${serverUrl}/api/vapi/tools`,
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_booking',
        description: 'Create a new booking/reservation after confirming details with the customer. Always confirm the date, time, and customer name before calling this.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'The booking date (YYYY-MM-DD format)',
            },
            time: {
              type: 'string',
              description: 'The booking time (HH:MM format, 24-hour)',
            },
            customer_name: {
              type: 'string',
              description: 'The customer\'s full name',
            },
            customer_phone: {
              type: 'string',
              description: 'The customer\'s phone number (optional, may already be known from caller ID)',
            },
            customer_email: {
              type: 'string',
              description: 'The customer\'s email address (optional)',
            },
            party_size: {
              type: 'integer',
              description: 'Number of people (for restaurant reservations)',
            },
            notes: {
              type: 'string',
              description: 'Any special requests or notes',
            },
          },
          required: ['date', 'time', 'customer_name'],
        },
      },
      server: {
        url: `${serverUrl}/api/vapi/tools`,
      },
    },
    {
      type: 'function',
      function: {
        name: 'cancel_booking',
        description: 'Cancel an existing booking. Use when customer wants to cancel their appointment.',
        parameters: {
          type: 'object',
          properties: {
            booking_reference: {
              type: 'string',
              description: 'The booking reference/confirmation number',
            },
            customer_phone: {
              type: 'string',
              description: 'Customer phone number to look up booking',
            },
            reason: {
              type: 'string',
              description: 'Reason for cancellation (optional)',
            },
          },
          required: [],
        },
      },
      server: {
        url: `${serverUrl}/api/vapi/tools`,
      },
    },
    {
      type: 'function',
      function: {
        name: 'lookup_booking',
        description: 'Look up an existing booking by phone number or reference. Use when customer asks about their appointment.',
        parameters: {
          type: 'object',
          properties: {
            customer_phone: {
              type: 'string',
              description: 'Customer phone number',
            },
            booking_reference: {
              type: 'string',
              description: 'Booking reference/confirmation number',
            },
          },
          required: [],
        },
      },
      server: {
        url: `${serverUrl}/api/vapi/tools`,
      },
    },
  ];
}

// ============================================
// TOOL CALL HANDLERS
// ============================================

/**
 * Handle a tool call from VAPI
 * Routes to the appropriate handler based on tool name
 */
async function handleToolCall(userId, toolName, toolArgs, callContext = {}) {
  console.log(`[VAPI Tools] Handling tool call: ${toolName}`, toolArgs);

  try {
    switch (toolName) {
      case 'check_availability':
        return await handleCheckAvailability(userId, toolArgs, callContext);

      case 'create_booking':
        return await handleCreateBooking(userId, toolArgs, callContext);

      case 'cancel_booking':
        return await handleCancelBooking(userId, toolArgs, callContext);

      case 'lookup_booking':
        return await handleLookupBooking(userId, toolArgs, callContext);

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error) {
    console.error(`[VAPI Tools] Error handling ${toolName}:`, error);
    return {
      success: false,
      error: error.message || 'An error occurred while processing your request',
    };
  }
}

/**
 * Handle check_availability tool call
 */
async function handleCheckAvailability(userId, args, context) {
  const { date, service_type } = args;

  // Get user's connected provider
  const connection = await getActiveProviderConnection(userId);

  if (!connection) {
    // No external provider - return mock availability or use internal calendar
    return generateDefaultAvailability(date);
  }

  try {
    // Get event types from provider
    const eventTypes = await providerService.getEventTypes(userId, connection.id);

    // Find matching event type or use first one
    let eventTypeId = eventTypes[0]?.id;
    if (service_type && eventTypes.length > 1) {
      const match = eventTypes.find(et =>
        et.name.toLowerCase().includes(service_type.toLowerCase())
      );
      if (match) eventTypeId = match.id;
    }

    if (!eventTypeId) {
      return generateDefaultAvailability(date);
    }

    // Get availability from provider
    const endDate = date; // Same day
    const slots = await providerService.getAvailability(
      userId,
      connection.id,
      eventTypeId,
      date,
      endDate
    );

    // Format for voice response
    const availableSlots = slots.filter(s => s.available);

    if (availableSlots.length === 0) {
      return {
        success: true,
        available: false,
        message: `I'm sorry, there are no available slots on ${formatDateForSpeech(date)}. Would you like to check another day?`,
        data: { date, slots: [] },
      };
    }

    // Group slots into readable times
    const times = availableSlots.slice(0, 6).map(s => formatTimeForSpeech(s.startTime));

    return {
      success: true,
      available: true,
      message: `On ${formatDateForSpeech(date)}, I have availability at ${formatTimesForSpeech(times)}. Which time works best for you?`,
      data: {
        date,
        slots: availableSlots.slice(0, 6).map(s => ({
          time: new Date(s.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          startTime: s.startTime,
        })),
      },
    };
  } catch (error) {
    console.error('[VAPI Tools] Provider availability error:', error);
    // Fallback to default availability
    return generateDefaultAvailability(date);
  }
}

/**
 * Handle create_booking tool call
 */
async function handleCreateBooking(userId, args, context) {
  const { date, time, customer_name, customer_phone, customer_email, party_size, notes } = args;

  // Build booking datetime in ISO format
  // The time from the voice agent is in local time (Europe/Dublin)
  // For Cal.com, we need to send as UTC with Z suffix
  // Since Ireland is GMT (UTC+0 in winter, UTC+1 in summer), we approximate with UTC
  // TODO: Handle timezone conversion properly for non-UTC timezones
  const bookingDateTime = `${date}T${time}:00.000Z`;

  // Get or create customer
  let customerId = null;
  const phone = customer_phone || context.customerPhone;

  if (phone) {
    const existingCustomer = await customerService.findCustomerByPhone(userId, phone);
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const newCustomer = await customerService.createCustomer(userId, {
        fullName: customer_name,
        phone: phone,
        email: customer_email,
      });
      customerId = newCustomer.id;
    }
  }

  // Get user's connected provider
  const connection = await getActiveProviderConnection(userId);

  // Prepare booking data
  const bookingData = {
    party_size,
    notes,
    source: 'phone_ai',
  };

  let externalBooking = null;
  let externalBookingId = null;

  // Try to create booking in external provider
  if (connection) {
    try {
      const eventTypes = await providerService.getEventTypes(userId, connection.id);
      const eventTypeId = eventTypes[0]?.id;

      if (eventTypeId) {
        externalBooking = await providerService.createExternalBooking(userId, connection.id, {
          eventTypeId,
          startTime: bookingDateTime,
          customerName: customer_name,
          customerEmail: customer_email || `${phone}@phone.voicefleet.ai`,
          customerPhone: phone,
          metadata: bookingData,
        });
        externalBookingId = externalBooking.externalId;
      }
    } catch (error) {
      console.error('[VAPI Tools] External booking failed:', error);
      // Continue with internal booking
    }
  }

  // Create internal booking record
  const booking = await bookingService.createBooking(userId, {
    customerId,
    status: externalBooking ? 'confirmed' : 'pending',
    bookingDate: date,
    bookingTime: time,
    customerName: customer_name,
    customerPhone: phone,
    customerEmail: customer_email,
    bookingData,
    calendarEventId: externalBookingId,
    source: 'phone',
    callId: context.callId,
  });

  // Generate confirmation message
  const confirmationNumber = booking.id.slice(-6).toUpperCase();
  const formattedDate = formatDateForSpeech(date);
  const formattedTime = formatTimeForSpeech(`${date}T${time}`);

  return {
    success: true,
    message: `I've booked your appointment for ${formattedDate} at ${formattedTime}. Your confirmation number is ${confirmationNumber}. Is there anything else I can help you with?`,
    data: {
      bookingId: booking.id,
      confirmationNumber,
      date,
      time,
      customerName: customer_name,
      externalId: externalBookingId,
    },
  };
}

/**
 * Handle cancel_booking tool call
 */
async function handleCancelBooking(userId, args, context) {
  const { booking_reference, customer_phone, reason } = args;

  const phone = customer_phone || context.customerPhone;

  // Find the booking
  let booking = null;

  if (booking_reference) {
    // Search by reference (last 6 chars of ID)
    const { data } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .ilike('id', `%${booking_reference}%`)
      .eq('status', 'confirmed')
      .single();
    booking = data;
  }

  if (!booking && phone) {
    // Search by phone number - get most recent upcoming booking
    const { data } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .eq('customer_phone', phone)
      .in('status', ['confirmed', 'pending'])
      .gte('booking_date', new Date().toISOString().split('T')[0])
      .order('booking_date', { ascending: true })
      .limit(1)
      .single();
    booking = data;
  }

  if (!booking) {
    return {
      success: false,
      message: "I couldn't find a booking with that information. Could you please provide your confirmation number or the phone number used for the booking?",
    };
  }

  // Cancel in external provider if connected
  const connection = await getActiveProviderConnection(userId);
  if (connection && booking.calendar_event_id) {
    try {
      await providerService.cancelExternalBooking(
        userId,
        connection.id,
        booking.calendar_event_id,
        reason || 'Cancelled by customer'
      );
    } catch (error) {
      console.error('[VAPI Tools] External cancellation failed:', error);
    }
  }

  // Cancel internal booking
  await bookingService.updateBooking(userId, booking.id, { status: 'cancelled' });

  const formattedDate = formatDateForSpeech(booking.booking_date);
  const formattedTime = formatTimeForSpeech(`${booking.booking_date}T${booking.booking_time}`);

  return {
    success: true,
    message: `I've cancelled your appointment for ${formattedDate} at ${formattedTime}. Is there anything else I can help you with?`,
    data: {
      bookingId: booking.id,
      cancelledDate: booking.booking_date,
      cancelledTime: booking.booking_time,
    },
  };
}

/**
 * Handle lookup_booking tool call
 */
async function handleLookupBooking(userId, args, context) {
  const { booking_reference, customer_phone } = args;

  const phone = customer_phone || context.customerPhone;

  let booking = null;

  if (booking_reference) {
    const { data } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .ilike('id', `%${booking_reference}%`)
      .single();
    booking = data;
  }

  if (!booking && phone) {
    // Get upcoming bookings for this phone
    const { data } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .eq('customer_phone', phone)
      .in('status', ['confirmed', 'pending'])
      .gte('booking_date', new Date().toISOString().split('T')[0])
      .order('booking_date', { ascending: true })
      .limit(1)
      .single();
    booking = data;
  }

  if (!booking) {
    return {
      success: false,
      message: "I couldn't find any upcoming bookings. Would you like to make a new appointment?",
    };
  }

  const formattedDate = formatDateForSpeech(booking.booking_date);
  const formattedTime = formatTimeForSpeech(`${booking.booking_date}T${booking.booking_time}`);
  const confirmationNumber = booking.id.slice(-6).toUpperCase();

  return {
    success: true,
    message: `I found your appointment for ${formattedDate} at ${formattedTime}. Your confirmation number is ${confirmationNumber}. Would you like to make any changes?`,
    data: {
      bookingId: booking.id,
      confirmationNumber,
      date: booking.booking_date,
      time: booking.booking_time,
      status: booking.status,
      customerName: booking.customer_name,
    },
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get user's primary (or first active) provider connection
 * Uses the primary provider if set, otherwise falls back to first connected
 */
async function getActiveProviderConnection(userId) {
  return await providerService.getPrimaryConnection(userId);
}

/**
 * Generate default availability when no provider is connected
 */
function generateDefaultAvailability(date) {
  // Generate slots from 9 AM to 5 PM
  const slots = [];
  const baseDate = new Date(date);

  for (let hour = 9; hour < 17; hour++) {
    for (let minute of [0, 30]) {
      const slotTime = new Date(baseDate);
      slotTime.setHours(hour, minute, 0, 0);
      slots.push({
        time: slotTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        startTime: slotTime.toISOString(),
        available: true,
      });
    }
  }

  const times = slots.slice(0, 6).map(s => s.time);

  return {
    success: true,
    available: true,
    message: `On ${formatDateForSpeech(date)}, I have availability at ${formatTimesForSpeech(times)}. Which time works best for you?`,
    data: { date, slots: slots.slice(0, 6) },
  };
}

/**
 * Format date for speech
 */
function formatDateForSpeech(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'tomorrow';
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
}

/**
 * Format time for speech
 */
function formatTimeForSpeech(dateTimeStr) {
  const date = new Date(dateTimeStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Format list of times for speech
 */
function formatTimesForSpeech(times) {
  if (times.length === 0) return 'no times available';
  if (times.length === 1) return times[0];
  if (times.length === 2) return `${times[0]} and ${times[1]}`;

  const lastTime = times.pop();
  return `${times.join(', ')}, and ${lastTime}`;
}

module.exports = {
  getBookingToolDefinitions,
  handleToolCall,
};
