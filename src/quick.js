// Quick add: "chem lab report fri 10%" becomes one item in the course that matches "chem".

import { parseOutline, findDates, keyOf } from './parse.js?v=2';
import { addDays, weekStart } from './plan.js?v=2';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const RE_DAY = /\b(?:(next|this)\s+)?(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\.?/i;
const RE_REL = /\b(today|tonight|tomorrow|tmrw?)\b/i;
const RE_IN = /\bin\s+(a|one|\d{1,2})\s+(day|week)s?\b/i;
const STOP = new Set(['for', 'in', 'the', 'my']);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Swaps "fri", "next tue", "tomorrow" or "in 3 days" for a real date.
// Leaves the text alone if it already has one, so "Fri Nov 20" stays Nov 20.
export function resolveRelative(text, today) {
  if (findDates(text).length) return text;
  let m;
  if ((m = text.match(RE_REL))) return text.replace(m[0], addDays(today, /^to[dn]/i.test(m[1]) ? 0 : 1));
  if ((m = text.match(RE_IN))) {
    const n = (/^\d/.test(m[1]) ? +m[1] : 1) * (/^w/i.test(m[2]) ? 7 : 1);
    return text.replace(m[0], addDays(today, n));
  }
  if ((m = text.match(RE_DAY))) {
    const target = DAYS.indexOf(m[2].slice(0, 3).toLowerCase());
    const now = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
    // "next fri" is the Friday of next week. "fri" is the coming one, never today.
    const date = m[1]?.toLowerCase() === 'next'
      ? addDays(weekStart(today), 7 + target)
      : addDays(today, (target - now + 7) % 7 || (m[1] ? 0 : 7));
    return text.replace(m[0], date);
  }
  return text;
}

// "chem" matches "SCH4U Chemistry", and so do "sch4u" and "chemistry".
export function matchCourse(word, courses) {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length < 2) return null;
  return courses.find((c) => c.name.toLowerCase().split(/[^a-z0-9]+/)
    .some((part) => part && (part === w || (w.length >= 3 && part.startsWith(w))))) || null;
}

const looksLikeWhen = (word) => /\d/.test(word) || RE_DAY.test(word) || RE_REL.test(word) || findDates(word).length > 0;

// -> { course, newCourse, items } or { error }
// course is an existing course, newCourse is a name for one to make.
export function readQuick(text, courses, today) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  let course = null, newCourse = null;
  const at = words.findIndex((w) => (course = matchCourse(w, courses)));
  if (at >= 0) {
    words.splice(at, 1);
    if (at > 0 && STOP.has(words[at - 1].toLowerCase())) words.splice(at - 1, 1);
  } else {
    if (keyOf(words[0]) || looksLikeWhen(words[0])) return { error: 'Start with the class, like "chem quiz fri".' };
    newCourse = cap(words.shift());
  }

  const rest = resolveRelative(words.join(' '), today);
  const [y, mo, d] = today.split('-').map(Number);
  const { items } = parseOutline(rest, { today: new Date(y, mo - 1, d) });
  if (!items.length) {
    return { error: findDates(rest).length ? 'Add what it is, like "chem quiz fri".' : 'Add when it\'s due, like "fri" or "Nov 20".' };
  }
  return {
    course,
    newCourse,
    items: items.map((it) => ({ ...it, title: cap(it.title), type: it.type === 'other' ? 'assignment' : it.type, on: true, source: text.trim() })),
  };
}
