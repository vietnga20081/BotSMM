// src/controllers/admin.controller.js — UPGRADED v2
const { Provider, Service, Order, User, Transaction, Coupon } = require('../models');
const serviceSyncService = require('../services/serviceSync.service');
const userService = require('../services/user.service');
const providerApi = require('../services/providerApi.service');
const botRegistry = require('../bot/botRegistry');
const { Op, fn, col, literal, Sequelize } = require('sequelize');
const sequelize = require('../configs/database');
const logger = require('../utils/logger');

// ── Dashboard ────────────────────────────────────
const getDashboard = async (req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);

    const [
      totalUsers, newUsersToday, newUsersYesterday,
      totalOrders, ordersToday, ordersYesterday,
      pendingOrders, processingOrders,
      totalRevenue, revenueToday, revenueYesterday, revenueMonth,
      activeServices, activeProviders,
      totalDeposit, depositToday,
    ] = await Promise.all([
      User.count(),
      User.count({ where: { created_at: { [Op.gte]: today } } }),
      User.count({ where: { created_at: { [Op.between]: [yesterday, today] } } }),
      Order.count(),
      Order.count({ where: { created_at: { [Op.gte]: today } } }),
      Order.count({ where: { created_at: { [Op.between]: [yesterday, today] } } }),
      Order.count({ where: { status: { [Op.in]: ['Pending', 'Processing'] } } }),
      Order.count({ where: { status: 'In progress' } }),
      Order.sum('charge') || 0,
      Order.sum('charge', { where: { created_at: { [Op.gte]: today }, status: { [Op.not]: 'Canceled' } } }) || 0,
      Order.sum('charge', { where: { created_at: { [Op.between]: [yesterday, today] }, status: { [Op.not]: 'Canceled' } } }) || 0,
      Order.sum('charge', { where: { created_at: { [Op.gte]: monthAgo }, status: { [Op.not]: 'Canceled' } } }) || 0,
      Service.count({ where: { is_active: true } }),
      Provider.count({ where: { status: 'active' } }),
      Transaction.sum('amount', { where: { type: 'deposit', amount: { [Op.gt]: 0 } } }) || 0,
      Transaction.sum('amount', { where: { type: 'deposit', amount: { [Op.gt]: 0 }, created_at: { [Op.gte]: today } } }) || 0,
    ]);

    // Revenue last 30 days
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      const [rev, orders] = await Promise.all([
        Order.sum('charge', { where: { created_at: { [Op.between]: [d, end] }, status: { [Op.not]: 'Canceled' } } }),
        Order.count({ where: { created_at: { [Op.between]: [d, end] } } }),
      ]);
      last30Days.push({ date: d.toISOString().split('T')[0], revenue: rev || 0, orders });
    }

    // Order status distribution
    const statusCounts = await Order.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'], raw: true,
    });

    // Top services by revenue
    const topServices = await Order.findAll({
      attributes: ['service_id', [fn('COUNT', col('Order.id')), 'order_count'], [fn('SUM', col('charge')), 'total_revenue']],
      include: [{ model: Service, as: 'service', attributes: ['name', 'platform'] }],
      group: ['service_id'],
      order: [[literal('total_revenue'), 'DESC']],
      limit: 10, raw: false,
    });

    // Top users by spending
    const topUsers = await User.findAll({
      order: [['total_spent', 'DESC']],
      limit: 5,
      attributes: ['id', 'username', 'first_name', 'total_spent', 'total_orders'],
    });

    // Recent orders (last 10)
    const recentOrders = await Order.findAll({
      order: [['created_at', 'DESC']],
      limit: 10,
      include: [
        { model: User, as: 'user', attributes: ['username', 'first_name'] },
        { model: Service, as: 'service', attributes: ['name', 'platform'] },
      ],
    });

    // Hourly orders today
    const hourlyOrders = [];
    for (let h = 0; h < 24; h++) {
      const start = new Date(today); start.setHours(h, 0, 0, 0);
      const end = new Date(today); end.setHours(h, 59, 59, 999);
      const count = await Order.count({ where: { created_at: { [Op.between]: [start, end] } } });
      hourlyOrders.push({ hour: h, count });
    }

    res.json({
      success: true, data: {
        stats: {
          totalUsers, newUsersToday, newUsersYesterday,
          totalOrders, ordersToday, ordersYesterday,
          pendingOrders, processingOrders,
          totalRevenue: totalRevenue || 0, revenueToday: revenueToday || 0,
          revenueYesterday: revenueYesterday || 0, revenueMonth: revenueMonth || 0,
          activeServices, activeProviders,
          totalDeposit: totalDeposit || 0, depositToday: depositToday || 0,
        },
        revenueChart: last30Days,
        statusDistribution: statusCounts,
        topServices: topServices.map(s => ({
          service_id: s.service_id,
          name: s.service?.name,
          platform: s.service?.platform,
          order_count: s.get('order_count'),
          total_revenue: s.get('total_revenue'),
        })),
        topUsers,
        recentOrders: recentOrders.map(o => ({
          id: o.id, status: o.status, charge: o.charge, quantity: o.quantity,
          created_at: o.created_at,
          user: o.user, service: o.service,
        })),
        hourlyOrders,
      }
    });
  } catch (err) {
    logger.error('getDashboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Analytics ────────────────────────────────────
const getAnalytics = async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0, 0, 0, 0);

    const completedWhere = { status: { [Op.in]: ['Completed', 'Partial', 'In progress', 'Processing'] } };
    const notCanceled = { status: { [Op.not]: 'Canceled' } };

    // ── Tổng hợp lợi nhuận theo ngày ──
    const dailyStats = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      const rangeWhere = { created_at: { [Op.between]: [d, end] }, ...notCanceled };

      const [rev, cost, orders] = await Promise.all([
        Order.sum('charge', { where: rangeWhere }) || 0,
        Order.sum('cost_vnd', { where: rangeWhere }) || 0,
        Order.count({ where: { created_at: { [Op.between]: [d, end] } } }),
      ]);
      dailyStats.push({
        date: d.toISOString().split('T')[0],
        revenue: parseFloat(rev) || 0,
        cost: parseFloat(cost) || 0,
        profit: (parseFloat(rev) || 0) - (parseFloat(cost) || 0),
        orders,
      });
    }

    // ── Tổng kỳ ──
    const periodWhere = { created_at: { [Op.gte]: from }, ...notCanceled };
    const [totalRevPeriod, totalCostPeriod, totalOrdersPeriod] = await Promise.all([
      Order.sum('charge', { where: periodWhere }) || 0,
      Order.sum('cost_vnd', { where: periodWhere }) || 0,
      Order.count({ where: { created_at: { [Op.gte]: from } } }),
    ]);
    const totalProfitPeriod = (parseFloat(totalRevPeriod) || 0) - (parseFloat(totalCostPeriod) || 0);
    const marginPct = totalRevPeriod > 0 ? (totalProfitPeriod / totalRevPeriod * 100).toFixed(1) : 0;

    // ── Tổng all-time ──
    const [totalRevAll, totalCostAll] = await Promise.all([
      Order.sum('charge', { where: notCanceled }) || 0,
      Order.sum('cost_vnd', { where: notCanceled }) || 0,
    ]);
    const totalProfitAll = (parseFloat(totalRevAll) || 0) - (parseFloat(totalCostAll) || 0);

    // ── Doanh thu theo platform ──
    const revByPlatform = await Order.findAll({
      attributes: [
        [fn('SUM', col('Order.charge')), 'revenue'],
        [fn('SUM', col('Order.cost_vnd')), 'cost'],
        [fn('COUNT', col('Order.id')), 'orders'],
      ],
      include: [{ model: Service, as: 'service', attributes: ['platform'] }],
      where: { created_at: { [Op.gte]: from }, ...notCanceled },
      group: ['service.platform'],
      raw: false,
    });

    // ── Tăng trưởng user ──
    const userGrowth = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      const count = await User.count({ where: { created_at: { [Op.between]: [d, end] } } });
      userGrowth.push({ date: d.toISOString().split('T')[0], count });
    }

    // ── Top services by profit ──
    const topByProfit = await Order.findAll({
      attributes: [
        'service_id',
        [fn('SUM', col('charge')), 'revenue'],
        [fn('SUM', col('cost_vnd')), 'cost'],
        [literal('SUM(charge) - SUM(cost_vnd)'), 'profit'],
        [fn('COUNT', col('Order.id')), 'order_count'],
      ],
      include: [{ model: Service, as: 'service', attributes: ['name', 'platform'] }],
      where: { created_at: { [Op.gte]: from }, ...notCanceled },
      group: ['service_id'],
      order: [[literal('profit'), 'DESC']],
      limit: 10,
      raw: false,
    });

    // ── Conversion ──
    const [usersWithOrders, totalUsers] = await Promise.all([
      User.count({ where: { total_orders: { [Op.gt]: 0 } } }),
      User.count(),
    ]);

    // ── AOV ──
    const avgOrderValue = await Order.findOne({
      attributes: [[fn('AVG', col('charge')), 'avg']],
      where: { ...notCanceled, created_at: { [Op.gte]: from } },
      raw: true,
    });

    res.json({
      success: true, data: {
        period, days,
        // KPI tổng kỳ
        summary: {
          revenue: parseFloat(totalRevPeriod) || 0,
          cost: parseFloat(totalCostPeriod) || 0,
          profit: totalProfitPeriod,
          marginPct: parseFloat(marginPct),
          orders: totalOrdersPeriod,
          aov: parseFloat(avgOrderValue?.avg || 0),
        },
        // KPI all-time
        allTime: {
          revenue: parseFloat(totalRevAll) || 0,
          cost: parseFloat(totalCostAll) || 0,
          profit: totalProfitAll,
          marginPct: totalRevAll > 0 ? parseFloat((totalProfitAll / totalRevAll * 100).toFixed(1)) : 0,
        },
        // Biểu đồ theo ngày
        dailyStats,
        // Theo platform
        revByPlatform: revByPlatform.map(r => ({
          platform: r.service?.platform || 'Khác',
          revenue: parseFloat(r.get('revenue')) || 0,
          cost: parseFloat(r.get('cost')) || 0,
          profit: (parseFloat(r.get('revenue')) || 0) - (parseFloat(r.get('cost')) || 0),
          orders: parseInt(r.get('orders')) || 0,
        })).filter(r => r.platform),
        // Top service by profit
        topByProfit: topByProfit.map(s => ({
          service_id: s.service_id,
          name: s.service?.name,
          platform: s.service?.platform,
          revenue: parseFloat(s.get('revenue')) || 0,
          cost: parseFloat(s.get('cost')) || 0,
          profit: parseFloat(s.get('profit')) || 0,
          order_count: parseInt(s.get('order_count')) || 0,
        })),
        // User growth
        userGrowth,
        conversionRate: totalUsers > 0 ? parseFloat((usersWithOrders / totalUsers * 100).toFixed(1)) : 0,
      }
    });
  } catch (err) {
    logger.error('getAnalytics error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── System Health ────────────────────────────────────
const getSystemHealth = async (req, res) => {
  try {
    const startTime = Date.now();
    let dbOk = false, redisOk = false;

    // DB check
    try { await sequelize.authenticate(); dbOk = true; } catch (e) { dbOk = false; }

    // Redis check
    try {
      const { redis } = require('../configs/redis');
      await redis.ping();
      redisOk = true;
    } catch (e) { redisOk = false; }

    // Bot status
    const bot = botRegistry.get();
    const botOk = !!bot;

    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

    res.json({
      success: true, data: {
        status: (dbOk && redisOk) ? 'healthy' : 'degraded',
        uptime: Math.floor(uptime),
        uptimeHuman: formatUptime(uptime),
        db: dbOk ? 'connected' : 'error',
        redis: redisOk ? 'connected' : 'error',
        bot: botOk ? 'running' : 'stopped',
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
        responseTime: Date.now() - startTime,
        nodeVersion: process.version,
        env: process.env.NODE_ENV,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// ── Broadcast ────────────────────────────────────
const broadcastMessage = async (req, res) => {
  try {
    const { message, target = 'all', preview = false } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

    const where = { is_banned: false };
    if (target === 'active') {
      where.total_orders = { [Op.gt]: 0 };
    } else if (target === 'inactive') {
      where.total_orders = 0;
    } else if (target === 'resellers') {
      where.role = 'reseller';
    }

    const users = await User.findAll({
      where,
      attributes: ['telegram_id', 'first_name', 'username'],
      limit: preview ? 5 : 10000,
    });

    if (preview) {
      return res.json({ success: true, data: { count: users.length, preview: true, users } });
    }

    const bot = botRegistry.get();
    if (!bot) return res.status(503).json({ success: false, message: 'Bot is not running' });

    let sent = 0, failed = 0;
    for (const user of users) {
      try {
        await bot.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' });
        sent++;
        await new Promise(r => setTimeout(r, 50)); // Rate limit delay
      } catch (e) {
        failed++;
      }
    }

    logger.info(`Broadcast: ${sent} sent, ${failed} failed`);
    res.json({ success: true, data: { sent, failed, total: users.length } });
  } catch (err) {
    logger.error('broadcastMessage error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Export CSV ────────────────────────────────────
const exportData = async (req, res) => {
  try {
    const { type, dateFrom, dateTo, status } = req.query;
    let data = [], headers = [];

    const dateWhere = {};
    if (dateFrom) dateWhere[Op.gte] = new Date(dateFrom);
    if (dateTo) dateWhere[Op.lte] = new Date(dateTo + 'T23:59:59');
    const dateFilter = Object.keys(dateWhere).length ? { created_at: dateWhere } : {};

    if (type === 'orders') {
      const rows = await Order.findAll({
        where: { ...dateFilter, ...(status ? { status } : {}) },
        include: [
          { model: User, as: 'user', attributes: ['username', 'telegram_id'] },
          { model: Service, as: 'service', attributes: ['name', 'platform'] },
        ],
        order: [['created_at', 'DESC']],
        limit: 10000,
      });
      headers = ['ID', 'User', 'Telegram ID', 'Service', 'Platform', 'Link', 'Quantity', 'Charge (VND)', 'Status', 'Created At'];
      data = rows.map(o => [
        o.id, o.user?.username || '', o.user?.telegram_id || '',
        o.service?.name || '', o.service?.platform || '',
        o.link, o.quantity, o.charge, o.status,
        new Date(o.created_at).toLocaleString('vi-VN'),
      ]);
    } else if (type === 'users') {
      const rows = await User.findAll({ order: [['created_at', 'DESC']], limit: 10000 });
      headers = ['ID', 'Username', 'First Name', 'Telegram ID', 'Balance', 'Total Spent', 'Total Orders', 'Role', 'Banned', 'Joined'];
      data = rows.map(u => [
        u.id, u.username || '', u.first_name || '', u.telegram_id,
        u.balance, u.total_spent, u.total_orders, u.role,
        u.is_banned ? 'Yes' : 'No',
        new Date(u.created_at).toLocaleString('vi-VN'),
      ]);
    } else if (type === 'transactions') {
      const rows = await Transaction.findAll({
        where: dateFilter,
        include: [{ model: User, as: 'user', attributes: ['username', 'telegram_id'] }],
        order: [['created_at', 'DESC']],
        limit: 10000,
      });
      headers = ['ID', 'User', 'Type', 'Amount', 'Balance After', 'Description', 'Created At'];
      data = rows.map(t => [
        t.id, t.user?.username || t.user?.telegram_id || '',
        t.type, t.amount, t.balance_after, t.description || '',
        new Date(t.created_at).toLocaleString('vi-VN'),
      ]);
    }

    // Build CSV
    const csvRows = [headers, ...data].map(row =>
      row.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')
    );
    const csv = '\uFEFF' + csvRows.join('\n'); // BOM for Excel UTF-8

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    logger.error('exportData error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Provider ──────────────────────────────────────
const getProviders = async (req, res) => {
  try {
    const providers = await Provider.findAll({ order: [['priority', 'ASC']] });
    res.json({ success: true, data: providers });
  } catch (err) {
    logger.error('getProviders error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const createProvider = async (req, res) => {
  try {
    const { name, api_url, api_key, priority = 1, currency = 'USD', exchange_rate = 25000, profit_percent = 0 } = req.body;
    if (!name || !api_url || !api_key)
      return res.status(400).json({ success: false, message: 'Thiếu thông tin: name, api_url, api_key là bắt buộc' });
    const existing = await Provider.findOne({ where: { name } });
    if (existing) return res.status(400).json({ success: false, message: `Provider "${name}" đã tồn tại` });
    const provider = await Provider.create({ name, api_url, api_key, priority: parseInt(priority), currency, exchange_rate: parseFloat(exchange_rate), profit_percent: parseFloat(profit_percent) || 0, status: 'active', balance: 0 });
    res.json({ success: true, data: provider });
  } catch (err) {
    logger.error('createProvider error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const updateProvider = async (req, res) => {
  try {
    const provider = await Provider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });
    const { currency, exchange_rate, priority, status, name, api_url, api_key, profit_percent } = req.body;
    await provider.update({ currency, exchange_rate, priority, status, name, api_url, api_key, profit_percent });
    await serviceSyncService.clearCache();
    res.json({ success: true, data: provider });
  } catch (err) {
    logger.error('updateProvider error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const deleteProvider = async (req, res) => {
  try {
    const provider = await Provider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });
    await provider.destroy();
    res.json({ success: true, message: 'Provider đã xóa' });
  } catch (err) {
    logger.error('deleteProvider error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const syncProviderServices = async (req, res) => {
  try {
    const { providerId } = req.params;
    const result = await serviceSyncService.syncFromProvider(parseInt(providerId));
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('syncProviderServices error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getProviderBalance = async (req, res) => {
  try {
    const provider = await Provider.findByPk(req.params.providerId);
    if (!provider) return res.status(404).json({ success: false });
    const result = await providerApi.getBalance(provider);
    await provider.update({ balance: result.balance });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('getProviderBalance error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Service ──────────────────────────────────────
const getServices = async (req, res) => {
  try {
    const { page = 1, limit = 50, search, platform, is_active } = req.query;
    const where = {};
    if (search) where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { category: { [Op.like]: `%${search}%` } },
    ];
    if (platform) where.platform = platform;
    if (is_active !== undefined && is_active !== '') where.is_active = is_active === 'true';

    const { count, rows } = await Service.findAndCountAll({
      where,
      order: [['platform', 'ASC'], ['category', 'ASC'], ['sort_order', 'ASC'], ['id', 'ASC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      include: [{ model: Provider, as: 'provider', attributes: ['name'] }],
    });

    // Distinct platforms for filter
    const platforms = await Service.findAll({
      attributes: [[fn('DISTINCT', col('platform')), 'platform']],
      raw: true,
    });

    res.json({ success: true, data: rows, total: count, platforms: platforms.map(p => p.platform) });
  } catch (err) {
    logger.error('getServices error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateService = async (req, res) => {
  try {
    const svc = await Service.findByPk(req.params.id);
    if (!svc) return res.status(404).json({ success: false });
    const { name, profit_percent, custom_rate, sort_order, is_active } = req.body;
    await svc.update({ name, profit_percent, custom_rate, sort_order, is_active });
    await serviceSyncService.clearCache();
    res.json({ success: true, data: svc });
  } catch (err) {
    logger.error('updateService error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const deleteService = async (req, res) => {
  try {
    const svc = await Service.findByPk(req.params.id);
    if (!svc) return res.status(404).json({ success: false });
    await svc.destroy();
    await serviceSyncService.clearCache();
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteService error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const bulkUpdateServices = async (req, res) => {
  try {
    const { ids, updates } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ success: false, message: 'No IDs provided' });
    const allowed = ['custom_rate', 'profit_percent', 'is_active'];
    const safeUpdates = {};
    for (const key of allowed) { if (updates[key] !== undefined) safeUpdates[key] = updates[key]; }
    await Service.update(safeUpdates, { where: { id: { [Op.in]: ids } } });
    await serviceSyncService.clearCache();
    res.json({ success: true, updated: ids.length });
  } catch (err) {
    logger.error('bulkUpdateServices error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Order ──────────────────────────────────────
const getOrders = async (req, res) => {
  try {
    const { status, userId, page = 1, limit = 20, search, dateFrom, dateTo } = req.query;
    const where = {};
    if (status) where.status = status;
    if (userId) where.user_id = userId;
    if (search) where[Op.or] = [{ link: { [Op.like]: `%${search}%` } }];
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) where.created_at[Op.gte] = new Date(dateFrom);
      if (dateTo) where.created_at[Op.lte] = new Date(dateTo + 'T23:59:59');
    }

    const { count, rows } = await Order.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['telegram_id', 'username', 'first_name'] },
        { model: Service, as: 'service', attributes: ['name', 'platform'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ success: true, data: rows, total: count });
  } catch (err) {
    logger.error('getOrders error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const forceCompleteOrder = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ success: false });
    await order.update({ status: 'Completed', completed_at: new Date() });
    res.json({ success: true });
  } catch (err) {
    logger.error('forceCompleteOrder error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const forceCancelOrder = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, { include: [{ model: User, as: 'user' }] });
    if (!order) return res.status(404).json({ success: false });
    if (['Completed', 'Canceled'].includes(order.status))
      return res.status(400).json({ success: false, message: 'Không thể hủy đơn này' });
    if (order.user && order.charge > 0)
      await order.user.increment('balance', { by: parseFloat(order.charge) });
    await order.update({ status: 'Canceled' });
    res.json({ success: true, message: 'Đã hủy và hoàn tiền' });
  } catch (err) {
    logger.error('forceCancelOrder error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const refillOrder = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, { include: [{ model: Provider, as: 'provider' }] });
    if (!order || !order.provider_order_id)
      return res.status(404).json({ success: false, message: 'Order not found or no provider ID' });
    const result = await providerApi.refillOrder(order.provider, order.provider_order_id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('refillOrder error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── User ──────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, is_banned, sortBy = 'created_at', sortDir = 'DESC' } = req.query;
    const where = {};
    if (search) where[Op.or] = [
      { username: { [Op.like]: `%${search}%` } },
      { first_name: { [Op.like]: `%${search}%` } },
      { telegram_id: isNaN(search) ? undefined : search },
    ].filter(Boolean);
    if (role) where.role = role;
    if (is_banned !== undefined && is_banned !== '') where.is_banned = is_banned === 'true';

    const validSort = ['created_at', 'total_spent', 'total_orders', 'balance'];
    const orderCol = validSort.includes(sortBy) ? sortBy : 'created_at';
    const orderDir = sortDir === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await User.findAndCountAll({
      where,
      order: [[orderCol, orderDir]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ success: true, data: rows, total: count });
  } catch (err) {
    logger.error('getUsers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const [orders, transactions] = await Promise.all([
      Order.findAll({
        where: { user_id: req.params.userId },
        include: [{ model: Service, as: 'service', attributes: ['name', 'platform'] }],
        order: [['created_at', 'DESC']], limit: 20,
      }),
      Transaction.findAll({
        where: { user_id: req.params.userId },
        order: [['created_at', 'DESC']], limit: 20,
      }),
    ]);
    res.json({ success: true, data: { user, orders, transactions } });
  } catch (err) {
    logger.error('getUser error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const adjustBalance = async (req, res) => {
  try {
    const { amount, description } = req.body;
    const user = await userService.adminAdjustBalance(parseInt(req.params.userId), parseFloat(amount), description);
    res.json({ success: true, data: { balance: user.balance } });
  } catch (err) {
    logger.error('adjustBalance error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const banUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.userId);
    if (!user) return res.status(404).json({ success: false });
    await user.update({ is_banned: !user.is_banned });
    res.json({ success: true, is_banned: user.is_banned });
  } catch (err) {
    logger.error('banUser error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.userId);
    if (!user) return res.status(404).json({ success: false });
    const { role, profit_percent } = req.body;
    await user.update({ role, profit_percent });
    res.json({ success: true, data: user });
  } catch (err) {
    logger.error('updateUserRole error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Coupon ──────────────────────────────────────
const createCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.json({ success: true, data: coupon });
  } catch (err) {
    logger.error('createCoupon error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.findAll({ order: [['created_at', 'DESC']] });
    res.json({ success: true, data: coupons });
  } catch (err) {
    logger.error('getCoupons error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ success: false });
    await coupon.update(req.body);
    res.json({ success: true, data: coupon });
  } catch (err) {
    logger.error('updateCoupon error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) return res.status(404).json({ success: false });
    await coupon.destroy();
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteCoupon error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Transactions ──────────────────────────────────────
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, userId, dateFrom, dateTo } = req.query;
    const where = {};
    if (type) where.type = type;
    if (userId) where.user_id = userId;
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) where.created_at[Op.gte] = new Date(dateFrom);
      if (dateTo) where.created_at[Op.lte] = new Date(dateTo + 'T23:59:59');
    }

    const { count, rows } = await Transaction.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['telegram_id', 'username', 'first_name'] }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ success: true, data: rows, total: count });
  } catch (err) {
    logger.error('getTransactions error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Settings ──────────────────────────────────────
const getSettings = async (req, res) => {
  res.json({
    success: true, data: {
      DEFAULT_PROFIT_PERCENT: process.env.DEFAULT_PROFIT_PERCENT || 30,
      USD_TO_VND: process.env.USD_TO_VND || 25000,
      APP_URL: process.env.APP_URL || '',
      CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
      SEPAY_BANK_ACCOUNT: process.env.SEPAY_BANK_ACCOUNT || '',
      SEPAY_BANK_NAME: process.env.SEPAY_BANK_NAME || '',
    }
  });
};

const saveSettings = async (req, res) => {
  const { DEFAULT_PROFIT_PERCENT, USD_TO_VND, SEPAY_BANK_ACCOUNT, SEPAY_BANK_NAME } = req.body;
  if (DEFAULT_PROFIT_PERCENT) process.env.DEFAULT_PROFIT_PERCENT = DEFAULT_PROFIT_PERCENT;
  if (USD_TO_VND) process.env.USD_TO_VND = USD_TO_VND;
  if (SEPAY_BANK_ACCOUNT) process.env.SEPAY_BANK_ACCOUNT = SEPAY_BANK_ACCOUNT;
  if (SEPAY_BANK_NAME) process.env.SEPAY_BANK_NAME = SEPAY_BANK_NAME;
  res.json({ success: true, message: 'Settings updated (runtime only — update .env để persistent)' });
};

module.exports = {
  getDashboard, getAnalytics, getSystemHealth, broadcastMessage, exportData,
  getProviders, createProvider, updateProvider, deleteProvider, syncProviderServices, getProviderBalance,
  getServices, updateService, deleteService, bulkUpdateServices,
  getOrders, forceCompleteOrder, forceCancelOrder, refillOrder,
  getUsers, getUser, adjustBalance, banUser, updateUserRole,
  createCoupon, getCoupons, updateCoupon, deleteCoupon,
  getTransactions, getSettings, saveSettings,
};

// ── Provider Auto Sync ────────────────────────────────────────────
const getProviderSyncStatus = (req, res) => {
  try {
    const scheduler = require('../services/scheduler.service');
    const jobs = scheduler.listJobs();
    const syncJob = jobs.find(j => j.name === 'provider-sync');
    res.json({
      success: true, data: {
        scheduled: !!syncJob,
        hour: syncJob?.hour ?? parseInt(process.env.PROVIDER_SYNC_HOUR) ?? 3,
        nextRunIn: syncJob ? scheduler.getNextRunMs('provider-sync') : null,
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const triggerProviderSync = async (req, res) => {
  try {
    const { Provider } = require('../models');
    const serviceSyncService = require('../services/serviceSync.service');
    const providers = await Provider.findAll({ where: { status: 'active' } });
    if (!providers.length)
      return res.json({ success: true, data: { message: 'Không có provider active' } });

    // Chạy ngầm
    (async () => {
      for (const p of providers) {
        try { await serviceSyncService.syncFromProvider(p.id); } catch (e) { /* skip */ }
      }
    })();

    res.json({ success: true, message: `Đang sync ${providers.length} providers... kiểm tra logs` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const updateSyncConfig = (req, res) => {
  try {
    const { hour } = req.body;
    const h = Math.max(0, Math.min(23, parseInt(hour) || 3));
    process.env.PROVIDER_SYNC_HOUR = h;

    const scheduler = require('../services/scheduler.service');
    const { Provider } = require('../models');
    const serviceSyncService = require('../services/serviceSync.service');

    scheduler.removeJob('provider-sync');
    scheduler.addDailyJob('provider-sync', h, 0, async () => {
      const providers = await Provider.findAll({ where: { status: 'active' } });
      for (const p of providers) {
        try { await serviceSyncService.syncFromProvider(p.id); } catch (e) { /* skip */ }
      }
    });

    res.json({ success: true, message: `Đã đổi giờ auto sync thành ${String(h).padStart(2,'0')}:00 VN` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
const getAutoBroadcastStatus = (req, res) => {
  try {
    const scheduler = require('../services/scheduler.service');
    const jobs = scheduler.listJobs();
    res.json({
      success: true, data: {
        jobs,
        enabled: jobs.length > 0,
        groqConfigured: !!process.env.GROQ_API_KEY,
        morningTarget: process.env.BROADCAST_MORNING_TARGET || 'all',
        eveningTarget: process.env.BROADCAST_EVENING_TARGET || 'all',
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const previewAutoBroadcast = async (req, res) => {
  try {
    const { generateContent } = require('../services/autobroadcast.service');
    const { timeOfDay = 'morning' } = req.query;
    const message = await generateContent(timeOfDay);
    res.json({ success: true, data: { message } });
  } catch (e) {
    logger.error('previewAutoBroadcast error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

const triggerAutoBroadcast = async (req, res) => {
  try {
    const { runAutoBroadcast } = require('../services/autobroadcast.service');
    const { timeOfDay = 'morning', target = 'all' } = req.body;
    // Chạy ngầm, không chờ
    runAutoBroadcast(timeOfDay, target)
      .then(r => logger.info('Manual broadcast done:', r))
      .catch(e => logger.error('Manual broadcast error:', e.message));
    res.json({ success: true, message: 'Đang gửi broadcast AI... kiểm tra logs' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const updateAutoBroadcastConfig = (req, res) => {
  try {
    const { morningTarget, eveningTarget, morningHour, eveningHour } = req.body;
    const scheduler = require('../services/scheduler.service');
    const { runAutoBroadcast } = require('../services/autobroadcast.service');

    if (morningTarget) process.env.BROADCAST_MORNING_TARGET = morningTarget;
    if (eveningTarget) process.env.BROADCAST_EVENING_TARGET = eveningTarget;

    const mH = parseInt(morningHour) || 7;
    const eH = parseInt(eveningHour) || 19;

    // Reschedule
    scheduler.removeJob('broadcast-morning');
    scheduler.removeJob('broadcast-evening');
    scheduler.addDailyJob('broadcast-morning', mH, 0, () =>
      runAutoBroadcast('morning', process.env.BROADCAST_MORNING_TARGET || 'all')
    );
    scheduler.addDailyJob('broadcast-evening', eH, 0, () =>
      runAutoBroadcast('evening', process.env.BROADCAST_EVENING_TARGET || 'all')
    );

    res.json({ success: true, message: 'Cập nhật lịch broadcast thành công' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Append to existing exports
const _existing = module.exports;
module.exports = Object.assign(_existing, {
  getAutoBroadcastStatus, previewAutoBroadcast, triggerAutoBroadcast, updateAutoBroadcastConfig,
  getProviderSyncStatus, triggerProviderSync, updateSyncConfig,
});
