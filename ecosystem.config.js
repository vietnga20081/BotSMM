module.exports = {
  apps: [
    {
      name: 'smm-bot',
      script: 'src/server.js',
      cwd: '/www/wwwroot/botsmm.v3vn.eu',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3721,
      },
      error_file: '/www/wwwlogs/smm-bot-error.log',
      out_file: '/www/wwwlogs/smm-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      exp_backoff_restart_delay: 100,
    },
  ],
};
