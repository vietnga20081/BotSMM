require('dotenv').config();
const { sequelize } = require('../models');
const logger = require('../utils/logger');
const { Provider } = require('../models');

async function migrate() {
  try {
    await sequelize.authenticate();
    logger.info('✅ MySQL connected');

    // Sync all models (create tables if not exist)
    await sequelize.sync({ alter: true });
    logger.info('✅ Tables synced');

    // Seed default provider (Kingsmm)
    const [provider, created] = await Provider.findOrCreate({
      where: { name: 'Kingsmm' },
      defaults: {
        api_url: process.env.KINGSMM_API_URL || 'https://kingsmm.vn/api/v2',
        api_key: process.env.KINGSMM_API_KEY,
        status: 'active',
        priority: 1,
      },
    });

    if (created) {
      logger.info('✅ Default provider Kingsmm seeded');
    } else {
      logger.info('ℹ️  Provider Kingsmm already exists');
    }

    logger.info('🎉 Migration completed!');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();

// Migration: Referral system
async function addReferralTables() {
  const sequelize = require('./database');
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        referrer_id INT UNSIGNED NOT NULL,
        referred_id INT UNSIGNED NOT NULL,
        total_commission DECIMAL(15,2) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_referred (referred_id),
        KEY idx_referrer (referrer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ referrals table ensured');

    // Add columns to users
    const cols = [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12) NULL UNIQUE COMMENT 'Mã giới thiệu' AFTER total_orders`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INT UNSIGNED NULL COMMENT 'ID user giới thiệu' AFTER referral_code`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS total_commission DECIMAL(15,2) DEFAULT 0 COMMENT 'Tổng hoa hồng' AFTER referred_by`,
    ];
    for (const sql of cols) {
      try { await sequelize.query(sql); } catch(e) { if (!e.message.includes('Duplicate')) console.warn(e.message); }
    }
    console.log('✅ users referral columns ensured');

    // Add commission type to transactions if enum
    try {
      await sequelize.query(`ALTER TABLE transactions MODIFY COLUMN type ENUM('deposit','order','refund','admin_adjust','bonus','commission') NOT NULL`);
      console.log('✅ transactions.type enum updated');
    } catch(e) { console.warn('transactions type update:', e.message); }
  } catch (e) {
    console.error('Referral migration error:', e.message);
  }
}
addReferralTables();
