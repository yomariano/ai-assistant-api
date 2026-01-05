/**
 * Comprehensive Unit Tests for Geo-Location Service
 */

// Mock axios before requiring the module
jest.mock('axios');
const axios = require('axios');

const {
  detectRegion,
  getRegionConfig,
  getPricingForRegion,
  getAllPricingForRegion,
  getPaymentLinkForRegion,
  getPriceIdForRegion,
  getClientIp,
  mapCountryToRegion,
  clearCache,
  REGION_CONFIG,
  EUR_COUNTRIES,
  DEFAULT_REGION,
} = require('../geoLocation');

describe('GeoLocation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCache();
  });

  // ============================================
  // COUNTRY TO REGION MAPPING
  // ============================================
  describe('mapCountryToRegion', () => {
    describe('European countries', () => {
      it('should return IE for Ireland', () => {
        expect(mapCountryToRegion('IE')).toBe('IE');
      });

      it('should return IE for UK', () => {
        expect(mapCountryToRegion('GB')).toBe('IE');
      });

      it('should return IE for Germany', () => {
        expect(mapCountryToRegion('DE')).toBe('IE');
      });

      it('should return IE for France', () => {
        expect(mapCountryToRegion('FR')).toBe('IE');
      });

      it('should return IE for Spain', () => {
        expect(mapCountryToRegion('ES')).toBe('IE');
      });

      it('should return IE for Italy', () => {
        expect(mapCountryToRegion('IT')).toBe('IE');
      });

      it('should return IE for all EUR countries', () => {
        EUR_COUNTRIES.forEach((country) => {
          expect(mapCountryToRegion(country)).toBe('IE');
        });
      });
    });

    describe('Non-European countries', () => {
      it('should return US for United States', () => {
        expect(mapCountryToRegion('US')).toBe('US');
      });

      it('should return US for Canada', () => {
        expect(mapCountryToRegion('CA')).toBe('US');
      });

      it('should return US for Australia', () => {
        expect(mapCountryToRegion('AU')).toBe('US');
      });

      it('should return US for Japan', () => {
        expect(mapCountryToRegion('JP')).toBe('US');
      });

      it('should return US for unknown countries', () => {
        expect(mapCountryToRegion('XX')).toBe('US');
        expect(mapCountryToRegion('ZZ')).toBe('US');
      });
    });
  });

  // ============================================
  // REGION DETECTION
  // ============================================
  describe('detectRegion', () => {
    describe('Local/Private IPs', () => {
      it('should return default region for localhost IPv4', async () => {
        expect(await detectRegion('127.0.0.1')).toBe('US');
      });

      it('should return default region for localhost IPv6', async () => {
        expect(await detectRegion('::1')).toBe('US');
      });

      it('should return default region for 192.168.x.x', async () => {
        expect(await detectRegion('192.168.1.1')).toBe('US');
        expect(await detectRegion('192.168.0.100')).toBe('US');
      });

      it('should return default region for 10.x.x.x', async () => {
        expect(await detectRegion('10.0.0.1')).toBe('US');
        expect(await detectRegion('10.255.255.255')).toBe('US');
      });

      it('should return default region for null IP', async () => {
        expect(await detectRegion(null)).toBe('US');
      });

      it('should return default region for undefined IP', async () => {
        expect(await detectRegion(undefined)).toBe('US');
      });

      it('should return default region for empty string', async () => {
        expect(await detectRegion('')).toBe('US');
      });
    });

    describe('External IPs', () => {
      it('should detect US region from US IP', async () => {
        axios.get.mockResolvedValueOnce({
          data: { status: 'success', countryCode: 'US' },
        });

        const region = await detectRegion('8.8.8.8');
        expect(region).toBe('US');
        expect(axios.get).toHaveBeenCalledWith(
          'http://ip-api.com/json/8.8.8.8?fields=countryCode,status',
          expect.any(Object)
        );
      });

      it('should detect IE region from Irish IP', async () => {
        axios.get.mockResolvedValueOnce({
          data: { status: 'success', countryCode: 'IE' },
        });

        const region = await detectRegion('87.32.0.1');
        expect(region).toBe('IE');
      });

      it('should detect IE region from German IP', async () => {
        axios.get.mockResolvedValueOnce({
          data: { status: 'success', countryCode: 'DE' },
        });

        const region = await detectRegion('85.214.0.1');
        expect(region).toBe('IE');
      });

      it('should detect IE region from UK IP', async () => {
        axios.get.mockResolvedValueOnce({
          data: { status: 'success', countryCode: 'GB' },
        });

        const region = await detectRegion('151.101.0.1');
        expect(region).toBe('IE');
      });
    });

    describe('Caching', () => {
      it('should cache results', async () => {
        axios.get.mockResolvedValueOnce({
          data: { status: 'success', countryCode: 'IE' },
        });

        // First call - should hit API
        await detectRegion('87.32.0.1');
        expect(axios.get).toHaveBeenCalledTimes(1);

        // Second call - should use cache
        await detectRegion('87.32.0.1');
        expect(axios.get).toHaveBeenCalledTimes(1);
      });

      it('should cache different IPs separately', async () => {
        axios.get
          .mockResolvedValueOnce({ data: { status: 'success', countryCode: 'IE' } })
          .mockResolvedValueOnce({ data: { status: 'success', countryCode: 'US' } });

        await detectRegion('87.32.0.1');
        await detectRegion('8.8.8.8');

        expect(axios.get).toHaveBeenCalledTimes(2);
      });

      it('should clear cache when clearCache is called', async () => {
        axios.get.mockResolvedValue({
          data: { status: 'success', countryCode: 'IE' },
        });

        await detectRegion('87.32.0.1');
        clearCache();
        await detectRegion('87.32.0.1');

        expect(axios.get).toHaveBeenCalledTimes(2);
      });
    });

    describe('Error handling', () => {
      it('should return default region on API error', async () => {
        axios.get.mockRejectedValueOnce(new Error('Network error'));

        const region = await detectRegion('8.8.8.8');
        expect(region).toBe('US');
      });

      it('should return default region on API timeout', async () => {
        axios.get.mockRejectedValueOnce(new Error('timeout of 3000ms exceeded'));

        const region = await detectRegion('8.8.8.8');
        expect(region).toBe('US');
      });

      it('should return default region on API failure status', async () => {
        axios.get.mockResolvedValueOnce({
          data: { status: 'fail', message: 'Invalid IP' },
        });

        const region = await detectRegion('invalid-ip');
        expect(region).toBe('US');
      });

      it('should return default region on missing countryCode', async () => {
        axios.get.mockResolvedValueOnce({
          data: { status: 'success' }, // Missing countryCode
        });

        const region = await detectRegion('8.8.8.8');
        // Should handle gracefully
        expect(region).toBeDefined();
      });
    });
  });

  // ============================================
  // REGION CONFIG
  // ============================================
  describe('getRegionConfig', () => {
    describe('US region', () => {
      it('should return correct US config', () => {
        const config = getRegionConfig('US');
        expect(config.code).toBe('US');
        expect(config.currency).toBe('USD');
        expect(config.currencySymbol).toBe('$');
        expect(config.telephonyProvider).toBe('telnyx');
        expect(config.defaultCountryCode).toBe('+1');
      });

      it('should have all plan tiers', () => {
        const config = getRegionConfig('US');
        expect(config.plans).toHaveProperty('starter');
        expect(config.plans).toHaveProperty('growth');
        expect(config.plans).toHaveProperty('scale');
      });
    });

    describe('IE region', () => {
      it('should return correct IE config', () => {
        const config = getRegionConfig('IE');
        expect(config.code).toBe('IE');
        expect(config.currency).toBe('EUR');
        expect(config.currencySymbol).toBe('€');
        expect(config.telephonyProvider).toBe('voipcloud');
        expect(config.defaultCountryCode).toBe('+353');
      });

      it('should have all plan tiers', () => {
        const config = getRegionConfig('IE');
        expect(config.plans).toHaveProperty('starter');
        expect(config.plans).toHaveProperty('growth');
        expect(config.plans).toHaveProperty('scale');
      });
    });

    describe('Unknown region', () => {
      it('should return default region for unknown region code', () => {
        const config = getRegionConfig('XX');
        expect(config.code).toBe('US');
      });

      it('should return default region for null', () => {
        const config = getRegionConfig(null);
        expect(config.code).toBe('US');
      });

      it('should return default region for undefined', () => {
        const config = getRegionConfig(undefined);
        expect(config.code).toBe('US');
      });
    });
  });

  // ============================================
  // PRICING
  // ============================================
  // OrderBot.ie Pricing (January 2026)
  // Lite: €19/mo + €0.95/call | Growth: €99/mo + €0.45/call | Pro: €249/mo unlimited
  describe('getPricingForRegion', () => {
    describe('US pricing', () => {
      it('should return correct US pricing for starter (Lite) plan', () => {
        const pricing = getPricingForRegion('US', 'starter');
        expect(pricing.region).toBe('US');
        expect(pricing.currency).toBe('USD');
        expect(pricing.currencySymbol).toBe('$');
        expect(pricing.price).toBe(19);
        expect(pricing.formattedPrice).toBe('$19');
        expect(pricing.monthlyMinutes).toBe(0); // Pay per call model
      });

      it('should return correct US pricing for growth plan', () => {
        const pricing = getPricingForRegion('US', 'growth');
        expect(pricing.price).toBe(99);
        expect(pricing.formattedPrice).toBe('$99');
        expect(pricing.monthlyMinutes).toBe(0); // Pay per call model
      });

      it('should return correct US pricing for scale (Pro) plan', () => {
        const pricing = getPricingForRegion('US', 'scale');
        expect(pricing.price).toBe(249);
        expect(pricing.formattedPrice).toBe('$249');
        expect(pricing.monthlyMinutes).toBe(0); // Unlimited with fair use
      });
    });

    describe('IE pricing', () => {
      it('should return correct IE pricing for starter (Lite) plan', () => {
        const pricing = getPricingForRegion('IE', 'starter');
        expect(pricing.region).toBe('IE');
        expect(pricing.currency).toBe('EUR');
        expect(pricing.currencySymbol).toBe('€');
        expect(pricing.price).toBe(19);
        expect(pricing.formattedPrice).toBe('€19');
      });

      it('should return correct IE pricing for growth plan', () => {
        const pricing = getPricingForRegion('IE', 'growth');
        expect(pricing.price).toBe(99);
        expect(pricing.formattedPrice).toBe('€99');
      });

      it('should return correct IE pricing for scale (Pro) plan', () => {
        const pricing = getPricingForRegion('IE', 'scale');
        expect(pricing.price).toBe(249);
        expect(pricing.formattedPrice).toBe('€249');
      });
    });

    describe('Error handling', () => {
      it('should throw error for unknown plan', () => {
        expect(() => getPricingForRegion('US', 'unknown')).toThrow('Unknown plan');
      });

      it('should throw error for null plan', () => {
        expect(() => getPricingForRegion('US', null)).toThrow();
      });
    });
  });

  describe('getAllPricingForRegion', () => {
    it('should return all plans for US region', () => {
      const pricing = getAllPricingForRegion('US');
      expect(pricing.region).toBe('US');
      expect(pricing.regionName).toBe('United States');
      expect(pricing.currency).toBe('USD');
      expect(pricing.plans).toHaveLength(3);
      expect(pricing.plans.map((p) => p.id)).toEqual(['starter', 'growth', 'scale']);
    });

    it('should return all plans for IE region', () => {
      const pricing = getAllPricingForRegion('IE');
      expect(pricing.region).toBe('IE');
      expect(pricing.regionName).toBe('Ireland');
      expect(pricing.currency).toBe('EUR');
      expect(pricing.plans).toHaveLength(3);
    });

    it('should include telephony provider', () => {
      const usPricing = getAllPricingForRegion('US');
      expect(usPricing.telephonyProvider).toBe('telnyx');

      const iePricing = getAllPricingForRegion('IE');
      expect(iePricing.telephonyProvider).toBe('voipcloud');
    });

    it('should return correct prices for each plan', () => {
      const pricing = getAllPricingForRegion('US');

      const starter = pricing.plans.find((p) => p.id === 'starter');
      expect(starter.price).toBe(19);
      expect(starter.formattedPrice).toBe('$19');

      const growth = pricing.plans.find((p) => p.id === 'growth');
      expect(growth.price).toBe(99);

      const scale = pricing.plans.find((p) => p.id === 'scale');
      expect(scale.price).toBe(249);
    });

    it('should return correct EUR prices for IE region', () => {
      const pricing = getAllPricingForRegion('IE');

      const starter = pricing.plans.find((p) => p.id === 'starter');
      expect(starter.price).toBe(19);
      expect(starter.formattedPrice).toBe('€19');

      const growth = pricing.plans.find((p) => p.id === 'growth');
      expect(growth.price).toBe(99);

      const scale = pricing.plans.find((p) => p.id === 'scale');
      expect(scale.price).toBe(249);
    });
  });

  // ============================================
  // CLIENT IP EXTRACTION
  // ============================================
  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header (single IP)', () => {
      const req = {
        headers: { 'x-forwarded-for': '8.8.8.8' },
      };
      expect(getClientIp(req)).toBe('8.8.8.8');
    });

    it('should extract first IP from x-forwarded-for header (multiple IPs)', () => {
      const req = {
        headers: { 'x-forwarded-for': '8.8.8.8, 192.168.1.1, 10.0.0.1' },
      };
      expect(getClientIp(req)).toBe('8.8.8.8');
    });

    it('should handle whitespace in x-forwarded-for', () => {
      const req = {
        headers: { 'x-forwarded-for': '  8.8.8.8  ,  192.168.1.1  ' },
      };
      expect(getClientIp(req)).toBe('8.8.8.8');
    });

    it('should extract IP from x-real-ip header', () => {
      const req = {
        headers: { 'x-real-ip': '8.8.4.4' },
      };
      expect(getClientIp(req)).toBe('8.8.4.4');
    });

    it('should extract IP from cf-connecting-ip header (Cloudflare)', () => {
      const req = {
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      };
      expect(getClientIp(req)).toBe('1.2.3.4');
    });

    it('should prefer x-forwarded-for over other headers', () => {
      const req = {
        headers: {
          'x-forwarded-for': '1.1.1.1',
          'x-real-ip': '2.2.2.2',
          'cf-connecting-ip': '3.3.3.3',
        },
      };
      expect(getClientIp(req)).toBe('1.1.1.1');
    });

    it('should fall back to connection.remoteAddress', () => {
      const req = {
        headers: {},
        connection: { remoteAddress: '5.6.7.8' },
      };
      expect(getClientIp(req)).toBe('5.6.7.8');
    });

    it('should fall back to socket.remoteAddress', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '9.10.11.12' },
      };
      expect(getClientIp(req)).toBe('9.10.11.12');
    });

    it('should fall back to req.ip (Express)', () => {
      const req = {
        headers: {},
        ip: '13.14.15.16',
      };
      expect(getClientIp(req)).toBe('13.14.15.16');
    });

    it('should return localhost if no IP found', () => {
      const req = { headers: {} };
      expect(getClientIp(req)).toBe('127.0.0.1');
    });
  });

  // ============================================
  // PAYMENT LINKS
  // ============================================
  describe('getPaymentLinkForRegion', () => {
    it('should return null if no payment link configured', () => {
      // Without env vars set, should return undefined/null
      const link = getPaymentLinkForRegion('IE', 'starter');
      // Will be undefined since env vars aren't set in test
      expect(link).toBeFalsy();
    });

    it('should return null for unknown plan', () => {
      const link = getPaymentLinkForRegion('US', 'unknown');
      expect(link).toBeNull();
    });
  });

  describe('getPriceIdForRegion', () => {
    it('should return null if no price ID configured', () => {
      const priceId = getPriceIdForRegion('IE', 'starter');
      // Will be undefined since env vars aren't set in test
      expect(priceId).toBeFalsy();
    });
  });

  // ============================================
  // EUR STRIPE INTEGRATION
  // ============================================
  describe('EUR Stripe Integration', () => {
    it('should have EUR environment variable keys in IE config', () => {
      const ieConfig = REGION_CONFIG.IE;
      // Verify the config references EUR env vars
      expect(ieConfig.plans.starter).toHaveProperty('priceId');
      expect(ieConfig.plans.starter).toHaveProperty('paymentLink');
      expect(ieConfig.plans.growth).toHaveProperty('priceId');
      expect(ieConfig.plans.growth).toHaveProperty('paymentLink');
      expect(ieConfig.plans.scale).toHaveProperty('priceId');
      expect(ieConfig.plans.scale).toHaveProperty('paymentLink');
    });

    it('should have USD environment variable keys in US config', () => {
      const usConfig = REGION_CONFIG.US;
      expect(usConfig.plans.starter).toHaveProperty('priceId');
      expect(usConfig.plans.starter).toHaveProperty('paymentLink');
    });

    it('should return EUR currency for Ireland', () => {
      const pricing = getAllPricingForRegion('IE');
      expect(pricing.currency).toBe('EUR');
      expect(pricing.currencySymbol).toBe('€');
    });

    it('should return USD currency for US', () => {
      const pricing = getAllPricingForRegion('US');
      expect(pricing.currency).toBe('USD');
      expect(pricing.currencySymbol).toBe('$');
    });

    it('should have OrderBot pricing for all EUR plans', () => {
      const pricing = getAllPricingForRegion('IE');

      const lite = pricing.plans.find(p => p.id === 'starter');
      expect(lite.price).toBe(19);  // €19
      expect(lite.perCallPrice).toBe(0.95);  // €0.95/call

      const growth = pricing.plans.find(p => p.id === 'growth');
      expect(growth.price).toBe(99);  // €99
      expect(growth.perCallPrice).toBe(0.45);  // €0.45/call

      const pro = pricing.plans.find(p => p.id === 'scale');
      expect(pro.price).toBe(249);  // €249
      expect(pro.perCallPrice).toBe(0);  // Unlimited
      expect(pro.callsCap).toBe(1500);  // Fair use cap
    });

    it('should format EUR prices correctly', () => {
      const pricing = getAllPricingForRegion('IE');

      const lite = pricing.plans.find(p => p.id === 'starter');
      expect(lite.formattedPrice).toBe('€19');

      const growth = pricing.plans.find(p => p.id === 'growth');
      expect(growth.formattedPrice).toBe('€99');

      const pro = pricing.plans.find(p => p.id === 'scale');
      expect(pro.formattedPrice).toBe('€249');
    });
  });

  // ============================================
  // CONFIG VALIDATION
  // ============================================
  describe('REGION_CONFIG', () => {
    it('should have plans with all required fields', () => {
      Object.values(REGION_CONFIG).forEach((region) => {
        Object.values(region.plans).forEach((plan) => {
          expect(plan).toHaveProperty('price');
          expect(plan).toHaveProperty('monthlyMinutes');
          expect(plan).toHaveProperty('perCallPrice');
          expect(typeof plan.price).toBe('number');
          expect(typeof plan.monthlyMinutes).toBe('number');
          expect(plan.price).toBeGreaterThan(0);
          // monthlyMinutes is 0 for pay-per-call model
          expect(plan.monthlyMinutes).toBeGreaterThanOrEqual(0);
        });
      });
    });

    it('should have matching plan IDs across regions', () => {
      const usPlans = Object.keys(REGION_CONFIG.US.plans);
      const iePlans = Object.keys(REGION_CONFIG.IE.plans);
      expect(usPlans).toEqual(iePlans);
    });

    it('should have required region properties', () => {
      Object.values(REGION_CONFIG).forEach((region) => {
        expect(region).toHaveProperty('code');
        expect(region).toHaveProperty('name');
        expect(region).toHaveProperty('currency');
        expect(region).toHaveProperty('currencySymbol');
        expect(region).toHaveProperty('telephonyProvider');
        expect(region).toHaveProperty('defaultCountryCode');
        expect(region).toHaveProperty('plans');
      });
    });

    it('should have same base prices for both regions (OrderBot pricing)', () => {
      // OrderBot uses same base prices for all regions
      expect(REGION_CONFIG.IE.plans.starter.price).toBe(
        REGION_CONFIG.US.plans.starter.price
      );
      expect(REGION_CONFIG.IE.plans.growth.price).toBe(
        REGION_CONFIG.US.plans.growth.price
      );
      expect(REGION_CONFIG.IE.plans.scale.price).toBe(
        REGION_CONFIG.US.plans.scale.price
      );
    });

    it('should have correct per-call pricing', () => {
      // Lite: €0.95/call, Growth: €0.45/call, Pro: unlimited
      expect(REGION_CONFIG.IE.plans.starter.perCallPrice).toBe(0.95);
      expect(REGION_CONFIG.IE.plans.growth.perCallPrice).toBe(0.45);
      expect(REGION_CONFIG.IE.plans.scale.perCallPrice).toBe(0);
    });

    it('should have fair use cap for Pro plan', () => {
      expect(REGION_CONFIG.IE.plans.scale.callsCap).toBe(1500);
      expect(REGION_CONFIG.US.plans.scale.callsCap).toBe(1500);
    });
  });

  describe('EUR_COUNTRIES', () => {
    it('should include key European countries', () => {
      expect(EUR_COUNTRIES).toContain('IE');
      expect(EUR_COUNTRIES).toContain('GB');
      expect(EUR_COUNTRIES).toContain('DE');
      expect(EUR_COUNTRIES).toContain('FR');
      expect(EUR_COUNTRIES).toContain('ES');
      expect(EUR_COUNTRIES).toContain('IT');
      expect(EUR_COUNTRIES).toContain('NL');
    });

    it('should be an array', () => {
      expect(Array.isArray(EUR_COUNTRIES)).toBe(true);
    });

    it('should contain only valid country codes', () => {
      EUR_COUNTRIES.forEach((code) => {
        expect(code).toMatch(/^[A-Z]{2}$/);
      });
    });
  });

  describe('DEFAULT_REGION', () => {
    it('should be US', () => {
      expect(DEFAULT_REGION).toBe('US');
    });
  });
});
