const { DataTypes } = require('sequelize');
const sequelize = require('../configs/database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  },
  order_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  },
  type: {
    type: DataTypes.ENUM('deposit', 'order', 'refund', 'bonus', 'admin_adjust'),
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Số tiền (+ hoặc -)',
  },
  balance_before: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  balance_after: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  reference_code: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'Mã tham chiếu từ bank/sepay',
  },
  meta: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Extra data (sepay payload, etc.)',
    get() {
      const raw = this.getDataValue('meta');
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    set(value) {
      if (value && typeof value === 'object') {
        this.setDataValue('meta', JSON.stringify(value));
      } else {
        this.setDataValue('meta', value);
      }
    },
  },
}, {
  tableName: 'transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['order_id'] },
    { fields: ['type'] },
    { fields: ['reference_code'] },
    { fields: ['created_at'] },
  ],
});

module.exports = Transaction;