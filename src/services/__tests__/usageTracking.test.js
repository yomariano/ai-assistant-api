/**
 * Usage Tracking Service Tests
 *
 * Tests for VoiceFleet pricing model (Jan 2026):
 * - Starter: €49/mo - 100 inbound calls/month
 * - Growth: €199/mo - 500 inbound calls/month
 * - Pro: €599/mo - 1500 inbound + 200 outbound calls/month
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
      starter: { name: 'Starter', price: 49, perCallPrice: 0, callsCap: 100 },
      growth: { name: 'Growth', price: 199, perCallPrice: 0, callsCap: 500 },
      pro: { name: 'Pro', price: 599, perCallPrice: 0, callsCap: 1500 }
    }
  })),
  getRegionConfig: jest.fn((region) => ({
    plans: {
      starter: { name: 'Starter', price: 49, perCallPrice: 0, callsCap: 100 },
      growth: { name: 'Growth', price: 199, perCallPrice: 0, callsCap: 500 },
      pro: { name: 'Pro', price: 599, perCallPrice: 0, callsCap: 1500 }
    }
  }))
}));

describe('Usage Tracking Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constants', () => {
    test('PER_CALL_RATES matches VoiceFleet pricing (all included)', () => {
      expect(PER_CALL_RATES.starter).toBe(0);  // Included in plan
      expect(PER_CALL_RATES.growth).toBe(0);   // Included in plan
      expect(PER_CALL_RATES.pro).toBe(0);      // Included in plan
    });

    test('FAIR_USE_CAPS matches VoiceFleet pricing', () => {
      expect(FAIR_USE_CAPS.starter).toBe(100);  // 100 calls/month
      expect(FAIR_USE_CAPS.growth).toBe(500);   // 500 calls/month
      expect(FAIR_USE_CAPS.pro).toBe(1500);     // 1500 calls/month
    });

    test('PHONE_LIMITS matches VoiceFleet pricing', () => {
      expect(PHONE_LIMITS.starter).toBe(1);
      expect(PHONE_LIMITS.growth).toBe(1);
      expect(PHONE_LIMITS.pro).toBe(1);
    });
  });

  describe('getPerCallRate', () => {
    test('returns 0 cents for starter plan (included in subscription)', async () => {
      const rate = await getPerCallRate('starter');
      expect(rate).toBe(0);
    });

    test('returns 0 cents for growth plan (included in subscription)', async () => {
      const rate = await getPerCallRate('growth');
      expect(rate).toBe(0);
    });

    test('returns 0 cents for pro plan (included in subscription)', async () => {
      const rate = await getPerCallRate('pro');
      expect(rate).toBe(0);
    });

    test('defaults to starter rate for unknown plan', async () => {
      const rate = await getPerCallRate('unknown_plan');
      expect(rate).toBe(0);
    });
  });

  describe('getFairUseCap', () => {
    test('returns 100 for starter plan', async () => {
      const cap = await getFairUseCap('starter');
      expect(cap).toBe(100);
    });

    test('returns 500 for growth plan', async () => {
      const cap = await getFairUseCap('growth');
      expect(cap).toBe(500);
    });

    test('returns 1500 for pro plan', async () => {
      const cap = await getFairUseCap('pro');
      expect(cap).toBe(1500);
    });
  });

  describe('canMakeCall', () => {
    const { supabaseAdmin } = require('../supabase');

    test('allows call for starter plan within cap', async () => {
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
      expect(result.callsRemaining).toBe(50); // 100 - 50
      expect(result.reason).toBe('within_cap');
    });

    test('blocks call for starter plan when cap exceeded', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { calls_made: 100 } })
            })
          })
        })
      });

      const result = await canMakeCall('user-123', 'starter');

      expect(result.allowed).toBe(false);
      expect(result.callsUsed).toBe(100);
      expect(result.callsRemaining).toBe(0);
      expect(result.reason).toBe('fair_use_cap_exceeded');
    });

    test('allows call for growth plan within cap', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { calls_made: 300 } })
            })
          })
        })
      });

      const result = await canMakeCall('user-123', 'growth');

      expect(result.allowed).toBe(true);
      expect(result.callsUsed).toBe(300);
      expect(result.callsRemaining).toBe(200); // 500 - 300
      expect(result.reason).toBe('within_cap');
    });

    test('allows call for pro plan within cap', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { calls_made: 1000 } })
            })
          })
        })
      });

      const result = await canMakeCall('user-123', 'pro');

      expect(result.allowed).toBe(true);
      expect(result.callsUsed).toBe(1000);
      expect(result.callsRemaining).toBe(500); // 1500 - 1000
      expect(result.reason).toBe('within_cap');
    });

    test('blocks call for pro plan when cap exceeded', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { calls_made: 1500 } })
            })
          })
        })
      });

      const result = await canMakeCall('user-123', 'pro');

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

      const result = await canMakeCall('user-123', 'pro');

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

    test('charges 0 cents for starter plan call (included in subscription)', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn()
              .mockResolvedValueOnce({ data: { id: 'usage-1', calls_made: 5, total_call_charges_cents: 0 } })
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

      expect(result.costCents).toBe(0);
    });

    test('charges 0 cents for growth plan call (included in subscription)', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn()
              .mockResolvedValueOnce({ data: { id: 'usage-1', calls_made: 10, total_call_charges_cents: 0 } })
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

      expect(result.costCents).toBe(0);
    });

    test('charges 0 cents for pro plan call', async () => {
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

      const result = await recordCall('user-123', 'pro', 50, 'call-1', false);

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
                  total_call_charges_cents: 0,
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
      expect(summary.totalChargesCents).toBe(0);
      expect(summary.totalChargesFormatted).toBe('€0.00');
      expect(summary.perCallRateCents).toBe(0);
      expect(summary.perCallRateFormatted).toBe('Included');
      expect(summary.fairUseCap).toBe(100);
      expect(summary.callsRemaining).toBe(90); // 100 - 10
      expect(summary.isUnlimited).toBe(true); // perCallRate is 0
    });

    test('returns formatted usage summary for pro plan with remaining calls', async () => {
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

      const summary = await getUsageSummary('user-123', 'pro');

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
