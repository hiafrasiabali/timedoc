module.exports = {
  apps: [
    {
      name: 'timedoc-api',
      cwd: './server',
      script: 'index.js',
      env: {
        PORT: 3001,
        NODE_ENV: 'production',
      },
    },
    {
      name: 'timedoc-web',
      cwd: './web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
