const userService = require('../../services/user.service');
const logger = require('../../utils/logger');

/**
 * Middleware: tự động upsert user, kiểm tra ban
 */
const authMiddleware = async (bot, msg, next) => {
  try {
    const tgUser = msg.from;
    if (!tgUser) return;

    const user = await userService.findOrCreate(tgUser);

    if (user.is_banned) {
      await bot.sendMessage(msg.chat.id,
        '🚫 Tài khoản của bạn đã bị khóa. Liên hệ admin để được hỗ trợ.',
      );
      return;
    }

    msg._user = user;
    if (next) await next();
  } catch (err) {
    // Log đầy đủ stack để debug dễ hơn
    logger.error('authMiddleware error:', err?.message || err);
    logger.error(err?.stack || '');
  }
};

/**
 * Kiểm tra admin
 */
const isAdmin = (telegramId) => {
  const adminIds = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map((id) => id.trim());
  return adminIds.includes(String(telegramId));
};

module.exports = { authMiddleware, isAdmin };
