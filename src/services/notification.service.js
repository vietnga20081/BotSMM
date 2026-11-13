const botRegistry = require('../bot/botRegistry');
const { formatVND, truncateLink } = require('../utils/helpers');
const { escMd } = require('../bot/messages');
const logger = require('../utils/logger');

// ── Emoji & label theo trạng thái ──────────────────────────
const STATUS_CONFIG = {
  Completed: {
    emoji: '✅',
    title: 'HOÀN THÀNH',
    color: '🟢',
  },
  Partial: {
    emoji: '⚠️',
    title: 'HOÀN THÀNH MỘT PHẦN',
    color: '🟡',
  },
  Canceled: {
    emoji: '❌',
    title: 'ĐÃ HỦY',
    color: '🔴',
  },
  Failed: {
    emoji: '💔',
    title: 'THẤT BẠI',
    color: '🔴',
  },
};


class NotificationService {
  /**
   * Gửi thông báo cập nhật trạng thái đơn đến user
   *
   * @param {Object} opts
   * @param {string|number} opts.telegramId   - Telegram chat ID của user
   * @param {Object}        opts.order        - Order instance (đã include service + user)
   * @param {string}        opts.newStatus    - Trạng thái mới từ provider
   * @param {string}        opts.oldStatus    - Trạng thái cũ trước khi update
   * @param {number|null}   opts.remains      - Số lượng còn lại (nếu có)
   * @param {number|null}   opts.startCount   - Start count từ provider (nếu có)
   */
  async notifyOrderStatus({ telegramId, order, newStatus, oldStatus, remains, startCount }) {
    const bot = botRegistry.get();
    if (!bot) {
      logger.warn('NotificationService: bot chưa được register, bỏ qua notification');
      return;
    }

    // Chỉ gửi khi chuyển sang trạng thái terminal hoặc "In progress" lần đầu
    const shouldNotify = this._shouldNotify(newStatus, oldStatus);
    if (!shouldNotify) return;

    try {
      const message = this._buildStatusMessage(order, newStatus, remains, startCount);
      const keyboard = this._buildKeyboard(order.id, newStatus);

      await bot.sendMessage(telegramId, message, {
        parse_mode: 'MarkdownV2',
        ...keyboard,
      });

      logger.info(`📨 Notified user ${telegramId} — Order #${order.id}: ${oldStatus} → ${newStatus}`);
    } catch (err) {
      // Không throw — lỗi notification không được làm crash worker
      logger.warn(`Notification failed for user ${telegramId} order #${order.id}: ${err.message}`);
    }
  }

  /**
   * Thông báo khi đơn vừa được submit lên provider thành công
   */
  async notifyOrderProcessing({ telegramId, order }) {
    const bot = botRegistry.get();
    if (!bot) return;

    try {
      const svcName = order.service?.name || `Dịch vụ #${order.service_id}`;
      const msg =
        `⚙️ *ĐƠN HÀNG ĐANG XỬ LÝ*\n\n` +
        `📝 Mã đơn: *\\#${order.id}*\n` +
        `🏷️ *Dịch vụ:* ${escMd(svcName.substring(0, 80))}\n` +
        `🔗 *Link:* \`${escMd(truncateLink(order.link, 50))}\`\n` +
        `📦 *Số lượng:* ${escMd(order.quantity.toLocaleString())}\n\n` +
        `_Hệ thống sẽ tự động thông báo khi đơn hoàn thành\\._`;

      await bot.sendMessage(telegramId, msg, {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [[
            { text: '📊 Xem trạng thái', callback_data: `order_status:${order.id}` },
          ]],
        },
      });
    } catch (err) {
      logger.warn(`notifyOrderProcessing failed: ${err.message}`);
    }
  }

  /**
   * Thông báo khi provider lỗi và đã hoàn tiền
   */
  async notifyOrderFailed({ telegramId, order, reason }) {
    const bot = botRegistry.get();
    if (!bot) return;

    try {
      const msg =
        `💔 *ĐƠN HÀNG THẤT BẠI & ĐÃ HOÀN TIỀN*\n\n` +
        `📝 Mã đơn: *\\#${order.id}*\n` +
        `💰 *Hoàn tiền:* *\\+${escMd(formatVND(order.charge))}*\n` +
        (reason ? `⚠️ *Lý do:* ${escMd(reason)}\n` : '') +
        `\n_Tiền đã được cộng lại vào số dư của bạn\\._`;

      await bot.sendMessage(telegramId, msg, {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [[
            { text: '💰 Kiểm tra số dư', callback_data: 'menu:balance' },
            { text: '🛒 Mua lại', callback_data: 'buy:again' },
          ]],
        },
      });
    } catch (err) {
      logger.warn(`notifyOrderFailed failed: ${err.message}`);
    }
  }

  /**
   * Thông báo nạp tiền thành công (gọi từ sepay.controller)
   */
  async notifyDeposit({ telegramId, amount, balanceAfter, referenceCode }) {
    const bot = botRegistry.get();
    if (!bot) return;

    try {
      const msg =
        `💰 *NẠP TIỀN THÀNH CÔNG\\!*\n\n` +
        `💵 *Số tiền:* *\\+${escMd(formatVND(amount))}*\n` +
        `🏦 *Số dư mới:* *${escMd(formatVND(balanceAfter))}*\n` +
        `🔖 *Mã GD:* \`${escMd(referenceCode)}\`\n\n` +
        `_Cảm ơn bạn đã nạp tiền\\! Hãy bắt đầu mua dịch vụ ngay\\._`;

      await bot.sendMessage(telegramId, msg, {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [[
            { text: '🛒 Mua dịch vụ ngay', callback_data: 'buy:again' },
          ]],
        },
      });
    } catch (err) {
      logger.warn(`notifyDeposit failed for ${telegramId}: ${err.message}`);
    }
  }

  // ── Private helpers ─────────────────────────────────────

  /**
   * Quyết định có nên gửi notification không
   * - Terminal status: luôn gửi
   * - In progress: chỉ gửi lần đầu (khi từ Pending/Processing chuyển sang)
   * - Pending/Processing: không gửi (đã thông báo lúc đặt hàng rồi)
   */
  _shouldNotify(newStatus, oldStatus) {
    const TERMINAL = ['Completed', 'Partial', 'Canceled', 'Failed'];
    if (TERMINAL.includes(newStatus)) return true;

    // "In progress" — chỉ notify khi chuyển từ Pending/Processing
    if (newStatus === 'In progress' &&
        (oldStatus === 'Pending' || oldStatus === 'Processing')) return true;

    return false;
  }

  /**
   * Build nội dung tin nhắn theo từng trạng thái
   */
  _buildStatusMessage(order, status, remains, startCount) {
    const cfg = STATUS_CONFIG[status] || { emoji: '🔔', title: status, color: '⚪' };
    const svcName = order.service?.name || `Dịch vụ #${order.service_id}`;
    const delivered = (startCount != null && remains != null)
      ? startCount + order.quantity - remains - startCount
      : null;

    // Header
    let msg =
      `${cfg.emoji} *${cfg.color} ĐƠN \\#${order.id} — ${escMd(cfg.title)}*\n\n`;

    // Thông tin chung
    msg += `🏷️ *Dịch vụ:* ${escMd(svcName.substring(0, 80))}\n`;
    msg += `🔗 *Link:* \`${escMd(truncateLink(order.link, 50))}\`\n`;
    msg += `📦 *Số lượng đặt:* ${escMd(order.quantity.toLocaleString())}\n`;

    // Thông tin chi tiết theo status
    if (status === 'Completed') {
      msg += `✅ *Đã giao:* *${escMd(order.quantity.toLocaleString())}*\n`;
      msg += `💰 *Chi phí:* ${escMd(formatVND(order.charge))}\n`;
      msg += `\n🎉 _Hoàn thành\\! Cảm ơn bạn đã sử dụng dịch vụ\\._\n`;
      msg += `⭐ _Đánh giá dịch vụ để giúp chúng tôi cải thiện\\!_`;
    }

    if (status === 'Partial') {
      const done = remains != null ? order.quantity - parseInt(remains) : null;
      msg += (done != null ? `✅ *Đã giao:* ${escMd(done.toLocaleString())}\n` : '');
      msg += (remains != null ? `📉 *Còn thiếu:* ${escMd(parseInt(remains).toLocaleString())}\n` : '');
      msg += `💰 *Chi phí:* ${escMd(formatVND(order.charge))}\n`;
      msg += `\n⚠️ _Đơn giao một phần\\. Bạn có thể yêu cầu refill nếu dịch vụ hỗ trợ\\._`;
    }

    if (status === 'Canceled') {
      msg += `💰 *Hoàn tiền:* *\\+${escMd(formatVND(order.charge))}*\n`;
      msg += `\n❌ _Đơn đã bị hủy\\. Tiền đã được hoàn tự động vào số dư\\._`;
    }

    if (status === 'Failed') {
      msg += `💰 *Hoàn tiền:* *\\+${escMd(formatVND(order.charge))}*\n`;
      msg += `\n💔 _Đơn thất bại\\. Tiền đã được hoàn tự động vào số dư của bạn\\._`;
    }

    if (status === 'In progress') {
      msg =
        `🔄 *ĐƠN \\#${order.id} — ĐANG TIẾN HÀNH*\n\n` +
        `🏷️ *Dịch vụ:* ${escMd(svcName.substring(0, 80))}\n` +
        `🔗 *Link:* \`${escMd(truncateLink(order.link, 50))}\`\n` +
        `📦 *Số lượng:* ${escMd(order.quantity.toLocaleString())}\n` +
        (startCount != null ? `📊 *Bắt đầu từ:* ${escMd(parseInt(startCount).toLocaleString())}\n` : '') +
        `\n_Đang chạy\\.\\.\\. Bạn sẽ được thông báo khi hoàn thành\\._`;
    }

    return msg;
  }

  /**
   * Inline keyboard theo status
   */
  _buildKeyboard(orderId, status) {
    const buttons = [[
      { text: '📊 Chi tiết đơn', callback_data: `order_status:${orderId}` },
    ]];

    if (status === 'Completed' || status === 'Partial') {
      buttons.push([{ text: '🛒 Đặt lại dịch vụ này', callback_data: 'buy:again' }]);
    }

    if (status === 'Partial') {
      buttons[0].push({ text: '📞 Hỗ trợ', callback_data: 'menu:support' });
    }

    if (status === 'Failed' || status === 'Canceled') {
      buttons.push([
        { text: '💰 Kiểm tra số dư', callback_data: 'menu:balance' },
        { text: '🛒 Mua lại', callback_data: 'buy:again' },
      ]);
    }

    return { reply_markup: { inline_keyboard: buttons } };
  }
}

module.exports = new NotificationService();
