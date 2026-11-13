const { User, Transaction } = require('../models');
const sequelize = require('../configs/database');
const logger = require('../utils/logger');

class UserService {
  /**
   * Lấy hoặc tạo user từ Telegram
   */
  async findOrCreate(telegramUser) {
    const [user] = await User.findOrCreate({
      where: { telegram_id: telegramUser.id },
      defaults: {
        username: telegramUser.username || null,
        first_name: telegramUser.first_name || 'Bạn',
        balance: 0,
        role: 'user',
      },
    });

    // Cập nhật username nếu thay đổi (chuẩn hóa undefined → null)
    const newUsername = telegramUser.username || null;
    if (user.username !== newUsername) {
      await user.update({ username: newUsername });
    }

    return user;
  }

  async findByTelegramId(telegramId) {
    return User.findOne({ where: { telegram_id: telegramId } });
  }

  async findById(id) {
    return User.findByPk(id);
  }

  /**
   * Nạp tiền vào tài khoản (từ webhook Sepay)
   */
  async deposit({ telegramId, amount, referenceCode, meta }) {
    const t = await sequelize.transaction();
    try {
      const user = await User.findOne({
        where: { telegram_id: telegramId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (!user) throw new Error('User không tìm thấy');

      const balanceBefore = parseFloat(user.balance);

      await user.update(
        { balance: sequelize.literal(`balance + ${amount}`) },
        { transaction: t }
      );

      await Transaction.create({
        user_id: user.id,
        type: 'deposit',
        amount,
        balance_before: balanceBefore,
        balance_after: balanceBefore + amount,
        description: `Nạp tiền qua ngân hàng`,
        reference_code: referenceCode,
        meta,
      }, { transaction: t });

      await t.commit();
      logger.info(`💰 Deposit ${amount}đ for user ${telegramId} [${referenceCode}]`);

      // Trả hoa hồng cho referrer (ngoài transaction chính)
      try {
        const referralService = require('./referral.service');
        const { sendCommissionNotify } = require('../bot/handlers/referral.handler');
        const botRegistry = require('../bot/botRegistry');
        const result = await referralService.payCommission(user.id, amount);
        if (result) {
          const bot = botRegistry.get();
          if (bot) await sendCommissionNotify(bot, result.referrer.telegram_id, result.commission, user.username);
        }
      } catch (e) {
        logger.warn('payCommission error (non-critical):', e.message);
      }

      return user;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /**
   * Lịch sử giao dịch
   */
  async getTransactions(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const { count, rows } = await Transaction.findAndCountAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });
    return { transactions: rows, total: count, page };
  }

  /**
   * Admin: điều chỉnh số dư
   */
  async adminAdjustBalance(userId, amount, description = '') {
    const t = await sequelize.transaction();
    try {
      const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
      const balanceBefore = parseFloat(user.balance);
      const newBalance = balanceBefore + amount;
      if (newBalance < 0) throw new Error('Số dư không đủ để trừ');

      await user.update({ balance: newBalance }, { transaction: t });
      await Transaction.create({
        user_id: userId,
        type: 'admin_adjust',
        amount,
        balance_before: balanceBefore,
        balance_after: newBalance,
        description: description || `Admin điều chỉnh ${amount > 0 ? '+' : ''}${amount}đ`,
      }, { transaction: t });

      await t.commit();
      return user.reload();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}

module.exports = new UserService();
