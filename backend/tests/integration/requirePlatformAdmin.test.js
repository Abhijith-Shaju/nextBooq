const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');
const { authenticate } = require('../../src/middleware/auth');
const { requirePlatformAdmin } = require('../../src/middleware/requirePlatformAdmin');
const errorHandler = require('../../src/middleware/errorHandler');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

const buildTestApp = () => {
  const app = express();
  app.get('/protected', authenticate, requirePlatformAdmin, (req, res) => {
    res.status(200).json({ status: 'success', data: 'ok' });
  });
  app.use(errorHandler);
  return app;
};

describe('requirePlatformAdmin middleware', () => {
  test('rejects a non-admin authenticated user with 403', async () => {
    const user = await User.create({
      name: 'Regular',
      email: 'regular-mw@test.com',
      phone: '+1555991001',
      password_hash: 'pass',
    });
    const token = jwt.sign({ id: user._id.toString() }, config.JWT_SECRET);

    const res = await request(buildTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('allows a platform admin through to the route', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin-mw@test.com',
      phone: '+1555991002',
      password_hash: 'pass',
      is_platform_admin: true,
    });
    const token = jwt.sign({ id: admin._id.toString() }, config.JWT_SECRET);

    const res = await request(buildTestApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBe('ok');
  });

  test('rejects an unauthenticated request with 401 before even reaching the admin check', async () => {
    const res = await request(buildTestApp()).get('/protected');
    expect(res.status).toBe(401);
  });
});
