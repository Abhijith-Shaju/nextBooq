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
    // Fallback to UTC if timezone string is invalid
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

  const operatingHoursList = cafe.operating_hours || [];
  const daySchedule = operatingHoursList.find(
    (h) => h.day_of_week === startDetails.dayOfWeek
  ) || {
    open_time: '09:00',
    close_time: '22:00',
    is_closed: false,
  };

  if (daySchedule.is_closed) {
    throw new UnprocessableEntityError(
      `Cafe is closed on ${startDetails.dayOfWeek.toUpperCase()}s.`
    );
  }

  const openTime = daySchedule.open_time || '09:00';
  const closeTime = daySchedule.close_time || '22:00';

  if (startDetails.timeString < openTime) {
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
  const closeMinutes = timeStringToMinutes(closeTime);

  if (effectiveEndMinutes > closeMinutes) {
    throw new UnprocessableEntityError(
      `Requested end time (${endDetails.timeString}) exceeds cafe closing time (${closeTime} ${timeZone}).`
    );
  }
};

module.exports = {
  validateOperatingHours,
  getLocalTimeDetails,
};
