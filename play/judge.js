// judge.js — decides what counts as right, and keeps the score.
//
// The rules, in one place, because the whole game turns on them:
//
//   * Notes pressed close together are one attempt at one chord. A rolled chord is judged
//     as a chord, not as three wrong single notes.
//   * An attempt is correct only when the set of keys held is exactly the set the chord
//     asks for. Every note there, nothing extra.
//   * Releasing a key does not take it back. If you played it, you played it.
//   * Accuracy counts the FIRST attempt at each chord. In strict mode you may have to try
//     again to move on, but the retries do not dig the hole deeper.

const SETTLE_MS = 400;   // still short of the chord: how long to wait for the rest of it
const EXTRA_MS = 130;    // already holding enough notes: a moment in case more arrive
const GRACE_MS = 110;    // the chord is right: a moment in case a fumbled extra note follows


class Judge {
  constructor(chords, opts) {
    this.chords = chords;           // [{ index, midi: [..] }] in playing order
    this.mode = (opts && opts.mode) || "practice";   // practice | strict | timed
    this.repeat = (opts && opts.repeat) || "note";   // strict only: note | measure
    this.measureOf = (opts && opts.measureOf) || (() => 1);

    this.at = 0;
    this.attempt = new Set();
    this.timer = null;
    this.started = null;
    this.finished = false;
    this.settledHere = false;       // timed mode: this chord has had its verdict, awaiting the beat

    this.results = new Map();       // chord index -> first verdict
    this.log = [];                  // every attempt, in order, for the review
    this.streak = 0;
    this.bestStreak = 0;

    this.onVerdict = () => {};
    this.onMove = () => {};
    this.onFinish = () => {};
  }

  current() { return this.chords[this.at] || null; }

  noteOn(midi, velocity, t) {
    if (this.finished || this.settledHere) return;
    const chord = this.current();
    if (!chord) return;
    if (this.started === null) this.started = t;
    this.attempt.add(midi);
    clearTimeout(this.timer);

    // Never judge on the instant the set matches. A note fumbled a moment after an
    // otherwise right chord belongs to that chord, not to the next one.
    const want = chord.midi;
    const exact = this.attempt.size === want.length && want.every(m => this.attempt.has(m));
    const wait = exact ? GRACE_MS : this.attempt.size >= want.length ? EXTRA_MS : SETTLE_MS;
    this.timer = setTimeout(() => this.settle(), wait);
  }

  noteOff() { /* letting go does not take a note back */ }

  // Timed mode only: the beat is up. Whatever was played stands, and the cursor moves on
  // whether it was right or not. The clock owns the cursor here, not the playing.
  deadline() {
    if (this.finished) return;
    clearTimeout(this.timer);
    if (!this.settledHere) this.settle(true);
    this.settledHere = false;
    this.advance();
  }

  settle(ranOut) {
    clearTimeout(this.timer);
    const chord = this.current();
    if (!chord) return;
    const played = [...this.attempt].sort((a, b) => a - b);
    if (!played.length && !ranOut) { this.attempt.clear(); return; }
    this.attempt.clear();

    const want = chord.midi;
    const missing = want.filter(m => !played.includes(m));
    const extra = played.filter(m => !want.includes(m));
    const correct = !missing.length && !extra.length;

    const verdict = {
      index: chord.index, correct, want, played, missing, extra,
      timedOut: !!ranOut,
      octaveOnly: !correct && sameShapeOtherOctave(want, played),
      first: !this.results.has(chord.index)
    };

    if (verdict.first) {
      this.results.set(chord.index, verdict);
      if (correct) { this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); }
      else this.streak = 0;
    } else if (!correct) {
      this.streak = 0;
    }
    this.log.push(verdict);
    this.onVerdict(verdict);

    if (this.mode === "timed") { this.settledHere = true; return; }
    if (correct || this.mode === "practice") this.advance();
    else if (this.repeat === "measure") this.backToMeasure();
    else this.onMove(this.at, "retry");
  }

  advance() {
    this.settledHere = false;
    this.at++;
    if (this.at >= this.chords.length) this.finish();
    else this.onMove(this.at, "forward");
  }

  backToMeasure() {
    const m = this.measureOf(this.current().index);
    let i = this.at;
    while (i > 0 && this.measureOf(this.chords[i - 1].index) === m) i--;
    this.at = i;
    this.onMove(this.at, "measure");
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timer);
    this.onFinish(this.summary());
  }

  summary() {
    const first = [...this.results.values()];
    const right = first.filter(v => v.correct).length;
    return {
      total: this.chords.length,
      attempted: first.length,
      right,
      accuracy: first.length ? right / first.length : 0,
      bestStreak: this.bestStreak,
      misses: this.log.filter(v => !v.correct),
      firstMisses: first.filter(v => !v.correct),
      retries: this.log.length - first.length
    };
  }
}

// Right notes, wrong octave — a different mistake from reading the wrong line, and one
// worth naming separately in the review.
function sameShapeOtherOctave(want, played) {
  if (!played.length || want.length !== played.length) return false;
  const shift = played[0] - want[0];
  if (shift === 0 || shift % 12 !== 0) return false;
  return want.every((m, i) => played[i] - m === shift);
}
