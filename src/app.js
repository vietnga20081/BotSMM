// src/app.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const app = express();

// ── Security ──
app.use(helmet());
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(compression());

// ── Logging ──
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ── Body parser ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Trust proxy (fix cho rate limit) ──
// Chỉ set trust proxy nếu bạn đang chạy sau reverse proxy (nginx)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Chỉ trust proxy đầu tiên (nginx)
} else {
  app.set('trust proxy', false);
}

// ── Rate limit ──
// Cấu hình rate limit với trust proxy đúng cách
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 200, // giới hạn 200 requests
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true, // Trả về rate limit info trong headers
  legacyHeaders: false, // Tắt headers cũ
  // Nếu có lỗi trust proxy, có thể bỏ qua validation
  validate: { trustProxy: false } // Bỏ qua validation trust proxy
});

app.use('/api/', limiter);

// ── Routes ──
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/admin', require('./routes/admin.routes'));

// ── Health check ──
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Webhook Sepay ──
app.post('/webhook/sepay', async (req, res) => {
  const { handleSepayWebhook } = require('./controllers/sepay.controller');
  return handleSepayWebhook(req, res);
});

// ── 404 ──
app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// ── Error handler ──
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

module.exports = app;