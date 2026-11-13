// src/routes/auth.routes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Quá nhiều lần thử đăng nhập, thử lại sau 15 phút' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Thiếu username hoặc password' });
  }

  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  if (username !== adminUser || password !== adminPass) {
    return res.status(401).json({ success: false, message: 'Sai thông tin đăng nhập' });
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  res.json({ success: true, token, username });
});

router.post('/refresh', (req, res) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token required' });
  }
  const token = auth.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = jwt.sign(
      { username: decoded.username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    res.json({ success: true, token: newToken });
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

module.exports = router;
