// src/bot/handlers/referral.handler.js
const referralService = require('../../services/referral.service');
const { escMd } = require('../messages');
const { formatVND } = require('../../utils/helpers');

const BOT_USERNAME = process.env.BOT_USERNAME || 'bot';
const COMMISSION = parseFloat(process.env.REFERRAL_COMMISSION_PERCENT || 5);

const showReferral = async (bot, chatId, user) => {
  const stats = await referralService.getStats(user.id);
  const botLink = `https://t.me/${BOT_USERNAME}?start=ref_${stats.code}`;

  const topUsers = stats.referredUsers.slice(0, 5)
    .map((r, i) => {
      const name = r.referred?.username
        ? `@${r.referred.username}`
        : r.referred?.first_name || 'User';
      return `${i + 1}\\. ${escMd(name)} \\— ${r.referred?.total_orders || 0} đơn`;
    }).join('\n');

  const msg =
    `💎 *CHƯƠNG TRÌNH GIỚI THIỆU*\n\n` +
    `🔗 *Link của bạn:*\n\`${escMd(botLink)}\`\n\n` +
    `📊 *Thống kê:*\n` +
    `👥 Đã giới thiệu: *${stats.totalReferred} người*\n` +
    `💰 Hoa hồng nhận được: *${escMd(formatVND(stats.totalCommission))}*\n` +
    `🎯 Tỷ lệ hoa hồng: *${COMMISSION}%* mỗi lần nạp tiền\n\n` +
    (topUsers ? `🏆 *Người đã giới thiệu:*\n${topUsers}\n\n` : '') +
    `💡 _Bạn nhận *${COMMISSION}%* số tiền mỗi khi người được giới thiệu nạp tiền\\._`;

  await bot.sendMessage(chatId, msg, {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📋 Copy link giới thiệu', callback_data: 'ref:copylink' }],
        [{ text: '⬅️ Quay lại menu', callback_data: 'menu:main' }],
      ],
    },
    disable_web_page_preview: true,
  });
};

const sendCommissionNotify = async (bot, referrerTelegramId, commission, fromUsername) => {
  try {
    const from = fromUsername ? `@${fromUsername}` : 'người bạn giới thiệu';
    await bot.sendMessage(referrerTelegramId,
      `💎 *HOA HỒNG NHẬN ĐƯỢC\\!*\n\n` +
      `🎉 *\\+${escMd(formatVND(commission))}* vừa được cộng vào số dư\n` +
      `👤 Từ: *${escMd(from)}* vừa nạp tiền\n\n` +
      `_Tiếp tục giới thiệu để nhận thêm hoa hồng\\!_`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [[
            { text: '💰 Xem số dư', callback_data: 'menu:balance' },
            { text: '🔗 Link giới thiệu', callback_data: 'menu:referral' },
          ]],
        },
      }
    );
  } catch (e) { /* silent */ }
};

module.exports = { showReferral, sendCommissionNotify };
