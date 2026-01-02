-- Migration: Content tables for programmatic SEO
-- Description: Creates tables for blog posts, use case pages, location pages, and feature pages

-- Blog Posts Table
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  featured_image_url TEXT,
  featured_image_alt VARCHAR(255),
  author_name VARCHAR(100) DEFAULT 'ValidateCall Team',
  author_avatar_url TEXT,
  category VARCHAR(100),
  tags TEXT[],
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- SEO Fields
  meta_title VARCHAR(70),
  meta_description VARCHAR(160),
  og_image_url TEXT,
  canonical_url TEXT,
  no_index BOOLEAN DEFAULT FALSE
);

-- Blog Posts Indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);

-- Use Case Pages Table
CREATE TABLE IF NOT EXISTS use_case_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  industry_name VARCHAR(100) NOT NULL,
  headline VARCHAR(150) NOT NULL,
  subheadline TEXT,
  hero_image_url TEXT,
  hero_image_alt VARCHAR(255),
  problem_statement TEXT,
  solution_description TEXT,
  benefits JSONB DEFAULT '[]'::jsonb,
  use_cases JSONB DEFAULT '[]'::jsonb,
  testimonial JSONB,
  cta_text VARCHAR(100) DEFAULT 'Start Free Trial',
  cta_url VARCHAR(255) DEFAULT '/login',
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
  related_features TEXT[] DEFAULT '{}',
  related_locations TEXT[] DEFAULT '{}'
);

-- Use Case Pages Indexes
CREATE INDEX IF NOT EXISTS idx_use_case_pages_slug ON use_case_pages(slug);
CREATE INDEX IF NOT EXISTS idx_use_case_pages_status ON use_case_pages(status);

-- Location Pages Table
CREATE TABLE IF NOT EXISTS location_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  city_name VARCHAR(100) NOT NULL,
  state_code VARCHAR(10),
  country_code VARCHAR(10) DEFAULT 'US',
  headline VARCHAR(150) NOT NULL,
  subheadline TEXT,
  hero_image_url TEXT,
  hero_image_alt VARCHAR(255),
  local_description TEXT,
  local_benefits JSONB DEFAULT '[]'::jsonb,
  local_stats JSONB,
  local_testimonial JSONB,
  nearby_locations TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- SEO Fields
  meta_title VARCHAR(70),
  meta_description VARCHAR(160),
  og_image_url TEXT,
  canonical_url TEXT,

  -- Geo data for local SEO
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8)
);

-- Location Pages Indexes
CREATE INDEX IF NOT EXISTS idx_location_pages_slug ON location_pages(slug);
CREATE INDEX IF NOT EXISTS idx_location_pages_status ON location_pages(status);
CREATE INDEX IF NOT EXISTS idx_location_pages_state ON location_pages(state_code);

-- Feature Pages Table
CREATE TABLE IF NOT EXISTS feature_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  feature_name VARCHAR(100) NOT NULL,
  headline VARCHAR(150) NOT NULL,
  subheadline TEXT,
  hero_image_url TEXT,
  hero_image_alt VARCHAR(255),
  overview TEXT,
  how_it_works JSONB DEFAULT '[]'::jsonb,
  benefits JSONB DEFAULT '[]'::jsonb,
  technical_specs JSONB,
  comparison JSONB,
  faq JSONB DEFAULT '[]'::jsonb,
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
  related_features TEXT[] DEFAULT '{}',
  related_use_cases TEXT[] DEFAULT '{}'
);

-- Feature Pages Indexes
CREATE INDEX IF NOT EXISTS idx_feature_pages_slug ON feature_pages(slug);
CREATE INDEX IF NOT EXISTS idx_feature_pages_status ON feature_pages(status);

-- SEO Redirects Table
CREATE TABLE IF NOT EXISTS seo_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path VARCHAR(500) NOT NULL,
  destination_path VARCHAR(500) NOT NULL,
  redirect_type INTEGER DEFAULT 301 CHECK (redirect_type IN (301, 302)),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seo_redirects_source ON seo_redirects(source_path);
CREATE INDEX IF NOT EXISTS idx_seo_redirects_active ON seo_redirects(is_active) WHERE is_active = TRUE;

-- Updated at trigger function (reusable)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all content tables
DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts;
CREATE TRIGGER update_blog_posts_updated_at
    BEFORE UPDATE ON blog_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_use_case_pages_updated_at ON use_case_pages;
CREATE TRIGGER update_use_case_pages_updated_at
    BEFORE UPDATE ON use_case_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_location_pages_updated_at ON location_pages;
CREATE TRIGGER update_location_pages_updated_at
    BEFORE UPDATE ON location_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_feature_pages_updated_at ON feature_pages;
CREATE TRIGGER update_feature_pages_updated_at
    BEFORE UPDATE ON feature_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) for public read access
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE use_case_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_redirects ENABLE ROW LEVEL SECURITY;

-- Public read policy for published content
CREATE POLICY "Public can read published blog posts"
    ON blog_posts FOR SELECT
    USING (status = 'published');

CREATE POLICY "Public can read published use case pages"
    ON use_case_pages FOR SELECT
    USING (status = 'published');

CREATE POLICY "Public can read published location pages"
    ON location_pages FOR SELECT
    USING (status = 'published');

CREATE POLICY "Public can read published feature pages"
    ON feature_pages FOR SELECT
    USING (status = 'published');

CREATE POLICY "Public can read active redirects"
    ON seo_redirects FOR SELECT
    USING (is_active = TRUE);

-- Service role full access (for admin operations)
CREATE POLICY "Service role full access to blog posts"
    ON blog_posts FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to use case pages"
    ON use_case_pages FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to location pages"
    ON location_pages FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to feature pages"
    ON feature_pages FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to seo redirects"
    ON seo_redirects FOR ALL
    USING (auth.role() = 'service_role');
