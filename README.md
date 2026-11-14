# Pileup

Paste your course outlines and see which weeks have too much due.

Live: https://billybobmcgee.github.io/pileup/

Every class gives you its own outline and the teachers don't check with each other. So you get two tests and an essay in the same week and don't notice until a few days before. Pileup reads all your outlines and puts every deadline on one page, week by week, so you can see the bad weeks early.

## What it does

- Finds the dates in each outline, what each thing is and how much it's worth
- Shows every course on one page, week by week
- Marks a week as a pileup if 3 or more things are due and they add up to 20% or more, or if what's due adds up to 30% or more
- Points out an easy week before each pileup so you can start early
- Lets you fix anything it read wrong
- Downloads a calendar file for Google Calendar, Apple Calendar or Outlook

Hit "Try it with 3 sample courses" to see it without pasting anything.

Nothing gets uploaded. No account, no server.

## What it can read

- Dates like `Oct 3`, `October 3rd, 2026`, `3 October`, `10/03` and `2026-10-03`
- Ranges like `Nov 9-13` and `Dec 21 - Jan 1`
- More than one date on a line, like `Quizzes: Sept 18, Oct 2, Oct 16 (5% each)`
- Times like `11:59 pm`, `9:00 - 11:00 am` and `14:15`
- Percents on the same line or in a separate grade breakdown. If it says `Unit tests 40%` and there are 5 tests, each one gets about 8% (shown with a `~`)
- Text from PDFs and pasted tables

Dates with no year go in the school year (August to July).

Lines that are just lectures get found but left unticked, so only graded stuff shows up.

It can't read scanned PDFs or dates like "Week 5" yet.

## Run it

No build step. Serve the folder:

```
python -m http.server 8137
```

and open http://localhost:8137

Tests (Node 20+):

```
npm test
```

## Files

- `src/parse.js` reads the outline. It finds the date, time and percent on each line and whatever's left is the title.
- `src/plan.js` groups everything by week and decides which weeks are pileups.
- `src/ics.js` makes the calendar file.
- `src/app.js` is the page itself. Saves to localStorage.
- `src/samples.js` has the 3 made-up sample outlines.

It doesn't use AI to read outlines, it's just rules. So it's instant, works offline and gives the same answer every time.

## Credits

- [pdf.js](https://github.com/mozilla/pdf.js) by Mozilla (Apache-2.0) for reading PDFs
- [Barlow Condensed](https://github.com/jpt/barlow) font (SIL Open Font License)
- Built for IceHacks 2026 with [Claude Code](https://claude.com/claude-code), an AI coding tool

## License

MIT
