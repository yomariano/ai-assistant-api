/**
 * Email Service
 *
 * Handles transactional and marketing emails for OrderBot.
 * Uses Resend for email delivery.
 */

const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

// Initialize clients
let resendClient = null;

function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// EMAIL CONFIGURATION
// ============================================

const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || 'VoiceFleet <hello@voicefleet.ai>',
  replyTo: process.env.EMAIL_REPLY_TO || 'support@voicefleet.ai',
  baseUrl: process.env.FRONTEND_URL || 'https://voicefleet.ai',
};

const PLAN_DETAILS = {
  starter: { name: 'Lite', price: '€19', perCall: '€0.95', phoneNumbers: 1 },
  growth: { name: 'Growth', price: '€99', perCall: '€0.45', phoneNumbers: 2 },
  scale: { name: 'Pro', price: '€249', perCall: '€0 (unlimited)', phoneNumbers: 5 },
};

// ============================================
// EMAIL TEMPLATES
// ============================================

/**
 * Base HTML template with OrderBot branding
 */
function baseTemplate(content, preheader = '') {
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
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e4e4e7; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #71717a; }
    .info-value { color: #18181b; font-weight: 600; }
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
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Welcome email after successful subscription
 */
function welcomeEmailTemplate(data) {
  const { userName, planId, planName, phoneNumbers } = data;
  const plan = PLAN_DETAILS[planId] || PLAN_DETAILS.starter;
  const firstName = userName ? userName.split(' ')[0] : 'there';

  const content = `
    <h2>Welcome to OrderBot! 🎉</h2>
    <p>Hi ${firstName},</p>
    <p>Thank you for subscribing to OrderBot! Your AI-powered phone assistant is ready to start taking orders for your restaurant.</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Your Plan</span>
        <span class="info-value">${plan.name} (${plan.price}/month)</span>
      </div>
      <div class="info-row">
        <span class="info-label">Per Call Rate</span>
        <span class="info-value">${plan.perCall}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Phone Numbers</span>
        <span class="info-value">${plan.phoneNumbers}</span>
      </div>
    </div>

    <h3 style="color: #18181b; margin: 24px 0 12px;">Getting Started</h3>
    <ol style="color: #52525b; line-height: 1.8; padding-left: 20px;">
      <li><strong>Configure your AI assistant</strong> - Set your business name and greeting</li>
      <li><strong>Set up notifications</strong> - Choose how you want to receive order alerts</li>
      <li><strong>Forward your calls</strong> - We'll provide you with a phone number to forward to</li>
      <li><strong>Start taking orders!</strong> - Your AI is ready to handle calls 24/7</li>
    </ol>

    <p style="text-align: center;">
      <a href="${EMAIL_CONFIG.baseUrl}/dashboard" class="button">Go to Dashboard</a>
    </p>

    <p>If you have any questions, just reply to this email or contact us at <a href="mailto:${EMAIL_CONFIG.replyTo}">${EMAIL_CONFIG.replyTo}</a>.</p>

    <p>We're excited to help you never miss another order!</p>
    <p>– The OrderBot Team</p>
  `;

  return {
    subject: `Welcome to OrderBot! Let's get you set up 🚀`,
    html: baseTemplate(content, `Welcome to OrderBot, ${firstName}! Your AI phone assistant is ready.`),
    text: `Welcome to OrderBot!\n\nHi ${firstName},\n\nThank you for subscribing to OrderBot ${plan.name} (${plan.price}/month).\n\nYour AI-powered phone assistant is ready to start taking orders for your restaurant.\n\nGet started: ${EMAIL_CONFIG.baseUrl}/dashboard\n\n– The OrderBot Team`,
  };
}

/**
 * Subscription confirmation / receipt email
 */
function subscriptionConfirmationTemplate(data) {
  const { userName, planId, amount, currency, nextBillingDate, invoiceUrl } = data;
  const plan = PLAN_DETAILS[planId] || PLAN_DETAILS.starter;
  const firstName = userName ? userName.split(' ')[0] : 'there';
  const formattedAmount = currency === 'eur' ? `€${(amount / 100).toFixed(2)}` : `$${(amount / 100).toFixed(2)}`;
  const formattedDate = new Date(nextBillingDate).toLocaleDateString('en-IE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const content = `
    <h2>Payment Confirmed ✓</h2>
    <p>Hi ${firstName},</p>
    <p>We've received your payment. Here are the details:</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Amount Paid</span>
        <span class="info-value">${formattedAmount}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Plan</span>
        <span class="info-value">${plan.name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Next Billing Date</span>
        <span class="info-value">${formattedDate}</span>
      </div>
    </div>

    ${invoiceUrl ? `<p style="text-align: center;"><a href="${invoiceUrl}" class="button" style="background: #18181b;">View Invoice</a></p>` : ''}

    <p>You can manage your subscription anytime from your <a href="${EMAIL_CONFIG.baseUrl}/billing">billing settings</a>.</p>

    <p>Thank you for choosing OrderBot!</p>
    <p>– The OrderBot Team</p>
  `;

  return {
    subject: `Payment confirmed - OrderBot ${plan.name}`,
    html: baseTemplate(content, `Your OrderBot payment of ${formattedAmount} has been confirmed.`),
    text: `Payment Confirmed\n\nHi ${firstName},\n\nWe've received your payment of ${formattedAmount} for OrderBot ${plan.name}.\n\nNext billing date: ${formattedDate}\n\nManage subscription: ${EMAIL_CONFIG.baseUrl}/billing\n\n– The OrderBot Team`,
  };
}

/**
 * Payment failed email
 */
function paymentFailedTemplate(data) {
  const { userName, planId, amount, currency, retryDate } = data;
  const plan = PLAN_DETAILS[planId] || PLAN_DETAILS.starter;
  const firstName = userName ? userName.split(' ')[0] : 'there';
  const formattedAmount = currency === 'eur' ? `€${(amount / 100).toFixed(2)}` : `$${(amount / 100).toFixed(2)}`;

  const content = `
    <h2>Payment Failed</h2>
    <p>Hi ${firstName},</p>
    <p>We were unable to process your payment of ${formattedAmount} for your OrderBot ${plan.name} subscription.</p>

    <p>This could be due to:</p>
    <ul style="color: #52525b; line-height: 1.8;">
      <li>Insufficient funds</li>
      <li>Expired card</li>
      <li>Card declined by your bank</li>
    </ul>

    <p style="text-align: center;">
      <a href="${EMAIL_CONFIG.baseUrl}/billing" class="button">Update Payment Method</a>
    </p>

    ${retryDate ? `<p>We'll automatically retry the payment on ${new Date(retryDate).toLocaleDateString('en-IE')}.</p>` : ''}

    <p>If you don't update your payment method, your subscription may be paused and your AI assistant will stop taking calls.</p>

    <p>Need help? Contact us at <a href="mailto:${EMAIL_CONFIG.replyTo}">${EMAIL_CONFIG.replyTo}</a>.</p>

    <p>– The OrderBot Team</p>
  `;

  return {
    subject: `⚠️ Payment failed - Action required`,
    html: baseTemplate(content, `We couldn't process your OrderBot payment. Please update your payment method.`),
    text: `Payment Failed\n\nHi ${firstName},\n\nWe were unable to process your payment of ${formattedAmount} for OrderBot ${plan.name}.\n\nPlease update your payment method: ${EMAIL_CONFIG.baseUrl}/billing\n\n– The OrderBot Team`,
  };
}

/**
 * Subscription cancelled email
 */
function subscriptionCancelledTemplate(data) {
  const { userName, planId, endDate } = data;
  const plan = PLAN_DETAILS[planId] || PLAN_DETAILS.starter;
  const firstName = userName ? userName.split(' ')[0] : 'there';
  const formattedEndDate = new Date(endDate).toLocaleDateString('en-IE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const content = `
    <h2>Subscription Cancelled</h2>
    <p>Hi ${firstName},</p>
    <p>Your OrderBot ${plan.name} subscription has been cancelled.</p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Access Until</span>
        <span class="info-value">${formattedEndDate}</span>
      </div>
    </div>

    <p>You'll continue to have access until ${formattedEndDate}. After that:</p>
    <ul style="color: #52525b; line-height: 1.8;">
      <li>Your AI assistant will stop taking calls</li>
      <li>Your phone number(s) will be released</li>
      <li>Your call history will be preserved</li>
    </ul>

    <p>Changed your mind? You can resubscribe anytime:</p>
    <p style="text-align: center;">
      <a href="${EMAIL_CONFIG.baseUrl}/billing" class="button">Resubscribe</a>
    </p>

    <p>We'd love to know why you cancelled. Reply to this email with any feedback.</p>

    <p>– The OrderBot Team</p>
  `;

  return {
    subject: `Your OrderBot subscription has been cancelled`,
    html: baseTemplate(content, `Your OrderBot subscription has been cancelled. Access until ${formattedEndDate}.`),
    text: `Subscription Cancelled\n\nHi ${firstName},\n\nYour OrderBot ${plan.name} subscription has been cancelled.\n\nYou'll have access until ${formattedEndDate}.\n\nResubscribe: ${EMAIL_CONFIG.baseUrl}/billing\n\n– The OrderBot Team`,
  };
}

// ============================================
// EMAIL SENDING
// ============================================

/**
 * Send a transactional email
 */
async function sendTransactionalEmail(to, template) {
  const resend = getResendClient();

  if (!resend) {
    console.warn('[EmailService] Resend not configured - skipping email');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const result = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    console.log(`[EmailService] Email sent to ${to}: ${template.subject}`);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error('[EmailService] Failed to send email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Log email to database
 */
async function logEmail({ userId, emailType, recipient, subject, status, error }) {
  try {
    await supabase.from('email_logs').insert({
      user_id: userId,
      email_type: emailType,
      recipient,
      subject,
      status,
      error_message: error,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error('[EmailService] Failed to log email:', err);
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Send welcome email after subscription
 */
async function sendWelcomeEmail(userId, subscriptionData) {
  const { data: user } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  if (!user?.email) {
    console.warn('[EmailService] No email found for user:', userId);
    return { success: false, error: 'No email found' };
  }

  const template = welcomeEmailTemplate({
    userName: user.full_name,
    planId: subscriptionData.planId,
    planName: PLAN_DETAILS[subscriptionData.planId]?.name,
    phoneNumbers: PLAN_DETAILS[subscriptionData.planId]?.phoneNumbers,
  });

  const result = await sendTransactionalEmail(user.email, template);

  await logEmail({
    userId,
    emailType: 'welcome',
    recipient: user.email,
    subject: template.subject,
    status: result.success ? 'sent' : 'failed',
    error: result.error,
  });

  return result;
}

/**
 * Send subscription confirmation / receipt
 */
async function sendSubscriptionConfirmation(userId, paymentData) {
  const { data: user } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  if (!user?.email) {
    return { success: false, error: 'No email found' };
  }

  const template = subscriptionConfirmationTemplate({
    userName: user.full_name,
    planId: paymentData.planId,
    amount: paymentData.amount,
    currency: paymentData.currency,
    nextBillingDate: paymentData.nextBillingDate,
    invoiceUrl: paymentData.invoiceUrl,
  });

  const result = await sendTransactionalEmail(user.email, template);

  await logEmail({
    userId,
    emailType: 'subscription_confirmation',
    recipient: user.email,
    subject: template.subject,
    status: result.success ? 'sent' : 'failed',
    error: result.error,
  });

  return result;
}

/**
 * Send payment failed email
 */
async function sendPaymentFailedEmail(userId, paymentData) {
  const { data: user } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  if (!user?.email) {
    return { success: false, error: 'No email found' };
  }

  const template = paymentFailedTemplate({
    userName: user.full_name,
    planId: paymentData.planId,
    amount: paymentData.amount,
    currency: paymentData.currency,
    retryDate: paymentData.retryDate,
  });

  const result = await sendTransactionalEmail(user.email, template);

  await logEmail({
    userId,
    emailType: 'payment_failed',
    recipient: user.email,
    subject: template.subject,
    status: result.success ? 'sent' : 'failed',
    error: result.error,
  });

  return result;
}

/**
 * Send subscription cancelled email
 */
async function sendSubscriptionCancelledEmail(userId, subscriptionData) {
  const { data: user } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  if (!user?.email) {
    return { success: false, error: 'No email found' };
  }

  const template = subscriptionCancelledTemplate({
    userName: user.full_name,
    planId: subscriptionData.planId,
    endDate: subscriptionData.endDate,
  });

  const result = await sendTransactionalEmail(user.email, template);

  await logEmail({
    userId,
    emailType: 'subscription_cancelled',
    recipient: user.email,
    subject: template.subject,
    status: result.success ? 'sent' : 'failed',
    error: result.error,
  });

  return result;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Send functions
  sendWelcomeEmail,
  sendSubscriptionConfirmation,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,

  // Low-level (for testing)
  sendTransactionalEmail,

  // Templates (for testing)
  welcomeEmailTemplate,
  subscriptionConfirmationTemplate,
  paymentFailedTemplate,
  subscriptionCancelledTemplate,
};
