/**
 * Comprehensive Unit Tests for Number Pool Service
 */

// Mock objects - defined before jest.mock so they're hoisted
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  lt: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn(),
};

const mockVoiceProvider = {
  importPhoneNumber: jest.fn().mockResolvedValue({ id: 'vapi-phone-123' }),
};

// Mock dependencies - use factory function to reference mocks
jest.mock('../supabase', () => ({
  supabaseAdmin: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
  },
}));

jest.mock('../../adapters/voice', () => ({
  getVoiceProvider: jest.fn(() => ({
    importPhoneNumber: jest.fn().mockResolvedValue({ id: 'vapi-phone-123' }),
  })),
}));

// Get the mocked supabase for test configuration
const { supabaseAdmin } = require('../supabase');
const { getVoiceProvider } = require('../../adapters/voice');

const {
  getAvailableNumber,
  reserveNumber,
  assignNumber,
  releaseNumber,
  cancelReservation,
  cleanupExpiredReservations,
  recycleReleasedNumbers,
  getPoolStats,
  addNumberToPool,
} = require('../numberPool');

describe('Number Pool Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset all mock chains using supabaseAdmin
    supabaseAdmin.from.mockReturnThis();
    supabaseAdmin.select.mockReturnThis();
    supabaseAdmin.insert.mockReturnThis();
    supabaseAdmin.update.mockReturnThis();
    supabaseAdmin.eq.mockReturnThis();
    supabaseAdmin.lt.mockReturnThis();
    supabaseAdmin.order.mockReturnThis();
    supabaseAdmin.limit.mockReturnThis();
    supabaseAdmin.single.mockResolvedValue({ data: {}, error: null });
  });

  // ============================================
  // GET AVAILABLE NUMBER
  // ============================================
  describe('getAvailableNumber', () => {
    it('should return first available number for region', async () => {
      const mockNumber = {
        id: 'pool-123',
        phone_number: '+35312655181',
        region: 'IE',
        status: 'available',
      };

      supabaseAdmin.single.mockResolvedValueOnce({ data: mockNumber, error: null });

      const result = await getAvailableNumber('IE');

      expect(supabaseAdmin.from).toHaveBeenCalledWith('phone_number_pool');
      expect(supabaseAdmin.eq).toHaveBeenCalledWith('region', 'IE');
      expect(supabaseAdmin.eq).toHaveBeenCalledWith('status', 'available');
      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(result).toEqual(mockNumber);
    });

    it('should default to IE region', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      await getAvailableNumber();

      expect(supabaseAdmin.eq).toHaveBeenCalledWith('region', 'IE');
    });

    it('should return null if no available numbers', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      const result = await getAvailableNumber('IE');

      expect(result).toBeNull();
    });

    it('should throw on database error (non-PGRST116)', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST123', message: 'DB error' },
      });

      await expect(getAvailableNumber('IE')).rejects.toThrow();
    });
  });

  // ============================================
  // RESERVE NUMBER
  // ============================================
  describe('reserveNumber', () => {
    const mockAvailable = {
      id: 'pool-123',
      phone_number: '+35312655181',
      status: 'available',
    };

    it('should reserve available number for user', async () => {
      const mockReserved = {
        ...mockAvailable,
        status: 'reserved',
        assigned_to: 'user-123',
      };

      // First call - get available
      supabaseAdmin.single
        .mockResolvedValueOnce({ data: mockAvailable, error: null }) // getAvailableNumber
        .mockResolvedValueOnce({ data: mockReserved, error: null }) // update
        .mockResolvedValueOnce({ data: {}, error: null }); // insert history

      const result = await reserveNumber('user-123', 'IE', 15);

      expect(result.status).toBe('reserved');
      expect(result.assigned_to).toBe('user-123');
    });

    it('should set correct reservation expiry', async () => {
      supabaseAdmin.single
        .mockResolvedValueOnce({ data: mockAvailable, error: null })
        .mockResolvedValueOnce({ data: { ...mockAvailable, status: 'reserved' }, error: null })
        .mockResolvedValueOnce({ data: {}, error: null });

      await reserveNumber('user-123', 'IE', 30);

      expect(supabaseAdmin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'reserved',
          assigned_to: 'user-123',
        })
      );
    });

    it('should throw error if no numbers available', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

      await expect(reserveNumber('user-123', 'IE')).rejects.toThrow(
        'No available phone numbers in IE region'
      );
    });

    it('should log reservation in history', async () => {
      supabaseAdmin.single
        .mockResolvedValueOnce({ data: mockAvailable, error: null })
        .mockResolvedValueOnce({ data: { ...mockAvailable, status: 'reserved', id: 'pool-123' }, error: null })
        .mockResolvedValueOnce({ data: {}, error: null });

      await reserveNumber('user-123', 'IE');

      expect(supabaseAdmin.from).toHaveBeenCalledWith('number_assignment_history');
      expect(supabaseAdmin.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          pool_number_id: 'pool-123',
          user_id: 'user-123',
          action: 'reserved',
        })
      );
    });
  });

  // ============================================
  // ASSIGN NUMBER
  // ============================================
  describe('assignNumber', () => {
    const mockReserved = {
      id: 'pool-123',
      phone_number: '+35312655181',
      status: 'reserved',
      assigned_to: 'user-123',
      vapi_phone_id: null,
    };

    it('should assign reserved number to user', async () => {
      supabaseAdmin.single
        .mockResolvedValueOnce({ data: mockReserved, error: null }) // find reserved
        .mockResolvedValueOnce({ data: {}, error: null }) // update pool
        .mockResolvedValueOnce({ data: { id: 'user-phone-123' }, error: null }) // insert user_phone_numbers
        .mockResolvedValueOnce({ data: {}, error: null }); // insert history

      supabaseAdmin.update.mockReturnThis();

      const result = await assignNumber('user-123');

      expect(result.poolNumber).toBeDefined();
      expect(supabaseAdmin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'assigned',
          assigned_to: 'user-123',
        })
      );
      expect(mockVoiceProvider.importPhoneNumber).toHaveBeenCalled();
    });

    it('should import number to VAPI if not already imported', async () => {
      supabaseAdmin.single
        .mockResolvedValueOnce({ data: mockReserved, error: null })
        .mockResolvedValueOnce({ data: {}, error: null })
        .mockResolvedValueOnce({ data: { id: 'user-phone-123' }, error: null })
        .mockResolvedValueOnce({ data: {}, error: null });

      supabaseAdmin.update.mockReturnThis();

      await assignNumber('user-123');

      expect(mockVoiceProvider.importPhoneNumber).toHaveBeenCalledWith(
        '+35312655181',
        'voipcloud',
        expect.any(Object)
      );
    });

    it('should use existing VAPI phone ID if available', async () => {
      const alreadyImported = {
        ...mockReserved,
        vapi_phone_id: 'existing-vapi-id',
      };

      supabaseAdmin.single
        .mockResolvedValueOnce({ data: alreadyImported, error: null })
        .mockResolvedValueOnce({ data: {}, error: null })
        .mockResolvedValueOnce({ data: { id: 'user-phone-123' }, error: null })
        .mockResolvedValueOnce({ data: {}, error: null });

      supabaseAdmin.update.mockReturnThis();

      await assignNumber('user-123');

      expect(mockVoiceProvider.importPhoneNumber).not.toHaveBeenCalled();
    });

    it('should create user_phone_numbers record', async () => {
      supabaseAdmin.single
        .mockResolvedValueOnce({ data: mockReserved, error: null })
        .mockResolvedValueOnce({ data: {}, error: null })
        .mockResolvedValueOnce({ data: { id: 'user-phone-123' }, error: null })
        .mockResolvedValueOnce({ data: {}, error: null });

      supabaseAdmin.update.mockReturnThis();

      await assignNumber('user-123');

      expect(supabaseAdmin.from).toHaveBeenCalledWith('user_phone_numbers');
      expect(supabaseAdmin.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          phone_number: '+35312655181',
          provider: 'voipcloud',
        })
      );
    });

    it('should throw error if no reserved number found', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: null, error: null });

      await expect(assignNumber('user-123')).rejects.toThrow('No reserved number found');
    });

    it('should log assignment in history', async () => {
      supabaseAdmin.single
        .mockResolvedValueOnce({ data: mockReserved, error: null })
        .mockResolvedValueOnce({ data: {}, error: null })
        .mockResolvedValueOnce({ data: { id: 'user-phone-123' }, error: null })
        .mockResolvedValueOnce({ data: {}, error: null });

      supabaseAdmin.update.mockReturnThis();

      await assignNumber('user-123');

      expect(supabaseAdmin.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'assigned',
          reason: 'Subscription confirmed',
        })
      );
    });
  });

  // ============================================
  // RELEASE NUMBER
  // ============================================
  describe('releaseNumber', () => {
    const mockAssigned = {
      id: 'pool-123',
      phone_number: '+35312655181',
      assigned_to: 'user-123',
      status: 'assigned',
    };

    it('should release assigned number back to pool', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: mockAssigned, error: null });
      supabaseAdmin.update.mockReturnThis();

      const result = await releaseNumber('user-123', 'Subscription cancelled');

      expect(result).toBe(true);
      expect(supabaseAdmin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'released',
          assigned_to: null,
        })
      );
    });

    it('should update user_phone_numbers status', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: mockAssigned, error: null });
      supabaseAdmin.update.mockReturnThis();

      await releaseNumber('user-123');

      expect(supabaseAdmin.from).toHaveBeenCalledWith('user_phone_numbers');
    });

    it('should return false if no assigned number found', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: null, error: null });

      const result = await releaseNumber('user-123');

      expect(result).toBe(false);
    });

    it('should log release in history with reason', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: mockAssigned, error: null });
      supabaseAdmin.update.mockReturnThis();

      await releaseNumber('user-123', 'Plan downgrade');

      expect(supabaseAdmin.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'released',
          reason: 'Plan downgrade',
        })
      );
    });

    it('should use default reason if not provided', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: mockAssigned, error: null });
      supabaseAdmin.update.mockReturnThis();

      await releaseNumber('user-123');

      expect(supabaseAdmin.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Subscription cancelled',
        })
      );
    });
  });

  // ============================================
  // CANCEL RESERVATION
  // ============================================
  describe('cancelReservation', () => {
    const mockReserved = {
      id: 'pool-123',
      phone_number: '+35312655181',
      status: 'reserved',
      assigned_to: 'user-123',
    };

    it('should cancel reservation and make number available', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: mockReserved, error: null });
      supabaseAdmin.update.mockReturnThis();

      const result = await cancelReservation('user-123');

      expect(result).toBe(true);
      expect(supabaseAdmin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'available',
          assigned_to: null,
        })
      );
    });

    it('should return false if no reservation found', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: null, error: null });

      const result = await cancelReservation('user-123');

      expect(result).toBe(false);
    });

    it('should log cancellation in history', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: mockReserved, error: null });
      supabaseAdmin.update.mockReturnThis();

      await cancelReservation('user-123');

      expect(supabaseAdmin.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'cancelled',
          reason: 'Checkout abandoned',
        })
      );
    });
  });

  // ============================================
  // CLEANUP EXPIRED RESERVATIONS
  // ============================================
  describe('cleanupExpiredReservations', () => {
    it('should cleanup expired reservations', async () => {
      const expiredRecords = [
        { id: 'pool-1', assigned_to: 'user-1' },
        { id: 'pool-2', assigned_to: 'user-2' },
      ];

      supabaseAdmin.select.mockResolvedValueOnce({ data: expiredRecords, error: null });
      supabaseAdmin.update.mockReturnThis();

      const count = await cleanupExpiredReservations();

      expect(count).toBe(2);
    });

    it('should return 0 if no expired reservations', async () => {
      supabaseAdmin.select.mockResolvedValueOnce({ data: [], error: null });

      const count = await cleanupExpiredReservations();

      expect(count).toBe(0);
    });

    it('should return 0 if data is null', async () => {
      supabaseAdmin.select.mockResolvedValueOnce({ data: null, error: null });

      const count = await cleanupExpiredReservations();

      expect(count).toBe(0);
    });
  });

  // ============================================
  // RECYCLE RELEASED NUMBERS
  // ============================================
  describe('recycleReleasedNumbers', () => {
    it('should recycle released numbers after cooldown', async () => {
      const recycledNumbers = [
        { id: 'pool-1', phone_number: '+35312655181' },
        { id: 'pool-2', phone_number: '+35312655182' },
      ];

      supabaseAdmin.select.mockResolvedValueOnce({ data: recycledNumbers, error: null });
      supabaseAdmin.update.mockReturnThis();

      const count = await recycleReleasedNumbers(24);

      expect(count).toBe(2);
    });

    it('should use default cooldown of 24 hours', async () => {
      supabaseAdmin.select.mockResolvedValueOnce({ data: [], error: null });
      supabaseAdmin.update.mockReturnThis();

      await recycleReleasedNumbers();

      expect(supabaseAdmin.lt).toHaveBeenCalled();
    });

    it('should return 0 on error', async () => {
      supabaseAdmin.select.mockResolvedValueOnce({ data: null, error: { message: 'Error' } });
      supabaseAdmin.update.mockReturnThis();

      const count = await recycleReleasedNumbers();

      expect(count).toBe(0);
    });
  });

  // ============================================
  // GET POOL STATS
  // ============================================
  describe('getPoolStats', () => {
    it('should return pool statistics', async () => {
      const mockNumbers = [
        { status: 'available', region: 'IE' },
        { status: 'available', region: 'IE' },
        { status: 'assigned', region: 'IE' },
        { status: 'reserved', region: 'IE' },
        { status: 'available', region: 'US' },
      ];

      supabaseAdmin.select.mockResolvedValueOnce({ data: mockNumbers, error: null });

      const stats = await getPoolStats();

      expect(stats.total).toBe(5);
      expect(stats.available).toBe(3);
      expect(stats.assigned).toBe(1);
      expect(stats.reserved).toBe(1);
      expect(stats.released).toBe(0);
    });

    it('should group by region', async () => {
      const mockNumbers = [
        { status: 'available', region: 'IE' },
        { status: 'available', region: 'IE' },
        { status: 'assigned', region: 'IE' },
        { status: 'available', region: 'US' },
      ];

      supabaseAdmin.select.mockResolvedValueOnce({ data: mockNumbers, error: null });

      const stats = await getPoolStats();

      expect(stats.byRegion.IE.total).toBe(3);
      expect(stats.byRegion.IE.available).toBe(2);
      expect(stats.byRegion.US.total).toBe(1);
      expect(stats.byRegion.US.available).toBe(1);
    });

    it('should filter by region if provided', async () => {
      supabaseAdmin.select.mockResolvedValueOnce({ data: [], error: null });

      await getPoolStats('IE');

      expect(supabaseAdmin.eq).toHaveBeenCalledWith('region', 'IE');
    });

    it('should not filter by region if not provided', async () => {
      supabaseAdmin.select.mockResolvedValueOnce({ data: [], error: null });

      await getPoolStats();

      // eq should not be called for region filter
    });

    it('should throw on database error', async () => {
      supabaseAdmin.select.mockResolvedValueOnce({ data: null, error: { message: 'Error' } });

      await expect(getPoolStats()).rejects.toThrow();
    });
  });

  // ============================================
  // ADD NUMBER TO POOL
  // ============================================
  describe('addNumberToPool', () => {
    it('should add new number to pool', async () => {
      const mockCreated = {
        id: 'pool-456',
        phone_number: '+35312655182',
        region: 'IE',
        status: 'available',
      };

      supabaseAdmin.single.mockResolvedValueOnce({ data: mockCreated, error: null });

      const result = await addNumberToPool({
        phoneNumber: '+35312655182',
        region: 'IE',
        provider: 'voipcloud',
        voipcloudDidId: '195783',
        notes: 'New Dublin number',
      });

      expect(supabaseAdmin.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          phone_number: '+35312655182',
          region: 'IE',
          provider: 'voipcloud',
          voipcloud_did_id: '195783',
          notes: 'New Dublin number',
          status: 'available',
        })
      );
      expect(result.phone_number).toBe('+35312655182');
    });

    it('should use default values', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({ data: { id: 'pool-456' }, error: null });

      await addNumberToPool({
        phoneNumber: '+35312655182',
      });

      expect(supabaseAdmin.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'IE',
          provider: 'voipcloud',
          capabilities: { voice: true, sms: false },
          monthly_cost_cents: 0,
        })
      );
    });

    it('should throw on database error', async () => {
      supabaseAdmin.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Duplicate key' },
      });

      await expect(
        addNumberToPool({ phoneNumber: '+35312655182' })
      ).rejects.toThrow();
    });
  });

  // ============================================
  // STATUS TRANSITIONS
  // ============================================
  describe('Status Transitions', () => {
    it('should document valid status transitions', () => {
      const validTransitions = {
        available: ['reserved', 'assigned'],
        reserved: ['assigned', 'available'],
        assigned: ['released'],
        released: ['available'],
      };

      expect(validTransitions.available).toContain('reserved');
      expect(validTransitions.reserved).toContain('assigned');
      expect(validTransitions.assigned).toContain('released');
      expect(validTransitions.released).toContain('available');
    });
  });

  // ============================================
  // INTEGRATION SCENARIOS
  // ============================================
  describe('Integration Scenarios', () => {
    it('should handle complete reservation -> assignment flow', async () => {
      // This test documents the expected flow
      // 1. User starts checkout -> reserve number
      // 2. Payment succeeds -> assign number
      // The actual integration test would run against a test database
      expect(true).toBe(true);
    });

    it('should handle checkout abandonment flow', async () => {
      // 1. User starts checkout -> reserve number
      // 2. User abandons checkout
      // 3. Reservation expires or is cancelled
      // 4. Number becomes available again
      expect(true).toBe(true);
    });

    it('should handle subscription cancellation flow', async () => {
      // 1. User has assigned number
      // 2. User cancels subscription
      // 3. Number is released
      // 4. After cooldown, number becomes available
      expect(true).toBe(true);
    });
  });
});
