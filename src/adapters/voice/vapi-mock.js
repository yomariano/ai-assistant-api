/**
 * Mock Vapi Voice AI Provider
 *
 * Simulates Vapi API responses for testing and development.
 * No real API calls are made - all data is generated locally.
 *
 * Use this for:
 * - Unit tests
 * - E2E tests
 * - Local development without Vapi account
 */

// In-memory store for mock data
const mockAssistants = new Map();
const mockPhoneNumbers = new Map();
const mockCalls = new Map();
let mockIdCounter = 1000;

class VapiMockProvider {
  constructor(options = {}) {
    this.simulateDelay = options.simulateDelay || 50; // ms
    this.failureRate = options.failureRate || 0; // 0-1, for testing error handling
  }

  getName() {
    return 'vapi-mock';
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
   * Create a voice assistant
   */
  async createAssistant(config) {
    await this._simulateDelay();
    this._maybeFailSimulation('createAssistant');

    const assistant = {
      id: this._generateMockId('asst'),
      name: config.name || 'Mock Assistant',
      model: config.model || {
        provider: 'openai',
        model: 'gpt-4',
      },
      voice: config.voice || {
        provider: 'playht',
        voiceId: 'jennifer',
      },
      firstMessage: config.firstMessage || 'Hello! How can I help you today?',
      systemPrompt: config.systemPrompt || 'You are a helpful AI assistant.',
      transcriber: config.transcriber || {
        provider: 'deepgram',
        language: 'en',
      },
      maxDurationSeconds: config.maxDurationSeconds || 600,
      createdAt: new Date().toISOString(),
    };

    mockAssistants.set(assistant.id, assistant);
    console.log(`[VapiMock] Created assistant: ${assistant.id}`);
    return assistant;
  }

  /**
   * Update a voice assistant
   */
  async updateAssistant(assistantId, updates) {
    await this._simulateDelay();
    this._maybeFailSimulation('updateAssistant');

    let assistant = mockAssistants.get(assistantId);

    // For E2E tests, create a placeholder if assistant doesn't exist
    // This handles cases where DB has a test assistant ID but mock doesn't know about it
    if (!assistant) {
      console.log(`[VapiMock] Creating placeholder assistant for update: ${assistantId}`);
      assistant = {
        id: assistantId,
        name: 'Test Assistant',
        firstMessage: 'Hello!',
        createdAt: new Date().toISOString(),
      };
      mockAssistants.set(assistantId, assistant);
    }

    const updated = {
      ...assistant,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    mockAssistants.set(assistantId, updated);
    console.log(`[VapiMock] Updated assistant: ${assistantId}`);
    return updated;
  }

  /**
   * Delete a voice assistant
   */
  async deleteAssistant(assistantId) {
    await this._simulateDelay();
    this._maybeFailSimulation('deleteAssistant');

    mockAssistants.delete(assistantId);
    console.log(`[VapiMock] Deleted assistant: ${assistantId}`);
    return true;
  }

  /**
   * Get assistant details
   */
  async getAssistant(assistantId) {
    await this._simulateDelay();

    const assistant = mockAssistants.get(assistantId);
    if (!assistant) {
      throw new Error(`Assistant ${assistantId} not found`);
    }

    return { ...assistant };
  }

  /**
   * Import a phone number from telephony provider
   */
  async importPhoneNumber(phoneNumber, provider = 'telnyx', options = {}) {
    await this._simulateDelay();
    this._maybeFailSimulation('importPhoneNumber');

    const vapiNumber = {
      id: this._generateMockId('phone'),
      number: phoneNumber,
      provider,
      name: options.name || `Number-${phoneNumber.slice(-4)}`,
      assistantId: options.assistantId || null,
      createdAt: new Date().toISOString(),
    };

    mockPhoneNumbers.set(vapiNumber.id, vapiNumber);
    console.log(`[VapiMock] Imported phone number: ${phoneNumber} -> ${vapiNumber.id}`);
    return vapiNumber;
  }

  /**
   * Delete/release a phone number
   */
  async deletePhoneNumber(phoneNumberId) {
    await this._simulateDelay();
    this._maybeFailSimulation('deletePhoneNumber');

    mockPhoneNumbers.delete(phoneNumberId);
    console.log(`[VapiMock] Deleted phone number: ${phoneNumberId}`);
    return true;
  }

  /**
   * Assign assistant to phone number
   */
  async assignAssistantToNumber(phoneNumberId, assistantId) {
    await this._simulateDelay();

    const phoneNumber = mockPhoneNumbers.get(phoneNumberId);
    if (!phoneNumber) {
      throw new Error(`Phone number ${phoneNumberId} not found`);
    }

    phoneNumber.assistantId = assistantId;
    console.log(`[VapiMock] Assigned assistant ${assistantId} to ${phoneNumberId}`);
    return true;
  }

  /**
   * Create an outbound call
   */
  async createCall(callConfig) {
    await this._simulateDelay();
    this._maybeFailSimulation('createCall');

    const call = {
      id: this._generateMockId('call'),
      status: 'queued',
      type: 'outboundPhoneCall',
      phoneNumberId: callConfig.phoneNumberId,
      customerNumber: callConfig.customerNumber,
      assistantId: callConfig.assistantId,
      startedAt: null,
      endedAt: null,
      duration: null,
      transcript: null,
      createdAt: new Date().toISOString(),
    };

    mockCalls.set(call.id, call);

    // Simulate call progression (async, not blocking)
    this._simulateCallProgression(call.id);

    console.log(`[VapiMock] Created call: ${call.id} to ${callConfig.customerNumber}`);
    return call;
  }

  /**
   * Simulate call progression (queued -> ringing -> in-progress -> ended)
   */
  async _simulateCallProgression(callId) {
    const delays = {
      ringing: 500,
      'in-progress': 1000,
      ended: 5000,
    };

    const statuses = ['ringing', 'in-progress', 'ended'];

    for (const status of statuses) {
      await new Promise((resolve) => setTimeout(resolve, delays[status]));

      const call = mockCalls.get(callId);
      if (!call) return;

      call.status = status;

      if (status === 'in-progress') {
        call.startedAt = new Date().toISOString();
      }

      if (status === 'ended') {
        call.endedAt = new Date().toISOString();
        call.duration = 30; // Mock 30 second call
        call.transcript = 'This is a mock call transcript. The conversation went well.';
      }
    }
  }

  /**
   * Get call status/details
   */
  async getCall(callId) {
    await this._simulateDelay();

    const call = mockCalls.get(callId);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    return { ...call };
  }

  // Helper methods for testing

  /**
   * Get all mock assistants (for testing/debugging)
   */
  getAllMockAssistants() {
    return Array.from(mockAssistants.values());
  }

  /**
   * Get all mock phone numbers (for testing/debugging)
   */
  getAllMockPhoneNumbers() {
    return Array.from(mockPhoneNumbers.values());
  }

  /**
   * Get all mock calls (for testing/debugging)
   */
  getAllMockCalls() {
    return Array.from(mockCalls.values());
  }

  /**
   * Clear all mock data (for test cleanup)
   */
  clearMockData() {
    mockAssistants.clear();
    mockPhoneNumbers.clear();
    mockCalls.clear();
    mockIdCounter = 1000;
    console.log('[VapiMock] Cleared all mock data');
  }

  /**
   * Set a mock assistant (for test setup)
   */
  setMockAssistant(id, config) {
    mockAssistants.set(id, {
      id,
      ...config,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Set a mock phone number (for test setup)
   */
  setMockPhoneNumber(id, number, assistantId = null) {
    mockPhoneNumbers.set(id, {
      id,
      number,
      provider: 'telnyx',
      assistantId,
      createdAt: new Date().toISOString(),
    });
  }
}

module.exports = { VapiMockProvider };
