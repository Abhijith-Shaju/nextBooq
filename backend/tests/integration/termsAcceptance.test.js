const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

// The Terms claim acceptance happens "by clicking I Agree". Until this gate
// existed, nothing required or recorded that -- acceptance was browsewrap in
// practice, which Indian courts treat as materially weaker evidence.
describe('Terms acceptance is required to create an account', () => {
  const credentials = (suffix) => ({
    name: 'Consent User',
    email: `consent-${suffix}-${Date.now()}@test.com`,
    phone: `+1562${String(Date.now()).slice(-6)}${suffix}`,
    password: 'ConsentPass#1',
  });

  describe('POST /auth/register', () => {
    test('records when the user accepted', async () => {
      const creds = credentials('1');
      const before = new Date();

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...creds, accept_terms: true });

      expect(res.status).toBe(201);
      const user = await User.findOne({ email: creds.email });
      expect(user.terms_accepted_at).toBeInstanceOf(Date);
      expect(user.terms_accepted_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    test.each([
      ['the flag is missing', {}],
      ['the flag is false', { accept_terms: false }],
      ['the flag is a truthy string rather than true', { accept_terms: 'yes' }],
    ])('refuses to create an account when %s', async (_label, extra) => {
      const creds = credentials('2');

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...creds, ...extra });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/accept the Terms/i);
      // No half-created account left behind.
      expect(await User.findOne({ email: creds.email })).toBeNull();
    });
  });

  describe('POST /auth/customer-quick-auth', () => {
    test('records acceptance when it creates the account', async () => {
      const creds = credentials('3');

      const res = await request(app)
        .post('/api/v1/auth/customer-quick-auth')
        .send({ ...creds, accept_terms: true });

      expect(res.status).toBe(200);
      const user = await User.findOne({ email: creds.email });
      expect(user.terms_accepted_at).toBeInstanceOf(Date);
    });

    test('is not a way around the gate', async () => {
      // The booking overlay is a second front door onto account creation.
      const creds = credentials('4');

      const res = await request(app)
        .post('/api/v1/auth/customer-quick-auth')
        .send(creds);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/accept the Terms/i);
      expect(await User.findOne({ email: creds.email })).toBeNull();
    });

    test('an existing user signing in is unaffected', async () => {
      // Acceptance is required to *create* an account, not to log back into
      // one -- re-prompting on every sign-in would be noise, and the record
      // already exists.
      const creds = credentials('5');
      await request(app).post('/api/v1/auth/register').send({ ...creds, accept_terms: true });

      const res = await request(app)
        .post('/api/v1/auth/customer-quick-auth')
        .send(creds);

      expect(res.status).toBe(200);
    });
  });
});
