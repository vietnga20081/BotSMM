/**
 * BotRegistry — Singleton giữ bot instance
 *
 * Vì worker (BullMQ) và bot (Telegram) khởi động riêng,
 * dùng registry này để inject bot một lần ở server.js
 * và lấy ra ở bất kỳ đâu (worker, service, controller...).
 */
class BotRegistry {
  constructor() {
    this._bot = null;
  }

  /** Gọi một lần duy nhất trong server.js sau khi createBot() */
  register(bot) {
    this._bot = bot;
  }

  /** Lấy bot instance — trả null nếu chưa register */
  get() {
    return this._bot;
  }

  /** Kiểm tra đã sẵn sàng chưa */
  isReady() {
    return this._bot !== null;
  }
}

module.exports = new BotRegistry();
