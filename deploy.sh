#!/bin/bash
# ─── BotSMM Deploy Script ───────────────────────────────────
# Usage: bash deploy.sh
# Run as the user that owns /www/wwwroot/botsmm.v3vn.eu

set -e
APP_DIR="/www/wwwroot/botsmm.v3vn.eu"

echo "📦 Installing npm dependencies..."
cd "$APP_DIR"
npm install --production

echo "🗃️  Running DB migration..."
node src/configs/migrate.js || true

echo "🚀 Starting/Reloading with PM2..."
if pm2 list | grep -q "smm-bot"; then
  pm2 reload ecosystem.config.js --env production
else
  pm2 start ecosystem.config.js --env production
fi

pm2 save
echo "✅ Deploy complete! Check: pm2 logs smm-bot"
