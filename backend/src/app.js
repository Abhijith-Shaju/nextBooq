const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const sanitizeInput = require('./middleware/sanitizeInput');
const config = require('./config/env');
const { getAuditLogHealth } = require('./services/auditService');

const app = express();

// See config/env.js for why this must match real deploy topology rather than
// defaulting to trusting everything.
const trustProxySetting = /^\d+$/.test(config.TRUST_PROXY)
  ? parseInt(config.TRUST_PROXY, 10)
  : config.TRUST_PROXY;
app.set('trust proxy', trustProxySetting);

const allowedOrigins = config.CORS_ALLOWED_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Security and Logging Middlewares
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    // No Origin header means a non-browser client (server-to-server, curl,
    // mobile) — CORS only governs browser cross-origin requests, so allow it.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(
  express.json({
    verify: (req, res, buf) => {
      // Razorpay signs the exact bytes it sends; keep them around so the
      // webhook handler can verify against the real payload instead of a
      // re-serialized (and potentially byte-different) req.body.
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sanitizeInput);

// Healthcheck Route. Always 200 for basic liveness -- audit logging is
// deliberately off the request critical path (see auditService.js), so a
// failing audit write must never make the load balancer kill an otherwise
// healthy instance. checks.auditLog is here purely so a monitor that reads
// the body (not just the status code) can alert on a persistently failing
// audit trail, which used to be visible only in logs no one was tailing (L-11).
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      auditLog: getAuditLogHealth(),
    },
  });
});

// API Routes
app.use('/api', routes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
