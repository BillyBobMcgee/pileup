// The page: keeps the list of courses, draws the course cards and the term map.

import { parseOutline, linesFromPdfItems } from './parse.js?v=3';
import { buildWeeks, summarize, weekStart, addDays } from './plan.js?v=3';
import { toICS } from './ics.js?v=3';
import { SAMPLES } from './samples.js?v=3';
import { readQuick, matchCourse } from './quick.js?v=3';

const STORE = 'pileup.v1';
const COLORS = ['#2257b8', '#1f7a4d', '#6d3fb0', '#a66a00', '#0c7c86', '#b02a78'];
const TYPES = { exam: 'Test or exam', quiz: 'Quiz', project: 'Project', assignment: 'Assignment', other: 'Other', info: 'Not graded' };

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmt = (iso, opts) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const shortDate = (iso) => fmt(iso, { month: 'short', day: 'numeric' });
const clock = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
const num = (n) => String(Math.round(n * 10) / 10);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// "MCV4U Calculus" -> "MCV4U". Falls back to the start of the name.
const shortName = (name) => name.match(/\b[A-Za-z]{2,4}\s?\d{1,4}[A-Za-z]?\d?\b/)?.[0] || name.slice(0, 14);

let state = { courses: [], headsUp: true, showPast: false };
try { state = { ...state, ...JSON.parse(localStorage.getItem(STORE)) }; } catch { /* first visit or storage blocked */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* still works without saving */ } };
let removed = null; // last removed course, kept for Undo

const say = (html) => { $('#status').innerHTML = html; };

const nextColor = () => {
  const used = state.courses.map((c) => c.color);
  return COLORS.find((c) => !used.includes(c)) || COLORS[state.courses.length % COLORS.length];
};

function makeCourse(name, text, items) {
  const course = { id: uid(), name, color: nextColor(), text, items: items.map((it) => ({ id: uid(), ...it })) };
  state.courses.push(course);
  return course;
}

// "chem" or "Chem" finds the Chem class you already have. Longer names have to match exactly,
// so "Chemistry 12" doesn't land in "Chemistry 11".
function findByName(name) {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return state.courses.find((c) => c.name.trim().toLowerCase() === n) || (/\s/.test(n) ? null : matchCourse(n, state.courses));
}

// Adds the dates from an outline to a class you already have, skipping ones it already has.
function addToCourse(course, text) {
  const { items } = parseOutline(text);
  const have = new Set(course.items.map((it) => `${it.date}|${it.title.toLowerCase()}`));
  const fresh = items.filter((it) => !have.has(`${it.date}|${it.title.toLowerCase()}`));
  course.items.push(...fresh.map((it) => ({ id: uid(), ...it })));
  course.text = course.text ? `${course.text}\n\n${text}` : text;
  return { found: items.length, added: fresh.length };
}

function addCourse(name, text) {
  const { items } = parseOutline(text);
  if (!items.length) return null;
  return makeCourse(name || text.trim().split('\n')[0].trim().slice(0, 40) || 'Course', text, items);
}

// ---- course cards ----

function metaOf(course) {
  const on = course.items.filter((it) => it.on);
  const dated = on.reduce((sum, it) => sum + (it.type === 'info' ? 0 : it.weight || 0), 0);
  return `${plural(on.length, 'date')}${dated ? `, ${num(dated)}% of the grade` : ''}`;
}

function rowHTML(it) {
  return `<li class="row${it.on ? '' : ' off'}" data-item="${it.id}">
    <input type="checkbox" data-f="on" ${it.on ? 'checked' : ''} aria-label="Include ${esc(it.title)}">
    <input type="text" data-f="title" value="${esc(it.title)}" aria-label="Title" title="${esc(it.source || '')}">
    <input type="date" data-f="date" value="${esc(it.date)}" aria-label="Date">
    <span class="pct"><input type="number" data-f="weight" min="0" max="100" step="0.5" value="${it.weight ?? ''}" aria-label="Percent of the grade" placeholder="?">%</span>
    <select data-f="type" aria-label="Kind">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${k === it.type ? ' selected' : ''}>${v}</option>`).join('')}</select>
  </li>`;
}

function courseHTML(c) {
  return `<article class="course" data-course="${c.id}" style="--c:${c.color}">
    <header>
      <input class="cname" type="text" data-f="name" value="${esc(c.name)}" aria-label="Course name">
      <button type="button" class="link" data-act="remove" aria-label="Remove ${esc(c.name)}">Remove</button>
    </header>
    <p class="meta">${metaOf(c)}</p>
    <details>
      <summary>Check or fix the dates</summary>
      <ul class="rows">${c.items.map(rowHTML).join('')}</ul>
      <button type="button" class="link" data-act="addrow">Add a date by hand</button>
      ${c.text ? `<details class="src"><summary>Outline text</summary><pre>${esc(c.text)}</pre></details>` : ''}
    </details>
  </article>`;
}

function renderCourses() {
  const open = new Set([...document.querySelectorAll('.course > details[open]')].map((d) => d.parentElement.dataset.course));
  $('#courses').innerHTML = state.courses.map(courseHTML).join('');
  for (const id of open) $(`.course[data-course="${id}"] > details`)?.setAttribute('open', '');
  $('#clear').hidden = !state.courses.length;
}

// ---- term map ----

function itemHTML(it) {
  const day = `${fmt(it.date, { weekday: 'short' })} ${fmt(it.date, { day: 'numeric' })}`;
  const until = it.end ? ` <span class="until">to ${shortDate(it.end)}</span>` : '';
  const at = it.time ? ` <span class="until">${clock(it.time)}</span>` : '';
  const worth = it.type === 'info' ? '' : it.weight == null ? '<span class="pct none" title="No weight found">no %</span>' : `<span class="pct"${it.est ? ' title="Estimated by splitting the grade breakdown evenly"' : ''}>${it.est ? '~' : ''}${num(it.weight)}%</span>`;
  const tick = it.type === 'info' ? '<span></span>'
    : `<input type="checkbox" class="tick" data-done="${it.id}"${it.done ? ' checked' : ''} aria-label="Done: ${esc(it.title)}">`;
  return `<li class="${it.type}${it.done ? ' done' : ''}" style="--c:${it.course.color}">
    ${tick}
    <span class="dow">${day}</span>
    <span class="tag">${esc(shortName(it.course.name))}</span>
    <span class="what">${esc(it.title)}${until}${at}</span>
    ${worth}
  </li>`;
}

function weekHTML(w, max, now) {
  const [mon, day] = [fmt(w.start, { month: 'short' }), fmt(w.start, { day: 'numeric' })];
  const cls = ['week', w.pileup && 'pileup', w.start === now && 'now', addDays(w.start, 6) < todayISO() && 'past'].filter(Boolean).join(' ');
  const worth = w.known ? `, worth ${num(w.known)}%` : '';
  const extra = w.unweighted && w.known ? ` plus ${w.unweighted} with no %` : '';
  const ticked = w.done ? `, ${w.done} done` : '';
  const tally = w.due ? `${w.due} due${worth}${extra}${ticked}` : w.done ? 'All done' : 'Nothing graded';
  const verb = w.tip && ['exam', 'quiz'].includes(w.tip.item.type) ? 'Start studying for' : 'Get ahead on';
  // name the course too, since three courses can each have a "Final exam"
  const what = w.tip && esc(`${w.tip.item.title} (${shortName(w.tip.item.course.name)})`);
  const tip = !w.tip ? ''
    : w.tip.week === now ? `<p class="tip"><b>This week</b> is light. ${verb} <b>${what}</b> now.</p>`
    : `<p class="tip">The week of <b>${shortDate(w.tip.week)}</b> is light. ${verb} <b>${what}</b> then.</p>`;
  return `<li class="${cls}">
    <div class="when"><span class="mon">${mon}</span><span class="day">${day}</span>${w.start === now ? '<span class="here">This week</span>' : ''}</div>
    <div class="body">
      <div class="load">
        ${w.due ? `<span class="bar" style="width:${Math.max(3, (w.load / max) * 100)}%"></span>` : ''}
        <span class="tally">${tally}</span>
        ${w.pileup ? '<span class="stamp">Pileup</span>' : ''}
      </div>
      <ul class="due">${w.items.map(itemHTML).join('')}</ul>
      ${tip}
    </div>
  </li>`;
}

function quietHTML(run, now) {
  const here = run.some((w) => w.start === now);
  const first = run[0].start, last = addDays(run[run.length - 1].start, 6);
  const label = run.length === 1 ? 'Nothing due' : `${run.length} quiet weeks, to ${shortDate(last)}`;
  return `<li class="week quiet${here ? ' now' : ''}${last < todayISO() ? ' past' : ''}">
    <div class="when"><span class="mon">${fmt(first, { month: 'short' })}</span><span class="day">${fmt(first, { day: 'numeric' })}</span>${here ? '<span class="here">This week</span>' : ''}</div>
    <div class="body"><span class="tally">${label}</span></div>
  </li>`;
}

function headlineHTML(weeks, today) {
  const { next, worst, count } = summarize(weeks, today);
  const of = (w) => `${plural(w.due, 'thing')} due${w.known ? `, worth ${num(w.known)}%` : ''}`;
  if (next) {
    const rest = count > 1 ? `${count} pileup weeks on this map. The heaviest is the week of ${shortDate(worst.start)}.` : 'It is the only pileup on this map.';
    const title = next.start === weekStart(today) ? '<em>This week</em> is a pileup.' : `Next pileup: the week of <em>${shortDate(next.start)}</em>.`;
    return `<h2>${title}</h2><p><b>${of(next)}.</b> ${rest}</p>`;
  }
  if (count) return `<h2>The pileups are behind you.</h2><p>Nothing ahead crosses the line. The heaviest week was ${shortDate(worst.start)}.</p>`;
  return `<h2>No pileups.</h2><p>Your heaviest week is the week of ${shortDate(worst.start)}: ${of(worst)}.</p>`;
}

function renderMap() {
  const items = state.courses.flatMap((c) => c.items.map((it) => ({ ...it, course: c })));
  const today = todayISO();
  const weeks = buildWeeks(items, today);
  document.body.classList.toggle('empty', !state.courses.length);
  if (!weeks.length) {
    $('#headline').innerHTML = state.courses.length ? '<h2>No dates ticked yet.</h2><p>Tick some dates in a course on the left.</p>' : '';
    $('#weeks').innerHTML = '';
    return;
  }
  const max = Math.max(...weeks.map((w) => w.load), 1);
  const now = weekStart(today);
  let html = '', quiet = [];
  const flush = () => {
    // Three or more empty weeks in a row fold into one line so breaks don't fill the page.
    html += quiet.length >= 3 ? quietHTML(quiet, now) : quiet.map((w) => quietHTML([w], now)).join('');
    quiet = [];
  };
  for (const w of weeks) {
    if (!w.items.length) { quiet.push(w); continue; }
    flush();
    html += weekHTML(w, max, now);
  }
  flush();
  $('#headline').innerHTML = headlineHTML(weeks, today);
  $('#weeks').innerHTML = html;
  // Weeks that are over start out hidden so the map opens on this week.
  const past = weeks.filter((w) => addDays(w.start, 6) < today).length;
  const all = past === weeks.length;
  $('#weeks').classList.toggle('hide-past', !state.showPast && !all);
  $('#past').hidden = !past || all;
  $('#past').textContent = state.showPast ? 'Hide earlier weeks' : `Show ${plural(past, 'earlier week')}`;
}

function update(cards = true) {
  save();
  if (cards) renderCourses();
  renderMap();
}

// ---- files ----

async function readFile(file) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return file.text();
  // pdf.js is big, so it only loads when someone opens a PDF.
  const pdfjs = await import('../vendor/pdfjs/pdf.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    pages.push(linesFromPdfItems((await page.getTextContent()).items));
  }
  return pages.join('\n');
}

async function takeFile(file) {
  if (!file) return;
  say('Reading the file…');
  try {
    const text = await readFile(file);
    if (!text.trim()) return say('That file has no text in it. If it is a scanned PDF, copy the dates in by hand.');
    $('#ctext').value = text;
    if (!$('#cname').value) $('#cname').value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 40);
    say('Read the file. Check the text, then press Find the dates.');
  } catch (err) {
    console.error(err);
    say('Could not read that file. Try copying the text and pasting it in.');
  }
}

// ---- quick add ----

function quickPreview() {
  const r = readQuick($('#qtext').value, state.courses, todayISO());
  const p = $('#qprev');
  p.className = r ? (r.error ? 'bad' : 'ok') : '';
  if (!r) p.textContent = '';
  else if (r.error) p.textContent = r.error;
  else {
    const name = r.course ? shortName(r.course.name) : r.newCourse;
    const what = r.items.map((it) => esc(it.title)
      + `, ${fmt(it.date, { weekday: 'short', month: 'short', day: 'numeric' })}`
      + (it.end ? ` to ${shortDate(it.end)}` : '')
      + (it.time ? ` at ${clock(it.time)}` : '')
      + (it.weight != null ? `, ${num(it.weight)}%` : '')).join('; ');
    p.innerHTML = `<span class="tag" style="--c:${r.course?.color || nextColor()}">${esc(name)}</span> ${what}${r.newCourse ? ' <i>(new class)</i>' : ''}`;
  }
  return r;
}

$('#qtext').addEventListener('input', quickPreview);
$('#quick').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = quickPreview();
  if (!r) $('#qprev').textContent = 'Type something first, like "chem quiz fri".';
  if (!r || r.error) {
    $('#qprev').className = 'bad';
    return $('#qtext').focus();
  }
  const course = r.course || makeCourse(r.newCourse, '', []);
  course.items.push(...r.items.map((it) => ({ id: uid(), ...it })));
  $('#qtext').value = '';
  update();
  $('#qprev').className = '';
  $('#qprev').textContent = `Added ${r.items[0].title} to ${course.name}.`;
  $('#qtext').focus();
});

// ---- events ----

$('#add').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#ctext').value;
  if (!text.trim()) return say('Paste a course outline first.');
  const existing = findByName($('#cname').value);
  if (existing) {
    const { found, added } = addToCourse(existing, text);
    if (!found) return say('No dates found in that text. Pileup looks for dates like "Oct 3", "3 October" or "10/03".');
    say(added ? `Added ${plural(added, 'date')} to ${esc(existing.name)}.${found > added ? ` ${found - added} were already there.` : ''}` : `Those dates are already in ${esc(existing.name)}.`);
    e.target.reset();
    return update();
  }
  const course = addCourse($('#cname').value.trim(), text);
  if (!course) return say('No dates found in that text. Pileup looks for dates like "Oct 3", "3 October" or "10/03".');
  const skipped = course.items.filter((it) => !it.on).length;
  say(`Found ${plural(course.items.length, 'date')} in ${esc(course.name)}.${skipped ? ` ${skipped} ${skipped === 1 ? 'is' : 'are'} unticked because ${skipped === 1 ? 'it does' : 'they do'} not look like graded work.` : ''}`);
  e.target.reset();
  update();
});

$('#pick').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => { takeFile(e.target.files[0]); e.target.value = ''; });
const drop = $('#ctext');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  drop.classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file) { e.preventDefault(); takeFile(file); }
});

$('#samples').addEventListener('click', () => {
  for (const s of SAMPLES) addCourse(s.name, s.text);
  say('Loaded 3 sample courses. Open one to see the outline it was read from.');
  update();
});

const findCourse = (el) => state.courses.find((c) => c.id === el.closest('.course')?.dataset.course);

$('#courses').addEventListener('change', (e) => {
  const course = findCourse(e.target), field = e.target.dataset.f;
  if (!course || !field) return;
  if (field === 'name') {
    course.name = e.target.value.trim() || 'Course';
  } else {
    const row = e.target.closest('.row');
    const it = course.items.find((x) => x.id === row.dataset.item);
    if (field === 'on') { it.on = e.target.checked; row.classList.toggle('off', !it.on); }
    if (field === 'title') it.title = e.target.value.trim() || 'Untitled';
    if (field === 'date' && e.target.value) {
      // a multi-day item keeps its length when its start moves
      if (it.end) it.end = addDays(it.end, Math.round((Date.parse(e.target.value) - Date.parse(it.date)) / 86400000));
      it.date = e.target.value;
    }
    if (field === 'weight') { it.weight = e.target.value === '' ? null : Math.min(100, Math.max(0, +e.target.value)); it.est = false; }
    if (field === 'type') it.type = e.target.value;
  }
  $('.meta', e.target.closest('.course')).textContent = metaOf(course);
  update(false); // leave the cards alone so the field keeps focus
});

$('#courses').addEventListener('click', (e) => {
  const act = e.target.dataset.act, course = findCourse(e.target);
  if (!act || !course) return;
  if (act === 'remove') {
    removed = { course, at: state.courses.indexOf(course) };
    state.courses.splice(removed.at, 1);
    say(`Removed ${esc(course.name)}. <button type="button" class="link" id="undo">Undo</button>`);
    update();
  }
  if (act === 'addrow') {
    const it = { id: uid(), title: 'New item', date: todayISO(), end: null, time: null, endTime: null, weight: null, est: false, type: 'assignment', on: true, source: '' };
    course.items.push(it);
    update();
    const input = $(`.row[data-item="${it.id}"] [data-f="title"]`);
    input?.focus();
    input?.select();
  }
});

$('#status').addEventListener('click', (e) => {
  if (e.target.id !== 'undo' || !removed) return;
  state.courses.splice(removed.at, 0, removed.course);
  removed = null;
  say('Put it back.');
  update();
});

// Clearing asks twice instead of using a pop-up.
$('#clear').addEventListener('click', (e) => {
  if (e.target.dataset.sure) {
    state.courses = [];
    delete e.target.dataset.sure;
    e.target.textContent = 'Clear everything';
    say('Cleared.');
    update();
  } else {
    e.target.dataset.sure = '1';
    e.target.textContent = 'Press again to clear every course';
    setTimeout(() => { delete e.target.dataset.sure; e.target.textContent = 'Clear everything'; }, 4000);
  }
});

// ticking something off on the map
$('#weeks').addEventListener('change', (e) => {
  const id = e.target.dataset.done;
  const it = id && state.courses.flatMap((c) => c.items).find((x) => x.id === id);
  if (!it) return;
  it.done = e.target.checked;
  update(false);
  $(`[data-done="${id}"]`)?.focus();
});

$('#past').addEventListener('click', () => { state.showPast = !state.showPast; update(false); });

$('#headsup').checked = state.headsUp;
$('#headsup').addEventListener('change', (e) => { state.headsUp = e.target.checked; save(); });

$('#download').addEventListener('click', () => {
  const ics = toICS(state.courses, { headsUp: state.headsUp });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'pileup-deadlines.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

update();
