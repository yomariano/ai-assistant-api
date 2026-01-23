# Plan 07: Feature Gating & Access Control

## Overview
Implement feature access control based on plan and admin overrides.

---

## Architecture

```
User Request
     │
     ▼
┌─────────────────────┐
│ Feature Middleware  │ ◄── Checks user's effective features
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│ getUserFeatures()   │
└─────────────────────┘
     │
     ├──► plan_features (base)
     │
     └──► user_feature_overrides (admin overrides)
                │
                ▼
         Merged Features
```

---

## Feature Service

### `services/featureService.js`

```javascript
const { supabaseAdmin } = require('./supabase');

// Cache for plan features (refresh every 5 minutes)
let planFeaturesCache = null;
let planFeaturesCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Get all plan features (with caching)
 */
async function getPlanFeatures() {
  if (planFeaturesCache && Date.now() - planFeaturesCacheTime < CACHE_TTL) {
    return planFeaturesCache;
  }

  const { data, error } = await supabaseAdmin
    .from('plan_features')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch plan features:', error);
    return planFeaturesCache || getDefaultPlanFeatures();
  }

  planFeaturesCache = data.reduce((acc, plan) => {
    acc[plan.plan_id] = plan;
    return acc;
  }, {});
  planFeaturesCacheTime = Date.now();

  return planFeaturesCache;
}

/**
 * Get features for a specific plan
 */
async function getPlanFeaturesByPlanId(planId) {
  const allFeatures = await getPlanFeatures();
  return allFeatures[planId] || allFeatures['starter'];
}

/**
 * Get user's feature overrides
 */
async function getUserOverrides(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_feature_overrides')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to fetch user overrides:', error);
  }

  return data || {};
}

/**
 * Get effective features for a user
 * Merges plan defaults with user overrides
 */
async function getUserFeatures(userId) {
  // Get user's current plan
  const { data: subscription } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id, status')
    .eq('user_id', userId)
    .single();

  const planId = subscription?.plan_id || 'starter';
  const isActive = ['active', 'trialing'].includes(subscription?.status);

  // Get plan features
  const planFeatures = await getPlanFeaturesByPlanId(planId);

  // Get user overrides
  const overrides = await getUserOverrides(userId);

  // Merge features (overrides take precedence if not null)
  const features = {
    plan_id: planId,
    is_active: isActive,

    // Call limits
    inbound_calls_limit: overrides.inbound_calls_limit_override ?? planFeatures.inbound_calls_limit,
    outbound_calls_limit: overrides.outbound_calls_limit_override ?? planFeatures.outbound_calls_limit,

    // Calendar
    google_calendar_enabled: overrides.google_calendar_override ?? planFeatures.google_calendar_enabled,
    outlook_calendar_enabled: overrides.outlook_calendar_override ?? planFeatures.outlook_calendar_enabled,
    multi_staff_calendar_enabled: overrides.multi_staff_calendar_override ?? planFeatures.multi_staff_calendar_enabled,

    // Customer notifications
    customer_sms_confirmation_enabled: overrides.customer_sms_confirmation_override ?? planFeatures.customer_sms_confirmation_enabled,
    customer_sms_reminders_enabled: overrides.customer_sms_reminders_override ?? planFeatures.customer_sms_reminders_enabled,
    customer_voice_reminders_enabled: overrides.customer_voice_reminders_override ?? planFeatures.customer_voice_reminders_enabled,

    // Business notifications
    business_email_enabled: overrides.business_email_override ?? planFeatures.business_email_enabled,
    business_sms_enabled: overrides.business_sms_override ?? planFeatures.business_sms_enabled,
    business_webhook_enabled: overrides.business_webhook_override ?? planFeatures.business_webhook_enabled,

    // Trial
    trial_days: overrides.trial_days_override ?? planFeatures.trial_days,
  };

  return features;
}

/**
 * Check if user has a specific feature enabled
 */
async function hasFeature(userId, featureName) {
  const features = await getUserFeatures(userId);
  return features[featureName] === true;
}

/**
 * Check usage against limits
 */
async function checkUsageLimit(userId, limitType) {
  const features = await getUserFeatures(userId);
  const limit = features[`${limitType}_limit`];

  if (!limit || limit === 0) {
    return { allowed: false, reason: 'feature_not_available' };
  }

  const usage = await getCurrentUsage(userId, limitType);

  return {
    allowed: usage < limit,
    used: usage,
    limit: limit,
    remaining: Math.max(0, limit - usage),
  };
}

/**
 * Clear feature cache (call when admin updates features)
 */
function clearFeatureCache() {
  planFeaturesCache = null;
  planFeaturesCacheTime = 0;
}

module.exports = {
  getPlanFeatures,
  getPlanFeaturesByPlanId,
  getUserFeatures,
  hasFeature,
  checkUsageLimit,
  clearFeatureCache,
};
```

---

## Feature Middleware

### `middleware/features.js`

```javascript
const { hasFeature, checkUsageLimit } = require('../services/featureService');

/**
 * Middleware to require a specific feature
 */
function requireFeature(featureName) {
  return async (req, res, next) => {
    try {
      const enabled = await hasFeature(req.userId, featureName);

      if (!enabled) {
        return res.status(403).json({
          error: {
            code: 'FEATURE_NOT_AVAILABLE',
            message: `This feature requires an upgrade. ${featureName} is not available on your current plan.`,
            feature: featureName,
            upgradeUrl: '/billing',
          },
        });
      }

      next();
    } catch (error) {
      console.error('Feature check error:', error);
      next(error);
    }
  };
}

/**
 * Middleware to check usage limits
 */
function checkLimit(limitType) {
  return async (req, res, next) => {
    try {
      const result = await checkUsageLimit(req.userId, limitType);

      if (!result.allowed) {
        return res.status(429).json({
          error: {
            code: 'LIMIT_EXCEEDED',
            message: `You've reached your ${limitType} limit for this billing period.`,
            used: result.used,
            limit: result.limit,
            upgradeUrl: '/billing',
          },
        });
      }

      // Attach limit info to request for handlers to use
      req.usageLimit = result;
      next();
    } catch (error) {
      console.error('Limit check error:', error);
      next(error);
    }
  };
}

/**
 * Attach user features to request (for optional feature checks)
 */
async function attachFeatures(req, res, next) {
  try {
    const { getUserFeatures } = require('../services/featureService');
    req.features = await getUserFeatures(req.userId);
    next();
  } catch (error) {
    console.error('Failed to attach features:', error);
    req.features = {}; // Empty features, handlers can check
    next();
  }
}

module.exports = {
  requireFeature,
  checkLimit,
  attachFeatures,
};
```

---

## Route Protection Examples

### Calendar Integration Routes

```javascript
// routes/integrations/outlook.js

const { requireFeature } = require('../../middleware/features');

// Outlook requires Growth or Pro
router.use(requireFeature('outlook_calendar_enabled'));

router.get('/auth', async (req, res) => {
  // Only reaches here if user has outlook_calendar_enabled
});
```

### Notification Routes

```javascript
// routes/notifications.js

router.post('/webhook-test',
  requireFeature('business_webhook_enabled'),
  async (req, res) => {
    // Test webhook - Pro only
  }
);
```

### Outbound Call Routes

```javascript
// routes/outbound.js

const { requireFeature, checkLimit } = require('../middleware/features');

router.post('/schedule-reminder',
  requireFeature('customer_voice_reminders_enabled'),
  checkLimit('outbound_calls'),
  async (req, res) => {
    // Schedule outbound reminder call
  }
);
```

---

## Frontend Feature Gating

### Feature Context

```tsx
// contexts/FeatureContext.tsx

import { createContext, useContext, useEffect, useState } from 'react';
import { featuresApi } from '@/lib/api';

interface Features {
  plan_id: string;
  inbound_calls_limit: number;
  outbound_calls_limit: number;
  google_calendar_enabled: boolean;
  outlook_calendar_enabled: boolean;
  multi_staff_calendar_enabled: boolean;
  customer_sms_confirmation_enabled: boolean;
  customer_sms_reminders_enabled: boolean;
  customer_voice_reminders_enabled: boolean;
  business_email_enabled: boolean;
  business_sms_enabled: boolean;
  business_webhook_enabled: boolean;
}

const FeatureContext = createContext<Features | null>(null);

export function FeatureProvider({ children }: { children: React.ReactNode }) {
  const [features, setFeatures] = useState<Features | null>(null);

  useEffect(() => {
    featuresApi.getMyFeatures().then(setFeatures);
  }, []);

  return (
    <FeatureContext.Provider value={features}>
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatures() {
  return useContext(FeatureContext);
}

export function useHasFeature(featureName: keyof Features) {
  const features = useFeatures();
  return features?.[featureName] === true;
}
```

### Feature Gate Component

```tsx
// components/FeatureGate.tsx

interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const hasFeature = useHasFeature(feature as any);

  if (!hasFeature) {
    return fallback || <UpgradePrompt feature={feature} />;
  }

  return <>{children}</>;
}

// Usage:
<FeatureGate feature="outlook_calendar_enabled">
  <OutlookCalendarSettings />
</FeatureGate>
```

### Upgrade Prompt Component

```tsx
// components/UpgradePrompt.tsx

const featureInfo: Record<string, { name: string; plan: string }> = {
  outlook_calendar_enabled: { name: 'Outlook Calendar', plan: 'Growth' },
  customer_sms_confirmation_enabled: { name: 'Customer SMS', plan: 'Growth' },
  customer_voice_reminders_enabled: { name: 'Voice Reminders', plan: 'Pro' },
  business_webhook_enabled: { name: 'Webhooks', plan: 'Pro' },
};

export function UpgradePrompt({ feature }: { feature: string }) {
  const info = featureInfo[feature];

  return (
    <Card className="border-dashed">
      <CardContent className="py-8 text-center">
        <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-semibold">{info?.name || 'Feature'} not available</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Upgrade to {info?.plan || 'a higher plan'} to unlock this feature
        </p>
        <Button asChild className="mt-4">
          <Link href="/billing">Upgrade Now</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## API Endpoint for Features

```javascript
// routes/features.js

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getUserFeatures } = require('../services/featureService');

router.use(authenticate);

/**
 * GET /api/features
 * Get current user's effective features
 */
router.get('/', async (req, res) => {
  try {
    const features = await getUserFeatures(req.userId);
    res.json(features);
  } catch (error) {
    console.error('Failed to get features:', error);
    res.status(500).json({ error: 'Failed to get features' });
  }
});

module.exports = router;
```

---

## Testing Feature Gating

```javascript
// __tests__/features.test.js

describe('Feature Gating', () => {
  test('starter user cannot access outlook calendar', async () => {
    const res = await request(app)
      .get('/api/integrations/outlook/auth')
      .set('Authorization', `Bearer ${starterUserToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_NOT_AVAILABLE');
  });

  test('growth user can access outlook calendar', async () => {
    const res = await request(app)
      .get('/api/integrations/outlook/auth')
      .set('Authorization', `Bearer ${growthUserToken}`);

    expect(res.status).toBe(200);
  });

  test('admin override enables feature for starter user', async () => {
    // Set override
    await supabaseAdmin
      .from('user_feature_overrides')
      .upsert({
        user_id: starterUserId,
        outlook_calendar_override: true,
      });

    const res = await request(app)
      .get('/api/integrations/outlook/auth')
      .set('Authorization', `Bearer ${starterUserToken}`);

    expect(res.status).toBe(200);
  });
});
```

---

## Estimated Effort

| Task | Time |
|------|------|
| Feature service | 3 hours |
| Feature middleware | 2 hours |
| API endpoint | 1 hour |
| Frontend context/hooks | 2 hours |
| Gate components | 2 hours |
| Apply to all routes | 3 hours |
| Testing | 3 hours |
| **Total** | **16 hours** |
