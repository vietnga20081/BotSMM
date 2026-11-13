const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');

const Coupon = sequelize.define('Coupon', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  type: {
    type: DataTypes.ENUM('percent', 'fixed'),
    defaultValue: 'fixed',
  },
  value: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Percent hoặc VND tùy type',
  },
  max_uses: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 1,
  },
  used_count: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
  },
  min_deposit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    comment: 'Nạp tối thiểu để dùng coupon',
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'coupons',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['code'] },
    { fields: ['is_active'] },
    { fields: ['expires_at'] },
  ],
});

module.exports = Coupon;