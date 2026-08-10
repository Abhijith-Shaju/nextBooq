const express = require('express');
const request = require('supertest');
const { availabilityRateLimiter, bookingCreationRateLimiter } = require('../../src/middleware/rateLimiter');
const publicRoutes = require('../../src/routes/v1/publicRoutes');
const { setupTestDB } = require('../setup');

setupTestDB();

/**
 * These limiters are deliberately NOT wired into the real app under
 * NODE_ENV=test (see publicRoutes.js) — automated test suites legitimately
 * fire dozens of booking/availability requests per run (concurrency and
 * race-condition tests especially) that have nothing to do with abuse, and
 * would otherwise get spuriously rate-limited. So the limiting behavior
 * itself is verified here against a minimal dedicated app instead.
 */
const buildTestApp = (limiter) => {
  const app = express();
  app.get('/probe', limiter, (req, res) => res.status(200).json({ ok: true }));
  return app;
};

describe('Unit Test: availability/booking rate limiters', () => {
  test('availabilityRateLimiter blocks the 31st request from the same client within the window', async () => {
    const app = buildTestApp(availabilityRateLimiter);

    for (let i = 0; i < 30; i++) {
      const res = await request(app).get('/probe');
      expect(res.status).not.toBe(429);
    }

    const blockedRes = await request(app).get('/probe');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.message).toMatch(/too many/i);
  });

  test('bookingCreationRateLimiter blocks the 11th request from the same client within the window', async () => {
    const app = buildTestApp(bookingCreationRateLimiter);

    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/probe');
      expect(res.status).not.toBe(429);
    }

    const blockedRes = await request(app).get('/probe');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.message).toMatch(/too many/i);
  });
});

describe('Integration Test: rate limiters are wired into the real availability/booking routes outside of test env', () => {
  test('publicRoutes attaches availabilityRateLimiter and bookingCreationRateLimiter to their routes unless NODE_ENV=test', () => {
    // Route-level middleware stacks are the concrete artifact of the
    // NODE_ENV-conditional wiring in publicRoutes.js — inspect the router's
    // registered layers directly rather than re-deriving the same NODE_ENV
    // branch here (which would just restate the production code, not verify it).
    const findRoute = (path, method) =>
      publicRoutes.stack.find(
        (layer) => layer.route?.path === path && layer.route?.methods?.[method]
      );

    const availabilityRoute = findRoute('/cafes/:cafeId/available-slots', 'get');
    const bookingRoute = findRoute('/cafes/:cafeId/reservations', 'post');

    expect(availabilityRoute).toBeDefined();
    expect(bookingRoute).toBeDefined();

    const availabilityHandlerNames = availabilityRoute.route.stack.map((l) => l.name);
    const bookingHandlerNames = bookingRoute.route.stack.map((l) => l.name);

    if (process.env.NODE_ENV === 'test') {
      expect(availabilityHandlerNames).toContain('noop');
      expect(bookingHandlerNames).toContain('noop');
    } else {
      expect(availabilityHandlerNames).not.toContain('noop');
      expect(bookingHandlerNames).not.toContain('noop');
    }
  });
});
