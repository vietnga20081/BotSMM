const { Worker } = require('bullmq');
const { redisConfig } = require('../configs/redis');
const { Order, Provider, Service, User } = require('../models');
const providerApi = require('../services/providerApi.service');
const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');
const { orderQueue } = require('./order.queue');

const TERMINAL_STATUSES = ['Completed', 'Partial', 'Canceled', 'Failed'];

const worker = new Worker('order-status', async (job) => {
  const { orderId } = job.data;

  // Load đầy đủ quan hệ để notification có đủ data
  const order = await Order.findByPk(orderId, {
    include: [
      { model: Provider, as: 'provider' },
      { model: Service, as: 'service', attributes: ['name', 'platform'] },
      { model: User, as: 'user', attributes: ['telegram_id'] },
    ],
  });

  if (!order) {
    logger.warn(`Order #${orderId} not found in queue job`);
    return;
  }

  // Đơn đã terminal rồi → bỏ qua hoàn toàn
  if (TERMINAL_STATUSES.includes(order.status)) {
    logger.debug(`Order #${orderId} already terminal: ${order.status}`);
    return;
  }

  if (!order.provider_order_id) {
    logger.warn(`Order #${orderId} has no provider_order_id yet, retry in 2m`);
    await orderQueue.add('checkStatus', { orderId }, { delay: 120000 });
    return;
  }

  try {
    const result = await providerApi.getOrderStatus(order.provider, order.provider_order_id);

    if (result.error) {
      logger.warn(`Order #${orderId} provider error: ${result.error}`);
      await orderQueue.add('checkStatus', { orderId }, { delay: 180000 });
      return;
    }

    const oldStatus = order.status;
    const newStatus = result.status;
    const remains = result.remains !== undefined ? parseInt(result.remains) : order.remains;
    const startCount = result.start_count !== undefined ? parseInt(result.start_count) : order.start_count;

    // Cập nhật DB
    const updateData = { status: newStatus, remains, start_count: startCount };
    if (newStatus === 'Completed' || newStatus === 'Partial') updateData.completed_at = new Date();
    await order.update(updateData);

    logger.info(`📦 Order #${orderId}: ${oldStatus} → ${newStatus} | Remains: ${remains}`);

    // ── Auto refund khi Failed ────────────────────────────
    if (newStatus === 'Failed' && oldStatus !== 'Failed') {
      try {
        const { Transaction, User: UserModel } = require('../models');
        const seqRef = require('../configs/database');
        const tf = await seqRef.transaction();
        const userToRefund = await UserModel.findByPk(order.user_id, { lock: tf.LOCK.UPDATE, transaction: tf });
        if (userToRefund) {
          const balBefore = parseFloat(userToRefund.balance);
          await userToRefund.update(
            { balance: seqRef.literal(`balance + ${order.charge}`) },
            { transaction: tf }
          );
          await Transaction.create({
            user_id: order.user_id,
            order_id: order.id,
            type: 'refund',
            amount: parseFloat(order.charge),
            balance_before: balBefore,
            balance_after: balBefore + parseFloat(order.charge),
            description: `Hoàn tiền tự động đơn #${order.id} (provider báo Failed)`,
          }, { transaction: tf });
          await tf.commit();
          logger.info(`💰 Auto-refunded ${order.charge}đ for failed order #${orderId}`);
        } else {
          await tf.rollback();
        }
      } catch (refErr) {
        logger.error(`Auto-refund failed for order #${orderId}:`, refErr.message);
      }
    }

    // ── Auto refund khi Canceled (từ provider) ────────────
    if (newStatus === 'Canceled' && oldStatus !== 'Canceled') {
      try {
        const { Transaction, User: UserModel } = require('../models');
        const seqRef = require('../configs/database');
        const tf = await seqRef.transaction();
        const userToRefund = await UserModel.findByPk(order.user_id, { lock: tf.LOCK.UPDATE, transaction: tf });
        if (userToRefund) {
          const balBefore = parseFloat(userToRefund.balance);
          await userToRefund.update(
            { balance: seqRef.literal(`balance + ${order.charge}`) },
            { transaction: tf }
          );
          await Transaction.create({
            user_id: order.user_id,
            order_id: order.id,
            type: 'refund',
            amount: parseFloat(order.charge),
            balance_before: balBefore,
            balance_after: balBefore + parseFloat(order.charge),
            description: `Hoàn tiền tự động đơn #${order.id} (provider Canceled)`,
          }, { transaction: tf });
          await tf.commit();
          logger.info(`💰 Auto-refunded ${order.charge}đ for canceled order #${orderId}`);
        } else {
          await tf.rollback();
        }
      } catch (refErr) {
        logger.error(`Auto-refund (cancel) failed for order #${orderId}:`, refErr.message);
      }
    }

    // ── Gửi thông báo Telegram cho user ──────────────────
    const telegramId = order.user?.telegram_id;
    if (telegramId) {
      await notificationService.notifyOrderStatus({
        telegramId,
        order,
        newStatus,
        oldStatus,
        remains,
        startCount,
      });
    }

    // Schedule check tiếp nếu chưa terminal
    if (!TERMINAL_STATUSES.includes(newStatus)) {
      const delay = newStatus === 'In progress' ? 120000 : 60000;
      await orderQueue.add('checkStatus', { orderId }, { delay });
    }
  } catch (err) {
    logger.error(`Error checking order #${orderId}: ${err.message}`);
    // Retry sau 5 phút khi có lỗi network/api
    await orderQueue.add('checkStatus', { orderId }, { delay: 300000 });
  }
}, {
  connection: redisConfig,
  concurrency: 10,
});

worker.on('completed', (job) => {
  logger.debug(`✅ Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`❌ Job ${job?.id} failed: ${err.message}`);
});

module.exports = worker;
