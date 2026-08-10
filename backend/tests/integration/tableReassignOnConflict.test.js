const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const User = require('../../src/models/User');
const Table = require('../../src/models/Table');
const Reservation = require('../../src/models/Reservation');
const { getSeatedTableIds } = require('../../src/services/tableOccupancyService');
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
