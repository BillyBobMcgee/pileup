// Groups items into weeks and finds the pileups. Pure functions, no DOM.
// Dates are 'YYYY-MM-DD' strings and all the maths is done in UTC so daylight saving can't shift a day.

const DAY = 86400000;
export const toDate = (iso) => new Date(iso + 'T00:00:00Z');
export const addDays = (iso, n) => new Date(toDate(iso).getTime() + n * DAY).toISOString().slice(0, 10);
// Weeks run Monday to Sunday.
export const weekStart = (iso) => addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7));

// A week is a pileup when 3 or more things are due and they add up to 20% or more,
// or when whatever is due adds up to 30% or more.
export const PILEUP_COUNT = 3;
export const PILEUP_COUNT_LOAD = 20;
export const PILEUP_LOAD = 30;
// A week this light is a good one to get ahead in.
export const LIGHT_LOAD = 10;
const MAX_WEEKS = 104;

// When an item has no weight, guess a load from what it is so it still shows on the map.
const GUESS = { exam: 15, project: 10, assignment: 5, quiz: 3, other: 2, info: 0 };
export const loadOf = (it) => (it.type === 'info' ? 0 : it.weight ?? GUESS[it.type] ?? 2);

// How many days ahead a "start now" reminder should land.
export function leadDays(it) {
  if (it.type === 'info') return 0;
  const load = loadOf(it);
  if (load >= 20 || it.type === 'exam') return 7;
  if (load >= 10 || it.type === 'project') return 3;
  return 0;
}

const round = (n) => Math.round(n * 10) / 10;

// items -> [{ start, items, due, load, known, unweighted, pileup, tip }], one per week with no gaps.
// `today` ('YYYY-MM-DD') stops tips from pointing at weeks that are already over.
export function buildWeeks(items, today = null) {
  const live = items.filter((it) => it.on && it.date).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  if (!live.length) return [];
  const weeks = [];
  const last = weekStart(live[live.length - 1].date);
  for (let s = weekStart(live[0].date); s <= last && weeks.length < MAX_WEEKS; s = addDays(s, 7)) {
    weeks.push({ start: s, items: [], due: 0, done: 0, load: 0, known: 0, unweighted: 0, pileup: false, tip: null });
  }
  const at = new Map(weeks.map((w, i) => [w.start, i]));
  for (const it of live) {
    const w = weeks[at.get(weekStart(it.date))];
    if (!w) continue;
    w.items.push(it);
    if (it.type === 'info') continue;
    // finished work still shows on the map but stops counting
    if (it.done) { w.done++; continue; }
    w.due++;
    w.load += loadOf(it);
    if (it.weight == null) w.unweighted++;
    else w.known += it.weight;
  }
  weeks.forEach((w, i) => {
    w.load = round(w.load);
    w.known = round(w.known);
    w.pileup = (w.due >= PILEUP_COUNT && w.load >= PILEUP_COUNT_LOAD) || w.load >= PILEUP_LOAD;
    if (w.pileup) w.tip = tipFor(weeks, i, today);
  });
  return weeks;
}

// Finds the nearest light week in the three before a pileup, and the biggest thing to get ahead on.
function tipFor(weeks, i, today) {
  const item = weeks[i].items.filter((it) => it.type !== 'info' && !it.done).sort((a, b) => loadOf(b) - loadOf(a))[0];
  for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
    const over = today && addDays(weeks[j].start, 6) < today;
    if (weeks[j].load <= LIGHT_LOAD && !over) return { week: weeks[j].start, item };
  }
  return null;
}

// The numbers for the headline: next pileup from today, the heaviest week, and how many pileups.
export function summarize(weeks, today) {
  const pileups = weeks.filter((w) => w.pileup);
  const next = pileups.find((w) => addDays(w.start, 6) >= today) || null;
  const worst = weeks.reduce((a, b) => (b.load > a.load || (b.load === a.load && b.due > a.due) ? b : a), weeks[0]) || null;
  return { next, worst, count: pileups.length };
}
