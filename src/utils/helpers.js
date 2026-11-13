/**
 * Format số tiền VND
 * @param {number} amount - Số tiền cần format
 * @returns {string} - Chuỗi đã format (vd: 100,000đ)
 */
const formatVND = (amount) => {
  if (isNaN(amount)) return '0đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + 'đ';
};

/**
 * Tính giá bán từ rate provider
 * Công thức: (rate / 1000) * quantity * (1 + profitPercent/100)
 * @param {number|string} rate - Giá từ provider (VND cho 1000 đơn vị)
 * @param {number} quantity - Số lượng cần mua
 * @param {number} profitPercent - Phần trăm lợi nhuận (mặc định 0)
 * @returns {number} - Giá bán sau khi làm tròn lên
 */
const calcPrice = (rate, quantity, profitPercent = 0) => {
  // Chuyển đổi sang số
  const rateValue = parseFloat(rate);
  const qty = parseInt(quantity);
  const profit = parseFloat(profitPercent);
  
  // Validate input
  if (isNaN(rateValue) || rateValue <= 0) return 0;
  if (isNaN(qty) || qty <= 0) return 0;
  
  // rate là giá của 1000 đơn vị (đã là VND)
  const pricePerUnit = rateValue / 1000;
  
  // Thêm lợi nhuận
  const sellingPricePerUnit = pricePerUnit * (1 + profit / 100);
  
  // Tính tổng tiền
  const total = sellingPricePerUnit * qty;
  
  // Làm tròn lên đến số nguyên
  return Math.ceil(total);
};

/**
 * Tính giá hiển thị cho 1000 đơn vị (VND)
 * Dùng để hiển thị giá gốc và giá bán trong menu
 * @param {number|string} rate - Giá từ provider (VND cho 1000 đơn vị)
 * @param {number} profitPercent - Phần trăm lợi nhuận (mặc định 0)
 * @returns {number} - Giá bán cho 1000 đơn vị
 */
const calcRateDisplay = (rate, profitPercent = 0) => {
  return calcPrice(rate, 1000, profitPercent);
};

/**
 * Tính giá cho 1 đơn vị (hiển thị)
 * @param {number|string} rate - Giá từ provider (VND cho 1000 đơn vị)
 * @param {number} profitPercent - Phần trăm lợi nhuận
 * @returns {number} - Giá bán cho 1 đơn vị
 */
const calcPricePerUnit = (rate, profitPercent = 0) => {
  return calcPrice(rate, 1, profitPercent);
};

/**
 * Validate URL
 * @param {string} url - URL cần kiểm tra
 * @returns {boolean} - true nếu URL hợp lệ
 */
const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const urlObj = new URL(url);
    // Chỉ chấp nhận http hoặc https
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Escape ký tự đặc biệt MarkdownV2 cho Telegram
 * @param {string} text - Văn bản cần escape
 * @returns {string} - Văn bản đã escape
 */
const escapeMarkdown = (text) => {
  if (!text || typeof text !== 'string') return '';
  
  // Các ký tự cần escape trong MarkdownV2
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  
  let escaped = String(text);
  for (const char of specialChars) {
    escaped = escaped.replace(new RegExp('\\' + char, 'g'), '\\' + char);
  }
  
  return escaped;
};

/**
 * Rút gọn link để hiển thị
 * @param {string} link - Link cần rút gọn
 * @param {number} maxLen - Độ dài tối đa (mặc định 40)
 * @returns {string} - Link đã rút gọn
 */
const truncateLink = (link, maxLen = 40) => {
  if (!link || typeof link !== 'string') return '';
  if (link.length <= maxLen) return link;
  return link.substring(0, maxLen) + '...';
};

/**
 * Tạo mã giao dịch ngẫu nhiên
 * Format: SMM{userId}{timestamp}{random}
 * @param {number} userId - ID người dùng
 * @returns {string} - Mã giao dịch
 */
const generateTxCode = (userId) => {
  const ts = Date.now().toString().slice(-6);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SMM${userId}${ts}${rand}`;
};

/**
 * Validate số lượng đặt hàng
 * @param {number} quantity - Số lượng cần kiểm tra
 * @param {number} min - Số lượng tối thiểu
 * @param {number} max - Số lượng tối đa
 * @returns {object} - { valid: boolean, message: string }
 */
const validateQuantity = (quantity, min, max) => {
  const qty = parseInt(quantity);
  
  if (isNaN(qty)) {
    return { valid: false, message: '❌ Vui lòng nhập số hợp lệ' };
  }
  
  if (qty < min) {
    return { valid: false, message: `❌ Số lượng tối thiểu là ${min.toLocaleString()}` };
  }
  
  if (qty > max) {
    return { valid: false, message: `❌ Số lượng tối đa là ${max.toLocaleString()}` };
  }
  
  return { valid: true, message: '' };
};

/**
 * Format ngày tháng
 * @param {Date|string} date - Ngày cần format
 * @param {string} format - Định dạng (mặc định: 'DD/MM/YYYY HH:mm')
 * @returns {string} - Chuỗi ngày đã format
 */
const formatDate = (date, format = 'DD/MM/YYYY HH:mm') => {
  if (!date) return 'N/A';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';
  
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  
  return format
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', year)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
};

/**
 * Tính phần trăm
 * @param {number} value - Giá trị cần tính
 * @param {number} total - Tổng số
 * @returns {number} - Phần trăm (làm tròn 2 số thập phân)
 */
const calculatePercentage = (value, total) => {
  if (!total || total === 0) return 0;
  return Math.round((value / total) * 100 * 100) / 100;
};

/**
 * Làm tròn số có thể tùy chỉnh số thập phân
 * @param {number} num - Số cần làm tròn
 * @param {number} decimals - Số chữ số thập phân (mặc định 0)
 * @returns {number}
 */
const roundNumber = (num, decimals = 0) => {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
};

/**
 * Random số trong khoảng
 * @param {number} min - Giá trị nhỏ nhất
 * @param {number} max - Giá trị lớn nhất
 * @returns {number}
 */
const randomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Sleep/delay function
 * @param {number} ms - Thời gian delay (ms)
 * @returns {Promise}
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Kiểm tra email hợp lệ
 * @param {string} email - Email cần kiểm tra
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

/**
 * Kiểm tra số điện thoại Việt Nam
 * @param {string} phone - Số điện thoại cần kiểm tra
 * @returns {boolean}
 */
const isValidPhoneNumber = (phone) => {
  const regex = /^(0|84)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-9]|9[0-9])[0-9]{7}$/;
  return regex.test(phone);
};

module.exports = {
  formatVND,
  calcPrice,
  calcRateDisplay,
  calcPricePerUnit,
  isValidUrl,
  escapeMarkdown,
  truncateLink,
  generateTxCode,
  validateQuantity,
  formatDate,
  calculatePercentage,
  roundNumber,
  randomInt,
  sleep,
  isValidEmail,
  isValidPhoneNumber,
};