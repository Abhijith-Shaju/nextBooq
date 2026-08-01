const app = require('./src/app');
const config = require('./src/config/env');
const { connectDB } = require('./src/config/database');

const startServer = async () => {
  await connectDB();

  const server = app.listen(config.PORT, () => {
    console.log(`🚀 nextBooq API Server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
  });

  const handleShutdown = (signal) => {
    console.log(`\nRECEIVED ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
};

startServer();
