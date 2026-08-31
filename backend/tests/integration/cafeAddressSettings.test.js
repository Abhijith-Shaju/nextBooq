const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

// Same rationale as cafePaymentsSettings.test.js: `app` above is required
// before `../setup`, and jest.mock() calls only apply within the file that
// declares them, so setup.js's own jest.mock of these modules does not
// intercept the reference cafeController.js/authController.js already
// captured when `app` was first required.
jest.mock('../../src/config/razorpay', () => ({
  createRazorpayClient: jest.fn(() => ({
    payments: {
      all: jest.fn().mockResolvedValue({ entity: 'collection', count: 0, items: [] }),
    },
  })),
}));

jest.mock('../../src/services/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
  sendStepUpOtpEmail: jest.fn().mockResolvedValue({ logged: true, data: null, error: null }),
}));
const { sendStepUpOtpEmail } = require('../../src/services/emailService');

setupTestDB();

describe('Integration Test: cafe address settings', () => {
  let cafe;
  let ownerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Address Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Address Cafe',
      slug: 'address-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-address@test.com',
      phone: '+1555900010',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id.toString() }, config.JWT_SECRET);
    sendStepUpOtpEmail.mockClear();
  });

  const putSettings = (body) =>
    request(app).put(`/api/v1/cafes/${cafe._id}`).set('Authorization', `Bearer ${ownerToken}`).send(body);

  const VALID_ADDRESS = {
    line1: '12 Church Street',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '560001',
    map_url: 'https://maps.google.com/?q=x',
  };

  test('saves a valid address', async () => {
    const res = await putSettings({ address: VALID_ADDRESS });

    expect(res.status).toBe(200);
    expect(res.body.data.address).toMatchObject({
      line1: '12 Church Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postal_code: '560001',
      map_url: 'https://maps.google.com/?q=x',
      country: 'India',
    });

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.address.line1).toBe('12 Church Street');
    expect(persisted.address.city).toBe('Bengaluru');
    expect(persisted.address.state).toBe('Karnataka');
    expect(persisted.address.postal_code).toBe('560001');
    expect(persisted.address.map_url).toBe('https://maps.google.com/?q=x');
    expect(persisted.address.country).toBe('India');
  });

  test('rejects a PIN with a leading zero and leaves the stored address untouched', async () => {
    const saved = await putSettings({ address: VALID_ADDRESS });
    expect(saved.status).toBe(200);

    const res = await putSettings({ address: { ...VALID_ADDRESS, postal_code: '060001' } });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/6-digit/);

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.address.postal_code).toBe('560001');
    expect(persisted.address.line1).toBe('12 Church Street');
  });

  test('rejects a non-https map_url', async () => {
    const httpRes = await putSettings({ address: { ...VALID_ADDRESS, map_url: 'http://maps.google.com' } });
    expect(httpRes.status).toBe(400);
    expect(httpRes.body.message).toMatch(/https/);

    const jsRes = await putSettings({ address: { ...VALID_ADDRESS, map_url: 'javascript:alert(1)' } });
    expect(jsRes.status).toBe(400);
    expect(jsRes.body.message).toMatch(/https/);
  });

  test('a request that omits address leaves the existing address alone', async () => {
    const saved = await putSettings({ address: VALID_ADDRESS });
    expect(saved.status).toBe(200);

    const res = await putSettings({ contact_phone: '+91 98765 43210' });

    expect(res.status).toBe(200);
    expect(res.body.data.contact_phone).toBe('+91 98765 43210');
    expect(res.body.data.address).toMatchObject({
      line1: '12 Church Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postal_code: '560001',
    });

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.address.line1).toBe('12 Church Street');
  });

  test('clears the stored address when every field is blank/whitespace', async () => {
    const saved = await putSettings({ address: VALID_ADDRESS });
    expect(saved.status).toBe(200);

    const res = await putSettings({
      address: { line1: '  ', line2: '', landmark: '', city: '', state: '  ', postal_code: '', map_url: '' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.address).toMatchObject({
      line1: '',
      city: '',
      state: '',
      postal_code: '',
      map_url: '',
    });

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.address.line1).toBe('');
    expect(persisted.address.city).toBe('');
    expect(persisted.address.state).toBe('');
    expect(persisted.address.postal_code).toBe('');
    expect(persisted.address.map_url).toBe('');
  });

  test('rejects a partial address (city filled, line1 blank) instead of treating it as a clear', async () => {
    const saved = await putSettings({ address: VALID_ADDRESS });
    expect(saved.status).toBe(200);

    const res = await putSettings({
      address: { ...VALID_ADDRESS, line1: '' },
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/line1 is required/);

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.address.line1).toBe('12 Church Street');
  });

  // Task 2's regression guard, exercised at the HTTP layer: address must
  // stay optional at the Mongoose schema level, so a cafe that has never
  // set one can still successfully cafe.save() through an entirely
  // unrelated endpoint — here, connecting Razorpay. If address ever grew a
  // schema-level `required` field, this save would start failing with a
  // ValidationError for every pre-existing addressless cafe.
  test('a cafe with no address can still save its payment settings', async () => {
    const persistedBefore = await Cafe.findById(cafe._id);
    expect(persistedBefore.address.line1).toBe('');

    const otpRes = await request(app)
      .post('/api/v1/auth/request-step-up-otp')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(otpRes.status).toBe(200);
    const otp_code = sendStepUpOtpEmail.mock.calls[sendStepUpOtpEmail.mock.calls.length - 1][0].code;

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ razorpay_key_id: 'rzp_test_valid123', razorpay_key_secret: 'supersecretvalue', otp_code });

    expect(res.status).toBe(200);
    expect(res.body.data.payments.configured).toBe(true);

    const persisted = await Cafe.findById(cafe._id);
    expect(persisted.payments.configured).toBe(true);
    expect(persisted.address.line1).toBe('');
  });
});
