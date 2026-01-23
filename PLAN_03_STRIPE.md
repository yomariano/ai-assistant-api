# Plan 03: Stripe Pricing Updates

## Overview
Update Stripe products, prices, and payment links for new pricing structure.

---

## New Pricing

| Plan | Old Price | New Price | Change |
|------|-----------|-----------|--------|
| Starter | €19/mo | €49/mo | +€30 |
| Growth | €99/mo | €199/mo | +€100 |
| Pro | €249/mo | €599/mo | +€350 |

---

## Stripe Dashboard Tasks

### 1. Create New Prices (Don't modify existing - affects active subscriptions)

```
Product: VoiceFleet Starter
├── Old Price: €19/mo (keep for existing subscribers)
└── New Price: €49/mo (for new subscribers) ← CREATE

Product: VoiceFleet Growth
├── Old Price: €99/mo (keep for existing subscribers)
└── New Price: €199/mo (for new subscribers) ← CREATE

Product: VoiceFleet Pro
├── Old Price: €249/mo (keep for existing subscribers)
└── New Price: €599/mo (for new subscribers) ← CREATE
```

### 2. Create New Payment Links

For each plan:
1. Go to Stripe Dashboard → Payment Links
2. Create new link with new price
3. Add `client_reference_id` parameter support
4. Enable "Collect phone number"
5. Copy new URLs

### 3. Update Webhook Configuration (if needed)

Ensure webhook receives:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

---

## Environment Variables to Update

### Backend (`ai-assistant-api/.env`)

```bash
# Payment Links - TEST MODE
STRIPE_TEST_PAYMENT_LINK_STARTER=https://buy.stripe.com/test_NEW_STARTER_LINK
STRIPE_TEST_PAYMENT_LINK_GROWTH=https://buy.stripe.com/test_NEW_GROWTH_LINK
STRIPE_TEST_PAYMENT_LINK_SCALE=https://buy.stripe.com/test_NEW_PRO_LINK

# Payment Links - LIVE MODE
STRIPE_LIVE_PAYMENT_LINK_STARTER=https://buy.stripe.com/NEW_STARTER_LINK
STRIPE_LIVE_PAYMENT_LINK_GROWTH=https://buy.stripe.com/NEW_GROWTH_LINK
STRIPE_LIVE_PAYMENT_LINK_SCALE=https://buy.stripe.com/NEW_PRO_LINK

# Price IDs - TEST MODE
STRIPE_TEST_STARTER_PRICE_EUR=price_NEW_TEST_STARTER
STRIPE_TEST_GROWTH_PRICE_EUR=price_NEW_TEST_GROWTH
STRIPE_TEST_SCALE_PRICE_EUR=price_NEW_TEST_PRO

# Price IDs - LIVE MODE
STRIPE_LIVE_STARTER_PRICE_EUR=price_NEW_LIVE_STARTER
STRIPE_LIVE_GROWTH_PRICE_EUR=price_NEW_LIVE_GROWTH
STRIPE_LIVE_SCALE_PRICE_EUR=price_NEW_LIVE_PRO
```

### Frontend (`ai-assistant-web/.env`)

```bash
# Payment Links - TEST MODE
NEXT_PUBLIC_STRIPE_TEST_LINK_STARTER=https://buy.stripe.com/test_NEW_STARTER_LINK
NEXT_PUBLIC_STRIPE_TEST_LINK_GROWTH=https://buy.stripe.com/test_NEW_GROWTH_LINK
NEXT_PUBLIC_STRIPE_TEST_LINK_SCALE=https://buy.stripe.com/test_NEW_PRO_LINK

# Payment Links - LIVE MODE
NEXT_PUBLIC_STRIPE_LIVE_LINK_STARTER=https://buy.stripe.com/NEW_STARTER_LINK
NEXT_PUBLIC_STRIPE_LIVE_LINK_GROWTH=https://buy.stripe.com/NEW_GROWTH_LINK
NEXT_PUBLIC_STRIPE_LIVE_LINK_SCALE=https://buy.stripe.com/NEW_PRO_LINK
```

---

## Code Updates

### 1. Update `services/stripe.js`

```javascript
// Update PRICE_TO_PLAN mapping with new price IDs
const PRICE_TO_PLAN = {
  // Test EUR - NEW PRICES
  'price_NEW_TEST_STARTER': 'starter',
  'price_NEW_TEST_GROWTH': 'growth',
  'price_NEW_TEST_PRO': 'pro',

  // Live EUR - NEW PRICES
  'price_NEW_LIVE_STARTER': 'starter',
  'price_NEW_LIVE_GROWTH': 'growth',
  'price_NEW_LIVE_PRO': 'pro',

  // Keep old price mappings for existing subscribers
  'price_OLD_STARTER': 'starter',
  'price_OLD_GROWTH': 'growth',
  'price_OLD_PRO': 'pro',
};

// Update PLAN_PRICES
const PLAN_PRICES = {
  starter: 4900,  // €49
  growth: 19900,  // €199
  pro: 59900,     // €599
};
```

### 2. Update `PricingSection.tsx`

```tsx
const tiers = [
  {
    name: 'Starter',
    price: '€49',
    description: 'For solo businesses getting started',
    features: [
      '100 inbound calls/month',
      '1 phone number',
      'Google Calendar integration',
      'Email notifications',
      'Docs support',
      '5-day free trial',
    ],
    notIncluded: [
      'Customer SMS confirmations',
      'SMS/Voice reminders',
      'Outlook Calendar',
    ],
  },
  {
    name: 'Growth',
    price: '€199',
    popular: true,
    description: 'For growing businesses',
    features: [
      '500 inbound calls/month',
      '1 phone number',
      'Google + Outlook Calendar',
      'Customer SMS confirmations',
      'SMS reminders (24h before)',
      'Email + SMS notifications',
      'Business hours support (9-5)',
      '5-day free trial',
    ],
    notIncluded: [
      'AI voice reminders',
      'Webhook notifications',
    ],
  },
  {
    name: 'Pro',
    price: '€599',
    description: 'For high-volume businesses',
    features: [
      'Unlimited inbound calls (1,500 fair use)',
      '200 outbound reminder calls/month',
      '1 phone number',
      'Multi-staff calendar',
      'Customer SMS + Voice reminders',
      'Email + SMS + Webhook notifications',
      '24/7 priority support',
      '5-day free trial',
    ],
    notIncluded: [],
  },
];
```

### 3. Update `billing/page.tsx`

Update plan details display with new features and pricing.

---

## Trial Implementation

### Stripe Trial Configuration

When creating payment link, set:
- Trial period: 5 days
- Require payment method upfront: Yes

OR handle trial in code:

```javascript
// In webhook handler for checkout.session.completed
if (isNewSubscription) {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 5);

  await stripe.subscriptions.update(subscriptionId, {
    trial_end: Math.floor(trialEnd.getTime() / 1000),
  });
}
```

---

## Migration Strategy for Existing Customers

**Option A: Grandfather existing prices**
- Existing subscribers keep old price
- Only new subscribers get new price
- Requires keeping old price IDs in mapping

**Option B: Migrate all to new prices**
- Notify customers of price change
- Give 30-day notice
- Use Stripe's price migration tools

**Recommended: Option A** (grandfather existing customers)

---

## Testing Checklist

- [ ] Create test prices in Stripe
- [ ] Create test payment links
- [ ] Update test environment variables
- [ ] Test new subscriber flow
- [ ] Verify webhook handles new price IDs
- [ ] Verify trial period works
- [ ] Test upgrade/downgrade flows
- [ ] Test with existing subscriber (old price should still work)

---

## Estimated Effort

| Task | Time |
|------|------|
| Create Stripe products/prices | 30 min |
| Create payment links | 30 min |
| Update backend env + code | 2 hours |
| Update frontend env + code | 2 hours |
| Testing | 2 hours |
| **Total** | **7 hours** |
