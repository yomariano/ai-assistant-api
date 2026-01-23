# Plan 05: Customer SMS & Reminder Notifications

## Overview
Implement customer-facing notifications: SMS confirmations and reminders (SMS + Voice).

---

## Feature Matrix

| Feature | Starter | Growth | Pro |
|---------|---------|--------|-----|
| Customer SMS Confirmation | ❌ | ✅ | ✅ |
| Customer SMS Reminder (24h) | ❌ | ✅ | ✅ |
| Customer Voice Reminder | ❌ | ❌ | ✅ |

---

## Customer SMS Confirmation

Sent immediately after booking is created.

### Message Template

```
Hi {customer_name}! Your appointment at {business_name} is confirmed:

📅 {date} at {time}
📍 {service}

Reply CANCEL to cancel or call {business_phone} to reschedule.

- {business_name}
```

### Implementation

```javascript
// services/customerNotifications.js

async function sendBookingConfirmation(userId, booking) {
  // Check if user has feature
  const features = await getUserFeatures(userId);
  if (!features.customer_sms_confirmation_enabled) {
    console.log('SMS confirmation not enabled for user');
    return { sent: false, reason: 'feature_disabled' };
  }

  // Get business info
  const business = await getBusinessInfo(userId);

  // Format message
  const message = formatConfirmationSMS({
    customerName: booking.customerName,
    businessName: business.name,
    date: formatDate(booking.bookingDate),
    time: booking.bookingTime,
    service: booking.service,
    businessPhone: business.phoneNumber,
  });

  // Send via Twilio
  const result = await twilioService.sendSMS(
    booking.customerPhone,
    message,
    { userId, type: 'booking_confirmation', bookingId: booking.id }
  );

  // Log notification
  await logNotification({
    userId,
    bookingId: booking.id,
    type: 'sms_confirmation',
    recipient: booking.customerPhone,
    status: result.success ? 'sent' : 'failed',
    messageId: result.messageId,
  });

  return result;
}
```

---

## Customer SMS Reminder (24h Before)

### Scheduler Job

```javascript
// jobs/reminderScheduler.js

const cron = require('node-cron');

// Run every hour
cron.schedule('0 * * * *', async () => {
  console.log('[Reminder Scheduler] Checking for reminders to send...');

  // Find bookings happening in 23-25 hours
  const now = new Date();
  const reminderWindowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const reminderWindowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const bookings = await supabase
    .from('bookings')
    .select('*, users!inner(*)')
    .eq('status', 'confirmed')
    .is('reminder_sent_at', null)
    .gte('booking_datetime', reminderWindowStart.toISOString())
    .lte('booking_datetime', reminderWindowEnd.toISOString());

  for (const booking of bookings.data || []) {
    await processReminder(booking);
  }
});

async function processReminder(booking) {
  const features = await getUserFeatures(booking.user_id);

  // Send SMS reminder if enabled
  if (features.customer_sms_reminders_enabled) {
    await sendSMSReminder(booking);
  }

  // Schedule voice reminder if enabled (Pro only)
  if (features.customer_voice_reminders_enabled) {
    await scheduleVoiceReminder(booking);
  }

  // Mark reminder as sent
  await supabase
    .from('bookings')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', booking.id);
}
```

### SMS Reminder Template

```
Hi {customer_name}! Reminder: You have an appointment tomorrow at {business_name}.

📅 {date} at {time}
📍 {service}

Reply CONFIRM to confirm or CANCEL to cancel.

- {business_name}
```

### Handle Replies

```javascript
// routes/twilio/webhook.js

router.post('/sms/incoming', async (req, res) => {
  const { From, Body } = req.body;
  const message = Body.trim().toUpperCase();

  // Find recent booking for this phone number
  const booking = await findRecentBookingByPhone(From);

  if (!booking) {
    return res.send('<Response></Response>');
  }

  if (message === 'CONFIRM') {
    await updateBookingStatus(booking.id, 'confirmed');
    await sendSMS(From, `Great! Your appointment is confirmed. See you soon!`);
  } else if (message === 'CANCEL') {
    await updateBookingStatus(booking.id, 'cancelled');
    await cancelCalendarEvent(booking);
    await notifyBusinessOfCancellation(booking);
    await sendSMS(From, `Your appointment has been cancelled. We hope to see you another time!`);
  }

  res.send('<Response></Response>');
});
```

---

## Customer Voice Reminder (Pro Only)

Outbound AI call 24 hours before appointment.

### Database: Outbound Call Queue

```sql
-- Created in PLAN_01_DATABASE.md
-- outbound_call_queue table
```

### Schedule Voice Reminder

```javascript
async function scheduleVoiceReminder(booking) {
  const features = await getUserFeatures(booking.user_id);

  if (!features.customer_voice_reminders_enabled) {
    return { scheduled: false, reason: 'feature_disabled' };
  }

  // Check outbound call limits
  const usage = await getOutboundUsage(booking.user_id);
  if (usage.used >= usage.limit) {
    return { scheduled: false, reason: 'limit_reached' };
  }

  // Calculate reminder time (24h before, during business hours)
  const bookingTime = new Date(booking.booking_datetime);
  let reminderTime = new Date(bookingTime.getTime() - 24 * 60 * 60 * 1000);

  // Adjust to business hours if needed (9am - 8pm)
  if (reminderTime.getHours() < 9) {
    reminderTime.setHours(9, 0, 0, 0);
  } else if (reminderTime.getHours() >= 20) {
    reminderTime.setHours(19, 0, 0, 0);
  }

  // Create queue entry
  const { data, error } = await supabase
    .from('outbound_call_queue')
    .insert({
      user_id: booking.user_id,
      booking_id: booking.id,
      phone_number: booking.customer_phone,
      customer_name: booking.customer_name,
      reminder_message: buildReminderScript(booking),
      scheduled_at: reminderTime.toISOString(),
      status: 'pending',
    });

  return { scheduled: true, scheduledAt: reminderTime };
}

function buildReminderScript(booking) {
  return `
    This is a friendly reminder from ${booking.business_name} about your
    appointment tomorrow at ${booking.booking_time} for ${booking.service}.

    Press 1 to confirm your appointment.
    Press 2 if you need to reschedule.
    Press 3 to cancel your appointment.

    If we don't hear from you, we'll assume you're coming.
  `;
}
```

### Outbound Call Processor

```javascript
// jobs/outboundCallProcessor.js

const cron = require('node-cron');

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('[Outbound Processor] Processing queue...');

  // Get pending calls that are due
  const { data: pendingCalls } = await supabase
    .from('outbound_call_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .lt('attempts', 3)
    .order('scheduled_at', { ascending: true })
    .limit(10); // Process in batches

  for (const call of pendingCalls || []) {
    await processOutboundCall(call);
    // Small delay between calls
    await sleep(2000);
  }
});

async function processOutboundCall(queueItem) {
  try {
    // Update status
    await supabase
      .from('outbound_call_queue')
      .update({
        status: 'in_progress',
        attempts: queueItem.attempts + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', queueItem.id);

    // Get user's assistant config
    const assistant = await getUserAssistant(queueItem.user_id);

    // Make outbound call via Vapi
    const vapiCall = await makeOutboundCall({
      phoneNumber: queueItem.phone_number,
      assistantId: assistant.vapi_assistant_id,
      firstMessage: `Hi, is this ${queueItem.customer_name}? ${queueItem.reminder_message}`,
      // Custom tools for handling responses
      tools: getReminderCallTools(),
    });

    // Update with Vapi call ID
    await supabase
      .from('outbound_call_queue')
      .update({
        vapi_call_id: vapiCall.id,
      })
      .eq('id', queueItem.id);

    // Record in call history
    await supabase
      .from('call_history')
      .insert({
        user_id: queueItem.user_id,
        phone_number: queueItem.phone_number,
        call_direction: 'outbound',
        outbound_queue_id: queueItem.id,
        vapi_call_id: vapiCall.id,
        status: 'initiated',
        message: 'Appointment reminder call',
      });

  } catch (error) {
    console.error(`[Outbound] Failed to process call ${queueItem.id}:`, error);

    await supabase
      .from('outbound_call_queue')
      .update({
        status: queueItem.attempts >= 2 ? 'failed' : 'pending',
        last_error: error.message,
      })
      .eq('id', queueItem.id);
  }
}
```

### Vapi Outbound Call API

```javascript
// services/vapiOutbound.js

async function makeOutboundCall({ phoneNumber, assistantId, firstMessage, tools }) {
  const response = await fetch('https://api.vapi.ai/call/phone', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_OUTBOUND_PHONE_ID,
      customer: {
        number: phoneNumber,
      },
      assistantId: assistantId,
      assistantOverrides: {
        firstMessage: firstMessage,
        model: {
          tools: tools,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Vapi API error: ${response.status}`);
  }

  return response.json();
}
```

### Handle Call Outcomes

```javascript
// In vapiWebhooks.js - handle outbound call results

async function handleOutboundCallEnd(message) {
  const { call, artifact } = message;

  // Find queue item
  const { data: queueItem } = await supabase
    .from('outbound_call_queue')
    .select('*, bookings(*)')
    .eq('vapi_call_id', call.id)
    .single();

  if (!queueItem) return;

  // Determine outcome from transcript/tool calls
  let outcome = 'no_answer';

  if (call.endedReason === 'voicemail') {
    outcome = 'voicemail';
  } else if (artifact?.messages) {
    // Check for confirmation/cancellation in conversation
    const toolCalls = artifact.messages.filter(m => m.toolCalls);
    for (const tc of toolCalls) {
      if (tc.function?.name === 'confirm_appointment') {
        outcome = 'confirmed';
      } else if (tc.function?.name === 'cancel_appointment') {
        outcome = 'cancelled';
      } else if (tc.function?.name === 'reschedule_appointment') {
        outcome = 'rescheduled';
      }
    }
  }

  // Update queue item
  await supabase
    .from('outbound_call_queue')
    .update({
      status: 'completed',
      call_outcome: outcome,
      call_duration_seconds: call.duration,
    })
    .eq('id', queueItem.id);

  // Update booking based on outcome
  if (outcome === 'confirmed') {
    await supabase
      .from('bookings')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', queueItem.booking_id);
  } else if (outcome === 'cancelled') {
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', queueItem.booking_id);

    // Cancel calendar event
    await cancelCalendarEvent(queueItem.bookings);

    // Notify business
    await notifyBusinessOfCancellation(queueItem.bookings);
  }
}
```

---

## Database Updates

```sql
-- Add reminder tracking to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voice_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_method TEXT; -- sms, voice, web

-- Notification log table
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  booking_id UUID REFERENCES bookings(id),
  type TEXT NOT NULL, -- sms_confirmation, sms_reminder, voice_reminder
  recipient TEXT NOT NULL,
  status TEXT NOT NULL, -- sent, failed, delivered, replied
  provider_message_id TEXT,
  content TEXT,
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Estimated Effort

| Task | Time |
|------|------|
| SMS confirmation service | 2 hours |
| SMS reminder scheduler | 3 hours |
| SMS reply handling | 2 hours |
| Voice reminder queue | 3 hours |
| Outbound call processor | 4 hours |
| Vapi outbound integration | 3 hours |
| Call outcome handling | 2 hours |
| Database updates | 1 hour |
| Testing | 4 hours |
| **Total** | **24 hours** |
