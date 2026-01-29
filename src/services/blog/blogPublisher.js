/**
 * Blog Publisher Service
 * Publishes generated blog posts to the blog_posts table
 */

const { supabaseAdmin } = require('../supabase');
const { updateTopicSeedAfterGeneration, logBlogGeneration, generateTitleHash } = require('./blogContentGenerator');

/**
 * Publish a blog post to the database
 * @param {Object} content - Generated blog content
 * @param {Object} options - Publishing options
 * @returns {Promise<Object>} Published blog post
 */
async function publishBlogPost(content, options = {}) {
    const {
        topicSeedId = null,
        status = 'draft',  // Default to draft for review
        authorName = 'VoiceFleet Team'
    } = options;

    // Ensure unique slug
    const uniqueSlug = await ensureUniqueSlug(content.slug);

    const postData = {
        slug: uniqueSlug,
        title: content.title,
        excerpt: content.excerpt,
        content: content.content,
        category: content.category,
        tags: content.tags || [],
        author_name: content.author_name || authorName,
        featured_image_alt: content.featured_image_alt,
        meta_title: content.meta_title,
        meta_description: content.meta_description,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null
    };

    const { data, error } = await supabaseAdmin
        .from('blog_posts')
        .insert(postData)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to publish blog post: ${error.message}`);
    }

    // Update generation history with blog post ID
    if (topicSeedId) {
        await updateBlogGenerationHistory(content.title, data.id);
        await updateTopicSeedAfterGeneration(topicSeedId);
    }

    return data;
}

/**
 * Ensure slug is unique by appending number if needed
 * @param {string} slug - Original slug
 * @returns {Promise<string>} Unique slug
 */
async function ensureUniqueSlug(slug) {
    const { data, error } = await supabaseAdmin
        .from('blog_posts')
        .select('slug')
        .like('slug', `${slug}%`);

    if (error) {
        console.error('Error checking slug uniqueness:', error);
        return slug;
    }

    if (!data || data.length === 0) {
        return slug;
    }

    // Find existing slugs that match pattern
    const existingSlugs = new Set(data.map(p => p.slug));

    if (!existingSlugs.has(slug)) {
        return slug;
    }

    // Append number to make unique
    let counter = 2;
    let newSlug = `${slug}-${counter}`;
    while (existingSlugs.has(newSlug)) {
        counter++;
        newSlug = `${slug}-${counter}`;
    }

    return newSlug;
}

/**
 * Update blog generation history with blog post ID
 * @param {string} title - Blog title
 * @param {string} blogPostId - Published blog post ID
 */
async function updateBlogGenerationHistory(title, blogPostId) {
    try {
        const titleHash = generateTitleHash(title);

        await supabaseAdmin
            .from('blog_generation_history')
            .update({ blog_post_id: blogPostId })
            .eq('title_hash', titleHash)
            .eq('status', 'success')
            .is('blog_post_id', null);
    } catch (error) {
        console.error('Failed to update blog generation history:', error);
    }
}

/**
 * Check if a blog post exists by slug
 * @param {string} slug - Blog slug
 * @returns {Promise<boolean>} True if exists
 */
async function blogPostExists(slug) {
    const { data, error } = await supabaseAdmin
        .from('blog_posts')
        .select('id')
        .eq('slug', slug)
        .single();

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to check blog post: ${error.message}`);
    }

    return !!data;
}

/**
 * Update blog post status
 * @param {string} id - Blog post ID
 * @param {string} status - New status ('draft', 'published', 'archived')
 * @returns {Promise<Object>} Updated blog post
 */
async function updateBlogPostStatus(id, status) {
    const updateData = { status };

    if (status === 'published') {
        updateData.published_at = new Date().toISOString();
    } else if (status === 'draft') {
        updateData.published_at = null;
    }

    const { data, error } = await supabaseAdmin
        .from('blog_posts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to update blog post status: ${error.message}`);
    }

    return data;
}

/**
 * Get blog posts with optional filtering
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Blog posts
 */
async function getBlogPosts(options = {}) {
    const { status = null, category = null, limit = 50, includeContent = false } = options;

    const selectFields = includeContent
        ? '*'
        : 'id, slug, title, excerpt, category, tags, author_name, status, published_at, created_at, updated_at';

    let query = supabaseAdmin
        .from('blog_posts')
        .select(selectFields)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status) {
        query = query.eq('status', status);
    }

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to get blog posts: ${error.message}`);
    }

    return data || [];
}

/**
 * Get blog post by slug
 * @param {string} slug - Blog slug
 * @returns {Promise<Object|null>} Blog post or null
 */
async function getBlogPostBySlug(slug) {
    const { data, error } = await supabaseAdmin
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            return null;
        }
        throw new Error(`Failed to get blog post: ${error.message}`);
    }

    return data;
}

/**
 * Get published blog post counts by category
 * @returns {Promise<Object>} Counts by category
 */
async function getBlogCounts() {
    const { data, error } = await supabaseAdmin
        .from('blog_posts')
        .select('status, category');

    if (error) {
        throw new Error(`Failed to get blog counts: ${error.message}`);
    }

    const counts = {
        total: data.length,
        byStatus: { draft: 0, published: 0, archived: 0 },
        byCategory: {}
    };

    data.forEach(post => {
        counts.byStatus[post.status] = (counts.byStatus[post.status] || 0) + 1;

        if (post.category) {
            counts.byCategory[post.category] = (counts.byCategory[post.category] || 0) + 1;
        }
    });

    return counts;
}

/**
 * Delete a blog post
 * @param {string} id - Blog post ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteBlogPost(id) {
    const { error } = await supabaseAdmin
        .from('blog_posts')
        .delete()
        .eq('id', id);

    if (error) {
        throw new Error(`Failed to delete blog post: ${error.message}`);
    }

    return true;
}

/**
 * Update blog post content
 * @param {string} id - Blog post ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated blog post
 */
async function updateBlogPost(id, updates) {
    const allowedFields = [
        'title', 'slug', 'excerpt', 'content', 'category', 'tags',
        'author_name', 'featured_image_url', 'featured_image_alt',
        'meta_title', 'meta_description', 'og_image_url', 'canonical_url'
    ];

    const updateData = {};
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            updateData[field] = updates[field];
        }
    }

    if (Object.keys(updateData).length === 0) {
        throw new Error('No valid fields to update');
    }

    const { data, error } = await supabaseAdmin
        .from('blog_posts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to update blog post: ${error.message}`);
    }

    return data;
}

module.exports = {
    publishBlogPost,
    blogPostExists,
    updateBlogPostStatus,
    getBlogPosts,
    getBlogPostBySlug,
    getBlogCounts,
    deleteBlogPost,
    updateBlogPost,
    ensureUniqueSlug
};
