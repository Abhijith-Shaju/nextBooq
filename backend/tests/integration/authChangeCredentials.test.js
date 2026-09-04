const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendStepUpOtpEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendVerificationEmail } = require('../../src/services/emailService');

setupTestDB();

const PASSWORD = 'ChangeCredsPassword1!';

// Every endpoint under test here shares the authRateLimiter's 20-requests/15min
// budget with the whole test file (see authRateLimit.test.js) — tests below
// are consolidated to stay well under that, rather than one register() call
// per assertion.
const registerAndLogin = async (overrides = {}) => {
  const payload = {
    name: 'Change Creds User',
    email: 'change-creds@example.com',
    phone: '+15550200001',
    password: PASSWORD,
    ...overrides,
  };
  const res = await request(app).post('/api/v1/auth/register').send({ ...payload, accept_terms: true });
  return { token: res.body.data.token, user: res.body.data.user };
};

describe('change-email', () => {
  beforeEach(() => {
    sendVerificationEmail.mockClear();
  });

  test('the full pending-change lifecycle: request, resend, wrong code, correct code', async () => {
    const { token } = await registerAndLogin({ email: 'swap-me@example.com', phone: '+15550200002' });
    sendVerificationEmail.mockClear(); // registration itself already sent one

    const changeRes = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'swapped-to@example.com', currentPassword: PASSWORD });

    expect(changeRes.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail.mock.calls[0][0].to).toBe('swapped-to@example.com');

    // The live email is untouched while the change is pending.
    const meAfterRequest = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meAfterRequest.body.data.email).toBe('swap-me@example.com');
    expect(meAfterRequest.body.data.pending_email).toBe('swapped-to@example.com');
    expect(meAfterRequest.body.data.is_email_verified).toBe(false);

    // Resend targets the pending (new) address, not the still-live old one.
    sendVerificationEmail.mockClear();
    const resendRes = await request(app)
      .post('/api/v1/auth/resend-verification-email')
      .set('Authorization', `Bearer ${token}`);
    expect(resendRes.status).toBe(200);
    expect(sendVerificationEmail.mock.calls[0][0].to).toBe('swapped-to@example.com');

    // A wrong code leaves the pending change untouched.
    const wrongCodeRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' });
    expect(wrongCodeRes.status).toBe(400);
    const stillPending = await User.findOne({ email: 'swap-me@example.com' });
    expect(stillPending.pending_email).toBe('swapped-to@example.com');

    // The correct (resent) code swaps email, clears pending_email, and verifies.
    const code = sendVerificationEmail.mock.calls[0][0].code;
    const confirmRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ code });
    expect(confirmRes.status).toBe(200);

    const swapped = await User.findOne({ email: 'swapped-to@example.com' });
    expect(swapped).not.toBeNull();
    expect(swapped.pending_email).toBeNull();
    expect(swapped.is_email_verified).toBe(true);
    expect(swapped.email_verification_code_hash).toBeNull();
    await expect(User.findOne({ email: 'swap-me@example.com' })).resolves.toBeNull();
  });

  test('rejects an incorrect password', async () => {
    const { token } = await registerAndLogin({ email: 'wrong-pass@example.com', phone: '+15550200003' });

    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'anything@example.com', currentPassword: 'NotTheRightPassword1!' });

    expect(res.status).toBe(401);
  });

  test('rejects an email already in use by another account', async () => {
    await registerAndLogin({ email: 'taken@example.com', phone: '+15550200004' });
    const { token } = await registerAndLogin({ email: 'requester@example.com', phone: '+15550200005' });

    const res = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'taken@example.com', currentPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already in use/i);
  });
});

describe('change-phone', () => {
  test('updates phone immediately, no verification step', async () => {
    const { token } = await registerAndLogin({ email: 'phone-user@example.com', phone: '+15550200006' });

    const res = await request(app)
      .post('/api/v1/auth/change-phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPhone: '+15550299999', currentPassword: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('+15550299999');

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.data.phone).toBe('+15550299999');
  });

  test('rejects an incorrect password', async () => {
    const { token } = await registerAndLogin({ email: 'phone-wrong-pass@example.com', phone: '+15550200007' });

    const res = await request(app)
      .post('/api/v1/auth/change-phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPhone: '+15550288888', currentPassword: 'NotTheRightPassword1!' });

    expect(res.status).toBe(401);
  });

  test('rejects a phone number already in use by another account', async () => {
    await registerAndLogin({ email: 'phone-taken-owner@example.com', phone: '+15550200008' });
    const { token } = await registerAndLogin({ email: 'phone-requester@example.com', phone: '+15550200009' });

    const res = await request(app)
      .post('/api/v1/auth/change-phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPhone: '+15550200008', currentPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already in use/i);
  });
});
