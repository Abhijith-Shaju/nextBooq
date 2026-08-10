export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface OperatingHourEntry {
  day_of_week: DayOfWeek;
  open_time: string; // HH:mm
  close_time: string; // HH:mm
  is_closed: boolean;
}

export const DAY_ORDER: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const DEFAULT_OPEN_TIME = '09:00';
const DEFAULT_CLOSE_TIME = '22:00';

export function getDefaultOperatingHours(): OperatingHourEntry[] {
  return DAY_ORDER.map((day_of_week) => ({
    day_of_week,
    open_time: DEFAULT_OPEN_TIME,
    close_time: DEFAULT_CLOSE_TIME,
    is_closed: false,
  }));
}

/**
 * Always returns exactly one entry per day, Monday-first, regardless of what
 * (if anything) is actually stored — a cafe that has never configured hours
 * has an empty array, and a partially-configured one might be missing days
 * or stored out of order.
 */
export function mergeOperatingHours(stored: OperatingHourEntry[] | undefined): OperatingHourEntry[] {
  const byDay = new Map((stored || []).map((entry) => [entry.day_of_week, entry]));
  return DAY_ORDER.map((day) => byDay.get(day) || {
    day_of_week: day,
    open_time: DEFAULT_OPEN_TIME,
    close_time: DEFAULT_CLOSE_TIME,
    is_closed: false,
  });
}

/**
 * Mirrors the backend's validation (backend/src/controllers/admin/cafeController.js)
 * so the host gets immediate feedback instead of a round-trip 400. The backend
 * remains the authoritative check.
 */
export function validateOperatingHoursForSubmit(hours: OperatingHourEntry[]): string | null {
  for (const entry of hours) {
    if (!entry.is_closed && entry.close_time <= entry.open_time) {
      return `${DAY_LABELS[entry.day_of_week]}: closing time must be after opening time.`;
    }
  }
  return null;
}
