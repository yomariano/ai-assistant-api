/**
 * Create Seasonal Discount Coupons in Stripe
 *
 * Run with: node scripts/create-seasonal-coupons.js
 *
 * Make sure STRIPE_SECRET_KEY is set (not the restricted key)
 */

require('dotenv').config();
const Stripe = require('stripe');

// Use the appropriate key based on mode
const stripeMode = process.env.STRIPE_MODE || 'test';
const secretKey = stripeMode === 'live'
  ? process.env.STRIPE_LIVE_SECRET_KEY
  : process.env.STRIPE_TEST_SECRET_KEY;

if (!secretKey) {
  console.error('ERROR: No Stripe secret key found. Set STRIPE_TEST_SECRET_KEY or STRIPE_LIVE_SECRET_KEY');
  process.exit(1);
}

// Use older API version for promotionCodes.create compatibility
const stripe = new Stripe(secretKey, {
  apiVersion: '2024-06-20'
});

// Seasonal coupons for Ireland marketing campaigns 2026
const SEASONAL_COUPONS = [
  // New Year
  { id: 'NEWYEAR20', name: 'New Year 2026 - 20% Off', percent_off: 20, duration: 'once' },

  // Valentine's Day
  { id: 'VALENTINE15', name: 'Valentine\'s Day 2026 - 15% Off', percent_off: 15, duration: 'once' },

  // St. Brigid's Day (Feb 2 - New Irish Bank Holiday)
  { id: 'BRIGID15', name: 'St. Brigid\'s Day 2026 - 15% Off', percent_off: 15, duration: 'once' },

  // St. Patrick's Day (March 17 - Biggest Irish Holiday!)
  { id: 'PADDY25', name: 'St. Patrick\'s Day 2026 - 25% Off', percent_off: 25, duration: 'once' },
  { id: 'LUCKY17', name: 'St. Patrick\'s Day Lucky 17% Off', percent_off: 17, duration: 'once' },

  // Easter (April 3-6)
  { id: 'EASTER20', name: 'Easter 2026 - 20% Off', percent_off: 20, duration: 'once' },

  // Summer Bank Holiday (August)
  { id: 'SUMMER15', name: 'Summer Bank Holiday 2026 - 15% Off', percent_off: 15, duration: 'once' },

  // Halloween (Oct 31 - Big in Ireland!)
  { id: 'SPOOKY20', name: 'Halloween 2026 - 20% Off', percent_off: 20, duration: 'once' },
  { id: 'TREAT25', name: 'Halloween Treat - 25% Off', percent_off: 25, duration: 'once' },

  // Black Friday (Nov 27)
  { id: 'BLACKFRI35', name: 'Black Friday 2026 - 35% Off', percent_off: 35, duration: 'once' },
  { id: 'BFRIDAY30', name: 'Black Friday 2026 - 30% Off', percent_off: 30, duration: 'once' },

  // Cyber Monday (Nov 30)
  { id: 'CYBER30', name: 'Cyber Monday 2026 - 30% Off', percent_off: 30, duration: 'once' },
  { id: 'CYBERMON25', name: 'Cyber Monday 2026 - 25% Off', percent_off: 25, duration: 'once' },

  // Christmas (Dec 25-26)
  { id: 'XMAS25', name: 'Christmas 2026 - 25% Off', percent_off: 25, duration: 'once' },
  { id: 'NOLLAIG20', name: 'Nollaig (Irish Christmas) - 20% Off', percent_off: 20, duration: 'once' },

  // Year-end
  { id: 'YEAREND30', name: 'Year End Sale - 30% Off', percent_off: 30, duration: 'once' },
];

async function createCouponsAndPromoCodes() {
  console.log(`\n🎉 Creating seasonal coupons in ${stripeMode.toUpperCase()} mode...\n`);

  const results = { created: [], skipped: [], errors: [] };

  for (const couponData of SEASONAL_COUPONS) {
    try {
      // Check if coupon exists
      let existingCoupon = null;
      try {
        existingCoupon = await stripe.coupons.retrieve(couponData.id);
      } catch (e) {
        // Coupon doesn't exist, that's fine
      }

      if (existingCoupon) {
        console.log(`⏭️  Skipped: ${couponData.id} (already exists)`);
        results.skipped.push(couponData.id);
        continue;
      }

      // Create coupon
      const createdCoupon = await stripe.coupons.create({
        id: couponData.id,
        name: couponData.name,
        percent_off: couponData.percent_off,
        duration: couponData.duration,
      });

      console.log(`   ✓ Coupon created: ${createdCoupon.id}`);

      // Create promotion code with same code as coupon ID
      const promoCode = await stripe.promotionCodes.create({
        coupon: createdCoupon.id,
        code: couponData.id,
      });

      console.log(`✅ Created: ${couponData.id} (${couponData.percent_off}% off) - Promo: ${promoCode.code}`);
      results.created.push(couponData.id);
    } catch (error) {
      console.error(`❌ Error creating ${couponData.id}: ${error.message}`);
      results.errors.push({ id: couponData.id, error: error.message });
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Created: ${results.created.length}`);
  console.log(`   Skipped: ${results.skipped.length}`);
  console.log(`   Errors:  ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(e => console.log(`   - ${e.id}: ${e.error}`));
  }

  console.log('\n✨ Done!\n');
}

// Run
createCouponsAndPromoCodes().catch(console.error);
