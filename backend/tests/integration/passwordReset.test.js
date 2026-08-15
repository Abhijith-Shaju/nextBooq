const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');
const { hashResetToken } = require('../../src/utils/passwordReset');

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendPasswordResetEmail } = require('../../src/services/emailService');

setupTestDB();

describe('Password reset flow', () => {
  beforeEach(() => {
    sendPasswordResetEmail.mockClear();
  });

  test('forgot-password stores a hashed token and calls the email service for an existing account', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Me',
      email: 'reset-flow@example.com',
      phone: '+15550300001',
      password_hash,
    });

    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'reset-flow@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0][0].to).toBe('reset-flow@example.com');

    const updated = await User.findById(user._id);
    expect(updated.password_reset_token_hash).toBeTruthy();
    expect(updated.password_reset_expires_at).toBeTruthy();
    expect(updated.password_reset_expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('forgot-password returns the same generic response for a non-existent email and does not call the email service', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'no-such-account@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  test('forgot-password rejects a missing email with 400', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  test('reset-password with a valid token changes the password and the old password no longer works', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Valid',
      email: 'reset-valid@example.com',
      phone: '+15550300002',
      password_hash,
    });

    const rawToken = 'a'.repeat(64);
    await User.findByIdAndUpdate(user._id, {
      password_reset_token_hash: hashResetToken(rawToken),
      password_reset_expires_at: new Date(Date.now() + 30 * 60 * 1000),
    });

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'BrandNewPassword1!' });

    expect(resetRes.status).toBe(200);

    const loginOld = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset-valid@example.com', password: 'OriginalPassword1!' });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset-valid@example.com', password: 'BrandNewPassword1!' });
    expect(loginNew.status).toBe(200);
  });

  test('reset-password rejects an expired token with 400', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Expired',
      email: 'reset-expired@example.com',
      phone: '+15550300003',
      password_hash,
    });

    const rawToken = 'b'.repeat(64);
    await User.findByIdAndUpdate(user._id, {
      password_reset_token_hash: hashResetToken(rawToken),
      password_reset_expires_at: new Date(Date.now() - 60 * 1000),
    });

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'BrandNewPassword1!' });

    expect(res.status).toBe(400);
  });

  test('reset-password rejects reusing an already-used token', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Reuse',
      email: 'reset-reuse@example.com',
      phone: '+15550300004',
      password_hash,
    });

    const rawToken = 'c'.repeat(64);
    await User.findByIdAndUpdate(user._id, {
      password_reset_token_hash: hashResetToken(rawToken),
      password_reset_expires_at: new Date(Date.now() + 30 * 60 * 1000),
    });

    const first = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'BrandNewPassword1!' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'AnotherPassword1!' });
    expect(second.status).toBe(400);
  });

  test('reset-password rejects a malformed/unknown token with 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'not-a-real-token', password: 'BrandNewPassword1!' });
    expect(res.status).toBe(400);
  });

  test('reset-password rejects a weak password with 400', async () => {
    const password_hash = await bcrypt.hash('OriginalPassword1!', 10);
    const user = await User.create({
      name: 'Reset Weak',
      email: 'reset-weak@example.com',
      phone: '+15550300005',
      password_hash,
    });

    const rawToken = 'd'.repeat(64);
    await User.findByIdAndUpdate(user._id, {
      password_reset_token_hash: hashResetToken(rawToken),
      password_reset_expires_at: new Date(Date.now() + 30 * 60 * 1000),
    });

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'short' });

    expect(res.status).toBe(400);
  });
});
