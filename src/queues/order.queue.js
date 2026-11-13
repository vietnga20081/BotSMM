const { Queue } = require('bullmq');
const { redisConfig } = require('../configs/redis');

const orderQueue = new Queue('order-status', {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

module.exports = { orderQueue };
