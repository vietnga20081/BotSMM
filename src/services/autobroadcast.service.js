// src/services/autobroadcast.service.js
const axios = require('axios');
const botRegistry = require('../bot/botRegistry');
const { User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

async function generateContent(timeOfDay) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY chưa được cấu hình trong .env');

  const botName = process.env.BOT_NAME || 'BotSMM';
  const discount = process.env.BROADCAST_DISCOUNT || '5';
  const now = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });

  // Danh sách dịch vụ SMM cụ thể
  const smmServices = [
    { name: 'Tăng Follow TikTok', platform: 'TikTok', emoji: '🎵' },
    { name: 'Tăng Like Facebook', platform: 'Facebook', emoji: '👍' },
    { name: 'Tăng View YouTube', platform: 'YouTube', emoji: '▶️' },
    { name: 'Tăng Follow Instagram', platform: 'Instagram', emoji: '📸' },
    { name: 'Tăng Sub YouTube', platform: 'YouTube', emoji: '🔔' },
    { name: 'Tăng Share Facebook', platform: 'Facebook', emoji: '🔄' },
    { name: 'Tăng Comment TikTok', platform: 'TikTok', emoji: '💬' },
    { name: 'Tăng View Reels', platform: 'Instagram', emoji: '🎬' },
    { name: 'Tăng Like Twitter/X', platform: 'Twitter', emoji: '🐦' },
    { name: 'Tăng Mắt Live TikTok', platform: 'TikTok', emoji: '👁' },
  ];

  // Tips SMM thực tế ngắn gọn
  const smmTips = [
    'đăng bài lúc 6-8h sáng và 20-22h tối để đạt reach cao nhất',
    'video dưới 30 giây có tỷ lệ xem hết cao hơn 60%',
    'dùng 3-5 hashtag chính xác thay vì spam 30 hashtag',
    'thumbnail bắt mắt tăng CTR lên đến 40% trên YouTube',
    'reply comment trong 1h đầu giúp thuật toán đề xuất nhiều hơn',
    'đăng story mỗi ngày giúp Instagram không bị giảm reach',
    'video có phụ đề tăng thời gian xem trung bình 12%',
    'livestream 1 lần/tuần giúp tài khoản được ưu tiên đề xuất',
    'caption dưới 150 ký tự có engagement rate cao hơn',
    'repost nội dung lúc 12h trưa để tiếp cận thêm 20-30% người dùng',
  ];

  const morningTopics = [
    'chào buổi sáng năng động, sẵn sàng bùng nổ tương tác hôm nay',
    'khởi động ngày mới với social media mạnh mẽ hơn',
    'tip sáng để tài khoản tăng trưởng nhanh hôm nay',
    'buổi sáng là giờ vàng đăng bài — đừng bỏ lỡ',
    'năng lượng sáng + mẹo SMM = tài khoản bùng nổ',
  ];

  const eveningTopics = [
    'buổi tối check lại stats và chuẩn bị content ngày mai',
    'giờ vàng tương tác với followers trước khi ngủ',
    'review nội dung hot trong ngày và học hỏi',
    'tối là lúc lên kế hoạch SMM cho ngày mai',
    'kết thúc ngày bằng một lượt boost tài khoản',
  ];

  const topics = timeOfDay === 'morning' ? morningTopics : eveningTopics;
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const topic = rand(topics);
  const svc = rand(smmServices);
  const tip = rand(smmTips);
  const greetEmoji = rand(timeOfDay === 'morning'
    ? ['🌅', '☀️', '🌞', '⚡', '🔥']
    : ['🌙', '✨', '🌟', '💫', '🎯']);

  const systemMsg = `Bạn là bot SMM tên "${botName}", chuyên cung cấp dịch vụ tăng tương tác mạng xã hội: follow, like, view, sub, share, comment. Bạn nhắn tin thân thiện như người bạn, ngắn gọn, không rườm rà.`;

  const userMsg = `Hôm nay ${now}, ${timeOfDay === 'morning' ? '7h sáng' : '19h tối'}.

Viết 1 tin nhắn Telegram NGẮN (dưới 100 từ) tiếng Việt gồm:
1. Chào ${timeOfDay === 'morning' ? 'buổi sáng' : 'buổi tối'} vui theo chủ đề: ${topic}
2. Mẹo SMM thực tế: ${tip}
3. Nhắc dịch vụ hot hôm nay: ${svc.name} ${svc.emoji} trên ${svc.platform}, đang <b>giảm ${discount}%</b>
4. 1 câu kêu gọi đặt dịch vụ qua ${botName}

Bắt đầu bằng ${greetEmoji}. Dùng HTML Telegram (<b>bold</b>, <i>italic</i>), KHÔNG dùng **, ##. Chỉ trả nội dung, không giải thích.`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 280,
      temperature: 0.88,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  return response.data.choices[0]?.message?.content?.trim() || null;
}

async function runAutoBroadcast(timeOfDay = 'morning', target = 'all') {
  logger.info(`🤖 AutoBroadcast started: ${timeOfDay}, target=${target}`);
  try {
    const message = await generateContent(timeOfDay);
    if (!message) throw new Error('AI không trả về nội dung');
    logger.info(`📝 AI generated (${message.length} chars)`);

    const where = { is_banned: false };
    if (target === 'active') where.total_orders = { [Op.gt]: 0 };
    else if (target === 'inactive') where.total_orders = 0;

    const users = await User.findAll({
      where,
      attributes: ['telegram_id'],
      limit: 10000,
    });

    const bot = botRegistry.get();
    if (!bot) throw new Error('Bot chưa sẵn sàng');

    let sent = 0, failed = 0;
    for (const user of users) {
      try {
        await bot.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' });
        sent++;
        if (sent % 20 === 0) await new Promise(r => setTimeout(r, 1100));
      } catch (e) {
        failed++;
      }
    }

    logger.info(`✅ AutoBroadcast done: ${sent} sent, ${failed} failed / ${users.length} total`);
    return { sent, failed, total: users.length, message };
  } catch (err) {
    logger.error('❌ AutoBroadcast error:', err.message);
    throw err;
  }
}

module.exports = { runAutoBroadcast, generateContent };