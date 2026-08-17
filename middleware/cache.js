const { createClient } = require('redis');

let redisClient;
let isRedisConnected = false;

if (process.env.REDIS_URI) {
  redisClient = createClient({ url: process.env.REDIS_URI });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error', err);
    isRedisConnected = false;
  });

  redisClient.on('connect', () => {
    console.log('☘️ Connected to Redis');
    isRedisConnected = true;
  });

  redisClient.connect().catch(console.error);
}

/**
 * Cache middleware generator
 * @param {number} duration - Time to live in seconds
 */
const cache = (duration = 300) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    if (!isRedisConnected || !redisClient) {
      // Fallback: Skip caching if Redis is not configured/connected
      return next();
    }

    const key = `cache:${req.originalUrl || req.url}`;

    try {
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      // Override res.json to store the response before sending it
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Store in cache if response is successful
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisClient.setEx(key, duration, JSON.stringify(body)).catch(console.error);
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error('Redis Cache Middleware Error:', err);
      next(); // Continue even if cache fails
    }
  };
};

module.exports = cache;
