const request = require('supertest');
const jwt = require('jsonwebtoken');
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
    return setCookieHeaders.find((c) => c.startsWith('nb_session='));
  };

  test('login sets an httpOnly, path=/ session cookie', async () => {
    await request(app).post('/api/v1/auth/register').send({ ...credentials, accept_terms: true });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password });

    const cookie = extractCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  test('a request authenticates via the session cookie alone (no Authorization header)', async () => {
    await request(app).post('/api/v1/auth/register').send({ ...credentials, accept_terms: true });
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
    expect(cookie).toMatch(/nb_session=;/);
  });

  test('GET /auth/socket-token issues a fresh token to a cookie-authenticated user', async () => {
    await request(app).post('/api/v1/auth/register').send({ ...credentials, accept_terms: true });
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

  // H-04: the socket token used to be a full 7-day session token, minted by
  // the same function as login/register. It must now be short-lived and
  // carry a distinct audience claim rather than being indistinguishable
  // from a real session token.
  test('GET /auth/socket-token issues a short-lived, socket-audience token, not a 7-day session token', async () => {
    await request(app).post('/api/v1/auth/register').send({ ...credentials, accept_terms: true });
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    const cookie = extractCookie(loginRes);

    const res = await request(app).get('/api/v1/auth/socket-token').set('Cookie', cookie);
    const decoded = jwt.decode(res.body.data.token);

    expect(decoded.aud).toBe('socket');
    const ttlSeconds = decoded.exp - decoded.iat;
    expect(ttlSeconds).toBeLessThanOrEqual(120);
  });

  test('a socket token cannot be used to authenticate a REST request', async () => {
    await request(app).post('/api/v1/auth/register').send({ ...credentials, accept_terms: true });
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    const cookie = extractCookie(loginRes);

    const socketTokenRes = await request(app).get('/api/v1/auth/socket-token').set('Cookie', cookie);
    const socketToken = socketTokenRes.body.data.token;

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${socketToken}`);

    expect(res.status).toBe(401);
  });
});

describe('session cookie attributes and scope', () => {
  const creds = {
    name: 'Scope User',
    email: 'scope-user@test.com',
    phone: '+1112229999',
    password: 'password123',
  };

  const login = async () => {
    await request(app).post('/api/v1/auth/register').send({ ...creds, accept_terms: true });
    return request(app).post('/api/v1/auth/login').send({ email: creds.email, password: creds.password });
  };

  const sessionCookie = (res) =>
    (res.headers['set-cookie'] || []).find((c) => c.startsWith('nb_session='));

  test('the session cookie is named nb_session, not accessToken', async () => {
    const res = await login();
    const all = res.headers['set-cookie'] || [];

    expect(all.some((c) => c.startsWith('nb_session='))).toBe(true);
    expect(all.some((c) => c.startsWith('accessToken='))).toBe(false);
  });

  test('the session cookie carries httpOnly, SameSite=Lax and Path=/', async () => {
    const cookie = sessionCookie(await login());

    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  test('an accessToken cookie is no longer accepted for authentication', async () => {
    const loginRes = await login();
    const raw = sessionCookie(loginRes).split(';')[0].split('=')[1];

    const res = await request(app).get('/api/v1/auth/me').set('Cookie', `accessToken=${raw}`);

    expect(res.status).toBe(401);
  });

  test('the same token still authenticates as an Authorization bearer header', async () => {
    const loginRes = await login();
    const raw = sessionCookie(loginRes).split(';')[0].split('=')[1];

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${raw}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(creds.email);
  });

  test('with COOKIE_DOMAIN unset the cookie is host-only (no Domain attribute)', async () => {
    // The test environment leaves COOKIE_DOMAIN unset — this is the guard
    // that local development keeps working, where a .nextbooq.in cookie
    // would never be stored by a browser on localhost.
    const cookie = sessionCookie(await login());

    expect(cookie).not.toMatch(/Domain=/i);
  });

  test('logout clears the cookie with the same attributes it was set with', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    const cookie = sessionCookie(res);

    // A clearCookie whose attributes differ from the original is a silent
    // no-op in the browser, so logout would appear to succeed and not work.
    expect(cookie).toMatch(/nb_session=;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });
});
