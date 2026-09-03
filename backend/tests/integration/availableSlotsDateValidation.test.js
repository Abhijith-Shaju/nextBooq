const request = require('supertest');
const app = require('../../src/app');
const Cafe = require('../../src/models/Cafe');
const Organization = require('../../src/models/Organization');
const Table = require('../../src/models/Table');
const { getLocalTimeDetails } = require('../../src/utils/operatingHours');
const { setupTestDB } = require('../setup');

setupTestDB();

// Regression test: `date` went unvalidated into localTimeToUTC, which
// interpolates it as `${dateKey}T${time}:00`. An unparseable value produced
// an Invalid Date, Intl.formatToParts threw RangeError, and the catch block
// meant to fall back to UTC threw the *same* RangeError again out of itself
// via dateObj.toISOString() -- an unhandled 500 on an unauthenticated
// endpoint, reachable with a single request.
describe('GET /available-slots validates the date query parameter', () => {
  let cafe;

  beforeEach(async () => {
    const org = await Organization.create({ name: 'Date Validation Org' });
    cafe = await Cafe.create({
      org_id: org._id,
      name: 'Date Validation Cafe',
      slug: `date-validation-cafe-${Date.now()}`,
      timezone: 'Asia/Kolkata',
      subscription_status: 'active',
    });
    await Table.create({ cafe_id: cafe._id, table_number: 'T1', capacity: 4 });
  });

  const getSlots = (date) =>
    request(app)
      .get(`/api/v1/cafes/${cafe._id}/available-slots`)
      .query({ date, partySize: 2 });

  test.each([
    ['unparseable text', 'not-a-date'],
    ['out-of-range month and day', '2026-13-45'],
    ['all-nines', '9999-99-99'],
    ['an injection-shaped string', "'; DROP"],
    // Zero-padding matters: this is a shape a client could plausibly send,
    // which is why this was a robustness bug and not only a hostile-input one.
    ['a single-digit month and day', '2026-9-5'],
    ['an ISO datetime rather than a date key', '2026-09-05T19:00:00Z'],
    ['an empty-ish value', '   '],
  ])('rejects %s with 400, never 500', async (_label, date) => {
    const res = await getSlots(date);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/real calendar date/i);
  });

  test('rejects a well-formed but non-existent date instead of silently rolling it forward', async () => {
    // 2026 is not a leap year, so Date happily reads this as 2 March and
    // would otherwise answer for a different day than the caller asked about.
    const res = await getSlots('2026-02-30');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/real calendar date/i);
  });

  test('accepts a valid date', async () => {
    const res = await getSlots('2026-09-05');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('getLocalTimeDetails raises a handled error rather than throwing from its own catch', () => {
    // Direct unit-level check on the second half of the defect: the fallback
    // path itself used to throw RangeError for an invalid date, escaping the
    // very catch block that was supposed to contain the failure.
    expect(() => getLocalTimeDetails(new Date('nonsense'), 'Not/AZone')).toThrow(
      /Invalid date supplied/
    );
  });
});
