module.exports = {
  apps: [
    {
      name: 'telegram-bot',
      script: 'index.js',
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/telegram-bot-error.log',
      out_file: 'logs/telegram-bot-out.log',
      time: true,
    },
    {
      name: 'telegram-web',
      script: 'web.js',
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/telegram-web-error.log',
      out_file: 'logs/telegram-web-out.log',
      time: true,
    },
  ],
}; 