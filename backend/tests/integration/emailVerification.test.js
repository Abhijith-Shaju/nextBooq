const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendVerificationEmail } = require('../../src/services/emailService');

setupTestDB();

describe('Email verification', () => {
  beforeEach(() => {
    sendVerificationEmail.mockClear();
  });

  test('registration stores a hashed verification code and calls the email service', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Verify Me',
      email: 'verify-flow@example.com',
      phone: '+15550400001',
      password: 'RegisterPassword1!',
    });

    expect(res.status).toBe(201);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail.mock.calls[0][0].to).toBe('verify-flow@example.com');

    const user = await User.findOne({ email: 'verify-flow@example.com' });
    expect(user.is_email_verified).toBe(false);
    expect(user.email_verification_code_hash).toBeTruthy();
    expect(user.email_verification_expires_at).toBeTruthy();
    expect(user.email_verification_expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  test('registration succeeds even when the email service rejects', async () => {
    sendVerificationEmail.mockRejectedValueOnce(new Error('provider down'));

    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Verify Fails',
      email: 'verify-fails@example.com',
      phone: '+15550400002',
      password: 'RegisterPassword1!',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('verify-fails@example.com');
  });

  test('registration response includes is_email_verified: false', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Verify Payload',
      email: 'verify-payload@example.com',
      phone: '+15550400003',
      password: 'RegisterPassword1!',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.is_email_verified).toBe(false);
  });

  describe('verify-email and resend-verification-email', () => {
    const register = (overrides = {}) =>
      request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Verify Endpoint',
          email: 'verify-endpoint@example.com',
          phone: '+15550400010',
          password: 'RegisterPassword1!',
          ...overrides,
        });

    test('rejects an unauthenticated verify-email request with 401', async () => {
      const res = await request(app).post('/api/v1/auth/verify-email').send({ code: '123456' });
      expect(res.status).toBe(401);
    });

    test('rejects an unauthenticated resend-verification-email request with 401', async () => {
      const res = await request(app).post('/api/v1/auth/resend-verification-email');
      expect(res.status).toBe(401);
    });

    test('verifies with the correct code and flips is_email_verified', async () => {
      const registerRes = await register({ email: 'verify-correct@example.com', phone: '+15550400011' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-correct@example.com' });
      const { hashVerificationCode } = require('../../src/utils/emailVerification');
      await User.findByIdAndUpdate(user._id, {
        email_verification_code_hash: hashVerificationCode('123456'),
        email_verification_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '123456' });

      expect(res.status).toBe(200);
      const updated = await User.findById(user._id);
      expect(updated.is_email_verified).toBe(true);
      expect(updated.email_verification_code_hash).toBeNull();
      expect(updated.email_verification_expires_at).toBeNull();
    });

    test('rejects an incorrect code with 400', async () => {
      const registerRes = await register({ email: 'verify-wrong@example.com', phone: '+15550400012' });
      const token = registerRes.body.data.token;

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '000000' });

      expect(res.status).toBe(400);
    });

    test('rejects an expired code with 400', async () => {
      const registerRes = await register({ email: 'verify-expired@example.com', phone: '+15550400013' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-expired@example.com' });
      const { hashVerificationCode } = require('../../src/utils/emailVerification');
      await User.findByIdAndUpdate(user._id, {
        email_verification_code_hash: hashVerificationCode('654321'),
        email_verification_expires_at: new Date(Date.now() - 60 * 1000),
      });

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '654321' });

      expect(res.status).toBe(400);
    });

    test('verify-email on an already-verified account is idempotent (200, no code required to match)', async () => {
      const registerRes = await register({ email: 'verify-already@example.com', phone: '+15550400014' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-already@example.com' });
      await User.findByIdAndUpdate(user._id, { is_email_verified: true });

      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'irrelevant' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/already verified/i);
    });

    test('resend-verification-email issues a new code that invalidates the old one', async () => {
      const registerRes = await register({ email: 'verify-resend@example.com', phone: '+15550400015' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-resend@example.com' });
      const { hashVerificationCode } = require('../../src/utils/emailVerification');
      await User.findByIdAndUpdate(user._id, {
        email_verification_code_hash: hashVerificationCode('111111'),
        email_verification_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      sendVerificationEmail.mockClear();
      const resendRes = await request(app)
        .post('/api/v1/auth/resend-verification-email')
        .set('Authorization', `Bearer ${token}`);

      expect(resendRes.status).toBe(200);
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

      const oldCodeAttempt = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '111111' });
      expect(oldCodeAttempt.status).toBe(400);
    });

    test('resend-verification-email on an already-verified account is idempotent and does not send', async () => {
      const registerRes = await register({ email: 'verify-resend-already@example.com', phone: '+15550400016' });
      const token = registerRes.body.data.token;
      const user = await User.findOne({ email: 'verify-resend-already@example.com' });
      await User.findByIdAndUpdate(user._id, { is_email_verified: true });

      sendVerificationEmail.mockClear();
      const res = await request(app)
        .post('/api/v1/auth/resend-verification-email')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/already verified/i);
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });
  });
});
