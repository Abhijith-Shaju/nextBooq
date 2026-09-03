const { UnprocessableEntityError } = require('./errors');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Formats a Date object into a local HH:mm time string and day of week in a given timezone.
 */
const getLocalTimeDetails = (dateObj, timeZone = 'UTC') => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(dateObj);
    let weekday = '';
    let hour = '';
    let minute = '';
    let year = '';
    let month = '';
    let day = '';

    for (const part of parts) {
      if (part.type === 'weekday') weekday = part.value.toLowerCase();
      if (part.type === 'hour') hour = part.value;
      if (part.type === 'minute') minute = part.value;
      if (part.type === 'year') year = part.value;
      if (part.type === 'month') month = part.value;
      if (part.type === 'day') day = part.value;
    }

    // Adjust 24:00 if formatted as such
    if (hour === '24') hour = '00';

    return {
      dayOfWeek: weekday,
      timeString: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
      dateKey: `${year}-${month}-${day}`,
    };
  } catch (error) {
    // Fallback to UTC if the timezone string is invalid.
    //
    // An invalid *date* reaches here too, because Intl.formatToParts throws
    // RangeError on one — and then dateObj.toISOString() below threw the same
    // RangeError a second time, out of the catch block itself, where nothing
    // was left to handle it. That surfaced as an unhandled 500 on the public
    // availability endpoint for any unparseable `date` query parameter.
    // Callers are expected to validate their input (availabilityController
    // now does), but this handler must not be the thing that converts bad
    // input into a server error.
    if (Number.isNaN(dateObj.getTime())) {
      throw new UnprocessableEntityError('Invalid date supplied for timezone resolution');
    }

    const dayOfWeek = DAYS[dateObj.getUTCDay()];
    const hours = String(dateObj.getUTCHours()).padStart(2, '0');
    const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
    return {
      dayOfWeek,
      timeString: `${hours}:${minutes}`,
      dateKey: dateObj.toISOString().slice(0, 10),
    };
  }
};

const timeStringToMinutes = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

// Cafe-local date/time inputs are interpolated straight into
// `${dateKey}T${timeString}:00` by localTimeToUTC, so anything that isn't a
// real calendar date or a real wall-clock time produces an Invalid Date and,
// downstream, a 500 rather than a 400. Both public entry points that accept
// cafe-local input (availability search and reservation creation) validate
// through these, so the two cannot drift apart.
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Shape alone is not enough: "2026-02-30" matches the pattern, parses without
// complaint, and silently rolls forward to 2 March — answering for a
// different day than the caller asked about. The round-trip comparison
// rejects any date the calendar does not actually have.
const isValidDateKey = (value) =>
  typeof value === 'string' &&
  DATE_KEY_PATTERN.test(value) &&
  (() => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  })();

const isValidTimeOfDay = (value) =>
  typeof value === 'string' && TIME_OF_DAY_PATTERN.test(value);

/**
 * Resolves the day-of-week name for a plain "YYYY-MM-DD" calendar date.
 * The date string has no inherent timezone, so this is timezone-independent.
 */
const dayOfWeekForDateKey = (dateKey) => DAYS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];

const DEFAULT_DAY_SCHEDULE = {
  open_time: '09:00',
  close_time: '22:00',
  is_closed: false,
};

/**
 * Looks up a cafe's configured hours for a given day of week, falling back to
 * the default 09:00-22:00 open schedule when the cafe hasn't configured that day.
 */
const getDaySchedule = (cafe, dayOfWeek) => {
  const operatingHoursList = cafe?.operating_hours || [];
  return (
    operatingHoursList.find((h) => h.day_of_week === dayOfWeek) || DEFAULT_DAY_SCHEDULE
  );
};

/**
 * Converts a local wall-clock date+time in a given IANA timezone into the
 * corresponding UTC Date instant. Iterates because the UTC offset itself
 * depends on the instant being resolved (DST), converging in 1-2 passes.
 */
const localTimeToUTC = (dateKey, timeString, timeZone = 'UTC') => {
  let guess = new Date(`${dateKey}T${timeString}:00Z`);
  const wantedMinutes = timeStringToMinutes(timeString);

  for (let i = 0; i < 3; i++) {
    const details = getLocalTimeDetails(guess, timeZone);
    let diffMinutes = wantedMinutes - timeStringToMinutes(details.timeString);

    if (details.dateKey !== dateKey) {
      const dayDiff = Math.round(
        (new Date(`${dateKey}T00:00:00Z`) - new Date(`${details.dateKey}T00:00:00Z`)) /
          (24 * 60 * 60 * 1000)
      );
      diffMinutes += dayDiff * 24 * 60;
    }

    if (diffMinutes === 0) break;
    guess = new Date(guess.getTime() + diffMinutes * 60 * 1000);
  }

  return guess;
};

/**
 * Generates candidate "HH:mm" slot start times between a day's open/close
 * time (stepped every `stepMinutes`), stopping once a slot's duration would
 * run past closing. Handles schedules that cross midnight (close <= open).
 */
const generateSlotTimes = (openTime, closeTime, durationMinutes, stepMinutes = 30) => {
  const openMinutes = timeStringToMinutes(openTime);
  let closeMinutes = timeStringToMinutes(closeTime);
  if (closeMinutes <= openMinutes) {
    closeMinutes += 24 * 60;
  }

  const slots = [];
  for (let m = openMinutes; m + durationMinutes <= closeMinutes; m += stepMinutes) {
    const wrapped = m % (24 * 60);
    const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
    const mm = String(wrapped % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
};

/**
 * Validates that requested start_time and end_time fall within the cafe's operating hours.
 */
const validateOperatingHours = (cafe, startTime, endTime) => {
  if (!cafe) return;

  const start = new Date(startTime);
  const end = new Date(endTime);
  const timeZone = cafe.timezone || 'UTC';

  const startDetails = getLocalTimeDetails(start, timeZone);
  const endDetails = getLocalTimeDetails(end, timeZone);

  const daySchedule = getDaySchedule(cafe, startDetails.dayOfWeek);

  if (daySchedule.is_closed) {
    throw new UnprocessableEntityError(
      `Cafe is closed on ${startDetails.dayOfWeek.toUpperCase()}s.`
    );
  }

  const openTime = daySchedule.open_time || '09:00';
  const closeTime = daySchedule.close_time || '22:00';

  const openMinutes = timeStringToMinutes(openTime);
  const rawCloseMinutes = timeStringToMinutes(closeTime);
  // An overnight schedule (close_time <= open_time, e.g. open 18:00, close
  // 02:00) closes the following calendar day -- roll it forward by 24h so
  // comparisons below treat it as later than open_time, same convention as
  // generateSlotTimes below (M-09; these two used to disagree, rejecting
  // every slot generateSlotTimes had just offered as bookable).
  const isOvernightSchedule = rawCloseMinutes <= openMinutes;
  const closeMinutes = isOvernightSchedule ? rawCloseMinutes + 24 * 60 : rawCloseMinutes;

  const startMinutesRaw = timeStringToMinutes(startDetails.timeString);
  // For an overnight schedule, a start time is still valid if it falls in
  // the early-morning tail before the *original* (un-rolled) closing time
  // (e.g. open 18:00/close 02:00, a 00:30 start) -- roll it forward the
  // same way. Comparing against rawCloseMinutes rather than openMinutes
  // matters: a start genuinely before opening (e.g. 16:00, still less than
  // openMinutes but not less than rawCloseMinutes) must NOT be rolled, or
  // it would wrongly land inside the valid window instead of being rejected.
  const startMinutes =
    isOvernightSchedule && startMinutesRaw < rawCloseMinutes
      ? startMinutesRaw + 24 * 60
      : startMinutesRaw;

  if (startMinutes < openMinutes) {
    throw new UnprocessableEntityError(
      `Requested start time (${startDetails.timeString}) is before cafe opening time (${openTime} ${timeZone}).`
    );
  }

  // Compare end time as minutes-since-start-of-the-start-day, rolling the end
  // time forward by 24h if it falls on a later calendar date than the start
  // (e.g. a 23:50 -> 00:30 booking). A plain string/time comparison would
  // otherwise see "00:30" as earlier than the close time and wrongly allow it.
  const endMinutes = timeStringToMinutes(endDetails.timeString);
  const dayOffsetMinutes = endDetails.dateKey === startDetails.dateKey ? 0 : 24 * 60;
  const effectiveEndMinutes = endMinutes + dayOffsetMinutes;

  if (effectiveEndMinutes > closeMinutes) {
    throw new UnprocessableEntityError(
      `Requested end time (${endDetails.timeString}) exceeds cafe closing time (${closeTime} ${timeZone}).`
    );
  }
};

module.exports = {
  validateOperatingHours,
  getLocalTimeDetails,
  getDaySchedule,
  localTimeToUTC,
  generateSlotTimes,
  timeStringToMinutes,
  dayOfWeekForDateKey,
  isValidDateKey,
  isValidTimeOfDay,
};
