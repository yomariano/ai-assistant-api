/**
 * Telnyx Telephony Provider
 *
 * Real implementation that calls the Telnyx API.
 * Use this in staging and production environments.
 */

const axios = require('axios');

const TELNYX_API = 'https://api.telnyx.com/v2';

class TelnyxProvider {
  constructor(apiKey, voiceAppId = null) {
    this.apiKey = apiKey || process.env.TELNYX_API_KEY;
    this.voiceAppId = voiceAppId || process.env.TELNYX_VOICE_APP_ID;

    if (!this.apiKey) {
      throw new Error('TELNYX_API_KEY is required');
    }

    this.client = axios.create({
      baseURL: TELNYX_API,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  getName() {
    return 'telnyx';
  }

  /**
   * Search for available phone numbers
   */
  async searchAvailableNumbers(limit, options = {}) {
    const {
      countryCode = 'US',
      features = ['sms', 'voice'],
      numberType = 'local',
      areaCode = null,
    } = options;

    try {
      const params = {
        'filter[country_code]': countryCode,
        'filter[features]': features.join(','),
        'filter[number_type]': numberType,
        'filter[limit]': limit,
      };

      if (areaCode) {
        params['filter[national_destination_code]'] = areaCode;
      }

      const response = await this.client.get('/available_phone_numbers', { params });

      return (response.data.data || []).map((n) => ({
        id: n.record_type === 'available_phone_number' ? null : n.id,
        phone_number: n.phone_number,
        features: n.features,
        region_information: n.region_information,
      }));
    } catch (error) {
      console.error('Telnyx search error:', error.response?.data || error.message);
      throw new Error(`Failed to search phone numbers: ${error.message}`);
    }
  }

  /**
   * Purchase phone numbers
   */
  async purchaseNumbers(numbers) {
    try {
      const response = await this.client.post('/number_orders', {
        phone_numbers: numbers.map((n) => ({
          phone_number: n.phone_number,
        })),
      });

      const orderId = response.data.data.id;

      // Wait for order to complete
      const order = await this.waitForOrderCompletion(orderId);

      return (order.phone_numbers || []).map((n) => ({
        id: n.id,
        phone_number: n.phone_number,
        status: n.status,
      }));
    } catch (error) {
      console.error('Telnyx purchase error:', error.response?.data || error.message);
      throw new Error(`Failed to purchase phone numbers: ${error.message}`);
    }
  }

  /**
   * Wait for number order to complete
   */
  async waitForOrderCompletion(orderId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.client.get(`/number_orders/${orderId}`);
      const status = response.data.data.status;

      if (status === 'success') {
        return response.data.data;
      }

      if (status === 'failed') {
        throw new Error('Number order failed');
      }

      // Wait 1 second before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Number order timed out');
  }

  /**
   * Release/delete a phone number
   */
  async releaseNumber(phoneNumberId) {
    try {
      await this.client.delete(`/phone_numbers/${phoneNumberId}`);
      return true;
    } catch (error) {
      console.error('Telnyx release error:', error.response?.data || error.message);
      throw new Error(`Failed to release phone number: ${error.message}`);
    }
  }

  /**
   * Assign phone number to a voice application
   */
  async assignToVoiceApp(phoneNumberId, applicationId = null) {
    const appId = applicationId || this.voiceAppId;

    if (!appId) {
      console.warn('No voice app ID provided, skipping assignment');
      return false;
    }

    try {
      await this.client.patch(`/phone_numbers/${phoneNumberId}`, {
        connection_id: appId,
      });
      return true;
    } catch (error) {
      console.error('Telnyx voice app assignment error:', error.response?.data || error.message);
      // Non-fatal, return false but don't throw
      return false;
    }
  }

  /**
   * Get phone number details
   */
  async getNumber(phoneNumberId) {
    try {
      const response = await this.client.get(`/phone_numbers/${phoneNumberId}`);
      const n = response.data.data;

      return {
        id: n.id,
        phone_number: n.phone_number,
        status: n.status,
        connection_id: n.connection_id,
      };
    } catch (error) {
      console.error('Telnyx get number error:', error.response?.data || error.message);
      throw new Error(`Failed to get phone number: ${error.message}`);
    }
  }
}

module.exports = { TelnyxProvider };
