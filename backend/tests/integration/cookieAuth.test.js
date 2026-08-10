const request = require('supertest');
const app = require('../../src/app');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('Integration Test: httpOnly session cookie authentication', () => {
  const credentials = {
    name: 'Cookie User',
    email: 'cookie-user@test.com',
    phone: '+1112228888',
    password: 'password123',
  };

  const extractCookie = (res) => {
    const setCookieHeaders = res.headers['set-cookie'] || [];
    return setCookieHeaders.find((c) => c.startsWith('accessToken='));
  };

  test('login sets an httpOnly, path=/ session cookie', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password });

    const cookie = extractCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  test('a request authenticates via the session cookie alone (no Authorization header)', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials);
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password });

    const cookie = extractCookie(loginRes);

    const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe(credentials.email);
  });

  test('logout clears the session cookie', async () => {
    const res = await request(app).post('/api/v1/auth/logout');

    const cookie = extractCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/accessToken=;/);
  });

  test('GET /auth/socket-token issues a fresh token to a cookie-authenticated user', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials);
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    const cookie = extractCookie(loginRes);

    const res = await request(app).get('/api/v1/auth/socket-token').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token.split('.').length).toBe(3);
  });

  test('GET /auth/socket-token rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/auth/socket-token');

    expect(res.status).toBe(401);
  });
});
