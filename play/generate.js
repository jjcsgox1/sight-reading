// generate.js — makes the music to read.
//
// Not random noteheads. Random noteheads read as noise and teach nothing: the eye learns
// sight reading by recognising shapes it will meet again. So this builds an actual chord
// progression in an actual key, voices it with sane voice leading, and then bars it.

const RANGES = {
  // [lowest, highest] as diatonic values, per staff. See music.js for what a diatonic is.
  middle:  { treble: [30, 35], bass: [21, 26] },   // E4-C5, C3-A3: inside the staff, central
  staves:  { treble: [30, 38], bass: [18, 26] },   // exactly the five lines, no ledgers
  ledger1: { treble: [28, 40], bass: [16, 28] },   // one ledger line either way
  ledger2: { treble: [26, 42], bass: [14, 30] },
  ledger3: { treble: [24, 44], bass: [12, 32] }
};

// The styles that are one note at a time rather than chords.
const SINGLE_LINE = { scales: true, melody: true, arpeggios: true };

const KEY_CHOICES = {
  c:    [0],
  two:  [0, 1, 2, -1, -2],
  four: [0, 1, 2, 3, 4, -1, -2, -3, -4],
  all:  [0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7]
};

// Where a progression can go next, by scale degree (0 = I).
const MOVES = {
  0: [3, 4, 5, 1, 2],
  1: [4, 6, 0],
  2: [5, 3],
  3: [4, 0, 1],
  4: [0, 5],
  5: [1, 3, 4],
  6: [0, 4]
};

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// A seeded generator, so an exercise can be replayed exactly.
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const DEFAULTS = {
  keyMode: "two", minorToo: true, range: "ledger1", hands: "both",
  notesPerHand: 3, chordStyle: "triads", accidentals: "key",
  motion: "mixed", bothHands: "independent",
  rhythm: "quarters", measures: 8, timeSig: [4, 4]
};

function generate(settings, seed) {
  const s = Object.assign({}, DEFAULTS, settings || {});
  const rng = makeRng(seed === undefined ? (Math.random() * 1e9) | 0 : seed);

  const fifths = pick(rng, KEY_CHOICES[s.keyMode] || KEY_CHOICES.two);
  const minor = s.minorToo ? rng() < 0.4 : false;
  const scale = buildScale(fifths, minor);

  const single = !!SINGLE_LINE[s.chordStyle];

  // Rhythm first, so the music can be exactly as long as the piece and still end where it
  // means to. A scale gets even note values — a scale written in a jumble of whole notes
  // and eighths is not a scale, it is a puzzle.
  const rhythm = s.chordStyle === "scales"
    ? evenRhythm(s.measures, s.timeSig, s.rhythm)
    : rhythmFor(rng, s.measures, s.timeSig, s.rhythm);

  const range = RANGES[s.range] || RANGES.ledger1;
  const voices = single
    ? singleLine(rng, scale, rhythm.length, s, range, minor)
    : chordVoices(rng, scale, rhythm.length, s, range, minor);

  const events = [];
  let i = 0, measure = 1, beat = 1;
  for (let k = 0; k < rhythm.length; k++) {
    const r = rhythm[k];
    if (r.newMeasure) { measure++; beat = 1; }
    events.push({
      index: i++, measure, beat, beats: r.beats, dotted: !!r.dotted,
      treble: voices[k].treble, bass: voices[k].bass
    });
    beat += r.beats;
  }

  const ex = {
    fifths, minor, timeSig: s.timeSig, events, seed, settings: s,
    name: keyName(fifths, minor)
  };
  return finishExercise(ex);
}

// ---------------------------------------------------------------- chords, one per event

function chordVoices(rng, scale, count, s, range, minor) {
  const degrees = progression(rng, count);
  const out = [];
  let prevTreble = null, prevBass = null;
  for (let k = 0; k < count; k++) {
    const chord = chordOn(scale, degrees[k % degrees.length], s.chordStyle, minor, rng,
                          s.accidentals, degrees[(k + 1) % degrees.length]);
    const treble = s.hands === "left" ? [] :
      voice(chord, range.treble, handSize(s.notesPerHand, "treble"), prevTreble, rng);
    // The left hand takes the root and the fifth, not the next chord tones up. Walking
    // the chord from the bottom hands it the root and the third, which is the same
    // material the right hand is already playing an octave up; an open fifth underneath
    // is what piano music actually does and reads as a different part.
    const bassSize = handSize(s.notesPerHand, "bass");
    const bassChord = bassSize > 1 ? [chord[0], chord[2] || chord[chord.length - 1]] : [chord[0]];
    const bass = separateChord(treble, s.hands === "right" ? [] :
      voice(bassChord, range.bass, bassSize, prevBass, rng, true));
    if (treble.length) prevTreble = treble;
    if (bass.length) prevBass = bass;
    out.push({ treble, bass });
  }
  return out;
}

// The two staves' ranges overlap at the wider settings, so the left hand can be voiced
// onto a key the right hand is already using. One key cannot be pressed twice, and a chord
// asking for it twice could never be played correctly — it would be marked wrong forever.
// Move the whole left-hand chord down an octave until it clears.
function separateChord(treble, bass) {
  if (!treble.length || !bass.length) return bass;
  const taken = new Set(treble.map(midiOf));
  for (let oct = 0; oct <= 3; oct++) {
    const moved = bass.map(n => ({ step: n.step, octave: n.octave - oct, alter: n.alter }));
    if (moved.every(n => !taken.has(midiOf(n)) && midiOf(n) >= 21)) return moved;
  }
  // Unreachable in practice — the loop above has already tried an octave down — but never
  // hand back a chord with the same key in it twice.
  const dropped = bass.map(n => ({ step: n.step, octave: n.octave - 1, alter: n.alter }));
  return dropped.filter(n => !taken.has(midiOf(n)) && midiOf(n) >= 21);
}

function handSize(n, staff) {
  if (staff === "bass") return n >= 4 ? 2 : n >= 2 ? Math.min(n - 1, 2) : 1;
  return Math.min(n, 4);
}

// ---------------------------------------------------------------- one note at a time
//
// Scales, a melody, broken chords. This is the other half of sight reading: most of what
// anyone actually reads is a line, not a stack, and a line is read differently — you
// follow where it is going rather than decoding a shape.

function makeLine(rng, scale, count, s, range, minor, which, offset) {
  const lead = which === "bass" ? range.bass : range.treble;
  const raise = minor && s.accidentals === "some";
  const chromatic = s.accidentals === "chromatic";

  if (s.chordStyle === "scales") {
    // A chromatic scale is a scale — and a far harder one to read, because the eye cannot
    // ride the key signature. It is the obvious thing for "scales" plus "chromatic".
    return chromatic ? chromaticScale(rng, scale, count, lead)
                     : scaleLine(rng, scale, count, lead, raise, offset || 0);
  }
  if (s.chordStyle === "arpeggios") return arpeggioLine(rng, scale, count, lead, minor);
  return melodyLine(rng, scale, count, lead, s.motion, chromatic);
}

function singleLine(rng, scale, count, s, range, minor) {
  if (s.hands === "right") return makeLine(rng, scale, count, s, range, minor, "treble")
    .map(n => ({ treble: [n], bass: [] }));
  if (s.hands === "left") return makeLine(rng, scale, count, s, range, minor, "bass")
    .map(n => ({ treble: [], bass: [n] }));

  const line = makeLine(rng, scale, count, s, range, minor, "treble");

  // Two genuinely separate lines, one per hand. Nothing in the left hand can be guessed
  // from the right, which is the hardest of the three and the closest to real music.
  if (s.bothHands === "independent") {
    // A third apart, so that two scales are two different lines rather than the same one
    // twice. The melody and broken-chord styles are already different run to run.
    const raw = makeLine(rng, scale, count, s, range, minor, "bass", 2);
    const low = dropBelow(raw.map((n, i) => n || raw[raw.length - 1]), line);
    return line.map((n, i) => ({ treble: [n], bass: [low[i]] }));
  }

  // The left hand mirrors the right about a pivot: right goes up a step, left goes down
  // one. Reads as two lines but only one has to be worked out.
  if (s.bothHands === "contrary") {
    const mirrored = dropBelow(mirrorLine(line, scale, range.bass), line);
    return line.map((n, i) => ({ treble: [n], bass: [mirrored[i]] }));
  }

  // Doubled below, the way scales are practised. The displacement is chosen once for the
  // whole line and held. Picking the best octave for each note separately makes the
  // doubling flip between one octave and two partway up a scale, which is not octaves.
  const shift = bassShift(line, range.bass);
  return line.map(n => {
    const d = diatonicOf(n) - shift;
    return { treble: [n], bass: [{ step: n.step, octave: Math.floor(d / 7), alter: n.alter }] };
  });
}

// The line turned upside down, placed so the whole of it fits the bass staff.
function mirrorLine(line, scale, bassRange) {
  const [lo, hi] = bassRange;
  const top = diatonicOf(line[0]);
  const deltas = line.map(n => diatonicOf(n) - top);
  const lows = deltas.map(d => -d);
  const span = { min: Math.min(...lows), max: Math.max(...lows) };
  // Centre the mirrored line in the bass range, but never let it climb over the line it
  // is mirroring — the two hands crossing reads as a mistake rather than as counterpoint.
  let base = Math.round((lo + hi) / 2 - (span.min + span.max) / 2);
  if (base + span.max > hi) base = hi - span.max;
  if (base + span.min < lo) base = lo - span.min;
  const ceiling = Math.min(...lows.map((d, i) => diatonicOf(line[i]) - d)) - 1;
  if (base > ceiling) base = ceiling;
  return lows.map((d, i) => {
    // C1 as a hard floor: below that there is no keyboard left.
    const target = Math.max(7, Math.max(lo - 3, Math.min(hi + 3, base + d)));
    const n = noteInScale(scale, target, false);
    // Keep the mirror's chromatic colouring if the line had any.
    return line[i].alter !== undefined && isChromatic(line[i], scale)
      ? { step: n.step, octave: n.octave, alter: n.alter } : n;
  });
}

// The ranges for the two staves overlap at the wider settings, so two independent lines
// can land on the same key — and one key cannot be pressed twice, so that chord could
// never be played correctly. Move the whole lower line down in octaves until it clears,
// rather than nudging single notes: a lone octave jump mid-line looks like a mistake.
function dropBelow(low, high) {
  for (let oct = 0; oct <= 4; oct++) {
    const moved = low.map(n => ({ step: n.step, octave: n.octave - oct, alter: n.alter }));
    if (moved.every((n, i) => midiOf(n) < midiOf(high[i]) && midiOf(n) >= 21)) return moved;
  }
  // A wide line can be too tall to fit between the keyboard's bottom note and the line
  // above it. Place each note as high as it can sit while still clearing both.
  return low.map((n, i) => {
    let o = n.octave;
    while (midiOf({ step: n.step, octave: o, alter: n.alter }) >= midiOf(high[i])) o--;
    while (midiOf({ step: n.step, octave: o, alter: n.alter }) < 21) o++;
    return { step: n.step, octave: o, alter: n.alter };
  });
}

function isChromatic(n, scale) {
  const tone = scale.find(t => t.step === n.step);
  return !!tone && tone.alter !== n.alter;
}

// A note of the key at a given staff position.
function noteInScale(scale, diatonic, raiseSeventh) {
  const step = ((diatonic % 7) + 7) % 7;
  const tone = scale.find(t => t.step === step) || scale[0];
  let alter = tone.alter;
  if (raiseSeventh && step === scale[6].step && scale[6].alter < 1) alter = scale[6].alter + 1;
  return { step, octave: Math.floor(diatonic / 7), alter };
}

// Up the scale to the top of the range, turn round, back down. The top note is played
// once on the turn, not twice, which is how a scale is fingered and how it is read.
function scaleLine(rng, scale, count, range, raise, offset) {
  const [lo, hi] = range;
  if (hi - lo < 2) return new Array(count).fill(0).map(() => noteInScale(scale, lo, raise));
  let d = lo;
  while (d <= hi && ((d % 7) + 7) % 7 !== scale[0].step) d++;   // start on the tonic if we can
  if (d > hi) d = lo;
  // Starting the two hands on different degrees is what makes a scale in one hand and a
  // scale in the other into two different lines rather than the same one twice.
  d += offset || 0;
  while (d > hi) d -= 7;
  while (d < lo) d += 7;
  let dir = 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(noteInScale(scale, d, raise));
    if (d + dir > hi || d + dir < lo) dir = -dir;
    d += dir;
  }
  return out;
}

// Mostly steps, with the odd leap — what a readable tune is made of. Ends on the tonic.
//
// The moves carry momentum. A plain random walk with equal odds up and down produces
// "A G A G A": it oscillates, because reversing is as likely as carrying on, and that
// reads as noise rather than as a line going somewhere.
// How far the line moves, and how willing it is to change direction. The harder settings
// are harder for one reason: you cannot guess the next note. A stepwise line can be played
// by ear after the first two notes; a line of unpredictable leaps has to be read.
const MOTION = {
  steps:  { steps: [1, 1, 1, 1, 1, 1, 2], turn: 0.25, chroma: 0.06 },
  mixed:  { steps: [1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4], turn: 0.30, chroma: 0.10 },
  leaps:  { steps: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6], turn: 0.45, chroma: 0.14 },
  wide:   { steps: [2, 3, 4, 4, 5, 5, 6, 7, 7, 8, 9], turn: 0.50, chroma: 0.18 }
};

function melodyLine(rng, scale, count, range, motion, chromatic) {
  const m = MOTION[motion] || MOTION.mixed;
  const [lo, hi] = range;
  let d = Math.floor((lo + hi) / 2);
  while (d > lo && ((d % 7) + 7) % 7 !== scale[0].step) d--;

  let dir = rng() < 0.5 ? 1 : -1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const note = noteInScale(scale, d, false);
    if (chromatic && i > 0 && i < count - 1 && rng() < m.chroma) colour(note, scale, dir);
    out.push(note);
    if (rng() < m.turn) dir = -dir;
    let step = pick(rng, m.steps);
    if (d + dir * step > hi || d + dir * step < lo) dir = -dir;     // turn at the edges
    if (d + dir * step > hi || d + dir * step < lo) step = 1;
    if (d + dir * step > hi || d + dir * step < lo) break;
    d += dir * step;
  }
  while (out.length < count) out.push(out[out.length - 1]);

  // Land on the tonic. If the tune is already sitting on one, step away first so the
  // phrase closes onto it instead of just repeating it.
  if (out.length > 1) {
    const from = diatonicOf(out[out.length - 2]);
    let best = null;
    for (let t = ((scale[0].step % 7) + 7) % 7; t <= hi; t += 7) {
      if (t < lo) continue;
      const cost = Math.abs(t - from);
      if (!best || cost < best.cost) best = { cost, t };
    }
    if (best) {
      if (best.t === from) {
        const near = from + 1 <= hi ? from + 1 : from - 1;
        if (near >= lo && near <= hi) out[out.length - 2] = noteInScale(scale, near, false);
      }
      out[out.length - 1] = noteInScale(scale, best.t, false);
    }
  }
  return out;
}

// Bend a note out of the key by a semitone — sharpened going up, flattened going down,
// which is how a chromatic note is spelled and how it wants to resolve. Left alone if the
// key signature has already used up the accidental, so nothing needs a double sharp.
function colour(note, scale, dir) {
  const want = dir > 0 ? 1 : -1;
  if (Math.abs(note.alter + want) > 1) return;
  note.alter += want;
}

// Every semitone in turn: sharps going up, flats coming down. Nothing to ride but the
// accidentals, which is the point.
function chromaticScale(rng, scale, count, range) {
  const [lo, hi] = range;
  const loMidi = midiOf(noteInScale(scale, lo, false));
  const hiMidi = midiOf(noteInScale(scale, hi, false));
  let m = loMidi, dir = 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(spellChromatic(m, dir));
    if (m + dir > hiMidi || m + dir < loMidi) dir = -dir;
    m += dir;
  }
  return out;
}

const SHARP_SPELL = [[0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[5,1],[6,0]];
const FLAT_SPELL  = [[0,0],[1,-1],[1,0],[2,-1],[2,0],[3,0],[4,-1],[4,0],[5,-1],[5,0],[6,-1],[6,0]];

function spellChromatic(midi, dir) {
  const pc = ((midi % 12) + 12) % 12;
  const [step, alter] = (dir > 0 ? SHARP_SPELL : FLAT_SPELL)[pc];
  // The octave has to come from the natural letter, not from the sounding pitch: C flat
  // sounds like B but is written in the octave above it.
  const natural = Math.floor((midi - alter) / 12) - 1;
  return { step, octave: natural, alter };
}

// Broken chords: the same progression as the chord styles, one note at a time.
function arpeggioLine(rng, scale, count, range, minor) {
  const degrees = progression(rng, Math.max(2, Math.ceil(count / 3)));
  const [lo, hi] = range;
  const out = [];
  let di = 0;
  while (out.length < count) {
    const chord = chordOn(scale, degrees[di % degrees.length], "triads", minor, rng, "key");
    di++;
    const up = di % 2 === 1;
    const tones = [];
    let cur = lo;
    for (let i = 0; i < chord.length + 1 && tones.length + out.length < count; i++) {
      const tone = chord[i % chord.length];
      while (cur <= hi && ((cur % 7) + 7) % 7 !== tone.step) cur++;
      if (cur > hi) break;
      tones.push({ step: tone.step, octave: Math.floor(cur / 7), alter: tone.alter });
      cur++;
    }
    if (!tones.length) break;
    out.push(...(up ? tones : tones.reverse()));
  }
  while (out.length < count) out.push(out[out.length - 1] || noteInScale(scale, lo, false));
  return out.slice(0, count);
}

// How far below the line the left hand sits: one, two or three octaves, whichever keeps
// the most of it inside the bass staff's range and none of it off the bottom of the
// keyboard. Two octaves is the usual answer, and is preferred when it is a close call.
function bassShift(line, bassRange) {
  const [lo, hi] = bassRange;
  let best = null;
  for (const octaves of [2, 1, 3]) {
    const shift = octaves * 7;
    let outside = 0, offKeyboard = 0;
    for (const n of line) {
      const d = diatonicOf(n) - shift;
      if (midiOf({ step: n.step, octave: Math.floor(d / 7), alter: n.alter }) < 21) offKeyboard++;
      if (d < lo) outside += lo - d;
      else if (d > hi) outside += d - hi;
    }
    const cost = offKeyboard * 1000 + outside + Math.abs(octaves - 2) * 2;
    if (!best || cost < best.cost) best = { cost, shift };
  }
  return best.shift;
}

// ---------------------------------------------------------------- the key

// The seven notes of the key, as { step, alter }, starting from the tonic.
function buildScale(fifths, minor) {
  const alters = keyAlters(fifths);
  const tonic = tonicStep(fifths, minor);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const step = (tonic + i) % 7;
    out.push({ step, alter: alters[step] });
  }
  return out;
}

// ---------------------------------------------------------------- progressions

function progression(rng, count) {
  if (count <= 0) return [0];
  const out = [0];
  while (out.length < count - 2) out.push(pick(rng, MOVES[out[out.length - 1]]));
  while (out.length < count - 1) out.push(4);   // the dominant
  if (out.length < count) out.push(0);          // home, so it sounds finished
  return out.slice(0, count);
}

// ---------------------------------------------------------------- rhythm

// Even note values throughout, for scales.
function evenRhythm(measures, timeSig, mode) {
  const per = timeSig[0];
  const unit = mode === "simple" ? 2 : mode === "quarters" ? 1 : 0.5;
  const out = [];
  for (let m = 0; m < measures; m++) {
    let left = per, atBeat = 0, first = true;
    while (left > 0) {
      const take = Math.min(unit, left);
      out.push({ beats: take, dotted: false, newMeasure: first, beat: atBeat });
      left -= take; atBeat += take; first = false;
    }
  }
  if (out.length) out[0].newMeasure = false;
  return out;
}

function rhythmFor(rng, measures, timeSig, mode) {
  const per = timeSig[0];
  // Repeats are the weighting: picking uniformly from [4,3,2,1] fills the page with
  // whole notes, which is not what anyone needs to practise.
  const menu =
    mode === "simple"   ? [4, 3, 2, 2, 2] :
    mode === "quarters" ? [4, 3, 2, 2, 1, 1, 1, 1, 1] :
                          [4, 3, 2, 2, 1, 1, 1, 0.5, 0.5, 0.5, 0.5];
  const out = [];
  for (let m = 0; m < measures; m++) {
    let left = per, first = true, atBeat = 0;
    while (left > 0) {
      const usable = menu.filter(d => d <= left && (d !== 0.5 || left >= 1) && (d !== 3 || per >= 3));
      if (!usable.length) {
        // Nothing in the menu fits what is left of the measure — a half note menu in 3/4
        // strands a beat. Fill the remainder with one note rather than leaving a hole.
        out.push({ beats: left, dotted: left === 3, newMeasure: first, beat: atBeat });
        atBeat += left; left = 0; first = false;
        continue;
      }
      const d = pick(rng, usable);
      if (d === 0.5) {
        // Eighths come in pairs on a beat, so they beam properly and read properly.
        out.push({ beats: 0.5, newMeasure: first, beat: atBeat });
        out.push({ beats: 0.5, newMeasure: false, beat: atBeat + 0.5 });
        left -= 1; atBeat += 1; first = false;
        continue;
      }
      out.push({ beats: d === 3 ? 3 : d, dotted: d === 3, newMeasure: first, beat: atBeat });
      left -= d; atBeat += d; first = false;
    }
  }
  out[0].newMeasure = false;   // the first event opens measure 1, it does not start a new one
  return out;
}

// ---------------------------------------------------------------- chords

// The notes of a chord on a scale degree, as { step, alter }, root first.
function chordOn(scale, degree, style, minor, rng, accidentalMode, nextDegree) {
  if (style === "intervals") {
    // Not chords at all: two or three notes of the key, a readable interval apart.
    const gap = pick(rng, [2, 3, 4, 5]);
    return [
      Object.assign({}, scale[degree]),
      Object.assign({}, scale[(degree + gap) % 7]),
      Object.assign({}, scale[(degree + gap + 2) % 7])
    ];
  }
  const size = style === "sevenths" ? 4 : 3;
  const notes = [];
  for (let i = 0; i < size; i++) notes.push(Object.assign({}, scale[(degree + i * 2) % 7]));

  // In a minor key the dominant is major and the leading note is raised — that is how
  // minor actually works, not an extra accidental we chose to add. In the far-flung minor
  // keys the raise would want a double sharp; there we leave it alone rather than put a
  // double accidental in front of someone practising their reading.
  if (minor && (degree === 4 || degree === 6) && scale[6].alter < 1) {
    const leading = scale[6];
    for (const n of notes) if (n.step === leading.step) n.alter = leading.alter + 1;
  }

  // A secondary dominant now and then, when accidentals are switched on.
  if (accidentalMode === "some" && rng() < 0.18 && nextDegree !== undefined && nextDegree !== degree) {
    const target = scale[nextDegree];
    const rootStep = (target.step + 4) % 7;
    const built = majorTriadFrom(scale, rootStep);
    if (built) return built;
  }
  return notes;
}

// A major triad on a given letter, spelled against the key where it can be.
function majorTriadFrom(scale, rootStep) {
  const find = st => scale.find(n => n.step === st);
  const root = find(rootStep);
  if (!root) return null;
  const third = find((rootStep + 2) % 7), fifth = find((rootStep + 4) % 7);
  if (!third || !fifth) return null;
  const out = [Object.assign({}, root), Object.assign({}, third), Object.assign({}, fifth)];
  // Raise the third until it is a major third above the root.
  const semis = (a, b) => (((STEP_SEMITONE[b.step] + b.alter) - (STEP_SEMITONE[a.step] + a.alter)) + 24) % 12;
  while (semis(out[0], out[1]) < 4) out[1].alter++;
  while (semis(out[0], out[1]) > 4) out[1].alter--;
  while (semis(out[0], out[2]) < 7) out[2].alter++;
  while (semis(out[0], out[2]) > 7) out[2].alter--;
  if (Math.abs(out[1].alter) > 1 || Math.abs(out[2].alter) > 1) return null;
  return out;
}

// Lay a chord out in one hand: choose the inversion and octave that moves least from
// where the hand already was.
function voice(chord, range, count, prev, rng, lowest) {
  const [lo, hi] = range;
  const want = Math.min(count, chord.length + 1);
  const options = [];

  for (let rot = 0; rot < chord.length; rot++) {
    for (let oct = 0; oct <= 8; oct++) {
      const notes = [];
      let dia = lo + oct;
      // Walk upward through the chord tones from this rotation.
      for (let i = 0; i < want; i++) {
        const tone = chord[(rot + i) % chord.length];
        while (((dia % 7) + 7) % 7 !== tone.step) dia++;
        notes.push({ step: tone.step, octave: Math.floor(dia / 7), alter: tone.alter });
        dia++;
      }
      const dias = notes.map(diatonicOf);
      if (dias[0] < lo || dias[dias.length - 1] > hi) continue;
      if (dias[dias.length - 1] - dias[0] > 9) continue;   // no hand-breaking spreads
      notes.rooted = rot === 0;
      options.push(notes);
    }
  }
  if (!options.length) {
    // Nothing fits the range: take the chord root alone, as low as it will go.
    const tone = chord[0];
    let dia = lo;
    while (((dia % 7) + 7) % 7 !== tone.step) dia++;
    if (dia > hi) dia -= 7;
    return [{ step: tone.step, octave: Math.floor(dia / 7), alter: tone.alter }];
  }

  const score = notes => {
    const dias = notes.map(diatonicOf);
    // The left hand carries the root. Letting it take whichever chord tone happened to sit
    // lowest puts the piece in permanent inversion and sounds muddy.
    if (lowest) return dias[0] + (notes.rooted ? 0 : 40);
    if (!prev) return Math.abs(dias[0] - (range[0] + 3));
    const p = prev.map(diatonicOf);
    let move = 0;
    for (let i = 0; i < Math.min(p.length, dias.length); i++) move += Math.abs(dias[i] - p[i]);
    return move;
  };
  options.sort((a, b) => score(a) - score(b));
  // A little variety, so it is not always the same voicing.
  const top = options.slice(0, Math.min(3, options.length));
  return top[Math.floor(rng() * top.length)];
}
