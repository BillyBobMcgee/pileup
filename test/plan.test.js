import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeks, summarize, weekStart, addDays, loadOf, leadDays } from '../src/plan.js';
import { toICS } from '../src/ics.js';
import { parseOutline } from '../src/parse.js';
import { SAMPLES } from '../src/samples.js';

const item = (date, weight, type = 'assignment', extra = {}) => ({ id: `${date}-${weight}-${type}`, title: `${type} ${date}`, date, weight, type, on: true, ...extra });

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-11-16'), '2026-11-16'); // a Monday
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // the Sunday after
  assert.equal(weekStart('2027-01-01'), '2026-12-28'); // across new year
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-11-01', 7), '2026-11-08'); // across the clock change
});

test('builds every week from first to last, empty ones included', () => {
  const weeks = buildWeeks([item('2026-10-01', 5), item('2026-10-22', 5)]);
  assert.deepEqual(weeks.map((w) => w.start), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
  assert.deepEqual(weeks.map((w) => w.due), [1, 0, 0, 1]);
});

test('marks a pileup in both directions', () => {
  const flag = (items) => buildWeeks(items)[0].pileup;
  // three things worth 20% or more
  assert.equal(flag([item('2026-10-05', 5), item('2026-10-06', 5), item('2026-10-07', 10)]), true);
  // three small things are not a pileup
  assert.equal(flag([item('2026-10-05', 3), item('2026-10-06', 3), item('2026-10-07', 3)]), false);
  // one big thing worth 30% or more
  assert.equal(flag([item('2026-10-05', 30, 'exam')]), true);
  assert.equal(flag([item('2026-10-05', 29, 'exam')]), false);
  // two things that add up to 30%
  assert.equal(flag([item('2026-10-05', 15), item('2026-10-09', 15)]), true);
});

test('unticked and ungraded items do not count', () => {
  const [w] = buildWeeks([item('2026-10-05', 30, 'exam', { on: false }), item('2026-10-06', null, 'info'), item('2026-10-07', 5)]);
  assert.deepEqual([w.due, w.load, w.pileup, w.items.length], [1, 5, false, 2]);
});

test('items with no weight get a guessed load by kind', () => {
  assert.equal(loadOf(item('2026-10-05', null, 'exam')), 15);
  assert.equal(loadOf(item('2026-10-05', 0, 'exam')), 0);
  const [w] = buildWeeks([item('2026-10-05', null, 'exam'), item('2026-10-06', null, 'exam')]);
  assert.deepEqual([w.pileup, w.known, w.unweighted], [true, 0, 2]);
});

test('tips point at the nearest light week that is not over', () => {
  const items = [item('2026-10-06', 5), item('2026-10-13', 20), item('2026-10-27', 30, 'exam')];
  // Oct 19 is empty, so that is the week to get ahead in
  assert.equal(buildWeeks(items, '2026-10-01').at(-1).tip.week, '2026-10-19');
  assert.equal(buildWeeks(items, '2026-10-01').at(-1).tip.item.weight, 30);
  // once Oct 19 has passed there is no light week left to suggest
  assert.equal(buildWeeks(items, '2026-10-26').at(-1).tip, null);
  // a heavy week before a pileup is not suggested
  const busy = [item('2026-10-13', 20), item('2026-10-20', 30, 'exam')];
  assert.equal(buildWeeks(busy, '2026-10-01').at(-1).tip, null);
});

test('summary finds the next pileup from today and the heaviest week', () => {
  const weeks = buildWeeks([item('2026-10-06', 30, 'exam'), item('2026-11-03', 35, 'exam'), item('2026-12-01', 60, 'exam')]);
  const s = summarize(weeks, '2026-10-20');
  assert.deepEqual([s.next.start, s.worst.start, s.count], ['2026-11-02', '2026-11-30', 3]);
  assert.equal(summarize(weeks, '2026-12-20').next, null);
  // a pileup week still counts as next on its last day
  assert.equal(summarize(weeks, '2026-11-08').next.start, '2026-11-02');
});

test('the sample courses give the pileups the demo shows', () => {
  const items = SAMPLES.flatMap((s) => parseOutline(s.text, { today: new Date(2026, 10, 14) }).items);
  const weeks = buildWeeks(items, '2026-11-14');
  assert.deepEqual(weeks.filter((w) => w.pileup).map((w) => w.start), ['2026-11-16', '2026-12-14', '2027-01-11', '2027-01-25']);
  const nov = weeks.find((w) => w.start === '2026-11-16');
  assert.deepEqual([nov.due, nov.known, nov.tip.week], [5, 41, '2026-11-09']);
});

test('heads-up lead time grows with the weight', () => {
  assert.equal(leadDays(item('2026-10-05', 25)), 7);
  assert.equal(leadDays(item('2026-10-05', 5, 'exam')), 7);
  assert.equal(leadDays(item('2026-10-05', 10)), 3);
  assert.equal(leadDays(item('2026-10-05', 5)), 0);
  assert.equal(leadDays(item('2026-10-05', null, 'info')), 0);
});

// ---- calendar file ----

const course = (items) => [{ name: 'Chem; 101, A', items }];
const ics = (items, opts) => toICS(course(items), { now: new Date('2026-11-14T12:00:00Z'), ...opts });
const unfold = (text) => text.replace(/\r\n /g, '');

test('writes a well-formed calendar', () => {
  const text = ics([item('2026-10-05', 10)]);
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  assert.equal(text.split('\r\n').filter((l) => l === 'BEGIN:VEVENT').length, 1);
  assert.ok(!/[^\r]\n/.test(text), 'every line ends with CRLF');
  for (const line of text.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(text, /DTSTAMP:20261114T120000Z/);
});

test('all-day items end the day after, across a month end', () => {
  const text = ics([item('2026-10-31', 10)]);
  assert.match(text, /DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101/);
  const range = ics([item('2026-12-21', null, 'info', { end: '2027-01-01' })]);
  assert.match(range, /DTSTART;VALUE=DATE:20261221\r\nDTEND;VALUE=DATE:20270102/);
  assert.doesNotMatch(range, /VALARM/); // no reminder for a holiday
});

test('timed items use local time', () => {
  const text = ics([item('2027-01-28', 25, 'exam', { time: '09:00', endTime: '11:00' })]);
  assert.match(text, /DTSTART:20270128T090000\r\nDTEND:20270128T110000/);
  assert.match(text, /TRIGGER:-P1D/);
});

test('escapes text and folds long lines without losing any', () => {
  const long = 'Essay; part 1, "Öl" \\ ' + 'é'.repeat(80);
  const text = ics([item('2026-10-05', 10, 'project', { title: long })]);
  const summary = unfold(text).split('\r\n').find((l) => l.startsWith('SUMMARY:'));
  assert.equal(summary, 'SUMMARY:Chem\\; 101\\, A: Essay\\; part 1\\, "Öl" \\\\ ' + 'é'.repeat(80) + ' (10%)');
});

test('skips unticked items and adds heads-ups only when asked', () => {
  const items = [item('2026-10-05', 25, 'exam'), item('2026-10-06', 5), item('2026-10-07', 40, 'exam', { on: false })];
  const count = (text) => text.split('\r\n').filter((l) => l === 'BEGIN:VEVENT').length;
  assert.equal(count(ics(items)), 2);
  const withHeadsUp = unfold(ics(items, { headsUp: true }));
  assert.equal(count(withHeadsUp), 3);
  assert.match(withHeadsUp, /DTSTART;VALUE=DATE:20260928\r\nDTEND;VALUE=DATE:20260929\r\nTRANSP:TRANSPARENT\r\nSUMMARY:Study for: exam 2026-10-05 \(Chem\\; 101\\, A\\, Oct 5\)/);
  const uids = withHeadsUp.split('\r\n').filter((l) => l.startsWith('UID:'));
  assert.equal(new Set(uids).size, uids.length);
});
