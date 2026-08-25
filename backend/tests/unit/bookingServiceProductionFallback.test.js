const mongoose = require('mongoose');
const { setupTestDB } = require('../setup');
const config = require('../../src/config/env');
const { createHoldReservation } = require('../../src/services/bookingService');
const Organization = require('../../src/models/Organization');
const Cafe = require('../../src/models/Cafe');
const Table = require('../../src/models/Table');
const User = require('../../src/models/User');

setupTestDB();

// M-02: createHoldReservation used to detect "standalone MongoDB, no
// replica set" purely by matching an error string/code, with no regard for
// environment. config/database.js's connectDB() already asserts transaction
// support at boot for production, so any error matching that shape *in
// production* is necessarily transient (e.g. a replica-set election), not a
// genuine lack of support -- silently downgrading to the racy
// non-transactional path on it would defeat the transaction entirely.
describe('createHoldReservation refuses the non-transactional fallback in production', () => {
  let cafe;
  let user;
  const replicaSetError = () =>
    new Error('Transaction numbers are only allowed on a replica set member or mongos');

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Fallback Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Fallback Cafe',
      slug: `fallback-cafe-${Date.now()}`,
      timezone: 'UTC',
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
    user = await User.create({
      name: 'Fallback User',
      email: `fallback-${Date.now()}@test.com`,
      phone: '+15559990001',
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  const buildArgs = () => {
    // Pinned to a fixed hour-of-day (14:00 UTC), not just "now + 48h" --
    // the cafe fixture has no operating_hours configured, so it falls back
    // to the 09:00-22:00 default, and whatever hour-of-day "now" happens to
    // be would otherwise make this test flaky depending on wall-clock time.
    const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    startTime.setUTCHours(14, 0, 0, 0);
    return {
      cafeId: cafe._id,
      userId: user._id,
      startTime,
      endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
      partySize: 2,
      reservationTimezone: 'UTC',
    };
  };

  test('rejects the booking instead of silently falling back, when NODE_ENV is production', async () => {
    const originalNodeEnv = config.NODE_ENV;
    const originalStartSession = mongoose.startSession;
    config.NODE_ENV = 'production';
    mongoose.startSession = jest.fn().mockRejectedValueOnce(replicaSetError());

    try {
      await expect(createHoldReservation(buildArgs())).rejects.toThrow(
        /replica set member or mongos/
      );
    } finally {
      config.NODE_ENV = originalNodeEnv;
      mongoose.startSession = originalStartSession;
    }

    const count = await mongoose.connection.collection('reservations').countDocuments();
    expect(count).toBe(0);
  });

  test('still falls back to the non-transactional path outside production on the same error', async () => {
    // Jest sets NODE_ENV to 'test' by default -- confirm we're actually
    // exercising the "not production" branch, not accidentally still
    // production from a prior test.
    expect(config.NODE_ENV).not.toBe('production');

    const originalStartSession = mongoose.startSession;
    mongoose.startSession = jest.fn().mockRejectedValueOnce(replicaSetError());

    let reservation;
    try {
      reservation = await createHoldReservation(buildArgs());
    } finally {
      mongoose.startSession = originalStartSession;
    }

    expect(reservation.status).toBe('HOLD');
  });
});
