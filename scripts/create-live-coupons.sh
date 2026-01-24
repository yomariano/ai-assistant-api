#!/bin/bash
# Run this after: stripe login
# Creates all coupons and promo codes in LIVE mode

echo "=== Creating BEHAVIORAL TRIGGER coupons ==="
stripe coupons create --id=MOMENTUM15 --name="Momentum 15% Off" --percent-off=15 --duration=once --live
stripe coupons create --id=KEEPGOING20 --name="Keep Going 20% Off" --percent-off=20 --duration=once --live
stripe coupons create --id=NOLIMITS25 --name="No Limits 25% Off" --percent-off=25 --duration=once --live
stripe coupons create --id=COMEBACK20 --name="Comeback 20% Off" --percent-off=20 --duration=once --live
stripe coupons create --id=LASTCHANCE30 --name="Last Chance 30% Off" --percent-off=30 --duration=once --live
stripe coupons create --id=READY15 --name="Ready 15% Off" --percent-off=15 --duration=once --live

echo "=== Creating SEASONAL coupons ==="
stripe coupons create --id=NEWYEAR20 --name="New Year 2026 - 20% Off" --percent-off=20 --duration=once --live
stripe coupons create --id=VALENTINE15 --name="Valentine's Day 2026 - 15% Off" --percent-off=15 --duration=once --live
stripe coupons create --id=BRIGID15 --name="St. Brigid's Day 2026 - 15% Off" --percent-off=15 --duration=once --live
stripe coupons create --id=PADDY25 --name="St. Patrick's Day 2026 - 25% Off" --percent-off=25 --duration=once --live
stripe coupons create --id=LUCKY17 --name="St. Patrick's Day Lucky 17% Off" --percent-off=17 --duration=once --live
stripe coupons create --id=EASTER20 --name="Easter 2026 - 20% Off" --percent-off=20 --duration=once --live
stripe coupons create --id=SUMMER15 --name="Summer Bank Holiday 2026 - 15% Off" --percent-off=15 --duration=once --live
stripe coupons create --id=SPOOKY20 --name="Halloween 2026 - 20% Off" --percent-off=20 --duration=once --live
stripe coupons create --id=TREAT25 --name="Halloween Treat - 25% Off" --percent-off=25 --duration=once --live
stripe coupons create --id=BLACKFRI35 --name="Black Friday 2026 - 35% Off" --percent-off=35 --duration=once --live
stripe coupons create --id=BFRIDAY30 --name="Black Friday 2026 - 30% Off" --percent-off=30 --duration=once --live
stripe coupons create --id=CYBER30 --name="Cyber Monday 2026 - 30% Off" --percent-off=30 --duration=once --live
stripe coupons create --id=CYBERMON25 --name="Cyber Monday 2026 - 25% Off" --percent-off=25 --duration=once --live
stripe coupons create --id=XMAS25 --name="Christmas 2026 - 25% Off" --percent-off=25 --duration=once --live
stripe coupons create --id=NOLLAIG20 --name="Nollaig (Irish Christmas) - 20% Off" --percent-off=20 --duration=once --live
stripe coupons create --id=YEAREND30 --name="Year End Sale - 30% Off" --percent-off=30 --duration=once --live

echo "=== Creating PROMOTION CODES ==="
# Behavioral
stripe promotion_codes create --coupon=MOMENTUM15 --code=MOMENTUM15 --live
stripe promotion_codes create --coupon=KEEPGOING20 --code=KEEPGOING20 --live
stripe promotion_codes create --coupon=NOLIMITS25 --code=NOLIMITS25 --live
stripe promotion_codes create --coupon=COMEBACK20 --code=COMEBACK20 --live
stripe promotion_codes create --coupon=LASTCHANCE30 --code=LASTCHANCE30 --live
stripe promotion_codes create --coupon=READY15 --code=READY15 --live

# Seasonal
stripe promotion_codes create --coupon=NEWYEAR20 --code=NEWYEAR20 --live
stripe promotion_codes create --coupon=VALENTINE15 --code=VALENTINE15 --live
stripe promotion_codes create --coupon=BRIGID15 --code=BRIGID15 --live
stripe promotion_codes create --coupon=PADDY25 --code=PADDY25 --live
stripe promotion_codes create --coupon=LUCKY17 --code=LUCKY17 --live
stripe promotion_codes create --coupon=EASTER20 --code=EASTER20 --live
stripe promotion_codes create --coupon=SUMMER15 --code=SUMMER15 --live
stripe promotion_codes create --coupon=SPOOKY20 --code=SPOOKY20 --live
stripe promotion_codes create --coupon=TREAT25 --code=TREAT25 --live
stripe promotion_codes create --coupon=BLACKFRI35 --code=BLACKFRI35 --live
stripe promotion_codes create --coupon=BFRIDAY30 --code=BFRIDAY30 --live
stripe promotion_codes create --coupon=CYBER30 --code=CYBER30 --live
stripe promotion_codes create --coupon=CYBERMON25 --code=CYBERMON25 --live
stripe promotion_codes create --coupon=XMAS25 --code=XMAS25 --live
stripe promotion_codes create --coupon=NOLLAIG20 --code=NOLLAIG20 --live
stripe promotion_codes create --coupon=YEAREND30 --code=YEAREND30 --live

echo "=== DONE! ==="
echo "All coupons created in LIVE mode"
