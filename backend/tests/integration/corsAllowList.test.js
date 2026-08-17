const request = require('supertest');
const app = require('../../src/app');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: CORS allow-list', () => {
  test('reflects an explicitly allowed origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('does not reflect an arbitrary, unlisted origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil-attacker.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('allows requests with no Origin header (server-to-server/curl)', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });

  test('reflects a cafe subdomain origin matching a wildcard allow-list entry', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://vtcafe.localhost:3000');

    expect(res.headers['access-control-allow-origin']).toBe('http://vtcafe.localhost:3000');
  });

  test('does not let a wildcard entry match a nested or nonmatching origin', async () => {
    const nested = await request(app).get('/health').set('Origin', 'http://foo.vtcafe.localhost:3000');
    expect(nested.headers['access-control-allow-origin']).toBeUndefined();

    const wrongPort = await request(app).get('/health').set('Origin', 'http://vtcafe.localhost:9999');
    expect(wrongPort.headers['access-control-allow-origin']).toBeUndefined();

    const wrongScheme = await request(app).get('/health').set('Origin', 'https://vtcafe.localhost:3000');
    expect(wrongScheme.headers['access-control-allow-origin']).toBeUndefined();
  });
});
