const DAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * A date in the future, as YYYY-MM-DD, falling on the requested weekday.
 *
 * Several suites used to hardcode a date with a "// a Monday" comment beside
 * it. Those rot silently: the real calendar eventually passes them, and the
 * suite turns red for reasons unrelated to any code change. That is worse
 * than it sounds — a suite that goes red on its own trains everyone to skim
 * past red, and then it stops catching real regressions.
 *
 * Anchoring to the next occurrence of the weekday keeps the thing those
 * tests actually cared about (a cafe's per-weekday operating_hours) while
 * staying permanently in the future.
 *
 * minDaysAhead defaults to 2 so the result always clears a cafe's
 * booking_lead_time_hours (24 by default) no matter what time of day the
 * suite runs — a slot later today, or even tomorrow morning, can fall inside
 * the lead-time window and be correctly refused.
 *
 * Dates are computed in UTC because the cafes these suites create are
 * configured with `timezone: 'UTC'`.
 */
const nextWeekday = (dayName, minDaysAhead = 2) => {
  const target = DAY_INDEX[dayName];
  if (target === undefined) {
    throw new Error(`nextWeekday: unknown weekday "${dayName}"`);
  }

  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + minDaysAhead);

  while (date.getUTCDay() !== target) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date.toISOString().slice(0, 10);
};

module.exports = { nextWeekday };
