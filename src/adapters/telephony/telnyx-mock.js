/**
 * Mock Telnyx Telephony Provider
 *
 * Simulates Telnyx API responses for testing and development.
 * No real API calls are made - all data is generated locally.
 *
 * Use this for:
 * - Unit tests
 * - E2E tests
 * - Local development without Telnyx account
 */

// In-memory store for mock data
const mockPhoneNumbers = new Map();
const mockOrders = new Map();
let mockIdCounter = 1000;

class TelnyxMockProvider {
  constructor(options = {}) {
    this.simulateDelay = options.simulateDelay || 100; // ms
    this.failureRate = options.failureRate || 0; // 0-1, for testing error handling
  }

  getName() {
    return 'telnyx-mock';
  }

  /**
   * Generate a mock phone number
   */
  _generateMockNumber(areaCode = '555') {
    const suffix = String(mockIdCounter++).padStart(4, '0');
    return `+1${areaCode}${suffix.slice(-7).padStart(7, '0')}`;
  }

  /**
   * Generate a mock ID
   */
  _generateMockId(prefix = 'mock') {
    return `${prefix}_${Date.now()}_${mockIdCounter++}`;
  }

  /**
   * Simulate network delay
   */
  async _simulateDelay() {
    if (this.simulateDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateDelay));
    }
  }

  /**
   * Maybe fail based on failure rate (for testing error handling)
   */
  _maybeFailSimulation(operation) {
    if (Math.random() < this.failureRate) {
      throw new Error(`Simulated ${operation} failure`);
    }
  }

  /**
   * Search for available phone numbers
   */
  async searchAvailableNumbers(limit, options = {}) {
    await this._simulateDelay();
    this._maybeFailSimulation('search');

    const { areaCode = '555' } = options;

    const numbers = [];
    for (let i = 0; i < limit; i++) {
      numbers.push({
        id: null, // Available numbers don't have IDs yet
        phone_number: this._generateMockNumber(areaCode),
        features: ['sms', 'voice', 'mms'],
        region_information: [
          {
            region_type: 'state',
            region_name: 'California',
          },
        ],
      });
    }

    console.log(`[TelnyxMock] Searched ${limit} numbers, found ${numbers.length}`);
    return numbers;
  }

  /**
   * Purchase phone numbers
   */
  async purchaseNumbers(numbers) {
    await this._simulateDelay();
    this._maybeFailSimulation('purchase');

    const orderId = this._generateMockId('order');
    const purchasedNumbers = [];

    for (const num of numbers) {
      const phoneNumber = {
        id: this._generateMockId('phone'),
        phone_number: num.phone_number,
        status: 'active',
        connection_id: null,
        created_at: new Date().toISOString(),
      };

      mockPhoneNumbers.set(phoneNumber.id, phoneNumber);
      purchasedNumbers.push(phoneNumber);
    }

    // Store order
    mockOrders.set(orderId, {
      id: orderId,
      status: 'success',
      phone_numbers: purchasedNumbers,
    });

    console.log(`[TelnyxMock] Purchased ${purchasedNumbers.length} numbers, order: ${orderId}`);
    return purchasedNumbers;
  }

  /**
   * Release/delete a phone number
   */
  async releaseNumber(phoneNumberId) {
    await this._simulateDelay();
    this._maybeFailSimulation('release');

    const number = mockPhoneNumbers.get(phoneNumberId);
    if (number) {
      number.status = 'released';
      mockPhoneNumbers.delete(phoneNumberId);
      console.log(`[TelnyxMock] Released number ${phoneNumberId}`);
      return true;
    }

    console.log(`[TelnyxMock] Number ${phoneNumberId} not found (may have been released already)`);
    return true; // Idempotent - return true even if not found
  }

  /**
   * Assign phone number to a voice application
   */
  async assignToVoiceApp(phoneNumberId, applicationId) {
    await this._simulateDelay();

    const number = mockPhoneNumbers.get(phoneNumberId);
    if (number) {
      number.connection_id = applicationId;
      console.log(`[TelnyxMock] Assigned ${phoneNumberId} to voice app ${applicationId}`);
      return true;
    }

    console.warn(`[TelnyxMock] Number ${phoneNumberId} not found for voice app assignment`);
    return false;
  }

  /**
   * Get phone number details
   */
  async getNumber(phoneNumberId) {
    await this._simulateDelay();

    const number = mockPhoneNumbers.get(phoneNumberId);
    if (!number) {
      throw new Error(`Phone number ${phoneNumberId} not found`);
    }

    return { ...number };
  }

  /**
   * Helper: Get all mock numbers (for testing/debugging)
   */
  getAllMockNumbers() {
    return Array.from(mockPhoneNumbers.values());
  }

  /**
   * Helper: Clear all mock data (for test cleanup)
   */
  clearMockData() {
    mockPhoneNumbers.clear();
    mockOrders.clear();
    mockIdCounter = 1000;
    console.log('[TelnyxMock] Cleared all mock data');
  }

  /**
   * Helper: Set a specific phone number in mock store (for test setup)
   */
  setMockNumber(id, phoneNumber, status = 'active') {
    mockPhoneNumbers.set(id, {
      id,
      phone_number: phoneNumber,
      status,
      connection_id: null,
      created_at: new Date().toISOString(),
    });
  }
}

module.exports = { TelnyxMockProvider };
