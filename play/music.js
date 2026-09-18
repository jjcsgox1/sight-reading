// music.js — pitches, spellings, keys. No drawing, no browser.
//
// A note is spelled, not just numbered: { step, octave, alter }.
//   step    0..6 for C D E F G A B
//   octave  scientific, so middle C is octave 4
//   alter   -1 flat, 0 natural, +1 sharp
//
// Spelling matters because E-flat and D-sharp sit on different lines of the staff even
// though they are the same key on the piano. MIDI only knows the key.

const STEP_SEMITONE = [0, 2, 4, 5, 7, 9, 11];
const STEP_LETTER = ["C", "D", "E", "F", "G", "A", "B"];
const SHARP = "♯", FLAT = "♭", NATURAL = "♮";

// Which key of the piano this spelling lands on. Middle C is 60.
function midiOf(n) {
  return (n.octave + 1) * 12 + STEP_SEMITONE[n.step] + (n.alter || 0);
}

// Position on the staff, ignoring accidentals: one step per line-or-space.
function diatonicOf(n) {
  return n.octave * 7 + n.step;
}

function noteAt(diatonic, alter) {
  return { step: ((diatonic % 7) + 7) % 7, octave: Math.floor(diatonic / 7), alter: alter || 0 };
}

function noteLabel(n) {
  const a = n.alter > 0 ? SHARP : n.alter < 0 ? FLAT : "";
  return STEP_LETTER[n.step] + a + n.octave;
}

// Naming a key of the piano when we have no spelling to go on — for saying what was
// actually played. Black keys get both names, because MIDI cannot tell us which was meant.
const SHARP_NAMES = ["C", "C" + SHARP, "D", "D" + SHARP, "E", "F", "F" + SHARP, "G", "G" + SHARP, "A", "A" + SHARP, "B"];
const FLAT_NAMES  = ["C", "D" + FLAT, "D", "E" + FLAT, "E", "F", "G" + FLAT, "G", "A" + FLAT, "A", "B" + FLAT, "B"];

function midiLabel(midi, preferFlats) {
  const pc = ((midi % 12) + 12) % 12, oct = Math.floor(midi / 12) - 1;
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[pc] + oct;
}

// Both names, for the black keys, e.g. "F#4 / Gb4".
function midiLabelBoth(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const a = midiLabel(midi, false);
  return SHARP_NAMES[pc] === FLAT_NAMES[pc] ? a : a + " / " + midiLabel(midi, true);
}

// ---------------------------------------------------------------- key signatures

// fifths: +n sharps, -n flats. 0 is C major / A minor.
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];   // F C G D A E B
const FLAT_ORDER  = [6, 2, 5, 1, 4, 0, 3];   // B E A D G C F

// What the key signature does to each letter, as alter by step.
function keyAlters(fifths) {
  const a = [0, 0, 0, 0, 0, 0, 0];
  if (fifths > 0) for (let i = 0; i < fifths; i++) a[SHARP_ORDER[i]] = 1;
  else for (let i = 0; i < -fifths; i++) a[FLAT_ORDER[i]] = -1;
  return a;
}

// Where each key-signature accidental sits, as a treble-clef diatonic value.
// The bass clef uses the same shape two octaves lower.
const SHARP_POS = [38, 35, 39, 36, 33, 37, 34];  // F5 C5 G5 D5 A4 E5 B4
const FLAT_POS  = [34, 37, 33, 36, 32, 35, 31];  // B4 E5 A4 D5 G4 C5 F4

// [{ step, alter, diatonic }] in the order they are written, for the given clef.
function keySignature(fifths, clef) {
  const drop = clef === "bass" ? 14 : 0;
  const out = [];
  const n = Math.abs(fifths);
  for (let i = 0; i < n; i++) {
    if (fifths > 0) out.push({ step: SHARP_ORDER[i], alter: 1, diatonic: SHARP_POS[i] - drop });
    else out.push({ step: FLAT_ORDER[i], alter: -1, diatonic: FLAT_POS[i] - drop });
  }
  return out;
}

const MAJOR_NAMES = {
  "-7": "C" + FLAT, "-6": "G" + FLAT, "-5": "D" + FLAT, "-4": "A" + FLAT, "-3": "E" + FLAT,
  "-2": "B" + FLAT, "-1": "F", "0": "C", "1": "G", "2": "D", "3": "A", "4": "E", "5": "B",
  "6": "F" + SHARP, "7": "C" + SHARP
};
const MINOR_NAMES = {
  "-7": "A" + FLAT, "-6": "E" + FLAT, "-5": "B" + FLAT, "-4": "F", "-3": "C", "-2": "G",
  "-1": "D", "0": "A", "1": "E", "2": "B", "3": "F" + SHARP, "4": "C" + SHARP, "5": "G" + SHARP,
  "6": "D" + SHARP, "7": "A" + SHARP
};

function keyName(fifths, minor) {
  return (minor ? MINOR_NAMES : MAJOR_NAMES)[String(fifths)] + (minor ? " minor" : " major");
}

// The tonic's step, so the generator knows where the scale starts.
function tonicStep(fifths, minor) {
  const name = (minor ? MINOR_NAMES : MAJOR_NAMES)[String(fifths)];
  return STEP_LETTER.indexOf(name[0]);
}

// ---------------------------------------------------------------- spelling from MIDI

// Spell a piano key inside a key signature, choosing the reading a musician would write.
function spellInKey(midi, fifths) {
  const alters = keyAlters(fifths);
  // Try every letter name whose natural pitch is within a semitone of this key.
  let best = null;
  for (let d = 0; d < 80; d++) {
    const n = noteAt(d + 7, 0);
    const natural = midiOf(n);
    for (const alter of [0, 1, -1]) {
      if (natural + alter !== midi) continue;
      // Prefer the spelling the key signature already gives us.
      const cost = (alter === alters[n.step] ? 0 : 10) + Math.abs(alter);
      if (!best || cost < best.cost) best = { cost, note: { step: n.step, octave: n.octave, alter } };
    }
  }
  return best ? best.note : noteAt(Math.floor(midi / 12) * 7, 0);
}

// Does this note need an accidental written, given the key signature and what has
// already happened in this measure? Returns null, or the alter to draw.
function accidentalFor(note, fifths, measureState) {
  const fromKey = keyAlters(fifths)[note.step];
  const d = diatonicOf(note);
  const shown = measureState.has(d) ? measureState.get(d) : fromKey;
  if (note.alter === shown) return null;
  measureState.set(d, note.alter);
  return note.alter;
}

// Every key the exercise asks for, in order, as { index, midi[] }. Notes held over by a
// tie are not in it: they are already sounding, and you do not strike them again.
function chordsOf(exercise) {
  return exercise.events.map(ev => ({
    index: ev.index,
    midi: [...(ev.treble || []), ...(ev.bass || [])]
      .filter(n => !n.tied).map(midiOf).sort((a, b) => a - b)
  }));
}

// ---------------------------------------------------------------- page layout
//
// Two models, and they are not the same thing:
//
//   events   — what you have to play, one entry per moment a key goes down. The judge and
//              the cursor work from this.
//   measures — what is on the page, laid out per staff, because in real music the two
//              hands do not move together. A half note in the left hand under two quarters
//              in the right is ordinary, and cannot be drawn from the events alone.
//
// Generated music is homophonic, so its page layout falls straight out of its events.
// An imported piece builds both from the file.

const NOTE_TYPES = ["whole", "half", "quarter", "eighth", "16th", "32nd", "64th"];

function typeForBeats(beats) {
  if (beats >= 4) return "whole";
  if (beats >= 2) return "half";
  if (beats >= 1) return "quarter";
  if (beats >= 0.5) return "eighth";
  if (beats >= 0.25) return "16th";
  return "32nd";
}

function layoutFromEvents(exercise) {
  const measures = [];
  const beats = exercise.timeSig[0] * 4 / (exercise.timeSig[1] || 4);
  for (const ev of exercise.events) {
    let m = measures[measures.length - 1];
    if (!m || m.index !== ev.measure) {
      m = { index: ev.measure, timeSig: exercise.timeSig, fifths: exercise.fifths,
            beats, clefs: { treble: "treble", bass: "bass" },
            staves: { treble: [], bass: [] } };
      measures.push(m);
    }
    ev.onset = ev.beat - 1;
    for (const staff of ["treble", "bass"]) {
      const notes = ev[staff] || [];
      if (!notes.length) continue;
      m.staves[staff].push({
        onset: ev.onset, beats: ev.beats, type: typeForBeats(ev.beats),
        dots: ev.dotted ? 1 : 0, voice: 1, notes, rest: false
      });
    }
  }
  for (const m of measures)
    for (const staff of ["treble", "bass"])
      if (!m.staves[staff].length)
        m.staves[staff].push({ onset: 0, beats: m.beats, type: "whole",
                               dots: 0, voice: 1, notes: [], rest: true });
  exercise.measures = measures;
  return exercise;
}

// Which notes get an accidental printed. Worked out over the page layout rather than the
// events, because a tied-over note and a note in the other voice both affect what has
// already been said in the measure. An accidental holds to the barline, and holds for its
// own staff only — one in the treble does not carry down into the bass.
function applyAccidentalsToLayout(exercise) {
  for (const m of exercise.measures) {
    for (const staff of ["treble", "bass"]) {
      const state = new Map();
      const groups = m.staves[staff].slice().sort((a, b) => a.onset - b.onset);
      for (const g of groups)
        for (const n of g.notes)
          n.showAccidental = accidentalFor(n, m.fifths, state);
    }
  }
  return exercise;
}

// Build the page layout and work out the accidentals. Everything generated ends here.
function finishExercise(exercise) {
  return applyAccidentalsToLayout(layoutFromEvents(exercise));
}
