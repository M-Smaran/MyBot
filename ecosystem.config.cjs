module.exports = {
  apps: [
    {
      name: 'mybot',
      script: 'node',
      args: '--import tsx/esm src/index.ts',
      cwd: './',
      env_production: {
        NODE_ENV: 'production',
      },
      // Restart on crash, max memory 512MB
      max_memory_restart: '512M',
      // Keep logs
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
