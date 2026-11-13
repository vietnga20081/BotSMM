const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const { authMiddleware, isAdmin } = require('./middlewares/auth.middleware');
const stateManager = require('./stateManager');
const keyboards = require('./keyboards');
const { messages, escMd } = require('./messages');

// Handlers
const buyHandler = require('./handlers/buy.handler');
const orderHandler = require('./handlers/order.handler');
const referralHandler = require('./handlers/referral.handler');
const balanceHandler = require('./handlers/balance.handler');

/**
 * Khởi tạo Telegram Bot
 */
const createBot = () => {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  logger.info('🤖 Telegram Bot starting...');

  // =============================================
  // MESSAGE HANDLER
  // =============================================
  bot.on('message', async (msg) => {
    if (!msg.text) return;

    await authMiddleware(bot, msg, async () => {
      const chatId = msg.chat.id;
      const user = msg._user;
      const text = msg.text.trim();

      if (text === '/start') {
        await stateManager.clear(chatId);
        return bot.sendMessage(chatId, messages.welcome(user.first_name || 'bạn'), {
          parse_mode: 'MarkdownV2',
          ...keyboards.mainMenu(),
        });
      }

      if (text === '🛒 Mua dịch vụ') {
        await stateManager.clear(chatId);
        return buyHandler.showPlatforms(bot, chatId);
      }

      if (text === '📦 Đơn hàng của tôi') {
        return orderHandler.showMyOrders(bot, chatId, user, 1);
      }

      if (text === '💰 Số dư') {
        return balanceHandler.showBalance(bot, chatId, user);
      }

      if (text === '💳 Nạp tiền') {
        return balanceHandler.showDepositInfo(bot, chatId, user);
      }

      if (text === '🎫 Coupon') {
        await stateManager.set(chatId, { step: 'enter_coupon' });
        return bot.sendMessage(
          chatId,
          '🎫 Vui lòng nhập mã coupon của bạn\\:',
          { parse_mode: 'MarkdownV2', ...keyboards.cancelKeyboard() }
        );
      }

      if (text === '💎 Giới thiệu') {
        return referralHandler.showReferral(bot, chatId, user);
      }

      if (text === '📞 Hỗ trợ') {
        return bot.sendMessage(chatId, messages.support(), { parse_mode: 'MarkdownV2' });
      }

      const state = await stateManager.get(chatId);

      if (state.step === 'enter_link') {
        return buyHandler.handleLinkInput(bot, chatId, text);
      }

      if (state.step === 'enter_quantity') {
        return buyHandler.handleQuantityInput(bot, chatId, text, user);
      }

      if (state.step === 'enter_coupon') {
        await stateManager.clear(chatId);
        return balanceHandler.handleCoupon(bot, chatId, user, text);
      }

      bot.sendMessage(chatId, '👈 Chọn chức năng từ menu bên dưới.', keyboards.mainMenu());
    });
  });

  // =============================================
  // CALLBACK QUERY HANDLER
  // =============================================
  bot.on('callback_query', async (query) => {
    const msg = query.message;
    const chatId = msg.chat.id;
    const data = query.data;

    msg.from = query.from;
    await authMiddleware(bot, msg, async () => {
      const user = msg._user;

      bot.answerCallbackQuery(query.id).catch(() => {});

      if (data.startsWith('platform:')) {
        const platform = data.replace('platform:', '');
        return buyHandler.showCategories(bot, chatId, platform);
      }

      if (data.startsWith('category:')) {
        const index = parseInt(data.replace('category:', ''));
        const state = await stateManager.get(chatId);

        if (!state.categories_cache || !state.categories_cache[index]) {
          return bot.sendMessage(chatId, '❌ Danh mục không tồn tại hoặc đã hết hạn.');
        }

        const category = state.categories_cache[index];
        return buyHandler.showServices(bot, chatId, category);
      }

      if (data.startsWith('svcpage:')) {
        const page = parseInt(data.replace('svcpage:', ''));
        return buyHandler.showServicesPage(bot, chatId, page);
      }

      if (data.startsWith('service:')) {
        const serviceId = parseInt(data.replace('service:', ''));
        return buyHandler.showServiceDetail(bot, chatId, serviceId);
      }

      if (data.startsWith('buy:')) {
        if (data === 'buy:again') {
          await stateManager.clear(chatId);
          return buyHandler.showPlatforms(bot, chatId);
        }
        return buyHandler.startEnterLink(bot, chatId);
      }

      if (data === 'order:confirm') {
        return buyHandler.confirmOrder(bot, chatId, user);
      }

      if (data === 'order:cancel' || data === 'flow:cancel') {
        await stateManager.clear(chatId);
        return bot.sendMessage(chatId, '❌ Đã hủy. Quay về menu chính.', keyboards.mainMenu());
      }

      if (data === 'back:platform') {
        return buyHandler.showPlatforms(bot, chatId);
      }

      if (data === 'back:category') {
        const state = await stateManager.get(chatId);
        if (state.platform) return buyHandler.showCategories(bot, chatId, state.platform);
        return buyHandler.showPlatforms(bot, chatId);
      }

      if (data.startsWith('orders_page:')) {
        const page = parseInt(data.replace('orders_page:', ''));
        return orderHandler.showMyOrders(bot, chatId, user, page);
      }

      if (data.startsWith('order_detail:') || data.startsWith('order_status:')) {
        const orderId = parseInt(data.split(':')[1]);
        return orderHandler.showOrderDetail(bot, chatId, orderId, user);
      }

      if (data === 'menu:referral') return referralHandler.showReferral(bot, chatId, user);
      if (data === 'ref:copylink') {
        const referralService = require('../services/referral.service');
        const code = await referralService.getOrCreateCode(user.id);
        const link = `https://t.me/${process.env.BOT_USERNAME || 'bot'}?start=ref_${code}`;
        return bot.sendMessage(chatId,
          `🔗 Link giới thiệu của bạn:\n\n\`${link}\`\n\n_Copy và chia sẻ với bạn bè\!_`,
          { parse_mode: 'Markdown' }
        );
      }
      if (data === 'menu:balance') return balanceHandler.showBalance(bot, chatId, user);
      if (data === 'menu:deposit') return balanceHandler.showDepositInfo(bot, chatId, user);
      if (data === 'menu:support') {
        return bot.sendMessage(chatId, messages.support(), { parse_mode: 'MarkdownV2' });
      }

      if (data.startsWith('tx:')) {
        const page = parseInt(data.replace('tx:', ''));
        return balanceHandler.showTransactions(bot, chatId, user, page);
      }
    });
  });

  // =============================================
  // ERROR HANDLER
  // =============================================
  bot.on('polling_error', (err) => {
    logger.error('Polling error:', err.message);
  });

  bot.on('error', (err) => {
    logger.error('Bot error:', err.message);
  });

  logger.info('✅ Telegram Bot started!');
  return bot;
};

module.exports = { createBot };