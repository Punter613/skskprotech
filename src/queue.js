const Queue = require('bull');

// 🔌 Snag the production Redis connection wire from Render
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Initialize the shared Bull queue connection handler
const aiQueue = new Queue('ai-jobs', redisUrl, {
  redis: {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  }
});

console.log('⚡ Bull Queue manager initialized and linked via Redis.');

module.exports = aiQueue;
