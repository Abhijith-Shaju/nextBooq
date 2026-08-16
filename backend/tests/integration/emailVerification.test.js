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
});
