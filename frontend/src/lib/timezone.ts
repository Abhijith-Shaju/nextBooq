import { formatInTimeZone, toDate, format } from 'date-fns-tz';
import { addDays, addHours, isBefore, startOfDay, parseISO } from 'date-fns';

export function toLocalTime(date: Date, timeZone: string): Date {
  return toDate(date, { timeZone });
}

export function toUTCString(date: Date, timeZone: string): string {
  // Simplistic conversion for the sake of example, properly you'd convert local to UTC
  return date.toISOString();
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
