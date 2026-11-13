const sequelize = require('../configs/database');
const { User, Service, Provider, Order, Transaction } = require('../models');
const providerApi = require('./providerApi.service');
const notificationService = require('./notification.service');
const { calcPrice } = require('../utils/helpers');
const { orderQueue } = require('../queues/order.queue');
const logger = require('../utils/logger');

class OrderService {
  /**
   * Tạo đơn hàng — atomic transaction
   */
  async createOrder({ userId, serviceId, link, quantity, comments }) {
    const t = await sequelize.transaction();

    try {
      // 1. Lấy thông tin service
      const service = await Service.findByPk(serviceId, {
        include: [{ model: Provider, as: 'provider' }],
        transaction: t,
      });
      if (!service || !service.is_active) throw new Error('Dịch vụ không tồn tại hoặc đã bị tắt');

      // 2. Validate quantity
      if (quantity < service.min) throw new Error(`Số lượng tối thiểu: ${service.min}`);
      if (quantity > service.max) throw new Error(`Số lượng tối đa: ${service.max}`);

      // 3. Tính giá
      const profitPercent = service.profit_percent || parseFloat(process.env.DEFAULT_PROFIT_PERCENT) || 30;
      const charge = service.custom_rate
        ? Math.ceil((service.custom_rate / 1000) * quantity)
        : calcPrice(service.rate_provider, quantity, profitPercent);

      // Tính giá gốc provider (VND) — để tính lợi nhuận sau
      const costVnd = Math.ceil((parseFloat(service.rate_provider) / 1000) * quantity);

      // 4. Kiểm tra số dư user
      const user = await User.findByPk(userId, {
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (!user) throw new Error('User không tồn tại');
      if (parseFloat(user.balance) < charge) {
        throw new Error(`Số dư không đủ. Cần: ${charge.toLocaleString()}đ, Còn: ${parseFloat(user.balance).toLocaleString()}đ`);
      }

      const balanceBefore = parseFloat(user.balance);

      // 5. Trừ balance
      await user.update(
        { balance: sequelize.literal(`balance - ${charge}`) },
        { transaction: t }
      );

      // 6. Tạo Order trong DB (trạng thái Pending)
      const order = await Order.create({
        user_id: userId,
        service_id: serviceId,
        provider_id: service.provider_id,
        link,
        quantity,
        charge,
        cost_vnd: costVnd,
        comments: comments || null,
        status: 'Pending',
      }, { transaction: t });

      // 7. Tạo Transaction
      await Transaction.create({
        user_id: userId,
        order_id: order.id,
        type: 'order',
        amount: -charge,
        balance_before: balanceBefore,
        balance_after: balanceBefore - charge,
        description: `Mua dịch vụ #${order.id}: ${service.name.substring(0, 100)}`,
      }, { transaction: t });

      // 8. Cập nhật user stats
      await user.update({
        total_spent: sequelize.literal(`total_spent + ${charge}`),
        total_orders: sequelize.literal('total_orders + 1'),
      }, { transaction: t });

      await t.commit();

      // 9. Gửi lên provider (ngoài transaction)
      await this._submitToProvider(order, service, service.provider);

      return order;
    } catch (err) {
      await t.rollback();
      logger.error('createOrder error:', err.message);
      throw err;
    }
  }

  /**
   * Gửi đơn lên provider API
   */
  async _submitToProvider(order, service, provider) {
    try {
      const result = await providerApi.addOrder(provider, {
        service: service.provider_service_id,
        link: order.link,
        quantity: order.quantity,
        comments: order.comments,
      });

      if (result.order) {
        await order.update({
          provider_order_id: result.order,
          status: 'Processing',
        });

        // 10. Đưa vào queue check trạng thái
        await orderQueue.add('checkStatus', { orderId: order.id }, {
          delay: 60000, // check sau 1 phút
          attempts: 100,
          backoff: { type: 'fixed', delay: 60000 },
        });

        logger.info(`✅ Order #${order.id} submitted to provider. Provider Order ID: ${result.order}`);

        // 11. Thông báo cho user: đơn đang được xử lý
        const userForNotify = await User.findByPk(order.user_id, { attributes: ['telegram_id'] });
        if (userForNotify?.telegram_id) {
          // Gắn service vào order object cho notification
          order.service = service;
          await notificationService.notifyOrderProcessing({
            telegramId: userForNotify.telegram_id,
            order,
          });
        }
      } else {
        throw new Error(result.error || 'Provider không trả về order ID');
      }
    } catch (err) {
      logger.error(`❌ Submit to provider failed for order #${order.id}:`, err.message);
      await order.update({
        status: 'Failed',
        error_message: err.message,
      });

      // Hoàn tiền
      await this._refundOrder(order);

      // Thông báo thất bại + đã hoàn tiền
      const userForNotify = await User.findByPk(order.user_id, { attributes: ['telegram_id'] });
      if (userForNotify?.telegram_id) {
        await notificationService.notifyOrderFailed({
          telegramId: userForNotify.telegram_id,
          order,
          reason: err.message,
        });
      }
    }
  }

  /**
   * Hoàn tiền khi provider lỗi
   */
  async _refundOrder(order) {
    const t = await sequelize.transaction();
    try {
      const user = await User.findByPk(order.user_id, { lock: t.LOCK.UPDATE, transaction: t });
      const balanceBefore = parseFloat(user.balance);

      await user.update(
        { balance: sequelize.literal(`balance + ${order.charge}`) },
        { transaction: t }
      );

      await Transaction.create({
        user_id: order.user_id,
        order_id: order.id,
        type: 'refund',
        amount: order.charge,
        balance_before: balanceBefore,
        balance_after: balanceBefore + parseFloat(order.charge),
        description: `Hoàn tiền đơn #${order.id} (lỗi provider)`,
      }, { transaction: t });

      await t.commit();
      logger.info(`💰 Refunded ${order.charge}đ for order #${order.id}`);
    } catch (err) {
      await t.rollback();
      logger.error('Refund failed:', err.message);
    }
  }

  /**
   * Lấy đơn hàng của user
   */
  async getUserOrders(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const { count, rows } = await Order.findAndCountAll({
      where: { user_id: userId },
      include: [{ model: Service, as: 'service', attributes: ['name', 'platform'] }],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });
    return { orders: rows, total: count, page, totalPages: Math.ceil(count / limit) };
  }

  /**
   * Lấy chi tiết đơn
   */
  async getOrderDetail(orderId, userId) {
    return Order.findOne({
      where: { id: orderId, user_id: userId },
      include: [{ model: Service, as: 'service' }],
    });
  }
}

module.exports = new OrderService();
