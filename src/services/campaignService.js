/**
 * Campaign Service
 *
 * Handles manual email campaigns - creation, segmentation, sending, and analytics.
 * Uses Resend for email delivery.
 */

const { Resend } = require('resend');
const { supabaseAdmin } = require('./supabase');

// ============================================
// CONFIGURATION
// ============================================

let resendClient = null;

function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || 'VoiceFleet <hello@voicefleet.ai>',
  replyTo: process.env.EMAIL_REPLY_TO || 'support@voicefleet.ai',
  baseUrl: process.env.FRONTEND_URL || 'https://voicefleet.ai',
};

// ============================================
// EMAIL TEMPLATES
// ============================================

/**
 * Get an email template by ID
 */
async function getTemplate(templateId) {
  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error) {
    console.error('[CampaignService] Error fetching template:', error);
    return null;
  }

  return data;
}

/**
 * Get all active templates
 */
async function getTemplates(category = null) {
  let query = supabaseAdmin
    .from('email_templates')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[CampaignService] Error fetching templates:', error);
    return [];
  }

  return data;
}

/**
 * Create or update an email template
 */
async function upsertTemplate(template) {
  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .upsert({
      ...template,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('[CampaignService] Error upserting template:', error);
    throw error;
  }

  return data;
}

/**
 * Replace template variables with actual values
 */
function fillTemplate(template, variables) {
  let html = template.html_content;
  let text = template.text_content || '';
  let subject = template.subject;

  // Replace all {{variable}} placeholders
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(placeholder, value || '');
    text = text.replace(placeholder, value || '');
    subject = subject.replace(placeholder, value || '');
  });

  return { subject, html, text };
}

/**
 * Get base HTML wrapper for campaign emails
 */
function wrapInBaseTemplate(content, preheader = '') {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OrderBot</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px; }
    .content { padding: 32px; }
    .content h2 { color: #18181b; margin: 0 0 16px; font-size: 24px; }
    .content p { color: #52525b; line-height: 1.6; margin: 0 0 16px; }
    .button { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .info-box { background-color: #f4f4f5; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .footer { background-color: #f4f4f5; padding: 24px 32px; text-align: center; }
    .footer p { color: #71717a; font-size: 12px; margin: 0 0 8px; }
    .footer a { color: #6366f1; text-decoration: none; }
    .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; }
  </style>
</head>
<body>
  <div class="preheader">${preheader}</div>
  <div class="container">
    <div class="header">
      <h1>OrderBot</h1>
      <p>AI Voice Assistant for Restaurants</p>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>OrderBot by VoiceFleet</p>
      <p><a href="${EMAIL_CONFIG.baseUrl}">voicefleet.ai</a> | <a href="mailto:${EMAIL_CONFIG.replyTo}">Contact Support</a></p>
      <p style="margin-top: 16px;">You're receiving this email because you have an OrderBot account.</p>
      <p><a href="${EMAIL_CONFIG.baseUrl}/unsubscribe">Unsubscribe from marketing emails</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ============================================
// CAMPAIGN MANAGEMENT
// ============================================

/**
 * Create a new campaign
 */
async function createCampaign({ name, description, templateId, subjectOverride, segmentJson, scheduledAt }) {
  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .insert({
      name,
      description,
      template_id: templateId,
      subject_override: subjectOverride,
      segment_json: segmentJson || {},
      scheduled_at: scheduledAt,
      status: scheduledAt ? 'scheduled' : 'draft',
    })
    .select()
    .single();

  if (error) {
    console.error('[CampaignService] Error creating campaign:', error);
    throw error;
  }

  return data;
}

/**
 * Get a campaign by ID
 */
async function getCampaign(campaignId) {
  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .select(`
      *,
      template:email_templates(*)
    `)
    .eq('id', campaignId)
    .single();

  if (error) {
    console.error('[CampaignService] Error fetching campaign:', error);
    return null;
  }

  return data;
}

/**
 * List campaigns with optional status filter
 */
async function listCampaigns(status = null, limit = 50) {
  let query = supabaseAdmin
    .from('email_campaigns')
    .select(`
      *,
      template:email_templates(id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[CampaignService] Error listing campaigns:', error);
    return [];
  }

  return data;
}

/**
 * Update campaign status
 */
async function updateCampaignStatus(campaignId, status, additionalFields = {}) {
  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .update({
      status,
      ...additionalFields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)
    .select()
    .single();

  if (error) {
    console.error('[CampaignService] Error updating campaign status:', error);
    throw error;
  }

  return data;
}

// ============================================
// SEGMENTATION
// ============================================

/**
 * Get users matching a segment
 * Segment options:
 * - plan: Array of plan IDs (e.g., ['starter', 'growth'])
 * - active: Boolean (true = has calls in last 7 days)
 * - signupAfter: ISO date string
 * - signupBefore: ISO date string
 * - hasPhoneNumber: Boolean
 * - region: 'IE' | 'US' | 'all'
 */
async function getSegmentUsers(segmentJson) {
  // Start with users who have marketing emails enabled
  let query = supabaseAdmin
    .from('users')
    .select(`
      id,
      email,
      full_name,
      created_at,
      last_active_at,
      user_subscriptions!inner(plan_id, status),
      notification_preferences(marketing_emails)
    `)
    .not('email', 'is', null);

  // Filter by plan
  if (segmentJson.plan && segmentJson.plan.length > 0) {
    query = query.in('user_subscriptions.plan_id', segmentJson.plan);
  }

  // Filter by subscription status (default to active)
  const subscriptionStatuses = segmentJson.subscriptionStatus || ['active', 'trialing'];
  query = query.in('user_subscriptions.status', subscriptionStatuses);

  // Filter by signup date
  if (segmentJson.signupAfter) {
    query = query.gte('created_at', segmentJson.signupAfter);
  }
  if (segmentJson.signupBefore) {
    query = query.lte('created_at', segmentJson.signupBefore);
  }

  const { data: users, error } = await query;

  if (error) {
    console.error('[CampaignService] Error fetching segment users:', error);
    return [];
  }

  // Filter for marketing email opt-in (default to true if not set)
  let filteredUsers = users.filter(user => {
    const prefs = user.notification_preferences;
    return !prefs || prefs.marketing_emails !== false;
  });

  // Filter by activity
  if (segmentJson.active !== undefined) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    filteredUsers = filteredUsers.filter(user => {
      const isActive = user.last_active_at && new Date(user.last_active_at) > sevenDaysAgo;
      return segmentJson.active ? isActive : !isActive;
    });
  }

  return filteredUsers.map(user => ({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    planId: user.user_subscriptions?.plan_id,
    createdAt: user.created_at,
    lastActiveAt: user.last_active_at,
  }));
}

/**
 * Preview recipients for a campaign (without adding to campaign_recipients)
 */
async function previewCampaignRecipients(campaignId) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const users = await getSegmentUsers(campaign.segment_json);
  return {
    count: users.length,
    preview: users.slice(0, 10), // First 10 as preview
  };
}

// ============================================
// CAMPAIGN SENDING
// ============================================

/**
 * Send a single campaign email
 */
async function sendCampaignEmail({ to, subject, html, text }) {
  const resend = getResendClient();

  if (!resend) {
    console.warn('[CampaignService] Resend not configured - skipping email');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const result = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to,
      subject,
      html: wrapInBaseTemplate(html),
      text,
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('[CampaignService] Failed to send email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a campaign to all recipients
 */
async function sendCampaign(campaignId, options = {}) {
  const { batchSize = 10, delayMs = 1000 } = options;

  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status === 'sent') {
    throw new Error('Campaign has already been sent');
  }

  const template = campaign.template;
  if (!template) {
    throw new Error('Campaign template not found');
  }

  // Get recipients
  const users = await getSegmentUsers(campaign.segment_json);
  if (users.length === 0) {
    throw new Error('No recipients match the segment criteria');
  }

  console.log(`[CampaignService] Sending campaign ${campaignId} to ${users.length} recipients`);

  // Update campaign status
  await updateCampaignStatus(campaignId, 'sending', {
    total_recipients: users.length,
    sent_at: new Date().toISOString(),
  });

  // Add recipients to campaign_recipients
  const recipientRecords = users.map(user => ({
    campaign_id: campaignId,
    user_id: user.id,
    email_address: user.email,
    status: 'pending',
  }));

  await supabaseAdmin
    .from('campaign_recipients')
    .upsert(recipientRecords, { onConflict: 'campaign_id,user_id' });

  let sentCount = 0;
  let errorCount = 0;

  // Send in batches
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    await Promise.all(batch.map(async (user) => {
      try {
        // Prepare variables
        const variables = {
          firstName: user.fullName?.split(' ')[0] || 'there',
          fullName: user.fullName || '',
          email: user.email,
          dashboardUrl: `${EMAIL_CONFIG.baseUrl}/dashboard`,
          upgradeUrl: `${EMAIL_CONFIG.baseUrl}/billing`,
          bookingUrl: `${EMAIL_CONFIG.baseUrl}/setup-call`,
        };

        const { subject, html, text } = fillTemplate(template, variables);
        const finalSubject = campaign.subject_override || subject;

        const result = await sendCampaignEmail({
          to: user.email,
          subject: finalSubject,
          html,
          text,
        });

        // Update recipient status
        await supabaseAdmin
          .from('campaign_recipients')
          .update({
            status: result.success ? 'sent' : 'failed',
            sent_at: result.success ? new Date().toISOString() : null,
            error_message: result.error,
          })
          .eq('campaign_id', campaignId)
          .eq('user_id', user.id);

        if (result.success) {
          sentCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        console.error(`[CampaignService] Error sending to ${user.email}:`, err);
        errorCount++;

        await supabaseAdmin
          .from('campaign_recipients')
          .update({
            status: 'failed',
            error_message: err.message,
          })
          .eq('campaign_id', campaignId)
          .eq('user_id', user.id);
      }
    }));

    // Delay between batches to avoid rate limits
    if (i + batchSize < users.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Update final campaign stats
  await updateCampaignStatus(campaignId, 'sent', {
    emails_sent: sentCount,
  });

  console.log(`[CampaignService] Campaign ${campaignId} complete: ${sentCount} sent, ${errorCount} failed`);

  return {
    campaignId,
    totalRecipients: users.length,
    sent: sentCount,
    failed: errorCount,
  };
}

// ============================================
// ANALYTICS
// ============================================

/**
 * Get campaign analytics
 */
async function getCampaignAnalytics(campaignId) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Get recipient stats
  const { data: recipients } = await supabaseAdmin
    .from('campaign_recipients')
    .select('status, sent_at, opened_at, clicked_at')
    .eq('campaign_id', campaignId);

  const stats = {
    total: recipients?.length || 0,
    sent: 0,
    failed: 0,
    opened: 0,
    clicked: 0,
    pending: 0,
  };

  recipients?.forEach(r => {
    if (r.status === 'sent') stats.sent++;
    else if (r.status === 'failed') stats.failed++;
    else if (r.status === 'pending') stats.pending++;

    if (r.opened_at) stats.opened++;
    if (r.clicked_at) stats.clicked++;
  });

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      sentAt: campaign.sent_at,
    },
    stats,
    rates: {
      deliveryRate: stats.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(1) : 0,
      openRate: stats.sent > 0 ? ((stats.opened / stats.sent) * 100).toFixed(1) : 0,
      clickRate: stats.sent > 0 ? ((stats.clicked / stats.sent) * 100).toFixed(1) : 0,
    },
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Templates
  getTemplate,
  getTemplates,
  upsertTemplate,
  fillTemplate,
  wrapInBaseTemplate,

  // Campaigns
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaignStatus,

  // Segmentation
  getSegmentUsers,
  previewCampaignRecipients,

  // Sending
  sendCampaignEmail,
  sendCampaign,

  // Analytics
  getCampaignAnalytics,

  // Config (for other services)
  EMAIL_CONFIG,
};
