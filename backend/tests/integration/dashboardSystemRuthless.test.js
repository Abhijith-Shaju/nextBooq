const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const config = require('../../src/config/env');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const socketService = require('../../src/services/socketService');
const { transitionState } = require('../../src/services/stateMachine');
const { setupTestDB } = require('../setup');

jest.mock('../../src/services/socketService', () => ({
  notifyCafeRoom: jest.fn(),
}));

setupTestDB();

describe('Ruthless dashboard system audit', () => {
  let cafe, ownerToken;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Dashboard Audit Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Audit Cafe',
      slug: `audit-cafe-${Date.now()}`,
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const ownerUser = await User.create({
      name: 'Owner',
      email: `owner-${Date.now()}@test.com`,
      phone: '+15550009999',
      password_hash: 'hash',
      staff_memberships: [{ cafe_id: cafe._id, role: 'owner', permissions: [] }],
    });
    ownerToken = jwt.sign({ id: ownerUser._id.toString() }, config.JWT_SECRET);
  });

  describe('FIXED: can_merge_with accepts table_number strings (what the Table Editor UI actually sends)', () => {
    test('creating a table with a human-readable table_number in can_merge_with links it correctly', async () => {
      const neighbor = await Table.create({ cafe_id: cafe._id, table_number: 'Window-1', capacity: 2 });

      const res = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          table_number: 'Window-2',
          capacity: 2,
          can_merge_with: ['Window-1'],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.can_merge_with).toEqual([neighbor._id.toString()]);

      // Symmetric: the neighbor should now point back at the new table too.
      const updatedNeighbor = await Table.findById(neighbor._id);
      expect(updatedNeighbor.can_merge_with.map(String)).toContain(res.body.data._id);
    });

    test('an unknown table_number in can_merge_with is rejected with a clear error, not a silent no-op', async () => {
      const res = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          table_number: 'Window-3',
          capacity: 2,
          can_merge_with: ['does-not-exist'],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/does-not-exist/i);
    });

    test('editing a table to change its merge list updates symmetric links both ways', async () => {
      const t1 = await Table.create({ cafe_id: cafe._id, table_number: '1', capacity: 2 });
      const t2 = await Table.create({ cafe_id: cafe._id, table_number: '2', capacity: 2 });
      const t3res = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ table_number: '3', capacity: 2, can_merge_with: ['1'] });
      const t3Id = t3res.body.data._id;

      // Switch table 3's merge partner from table 1 to table 2.
      const editRes = await request(app)
        .put(`/api/v1/cafes/${cafe._id}/tables/${t3Id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ can_merge_with: ['2'] });

      expect(editRes.status).toBe(200);

      const updatedT1 = await Table.findById(t1._id);
      const updatedT2 = await Table.findById(t2._id);
      expect(updatedT1.can_merge_with.map(String)).not.toContain(t3Id); // symmetric removal
      expect(updatedT2.can_merge_with.map(String)).toContain(t3Id); // symmetric addition
    });

    test('FIXED: soft-deleting a table cleans up phantom references from its former merge neighbors', async () => {
      const neighbor = await Table.create({ cafe_id: cafe._id, table_number: '1', capacity: 2 });
      const target = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ table_number: '2', capacity: 2, can_merge_with: ['1'] });
      const targetId = target.body.data._id;

      // Neighbor should point at the target right after creation.
      expect((await Table.findById(neighbor._id)).can_merge_with.map(String)).toContain(targetId);

      const deleteRes = await request(app)
        .put(`/api/v1/cafes/${cafe._id}/tables/${targetId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ is_deleted: true });
      expect(deleteRes.status).toBe(200);

      // The deleted table's id must not linger in any other table's can_merge_with.
      const updatedNeighbor = await Table.findById(neighbor._id);
      expect(updatedNeighbor.can_merge_with.map(String)).not.toContain(targetId);
    });
  });

  describe('Table zone', () => {
    test('defaults to indoor when not specified', async () => {
      const res = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ table_number: 'Z1', capacity: 2 });

      expect(res.status).toBe(201);
      expect(res.body.data.zone).toBe('indoor');
    });

    test('accepts an explicit valid zone on create', async () => {
      const res = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ table_number: 'Z2', capacity: 2, zone: 'outdoor' });

      expect(res.status).toBe(201);
      expect(res.body.data.zone).toBe('outdoor');
    });

    test('rejects an invalid zone on create', async () => {
      const res = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ table_number: 'Z3', capacity: 2, zone: 'rooftop' });

      expect(res.status).toBe(400);
    });

    test('updates zone via PUT', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'Z4', capacity: 2 });

      const res = await request(app)
        .put(`/api/v1/cafes/${cafe._id}/tables/${table._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ zone: 'window' });

      expect(res.status).toBe(200);
      expect(res.body.data.zone).toBe('window');

      const dbTable = await Table.findById(table._id);
      expect(dbTable.zone).toBe('window');
    });

    test('rejects an invalid zone on update', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: 'Z5', capacity: 2 });

      const res = await request(app)
        .put(`/api/v1/cafes/${cafe._id}/tables/${table._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ zone: 'not-a-zone' });

      expect(res.status).toBe(400);
    });
  });

  describe('FIXED: PUT /api/v1/cafes/:cafeId updates reservation_rules (what settings/page.tsx calls)', () => {
    test('an owner can update reservation_rules with valid values', async () => {
      const res = await request(app)
        .put(`/api/v1/cafes/${cafe._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          reservation_rules: {
            default_turn_time_minutes: 60,
            max_party_size: 8,
            booking_lead_time_hours: 12,
            hold_duration_minutes: 5,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.reservation_rules).toMatchObject({
        default_turn_time_minutes: 60,
        max_party_size: 8,
        booking_lead_time_hours: 12,
        hold_duration_minutes: 5,
      });

      const dbCafe = await Cafe.findById(cafe._id);
      expect(dbCafe.reservation_rules.max_party_size).toBe(8);
    });

    test('a staff member without edit_settings gets 403, not a silent 404', async () => {
      const hostUser = await User.create({
        name: 'Host',
        email: `host-${Date.now()}@test.com`,
        phone: '+15550001234',
        password_hash: 'hash',
        staff_memberships: [{ cafe_id: cafe._id, role: 'host', permissions: ['view_reservations'] }],
      });
      const hostToken = jwt.sign({ id: hostUser._id.toString() }, config.JWT_SECRET);

      const res = await request(app)
        .put(`/api/v1/cafes/${cafe._id}`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ reservation_rules: { max_party_size: 99 } });

      expect(res.status).toBe(403);
    });

    test('server-side validation rejects a non-positive max_party_size even though the frontend input has min/max attributes a raw request can bypass', async () => {
      const res = await request(app)
        .put(`/api/v1/cafes/${cafe._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reservation_rules: { max_party_size: -5 } });

      expect(res.status).toBe(400);
    });

    test('server-side validation rejects a non-positive hold_duration_minutes', async () => {
      const res = await request(app)
        .put(`/api/v1/cafes/${cafe._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reservation_rules: { hold_duration_minutes: 0 } });

      expect(res.status).toBe(400);
    });

    test('an owner can set a reservation_fee, including decimal rupees', async () => {
      const res = await request(app)
        .put(`/api/v1/cafes/${cafe._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reservation_rules: { reservation_fee: 149.5 } });

      expect(res.status).toBe(200);
      expect(res.body.data.reservation_rules.reservation_fee).toBe(149.5);

      const dbCafe = await Cafe.findById(cafe._id);
      expect(dbCafe.reservation_rules.reservation_fee).toBe(149.5);
    });

    test.each([
      ['zero', 0],
      ['negative', -10],
      ['absurdly large', 200000],
      ['non-numeric', 'free'],
    ])('server-side validation rejects a %s reservation_fee', async (_label, badFee) => {
      const res = await request(app)
        .put(`/api/v1/cafes/${cafe._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reservation_rules: { reservation_fee: badFee } });

      expect(res.status).toBe(400);
    });

    test('a cafe that never sets reservation_fee keeps the ₹100 schema default', async () => {
      const dbCafe = await Cafe.findById(cafe._id);
      expect(dbCafe.reservation_rules.reservation_fee).toBe(100);
    });
  });

  describe('FIXED: error responses carry a nested error.message the frontend actually reads', () => {
    test('a 400 error response includes both the top-level message and a nested error.message with the same text', async () => {
      const res = await request(app)
        .post(`/api/v1/cafes/${cafe._id}/tables`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({}); // missing table_number and capacity

      expect(res.status).toBe(400);
      expect(res.body.message).toBeDefined();
      expect(res.body.error).toBeDefined();
      expect(res.body.error.message).toBe(res.body.message);
      expect(res.body.error.code).toBeDefined();
    });
  });

  describe('FIXED: the dashboard\'s real-time refresh actually fires on status changes', () => {
    beforeEach(() => {
      socketService.notifyCafeRoom.mockClear();
    });

    test('transitionState notifies the cafe room with a reservation_updated event', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: '1', capacity: 4 });
      const guest = await User.create({
        name: 'Guest',
        email: `guest-${Date.now()}@test.com`,
        phone: '+15550001111',
        password_hash: 'hash',
      });
      const reservation = await Reservation.create({
        cafe_id: cafe._id,
        user_id: guest._id,
        table_ids: [table._id],
        start_time: new Date('2026-08-20T12:00:00Z'),
        end_time: new Date('2026-08-20T13:00:00Z'),
        party_size: 2,
        reservation_timezone: 'UTC',
        status: 'CONFIRMED',
      });

      await transitionState({
        reservationId: reservation._id,
        tenantId: cafe._id,
        targetStatus: 'CHECKED_IN',
        expectedVersion: 0,
      });

      expect(socketService.notifyCafeRoom).toHaveBeenCalledTimes(1);
      expect(socketService.notifyCafeRoom).toHaveBeenCalledWith(
        cafe._id.toString(),
        'reservation_updated',
        expect.objectContaining({ reservationId: reservation._id.toString(), status: 'CHECKED_IN' })
      );
    });

    test('a failed transition (illegal status) does not fire a spurious notification', async () => {
      const table = await Table.create({ cafe_id: cafe._id, table_number: '1', capacity: 4 });
      const guest = await User.create({
        name: 'Guest',
        email: `guest2-${Date.now()}@test.com`,
        phone: '+15550001112',
        password_hash: 'hash',
      });
      const reservation = await Reservation.create({
        cafe_id: cafe._id,
        user_id: guest._id,
        table_ids: [table._id],
        start_time: new Date('2026-08-20T12:00:00Z'),
        end_time: new Date('2026-08-20T13:00:00Z'),
        party_size: 2,
        reservation_timezone: 'UTC',
        status: 'HOLD',
      });

      await expect(
        transitionState({
          reservationId: reservation._id,
          tenantId: cafe._id,
          targetStatus: 'SEATED', // illegal from HOLD
          expectedVersion: 0,
        })
      ).rejects.toThrow();

      expect(socketService.notifyCafeRoom).not.toHaveBeenCalled();
    });
  });

  describe('sanity: permissions that ARE wired up still work as expected', () => {
    test('view_reservations still gates the manifest correctly (regression guard)', async () => {
      const res = await request(app)
        .get(`/api/v1/cafes/${cafe._id}/reservations`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
    });
  });
});
