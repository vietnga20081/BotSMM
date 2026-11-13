const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');

const Service = sequelize.define('Service', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  provider_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  provider_service_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Service ID tại provider',
  },
  platform: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Facebook, Instagram, TikTok...',
  },
  category: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  type: {
    type: DataTypes.STRING(50),
    defaultValue: 'Default',
    comment: 'Default, Package, Custom Comments...',
  },
  rate_provider: {
    type: DataTypes.DECIMAL(15, 6),
    allowNull: false,
    comment: 'Giá gốc từ provider (đã quy đổi sang VND/1000)',
  },
  profit_percent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    comment: 'Profit % cộng thêm (0 = dùng DEFAULT_PROFIT_PERCENT)',
  },
  custom_rate: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: 'Giá bán tuỳ chỉnh (VND/1000) — nếu set thì bỏ qua profit_percent',
  },
  min: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  max: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  refill: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  cancel: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  dripfeed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Admin có thể ẩn dịch vụ',
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'services',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['provider_id'] },
    { fields: ['platform'] },
    { fields: ['category'] },
    { fields: ['is_active'] },
    { fields: ['sort_order'] },
    { unique: true, fields: ['provider_id', 'provider_service_id'] },
  ],
});

module.exports = Service;