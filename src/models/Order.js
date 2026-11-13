const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  service_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  provider_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  provider_order_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'Order ID từ provider',
  },
  link: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  charge: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Số tiền trừ khách (VND)',
  },
  cost_vnd: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0,
    comment: 'Giá gốc provider quy đổi VND (để tính lợi nhuận)',
  },
  cost_usd: {
    type: DataTypes.DECIMAL(15, 6),
    allowNull: true,
    comment: 'Giá gốc provider (USD)',
  },
  status: {
    type: DataTypes.ENUM('Pending', 'Processing', 'In progress', 'Completed', 'Partial', 'Canceled', 'Failed'),
    defaultValue: 'Pending',
  },
  start_count: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  remains: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Custom comments nếu type = Custom Comments',
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'orders',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['service_id'] },
    { fields: ['provider_id'] },
    { fields: ['status'] },
    { fields: ['provider_order_id'] },
    { fields: ['created_at'] },
  ],
});

module.exports = Order;