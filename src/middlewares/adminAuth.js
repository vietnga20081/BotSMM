// src/middlewares/adminAuth.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const adminAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token required' });
  }

  const token = auth.replace('Bearer ', '').trim();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    logger.warn('Invalid JWT attempt:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

module.exports = { adminAuth };
