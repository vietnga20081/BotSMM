require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const { createBot } = require('./bot');
const botRegistry = require('./bot/botRegistry');
const logger = require('./utils/logger');

// Import worker để khởi động queue
require('./queues/order.worker');

// Import scheduler
const scheduler = require('./services/scheduler.service');

const PORT = process.env.PORT || 3000;

async function main() {
  try {
    // 1. Kết nối MySQL
    await sequelize.authenticate();
    logger.info('✅ MySQL connected');

    // Sync models (không dùng force: true trong production)
    await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
    logger.info('✅ Database synced');

    // 2. Khởi động Telegram Bot
    const bot = createBot();

    // 3. Register bot vào BotRegistry — worker & notification service dùng chung
    botRegistry.register(bot);
    logger.info('✅ Bot registered to BotRegistry');

    // 4. Khởi động Auto Broadcast scheduler
    const { runAutoBroadcast } = require('./services/autobroadcast.service');
    const morningTarget = process.env.BROADCAST_MORNING_TARGET || 'all';
    const eveningTarget = process.env.BROADCAST_EVENING_TARGET || 'all';

    scheduler.addDailyJob('broadcast-morning', 7, 0, () =>
      runAutoBroadcast('morning', morningTarget)
    );
    scheduler.addDailyJob('broadcast-evening', 19, 0, () =>
      runAutoBroadcast('evening', eveningTarget)
    );
    logger.info('✅ Auto Broadcast scheduler started (7:00 & 19:00 VN)');

    // 5. Auto sync providers — mỗi ngày lúc 3:00 sáng VN
    const syncIntervalHours = parseInt(process.env.PROVIDER_SYNC_INTERVAL_HOURS) || 24;
    const syncHour = parseInt(process.env.PROVIDER_SYNC_HOUR) || 3;

    const { Provider } = require('./models');
    const serviceSyncService = require('./services/serviceSync.service');

    const runProviderSync = async () => {
      try {
        const providers = await Provider.findAll({ where: { status: 'active' } });
        if (!providers.length) { logger.info('Auto sync: no active providers'); return; }
        logger.info(`🔄 Auto sync started for ${providers.length} providers...`);
        let totalCreated = 0, totalUpdated = 0;
        for (const provider of providers) {
          try {
            const result = await serviceSyncService.syncFromProvider(provider.id);
            totalCreated += result.created || 0;
            totalUpdated += result.updated || 0;
            logger.info(`✅ Sync ${provider.name}: +${result.created} new, ~${result.updated} updated`);
          } catch (e) {
            logger.error(`❌ Sync ${provider.name} failed:`, e.message);
          }
        }
        logger.info(`🔄 Auto sync done: ${totalCreated} created, ${totalUpdated} updated`);
      } catch (e) {
        logger.error('Auto sync error:', e.message);
      }
    };

    scheduler.addDailyJob('provider-sync', syncHour, 0, runProviderSync);
    logger.info(`✅ Provider auto-sync scheduled at ${String(syncHour).padStart(2,'0')}:00 VN daily`);

    // 4. Start Express server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📡 Sepay webhook: POST /webhook/sepay`);
      logger.info(`🔧 Admin API: /api/admin (JWT required)`);
    });
  } catch (err) {
    logger.error('❌ Startup failed:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await sequelize.close();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
});

main();
