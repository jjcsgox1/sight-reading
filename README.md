# Sight reading

A sight-reading game for piano. Music appears on a grand staff, you play it on a MIDI keyboard,
and it scores you. A note you get wrong turns **red** and stays red, so after the piece the page
is marked up like a teacher marked it.

## Running it

**<https://jjcsgox1.github.io/sight-reading/>** — open it, plug the keyboard in, play. Nothing
needs installing and nothing needs starting.

On a computer, use **Chrome or Edge**. Firefox needs a permission add-on for Web MIDI, and
Safari has none at all.

### On an iPad or iPhone

Not in Safari, and not in Chrome or Firefox either — Apple requires every browser on iOS and
iPadOS to use Safari's engine, and Safari has never supported Web MIDI. It was declined in 2020
over fingerprinting, because MIDI devices report identifying serial numbers. There is no roadmap.

The way round it is a browser app that carries its own MIDI plumbing and injects the missing API
into the pages it loads. **[MIDIWeb Browser](https://apps.apple.com/us/app/midiweb-browser/id6757226617)**
(free, iPadOS 17.6+) works — open the address above inside it. The older and much better known
*Web MIDI Browser* no longer does; it finds the keyboard on its own bundled test page and not on
anything else.

Everything happens in the browser:
no notes, no recordings and no imported pieces ever leave the machine. Your library is kept in
the browser's own storage, which means it is per-machine and per-browser — pieces loaded on the
laptop will not appear on another computer.

If the game cannot hear your keyboard, open the **MIDI check** page from the front page. It says
plainly what the browser can and cannot see.

No piano to hand? `play/?keys=1` puts the game on the computer's letter keys.

### Running it from a copy on disk

Double-click `start.cmd`. It serves the folder at <http://localhost:8733/> and opens a browser;
leave the black window open while you play. This is only needed offline — a browser will hand out
MIDI over HTTPS or from `localhost`, but not to files opened straight off the disk.

### Hosting

GitHub Pages, from the root of the `main` branch of
[jjcsgox1/sight-reading](https://github.com/jjcsgox1/sight-reading). There is no build step, so a
push is a deploy: whatever is committed is what the site serves, usually within a minute.

## The modes

| | |
|---|---|
| **Practice** | Your own speed, no clock. A wrong note is marked red and it moves on anyway. |
| **Strict — by note** | Will not move on until you play the chord right. |
| **Strict — by measure** | One wrong note and you go back to the first beat of that measure. |
| **Timed** | A metronome ticks and the cursor moves on the beat whether you kept up or not. |

## Reading a piece of your own

Under **What to read**, switch to **A piece of your own** and add a MusicXML file. Real
repertoire then works exactly like generated material: wrong notes go red, strict mode holds you
on a chord, the review marks up the page.

Pick the measures to work on with **from** and **to** — a whole prelude is not a sight reading
exercise, eight measures of one is. An excerpt that starts on a tied note plays that note, since
the thing it was tied to is no longer there.

MuseScore is free, opens most things, and exports MusicXML. IMSLP and musescore.com have
thousands of files already in the format. Loaded pieces are kept in the browser, so they are
still there tomorrow.

### Only a PDF?

**A PDF is a picture of music.** Nothing in the file says which notes are which, so nothing in it
could be marked right or wrong — scoring a PDF would need optical music recognition, and OMR
reliable enough to trust does not exist in a form that could be built here. Reading 90% of the
notes correctly would mean the game spending its time marking you wrong on notes you played
right, which is worse than no feature at all.

Convert it first, offline and free:

1. **[Audiveris](https://github.com/Audiveris/audiveris)** reads a PDF or a scan and writes
   MusicXML. Open the PDF, let it work through the page, correct anything it misread, export.
2. Or open the PDF in **MuseScore** and re-enter the music, then export MusicXML. Slower, but
   exact.

Either way you end up with a `.musicxml` or `.mxl`, which this reads.

### What the importer handles, and what it ignores

Reads: partwise MusicXML, `.xml`, `.musicxml` and `.mxl` (the zipped kind MuseScore writes by
default); two staves in one part or separate parts per hand; chords; ties; rests; dotted notes;
more than one voice on a staff; key and time signature changes; clef changes mid-piece; the
tempo marking, which the timed mode then uses.

Ignores: repeat marks — it plays straight through, once; grace notes and ornaments; slurs,
dynamics, pedalling, fingering and articulation. It cannot read timewise MusicXML; save it again
from MuseScore, which writes the partwise kind.

`spikes/import-check/sample.musicxml` is a deliberately awkward eight-measure test piece — every
case above in one file — if you want to see the importer work before hunting for real music.

## What it puts in front of you

Set by **What to play**. Three of them are chords, three are one note at a time.

| | |
|---|---|
| **Chords — diatonic triads** | Blocked chords from a real progression, voiced with sane voice leading. The left hand takes the root and the fifth, so it reads as a part of its own rather than doubling what the right hand is already playing. |
| **Chords — add sevenths** | The same, with four-note chords. |
| **Chords — free intervals** | Two or three notes of the key a readable interval apart, not a chord. |
| **Single notes — scales** | Up to the top of the range, turn, back down. Even note values. |
| **Single notes — a melody** | A line of mostly steps with the odd leap, ending on the tonic. |
| **Single notes — broken chords** | The same progression as the chord styles, spelled out one note at a time. |

The three single-note styles play one note per hand, so **Notes per hand** greys out.

### Making a single line hard

A stepwise line can be played by ear after the first two notes. Everything below exists to stop
that, so the line has to actually be read.

**Motion** (for the melody style) sets how far it moves and how readily it changes direction:
*mostly steps* is easy on the eye; *leaps* uses thirds to sixths and turns without warning;
*wide leaps* goes up to an octave a jump and cannot be guessed at all.

**Between the hands** (when both hands are playing) decides what the left hand does, and
defaults to giving it something of its own:

- *Two separate lines* (the default) — each hand gets its own tune and nothing in the left
  follows from the right. Scales run a third apart and turn around at different points, so two
  scales are two different lines rather than the same one twice. Hardest, and closest to real
  music.
- *Contrary motion* — the left hand mirrors the right: one goes up as the other comes down.
- *In octaves* — the same line in both hands, at a displacement fixed for the whole line. This
  is how scales are drilled, but both hands are then playing the same notes.

**Accidentals** set to *chromatic* puts notes from outside the key into the line — sharpened
going up, flattened coming down — and turns the scales style into chromatic scales, where there
is no key signature to ride.

In a minor key, scales otherwise follow the key signature (natural minor). Set **Accidentals** to
*occasional accidentals* and they raise the seventh instead, giving harmonic minor and an
accidental to read on every seventh degree.

## How it judges

- Notes pressed close together are **one attempt at one chord**, so a rolled chord is judged as a
  chord and not as three wrong single notes.
- A note **held over by a tie is not played again** — it is already sounding. Tied noteheads are
  drawn greyer to say so, and are not in what you are asked for.
- An attempt is correct only when the keys held are **exactly** the notes asked for — all of them,
  nothing extra. A note is judged a moment after the chord completes, not the instant it matches,
  so a fumbled extra note spoils the chord it belongs to instead of landing on the next one.
- Letting go of a key does not take it back.
- Accuracy counts the **first** attempt at each chord. In strict mode the retries needed to get
  past do not dig the hole deeper.

Two things it cannot do, stated on screen as well as here:

- It judges by which key you pressed, so it **cannot tell F♯ from G♭**. If the music says G♭ and
  you think "F♯", it will say correct. MIDI has no way to know.
- Right notes in the **wrong octave** count as wrong — but the review says so in those words,
  because that is a different mistake from reading the wrong line.

## Layout

    index.html              front page
    start.cmd               double-click to run
    play/                   the game
      music.js              pitches, spellings, key signatures, page layout
      render.js             draws the grand staff as SVG
      generate.js           makes the exercises
      musicxml.js           reads an imported piece (and unzips .mxl)
      judge.js              decides right and wrong, keeps the score
      midi.js               Web MIDI, and the computer-keyboard stand-in
      sound.js              optional tone, for silent controllers
      app.js                screens, the library, and the play loop
    spikes/midi-check/      does this browser see the keyboard?
    spikes/render-check/    does the notation look right?
    spikes/glyph-check/     which font draws the clefs?
    spikes/import-check/    an awkward sample piece, for testing the importer

## How it is built

Plain HTML, CSS and JavaScript. No build step, no npm, no libraries, nothing fetched from a CDN.
Every page loads only files sitting next to it.

The notation is drawn as SVG shapes — staff lines, noteheads, stems, beams, ledger lines, the
brace. The things that cannot sensibly be drawn from ellipses and rectangles (the clefs, the
accidentals, the shorter rests) are set as text in whatever music font the system has; on Windows
that is Segoe UI Symbol, which draws them properly.

Those glyphs are measured with the canvas `measureText` ink extents, not with SVG's `getBBox`.
`getBBox` on a `<text>` reports the *layout* box, which is the same height for every character in
the font because it is the line box rather than the shape — position a sharp by it and the sharp
lands wherever the font's line spacing happens to fall. The ink metrics give the real outline, so
each glyph can be placed by the part of it that matters: a sharp and a natural on their middle, a
flat by the centre of its bowl, a bass clef by its dot, a treble clef by its curl. Accidentals in
a chord are then stacked leftward into columns wide enough for the widest glyph in each, sharing
a column only when far enough apart vertically not to touch.

Every notehead is its own SVG group carrying its chord index and MIDI number, which is what makes
turning one red a single attribute change rather than a redraw.

There are two models of a piece, and they are not the same thing. **Events** are what you have to
play: one entry per moment a key goes down, which is what the judge and the cursor work from.
**Measures** are what is on the page, laid out per staff — because in real music the hands do not
move together, and a half note in the left hand under two quarters in the right cannot be drawn
from the events alone. Both staves share one onset-to-x map per measure, which is what keeps the
hands lined up vertically. Generated music is homophonic, so its page layout falls straight out
of its events; an imported piece builds both from the file.

The `.mxl` reader unpacks the zip itself — central directory, local headers, and
`DecompressionStream` for the deflated entries — because pulling in a zip library for one file
format would be the only dependency in the project.

## Plan

The plan this was built from, with the reasoning behind each choice, is at
`~/.claude/plans/i-wanna-create-an-jaunty-moore.md`.
