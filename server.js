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

// Ensure DB is connected for serverless function invocations
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

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

// ── Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Restaurant portal API is online.', timestamp: new Date().toISOString() });
});

// ── Debug env endpoint
app.get('/api/debug-env', (req, res) => {
  res.json({
    env: {
      mongoUriPrefix: process.env.MONGO_URI ? process.env.MONGO_URI.substring(0, 10) : 'none',
      hasJwtSecret: !!process.env.JWT_SECRET,
      clientUrl: process.env.CLIENT_URL || 'not set',
      nodeEnv: process.env.NODE_ENV
    }
  });
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

// ── HTTP & WebSocket & Socket.io server
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

// Manual room and global event management
const rooms = new Map(); // sessionId -> Set of ws clients

const joinRoom = (ws, room) => {
  if (!rooms.has(room)) {
    rooms.set(room, new Set());
  }
  rooms.get(room).add(ws);
  if (!ws.rooms) ws.rooms = new Set();
  ws.rooms.add(room);
};

const emitToRoom = (room, event, data) => {
  if (rooms.has(room)) {
    const message = JSON.stringify({ event, data });
    rooms.get(room).forEach(client => {
      if (client.readyState === 1 /* OPEN */) {
        client.send(message);
      }
    });
  }
};

const emitGlobally = (event, data) => {
  const message = JSON.stringify({ event, data });
  wss.clients.forEach(client => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(message);
    }
  });
};

app.set('wsHelpers', { emitToRoom, emitGlobally });

wss.on('connection', (ws) => {
  logger.info(`🔌 Native WebSocket client connected`);

  ws.on('message', async (messageBuffer) => {
    try {
      const parsed = JSON.parse(messageBuffer.toString());
      const { event, data } = parsed;

      if (event === 'join_order') {
        joinRoom(ws, `order_${data}`);
        logger.debug(`Socket joined room order_${data}`);
      }
      
      // Customer initiates or joins a chat session
      else if (event === 'join_support') {
        const { sessionId, customerName } = data;
        joinRoom(ws, sessionId);
        logger.debug(`Socket joined chat session ${sessionId}`);
        
        try {
          const ChatSession = require('./models/ChatSession');
          let session = await ChatSession.findById(sessionId);
          if (!session) {
            session = new ChatSession({
              _id: sessionId,
              customerName: customerName || 'Guest',
              messages: [{ sender: 'admin', text: `Welcome ${customerName || 'Guest'}! How can we help you today?` }]
            });
            await session.save();
            emitToRoom(sessionId, 'support_message', session.messages[0]);
            emitGlobally('active_chats_updated');
          }
        } catch (err) {
          logger.error('Error in join_support', err);
        }
      }
      
      // Customer or Admin sends a message
      else if (event === 'send_support_message') {
        const { sessionId, sender, text } = data;
        try {
          const ChatSession = require('./models/ChatSession');
          const session = await ChatSession.findById(sessionId);
          if (session && session.status === 'open') {
            const newMessage = { sender, text };
            session.messages.push(newMessage);
            await session.save();
            
            emitToRoom(sessionId, 'support_message', session.messages[session.messages.length - 1]);
            
            if (sender === 'customer') {
              emitGlobally('active_chats_updated');
            }
          }
        } catch (err) {
          logger.error('Error in send_support_message', err);
        }
      }
      
      // Admin joins a specific chat session room
      else if (event === 'admin_join_support') {
        joinRoom(ws, data);
        logger.debug(`Admin joined chat session ${data}`);
      }

    } catch (err) {
      logger.error('WebSocket message parse error', err);
    }
  });

  ws.on('close', () => {
    logger.info(`🔌 Native WebSocket client disconnected`);
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

// ── Start server
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT}`));
}

// ── Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

module.exports = app;
