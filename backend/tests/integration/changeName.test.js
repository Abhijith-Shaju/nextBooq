const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

// The Privacy Policy tells a Data Principal they can correct their own name,
// and the DPDP Act gives them the right to. Before this endpoint existed the
// policy said so and the product did not support it.
describe('PATCH /auth/name', () => {
  let user;
  let token;

  const patchName = (body, authToken = token) =>
    request(app)
      .patch('/api/v1/auth/name')
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);

  beforeEach(async () => {
    user = await User.create({
      name: 'Original Name',
      email: `rename-${Date.now()}@test.com`,
      phone: `+1560${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });
    token = jwt.sign({ id: user._id, tv: 0 }, config.JWT_SECRET, { expiresIn: '1h' });
  });

  test('corrects the name', async () => {
    const res = await patchName({ name: 'Corrected Name' });

    expect(res.status).toBe(200);
    expect((await User.findById(user._id)).name).toBe('Corrected Name');
  });

  test('trims surrounding whitespace', async () => {
    await patchName({ name: '   Padded Name   ' });
    expect((await User.findById(user._id)).name).toBe('Padded Name');
  });

  test.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a non-string', 42],
    ['an injected operator', { $ne: null }],
    ['an over-long name', 'x'.repeat(121)],
  ])('rejects %s', async (_label, name) => {
    const res = await patchName({ name });
    expect(res.status).toBe(400);
    expect((await User.findById(user._id)).name).toBe('Original Name');
  });

  test('requires authentication', async () => {
    const res = await request(app).patch('/api/v1/auth/name').send({ name: 'Nobody' });
    expect(res.status).toBe(401);
  });

  test('cannot rename another user', async () => {
    // The endpoint takes no user id -- it always acts on the caller -- so the
    // only thing to prove is that a second account is untouched.
    const other = await User.create({
      name: 'Other Person',
      email: `other-rename-${Date.now()}@test.com`,
      phone: `+1561${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });

    await patchName({ name: 'Hijacked' });

    expect((await User.findById(other._id)).name).toBe('Other Person');
  });
});
