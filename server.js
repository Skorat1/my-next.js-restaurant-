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

// Trust proxy for Vercel / Cloudflare / Nginx
app.set('trust proxy', 1);

// ── Health check (Instant response, no DB required)
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Restaurant portal API is online.', timestamp: new Date().toISOString() });
});

app.get('/api/debug-env', (req, res) => {
  res.json({
    env: {
      mongoUriConfigured: !!process.env.MONGO_URI,
      hasJwtSecret: !!process.env.JWT_SECRET,
      clientUrl: process.env.CLIENT_URL || 'not set',
      nodeEnv: process.env.NODE_ENV || 'production'
    }
  });
});

// Ensure DB is connected for serverless function invocations
app.use(async (req, res, next) => {
  try {
    await connectDB();
  } catch (dbErr) {
    console.error('DB Connection error in middleware:', dbErr.message);
  }
  next();
});

// ── Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ── GZIP compression
app.use(compression());

// ── CORS
const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'https://restaurant-psi-henna-35.vercel.app',
  'https://restaurant-4prc26emy-satishs-projects-76d6d643.vercel.app',
  'https://letoiledoree.com',
  'https://www.letoiledoree.com',
];

const envOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(cleanOrigin) || /\.vercel\.app$/.test(cleanOrigin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));
app.options('*', cors());

// ── Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── NoSQL injection prevention
try {
  app.use(mongoSanitize({ allowDots: true }));
} catch (e) {
  // fallback if sanitize initialization fails
}

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

// ── Rate limiter (lenient for serverless cold starts)
if (!process.env.VERCEL) {
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { msg: 'Too many requests, please try again later.' },
  });
  app.use('/api/', globalLimiter);
}

// ── Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/newsletter', require('./routes/newsletter'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/membership', require('./routes/membership'));
app.use('/api/media', require('./routes/media'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/webhooks', require('./routes/deliveryWebhooks'));
app.use('/api/crm', require('./routes/crm'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/chat', require('./routes/chat'));

// ── 404 handler
app.use((req, res) => {
  res.status(404).json({ msg: 'Route not found' });
});

// ── Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logger.error(err.message || 'Internal Error', { stack: err.stack, url: req.originalUrl });
  res.status(err.status || 500).json({ msg: err.message || 'Internal server error' });
});

// ── HTTP & WebSocket & Socket.io server (Only in long-running Node.js process)
const isServerless = !!process.env.VERCEL;

let emitToRoom = (room, event, data) => {};
let emitGlobally = (event, data) => {};

if (!isServerless) {
  try {
    const http = require('http');
    const { WebSocketServer } = require('ws');
    const { Server } = require('socket.io');

    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        credentials: true,
      },
    });
    app.set('io', io);

    io.on('connection', (socket) => {
      logger.info(`🔌 Socket.io client connected: ${socket.id}`);
      socket.on('join_order', (orderId) => {
        socket.join(`order_${orderId}`);
      });
    });

    const wss = new WebSocketServer({ server });
    app.set('wss', wss);

    const rooms = new Map();

    const joinRoom = (ws, room) => {
      if (!rooms.has(room)) {
        rooms.set(room, new Set());
      }
      rooms.get(room).add(ws);
      if (!ws.rooms) ws.rooms = new Set();
      ws.rooms.add(room);
    };

    emitToRoom = (room, event, data) => {
      if (rooms.has(room)) {
        const message = JSON.stringify({ event, data });
        rooms.get(room).forEach(client => {
          if (client.readyState === 1 /* OPEN */) {
            client.send(message);
          }
        });
      }
    };

    emitGlobally = (event, data) => {
      const message = JSON.stringify({ event, data });
      wss.clients.forEach(client => {
        if (client.readyState === 1 /* OPEN */) {
          client.send(message);
        }
      });
    };

    wss.on('connection', (ws) => {
      logger.info(`🔌 Native WebSocket client connected`);

      ws.on('message', async (messageBuffer) => {
        try {
          const parsed = JSON.parse(messageBuffer.toString());
          const { event, data } = parsed;

          if (event === 'join_order') {
            joinRoom(ws, `order_${data}`);
          } else if (event === 'admin_join_support') {
            joinRoom(ws, data);
          }
        } catch (err) {
          logger.error('WebSocket message parse error', err);
        }
      });

      ws.on('close', () => {
        if (ws.rooms) {
          ws.rooms.forEach(room => {
            if (rooms.has(room)) {
              rooms.get(room).delete(ws);
              if (rooms.get(room).size === 0) {
                rooms.delete(room);
              }
            }
          });
        }
      });
    });

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT}`));

    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      server.close(() => process.exit(0));
    });
    process.on('SIGINT', () => {
      server.close(() => process.exit(0));
    });
  } catch (serverErr) {
    logger.error('Failed to start standalone socket server:', serverErr);
  }
}

app.set('wsHelpers', { emitToRoom, emitGlobally });

module.exports = app;
