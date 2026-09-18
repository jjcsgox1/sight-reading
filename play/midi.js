// midi.js — where the notes come from.
//
// Normally a keyboard over USB. There is also a computer-keyboard stand-in, switched on
// with ?keys=1, so the game can be tried, and tested, with no piano plugged in.

class NoteSource {
  constructor() {
    this.onNoteOn = () => {};
    this.onNoteOff = () => {};
    this.onStatus = () => {};
    this.access = null;
    this.deviceId = null;
    this.held = new Set();
  }

  async start() {
    if (!navigator.requestMIDIAccess) {
      this.onStatus({ ok: false, reason: "no-api",
        text: "This browser has no Web MIDI. Use Chrome or Edge." });
      return false;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      this.onStatus({ ok: false, reason: "refused",
        text: "The browser refused MIDI access (" + err.name + ").", err });
      return false;
    }
    this.access.onstatechange = () => { this.attach(); this.report(); };
    this.attach();
    this.report();
    return true;
  }

  devices() {
    return this.access ? [...this.access.inputs.values()] : [];
  }

  use(id) {
    this.deviceId = id || null;
    try { localStorage.setItem("sr.device", this.deviceId || ""); } catch (e) {}
    this.attach();
    this.report();
  }

  attach() {
    if (!this.access) return;
    const ins = this.devices();
    if (this.deviceId && !ins.some(i => i.id === this.deviceId)) this.deviceId = null;
    if (!this.deviceId) {
      let saved = null;
      try { saved = localStorage.getItem("sr.device"); } catch (e) {}
      const match = ins.find(i => i.id === saved);
      this.deviceId = match ? match.id : (ins[0] ? ins[0].id : null);
    }
    for (const input of ins) {
      input.onmidimessage = input.id === this.deviceId ? e => this.handle(e) : null;
    }
  }

  report() {
    const ins = this.devices();
    const chosen = ins.find(i => i.id === this.deviceId) || null;
    this.onStatus({
      ok: !!chosen,
      reason: chosen ? "ready" : "no-device",
      text: chosen ? chosen.name : "No keyboard found.",
      devices: ins.map(i => ({ id: i.id, name: i.name || "(unnamed)" })),
      deviceId: this.deviceId
    });
  }

  handle(ev) {
    const [status, d1, d2] = ev.data;
    const type = status & 0xf0;
    if (type === 0x90 && d2 > 0) this.press(d1, d2);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) this.release(d1);
  }

  press(midi, velocity) {
    if (this.held.has(midi)) return;
    this.held.add(midi);
    this.onNoteOn(midi, velocity || 80, performance.now());
  }

  release(midi) {
    if (!this.held.delete(midi)) return;
    this.onNoteOff(midi, performance.now());
  }

  panic() {
    for (const m of [...this.held]) this.release(m);
  }
}

// ---------------------------------------------------------------- the stand-in

// Two rows of the computer keyboard laid out like a piano, the way trackers do it.
// Lower row is the left hand, upper row the right.
const KEY_MAP = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  ",": 12, l: 13, ".": 14, ";": 15, "/": 16,
  q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23,
  i: 24, 9: 25, o: 26, 0: 27, p: 28
};

class KeyboardSource extends NoteSource {
  constructor() {
    super();
    this.base = 48;             // C3 under the left hand, C4 under the right
    this.down = new Set();
  }

  async start() {
    addEventListener("keydown", e => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "-") { this.base -= 12; this.report(); return; }
      if (k === "=") { this.base += 12; this.report(); return; }
      if (!(k in KEY_MAP)) return;
      e.preventDefault();
      this.down.add(k);
      this.press(this.base + KEY_MAP[k], 80);
    });
    addEventListener("keyup", e => {
      const k = e.key.toLowerCase();
      if (!(k in KEY_MAP) || !this.down.delete(k)) return;
      this.release(this.base + KEY_MAP[k]);
    });
    addEventListener("blur", () => this.panic());
    this.report();
    return true;
  }

  devices() { return []; }
  use() {}

  report() {
    this.onStatus({
      ok: true, reason: "keys", deviceId: "keys", devices: [],
      text: "Computer keyboard — bottom row " + midiLabel(this.base) +
            " up, top row " + midiLabel(this.base + 12) + " up, − and = shift octave"
    });
  }
}

function makeNoteSource() {
  const q = new URLSearchParams(location.search);
  return q.get("keys") ? new KeyboardSource() : new NoteSource();
}
