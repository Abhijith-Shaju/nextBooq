const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const CafeCustomer = require('../../src/models/CafeCustomer');
const { setupTestDB } = require('../setup');

setupTestDB();

// stateMachine.js has always incremented total_visits on COMPLETED and
// total_no_shows on NO_SHOW, but nothing read them back -- no route exposed
// CafeCustomer and no UI referenced it. The Privacy Policy justifies holding
// these counters as "letting a cafe recognise repeat guests and manage
// no-shows", a purpose that was not real while they were invisible. The
// manifest now carries them so that purpose holds.
describe('GET /cafes/:cafeId/reservations — guest history', () => {
  let cafe;
  let hostToken;
  let guest;

  const today = () => new Date();

  const makeReservation = (user, hourOffset = 2) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: user._id,
      table_ids: [],
      start_time: new Date(Date.now() + hourOffset * 60 * 60 * 1000),
      end_time: new Date(Date.now() + (hourOffset + 1) * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

  const fetchManifest = () =>
    request(app)
      .get(`/api/v1/cafes/${cafe._id}/reservations`)
      .set('Authorization', `Bearer ${hostToken}`);

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Guest History Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Guest History Cafe',
      slug: `guest-history-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const host = await User.create({
      name: 'History Host',
      email: `history-host-${Date.now()}@test.com`,
      phone: `+1555${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [
        { cafe_id: cafe._id, role: 'host', permissions: ['view_reservations'] },
      ],
    });
    hostToken = jwt.sign({ id: host._id, tv: 0 }, config.JWT_SECRET, { expiresIn: '1h' });

    guest = await User.create({
      name: 'Returning Guest',
      email: `returning-${Date.now()}@test.com`,
      phone: `+1556${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  test("exposes the guest's visit and no-show counts at this cafe", async () => {
    await CafeCustomer.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      total_visits: 7,
      total_no_shows: 1,
    });
    await makeReservation(guest);

    const res = await fetchManifest();

    expect(res.status).toBe(200);
    expect(res.body.data[0].guest_history).toEqual({ total_visits: 7, total_no_shows: 1 });
  });

  test('reports zeroes for a first-time guest rather than omitting the field', async () => {
    // The client should never have to tell "no history yet" apart from "the
    // server did not send it".
    await makeReservation(guest);

    const res = await fetchManifest();

    expect(res.body.data[0].guest_history).toEqual({ total_visits: 0, total_no_shows: 0 });
  });

  test('counts are scoped to this cafe, not carried across cafes', async () => {
    const otherOrg = await Organization.create({ name: 'Other Org' });
    const otherCafe = await Cafe.create({
      org_id: otherOrg._id,
      name: 'Other Cafe',
      slug: `other-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    // A heavy history somewhere else must not follow the guest here.
    await CafeCustomer.create({
      cafe_id: otherCafe._id,
      user_id: guest._id,
      total_visits: 99,
      total_no_shows: 42,
    });
    await makeReservation(guest);

    const res = await fetchManifest();

    expect(res.body.data[0].guest_history).toEqual({ total_visits: 0, total_no_shows: 0 });
  });

  test('resolves history for several guests in one response', async () => {
    const second = await User.create({
      name: 'Second Guest',
      email: `second-${Date.now()}@test.com`,
      phone: `+1557${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });
    await CafeCustomer.create({
      cafe_id: cafe._id, user_id: guest._id, total_visits: 3, total_no_shows: 0,
    });
    await CafeCustomer.create({
      cafe_id: cafe._id, user_id: second._id, total_visits: 0, total_no_shows: 2,
    });
    await makeReservation(guest, 2);
    await makeReservation(second, 4);

    const res = await fetchManifest();

    const byName = Object.fromEntries(
      res.body.data.map((r) => [r.user_id.name, r.guest_history])
    );
    expect(byName['Returning Guest']).toEqual({ total_visits: 3, total_no_shows: 0 });
    expect(byName['Second Guest']).toEqual({ total_visits: 0, total_no_shows: 2 });
  });

  test('the manifest still returns the guest identity it did before', async () => {
    // attachGuestHistory rebuilds each row, so the populated fields the host
    // stand relies on have to survive that.
    await makeReservation(guest);

    const res = await fetchManifest();
    const row = res.body.data[0];

    expect(row.user_id.name).toBe('Returning Guest');
    expect(row.user_id.email).toBeTruthy();
    expect(row.status).toBe('CONFIRMED');
    expect(row.party_size).toBe(2);
  });
});

describe('CafeCustomer no longer carries private_notes', () => {
  test('the field is not part of the schema', () => {
    // It was never written by any endpoint, service or UI, yet the Privacy
    // Policy told guests that cafe staff kept free-text notes about them.
    expect(CafeCustomer.schema.path('private_notes')).toBeUndefined();
  });

  test('a note supplied by a caller is not persisted', async () => {
    const org = await Organization.create({ name: 'Notes Org' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Notes Cafe',
      slug: `notes-cafe-${Date.now()}`,
      timezone: 'UTC',
    });
    const user = await User.create({
      name: 'Noted Guest',
      email: `noted-${Date.now()}@test.com`,
      phone: `+1558${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
    });

    const created = await CafeCustomer.create({
      cafe_id: cafe._id,
      user_id: user._id,
      private_notes: 'should not be stored',
    });

    const reloaded = await CafeCustomer.findById(created._id).lean();
    expect(reloaded.private_notes).toBeUndefined();
  });
});
