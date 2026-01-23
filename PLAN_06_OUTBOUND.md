# Plan 06: Outbound AI Calls (Pro Feature)

## Overview
Pro-only feature for AI-powered outbound reminder calls.

**Note:** Most implementation covered in PLAN_05_NOTIFICATIONS.md. This document covers additional Pro-specific details.

---

## Feature Summary

| Aspect | Detail |
|--------|--------|
| Plan | Pro only (€599/mo) |
| Monthly Limit | 200 outbound calls |
| Use Case | Appointment reminders 24h before |
| AI Capabilities | Confirm, reschedule, cancel bookings |

---

## Outbound Call Limits

### Tracking Usage

```javascript
// services/usageTracking.js

async function getOutboundUsage(userId) {
  const features = await getUserFeatures(userId);
  const limit = features.outbound_calls_limit || 0;

  // Count outbound calls this billing period
  const subscription = await getUserSubscription(userId);
  const periodStart = subscription.current_period_start;

  const { count } = await supabase
    .from('call_history')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('call_direction', 'outbound')
    .gte('created_at', periodStart);

  return {
    used: count || 0,
    limit: limit,
    remaining: Math.max(0, limit - (count || 0)),
    percentUsed: limit > 0 ? Math.round((count / limit) * 100) : 0,
  };
}

async function canMakeOutboundCall(userId) {
  const usage = await getOutboundUsage(userId);
  return usage.remaining > 0;
}
```

### Limit Enforcement

```javascript
// In outbound call processor

async function processOutboundCall(queueItem) {
  // Check limits before making call
  const canCall = await canMakeOutboundCall(queueItem.user_id);

  if (!canCall) {
    await supabase
      .from('outbound_call_queue')
      .update({
        status: 'skipped',
        last_error: 'Monthly outbound call limit reached',
      })
      .eq('id', queueItem.id);

    // Notify business that reminder couldn't be sent
    await notifyBusinessLimitReached(queueItem.user_id, queueItem);
    return;
  }

  // ... proceed with call
}
```

---

## Vapi Configuration for Outbound

### Outbound Phone Number

Need a dedicated Vapi phone number for outbound calls:

```bash
# Environment variable
VAPI_OUTBOUND_PHONE_ID=your-outbound-phone-id
```

### Assistant Override for Reminders

```javascript
const reminderAssistantOverride = {
  firstMessage: null, // Set dynamically per call
  model: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.5,
    messages: [{
      role: 'system',
      content: `You are calling to remind someone about their appointment.
        Be friendly and professional. Your goal is to:
        1. Confirm they are the right person
        2. Remind them of their appointment details
        3. Ask if they want to confirm, reschedule, or cancel
        4. Handle their response appropriately

        If you reach voicemail, leave a brief reminder message.
        Keep the call short and efficient.`
    }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'confirm_appointment',
          description: 'Customer confirms they will attend the appointment',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reschedule_appointment',
          description: 'Customer wants to reschedule',
          parameters: {
            type: 'object',
            properties: {
              preferred_date: { type: 'string' },
              preferred_time: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'cancel_appointment',
          description: 'Customer wants to cancel the appointment',
          parameters: {
            type: 'object',
            properties: {
              reason: { type: 'string' },
            },
          },
        },
      },
    ],
  },
  voice: {
    provider: 'vapi',
    voiceId: 'Jess', // Or user's configured voice
  },
};
```

---

## Dashboard UI: Outbound Usage

### Pro Dashboard Widget

```tsx
// components/dashboard/OutboundUsageWidget.tsx

export function OutboundUsageWidget() {
  const { data: usage } = useOutboundUsage();

  if (!usage) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PhoneOutgoing className="h-5 w-5" />
          Outbound Reminder Calls
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Used this month</span>
            <span className="font-medium">{usage.used} / {usage.limit}</span>
          </div>
          <Progress value={usage.percentUsed} />
          <p className="text-xs text-muted-foreground">
            {usage.remaining} reminder calls remaining
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Outbound Call History

```tsx
// In call history page, add filter for outbound calls

<Tabs defaultValue="all">
  <TabsList>
    <TabsTrigger value="all">All Calls</TabsTrigger>
    <TabsTrigger value="inbound">Inbound</TabsTrigger>
    <TabsTrigger value="outbound">Outbound Reminders</TabsTrigger>
  </TabsList>
</Tabs>
```

---

## Webhook Handling

```javascript
// vapiWebhooks.js - detect outbound calls

async function handleEndOfCallReport(message) {
  const { call, artifact } = message;

  // Check if this is an outbound call
  const isOutbound = await isOutboundCall(call.id);

  if (isOutbound) {
    await handleOutboundCallEnd(message);
    return;
  }

  // ... existing inbound call handling
}

async function isOutboundCall(vapiCallId) {
  const { data } = await supabase
    .from('outbound_call_queue')
    .select('id')
    .eq('vapi_call_id', vapiCallId)
    .single();

  return !!data;
}
```

---

## Estimated Effort

Most work covered in PLAN_05. Additional Pro-specific work:

| Task | Time |
|------|------|
| Usage tracking & limits | 2 hours |
| Dashboard widget | 2 hours |
| Call history filter | 1 hour |
| Testing | 2 hours |
| **Total** | **7 hours** |
