import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOutline, findDates, keyOf, linesFromPdfItems } from '../src/parse.js';
import { SAMPLES } from '../src/samples.js';

const NOV = new Date(2026, 10, 14);
const parse = (text, opts) => parseOutline(text, { today: NOV, ...opts }).items;
const one = (text, opts) => parse(text, opts)[0];

test('reads the common ways of writing a date', () => {
  const cases = {
    'Essay due Oct 3': '2026-10-03',
    'Essay due October 3rd': '2026-10-03',
    'Essay due Oct. 3, 2025': '2025-10-03',
    'Essay due 3 October': '2026-10-03',
    'Essay due the 3rd of October 2025': '2025-10-03',
    'Essay due 2026-10-03': '2026-10-03',
    'Essay due 10/03': '2026-10-03',
    'Essay due 10/03/25': '2025-10-03',
    'Essay due Friday, Sept 25': '2026-09-25',
  };
  for (const [line, date] of Object.entries(cases)) assert.equal(one(line)?.date, date, line);
});

test('a date with no year lands in the current school year', () => {
  assert.equal(one('Test Sept 12').date, '2026-09-12');
  assert.equal(one('Test Jan 20').date, '2027-01-20');
  assert.equal(one('Test June 15').date, '2027-06-15');
  // in March the school year started the autumn before
  assert.equal(one('Test Sept 12', { today: new Date(2027, 2, 1) }).date, '2026-09-12');
  assert.equal(one('Test Apr 2', { today: new Date(2027, 2, 1) }).date, '2027-04-02');
});

test('a year written in the outline beats today', () => {
  assert.equal(parse('Fall 2024\nTest Sept 12')[0].date, '2024-09-12');
  assert.equal(parse('Winter 2025\nTest Feb 3')[0].date, '2025-02-03');
  assert.equal(parse('Course outline 2023-2024\nTest Jan 9')[0].date, '2024-01-09');
  assert.equal(parse('First class: September 5, 2023\nTest Jan 9')[1].date, '2024-01-09');
});

test('slash dates switch to day/month when the outline uses it', () => {
  assert.equal(one('Test 05/11').date, '2026-05-11'.replace('2026', '2027'));
  const items = parse('Test 25/11\nQuiz 05/12');
  assert.deepEqual(items.map((it) => it.date), ['2026-11-25', '2026-12-05']);
});

test('does not invent dates', () => {
  for (const line of ['Students may 3 times resubmit', 'Worth 2/3 of the unit', 'Open 24/7', 'Score 18/20 to pass', 'Chapter 3 to 5', 'Lab 2 in room 14', 'May include a quiz']) {
    assert.equal(parse(line).length, 0, line);
  }
  assert.equal(findDates('Feb 30').length, 0);
});

test('cleans the title', () => {
  const cases = {
    'Assignment 1 — due Fri, Oct 3 at 11:59pm (10%)': 'Assignment 1',
    'Oct 22: Midterm exam (25%), in class': 'Midterm exam, in class',
    'Lab Report 2 | Nov 5 | 7.5%': 'Lab Report 2',
    '• Quiz 3 - Thursday November 12': 'Quiz 3',
    'Final exam will be held on December 15': 'Final exam',
    '11/20\tUnit test: Rates and equilibrium\t9%': 'Unit test: Rates and equilibrium',
    'Essay on Hamlet (due Oct 9)': 'Essay on Hamlet',
  };
  for (const [line, title] of Object.entries(cases)) assert.equal(one(line).title, title, line);
});

test('reads weights and times', () => {
  const a = one('Assignment 1 — due Fri, Oct 3 at 11:59pm (10%)');
  assert.deepEqual([a.weight, a.time], [10, '23:59']);
  assert.equal(one('Lab Report 2 | Nov 5 | 7.5%').weight, 7.5);
  const exam = one('Final exam: Thursday, January 28, 9:00 - 11:00 am (25%)');
  assert.deepEqual([exam.time, exam.endTime, exam.weight], ['09:00', '11:00', 25]);
  assert.deepEqual([one('Exam Dec 3, 11:30 - 1:30 pm').time, one('Exam Dec 3, 11:30 - 1:30 pm').endTime], ['11:30', '13:30']);
  assert.equal(one('Essay due Oct 9 by midnight').time, '23:59');
  assert.equal(one('Quiz Oct 9 at 14:15').time, '14:15');
  assert.equal(one('Quiz Oct 9').time, null);
});

test('reads ranges as one item with an end date', () => {
  assert.deepEqual([one('Reading week: Oct 12-16').date, one('Reading week: Oct 12-16').end], ['2026-10-12', '2026-10-16']);
  const brk = one('Winter break: Dec 21 - Jan 1');
  assert.deepEqual([brk.date, brk.end, brk.title, brk.type], ['2026-12-21', '2027-01-01', 'Winter break', 'info']);
  assert.equal(one('Presentations Jan 12 to Jan 15 (10%)').title, 'Presentations');
  // a dash before a weight or a time is not a range
  assert.equal(one('Lab 2 Nov 5 – 7.5%').end, null);
  assert.equal(one('Lab 2 Nov 5 - 5pm').end, null);
});

test('several dates on one line become several items', () => {
  const items = parse('Quizzes: Sept 18, Oct 2, Oct 16, Oct 30 (5% each)');
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((it) => it.weight), [5, 5, 5, 5]);
  assert.equal(items[0].title, 'Quizzes (1/4)');
  const split = parse('Labs: Oct 1, Oct 15 (10%)');
  assert.deepEqual(split.map((it) => [it.weight, it.est]), [[5, true], [5, true]]);
});

test('a date on its own line takes the title above it', () => {
  const it = one('Assignment 1 (10%)\nDue: Oct 3');
  assert.deepEqual([it.title, it.weight], ['Assignment 1', 10]);
});

test('a paragraph is read one sentence at a time', () => {
  const items = parse('Late work loses 10% per day. Students may 3 times resubmit labs. No classes Dec 21 - Jan 1 (winter break). The essay is due Thurs. Oct 8 (20%).');
  assert.deepEqual(items.map((it) => [it.title, it.date, it.weight, it.type]), [
    ['The essay', '2026-10-08', 20, 'project'],
    ['No classes (winter break)', '2026-12-21', null, 'info'],
  ]);
  assert.equal(one('Assignment 1. Due Oct 3.').title, 'Assignment 1');
});

test('sorts items into kinds', () => {
  const kind = (line) => one(line).type;
  assert.equal(kind('Midterm Oct 22'), 'exam');
  assert.equal(kind('Unit 3 Test Nov 18'), 'exam');
  assert.equal(kind('Quiz 2 Nov 26'), 'quiz');
  assert.equal(kind('Final essay due Dec 4'), 'project');
  assert.equal(kind('Lab 1: Titration report Sept 29'), 'project');
  assert.equal(kind('Assignment 3 due Dec 4'), 'assignment');
  assert.equal(kind('Worksheet 4 due Dec 4'), 'assignment');
  assert.equal(kind('No class Oct 12 (Thanksgiving)'), 'info');
  assert.equal(kind('Sept 8: Introduction to limits'), 'other');
});

test('lecture lines are found but left unticked', () => {
  const items = parse('Sept 8: Introduction to limits\nSept 10: Quiz 1');
  assert.deepEqual(items.map((it) => it.on), [false, true]);
});

test('fills weights from the grade breakdown', () => {
  const items = parse(`Tests 40%
Assignments 4 x 2.5% = 10%
Final exam 30%
Assignment 2 5%
Late assignments lose 10% per day
Test 1 Oct 1
Test 2 Nov 1
Assignment 1 due Oct 5
Assignment 2 due Oct 19
Final exam Jan 26`);
  const by = Object.fromEntries(items.map((it) => [it.title, it]));
  assert.deepEqual([by['Test 1'].weight, by['Test 1'].est], [20, true]);
  assert.deepEqual([by['Assignment 1'].weight, by['Assignment 1'].est], [2.5, false]);
  assert.equal(by['Assignment 2'].weight, 5); // the numbered line wins
  assert.equal(by['Final exam'].weight, 30);
});

test('keyOf names the kind of work', () => {
  assert.equal(keyOf('Final exam'), 'final');
  assert.equal(keyOf('Final essay'), 'essay');
  assert.equal(keyOf('Assignment 2'), 'assignment 2');
  assert.equal(keyOf('Quizzes'), 'quiz');
  assert.equal(keyOf('Participation'), null);
});

test('the sample outlines parse fully', () => {
  const [calc, chem, eng] = SAMPLES.map((s) => parse(s.text));
  const total = (items) => items.reduce((sum, it) => sum + (it.weight || 0), 0);
  assert.equal(calc.length, 13);
  assert.equal(total(calc), 100);
  assert.equal(chem.length, 12);
  assert.equal(total(chem), 100);
  assert.equal(eng.length, 9);
  assert.equal(total(eng), 95);
  for (const it of [...calc, ...chem, ...eng]) {
    assert.ok(it.on, it.title);
    assert.match(it.date, /^202[67]-\d\d-\d\d$/);
    assert.doesNotMatch(it.title, /[\u0001-\u0004]|^Untitled$/);
  }
  assert.equal(calc.at(-1).date, '2027-01-26');
});

test('rebuilds lines from PDF text fragments', () => {
  const item = (str, x, y, width) => ({ str, width, transform: [1, 0, 0, 1, x, y] });
  const text = linesFromPdfItems([
    item('Weight', 400, 700, 40), item('Item', 100, 700, 25),
    item('10%', 400, 680.5, 20), item('Assign', 100, 680, 36), item('ment 1', 136, 680, 34), item('Oct 3', 250, 680, 30),
    item(' ', 0, 660, 3),
  ]);
  assert.equal(text, 'Item   Weight\nAssignment 1   Oct 3   10%');
  assert.equal(one(text).title, 'Assignment 1');
});
