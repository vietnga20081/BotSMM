const { Transaction } = require('../../models');
const userService = require('../../services/user.service');
const couponService = require('../../services/coupon.service');
const { messages, escMd } = require('../messages');
const { formatVND } = require('../../utils/helpers');
const stateManager = require('../stateManager');
const logger = require('../../utils/logger');

// ── Helper: build QR url ──────────────────────────────────────────
const buildQR = (telegramId, couponCode = null) => {
  const bank = process.env.SEPAY_BANK_NAME || 'MB';
  const account = process.env.SEPAY_BANK_ACCOUNT;
  const content = couponCode
    ? `NAPTIEN ${telegramId} ${couponCode.toUpperCase()}`
    : `NAPTIEN ${telegramId}`;
  const url = `https://qr.sepay.vn/img?acc=${account}&bank=${bank}&amount=0&des=${encodeURIComponent(content)}&template=compact`;
  return { url, content };
};

// ── Helper: build deposit photo caption ──────────────────────────
const buildDepositCaption = (telegramId, couponCode = null, couponResult = null) => {
  const { content } = buildQR(telegramId, couponCode);

  let bonusLine = '';
  if (couponCode && couponResult && !couponResult.error) {
    const { coupon } = couponResult;
    const bonusDesc = coupon.type === 'percent'
      ? `+${coupon.value}% số tiền nạp`
      : `+${parseFloat(coupon.value).toLocaleString('vi-VN')}đ cố định`;
    bonusLine = `\n🎁 *Coupon ${coupon.code}:* ${bonusDesc}`;
    if (coupon.min_deposit > 0)
      bonusLine += `\n💡 Nạp tối thiểu: ${parseFloat(coupon.min_deposit).toLocaleString('vi-VN')}đ`;
  }

  const couponHint = (!couponCode)
    ? `\n\n🎫 Có coupon? Bấm nút bên dưới để áp dụng tự động\\!`
    : '';

  return `📱 *Quét QR để nạp tiền*${bonusLine}\n\n💬 Nội dung CK:\n\`${content}\`${couponHint}`;
};

// ── Helper: build inline keyboard cho deposit ─────────────────────
const depositKeyboard = (couponCode = null) => ({
  inline_keyboard: [
    couponCode
      ? [
          { text: '🔄 Đổi coupon khác', callback_data: 'deposit:change_coupon' },
          { text: '❌ Bỏ coupon', callback_data: 'deposit:remove_coupon' },
        ]
      : [
          { text: '🎫 Nhập coupon', callback_data: 'deposit:enter_coupon' },
        ],
    [{ text: '📋 Lịch sử GD', callback_data: 'tx:1' }],
    [{ text: '⬅️ Quay lại', callback_data: 'menu:balance' }],
  ],
});

// ── showBalance ───────────────────────────────────────────────────
const showBalance = async (bot, chatId, user) => {
  await user.reload();
  await bot.sendMessage(chatId, messages.balance(user), {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [
        [{ text: '💳 Nạp tiền', callback_data: 'menu:deposit' }],
        [{ text: '📋 Lịch sử GD', callback_data: 'tx:1' }],
      ],
    },
  });
};

// ── showDepositInfo ───────────────────────────────────────────────
const showDepositInfo = async (bot, chatId, user, couponCode = null) => {
  // Validate coupon nếu có
  let couponResult = null;
  if (couponCode) {
    couponResult = await couponService.validateForDeposit(couponCode, 0);
    if (couponResult?.error) {
      // Coupon lỗi — báo user và gửi QR không coupon
      await bot.sendMessage(chatId, `❌ ${couponResult.error}\n\nĐã gửi lại QR không có coupon.`);
      couponCode = null;
      couponResult = null;
    }
  }

  const { url } = buildQR(user.telegram_id, couponCode);
  const caption = buildDepositCaption(user.telegram_id, couponCode, couponResult);

  // Gửi thông tin ngân hàng text trước
  await bot.sendMessage(chatId, messages.depositInfo(user.telegram_id), {
    parse_mode: 'MarkdownV2',
  });

  // Gửi QR kèm nút inline
  try {
    await bot.sendPhoto(chatId, url, {
      caption,
      parse_mode: 'Markdown',
      reply_markup: depositKeyboard(couponCode),
    });
  } catch (e) {
    logger.warn('QR photo send failed:', e.message);
    // Fallback text nếu ảnh lỗi
    await bot.sendMessage(chatId, caption, {
      parse_mode: 'Markdown',
      reply_markup: depositKeyboard(couponCode),
    });
  }
};

// ── editDepositQR — edit ảnh QR hiện tại (khi coupon thay đổi) ────
const editDepositQR = async (bot, chatId, messageId, user, couponCode = null) => {
  let couponResult = null;
  if (couponCode) {
    couponResult = await couponService.validateForDeposit(couponCode, 0);
    if (couponResult?.error) {
      await bot.answerCallbackQuery?.('');
      return { error: couponResult.error };
    }
  }

  const { url } = buildQR(user.telegram_id, couponCode);
  const caption = buildDepositCaption(user.telegram_id, couponCode, couponResult);

  try {
    // Edit media (ảnh QR mới)
    await bot.editMessageMedia(
      { type: 'photo', media: url, caption, parse_mode: 'Markdown' },
      { chat_id: chatId, message_id: messageId, reply_markup: depositKeyboard(couponCode) }
    );
  } catch (e) {
    // Nếu không edit được ảnh thì chỉ edit caption+keyboard
    try {
      await bot.editMessageCaption(caption, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: depositKeyboard(couponCode),
      });
    } catch (e2) {
      logger.warn('editDepositQR failed:', e2.message);
    }
  }

  return { ok: true, couponResult };
};

// ── showTransactions ──────────────────────────────────────────────
const showTransactions = async (bot, chatId, user, page = 1) => {
  const { transactions, total } = await userService.getTransactions(user.id, page, 8);

  if (!transactions.length)
    return bot.sendMessage(chatId, '📋 Chưa có giao dịch nào.');

  const TYPE_LABEL = {
    deposit: '💰 Nạp tiền',
    order: '🛒 Mua dịch vụ',
    refund: '♻️ Hoàn tiền',
    bonus: '🎁 Bonus coupon',
    admin_adjust: '⚙️ Admin điều chỉnh',
  };

  let text = `📋 *LỊCH SỬ GIAO DỊCH* \\(Trang ${page}\\)\n\n`;
  for (const tx of transactions) {
    const sign = tx.amount > 0 ? '\\+' : '';
    const date = new Date(tx.created_at).toLocaleDateString('vi-VN');
    text += `${TYPE_LABEL[tx.type] || tx.type}\n`;
    text += `${sign}${escMd(formatVND(tx.amount))} \\| ${escMd(date)}\n`;
    if (tx.description) text += `_${escMd(tx.description.substring(0, 60))}_\n`;
    text += '\n';
  }

  const nav = [];
  if (page > 1) nav.push({ text: '◀️', callback_data: `tx:${page - 1}` });
  nav.push({ text: '⬅️ Menu', callback_data: 'menu:balance' });
  if (transactions.length === 8) nav.push({ text: '▶️', callback_data: `tx:${page + 1}` });

  await bot.sendMessage(chatId, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: { inline_keyboard: [nav] },
  });
};

// ── handleCoupon (khi user nhập mã trong state enter_coupon) ──────
const handleCoupon = async (bot, chatId, user, code) => {
  const state = await stateManager.get(chatId);

  // Nếu đang trong luồng deposit → edit QR
  if (state.deposit_message_id) {
    const result = await editDepositQR(
      bot, chatId, state.deposit_message_id, user, code
    );

    if (result?.error) {
      await bot.sendMessage(chatId, `❌ ${result.error}`);
      // Giữ nguyên state để user nhập lại
      return;
    }

    // Lưu coupon vào state và clear step
    await stateManager.update(chatId, {
      step: null,
      deposit_coupon: code.toUpperCase(),
    });

    // Thông báo ngắn thành công
    const cr = result.couponResult;
    if (cr?.coupon) {
      const bonusDesc = cr.coupon.type === 'percent'
        ? `+${cr.coupon.value}% số tiền nạp`
        : `+${parseFloat(cr.coupon.value).toLocaleString('vi-VN')}đ`;
      await bot.sendMessage(chatId,
        `✅ Coupon *${escMd(cr.coupon.code)}* đã áp dụng\\!\n` +
        `🎁 Bạn sẽ nhận thêm *${escMd(bonusDesc)}* khi nạp tiền\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    }
    return;
  }

  // Không trong luồng deposit → validate và hướng dẫn
  const result = await couponService.validateForDeposit(code, 0);
  if (result?.error) {
    return bot.sendMessage(chatId, `❌ ${result.error}`);
  }
  if (!result) {
    return bot.sendMessage(chatId, '❌ Mã coupon không hợp lệ.');
  }

  const { coupon } = result;
  const bonusDesc = coupon.type === 'percent'
    ? `\\+${coupon.value}% số tiền nạp`
    : `\\+${parseFloat(coupon.value).toLocaleString('vi-VN')}đ`;

  await bot.sendMessage(chatId,
    `🎁 *COUPON HỢP LỆ\\!*\n\n` +
    `Mã: \`${escMd(coupon.code)}\`\n` +
    `Ưu đãi: *${escMd(bonusDesc)}*\n` +
    `Còn lại: *${coupon.max_uses - coupon.used_count} lượt*\n\n` +
    `👇 Bấm *Nạp tiền* để QR tự động áp dụng coupon này\\.`,
    {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[
          { text: '💳 Nạp tiền với coupon này', callback_data: `deposit:apply:${coupon.code}` },
        ]],
      },
    }
  );
};

module.exports = {
  showBalance, showDepositInfo, editDepositQR,
  showTransactions, handleCoupon,
};
