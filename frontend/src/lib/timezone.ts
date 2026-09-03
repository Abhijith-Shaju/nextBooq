import { formatInTimeZone, toDate, format, fromZonedTime } from 'date-fns-tz';
import { addDays, addHours, isBefore, startOfDay, parseISO } from 'date-fns';

export function toLocalTime(date: Date, timeZone: string): Date {
  return toDate(date, { timeZone });
}

/**
 * Resolves a cafe-local calendar date + wall-clock time into the UTC instant
 * the API expects.
 *
 * Slot times come off the availability API as the cafe's own wall clock
 * ("19:00" means 7pm where the cafe is), so they must be interpreted in the
 * cafe's timezone — never the browser's. `new Date('2026-09-05T19:00:00')`
 * parses as *browser* local time, which silently produces the right instant
 * only while the diner happens to sit in the cafe's timezone and books a
 * different slot entirely otherwise (a UTC device booking a Kolkata cafe's
 * 19:00 lands on 00:30 the next day). This mirrors the backend's own
 * localTimeToUTC in utils/operatingHours.js.
 *
 * `timeZone` falls back to the browser's zone only when the tenant payload
 * carries none; the API always sends one for a real cafe.
 */
export function cafeLocalToUTC(dateKey: string, time: string, timeZone?: string): Date {
  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fromZonedTime(`${dateKey}T${time}:00`, zone);
}

export function formatInTimezone(date: Date | string, timeZone: string, formatStr: string = 'PPpp'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(dateObj, timeZone, formatStr);
}

/**
 * The earliest calendar day a booking can be made on, given the cafe's
 * booking_lead_time_hours. Days before this are disabled in the date picker
 * so a customer can't select a date that the backend would reject anyway —
 * only an approximation (it floors to the whole day, so some individual
 * times on the cutoff day may still be too soon), the backend remains the
 * authoritative check.
 */
export function getLeadTimeDisabledBefore(leadTimeHours: number, now: Date = new Date()): Date {
  return startOfDay(addHours(now, leadTimeHours));
}

export function getDisabledDates(
  minLeadTimeHours: number,
  maxLeadTimeDays: number,
  timeZone: string
): { before: Date; after: Date } {
  const now = new Date(); // In real world, we'd adjust to timezone accurately
  const minDate = addHours(now, minLeadTimeHours);
  const maxDate = addDays(now, maxLeadTimeDays);

  return {
    before: startOfDay(minDate),
    after: maxDate,
  };
}
