// src/services/scheduler.service.js
// Cron scheduler — không cần thêm thư viện, dùng setTimeout thuần
const logger = require('../utils/logger');

class Scheduler {
  constructor() {
    this._jobs = {};
    this._timers = {};
  }

  /**
   * Thêm job chạy theo giờ:phút hàng ngày
   * @param {string} name - Tên job
   * @param {number} hour - Giờ (0-23, theo timezone VN)
   * @param {number} minute - Phút (0-59)
   * @param {function} fn - Hàm async cần chạy
   */
  addDailyJob(name, hour, minute, fn) {
    this._jobs[name] = { hour, minute, fn };
    this._scheduleNext(name);
    logger.info(`⏰ Scheduled job "${name}" at ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} VN daily`);
  }

  _scheduleNext(name) {
    const job = this._jobs[name];
    if (!job) return;

    // Tính ms đến lần chạy tiếp theo (timezone UTC+7)
    const now = new Date();
    const vnOffset = 7 * 60; // UTC+7 in minutes
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const vnMin = (utcMin + vnOffset) % (24 * 60);
    const targetMin = job.hour * 60 + job.minute;

    let diffMin = targetMin - vnMin;
    if (diffMin <= 0) diffMin += 24 * 60; // Qua ngày hôm sau

    const delayMs = diffMin * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();

    if (this._timers[name]) clearTimeout(this._timers[name]);

    this._timers[name] = setTimeout(async () => {
      const jobTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      logger.info(`⏰ Running job "${name}" at ${jobTime}`);
      try {
        await job.fn();
      } catch (e) {
        logger.error(`Job "${name}" failed:`, e.message);
      }
      // Schedule lần tiếp theo
      this._scheduleNext(name);
    }, delayMs);

    const nextRun = new Date(Date.now() + delayMs).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    logger.info(`⏰ Job "${name}" next run: ${nextRun} (in ${Math.round(delayMs/60000)} min)`);
  }

  removeJob(name) {
    if (this._timers[name]) clearTimeout(this._timers[name]);
    delete this._jobs[name];
    delete this._timers[name];
    logger.info(`⏰ Job "${name}" removed`);
  }

  /** Trả về ms còn lại đến lần chạy tiếp theo */
  getNextRunMs(name) {
    if (!this._jobs[name]) return null;
    const job = this._jobs[name];
    const now = new Date();
    const vnOffset = 7 * 60;
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const vnMin = (utcMin + vnOffset) % (24 * 60);
    const targetMin = job.hour * 60 + job.minute;
    let diffMin = targetMin - vnMin;
    if (diffMin <= 0) diffMin += 24 * 60;
    return diffMin * 60 * 1000;
  }

  listJobs() {
    return Object.keys(this._jobs).map(name => ({
      name,
      hour: this._jobs[name].hour,
      minute: this._jobs[name].minute,
    }));
  }
}

module.exports = new Scheduler();
