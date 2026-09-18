// sound.js — optional. A digital piano makes its own sound; a silent controller does not,
// so this gives one. Two oscillators and a decay, not a sampled piano: enough to hear what
// you played, not pretending to be an instrument.

class Tones {
  constructor() { this.ctx = null; this.on = false; }

  enable(on) {
    this.on = on;
    if (on && !this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) this.ctx = new C();
    }
    if (on && this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  note(midi, velocity) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const gain = this.ctx.createGain();
    const level = 0.13 * Math.min(1, (velocity || 80) / 100);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    gain.connect(this.ctx.destination);
    for (const [mult, amp, type] of [[1, 1, "triangle"], [2, 0.32, "sine"], [3, 0.12, "sine"]]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const g = this.ctx.createGain();
      g.gain.value = amp;
      o.connect(g); g.connect(gain);
      o.start(t); o.stop(t + 1.7);
    }
  }

  // The metronome. A higher blip on the downbeat.
  click(strong) {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "square";
    o.frequency.value = strong ? 1600 : 1050;
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.06);
  }
}
