const stateManager = require('../stateManager');
const keyboards = require('../keyboards');
const { messages, escMd } = require('../messages');
const serviceSyncService = require('../../services/serviceSync.service');
const orderService = require('../../services/order.service');
const { calcPrice, formatVND, isValidUrl, truncateLink } = require('../../utils/helpers');
const logger = require('../../utils/logger');

const DEFAULT_PROFIT = parseFloat(process.env.DEFAULT_PROFIT_PERCENT) || 30;

/**
 * STEP 1: Hiển thị danh sách Platform
 */
const showPlatforms = async (bot, chatId) => {
  try {
    const platforms = await serviceSyncService.getPlatforms();
    if (!platforms.length) {
      return bot.sendMessage(chatId, '⚠️ Chưa có dịch vụ nào. Vui lòng quay lại sau.');
    }
    await stateManager.set(chatId, { step: 'select_platform' });
    await bot.sendMessage(
      chatId,
      messages.selectPlatform(),
      { parse_mode: 'MarkdownV2', ...keyboards.platformKeyboard(platforms) }
    );
  } catch (err) {
    logger.error('showPlatforms error:', err);
    bot.sendMessage(chatId, '❌ Không thể tải dịch vụ. Thử lại sau.');
  }
};

/**
 * STEP 2: Hiển thị Category sau khi chọn Platform
 */
const showCategories = async (bot, chatId, platform) => {
  try {
    const rawCategories = await serviceSyncService.getCategoriesByPlatform(platform);

    // Xử lý UTF-8 mạnh mẽ hơn — loại bỏ ký tự ngoài BMP (emoji 4-byte, surrogate...)
    const categories = rawCategories
      .map(c => {
        if (!c) return null;
        let clean = String(c);
        clean = clean.replace(/[^\u0020-\uFFFF]/g, '');
        clean = clean.trim();
        return clean || null;
      })
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i); // dedup

    if (!categories.length) {
      return bot.sendMessage(chatId, `⚠️ Không có dịch vụ nào cho ${platform}.`);
    }

    await stateManager.update(chatId, {
      step: 'select_category',
      platform,
      categories_cache: categories,
    });

    await bot.sendMessage(
      chatId,
      messages.selectCategory(platform),
      { parse_mode: 'MarkdownV2', ...keyboards.categoryKeyboard(platform, categories) }
    );
  } catch (err) {
    logger.error('showCategories error:', err);
    bot.sendMessage(chatId, '❌ Lỗi tải danh mục.');
  }
};

/**
 * STEP 3: Hiển thị Services theo Category (có phân trang)
 */
const PAGE_SIZE = 6;

const showServices = async (bot, chatId, category, page = 0) => {
  try {
    const state = await stateManager.get(chatId);
    const services = await serviceSyncService.getServicesByCategory(state.platform, category);

    if (!services.length) {
      return bot.sendMessage(chatId, '⚠️ Không có dịch vụ trong danh mục này.');
    }

    const totalPages = Math.ceil(services.length / PAGE_SIZE);
    const safePage = Math.max(0, Math.min(page, totalPages - 1));

    await stateManager.update(chatId, {
      step: 'select_service',
      category,
      services_cache: services.map((s) => s.id),
      svc_page: safePage,
    });

    await bot.sendMessage(
      chatId,
      messages.selectService(state.platform, category, safePage, services.length, totalPages),
      {
        parse_mode: 'MarkdownV2',
        ...keyboards.serviceListKeyboard(services, safePage, PAGE_SIZE),
      }
    );
  } catch (err) {
    logger.error('showServices error:', err);
    bot.sendMessage(chatId, '❌ Lỗi tải danh sách dịch vụ.');
  }
};

/**
 * STEP 3b: Phân trang services
 */
const showServicesPage = async (bot, chatId, page) => {
  const state = await stateManager.get(chatId);
  await showServices(bot, chatId, state.category, page);
};

/**
 * STEP 4: Hiển thị chi tiết service + yêu cầu nhập link
 */
const showServiceDetail = async (bot, chatId, serviceId) => {
  try {
    const { Service } = require('../../models');
    const svc = await Service.findByPk(serviceId);

    if (!svc) {
      return bot.sendMessage(chatId, '❌ Dịch vụ không tồn tại.');
    }

    await stateManager.update(chatId, {
      step: 'enter_link',
      serviceId: svc.id,
      serviceName: svc.name,
      serviceMin: svc.min,
      serviceMax: svc.max,
      serviceRate: svc.rate_provider,
      serviceCustomRate: svc.custom_rate,
      serviceProfitPercent: svc.profit_percent,
      serviceType: svc.type,
      servicePlatform: svc.platform,
    });

    await bot.sendMessage(chatId, messages.serviceDetail(svc, DEFAULT_PROFIT), {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Chọn dịch vụ này', callback_data: `buy:${svc.id}` }],
          [{ text: '⬅️ Quay lại danh mục', callback_data: 'back:category' }],
        ],
      },
    });
  } catch (err) {
    logger.error('showServiceDetail error:', err);
    await bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi tải thông tin dịch vụ.');
  }
};

/**
 * STEP 4b: Bắt đầu nhập link sau khi chọn dịch vụ
 */
const startEnterLink = async (bot, chatId) => {
  const state = await stateManager.get(chatId);
  await stateManager.update(chatId, { step: 'enter_link' });
  await bot.sendMessage(
    chatId,
    messages.enterLink(state.servicePlatform),
    { parse_mode: 'MarkdownV2', ...keyboards.cancelKeyboard() }
  );
};

/**
 * STEP 5: Nhận link, yêu cầu nhập số lượng
 */
const handleLinkInput = async (bot, chatId, text) => {
  const state = await stateManager.get(chatId);

  if (!isValidUrl(text)) {
    return bot.sendMessage(
      chatId,
      '❌ Link không hợp lệ\\. Vui lòng nhập đúng URL \\(vd: https://facebook\\.com/\\.\\.\\.',
      { parse_mode: 'MarkdownV2', ...keyboards.cancelKeyboard() }
    );
  }

  await stateManager.update(chatId, { step: 'enter_quantity', link: text });
  await bot.sendMessage(
    chatId,
    messages.enterQuantity(state.serviceMin, state.serviceMax),
    { parse_mode: 'MarkdownV2', ...keyboards.cancelKeyboard() }
  );
};

/**
 * STEP 6: Nhận số lượng, hiển thị confirm
 */
const handleQuantityInput = async (bot, chatId, text, user) => {
  const state = await stateManager.get(chatId);
  const quantity = parseInt(text.replace(/[,.]/g, ''));

  if (isNaN(quantity)) {
    return bot.sendMessage(chatId, '❌ Vui lòng nhập số nguyên hợp lệ.', { ...keyboards.cancelKeyboard() });
  }

  if (quantity < state.serviceMin) {
    return bot.sendMessage(
      chatId,
      `❌ Số lượng tối thiểu là *${escMd(state.serviceMin.toLocaleString())}*`,
      { parse_mode: 'MarkdownV2', ...keyboards.cancelKeyboard() }
    );
  }

  if (quantity > state.serviceMax) {
    return bot.sendMessage(
      chatId,
      `❌ Số lượng tối đa là *${escMd(state.serviceMax.toLocaleString())}*`,
      { parse_mode: 'MarkdownV2', ...keyboards.cancelKeyboard() }
    );
  }

  const profitPercent = state.serviceProfitPercent || DEFAULT_PROFIT;
  const charge = state.serviceCustomRate
    ? Math.ceil((state.serviceCustomRate / 1000) * quantity)
    : calcPrice(state.serviceRate, quantity, profitPercent);

  await stateManager.update(chatId, { step: 'confirm_order', quantity, charge });

  const svcObj = { name: state.serviceName };
  await bot.sendMessage(
    chatId,
    messages.orderSummary(svcObj, state.link, quantity, charge),
    { parse_mode: 'MarkdownV2', ...keyboards.confirmOrderKeyboard() }
  );
};

/**
 * STEP 7: Xác nhận → tạo đơn
 */
const confirmOrder = async (bot, chatId, user) => {
  const state = await stateManager.get(chatId);

  if (state.step !== 'confirm_order') {
    return bot.sendMessage(chatId, '❌ Phiên đặt hàng đã hết hạn. Vui lòng bắt đầu lại.');
  }

  if (parseFloat(user.balance) < state.charge) {
    await stateManager.clear(chatId);
    return bot.sendMessage(
      chatId,
      messages.insufficientBalance(state.charge, user.balance),
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [[{ text: '💳 Nạp tiền ngay', callback_data: 'menu:deposit' }]],
        },
      }
    );
  }

  // FIX: Không dùng parse_mode cho plain text để tránh lỗi ký tự đặc biệt
  const processingMsg = await bot.sendMessage(chatId, '⏳ Đang xử lý đơn hàng...');

  try {
    const order = await orderService.createOrder({
      userId: user.id,
      serviceId: state.serviceId,
      link: state.link,
      quantity: state.quantity,
      comments: state.comments || null,
    });

    await stateManager.clear(chatId);
    await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});

    await bot.sendMessage(
      chatId,
      messages.orderSuccess(order.id),
      { parse_mode: 'MarkdownV2', ...keyboards.postOrderKeyboard(order.id) }
    );
  } catch (err) {
    await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
    // FIX: escMd bọc err.message để tránh crash MarkdownV2 khi có ký tự đặc biệt
    await bot.sendMessage(
      chatId,
      `❌ *Lỗi:* ${escMd(err.message)}`,
      { parse_mode: 'MarkdownV2' }
    );
  }
};

module.exports = {
  showPlatforms,
  showCategories,
  showServices,
  showServicesPage,
  showServiceDetail,
  startEnterLink,
  handleLinkInput,
  handleQuantityInput,
  confirmOrder,
};
