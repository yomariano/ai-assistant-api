/**
 * Notification Service
 *
 * Handles sending email and SMS notifications for call events.
 * Uses Resend for emails and Twilio for SMS.
 */

const { createClient } = require('@supabase/supabase-js');
const { isWithinBusinessHours } = require('./business-hours');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// EMAIL PROVIDER (Resend)
// ============================================

let resendClient = null;

function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Send an email notification
 */
async function sendEmail({ to, subject, html, text }) {
  const resend = getResendClient();

  if (!resend) {
    console.warn('Resend not configured - skipping email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'notifications@voiceai.local',
      to,
      subject,
      html,
      text,
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// SMS PROVIDER (Twilio)
// ============================================

let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

/**
 * Send an SMS notification
 */
async function sendSMS({ to, body }) {
  const twilio = getTwilioClient();

  if (!twilio) {
    console.warn('Twilio not configured - skipping SMS');
    return { success: false, error: 'SMS not configured' };
  }

  try {
    const message = await twilio.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });

    return { success: true, messageId: message.sid };
  } catch (error) {
    console.error('Failed to send SMS:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// NOTIFICATION PREFERENCES
// ============================================

/**
 * Get notification preferences for a user
 */
async function getNotificationPreferences(userId) {
  let data = null;
  let error = null;

  try {
    const result = await supabase
      .rpc('get_or_create_notification_preferences', { p_user_id: userId });
    data = result.data;
    error = result.error;
  } catch (queryError) {
    console.error('💥 Query exception (getNotificationPreferences):', queryError);
    error = queryError;
    data = null;
  }

  if (error) {
    console.error('Error getting notification preferences:', error);
    // Return defaults if function doesn't exist yet
    return {
      user_id: userId,
      email_enabled: true,
      sms_enabled: false,
      notify_on_call_complete: true,
      notify_on_message_taken: true,
      notify_on_escalation: true,
      notify_on_voicemail: true,
      business_hours_only: false,
      timezone: 'Europe/Dublin',
    };
  }

  return data;
}

/**
 * Update notification preferences for a user
 */
async function updateNotificationPreferences(userId, preferences) {
  let data = null;
  let error = null;

  try {
    const result = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        ...preferences,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    data = result.data;
    error = result.error;
  } catch (queryError) {
    console.error('💥 Query exception (updateNotificationPreferences):', queryError);
    error = queryError;
    data = null;
  }

  if (error) {
    console.error('Error updating notification preferences:', error);
    throw error;
  }

  return data;
}

// ============================================
// ESCALATION SETTINGS
// ============================================

/**
 * Get escalation settings for a user
 */
async function getEscalationSettings(userId) {
  let data = null;
  let error = null;

  try {
    const result = await supabase
      .rpc('get_or_create_escalation_settings', { p_user_id: userId });
    data = result.data;
    error = result.error;
  } catch (queryError) {
    console.error('💥 Query exception (getEscalationSettings):', queryError);
    error = queryError;
    data = null;
  }

  if (error) {
    console.error('Error getting escalation settings:', error);
    // Return MVP defaults if function doesn't exist yet
    return {
      user_id: userId,
      transfer_enabled: false,
      transfer_number: null,
      // MVP defaults: simple blind transfer, no business hours restrictions
      transfer_method: 'blind_transfer',
      trigger_keywords: ['speak to someone', 'real person', 'human'],
      max_failed_attempts: 3,
      business_hours_only: false,
      after_hours_action: 'voicemail',
    };
  }

  return data;
}

/**
 * Update escalation settings for a user
 */
async function updateEscalationSettings(userId, settings) {
  let data = null;
  let error = null;

  try {
    const result = await supabase
      .from('escalation_settings')
      .upsert({
        user_id: userId,
        ...settings,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    data = result.data;
    error = result.error;
  } catch (queryError) {
    console.error('💥 Query exception (updateEscalationSettings):', queryError);
    error = queryError;
    data = null;
  }

  if (error) {
    console.error('Error updating escalation settings:', error);
    throw error;
  }

  return data;
}

// ============================================
// NOTIFICATION LOGGING
// ============================================

/**
 * Log a notification attempt
 */
async function logNotification({
  userId,
  callId,
  notificationType,
  eventType,
  recipient,
  subject,
  content,
  status,
  errorMessage,
}) {
  let data = null;
  let error = null;

  try {
    const result = await supabase
      .from('call_notifications')
      .insert({
        user_id: userId,
        call_id: callId,
        notification_type: notificationType,
        event_type: eventType,
        recipient,
        subject,
        content,
        status,
        error_message: errorMessage,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      })
      .select()
      .single();
    data = result.data;
    error = result.error;
  } catch (queryError) {
    console.error('💥 Query exception (logNotification):', queryError);
    error = queryError;
    data = null;
  }

  if (error) {
    console.error('Error logging notification:', error);
  }

  return data;
}

/**
 * Update notification status
 */
async function updateNotificationStatus(notificationId, status, errorMessage = null) {
  const updates = {
    status,
    error_message: errorMessage,
  };

  if (status === 'delivered') {
    updates.delivered_at = new Date().toISOString();
  }

  let data = null;
  let error = null;

  try {
    const result = await supabase
      .from('call_notifications')
      .update(updates)
      .eq('id', notificationId)
      .select()
      .single();
    data = result.data;
    error = result.error;
  } catch (queryError) {
    console.error('💥 Query exception (updateNotificationStatus):', queryError);
    error = queryError;
    data = null;
  }

  if (error) {
    console.error('Error updating notification status:', error);
  }

  return data;
}

// ============================================
// HIGH-LEVEL NOTIFICATION FUNCTIONS
// ============================================

/**
 * Send notification for a call event
 */
async function notifyCallEvent({
  userId,
  callId,
  eventType,
  callData,
}) {
  // Get user's notification preferences
  const prefs = await getNotificationPreferences(userId);

  // Best-effort: get escalation schedule for business-hours gating where needed
  let escalationSettings = null;
  try {
    escalationSettings = await getEscalationSettings(userId);
  } catch (err) {
    // ignore
  }

  // Check if this event type should trigger a notification
  const shouldNotify = {
    call_complete: prefs.notify_on_call_complete,
    message_taken: prefs.notify_on_message_taken,
    escalation: prefs.notify_on_escalation,
    voicemail: prefs.notify_on_voicemail,
    missed_call: prefs.notify_on_call_complete,
  };

  if (!shouldNotify[eventType]) {
    return { skipped: true, reason: 'Notification disabled for this event type' };
  }

  // Get user email for notifications
  let user = null;
  try {
    const result = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', userId)
      .single();
    if (result.error) {
      console.error('Error getting user for notifications:', result.error);
    } else {
      user = result.data;
    }
  } catch (queryError) {
    console.error('💥 Query exception (notifyCallEvent get user):', queryError);
  }

  const results = { email: null, sms: null };

  // Send email notification
  if (prefs.email_enabled) {
    const emailContent = formatEmailContent(eventType, callData, user);
    const emailResult = await sendEmail({
      to: prefs.email_address || user?.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    await logNotification({
      userId,
      callId,
      notificationType: 'email',
      eventType,
      recipient: prefs.email_address || user?.email,
      subject: emailContent.subject,
      content: emailContent.text,
      status: emailResult.success ? 'sent' : 'failed',
      errorMessage: emailResult.error,
    });

    results.email = emailResult;
  }

  // Send SMS notification
  if (prefs.sms_enabled && prefs.sms_number) {
    // Enforce business-hours-only (best-effort)
    if (prefs.business_hours_only) {
      const schedule = {
        timezone: prefs.timezone || escalationSettings?.timezone || 'UTC',
        businessDays: escalationSettings?.business_days || [1, 2, 3, 4, 5],
        startTime: escalationSettings?.business_hours_start || '09:00',
        endTime: escalationSettings?.business_hours_end || '18:00',
      };

      const within = isWithinBusinessHours(schedule);

      // Special case: if the event is an escalation and user chose after-hours SMS alerts,
      // allow SMS outside hours (this is the "after_hours_action=sms_alert" behavior).
      const allowAfterHoursEscalationSms =
        eventType === 'escalation' &&
        escalationSettings?.business_hours_only === true &&
        escalationSettings?.after_hours_action === 'sms_alert';

      if (!within.isWithin && !allowAfterHoursEscalationSms) {
        results.sms = { success: false, skipped: true, reason: `SMS blocked by business_hours_only (${within.reason || 'outside'})` };
        return results;
      }
    }

    const smsContent = formatSMSContent(eventType, callData);
    const smsResult = await sendSMS({
      to: prefs.sms_number,
      body: smsContent,
    });

    await logNotification({
      userId,
      callId,
      notificationType: 'sms',
      eventType,
      recipient: prefs.sms_number,
      content: smsContent,
      status: smsResult.success ? 'sent' : 'failed',
      errorMessage: smsResult.error,
    });

    results.sms = smsResult;
  }

  return results;
}

// ============================================
// CONTENT FORMATTING
// ============================================

/**
 * Format email content for different event types
 */
function formatEmailContent(eventType, callData, user) {
  const businessName = callData.businessName || 'Your Business';
  const callerNumber = callData.customerNumber || 'Unknown';
  const duration = callData.duration ? `${Math.round(callData.duration / 60)} min` : 'N/A';
  const summary = callData.summary || 'No summary available';
  const transcript = callData.transcript || '';

  const templates = {
    call_complete: {
      subject: `📞 Call completed - ${callerNumber}`,
      html: `
        <h2>Call Summary</h2>
        <p><strong>Caller:</strong> ${callerNumber}</p>
        <p><strong>Duration:</strong> ${duration}</p>
        <p><strong>Summary:</strong> ${summary}</p>
        ${callData.recordingUrl ? `<p><a href="${callData.recordingUrl}">Listen to recording</a></p>` : ''}
        ${transcript ? `<h3>Transcript</h3><pre>${transcript}</pre>` : ''}
      `,
      text: `Call from ${callerNumber}\nDuration: ${duration}\nSummary: ${summary}`,
    },
    message_taken: {
      subject: `📝 New message from ${callerNumber}`,
      html: `
        <h2>Message Received</h2>
        <p><strong>From:</strong> ${callerNumber}</p>
        <p><strong>Message:</strong> ${summary}</p>
        ${callData.recordingUrl ? `<p><a href="${callData.recordingUrl}">Listen to recording</a></p>` : ''}
      `,
      text: `Message from ${callerNumber}: ${summary}`,
    },
    escalation: {
      subject: `🚨 Call escalated - ${callerNumber}`,
      html: `
        <h2>Call Escalated</h2>
        <p>A call required human intervention.</p>
        <p><strong>Caller:</strong> ${callerNumber}</p>
        <p><strong>Reason:</strong> ${callData.escalationReason || 'Customer requested human'}</p>
        <p><strong>Summary:</strong> ${summary}</p>
      `,
      text: `Call escalated from ${callerNumber}. Reason: ${callData.escalationReason || 'Customer requested human'}. ${summary}`,
    },
    voicemail: {
      subject: `🎤 New voicemail from ${callerNumber}`,
      html: `
        <h2>Voicemail Received</h2>
        <p><strong>From:</strong> ${callerNumber}</p>
        <p><strong>Transcription:</strong> ${summary}</p>
        ${callData.recordingUrl ? `<p><a href="${callData.recordingUrl}">Listen to voicemail</a></p>` : ''}
      `,
      text: `Voicemail from ${callerNumber}: ${summary}`,
    },
    missed_call: {
      subject: `📵 Missed call from ${callerNumber}`,
      html: `
        <h2>Missed Call</h2>
        <p><strong>From:</strong> ${callerNumber}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      `,
      text: `Missed call from ${callerNumber} at ${new Date().toLocaleString()}`,
    },
  };

  return templates[eventType] || templates.call_complete;
}

/**
 * Format SMS content for different event types
 */
function formatSMSContent(eventType, callData) {
  const callerNumber = callData.customerNumber || 'Unknown';
  const summary = callData.summary || '';

  // Keep SMS short (160 chars ideal)
  const templates = {
    call_complete: `Call from ${callerNumber}: ${summary.slice(0, 100)}`,
    message_taken: `New msg from ${callerNumber}: ${summary.slice(0, 100)}`,
    escalation: `🚨 Escalated call from ${callerNumber}. Check email for details.`,
    voicemail: `Voicemail from ${callerNumber}: ${summary.slice(0, 100)}`,
    missed_call: `Missed call from ${callerNumber}`,
  };

  return templates[eventType] || templates.call_complete;
}

// ============================================
// TEST NOTIFICATIONS
// ============================================

/**
 * Send a test notification to verify configuration
 */
async function sendTestNotification(userId, type = 'email') {
  const prefs = await getNotificationPreferences(userId);
  let user = null;
  try {
    const result = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();
    if (result.error) {
      console.error('Error getting user for test notification:', result.error);
    } else {
      user = result.data;
    }
  } catch (queryError) {
    console.error('💥 Query exception (sendTestNotification get user):', queryError);
  }

  const testData = {
    customerNumber: '+353 1 234 5678',
    duration: 120,
    summary: 'This is a test notification to verify your settings are working correctly.',
    businessName: 'Test Business',
  };

  if (type === 'email') {
    const emailContent = formatEmailContent('call_complete', testData, user);
    return sendEmail({
      to: prefs.email_address || user?.email,
      subject: `[TEST] ${emailContent.subject}`,
      html: emailContent.html,
      text: emailContent.text,
    });
  } else if (type === 'sms') {
    if (!prefs.sms_number) {
      return { success: false, error: 'No SMS number configured' };
    }
    return sendSMS({
      to: prefs.sms_number,
      body: '[TEST] ' + formatSMSContent('call_complete', testData),
    });
  }

  return { success: false, error: 'Invalid notification type' };
}

// ============================================
// SUPPORT NOTIFICATIONS
// ============================================

/**
 * Notify support about a new Ireland subscription (VoIPCloud manual provisioning)
 * @param {Object} subscriptionData - Subscription details
 */
async function notifyIrelandSubscription(subscriptionData) {
  const {
    userId,
    userEmail,
    userName,
    planId,
    planName,
    stripeCustomerId,
    stripeSubscriptionId,
    phoneNumbersRequired,
  } = subscriptionData;

  const supportEmail = process.env.SUPPORT_EMAIL || 'support@voicefleet.ai';

  const planDisplayNames = {
    starter: 'Starter (€49/mo)',
    growth: 'Growth (€199/mo)',
    pro: 'Pro (€599/mo)',
  };

  const subject = `🇮🇪 New Ireland Subscription - ${planDisplayNames[planId] || planId} - Action Required`;

  const html = `
    <h2>New Ireland Subscription - Manual Provisioning Required</h2>

    <p>A new customer has subscribed from Ireland. VoIPCloud phone numbers need to be provisioned manually.</p>

    <h3>Customer Details</h3>
    <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>User ID</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;"><code>${userId}</code></td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${userEmail || 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Name</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${userName || 'N/A'}</td>
      </tr>
    </table>

    <h3>Subscription Details</h3>
    <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Plan</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${planDisplayNames[planId] || planId}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone Numbers Required</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong style="color: #e74c3c;">${phoneNumbersRequired}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Stripe Customer</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;"><a href="https://dashboard.stripe.com/customers/${stripeCustomerId}">${stripeCustomerId}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Stripe Subscription</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;"><a href="https://dashboard.stripe.com/subscriptions/${stripeSubscriptionId}">${stripeSubscriptionId}</a></td>
      </tr>
    </table>

    <h3>Required Actions</h3>
    <ol>
      <li>Log into VoIPCloud portal</li>
      <li>Purchase/assign ${phoneNumbersRequired} Dublin DID(s) for this customer</li>
      <li>Add the number(s) to the phone_number_pool table with status 'available' and region 'IE'</li>
      <li>The system will automatically assign from the pool when numbers are available</li>
    </ol>

    <p style="color: #666; font-size: 12px; margin-top: 20px;">
      This notification was sent automatically by VoiceFleet.
    </p>
  `;

  const text = `
New Ireland Subscription - Manual Provisioning Required

Customer Details:
- User ID: ${userId}
- Email: ${userEmail || 'N/A'}
- Name: ${userName || 'N/A'}

Subscription Details:
- Plan: ${planDisplayNames[planId] || planId}
- Phone Numbers Required: ${phoneNumbersRequired}
- Stripe Customer: ${stripeCustomerId}
- Stripe Subscription: ${stripeSubscriptionId}

Required Actions:
1. Log into VoIPCloud portal
2. Purchase/assign ${phoneNumbersRequired} Dublin DID(s) for this customer
3. Add the number(s) to the phone_number_pool table
4. The system will automatically assign from the pool
  `;

  console.log(`[Notifications] Sending Ireland subscription alert to ${supportEmail}`);

  const result = await sendEmail({
    to: supportEmail,
    subject,
    html,
    text,
  });

  if (result.success) {
    console.log(`[Notifications] Ireland subscription alert sent successfully`);
  } else {
    console.error(`[Notifications] Failed to send Ireland subscription alert:`, result.error);
  }

  return result;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Email/SMS sending
  sendEmail,
  sendSMS,

  // Preferences
  getNotificationPreferences,
  updateNotificationPreferences,
  getEscalationSettings,
  updateEscalationSettings,

  // Logging
  logNotification,
  updateNotificationStatus,

  // High-level
  notifyCallEvent,
  sendTestNotification,

  // Support notifications
  notifyIrelandSubscription,

  // Formatting (exported for testing)
  formatEmailContent,
  formatSMSContent,
};
