const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { setupTestDB } = require('../setup');

setupTestDB();

// The Terms promise that cancelling a paid booking gets the guest their money
// back. nextBooq never moves money out of a cafe's Razorpay account, so the
// cancellation cannot issue the refund itself -- but it must not be silent
// about it either, or the promise has nothing behind it. Cancelling flags the
// reservation onto the cafe's refunds-owed queue instead.
describe('Refunds owed after a cancellation', () => {
  let cafe;
  let ownerToken;
  let managerToken;
  let guest;

  const makeReservation = (overrides = {}) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: [],
      start_time: new Date(Date.now() + 5 * 60 * 60 * 1000),
      end_time: new Date(Date.now() + 6 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
      fee_policy: {
        adjusted_against_bill: true,
        refund_on_cancellation: true,
        cancellation_cutoff_hours: 24,
      },
      payment_data: {
        order_id: 'order_test',
        payment_id: 'pay_test',
        amount: 100,
        currency: 'INR',
        status: 'CAPTURED',
      },
      ...overrides,
    });

  const cancel = (reservation, token = ownerToken) =>
    request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'CANCELLED', version: reservation.__v });

  const listRefunds = (token = ownerToken) =>
    request(app)
      .get(`/api/v1/cafes/${cafe._id}/refunds-owed`)
      .set('Authorization', `Bearer ${token}`);

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Refund Queue Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Refund Queue Cafe',
      slug: `refund-queue-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });

    const owner = await User.create({
      name: 'Refund Owner',
      email: `refund-owner-${Date.now()}@test.com`,
      phone: `+1557${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: owner._id, tv: 0 }, config.JWT_SECRET, { expiresIn: '1h' });

    // A manager holds cancel_reservations but NOT manage_billing by default.
    const manager = await User.create({
      name: 'Refund Manager',
      email: `refund-manager-${Date.now()}@test.com`,
      phone: `+1558${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
      staff_memberships: [
        {
          cafe_id: cafe._id,
          role: 'manager',
          permissions: ['view_reservations', 'edit_reservations', 'cancel_reservations'],
        },
      ],
    });
    managerToken = jwt.sign({ id: manager._id, tv: 0 }, config.JWT_SECRET, { expiresIn: '1h' });

    guest = await User.create({
      name: 'Refund Guest',
      email: `refund-guest-${Date.now()}@test.com`,
      phone: `+1559${String(Date.now()).slice(-7)}`,
      password_hash: 'pass',
      is_email_verified: true,
    });
  });

  test('cancelling a paid booking puts it on the refunds-owed queue', async () => {
    const reservation = await makeReservation();

    const res = await cancel(reservation);
    expect(res.status).toBe(200);

    const saved = await Reservation.findById(reservation._id);
    expect(saved.status).toBe('CANCELLED');
    expect(saved.payment_data.requires_manual_refund).toBe(true);
  });

  test('the queue lists the guest and the amount owed', async () => {
    const reservation = await makeReservation();
    await cancel(reservation);

    const res = await listRefunds();

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      amount: 100,
      currency: 'INR',
      payment_id: 'pay_test',
      status: 'CANCELLED',
    });
    expect(res.body.data[0].guest.email).toBe(guest.email);
  });

  test('an unpaid booking owes nothing when cancelled', async () => {
    // No payment was captured, so there is nothing to give back.
    const reservation = await makeReservation({
      status: 'PENDING_PAYMENT',
      payment_data: { order_id: 'order_test', payment_id: null, amount: 100, currency: 'INR' },
    });

    await cancel(reservation);

    const saved = await Reservation.findById(reservation._id);
    expect(saved.payment_data.requires_manual_refund).toBe(false);
    expect((await listRefunds()).body.data).toHaveLength(0);
  });

  test('a booking taken on non-refundable terms owes nothing when cancelled', async () => {
    // The terms recorded on the booking are what decides this -- not the
    // cafe's current setting.
    const reservation = await makeReservation({
      fee_policy: {
        adjusted_against_bill: false,
        refund_on_cancellation: false,
        cancellation_cutoff_hours: 24,
      },
    });

    await cancel(reservation);

    const saved = await Reservation.findById(reservation._id);
    expect(saved.payment_data.requires_manual_refund).toBe(false);
  });

  test('marking a refund settled clears it from the queue', async () => {
    const reservation = await makeReservation();
    await cancel(reservation);

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ refund_reference: 'rfnd_TEST123' });

    expect(res.status).toBe(200);
    expect((await listRefunds()).body.data).toHaveLength(0);
  });

  test('settling a refund requires manage_billing, not merely cancel rights', async () => {
    // The staff member who cancels is often not the one who controls the money.
    const reservation = await makeReservation();
    await cancel(reservation, managerToken);

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ refund_reference: 'rfnd_TEST123' });

    expect(res.status).toBe(403);
    // Still owed -- a denied click must not quietly clear the debt.
    expect((await listRefunds()).body.data).toHaveLength(1);
  });

  test('settling an already-settled refund does not silently succeed', async () => {
    const reservation = await makeReservation();
    await cancel(reservation);
    await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ refund_reference: 'rfnd_TEST123' });

    const again = await request(app)
      .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ refund_reference: 'rfnd_TEST123' });

    expect(again.status).toBe(404);
  });

  test('the queue is scoped to the cafe', async () => {
    const otherOrg = await Organization.create({ name: 'Other Refund Org' });
    const otherCafe = await Cafe.create({
      org_id: otherOrg._id,
      name: 'Other Refund Cafe',
      slug: `other-refund-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const reservation = await makeReservation();
    await cancel(reservation);

    const res = await request(app)
      .get(`/api/v1/cafes/${otherCafe._id}/refunds-owed`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(403);
  });

  describe('the refund reference', () => {
    // Clearing an entry asserts a guest has had their money back, and nothing
    // in nextBooq can verify that -- the refund happens in the cafe's own
    // Razorpay account. The reference is what makes the claim checkable later
    // rather than being somebody's unsupported word.
    const settle = (reservation, body) =>
      request(app)
        .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(body);

    test.each([
      ['omitted entirely', undefined],
      ['empty', { refund_reference: '' }],
      ['only whitespace', { refund_reference: '   ' }],
      ['a non-string', { refund_reference: 12345 }],
      ['an injected operator', { refund_reference: { $ne: null } }],
    ])('refuses to settle when the reference is %s', async (_label, body) => {
      const reservation = await makeReservation();
      await cancel(reservation);

      const res = await settle(reservation, body);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/refund_reference is required/i);
      // The debt must survive a rejected attempt.
      expect((await listRefunds()).body.data).toHaveLength(1);
    });

    test('rejects an absurdly long reference', async () => {
      const reservation = await makeReservation();
      await cancel(reservation);

      const res = await settle(reservation, { refund_reference: 'x'.repeat(101) });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/100 characters or fewer/i);
    });

    test('stores the reference and the time it was settled', async () => {
      const reservation = await makeReservation();
      await cancel(reservation);

      await settle(reservation, { refund_reference: '  rfnd_MNO456  ' });

      const saved = await Reservation.findById(reservation._id);
      // Trimmed, so a stray paste does not become part of the evidence.
      expect(saved.payment_data.refund_reference).toBe('rfnd_MNO456');
      expect(saved.payment_data.refund_settled_at).toBeInstanceOf(Date);
      expect(saved.payment_data.requires_manual_refund).toBe(false);
    });

    test('accepts a non-Razorpay reference, for a refund paid another way', async () => {
      // A cafe may legitimately settle by UPI or bank transfer; forcing an
      // rfnd_ prefix would leave those refunds impossible to record.
      const reservation = await makeReservation();
      await cancel(reservation);

      const res = await settle(reservation, { refund_reference: 'UPI/423318871234' });

      expect(res.status).toBe(200);
      const saved = await Reservation.findById(reservation._id);
      expect(saved.payment_data.refund_reference).toBe('UPI/423318871234');
    });

    test('records the reference on the audit trail', async () => {
      const reservation = await makeReservation();
      await cancel(reservation);

      await settle(reservation, { refund_reference: 'rfnd_AUDIT1' });

      const entry = await mongoose.connection.db
        .collection('auditlogs')
        .findOne({ action: 'REFUND_MARKED_SETTLED' }, { sort: { _id: -1 } });
      expect(entry.after_state.refund_reference).toBe('rfnd_AUDIT1');
    });
  });

  describe('the settled history', () => {
    const listSettled = (token = ownerToken) =>
      request(app)
        .get(`/api/v1/cafes/${cafe._id}/refunds-settled`)
        .set('Authorization', `Bearer ${token}`);

    const settle = (reservation, reference) =>
      request(app)
        .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ refund_reference: reference });

    test('is empty before anything has been refunded', async () => {
      const res = await listSettled();
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    test('a settled refund moves from the owed queue into the history', async () => {
      const reservation = await makeReservation();
      await cancel(reservation);
      await settle(reservation, 'rfnd_HIST01');

      expect((await listRefunds()).body.data).toHaveLength(0);

      const res = await listSettled();
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        refund_reference: 'rfnd_HIST01',
        amount: expect.any(Number),
      });
      expect(res.body.data[0].refund_settled_at).toBeTruthy();
    });

    test('a host without manage_billing can still read the history', async () => {
      // Whoever answers a guest asking "was I refunded?" is often not the
      // person who controls the money.
      const reservation = await makeReservation();
      await cancel(reservation);
      await settle(reservation, 'rfnd_HIST02');

      const res = await listSettled(managerToken);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    test('is scoped to the cafe', async () => {
      const otherOrg = await Organization.create({ name: 'Other Settled Org' });
      const otherCafe = await Cafe.create({
        org_id: otherOrg._id,
        name: 'Other Settled Cafe',
        slug: `other-settled-${Date.now()}`,
        timezone: 'UTC',
        subscription_status: 'active',
      });
      await Reservation.create({
        cafe_id: otherCafe._id,
        user_id: guest._id,
        table_ids: [],
        start_time: new Date(Date.now() + 3600000),
        end_time: new Date(Date.now() + 7200000),
        party_size: 2,
        reservation_timezone: 'UTC',
        status: 'CANCELLED',
        payment_data: { amount: 500, refund_reference: 'rfnd_ELSEWHERE', refund_settled_at: new Date() },
      });

      const res = await listSettled();
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('flagging a refund by hand', () => {
    // The automatic paths only cover refunds the rules require. A cafe that
    // decides to refund anyway -- a complaint, a waived no-show, a booking
    // taken under non-refundable terms -- had no way to record that, so the
    // money owed lived only in somebody's head.
    const flag = (reservation, body, token = ownerToken) =>
      request(app)
        .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-owed`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    const paidReservation = async (status = 'COMPLETED') => {
      const r = await makeReservation();
      await Reservation.updateOne(
        { _id: r._id },
        { $set: { status, 'payment_data.payment_id': 'pay_PAID1', 'payment_data.amount': 250 } }
      );
      return r;
    };

    test('adds a paid booking to the queue with its reason', async () => {
      const reservation = await paidReservation();

      const res = await flag(reservation, { reason: 'Kitchen closed early, guest not seated' });

      expect(res.status).toBe(200);
      const queue = (await listRefunds()).body.data;
      expect(queue).toHaveLength(1);
      expect(queue[0].refund_reason).toBe('Kitchen closed early, guest not seated');
    });

    test('works regardless of status, so a completed or no-show booking can be refunded', async () => {
      // Goodwill refunds are decided after the fact; restricting this to
      // CANCELLED would rule out the cases it exists for.
      for (const status of ['COMPLETED', 'NO_SHOW']) {
        const reservation = await paidReservation(status);
        const res = await flag(reservation, { reason: `goodwill after ${status}` });
        expect(res.status).toBe(200);
      }
      expect((await listRefunds()).body.data).toHaveLength(2);
    });

    test('refuses a booking that was never paid for', async () => {
      // Nothing was captured, so there is nothing to give back -- flagging it
      // would put an unpayable entry on the queue. The shared fixture is a
      // paid booking, so the payment has to be explicitly removed here.
      const reservation = await makeReservation({
        status: 'PENDING_PAYMENT',
        payment_data: { order_id: 'order_test', amount: 100, currency: 'INR' },
      });

      const res = await flag(reservation, { reason: 'guest complained' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/never paid for/i);
      expect((await listRefunds()).body.data).toHaveLength(0);
    });

    test('refuses to add the same booking twice', async () => {
      const reservation = await paidReservation();
      await flag(reservation, { reason: 'first' });

      const again = await flag(reservation, { reason: 'second' });

      expect(again.status).toBe(400);
      expect(again.body.message).toMatch(/already on the refunds-owed queue/i);
      expect((await listRefunds()).body.data).toHaveLength(1);
    });

    test.each([
      ['omitted', undefined],
      ['empty', { reason: '' }],
      ['whitespace', { reason: '   ' }],
      ['a non-string', { reason: 42 }],
    ])('refuses a reason that is %s', async (_label, body) => {
      const reservation = await paidReservation();

      const res = await flag(reservation, body);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/reason is required/i);
      expect((await listRefunds()).body.data).toHaveLength(0);
    });

    test('requires manage_billing, not merely the ability to cancel', async () => {
      const reservation = await paidReservation();

      const res = await flag(reservation, { reason: 'goodwill' }, managerToken);

      expect(res.status).toBe(403);
      expect((await listRefunds()).body.data).toHaveLength(0);
    });

    test('records the reason on the audit trail', async () => {
      const reservation = await paidReservation();

      await flag(reservation, { reason: 'wrong table, guest left' });

      const entry = await mongoose.connection.db
        .collection('auditlogs')
        .findOne({ action: 'REFUND_FLAGGED_MANUALLY' }, { sort: { _id: -1 } });
      expect(entry.after_state.reason).toBe('wrong table, guest left');
    });

    test('a manually flagged refund can then be settled like any other', async () => {
      const reservation = await paidReservation();
      await flag(reservation, { reason: 'goodwill' });

      const settled = await request(app)
        .put(`/api/v1/cafes/${cafe._id}/reservations/${reservation._id}/refund-settled`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ refund_reference: 'rfnd_MANUAL1' });

      expect(settled.status).toBe(200);
      expect((await listRefunds()).body.data).toHaveLength(0);
    });
  });
});
