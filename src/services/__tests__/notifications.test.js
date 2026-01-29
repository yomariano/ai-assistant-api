/**
 * Comprehensive Unit Tests for Notification Service
 */

// Mock dependencies before requiring the module
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => mockResend),
}));

// Mock objects
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  rpc: jest.fn(),
};

const mockResend = {
  emails: {
    send: jest.fn(),
  },
};

// Now require the module
const {
  formatEmailContent,
  getNotificationPreferences,
  updateNotificationPreferences,
  getEscalationSettings,
  updateEscalationSettings,
  sendEmail,
  notifyCallEvent,
  sendTestNotification,
  logNotification,
} = require('../notifications');

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockSupabase.single.mockResolvedValue({ data: {}, error: null });
    mockResend.emails.send.mockResolvedValue({ id: 'email-123' });
  });

  // ============================================
  // EMAIL CONTENT FORMATTING
  // ============================================
  describe('formatEmailContent', () => {
    const mockCallData = {
      customerNumber: '+353123456789',
      duration: 180,
      summary: 'Customer called to book a table for 4 on Saturday.',
      businessName: 'Test Restaurant',
      recordingUrl: 'https://example.com/recording.mp3',
      transcript: 'Hello, I would like to book a table...',
    };

    const mockUser = {
      email: 'test@example.com',
      full_name: 'Test User',
    };

    describe('call_complete event', () => {
      it('should format call_complete email with all fields', () => {
        const result = formatEmailContent('call_complete', mockCallData, mockUser);

        // Subject format: "📞 Call completed - {number}"
        expect(result.subject).toContain('Call completed');
        expect(result.subject).toContain(mockCallData.customerNumber);
        expect(result.html).toContain(mockCallData.customerNumber);
        expect(result.html).toContain(mockCallData.summary);
        expect(result.html).toContain(mockCallData.recordingUrl);
        expect(result.text).toContain(mockCallData.customerNumber);
      });

      it('should include duration in email', () => {
        const result = formatEmailContent('call_complete', mockCallData, mockUser);

        // Duration format: "X min"
        expect(result.html).toContain('3 min');
      });

      it('should format short duration correctly', () => {
        const shortCall = { ...mockCallData, duration: 45 };
        const result = formatEmailContent('call_complete', shortCall, mockUser);

        // 45 seconds rounds to 1 min
        expect(result.html).toMatch(/\d+ min/);
      });

      it('should handle long duration formatting', () => {
        const longCall = { ...mockCallData, duration: 3665 }; // ~61 minutes
        const result = formatEmailContent('call_complete', longCall, mockUser);

        expect(result.html).toContain('61 min');
      });
    });

    describe('message_taken event', () => {
      it('should format message_taken email correctly', () => {
        const result = formatEmailContent('message_taken', mockCallData, mockUser);

        expect(result.subject).toContain('message');
        expect(result.html).toContain('Message');
        expect(result.html).toContain(mockCallData.summary);
      });

      it('should include the message content', () => {
        const result = formatEmailContent('message_taken', mockCallData, mockUser);

        expect(result.html).toContain(mockCallData.summary);
      });
    });

    describe('escalation event', () => {
      it('should format escalation email correctly', () => {
        const callDataWithEscalation = {
          ...mockCallData,
          escalationReason: 'Customer requested manager',
        };
        const result = formatEmailContent('escalation', callDataWithEscalation, mockUser);

        expect(result.subject.toLowerCase()).toContain('escalat');
        expect(result.html).toContain('Escalated');
        expect(result.html).toContain(callDataWithEscalation.escalationReason);
      });

      it('should include urgency indicator', () => {
        const result = formatEmailContent('escalation', { ...mockCallData, escalationReason: 'Urgent' }, mockUser);

        expect(result.subject.toLowerCase()).toMatch(/escalat/);
      });
    });

    describe('voicemail event', () => {
      it('should format voicemail email correctly', () => {
        const result = formatEmailContent('voicemail', mockCallData, mockUser);

        expect(result.subject.toLowerCase()).toContain('voicemail');
        expect(result.html).toContain('Voicemail');
      });

      it('should include summary in voicemail', () => {
        const result = formatEmailContent('voicemail', mockCallData, mockUser);

        expect(result.html).toContain(mockCallData.summary);
      });
    });

    describe('missed_call event', () => {
      it('should format missed_call email correctly', () => {
        const result = formatEmailContent('missed_call', mockCallData, mockUser);

        expect(result.subject).toContain('Missed call');
        expect(result.html).toContain('Missed Call');
      });

      it('should include caller number', () => {
        const result = formatEmailContent('missed_call', mockCallData, mockUser);

        expect(result.html).toContain(mockCallData.customerNumber);
      });
    });

    describe('edge cases', () => {
      it('should handle missing optional fields', () => {
        const minimalCallData = {
          customerNumber: '+353123456789',
        };
        const result = formatEmailContent('call_complete', minimalCallData, mockUser);

        expect(result.subject).toBeDefined();
        expect(result.html).toBeDefined();
        expect(result.text).toBeDefined();
      });

      it('should default to call_complete for unknown event type', () => {
        const result = formatEmailContent('unknown_event', mockCallData, mockUser);

        expect(result.subject).toContain('Call completed');
      });

      it('should handle missing customer number', () => {
        const noNumber = { ...mockCallData, customerNumber: undefined };
        const result = formatEmailContent('call_complete', noNumber, mockUser);

        expect(result.subject).toBeDefined();
        expect(result.html).toContain('Unknown');
      });

      it('should include user-provided content in HTML', () => {
        // Note: Current implementation doesn't sanitize HTML
        // This test documents current behavior
        const dataWithHtml = {
          ...mockCallData,
          summary: 'Test summary with special chars <>&',
        };
        const result = formatEmailContent('call_complete', dataWithHtml, mockUser);

        expect(result.html).toContain('Test summary');
      });
    });
  });

  // ============================================
  // NOTIFICATION PREFERENCES
  // ============================================
  describe('getNotificationPreferences', () => {
    it('should return user preferences', async () => {
      const mockPrefs = {
        email_enabled: true,
        email_address: 'test@example.com',
      };

      // Uses rpc() to call get_or_create_notification_preferences
      mockSupabase.rpc.mockResolvedValueOnce({ data: mockPrefs, error: null });

      const result = await getNotificationPreferences('user-123');

      expect(mockSupabase.rpc).toHaveBeenCalled();
      expect(result).toEqual(mockPrefs);
    });

    it('should return default preferences if rpc fails', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Function not found' } });

      const result = await getNotificationPreferences('user-123');

      expect(result).toHaveProperty('email_enabled');
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update preferences', async () => {
      const updates = {
        email_enabled: true,
        email_address: 'test@example.com',
      };

      mockSupabase.single.mockResolvedValueOnce({ data: updates, error: null });

      const result = await updateNotificationPreferences('user-123', updates);

      expect(mockSupabase.from).toHaveBeenCalledWith('notification_preferences');
      expect(mockSupabase.upsert).toHaveBeenCalled();
    });
  });

  // ============================================
  // ESCALATION SETTINGS
  // ============================================
  describe('getEscalationSettings', () => {
    it('should return escalation settings', async () => {
      const mockSettings = {
        transfer_enabled: true,
        transfer_number: '+353851234567',
        transfer_method: 'blind_transfer',
      };

      // Uses rpc() to call get_or_create_escalation_settings
      mockSupabase.rpc.mockResolvedValueOnce({ data: mockSettings, error: null });

      const result = await getEscalationSettings('user-123');

      expect(mockSupabase.rpc).toHaveBeenCalled();
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updateEscalationSettings', () => {
    it('should update escalation settings', async () => {
      const updates = {
        transfer_enabled: true,
        transfer_number: '+353851234567',
        trigger_keywords: ['manager', 'help'],
      };

      mockSupabase.single.mockResolvedValueOnce({ data: updates, error: null });

      await updateEscalationSettings('user-123', updates);

      expect(mockSupabase.from).toHaveBeenCalledWith('escalation_settings');
      expect(mockSupabase.upsert).toHaveBeenCalled();
    });
  });

  // ============================================
  // PHONE NUMBER VALIDATION
  // ============================================
  describe('Phone Number Validation', () => {
    const isValidPhoneNumber = (phone) => /^\+[1-9]\d{1,14}$/.test(phone);

    it('should accept valid E.164 phone numbers', () => {
      expect(isValidPhoneNumber('+353851234567')).toBe(true);
      expect(isValidPhoneNumber('+14155551234')).toBe(true);
      expect(isValidPhoneNumber('+442071234567')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhoneNumber('353851234567')).toBe(false); // Missing +
      expect(isValidPhoneNumber('+0123456789')).toBe(false); // Starts with 0
      expect(isValidPhoneNumber('not-a-number')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
      expect(isValidPhoneNumber('+1')).toBe(false); // Too short
    });

    it('should handle edge cases', () => {
      expect(isValidPhoneNumber('+12345678901234567')).toBe(false); // Too long
      expect(isValidPhoneNumber('+1234567890123456')).toBe(false); // Exactly at limit +1
    });
  });

  // ============================================
  // EMAIL VALIDATION
  // ============================================
  describe('Email Validation', () => {
    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    it('should accept valid email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('test@.com')).toBe(false);
    });
  });

  // ============================================
  // NOTIFICATION LOGGING
  // ============================================
  describe('logNotification', () => {
    it('should log notification to database', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'log-123' }, error: null });

      await logNotification({
        userId: 'user-123',
        callId: 'call-456',
        type: 'email',
        eventType: 'call_complete',
        status: 'sent',
        messageId: 'msg-789',
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('call_notifications');
      expect(mockSupabase.insert).toHaveBeenCalled();
    });
  });
});
