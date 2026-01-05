-- ============================================
-- SEO Content Generation System
-- Migration: 008_seo_generation_tables.sql
-- ============================================
-- NOTE: location_pages and use_case_pages already exist in 002_content_tables.sql
-- This migration adds: seed data, generation queue, combo pages, and logs

-- Seed data for locations and industries (master list with priorities)
CREATE TABLE IF NOT EXISTS seo_seed_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type VARCHAR(50) NOT NULL CHECK (data_type IN ('location', 'industry')),
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  metadata JSONB DEFAULT '{}',  -- e.g., {"population": 1400000, "county": "Dublin"}
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 5,  -- 1=highest priority (generate first)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(data_type, slug)
);

-- Content generation queue
CREATE TABLE IF NOT EXISTS content_generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('location', 'industry', 'combo', 'blog')),
  location_slug VARCHAR(100),  -- NULL for industry-only pages
  industry_slug VARCHAR(100),  -- NULL for location-only pages
  priority INTEGER DEFAULT 5,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT,
  result_page_id UUID,  -- ID of generated page in target table
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(content_type, location_slug, industry_slug)
);

-- Combo pages (NEW: industry + location combinations)
-- URL pattern: /restaurants/dublin, /cafes/cork, etc.
CREATE TABLE IF NOT EXISTS combo_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(200) UNIQUE NOT NULL,  -- e.g., "restaurants-dublin"
  location_slug VARCHAR(100) NOT NULL,
  industry_slug VARCHAR(100) NOT NULL,
  city_name VARCHAR(100) NOT NULL,
  industry_name VARCHAR(100) NOT NULL,
  headline VARCHAR(150) NOT NULL,
  subheadline TEXT,
  hero_image_url TEXT,
  hero_image_alt VARCHAR(255),

  -- Structured content (JSON for flexibility)
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "intro": "...",
  --   "why_need": "...",
  --   "benefits": [...],
  --   "local_stats": {...},
  --   "case_study": {...},
  --   "faq": [...]
  -- }

  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- SEO Fields
  meta_title VARCHAR(70),
  meta_description VARCHAR(160),
  og_image_url TEXT,
  canonical_url TEXT,

  -- Internal linking
  related_locations TEXT[] DEFAULT '{}',
  related_industries TEXT[] DEFAULT '{}'
);

-- Generation logs for monitoring and debugging
CREATE TABLE IF NOT EXISTS content_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES content_generation_queue(id) ON DELETE SET NULL,
  content_type VARCHAR(50) NOT NULL,
  target_slug VARCHAR(200) NOT NULL,
  ai_model VARCHAR(50) DEFAULT 'haiku',
  prompt_length INTEGER,
  response_length INTEGER,
  generation_time_ms INTEGER,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'validation_error')),
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_seed_data_type ON seo_seed_data(data_type);
CREATE INDEX IF NOT EXISTS idx_seed_data_priority ON seo_seed_data(priority);
CREATE INDEX IF NOT EXISTS idx_seed_data_active ON seo_seed_data(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_queue_status ON content_generation_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON content_generation_queue(priority);
CREATE INDEX IF NOT EXISTS idx_queue_next_retry ON content_generation_queue(next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_queue_type ON content_generation_queue(content_type);

CREATE INDEX IF NOT EXISTS idx_combo_status ON combo_pages(status);
CREATE INDEX IF NOT EXISTS idx_combo_location ON combo_pages(location_slug);
CREATE INDEX IF NOT EXISTS idx_combo_industry ON combo_pages(industry_slug);

CREATE INDEX IF NOT EXISTS idx_gen_logs_date ON content_generation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_logs_status ON content_generation_logs(status);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE seo_seed_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_generation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_generation_logs ENABLE ROW LEVEL SECURITY;

-- Seed data: public read for active items
CREATE POLICY "Public can read active seed data" ON seo_seed_data
  FOR SELECT USING (is_active = TRUE);

-- Service role full access to seed data
CREATE POLICY "Service role manages seed data" ON seo_seed_data
  FOR ALL USING (auth.role() = 'service_role');

-- Queue: service role only (no public access)
CREATE POLICY "Service role manages queue" ON content_generation_queue
  FOR ALL USING (auth.role() = 'service_role');

-- Combo pages: public read for published
CREATE POLICY "Public can read published combo pages" ON combo_pages
  FOR SELECT USING (status = 'published');

CREATE POLICY "Service role manages combo pages" ON combo_pages
  FOR ALL USING (auth.role() = 'service_role');

-- Logs: service role only
CREATE POLICY "Service role manages logs" ON content_generation_logs
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- TRIGGERS (reusing update_updated_at_column from 002)
-- ============================================
DROP TRIGGER IF EXISTS update_combo_pages_updated_at ON combo_pages;
CREATE TRIGGER update_combo_pages_updated_at
  BEFORE UPDATE ON combo_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_queue_updated_at ON content_generation_queue;
CREATE TRIGGER update_queue_updated_at
  BEFORE UPDATE ON content_generation_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get next items to process from queue
CREATE OR REPLACE FUNCTION get_next_queue_items(p_limit INTEGER DEFAULT 5)
RETURNS SETOF content_generation_queue AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM content_generation_queue
  WHERE status IN ('pending', 'failed')
    AND next_retry_at <= NOW()
    AND attempts < max_attempts
  ORDER BY priority ASC, created_at ASC
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED;
END;
$$ LANGUAGE plpgsql;

-- Check if content already exists (avoid duplicates)
CREATE OR REPLACE FUNCTION content_exists(
  p_type VARCHAR,
  p_location VARCHAR DEFAULT NULL,
  p_industry VARCHAR DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  IF p_type = 'location' THEN
    RETURN EXISTS(SELECT 1 FROM location_pages WHERE slug = p_location AND status = 'published');
  ELSIF p_type = 'industry' THEN
    RETURN EXISTS(SELECT 1 FROM use_case_pages WHERE slug = p_industry AND status = 'published');
  ELSIF p_type = 'combo' THEN
    RETURN EXISTS(SELECT 1 FROM combo_pages WHERE location_slug = p_location AND industry_slug = p_industry AND status = 'published');
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED DATA: Irish Locations
-- ============================================

-- Tier 1: Major Cities (priority 1)
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('location', 'dublin', 'Dublin', 1, '{"county": "Dublin", "population": 1400000}'),
  ('location', 'cork', 'Cork', 1, '{"county": "Cork", "population": 210000}'),
  ('location', 'galway', 'Galway', 1, '{"county": "Galway", "population": 83000}'),
  ('location', 'limerick', 'Limerick', 1, '{"county": "Limerick", "population": 102000}'),
  ('location', 'waterford', 'Waterford', 1, '{"county": "Waterford", "population": 54000}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 2: Large Towns (priority 2)
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('location', 'drogheda', 'Drogheda', 2, '{"county": "Louth", "population": 44000}'),
  ('location', 'dundalk', 'Dundalk', 2, '{"county": "Louth", "population": 40000}'),
  ('location', 'swords', 'Swords', 2, '{"county": "Dublin", "population": 42000}'),
  ('location', 'bray', 'Bray', 2, '{"county": "Wicklow", "population": 35000}'),
  ('location', 'navan', 'Navan', 2, '{"county": "Meath", "population": 30000}'),
  ('location', 'kilkenny', 'Kilkenny', 2, '{"county": "Kilkenny", "population": 26000}'),
  ('location', 'ennis', 'Ennis', 2, '{"county": "Clare", "population": 27000}'),
  ('location', 'carlow', 'Carlow', 2, '{"county": "Carlow", "population": 25000}'),
  ('location', 'tralee', 'Tralee', 2, '{"county": "Kerry", "population": 24000}'),
  ('location', 'newbridge', 'Newbridge', 2, '{"county": "Kildare", "population": 24000}'),
  ('location', 'portlaoise', 'Portlaoise', 2, '{"county": "Laois", "population": 24000}'),
  ('location', 'mullingar', 'Mullingar', 2, '{"county": "Westmeath", "population": 22000}'),
  ('location', 'wexford', 'Wexford', 2, '{"county": "Wexford", "population": 20000}'),
  ('location', 'letterkenny', 'Letterkenny', 2, '{"county": "Donegal", "population": 20000}'),
  ('location', 'sligo', 'Sligo', 2, '{"county": "Sligo", "population": 20000}'),
  ('location', 'athlone', 'Athlone', 2, '{"county": "Westmeath", "population": 22000}'),
  ('location', 'celbridge', 'Celbridge', 2, '{"county": "Kildare", "population": 21000}'),
  ('location', 'clonmel', 'Clonmel', 2, '{"county": "Tipperary", "population": 18000}'),
  ('location', 'greystones', 'Greystones', 2, '{"county": "Wicklow", "population": 18000}'),
  ('location', 'malahide', 'Malahide', 2, '{"county": "Dublin", "population": 17000}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Medium Towns (priority 3)
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('location', 'killarney', 'Killarney', 3, '{"county": "Kerry", "population": 15000}'),
  ('location', 'naas', 'Naas', 3, '{"county": "Kildare", "population": 22000}'),
  ('location', 'maynooth', 'Maynooth', 3, '{"county": "Kildare", "population": 15000}'),
  ('location', 'cobh', 'Cobh', 3, '{"county": "Cork", "population": 13000}'),
  ('location', 'kinsale', 'Kinsale', 3, '{"county": "Cork", "population": 5500}'),
  ('location', 'westport', 'Westport', 3, '{"county": "Mayo", "population": 6500}'),
  ('location', 'castlebar', 'Castlebar', 3, '{"county": "Mayo", "population": 12000}'),
  ('location', 'cavan', 'Cavan', 3, '{"county": "Cavan", "population": 11000}'),
  ('location', 'monaghan', 'Monaghan', 3, '{"county": "Monaghan", "population": 8000}'),
  ('location', 'longford', 'Longford', 3, '{"county": "Longford", "population": 10000}'),
  ('location', 'roscommon', 'Roscommon', 3, '{"county": "Roscommon", "population": 6000}'),
  ('location', 'tullamore', 'Tullamore', 3, '{"county": "Offaly", "population": 15000}'),
  ('location', 'arklow', 'Arklow', 3, '{"county": "Wicklow", "population": 14000}'),
  ('location', 'wicklow', 'Wicklow', 3, '{"county": "Wicklow", "population": 11000}'),
  ('location', 'ashbourne', 'Ashbourne', 3, '{"county": "Meath", "population": 13000}'),
  ('location', 'trim', 'Trim', 3, '{"county": "Meath", "population": 10000}'),
  ('location', 'kells', 'Kells', 3, '{"county": "Meath", "population": 6500}'),
  ('location', 'dungarvan', 'Dungarvan', 3, '{"county": "Waterford", "population": 10000}'),
  ('location', 'shannon', 'Shannon', 3, '{"county": "Clare", "population": 10000}'),
  ('location', 'kenmare', 'Kenmare', 3, '{"county": "Kerry", "population": 2500}'),
  ('location', 'dingle', 'Dingle', 3, '{"county": "Kerry", "population": 2000}'),
  ('location', 'bantry', 'Bantry', 3, '{"county": "Cork", "population": 3500}'),
  ('location', 'skibbereen', 'Skibbereen', 3, '{"county": "Cork", "population": 2800}'),
  ('location', 'clonakilty', 'Clonakilty', 3, '{"county": "Cork", "population": 5000}'),
  ('location', 'midleton', 'Midleton', 3, '{"county": "Cork", "population": 14000}'),
  ('location', 'mallow', 'Mallow', 3, '{"county": "Cork", "population": 13000}'),
  ('location', 'fermoy', 'Fermoy', 3, '{"county": "Cork", "population": 7000}'),
  ('location', 'youghal', 'Youghal', 3, '{"county": "Cork", "population": 8000}'),
  ('location', 'thurles', 'Thurles', 3, '{"county": "Tipperary", "population": 8000}'),
  ('location', 'nenagh', 'Nenagh', 3, '{"county": "Tipperary", "population": 9000}'),
  ('location', 'tipperary-town', 'Tipperary Town', 3, '{"county": "Tipperary", "population": 5000}'),
  ('location', 'enniscorthy', 'Enniscorthy', 3, '{"county": "Wexford", "population": 11000}'),
  ('location', 'gorey', 'Gorey', 3, '{"county": "Wexford", "population": 10000}'),
  ('location', 'new-ross', 'New Ross', 3, '{"county": "Wexford", "population": 8500}'),
  ('location', 'athy', 'Athy', 3, '{"county": "Kildare", "population": 10000}'),
  ('location', 'kildare-town', 'Kildare Town', 3, '{"county": "Kildare", "population": 9000}'),
  ('location', 'leixlip', 'Leixlip', 3, '{"county": "Kildare", "population": 16000}'),
  ('location', 'lucan', 'Lucan', 3, '{"county": "Dublin", "population": 40000}'),
  ('location', 'tallaght', 'Tallaght', 3, '{"county": "Dublin", "population": 80000}'),
  ('location', 'blanchardstown', 'Blanchardstown', 3, '{"county": "Dublin", "population": 70000}'),
  ('location', 'clondalkin', 'Clondalkin', 3, '{"county": "Dublin", "population": 50000}'),
  ('location', 'dun-laoghaire', 'Dun Laoghaire', 3, '{"county": "Dublin", "population": 25000}'),
  ('location', 'howth', 'Howth', 3, '{"county": "Dublin", "population": 9000}'),
  ('location', 'dalkey', 'Dalkey', 3, '{"county": "Dublin", "population": 9000}'),
  ('location', 'blackrock', 'Blackrock', 3, '{"county": "Dublin", "population": 10000}'),
  ('location', 'rathmines', 'Rathmines', 3, '{"county": "Dublin", "population": 15000}'),
  ('location', 'ranelagh', 'Ranelagh', 3, '{"county": "Dublin", "population": 12000}'),
  ('location', 'ballsbridge', 'Ballsbridge', 3, '{"county": "Dublin", "population": 8000}'),
  ('location', 'drumcondra', 'Drumcondra', 3, '{"county": "Dublin", "population": 15000}'),
  ('location', 'glasnevin', 'Glasnevin', 3, '{"county": "Dublin", "population": 20000}'),
  ('location', 'ballymun', 'Ballymun', 3, '{"county": "Dublin", "population": 18000}'),
  ('location', 'santry', 'Santry', 3, '{"county": "Dublin", "population": 10000}'),
  ('location', 'beaumont', 'Beaumont', 3, '{"county": "Dublin", "population": 12000}'),
  ('location', 'raheny', 'Raheny', 3, '{"county": "Dublin", "population": 14000}'),
  ('location', 'clontarf', 'Clontarf', 3, '{"county": "Dublin", "population": 20000}'),
  ('location', 'sutton', 'Sutton', 3, '{"county": "Dublin", "population": 7000}'),
  ('location', 'baldoyle', 'Baldoyle', 3, '{"county": "Dublin", "population": 12000}'),
  ('location', 'portmarnock', 'Portmarnock', 3, '{"county": "Dublin", "population": 10000}'),
  ('location', 'donabate', 'Donabate', 3, '{"county": "Dublin", "population": 8000}'),
  ('location', 'rush', 'Rush', 3, '{"county": "Dublin", "population": 10000}'),
  ('location', 'skerries', 'Skerries', 3, '{"county": "Dublin", "population": 12000}'),
  ('location', 'balbriggan', 'Balbriggan', 3, '{"county": "Dublin", "population": 25000}'),
  ('location', 'lusk', 'Lusk', 3, '{"county": "Dublin", "population": 8000}'),
  ('location', 'ashford', 'Ashford', 3, '{"county": "Wicklow", "population": 3000}'),
  ('location', 'rathdrum', 'Rathdrum', 3, '{"county": "Wicklow", "population": 2500}'),
  ('location', 'bundoran', 'Bundoran', 3, '{"county": "Donegal", "population": 2000}'),
  ('location', 'donegal-town', 'Donegal Town', 3, '{"county": "Donegal", "population": 3000}'),
  ('location', 'ballybofey', 'Ballybofey', 3, '{"county": "Donegal", "population": 5000}'),
  ('location', 'buncrana', 'Buncrana', 3, '{"county": "Donegal", "population": 7500}'),
  ('location', 'carrick-on-shannon', 'Carrick-on-Shannon', 3, '{"county": "Leitrim", "population": 4500}'),
  ('location', 'ballinasloe', 'Ballinasloe', 3, '{"county": "Galway", "population": 7000}'),
  ('location', 'tuam', 'Tuam', 3, '{"county": "Galway", "population": 9000}'),
  ('location', 'oranmore', 'Oranmore', 3, '{"county": "Galway", "population": 6000}'),
  ('location', 'salthill', 'Salthill', 3, '{"county": "Galway", "population": 12000}'),
  ('location', 'clifden', 'Clifden', 3, '{"county": "Galway", "population": 2500}'),
  ('location', 'ballina', 'Ballina', 3, '{"county": "Mayo", "population": 11000}'),
  ('location', 'belmullet', 'Belmullet', 3, '{"county": "Mayo", "population": 1200}'),
  ('location', 'birr', 'Birr', 3, '{"county": "Offaly", "population": 6000}'),
  ('location', 'edenderry', 'Edenderry', 3, '{"county": "Offaly", "population": 7500}'),
  ('location', 'kilrush', 'Kilrush', 3, '{"county": "Clare", "population": 2900}'),
  ('location', 'kildysart', 'Kildysart', 3, '{"county": "Clare", "population": 500}'),
  ('location', 'lahinch', 'Lahinch', 3, '{"county": "Clare", "population": 700}'),
  ('location', 'doolin', 'Doolin', 3, '{"county": "Clare", "population": 500}'),
  ('location', 'ennistymon', 'Ennistymon', 3, '{"county": "Clare", "population": 1500}'),
  ('location', 'kilkee', 'Kilkee', 3, '{"county": "Clare", "population": 1500}'),
  ('location', 'newmarket-on-fergus', 'Newmarket-on-Fergus', 3, '{"county": "Clare", "population": 2000}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- ============================================
-- SEED DATA: Industry Types
-- ============================================

-- Tier 1: High Volume (priority 1)
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'restaurants', 'Restaurants', 1, '{"type": "food-service", "avg_order": 25}'),
  ('industry', 'takeaways', 'Takeaways', 1, '{"type": "food-service", "avg_order": 18}'),
  ('industry', 'cafes', 'Cafes', 1, '{"type": "food-service", "avg_order": 12}'),
  ('industry', 'fast-food', 'Fast Food', 1, '{"type": "food-service", "avg_order": 15}'),
  ('industry', 'pizza-delivery', 'Pizza Delivery', 1, '{"type": "food-service", "avg_order": 22}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 2: Medium Volume (priority 2)
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'fine-dining', 'Fine Dining', 2, '{"type": "food-service", "avg_order": 75}'),
  ('industry', 'pubs', 'Pubs', 2, '{"type": "food-service", "avg_order": 20}'),
  ('industry', 'hotels', 'Hotels', 2, '{"type": "hospitality", "avg_order": 50}'),
  ('industry', 'bistros', 'Bistros', 2, '{"type": "food-service", "avg_order": 35}'),
  ('industry', 'delis', 'Delis', 2, '{"type": "food-service", "avg_order": 15}'),
  ('industry', 'chinese-restaurants', 'Chinese Restaurants', 2, '{"type": "food-service", "avg_order": 20}'),
  ('industry', 'indian-restaurants', 'Indian Restaurants', 2, '{"type": "food-service", "avg_order": 22}'),
  ('industry', 'italian-restaurants', 'Italian Restaurants', 2, '{"type": "food-service", "avg_order": 28}'),
  ('industry', 'fish-and-chips', 'Fish and Chips', 2, '{"type": "food-service", "avg_order": 14}')
ON CONFLICT (data_type, slug) DO NOTHING;

-- Tier 3: Niche (priority 3)
INSERT INTO seo_seed_data (data_type, slug, name, priority, metadata) VALUES
  ('industry', 'food-trucks', 'Food Trucks', 3, '{"type": "food-service", "avg_order": 12}'),
  ('industry', 'catering', 'Catering', 3, '{"type": "food-service", "avg_order": 500}'),
  ('industry', 'bakeries', 'Bakeries', 3, '{"type": "food-service", "avg_order": 10}'),
  ('industry', 'coffee-shops', 'Coffee Shops', 3, '{"type": "food-service", "avg_order": 8}'),
  ('industry', 'ice-cream-shops', 'Ice Cream Shops', 3, '{"type": "food-service", "avg_order": 7}'),
  ('industry', 'juice-bars', 'Juice Bars', 3, '{"type": "food-service", "avg_order": 10}'),
  ('industry', 'sushi-restaurants', 'Sushi Restaurants', 3, '{"type": "food-service", "avg_order": 30}'),
  ('industry', 'thai-restaurants', 'Thai Restaurants', 3, '{"type": "food-service", "avg_order": 25}'),
  ('industry', 'mexican-restaurants', 'Mexican Restaurants', 3, '{"type": "food-service", "avg_order": 22}'),
  ('industry', 'kebab-shops', 'Kebab Shops', 3, '{"type": "food-service", "avg_order": 12}'),
  ('industry', 'burger-joints', 'Burger Joints', 3, '{"type": "food-service", "avg_order": 15}'),
  ('industry', 'breakfast-cafes', 'Breakfast Cafes', 3, '{"type": "food-service", "avg_order": 14}'),
  ('industry', 'brunch-spots', 'Brunch Spots', 3, '{"type": "food-service", "avg_order": 20}'),
  ('industry', 'gastropubs', 'Gastropubs', 3, '{"type": "food-service", "avg_order": 35}'),
  ('industry', 'wine-bars', 'Wine Bars', 3, '{"type": "food-service", "avg_order": 40}')
ON CONFLICT (data_type, slug) DO NOTHING;
