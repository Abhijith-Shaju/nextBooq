const request = require('supertest');
const app = require('../../src/app');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: Auth Endpoint Rate Limiting', () => {
  test('blocks the 21st login attempt from the same client within the rate-limit window', async () => {
    const credentials = { email: 'nobody@example.com', password: 'wrong-password' };

    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/api/v1/auth/login').send(credentials);
      expect(res.status).not.toBe(429);
    }

    const blockedRes = await request(app).post('/api/v1/auth/login').send(credentials);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.message).toMatch(/too many/i);
  }, 20000);
});
