require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const callRoutes = require('./routes/calls');
const savedCallRoutes = require('./routes/savedCalls');
const scheduledCallRoutes = require('./routes/scheduledCalls');
const historyRoutes = require('./routes/history');
const billingRoutes = require('./routes/billing');
const contentRoutes = require('./routes/content');
const assistantRoutes = require('./routes/assistant');
const testHelpersRoutes = require('./routes/testHelpers');
const notificationRoutes = require('./routes/notifications');
const vapiWebhookRoutes = require('./routes/vapiWebhooks');
const seoGenerationRoutes = require('./routes/seoGeneration');
const integrationsRoutes = require('./routes/integrations');
const providersRoutes = require('./routes/providers');
const emailRoutes = require('./routes/email');
const publicLiveDemoRoutes = require('./routes/publicLiveDemo');
const templatesRoutes = require('./routes/templates');
const onboardingRoutes = require('./routes/onboarding');

// Import scheduled jobs
const { startScheduledCallsJob } = require('./jobs/scheduledCalls');
const { startProvisioningRetryJob } = require('./jobs/provisioningRetry');
const { startNumberPoolMaintenanceJob } = require('./jobs/numberPoolMaintenance');
const { startSeoContentGenerationJob } = require('./jobs/seoContentGeneration');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());

// CORS configuration - allow multiple origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3001',
  'https://voicefleet.ai',
  'https://www.voicefleet.ai',
  'https://app.voicefleet.ai',
  // Dev tunnel URLs
  'https://dev-app.voicefleet.ai',
  'https://dev.voicefleet.ai'
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin, 'Allowed:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(morgan('dev'));

// Skip express.json() for Stripe webhook (needs raw body for signature verification)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/billing/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/saved-calls', savedCallRoutes);
app.use('/api/scheduled-calls', scheduledCallRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/billing/test', testHelpersRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/vapi', vapiWebhookRoutes);
app.use('/api/seo', seoGenerationRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/public/live-demo', publicLiveDemoRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/onboarding', onboardingRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start scheduled jobs
  startScheduledCallsJob();
  startProvisioningRetryJob();
  startNumberPoolMaintenanceJob();
  startSeoContentGenerationJob();
});
