const userService = require('../services/user.service');
const { Transaction } = require('../models');
const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');
const { formatVND } = require('../utils/helpers');

/**
 * Webhook nhận từ Sepay khi có giao dịch ngân hàng vào
 *
 * Sepay POST body ví dụ:
 * {
 *   "id": 12345,
 *   "gateway": "MB",
 *   "transactionDate": "2024-01-01 12:00:00",
 *   "accountNumber": "0123456789",
 *   "subAccount": null,
 *   "code": "MBVCB12345",
 *   "content": "NAPTIEN 123456789",
 *   "transferType": "in",
 *   "description": "...",
 *   "transferAmount": 100000,
 *   "referenceCode": "FT24001234567",
 *   "accumulated": 100000
 * }
 */
const handleSepayWebhook = async (req, res) => {
  try {
    const payload = req.body;
    logger.info('📨 Sepay webhook received:', JSON.stringify(payload));

    // Xác thực secret key từ header (Sepay gửi Authorization header)
    const authHeader = req.headers['authorization'] || '';
    const secretKey = process.env.SEPAY_SECRET_KEY;

    if (secretKey && authHeader !== `Apikey ${secretKey}`) {
      logger.warn('Sepay webhook: invalid secret key');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Chỉ xử lý giao dịch vào (transferType = "in")
    if (payload.transferType !== 'in') {
      return res.json({ success: true, message: 'Ignored outgoing transfer' });
    }

    const amount = parseInt(payload.transferAmount);
    if (!amount || amount <= 0) {
      return res.json({ success: true, message: 'Invalid amount' });
    }

    // Kiểm tra duplicate (reference code)
    const refCode = payload.referenceCode || payload.code || String(payload.id);
    const existing = await Transaction.findOne({ where: { reference_code: refCode } });
    if (existing) {
      logger.info(`Sepay: duplicate transaction ${refCode}, skipped`);
      return res.json({ success: true, message: 'Already processed' });
    }

    // Parse telegram_id từ nội dung chuyển khoản
    // Format: "NAPTIEN {telegram_id}"
    const content = (payload.content || payload.description || '').toUpperCase();
    const match = content.match(/NAPTIEN\s+(\d+)/);

    if (!match) {
      logger.warn(`Sepay: cannot parse telegram_id from content: "${content}"`);
      return res.json({ success: true, message: 'Cannot parse user ID from content' });
    }

    const telegramId = match[1];

    // Parse coupon code từ nội dung (nếu có): "NAPTIEN 123456 SUMMER25"
    const couponMatch = content.match(/NAPTIEN\s+\d+\s+([A-Z0-9]+)/);
    const couponCode = couponMatch ? couponMatch[1] : null;
    if (couponCode) logger.info(`Sepay: coupon code detected: ${couponCode}`);

    // Nạp tiền cho user
    const result = await userService.deposit({
      telegramId,
      amount,
      referenceCode: refCode,
      meta: payload,
      couponCode,
    });

    const user = result.user || result;
    const bonusAmount = result.bonusAmount || 0;
    const couponResult = result.couponResult || null;

    // Thông báo cho user qua Telegram
    await notificationService.notifyDeposit({
      telegramId,
      amount,
      bonusAmount,
      couponCode: bonusAmount > 0 ? couponCode : null,
      couponResult,
      balanceAfter: parseFloat(user.balance),
      referenceCode: refCode,
    });

    logger.info(`✅ Deposited ${amount}đ for telegram user ${telegramId}`);
    return res.json({ success: true });
  } catch (err) {
    logger.error('Sepay webhook error:', err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

module.exports = { handleSepayWebhook };
