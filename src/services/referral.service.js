// src/services/referral.service.js
const { User, Referral, Transaction } = require('../models');
const sequelize = require('../configs/database');
const logger = require('../utils/logger');
const crypto = require('crypto');

const COMMISSION_PERCENT = parseFloat(process.env.REFERRAL_COMMISSION_PERCENT || 5);

class ReferralService {
  /**
   * Sinh mã giới thiệu unique cho user
   */
  async getOrCreateCode(userId) {
    const user = await User.findByPk(userId);
    if (user.referral_code) return user.referral_code;

    // Sinh mã 8 ký tự dạng REF + 5 random hex
    let code, exists;
    do {
      code = 'REF' + crypto.randomBytes(3).toString('hex').toUpperCase();
      exists = await User.findOne({ where: { referral_code: code } });
    } while (exists);

    await user.update({ referral_code: code });
    return code;
  }

  /**
   * Xử lý khi user mới đăng ký qua ref code
   */
  async applyReferral(newUserId, refCode) {
    if (!refCode) return null;

    try {
      const referrer = await User.findOne({ where: { referral_code: refCode.toUpperCase() } });
      if (!referrer || referrer.id === newUserId) return null;

      // Kiểm tra user mới chưa được refer bởi ai
      const newUser = await User.findByPk(newUserId);
      if (newUser.referred_by) return null;

      await newUser.update({ referred_by: referrer.id });
      await Referral.findOrCreate({
        where: { referred_id: newUserId },
        defaults: { referrer_id: referrer.id, total_commission: 0 },
      });

      logger.info(`🔗 User ${newUserId} referred by ${referrer.id} (${refCode})`);
      return referrer;
    } catch (e) {
      logger.error('applyReferral error:', e.message);
      return null;
    }
  }

  /**
   * Tính và trả hoa hồng cho referrer khi referred user nạp tiền
   * Gọi sau khi deposit thành công
   */
  async payCommission(referredUserId, depositAmount) {
    try {
      const referredUser = await User.findByPk(referredUserId);
      if (!referredUser?.referred_by) return null;

      const commission = Math.round(depositAmount * (COMMISSION_PERCENT / 100));
      if (commission <= 0) return null;

      const t = await sequelize.transaction();
      try {
        const referrer = await User.findByPk(referredUser.referred_by, {
          lock: t.LOCK.UPDATE, transaction: t,
        });
        if (!referrer) { await t.rollback(); return null; }

        const balanceBefore = parseFloat(referrer.balance);
        await referrer.update(
          { balance: sequelize.literal(`balance + ${commission}`),
            total_commission: sequelize.literal(`total_commission + ${commission}`) },
          { transaction: t }
        );

        await Transaction.create({
          user_id: referrer.id,
          type: 'commission',
          amount: commission,
          balance_before: balanceBefore,
          balance_after: balanceBefore + commission,
          description: `Hoa hồng ${COMMISSION_PERCENT}% từ nạp tiền của @${referredUser.username || referredUser.telegram_id}`,
        }, { transaction: t });

        await Referral.update(
          { total_commission: sequelize.literal(`total_commission + ${commission}`) },
          { where: { referred_id: referredUserId }, transaction: t }
        );

        await t.commit();
        logger.info(`💎 Commission ${commission}đ paid to user ${referrer.id} from deposit of ${referredUserId}`);
        return { referrer, commission };
      } catch (e) {
        await t.rollback();
        throw e;
      }
    } catch (e) {
      logger.error('payCommission error:', e.message);
      return null;
    }
  }

  /**
   * Thống kê referral của user
   */
  async getStats(userId) {
    const user = await User.findByPk(userId);
    const code = await this.getOrCreateCode(userId);

    const referred = await Referral.findAll({
      where: { referrer_id: userId },
      include: [{ model: User, as: 'referred', attributes: ['username', 'first_name', 'total_orders', 'created_at'] }],
      order: [['created_at', 'DESC']],
    });

    return {
      code,
      totalReferred: referred.length,
      totalCommission: parseFloat(user.total_commission || 0),
      commissionPercent: COMMISSION_PERCENT,
      referredUsers: referred,
    };
  }
}

module.exports = new ReferralService();
