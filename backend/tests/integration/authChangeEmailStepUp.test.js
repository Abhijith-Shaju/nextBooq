const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendStepUpOtpEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendStepUpOtpEmail } = require('../../src/services/emailService');

setupTestDB();

const PASSWORD = 'StepUpPassword1!';

// change-email requires a step-up otpCode only once the current email is
// already verified — a freshly registered account is unverified, so mark it
// verified directly rather than running it through the full verify-email
// round trip (kept separate from authChangeCredentials.test.js so this
// file's own authRateLimiter budget — see authRateLimit.test.js — isn't
// shared with those tests).
const registerVerified = async (overrides = {}) => {
  const payload = {
    name: 'Step Up User',
    email: 'step-up@example.com',
    phone: '+15550300001',
    password: PASSWORD,
    ...overrides,
  };
  const res = await request(app).post('/api/v1/auth/register').send({ ...payload, accept_terms: true });
  await User.findByIdAndUpdate(res.body.data.user.id, { is_email_verified: true });
  return res.body.data.token;
};

describe('request-step-up-otp', () => {
  test('rejects an unverified account — no trusted inbox to step up through', async () => {
    const registerRes = await request(app).post('/api/v1/auth/register').send({ accept_terms: true,
      name: 'Unverified Requester',
      email: 'unverified-requester@example.com',
      phone: '+15550300006',
      password: PASSWORD,
    });
    const token = registerRes.body.data.token;

    const res = await request(app).post('/api/v1/auth/request-step-up-otp').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/verify your email/i);
  });

  test('sends the code to the account\'s own current email', async () => {
    sendStepUpOtpEmail.mockClear();
    const token = await registerVerified({ email: 'otp-destination@example.com', phone: '+15550300007' });

    const res = await request(app).post('/api/v1/auth/request-step-up-otp').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(sendStepUpOtpEmail.mock.calls[0][0].to).toBe('otp-destination@example.com');
  });
});

describe('change-email on an already-verified account (step-up required)', () => {
  beforeEach(() => {
    sendStepUpOtpEmail.mockClear();
  });

  test('rejects the request outright when no otpCode is supplied', async () => {
    const token = await registerVerified({ email: 'verified-no-otp@example.com', phone: '+15550300002' });

    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'wont-work@example.com', currentPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/security code/i);
  });

  test('rejects an incorrect otpCode without setting a pending email', async () => {
    const token = await registerVerified({ email: 'verified-wrong-otp@example.com', phone: '+15550300003' });
    await request(app).post('/api/v1/auth/request-step-up-otp').set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'still-wont-work@example.com', currentPassword: PASSWORD, otpCode: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
    const user = await User.findOne({ email: 'verified-wrong-otp@example.com' });
    expect(user.pending_email).toBeNull();
  });

  test('a correct otpCode lets the change proceed and cannot be reused', async () => {
    const token = await registerVerified({ email: 'verified-correct-otp@example.com', phone: '+15550300004' });
    await request(app).post('/api/v1/auth/request-step-up-otp').set('Authorization', `Bearer ${token}`);
    const otpCode = sendStepUpOtpEmail.mock.calls[0][0].code;

    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'stepped-up@example.com', currentPassword: PASSWORD, otpCode });

    expect(res.status).toBe(200);
    const user = await User.findOne({ email: 'verified-correct-otp@example.com' });
    expect(user.pending_email).toBe('stepped-up@example.com');
    expect(user.step_up_code_hash).toBeNull();

    const reuseRes = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'other@example.com', currentPassword: PASSWORD, otpCode });
    expect(reuseRes.status).toBe(400);
  });

  test('is not required on an unverified account (the recovery path stays password-only)', async () => {
    const registerRes = await request(app).post('/api/v1/auth/register').send({ accept_terms: true,
      name: 'Unverified User',
      email: 'unverified-recovery@example.com',
      phone: '+15550300005',
      password: PASSWORD,
    });
    const token = registerRes.body.data.token;

    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'fixed-typo@example.com', currentPassword: PASSWORD });

    expect(res.status).toBe(200);
  });
});
