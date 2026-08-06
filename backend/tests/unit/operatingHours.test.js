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
});
