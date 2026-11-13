// src/services/serviceSync.service.js
const { redis } = require('../configs/redis');
const { Provider, Service } = require('../models');
const providerApi = require('./providerApi.service');
const logger = require('../utils/logger');

const CACHE_KEY = 'smm:services:grouped';
const CACHE_TTL = 30 * 60;

const normalizePlatform = (platformStr) => {
  const s = (platformStr || '').toLowerCase();
  if (s.includes('facebook') || s.includes('fb')) return 'Facebook';
  if (s.includes('instagram') || s.includes('ig')) return 'Instagram';
  if (s.includes('tiktok')) return 'TikTok';
  if (s.includes('youtube') || s.includes('yt')) return 'YouTube';
  if (s.includes('telegram')) return 'Telegram';
  if (s.includes('twitter') || s.includes('x.com')) return 'Twitter/X';
  if (s.includes('spotify')) return 'Spotify';
  if (s.includes('google')) return 'Google';
  if (s.includes('shopee')) return 'Shopee';
  if (s.includes('lazada')) return 'Lazada';
  if (s.includes('threads')) return 'Threads';
  if (s.includes('twitch')) return 'Twitch';
  if (s.includes('kwai')) return 'Kwai';
  if (s.includes('website')) return 'Website';
  return platformStr || 'Khác';
};

/**
 * Chuyển đổi giá về VND theo currency và exchange_rate của provider
 */
const convertToVND = (rate, provider) => {
  const rateValue = parseFloat(rate);
  if (isNaN(rateValue)) return 0;
  
  // Nếu provider đã dùng VND, không cần chuyển đổi
  if (provider.currency === 'VND') {
    return rateValue;
  }
  
  // Chuyển đổi từ currency của provider sang VND
  const exchangeRate = parseFloat(provider.exchange_rate) || 1;
  const converted = rateValue * exchangeRate;
  
  logger.debug(`Converted rate: ${rateValue} ${provider.currency} → ${converted} VND (rate: ${exchangeRate})`);
  return converted;
};

class ServiceSyncService {
  async syncFromProvider(providerId) {
    const provider = await Provider.findByPk(providerId);
    if (!provider) throw new Error('Provider không tồn tại');

    logger.info(`🔄 Syncing services from ${provider.name} (${provider.currency}, rate: ${provider.exchange_rate})...`);

    const rawServices = await providerApi.getServices(provider);
    if (!Array.isArray(rawServices)) {
      throw new Error('Response không hợp lệ từ provider');
    }

    // Ưu tiên: profit_percent của provider → DEFAULT_PROFIT_PERCENT
    const defaultProfitPercent = parseFloat(provider.profit_percent) > 0
      ? parseFloat(provider.profit_percent)
      : (parseFloat(process.env.DEFAULT_PROFIT_PERCENT) || 30);

    logger.info(`Using profit_percent: ${defaultProfitPercent}% (provider=${provider.profit_percent}, env=${process.env.DEFAULT_PROFIT_PERCENT})`);

    let created = 0;
    let updated = 0;

    for (const svc of rawServices) {
      const platform = normalizePlatform(svc.platform || svc.category || 'Khác');
      
      // Chuyển đổi giá về VND dựa trên currency của provider
      const rateProvider = convertToVND(svc.rate, provider);
      
      // Kiểm tra existing service để giữ custom_rate và profit_percent đã chỉnh tay
      const existingService = await Service.findOne({
        where: {
          provider_id: providerId,
          provider_service_id: String(svc.service)
        }
      });
      
      const data = {
        provider_id: providerId,
        provider_service_id: String(svc.service),
        platform,
        category: svc.category || 'Khác',
        name: svc.name || `Service ${svc.service}`,
        description: svc.desc || '',
        type: svc.type || 'Default',
        rate_provider: rateProvider,
        // Giữ profit_percent nếu admin đã chỉnh tay (khác defaultProfitPercent)
        profit_percent: existingService?.profit_percent ?? defaultProfitPercent,
        custom_rate: existingService?.custom_rate || null,
        min: parseInt(svc.min) || 0,
        max: parseInt(svc.max) || 0,
        refill: svc.refill || false,
        cancel: svc.cancel || false,
        dripfeed: svc.dripfeed || false,
        is_active: svc.is_active !== undefined ? svc.is_active : true,
      };

      const [service, wasCreated] = await Service.upsert(data);
      
      if (wasCreated) {
        created++;
        logger.debug(`Created service: ${service.name} (${service.id})`);
      } else {
        updated++;
        logger.debug(`Updated service: ${service.name} (${service.id})`);
      }
    }

    await provider.update({ last_sync_at: new Date() });
    await this.clearCache();

    logger.info(`✅ Sync done: ${created} created, ${updated} updated, total: ${rawServices.length}`);
    return { created, updated, total: rawServices.length };
  }

  /**
   * Lấy danh sách services đã group theo Platform → Category
   * Có Redis cache 30 phút
   */
  async getGroupedServices() {
    // Thử lấy từ cache
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }

    const services = await Service.findAll({
      where: { is_active: true },
      order: [['platform', 'ASC'], ['category', 'ASC'], ['sort_order', 'ASC']],
    });

    // Group: { Facebook: { 'Like': [...], 'Follow': [...] }, ... }
    const grouped = {};
    for (const svc of services) {
      const platform = svc.platform || 'Khác';
      const category = svc.category || 'Khác';
      
      if (!grouped[platform]) grouped[platform] = {};
      if (!grouped[platform][category]) grouped[platform][category] = [];
      grouped[platform][category].push(svc.toJSON());
    }

    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(grouped));
    return grouped;
  }

  /**
   * Lấy danh sách Platform
   */
  async getPlatforms() {
    const grouped = await this.getGroupedServices();
    return Object.keys(grouped).sort();
  }

  /**
   * Lấy danh mục theo platform
   */
  async getCategoriesByPlatform(platform) {
    const grouped = await this.getGroupedServices();
    const categories = Object.keys(grouped[platform] || {});
    return categories.sort();
  }

  /**
   * Lấy services theo platform + category
   */
  async getServicesByCategory(platform, category) {
    const grouped = await this.getGroupedServices();
    const services = (grouped[platform] || {})[category] || [];
    // Sắp xếp theo sort_order và name
    return services.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Lấy tất cả services (không group) có phân trang
   */
  async getAllServices(page = 1, limit = 50, filters = {}) {
    const offset = (page - 1) * limit;
    const where = { is_active: true };
    
    if (filters.platform) where.platform = filters.platform;
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      where.name = { [require('sequelize').Op.like]: `%${filters.search}%` };
    }
    
    const { count, rows } = await Service.findAndCountAll({
      where,
      limit,
      offset,
      order: [['platform', 'ASC'], ['category', 'ASC'], ['sort_order', 'ASC']]
    });
    
    return { total: count, page, limit, data: rows };
  }

  /**
   * Xoá cache (gọi sau khi admin edit service)
   */
  async clearCache() {
    await redis.del(CACHE_KEY);
    logger.info('Cache cleared');
  }

  /**
   * Sync tất cả providers
   */
  async syncAllProviders() {
    const providers = await Provider.findAll({ where: { is_active: true } });
    const results = {};
    
    for (const provider of providers) {
      try {
        results[provider.id] = await this.syncFromProvider(provider.id);
      } catch (err) {
        logger.error(`Sync failed for provider ${provider.id}:`, err);
        results[provider.id] = { error: err.message };
      }
    }
    
    return results;
  }
}

module.exports = new ServiceSyncService();