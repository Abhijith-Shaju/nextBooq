import { format, parseISO } from 'date-fns';

export function formatDate(dateString: string, formatStr: string = 'PP'): string {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString);
    return format(date, formatStr);
  } catch {
    return dateString;
  }
}

export function formatTime(timeString: string): string {
  if (!timeString) return '';
  try {
    if (timeString.includes('T')) {
      return format(parseISO(timeString), 'h:mm a');
    }
    const [hours, minutes] = timeString.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const formattedHours = h % 12 || 12;
    return `${formattedHours}:${minutes} ${ampm}`;
  } catch {
    return timeString;
  }
}
