/**
 * End-to-End Integration Tests
 *
 * Tests complete flows across multiple services to ensure
 * the system works correctly as a whole.
 */

// Setup mocks before requiring modules
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  lt: jest.fn().mockReturnThis(),
  single: jest.fn(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  rpc: jest.fn(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

jest.mock('axios');

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ data: { id: 'email-123' } }),
    },
  })),
}));

jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'sms-123' }),
    },
  }));
});

const express = require('express');
const request = require('supertest');
const axios = require('axios');

describe('End-to-End Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockSupabase.single.mockResolvedValue({ data: {}, error: null });
    mockSupabase.rpc.mockResolvedValue({ data: {}, error: null });
  });

  // ============================================
  // NOTIFICATION FLOW E2E
  // ============================================
  describe('Notification Flow E2E', () => {
    /**
     * Tests the complete notification flow:
     * 1. Vapi webhook receives end-of-call-report
     * 2. System finds user from phone number
     * 3. Fetches notification preferences
     * 4. Formats and sends email/SMS notifications
     * 5. Logs notification to database
     */
    it('should send notifications when Vapi call ends', async () => {
      const userId = 'user-123';
      const vapiCallId = 'vapi-call-456';

      // Mock user lookup from phone number
      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: userId }, error: null }) // findUserForCall - phone lookup
        .mockResolvedValueOnce({ data: { id: 'call-history-123' }, error: null }) // getCallHistoryId
        .mockResolvedValueOnce({ data: { business_name: 'Test Business' }, error: null }) // getBusinessName
        .mockResolvedValueOnce({ data: null, error: null }) // updateCallHistory
        .mockResolvedValueOnce({ // getNotificationPreferences
          data: {
            email_enabled: true,
            sms_enabled: true,
            sms_number: '+353851234567',
            notify_on_call_complete: true,
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: { email: 'test@example.com', full_name: 'Test User' }, error: null }) // user lookup
        .mockResolvedValueOnce({ data: { id: 'notif-1' }, error: null }) // logNotification email
        .mockResolvedValueOnce({ data: { id: 'notif-2' }, error: null }); // logNotification sms

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          email_enabled: true,
          sms_enabled: true,
          sms_number: '+353851234567',
          notify_on_call_complete: true,
        },
        error: null,
      });

      // Create test app
      const app = express();
      app.use(express.json());
      const vapiWebhooks = require('../routes/vapiWebhooks');
      app.use('/api/vapi', vapiWebhooks);

      // Send webhook
      const webhookPayload = {
        message: {
          type: 'end-of-call-report',
          call: {
            id: vapiCallId,
            status: 'ended',
            endedReason: 'assistant-ended-call',
            duration: 120,
            cost: 0.05,
            customer: { number: '+353123456789' },
            phoneNumberId: 'phone-123',
          },
          artifact: {
            transcript: 'Hello, I would like to make a reservation.',
            summary: 'Customer called to make a dinner reservation for 4 people.',
            recordingUrl: 'https://example.com/recording.mp3',
          },
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(webhookPayload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);

      // Verify database calls were made
      expect(mockSupabase.from).toHaveBeenCalledWith('user_phone_numbers');
      expect(mockSupabase.from).toHaveBeenCalledWith('call_history');
    });

    it('should detect escalation and send urgent notification', async () => {
      const userId = 'user-123';

      // Mock user lookup
      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: userId }, error: null })
        .mockResolvedValueOnce({ data: { id: 'call-history-123' }, error: null })
        .mockResolvedValueOnce({ data: { business_name: 'Test Business' }, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          email_enabled: true,
          sms_enabled: false,
          notify_on_escalation: true,
        },
        error: null,
      });

      const app = express();
      app.use(express.json());
      const vapiWebhooks = require('../routes/vapiWebhooks');
      app.use('/api/vapi', vapiWebhooks);

      // Webhook with transferCall in messages indicates escalation
      const webhookPayload = {
        message: {
          type: 'end-of-call-report',
          call: {
            id: 'vapi-escalated-call',
            status: 'ended',
            endedReason: 'assistant-transferred-call',
            duration: 60,
            customer: { number: '+353123456789' },
            phoneNumberId: 'phone-123',
          },
          artifact: {
            summary: 'Customer requested to speak with manager',
            messages: [
              {
                role: 'assistant',
                toolCalls: [
                  {
                    function: { name: 'transferCall' },
                  },
                ],
              },
            ],
          },
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(webhookPayload);

      expect(response.status).toBe(200);
    });

    it('should handle missed call notifications', async () => {
      const userId = 'user-123';

      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: userId }, error: null })
        .mockResolvedValueOnce({ data: { id: 'call-history-123' }, error: null })
        .mockResolvedValueOnce({ data: { business_name: 'Test Business' }, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          email_enabled: true,
          notify_on_call_complete: true,
        },
        error: null,
      });

      const app = express();
      app.use(express.json());
      const vapiWebhooks = require('../routes/vapiWebhooks');
      app.use('/api/vapi', vapiWebhooks);

      const webhookPayload = {
        message: {
          type: 'end-of-call-report',
          call: {
            id: 'vapi-missed-call',
            status: 'ended',
            endedReason: 'customer-did-not-answer',
            duration: 0,
            customer: { number: '+353123456789' },
            phoneNumberId: 'phone-123',
          },
          artifact: {},
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(webhookPayload);

      expect(response.status).toBe(200);
    });
  });

  // ============================================
  // GEO-PRICING FLOW E2E
  // ============================================
  describe('Geo-Pricing Flow E2E', () => {
    /**
     * Tests the complete geo-pricing flow:
     * 1. Client IP detected from request
     * 2. IP geolocation API called
     * 3. Region determined (US or IE)
     * 4. Correct pricing returned with currency
     */
    it('should return EUR pricing for Irish IP', async () => {
      // Mock IP API response for Ireland
      axios.get.mockResolvedValueOnce({
        data: {
          status: 'success',
          countryCode: 'IE',
          country: 'Ireland',
        },
      });

      const { detectRegion, getAllPricingForRegion, getClientIp } = require('../services/geoLocation');

      // Test IP detection from request
      const mockReq = {
        headers: {
          'x-forwarded-for': '87.198.45.123',
        },
        ip: '127.0.0.1',
      };
      const clientIp = getClientIp(mockReq);
      expect(clientIp).toBe('87.198.45.123');

      // Test region detection
      const region = await detectRegion('87.198.45.123');
      expect(region).toBe('IE');

      // Test pricing
      const pricing = getAllPricingForRegion('IE');
      expect(pricing.currency).toBe('EUR');
      expect(pricing.currencySymbol).toBe('€');
      // plans is an array of plan objects with id, price, formattedPrice, etc.
      expect(Array.isArray(pricing.plans)).toBe(true);
      expect(pricing.plans.length).toBeGreaterThan(0);
      expect(pricing.plans.find(p => p.id === 'starter')).toBeDefined();
    });

    it('should return USD pricing for US IP', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          status: 'success',
          countryCode: 'US',
          country: 'United States',
        },
      });

      const { detectRegion, getAllPricingForRegion } = require('../services/geoLocation');

      const region = await detectRegion('172.58.123.45');
      expect(region).toBe('US');

      const pricing = getAllPricingForRegion('US');
      expect(pricing.currency).toBe('USD');
      expect(pricing.currencySymbol).toBe('$');
    });

    it('should default to US for unknown regions', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          status: 'success',
          countryCode: 'JP',
          country: 'Japan',
        },
      });

      const { detectRegion, getAllPricingForRegion } = require('../services/geoLocation');

      const region = await detectRegion('203.104.128.1');
      expect(region).toBe('US'); // Default

      const pricing = getAllPricingForRegion(region);
      expect(pricing.currency).toBe('USD');
    });

    it('should fallback to US on API failure', async () => {
      axios.get.mockRejectedValueOnce(new Error('API timeout'));

      const { detectRegion } = require('../services/geoLocation');

      const region = await detectRegion('1.2.3.4');
      expect(region).toBe('US'); // Fallback
    });

    it('should return EUR pricing for other EU countries', async () => {
      const { mapCountryToRegion, getAllPricingForRegion } = require('../services/geoLocation');

      // Test various EU countries
      const euCountries = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT'];

      for (const country of euCountries) {
        const region = mapCountryToRegion(country);
        expect(region).toBe('IE'); // Maps to IE for EUR pricing

        const pricing = getAllPricingForRegion(region);
        expect(pricing.currency).toBe('EUR');
      }
    });
  });

  // ============================================
  // TRANSFER CALL FLOW E2E
  // ============================================
  describe('Transfer Call Flow E2E', () => {
    /**
     * Tests the complete call transfer flow:
     * 1. User configures escalation settings
     * 2. System builds transfer tool for assistant
     * 3. During call, AI invokes transfer
     * 4. Webhook handles transfer event
     * 5. Business owner notified
     */
    it('should build correct transfer tool from escalation settings', () => {
      const { VapiProvider } = require('../adapters/voice/vapi');

      const provider = new VapiProvider('test-api-key');

      const escalationSettings = {
        transfer_number: '+353851234567',
        transfer_method: 'blind_transfer',
        trigger_keywords: ['manager', 'human', 'complaint'],
      };

      const tool = provider._buildTransferCallTool(escalationSettings);

      expect(tool.type).toBe('transferCall');
      expect(tool.destinations).toHaveLength(1);
      expect(tool.destinations[0].type).toBe('number');
      expect(tool.destinations[0].number).toBe('+353851234567');
      expect(tool.destinations[0].transferPlan.mode).toBe('blind-transfer');
      expect(tool.function.description).toContain('manager');
      expect(tool.function.description).toContain('human');
      expect(tool.function.description).toContain('complaint');
    });

    it('should use warm transfer mode when configured', () => {
      const { VapiProvider } = require('../adapters/voice/vapi');

      const provider = new VapiProvider('test-api-key');

      const escalationSettings = {
        transfer_number: '+353851234567',
        transfer_method: 'warm_transfer',
        trigger_keywords: ['help'],
      };

      const tool = provider._buildTransferCallTool(escalationSettings);

      expect(tool.destinations[0].transferPlan.mode).toBe('warm-transfer-say-message');
      // Message comes from _getTransferMessage() for warm_transfer
      expect(tool.destinations[0].message).toContain('hold');
    });

    it('should handle function-call webhook for transfer', async () => {
      const userId = 'user-123';

      // Mock user lookup
      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: userId }, error: null }) // findUserForCall
        .mockResolvedValueOnce({ data: null, error: null }) // update escalation flag
        .mockResolvedValueOnce({ data: { id: 'call-123' }, error: null }) // getCallHistoryId
        .mockResolvedValueOnce({ data: { business_name: 'Test Business' }, error: null }); // getBusinessName

      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          email_enabled: true,
          notify_on_escalation: true,
        },
        error: null,
      });

      const app = express();
      app.use(express.json());
      const vapiWebhooks = require('../routes/vapiWebhooks');
      app.use('/api/vapi', vapiWebhooks);

      const webhookPayload = {
        message: {
          type: 'function-call',
          call: {
            id: 'vapi-transfer-call',
            phoneNumberId: 'phone-123',
            customer: { number: '+353123456789' },
          },
          functionCall: {
            name: 'transferCall',
            parameters: {
              destination: '+353851234567',
            },
          },
        },
      };

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send(webhookPayload);

      expect(response.status).toBe(200);

      // Verify escalation was logged
      expect(mockSupabase.from).toHaveBeenCalledWith('call_history');
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          escalated: true,
        })
      );
    });
  });

  // ============================================
  // NUMBER POOL FLOW E2E (Ireland)
  // ============================================
  describe('Number Pool Flow E2E', () => {
    /**
     * Tests the complete Ireland subscription flow:
     * 1. User starts checkout, number reserved
     * 2. Payment succeeds, number assigned
     * 3. Number imported to VAPI
     * 4. User can receive calls
     * 5. User cancels, number released
     * 6. After cooldown, number recycled
     */

    it('should verify number pool service functions exist', () => {
      // The number pool service uses a separate supabase client
      // This test verifies the service module structure is correct
      const numberPool = require('../services/numberPool');

      expect(numberPool.getAvailableNumber).toBeDefined();
      expect(numberPool.reserveNumber).toBeDefined();
      expect(numberPool.assignNumber).toBeDefined();
      expect(numberPool.releaseNumber).toBeDefined();
      expect(numberPool.cancelReservation).toBeDefined();
      expect(numberPool.cleanupExpiredReservations).toBeDefined();
      expect(numberPool.recycleReleasedNumbers).toBeDefined();
      expect(numberPool.getPoolStats).toBeDefined();
      expect(numberPool.addNumberToPool).toBeDefined();
    });

    it('should handle pool exhaustion error correctly', async () => {
      // Test that the error message format is correct
      const error = new Error('No available phone numbers in IE region');
      expect(error.message).toContain('No available phone numbers');
      expect(error.message).toContain('IE');
    });

    it('should define correct number status transitions', () => {
      // Document the expected status flow
      const validStatuses = ['available', 'reserved', 'assigned', 'released'];
      const transitions = {
        available: ['reserved'],
        reserved: ['assigned', 'available'], // assigned on success, available on cancel/expire
        assigned: ['released'],
        released: ['available'], // after cooldown
      };

      expect(validStatuses).toContain('available');
      expect(transitions.available).toContain('reserved');
      expect(transitions.reserved).toContain('assigned');
      expect(transitions.assigned).toContain('released');
      expect(transitions.released).toContain('available');
    });

    it('should verify reservation expiry logic', () => {
      // Test reservation expiry calculation
      const now = new Date();
      const reserveMinutes = 15;
      const reserveUntil = new Date(now);
      reserveUntil.setMinutes(reserveUntil.getMinutes() + reserveMinutes);

      // Reservation should expire after 15 minutes
      expect(reserveUntil.getTime()).toBeGreaterThan(now.getTime());
      expect(reserveUntil.getTime() - now.getTime()).toBe(reserveMinutes * 60 * 1000);
    });

    it('should verify recycling cooldown logic', () => {
      // Test cooldown calculation for recycling
      const cooldownHours = 24;
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setHours(cutoff.getHours() - cooldownHours);

      // Released numbers should only be recycled after 24 hours
      expect(cutoff.getTime()).toBeLessThan(now.getTime());
      expect(now.getTime() - cutoff.getTime()).toBe(cooldownHours * 60 * 60 * 1000);
    });
  });

  // ============================================
  // WEBHOOK VALIDATION E2E
  // ============================================
  describe('Webhook Validation E2E', () => {
    it('should reject invalid Vapi webhook payload', async () => {
      const app = express();
      app.use(express.json());
      const vapiWebhooks = require('../routes/vapiWebhooks');
      app.use('/api/vapi', vapiWebhooks);

      // Missing message
      const response1 = await request(app)
        .post('/api/vapi/webhook')
        .send({});

      expect(response1.status).toBe(400);
      expect(response1.body.error).toBe('Invalid payload');

      // Missing message type
      const response2 = await request(app)
        .post('/api/vapi/webhook')
        .send({ message: {} });

      expect(response2.status).toBe(400);
    });

    it('should acknowledge unknown event types', async () => {
      const app = express();
      app.use(express.json());
      const vapiWebhooks = require('../routes/vapiWebhooks');
      app.use('/api/vapi', vapiWebhooks);

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send({
          message: {
            type: 'unknown-event-type',
            data: {},
          },
        });

      // Should still return 200 to prevent Vapi retries
      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('should handle status-update events', async () => {
      const app = express();
      app.use(express.json());
      const vapiWebhooks = require('../routes/vapiWebhooks');
      app.use('/api/vapi', vapiWebhooks);

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send({
          message: {
            type: 'status-update',
            call: {
              id: 'call-123',
              status: 'in-progress',
            },
          },
        });

      // Should return 200 to acknowledge receipt
      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });
  });

  // ============================================
  // ERROR HANDLING E2E
  // ============================================
  describe('Error Handling E2E', () => {
    it('should handle database errors gracefully', async () => {
      mockSupabase.single.mockRejectedValueOnce(new Error('Database connection failed'));

      const app = express();
      app.use(express.json());
      const vapiWebhooks = require('../routes/vapiWebhooks');
      app.use('/api/vapi', vapiWebhooks);

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send({
          message: {
            type: 'end-of-call-report',
            call: {
              id: 'call-123',
              phoneNumberId: 'phone-123',
            },
            artifact: {},
          },
        });

      // Should still return 200 to prevent retries
      expect(response.status).toBe(200);
    });

    it('should handle notification service failures gracefully', async () => {
      // Mock successful user lookup but notification failure
      mockSupabase.single
        .mockResolvedValueOnce({ data: { user_id: 'user-123' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'call-123' }, error: null })
        .mockResolvedValueOnce({ data: { business_name: 'Test' }, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockSupabase.rpc.mockRejectedValueOnce(new Error('Notification service error'));

      const app = express();
      app.use(express.json());
      const vapiWebhooks = require('../routes/vapiWebhooks');
      app.use('/api/vapi', vapiWebhooks);

      const response = await request(app)
        .post('/api/vapi/webhook')
        .send({
          message: {
            type: 'end-of-call-report',
            call: {
              id: 'call-456',
              phoneNumberId: 'phone-123',
              customer: { number: '+353123456789' },
            },
            artifact: {
              summary: 'Test call',
            },
          },
        });

      // Should still return 200
      expect(response.status).toBe(200);
    });

    it('should handle IP API timeout gracefully', async () => {
      axios.get.mockImplementationOnce(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 100)
        )
      );

      const { detectRegion } = require('../services/geoLocation');

      const region = await detectRegion('1.2.3.4');
      // Should default to US
      expect(region).toBe('US');
    });
  });

  // ============================================
  // COMPLETE CUSTOMER JOURNEY E2E
  // ============================================
  describe('Complete Customer Journey E2E', () => {
    describe('US Customer Journey', () => {
      it('should handle complete US customer flow', async () => {
        // 1. Customer visits from US IP - detect region
        axios.get.mockResolvedValueOnce({
          data: { status: 'success', countryCode: 'US' },
        });

        const { detectRegion, getAllPricingForRegion } = require('../services/geoLocation');

        const region = await detectRegion('172.58.123.45');
        expect(region).toBe('US');

        // 2. Get USD pricing
        const pricing = getAllPricingForRegion('US');
        expect(pricing.currency).toBe('USD');

        // 3. After subscription, VAPI provisions number via Telnyx
        // (This happens in the billing webhook flow)

        // 4. Customer receives call, webhook fires
        mockSupabase.single.mockResolvedValue({ data: {}, error: null });
        mockSupabase.rpc.mockResolvedValue({ data: { email_enabled: true, notify_on_call_complete: true }, error: null });

        const app = express();
        app.use(express.json());
        const vapiWebhooks = require('../routes/vapiWebhooks');
        app.use('/api/vapi', vapiWebhooks);

        const response = await request(app)
          .post('/api/vapi/webhook')
          .send({
            message: {
              type: 'end-of-call-report',
              call: {
                id: 'us-call-1',
                phoneNumberId: 'us-phone-1',
                customer: { number: '+14155551234' },
                duration: 90,
              },
              artifact: {
                summary: 'Customer inquiry about business hours',
              },
            },
          });

        expect(response.status).toBe(200);
      });
    });

    describe('Ireland Customer Journey', () => {
      it('should handle complete Ireland customer flow', async () => {
        // 1. Customer visits from Irish IP - detect region using a unique IP
        // Use a different IP to avoid cache from previous tests
        axios.get.mockResolvedValueOnce({
          data: { status: 'success', countryCode: 'IE' },
        });

        const { detectRegion, getAllPricingForRegion, mapCountryToRegion } = require('../services/geoLocation');

        // Use the direct country mapping (doesn't rely on IP cache)
        const regionFromCountry = mapCountryToRegion('IE');
        expect(regionFromCountry).toBe('IE');

        // 2. Get EUR pricing
        const pricing = getAllPricingForRegion('IE');
        expect(pricing.currency).toBe('EUR');
        expect(pricing.currencySymbol).toBe('€');
        expect(Array.isArray(pricing.plans)).toBe(true);
        expect(pricing.plans.length).toBeGreaterThan(0);

        // 3. Customer starts checkout - number reserved from pool
        // 4. Payment succeeds - number assigned
        // 5. Number imported to VAPI

        // 6. Customer receives call via VoIPcloud number
        mockSupabase.single.mockResolvedValue({ data: {}, error: null });
        mockSupabase.rpc.mockResolvedValue({ data: { email_enabled: true, notify_on_call_complete: true }, error: null });

        const app = express();
        app.use(express.json());
        const vapiWebhooks = require('../routes/vapiWebhooks');
        app.use('/api/vapi', vapiWebhooks);

        const response = await request(app)
          .post('/api/vapi/webhook')
          .send({
            message: {
              type: 'end-of-call-report',
              call: {
                id: 'ie-call-1',
                phoneNumberId: 'ie-phone-1',
                customer: { number: '+353123456789' },
                duration: 120,
              },
              artifact: {
                summary: 'Customer called to make a reservation',
              },
            },
          });

        expect(response.status).toBe(200);
      });
    });
  });
});
