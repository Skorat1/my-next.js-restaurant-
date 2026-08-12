const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const connectDB = require('./config/db');
const logger = require('./config/logger');
require('dotenv').config();

const app = express();
connectDB();

// ── Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // handled by Next.js
}));

// ── GZIP compression
app.use(compression());

// ── HTTP request logging via Winston
app.use((req, res, next) => {
  res.on('finish', () => {
    logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode}`, { ip: req.ip });
  });
  next();
});

// ── CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

// ── Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── NoSQL injection prevention — body only (Express 5: req.query is read-only)
app.use((req, _res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body, { allowDots: true });
  next();
});

// ── Input sanitization (XSS prevention)
app.use(require('./middleware/sanitize'));

// ── Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '30d',
  etag: true,
}));
app.use('/admin', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '30d',
  etag: true,
}));

// ── Global rate limiter (5000 req / 15 min per IP in dev)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 1000 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

// ── Strict rate limiter for auth routes (20 req / 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { msg: 'Too many auth attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// ── Routes
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/menu',         require('./routes/menu'));
app.use('/api/contact',      require('./routes/contact'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/newsletter',   require('./routes/newsletter'));
app.use('/api/orders',       require('./routes/orders'));
app.use('/api/payments',     require('./routes/payments'));
app.use('/api/reviews',      require('./routes/reviews'));
app.use('/api/coupons',      require('./routes/coupons'));
app.use('/api/membership',   require('./routes/membership'));
app.use('/api/media',        require('./routes/media'));
app.use('/api/admin',        require('./routes/admin'));

// ── Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Restaurant portal API is online.', timestamp: new Date().toISOString() });
});

// ── 404 handler
app.use((req, res) => {
  res.status(404).json({ msg: 'Route not found' });
});

// ── Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logger.error(err.message, { stack: err.stack, url: req.originalUrl });
  res.status(err.status || 500).json({ msg: err.message || 'Internal server error' });
});

// ── Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT}`));

// ── Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
