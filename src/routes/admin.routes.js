// src/routes/admin.routes.js — UPGRADED v2
const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middlewares/adminAuth');
const admin = require('../controllers/admin.controller');

router.use(adminAuth);

// ── Dashboard & Analytics ──
router.get('/dashboard', admin.getDashboard);
router.get('/analytics', admin.getAnalytics);
router.get('/system/health', admin.getSystemHealth);

// ── Broadcast ──
router.post('/broadcast', admin.broadcastMessage);

// ── Export CSV ──
router.get('/export', admin.exportData);

// ── Provider ──
router.get('/providers', admin.getProviders);
router.post('/providers', admin.createProvider);
router.put('/providers/:id', admin.updateProvider);
router.delete('/providers/:id', admin.deleteProvider);
router.post('/providers/:providerId/sync', admin.syncProviderServices);
router.get('/providers/:providerId/balance', admin.getProviderBalance);

// ── Service ──
router.get('/services', admin.getServices);
router.patch('/services/:id', admin.updateService);
router.delete('/services/:id', admin.deleteService);
router.post('/services/bulk-update', admin.bulkUpdateServices);

// ── Order ──
router.get('/orders', admin.getOrders);
router.post('/orders/:id/force-complete', admin.forceCompleteOrder);
router.post('/orders/:id/force-cancel', admin.forceCancelOrder);
router.post('/orders/:id/refill', admin.refillOrder);

// ── User ──
router.get('/users', admin.getUsers);
router.get('/users/:userId', admin.getUser);
router.post('/users/:userId/balance', admin.adjustBalance);
router.post('/users/:userId/ban', admin.banUser);
router.patch('/users/:userId/role', admin.updateUserRole);

// ── Coupon ──
router.get('/coupons', admin.getCoupons);
router.post('/coupons', admin.createCoupon);
router.put('/coupons/:id', admin.updateCoupon);
router.delete('/coupons/:id', admin.deleteCoupon);

// ── Transactions ──
router.get('/transactions', admin.getTransactions);

// ── Settings ──
router.get('/settings', admin.getSettings);
router.post('/settings', admin.saveSettings);

// ── Auto Broadcast ──
router.get('/auto-broadcast/status', admin.getAutoBroadcastStatus);
router.get('/auto-broadcast/preview', admin.previewAutoBroadcast);
router.post('/auto-broadcast/trigger', admin.triggerAutoBroadcast);
router.post('/auto-broadcast/config', admin.updateAutoBroadcastConfig);

// ── Provider Auto Sync ──
router.get('/providers/sync-status', admin.getProviderSyncStatus);
router.post('/providers/sync-now', admin.triggerProviderSync);
router.post('/providers/sync-config', admin.updateSyncConfig);

module.exports = router;
