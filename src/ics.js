// Writes a calendar file (iCalendar, RFC 5545) that Google, Apple and Outlook calendars can import.

import { addDays, leadDays } from './plan.js';

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const compact = (iso) => iso.replace(/-/g, '');
const stamp = (iso, time) => `${compact(iso)}T${time.replace(':', '')}00`;
const pct = (it) => (it.weight == null ? '' : ` (${it.est ? '~' : ''}${it.weight}%)`);

// Lines can be at most 75 bytes, so long ones continue on the next line after a space.
const encoder = new TextEncoder();
function fold(line) {
  let out = '', len = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (len + n > 75) { out += '\r\n '; len = 1; }
    out += ch;
    len += n;
  }
  return out;
}

const shortDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// courses: [{ name, items }]. opts.headsUp adds a "start" event a few days before the big items.
export function toICS(courses, opts = {}) {
  const now = (opts.now || new Date()).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pileup//Deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Pileup deadlines'];
  const allDay = (iso, end) => [`DTSTART;VALUE=DATE:${compact(iso)}`, `DTEND;VALUE=DATE:${compact(addDays(end || iso, 1))}`];

  for (const course of courses) {
    for (const it of course.items) {
      if (!it.on || !it.date) continue;
      const lines = ['BEGIN:VEVENT', `UID:${it.id}@pileup`, `DTSTAMP:${now}`];
      if (it.time) {
        lines.push(`DTSTART:${stamp(it.date, it.time)}`);
        if (it.endTime && it.endTime > it.time) lines.push(`DTEND:${stamp(it.date, it.endTime)}`);
      } else {
        lines.push(...allDay(it.date, it.end), 'TRANSP:TRANSPARENT');
      }
      const worth = it.weight == null ? '' : `Worth ${it.est ? 'about ' : ''}${it.weight}% of ${course.name}. `;
      lines.push(
        `SUMMARY:${esc(`${course.name}: ${it.title}${pct(it)}`)}`,
        `DESCRIPTION:${esc(`${worth}Added by Pileup.`)}`,
        `CATEGORIES:${esc(course.name)}`,
      );
      if (it.type !== 'info') {
        // A reminder the day before: 24 hours ahead for timed items, 9am the day before for all-day ones.
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${it.title} is due tomorrow`)}`, `TRIGGER:${it.time ? '-P1D' : '-PT15H'}`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
      out.push(...lines);

      const lead = opts.headsUp ? leadDays(it) : 0;
      if (lead) {
        const verb = it.type === 'exam' || it.type === 'quiz' ? 'Study for' : 'Start';
        out.push(
          'BEGIN:VEVENT', `UID:${it.id}-start@pileup`, `DTSTAMP:${now}`,
          ...allDay(addDays(it.date, -lead)), 'TRANSP:TRANSPARENT',
          `SUMMARY:${esc(`${verb}: ${it.title} (${course.name}, ${shortDate(it.date)})`)}`,
          `DESCRIPTION:${esc(`${lead} days to go. Added by Pileup.`)}`,
          'END:VEVENT',
        );
      }
    }
  }
  out.push('END:VCALENDAR');
  return out.map(fold).join('\r\n') + '\r\n';
}
