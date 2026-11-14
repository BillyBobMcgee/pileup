import test from 'node:test';
import assert from 'node:assert/strict';
import { readQuick, resolveRelative, matchCourse } from '../src/quick.js';
import { buildWeeks } from '../src/plan.js';
import { toICS } from '../src/ics.js';

const COURSES = [{ name: 'SCH4U Chemistry' }, { name: 'MCV4U Calculus' }, { name: 'ENG4U English' }];
const SAT = '2026-11-14', MON = '2026-11-16', FRI = '2026-11-20';
const quick = (text, today = SAT, courses = COURSES) => readQuick(text, courses, today);
const one = (text, today) => quick(text, today).items[0];

test('relative dates', () => {
  assert.equal(resolveRelative('quiz tomorrow', SAT), 'quiz 2026-11-15');
  assert.equal(resolveRelative('quiz today', SAT), 'quiz 2026-11-14');
  assert.equal(resolveRelative('quiz in 3 days', SAT), 'quiz 2026-11-17');
  assert.equal(resolveRelative('quiz in 2 weeks', SAT), 'quiz 2026-11-28');
  assert.equal(resolveRelative('quiz fri', MON), 'quiz 2026-11-20');
  assert.equal(resolveRelative('quiz next fri', MON), 'quiz 2026-11-27');
  assert.equal(resolveRelative('quiz wednesday', MON), 'quiz 2026-11-18');
  // the same day name means next week, unless you say "this"
  assert.equal(resolveRelative('quiz fri', FRI), 'quiz 2026-11-27');
  assert.equal(resolveRelative('quiz this fri', FRI), 'quiz 2026-11-20');
  // a real date wins over the day name next to it
  assert.equal(resolveRelative('quiz Fri Nov 27', MON), 'quiz Fri Nov 27');
  assert.equal(resolveRelative('quiz', MON), 'quiz');
});

test('matches a class from part of its name', () => {
  assert.equal(matchCourse('chem', COURSES).name, 'SCH4U Chemistry');
  assert.equal(matchCourse('SCH4U', COURSES).name, 'SCH4U Chemistry');
  assert.equal(matchCourse('calc', COURSES).name, 'MCV4U Calculus');
  assert.equal(matchCourse('eng', COURSES).name, 'ENG4U English');
  assert.equal(matchCourse('bio', COURSES), null);
  assert.equal(matchCourse('c', COURSES), null);
});

test('reads one typed line', () => {
  const r = quick('chem lab report fri 10%');
  assert.equal(r.course.name, 'SCH4U Chemistry');
  assert.deepEqual([r.items[0].title, r.items[0].date, r.items[0].weight, r.items[0].type, r.items[0].on], ['Lab report', FRI, 10, 'project', true]);
  const essay = one('english essay due tomorrow at 11:59pm 15%');
  assert.deepEqual([essay.title, essay.date, essay.time, essay.weight], ['Essay', '2026-11-15', '23:59', 15]);
  assert.deepEqual([one('quiz for chem thursday').title, one('quiz for chem thursday').date], ['Quiz', '2026-11-19']);
  assert.equal(one('calc test next tue', MON).date, '2026-11-24');
  assert.equal(one('eng essay jan 8').date, '2027-01-08');
  assert.equal(one('calc worksheet fri').type, 'assignment');
});

test('a class it does not know becomes a new one', () => {
  const r = quick('bio lab report in 3 days', SAT, []);
  assert.deepEqual([r.course, r.newCourse, r.items[0].title, r.items[0].date], [null, 'Bio', 'Lab report', '2026-11-17']);
});

test('says what is missing', () => {
  assert.equal(quick(''), null);
  assert.match(quick('quiz fri', SAT, []).error, /Start with the class/);
  assert.match(quick('fri chem quiz', SAT, []).error, /Start with the class/);
  assert.match(quick('chem fri').error, /Add what it is/);
  assert.match(quick('chem lab report').error, /Add when/);
});

test('ticked-off items stop counting but stay on the map', () => {
  const item = (id, date, weight, done = false) => ({ id, title: id, date, weight, type: 'exam', on: true, done });
  const items = [item('a', '2026-11-16', 15), item('b', '2026-11-17', 10), item('c', '2026-11-18', 10)];
  assert.equal(buildWeeks(items)[0].pileup, true);
  items[0].done = true;
  const [w] = buildWeeks(items);
  assert.deepEqual([w.pileup, w.due, w.done, w.load, w.items.length], [false, 2, 1, 20, 3]);
  const ics = toICS([{ name: 'Chem', items }], { now: new Date('2026-11-14T12:00:00Z') });
  assert.equal(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT').length, 2);
});
