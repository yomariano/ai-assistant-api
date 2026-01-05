/**
 * Comprehensive Unit Tests for Vapi Voice Provider
 */

// Mock axios before requiring the module
jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosClient),
}));

const mockAxiosClient = {
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  get: jest.fn(),
};

const axios = require('axios');
const { VapiProvider } = require('../vapi');

describe('VapiProvider', () => {
  let provider;

  beforeEach(() => {
    jest.clearAllMocks();
    axios.create.mockReturnValue(mockAxiosClient);
    provider = new VapiProvider('test-api-key');
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================
  describe('constructor', () => {
    it('should initialize with provided API key', () => {
      const p = new VapiProvider('my-api-key');
      expect(p.apiKey).toBe('my-api-key');
    });

    it('should throw error if no API key provided', () => {
      delete process.env.VAPI_API_KEY;
      expect(() => new VapiProvider()).toThrow('VAPI_API_KEY is required');
    });

    it('should use environment variable if no API key passed', () => {
      process.env.VAPI_API_KEY = 'env-api-key';
      const p = new VapiProvider();
      expect(p.apiKey).toBe('env-api-key');
      delete process.env.VAPI_API_KEY;
    });

    it('should create axios client with correct config', () => {
      new VapiProvider('test-key');
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.vapi.ai',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  // ============================================
  // getName
  // ============================================
  describe('getName', () => {
    it('should return "vapi"', () => {
      expect(provider.getName()).toBe('vapi');
    });
  });

  // ============================================
  // CREATE ASSISTANT
  // ============================================
  describe('createAssistant', () => {
    const mockConfig = {
      name: 'Test Assistant',
      firstMessage: 'Hello!',
      systemPrompt: 'You are a helpful assistant.',
      model: { provider: 'openai', model: 'gpt-4' },
      voice: { provider: 'playht', voiceId: 'jennifer' },
    };

    const mockResponse = {
      data: {
        id: 'assistant-123',
        name: 'Test Assistant',
        firstMessage: 'Hello!',
        model: {
          messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
        },
        voice: { provider: 'playht', voiceId: 'jennifer' },
      },
    };

    it('should create assistant with correct payload', async () => {
      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const result = await provider.createAssistant(mockConfig);

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/assistant',
        expect.objectContaining({
          name: 'Test Assistant',
          firstMessage: 'Hello!',
          model: expect.objectContaining({
            provider: 'openai',
            model: 'gpt-4',
          }),
        })
      );

      expect(result.id).toBe('assistant-123');
    });

    it('should use default values for optional fields', async () => {
      mockAxiosClient.post.mockResolvedValue(mockResponse);

      await provider.createAssistant({
        name: 'Test',
        firstMessage: 'Hi',
        systemPrompt: 'Be helpful',
      });

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/assistant',
        expect.objectContaining({
          model: expect.objectContaining({
            provider: 'openai',
            model: 'gpt-4',
          }),
          voice: expect.objectContaining({
            provider: 'playht',
            voiceId: 'jennifer',
          }),
        })
      );
    });

    it('should include custom tools if provided', async () => {
      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const configWithTools = {
        ...mockConfig,
        tools: [{ type: 'function', function: { name: 'customTool' } }],
      };

      await provider.createAssistant(configWithTools);

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/assistant',
        expect.objectContaining({
          model: expect.objectContaining({
            tools: expect.arrayContaining([
              expect.objectContaining({ type: 'function' }),
            ]),
          }),
        })
      );
    });

    it('should add transfer call tool when escalation is enabled', async () => {
      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const configWithEscalation = {
        ...mockConfig,
        escalationSettings: {
          transfer_enabled: true,
          transfer_number: '+353851234567',
          transfer_method: 'blind_transfer',
          trigger_keywords: ['manager', 'supervisor'],
        },
      };

      await provider.createAssistant(configWithEscalation);

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/assistant',
        expect.objectContaining({
          model: expect.objectContaining({
            tools: expect.arrayContaining([
              expect.objectContaining({
                type: 'transferCall',
                destinations: expect.arrayContaining([
                  expect.objectContaining({
                    number: '+353851234567',
                  }),
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it('should not add transfer tool if transfer_enabled is false', async () => {
      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const configWithoutEscalation = {
        ...mockConfig,
        escalationSettings: {
          transfer_enabled: false,
          transfer_number: '+353851234567',
        },
      };

      await provider.createAssistant(configWithoutEscalation);

      const callPayload = mockAxiosClient.post.mock.calls[0][1];
      expect(callPayload.model.tools).toBeUndefined();
    });

    it('should not add transfer tool if transfer_number is missing', async () => {
      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const configMissingNumber = {
        ...mockConfig,
        escalationSettings: {
          transfer_enabled: true,
          // Missing transfer_number
        },
      };

      await provider.createAssistant(configMissingNumber);

      const callPayload = mockAxiosClient.post.mock.calls[0][1];
      expect(callPayload.model.tools).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockAxiosClient.post.mockRejectedValue({
        response: { data: { error: 'API Error' } },
        message: 'Request failed',
      });

      await expect(provider.createAssistant(mockConfig)).rejects.toThrow(
        'Failed to create assistant'
      );
    });
  });

  // ============================================
  // UPDATE ASSISTANT
  // ============================================
  describe('updateAssistant', () => {
    const mockResponse = {
      data: {
        id: 'assistant-123',
        name: 'Updated Assistant',
      },
    };

    it('should update assistant with correct payload', async () => {
      mockAxiosClient.patch.mockResolvedValue(mockResponse);

      await provider.updateAssistant('assistant-123', {
        name: 'Updated Assistant',
        firstMessage: 'Hi there!',
      });

      expect(mockAxiosClient.patch).toHaveBeenCalledWith(
        '/assistant/assistant-123',
        expect.objectContaining({
          name: 'Updated Assistant',
          firstMessage: 'Hi there!',
        })
      );
    });

    it('should update system prompt in model messages', async () => {
      mockAxiosClient.patch.mockResolvedValue(mockResponse);

      await provider.updateAssistant('assistant-123', {
        systemPrompt: 'New system prompt',
      });

      expect(mockAxiosClient.patch).toHaveBeenCalledWith(
        '/assistant/assistant-123',
        expect.objectContaining({
          model: expect.objectContaining({
            messages: [{ role: 'system', content: 'New system prompt' }],
          }),
        })
      );
    });

    it('should update voice settings', async () => {
      mockAxiosClient.patch.mockResolvedValue(mockResponse);

      await provider.updateAssistant('assistant-123', {
        voice: { provider: 'elevenlabs', voiceId: 'custom-voice' },
      });

      expect(mockAxiosClient.patch).toHaveBeenCalledWith(
        '/assistant/assistant-123',
        expect.objectContaining({
          voice: {
            provider: 'elevenlabs',
            voiceId: 'custom-voice',
          },
        })
      );
    });

    it('should add transfer tool when escalation settings provided', async () => {
      mockAxiosClient.patch.mockResolvedValue(mockResponse);

      await provider.updateAssistant('assistant-123', {
        escalationSettings: {
          transfer_enabled: true,
          transfer_number: '+353851234567',
          transfer_method: 'warm_transfer',
        },
      });

      expect(mockAxiosClient.patch).toHaveBeenCalledWith(
        '/assistant/assistant-123',
        expect.objectContaining({
          model: expect.objectContaining({
            tools: expect.arrayContaining([
              expect.objectContaining({
                type: 'transferCall',
              }),
            ]),
          }),
        })
      );
    });

    it('should remove tools when escalation is disabled', async () => {
      mockAxiosClient.patch.mockResolvedValue(mockResponse);

      await provider.updateAssistant('assistant-123', {
        escalationSettings: {
          transfer_enabled: false,
        },
      });

      expect(mockAxiosClient.patch).toHaveBeenCalledWith(
        '/assistant/assistant-123',
        expect.objectContaining({
          model: expect.objectContaining({
            tools: [],
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      mockAxiosClient.patch.mockRejectedValue({
        message: 'Update failed',
      });

      await expect(
        provider.updateAssistant('assistant-123', { name: 'Test' })
      ).rejects.toThrow('Failed to update assistant');
    });
  });

  // ============================================
  // TRANSFER CALL TOOL BUILDING
  // ============================================
  describe('_buildTransferCallTool', () => {
    it('should build correct transfer tool configuration', () => {
      const settings = {
        transfer_number: '+353851234567',
        transfer_method: 'blind_transfer',
        trigger_keywords: ['manager', 'help'],
      };

      const tool = provider._buildTransferCallTool(settings);

      expect(tool.type).toBe('transferCall');
      expect(tool.function.name).toBe('transferCall');
      expect(tool.destinations[0].number).toBe('+353851234567');
      expect(tool.destinations[0].transferPlan.mode).toBe('blind-transfer');
      expect(tool.function.description).toContain('manager');
      expect(tool.function.description).toContain('help');
    });

    it('should use warm transfer mode when specified', () => {
      const settings = {
        transfer_number: '+353851234567',
        transfer_method: 'warm_transfer',
      };

      const tool = provider._buildTransferCallTool(settings);

      expect(tool.destinations[0].transferPlan.mode).toBe('warm-transfer-say-message');
    });

    it('should include appropriate transfer message', () => {
      const settings = {
        transfer_number: '+353851234567',
        transfer_method: 'warm_transfer',
      };

      const tool = provider._buildTransferCallTool(settings);

      expect(tool.destinations[0].message).toContain('hold');
    });

    it('should handle empty trigger keywords', () => {
      const settings = {
        transfer_number: '+353851234567',
        transfer_method: 'blind_transfer',
        trigger_keywords: [],
      };

      const tool = provider._buildTransferCallTool(settings);

      expect(tool.function.description).toContain('when the customer requests');
      expect(tool.function.description).not.toContain('or when they mention:');
    });

    it('should include trigger keywords in description', () => {
      const settings = {
        transfer_number: '+353851234567',
        transfer_method: 'blind_transfer',
        trigger_keywords: ['emergency', 'urgent', 'complaint'],
      };

      const tool = provider._buildTransferCallTool(settings);

      expect(tool.function.description).toContain('emergency');
      expect(tool.function.description).toContain('urgent');
      expect(tool.function.description).toContain('complaint');
    });
  });

  // ============================================
  // TRANSFER MESSAGE
  // ============================================
  describe('_getTransferMessage', () => {
    it('should return correct message for blind transfer', () => {
      const message = provider._getTransferMessage('blind_transfer');
      expect(message.toLowerCase()).toContain('transfer');
    });

    it('should return correct message for warm transfer', () => {
      const message = provider._getTransferMessage('warm_transfer');
      expect(message).toContain('hold');
      expect(message).toContain('team member');
    });

    it('should return correct message for callback', () => {
      const message = provider._getTransferMessage('callback');
      expect(message).toContain('call you back');
    });

    it('should return default message for unknown method', () => {
      const message = provider._getTransferMessage('unknown_method');
      expect(message.toLowerCase()).toContain('transfer');
    });
  });

  // ============================================
  // DELETE ASSISTANT
  // ============================================
  describe('deleteAssistant', () => {
    it('should delete assistant', async () => {
      mockAxiosClient.delete.mockResolvedValue({});

      const result = await provider.deleteAssistant('assistant-123');

      expect(mockAxiosClient.delete).toHaveBeenCalledWith('/assistant/assistant-123');
      expect(result).toBe(true);
    });

    it('should handle delete errors', async () => {
      mockAxiosClient.delete.mockRejectedValue({ message: 'Delete failed' });

      await expect(provider.deleteAssistant('assistant-123')).rejects.toThrow(
        'Failed to delete assistant'
      );
    });
  });

  // ============================================
  // GET ASSISTANT
  // ============================================
  describe('getAssistant', () => {
    it('should get assistant details', async () => {
      mockAxiosClient.get.mockResolvedValue({
        data: {
          id: 'assistant-123',
          name: 'Test Assistant',
          model: { messages: [{ role: 'system', content: 'Prompt' }] },
        },
      });

      const result = await provider.getAssistant('assistant-123');

      expect(mockAxiosClient.get).toHaveBeenCalledWith('/assistant/assistant-123');
      expect(result.id).toBe('assistant-123');
      expect(result.systemPrompt).toBe('Prompt');
    });
  });

  // ============================================
  // PHONE NUMBER OPERATIONS
  // ============================================
  describe('importPhoneNumber', () => {
    const mockPhoneResponse = {
      data: {
        id: 'phone-123',
        number: '+353851234567',
        provider: 'telnyx',
      },
    };

    it('should import phone number with credential', async () => {
      mockAxiosClient.post.mockResolvedValue(mockPhoneResponse);
      process.env.VAPI_TELNYX_CREDENTIAL_ID = 'cred-123';

      const result = await provider.importPhoneNumber('+353851234567', 'telnyx');

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/phone-number',
        expect.objectContaining({
          number: '+353851234567',
          provider: 'telnyx',
          credentialId: 'cred-123',
        })
      );

      expect(result.number).toBe('+353851234567');
      delete process.env.VAPI_TELNYX_CREDENTIAL_ID;
    });

    it('should truncate name to 40 characters', async () => {
      mockAxiosClient.post.mockResolvedValue(mockPhoneResponse);

      const longName = 'A'.repeat(50);
      await provider.importPhoneNumber('+353851234567', 'telnyx', { name: longName });

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/phone-number',
        expect.objectContaining({
          name: 'A'.repeat(40),
        })
      );
    });

    it('should assign assistant if provided', async () => {
      mockAxiosClient.post.mockResolvedValue(mockPhoneResponse);

      await provider.importPhoneNumber('+353851234567', 'telnyx', {
        assistantId: 'assistant-456',
      });

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/phone-number',
        expect.objectContaining({
          assistantId: 'assistant-456',
        })
      );
    });
  });

  describe('deletePhoneNumber', () => {
    it('should delete phone number', async () => {
      mockAxiosClient.delete.mockResolvedValue({});

      const result = await provider.deletePhoneNumber('phone-123');

      expect(mockAxiosClient.delete).toHaveBeenCalledWith('/phone-number/phone-123');
      expect(result).toBe(true);
    });
  });

  describe('assignAssistantToNumber', () => {
    it('should assign assistant to phone number', async () => {
      mockAxiosClient.patch.mockResolvedValue({});

      const result = await provider.assignAssistantToNumber('phone-123', 'assistant-456');

      expect(mockAxiosClient.patch).toHaveBeenCalledWith('/phone-number/phone-123', {
        assistantId: 'assistant-456',
      });
      expect(result).toBe(true);
    });
  });

  // ============================================
  // CALL OPERATIONS
  // ============================================
  describe('createCall', () => {
    const mockCallResponse = {
      data: {
        id: 'call-123',
        status: 'queued',
        type: 'outbound',
      },
    };

    it('should create outbound call', async () => {
      mockAxiosClient.post.mockResolvedValue(mockCallResponse);

      const result = await provider.createCall({
        phoneNumberId: 'phone-123',
        customerNumber: '+353851234567',
        assistantId: 'assistant-123',
      });

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/call/phone',
        expect.objectContaining({
          phoneNumberId: 'phone-123',
          customer: { number: '+353851234567' },
          assistantId: 'assistant-123',
        })
      );

      expect(result.id).toBe('call-123');
    });

    it('should support transient assistant config', async () => {
      mockAxiosClient.post.mockResolvedValue(mockCallResponse);

      await provider.createCall({
        phoneNumberId: 'phone-123',
        customerNumber: '+353851234567',
        assistant: {
          firstMessage: 'Hello!',
          model: { provider: 'openai' },
        },
      });

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/call/phone',
        expect.objectContaining({
          assistant: expect.objectContaining({
            firstMessage: 'Hello!',
          }),
        })
      );
    });

    it('should include metadata if provided', async () => {
      mockAxiosClient.post.mockResolvedValue(mockCallResponse);

      await provider.createCall({
        phoneNumberId: 'phone-123',
        customerNumber: '+353851234567',
        assistantId: 'assistant-123',
        metadata: { orderId: '12345' },
      });

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/call/phone',
        expect.objectContaining({
          metadata: { orderId: '12345' },
        })
      );
    });
  });

  describe('getCall', () => {
    it('should get call details', async () => {
      mockAxiosClient.get.mockResolvedValue({
        data: {
          id: 'call-123',
          status: 'ended',
          startedAt: '2024-01-01T10:00:00Z',
          endedAt: '2024-01-01T10:05:00Z',
        },
      });

      const result = await provider.getCall('call-123');

      expect(mockAxiosClient.get).toHaveBeenCalledWith('/call/call-123');
      expect(result.id).toBe('call-123');
      expect(result.duration).toBe(300); // 5 minutes
    });
  });

  // ============================================
  // MAPPING FUNCTIONS
  // ============================================
  describe('_mapCall', () => {
    it('should calculate duration correctly', () => {
      const callData = {
        id: 'call-123',
        status: 'ended',
        startedAt: '2024-01-01T10:00:00Z',
        endedAt: '2024-01-01T10:05:00Z',
      };

      const mapped = provider._mapCall(callData);

      expect(mapped.duration).toBe(300); // 5 minutes in seconds
    });

    it('should return null duration if call not ended', () => {
      const callData = {
        id: 'call-123',
        status: 'in-progress',
        startedAt: '2024-01-01T10:00:00Z',
      };

      const mapped = provider._mapCall(callData);

      expect(mapped.duration).toBeNull();
    });

    it('should include all call fields', () => {
      const callData = {
        id: 'call-123',
        status: 'ended',
        type: 'inbound',
        transcript: 'Test transcript',
        recordingUrl: 'https://example.com/recording.mp3',
        startedAt: '2024-01-01T10:00:00Z',
        endedAt: '2024-01-01T10:05:00Z',
      };

      const mapped = provider._mapCall(callData);

      expect(mapped.id).toBe('call-123');
      expect(mapped.status).toBe('ended');
      expect(mapped.type).toBe('inbound');
      expect(mapped.transcript).toBe('Test transcript');
      expect(mapped.recordingUrl).toBe('https://example.com/recording.mp3');
    });
  });

  describe('_mapAssistant', () => {
    it('should extract system prompt from messages', () => {
      const data = {
        id: 'assistant-123',
        name: 'Test',
        model: {
          messages: [{ role: 'system', content: 'Be helpful' }],
        },
      };

      const mapped = provider._mapAssistant(data);

      expect(mapped.systemPrompt).toBe('Be helpful');
    });
  });
});
