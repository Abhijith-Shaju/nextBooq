const { validateOperatingHours, getLocalTimeDetails } = require('../../src/utils/operatingHours');
const { UnprocessableEntityError } = require('../../src/utils/errors');

describe('Operating Hours Validation Utility', () => {
  const sampleCafe = {
    timezone: 'UTC',
    operating_hours: [
      { day_of_week: 'monday', open_time: '09:00', close_time: '22:00', is_closed: false },
      { day_of_week: 'tuesday', open_time: '09:00', close_time: '22:00', is_closed: false },
      { day_of_week: 'wednesday', open_time: '09:00', close_time: '22:00', is_closed: false },
      { day_of_week: 'thursday', open_time: '09:00', close_time: '22:00', is_closed: false },
      { day_of_week: 'friday', open_time: '09:00', close_time: '22:00', is_closed: false },
      { day_of_week: 'saturday', open_time: '10:00', close_time: '23:00', is_closed: false },
      { day_of_week: 'sunday', open_time: '00:00', close_time: '00:00', is_closed: true },
    ],
  };

  test('should pass validation for a slot within operating hours', () => {
    const startTime = new Date('2026-08-10T12:00:00Z'); // Monday 12:00 UTC
    const endTime = new Date('2026-08-10T13:30:00Z'); // Monday 13:30 UTC

    expect(() => validateOperatingHours(sampleCafe, startTime, endTime)).not.toThrow();
  });

  test('should throw error if reservation starts before cafe open_time', () => {
    const startTime = new Date('2026-08-10T08:30:00Z'); // Monday 08:30 UTC (opens 09:00)
    const endTime = new Date('2026-08-10T10:00:00Z');

    expect(() => validateOperatingHours(sampleCafe, startTime, endTime)).toThrow(
      UnprocessableEntityError
    );
  });

  test('should throw error if reservation end_time exceeds close_time', () => {
    const startTime = new Date('2026-08-10T21:00:00Z');
    const endTime = new Date('2026-08-10T22:30:00Z'); // Monday 22:30 UTC (closes 22:00)

    expect(() => validateOperatingHours(sampleCafe, startTime, endTime)).toThrow(
      UnprocessableEntityError
    );
  });

  test('should throw error if cafe is closed on the requested day', () => {
    const startTime = new Date('2026-08-09T14:00:00Z'); // Sunday (is_closed = true)
    const endTime = new Date('2026-08-09T15:30:00Z');

    expect(() => validateOperatingHours(sampleCafe, startTime, endTime)).toThrow(
      UnprocessableEntityError
    );
  });

  // M-09: reproduces the exact mismatch the audit found -- generateSlotTimes
  // (operatingHoursSettings/availableSlots) already offers slots within an
  // overnight window as bookable, but validateOperatingHours used to reject
  // every one of them, because it never rolled the closing time forward for
  // a schedule where close_time <= open_time.
  describe('overnight schedules (close_time before open_time)', () => {
    const overnightCafe = {
      timezone: 'UTC',
      operating_hours: [{ day_of_week: 'monday', open_time: '18:00', close_time: '02:00', is_closed: false }],
    };

    test('accepts a booking squarely within the evening portion (20:00-22:00)', () => {
      const startTime = new Date('2026-08-10T20:00:00Z'); // Monday 20:00 UTC
      const endTime = new Date('2026-08-10T22:00:00Z'); // Monday 22:00 UTC

      expect(() => validateOperatingHours(overnightCafe, startTime, endTime)).not.toThrow();
    });

    test('accepts a booking that crosses midnight into the early-morning tail (23:50-00:30)', () => {
      const startTime = new Date('2026-08-10T23:50:00Z'); // Monday 23:50 UTC
      const endTime = new Date('2026-08-11T00:30:00Z'); // Tuesday 00:30 UTC

      expect(() => validateOperatingHours(overnightCafe, startTime, endTime)).not.toThrow();
    });

    test('still rejects a booking that runs past the rolled-forward closing time (Monday 23:00 - Tuesday 03:00)', () => {
      // Start stays on Monday's own local calendar day, so it resolves
      // Monday's schedule (see file-level note above about the day-of-week
      // lookup for a start time that has itself already rolled into the
      // next day being intentionally out of scope for this fix).
      const startTime = new Date('2026-08-10T23:00:00Z'); // Monday 23:00 UTC
      const endTime = new Date('2026-08-11T03:00:00Z'); // Tuesday 03:00 UTC -- past 02:00 close

      expect(() => validateOperatingHours(overnightCafe, startTime, endTime)).toThrow(
        UnprocessableEntityError
      );
    });

    test('still rejects a booking before the opening time (16:00-17:00)', () => {
      const startTime = new Date('2026-08-10T16:00:00Z'); // Monday 16:00 UTC -- before 18:00 open
      const endTime = new Date('2026-08-10T17:00:00Z');

      expect(() => validateOperatingHours(overnightCafe, startTime, endTime)).toThrow(
        UnprocessableEntityError
      );
    });
  });
});

// The conversion the API now owns on behalf of every client. Asserted as
// absolute instants so these hold regardless of the timezone the test runner
// sits in -- which is the whole point: the frontend used to do this in the
// browser's zone, so it was only ever correct by coincidence.
describe('localTimeToUTC resolves a cafe-local wall clock to an instant', () => {
  const { localTimeToUTC, isValidDateKey, isValidTimeOfDay } = require('../../src/utils/operatingHours');

  test('resolves 19:00 in IST (+05:30)', () => {
    expect(localTimeToUTC('2026-09-05', '19:00', 'Asia/Kolkata').toISOString())
      .toBe('2026-09-05T13:30:00.000Z');
  });

  test('the same wall clock resolves differently per cafe timezone', () => {
    expect(localTimeToUTC('2026-09-05', '19:00', 'UTC').toISOString())
      .toBe('2026-09-05T19:00:00.000Z');
    expect(localTimeToUTC('2026-09-05', '19:00', 'America/New_York').toISOString())
      .toBe('2026-09-05T23:00:00.000Z');
    expect(localTimeToUTC('2026-09-05', '19:00', 'Asia/Dubai').toISOString())
      .toBe('2026-09-05T15:00:00.000Z');
  });

  test('handles a DST boundary (London BST vs GMT)', () => {
    expect(localTimeToUTC('2026-09-05', '19:00', 'Europe/London').toISOString())
      .toBe('2026-09-05T18:00:00.000Z');
    expect(localTimeToUTC('2026-12-05', '19:00', 'Europe/London').toISOString())
      .toBe('2026-12-05T19:00:00.000Z');
  });

  test('a midnight-adjacent slot resolves to the previous UTC day', () => {
    expect(localTimeToUTC('2026-09-05', '00:30', 'Asia/Kolkata').toISOString())
      .toBe('2026-09-04T19:00:00.000Z');
  });

  describe('input guards shared by availability and booking', () => {
    test.each([
      ['2026-09-05', true],
      ['2026-02-30', false],  // rolls forward to 2 March if not caught
      ['2026-9-5', false],    // plausible client formatting, still rejected
      ['2026-13-45', false],
      ['not-a-date', false],
      ['', false],
      [null, false],
      [{ $ne: null }, false],
    ])('isValidDateKey(%p) === %p', (input, expected) => {
      expect(isValidDateKey(input)).toBe(expected);
    });

    test.each([
      ['19:00', true],
      ['00:00', true],
      ['23:59', true],
      ['24:00', false],
      ['19:60', false],
      ['9:00', false],
      ['19:00:00', false],
      ['', false],
      [null, false],
    ])('isValidTimeOfDay(%p) === %p', (input, expected) => {
      expect(isValidTimeOfDay(input)).toBe(expected);
    });
  });
});
