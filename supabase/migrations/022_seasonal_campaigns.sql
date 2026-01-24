-- Migration: Seasonal Marketing Campaigns for Ireland
-- Creates email templates, triggers, and campaigns for key Irish dates

-- ============================================
-- SEASONAL EMAIL TEMPLATES
-- ============================================

-- New Year Campaign
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'new-year-2026',
  'New Year 2026 Sale',
  '🎆 New Year, New Savings! {{discount_percent}}% Off VoiceFleet',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #2563eb;">Happy New Year from VoiceFleet! 🎆</h1>
<p>Start 2026 strong with an AI voice assistant that works 24/7.</p>
<p style="font-size: 24px; font-weight: bold; color: #16a34a;">Get {{discount_percent}}% OFF your first month!</p>
<p>Use code: <strong style="background: #fef3c7; padding: 8px 16px; border-radius: 4px;">{{discount_code}}</strong></p>
<p>New year resolution: Never miss another customer call.</p>
<a href="{{upgrade_url}}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Claim Your Discount</a>
<p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Offer valid until January 7, 2026</p>
</body></html>',
  'Happy New Year from VoiceFleet! Start 2026 with {{discount_percent}}% OFF. Use code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- Valentine's Day Campaign
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'valentines-2026',
  'Valentines Day 2026',
  '💕 Show Your Business Some Love - {{discount_percent}}% Off',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #dc2626;">Love Your Business This Valentine''s 💕</h1>
<p>Your customers will love you when you never miss their calls.</p>
<p style="font-size: 24px; font-weight: bold; color: #dc2626;">{{discount_percent}}% OFF - Because We ❤️ Our Customers</p>
<p>Use code: <strong style="background: #fce7f3; padding: 8px 16px; border-radius: 4px;">{{discount_code}}</strong></p>
<ul>
<li>24/7 AI receptionist</li>
<li>Never miss a booking</li>
<li>Happy customers, happy business</li>
</ul>
<a href="{{upgrade_url}}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Get Started with Love</a>
<p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Offer valid until February 16, 2026</p>
</body></html>',
  'Love your business this Valentine''s! {{discount_percent}}% OFF with code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- St. Brigid's Day Campaign (New Irish Bank Holiday)
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'st-brigids-2026',
  'St Brigids Day 2026',
  '☘️ St. Brigid''s Day Sale - {{discount_percent}}% Off',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #16a34a;">Happy St. Brigid''s Day! ☘️</h1>
<p>Celebrate Ireland''s newest bank holiday with savings on VoiceFleet.</p>
<p style="font-size: 24px; font-weight: bold; color: #16a34a;">{{discount_percent}}% OFF - Irish Business Special</p>
<p>Use code: <strong style="background: #dcfce7; padding: 8px 16px; border-radius: 4px;">{{discount_code}}</strong></p>
<p>Like St. Brigid, VoiceFleet is always there to help - 24/7.</p>
<a href="{{upgrade_url}}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Claim Your Irish Discount</a>
<p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Offer valid until February 4, 2026</p>
</body></html>',
  'Happy St. Brigid''s Day! {{discount_percent}}% OFF with code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- St. Patrick's Day Campaign
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'st-patricks-2026',
  'St Patricks Day 2026',
  '🍀 Lucky You! {{discount_percent}}% Off for St. Patrick''s Day',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #16a34a;">Lá Fhéile Pádraig Sona Duit! 🍀</h1>
<p style="font-size: 18px;">Happy St. Patrick''s Day from VoiceFleet!</p>
<p style="font-size: 24px; font-weight: bold; color: #16a34a;">You''re in luck! {{discount_percent}}% OFF</p>
<p>Use code: <strong style="background: #dcfce7; padding: 8px 16px; border-radius: 4px; font-size: 18px;">{{discount_code}}</strong></p>
<p>🍀 No need to find a four-leaf clover - this discount is guaranteed!</p>
<p>Give your business the luck of the Irish with 24/7 AI call handling.</p>
<a href="{{upgrade_url}}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Get Lucky Now</a>
<p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Sláinte! Offer valid until March 20, 2026</p>
</body></html>',
  'Lá Fhéile Pádraig Sona Duit! {{discount_percent}}% OFF with code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- Easter Campaign
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'easter-2026',
  'Easter 2026 Sale',
  '🐣 Easter Sale! {{discount_percent}}% Off VoiceFleet',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #eab308;">Happy Easter! 🐣</h1>
<p>Spring into savings with VoiceFleet!</p>
<p style="font-size: 24px; font-weight: bold; color: #eab308;">Egg-cellent Deal: {{discount_percent}}% OFF</p>
<p>Use code: <strong style="background: #fef9c3; padding: 8px 16px; border-radius: 4px;">{{discount_code}}</strong></p>
<p>Don''t put all your eggs in one basket - let AI handle your calls while you enjoy the long weekend!</p>
<a href="{{upgrade_url}}" style="display: inline-block; background: #eab308; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Hop To It!</a>
<p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Offer valid until April 8, 2026</p>
</body></html>',
  'Happy Easter! {{discount_percent}}% OFF with code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- Summer Bank Holiday Campaign
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'summer-2026',
  'Summer Bank Holiday 2026',
  '☀️ Summer Sale! {{discount_percent}}% Off - Enjoy Your Holiday',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #f97316;">Summer Bank Holiday Sale! ☀️</h1>
<p>Take a break - VoiceFleet has your calls covered.</p>
<p style="font-size: 24px; font-weight: bold; color: #f97316;">{{discount_percent}}% OFF Summer Special</p>
<p>Use code: <strong style="background: #ffedd5; padding: 8px 16px; border-radius: 4px;">{{discount_code}}</strong></p>
<p>Whether you''re at the beach or the pub, never miss a customer call.</p>
<a href="{{upgrade_url}}" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Get Summer Savings</a>
<p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Offer valid for the bank holiday weekend</p>
</body></html>',
  'Summer Bank Holiday Sale! {{discount_percent}}% OFF with code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- Halloween Campaign
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'halloween-2026',
  'Halloween 2026 Sale',
  '🎃 Spooktacular Deal! {{discount_percent}}% Off - Don''t Be Scared',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1f2937; color: white;">
<h1 style="color: #f97316;">Spooktacular Halloween Sale! 🎃</h1>
<p>Don''t let missed calls haunt your business!</p>
<p style="font-size: 24px; font-weight: bold; color: #f97316;">{{discount_percent}}% OFF - Scary Good Deal!</p>
<p>Use code: <strong style="background: #431407; padding: 8px 16px; border-radius: 4px; color: #f97316;">{{discount_code}}</strong></p>
<p>👻 The only thing scary is missing customer calls. VoiceFleet handles them 24/7!</p>
<a href="{{upgrade_url}}" style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Get This Treat!</a>
<p style="margin-top: 24px; color: #9ca3af; font-size: 12px;">Offer valid until November 1, 2026</p>
</body></html>',
  'Spooktacular Halloween Deal! {{discount_percent}}% OFF with code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- Black Friday Campaign
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'black-friday-2026',
  'Black Friday 2026',
  '🖤 BLACK FRIDAY: {{discount_percent}}% OFF - Biggest Sale of the Year!',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #000; color: white;">
<h1 style="color: #fff; font-size: 32px;">⚡ BLACK FRIDAY SALE ⚡</h1>
<p style="font-size: 48px; font-weight: bold; color: #fbbf24;">{{discount_percent}}% OFF</p>
<p style="font-size: 18px;">Our BIGGEST discount of the year!</p>
<p>Use code: <strong style="background: #fbbf24; padding: 12px 24px; border-radius: 4px; color: #000; font-size: 20px;">{{discount_code}}</strong></p>
<p style="margin-top: 20px;">✓ 24/7 AI Voice Assistant<br/>✓ Never Miss a Call<br/>✓ Save 80% vs Human Receptionists</p>
<a href="{{upgrade_url}}" style="display: inline-block; background: #fbbf24; color: #000; padding: 16px 32px; text-decoration: none; border-radius: 6px; margin-top: 16px; font-weight: bold; font-size: 18px;">CLAIM YOUR DEAL</a>
<p style="margin-top: 24px; color: #9ca3af; font-size: 12px;">⏰ Limited time only - Ends Cyber Monday!</p>
</body></html>',
  'BLACK FRIDAY SALE! {{discount_percent}}% OFF - Our biggest deal of the year! Use code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- Cyber Monday Campaign
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'cyber-monday-2026',
  'Cyber Monday 2026',
  '💻 CYBER MONDAY: {{discount_percent}}% OFF - Last Chance!',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1e3a5f; color: white;">
<h1 style="color: #00d4ff; font-size: 32px;">💻 CYBER MONDAY 💻</h1>
<p style="font-size: 48px; font-weight: bold; color: #00d4ff;">{{discount_percent}}% OFF</p>
<p style="font-size: 18px;">FINAL HOURS of our Black Friday weekend!</p>
<p>Use code: <strong style="background: #00d4ff; padding: 12px 24px; border-radius: 4px; color: #000; font-size: 20px;">{{discount_code}}</strong></p>
<p style="margin-top: 20px;">🚀 Upgrade your business to AI-powered calls TODAY</p>
<a href="{{upgrade_url}}" style="display: inline-block; background: #00d4ff; color: #000; padding: 16px 32px; text-decoration: none; border-radius: 6px; margin-top: 16px; font-weight: bold; font-size: 18px;">LAST CHANCE!</a>
<p style="margin-top: 24px; color: #9ca3af; font-size: 12px;">⏰ Offer ends midnight!</p>
</body></html>',
  'CYBER MONDAY - LAST CHANCE! {{discount_percent}}% OFF with code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- Christmas Campaign
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category, is_active)
VALUES (
  'christmas-2026',
  'Christmas 2026 Sale',
  '🎄 Christmas Gift: {{discount_percent}}% Off VoiceFleet!',
  '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<h1 style="color: #dc2626;">Nollaig Shona Duit! 🎄</h1>
<p style="font-size: 18px;">Merry Christmas from the VoiceFleet team!</p>
<p style="font-size: 24px; font-weight: bold; color: #16a34a;">Our gift to you: {{discount_percent}}% OFF</p>
<p>Use code: <strong style="background: #dcfce7; padding: 8px 16px; border-radius: 4px; color: #dc2626;">{{discount_code}}</strong></p>
<p>🎁 Give your business the gift of 24/7 availability this Christmas.</p>
<p>Enjoy the holidays while VoiceFleet handles your calls!</p>
<a href="{{upgrade_url}}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Unwrap Your Savings</a>
<p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Nollaig faoi shéan agus faoi mhaise duit! Offer valid until December 31, 2026</p>
</body></html>',
  'Nollaig Shona! Merry Christmas! {{discount_percent}}% OFF with code {{discount_code}}. Visit {{upgrade_url}}',
  ARRAY['discount_percent', 'discount_code', 'upgrade_url', 'first_name'],
  'seasonal',
  true
) ON CONFLICT (id) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  updated_at = NOW();

-- ============================================
-- SEASONAL CAMPAIGNS (Pre-configured, status=draft)
-- ============================================

-- New Year Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-new-year-2026',
  'New Year 2026 Sale',
  'New Year promotion - 20% off for all users',
  'new-year-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": true}',
  '2026-01-01 09:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- Valentine's Day Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-valentines-2026',
  'Valentines Day 2026',
  'Valentine''s Day promotion - 15% off',
  'valentines-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": true}',
  '2026-02-12 09:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- St. Brigid's Day Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-st-brigids-2026',
  'St Brigids Day 2026',
  'St. Brigid''s Day promotion - 15% off for Irish businesses',
  'st-brigids-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": false}',
  '2026-01-31 09:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- St. Patrick's Day Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-st-patricks-2026',
  'St Patricks Day 2026',
  'St. Patrick''s Day promotion - 25% off - biggest Irish holiday!',
  'st-patricks-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": true}',
  '2026-03-15 09:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- Easter Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-easter-2026',
  'Easter 2026 Sale',
  'Easter long weekend promotion - 20% off',
  'easter-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": true}',
  '2026-04-02 09:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- Summer Bank Holiday Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-summer-2026',
  'Summer Bank Holiday 2026',
  'August Bank Holiday promotion - 15% off',
  'summer-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": false}',
  '2026-07-31 09:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- Halloween Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-halloween-2026',
  'Halloween 2026 Sale',
  'Halloween promotion - 20% off - spooky savings!',
  'halloween-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": true}',
  '2026-10-29 09:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- Black Friday Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-black-friday-2026',
  'Black Friday 2026',
  'Black Friday - BIGGEST sale of the year - 35% off!',
  'black-friday-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": true}',
  '2026-11-27 06:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- Cyber Monday Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-cyber-monday-2026',
  'Cyber Monday 2026',
  'Cyber Monday - Last chance for Black Friday prices - 30% off',
  'cyber-monday-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": true}',
  '2026-11-30 06:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- Christmas Campaign
INSERT INTO email_campaigns (id, name, description, template_id, subject_override, segment_json, scheduled_at, status)
VALUES (
  'campaign-christmas-2026',
  'Christmas 2026 Sale',
  'Christmas promotion - 25% off - holiday gift!',
  'christmas-2026',
  NULL,
  '{"includeFreePlan": true, "includeInactive": true}',
  '2026-12-20 09:00:00+00',
  'draft'
) ON CONFLICT (id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  updated_at = NOW();

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
  template_count INT;
  campaign_count INT;
BEGIN
  SELECT COUNT(*) INTO template_count FROM email_templates WHERE category = 'seasonal';
  SELECT COUNT(*) INTO campaign_count FROM email_campaigns WHERE id LIKE 'campaign-%2026';

  RAISE NOTICE 'Seasonal templates created: %', template_count;
  RAISE NOTICE 'Seasonal campaigns created: %', campaign_count;
END $$;
