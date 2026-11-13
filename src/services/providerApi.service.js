const axios = require('axios');
const qs = require('qs');
const logger = require('../utils/logger');

class ProviderApiService {
  /**
   * Gọi SMM Panel API chuẩn v2
   * @param {Object} provider - Provider model instance
   * @param {Object} params - API params
   */
  async call(provider, params) {
    const payload = {
      key: provider.api_key,
      ...params,
    };

    try {
      const response = await axios.post(provider.api_url, qs.stringify(payload), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      return response.data;
    } catch (err) {
      logger.error(`Provider API error [${provider.name}]:`, err.message);
      throw new Error(`Provider không phản hồi: ${err.message}`);
    }
  }

  /**
   * Lấy danh sách dịch vụ
   */
  async getServices(provider) {
    return this.call(provider, { action: 'services' });
  }

  /**
   * Tạo đơn hàng
   */
  async addOrder(provider, { service, link, quantity, comments }) {
    const params = { action: 'add', service, link, quantity };
    if (comments) params.comments = comments;
    return this.call(provider, params);
  }

  /**
   * Kiểm tra trạng thái 1 đơn
   */
  async getOrderStatus(provider, orderId) {
    return this.call(provider, { action: 'status', order: orderId });
  }

  /**
   * Kiểm tra nhiều đơn cùng lúc
   */
  async getMultiOrderStatus(provider, orderIds) {
    return this.call(provider, {
      action: 'status',
      orders: orderIds.join(','),
    });
  }

  /**
   * Refill đơn
   */
  async refillOrder(provider, orderId) {
    return this.call(provider, { action: 'refill', order: orderId });
  }

  /**
   * Hủy đơn
   */
  async cancelOrders(provider, orderIds) {
    return this.call(provider, {
      action: 'cancel',
      orders: orderIds.join(','),
    });
  }

  /**
   * Kiểm tra số dư provider
   */
  async getBalance(provider) {
    return this.call(provider, { action: 'balance' });
  }
}

module.exports = new ProviderApiService();
