const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  telegram_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true,
    comment: 'Telegram user ID',
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: 'Số dư VND',
  },
  role: {
    type: DataTypes.ENUM('user', 'reseller', 'admin'),
    defaultValue: 'user',
  },
  profit_percent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    comment: 'Profit % riêng cho reseller',
  },
  is_banned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  total_spent: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  total_orders: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
  },
  referral_code: {
    type: DataTypes.STRING(12),
    allowNull: true,
    unique: true,
    comment: 'Mã giới thiệu unique',
  },
  referred_by: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: 'ID user đã giới thiệu mình',
  },
  total_commission: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: 'Tổng hoa hồng đã nhận',
  },
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['telegram_id'] },
    { fields: ['role'] },
  ],
});

module.exports = User;