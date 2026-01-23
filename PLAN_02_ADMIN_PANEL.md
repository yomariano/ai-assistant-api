# Plan 02: Admin Panel - Feature Management

## Overview
Create admin interface to manage plan features and per-user overrides.

---

## Admin Routes (Sidebar)

```
ADMIN
├── Email Campaigns (existing)
├── Plan Management (new)
│   ├── Feature Configuration
│   └── Pricing
├── User Management (new)
│   ├── Search Users
│   ├── Feature Overrides
│   └── Usage Stats
└── Analytics (future)
```

---

## New Pages

### 1. `/admin/plans` - Plan Feature Configuration

**UI Components:**
- Tab for each plan (Starter | Growth | Pro)
- Toggle switches for each feature
- Number inputs for limits
- Save button per plan

**Mockup:**
```
┌─────────────────────────────────────────────────────────┐
│ Plan Management                                          │
├─────────────────────────────────────────────────────────┤
│ [Starter] [Growth] [Pro]                                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ CALL LIMITS                                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Inbound Calls        [  500  ] /month               │ │
│ │ Outbound Calls       [    0  ] /month               │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ CALENDAR INTEGRATIONS                                    │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Google Calendar      [====ON====]                   │ │
│ │ Outlook Calendar     [====ON====]                   │ │
│ │ Multi-staff Calendar [===OFF===]                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ CUSTOMER NOTIFICATIONS                                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ SMS Confirmation     [====ON====]                   │ │
│ │ SMS Reminders        [====ON====]                   │ │
│ │ Voice Reminders      [===OFF===]                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ BUSINESS NOTIFICATIONS                                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Email Notifications  [====ON====]                   │ │
│ │ SMS Notifications    [====ON====]                   │ │
│ │ Webhook              [===OFF===]                    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ BILLING                                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Price                €[  199  ] /month              │ │
│ │ Trial Days           [   5   ] days                 │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│                              [ Save Changes ]            │
└─────────────────────────────────────────────────────────┘
```

### 2. `/admin/users` - User Management

**Features:**
- Search users by email/name
- View user's current plan
- View usage stats
- Override features per user

**Mockup:**
```
┌─────────────────────────────────────────────────────────┐
│ User Management                                          │
├─────────────────────────────────────────────────────────┤
│ Search: [_________________________] [Search]            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ┌─ User ──────────────────────────────────────────────┐ │
│ │ john@plumber.ie                                      │ │
│ │ Plan: Growth | Status: Active | Since: Jan 2024     │ │
│ │ Usage: 234/500 calls | 45/∞ SMS                     │ │
│ │                                                      │ │
│ │ [View Details] [Feature Overrides] [Usage History]  │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ User ──────────────────────────────────────────────┐ │
│ │ mary@salon.ie                                        │ │
│ │ Plan: Pro | Status: Active | Since: Dec 2023        │ │
│ │ Usage: 892/1500 calls | 156/200 outbound            │ │
│ │                                                      │ │
│ │ [View Details] [Feature Overrides] [Usage History]  │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3. `/admin/users/[id]/overrides` - User Feature Overrides

**Mockup:**
```
┌─────────────────────────────────────────────────────────┐
│ Feature Overrides: john@plumber.ie                      │
│ Current Plan: Growth                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ Override features for this user (leave blank for plan   │
│ default)                                                 │
│                                                          │
│ CALL LIMITS                                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Inbound Calls   Plan: 500  Override: [  750  ]     │ │
│ │ Outbound Calls  Plan: 0    Override: [   50  ]     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ FEATURE TOGGLES                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Voice Reminders    Plan: OFF   [✓] Enable Override │ │
│ │ Webhook            Plan: OFF   [ ] Enable Override │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ADMIN NOTES                                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ VIP customer - gave extra outbound calls as a       │ │
│ │ trial for potential Pro upgrade                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│              [ Clear Overrides ] [ Save Overrides ]     │
└─────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Plan Management

```
GET    /api/admin/plans              - List all plans with features
GET    /api/admin/plans/:planId      - Get plan details
PUT    /api/admin/plans/:planId      - Update plan features
```

### User Management

```
GET    /api/admin/users              - List/search users
GET    /api/admin/users/:id          - Get user details + usage
GET    /api/admin/users/:id/overrides - Get user feature overrides
PUT    /api/admin/users/:id/overrides - Update user feature overrides
DELETE /api/admin/users/:id/overrides - Clear all overrides
```

---

## Backend Files

### New Files

| File | Purpose |
|------|---------|
| `routes/admin/plans.js` | Plan management API |
| `routes/admin/users.js` | User management API |
| `middleware/adminAuth.js` | Admin role verification |
| `services/featureService.js` | Feature flag logic |

### `services/featureService.js`

```javascript
/**
 * Get effective features for a user
 * Merges plan defaults with user overrides
 */
async function getUserFeatures(userId) {
  // 1. Get user's plan
  const plan = await getUserPlan(userId);

  // 2. Get plan features
  const planFeatures = await getPlanFeatures(plan.planId);

  // 3. Get user overrides
  const overrides = await getUserOverrides(userId);

  // 4. Merge (overrides take precedence)
  return mergeFeatures(planFeatures, overrides);
}

/**
 * Check if user has access to a specific feature
 */
async function hasFeature(userId, featureName) {
  const features = await getUserFeatures(userId);
  return features[featureName] === true;
}

/**
 * Check if user is within usage limits
 */
async function checkLimit(userId, limitType) {
  const features = await getUserFeatures(userId);
  const usage = await getCurrentUsage(userId, limitType);
  const limit = features[`${limitType}_limit`];

  return {
    allowed: usage < limit,
    used: usage,
    limit: limit,
    remaining: limit - usage
  };
}
```

---

## Frontend Files

### New Files

| File | Purpose |
|------|---------|
| `app/(dashboard)/admin/plans/page.tsx` | Plan management UI |
| `app/(dashboard)/admin/users/page.tsx` | User list/search UI |
| `app/(dashboard)/admin/users/[id]/page.tsx` | User details UI |
| `components/admin/PlanFeatureToggle.tsx` | Toggle component |
| `components/admin/UserOverrideForm.tsx` | Override form |
| `lib/api/admin.ts` | Admin API client |

### Update Sidebar

```tsx
// components/Sidebar.tsx
// Add under ADMIN section:

{isAdmin && (
  <>
    <NavItem href="/admin/plans" icon={Settings}>
      Plan Management
    </NavItem>
    <NavItem href="/admin/users" icon={Users}>
      User Management
    </NavItem>
  </>
)}
```

---

## Admin Role Check

### Database

```sql
-- Add admin flag to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Set yourself as admin
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

### Middleware

```javascript
// middleware/adminAuth.js
const adminAuth = async (req, res, next) => {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
```

---

## Estimated Effort

| Task | Time |
|------|------|
| Admin auth middleware | 1 hour |
| Plan management API | 3 hours |
| User management API | 3 hours |
| Feature service | 2 hours |
| Plan management UI | 4 hours |
| User management UI | 4 hours |
| Override UI | 3 hours |
| Testing | 2 hours |
| **Total** | **22 hours** |
