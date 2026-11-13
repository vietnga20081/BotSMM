const { formatVND, calcPrice, calcRateDisplay, truncateLink } = require('../utils/helpers');

const STATUS_EMOJI = {
  Pending: '⏳',
  Processing: '⚙️',
  'In progress': '🔄',
  Completed: '✅',
  Partial: '⚠️',
  Canceled: '❌',
  Failed: '💔',
};

/**
 * Escape Markdown v2 - ĐẦY ĐỦ các ký tự đặc biệt
 * Thứ tự quan trọng: escape backslash TRƯỚC, sau đó mới escape các ký tự khác
 */
function escMd(text) {
  if (text === null || text === undefined) return '';
  let escaped = String(text);
  // 1. Escape backslash trước tiên
  escaped = escaped.replace(/\\/g, '\\\\');
  // 2. Escape các ký tự đặc biệt còn lại của MarkdownV2
  escaped = escaped.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  return escaped;
}

/**
 * Format số tiền VND và escape MarkdownV2
 */
const formatVNDEsc = (amount) => escMd(formatVND(amount));

const messages = {
  welcome: (name) =>
    `👋 *Xin chào ${escMd(name)}\\!*\n\n` +
    `Chào mừng bạn đến với *SMM Panel Bot* 🚀\n` +
    `Dịch vụ tăng tương tác mạng xã hội nhanh chóng \\& uy tín\\.\n\n` +
    `Chọn chức năng bên dưới để bắt đầu 👇`,

  mainMenuText: () =>
    `🏠 *MENU CHÍNH*\n\nBạn muốn làm gì?`,

  selectPlatform: () =>
    `🛒 *MUA DỊCH VỤ*\n\n` +
    `Chọn nền tảng bạn muốn tăng tương tác 👇`,

  selectCategory: (platform) =>
    `📂 *${escMd(platform)}*\n\n` +
    `Chọn danh mục dịch vụ 👇`,

  selectService: (platform, category, page, total) =>
    `🔍 *${escMd(platform)} › ${escMd(category)}*\n` +
    `Trang ${escMd(page + 1)} \\| Tổng ${escMd(total)} dịch vụ\n\n` +
    `Chọn dịch vụ bạn muốn 👇`,

  serviceDetail: (svc, profitPercent) => {
    const profit = svc.profit_percent || profitPercent || 30;

    let sellingPricePer1000 = 0;
    if (svc.custom_rate) {
      sellingPricePer1000 = Math.ceil(Number(svc.custom_rate));
    } else {
      sellingPricePer1000 = calcRateDisplay(svc.rate_provider, profit);
    }

    // Làm sạch description: bỏ HTML, decode HTML entities
    const cleanDesc = (raw) => {
      if (!raw) return '';
      return raw
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&[a-z]+;/g, '')       // bỏ entity không biết
        .replace(/\n{3,}/g, '\n\n')     // chuẩn hóa xuống dòng
        .trim()
        .substring(0, 200);
    };

    let msg = `📋 *CHI TIẾT DỊCH VỤ*\n\n`;
    msg += `🏷️ *Tên:* ${escMd(svc.name)}\n`;
    msg += `💰 *Giá bán:* *${formatVNDEsc(sellingPricePer1000)}* / 1\\.000\n`;
    msg += `📦 *Min:* ${escMd(svc.min.toLocaleString())}\n`;
    msg += `📦 *Max:* ${escMd(svc.max.toLocaleString())}\n`;
    msg += `♻️ *Bảo hành:* ${svc.refill ? '✅ Có' : '❌ Không'}\n`;
    msg += `❌ *Hủy đơn:* ${svc.cancel ? '✅ Có' : '❌ Không'}\n`;
    msg += `⚡ *Loại:* ${escMd(svc.type || 'Default')}\n`;

    const desc = cleanDesc(svc.description);
    if (desc) {
      msg += `\n📝 _${escMd(desc)}_`;
    }

    return msg;
  },

  enterLink: (platform) =>
    `🔗 *NHẬP LINK*\n\n` +
    `Vui lòng nhập link *${escMd(platform)}* cần chạy dịch vụ\\:`,

  enterQuantity: (min, max) =>
    `🔢 *NHẬP SỐ LƯỢNG*\n\n` +
    `Nhập số lượng bạn muốn\\:\n` +
    `📦 Tối thiểu: *${escMd(min.toLocaleString())}*\n` +
    `📦 Tối đa: *${escMd(max.toLocaleString())}*`,

  orderSummary: (svc, link, quantity, charge) =>
    `🧾 *XÁC NHẬN ĐƠN HÀNG*\n\n` +
    `🏷️ *Dịch vụ:* ${escMd(svc.name.substring(0, 80))}\n` +
    `🔗 *Link:* \`${escMd(truncateLink(link, 60))}\`\n` +
    `📦 *Số lượng:* ${escMd(quantity.toLocaleString())}\n` +
    `💰 *Tổng tiền:* *${formatVNDEsc(charge)}*\n\n` +
    `Xác nhận đặt hàng?`,

  orderSuccess: (orderId) =>
    `✅ *ĐẶT HÀNG THÀNH CÔNG\\!*\n\n` +
    `📝 Mã đơn: *\\#${escMd(orderId)}*\n` +
    `⏳ Đơn hàng đang được xử lý\\.\\.\\.\n\n` +
    `Bạn có thể kiểm tra trạng thái bên dưới 👇`,

  orderStatus: (order) => {
    let msg = `📊 *TRẠNG THÁI ĐƠN \\#${escMd(order.id)}*\n\n`;
    msg += `${STATUS_EMOJI[order.status] || '❓'} *Trạng thái:* ${escMd(order.status)}\n`;
    msg += `🔗 *Link:* \`${escMd(truncateLink(order.link, 50))}\`\n`;
    msg += `📦 *Số lượng:* ${escMd(order.quantity.toLocaleString())}\n`;
    if (order.start_count != null) {
      msg += `📊 *Bắt đầu:* ${escMd(order.start_count.toLocaleString())}\n`;
    }
    if (order.remains != null) {
      msg += `📉 *Còn lại:* ${escMd(order.remains.toLocaleString())}\n`;
    }
    msg += `💰 *Phí:* ${formatVNDEsc(order.charge)}\n`;
    msg += `🕐 *Ngày tạo:* ${escMd(new Date(order.created_at).toLocaleString('vi-VN'))}`;
    return msg;
  },

  balance: (user) =>
    `💰 *SỐ DƯ TÀI KHOẢN*\n\n` +
    `👤 *Tài khoản:* ${escMd(user.first_name || user.username || 'Bạn')}\n` +
    `💵 *Số dư:* *${formatVNDEsc(user.balance)}*\n` +
    `📊 *Tổng đơn:* ${escMd(user.total_orders.toLocaleString())}\n` +
    `💸 *Tổng chi:* ${formatVNDEsc(user.total_spent)}`,

  depositInfo: (userId) => {
    const bank = process.env.SEPAY_BANK_NAME || 'MB';
    const account = process.env.SEPAY_BANK_ACCOUNT || '0000000';
    const content = `NAPTIEN ${userId}`;
    return (
      `💳 *NẠP TIỀN*\n\n` +
      `Chuyển khoản ngân hàng với thông tin sau\\:\n\n` +
      `🏦 *Ngân hàng:* ${escMd(bank)}\n` +
      `💳 *Số TK:* \`${escMd(account)}\`\n` +
      `📝 *Nội dung:* \`${escMd(content)}\`\n\n` +
      `⚡ Tiền sẽ cộng *tự động* trong vòng 1\\-2 phút sau khi chuyển khoản\\.\n\n` +
      `_\\* Nội dung chuyển khoản phải chính xác để hệ thống nhận diện\\._`
    );
  },

  insufficientBalance: (need, have) =>
    `❌ *SỐ DƯ KHÔNG ĐỦ*\n\n` +
    `💰 Cần: *${formatVNDEsc(need)}*\n` +
    `💵 Số dư: *${formatVNDEsc(have)}*\n\n` +
    `Vui lòng nạp thêm tiền để tiếp tục 👇`,

  error: (msg) =>
    `❌ *Lỗi:* ${escMd(msg)}`,

  support: () =>
    `📞 *HỖ TRỢ*\n\n` +
    `Nếu bạn cần hỗ trợ, vui lòng liên hệ\\:\n` +
    `👉 @admin\\_username\n\n` +
    `Hoặc gửi tin nhắn trực tiếp trong chat này\\.`,
};

module.exports = { messages, escMd };
