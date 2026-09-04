const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

// L-06: registration used to return a distinct message for an existing
// email vs an existing phone number, letting a caller enumerate which
// specific emails/phone numbers are already registered -- inconsistent with
// forgotPassword, which is deliberately non-enumerable.
describe('Integration Test: registration does not enumerate which field conflicted', () => {
  beforeEach(async () => {
    await User.create({
      name: 'Existing User',
      email: 'taken-email@test.com',
      phone: '+15559990601',
      password_hash: 'pass',
    });
  });

  const register = (overrides) =>
    request(app)
      .post('/api/v1/auth/register')
      .send({ accept_terms: true,
        name: 'New User',
        email: 'brand-new@test.com',
        phone: '+15559990602',
        password: 'password123',
        ...overrides,
      });

  test('a conflicting email and a conflicting phone return the exact same message', async () => {
    const emailConflict = await register({ email: 'taken-email@test.com' });
    const phoneConflict = await register({ phone: '+15559990601' });

    expect(emailConflict.status).toBe(400);
    expect(phoneConflict.status).toBe(400);
    // The point: the response gives no signal about *which* field conflicted
    // -- identical wording either way, rather than "email already exists"
    // vs. "phone already exists".
    expect(emailConflict.body.message).toBe(phoneConflict.body.message);
  });

  test('a genuinely new email and phone still succeed', async () => {
    const res = await register({});
    expect(res.status).toBe(201);
  });
});
