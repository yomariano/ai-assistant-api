-- Migration: Blog generation system
-- Description: Creates tables for blog topic seeds and generation history

-- Blog Topic Seeds Table
-- Stores topic themes for AI blog post generation
CREATE TABLE IF NOT EXISTS blog_topic_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL,            -- 'industry-insights', 'how-to', 'case-studies', etc.
  topic_theme VARCHAR(255) NOT NULL,         -- e.g., "AI Voice Agents in Healthcare"
  keywords TEXT[] DEFAULT '{}',              -- SEO keywords to include
  target_audience VARCHAR(255),              -- e.g., "Restaurant owners in Ireland"
  content_angle VARCHAR(255),                -- e.g., "Cost savings focus"
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  last_generated_at TIMESTAMPTZ,
  generation_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blog Generation History Table
-- Tracks generated posts to avoid duplicates and track performance
CREATE TABLE IF NOT EXISTS blog_generation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_seed_id UUID REFERENCES blog_topic_seeds(id) ON DELETE SET NULL,
  blog_post_id UUID REFERENCES blog_posts(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  title_hash VARCHAR(64) NOT NULL,           -- MD5 hash for duplicate detection
  generation_time_ms INTEGER,
  prompt_length INTEGER,
  response_length INTEGER,
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'validation_error')),
  error_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for blog topic seeds
CREATE INDEX IF NOT EXISTS idx_blog_topic_seeds_category ON blog_topic_seeds(category);
CREATE INDEX IF NOT EXISTS idx_blog_topic_seeds_priority ON blog_topic_seeds(priority);
CREATE INDEX IF NOT EXISTS idx_blog_topic_seeds_active ON blog_topic_seeds(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_blog_topic_seeds_last_generated ON blog_topic_seeds(last_generated_at);

-- Indexes for blog generation history
CREATE INDEX IF NOT EXISTS idx_blog_gen_history_topic ON blog_generation_history(topic_seed_id);
CREATE INDEX IF NOT EXISTS idx_blog_gen_history_post ON blog_generation_history(blog_post_id);
CREATE INDEX IF NOT EXISTS idx_blog_gen_history_hash ON blog_generation_history(title_hash);
CREATE INDEX IF NOT EXISTS idx_blog_gen_history_created ON blog_generation_history(created_at DESC);

-- Updated at trigger for blog_topic_seeds
DROP TRIGGER IF EXISTS update_blog_topic_seeds_updated_at ON blog_topic_seeds;
CREATE TRIGGER update_blog_topic_seeds_updated_at
    BEFORE UPDATE ON blog_topic_seeds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE blog_topic_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_generation_history ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to blog topic seeds"
    ON blog_topic_seeds FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to blog generation history"
    ON blog_generation_history FOR ALL
    USING (auth.role() = 'service_role');

-- Seed initial blog topics (14 pre-configured)
INSERT INTO blog_topic_seeds (category, topic_theme, keywords, target_audience, content_angle, priority) VALUES
-- Priority 1: Industry insights (most valuable for SEO)
('industry-insights', 'AI Voice Agents Transforming Healthcare Phone Systems',
 ARRAY['AI voice agent healthcare', 'medical appointment booking', 'healthcare automation Ireland'],
 'Healthcare providers, dental practices, clinics',
 'Focus on patient experience and missed appointment reduction',
 1),

('industry-insights', 'How Irish Restaurants Are Automating Reservation Calls',
 ARRAY['restaurant AI phone', 'reservation automation', 'Irish restaurant technology'],
 'Restaurant owners in Ireland',
 'Case study style with ROI metrics',
 1),

('industry-insights', 'The Future of Small Business Phone Systems in Ireland',
 ARRAY['SMB phone automation', 'Irish business technology', 'voice AI Ireland'],
 'Irish SMB owners across industries',
 'Trend analysis and practical adoption guide',
 1),

-- Priority 2: How-to guides
('how-to', 'Setting Up 24/7 Phone Coverage Without Hiring Staff',
 ARRAY['24/7 phone answering', 'after hours call handling', 'automated receptionist'],
 'Service businesses with after-hours calls',
 'Step-by-step implementation guide',
 2),

('how-to', 'Reducing No-Shows with Automated Appointment Reminders',
 ARRAY['appointment reminder system', 'reduce no-shows', 'booking confirmation automation'],
 'Appointment-based businesses',
 'Data-driven approach with statistics',
 2),

('how-to', 'Integrating AI Voice Agents with Your Booking System',
 ARRAY['booking system integration', 'calendar sync AI', 'automated scheduling'],
 'Technical decision makers',
 'Integration-focused with technical details',
 2),

-- Priority 2: Cost analysis
('cost-analysis', 'The True Cost of Missed Calls for Irish Businesses',
 ARRAY['missed call cost', 'phone call ROI', 'business phone statistics'],
 'Business owners concerned about lost revenue',
 'Data-heavy with Irish-specific statistics',
 2),

('cost-analysis', 'AI Voice Agent vs Human Receptionist: A Cost Comparison',
 ARRAY['receptionist cost comparison', 'AI vs human answering', 'phone automation savings'],
 'Businesses evaluating phone solutions',
 'Objective comparison with total cost of ownership',
 2),

-- Priority 2: Case studies
('case-studies', 'How a Dublin Dental Practice Reduced Missed Calls by 80%',
 ARRAY['dental practice automation', 'Dublin dentist technology', 'appointment booking AI'],
 'Dental practices in Ireland',
 'Narrative case study with metrics',
 2),

('case-studies', 'From 40% to 5%: A Salon''s Journey to Eliminating No-Shows',
 ARRAY['salon no-show solution', 'beauty business automation', 'appointment confirmation'],
 'Salon and beauty business owners',
 'Before/after transformation story',
 2),

-- Priority 3: Product features
('product-features', 'Understanding Natural Language Processing in Voice AI',
 ARRAY['NLP voice AI', 'conversational AI technology', 'voice assistant technology'],
 'Tech-curious business owners',
 'Educational with practical applications',
 3),

('product-features', 'Multi-Language Support: Serving Diverse Customer Bases',
 ARRAY['multilingual voice AI', 'language support phone', 'international business calls'],
 'Businesses serving diverse populations',
 'Feature explanation with use cases',
 3),

-- Priority 3: Trends
('trends', 'Voice AI Adoption Trends in Irish SMBs: 2024-2026',
 ARRAY['voice AI trends Ireland', 'SMB technology adoption', 'Irish business automation'],
 'Business strategists and owners',
 'Research-based trend analysis',
 3),

('trends', 'The Rise of Conversational AI in Customer Service',
 ARRAY['conversational AI customer service', 'AI customer experience', 'voice AI trends'],
 'Customer experience professionals',
 'Industry overview with predictions',
 3);

-- Comment for documentation
COMMENT ON TABLE blog_topic_seeds IS 'Seed topics for AI blog post generation. Priority 1 = highest value, generated first.';
COMMENT ON TABLE blog_generation_history IS 'Tracks all blog generation attempts for deduplication and monitoring.';
