const http = require('http');
const app = require('./src/app');
const config = require('./src/config/env');
const { connectDB } = require('./src/config/database');
const { initSocket } = require('./src/services/socketService');
const { expireStalePendingPayments, expireStaleHolds } = require('./src/services/reservationExpiryService');
const { expireLapsedSubscriptions } = require('./src/services/subscriptionExpiryService');

const RESERVATION_EXPIRY_SWEEP_INTERVAL_MS = 60 * 1000;
const SUBSCRIPTION_EXPIRY_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

const startServer = async () => {
  await connectDB();

  const server = http.createServer(app);
  initSocket(server);

  server.listen(config.PORT, () => {
    console.log(`🚀 nextBooq API Server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
  });

  const sweepInterval = setInterval(() => {
    expireStalePendingPayments().catch((error) => {
      console.error('[PENDING_PAYMENT SWEEP FAILED]', error);
    });
    expireStaleHolds().catch((error) => {
      console.error('[HOLD SWEEP FAILED]', error);
    });
  }, RESERVATION_EXPIRY_SWEEP_INTERVAL_MS);

  const subscriptionSweepInterval = setInterval(() => {
    expireLapsedSubscriptions().catch((error) => {
      console.error('[SUBSCRIPTION EXPIRY SWEEP FAILED]', error);
    });
  }, SUBSCRIPTION_EXPIRY_SWEEP_INTERVAL_MS);

  const handleShutdown = (signal) => {
    console.log(`\nRECEIVED ${signal}. Shutting down gracefully...`);
    clearInterval(sweepInterval);
    clearInterval(subscriptionSweepInterval);
    server.close(() => {
      console.log('HTTP Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
};

startServer();

