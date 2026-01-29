const express = require('express');
const { authenticate } = require('../middleware/auth');
const bookingService = require('../services/booking');
const customerService = require('../services/customer');

const router = express.Router();

// =====================================================
// Industry Templates
// =====================================================

/**
 * GET /api/integrations/templates
 * List all industry templates
 */
router.get('/templates', authenticate, async (req, res, next) => {
  try {
    const templates = await bookingService.getIndustryTemplates();

    res.json({
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        icon: t.icon,
        defaultFields: t.default_fields,
        defaultVerification: t.default_verification,
        defaultPayment: t.default_payment
      }))
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// Booking Configuration
// =====================================================

/**
 * GET /api/integrations/config
 * Get user's booking configuration
 */
router.get('/config', authenticate, async (req, res, next) => {
  try {
    const config = await bookingService.getBookingConfig(req.userId);

    if (!config) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      config: {
        id: config.id,
        industryTemplateId: config.industry_template_id,
        bookingFields: config.booking_fields,
        verificationEnabled: config.verification_enabled,
        verificationFields: config.verification_fields,
        verificationOnFail: config.verification_on_fail,
        newCustomerAction: config.new_customer_action,
        newCustomerFields: config.new_customer_fields,
        paymentRequired: config.payment_required,
        paymentType: config.payment_type,
        depositAmountCents: config.deposit_amount_cents,
        calendarProvider: config.calendar_provider,
        calendarId: config.calendar_id,
        calendarConnected: !!config.calendar_credentials,
        emailConfirmation: config.email_confirmation,
        confirmationTemplate: config.confirmation_template,
        isActive: config.is_active,
        createdAt: config.created_at,
        updatedAt: config.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/config
 * Create or update booking configuration
 */
router.post('/config', authenticate, async (req, res, next) => {
  try {
    const config = await bookingService.upsertBookingConfig(req.userId, req.body);

    res.json({
      success: true,
      config: {
        id: config.id,
        industryTemplateId: config.industry_template_id,
        bookingFields: config.booking_fields,
        verificationEnabled: config.verification_enabled,
        verificationFields: config.verification_fields,
        verificationOnFail: config.verification_on_fail,
        newCustomerAction: config.new_customer_action,
        newCustomerFields: config.new_customer_fields,
        paymentRequired: config.payment_required,
        paymentType: config.payment_type,
        depositAmountCents: config.deposit_amount_cents,
        calendarProvider: config.calendar_provider,
        calendarId: config.calendar_id,
        calendarConnected: !!config.calendar_credentials,
        emailConfirmation: config.email_confirmation,
        confirmationTemplate: config.confirmation_template,
        isActive: config.is_active
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/integrations/config
 * Delete booking configuration
 */
router.delete('/config', authenticate, async (req, res, next) => {
  try {
    await bookingService.deleteBookingConfig(req.userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// Customers
// =====================================================

/**
 * GET /api/integrations/customers
 * List customers with optional search
 */
router.get('/customers', authenticate, async (req, res, next) => {
  try {
    const { search, limit, offset } = req.query;
    const result = await customerService.listCustomers(req.userId, {
      search,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      customers: result.customers.map(c => ({
        id: c.id,
        fullName: c.full_name,
        dateOfBirth: c.date_of_birth,
        phone: c.phone,
        email: c.email,
        addressLine1: c.address_line1,
        addressLine2: c.address_line2,
        city: c.city,
        postcode: c.postcode,
        country: c.country,
        customFields: c.custom_fields,
        notes: c.notes,
        tags: c.tags,
        createdAt: c.created_at,
        lastBookingAt: c.last_booking_at
      })),
      total: result.total
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/customers
 * Create a new customer
 */
router.post('/customers', authenticate, async (req, res, next) => {
  try {
    const customer = await customerService.createCustomer(req.userId, req.body);

    res.status(201).json({
      success: true,
      customer: {
        id: customer.id,
        fullName: customer.full_name,
        dateOfBirth: customer.date_of_birth,
        phone: customer.phone,
        email: customer.email,
        addressLine1: customer.address_line1,
        city: customer.city,
        postcode: customer.postcode,
        country: customer.country,
        customFields: customer.custom_fields,
        createdAt: customer.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations/customers/:id
 * Get a specific customer
 */
router.get('/customers/:id', authenticate, async (req, res, next) => {
  try {
    const customer = await customerService.getCustomer(req.userId, req.params.id);

    if (!customer) {
      return res.status(404).json({ error: { message: 'Customer not found' } });
    }

    // Get booking history
    const bookings = await customerService.getCustomerBookings(req.userId, customer.id);

    res.json({
      customer: {
        id: customer.id,
        fullName: customer.full_name,
        dateOfBirth: customer.date_of_birth,
        phone: customer.phone,
        email: customer.email,
        addressLine1: customer.address_line1,
        addressLine2: customer.address_line2,
        city: customer.city,
        postcode: customer.postcode,
        country: customer.country,
        customFields: customer.custom_fields,
        notes: customer.notes,
        tags: customer.tags,
        createdAt: customer.created_at,
        lastBookingAt: customer.last_booking_at
      },
      bookings: bookings.map(b => ({
        id: b.id,
        status: b.status,
        bookingDate: b.booking_date,
        bookingTime: b.booking_time,
        bookingData: b.booking_data,
        createdAt: b.created_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/integrations/customers/:id
 * Update a customer
 */
router.patch('/customers/:id', authenticate, async (req, res, next) => {
  try {
    const customer = await customerService.updateCustomer(req.userId, req.params.id, req.body);

    res.json({
      success: true,
      customer: {
        id: customer.id,
        fullName: customer.full_name,
        dateOfBirth: customer.date_of_birth,
        phone: customer.phone,
        email: customer.email,
        addressLine1: customer.address_line1,
        city: customer.city,
        postcode: customer.postcode,
        country: customer.country,
        customFields: customer.custom_fields
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/integrations/customers/:id
 * Delete a customer
 */
router.delete('/customers/:id', authenticate, async (req, res, next) => {
  try {
    await customerService.deleteCustomer(req.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/customers/verify
 * Verify customer identity
 */
router.post('/customers/verify', authenticate, async (req, res, next) => {
  try {
    const { verificationData, requiredFields } = req.body;

    if (!requiredFields || requiredFields.length === 0) {
      return res.status(400).json({
        error: { message: 'Required fields must be specified' }
      });
    }

    const result = await customerService.verifyCustomer(
      req.userId,
      verificationData,
      requiredFields
    );

    if (result.success) {
      res.json({
        verified: true,
        customer: {
          id: result.customer.id,
          fullName: result.customer.full_name,
          phone: result.customer.phone,
          email: result.customer.email
        }
      });
    } else {
      res.json({
        verified: false,
        error: result.error,
        mismatches: result.mismatches
      });
    }
  } catch (error) {
    next(error);
  }
});

// =====================================================
// Bookings
// =====================================================

/**
 * GET /api/integrations/bookings
 * List bookings with filters
 */
router.get('/bookings', authenticate, async (req, res, next) => {
  try {
    const { status, startDate, endDate, limit, offset } = req.query;
    const result = await bookingService.listBookings(req.userId, {
      status,
      startDate,
      endDate,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });

    res.json({
      bookings: result.bookings.map(b => ({
        id: b.id,
        customerId: b.customer_id,
        status: b.status,
        bookingData: b.booking_data,
        bookingDate: b.booking_date,
        bookingTime: b.booking_time,
        durationMinutes: b.duration_minutes,
        customerName: b.customer_name,
        customerPhone: b.customer_phone,
        customerEmail: b.customer_email,
        paymentRequired: b.payment_required,
        paymentStatus: b.payment_status,
        paymentAmountCents: b.payment_amount_cents,
        source: b.source,
        confirmedAt: b.confirmed_at,
        cancelledAt: b.cancelled_at,
        createdAt: b.created_at,
        customer: b.customers ? {
          fullName: b.customers.full_name,
          phone: b.customers.phone,
          email: b.customers.email
        } : null
      })),
      total: result.total
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/bookings
 * Create a new booking
 */
router.post('/bookings', authenticate, async (req, res, next) => {
  try {
    const booking = await bookingService.createBooking(req.userId, req.body);

    // Update customer's last booking timestamp if linked
    if (booking.customer_id) {
      await customerService.updateLastBooking(req.userId, booking.customer_id);
    }

    res.status(201).json({
      success: true,
      booking: {
        id: booking.id,
        status: booking.status,
        bookingDate: booking.booking_date,
        bookingTime: booking.booking_time,
        customerName: booking.customer_name,
        createdAt: booking.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations/bookings/:id
 * Get a specific booking
 */
router.get('/bookings/:id', authenticate, async (req, res, next) => {
  try {
    const booking = await bookingService.getBooking(req.userId, req.params.id);

    if (!booking) {
      return res.status(404).json({ error: { message: 'Booking not found' } });
    }

    res.json({
      booking: {
        id: booking.id,
        customerId: booking.customer_id,
        status: booking.status,
        bookingData: booking.booking_data,
        bookingDate: booking.booking_date,
        bookingTime: booking.booking_time,
        durationMinutes: booking.duration_minutes,
        customerName: booking.customer_name,
        customerPhone: booking.customer_phone,
        customerEmail: booking.customer_email,
        paymentRequired: booking.payment_required,
        paymentStatus: booking.payment_status,
        paymentAmountCents: booking.payment_amount_cents,
        stripeSessionId: booking.stripe_session_id,
        calendarEventId: booking.calendar_event_id,
        source: booking.source,
        confirmedAt: booking.confirmed_at,
        cancelledAt: booking.cancelled_at,
        createdAt: booking.created_at,
        customer: booking.customers
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/integrations/bookings/:id
 * Update a booking
 */
router.patch('/bookings/:id', authenticate, async (req, res, next) => {
  try {
    const booking = await bookingService.updateBooking(req.userId, req.params.id, req.body);

    res.json({
      success: true,
      booking: {
        id: booking.id,
        status: booking.status,
        bookingDate: booking.booking_date,
        bookingTime: booking.booking_time,
        confirmedAt: booking.confirmed_at,
        cancelledAt: booking.cancelled_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/integrations/bookings/:id
 * Cancel a booking
 */
router.delete('/bookings/:id', authenticate, async (req, res, next) => {
  try {
    await bookingService.deleteBooking(req.userId, req.params.id);
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/bookings/:id/confirm
 * Confirm a booking (after payment if required)
 */
router.post('/bookings/:id/confirm', authenticate, async (req, res, next) => {
  try {
    const booking = await bookingService.confirmBooking(req.userId, req.params.id, req.body);

    res.json({
      success: true,
      booking: {
        id: booking.id,
        status: booking.status,
        confirmedAt: booking.confirmed_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// Calendar Integration
// =====================================================

const providerService = require('../services/providers');

/**
 * GET /api/integrations/calendar/status
 * Check calendar connection status
 */
router.get('/calendar/status', authenticate, async (req, res, next) => {
  try {
    // Check for Google Calendar connection
    const connections = await providerService.getConnections(req.userId);
    const googleCalConnection = connections.find(c => c.provider_id === 'google_calendar');

    if (googleCalConnection && googleCalConnection.status === 'connected') {
      return res.json({
        connected: true,
        provider: 'google_calendar',
        providerName: 'Google Calendar',
        calendarId: googleCalConnection.config?.calendarId || 'primary',
        accountName: googleCalConnection.external_account_name,
        accountId: googleCalConnection.external_account_id,
        connectionId: googleCalConnection.id,
        connectedAt: googleCalConnection.connected_at
      });
    }

    // Fallback to booking config for legacy support
    const config = await bookingService.getBookingConfig(req.userId);

    res.json({
      connected: !!(config?.calendar_credentials),
      provider: config?.calendar_provider || null,
      calendarId: config?.calendar_id || null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations/calendar/connect-url
 * Get OAuth URL to connect Google Calendar
 */
router.get('/calendar/connect-url', authenticate, async (req, res, next) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    const redirectUri = `${apiUrl}/api/providers/google_calendar/oauth/callback`;

    // Generate state token for CSRF protection
    const state = Buffer.from(JSON.stringify({
      userId: req.userId,
      providerId: 'google_calendar',
      timestamp: Date.now(),
    })).toString('base64url');

    const url = await providerService.getOAuthUrl(
      'google_calendar',
      redirectUri,
      state
    );

    res.json({ url, state });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/integrations/calendar/disconnect
 * Disconnect Google Calendar
 */
router.delete('/calendar/disconnect', authenticate, async (req, res, next) => {
  try {
    const connections = await providerService.getConnections(req.userId);
    const googleCalConnection = connections.find(c => c.provider_id === 'google_calendar');

    if (!googleCalConnection) {
      return res.status(404).json({ error: { message: 'No Google Calendar connection found' } });
    }

    await providerService.deleteConnection(req.userId, googleCalConnection.id);

    res.json({ success: true, message: 'Google Calendar disconnected' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations/calendar/calendars
 * List available calendars from connected Google Calendar
 */
router.get('/calendar/calendars', authenticate, async (req, res, next) => {
  try {
    const connections = await providerService.getConnections(req.userId);
    const googleCalConnection = connections.find(c => c.provider_id === 'google_calendar' && c.status === 'connected');

    if (!googleCalConnection) {
      return res.status(400).json({ error: { message: 'Google Calendar not connected' } });
    }

    const calendars = await providerService.getEventTypes(req.userId, googleCalConnection.id);

    res.json({
      calendars: calendars.map(cal => ({
        id: cal.id,
        name: cal.name,
        primary: cal.metadata?.primary || false,
        backgroundColor: cal.metadata?.backgroundColor,
        timezone: cal.metadata?.timezone
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/integrations/calendar/select
 * Select which calendar to use for bookings
 */
router.post('/calendar/select', authenticate, async (req, res, next) => {
  try {
    const { calendarId } = req.body;

    if (!calendarId) {
      return res.status(400).json({ error: { message: 'Calendar ID is required' } });
    }

    const connections = await providerService.getConnections(req.userId);
    const googleCalConnection = connections.find(c => c.provider_id === 'google_calendar' && c.status === 'connected');

    if (!googleCalConnection) {
      return res.status(400).json({ error: { message: 'Google Calendar not connected' } });
    }

    // Update connection config with selected calendar
    await providerService.updateConnection(req.userId, googleCalConnection.id, {
      config: {
        ...googleCalConnection.config,
        calendarId
      }
    });

    res.json({ success: true, calendarId });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations/calendar/availability
 * Get availability from connected calendar
 */
router.get('/calendar/availability', authenticate, async (req, res, next) => {
  try {
    const { date, startDate, endDate } = req.query;

    const start = startDate || date;
    const end = endDate || date;

    if (!start) {
      return res.status(400).json({ error: { message: 'Date is required' } });
    }

    const connections = await providerService.getConnections(req.userId);
    const googleCalConnection = connections.find(c => c.provider_id === 'google_calendar' && c.status === 'connected');

    if (!googleCalConnection) {
      return res.status(400).json({ error: { message: 'Google Calendar not connected' } });
    }

    const calendarId = googleCalConnection.config?.calendarId || 'primary';
    const slots = await providerService.getAvailability(
      req.userId,
      googleCalConnection.id,
      calendarId,
      start,
      end
    );

    // Filter to only available slots
    const availableSlots = slots.filter(s => s.available);

    res.json({
      date: start,
      endDate: end,
      slots: availableSlots.map(s => ({
        startTime: s.startTime,
        endTime: s.endTime,
        time: new Date(s.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      })),
      total: availableSlots.length
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
