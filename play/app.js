// app.js — screens, settings, and the play loop.

const $ = id => document.getElementById(id);
const QUERY = new URLSearchParams(location.search);

// ---------------------------------------------------------------- settings UI

const FIELDS = [
  { key: "keyMode", label: "Key", options: [
    ["c", "C major only"], ["two", "Up to 2 sharps or flats"],
    ["four", "Up to 4"], ["all", "All fifteen"]] },
  { key: "minorToo", label: "Minor keys", options: [[false, "Major only"], [true, "Major and minor"]] },
  { key: "range", label: "Range", options: [
    ["middle", "Around middle C"], ["staves", "Within the staves"],
    ["ledger1", "One ledger line"], ["ledger2", "Two ledger lines"],
    ["ledger3", "Three ledger lines"]] },
  { key: "hands", label: "Hands", options: [["both", "Both"], ["right", "Right only"], ["left", "Left only"]] },
  { key: "notesPerHand", label: "Notes per hand", options: [
    [1, "Single notes"], [2, "Two"], [3, "Triads"], [4, "Four"]] },
  { key: "chordStyle", label: "What to play", options: [
    ["triads", "Chords — diatonic triads"], ["sevenths", "Chords — add sevenths"],
    ["intervals", "Chords — free intervals"],
    ["scales", "Single notes — scales"], ["melody", "Single notes — a melody"],
    ["arpeggios", "Single notes — broken chords"]],
    hint: {
      scales: "Up to the top of the range and back down, in even note values.",
      melody: "A line of mostly steps with the odd leap, ending on the tonic.",
      arpeggios: "The same chord progression, spelled out one note at a time.",
      "": "Blocked chords, both hands together."
    } },
  { key: "motion", label: "Motion", options: [
    ["steps", "Mostly steps"], ["mixed", "Steps and leaps"],
    ["leaps", "Leaps"], ["wide", "Wide leaps"]],
    hint: {
      steps: "Easy on the eye, and playable by ear once it is going.",
      mixed: "Steps with the odd leap.",
      leaps: "Thirds to sixths, turning without warning. Has to be read.",
      wide: "Up to an octave a jump. Nothing can be guessed."
    } },
  { key: "bothHands", label: "Between the hands", options: [
    ["octaves", "In octaves"], ["contrary", "Contrary motion"],
    ["independent", "Two independent lines"]],
    hint: {
      octaves: "The same line in both hands.",
      contrary: "The left hand mirrors the right: one goes up, the other down.",
      independent: "Two separate lines. Nothing in the left hand follows from the right."
    } },
  { key: "accidentals", label: "Accidentals", options: [
    ["key", "Key signature only"], ["some", "Occasional accidentals"],
    ["chromatic", "Chromatic notes"]],
    hint: {
      key: "",
      some: "Secondary dominants in chords; harmonic minor in scales.",
      chromatic: "Notes from outside the key. Scales become chromatic scales."
    } },
  { key: "rhythm", label: "Rhythm", options: [
    ["simple", "Whole and half notes"], ["quarters", "Add quarters"], ["eighths", "Add eighths"]] },
  { key: "timeSigName", label: "Time", options: [["4/4", "4/4"], ["3/4", "3/4"], ["2/4", "2/4"]] },
  { key: "measures", label: "Length", options: [[4, "4 measures"], [8, "8 measures"], [12, "12"], [16, "16"]] },
  { key: "tempo", label: "Tempo (timed mode)", options: [
    [40, "40 bpm"], [50, "50"], [60, "60"], [72, "72"], [84, "84"], [100, "100"], [120, "120"]] }
];

const SAVED_KEY = "sr.settings";

function loadSettings() {
  const base = {
    keyMode: "two", minorToo: true, range: "ledger1", hands: "both", notesPerHand: 3,
    chordStyle: "triads", accidentals: "key", motion: "mixed", bothHands: "octaves",
    rhythm: "quarters", timeSigName: "4/4", measures: 8, tempo: 60
  };
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (raw) Object.assign(base, JSON.parse(raw));
  } catch (e) {}
  return base;
}

function saveSettings() {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(app.settings)); } catch (e) {}
}

// The styles that put one note at a time on the staff. Kept in step with SINGLE_LINE
// in generate.js.
const SINGLE_STYLES = new Set(["scales", "melody", "arpeggios"]);

const fieldEls = {};

function buildSettingsUI() {
  const host = $("settings");
  host.innerHTML = "";
  for (const k in fieldEls) delete fieldEls[k];

  for (const f of FIELDS) {
    const label = document.createElement("label");
    label.className = "field";
    const lab = document.createElement("span");
    lab.className = "lab";
    lab.textContent = f.label;
    const sel = document.createElement("select");
    for (const [value, text] of f.options) {
      const o = document.createElement("option");
      o.value = JSON.stringify(value);
      o.textContent = text;
      sel.appendChild(o);
    }
    sel.value = JSON.stringify(app.settings[f.key]);
    sel.onchange = () => {
      app.settings[f.key] = JSON.parse(sel.value);
      saveSettings();
      syncFields();
    };
    label.appendChild(lab);
    label.appendChild(sel);

    const hint = document.createElement("span");
    hint.className = "hint";
    label.appendChild(hint);

    host.appendChild(label);
    fieldEls[f.key] = { sel, lab, hint, field: f };
  }
  syncFields();
}

// Some settings stop meaning anything depending on others. Say so on the control rather
// than leaving a dead option that quietly does nothing.
function syncFields() {
  const single = SINGLE_STYLES.has(app.settings.chordStyle);

  // Each field says what its current setting means, and goes dim when the rest of the
  // settings have made it irrelevant.
  const say = (key, on, text) => {
    const f = fieldEls[key];
    if (!f) return;
    f.sel.disabled = !on;
    const own = (f.field.hint || {})[app.settings[key]];
    f.hint.textContent = on ? (text || own || "") : text;
  };

  say("chordStyle", true);
  say("notesPerHand", !single, single ? "One, for a single line." : "");
  say("motion", single && app.settings.chordStyle === "melody",
    !single ? "For single-note lines." :
    app.settings.chordStyle !== "melody" ? "Set by the style you picked." : "");
  say("bothHands", single && app.settings.hands === "both",
    !single ? "For single-note lines." :
    app.settings.hands !== "both" ? "Only one hand is playing." : "");
  say("accidentals", true);
}

function settingsForGenerator() {
  const s = Object.assign({}, app.settings);
  const [n, d] = s.timeSigName.split("/").map(Number);
  s.timeSig = [n, d];
  return s;
}

// ---------------------------------------------------------------- app state

const app = {
  settings: loadSettings(),
  mode: "practice",
  reading: "generated",
  library: [],
  pieceId: null,
  pieceFrom: 1,
  pieceTo: 8,
  libraryWarning: "",
  exercise: null,
  judge: null,
  renderer: null,
  reviewRenderer: null,
  source: null,
  tones: new Tones(),
  measureByEvent: new Map(),
  ghosts: [],
  clock: null,
  startedAt: 0
};

try { app.mode = localStorage.getItem("sr.mode") || "practice"; } catch (e) {}

// ---------------------------------------------------------------- screens

function show(which) {
  for (const id of ["setup", "playing", "review"]) $(id).classList.toggle("hide", id !== which);
  window.scrollTo(0, 0);
}

function setMode(mode) {
  app.mode = mode;
  try { localStorage.setItem("sr.mode", mode); } catch (e) {}
  for (const b of document.querySelectorAll(".mode"))
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  $("tempoBox").style.display = mode === "timed" ? "" : "none";
}

for (const b of document.querySelectorAll(".mode[data-mode]")) b.onclick = () => setMode(b.dataset.mode);
setMode(app.mode);

// Generated exercises, or a piece you brought.
function setReading(which) {
  app.reading = which;
  try { localStorage.setItem("sr.reading", which); } catch (e) {}
  for (const b of document.querySelectorAll(".mode[data-source]"))
    b.setAttribute("aria-pressed", String(b.dataset.source === which));
  $("library").classList.toggle("hide", which !== "imported");
  $("difficulty").classList.toggle("hide", which === "imported");
  $("difficultyHeading").classList.toggle("hide", which === "imported");
  $("again").textContent = which === "imported"
    ? "Read it again" : "New exercise, same settings";
  if (which === "imported") drawLibrary();
  updateStartState();
}
for (const b of document.querySelectorAll(".mode[data-source]"))
  b.onclick = () => setReading(b.dataset.source);
try { app.reading = localStorage.getItem("sr.reading") || "generated"; } catch (e) {}

// ---------------------------------------------------------------- the note source

function wireSource() {
  app.source = makeNoteSource();
  app.source.onStatus = st => {
    $("dot").className = "dot" + (st.ok ? " ok" : st.reason === "no-device" ? " warn" : "");
    $("statusText").textContent = st.ok
      ? (st.reason === "keys" ? st.text : "Playing from " + st.text)
      : st.text;
    const sel = $("device");
    if (st.devices && st.devices.length > 1) {
      sel.classList.remove("hide");
      sel.innerHTML = st.devices.map(d =>
        '<option value="' + d.id + '">' + escapeHtml(d.name) + "</option>").join("");
      sel.value = st.deviceId;
      sel.onchange = () => app.source.use(sel.value);
    } else {
      sel.classList.add("hide");
    }
    app.sourceReady = st.ok;
    updateStartState();
  };
  app.source.onNoteOn = (midi, vel, t) => {
    app.tones.note(midi, vel);
    drawHeld();
    if (app.judge && !app.judge.finished) app.judge.noteOn(midi, vel, t);
  };
  app.source.onNoteOff = () => drawHeld();
  app.source.start();
}

function drawHeld() {
  if ($("playing").classList.contains("hide")) return;
  const held = [...app.source.held].sort((a, b) => a - b);
  $("heldKeys").innerHTML = held.map(m => "<span>" + midiLabel(m) + "</span>").join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------------------------------------------------------------- the library
//
// Imported pieces are kept as their original MusicXML and parsed fresh each time, so what
// gets played is always what is in the file. They are stored in the browser so they are
// still there tomorrow; a piece too big for that still works for this session.

const LIB_KEY = "sr.library";
const LIB_BUDGET = 3.5e6;

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (raw) app.library = JSON.parse(raw);
  } catch (e) { app.library = []; }
  if (!Array.isArray(app.library)) app.library = [];
}

function saveLibrary() {
  try {
    const keep = app.library.filter(p => p.xml);
    let total = 0;
    const kept = keep.filter(p => (total += p.xml.length) < LIB_BUDGET);
    localStorage.setItem(LIB_KEY, JSON.stringify(kept));
    app.libraryWarning = kept.length < keep.length
      ? "Some pieces are too large to keep between sessions; they will need loading again."
      : "";
  } catch (e) {
    app.libraryWarning = "There was no room to keep these pieces between sessions.";
  }
}

async function addFiles(files) {
  const problems = [];
  for (const file of files) {
    try {
      const xml = (file.name || "").toLowerCase().endsWith(".mxl")
        ? await readMxl(await file.arrayBuffer())
        : await file.text();
      const ex = parseMusicXml(xml);
      const name = ex.title || file.name.replace(/\.(mxl|musicxml|xml)$/i, "");
      app.library.push({
        id: "p" + Date.now() + Math.floor(Math.random() * 1000),
        name, xml, measures: ex.measures.length,
        tempo: ex.tempo, key: keyName(ex.fifths, false)
      });
      app.pieceId = app.library[app.library.length - 1].id;
      app.pieceFrom = 1;
      app.pieceTo = Math.min(ex.measures.length, 8);
    } catch (err) {
      problems.push(file.name + ": " + (err.message || err));
    }
  }
  saveLibrary();
  drawLibrary();
  $("importError").textContent = problems.join("  ");
}

function currentPiece() {
  return app.library.find(p => p.id === app.pieceId) || null;
}

// There is nothing to start if the keyboard is not there, or if a piece was asked for and
// none is chosen. Say so with the button rather than by quietly playing something else.
function updateStartState() {
  const off = !app.sourceReady || (app.reading === "imported" && !currentPiece());
  $("start").disabled = off;
  $("again").disabled = off;
}

function drawLibrary() {
  const host = $("pieces");
  if (!app.library.length) {
    host.innerHTML = "<p class='dim small' style='margin:0'>Nothing loaded yet. " +
      "Add a MusicXML file and it will appear here.</p>";
    $("pieceRange").innerHTML = "";
    updateStartState();
    return;
  }
  host.innerHTML = app.library.map(p =>
    "<div class='piece' data-id='" + p.id + "' aria-pressed='" + (p.id === app.pieceId) + "'>" +
      "<span class='pn'><span class='pt'>" + escapeHtml(p.name) + "</span>" +
      "<span class='pd'>" + p.measures + " measures &middot; " + escapeHtml(p.key || "") +
      (p.tempo ? " &middot; " + p.tempo + " bpm" : "") + "</span></span>" +
      "<button class='pick'>" + (p.id === app.pieceId ? "Chosen" : "Choose") + "</button>" +
      "<button class='drop' title='Remove'>&times;</button>" +
    "</div>").join("") +
    (app.libraryWarning ? "<p class='dim small' style='margin:8px 0 0'>" +
      escapeHtml(app.libraryWarning) + "</p>" : "");

  for (const row of host.querySelectorAll(".piece")) {
    const id = row.dataset.id;
    row.querySelector(".pick").onclick = () => {
      app.pieceId = id;
      const p = currentPiece();
      app.pieceFrom = 1;
      app.pieceTo = Math.min(p.measures, 8);
      drawLibrary();
    };
    row.querySelector(".drop").onclick = () => {
      app.library = app.library.filter(p => p.id !== id);
      if (app.pieceId === id) app.pieceId = app.library.length ? app.library[0].id : null;
      saveLibrary();
      drawLibrary();
    };
  }
  drawPieceRange();
  updateStartState();
}

// A whole prelude is not a sight reading exercise. Pick the handful of measures to work on.
function drawPieceRange() {
  const p = currentPiece();
  const host = $("pieceRange");
  if (!p) { host.innerHTML = ""; return; }
  const opts = n => {
    let s = "";
    for (let i = 1; i <= p.measures; i++) s += "<option value='" + i + "'>" + i + "</option>";
    return s;
  };
  host.innerHTML =
    "<label class='field'><span class='lab'>From measure</span><select id='mFrom'>" + opts() + "</select></label>" +
    "<label class='field'><span class='lab'>To measure</span><select id='mTo'>" + opts() + "</select></label>";
  $("mFrom").value = String(app.pieceFrom || 1);
  $("mTo").value = String(app.pieceTo || p.measures);
  $("mFrom").onchange = () => {
    app.pieceFrom = +$("mFrom").value;
    if (app.pieceTo < app.pieceFrom) { app.pieceTo = app.pieceFrom; $("mTo").value = String(app.pieceTo); }
  };
  $("mTo").onchange = () => {
    app.pieceTo = +$("mTo").value;
    if (app.pieceFrom > app.pieceTo) { app.pieceFrom = app.pieceTo; $("mFrom").value = String(app.pieceFrom); }
  };
}

// Cut the chosen measures out of a piece, renumbered to start at one.
function sliceOfPiece(ex, from, to) {
  const measures = ex.measures.filter(m => m.index >= from && m.index <= to);
  if (!measures.length) return ex;
  const cut = {
    imported: true, title: ex.title, tempo: ex.tempo,
    fifths: measures[0].fifths, minor: false, timeSig: measures[0].timeSig,
    measures, events: [],
    name: ex.name + (from > 1 || to < ex.measures.length ? "  —  measures " + from + "–" + to : "")
  };
  // The first note of the excerpt cannot be tied to something that is no longer there.
  for (const staff of ["treble", "bass"])
    for (const g of measures[0].staves[staff])
      for (const n of g.notes) n.tied = false;
  buildSlices(cut);
  applyAccidentalsToLayout(cut);
  return cut;
}

function importedExercise() {
  const p = currentPiece();
  if (!p) return null;
  const ex = parseMusicXml(p.xml);
  ex.name = p.name;
  return sliceOfPiece(ex, app.pieceFrom || 1, app.pieceTo || ex.measures.length);
}

// ---------------------------------------------------------------- starting

function newExercise() {
  if (app.reading === "imported") {
    const ex = importedExercise();
    if (ex) return ex;
  }
  return generate(settingsForGenerator());
}

function play(exercise) {
  app.exercise = exercise;
  app.ghosts = [];
  app.measureByEvent = new Map(exercise.events.map(ev => [ev.index, ev.measure]));

  show("playing");
  if (!app.renderer) app.renderer = new StaffRenderer($("score"));
  drawScore();

  const chords = chordsOf(exercise);
  const judge = new Judge(chords, {
    mode: app.mode === "practice" ? "practice" : app.mode === "timed" ? "timed" : "strict",
    repeat: app.mode === "strict-measure" ? "measure" : "note",
    measureOf: i => app.measureByEvent.get(i)
  });
  app.judge = judge;

  judge.onVerdict = onVerdict;
  judge.onMove = onMove;
  judge.onFinish = finish;

  $("hKeyLabel").textContent = exercise.imported ? "Piece" : "Key";
  $("hKey").textContent = exercise.name;
  $("hTempo").textContent = (exercise.tempo || app.settings.tempo) + " bpm";
  updateHud();
  app.renderer.cursorTo(0);
  onMove(0, "start");
  app.startedAt = performance.now();

  $("prompt").className = "prompt";
  $("prompt").textContent = app.mode === "timed"
    ? "Four beats in, then keep up."
    : "Play what the cursor is sitting on.";

  stopClock();
  if (app.mode === "timed") startClock();
}

function drawScore() {
  const width = $("score").parentNode.clientWidth - 12;
  app.renderer.render(app.exercise, Math.max(320, width), { space: spaceFor(width) });
}

// Big enough to read from the bench, small enough to get a few measures on a line —
// you cannot sight read what you cannot see coming.
function spaceFor(width) {
  return width > 1000 ? 12 : width > 700 ? 11 : width > 480 ? 10 : 9;
}

addEventListener("resize", () => {
  if (!$("playing").classList.contains("hide") && app.exercise) {
    drawScore();
    replayMarks(app.renderer);
    app.renderer.cursorTo(app.judge ? (app.judge.current() || {}).index : 0);
  }
});

// ---------------------------------------------------------------- during play

function onVerdict(v) {
  for (const m of v.missing) app.renderer.setHeadState(v.index, m, "wrong");
  // One ghost per wrong key per chord. In strict mode the same chord can be missed a
  // dozen times, and a dozen ghosts stacked on one beat is unreadable.
  for (const m of v.extra) {
    if (app.ghosts.some(g => g.index === v.index && g.midi === m)) continue;
    app.ghosts.push({ index: v.index, midi: m, clef: clefFor(v.index, m) });
  }
  updateHud();

  const p = $("prompt");
  if (v.correct) {
    p.className = "prompt good";
    p.textContent = "";
  } else {
    p.className = "prompt bad";
    p.textContent = describeMiss(v) + (
      app.mode === "strict-note" ? " Play it again." :
      app.mode === "strict-measure" ? " Back to the start of measure " + app.measureByEvent.get(v.index) + "." : "");
  }
}

function describeMiss(v) {
  const where = "Measure " + app.measureByEvent.get(v.index) + ": ";
  if (v.timedOut && !v.played.length) return where + "nothing played in time.";
  if (v.octaveOnly) {
    const by = Math.abs(v.played[0] - v.want[0]) / 12;
    return where + "right notes, " + (by === 1 ? "an octave" : by + " octaves") +
      " too " + (v.played[0] > v.want[0] ? "high" : "low") + ".";
  }
  const bits = [];
  if (v.missing.length) bits.push("missed " + v.missing.map(m => midiLabel(m)).join(", "));
  if (v.extra.length) bits.push("played " + v.extra.map(m => midiLabel(m)).join(", ") + " instead");
  return where + bits.join(", ") + ".";
}

// Which staff a played note belongs beside, for placing its ghost.
function clefFor(eventIndex, midi) {
  const ev = app.exercise.events.find(e => e.index === eventIndex);
  if (!ev) return "treble";
  if (!ev.treble.length) return "bass";
  if (!ev.bass.length) return "treble";
  const split = Math.min(...ev.treble.map(midiOf));
  return midi >= split - 2 ? "treble" : "bass";
}

function onMove(at, why) {
  const chord = app.judge.chords[at];
  if (!chord) return;
  const box = app.renderer.cursorTo(chord.index);
  $("hMeasure").textContent = app.measureByEvent.get(chord.index) + " of " +
    app.measureByEvent.get(app.exercise.events[app.exercise.events.length - 1].index);
  if (why === "forward" || why === "measure") keepCursorInView();
  if (why === "measure") {
    const p = $("prompt");
    p.className = "prompt bad";
    p.textContent = "Back to the start of measure " + app.measureByEvent.get(chord.index) + ".";
  }
}

function keepCursorInView() {
  const rect = $("score").querySelector(".cursor");
  if (!rect) return;
  const r = rect.getBoundingClientRect();
  const pad = 80;
  if (r.bottom > innerHeight - pad) scrollBy({ top: r.bottom - innerHeight + pad + 40, behavior: "smooth" });
  else if (r.top < pad) scrollBy({ top: r.top - pad, behavior: "smooth" });
}

function updateHud() {
  const s = app.judge.summary();
  $("hAcc").textContent = s.attempted ? Math.round(s.accuracy * 100) + "%" : "—";
  $("hAcc").className = s.attempted && s.accuracy < 0.8 ? "bad" : "";
  $("hStreak").textContent = app.judge.streak;
}

// ---------------------------------------------------------------- the clock

function startClock() {
  // An imported piece brings its own tempo marking, if it has one.
  const bpm = app.exercise.tempo || app.settings.tempo;
  const beatMs = 60000 / bpm;
  let i = 0;
  let count = app.exercise.timeSig[0];

  // Count in one full measure, so there is a tempo to come in on.
  const countIn = () => {
    app.tones.click(count === app.exercise.timeSig[0]);
    $("prompt").textContent = "Counting in — " + count;
    count--;
    if (count > 0) { app.clock = setTimeout(countIn, beatMs); return; }
    app.clock = setTimeout(runBeat, beatMs);
    $("prompt").textContent = "";
  };

  const runBeat = () => {
    if (!app.judge || app.judge.finished) return;
    const chord = app.judge.current();
    if (!chord) return;
    const ev = app.exercise.events.find(e => e.index === chord.index);
    const ms = (ev ? ev.beats : 1) * beatMs;
    app.tones.click(ev && ev.beat === 1);
    app.clock = setTimeout(() => {
      app.judge.deadline();
      runBeat();
    }, ms);
  };

  countIn();
}

function stopClock() {
  clearTimeout(app.clock);
  app.clock = null;
}

// ---------------------------------------------------------------- review

function finish(summary) {
  stopClock();
  const seconds = (performance.now() - app.startedAt) / 1000;
  show("review");

  if (!app.reviewRenderer) app.reviewRenderer = new StaffRenderer($("reviewScore"));
  const width = $("reviewScore").parentNode.clientWidth - 12;
  app.reviewRenderer.render(app.exercise, Math.max(320, width), { space: spaceFor(width) });
  replayMarks(app.reviewRenderer);
  app.reviewRenderer.cursorTo(-1);

  const chordsPerMin = seconds > 0 ? (summary.attempted / seconds) * 60 : 0;
  $("stats").innerHTML = [
    stat("Accuracy", Math.round(summary.accuracy * 100) + "%",
      summary.accuracy >= 0.9 ? "var(--good)" : summary.accuracy < 0.7 ? "var(--bad)" : "var(--ink)"),
    stat("Chords right", summary.right + " of " + summary.attempted),
    stat("Longest streak", summary.bestStreak),
    stat("Time", formatTime(seconds)),
    stat("Chords a minute", Math.round(chordsPerMin)),
    app.mode.startsWith("strict") ? stat("Extra attempts", summary.retries) : ""
  ].join("");

  const rows = summary.misses.map(v => {
    const ev = app.exercise.events.find(e => e.index === v.index);
    const spelled = [...(ev ? ev.treble : []), ...(ev ? ev.bass : [])]
      .map(n => noteLabel(n)).join(" ");
    const note = v.timedOut && !v.played.length ? "ran out of beat"
      : v.octaveOnly ? "right notes, wrong octave"
      : v.missing.length && !v.extra.length ? "notes left out"
      : !v.missing.length && v.extra.length ? "extra notes"
      : "";
    return "<tr><td class='where'>m." + app.measureByEvent.get(v.index) +
      " beat " + (ev ? trimBeat(ev.beat) : "?") + "</td>" +
      "<td class='want'>" + escapeHtml(spelled) + "</td>" +
      "<td class='got'>" + (v.played.length ? escapeHtml(v.played.map(m => midiLabel(m)).join(" ")) : "—") + "</td>" +
      "<td class='dim small'>" + note + "</td></tr>";
  });
  $("missList").innerHTML = rows.length ? rows.join("")
    : "<tr><td colspan='4' class='dim'>Nothing. Clean run.</td></tr>";

  $("rMisses").disabled = !summary.firstMisses.length;
}

function trimBeat(b) { return Number.isInteger(b) ? b : b.toFixed(1).replace(/\.0$/, ""); }

function stat(k, v, colour) {
  return "<div class='stat'><div class='k'>" + k + "</div><div class='v'" +
    (colour ? " style='color:" + colour + "'" : "") + ">" + v + "</div></div>";
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  return m ? m + "m " + Math.round(s % 60) + "s" : Math.round(s) + "s";
}

// Put every mark from this run onto a freshly drawn score.
function replayMarks(renderer) {
  renderer.clearMarks();
  for (const v of app.judge.log) for (const m of v.missing) renderer.setHeadState(v.index, m, "wrong");
  for (const g of app.ghosts) renderer.addGhost(g.index, g.midi, g.clef);
}

// ---------------------------------------------------------------- buttons

$("start").onclick = () => { app.tones.enable($("sound").checked); play(newExercise()); };
$("again").onclick = () => { app.tones.enable($("sound").checked); play(newExercise()); };
$("stop").onclick = () => { stopClock(); app.judge.finish(); };
$("rAgain").onclick = () => play(app.exercise.imported
  ? importedExercise() : generate(settingsForGenerator(), app.exercise.seed));
$("rNew").onclick = () => play(newExercise());
$("rBack").onclick = () => { show("setup"); buildSettingsUI(); };
$("rMisses").onclick = () => play(missesExercise());

$("sound").onchange = () => {
  app.tones.enable($("sound").checked);
  try { localStorage.setItem("sr.sound", $("sound").checked ? "1" : ""); } catch (e) {}
};
try { $("sound").checked = !!localStorage.getItem("sr.sound"); } catch (e) {}

// A short exercise made only of the chords that went wrong, so they can be drilled.
function missesExercise() {
  const want = new Set(app.judge.summary().firstMisses.map(v => v.index));
  const picked = app.exercise.events.filter(e => want.has(e.index));
  const per = app.exercise.timeSig[0];
  const events = [];
  let measure = 1, beat = 1, i = 0;
  for (const src of picked) {
    if (beat > per) { measure++; beat = 1; }
    events.push({
      index: i++, measure, beat, beats: 1, dotted: false,
      treble: src.treble.map(n => ({ step: n.step, octave: n.octave, alter: n.alter })),
      bass: src.bass.map(n => ({ step: n.step, octave: n.octave, alter: n.alter }))
    });
    beat++;
  }
  // Pad the last measure out so it is a full bar.
  while (events.length && (events.length % per) !== 0) {
    const src = picked[events.length % picked.length];
    if (beat > per) { measure++; beat = 1; }
    events.push({
      index: events.length, measure, beat, beats: 1, dotted: false,
      treble: src.treble.map(n => ({ step: n.step, octave: n.octave, alter: n.alter })),
      bass: src.bass.map(n => ({ step: n.step, octave: n.octave, alter: n.alter }))
    });
    beat++;
  }
  return finishExercise({
    fifths: app.exercise.fifths, minor: app.exercise.minor, timeSig: app.exercise.timeSig,
    events, seed: app.exercise.seed, settings: app.exercise.settings,
    name: app.exercise.name + " — the misses"
  });
}

// ---------------------------------------------------------------- go

buildSettingsUI();
loadLibrary();
if (app.library.length) app.pieceId = app.library[0].id;
setReading(app.reading);
$("file").onchange = async e => {
  $("importError").textContent = "";
  const files = [...e.target.files];
  e.target.value = "";
  if (files.length) await addFiles(files);
};
wireSource();
if (QUERY.get("keys")) {
  const box = document.createElement("div");
  box.className = "note-box";
  box.innerHTML = "<b>Computer-keyboard mode.</b> There is no piano attached, so the letter " +
    "keys stand in for one: the bottom row (z s x d c v&hellip;) is the left hand and the top " +
    "row (q 2 w 3 e r&hellip;) the right, with &minus; and = shifting an octave. Good for " +
    "trying the game out; no substitute for the real thing.";
  $("setup").appendChild(box);
}
