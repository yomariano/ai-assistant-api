/**
 * Usage Tracking Service Tests
 *
 * Tests for per-call billing logic:
 * - Lite: €19/mo + €0.95/call
 * - Growth: €99/mo + €0.45/call
 * - Pro: €249/mo + €0/call (1500 fair use cap)
 */

const {
  getPerCallRate,
  getFairUseCap,
  canMakeCall,
  recordCall,
  getUsageSummary,
  getTrialUsage,
  PER_CALL_RATES,
  FAIR_USE_CAPS,
  PHONE_LIMITS
} = require('../usageTracking');

// Mock Supabase
jest.mock('../supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn()
          })),
          single: jest.fn(),
          gt: jest.fn(() => ({
            order: jest.fn()
          })),
          in: jest.fn()
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn()
        })),
        in: jest.fn()
      })),
      upsert: jest.fn()
    })),
    rpc: jest.fn()
  }
}));

// Mock geoLocation
jest.mock('../geoLocation', () => ({
  getPricingForRegion: jest.fn(() => ({
    plans: {
      starter: { name: 'Lite', price: 19, perCallPrice: 0.95 },
      growth: { name: 'Growth', price: 99, perCallPrice: 0.45 },
      scale: { name: 'Pro', price: 249, perCallPrice: 0, callsCap: 1500 }
    }
  })),
  getRegionConfig: jest.fn((region) => ({
    plans: {
      starter: { name: 'Lite', price: 19, perCallPrice: 0.95 },
      growth: { name: 'Growth', price: 99, perCallPrice: 0.45 },
      scale: { name: 'Pro', price: 249, perCallPrice: 0, callsCap: 1500 }
    }
  }))
}));

describe('Usage Tracking Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constants', () => {
    test('PER_CALL_RATES matches OrderBot pricing', () => {
      expect(PER_CALL_RATES.starter).toBe(95);  // €0.95 = 95 cents
      expect(PER_CALL_RATES.growth).toBe(45);   // €0.45 = 45 cents
      expect(PER_CALL_RATES.scale).toBe(0);     // €0 = unlimited
    });

    test('FAIR_USE_CAPS matches OrderBot pricing', () => {
      expect(FAIR_USE_CAPS.starter).toBeNull(); // No cap (pay per call)
      expect(FAIR_USE_CAPS.growth).toBeNull();  // No cap (pay per call)
      expect(FAIR_USE_CAPS.scale).toBe(1500);   // 1500 calls/month
    });

    test('PHONE_LIMITS matches OrderBot pricing', () => {
      expect(PHONE_LIMITS.starter).toBe(1);
      expect(PHONE_LIMITS.growth).toBe(2);
      expect(PHONE_LIMITS.scale).toBe(5);
    });
  });

  describe('getPerCallRate', () => {
    test('returns 95 cents for starter plan', () => {
      const rate = getPerCallRate('starter');
      expect(rate).toBe(95);
    });

    test('returns 45 cents for growth plan', () => {
      const rate = getPerCallRate('growth');
      expect(rate).toBe(45);
    });

    test('returns 0 cents for scale plan', () => {
      const rate = getPerCallRate('scale');
      expect(rate).toBe(0);
    });

    test('defaults to starter rate for unknown plan', () => {
      const rate = getPerCallRate('unknown_plan');
      expect(rate).toBe(95);
    });

    test('uses region config when available', () => {
      const rate = getPerCallRate('starter', 'IE');
      expect(rate).toBe(95); // €0.95 * 100
    });
  });

  describe('getFairUseCap', () => {
    test('returns null for starter plan (no cap)', () => {
      const cap = getFairUseCap('starter');
      expect(cap).toBeNull();
    });

    test('returns null for growth plan (no cap)', () => {
      const cap = getFairUseCap('growth');
      expect(cap).toBeNull();
    });

    test('returns 1500 for scale plan', () => {
      const cap = getFairUseCap('scale');
      expect(cap).toBe(1500);
    });
  });

  describe('canMakeCall', () => {
    const { supabaseAdmin } = require('../supabase');

    test('allows call for starter plan (pay per call, no cap)', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { calls_made: 50 } })
            })
          })
        })
      });

      const result = await canMakeCall('user-123', 'starter');

      expect(result.allowed).toBe(true);
      expect(result.callsUsed).toBe(50);
      expect(result.callsRemaining).toBeNull(); // null = unlimited
      expect(result.reason).toBe('pay_per_call');
    });

    test('allows call for growth plan (pay per call, no cap)', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { calls_made: 100 } })
            })
          })
        })
      });

      const result = await canMakeCall('user-123', 'growth');

      expect(result.allowed).toBe(true);
      expect(result.callsUsed).toBe(100);
      expect(result.callsRemaining).toBeNull();
      expect(result.reason).toBe('pay_per_call');
    });

    test('allows call for scale plan within cap', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { calls_made: 1000 } })
            })
          })
        })
      });

      const result = await canMakeCall('user-123', 'scale');

      expect(result.allowed).toBe(true);
      expect(result.callsUsed).toBe(1000);
      expect(result.callsRemaining).toBe(500); // 1500 - 1000
      expect(result.reason).toBe('within_cap');
    });

    test('blocks call for scale plan when cap exceeded', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { calls_made: 1500 } })
            })
          })
        })
      });

      const result = await canMakeCall('user-123', 'scale');

      expect(result.allowed).toBe(false);
      expect(result.callsUsed).toBe(1500);
      expect(result.callsRemaining).toBe(0);
      expect(result.reason).toBe('fair_use_cap_exceeded');
    });

    test('allows call when no usage record exists', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null })
            })
          })
        })
      });

      const result = await canMakeCall('user-123', 'scale');

      expect(result.allowed).toBe(true);
      expect(result.callsUsed).toBe(0);
      expect(result.callsRemaining).toBe(1500);
      expect(result.reason).toBe('within_cap');
    });
  });

  describe('recordCall', () => {
    const { supabaseAdmin } = require('../supabase');

    beforeEach(() => {
      // Reset all mocks
      supabaseAdmin.from.mockReset();
    });

    test('charges 95 cents for starter plan call', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn()
              .mockResolvedValueOnce({ data: { id: 'usage-1', calls_made: 5, total_call_charges_cents: 475 } })
              .mockResolvedValueOnce({ data: { calls_made: 6 } })
          })
        })
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({})
        })
      });

      supabaseAdmin.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      });

      const result = await recordCall('user-123', 'starter', 50, 'call-1', false);

      expect(result.costCents).toBe(95);
    });

    test('charges 45 cents for growth plan call', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn()
              .mockResolvedValueOnce({ data: { id: 'usage-1', calls_made: 10, total_call_charges_cents: 450 } })
              .mockResolvedValueOnce({ data: { calls_made: 11 } })
          })
        })
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({})
        })
      });

      supabaseAdmin.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      });

      const result = await recordCall('user-123', 'growth', 50, 'call-1', false);

      expect(result.costCents).toBe(45);
    });

    test('charges 0 cents for scale plan call', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn()
              .mockResolvedValueOnce({ data: { id: 'usage-1', calls_made: 100, total_call_charges_cents: 0 } })
              .mockResolvedValueOnce({ data: { calls_made: 101 } })
          })
        })
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({})
        })
      });

      supabaseAdmin.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      });

      const result = await recordCall('user-123', 'scale', 50, 'call-1', false);

      expect(result.costCents).toBe(0);
    });

    test('charges 0 cents for trial calls regardless of plan', async () => {
      supabaseAdmin.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({})
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { calls_made: 1 } })
            })
          })
        })
      });

      const result = await recordCall('user-123', 'starter', 50, 'call-1', true);

      expect(result.costCents).toBe(0); // Trial = free
    });
  });

  describe('getUsageSummary', () => {
    const { supabaseAdmin } = require('../supabase');

    test('returns formatted usage summary for starter plan', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  calls_made: 10,
                  total_call_charges_cents: 950,
                  period_start: '2026-01-01',
                  period_end: '2026-01-31'
                }
              })
            })
          })
        })
      });

      const summary = await getUsageSummary('user-123', 'starter');

      expect(summary.callsMade).toBe(10);
      expect(summary.totalChargesCents).toBe(950);
      expect(summary.totalChargesFormatted).toBe('€9.50');
      expect(summary.perCallRateCents).toBe(95);
      expect(summary.perCallRateFormatted).toBe('€0.95');
      expect(summary.fairUseCap).toBeNull();
      expect(summary.callsRemaining).toBeNull();
      expect(summary.isUnlimited).toBe(true); // No cap
    });

    test('returns formatted usage summary for scale plan with remaining calls', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  calls_made: 1000,
                  total_call_charges_cents: 0,
                  period_start: '2026-01-01',
                  period_end: '2026-01-31'
                }
              })
            })
          })
        })
      });

      const summary = await getUsageSummary('user-123', 'scale');

      expect(summary.callsMade).toBe(1000);
      expect(summary.totalChargesCents).toBe(0);
      expect(summary.totalChargesFormatted).toBe('€0.00');
      expect(summary.perCallRateCents).toBe(0);
      expect(summary.perCallRateFormatted).toBe('Included');
      expect(summary.fairUseCap).toBe(1500);
      expect(summary.callsRemaining).toBe(500);
      expect(summary.isUnlimited).toBe(true); // perCallRate is 0
    });

    test('handles no usage data gracefully', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null })
            })
          })
        })
      });

      const summary = await getUsageSummary('user-123', 'starter');

      expect(summary.callsMade).toBe(0);
      expect(summary.totalChargesCents).toBe(0);
      expect(summary.totalChargesFormatted).toBe('€0.00');
    });
  });

  describe('getTrialUsage', () => {
    const { supabaseAdmin } = require('../supabase');
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, TRIAL_CALLS: '3' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('returns trial usage with remaining calls', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { calls_made: 1 }
            })
          })
        })
      });

      const usage = await getTrialUsage('user-123');

      expect(usage.callsMade).toBe(1);
      expect(usage.callsAllowed).toBe(3);
      expect(usage.callsRemaining).toBe(2);
    });

    test('returns 0 remaining when trial exhausted', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { calls_made: 5 }
            })
          })
        })
      });

      const usage = await getTrialUsage('user-123');

      expect(usage.callsMade).toBe(5);
      expect(usage.callsAllowed).toBe(3);
      expect(usage.callsRemaining).toBe(0); // Max(0, 3-5) = 0
    });

    test('handles no usage record', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null })
          })
        })
      });

      const usage = await getTrialUsage('user-123');

      expect(usage.callsMade).toBe(0);
      expect(usage.callsAllowed).toBe(3);
      expect(usage.callsRemaining).toBe(3);
    });
  });

  describe('Billing period calculations', () => {
    test('period starts on first of month', () => {
      const periodStart = new Date();
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);

      expect(periodStart.getDate()).toBe(1);
      expect(periodStart.getHours()).toBe(0);
    });

    test('period ends on last day of month', () => {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(0); // Last day of previous (current) month

      // Should be 28, 29, 30, or 31
      expect(periodEnd.getDate()).toBeGreaterThanOrEqual(28);
      expect(periodEnd.getDate()).toBeLessThanOrEqual(31);
    });
  });
});
