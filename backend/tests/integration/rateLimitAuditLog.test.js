const request = require('supertest');
const app = require('../../src/app');
const AuditLog = require('../../src/models/AuditLog');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: Rate Limit Block Audit Logging', () => {
  test('logs a RATE_LIMIT_BLOCKED audit event when a client exceeds the auth rate limit', async () => {
    const credentials = { email: 'nobody@example.com', password: 'wrong-password' };

    for (let i = 0; i < 20; i++) {
      await request(app).post('/api/v1/auth/login').send(credentials);
    }

    const blockedRes = await request(app).post('/api/v1/auth/login').send(credentials);
    expect(blockedRes.status).toBe(429);

    const log = await AuditLog.findOne({ action: 'RATE_LIMIT_BLOCKED' });
    expect(log).not.toBeNull();
    expect(log.entity_id).toBeNull();
    expect(log.after_state.path).toEqual('/api/v1/auth/login');
    expect(log.after_state.ip).toBeDefined();

    // Additional requests past the limit must not produce additional audit log writes.
    await request(app).post('/api/v1/auth/login').send(credentials);
    await request(app).post('/api/v1/auth/login').send(credentials);

    const count = await AuditLog.countDocuments({ action: 'RATE_LIMIT_BLOCKED' });
    expect(count).toBe(1);
  }, 20000);
});
