const http = require('http');
const app = require('./src/app');
const config = require('./src/config/env');
const { connectDB } = require('./src/config/database');
const { initSocket } = require('./src/services/socketService');
const { expireStalePendingPayments, expireStaleHolds } = require('./src/services/reservationExpiryService');
const { expireLapsedSubscriptions } = require('./src/services/subscriptionExpiryService');
const { acquireSweepLock } = require('./src/utils/sweepLock');

const RESERVATION_EXPIRY_SWEEP_INTERVAL_MS = 60 * 1000;
const SUBSCRIPTION_EXPIRY_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

// Shorter than each sweep's own interval, so a process that dies mid-sweep
// leaves its lock to expire before the next scheduled tick would need it,
// rather than stalling the sweep on every instance until manual cleanup.
const RESERVATION_SWEEP_LOCK_TTL_MS = 55 * 1000;
const SUBSCRIPTION_SWEEP_LOCK_TTL_MS = 55 * 60 * 1000;

const startServer = async () => {
  await connectDB();

  const server = http.createServer(app);
  initSocket(server);

  server.listen(config.PORT, () => {
    console.log(`🚀 nextBooq API Server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
  });

  // Guarded by acquireSweepLock so that running more than one API instance
  // doesn't multiply this sweep's writes and OCC conflicts -- only whichever
  // instance wins the lock on a given tick actually runs it (M-08).
  const sweepInterval = setInterval(async () => {
    if (!(await acquireSweepLock('reservation-expiry', RESERVATION_SWEEP_LOCK_TTL_MS))) return;
    expireStalePendingPayments().catch((error) => {
      console.error('[PENDING_PAYMENT SWEEP FAILED]', error);
    });
    expireStaleHolds().catch((error) => {
      console.error('[HOLD SWEEP FAILED]', error);
    });
  }, RESERVATION_EXPIRY_SWEEP_INTERVAL_MS);

  const subscriptionSweepInterval = setInterval(async () => {
    if (!(await acquireSweepLock('subscription-expiry', SUBSCRIPTION_SWEEP_LOCK_TTL_MS))) return;
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

