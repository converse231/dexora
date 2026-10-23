/* THE ARENA'S SOUND (2026-10-23, asked for: OFF by default). The game makes
   no sound (CLAUDE.md, your call 2026-10-14); a player may turn the Arena's
   on from its pause menu, and the choice is the device's, never the save.
   Every sound is MADE here with Web Audio from the match's events - no
   files to fetch - at most a few a tick, and the context is suspended while
   the page is hidden. */
const KEY = "dexora-arena-sound";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
let on = read(), ac = null;

export const soundOn = () => on;
export function setSound(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* a per-device convenience */ }
  if (v) audio();
}

function audio() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = new C();
    document.addEventListener("visibilitychange", () => (document.hidden ? ac.suspend() : on && ac.resume()));
  }
  if (ac.state === "suspended" && !document.hidden) ac.resume();
  return ac;
}

// A tone gliding f0 -> f1 over d seconds, starting `at` seconds from now.
function tone(type, f0, f1, d, v, at = 0) {
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
}
// A burst of noise through a band: hits, whooshes, rumbles and blasts.
let buf = null;
function noise(d, v, freq, at = 0) {
  if (!buf) {
    buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + at, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 0.8;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  src.connect(f).connect(g).connect(ac.destination); src.start(t, Math.random() * 0.5, d + 0.02);
}
const chord = (notes, d, v, step = 0) => notes.forEach((n, k) => tone("triangle", n, n, d, v, k * step));

const SOUNDS = {
  go: () => { tone("square", 523, 523, 0.12, 0.08); tone("square", 784, 784, 0.25, 0.08, 0.14); },
  fire: (e) => (e.basic ? null : tone("triangle", 620, 320, 0.09, 0.06)),
  hit: (e) => { noise(e.basic ? 0.06 : 0.12, e.basic ? 0.12 : 0.22, e.eff > 1 ? 1600 : 900); if (e.eff > 1) tone("square", 880, 1320, 0.1, 0.05); if (e.crit) tone("square", 1320, 1760, 0.08, 0.05, 0.05); },
  dodge: () => noise(0.14, 0.1, 2600),
  ko: () => { tone("sawtooth", 330, 55, 0.6, 0.12); noise(0.4, 0.2, 300); },
  surge: () => { tone("sawtooth", 180, 900, 0.45, 0.08); noise(0.5, 0.15, 500, 0.3); },
  strike: () => noise(0.35, 0.22, 400),
  pick: () => tone("square", 880, 1320, 0.1, 0.06),
  evolve: () => [392, 494, 587, 784].forEach((n, k) => tone("sine", n, n * 1.02, 0.35, 0.07, k * 0.3)),
  evolved: (e) => (e.mega ? chord([523, 659, 784, 1047, 1319], 0.9, 0.06, 0.06) : chord([523, 659, 784, 1047], 0.8, 0.07)),
  floor: () => { noise(0.8, 0.18, 220); tone("sine", 110, 70, 0.8, 0.1); },
  lava: () => noise(0.3, 0.16, 350),
  rock: () => noise(0.3, 0.18, 300),
  trample: () => noise(0.25, 0.2, 260),
  helper: () => { tone("square", 660, 990, 0.08, 0.06); tone("square", 990, 1320, 0.08, 0.06, 0.09); },
  helperHit: (e) => (e.kind === "jigglypuff" ? [659, 784, 880, 784].forEach((n, k) => tone("sine", n, n, 0.25, 0.07, k * 0.22))
    : e.kind === "chansey" ? chord([784, 988, 1175], 0.5, 0.06, 0.08) : noise(0.6, 0.3, 250)),
  sudden: () => tone("sawtooth", 220, 220, 0.5, 0.08),
  final: () => { tone("square", 660, 660, 0.12, 0.06); tone("square", 660, 660, 0.12, 0.06, 0.2); },
};

// The tick's events, a few at most: a held basic attack must not pile up into a roar.
export function play(ev) {
  if (!on || !ev.length || !audio()) return;
  let n = 0;
  for (const e of ev) if (SOUNDS[e.k] && n++ < 4) SOUNDS[e.k](e);
}
