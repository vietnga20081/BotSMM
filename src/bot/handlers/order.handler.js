const orderService = require('../../services/order.service');
const { messages, escMd } = require('../messages');
const keyboards = require('../keyboards');

/**
 * Hiển thị danh sách đơn hàng của user
 */
const showMyOrders = async (bot, chatId, user, page = 1) => {
  const { orders, total, totalPages } = await orderService.getUserOrders(user.id, page, 8);

  if (!orders.length) {
    return bot.sendMessage(chatId,
      '📦 Bạn chưa có đơn hàng nào\\.\n\nHãy mua dịch vụ đầu tiên\\! 🛒',
      { parse_mode: 'MarkdownV2' }
    );
  }

  const text =
    `📦 *ĐƠN HÀNG CỦA TÔI*\n` +
    `Tổng: *${total}* đơn \\| Trang ${page}/${totalPages}`;

  await bot.sendMessage(chatId, text, {
    parse_mode: 'MarkdownV2',
    ...keyboards.orderListKeyboard(orders, page, totalPages),
  });
};

/**
 * Hiển thị chi tiết đơn hàng
 */
const showOrderDetail = async (bot, chatId, orderId, user) => {
  const order = await orderService.getOrderDetail(orderId, user.id);
  if (!order) {
    return bot.sendMessage(chatId, '❌ Không tìm thấy đơn hàng.');
  }

  await bot.sendMessage(chatId, messages.orderStatus(order), {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Làm mới', callback_data: `order_status:${order.id}` }],
        [{ text: '⬅️ Danh sách đơn', callback_data: 'orders_page:1' }],
      ],
    },
  });
};

module.exports = { showMyOrders, showOrderDetail };
