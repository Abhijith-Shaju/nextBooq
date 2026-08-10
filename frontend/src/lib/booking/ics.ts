interface IcsEventInput {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
}

// Escapes text per RFC 5545 §3.3.11: backslash, semicolon, comma, then newline.
const escapeIcsText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const toIcsUtcTimestamp = (date: Date): string => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

export function generateIcsContent({ title, description, location, start, end }: IcsEventInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//nextBooq//Reservation//EN',
    'BEGIN:VEVENT',
    `UID:${start.getTime()}-${end.getTime()}@nextbooq`,
    `DTSTAMP:${toIcsUtcTimestamp(new Date())}`,
    `DTSTART:${toIcsUtcTimestamp(start)}`,
    `DTEND:${toIcsUtcTimestamp(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
