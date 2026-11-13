const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');

const Referral = sequelize.define('Referral', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  referrer_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: 'User giới thiệu (nhận hoa hồng)',
  },
  referred_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    unique: true,
    comment: 'User được giới thiệu',
  },
  total_commission: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: 'Tổng hoa hồng đã nhận từ user này',
  },
}, {
  tableName: 'referrals',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['referrer_id'] },
    { fields: ['referred_id'], unique: true },
  ],
});

module.exports = Referral;
