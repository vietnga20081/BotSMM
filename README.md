# BotSMM v3 — Telegram SMM Panel Bot

## Yêu cầu hệ thống
- Node.js >= 18
- MySQL 8+
- Redis 6+
- PM2 (`npm install -g pm2`)
- Nginx (reverse proxy)

## Cài đặt lần đầu

```bash
# 1. Copy files vào server
cp -r . /www/wwwroot/botsmm.v3vn.eu/
cd /www/wwwroot/botsmm.v3vn.eu

# 2. Tạo file .env
cp .env.example .env
nano .env   # Điền đầy đủ thông tin

# 3. Cài dependencies
npm install --production

# 4. Import database
mysql -u root -p smm_bot < sql_botsmm_v3vn_eu.sql
# Hoặc chạy migrate:
node src/configs/migrate.js

# 5. Start với PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # Chạy lệnh nó in ra để auto-start khi reboot

# 6. Kiểm tra
pm2 logs smm-bot
```

## Deploy / Update

```bash
cd /www/wwwroot/botsmm.v3vn.eu
bash deploy.sh
```

## PM2 commands hay dùng

```bash
pm2 status              # Xem trạng thái
pm2 logs smm-bot        # Xem logs realtime
pm2 restart smm-bot     # Restart
pm2 reload smm-bot      # Zero-downtime reload
pm2 stop smm-bot        # Dừng
```

## Admin Panel
Truy cập: `https://botsmm.v3vn.eu/admin.html`

Đăng nhập với `ADMIN_USERNAME` / `ADMIN_PASSWORD` từ file `.env`

## Nginx config
Xem file `nginx.conf.example` trong thư mục gốc.

## Cấu trúc thư mục
```
src/
  app.js          — Express app setup
  server.js       — Entry point (DB + Bot + Server)
  routes/         — API routes
  controllers/    — Business logic
  models/         — Sequelize models
  middlewares/    — Auth middleware
  services/       — Service layer
  bot/            — Telegram bot handlers
  queues/         — BullMQ order queue
  configs/        — DB, Redis, migrate
  utils/          — Logger, helpers
admin.html        — Admin panel (SPA)
ecosystem.config.js — PM2 config
deploy.sh         — Deploy script
```
# BotSMM
# BotSMM
