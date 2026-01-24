/**
 * Email Service Tests
 */

// Set environment variables before import
process.env.RESEND_API_KEY = 'test_api_key';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_key';
process.env.FRONTEND_URL = 'https://voicefleet.ai';

// Create mock send function
const mockSendEmail = jest.fn().mockResolvedValue({ data: { id: 'msg_test123' } });

// Mock dependencies before importing
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSendEmail,
    },
  })),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: 'user-123',
              email: 'test@example.com',
              full_name: 'Test User',
            },
          }),
        }),
      }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

const emailService = require('../emailService');

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Templates', () => {
    describe('welcomeEmailTemplate', () => {
      it('should generate welcome email with correct plan details', () => {
        const result = emailService.welcomeEmailTemplate({
          userName: 'John Doe',
          planId: 'starter',
        });

        expect(result.subject).toContain('Welcome to OrderBot');
        expect(result.html).toContain('Welcome to OrderBot');
        expect(result.html).toContain('John');
        expect(result.html).toContain('Starter');
        expect(result.html).toContain('€49/month');
        expect(result.html).toContain('100 calls/month');
        expect(result.text).toContain('Welcome to OrderBot');
      });

      it('should use first name only for greeting', () => {
        const result = emailService.welcomeEmailTemplate({
          userName: 'John Michael Doe',
          planId: 'growth',
        });

        expect(result.html).toContain('Hi John,');
      });

      it('should handle missing username gracefully', () => {
        const result = emailService.welcomeEmailTemplate({
          userName: null,
          planId: 'pro',
        });

        expect(result.html).toContain('Hi there,');
      });

      it('should show correct details for Growth plan', () => {
        const result = emailService.welcomeEmailTemplate({
          userName: 'Jane',
          planId: 'growth',
        });

        expect(result.html).toContain('Growth');
        expect(result.html).toContain('€199/month');
        expect(result.html).toContain('500 calls/month');
      });

      it('should show correct details for Pro plan', () => {
        const result = emailService.welcomeEmailTemplate({
          userName: 'Jane',
          planId: 'pro',
        });

        expect(result.html).toContain('Pro');
        expect(result.html).toContain('€599/month');
        expect(result.html).toContain('1500 inbound + 200 outbound');
      });
    });

    describe('subscriptionConfirmationTemplate', () => {
      it('should generate confirmation email with payment details', () => {
        const result = emailService.subscriptionConfirmationTemplate({
          userName: 'John Doe',
          planId: 'growth',
          amount: 19900,
          currency: 'eur',
          nextBillingDate: '2025-02-01T00:00:00.000Z',
          invoiceUrl: 'https://invoice.stripe.com/i/test123',
        });

        expect(result.subject).toContain('Payment confirmed');
        expect(result.html).toContain('Payment Confirmed');
        expect(result.html).toContain('€199.00');
        expect(result.html).toContain('Growth');
        expect(result.html).toContain('1 February 2025');
        expect(result.html).toContain('View Invoice');
        expect(result.html).toContain('https://invoice.stripe.com/i/test123');
      });

      it('should format USD amounts correctly', () => {
        const result = emailService.subscriptionConfirmationTemplate({
          userName: 'Jane',
          planId: 'starter',
          amount: 4900,
          currency: 'usd',
          nextBillingDate: '2025-03-15T00:00:00.000Z',
        });

        expect(result.html).toContain('$49.00');
      });

      it('should handle missing invoice URL', () => {
        const result = emailService.subscriptionConfirmationTemplate({
          userName: 'Jane',
          planId: 'starter',
          amount: 4900,
          currency: 'eur',
          nextBillingDate: '2025-03-15T00:00:00.000Z',
          invoiceUrl: null,
        });

        expect(result.html).not.toContain('View Invoice');
      });
    });

    describe('paymentFailedTemplate', () => {
      it('should generate payment failed email with retry date', () => {
        const result = emailService.paymentFailedTemplate({
          userName: 'John',
          planId: 'growth',
          amount: 19900,
          currency: 'eur',
          retryDate: '2025-01-15T00:00:00.000Z',
        });

        expect(result.subject).toContain('Payment failed');
        expect(result.html).toContain('Payment Failed');
        expect(result.html).toContain('€199.00');
        expect(result.html).toContain('Update Payment Method');
        // Date should be formatted (format may vary by locale - "15/1/2025" or "15/01/2025")
        expect(result.html).toMatch(/15\/1\/2025|15\/01\/2025|January.*15|15.*January/);
      });

      it('should handle missing retry date', () => {
        const result = emailService.paymentFailedTemplate({
          userName: 'John',
          planId: 'starter',
          amount: 4900,
          currency: 'eur',
          retryDate: null,
        });

        expect(result.html).not.toContain('automatically retry');
      });
    });

    describe('subscriptionCancelledTemplate', () => {
      it('should generate cancellation email with end date', () => {
        const result = emailService.subscriptionCancelledTemplate({
          userName: 'John',
          planId: 'pro',
          endDate: '2025-01-31T23:59:59.000Z',
        });

        expect(result.subject).toContain('cancelled');
        expect(result.html).toContain('Subscription Cancelled');
        expect(result.html).toContain('Pro');
        expect(result.html).toContain('31 January 2025');
        expect(result.html).toContain('Resubscribe');
      });
    });
  });

  describe('sendTransactionalEmail', () => {
    it('should send email successfully', async () => {
      mockSendEmail.mockResolvedValueOnce({ data: { id: 'msg_test123' } });

      const result = await emailService.sendTransactionalEmail('test@example.com', {
        subject: 'Test Subject',
        html: '<p>Test body</p>',
        text: 'Test body',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg_test123');
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Test Subject',
        })
      );
    });

    it('should handle send errors', async () => {
      mockSendEmail.mockRejectedValueOnce(new Error('API Error'));

      const result = await emailService.sendTransactionalEmail('test@example.com', {
        subject: 'Test Subject',
        html: '<p>Test body</p>',
        text: 'Test body',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should fetch user and send welcome email', async () => {
      const result = await emailService.sendWelcomeEmail('user-123', {
        planId: 'growth',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('sendSubscriptionConfirmation', () => {
    it('should send subscription confirmation email', async () => {
      const result = await emailService.sendSubscriptionConfirmation('user-123', {
        planId: 'starter',
        amount: 4900,
        currency: 'eur',
        nextBillingDate: '2025-02-01',
        invoiceUrl: 'https://invoice.stripe.com/test',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('sendPaymentFailedEmail', () => {
    it('should send payment failed email', async () => {
      const result = await emailService.sendPaymentFailedEmail('user-123', {
        planId: 'growth',
        amount: 19900,
        currency: 'eur',
        retryDate: '2025-01-15',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('sendSubscriptionCancelledEmail', () => {
    it('should send cancellation email', async () => {
      const result = await emailService.sendSubscriptionCancelledEmail('user-123', {
        planId: 'pro',
        endDate: '2025-01-31',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('Email Template Structure', () => {
  it('all templates should have subject, html, and text properties', () => {
    const templates = [
      emailService.welcomeEmailTemplate({ userName: 'Test', planId: 'starter' }),
      emailService.subscriptionConfirmationTemplate({
        userName: 'Test',
        planId: 'starter',
        amount: 4900,
        currency: 'eur',
        nextBillingDate: '2025-02-01',
      }),
      emailService.paymentFailedTemplate({
        userName: 'Test',
        planId: 'starter',
        amount: 4900,
        currency: 'eur',
      }),
      emailService.subscriptionCancelledTemplate({
        userName: 'Test',
        planId: 'starter',
        endDate: '2025-01-31',
      }),
    ];

    templates.forEach((template) => {
      expect(template).toHaveProperty('subject');
      expect(template).toHaveProperty('html');
      expect(template).toHaveProperty('text');
      expect(typeof template.subject).toBe('string');
      expect(typeof template.html).toBe('string');
      expect(typeof template.text).toBe('string');
    });
  });

  it('all HTML templates should have OrderBot branding', () => {
    const templates = [
      emailService.welcomeEmailTemplate({ userName: 'Test', planId: 'starter' }),
      emailService.subscriptionConfirmationTemplate({
        userName: 'Test',
        planId: 'starter',
        amount: 4900,
        currency: 'eur',
        nextBillingDate: '2025-02-01',
      }),
      emailService.paymentFailedTemplate({
        userName: 'Test',
        planId: 'starter',
        amount: 4900,
        currency: 'eur',
      }),
      emailService.subscriptionCancelledTemplate({
        userName: 'Test',
        planId: 'starter',
        endDate: '2025-01-31',
      }),
    ];

    templates.forEach((template) => {
      expect(template.html).toContain('OrderBot');
      expect(template.html).toContain('AI Voice Assistant for Restaurants');
      expect(template.html).toContain('voicefleet.ai');
    });
  });

  it('all templates should have dashboard links', () => {
    const welcome = emailService.welcomeEmailTemplate({
      userName: 'Test',
      planId: 'starter',
    });

    expect(welcome.html).toContain('/dashboard');
  });

  it('billing-related templates should have billing links', () => {
    const confirmation = emailService.subscriptionConfirmationTemplate({
      userName: 'Test',
      planId: 'starter',
      amount: 4900,
      currency: 'eur',
      nextBillingDate: '2025-02-01',
    });
    const paymentFailed = emailService.paymentFailedTemplate({
      userName: 'Test',
      planId: 'starter',
      amount: 4900,
      currency: 'eur',
    });
    const cancelled = emailService.subscriptionCancelledTemplate({
      userName: 'Test',
      planId: 'starter',
      endDate: '2025-01-31',
    });

    expect(confirmation.html).toContain('/billing');
    expect(paymentFailed.html).toContain('/billing');
    expect(cancelled.html).toContain('/billing');
  });
});
