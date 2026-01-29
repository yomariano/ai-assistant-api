const express = require('express');
const router = express.Router();
const { supabase } = require('../services/supabase');
const { blogContentGenerator, blogPublisher } = require('../services/blog');
const { comparisonGenerator } = require('../services/seo');
const { runBlogGenerationOnce, getJobStatus: getBlogJobStatus } = require('../jobs/blogGeneration');

const SITEMAP_CHUNK_SIZE = 1000;
const SITEMAP_MAX_ROWS_PER_TYPE = 50000;

async function fetchAllPublishedForSitemap({ table, select, orderBy, maxRows = SITEMAP_MAX_ROWS_PER_TYPE }) {
  const allRows = [];
  let offset = 0;

  while (offset < maxRows) {
    let query = supabase
      .from(table)
      .select(select)
      .eq('status', 'published');

    for (const order of orderBy) {
      query = query.order(order.column, { ascending: order.ascending });
    }

    const { data, error } = await query.range(offset, offset + SITEMAP_CHUNK_SIZE - 1);

    if (error) throw error;

    allRows.push(...(data || []));

    if (!data || data.length < SITEMAP_CHUNK_SIZE) {
      break;
    }

    offset += SITEMAP_CHUNK_SIZE;
  }

  return allRows;
}

// GET /api/content/blog - List all published blog posts
router.get('/blog', async (req, res) => {
  try {
    const { category, tag, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from('blog_posts')
      .select('id, slug, title, excerpt, featured_image_url, featured_image_alt, author_name, author_avatar_url, category, tags, published_at, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (category) {
      query = query.eq('category', category);
    }

    if (tag) {
      query = query.contains('tags', [tag]);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ error: { message: 'Failed to fetch blog posts' } });
  }
});

// GET /api/content/blog/related - Get related blog posts
router.get('/blog/related', async (req, res) => {
  try {
    const { exclude, category, limit = 3 } = req.query;

    let query = supabase
      .from('blog_posts')
      .select('id, slug, title, excerpt, featured_image_url, featured_image_alt, author_name, published_at')
      .eq('status', 'published')
      .limit(parseInt(limit));

    if (exclude) {
      query = query.neq('slug', exclude);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching related blog posts:', error);
    res.status(500).json({ error: { message: 'Failed to fetch related blog posts' } });
  }
});

// GET /api/content/blog/:slug - Get single blog post
router.get('/blog/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Blog post not found' } });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ error: { message: 'Failed to fetch blog post' } });
  }
});

// GET /api/content/use-cases - List all published use case pages
router.get('/use-cases', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('use_case_pages')
      .select('id, slug, industry_name, headline, subheadline, hero_image_url, published_at, updated_at')
      .eq('status', 'published')
      .order('industry_name', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching use case pages:', error);
    res.status(500).json({ error: { message: 'Failed to fetch use case pages' } });
  }
});

// GET /api/content/use-cases/:slug - Get single use case page
router.get('/use-cases/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const { data, error } = await supabase
      .from('use_case_pages')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Use case page not found' } });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching use case page:', error);
    res.status(500).json({ error: { message: 'Failed to fetch use case page' } });
  }
});

// GET /api/content/locations - List all published location pages
router.get('/locations', async (req, res) => {
  try {
    const { state } = req.query;

    let query = supabase
      .from('location_pages')
      .select('id, slug, city_name, state_code, country_code, headline, subheadline, hero_image_url, published_at, updated_at')
      .eq('status', 'published')
      .order('city_name', { ascending: true });

    if (state) {
      query = query.eq('state_code', state);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching location pages:', error);
    res.status(500).json({ error: { message: 'Failed to fetch location pages' } });
  }
});

// GET /api/content/locations/nearby - Get nearby locations by slugs
router.get('/locations/nearby', async (req, res) => {
  try {
    const { slugs } = req.query;

    if (!slugs) {
      return res.json([]);
    }

    const slugArray = slugs.split(',').map(s => s.trim()).filter(Boolean);

    if (!slugArray.length) {
      return res.json([]);
    }

    const { data, error } = await supabase
      .from('location_pages')
      .select('slug, city_name, state_code')
      .in('slug', slugArray)
      .eq('status', 'published');

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching nearby locations:', error);
    res.status(500).json({ error: { message: 'Failed to fetch nearby locations' } });
  }
});

// GET /api/content/locations/:slug - Get single location page
router.get('/locations/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const { data, error } = await supabase
      .from('location_pages')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Location page not found' } });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching location page:', error);
    res.status(500).json({ error: { message: 'Failed to fetch location page' } });
  }
});

// GET /api/content/features - List all published feature pages
router.get('/features', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('feature_pages')
      .select('id, slug, feature_name, headline, subheadline, hero_image_url, published_at, updated_at')
      .eq('status', 'published')
      .order('feature_name', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching feature pages:', error);
    res.status(500).json({ error: { message: 'Failed to fetch feature pages' } });
  }
});

// GET /api/content/features/by-slugs - Get features by slugs
router.get('/features/by-slugs', async (req, res) => {
  try {
    const { slugs } = req.query;

    if (!slugs) {
      return res.json([]);
    }

    const slugArray = slugs.split(',').map(s => s.trim()).filter(Boolean);

    if (!slugArray.length) {
      return res.json([]);
    }

    const { data, error } = await supabase
      .from('feature_pages')
      .select('slug, feature_name, headline')
      .in('slug', slugArray)
      .eq('status', 'published');

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching features by slugs:', error);
    res.status(500).json({ error: { message: 'Failed to fetch features' } });
  }
});

// GET /api/content/features/:slug - Get single feature page
router.get('/features/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const { data, error } = await supabase
      .from('feature_pages')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Feature page not found' } });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching feature page:', error);
    res.status(500).json({ error: { message: 'Failed to fetch feature page' } });
  }
});

// GET /api/content/combo - List all published combo pages
router.get('/combo', async (req, res) => {
  try {
    const { location, industry, limit = 100, offset = 0 } = req.query;

    let query = supabase
      .from('combo_pages')
      .select('id, slug, location_slug, industry_slug, city_name, industry_name, headline, subheadline, published_at, updated_at')
      .eq('status', 'published')
      .order('city_name', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (location) {
      query = query.eq('location_slug', location);
    }

    if (industry) {
      query = query.eq('industry_slug', industry);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching combo pages:', error);
    res.status(500).json({ error: { message: 'Failed to fetch combo pages' } });
  }
});

// GET /api/content/combo/related - Get related combo pages
router.get('/combo/related', async (req, res) => {
  try {
    const { industry, location, limit = 6 } = req.query;

    if (!industry || !location) {
      return res.json([]);
    }

    // Get combos with same industry OR same location (excluding current)
    const { data, error } = await supabase
      .from('combo_pages')
      .select('id, slug, location_slug, industry_slug, city_name, industry_name, headline, subheadline, published_at, updated_at')
      .eq('status', 'published')
      .or(`industry_slug.eq.${industry},location_slug.eq.${location}`)
      .not('industry_slug', 'eq', industry)
      .not('location_slug', 'eq', location)
      .limit(parseInt(limit));

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching related combos:', error);
    res.status(500).json({ error: { message: 'Failed to fetch related combos' } });
  }
});

// GET /api/content/combo/:industry/:location - Get single combo page
router.get('/combo/:industry/:location', async (req, res) => {
  try {
    const { industry, location } = req.params;

    const { data, error } = await supabase
      .from('combo_pages')
      .select('*')
      .eq('industry_slug', industry)
      .eq('location_slug', location)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Combo page not found' } });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching combo page:', error);
    res.status(500).json({ error: { message: 'Failed to fetch combo page' } });
  }
});

// GET /api/content/sitemap-data - Get all published content for sitemap
router.get('/sitemap-data', async (req, res) => {
  try {
    // Supabase can cap rows per request; page through results so the sitemap can include everything.
    // Note: we cap at 50k per type to keep runtime reasonable (and align with sitemap best practices).
    const blogPosts = await fetchAllPublishedForSitemap({
      table: 'blog_posts',
      select: 'slug, updated_at',
      orderBy: [{ column: 'slug', ascending: true }],
    });

    const useCases = await fetchAllPublishedForSitemap({
      table: 'use_case_pages',
      select: 'slug, updated_at',
      orderBy: [{ column: 'slug', ascending: true }],
    });

    const locations = await fetchAllPublishedForSitemap({
      table: 'location_pages',
      select: 'slug, updated_at',
      orderBy: [{ column: 'slug', ascending: true }],
    });

    const features = await fetchAllPublishedForSitemap({
      table: 'feature_pages',
      select: 'slug, updated_at',
      orderBy: [{ column: 'slug', ascending: true }],
    });

    const combos = await fetchAllPublishedForSitemap({
      table: 'combo_pages',
      select: 'industry_slug, location_slug, updated_at',
      orderBy: [
        { column: 'industry_slug', ascending: true },
        { column: 'location_slug', ascending: true },
      ],
    });

    const comparisons = await fetchAllPublishedForSitemap({
      table: 'comparison_pages',
      select: 'slug, updated_at',
      orderBy: [{ column: 'slug', ascending: true }],
    });

    res.json({
      blogPosts,
      useCases,
      locations,
      features,
      combos,
      comparisons,
    });
  } catch (error) {
    console.error('Error fetching sitemap data:', error);
    res.status(500).json({ error: { message: 'Failed to fetch sitemap data' } });
  }
});

// GET /api/content/redirects - Get active redirects
router.get('/redirects', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('seo_redirects')
      .select('source_path, destination_path, redirect_type')
      .eq('is_active', true);

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching redirects:', error);
    res.status(500).json({ error: { message: 'Failed to fetch redirects' } });
  }
});

// ============================================
// COMPARISON PAGES ENDPOINTS
// ============================================

// GET /api/content/comparisons - List all published comparison pages
router.get('/comparisons', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('comparison_pages')
      .select('id, slug, alternative_name, alternative_slug, title, description, hero_title, published_at, updated_at')
      .eq('status', 'published')
      .order('alternative_name', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching comparison pages:', error);
    res.status(500).json({ error: { message: 'Failed to fetch comparison pages' } });
  }
});

// GET /api/content/comparisons/:slug - Get single comparison page
router.get('/comparisons/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const { data, error } = await supabase
      .from('comparison_pages')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: { message: 'Comparison page not found' } });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching comparison page:', error);
    res.status(500).json({ error: { message: 'Failed to fetch comparison page' } });
  }
});

// ============================================
// ADMIN: BLOG GENERATION ENDPOINTS
// ============================================

// Admin authentication middleware
function requireAdminAuth(req, res, next) {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers['x-admin-secret'];

  if (adminSecret && providedSecret === adminSecret) {
    return next();
  }

  // Check for admin user via session (if auth middleware has run)
  if (req.user?.is_admin) {
    return next();
  }

  res.status(401).json({ error: { message: 'Admin authentication required' } });
}

// GET /api/content/blog/topics - List all blog topic seeds (admin)
router.get('/blog/topics', requireAdminAuth, async (req, res) => {
  try {
    const { category, isActive } = req.query;
    const topics = await blogContentGenerator.getTopicSeeds({
      category: category || null,
      isActive: isActive === undefined ? true : isActive === 'true'
    });
    res.json(topics);
  } catch (error) {
    console.error('Error fetching blog topics:', error);
    res.status(500).json({ error: { message: 'Failed to fetch blog topics' } });
  }
});

// GET /api/content/blog/generation-stats - Get blog generation statistics (admin)
router.get('/blog/generation-stats', requireAdminAuth, async (req, res) => {
  try {
    const stats = await blogContentGenerator.getBlogGenerationStats();
    const jobStatus = getBlogJobStatus();
    const counts = await blogPublisher.getBlogCounts();

    res.json({
      generation: stats,
      job: jobStatus,
      posts: counts
    });
  } catch (error) {
    console.error('Error fetching blog generation stats:', error);
    res.status(500).json({ error: { message: 'Failed to fetch blog generation stats' } });
  }
});

// GET /api/content/blog/generation-logs - Get blog generation logs (admin)
router.get('/blog/generation-logs', requireAdminAuth, async (req, res) => {
  try {
    const { limit = 50, status } = req.query;
    const logs = await blogContentGenerator.getGenerationLogs({
      limit: parseInt(limit),
      status: status || null
    });
    res.json(logs);
  } catch (error) {
    console.error('Error fetching blog generation logs:', error);
    res.status(500).json({ error: { message: 'Failed to fetch blog generation logs' } });
  }
});

// POST /api/content/blog/generate - Trigger blog post generation (admin)
router.post('/blog/generate', requireAdminAuth, async (req, res) => {
  try {
    const { maxPosts = 1, topicSeedId, autoPublish = false } = req.body;

    // If specific topic seed provided, generate from that
    if (topicSeedId) {
      const { data: topicSeed, error } = await supabase
        .from('blog_topic_seeds')
        .select('*')
        .eq('id', topicSeedId)
        .single();

      if (error || !topicSeed) {
        return res.status(404).json({ error: { message: 'Topic seed not found' } });
      }

      const content = await blogContentGenerator.generateBlogPost(topicSeed);
      const post = await blogPublisher.publishBlogPost(content, {
        topicSeedId: topicSeed.id,
        status: autoPublish ? 'published' : 'draft'
      });

      return res.json({
        success: true,
        posts: [post]
      });
    }

    // Otherwise run the regular generation job
    const result = await runBlogGenerationOnce({ maxPosts: parseInt(maxPosts) });

    res.json(result);
  } catch (error) {
    console.error('Error generating blog post:', error);
    res.status(500).json({ error: { message: error.message || 'Failed to generate blog post' } });
  }
});

// POST /api/content/blog/:id/publish - Publish a draft blog post (admin)
router.post('/blog/:id/publish', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await blogPublisher.updateBlogPostStatus(id, 'published');
    res.json(post);
  } catch (error) {
    console.error('Error publishing blog post:', error);
    res.status(500).json({ error: { message: 'Failed to publish blog post' } });
  }
});

// POST /api/content/blog/:id/unpublish - Unpublish a blog post (admin)
router.post('/blog/:id/unpublish', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await blogPublisher.updateBlogPostStatus(id, 'draft');
    res.json(post);
  } catch (error) {
    console.error('Error unpublishing blog post:', error);
    res.status(500).json({ error: { message: 'Failed to unpublish blog post' } });
  }
});

// GET /api/content/blog/drafts - Get all draft blog posts (admin)
router.get('/blog/drafts', requireAdminAuth, async (req, res) => {
  try {
    const posts = await blogPublisher.getBlogPosts({ status: 'draft' });
    res.json(posts);
  } catch (error) {
    console.error('Error fetching draft posts:', error);
    res.status(500).json({ error: { message: 'Failed to fetch draft posts' } });
  }
});

// ============================================
// ADMIN: COMPARISON GENERATION ENDPOINTS
// ============================================

// GET /api/content/comparisons/admin/all - Get all comparison pages including drafts (admin)
router.get('/comparisons/admin/all', requireAdminAuth, async (req, res) => {
  try {
    const pages = await comparisonGenerator.getComparisonPages({ status: null });
    res.json(pages);
  } catch (error) {
    console.error('Error fetching all comparison pages:', error);
    res.status(500).json({ error: { message: 'Failed to fetch comparison pages' } });
  }
});

// GET /api/content/comparisons/admin/alternatives - Get all comparison alternatives (admin)
router.get('/comparisons/admin/alternatives', requireAdminAuth, async (req, res) => {
  try {
    const alternatives = await comparisonGenerator.getAlternatives({ isActive: null });
    res.json(alternatives);
  } catch (error) {
    console.error('Error fetching alternatives:', error);
    res.status(500).json({ error: { message: 'Failed to fetch alternatives' } });
  }
});

// GET /api/content/comparisons/admin/stats - Get comparison generation stats (admin)
router.get('/comparisons/admin/stats', requireAdminAuth, async (req, res) => {
  try {
    const stats = await comparisonGenerator.getComparisonStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching comparison stats:', error);
    res.status(500).json({ error: { message: 'Failed to fetch comparison stats' } });
  }
});

// POST /api/content/comparisons/generate - Generate comparison page for alternative (admin)
router.post('/comparisons/generate', requireAdminAuth, async (req, res) => {
  try {
    const { alternativeSlug, autoPublish = false } = req.body;

    if (!alternativeSlug) {
      return res.status(400).json({ error: { message: 'alternativeSlug is required' } });
    }

    // Get the alternative
    const alternatives = await comparisonGenerator.getAlternatives({ isActive: null });
    const alternative = alternatives.find(a => a.slug === alternativeSlug);

    if (!alternative) {
      return res.status(404).json({ error: { message: 'Alternative not found' } });
    }

    // Generate the comparison page
    const content = await comparisonGenerator.generateComparisonPage(alternative);

    // Publish the page
    const page = await comparisonGenerator.publishComparisonPage(content, {
      status: autoPublish ? 'published' : 'draft'
    });

    res.json({
      success: true,
      page
    });
  } catch (error) {
    console.error('Error generating comparison page:', error);
    res.status(500).json({ error: { message: error.message || 'Failed to generate comparison page' } });
  }
});

// POST /api/content/comparisons/:id/publish - Publish a comparison page (admin)
router.post('/comparisons/:id/publish', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const page = await comparisonGenerator.updateComparisonPageStatus(id, 'published');
    res.json(page);
  } catch (error) {
    console.error('Error publishing comparison page:', error);
    res.status(500).json({ error: { message: 'Failed to publish comparison page' } });
  }
});

// POST /api/content/comparisons/:id/unpublish - Unpublish a comparison page (admin)
router.post('/comparisons/:id/unpublish', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const page = await comparisonGenerator.updateComparisonPageStatus(id, 'draft');
    res.json(page);
  } catch (error) {
    console.error('Error unpublishing comparison page:', error);
    res.status(500).json({ error: { message: 'Failed to unpublish comparison page' } });
  }
});

module.exports = router;
