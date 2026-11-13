const sequelize = require('../configs/database');
const User = require('./User');
const Provider = require('./Provider');
const Service = require('./Service');
const Order = require('./Order');
const Transaction = require('./Transaction');
const Coupon = require('./Coupon');
const Referral = require('./Referral');

// ====== Associations ======

// User ↔ Orders
User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User ↔ Transactions
User.hasMany(Transaction, { foreignKey: 'user_id', as: 'transactions' });
Transaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Provider ↔ Services
Provider.hasMany(Service, { foreignKey: 'provider_id', as: 'services' });
Service.belongsTo(Provider, { foreignKey: 'provider_id', as: 'provider' });

// Provider ↔ Orders
Provider.hasMany(Order, { foreignKey: 'provider_id', as: 'orders' });
Order.belongsTo(Provider, { foreignKey: 'provider_id', as: 'provider' });

// Service ↔ Orders
Service.hasMany(Order, { foreignKey: 'service_id', as: 'orders' });
Order.belongsTo(Service, { foreignKey: 'service_id', as: 'service' });

// Order ↔ Transaction
Order.hasOne(Transaction, { foreignKey: 'order_id', as: 'transaction' });
Transaction.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// Order ↔ Coupon (nếu có)
Order.belongsTo(Coupon, { foreignKey: 'coupon_id', as: 'coupon', constraints: false });
Coupon.hasMany(Order, { foreignKey: 'coupon_id', as: 'orders' });


// Referral associations
if (User && Referral) {
  Referral.belongsTo(User, {
    foreignKey: 'referrer_id',
    as: 'referrer',
    constraints: false,
  });

  Referral.belongsTo(User, {
    foreignKey: 'referred_id',
    as: 'referred',
    constraints: false,
  });

  User.hasMany(Referral, {
    foreignKey: 'referrer_id',
    as: 'referrals',
    constraints: false,
  });

  User.hasOne(Referral, {
    foreignKey: 'referred_id',
    as: 'referralInfo',
    constraints: false,
  });
}

module.exports = {
  Referral,
  sequelize,
  User,
  Provider,
  Service,
  Order,
  Transaction,
  Coupon,
};