// Minimal calendar invite (.ics) for interview emails.
const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function interviewIcs({ uid, start, minutes = 60, title, description, location }) {
  const end = new Date(new Date(start).getTime() + minutes * 60000);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AvaStars Hire//EN', 'METHOD:REQUEST', 'BEGIN:VEVENT',
    `UID:${uid}@avastars-hire`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(description)}`, `LOCATION:${esc(location)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
