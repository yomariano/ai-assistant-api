/**
 * Create Promotion Codes for existing Coupons
 */
require('dotenv').config();
const Stripe = require('stripe');

const stripeMode = process.env.STRIPE_MODE || 'test';
const secretKey = stripeMode === 'live'
  ? process.env.STRIPE_LIVE_SECRET_KEY
  : process.env.STRIPE_TEST_SECRET_KEY;

// Use older API version for promotionCodes.create compatibility
const stripe = new Stripe(secretKey, {
  apiVersion: '2024-06-20'
});

const SEASONAL_CODES = [
  'NEWYEAR20', 'VALENTINE15', 'BRIGID15', 'PADDY25', 'LUCKY17',
  'EASTER20', 'SUMMER15', 'SPOOKY20', 'TREAT25', 'BLACKFRI35',
  'BFRIDAY30', 'CYBER30', 'CYBERMON25', 'XMAS25', 'NOLLAIG20', 'YEAREND30'
];

async function createPromoCodes() {
  console.log(`\n🎫 Creating promotion codes in ${stripeMode.toUpperCase()} mode...\n`);

  for (const code of SEASONAL_CODES) {
    try {
      // Check if promo code exists
      const existing = await stripe.promotionCodes.list({ code, limit: 1 });
      if (existing.data.length > 0) {
        console.log(`⏭️  Skipped: ${code} (exists)`);
        continue;
      }

      // Create promotion code
      const promo = await stripe.promotionCodes.create({
        coupon: code,
        code: code,
      });
      console.log(`✅ Created: ${promo.code}`);
    } catch (error) {
      console.error(`❌ Error ${code}: ${error.message}`);
    }
  }
  console.log('\n✨ Done!\n');
}

createPromoCodes().catch(console.error);
