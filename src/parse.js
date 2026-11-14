// Turns pasted course-outline text into dated items. Pure functions, no DOM.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORD = '(?:st|nd|rd|th)?';
const WEEKDAY = '(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?';

// "Oct 3", "October 3rd, 2026", "Nov 9-13"
const RE_MD = new RegExp(`\\b${MONTH}(?:\\.\\s*|\\s+)(\\d{1,2})${ORD}(?!\\d|:\\d)(?:\\s*[-–]\\s*(\\d{1,2})${ORD}(?!\\d|\\.\\d|:\\d|\\s*%|\\s*[ap]\\.?m))?(?:,?\\s*(20\\d\\d)(?!\\d))?`, 'gi');
// "3 October", "22nd of Nov 2026"
const RE_DM = new RegExp(`(?<![\\d/.:-])(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH}\\b\\.?(?:,?\\s*(20\\d\\d)(?!\\d))?`, 'gi');
const RE_ISO = /\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/g;
// "10/03", "10/03/2026"
const RE_NUM = /(?<![\d/.-])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/%]|\s*(?:of|marks|points|pts)\b)/g;

const AP = '([ap])\\.?m\\.?';
const RE_TRANGE = new RegExp(`\\b(\\d{1,2})(?::(\\d\\d))?\\s*(?:${AP})?\\s*(?:-|–|to)\\s*(\\d{1,2})(?::(\\d\\d))?\\s*${AP}(?![a-z])`, 'i');
const RE_T12 = new RegExp(`\\b(\\d{1,2})(?::(\\d\\d))?\\s*${AP}(?![a-z])`, 'i');
const RE_T24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const RE_T24RANGE = /\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|–|to)\s*([01]?\d|2[0-3]):([0-5]\d)\b/;

const RE_EACH_X = /(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\.\d+)?)\s*%(?:\s*=\s*\d{1,3}(?:\.\d+)?\s*%)?/i;
const RE_EACH = /(\d{1,3}(?:\.\d+)?)\s*%\s*each/i;
const RE_PCT = /(\d{1,3}(?:\.\d+)?)\s*%/g;

// Placeholders left where a date, time or weight was cut out of a line.
const D = '\u0001', T = '\u0002', W = '\u0003', M = '\u0004';

const INFO = /\b(no (?:class|school|lab|lecture)(?:es|s)?|holiday|reading week|(?:spring|fall|winter|march|study|mid-?term) break|thanksgiving|class(?:es)? (?:begin|start|end|resume|cancell?ed)|first day|last day|p[ad] day|exam period|science fair)\b/i;
// Lines with a percent that are rules, not parts of the grade.
const NOT_SCHEME = /\b(late|penalt|per day|deduct|minimum|at least|to pass|attendance|drop(?:ped)?|lowest|bonus|or (?:higher|above))/i;

// Page furniture that happens to carry a date.
const NOISE = /\b(last (?:updated|modified|revised)|posted|copyright|office hours)\b|^edited\b|©/i;

// What kind of work a title names. Order matters: "final essay" is an essay, not a final.
const KEYS = [
  ['essay', 'essay|paper'],
  ['presentation', 'presentation|seminar'],
  ['lab', 'lab'],
  ['project', 'project|culminating|summative|isu'],
  ['midterm', 'mid-?term'],
  ['final', 'final'],
  ['exam', 'exam(?:ination)?'],
  ['test', 'test'],
  ['quiz', 'quiz(?:ze)?'],
  ['assignment', 'assignment|homework|hw|problem set|pset'],
].map(([key, words]) => [key, new RegExp(`\\b(?:${words})s?\\b(?:\\s*#?(\\d+)\\b)?`, 'i')]);

export function keyOf(title) {
  for (const [key, re] of KEYS) {
    const m = title.match(re);
    if (m) return m[1] ? `${key} ${m[1]}` : key;
  }
  return null;
}
const baseKey = (title) => keyOf(title)?.split(' ')[0] ?? null;

function typeOf(title, line) {
  if (INFO.test(title)) return 'info';
  const k = baseKey(title);
  if (['midterm', 'final', 'exam', 'test'].includes(k)) return 'exam';
  if (k === 'quiz') return 'quiz';
  if (['essay', 'presentation', 'lab', 'project'].includes(k) || /\b(report|portfolio|proposal|draft|speech)\b/i.test(title)) return 'project';
  if (k === 'assignment' || /\b(due|submit|hand in|worksheet|exercise|deadline)\b/i.test(line)) return 'assignment';
  return 'other';
}

const validDay = (month, day) => month >= 0 && month < 12 && day >= 1 && day <= DAYS_IN[month];
const monthIndex = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());
// "may" is also a verb, so only count it as a month when capitalised.
const realMonth = (name) => name.toLowerCase() !== 'may' || name === 'May' || name === 'MAY';
const pad = (n) => String(n).padStart(2, '0');
const round = (n) => Math.round(n * 10) / 10;

// Finds every date in a line. Returns [{ at, len, month, day, year, endDay }] in order.
export function findDates(line, dayFirst = false) {
  const out = [];
  let s = line;
  const take = (re, read) => {
    s = s.replace(re, (...a) => {
      const d = read(a);
      if (!d || !validDay(d.month, d.day)) return a[0];
      out.push({ at: a[a.length - 2], len: a[0].length, year: null, endDay: null, ...d });
      return ' '.repeat(a[0].length); // blank it so a later pattern can't match it again
    });
  };
  take(RE_ISO, (a) => ({ year: +a[1], month: +a[2] - 1, day: +a[3] }));
  take(RE_MD, (a) => {
    if (!realMonth(a[1])) return null;
    const month = monthIndex(a[1]), day = +a[2], end = a[3] ? +a[3] : null;
    return { month, day, endDay: end > day && validDay(month, end) ? end : null, year: a[4] ? +a[4] : null };
  });
  take(RE_DM, (a) => (realMonth(a[2]) ? { month: monthIndex(a[2]), day: +a[1], year: a[3] ? +a[3] : null } : null));
  take(RE_NUM, (a) => {
    if (a[0] === '24/7') return null;
    const [first, second] = [+a[1], +a[2]];
    const year = a[3] ? (a[3].length === 2 ? 2000 + +a[3] : +a[3]) : null;
    return dayFirst ? { month: second - 1, day: first, year } : { month: first - 1, day: second, year };
  });
  return out.sort((a, b) => a.at - b.at);
}

// Looks for "2026-2027" or "Fall 2026" and returns the year the school year starts in.
function schoolYearIn(text) {
  for (const m of text.matchAll(/\b(20\d\d)\s*[-–/]\s*(?:20)?(\d\d)\b/g)) {
    if ((+m[1] + 1) % 100 === +m[2]) return +m[1];
  }
  const m = text.match(/\b(fall|autumn|winter|spring|summer)\s+(?:term\s+|semester\s+)?(20\d\d)\b/i);
  if (m) return /fall|autumn/i.test(m[1]) ? +m[2] : +m[2] - 1;
  return null;
}

// A date with no year belongs to the school year: Aug to Dec in the first year, Jan to Jul in the second.
const isoOf = (d, startYear, day = d.day) => `${d.year ?? (d.month >= 7 ? startYear : startYear + 1)}-${pad(d.month + 1)}-${pad(day)}`;

function to24(h, min, ap) {
  h = +h;
  if (h < 1 || h > 12) return null;
  return `${pad((h % 12) + (ap.toLowerCase() === 'p' ? 12 : 0))}:${min || '00'}`;
}

// Pulls the time, weight and a clean title out of one line.
function readLine(line, dates) {
  let s = line;
  for (const d of [...dates].reverse()) s = s.slice(0, d.at) + D + s.slice(d.at + d.len);
  s = s
    .replace(new RegExp(`\\b${WEEKDAY}\\b\\.?,?\\s*(?=${D})`, 'gi'), '')
    .replace(new RegExp(`${D}\\s*\\(?\\b${WEEKDAY}\\b\\.?\\)?`, 'gi'), D);
  const between = new RegExp(`${D}\\s*(?:-|–|—|to|through|thru|until)\\s*${D}`, 'i');
  const range = dates.length === 2 && between.test(s);
  if (range) s = s.replace(between, D);

  let time = null, endTime = null;
  s = s.replace(RE_TRANGE, (m, h1, m1, ap1, h2, m2, ap2) => {
    const end = to24(h2, m2, ap2);
    let start = to24(h1, m1, ap1 || ap2);
    if (!ap1 && start > end) start = to24(h1, m1, ap2.toLowerCase() === 'p' ? 'a' : 'p');
    if (!start || !end) return m;
    time = start; endTime = end;
    return T;
  });
  if (!time) s = s.replace(RE_T12, (m, h, min, ap) => ((time = to24(h, min, ap)) ? T : m));
  if (!time && dates.length) s = s.replace(RE_T24RANGE, (m, h1, m1, h2, m2) => { time = `${pad(+h1)}:${m1}`; endTime = `${pad(+h2)}:${m2}`; return T; });
  if (!time && dates.length) s = s.replace(RE_T24, (m, h, min) => { time = `${pad(+h)}:${min}`; return T; });
  if (!time) s = s.replace(/\b(noon|midnight)\b/i, (m) => { time = /noon/i.test(m) ? '12:00' : '23:59'; return T; });

  let weight = null, each = false;
  s = s.replace(RE_EACH_X, (m, n, w) => { weight = +w; each = true; return W; });
  s = s.replace(RE_EACH, (m, w) => { if (weight == null) { weight = +w; each = true; } return W; });
  s = s.replace(RE_PCT, (m, w) => { if (weight == null) weight = +w; return W; });
  if (weight > 100) weight = null;

  // Drop the words that led into a date ("due on", "worth"), then the holes themselves.
  let title = s
    .replace(new RegExp(`(?:\\b(?:is|are|will be|due|on|by|at|before|until|from|worth|dates?|deadline|held|run|runs)\\b[\\s:,-]*)+(?=[${D}${T}${W}])`, 'gi'), '')
    .replace(/[\u0001-\u0003]/g, M)
    .replace(new RegExp(`[\\s,;:\\-–—(=]*${M}(?:[\\s,;:\\-–—()=]*${M})*[\\s,;:\\-–—)]*`, 'g'), (m, at, all) => (at === 0 || at + m.length === all.length || all[at + m.length] === '(' ? ' ' : ', '))
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.\-–—•*·▪●◦>]+|[\s,;:.\-–—(]+$/g, '')
    .replace(/^\d{1,3},\s*/, ''); // a row number from a schedule table
  if (/^(?:due(?: dates?)?|dates?|deadline|when|worth|weight)$/i.test(title)) title = '';
  if ((title.match(/\(/g) || []).length > (title.match(/\)/g) || []).length) title += ')';
  if (title.length > 90) title = title.slice(0, 89).trimEnd() + '…';
  return { title, time, endTime, weight, each, range };
}

// Splits a paragraph into sentences so each date keeps only its own words.
// A full stop after an abbreviation ("Thurs. Oct 3", "Mr. Lee") is not the end of a sentence.
const ABBREV = /\b(?:mon|tues?|wed|thu(?:rs?)?|fri|sat|sun|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec|mr|mrs|ms|dr|prof|no|vs|etc|approx|ch|pg|pp|sec|rm|st)\.$/i;
function sentences(line) {
  const out = [];
  for (const part of line.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ' ' + part;
    else out.push(part);
  }
  return out;
}

// text -> { items, scheme, startYear }
// item: { title, date, end, time, endTime, weight, est, type, on, source }
export function parseOutline(text, opts = {}) {
  text = String(text);
  const today = opts.today || new Date();
  const lines = text.split(/\r?\n/).flatMap((l) => sentences(l.replace(/[\t |]+/g, '  ').trim()));
  // If any slash date starts with a number over 12, the outline writes day/month.
  const dayFirst = opts.dayFirst ?? /(?<![\d/])(?:1[3-9]|2\d|3[01])\/(?:0?[1-9]|1[0-2])(?![\d])/.test(text.replace(/24\/7/g, ''));
  const found = lines.map((line) => findDates(line, dayFirst));
  const withYear = found.flat().find((d) => d.year);
  const startYear = opts.startYear ?? schoolYearIn(text)
    ?? (withYear ? (withYear.month >= 7 ? withYear.year : withYear.year - 1) : null)
    ?? (today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1);

  const items = [], scheme = [];
  let prev = null; // last line with no date, used when a date sits on a line of its own
  lines.forEach((line, n) => {
    if (!line || NOISE.test(line)) return;
    const dates = found[n];
    const info = readLine(line, dates);
    if (!dates.length) {
      const key = keyOf(info.title);
      if (info.weight != null && key && !NOT_SCHEME.test(line) && line.length <= 80) {
        scheme.push({ label: info.title, key, weight: info.weight, each: info.each, matched: 0 });
      }
      prev = info;
      return;
    }
    let { title, weight, each } = info;
    if (!title && prev?.title && prev.title.length <= 80) {
      title = prev.title;
      if (weight == null) ({ weight, each } = prev);
    }
    const type = typeOf(title, line);
    // A bare date with nothing to say about it is not worth showing.
    if (!title && weight == null && type === 'other') { prev = null; return; }
    title ||= 'Untitled';
    const starts = info.range ? [dates[0]] : dates;
    starts.forEach((d, i) => {
      const date = isoOf(d, startYear);
      let end = info.range ? isoOf(dates[1], startYear) : d.endDay ? isoOf(d, startYear, d.endDay) : null;
      if (end && end <= date) end = null;
      const split = weight != null && !each && starts.length > 1;
      items.push({
        title: starts.length > 1 ? `${title} (${i + 1}/${starts.length})` : title,
        date, end, time: info.time, endTime: info.endTime,
        weight: weight == null ? null : round(split ? weight / starts.length : weight),
        est: split,
        type,
        on: type !== 'other' || weight != null,
        source: line,
      });
    });
    prev = null;
  });

  // Fill in missing weights from the grade breakdown ("Quizzes 10%").
  // Numbered lines ("Assignment 2 10%") go first so they win over the general ones.
  const numbered = (s) => /\d$/.test(s.key);
  for (const s of [...scheme].sort((a, b) => numbered(b) - numbered(a))) {
    const hits = items.filter((it) => it.weight == null && it.type !== 'info'
      && (numbered(s) ? keyOf(it.title) === s.key : baseKey(it.title) === s.key));
    const split = !s.each && hits.length > 1;
    for (const it of hits) {
      it.weight = round(split ? s.weight / hits.length : s.weight);
      it.est = split;
      it.on = true;
    }
    s.matched = hits.length;
  }

  const seen = new Set();
  const unique = items.filter((it) => {
    const k = `${it.date}|${it.title.toLowerCase()}`;
    return seen.has(k) ? false : seen.add(k);
  });
  unique.sort((a, b) => a.date.localeCompare(b.date));
  return { items: unique, scheme, startYear };
}

// Rebuilds lines of text from pdf.js text items, which arrive as loose positioned fragments.
export function linesFromPdfItems(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, cells: [] }));
    row.cells.push({ x, end: x + (it.width || 0), str: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.cells.sort((a, b) => a.x - b.x);
    return r.cells.reduce((line, c, i) => {
      const gap = i ? c.x - r.cells[i - 1].end : 0;
      return line + (i === 0 || gap < 1.5 ? '' : gap > 14 ? '   ' : ' ') + c.str;
    }, '').trim();
  }).join('\n');
}
