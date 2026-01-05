/**
 * Unit Tests for Notification Routes
 */

const express = require('express');
const request = require('supertest');

// Mock objects - define before mocking
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  rpc: jest.fn(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
};

const mockNotificationService = {
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
  getEscalationSettings: jest.fn(),
  updateEscalationSettings: jest.fn(),
  sendTestNotification: jest.fn(),
};

// Mock dependencies
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

jest.mock('../../services/notifications', () => mockNotificationService);

jest.mock('../../services/assistant', () => ({
  syncEscalationToAssistant: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock the auth middleware to bypass authentication
jest.mock('../../middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
  },
}));

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Mount routes - auth middleware is mocked so it will pass through
  const notificationRoutes = require('../notifications');
  app.use('/api/notifications', notificationRoutes);
  return app;
};

describe('Notification Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();

    // Default mock responses
    mockNotificationService.getNotificationPreferences.mockResolvedValue({
      email_enabled: true,
      sms_enabled: false,
      email_address: 'test@example.com',
      notify_on_call_complete: true,
      notify_on_message_taken: true,
      notify_on_escalation: true,
      notify_on_voicemail: true,
      business_hours_only: false,
      timezone: 'Europe/Dublin',
    });

    mockNotificationService.getEscalationSettings.mockResolvedValue({
      transfer_enabled: false,
      transfer_number: null,
      transfer_method: 'warm_transfer',
      trigger_keywords: ['manager', 'human', 'help'],
      max_failed_attempts: 2,
      business_hours_only: true,
      business_hours_start: '09:00',
      business_hours_end: '18:00',
      business_days: [1, 2, 3, 4, 5],
      timezone: 'Europe/Dublin',
      after_hours_action: 'voicemail',
      after_hours_message: 'We are closed.',
    });
  });

  // ============================================
  // GET /api/notifications/preferences
  // ============================================
  describe('GET /api/notifications/preferences', () => {
    it('should return notification preferences', async () => {
      const response = await request(app)
        .get('/api/notifications/preferences')
        .expect(200);

      expect(response.body.preferences).toBeDefined();
      expect(response.body.preferences.email_enabled).toBe(true);
      expect(mockNotificationService.getNotificationPreferences).toHaveBeenCalledWith('user-123');
    });

    it('should return 500 on service error', async () => {
      mockNotificationService.getNotificationPreferences.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .get('/api/notifications/preferences')
        .expect(500);

      expect(response.body.error.code).toBe('NOTIFICATION_PREFS_ERROR');
    });
  });

  // ============================================
  // PUT /api/notifications/preferences
  // ============================================
  describe('PUT /api/notifications/preferences', () => {
    beforeEach(() => {
      mockNotificationService.updateNotificationPreferences.mockResolvedValue({
        email_enabled: true,
        sms_enabled: true,
        sms_number: '+353851234567',
      });
    });

    it('should update notification preferences', async () => {
      const updates = {
        email_enabled: true,
        sms_enabled: true,
        sms_number: '+353851234567',
      };

      const response = await request(app)
        .put('/api/notifications/preferences')
        .send(updates)
        .expect(200);

      expect(response.body.preferences).toBeDefined();
      expect(response.body.message).toContain('updated');
      expect(mockNotificationService.updateNotificationPreferences).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining(updates)
      );
    });

    it('should reject invalid phone number', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .send({ sms_number: 'invalid' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should reject phone number without + prefix', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .send({ sms_number: '353851234567' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should reject phone number starting with 0', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .send({ sms_number: '+0851234567' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should accept valid E.164 phone numbers', async () => {
      const validNumbers = ['+353851234567', '+14155551234', '+442071234567'];

      for (const number of validNumbers) {
        const response = await request(app)
          .put('/api/notifications/preferences')
          .send({ sms_number: number })
          .expect(200);

        expect(response.body.preferences).toBeDefined();
      }
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .send({ email_address: 'not-an-email' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_EMAIL');
    });

    it('should reject email without @', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .send({ email_address: 'testexample.com' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_EMAIL');
    });

    it('should accept valid email addresses', async () => {
      const validEmails = ['test@example.com', 'user.name@domain.co.uk', 'user+tag@example.org'];

      for (const email of validEmails) {
        const response = await request(app)
          .put('/api/notifications/preferences')
          .send({ email_address: email })
          .expect(200);

        expect(response.body.preferences).toBeDefined();
      }
    });

    it('should filter out non-allowed fields', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .send({
          email_enabled: true,
          invalid_field: 'should be ignored',
          another_invalid: 123,
        })
        .expect(200);

      expect(mockNotificationService.updateNotificationPreferences).toHaveBeenCalledWith(
        'user-123',
        expect.not.objectContaining({
          invalid_field: expect.anything(),
          another_invalid: expect.anything(),
        })
      );
    });

    it('should return 500 on service error', async () => {
      mockNotificationService.updateNotificationPreferences.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .put('/api/notifications/preferences')
        .send({ email_enabled: true })
        .expect(500);

      expect(response.body.error.code).toBe('NOTIFICATION_PREFS_UPDATE_ERROR');
    });
  });

  // ============================================
  // GET /api/notifications/escalation
  // ============================================
  describe('GET /api/notifications/escalation', () => {
    it('should return escalation settings', async () => {
      const response = await request(app)
        .get('/api/notifications/escalation')
        .expect(200);

      expect(response.body.settings).toBeDefined();
      expect(response.body.settings.transfer_method).toBe('warm_transfer');
      expect(mockNotificationService.getEscalationSettings).toHaveBeenCalledWith('user-123');
    });

    it('should return 500 on service error', async () => {
      mockNotificationService.getEscalationSettings.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .get('/api/notifications/escalation')
        .expect(500);

      expect(response.body.error.code).toBe('ESCALATION_SETTINGS_ERROR');
    });
  });

  // ============================================
  // PUT /api/notifications/escalation
  // ============================================
  describe('PUT /api/notifications/escalation', () => {
    beforeEach(() => {
      mockNotificationService.updateEscalationSettings.mockResolvedValue({
        transfer_enabled: true,
        transfer_number: '+353851234567',
        transfer_method: 'blind_transfer',
      });
    });

    it('should update escalation settings', async () => {
      const updates = {
        transfer_enabled: true,
        transfer_number: '+353851234567',
        transfer_method: 'blind_transfer',
      };

      const response = await request(app)
        .put('/api/notifications/escalation')
        .send(updates)
        .expect(200);

      expect(response.body.settings).toBeDefined();
      expect(response.body.message).toContain('updated');
    });

    it('should reject invalid transfer number', async () => {
      const response = await request(app)
        .put('/api/notifications/escalation')
        .send({ transfer_number: 'invalid' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should reject invalid transfer method', async () => {
      const response = await request(app)
        .put('/api/notifications/escalation')
        .send({ transfer_method: 'invalid_method' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_TRANSFER_METHOD');
    });

    it('should accept valid transfer methods', async () => {
      const validMethods = ['blind_transfer', 'warm_transfer', 'callback', 'sms_alert'];

      for (const method of validMethods) {
        const response = await request(app)
          .put('/api/notifications/escalation')
          .send({ transfer_method: method })
          .expect(200);

        expect(response.body.settings).toBeDefined();
      }
    });

    it('should reject invalid after hours action', async () => {
      const response = await request(app)
        .put('/api/notifications/escalation')
        .send({ after_hours_action: 'invalid_action' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_AFTER_HOURS_ACTION');
    });

    it('should accept valid after hours actions', async () => {
      const validActions = ['voicemail', 'sms_alert', 'callback_promise', 'ai_only'];

      for (const action of validActions) {
        const response = await request(app)
          .put('/api/notifications/escalation')
          .send({ after_hours_action: action })
          .expect(200);

        expect(response.body.settings).toBeDefined();
      }
    });

    it('should reject non-array trigger keywords', async () => {
      const response = await request(app)
        .put('/api/notifications/escalation')
        .send({ trigger_keywords: 'not-an-array' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_TRIGGER_KEYWORDS');
    });

    it('should accept array trigger keywords', async () => {
      const response = await request(app)
        .put('/api/notifications/escalation')
        .send({ trigger_keywords: ['manager', 'help', 'complaint'] })
        .expect(200);

      expect(response.body.settings).toBeDefined();
    });

    it('should update business hours', async () => {
      const updates = {
        business_hours_only: true,
        business_hours_start: '10:00',
        business_hours_end: '20:00',
        business_days: [1, 2, 3, 4, 5, 6],
      };

      const response = await request(app)
        .put('/api/notifications/escalation')
        .send(updates)
        .expect(200);

      expect(mockNotificationService.updateEscalationSettings).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining(updates)
      );
    });

    it('should return 500 on service error', async () => {
      mockNotificationService.updateEscalationSettings.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .put('/api/notifications/escalation')
        .send({ transfer_enabled: true })
        .expect(500);

      expect(response.body.error.code).toBe('ESCALATION_SETTINGS_UPDATE_ERROR');
    });
  });

  // ============================================
  // POST /api/notifications/test
  // ============================================
  describe('POST /api/notifications/test', () => {
    beforeEach(() => {
      mockNotificationService.sendTestNotification.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
    });

    it('should send test email', async () => {
      const response = await request(app)
        .post('/api/notifications/test')
        .send({ type: 'email' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('email');
      expect(mockNotificationService.sendTestNotification).toHaveBeenCalledWith('user-123', 'email');
    });

    it('should send test SMS', async () => {
      const response = await request(app)
        .post('/api/notifications/test')
        .send({ type: 'sms' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('sms');
      expect(mockNotificationService.sendTestNotification).toHaveBeenCalledWith('user-123', 'sms');
    });

    it('should reject invalid notification type', async () => {
      const response = await request(app)
        .post('/api/notifications/test')
        .send({ type: 'invalid' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_NOTIFICATION_TYPE');
    });

    it('should default to email if type not specified', async () => {
      const response = await request(app)
        .post('/api/notifications/test')
        .send({})
        .expect(200);

      expect(mockNotificationService.sendTestNotification).toHaveBeenCalledWith('user-123', 'email');
    });

    it('should handle test notification failure', async () => {
      mockNotificationService.sendTestNotification.mockResolvedValueOnce({
        success: false,
        error: 'No email configured',
      });

      const response = await request(app)
        .post('/api/notifications/test')
        .send({ type: 'email' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TEST_NOTIFICATION_FAILED');
    });

    it('should return 500 on service error', async () => {
      mockNotificationService.sendTestNotification.mockRejectedValueOnce(new Error('Service error'));

      const response = await request(app)
        .post('/api/notifications/test')
        .send({ type: 'email' })
        .expect(500);

      expect(response.body.error.code).toBe('TEST_NOTIFICATION_ERROR');
    });
  });

  // ============================================
  // GET /api/notifications/history
  // ============================================
  describe('GET /api/notifications/history', () => {
    beforeEach(() => {
      mockSupabase.range.mockResolvedValue({
        data: [
          { id: 'notif-1', notification_type: 'email', event_type: 'call_complete' },
          { id: 'notif-2', notification_type: 'sms', event_type: 'escalation' },
        ],
        error: null,
        count: 2,
      });
    });

    it('should return notification history', async () => {
      const response = await request(app)
        .get('/api/notifications/history')
        .expect(200);

      expect(response.body.notifications).toBeDefined();
      expect(response.body.notifications).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('should accept limit and offset parameters', async () => {
      await request(app)
        .get('/api/notifications/history?limit=10&offset=20')
        .expect(200);

      expect(mockSupabase.range).toHaveBeenCalledWith(20, 29);
    });

    it('should use default limit and offset', async () => {
      await request(app)
        .get('/api/notifications/history')
        .expect(200);

      expect(mockSupabase.range).toHaveBeenCalledWith(0, 49);
    });

    it('should return 500 on database error', async () => {
      mockSupabase.range.mockResolvedValueOnce({
        data: null,
        error: { message: 'DB error' },
      });

      const response = await request(app)
        .get('/api/notifications/history')
        .expect(500);

      expect(response.body.error.code).toBe('NOTIFICATION_HISTORY_ERROR');
    });
  });
});
