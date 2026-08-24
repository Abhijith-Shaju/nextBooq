const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');
const { authenticateSocket, isAuthorizedForCafe } = require('../../src/services/socketAuth');

setupTestDB();

describe('Integration Test: WebSocket authentication and cafe-room authorization', () => {
  let cafeA;
  let cafeB;
  let staffUser;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Socket Auth Org' });
    cafeA = await Cafe.create({ org_id: org._id, name: 'Cafe A', slug: 'cafe-a', timezone: 'UTC' });
    cafeB = await Cafe.create({ org_id: org._id, name: 'Cafe B', slug: 'cafe-b', timezone: 'UTC' });

    staffUser = await User.create({
      name: 'Staff A',
      email: 'staff-a@test.com',
      phone: '+1112220001',
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafeA._id, role: 'host', permissions: ['view_reservations'] }],
    });
  });

  describe('authenticateSocket', () => {
    test('resolves the user for a valid socket-audience token', async () => {
      const token = jwt.sign({ id: staffUser._id.toString() }, config.JWT_SECRET, {
        expiresIn: '120s',
        audience: 'socket',
      });
      const user = await authenticateSocket(token);
      expect(user._id.toString()).toBe(staffUser._id.toString());
    });

    // H-04: a plain REST session token (no aud: 'socket' claim) must not be
    // usable to open a live socket connection.
    test('rejects a token with no socket audience claim, even if otherwise valid', async () => {
      const token = jwt.sign({ id: staffUser._id.toString() }, config.JWT_SECRET, { expiresIn: '7d' });
      await expect(authenticateSocket(token)).rejects.toThrow();
    });

    test('rejects a missing token', async () => {
      await expect(authenticateSocket(undefined)).rejects.toThrow();
    });

    test('rejects a malformed/invalid token', async () => {
      await expect(authenticateSocket('not-a-real-token')).rejects.toThrow();
    });
  });

  describe('isAuthorizedForCafe', () => {
    test('authorizes a user with a staff membership for that cafe', () => {
      expect(isAuthorizedForCafe(staffUser, cafeA._id.toString())).toBe(true);
    });

    test('does not authorize a user for a cafe they have no membership at', () => {
      expect(isAuthorizedForCafe(staffUser, cafeB._id.toString())).toBe(false);
    });

    test('does not authorize when there is no user', () => {
      expect(isAuthorizedForCafe(null, cafeA._id.toString())).toBe(false);
    });
  });
});
