// musicxml.js — reads a piece of real music in.
//
// MusicXML holds the actual notes, which is why the game can score you on an imported
// piece at all. A PDF is a picture: nothing in it says which notes are which, so nothing
// can mark one red. See the README for how to turn a PDF into MusicXML.
//
// No library. The XML goes through the browser's own DOMParser, and a .mxl — which is
// just a zip with the MusicXML inside — is unpacked here with DecompressionStream.

const LETTER_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const MAX_MEASURES = 500;

function xText(node, sel) {
  if (!node) return "";
  const el = node.querySelector(sel);
  return el ? el.textContent.trim() : "";
}

// ---------------------------------------------------------------- .mxl is a zip

async function inflate(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error("This .mxl uses a compression this browser cannot read.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer) {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Find the end-of-central-directory record, scanning back from the end.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That .mxl file is not a readable zip.");

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localAt = dv.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    // The sizes in the local header can be blank, so the central directory is the
    // trustworthy copy; the local header is only read for where the data starts.
    const lNameLen = dv.getUint16(localAt + 26, true);
    const lExtraLen = dv.getUint16(localAt + 28, true);
    const start = localAt + 30 + lNameLen + lExtraLen;
    files.set(name, { method, bytes: bytes.subarray(start, start + compSize) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function readMxl(buffer) {
  const files = await unzip(buffer);
  const decoder = new TextDecoder();

  // The container names the real score file; if it is missing, take the first xml that is
  // not the container itself.
  const container = files.get("META-INF/container.xml");
  if (container) {
    const xml = decoder.decode(await inflate(container.bytes, container.method));
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const root = doc.querySelector("rootfile");
    const path = root && root.getAttribute("full-path");
    if (path && files.has(path)) {
      const f = files.get(path);
      return decoder.decode(await inflate(f.bytes, f.method));
    }
  }
  for (const [name, f] of files) {
    if (name.startsWith("META-INF/")) continue;
    if (!/\.(xml|musicxml)$/i.test(name)) continue;
    return decoder.decode(await inflate(f.bytes, f.method));
  }
  throw new Error("No MusicXML found inside that .mxl file.");
}

async function readMusicFile(file) {
  const name = (file.name || "").toLowerCase();
  const text = name.endsWith(".mxl")
    ? await readMxl(await file.arrayBuffer())
    : await file.text();
  const ex = parseMusicXml(text);
  ex.name = ex.title || file.name.replace(/\.(mxl|musicxml|xml)$/i, "");
  return ex;
}

// ---------------------------------------------------------------- the score

function parseMusicXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("That file is not valid XML.");

  const score = doc.querySelector("score-partwise");
  if (!score) {
    if (doc.querySelector("score-timewise"))
      throw new Error("That is a timewise MusicXML file, which this cannot read. " +
        "Open it in MuseScore and save it again — MuseScore writes the partwise kind.");
    throw new Error("There is no MusicXML score in that file.");
  }

  const title = xText(score, "work-title") || xText(score, "movement-title") ||
                xText(score, "credit-words") || "";
  const tempo = readTempo(score);

  const streams = [];                       // one per part-and-staff
  for (const part of score.querySelectorAll("score-partwise > part")) {
    streams.push(...readPart(part));
  }
  if (!streams.length) throw new Error("That score has no notes in it.");

  return assemble(streams, title, tempo);
}

function readTempo(score) {
  const sound = score.querySelector("sound[tempo]");
  const t = sound && parseFloat(sound.getAttribute("tempo"));
  return t && t > 20 && t < 400 ? Math.round(t) : null;
}

// Walk one part, measure by measure, and hand back one stream per staff it uses.
function readPart(part) {
  const staves = new Map();                 // staff number -> { clefs, groups }
  const state = { divisions: 1, fifths: 0, timeSig: [4, 4], clefs: new Map() };
  const measures = [...part.children].filter(n => n.tagName === "measure");
  let measureIndex = 0;

  for (const meas of measures) {
    measureIndex++;
    if (measureIndex > MAX_MEASURES) break;
    let cursor = 0, lastOnset = 0;

    for (const node of meas.children) {
      if (node.tagName === "attributes") { readAttributes(node, state); continue; }
      if (node.tagName === "backup") { cursor -= num(xText(node, "duration")); continue; }
      if (node.tagName === "forward") { cursor += num(xText(node, "duration")); continue; }
      if (node.tagName !== "note") continue;

      if (child(node, "grace")) continue;   // ornaments have no duration; not played here
      const isChord = !!child(node, "chord");
      const dur = num(xText(node, "duration"));
      const staffNum = num(xText(node, "staff")) || 1;
      const voice = num(xText(node, "voice")) || 1;
      const rest = !!child(node, "rest");

      const onset = isChord ? lastOnset : cursor;
      if (!isChord) { lastOnset = cursor; cursor += dur; }
      if (child(node, "unpitched")) continue;

      const staff = ensureStaff(staves, staffNum, state);
      const beats = dur / state.divisions;
      const onsetBeats = onset / state.divisions;
      const type = xText(node, "type") || typeForBeats(beats);
      const dots = node.querySelectorAll("dot").length;

      staff.measures[measureIndex] = staff.measures[measureIndex] || {
        index: measureIndex, fifths: state.fifths, timeSig: state.timeSig.slice(),
        clef: state.clefs.get(staffNum) || null, groups: []
      };
      const bucket = staff.measures[measureIndex];
      bucket.fifths = state.fifths;
      bucket.timeSig = state.timeSig.slice();
      bucket.clef = state.clefs.get(staffNum) || bucket.clef;

      let group = bucket.groups.find(g =>
        g.onset === onsetBeats && g.voice === voice && g.rest === rest);
      if (!group) {
        group = { onset: onsetBeats, beats, type, dots, voice, rest, notes: [] };
        bucket.groups.push(group);
      }
      // A chord takes its look from the longest note in it.
      if (beats > group.beats) { group.beats = beats; group.type = type; group.dots = dots; }
      if (rest) continue;

      const pitch = child(node, "pitch");
      if (!pitch) continue;
      const tieStop = !!node.querySelector('tie[type="stop"], tied[type="stop"]');
      group.notes.push({
        step: LETTER_INDEX[xText(pitch, "step")] || 0,
        octave: num(xText(pitch, "octave")),
        alter: num(xText(pitch, "alter")),
        tied: tieStop
      });
    }
  }

  return [...staves.values()].filter(s => Object.keys(s.measures).length);
}

function child(node, tag) {
  for (const c of node.children) if (c.tagName === tag) return c;
  return null;
}

function num(s) { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; }

function ensureStaff(staves, staffNum, state) {
  if (!staves.has(staffNum)) staves.set(staffNum, { staffNum, measures: {} });
  return staves.get(staffNum);
}

function readAttributes(node, state) {
  const div = xText(node, "divisions");
  if (div) state.divisions = num(div) || 1;
  const fifths = node.querySelector("key fifths");
  if (fifths) state.fifths = num(fifths.textContent);
  const beats = node.querySelector("time beats");
  const beatType = node.querySelector("time beat-type");
  if (beats && beatType) state.timeSig = [num(beats.textContent), num(beatType.textContent)];
  for (const clef of node.querySelectorAll("clef")) {
    const n = num(clef.getAttribute("number")) || 1;
    const sign = xText(clef, "sign").toUpperCase();
    state.clefs.set(n, sign === "F" ? "bass" : "treble");
  }
}

// ---------------------------------------------------------------- put it together

function assemble(streams, title, tempo) {
  // Which staff of the page each stream belongs on. A two-staff piano part is the normal
  // case; separate parts for the hands, or a single-staff melody, also work.
  const placed = streams.map(s => {
    const firstMeasure = Object.values(s.measures)[0] || {};
    const clef = firstMeasure.clef || (s.staffNum >= 2 ? "bass" : "treble");
    return { stream: s, place: clef === "bass" ? "bass" : "treble" };
  });
  if (placed.length === 1) placed[0].place = placed[0].stream.staffNum >= 2 ? "bass" : placed[0].place;

  const indices = new Set();
  for (const p of placed) for (const k of Object.keys(p.stream.measures)) indices.add(+k);
  const order = [...indices].sort((a, b) => a - b);

  const measures = [];
  for (const idx of order) {
    let timeSig = [4, 4], fifths = 0;
    const staves = { treble: [], bass: [] };
    const clefs = { treble: "treble", bass: "bass" };
    for (const p of placed) {
      const m = p.stream.measures[idx];
      if (!m) continue;
      timeSig = m.timeSig; fifths = m.fifths;
      if (m.clef) clefs[p.place] = m.clef;
      staves[p.place].push(...m.groups);
    }
    for (const k of ["treble", "bass"]) staves[k].sort((a, b) => a.onset - b.onset || a.voice - b.voice);
    const beats = timeSig[0] * 4 / (timeSig[1] || 4);
    // A staff with nothing in it still needs a rest, or the measure looks broken.
    for (const k of ["treble", "bass"])
      if (!staves[k].length)
        staves[k].push({ onset: 0, beats, type: "whole", dots: 0, voice: 1, rest: true, notes: [] });
    measures.push({ index: idx, timeSig, fifths, beats, clefs, staves });
  }
  if (!measures.length) throw new Error("That score has no measures in it.");

  const ex = {
    imported: true, title, tempo,
    fifths: measures[0].fifths, minor: false, timeSig: measures[0].timeSig,
    measures, events: []
  };
  buildSlices(ex);
  applyAccidentalsToLayout(ex);
  return ex;
}

// Every moment a key goes down, in order. Notes held over by a tie start no moment: they
// are already sounding.
function buildSlices(ex) {
  let index = 0, elapsed = 0;
  const times = [];
  for (const m of ex.measures) {
    const onsets = new Set();
    for (const k of ["treble", "bass"])
      for (const g of m.staves[k])
        if (!g.rest && g.notes.some(n => !n.tied)) onsets.add(g.onset);

    for (const onset of [...onsets].sort((a, b) => a - b)) {
      const ev = {
        index: index++, measure: m.index, onset, beat: onset + 1,
        beats: 1, treble: [], bass: []
      };
      for (const k of ["treble", "bass"])
        for (const g of m.staves[k])
          if (!g.rest && g.onset === onset)
            for (const n of g.notes) if (!n.tied) ev[k].push(n);
      ex.events.push(ev);
      times.push(elapsed + onset);
    }
    elapsed += m.beats;
  }
  // How long each moment lasts, for the timed mode.
  for (let i = 0; i < ex.events.length; i++) {
    const next = i + 1 < times.length ? times[i + 1] : elapsed;
    ex.events[i].beats = Math.max(0.125, next - times[i]);
  }
}
