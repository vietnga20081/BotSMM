const { redis } = require('../configs/redis');

const STATE_TTL = 30 * 60; // 30 phút
const PREFIX = 'bot:state:';

/**
 * Quản lý trạng thái hội thoại của từng user trong Redis
 * state = { step, platform, category, serviceId, link, quantity, ... }
 */
class BotStateManager {
  _key(chatId) {
    return `${PREFIX}${chatId}`;
  }

  async get(chatId) {
    const raw = await redis.get(this._key(chatId));
    return raw ? JSON.parse(raw) : {};
  }

  async set(chatId, state) {
    await redis.setex(this._key(chatId), STATE_TTL, JSON.stringify(state));
  }

  async update(chatId, patch) {
    const current = await this.get(chatId);
    await this.set(chatId, { ...current, ...patch });
  }

  async clear(chatId) {
    await redis.del(this._key(chatId));
  }
}

module.exports = new BotStateManager();
