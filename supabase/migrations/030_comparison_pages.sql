-- Migration: Comparison pages system
-- Description: Creates tables for comparison pages and alternatives, migrates existing static data

-- Comparison Pages Table
-- Stores VoiceFleet vs X comparison content
CREATE TABLE IF NOT EXISTS comparison_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,              -- e.g., "voicefleet-vs-voicemail"
  alternative_name VARCHAR(100) NOT NULL,         -- e.g., "Voicemail"
  alternative_slug VARCHAR(100) NOT NULL,         -- e.g., "voicemail"

  -- Page content
  title VARCHAR(150) NOT NULL,                    -- Page title for listings
  description TEXT,                               -- Short description for listings
  hero_title VARCHAR(200) NOT NULL,
  hero_subtitle TEXT,

  -- Comparison content (JSONB for flexibility)
  who_this_is_for TEXT[] DEFAULT '{}',            -- Industries/business types
  quick_take JSONB DEFAULT '[]'::jsonb,           -- [{label, value}]
  when_voicefleet_wins TEXT[] DEFAULT '{}',
  when_alternative_wins TEXT[] DEFAULT '{}',
  feature_comparison JSONB DEFAULT '[]'::jsonb,   -- [{feature, voicefleet, alternative, winner}]
  faq JSONB DEFAULT '[]'::jsonb,                  -- [{question, answer}]

  -- Additional content sections
  detailed_comparison TEXT,                       -- Markdown content
  pricing_comparison JSONB,                       -- Pricing details if applicable
  integration_notes TEXT,

  -- SEO Fields
  meta_title VARCHAR(70),
  meta_description VARCHAR(160),
  og_image_url TEXT,
  canonical_url TEXT,

  -- Status and timestamps
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comparison Alternatives Table
-- Seed data for alternatives to compare against
CREATE TABLE IF NOT EXISTS comparison_alternatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,              -- e.g., "voicemail"
  name VARCHAR(100) NOT NULL,                     -- e.g., "Voicemail"
  alternative_type VARCHAR(50) NOT NULL,          -- 'traditional', 'competitor', 'service-category'
  description TEXT,                               -- Brief description of the alternative
  key_features TEXT[] DEFAULT '{}',               -- Main features for comparison
  typical_pricing VARCHAR(255),                   -- Pricing range info
  website_url TEXT,                               -- Official website if competitor
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  is_active BOOLEAN DEFAULT TRUE,
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for comparison pages
CREATE INDEX IF NOT EXISTS idx_comparison_pages_slug ON comparison_pages(slug);
CREATE INDEX IF NOT EXISTS idx_comparison_pages_status ON comparison_pages(status);
CREATE INDEX IF NOT EXISTS idx_comparison_pages_alternative ON comparison_pages(alternative_slug);
CREATE INDEX IF NOT EXISTS idx_comparison_pages_published_at ON comparison_pages(published_at DESC);

-- Indexes for comparison alternatives
CREATE INDEX IF NOT EXISTS idx_comparison_alternatives_slug ON comparison_alternatives(slug);
CREATE INDEX IF NOT EXISTS idx_comparison_alternatives_type ON comparison_alternatives(alternative_type);
CREATE INDEX IF NOT EXISTS idx_comparison_alternatives_priority ON comparison_alternatives(priority);
CREATE INDEX IF NOT EXISTS idx_comparison_alternatives_active ON comparison_alternatives(is_active) WHERE is_active = TRUE;

-- Updated at triggers
DROP TRIGGER IF EXISTS update_comparison_pages_updated_at ON comparison_pages;
CREATE TRIGGER update_comparison_pages_updated_at
    BEFORE UPDATE ON comparison_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_comparison_alternatives_updated_at ON comparison_alternatives;
CREATE TRIGGER update_comparison_alternatives_updated_at
    BEFORE UPDATE ON comparison_alternatives
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE comparison_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_alternatives ENABLE ROW LEVEL SECURITY;

-- Public read policy for published comparison pages
CREATE POLICY "Public can read published comparison pages"
    ON comparison_pages FOR SELECT
    USING (status = 'published');

-- Service role full access
CREATE POLICY "Service role full access to comparison pages"
    ON comparison_pages FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to comparison alternatives"
    ON comparison_alternatives FOR ALL
    USING (auth.role() = 'service_role');

-- Migrate existing 3 static comparisons to database
INSERT INTO comparison_pages (
  slug, alternative_name, alternative_slug, title, description, hero_title, hero_subtitle,
  who_this_is_for, quick_take, when_voicefleet_wins, when_alternative_wins, faq,
  meta_title, meta_description, status, published_at
) VALUES
-- VoiceFleet vs Voicemail
(
  'voicefleet-vs-voicemail',
  'Voicemail',
  'voicemail',
  'VoiceFleet vs Voicemail',
  'Compare VoiceFleet (AI voice receptionist) vs voicemail for missed calls, bookings, and customer experience. See which fits your business best.',
  'VoiceFleet vs Voicemail: stop losing bookings to missed calls',
  'Voicemail records messages. VoiceFleet answers, qualifies the caller, and books appointments or captures structured details automatically.',
  ARRAY['restaurants', 'dentists', 'plumbers', 'gyms', 'clinics'],
  '[{"label": "Best if you want", "value": "Calls handled, not just recorded"}, {"label": "Customer experience", "value": "Live conversation vs beep-and-wait"}, {"label": "Outcome", "value": "Bookings + summaries vs callbacks"}]'::jsonb,
  ARRAY['You miss calls during busy periods or after hours', 'You want bookings/appointments created automatically', 'You want consistent intake data (name, reason, urgency, address)'],
  ARRAY['You receive very few calls and can always call back quickly', 'Your calls are highly sensitive and you only want humans to respond'],
  '[{"question": "Is voicemail enough for booking-based businesses?", "answer": "If you rely on bookings, voicemail can create delays and drop-offs. VoiceFleet is designed to capture intent and complete the next step during the call."}, {"question": "What happens when the AI can''t help?", "answer": "You can configure escalation: transfer to staff, take a detailed message, or request a callback with an urgent flag."}]'::jsonb,
  'VoiceFleet vs Voicemail - AI Phone Receptionist',
  'Compare VoiceFleet AI voice receptionist with traditional voicemail. See which fits your business phone needs.',
  'published',
  NOW()
),

-- VoiceFleet vs Answering Service
(
  'voicefleet-vs-answering-service',
  'Answering Service',
  'answering-service',
  'VoiceFleet vs Answering Service',
  'Compare VoiceFleet vs a traditional answering service for SMB phone coverage, intake quality, and booking workflows.',
  'VoiceFleet vs Answering Service: automation vs message taking',
  'Answering services typically take messages. VoiceFleet can qualify calls, handle FAQs, and book appointments into your calendar/booking system.',
  ARRAY['dentists', 'clinics', 'plumbers', 'salons', 'gyms'],
  '[{"label": "Best if you want", "value": "Automated bookings and structured intake"}, {"label": "Setup", "value": "Forward calls + configure flows"}, {"label": "Scale", "value": "Consistent handling across peak volume"}]'::jsonb,
  ARRAY['You want repeatable, configurable call handling (not variable agents)', 'You want bookings created automatically (calendar/booking integrations)', 'You want instant summaries and analytics'],
  ARRAY['You need fully human-only handling for complex, bespoke calls', 'You require niche domain judgement on every call'],
  '[{"question": "Can VoiceFleet replace an answering service?", "answer": "For many SMBs, yes - especially when the main job is bookings, FAQs, intake, and routing. For complex cases, you can escalate to staff."}, {"question": "Will callers know it''s AI?", "answer": "You control how the receptionist introduces itself. The focus is a helpful, professional experience and getting the caller to the right outcome quickly."}]'::jsonb,
  'VoiceFleet vs Answering Service - Compare Options',
  'Compare VoiceFleet AI voice agent with traditional answering services for your business phone coverage.',
  'published',
  NOW()
),

-- VoiceFleet vs Call Center
(
  'voicefleet-vs-call-center',
  'Call Center',
  'call-center',
  'VoiceFleet vs Call Center',
  'Compare VoiceFleet vs a call center for customer calls, appointment scheduling, and after-hours coverage for SMBs.',
  'VoiceFleet vs Call Center: the SMB-first phone stack',
  'Call centers can be effective but often require training, scripts, and ongoing management. VoiceFleet offers configurable automation and escalation for SMB workflows.',
  ARRAY['restaurants', 'home-services', 'clinics', 'gyms'],
  '[{"label": "Best if you want", "value": "Always-on coverage without headcount"}, {"label": "Consistency", "value": "Same playbook on every call"}, {"label": "Workflow", "value": "Bookings + summaries + integrations"}]'::jsonb,
  ARRAY['You want fast setup and consistent handling without staffing schedules', 'You want integrations (calendar/booking) to reduce manual work', 'You want analytics on call reasons and peak times'],
  ARRAY['You need large teams handling complex, multi-step support processes', 'Your business requires multi-agent handoffs inside each call'],
  '[{"question": "Is VoiceFleet only for big companies?", "answer": "No. VoiceFleet is built for SMBs that want reliable phone coverage and a simple setup: forward calls, connect a calendar/booking system, and configure rules."}]'::jsonb,
  'VoiceFleet vs Call Center - SMB Phone Solutions',
  'Compare VoiceFleet AI voice agent with call centers for SMB customer service and appointment scheduling.',
  'published',
  NOW()
);

-- Seed comparison alternatives (16 total)
INSERT INTO comparison_alternatives (slug, name, alternative_type, description, key_features, typical_pricing, priority) VALUES
-- Traditional alternatives (Priority 1-2)
('voicemail', 'Voicemail', 'traditional',
 'Standard voicemail systems that record messages for later retrieval.',
 ARRAY['Message recording', 'Voicemail-to-email', 'Basic transcription'],
 'Free with phone service',
 1),

('answering-service', 'Answering Service', 'traditional',
 'Human-operated call answering services that take messages and route calls.',
 ARRAY['Live operators', 'Message taking', 'Basic call routing', 'After-hours coverage'],
 '€100-500/month',
 1),

('call-center', 'Call Center', 'traditional',
 'Full-service call centers with trained agents handling customer interactions.',
 ARRAY['Trained agents', 'Script-based handling', 'Multi-channel support', 'Reporting'],
 '€500-5000+/month',
 1),

('human-receptionist', 'Human Receptionist', 'traditional',
 'In-house or virtual receptionist handling calls during business hours.',
 ARRAY['Personal touch', 'Complex problem solving', 'Multi-tasking', 'Office presence'],
 '€25,000-40,000/year',
 2),

('ivr-systems', 'IVR Systems', 'traditional',
 'Interactive Voice Response systems with menu-based call routing.',
 ARRAY['Menu navigation', 'Call routing', 'Basic self-service', 'Hold music'],
 '€50-200/month',
 2),

-- Competitors (Priority 2-3)
('dialpad-ai', 'Dialpad AI', 'competitor',
 'AI-powered business phone system with voice intelligence features.',
 ARRAY['AI transcription', 'Sentiment analysis', 'Call coaching', 'UCaaS platform'],
 '€15-25/user/month',
 2),

('air-ai', 'Air.ai', 'competitor',
 'AI phone agent platform for automated conversations.',
 ARRAY['Autonomous AI calls', 'Natural conversations', 'CRM integration'],
 'Usage-based pricing',
 2),

('bland-ai', 'Bland AI', 'competitor',
 'AI phone calling platform for automated outbound and inbound calls.',
 ARRAY['API-first', 'Custom voices', 'Workflow automation'],
 'Per-minute pricing',
 3),

('smith-ai', 'Smith.ai', 'competitor',
 'Virtual receptionist service combining AI and human agents.',
 ARRAY['Live receptionists', 'AI assistance', 'Lead qualification', 'Appointment booking'],
 '€200-1000/month',
 2),

('ruby-receptionist', 'Ruby Receptionist', 'competitor',
 'US-based live virtual receptionist service.',
 ARRAY['Live receptionists', 'Call handling', 'Message delivery', 'Mobile app'],
 '€200-600/month',
 3),

('abby-connect', 'Abby Connect', 'competitor',
 'Dedicated receptionist teams for small businesses.',
 ARRAY['Dedicated team', 'Bilingual support', 'Custom scripting'],
 '€300-900/month',
 3),

('vonage-ai', 'Vonage AI', 'competitor',
 'Enterprise communication platform with AI virtual agents.',
 ARRAY['Virtual agents', 'APIs', 'Video', 'Global coverage'],
 'Custom pricing',
 3),

('twilio-flex', 'Twilio Flex', 'competitor',
 'Programmable contact center platform for custom solutions.',
 ARRAY['Fully customizable', 'Developer-focused', 'Omnichannel', 'APIs'],
 '€1/active user hour',
 3),

-- Service categories (Priority 3)
('chatbots', 'Chatbots', 'service-category',
 'Text-based chat automation for websites and messaging apps.',
 ARRAY['24/7 availability', 'Instant responses', 'Multi-language', 'Integration options'],
 '€0-500/month',
 3),

('email-only-support', 'Email-Only Support', 'service-category',
 'Handling customer inquiries exclusively through email.',
 ARRAY['Asynchronous', 'Documentation trail', 'Scalable', 'Lower cost'],
 'Staff time cost',
 3),

('ignoring-missed-calls', 'Ignoring Missed Calls', 'service-category',
 'The default approach of not addressing missed calls systematically.',
 ARRAY['Zero cost', 'No setup', 'Lost revenue'],
 'Free (but costly)',
 3);

-- Add comparison type to content_generation_queue if it doesn't exist
-- (Check the enum or column values - the queue manager can handle new content types)
-- This is handled in queueManager.js, no schema change needed for varchar/text content_type

-- Comments for documentation
COMMENT ON TABLE comparison_pages IS 'VoiceFleet vs X comparison pages for SEO. Status published = visible on site.';
COMMENT ON TABLE comparison_alternatives IS 'Seed data for alternatives. Priority 1 = generate comparisons first.';
