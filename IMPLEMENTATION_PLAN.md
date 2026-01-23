# VoiceFleet Implementation Plan

## Overview

This document outlines all changes needed for the new pricing structure, feature matrix, and admin controls.

---

## New Pricing Structure

| Plan | Price | Inbound Calls | Outbound Calls |
|------|-------|---------------|----------------|
| Starter | €49/mo | 100 | ❌ |
| Growth | €199/mo | 500 | ❌ |
| Pro | €599/mo | 1,500 (fair use) | 200/mo |

---

## Feature Matrix

| Feature | Starter | Growth | Pro | Admin Toggle |
|---------|---------|--------|-----|--------------|
| **Phone Number** | 1 | 1 | 1 | ❌ |
| **Inbound Calls** | 100 | 500 | 1,500 | Limit adjustable |
| **Outbound Reminder Calls** | ❌ | ❌ | 200/mo | ✅ |
| **Google Calendar** | ✅ | ✅ | ✅ | ✅ |
| **Outlook Calendar** | ❌ | ✅ | ✅ | ✅ |
| **Multi-staff Calendar** | ❌ | ❌ | ✅ | ✅ |
| **Customer SMS Confirmation** | ❌ | ✅ | ✅ | ✅ |
| **SMS Reminders (24h)** | ❌ | ✅ | ✅ | ✅ |
| **AI Voice Reminders** | ❌ | ❌ | ✅ | ✅ |
| **Business Email Notifications** | ✅ | ✅ | ✅ | ✅ |
| **Business SMS Notifications** | ❌ | ✅ | ✅ | ✅ |
| **Webhook Notifications** | ❌ | ❌ | ✅ | ✅ |
| **Support Level** | Docs | 9-5 | 24/7 | Display only |
| **Trial Days** | 5 | 5 | 5 | Adjustable |

---

## Implementation Phases

### Phase 1: Database & Admin Foundation
- [ ] Plan features table with toggles
- [ ] Admin feature management API
- [ ] Admin UI for feature toggles

### Phase 2: Stripe & Billing Updates
- [ ] Create new Stripe products/prices
- [ ] Update payment links
- [ ] Update webhook handlers

### Phase 3: Calendar Integrations
- [ ] Google Calendar OAuth + API
- [ ] Outlook Calendar OAuth + API
- [ ] Multi-staff calendar support

### Phase 4: Customer Notifications
- [ ] SMS confirmation on booking
- [ ] SMS reminders (scheduler)
- [ ] Outbound AI voice reminders

### Phase 5: Feature Gating
- [ ] Backend middleware for feature checks
- [ ] Frontend feature visibility
- [ ] Usage tracking & limits

---

## Detailed Plans

See individual plan files:
- `PLAN_01_DATABASE.md` - Database schema changes
- `PLAN_02_ADMIN_PANEL.md` - Admin feature management
- `PLAN_03_STRIPE.md` - Stripe pricing updates
- `PLAN_04_CALENDAR.md` - Calendar integrations
- `PLAN_05_NOTIFICATIONS.md` - Customer SMS & reminders
- `PLAN_06_OUTBOUND.md` - Outbound AI calls
- `PLAN_07_FEATURE_GATING.md` - Feature access control

---

## Time Estimates Summary

| Phase | Plan | Hours |
|-------|------|-------|
| 1 | Database & Schema | 4 |
| 2 | Admin Panel | 22 |
| 3 | Stripe Updates | 7 |
| 4 | Calendar Integrations | 28 |
| 5 | Customer Notifications | 24 |
| 6 | Outbound Calls (Pro) | 7 |
| 7 | Feature Gating | 16 |
| | **Total** | **108 hours** |

**Estimated Timeline:** ~3-4 weeks (full-time)

---

## Priority Order (Recommended)

### Week 1: Foundation
1. ✅ PLAN_01 - Database (4h)
2. ✅ PLAN_03 - Stripe pricing (7h)
3. ✅ PLAN_07 - Feature gating (16h)

### Week 2: Admin & Calendar
4. ✅ PLAN_02 - Admin panel (22h)
5. 🔄 PLAN_04 - Google Calendar (14h of 28h)

### Week 3: Calendar & Notifications
6. 🔄 PLAN_04 - Outlook Calendar (14h)
7. ✅ PLAN_05 - SMS notifications (12h of 24h)

### Week 4: Pro Features & Polish
8. 🔄 PLAN_05 - Voice reminders (12h)
9. ✅ PLAN_06 - Outbound calls (7h)
10. Testing & bug fixes

---

## Quick Wins (Can do immediately)

1. **Update Stripe pricing** - Just create new products/prices
2. **Update pricing page** - Frontend only change
3. **Add is_admin column** - Simple migration
4. **Create plan_features table** - Seed with current plans

---

## Dependencies Graph

```
PLAN_01 (Database)
    │
    ├──► PLAN_02 (Admin Panel)
    │        │
    │        └──► PLAN_07 (Feature Gating)
    │
    ├──► PLAN_03 (Stripe) ──► Frontend pricing page
    │
    ├──► PLAN_04 (Calendar)
    │        │
    │        └──► PLAN_05 (Notifications)
    │                  │
    │                  └──► PLAN_06 (Outbound)
    │
    └──► PLAN_07 (Feature Gating) ──► All feature routes
```

---

## Files to Create (New)

### Backend (`ai-assistant-api/`)
```
src/
├── middleware/
│   ├── adminAuth.js
│   └── features.js
├── routes/
│   ├── admin/
│   │   ├── plans.js
│   │   └── users.js
│   ├── features.js
│   └── integrations/
│       ├── google.js
│       └── outlook.js
├── services/
│   ├── featureService.js
│   ├── googleCalendar.js
│   ├── outlookCalendar.js
│   └── customerNotifications.js
├── jobs/
│   ├── reminderScheduler.js
│   └── outboundCallProcessor.js
supabase/migrations/
├── 020_plan_features_and_admin.sql
├── 021_outbound_call_queue.sql
└── 022_notification_log.sql
```

### Frontend (`ai-assistant-web/`)
```
src/
├── app/(dashboard)/
│   └── admin/
│       ├── plans/
│       │   └── page.tsx
│       └── users/
│           ├── page.tsx
│           └── [id]/
│               └── page.tsx
├── components/
│   ├── admin/
│   │   ├── PlanFeatureToggle.tsx
│   │   └── UserOverrideForm.tsx
│   └── FeatureGate.tsx
├── contexts/
│   └── FeatureContext.tsx
└── lib/
    └── api/
        └── admin.ts
```

---

## Environment Variables (New)

### Backend
```bash
# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Microsoft/Outlook
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=

# Vapi Outbound
VAPI_OUTBOUND_PHONE_ID=
```

---

## Risk Areas

| Risk | Mitigation |
|------|------------|
| Breaking existing subscriptions | Keep old price IDs in mapping, grandfather existing customers |
| Calendar OAuth complexity | Start with Google only, add Outlook later |
| Outbound call costs | Strict limit enforcement, monitoring |
| Feature gating bugs | Comprehensive testing, fail-closed approach |

---

## Success Metrics

- [ ] All 3 plans purchasable via Stripe
- [ ] Admin can toggle features for any plan
- [ ] Admin can override features for specific users
- [ ] Google Calendar connects and checks availability
- [ ] SMS confirmations sent for Growth/Pro bookings
- [ ] Outbound reminder calls working for Pro
- [ ] Feature gates block unauthorized access
- [ ] All existing features still work
