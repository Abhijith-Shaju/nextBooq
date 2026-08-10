import { describe, expect, test } from 'vitest';
import { generateIcsContent } from './ics';

describe('generateIcsContent', () => {
  test('produces a valid VCALENDAR/VEVENT block with UTC timestamps', () => {
    const ics = generateIcsContent({
      title: 'Table booking at Demo Cafe',
      description: 'Token #ABCD',
      location: 'Demo Cafe',
      start: new Date('2026-09-05T19:00:00.000Z'),
      end: new Date('2026-09-05T20:30:00.000Z'),
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Table booking at Demo Cafe');
    expect(ics).toContain('LOCATION:Demo Cafe');
    expect(ics).toContain('DESCRIPTION:Token #ABCD');
    expect(ics).toContain('DTSTART:20260905T190000Z');
    expect(ics).toContain('DTEND:20260905T203000Z');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  test('escapes commas and semicolons in text fields per the ICS spec', () => {
    const ics = generateIcsContent({
      title: 'Booking, confirmed; ready',
      description: '',
      location: '',
      start: new Date('2026-09-05T19:00:00.000Z'),
      end: new Date('2026-09-05T20:30:00.000Z'),
    });

    expect(ics).toContain('SUMMARY:Booking\\, confirmed\\; ready');
  });
});
