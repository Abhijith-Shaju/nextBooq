const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const sanitizeInput = require('./middleware/sanitizeInput');
const config = require('./config/env');

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

// An allow-list entry containing "*" (e.g. "https://*.nextbooq.in") matches
// any origin sharing that shape — needed because every cafe gets its own
// subdomain (see frontend/src/lib/tenant-domain.ts's ROOT_DOMAIN rewrite),
// so a fixed list can't enumerate every cafe's origin. An entry without "*"
// is matched exactly, same as before.
const isOriginAllowed = (origin) =>
  allowedOrigins.some((pattern) => {
    if (!pattern.includes('*')) return origin === pattern;
    const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+')}$`);
    return regex.test(origin);
  });

// Security and Logging Middlewares
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    // No Origin header means a non-browser client (server-to-server, curl,
    // mobile) — CORS only governs browser cross-origin requests, so allow it.
    if (!origin || isOriginAllowed(origin)) {
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

// Healthcheck Route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// TEMPORARY: Debug endpoint to diagnose Vercel proxy requests.
// Remove after confirming the issue is resolved.
app.all('/debug-echo', (req, res) => {
  res.status(200).json({
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    baseUrl: req.baseUrl,
    hostname: req.hostname,
    headers: req.headers,
    ip: req.ip,
  });
});

// API Routes
app.use('/api', routes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
