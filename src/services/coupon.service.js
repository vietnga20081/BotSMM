// src/services/coupon.service.js
const { Coupon } = require('../models');
const sequelize = require('../configs/database');
const logger = require('../utils/logger');

class CouponService {
  /**
   * Validate coupon và tính bonus cho số tiền nạp
   * @returns { bonus, bonusType, coupon, message }
   */
  async validateForDeposit(code, depositAmount) {
    if (!code) return null;

    const coupon = await Coupon.findOne({
      where: { code: code.toUpperCase().trim(), is_active: true },
    });

    if (!coupon) return { error: 'Mã coupon không hợp lệ.' };
    if (coupon.expires_at && new Date() > coupon.expires_at)
      return { error: 'Mã coupon đã hết hạn.' };
    if (coupon.used_count >= coupon.max_uses)
      return { error: 'Mã coupon đã hết lượt sử dụng.' };
    if (coupon.min_deposit > 0 && depositAmount < parseFloat(coupon.min_deposit))
      return { error: `Cần nạp tối thiểu ${parseFloat(coupon.min_deposit).toLocaleString('vi-VN')}đ để dùng mã này.` };

    let bonus = 0;
    if (coupon.type === 'percent') {
      bonus = Math.round(depositAmount * (parseFloat(coupon.value) / 100));
    } else {
      bonus = Math.round(parseFloat(coupon.value));
    }

    return { coupon, bonus, bonusType: coupon.type, bonusValue: parseFloat(coupon.value) };
  }

  /**
   * Áp dụng coupon sau khi deposit thành công (trong transaction)
   */
  async applyCoupon(couponId, t) {
    await Coupon.update(
      { used_count: sequelize.literal('used_count + 1') },
      { where: { id: couponId }, transaction: t }
    );
  }
}

module.exports = new CouponService();
