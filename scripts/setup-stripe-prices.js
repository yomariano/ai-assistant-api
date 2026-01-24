/**
 * Setup Stripe Products and Prices for VoiceFleet
 *
 * New pricing structure:
 * - Starter: €49/mo (5-day trial)
 * - Growth: €199/mo (5-day trial)
 * - Pro: €599/mo (5-day trial)
 *
 * Usage:
 *   node scripts/setup-stripe-prices.js --mode=test
 *   node scripts/setup-stripe-prices.js --mode=live
 */

require('dotenv').config();
const Stripe = require('stripe');

const MODE = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'test';

const stripeKey = MODE === 'live'
  ? process.env.STRIPE_LIVE_SECRET_KEY
  : process.env.STRIPE_TEST_SECRET_KEY;

if (!stripeKey) {
  console.error(`Missing STRIPE_${MODE.toUpperCase()}_SECRET_KEY in .env`);
  process.exit(1);
}

const stripe = new Stripe(stripeKey);

const PLANS = [
  {
    id: 'starter',
    name: 'VoiceFleet Starter',
    description: 'Perfect for solo businesses getting started with AI call handling. 100 inbound calls/month, Google Calendar integration.',
    price_cents: 4900,
    features: [
      '100 inbound calls/month',
      'Google Calendar integration',
      'Email notifications',
      'Documentation support',
    ],
  },
  {
    id: 'growth',
    name: 'VoiceFleet Growth',
    description: 'For growing businesses. 500 inbound calls/month, SMS confirmations and reminders.',
    price_cents: 19900,
    features: [
      '500 inbound calls/month',
      'Google + Outlook Calendar',
      'Customer SMS confirmations',
      'SMS reminders (24h before)',
      'Business hours support (9-5)',
    ],
  },
  {
    id: 'pro',
    name: 'VoiceFleet Pro',
    description: 'For high-volume businesses. 1,500 inbound calls + 200 outbound reminder calls/month.',
    price_cents: 59900,
    features: [
      '1,500 inbound calls/month',
      '200 outbound AI reminder calls',
      'Multi-staff calendar',
      'AI voice reminders',
      'Webhook notifications',
      '24/7 priority support',
    ],
  },
];

async function setupStripe() {
  console.log(`\n🔧 Setting up Stripe prices in ${MODE.toUpperCase()} mode...\n`);

  const results = {
    products: [],
    prices: [],
  };

  for (const plan of PLANS) {
    console.log(`\n📦 Creating ${plan.name}...`);

    // Check if product already exists
    let product;
    const existingProducts = await stripe.products.search({
      query: `name:"${plan.name}"`,
    });

    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0];
      console.log(`   Found existing product: ${product.id}`);

      // Update product
      product = await stripe.products.update(product.id, {
        description: plan.description,
        metadata: {
          plan_id: plan.id,
          features: JSON.stringify(plan.features),
        },
      });
      console.log(`   Updated product metadata`);
    } else {
      // Create new product
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: {
          plan_id: plan.id,
          features: JSON.stringify(plan.features),
        },
      });
      console.log(`   Created product: ${product.id}`);
    }

    results.products.push({
      plan_id: plan.id,
      product_id: product.id,
    });

    // Check for existing price with same amount
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
    });

    const matchingPrice = existingPrices.data.find(
      p => p.unit_amount === plan.price_cents &&
           p.recurring?.interval === 'month' &&
           p.currency === 'eur'
    );

    let price;
    if (matchingPrice) {
      price = matchingPrice;
      console.log(`   Found existing price: ${price.id} (€${price.unit_amount / 100}/mo)`);
    } else {
      // Create new price
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_cents,
        currency: 'eur',
        recurring: {
          interval: 'month',
          trial_period_days: 5, // 5-day free trial
        },
        metadata: {
          plan_id: plan.id,
        },
      });
      console.log(`   Created price: ${price.id} (€${price.unit_amount / 100}/mo with 5-day trial)`);
    }

    results.prices.push({
      plan_id: plan.id,
      price_id: price.id,
      amount: plan.price_cents,
    });
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Stripe ${MODE.toUpperCase()} mode setup complete!\n`);

  console.log('Add these to your .env file:\n');

  const prefix = MODE === 'live' ? 'STRIPE_LIVE' : 'STRIPE_TEST';

  results.prices.forEach(p => {
    const envKey = `${prefix}_${p.plan_id.toUpperCase()}_PRICE_EUR`;
    console.log(`${envKey}=${p.price_id}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('\n📝 Next steps:');
  console.log('1. Create Payment Links in Stripe Dashboard for each price');
  console.log('2. Update .env with payment link URLs');
  console.log('3. Run migration to update database');

  return results;
}

// Also create payment links programmatically
async function createPaymentLinks(priceIds) {
  console.log('\n🔗 Creating Payment Links...\n');

  const links = [];

  for (const plan of PLANS) {
    const priceId = priceIds.find(p => p.plan_id === plan.id)?.price_id;
    if (!priceId) continue;

    try {
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: priceId, quantity: 1 }],
        after_completion: {
          type: 'redirect',
          redirect: {
            url: process.env.FRONTEND_URL
              ? `${process.env.FRONTEND_URL}/billing?success=true&plan=${plan.id}`
              : `https://app.voicefleet.ai/billing?success=true&plan=${plan.id}`,
          },
        },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        phone_number_collection: { enabled: true },
        metadata: {
          plan_id: plan.id,
        },
      });

      console.log(`   ${plan.name}: ${link.url}`);
      links.push({
        plan_id: plan.id,
        url: link.url,
      });
    } catch (error) {
      console.error(`   Error creating link for ${plan.name}:`, error.message);
    }
  }

  console.log('\nAdd these to your .env file:\n');
  const prefix = MODE === 'live' ? 'STRIPE_LIVE' : 'STRIPE_TEST';

  links.forEach(l => {
    const envKey = `${prefix}_PAYMENT_LINK_${l.plan_id.toUpperCase()}`;
    console.log(`${envKey}=${l.url}`);
  });

  return links;
}

async function main() {
  try {
    const results = await setupStripe();
    await createPaymentLinks(results.prices);

    console.log('\n✨ All done!\n');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
