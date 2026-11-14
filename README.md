# Pileup

See where your deadlines pile up before they do.

**Live:** https://billybobmcgee.github.io/pileup/

Every course hands you its own outline, and no teacher can see the other ones. So three tests and an essay land in the same week and you find out the Sunday before. Pileup reads all your outlines and puts every deadline on one map, so you can see the bad weeks while there is still time to do something about them.

## What it does

1. **Paste a course outline** (or open the PDF). Pileup finds the dates, what each thing is, and how much of your grade it is worth.
2. **See the term on one map.** Each week shows what is due across all your courses. A week is marked as a pileup when 3 or more things are due and add up to 20% or more, or when what is due adds up to 30% or more.
3. **Get ahead.** For each pileup it finds the nearest light week before it and tells you what to start then.
4. **Save it to your calendar.** One file with every deadline, a reminder the day before, and an optional "start now" event before the big ones. Works with Google Calendar, Apple Calendar and Outlook.

Press **Try it with 3 sample courses** to see it without pasting anything.

Nothing is uploaded. There is no server and no account. Your outlines stay in your browser.

## What it can read

- Dates: `Oct 3`, `October 3rd, 2026`, `3 October`, `10/03`, `2026-10-03`, with or without a weekday
- Ranges: `Nov 9-13`, `Dec 21 - Jan 1`
- Several dates on one line: `Quizzes: Sept 18, Oct 2, Oct 16 (5% each)`
- Times: `11:59 pm`, `9:00 - 11:00 am`, `14:15`, `midnight`
- Weights on the same line, or in a separate grade breakdown. `Unit tests 40%` with five dated unit tests gives each one 8%, marked with `~` because it is an estimate.
- Dates with no year. They go in the current school year, so `Sept 12` and `Jan 20` end up in the right years.
- Tables pasted from a document, and text pulled out of a PDF

Lecture-by-lecture lines are found but left unticked, so the map only shows graded work. Every row can be edited, and you can add your own.

It does not read scanned PDFs (pictures of text) or dates written as "Week 5".

## Run it

It is plain HTML, CSS and JavaScript with no build step. Serve the folder with anything:

```
python -m http.server 8137
```

Then open http://localhost:8137.

Tests use Node's built-in runner (Node 20 or newer):

```
npm test
```

## How it works

| File | Job |
| --- | --- |
| `src/parse.js` | Text to items. Finds dates line by line, cuts out the date, time and weight, and what is left is the title. Then matches the grade breakdown to items that had no weight. |
| `src/plan.js` | Items to weeks. Adds up each week, marks pileups, and looks back up to three weeks for a light one. |
| `src/ics.js` | Items to a calendar file (iCalendar, RFC 5545). |
| `src/app.js` | The page: course cards on the left, the map on the right, saved in `localStorage`. |
| `src/samples.js` | Three made-up outlines in three different styles. They go through the same parser as your own. |

The parser uses rules, not an AI model. That is on purpose: it is instant, it works offline, it gives the same answer every time, and no outline ever leaves the browser.

## Credits

- [pdf.js](https://github.com/mozilla/pdf.js) by Mozilla (Apache-2.0), in `vendor/pdfjs`, reads PDF text. It only loads when you open a PDF.
- [Barlow Condensed](https://github.com/jpt/barlow) by Jeremy Tribby (SIL Open Font License), in `fonts`.
- Built for IceHacks 2026 with [Claude Code](https://claude.com/claude-code), an AI coding tool, which wrote most of the code.

## License

MIT
