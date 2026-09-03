const express = require('express');
const request = require('supertest');
const {
  availabilityRateLimiter,
  bookingCreationRateLimiter,
  bookingCreationIpRateLimiter,
  paymentsSettingsRateLimiter,
} = require('../../src/middleware/rateLimiter');
const publicRoutes = require('../../src/routes/v1/publicRoutes');
const protectedRoutes = require('../../src/routes/v1/protectedRoutes');
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

// Mirrors the real route shape for the per-user booking limiter: the limiter
// runs after something has populated req.user, and the handler's status code
// decides whether the attempt counts against quota.
const buildUserScopedApp = (limiter) => {
  const app = express();
  app.get('/probe', (req, res, next) => {
    if (req.headers['x-test-user']) req.user = { _id: req.headers['x-test-user'] };
    next();
  }, limiter, (req, res) => {
    const status = req.headers['x-test-fail'] ? 400 : 200;
    res.status(status).json({ ok: status === 200 });
  });
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

  test('bookingCreationRateLimiter buckets per authenticated user, not per IP', async () => {
    const app = buildUserScopedApp(bookingCreationRateLimiter);

    // Exhaust one diner's whole hourly allowance.
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/probe').set('x-test-user', 'diner-a');
      expect(res.status).toBe(200);
    }
    expect((await request(app).get('/probe').set('x-test-user', 'diner-a')).status).toBe(429);

    // A different diner on the same IP must be unaffected — this is the whole
    // point of the change, since CGNAT puts unrelated diners behind one address.
    const other = await request(app).get('/probe').set('x-test-user', 'diner-b');
    expect(other.status).toBe(200);
  });

  test('bookingCreationRateLimiter does not spend quota on rejected attempts', async () => {
    const app = buildUserScopedApp(bookingCreationRateLimiter);

    // 20 failed attempts (bad party size, past date, ...) create no holds.
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .get('/probe')
        .set('x-test-user', 'diner-c')
        .set('x-test-fail', '1');
      expect(res.status).toBe(400);
    }

    // The full allowance is still intact afterwards.
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/probe').set('x-test-user', 'diner-c');
      expect(res.status).toBe(200);
    }
    expect((await request(app).get('/probe').set('x-test-user', 'diner-c')).status).toBe(429);
  });

  test('paymentsSettingsRateLimiter bounds step-up OTP guesses, counting failures', async () => {
    const app = buildUserScopedApp(paymentsSettingsRateLimiter);

    // Every attempt here is a wrong OTP, so all ten are 4xx. Unlike the
    // booking limiter these MUST still count -- bounding failed guesses is
    // the entire purpose, since a wrong step-up code neither consumes the
    // code nor records an attempt anywhere else.
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .get('/probe')
        .set('x-test-user', 'owner-a')
        .set('x-test-fail', '1');
      expect(res.status).toBe(400);
    }

    const blocked = await request(app).get('/probe').set('x-test-user', 'owner-a');
    expect(blocked.status).toBe(429);

    // A different owner is unaffected.
    expect((await request(app).get('/probe').set('x-test-user', 'owner-b')).status).toBe(200);
  });

  test('bookingCreationIpRateLimiter bounds unauthenticated floods more loosely', async () => {
    const app = buildTestApp(bookingCreationIpRateLimiter);

    for (let i = 0; i < 120; i++) {
      expect((await request(app).get('/probe')).status).not.toBe(429);
    }
    expect((await request(app).get('/probe')).status).toBe(429);
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

  test('protectedRoutes attaches a limiter to the payment-credentials route', () => {
    // This was the one write route in the app with no limiter at all, and it
    // is the route that consumes the step-up OTP guarding payout redirection.
    const paymentsRoute = protectedRoutes.stack.find(
      (layer) => layer.route?.path === '/cafes/:cafeId/payments' && layer.route?.methods?.put
    );
    expect(paymentsRoute).toBeDefined();

    const names = paymentsRoute.route.stack.map((l) => l.name);
    expect(names).toContain(process.env.NODE_ENV === 'test' ? 'noop' : 'rateLimit');
  });

  test('the per-user booking limiter is positioned after authenticate', () => {
    // bookingCreationRateLimiter keys on req.user, so if it is ever moved back
    // ahead of authenticate it silently degrades to keying on the IP again --
    // the exact bug this ordering fixes, and one that no functional test would
    // notice because the limiter still "works", just on the wrong bucket.
    // Both limiters swap to `noop` under NODE_ENV=test, so assert on the two
    // limiter slots straddling authenticate rather than on their names.
    const bookingRoute = publicRoutes.stack.find(
      (layer) => layer.route?.path === '/cafes/:cafeId/reservations' && layer.route?.methods?.post
    );
    const names = bookingRoute.route.stack.map((l) => l.name);

    const authIndex = names.indexOf('authenticate');
    expect(authIndex).toBeGreaterThan(-1);

    const limiterName = process.env.NODE_ENV === 'test' ? 'noop' : 'rateLimit';
    const limiterIndexes = names.reduce(
      (acc, name, i) => (name === limiterName ? [...acc, i] : acc),
      []
    );

    expect(limiterIndexes).toHaveLength(2);
    expect(limiterIndexes[0]).toBeLessThan(authIndex);   // outer IP bound
    expect(limiterIndexes[1]).toBeGreaterThan(authIndex); // per-user bound
  });
});
