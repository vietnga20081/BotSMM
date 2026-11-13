const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');

const Provider = sequelize.define('Provider', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  api_url: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  api_key: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  balance: {
    type: DataTypes.DECIMAL(15, 4),
    defaultValue: 0,
    comment: 'Số dư tại provider',
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'USD',
    comment: 'USD, VND, ...',
  },
  exchange_rate: {
    type: DataTypes.DECIMAL(15, 4),
    defaultValue: 25000,
    comment: 'Tỷ giá quy đổi sang VND',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Độ ưu tiên — số nhỏ hơn = ưu tiên cao hơn',
  },
  profit_percent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    comment: 'Lợi nhuận % riêng của provider (0 = dùng DEFAULT_PROFIT_PERCENT)',
  },
  last_sync_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'providers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['status'] },
    { fields: ['priority'] },
  ],
});

module.exports = Provider;