/**
 * Comprehensive Unit Tests for Vapi Webhooks
 */

const express = require('express');
const request = require('supertest');

// Mock dependencies
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

jest.mock('../../services/notifications', () => mockNotificationService);

// Mock objects
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
};

const mockNotificationService = {
  notifyCallEvent: jest.fn().mockResolvedValue({ success: true }),
  getNotificationPreferences: jest.fn(),
};

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  const vapiWebhooks = require('../vapiWebhooks');
  app.use('/api/vapi', vapiWebhooks);
  return app;
};

describe('Vapi Webhooks', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();

    // Default mock responses
    mockSupabase.single.mockResolvedValue({ data: { user_id: 'user-123' }, error: null });
  });

  // ============================================
  // WEBHOOK ENDPOINT
  // ============================================
  describe('POST /api/vapi/webhook', () => {
    it('should accept valid webhook payload', async () => {
      const payload = {
        message: {
          type: 'status-update',
          call: { id: 'call-123', status: 'in-progress' },
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should reject payload without message', async () => {
      const response = await request(app)
        .post('/api/vapi/webhook')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Invalid payload');
    });

    it('should reject payload without message type', async () => {
      const response = await request(app)
        .post('/api/vapi/webhook')
        .send({ message: {} })
        .expect(400);

      expect(response.body.error).toBe('Invalid payload');
    });

    it('should handle unrecognized event types gracefully', async () => {
      const payload = {
        message: {
          type: 'unknown-event-type',
          call: { id: 'call-123' },
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should return 200 even on processing errors to prevent retries', async () => {
      mockSupabase.single.mockRejectedValueOnce(new Error('DB error'));

      const payload = {
        message: {
          type: 'end-of-call-report',
          call: { id: 'call-123' },
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });
  });

  // ============================================
  // END-OF-CALL-REPORT HANDLER
  // ============================================
  describe('end-of-call-report event', () => {
    const createEndOfCallPayload = (overrides = {}) => ({
      message: {
        type: 'end-of-call-report',
        call: {
          id: 'call-123',
          status: 'ended',
          endedReason: 'customer-ended-call',
          duration: 180,
          cost: 0.15,
          phoneNumberId: 'phone-456',
          customer: { number: '+353851234567' },
          ...overrides.call,
        },
        artifact: {
          transcript: 'Hello, this is a test call...',
          summary: 'Customer inquired about business hours.',
          recordingUrl: 'https://example.com/recording.mp3',
          messages: [],
          ...overrides.artifact,
        },
      },
    });

    it('should process end-of-call-report successfully', async () => {
      const payload = createEndOfCallPayload();

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should trigger notification on call completion', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null }) // findUserForCall
        .mockResolvedValueOnce({ data: { id: 'history-123' }, error: null }) // getCallHistoryId
        .mockResolvedValueOnce({ data: { business_name: 'Test Biz' }, error: null }); // getBusinessName

      const payload = createEndOfCallPayload();

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockNotificationService.notifyCallEvent).toHaveBeenCalled();
    });

    it('should detect missed call event type', async () => {
      const payload = createEndOfCallPayload({
        call: { endedReason: 'customer-did-not-answer' },
      });

      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'history-123' }, error: null })
        .mockResolvedValueOnce({ data: { business_name: 'Test Biz' }, error: null });

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockNotificationService.notifyCallEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'missed_call',
        })
      );
    });

    it('should detect voicemail event type', async () => {
      const payload = createEndOfCallPayload({
        call: { endedReason: 'voicemail' },
      });

      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'history-123' }, error: null })
        .mockResolvedValueOnce({ data: { business_name: 'Test Biz' }, error: null });

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockNotificationService.notifyCallEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'voicemail',
        })
      );
    });

    it('should detect escalation from transfer tool call', async () => {
      const payload = createEndOfCallPayload({
        artifact: {
          messages: [
            {
              toolCalls: [
                { function: { name: 'transferCall' } },
              ],
            },
          ],
        },
      });

      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'history-123' }, error: null })
        .mockResolvedValueOnce({ data: { business_name: 'Test Biz' }, error: null });

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockNotificationService.notifyCallEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'escalation',
        })
      );
    });

    it('should handle missing call data gracefully', async () => {
      const payload = {
        message: {
          type: 'end-of-call-report',
          // No call object
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(mockNotificationService.notifyCallEvent).not.toHaveBeenCalled();
    });

    it('should handle user not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      const payload = createEndOfCallPayload();

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });
  });

  // ============================================
  // STATUS-UPDATE HANDLER
  // ============================================
  describe('status-update event', () => {
    it('should update call status in database', async () => {
      const payload = {
        message: {
          type: 'status-update',
          call: {
            id: 'call-123',
            status: 'in-progress',
          },
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('call_history');
      expect(mockSupabase.update).toHaveBeenCalled();
    });

    it('should map Vapi status to internal status', async () => {
      const statusMappings = [
        { vapi: 'queued', internal: 'initiated' },
        { vapi: 'ringing', internal: 'ringing' },
        { vapi: 'in-progress', internal: 'in-progress' },
        { vapi: 'forwarding', internal: 'forwarding' },
        { vapi: 'ended', internal: 'completed' },
      ];

      for (const mapping of statusMappings) {
        jest.clearAllMocks();

        const payload = {
          message: {
            type: 'status-update',
            call: { id: 'call-123', status: mapping.vapi },
          },
        };

        await request(app)
          .post('/api/vapi/webhook')
          .send(payload)
          .expect(200);
      }
    });

    it('should handle missing call in status update', async () => {
      const payload = {
        message: {
          type: 'status-update',
          // No call object
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });
  });

  // ============================================
  // TRANSCRIPT HANDLER
  // ============================================
  describe('transcript event', () => {
    it('should update transcript in database', async () => {
      const payload = {
        message: {
          type: 'transcript',
          call: { id: 'call-123' },
          artifact: {
            transcript: 'Updated transcript content...',
          },
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('call_history');
      expect(mockSupabase.update).toHaveBeenCalled();
    });

    it('should handle missing transcript gracefully', async () => {
      const payload = {
        message: {
          type: 'transcript',
          call: { id: 'call-123' },
          artifact: {},
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });
  });

  // ============================================
  // FUNCTION-CALL HANDLER
  // ============================================
  describe('function-call event', () => {
    it('should handle transferCall function', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null }) // findUserForCall
        .mockResolvedValueOnce({ data: { id: 'history-123' }, error: null }) // getCallHistoryId
        .mockResolvedValueOnce({ data: { business_name: 'Test Biz' }, error: null }); // getBusinessName

      const payload = {
        message: {
          type: 'function-call',
          call: {
            id: 'call-123',
            phoneNumberId: 'phone-456',
            customer: { number: '+353851234567' },
          },
          functionCall: {
            name: 'transferCall',
            parameters: { reason: 'Customer requested manager' },
          },
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('call_history');
      expect(mockSupabase.update).toHaveBeenCalled();
    });

    it('should log escalation reason', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null });

      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-123', phoneNumberId: 'phone-456' },
          functionCall: {
            name: 'transferCall',
            parameters: { reason: 'Urgent issue' },
          },
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          escalated: true,
        })
      );
    });

    it('should send immediate escalation notification', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'history-123' }, error: null })
        .mockResolvedValueOnce({ data: { business_name: 'Test Biz' }, error: null });

      const payload = {
        message: {
          type: 'function-call',
          call: {
            id: 'call-123',
            phoneNumberId: 'phone-456',
            customer: { number: '+353851234567' },
          },
          functionCall: { name: 'transferCall' },
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockNotificationService.notifyCallEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'escalation',
        })
      );
    });

    it('should ignore non-transfer function calls', async () => {
      const payload = {
        message: {
          type: 'function-call',
          call: { id: 'call-123' },
          functionCall: {
            name: 'someOtherFunction',
          },
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockNotificationService.notifyCallEvent).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // HANG EVENT HANDLER
  // ============================================
  describe('hang event', () => {
    it('should update call as ended', async () => {
      const payload = {
        message: {
          type: 'hang',
          call: { id: 'call-123' },
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('call_history');
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ended',
        })
      );
    });
  });

  // ============================================
  // SPEECH-UPDATE EVENT (IGNORED)
  // ============================================
  describe('speech-update event', () => {
    it('should ignore speech updates', async () => {
      const payload = {
        message: {
          type: 'speech-update',
          call: { id: 'call-123' },
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
      // Should not update database for speech updates
    });
  });

  // ============================================
  // USER LOOKUP
  // ============================================
  describe('User lookup (findUserForCall)', () => {
    it('should find user by phone number ID', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { user_id: 'user-123' },
        error: null,
      });

      const payload = {
        message: {
          type: 'end-of-call-report',
          call: {
            id: 'call-123',
            phoneNumberId: 'phone-456',
          },
          artifact: {},
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('user_phone_numbers');
    });

    it('should fallback to call history lookup', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: null }) // phone number lookup fails
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null }); // call history lookup succeeds

      const payload = {
        message: {
          type: 'end-of-call-report',
          call: { id: 'call-123' },
          artifact: {},
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('call_history');
    });

    it('should fallback to assistant lookup', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: null, error: null }) // phone number lookup fails
        .mockResolvedValueOnce({ data: null, error: null }) // call history lookup fails
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null }); // assistant lookup succeeds

      const payload = {
        message: {
          type: 'end-of-call-report',
          call: {
            id: 'call-123',
            assistantId: 'assistant-789',
          },
          artifact: {},
        },
      };

      await request(app)
        .post('/api/vapi/webhook')
        .send(payload)
        .expect(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('user_assistants');
    });
  });
});
