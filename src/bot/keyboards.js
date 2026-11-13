const sanitizeText = (text, max = 60) => {
  if (text === null || text === undefined) return 'N/A';
  let result = String(text);
  // Strip BOM
  if (result.charCodeAt(0) === 0xFEFF) result = result.slice(1);
  // Strip control characters
  result = result.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  // Strip variation selectors (FE00-FE0F) that Telegram rejects
  result = result.replace(/[\uFE00-\uFE0F]/g, '');
  // Strip surrogate pairs and chars outside BMP (4-byte Unicode like 𝕏)
  result = result.replace(/[\uD800-\uDFFF]/g, '');
  // Strip other non-BMP via surrogate pairs encoded as 2 chars
  result = result.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  // Keep only safe range
  result = result.replace(/[^\u0020-\uD7FF\uE000-\uFFFD]/g, '');
  // Trim and limit
  result = result.trim();
  if (result.length > max) result = result.slice(0, max - 3) + '...';
  return result || 'N/A';
};

const mainMenu = () => ({
  reply_markup: {
    keyboard: [
      [{ text: '🛒 Mua dịch vụ' }, { text: '📦 Đơn hàng của tôi' }],
      [{ text: '💰 Số dư' }, { text: '💳 Nạp tiền' }],
      [{ text: '💎 Giới thiệu' }, { text: '🎫 Coupon' }],
      [{ text: '📞 Hỗ trợ' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  },
});

const platformKeyboard = (platforms = []) => {
  const ICONS = {
    Facebook: '📘',
    Instagram: '📸',
    TikTok: '🎵',
    YouTube: '📺',
    Telegram: '✉️',
    'Twitter/X': '🐦',
    Spotify: '🎧',
    Khác: '🌐',
  };

  const buttons = platforms
    .filter(Boolean)
    .map((p) => {
      const cleanPlatform = sanitizeText(p, 40);
      return [{
        text: `${ICONS[p] || '🌐'} ${cleanPlatform}`,
        callback_data: `platform:${sanitizeText(p, 30)}`,
      }];
    });

  return {
    reply_markup: { inline_keyboard: buttons },
  };
};

const categoryKeyboard = (platform, categories = []) => {
  const buttons = categories
    .filter(Boolean)
    .map((c, index) => {
      const cleanCategory = sanitizeText(c, 45);
      return [{
        text: `📂 ${cleanCategory}`,
        callback_data: `category:${index}`,
      }];
    });

  buttons.push([{ text: '⬅️ Quay lại', callback_data: 'back:platform' }]);

  return {
    reply_markup: { inline_keyboard: buttons },
  };
};

const serviceListKeyboard = (services = [], page = 0, pageSize = 6) => {
  const total = services.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = page * pageSize;
  const slice = services.slice(start, start + pageSize);

  // 1 cột - mỗi service 1 dòng, tên đủ dài để đọc
  const buttons = slice
    .filter(s => s && s.id)
    .map((s) => {
      // Tính giá bán thực
      const rate = parseFloat(s.custom_rate || 0) ||
        Math.ceil(parseFloat(s.rate_provider || 0) * (1 + (parseFloat(s.profit_percent) || 30) / 100));
      const priceStr = rate > 0 ? ` — ${rate.toLocaleString('vi-VN')}đ/1k` : '';
      const cleanName = sanitizeText(s.name, 38);
      return [{
        text: `${cleanName}${priceStr}`,
        callback_data: `service:${s.id}`,
      }];
    });

  // Pagination row
  if (totalPages > 1) {
    const nav = [];
    if (page > 0)
      nav.push({ text: '◀ Trang trước', callback_data: `svcpage:${page - 1}` });
    nav.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
    if (page < totalPages - 1)
      nav.push({ text: 'Trang sau ▶', callback_data: `svcpage:${page + 1}` });
    buttons.push(nav);
  }

  buttons.push([{ text: '⬅ Quay lại danh mục', callback_data: 'back:category' }]);

  return { reply_markup: { inline_keyboard: buttons } };
};

const confirmOrderKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: '✅ Xác nhận đặt hàng', callback_data: 'order:confirm' }],
      [{ text: '❌ Hủy', callback_data: 'order:cancel' }],
    ],
  },
});

const postOrderKeyboard = (orderId) => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: '📊 Xem trạng thái đơn', callback_data: `order_status:${orderId}` }],
      [{ text: '🛒 Mua thêm', callback_data: 'buy:again' }],
    ],
  },
});

const orderListKeyboard = (orders = [], page = 1, totalPages = 1) => {
  const buttons = orders
    .filter(o => o && o.id)
    .map((o) => {
      const cleanStatus = sanitizeText(o.status, 10);
      const cleanServiceName = sanitizeText(o.service?.name, 25);
      return [{
        text: `#${o.id} | ${cleanStatus} | ${cleanServiceName}`,
        callback_data: `order_detail:${o.id}`,
      }];
    });

  const nav = [];

  if (page > 1) {
    nav.push({
      text: '◀️',
      callback_data: `orders_page:${page - 1}`,
    });
  }

  if (page < totalPages) {
    nav.push({
      text: '📺',
      callback_data: `orders_page:${page + 1}`,
    });
  }

  if (nav.length) buttons.push(nav);

  return {
    reply_markup: { inline_keyboard: buttons },
  };
};

const cancelKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: '❌ Hủy', callback_data: 'flow:cancel' }],
    ],
  },
});

module.exports = {
  mainMenu,
  platformKeyboard,
  categoryKeyboard,
  serviceListKeyboard,
  confirmOrderKeyboard,
  postOrderKeyboard,
  orderListKeyboard,
  cancelKeyboard,
};