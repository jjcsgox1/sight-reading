// render.js — draws a grand staff as SVG.
//
// Everything that can be a shape is a shape: staff lines, noteheads, stems, beams, ledger
// lines, dots, ties, the brace. The things that cannot reasonably be drawn from rectangles
// and ellipses — the two clefs, the accidentals, the shorter rests — are text, set in
// whatever music font the system has. On Windows that is Segoe UI Symbol, which draws them
// properly. Each glyph is measured and mapped onto the staff so it lands in the right
// place whichever font ends up drawing it.
//
// It draws from exercise.measures: per staff, a list of chord groups each with its own
// onset and duration. Real music does not move both hands together, so a single shared
// rhythm is not enough. Both staves share one onset-to-x map per measure, which is what
// keeps the hands lined up vertically.
//
// Every notehead is its own <g> carrying its event index and MIDI number, so marking one
// red after a wrong note is a single class change and never a redraw.

const SVGNS = "http://www.w3.org/2000/svg";
const MUSIC_FONT = '"Bravura","Segoe UI Symbol","Noto Music","Segoe UI Historic",serif';

// All geometry is in staff spaces (S), the distance between two staff lines.
const GAP = 8;          // treble bottom line to bass top line
const MIN_PAD = 2.5;    // least room above and below a system, even with no ledger lines

const BRACE_W = 2.4;
const CLEF_W = 3.6;
const TIME_W = 3.0;     // room for the time signature, plus the gap before the first bar
const HEAD_RX = 0.68, HEAD_RY = 0.5;

// Bottom staff line of each clef, and which diatonic value sits on it.
const CLEF = {
  treble: { bottomY: 4, bottomDia: 30, midDia: 34, glyph: "\u{1D11E}" },  // E4 bottom, B4 middle
  bass:   { bottomY: 4, bottomDia: 18, midDia: 22, glyph: "\u{1D122}" }   // G2 bottom, D3 middle
};

// h is the ink height in staff spaces; anchor is how far down the ink the note's own line
// falls. A sharp and a natural are symmetrical, so they sit on their middle. A flat is
// not: the note belongs in the middle of its bowl, which is near the bottom, with the
// stem rising above it.
const ACCIDENTAL = {
  "1":  { ch: "♯", h: 2.4, anchor: 0.50 },
  "-1": { ch: "♭", h: 2.6, anchor: 0.76 },
  "0":  { ch: "♮", h: 2.5, anchor: 0.50 },
  "2":  { ch: "\u{1D12A}", h: 0.9, anchor: 0.50 },     // double sharp
  "-2": { ch: "♭♭", h: 2.7, anchor: 0.76 }   // double flat
};

// hollow noteheads, whether there is a stem, and how many beams or flags hang off it.
const NOTE_TYPE = {
  whole:   { hollow: true,  stem: false, beams: 0 },
  half:    { hollow: true,  stem: true,  beams: 0 },
  quarter: { hollow: false, stem: true,  beams: 0 },
  eighth:  { hollow: false, stem: true,  beams: 1 },
  "16th":  { hollow: false, stem: true,  beams: 2 },
  "32nd":  { hollow: false, stem: true,  beams: 3 },
  "64th":  { hollow: false, stem: true,  beams: 4 }
};

// Whole and half rests are drawn as bars hanging from or sitting on a line. The rest are
// glyphs, sized and placed by eye against the staff.
const REST_GLYPH = {
  quarter: { ch: "\u{1D13D}", h: 2.6, anchor: 0.50 },
  eighth:  { ch: "\u{1D13E}", h: 2.0, anchor: 0.50 },
  "16th":  { ch: "\u{1D13F}", h: 2.9, anchor: 0.55 },
  "32nd":  { ch: "\u{1D140}", h: 3.6, anchor: 0.58 },
  "64th":  { ch: "\u{1D141}", h: 4.2, anchor: 0.60 }
};

// ------------------------------------------------------------------ small helpers

function el(name, attrs, parent) {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// Measuring a glyph properly.
//
// SVG's getBBox on a <text> gives the LAYOUT box — the same height for every character in
// the font, because it is the line box and not the shape. Positioning a sharp by it puts
// the sharp wherever the font's line spacing happens to fall, which is why accidentals
// drifted off their lines. Canvas measureText reports the real ink extents instead, so
// everything below is placed by the shape actually drawn.
const MEASURE_PX = 200;
const inkCache = new Map();
let inkCtx = null;

function inkOf(ch) {
  if (inkCache.has(ch)) return inkCache.get(ch);
  let ink = null;
  try {
    if (!inkCtx) inkCtx = document.createElement("canvas").getContext("2d");
    inkCtx.font = MEASURE_PX + "px " + MUSIC_FONT;
    const m = inkCtx.measureText(ch);
    const top = -m.actualBoundingBoxAscent, bottom = m.actualBoundingBoxDescent;
    const left = -m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight;
    if (isFinite(top) && isFinite(bottom) && bottom - top > 0)
      ink = { top, left, height: bottom - top, width: Math.max(1, right - left) };
  } catch (e) { ink = null; }
  inkCache.set(ch, ink);
  return ink;
}

// Draw a glyph so that its ink is `heightS` staff spaces tall, its left edge at x, and the
// point `anchorFrac` of the way down it sitting exactly on y.
function glyph(parent, ch, x, y, heightS, anchorFrac, S, cls) {
  const t = el("text", { x: 0, y: 0, class: cls, "font-family": MUSIC_FONT,
                         "font-size": MEASURE_PX }, parent);
  t.textContent = ch;
  const ink = inkOf(ch);
  if (!ink) {   // no canvas metrics: fall back to the old, cruder placement
    const b = t.getBBox();
    if (!b.height) { t.setAttribute("x", x); t.setAttribute("y", y); return t; }
    const k2 = (heightS * S) / b.height;
    t.setAttribute("transform", "translate(" + (x - b.x * k2) + "," +
      (y - (b.y + b.height * anchorFrac) * k2) + ") scale(" + k2 + ")");
    return t;
  }
  const k = (heightS * S) / ink.height;
  const tx = x - ink.left * k;
  const ty = y - (ink.top + ink.height * anchorFrac) * k;
  t.setAttribute("transform", "translate(" + tx + "," + ty + ") scale(" + k + ")");
  return t;
}

// How wide a glyph is on the staff, once drawn at that height. Used to stack accidentals.
function glyphWidth(ch, heightS, S) {
  const ink = inkOf(ch);
  if (!ink) return heightS * S * 0.35;
  return ink.width * ((heightS * S) / ink.height);
}

function beatsOfType(type, dots) {
  const base = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25, "32nd": 0.125, "64th": 0.0625 };
  let b = base[type] || 1, add = b;
  for (let i = 0; i < (dots || 0); i++) { add /= 2; b += add; }
  return b;
}

// ------------------------------------------------------------------ the renderer

class StaffRenderer {
  constructor(svg) {
    this.svg = svg;
    this.headsByEvent = new Map();   // event index -> [ {g, midi, clef} ]
    this.eventBoxes = new Map();     // event index -> {x, w, top, h}
  }

  render(exercise, widthPx, opts) {
    opts = opts || {};
    const S = opts.space || 12;
    this.S = S;
    this.exercise = exercise;
    this.headsByEvent.clear();
    this.eventBoxes.clear();
    this.ties = [];
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);

    const measures = exercise.measures || [];

    // Where in the music each moment-you-play sits, so the cursor can be put on it.
    this.sliceAt = new Map();
    for (const ev of exercise.events) this.sliceAt.set(ev.measure + ":" + ev.onset, ev.index);

    // Only reserve as much room above and below as the music actually reaches into.
    // Fixed padding wastes half the page when nothing goes near a ledger line.
    let highest = 38, lowest = 18;          // the treble top line, the bass bottom line
    for (const m of measures) {
      const cl = m.clefs || { treble: "treble", bass: "bass" };
      for (const g of m.staves.treble) for (const n of g.notes)
        highest = Math.max(highest, diatonicOf(n) + (38 - CLEF[cl.treble].bottomDia - 8));
      for (const g of m.staves.bass) for (const n of g.notes)
        lowest = Math.min(lowest, diatonicOf(n) + (18 - CLEF[cl.bass].bottomDia));
    }
    this.padTop = Math.max(MIN_PAD, (highest - 38) / 2 + 2.5);
    this.padBot = Math.max(MIN_PAD, (18 - lowest) / 2 + 2.5);
    this.sysH = 4 + GAP + 4 + this.padTop + this.padBot;

    const headerW = this.headerWidth(exercise, S);
    for (const m of measures) m.width = this.measureWidth(m, S);
    const systems = this.packSystems(measures, widthPx, headerW, S);

    const totalH = systems.length * this.sysH * S + 2 * S;
    this.svg.setAttribute("viewBox", "0 0 " + widthPx + " " + totalH);
    this.svg.setAttribute("width", widthPx);
    this.svg.setAttribute("height", totalH);

    systems.forEach((sys, i) => this.drawSystem(sys, i * this.sysH * S + S, widthPx, headerW, S));
    this.drawTies(S);
    return totalH;
  }

  // How much room one key-signature accidental needs, measured rather than assumed. A
  // fixed figure per accidental is what let seven sharps run into the time signature:
  // the glyph is as wide as the font draws it, not as wide as a constant says.
  keySigStep(fifths, S) {
    if (!fifths) return 0;
    const spec = ACCIDENTAL[fifths > 0 ? "1" : "-1"];
    return glyphWidth(spec.ch, spec.h, S) + 0.24 * S;
  }

  headerWidth(ex, S) {
    const keySig = Math.abs(ex.fifths) * this.keySigStep(ex.fifths, S);
    return (BRACE_W + 1.1 + CLEF_W) * S + keySig + TIME_W * S;
  }

  // The moments in a measure where something is struck, and how much room each gets.
  onsetsOf(m) {
    const total = m.beats || m.timeSig[0];
    const set = new Set();
    for (const staff of ["treble", "bass"])
      for (const g of m.staves[staff]) set.add(g.onset);
    const onsets = [...set].sort((a, b) => a - b);
    if (!onsets.length) onsets.push(0);
    const spans = onsets.map((o, i) => Math.max(0.05, (i + 1 < onsets.length ? onsets[i + 1] : total) - o));
    const accidental = onsets.map(o => {
      for (const staff of ["treble", "bass"])
        for (const g of m.staves[staff])
          if (g.onset === o && g.notes.some(n => n.showAccidental !== null && n.showAccidental !== undefined))
            return true;
      return false;
    });
    return { onsets, spans, accidental };
  }

  measureWidth(m, S) {
    const { spans, accidental } = this.onsetsOf(m);
    let w = 0.6;
    spans.forEach((sp, i) => { w += 4.0 + 3.2 * Math.min(sp, 4) + (accidental[i] ? 1.6 : 0); });
    return w * S;
  }

  packSystems(measures, widthPx, headerW, S) {
    const avail = widthPx - headerW - 1.5 * S;
    const systems = [];
    let cur = [], w = 0;
    for (const m of measures) {
      if (cur.length && w + m.width > avail) { systems.push(cur); cur = []; w = 0; }
      cur.push(m); w += m.width;
    }
    if (cur.length) systems.push(cur);
    for (const sys of systems) {
      const used = sys.reduce((a, m) => a + m.width, 0);
      const k = used > 0 ? Math.min(avail / used, 1.6) : 1;
      for (const m of sys) m.drawWidth = m.width * k;
    }
    return systems;
  }

  // ---------------------------------------------------------------- one system

  drawSystem(measures, top, widthPx, headerW, S) {
    const g = el("g", { transform: "translate(0," + top + ")" }, this.svg);
    const trebleTop = this.padTop * S;
    const bassTop = (this.padTop + 4 + GAP) * S;

    for (const yTop of [trebleTop, bassTop])
      for (let i = 0; i < 5; i++)
        el("line", { class: "staffline", x1: BRACE_W * S, y1: yTop + i * S, x2: widthPx - 0.5 * S, y2: yTop + i * S }, g);

    this.drawBrace(g, trebleTop, bassTop + 4 * S, S);
    el("line", { class: "barline thick", x1: BRACE_W * S, y1: trebleTop, x2: BRACE_W * S, y2: bassTop + 4 * S }, g);

    const opening = measures[0].clefs || { treble: "treble", bass: "bass" };
    let x = BRACE_W * S + 1.1 * S;
    this.drawClef(g, opening.treble, x, trebleTop, S, 1);
    this.drawClef(g, opening.bass, x, bassTop, S, 1);
    x += CLEF_W * S;

    x = this.drawKeySignature(g, x, trebleTop, bassTop, S, opening);
    this.drawTimeSignature(g, x, trebleTop, bassTop, S, measures[0].timeSig);
    x = headerW;

    let shown = opening;
    for (const m of measures) {
      const cl = m.clefs || { treble: "treble", bass: "bass" };
      // A hand that moves into the other clef says so, the way printed music does.
      for (const staff of ["treble", "bass"]) {
        if (cl[staff] === shown[staff]) continue;
        this.drawClef(g, cl[staff], x + 0.3 * S, staff === "treble" ? trebleTop : bassTop, S, 0.72);
        x += 2.6 * S;
      }
      shown = cl;
      this.drawMeasure(g, m, x, m.drawWidth, trebleTop, bassTop, top, S);
      x += m.drawWidth;
      el("line", { class: "barline", x1: x, y1: trebleTop, x2: x, y2: bassTop + 4 * S }, g);
    }
  }

  // The bass clef's dot sits on the F line, the treble clef's curl wraps the G line.
  drawClef(g, clef, x, yTop, S, scale) {
    if (clef === "bass") glyph(g, CLEF.bass.glyph, x, yTop + 1 * S, 3.0 * scale, 0.33, S, "glyph");
    else glyph(g, CLEF.treble.glyph, x, yTop + 3 * S, 6.8 * scale, 0.71, S, "glyph");
  }

  drawBrace(g, yTop, yBot, S) {
    const x = BRACE_W * S - 0.35 * S, mid = (yTop + yBot) / 2, h = (yBot - yTop) / 2;
    const b = 1.5 * S;
    const d =
      "M " + x + " " + yTop +
      " C " + (x - b) + " " + (yTop + h * 0.32) + " " + (x - b * 0.15) + " " + (mid - h * 0.16) + " " + (x - b * 0.62) + " " + mid +
      " C " + (x - b * 0.15) + " " + (mid + h * 0.16) + " " + (x - b) + " " + (yBot - h * 0.32) + " " + x + " " + yBot +
      " C " + (x - b * 0.45) + " " + (yBot - h * 0.36) + " " + (x - b * 0.25) + " " + (mid + h * 0.12) + " " + (x - b * 0.3) + " " + mid +
      " C " + (x - b * 0.25) + " " + (mid - h * 0.12) + " " + (x - b * 0.45) + " " + (yTop + h * 0.36) + " " + x + " " + yTop + " Z";
    el("path", { class: "brace", d }, g);
  }

  drawKeySignature(g, x, trebleTop, bassTop, S, clefs) {
    const ex = this.exercise;
    if (!ex.fifths) return x;
    const step = this.keySigStep(ex.fifths, S);
    for (const [staff, yTop] of [["treble", trebleTop], ["bass", bassTop]]) {
      const clef = (clefs && clefs[staff]) || staff;
      const sig = keySignature(ex.fifths, clef);
      let cx = x;
      for (const a of sig) {
        const spec = ACCIDENTAL[String(a.alter)];
        if (spec) glyph(g, spec.ch, cx, this.noteY(a.diatonic, clef, yTop, S), spec.h, spec.anchor, S, "glyph");
        cx += step;
      }
    }
    return x + Math.abs(ex.fifths) * step;
  }

  drawTimeSignature(g, x, trebleTop, bassTop, S, timeSig) {
    const [n, d] = timeSig || this.exercise.timeSig;
    for (const yTop of [trebleTop, bassTop]) {
      for (const [val, cy] of [[n, yTop + S], [d, yTop + 3 * S]]) {
        const t = el("text", {
          x: x + 1.05 * S, y: cy, class: "timesig", "text-anchor": "middle",
          "dominant-baseline": "central", "font-size": 2.4 * S
        }, g);
        t.textContent = val;
      }
    }
  }

  noteY(diatonic, clef, yTop, S) {
    const c = CLEF[clef];
    return yTop + c.bottomY * S - (diatonic - c.bottomDia) * (S / 2);
  }

  // ---------------------------------------------------------------- one measure

  drawMeasure(g, m, x0, width, trebleTop, bassTop, sysTop, S) {
    const { onsets, spans, accidental } = this.onsetsOf(m);

    // One onset-to-x map, shared by both staves. This is what lines the hands up.
    const raw = spans.map((sp, i) => 4.0 + 3.2 * Math.min(sp, 4) + (accidental[i] ? 1.6 : 0));
    const total = raw.reduce((a, b) => a + b, 0);
    const k = total > 0 ? (width - 0.6 * S) / (total * S) : 1;
    const xAt = new Map();
    let cx = x0 + 0.6 * S;
    onsets.forEach((o, i) => {
      const w = raw[i] * S * k;
      xAt.set(o, { left: cx, w, centre: cx + w * 0.5 });
      cx += w;
    });

    // The cursor's box for each moment you have to play.
    onsets.forEach(o => {
      const idx = this.sliceAt.get(m.index + ":" + o);
      if (idx === undefined) return;
      const box = xAt.get(o);
      this.eventBoxes.set(idx, {
        x: box.left, w: box.w,
        top: sysTop + trebleTop - Math.min(this.padTop, 2) * S,
        h: (4 + GAP + 4 + 2 * Math.min(this.padTop, 2)) * S
      });
    });

    const clefs = m.clefs || { treble: "treble", bass: "bass" };
    for (const [staff, yTop] of [["treble", trebleTop], ["bass", bassTop]]) {
      const groups = m.staves[staff];
      // Where two voices share a staff, stem direction is what tells them apart: the
      // upper voice up, the lower voice down, whatever the pitches happen to be.
      const voices = new Set(groups.map(grp => grp.voice));
      const split = voices.size > 1 ? Math.min(...voices) : null;
      for (const grp of groups) {
        const box = xAt.get(grp.onset);
        if (!box) continue;
        if (grp.rest) this.drawRest(g, grp, box.centre, yTop, m, S);
        else this.drawChord(g, m, grp, staff, clefs[staff], box.centre, yTop, S,
                            split === null ? null : grp.voice === split);
      }
      this.drawBeams(g, groups, xAt, staff, S);
    }
  }

  // ---------------------------------------------------------------- rests

  drawRest(g, grp, cx, yTop, m, S) {
    const beats = grp.beats || beatsOfType(grp.type, grp.dots);
    if (grp.type === "whole" || beats >= (m.beats || m.timeSig[0])) {
      el("rect", { class: "rest", x: cx - 0.65 * S, y: yTop + S, width: 1.3 * S, height: 0.55 * S }, g);
      return;
    }
    if (grp.type === "half") {
      el("rect", { class: "rest", x: cx - 0.65 * S, y: yTop + 2 * S - 0.55 * S, width: 1.3 * S, height: 0.55 * S }, g);
      return;
    }
    const spec = REST_GLYPH[grp.type] || REST_GLYPH.quarter;
    glyph(g, spec.ch, cx - 0.4 * S, yTop + 2 * S, spec.h, spec.anchor, S, "glyph rest");
    this.drawDots(g, grp, cx + 0.8 * S, yTop + 1.5 * S, S);
  }

  // ---------------------------------------------------------------- one chord

  drawChord(g, m, grp, staff, clef, cx, yTop, S, voiceUp) {
    const c = CLEF[clef];
    const shape = NOTE_TYPE[grp.type] || NOTE_TYPE.quarter;
    const sorted = grp.notes.slice().sort((a, b) => diatonicOf(a) - diatonicOf(b));
    if (!sorted.length) return;
    const dias = sorted.map(diatonicOf);
    const avg = dias.reduce((a, b) => a + b, 0) / dias.length;

    // One voice: the stem points away from the middle line, as engraving does. Two
    // voices: direction is set by which voice it is, so the two lines stay legible.
    const up = voiceUp === null ? avg < c.midDia : voiceUp;

    // Noteheads a second apart cannot share a side of the stem.
    const sides = [];
    for (let i = 0; i < sorted.length; i++) {
      const clash = i > 0 && dias[i] - dias[i - 1] === 1 && sides[i - 1] === 0;
      sides.push(clash ? (up ? 1 : -1) : 0);
    }

    const rx = HEAD_RX * S, ry = HEAD_RY * S;
    const stemX = up ? cx + rx : cx - rx;
    let minY = Infinity, maxY = -Infinity;

    // Accidentals stack leftward in columns, nearest note first, and two of them may
    // share a column only if they are far enough apart vertically not to touch. The old
    // rule just alternated odd and even, which collided on close chords and pushed
    // accidentals needlessly far out on wide ones.
    const acc = [];
    sorted.forEach((n, i) => {
      const spec = ACCIDENTAL[String(n.showAccidental)];
      if (spec) acc.push({ i, spec, y: this.noteY(dias[i], clef, yTop, S) });
    });
    acc.sort((a, b) => a.y - b.y);
    const columns = [];
    for (const a of acc) {
      let col = 0;
      while (columns[col] && columns[col].some(o =>
        Math.abs(o.y - a.y) < (o.spec.h + a.spec.h) * 0.5 * S * 0.92)) col++;
      (columns[col] = columns[col] || []).push(a);
      a.col = col;
    }
    // Each column is as wide as its widest accidental, so nothing overlaps sideways, and
    // the nearest one almost touches the notehead — engraving sets them close, not adrift.
    const colX = [];
    let run = cx - rx - 0.22 * S;
    for (let c = 0; c < columns.length; c++) {
      run -= Math.max(...columns[c].map(a => glyphWidth(a.spec.ch, a.spec.h, S)));
      colX[c] = run;
      run -= 0.16 * S;
    }
    const accFor = new Map(acc.map(a => [a.i, a]));

    sorted.forEach((n, i) => {
      const y = this.noteY(dias[i], clef, yTop, S);
      const ox = sides[i] * rx * 2;
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);

      const evIndex = this.sliceAt.get(m.index + ":" + grp.onset);
      const head = el("g", {
        class: "head" + (n.tied ? " held" : ""),
        "data-ev": evIndex === undefined ? "" : evIndex, "data-midi": midiOf(n)
      }, g);
      this.drawLedgers(head, dias[i], clef, yTop, cx + ox, S);
      el("ellipse", {
        class: "notehead" + (shape.hollow ? " hollow" : ""),
        cx: cx + ox, cy: y, rx, ry, transform: "rotate(-20 " + (cx + ox) + " " + y + ")"
      }, head);

      const a = accFor.get(i);
      if (a) glyph(head, a.spec.ch, colX[a.col], y, a.spec.h, a.spec.anchor, S, "glyph acc");

      const onLine = (dias[i] - c.bottomDia) % 2 === 0;
      this.drawDots(g, grp, cx + rx + 1.05 * S, y - (onLine ? S / 2 : 0), S, head);

      // staff is which of the two staves this sits on; clef is what is printed at the
      // front of it. They are usually the same and, in imported music, sometimes not.
      this.ties.push({ note: n, staff, x: cx + ox, y, rx, up });
      if (evIndex !== undefined) {
        if (!this.headsByEvent.has(evIndex)) this.headsByEvent.set(evIndex, []);
        this.headsByEvent.get(evIndex).push({ g: head, midi: midiOf(n), clef, staff, note: n });
      }
    });

    if (shape.stem) {
      const len = (3.5 + Math.max(0, shape.beams - 1) * 0.75) * S;
      const y1 = up ? maxY : minY;
      const y2 = up ? minY - len : maxY + len;
      const stem = el("line", { class: "stem", x1: stemX, y1, x2: stemX, y2 }, g);
      grp._stem = { x: stemX, tip: y2, up, el: stem, beams: shape.beams };
    } else {
      grp._stem = null;
    }
  }

  drawDots(g, grp, x, y, S, parent) {
    for (let d = 0; d < (grp.dots || 0); d++)
      el("circle", { class: "dot", cx: x + d * 0.45 * S, cy: y, r: 0.17 * S }, parent || g);
  }

  drawLedgers(parent, dia, clef, yTop, cx, S) {
    const c = CLEF[clef];
    const w = HEAD_RX * S * 1.75;
    for (let d = c.bottomDia + 10; d <= dia; d += 2)
      el("line", { class: "ledger", x1: cx - w, y1: this.noteY(d, clef, yTop, S), x2: cx + w, y2: this.noteY(d, clef, yTop, S) }, parent);
    for (let d = c.bottomDia - 2; d >= dia; d -= 2)
      el("line", { class: "ledger", x1: cx - w, y1: this.noteY(d, clef, yTop, S), x2: cx + w, y2: this.noteY(d, clef, yTop, S) }, parent);
  }

  // ---------------------------------------------------------------- beams

  drawBeams(g, groups, xAt, clef, S) {
    const beamed = groups.filter(grp => grp._stem && grp._stem.beams > 0);
    let run = [];
    const flush = () => {
      if (run.length >= 2) this.beamGroup(g, run, S);
      else if (run.length === 1) this.flag(g, run[0], S);
      run = [];
    };
    for (let i = 0; i < beamed.length; i++) {
      const grp = beamed[i], prev = run[run.length - 1];
      const sameBeat = prev && Math.floor(prev.onset) === Math.floor(grp.onset) &&
                       prev.voice === grp.voice &&
                       Math.abs((prev.onset + (prev.beats || 0)) - grp.onset) < 1e-6;
      if (prev && !sameBeat) flush();
      run.push(grp);
    }
    flush();
  }

  beamGroup(g, run, S) {
    const stems = run.map(grp => grp._stem);
    const up = stems[0].up;
    const tip = up ? Math.min(...stems.map(s => s.tip)) : Math.max(...stems.map(s => s.tip));
    for (const s of stems) { s.el.setAttribute("y2", tip); s.tip = tip; }
    const x1 = stems[0].x, x2 = stems[stems.length - 1].x;
    const h = 0.5 * S;
    const count = Math.max(...stems.map(s => s.beams));
    for (let b = 0; b < count; b++) {
      const off = b * (h + 0.32 * S) * (up ? 1 : -1);
      el("rect", {
        class: "beam", x: Math.min(x1, x2), y: (up ? tip : tip - h) + off,
        width: Math.abs(x2 - x1), height: h
      }, g);
    }
  }

  flag(g, grp, S) {
    const s = grp._stem;
    const dir = s.up ? 1 : -1;
    for (let b = 0; b < s.beams; b++) {
      const y = s.tip + b * 0.8 * S * dir;
      const d = "M " + s.x + " " + y +
        " c " + (1.3 * S) + " " + (dir * 0.9 * S) + " " + (1.5 * S) + " " + (dir * 1.7 * S) + " " + (0.35 * S) + " " + (dir * 3.1 * S) +
        " c " + (0.75 * S) + " " + (-dir * 1.4 * S) + " " + (0.1 * S) + " " + (-dir * 1.7 * S) + " " + (-0.35 * S) + " " + (-dir * 3.1 * S) + " Z";
      el("path", { class: "flag", d }, g);
    }
  }

  // ---------------------------------------------------------------- ties

  // A tie joins a note to the same pitch struck again — except it is not struck again,
  // which is the whole point, and why the judge leaves tied notes out of what you play.
  drawTies(S) {
    const byPitch = new Map();
    for (const t of this.ties) {
      const key = t.staff + ":" + diatonicOf(t.note) + ":" + (t.note.alter || 0);
      if (!byPitch.has(key)) byPitch.set(key, []);
      byPitch.get(key).push(t);
    }
    for (const list of byPitch.values()) {
      for (let i = 1; i < list.length; i++) {
        const b = list[i];
        if (!b.note.tied) continue;
        const a = list[i - 1];
        if (Math.abs(a.y - b.y) > 0.5 || b.x <= a.x) continue;   // different system: skip the arc
        const up = !a.up;
        const lift = (up ? -1 : 1) * 1.1 * S;
        const y = a.y + (up ? -0.8 : 0.8) * S * 0.7;
        const d = "M " + (a.x + a.rx) + " " + y +
          " Q " + ((a.x + b.x) / 2) + " " + (y + lift) + " " + (b.x - b.rx) + " " + y;
        el("path", { class: "tie", d }, this.svg);
      }
    }
  }

  // ---------------------------------------------------------------- marking up

  setHeadState(eventIndex, midi, state) {
    const heads = this.headsByEvent.get(eventIndex) || [];
    for (const h of heads) {
      if (midi === null || h.midi === midi)
        h.g.setAttribute("class", "head" + (h.note.tied ? " held" : "") + (state ? " " + state : ""));
    }
  }

  clearMarks() {
    for (const heads of this.headsByEvent.values())
      for (const h of heads) h.g.setAttribute("class", "head" + (h.note.tied ? " held" : ""));
  }

  // A grey notehead showing what was played instead, at the pitch actually hit.
  addGhost(eventIndex, midi, staff) {
    const box = this.eventBoxes.get(eventIndex);
    const heads = this.headsByEvent.get(eventIndex) || [];
    const ref = heads.find(h => h.staff === staff) || heads[0];
    if (!box || !ref) return;
    const S = this.S;
    const note = spellInKey(midi, this.exercise.fifths);
    const sysG = ref.g.parentNode;
    const refY = parseFloat(ref.g.querySelector("ellipse").getAttribute("cy"));
    const c = CLEF[ref.clef];
    const refTop = refY - c.bottomY * S + (diatonicOf(ref.note) - c.bottomDia) * (S / 2);
    const gh = el("g", { class: "head ghost" }, sysG);
    const cx = box.x + box.w * 0.5 + HEAD_RX * S * 2.6;
    const y = this.noteY(diatonicOf(note), ref.clef, refTop, S);
    this.drawLedgers(gh, diatonicOf(note), ref.clef, refTop, cx, S);
    el("ellipse", { class: "notehead", cx, cy: y, rx: HEAD_RX * S, ry: HEAD_RY * S,
      transform: "rotate(-20 " + cx + " " + y + ")" }, gh);
    const spec = note.alter ? ACCIDENTAL[String(note.alter)] : null;
    if (spec) glyph(gh, spec.ch, cx - HEAD_RX * S - 1.45 * S, y, spec.h, spec.anchor, S, "glyph acc");
  }

  cursorTo(eventIndex) {
    const box = this.eventBoxes.get(eventIndex);
    if (!this.cursor || this.cursor.parentNode !== this.svg) {
      this.cursor = el("rect", { class: "cursor", rx: 3 });
      this.svg.insertBefore(this.cursor, this.svg.firstChild);
    }
    if (!box) { this.cursor.setAttribute("opacity", 0); return; }
    this.cursor.setAttribute("opacity", 1);
    this.cursor.setAttribute("x", box.x);
    this.cursor.setAttribute("y", box.top);
    this.cursor.setAttribute("width", box.w);
    this.cursor.setAttribute("height", box.h);
    return box;
  }
}
