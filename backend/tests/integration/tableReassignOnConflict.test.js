const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { getSeatedTableIds } = require('../../src/services/tableOccupancyService');
const { suggestAlternateTable } = require('../../src/services/allocationEngine');
const { transitionState } = require('../../src/services/stateMachine');
const { setupTestDB } = require('../setup');

setupTestDB();

describe('getSeatedTableIds', () => {
  test('returns table ids held by other SEATED reservations, excluding the given one', async () => {
    const org = await Organization.create({ name: 'Seated Ids Org' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Seated Ids Cafe',
      slug: 'seated-ids-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });

    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });
    const tableC = await Table.create({ cafe_id: cafe._id, table_number: 'C1', capacity: 4 });

    const guest = await User.create({
      name: 'Guest',
      email: 'seated-ids@test.com',
      phone: '+1555920001',
      password_hash: 'pass',
    });

    const makeRes = (tableIds, status) =>
      Reservation.create({
        cafe_id: cafe._id,
        user_id: guest._id,
        table_ids: tableIds,
        start_time: new Date(Date.now() - 60 * 60 * 1000),
        end_time: new Date(Date.now() + 60 * 60 * 1000),
        party_size: 2,
        reservation_timezone: 'UTC',
        status,
      });

    await makeRes([tableA._id], 'SEATED');
    const self = await makeRes([tableB._id], 'SEATED');
    await makeRes([tableC._id], 'CHECKED_IN');

    const ids = await getSeatedTableIds(cafe._id, self._id);

    expect(ids.has(tableA._id.toString())).toBe(true);
    // Excluded: it's the reservation we're finding an alternate for.
    expect(ids.has(tableB._id.toString())).toBe(false);
    // CHECKED_IN guests are waiting at the host stand, not occupying a table.
    expect(ids.has(tableC._id.toString())).toBe(false);
  });
});

describe('suggestAlternateTable', () => {
  let cafe;
  let guest;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Suggest Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Suggest Cafe',
      slug: 'suggest-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    guest = await User.create({
      name: 'Guest',
      email: 'suggest@test.com',
      phone: '+1555930001',
      password_hash: 'pass',
    });
  });

  const makeRes = (tableIds, status, offsetHours, partySize = 2) =>
    Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: tableIds,
      start_time: new Date(Date.now() + offsetHours * 60 * 60 * 1000),
      end_time: new Date(Date.now() + (offsetHours + 1) * 60 * 60 * 1000),
      party_size: partySize,
      reservation_timezone: 'UTC',
      status,
    });

  test('suggests a free table when the assigned one is occupied', async () => {
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });

    await makeRes([tableA._id], 'SEATED', -1);
    const target = await makeRes([tableA._id], 'CONFIRMED', 2);

    const alternate = await suggestAlternateTable(cafe._id, target);

    expect(alternate).not.toBeNull();
    expect(alternate.tableIds.map((id) => id.toString())).toEqual([tableB._id.toString()]);
    expect(alternate.totalCapacity).toBe(4);
  });

  test('returns null when every other table is physically occupied right now', async () => {
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });

    await makeRes([tableA._id], 'SEATED', -1);
    await makeRes([tableB._id], 'SEATED', -1);
    const target = await makeRes([tableA._id], 'CONFIRMED', 2);

    expect(await suggestAlternateTable(cafe._id, target)).toBeNull();
  });

  test('returns null when the only other table is booked over the same window', async () => {
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });

    await makeRes([tableA._id], 'SEATED', -1);
    // Table B is free right now, but someone else has it booked for the
    // window this reservation would occupy.
    await makeRes([tableB._id], 'CONFIRMED', 2);
    const target = await makeRes([tableA._id], 'CONFIRMED', 2);

    expect(await suggestAlternateTable(cafe._id, target)).toBeNull();
  });

  test('returns null when the only free table is too small for the party', async () => {
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 6 });
    await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 2 });

    await makeRes([tableA._id], 'SEATED', -1);
    const target = await makeRes([tableA._id], 'CONFIRMED', 2, 6);

    expect(await suggestAlternateTable(cafe._id, target)).toBeNull();
  });
});

describe('transitionState tableIdsUpdate', () => {
  test('writes new table_ids in the same update as the status change', async () => {
    const org = await Organization.create({ name: 'Transition Org' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Transition Cafe',
      slug: 'transition-cafe',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const guest = await User.create({
      name: 'Guest',
      email: 'transition@test.com',
      phone: '+1555940001',
      password_hash: 'pass',
    });
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });
    const tableB = await Table.create({ cafe_id: cafe._id, table_number: 'B1', capacity: 4 });

    const reservation = await Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: [tableA._id],
      start_time: new Date(Date.now() + 60 * 60 * 1000),
      end_time: new Date(Date.now() + 2 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const updated = await transitionState({
      reservationId: reservation._id,
      tenantId: cafe._id,
      targetStatus: 'SEATED',
      expectedVersion: 0,
      tableIdsUpdate: [tableB._id],
    });

    expect(updated.status).toBe('SEATED');
    expect(updated.table_ids.map((id) => id.toString())).toEqual([tableB._id.toString()]);
  });

  test('leaves table_ids untouched when tableIdsUpdate is omitted', async () => {
    const org = await Organization.create({ name: 'Transition Org 2' });
    const cafe = await Cafe.create({
      org_id: org._id,
      name: 'Transition Cafe 2',
      slug: 'transition-cafe-2',
      timezone: 'UTC',
      subscription_status: 'active',
    });
    const guest = await User.create({
      name: 'Guest',
      email: 'transition2@test.com',
      phone: '+1555940002',
      password_hash: 'pass',
    });
    const tableA = await Table.create({ cafe_id: cafe._id, table_number: 'A1', capacity: 4 });

    const reservation = await Reservation.create({
      cafe_id: cafe._id,
      user_id: guest._id,
      table_ids: [tableA._id],
      start_time: new Date(Date.now() + 60 * 60 * 1000),
      end_time: new Date(Date.now() + 2 * 60 * 60 * 1000),
      party_size: 2,
      reservation_timezone: 'UTC',
      status: 'CONFIRMED',
    });

    const updated = await transitionState({
      reservationId: reservation._id,
      tenantId: cafe._id,
      targetStatus: 'SEATED',
      expectedVersion: 0,
    });

    expect(updated.table_ids.map((id) => id.toString())).toEqual([tableA._id.toString()]);
  });
});
