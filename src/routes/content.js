const express = require('express');
const router = express.Router();
const { supabase } = require('../services/supabase');

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

// GET /api/content/sitemap-data - Get all published content for sitemap
router.get('/sitemap-data', async (req, res) => {
  try {
    const [blogResult, useCaseResult, locationResult, featureResult] = await Promise.all([
      supabase
        .from('blog_posts')
        .select('slug, updated_at')
        .eq('status', 'published'),
      supabase
        .from('use_case_pages')
        .select('slug, updated_at')
        .eq('status', 'published'),
      supabase
        .from('location_pages')
        .select('slug, updated_at')
        .eq('status', 'published'),
      supabase
        .from('feature_pages')
        .select('slug, updated_at')
        .eq('status', 'published'),
    ]);

    if (blogResult.error) throw blogResult.error;
    if (useCaseResult.error) throw useCaseResult.error;
    if (locationResult.error) throw locationResult.error;
    if (featureResult.error) throw featureResult.error;

    res.json({
      blogPosts: blogResult.data || [],
      useCases: useCaseResult.data || [],
      locations: locationResult.data || [],
      features: featureResult.data || [],
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

module.exports = router;
