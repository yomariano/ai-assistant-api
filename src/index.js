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

// Import scheduled jobs
const { startScheduledCallsJob } = require('./jobs/scheduledCalls');
const { startProvisioningRetryJob } = require('./jobs/provisioningRetry');
const { startNumberPoolMaintenanceJob } = require('./jobs/numberPoolMaintenance');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
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
});
