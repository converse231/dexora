/* THE ARENA'S PIXEL EFFECTS (2026-10-29, asked for: "greatly improve the
   pixel art effects"; the plan and its live drafts are the Arena VFX Lab
   artifact). The bodies are PMD pixel art and the effects round them were
   vectors - gradients, anti-aliased strokes, alpha fades - so they read as
   another game laid over this one. Here an effect draws into a buffer on the
   bodies' own pixel grid (`BODY_PX` effect pixels a tile, the same scale
   render.js draws a PMD body at), in its type's ramp, fading by DITHER and
   never by alpha, with its glow in a separate light buffer added on top.

   Each frame is two colour buffers - BACK (under the bodies: rings on the
   floor, smoke) and FRONT (over them: sparks, stars, bolts) - and one LIGHT
   buffer, put to their own canvases and drawn by render.js inside the
   camera's transform. Nothing here reads or moves the match: arena.js never
   imports it, so every recorded match replays as before.

   The techniques and several recipes (the Bayer dither, the two buffers, the
   bolt by midpoint displacement, spark streaks) follow Sprite Fusion's pixel
   art VFX library: MIT License, Copyright (c) 2026 Hugo Duprez. */

// Effect pixels a tile: a PMD body's own pixel (render.js draws a body at `px / BODY_PX` a pixel).
export const BODY_PX = 32 / 2.6;
// The buffer reaches this far past the court on every side: sparks fly off it, stars rise over a top-row body.
const MARGIN = 2;

/* THE CLASSIC LOOK, a device preference beside the sound (the Arena's pause
   menu): the vector effects stay in render.js until every phase has shipped,
   so a player can compare, and say. */
const KEY = "dexora-arena-classic";
let classic = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
export const classicFx = () => classic;
export function setClassicFx(v) {
  classic = !!v;
  try { localStorage.setItem(KEY, classic ? "1" : "0"); } catch { /* a per-device convenience */ }
}

/* ---------- colour: a 7-step ramp a type, white to its darkest ---------- */
const rgb = (r, g, b) => ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
const hex = (h) => { const v = parseInt(h.slice(1), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); };
const R8 = (c) => c & 255, G8 = (c) => (c >>> 8) & 255, B8 = (c) => (c >>> 16) & 255;
const RAW = {
  normal: ["#ffffff", "#f3f0e6", "#d9d4c4", "#b3ac98", "#8a836f", "#5e584a", "#37332b"],
  fire: ["#ffffff", "#fff3a6", "#ffd23d", "#ff8a2a", "#f2561d", "#c9281f", "#5a160f"],
  water: ["#ffffff", "#e0f7ff", "#8fdcff", "#45a8ff", "#2a6be0", "#1d3f9e", "#12205a"],
  electric: ["#ffffff", "#fffbd0", "#ffe95c", "#ffc21a", "#e88f00", "#a85a00", "#4f2a00"],
  grass: ["#ffffff", "#eaffc8", "#a8f06a", "#5fcf3a", "#2f9a2a", "#1d6424", "#0f3317"],
  ice: ["#ffffff", "#e8fcff", "#b6f1ff", "#7fd8f2", "#4aa8d8", "#2e6ea8", "#1b3c66"],
  fighting: ["#ffffff", "#ffe3cc", "#ffad7a", "#e8683a", "#b83a22", "#7a1f17", "#3d0f0c"],
  poison: ["#ffffff", "#f6d8ff", "#d98cff", "#b04fe8", "#7f2bb8", "#4f1a7a", "#2a0e42"],
  ground: ["#ffffff", "#fff0c8", "#f0cf7a", "#d4a24a", "#a8742e", "#6e4a1f", "#3a2610"],
  flying: ["#ffffff", "#eef4ff", "#c8d8ff", "#9fb4f5", "#7486d8", "#4d58a8", "#2b2f66"],
  psychic: ["#ffffff", "#ffe0f0", "#ff9fcf", "#ff5fa8", "#d6337f", "#8f1f58", "#4a0f2e"],
  bug: ["#ffffff", "#f4ffcc", "#d6f06a", "#a8c83a", "#789a1f", "#4a6a14", "#26380a"],
  rock: ["#ffffff", "#f3ead4", "#d8c79a", "#b39e6a", "#857245", "#574a2c", "#2e2717"],
  ghost: ["#ffffff", "#ecdcff", "#b89cff", "#8a66e8", "#5f3fb8", "#3a2478", "#1c1040"],
  dragon: ["#ffffff", "#e4dcff", "#a99cff", "#7a5cff", "#5233e0", "#3218a0", "#190a52"],
  dark: ["#ffffff", "#e6dde8", "#a99aa8", "#7a6a7c", "#534556", "#352a38", "#1a141c"],
  steel: ["#ffffff", "#f0f4f8", "#cfd9e4", "#a4b3c4", "#7a8a9e", "#52606f", "#2c343e"],
  fairy: ["#ffffff", "#ffe8f4", "#ffbfe0", "#ff92c8", "#e86aa8", "#a8457a", "#5a2442"],
};
export const RAMP = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, v.map(hex)]));
export const RAMP_STEPS = 7;
const HEAT = ["#ffffff", "#fff3a6", "#ffe26b", "#ffc23d", "#ff8a2a", "#f2561d", "#c9281f", "#8a1f17", "#4f1a13", "#2a120e"].map(hex);
const SMOKE = ["#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e"].map(hex);
const DUST = hex("#8a8098");
// Not a type's: a dash's cold white-blue, Protect's mint, a heal's green.
const DASHR = ["#ffffff", "#e0f6ff", "#9fe3ff", "#4fb8ff", "#2a6fd8", "#1b3c80"].map(hex);
const SHIELDR = ["#ffffff", "#e6fff6", "#a6ffe0", "#4fe8c0", "#1fb89a", "#147a70", "#0b3f3e"].map(hex);
const HEALR = ["#ffffff", "#eaffe0", "#b6ffa0", "#6fe86a", "#2fbf4f", "#1f7a3f", "#0f3f24"].map(hex);
const ramp = (R, k) => R[Math.max(0, Math.min(R.length - 1, Math.floor(k * R.length)))];

/* ---------- maths ---------- */
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const outBack = (t, s = 1.7) => { const u = clamp(t) - 1; return 1 + (s + 1) * u * u * u + s * u * u; };
const rand = Math.random;
const range = (a, b) => a + (b - a) * rand();
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/* ---------- a colour buffer: a pixel is drawn whole, or not at all ---------- */
class Px {
  constructor(w, h) { this.w = w; this.h = h; this.img = new ImageData(w, h); this.d = new Uint32Array(this.img.data.buffer); }
  clear() { this.d.fill(0); }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[y * this.w + x] = c; }
  // A fade: the 4x4 Bayer pattern drops pixels, so every one left is a solid colour.
  dot(x, y, c, a = 1) { if (a <= 0.01) return; x = Math.floor(x); y = Math.floor(y); if (a >= 1 || a > bayer(x, y)) this.set(x, y, c); }
  disc(cx, cy, r, c, a = 1) {
    if (r <= 0.6) return this.dot(cx, cy, c, a);
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const dy = y + 0.5 - cy;
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const dx = x + 0.5 - cx; if (dx * dx + dy * dy <= r2) this.dot(x, y, c, a); }
    }
  }
  // A ring, squashed by `sy` to lie on the floor; `half` -1 is its far half, +1 its near one.
  ring(cx, cy, r, th, c, a = 1, sy = 1, half = 0) {
    const ro = r + th / 2, ri = Math.max(0, r - th / 2);
    for (let y = Math.floor(cy - ro * sy); y <= Math.ceil(cy + ro * sy); y++) {
      if ((half < 0 && y > cy) || (half > 0 && y < cy)) continue;
      const dy = (y + 0.5 - cy) / sy;
      for (let x = Math.floor(cx - ro); x <= Math.ceil(cx + ro); x++) { const dx = x + 0.5 - cx, d = Math.sqrt(dx * dx + dy * dy); if (d <= ro && d >= ri) this.dot(x, y, c, a); }
    }
  }
  line(x0, y0, x1, y1, c, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 512; n++) {
      this.dot(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}
/* ---------- the light buffer: glow added over the frame, never painted into it ---------- */
class Light {
  constructor(w, h) { this.w = w; this.h = h; this.r = new Float32Array(w * h); this.g = new Float32Array(w * h); this.b = new Float32Array(w * h); this.img = new ImageData(w, h); this.on = true; }
  clear() { this.r.fill(0); this.g.fill(0); this.b.fill(0); }
  glow(cx, cy, r, c, k) {
    if (!this.on || r < 1 || k <= 0.01) return;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    const cr = R8(c), cg = G8(c), cb = B8(c);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / r;
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / r, d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const f = 1 - Math.sqrt(d), q = f * f * k, i = y * this.w + x;
        this.r[i] += cr * q; this.g[i] += cg * q; this.b[i] += cb * q;
      }
    }
  }
  bake() {
    const D = this.img.data, n = this.w * this.h;
    for (let i = 0; i < n; i++) { const r = this.r[i], g = this.g[i], b = this.b[i]; D[i * 4] = r > 255 ? 255 : r; D[i * 4 + 1] = g > 255 ? 255 : g; D[i * 4 + 2] = b > 255 ? 255 : b; D[i * 4 + 3] = r + g + b > 1 ? 255 : 0; }
  }
}

/* ---------- shapes ---------- */
function sparkle(buf, x, y, arm, c, tip) {
  const px = Math.round(x), py = Math.round(y), n = Math.round(arm);
  if (n < 1) return buf.set(px, py, c);
  buf.set(px, py, RAMP.normal[0]);
  for (let d = 1; d <= n; d++) { const cc = d > n * 0.6 ? tip : c; buf.set(px + d, py, cc); buf.set(px - d, py, cc); buf.set(px, py + d, cc); buf.set(px, py - d, cc); }
}
// A bolt by midpoint displacement: the jag halves each pass, so it reads as lightning at any length.
function bolt(x0, y0, x1, y1, jag = 0.35) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  let pts = [[x0, y0], [x1, y1]], off = L * jag;
  while (pts.length < 2 + L / 3) {
    const nxt = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay) || 1, o = range(-off, off);
      nxt.push([(ax + bx) / 2 + (-(by - ay) / l) * o, (ay + by) / 2 + ((bx - ax) / l) * o], [bx, by]);
    }
    pts = nxt; off *= 0.52;
  }
  return pts;
}

/* ---------- matter: every kind takes its colour from its ramp by age ---------- */
function drawPart(L, p, frame) {
  // Flame, ember, smoke and dust bring their own colours; the rest take a type's ramp.
  const k = p.t / p.life, buf = p.front ? L.f : L.b, R = p.ramp ?? RAMP.normal, n = R.length;
  switch (p.k) {
    case "spark": {
      const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = Math.min(6, 1 + sp * 0.018);
      buf.line(p.x - ux * len, p.y - uy * len, p.x, p.y, R[Math.min(n - 1, Math.floor(k * 4))], k > 0.75 ? (1 - k) / 0.25 : 1);
      L.l.glow(p.x, p.y, 3, R[2], 0.5 * (1 - k));
      break;
    }
    case "mote": buf.dot(p.x, p.y, R[Math.min(n - 1, 1 + Math.floor(k * (n - 2)))], k > 0.6 ? (1 - k) / 0.4 : 1); break;
    case "ember": if (((frame >> 2) + p.seed) % 4) { buf.set(p.x, p.y, ramp(HEAT, 0.1 + k * 0.6)); L.l.glow(p.x, p.y, 2.5, HEAT[3], 0.4 * (1 - k)); } break;
    case "smoke": buf.disc(p.x, p.y, p.size * (0.7 + k * 0.9), ramp(p.smoke ?? SMOKE, k), 0.6 * Math.min(1, k * 8) * (1 - k)); break;
    case "dust": buf.disc(p.x, p.y, p.size * (0.6 + k * 0.9), DUST, Math.pow(1 - k, 1.3) * 0.7); break;
    case "flame": {
      const r = p.size * (0.5 + 1.6 * Math.sin(Math.PI * Math.min(1, k * 0.9 + 0.1))), i = Math.floor(k * 7), a = k > 0.75 ? (1 - k) / 0.25 : 1;
      buf.disc(p.x, p.y, r + 0.9, HEAT[Math.min(9, i + 3)], a);
      buf.disc(p.x, p.y, r, HEAT[Math.min(9, i + 1)], a);
      if (k < 0.55) buf.disc(p.x - 0.3, p.y - 0.4, r * 0.45, HEAT[Math.min(9, i)], a);
      if (k < 0.5) L.l.glow(p.x, p.y, 6 + r * 2, HEAT[4], 0.18);
      break;
    }
    case "drop": buf.set(p.x, p.y, R[2]); buf.dot(p.x, p.y - 1, R[1], 0.7); break;
    case "shard": {
      const ca = Math.cos(p.a) * p.size, sa = Math.sin(p.a) * p.size;
      buf.line(p.x - ca, p.y - sa, p.x + ca, p.y + sa, k < 0.5 ? R[2] : R[4], k > 0.8 ? (1 - k) / 0.2 : 1);
      buf.set(p.x - ca, p.y - sa, R[1]);
      break;
    }
    case "chunk": { const a = k > 0.8 ? (1 - k) / 0.2 : 1; buf.dot(p.x, p.y, R[3], a); buf.dot(p.x + 1, p.y, R[4], a); buf.dot(p.x, p.y + 1, R[5], a); buf.dot(p.x + 1, p.y + 1, R[5], a); break; }
    case "leaf": {
      const ca = Math.cos(p.a), sa = Math.sin(p.a), a = k > 0.75 ? (1 - k) / 0.25 : 1;
      buf.dot(p.x - ca, p.y - sa, R[4], a); buf.dot(p.x, p.y, R[2], a); buf.dot(p.x + ca, p.y + sa, R[3], a);
      break;
    }
    case "bubble": buf.ring(p.x, p.y, p.size, 1, R[2], k > 0.8 ? (1 - k) / 0.2 : 1); buf.set(p.x - p.size * 0.4, p.y - p.size * 0.4, R[0]); break;
    case "line": { const l = p.size * (1 - k * 0.6); for (let d = 0; d < l; d++) buf.dot(p.x + p.ux * d, p.y + p.uy * d, d < 3 ? R[0] : d < l * 0.4 ? R[1] : R[3], (1 - d / l) * (1 - k)); break; }
    case "cross": {
      const a = k > 0.7 ? (1 - k) / 0.3 : 1, s = p.size;
      for (let d = -s; d <= s; d++) { buf.dot(p.x + d, p.y, R[2], a); buf.dot(p.x, p.y + d, R[2], a); }
      for (const d of [-s - 1, s + 1]) { buf.dot(p.x + d, p.y, R[5], a); buf.dot(p.x, p.y + d, R[5], a); }
      buf.dot(p.x, p.y, R[0], a);
      L.l.glow(p.x, p.y, 5, R[3], 0.35 * a);
      break;
    }
    case "chev": { const a = k > 0.6 ? (1 - k) / 0.4 : 1, s = p.up ? -1 : 1; for (let d = -2; d <= 2; d++) { buf.dot(p.x + d, p.y + Math.abs(d) * -s, R[1], a); buf.dot(p.x + d, p.y + Math.abs(d) * -s + s, R[3], a); } break; }
    case "z": { const a = k > 0.7 ? (1 - k) / 0.3 : 1, s = p.size; for (let d = 0; d <= s; d++) { buf.dot(p.x + d, p.y, R[1], a); buf.dot(p.x + d, p.y + s, R[1], a); buf.dot(p.x + s - d, p.y + d, R[2], a); } break; }
    case "star": sparkle(buf, p.x, p.y, p.size * (k < 0.15 ? outBack(k / 0.15) : 1 - (k - 0.15) / 0.85), R[1], R[3]); L.l.glow(p.x, p.y, 5, R[2], 0.4 * (1 - k)); break;
  }
}

/* ---------- one hit: a white core, a ring, a star, sparks, and its type's matter ---------- */
function blowFx(x, y, R, heavy) {
  const S = heavy ? 1.5 : 1, rays = Array.from({ length: 7 }, (_, i) => (i / 7) * TAU + range(-0.2, 0.2)), len = rays.map(() => range(5, 10));
  let t = 0;
  return {
    life: 0.42,
    update(dt) { t += dt; },
    get t() { return t; },
    draw(L) {
      if (t < 0.05) { L.f.disc(x, y, (6 - t * 60) * S, R[3]); L.f.disc(x, y, (4.5 - t * 60) * S, R[1]); L.f.disc(x, y, (3 - t * 50) * S, R[0]); }
      if (t < 0.28) { const k = t / 0.28; L.f.ring(x, y, (3 + 10 * (1 - Math.pow(1 - k, 3))) * S, Math.max(1, 2.2 * (1 - k)), k < 0.4 ? R[1] : R[3], 1.2 - k); }
      if (t < 0.24) for (let i = 0; i < 7; i++) { const l = len[i] * (t < 0.05 ? outBack(t / 0.05, 2.2) : 1 - (t - 0.05) / 0.19) * S; L.f.line(x, y, x + Math.cos(rays[i]) * l, y + Math.sin(rays[i]) * l, t < 0.08 ? R[0] : R[2]); }
      L.l.glow(x, y, 20 * S, R[3], 0.8 * Math.exp(-t * 9));
    },
  };
}
// Short arcs re-rolled 15 times a second round a point: an electric hit's crackle.
function crackleFx(x, y, R, life) {
  let t = 0, at = -1, arcs = [];
  return {
    life,
    update(dt) {
      t += dt;
      const f = Math.floor(t * 15);
      if (f !== at) { at = f; arcs = Array.from({ length: 3 }, () => { const a = range(0, TAU), d = range(3, 7), a2 = a + range(-1.4, 1.4); const x0 = x + Math.cos(a) * d, y0 = y + Math.sin(a) * d; return bolt(x0, y0, x0 + Math.cos(a2) * range(5, 10), y0 + Math.sin(a2) * range(5, 10)); }); }
    },
    get t() { return t; },
    draw(L) {
      const k = 1 - t / life;
      for (const pts of arcs) for (let i = 0; i < pts.length - 1; i++) { L.f.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], k > 0.5 ? R[1] : R[3], Math.min(1, k * 1.6)); if (i % 3 === 0) L.l.glow(pts[i][0], pts[i][1], 5, R[3], 0.35 * k); }
    },
  };
}
// A ring on the floor in two halves, behind and in front of the body: a splash's ripple, a psychic wave.
function floorRing(x, y, R, life, reach, delay = 0) {
  let t = -delay;
  return {
    life,
    update(dt) { t += dt; },
    get t() { return t; },
    draw(L) {
      if (t < 0) return;
      const u = t / life, r = 3 + reach * (1 - Math.pow(1 - u, 2));
      L.b.ring(x, y, r, 1.2, u < 0.4 ? R[1] : R[3], 1 - u, 0.32, -1);
      L.f.ring(x, y, r, 1.2, u < 0.4 ? R[1] : R[3], 1 - u, 0.32, 1);
    },
  };
}

/* ---------- the layer render.js holds for a match ---------- */
export function createPix(W, H) {
  const bw = Math.ceil((W + 2 * MARGIN) * BODY_PX), bh = Math.ceil((H + 2 * MARGIN) * BODY_PX);
  const L = { b: new Px(bw, bh), f: new Px(bw, bh), l: new Light(bw, bh) };
  const canvases = [0, 1, 2].map(() => Object.assign(document.createElement("canvas"), { width: bw, height: bh }));
  const parts = [], fxs = [];
  let frame = 0, cap = 360;
  const toPx = (x, y) => [(x + MARGIN) * BODY_PX, (y + MARGIN) * BODY_PX];
  const add = (p) => { if (parts.length >= cap) parts.shift(); parts.push({ t: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0.5, size: 1, front: true, gy: 1e9, a: 0, va: 0, seed: (rand() * 4) | 0, delay: 0, sway: 0, ...p }); };
  const spray = (dx, dy, cone, a, b) => { const ang = Math.atan2(dy, dx) + (rand() - 0.5) * cone, sp = range(a, b); return [Math.cos(ang) * sp, Math.sin(ang) * sp]; };

  /* A BLOW LANDS (render.js `impact`, every hit, a freeze and a jolt of
     paralysis): world tiles in, where the body stands; `dx, dy` the line of
     the blow. Its matter is its type's. */
  function impact(type, wx, wy, dx = 0, dy = 0, heavy = false) {
    const R = RAMP[type] ?? RAMP.normal, n = heavy ? 1.7 : 1;
    const [x, y] = toPx(wx, wy - 0.2), gy = toPx(0, wy + 0.42)[1];
    const hx = dx || rand() - 0.5, hy = dy || rand() - 0.5;
    const each = (count, make) => { for (let i = 0; i < Math.round(count * n); i++) add(make(i)); };
    fxs.push(blowFx(x, y, R, heavy));
    // Along the line of the blow, whatever the type.
    each(6, () => { const [vx, vy] = spray(hx, hy, 1.1, 90, 200); return { k: "spark", x, y, vx, vy, drag: 3, life: range(0.12, 0.3), ramp: R }; });
    switch (type) {
      case "fire":
        each(7, () => { const [vx, vy] = spray(hx, hy, 2.4, 20, 60); return { k: "flame", x, y, vx, vy: vy - 20, drag: 2, life: range(0.3, 0.5), size: range(1, 1.8) }; });
        each(5, () => ({ k: "ember", x: x + range(-4, 4), y: y + range(-4, 4), vx: range(-20, 20), vy: range(-50, -20), life: range(0.6, 1.2) }));
        each(2, () => ({ k: "smoke", x: x + range(-3, 3), y, vx: range(-5, 5), vy: range(-16, -8), life: range(1, 1.5), size: range(2, 3), front: false }));
        break;
      case "water":
        each(12, () => { const [vx, vy] = spray(hx, hy, 2.6, 40, 110); return { k: "drop", x, y, vx, vy: vy - 60, g: 320, life: range(0.4, 0.8), ramp: R, gy }; });
        fxs.push(floorRing(x, gy, R, 0.6, 16));
        break;
      case "electric":
        fxs.push(crackleFx(x, y, R, heavy ? 0.4 : 0.25));
        each(8, () => { const a = range(0, TAU), sp = range(80, 200); return { k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 260, drag: 2, life: range(0.15, 0.4), ramp: R, gy }; });
        break;
      case "ice":
        each(10, () => { const [vx, vy] = spray(hx, hy, 2.2, 40, 110); return { k: "shard", x, y, vx, vy: vy - 50, g: 300, life: range(0.4, 0.8), size: range(1, 2), a: range(0, TAU), va: range(-12, 12), ramp: R, gy }; });
        each(6, () => ({ k: "mote", x: x + range(-5, 5), y: y + range(-5, 5), vx: range(-30, 30), vy: range(-40, 0), drag: 2, life: range(0.4, 0.7), ramp: R }));
        break;
      case "grass": case "bug":
        each(9, () => { const [vx, vy] = spray(hx, hy, 2.6, 30, 90); return { k: "leaf", x, y, vx, vy: vy - 30, g: 60, drag: 2, life: range(0.7, 1.2), a: range(0, TAU), va: range(-8, 8), ramp: R }; });
        break;
      case "rock": case "ground":
        each(9, () => { const [vx, vy] = spray(hx, hy, 2.8, 40, 110); return { k: "chunk", x, y, vx, vy: vy - 70, g: 380, life: range(0.5, 0.9), ramp: R, gy }; });
        each(4, () => ({ k: "dust", x: x + range(-5, 5), y: gy - 1, vx: range(-30, 30), vy: range(-10, -2), drag: 4, life: range(0.4, 0.7), size: range(1.5, 2.6), front: false }));
        break;
      case "poison":
        each(8, () => ({ k: "bubble", x: x + range(-7, 7), y: y + range(-4, 4), vx: range(-6, 6), vy: range(-24, -10), life: range(0.4, 0.8), size: rand() < 0.3 ? 2 : 1, ramp: R }));
        break;
      case "psychic":
        for (let i = 0; i < 3; i++) fxs.push(floorRing(x, y, R, 0.4, 12 + i * 3, i * 0.07));
        each(5, () => { const a = range(0, TAU), sp = range(20, 50); return { k: "star", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2, life: range(0.4, 0.7), size: 2, ramp: R }; });
        break;
      case "ghost":
        each(6, () => ({ k: "smoke", x: x + range(-5, 5), y: y + range(-4, 4), vx: range(-8, 8), vy: range(-18, -8), life: range(0.8, 1.3), size: range(2, 3), smoke: [R[3], R[4], R[5], R[6], SMOKE[4]] }));
        each(6, () => { const a = range(0, TAU), sp = range(30, 80); return { k: "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.4, 0.7), ramp: R }; });
        break;
      case "dark":
        each(6, () => { const a = range(0, TAU), sp = range(30, 90); return { k: "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.3, 0.6), ramp: R }; });
        each(3, () => ({ k: "smoke", x: x + range(-4, 4), y, vx: range(-6, 6), vy: range(-14, -6), life: range(0.7, 1.1), size: range(2, 3), smoke: [R[4], R[5], R[6], SMOKE[4]] }));
        break;
      case "steel":
        each(10, () => { const [vx, vy] = spray(hx, hy, 2, 120, 260); return { k: "spark", x, y, vx, vy, g: 200, drag: 2, life: range(0.15, 0.35), ramp: HEAT.slice(0, 7), gy }; });
        break;
      case "dragon":
        each(8, () => { const [vx, vy] = spray(hx, hy, 2.4, 50, 120); return { k: "shard", x, y, vx, vy, drag: 2.5, life: range(0.3, 0.6), size: range(1, 2), a: range(0, TAU), va: range(-10, 10), ramp: R }; });
        each(5, () => { const a = range(0, TAU), sp = range(20, 60); return { k: "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2, life: range(0.5, 0.8), ramp: R }; });
        break;
      case "fairy":
        each(8, () => { const a = range(0, TAU), sp = range(30, 70); return { k: "star", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, drag: 2, life: range(0.5, 0.9), size: rand() < 0.4 ? 2 : 1, ramp: R }; });
        break;
      case "flying":
        each(8, () => { const [vx, vy] = spray(hx, hy, 1.6, 60, 140); return { k: "spark", x, y, vx, vy, drag: 4, life: range(0.2, 0.4), ramp: R }; });
        each(5, () => ({ k: "mote", x: x + range(-4, 4), y: y + range(-4, 4), vx: range(-30, 30), vy: range(-20, 10), drag: 1.5, life: range(0.5, 0.9), ramp: R }));
        break;
      case "fighting":
        fxs.push(blowFx(x, y, R, true));
        break;
      default:
        each(6, () => { const a = range(0, TAU), sp = range(30, 70); return { k: "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2, life: range(0.4, 0.6), ramp: R }; });
    }
    // Debris thrown off a heavy blow, along it.
    if (heavy) each(5, () => { const [vx, vy] = spray(hx, hy, 1.6, 140, 260); return { k: "spark", x, y, vx, vy, g: 200, drag: 2, life: range(0.2, 0.4), ramp: R, gy }; });
  }

  /* A SHOT IN FLIGHT (Phase 2): drawn this frame from where the rules have
     it, so it is queued, never kept. `trail` is render.js's own (world
     points, oldest first); `orb` is false when the move brings its own art,
     which then flies over its pixel trail. Each type sheds its matter. */
  const queued = [], arcs = new Map();
  let time = 0;
  const reroll = (id, make) => {
    const f = Math.floor(time * 15), c = arcs.get(id);
    if (c && c.f === f) { c.seen = frame; return c.v; }
    const v = make();
    arcs.set(id, { f, v, seen: frame });
    return v;
  };
  function shot(id, type, wx, wy, dx, dy, trail, { basic = false, boost = false, orb = true, k = 1 } = {}) {
    const R = type === "fire" ? HEAT : RAMP[type] ?? RAMP.normal, T = RAMP[type] ?? RAMP.normal;
    const [x, y] = toPx(wx, wy), r = basic ? (boost ? 2.2 : 1.5) : 2.6;
    const pts = trail.map(([tx, ty]) => toPx(tx, ty));
    // Its matter, shed behind it: a few a second for the basic attack, more for a move.
    if (rand() < (basic ? 0.25 : 0.7) * k) {
      const bx = x - dx * r * 2, by = y - dy * r * 2;
      switch (type) {
        case "fire": add({ k: rand() < 0.5 ? "ember" : "flame", x: bx, y: by, vx: range(-10, 10), vy: range(-30, -10), drag: 2, life: range(0.25, 0.5), size: 0.8 }); break;
        case "water": add({ k: "drop", x: bx, y: by, vx: -dx * 20, vy: range(-20, 0), g: 300, life: range(0.3, 0.5), ramp: T, gy: y + 8 }); break;
        case "electric": add({ k: "spark", x: bx, y: by, vx: range(-60, 60), vy: range(-60, 60), drag: 4, life: range(0.1, 0.2), ramp: T }); break;
        case "ice": add({ k: "shard", x: bx, y: by, vx: range(-15, 15), vy: range(-10, 10), g: 60, life: range(0.3, 0.5), size: 1, a: range(0, TAU), va: range(-10, 10), ramp: T }); break;
        case "grass": case "bug": add({ k: "leaf", x: bx, y: by, vx: range(-15, 15), vy: range(-15, 5), g: 40, drag: 2, life: range(0.5, 0.8), a: range(0, TAU), va: range(-8, 8), ramp: T }); break;
        case "poison": add({ k: "bubble", x: bx, y: by, vx: range(-6, 6), vy: range(-14, -4), life: range(0.3, 0.5), size: 1, ramp: T }); break;
        case "ghost": case "dark": add({ k: "smoke", x: bx, y: by, vx: range(-4, 4), vy: range(-8, -2), life: range(0.4, 0.7), size: 1.4, smoke: [T[3], T[4], T[5], T[6]] }); break;
        case "psychic": case "fairy": add({ k: "star", x: bx + range(-2, 2), y: by + range(-2, 2), life: 0.35, size: 1, ramp: T }); break;
        case "steel": add({ k: "spark", x: bx, y: by, vx: -dx * 60 + range(-20, 20), vy: -dy * 60 + range(-20, 20), drag: 4, life: 0.15, ramp: HEAT.slice(0, 7) }); break;
        default: add({ k: "mote", x: bx + range(-1, 1), y: by + range(-1, 1), vx: -dx * 20, vy: -dy * 20, drag: 3, life: range(0.25, 0.45), ramp: T });
      }
    }
    queued.push((L) => {
      // The trail: discs tapering and darkening with age, dithered out.
      const n = pts.length;
      // Never under a pixel before it fades, or the tail breaks into loose dots.
      pts.forEach(([qx, qy], i) => { const u = 1 - i / n; L.f.disc(qx, qy, Math.max(0.75, r * (1 - u) * 0.95), R[Math.min(R.length - 1, 2 + Math.floor(u * 4))], Math.pow(1 - u, 0.7)); });
      L.l.glow(x, y, basic ? 7 : 12, T[3], basic ? 0.35 : 0.55);
      if (!orb) return;
      switch (type) {
        case "water":
          L.f.disc(x, y, r + 0.6, T[3], 0.5); L.f.ring(x, y, r, 1, T[2]); L.f.set(x - r * 0.4, y - r * 0.5, T[0]);
          return;
        case "ice":
          for (let qy = -r - 1; qy <= r + 1; qy++) for (let qx = -r - 1; qx <= r + 1; qx++) {
            const d = Math.abs(qx) + Math.abs(qy);
            if (d <= r + 0.5) L.f.set(x + qx, y + qy, d > r - 0.6 ? T[5] : qx < 0 ? T[1] : T[3]);
          }
          L.f.set(x, y - r, T[0]);
          return;
        case "grass": case "bug": {
          L.f.disc(x, y, r * 0.7 + 0.5, T[5]); L.f.disc(x, y, r * 0.7, T[3]); L.f.set(x - 0.5, y - 0.5, T[1]);
          for (let i = 0; i < 3; i++) { const a = time * 10 + (i * TAU) / 3, lx = x + Math.cos(a) * (r + 1.5), ly = y + Math.sin(a) * (r + 1.5); L.f.set(lx, ly, T[2]); L.f.set(lx + Math.cos(a + 1.6), ly + Math.sin(a + 1.6), T[4]); }
          return;
        }
        default:
          L.f.disc(x, y, r + 0.9, R[Math.min(R.length - 1, 5)]); L.f.disc(x, y, r, R[3]); L.f.disc(x - 0.4, y - 0.4, r * 0.55, R[1]); L.f.set(x - r * 0.35, y - r * 0.45, R[0]);
      }
      // Electric crackles round its ball, a ghost trails filaments: both re-rolled 15 times a second, not 60.
      if (type === "electric" || type === "ghost") {
        const v = reroll(id, () => Array.from({ length: type === "electric" ? 2 : 3 }, () => { const a = range(0, TAU), d0 = r * 0.6, d1 = r + range(3, 6); return bolt(Math.cos(a) * d0, Math.sin(a) * d0, Math.cos(a + range(-0.6, 0.6)) * d1, Math.sin(a + range(-0.6, 0.6)) * d1, 0.4); }));
        for (const p of v) for (let i = 0; i < p.length - 1; i++) L.f.line(x + p[i][0], y + p[i][1], x + p[i + 1][0], y + p[i + 1][1], i < 2 ? T[1] : T[3]);
      }
    });
  }

  /* A BEAM ACROSS ITS WIDTH (Phase 3): banded from a white core out through
     its type's ramp to a dithered edge, every pixel solid. Fire is a cone
     that whitens at the mouth, water a jet with foam on its edges and flow
     running down it, ice a beam with beads and glints, electric bolts
     re-rolled 15 times a second; `fade` thins it as it goes. */
  function band(L, id, type, x, y, ux, uy, len, hw, fade) {
    const T = RAMP[type] ?? RAMP.normal;
    if (type === "electric") {
      const v = reroll(id, () => Array.from({ length: 3 }, () => bolt(0, 0, len, 0, 0.18)));
      v.forEach((p, b) => { for (let i = 0; i < p.length - 1; i++) { const [a0, o0] = p[i], [a1, o1] = p[i + 1]; L.f.line(x + ux * a0 - uy * o0, y + uy * a0 + ux * o0, x + ux * a1 - uy * o1, y + uy * a1 + ux * o1, b ? T[2] : T[0], fade); } });
      for (let d = 0; d <= len; d += 6) L.l.glow(x + ux * d, y + uy * d, hw * 2, T[3], 0.35 * fade);
      return;
    }
    for (let d = 0; d <= len; d += 0.5) {
      const q = d / Math.max(1, len), cx = x + ux * d, cy = y + uy * d;
      let w = hw * (0.45 + 0.55 * Math.min(1, d / 12)) * fade;
      if (type === "fire") w = hw * (0.35 + q * 1.1) * (0.85 + 0.25 * Math.sin(d * 0.5 - time * 26)) * fade;
      else if (type === "water") w = hw * (0.7 + q * 0.5 + Math.sin(d * 0.45 - time * 32) * 0.12) * fade;
      const wob = type === "ice" ? 0 : Math.sin(d * 0.4 - time * 30) * 0.3;
      for (let o = -w - 1; o <= w + 1; o += 0.5) {
        const b = Math.abs(o + wob) / Math.max(0.5, w), px = cx - uy * o, py = cy + ux * o;
        if (type === "fire") {
          // The heat ramp: white at the mouth and the core, red and then soot at the edge and the tip.
          if (b > 1) continue;
          const i = Math.min(9, Math.floor(b * 5 + q * 4 + (b > 0.8 ? 1 : 0)));
          if (b > 0.85 && bayer(Math.floor(px), Math.floor(py)) > 0.6) continue;
          L.f.set(px, py, HEAT[i]);
        } else if (type === "water") {
          const foam = noise(d * 0.6 - time * 24, Math.round(o * 2)) > 0.35;
          if (b < 0.3) L.f.set(px, py, T[1]);
          else if (b < 0.75) L.f.set(px, py, (Math.floor(d - time * 160) & 7) < 2 ? T[1] : T[2]);
          else if (b < 1) L.f.set(px, py, foam ? T[0] : T[3]);
          else if (foam) L.f.dot(px, py, T[0], 0.5);
        } else {
          if (b < 0.35) L.f.set(px, py, T[0]);
          else if (b < 0.7) L.f.set(px, py, T[1]);
          else if (b < 1) L.f.set(px, py, T[3]);
          else L.f.dot(px, py, T[5], 0.6);
        }
      }
      if (d % 7 < 0.5) L.l.glow(cx, cy, hw * 1.6, type === "fire" ? HEAT[4] : T[3], 0.3 * fade);
    }
    if (type === "ice" || type === "psychic" || type === "fairy" || type === "dragon") {
      // Beads running down it, and a glint off it now and then.
      for (let k2 = 0; k2 < 4; k2++) { const d = (time * 220 + k2 * 23) % Math.max(1, len); L.f.line(x + ux * d, y + uy * d, x + ux * (d + 3), y + uy * (d + 3), T[0], fade); }
      if (Math.floor(time * 30) % 3 === 0) { const d = len * ((Math.floor(time * 10) * 0.618) % 1); sparkle(L.f, x + ux * d - uy * hw, y + uy * d + ux * hw, 2, T[1], T[3]); }
    }
  }
  const noise = (v, seed = 0) => { const i = Math.floor(v), f = v - i, u = f * f * (3 - 2 * f), h = (n) => ((Math.imul(n + 1 + seed * 7919, 2654435761) >>> 0) % 100000) / 100000; return (h(i) * 2 - 1) + ((h(i + 1) * 2 - 1) - (h(i) * 2 - 1)) * u; };

  /* A STREAM AS IT POURS (render.js `pour`, held and aimed): queued each
     frame from the fighter's act, with its matter thrown off along it and a
     splash where it lands. `hw` is the beam's half-width in world tiles. */
  function stream(id, type, wx, wy, dx, dy, wlen, whw, k = 1) {
    const [x, y] = toPx(wx, wy), len = wlen * BODY_PX, hw = whw * BODY_PX * 0.55, T = RAMP[type] ?? RAMP.normal;
    const ex = x + dx * len, ey = y + dy * len;
    for (let q = 0; q < 3; q++) if (rand() < 0.8 * k) {
      const d = rand() * len, bx = x + dx * d, by = y + dy * d;
      if (type === "fire") add({ k: "flame", x: bx, y: by, vx: dx * 40 + range(-15, 15), vy: dy * 40 - range(10, 30), drag: 2, life: range(0.25, 0.45), size: range(0.8, 1.4) });
      else if (type === "water") add({ k: "drop", x: bx - dy * hw, y: by + dx * hw, vx: dx * 30 + range(-20, 20), vy: range(-40, 0), g: 320, life: range(0.3, 0.6), ramp: T, gy: by + 14 });
      else if (type === "electric") add({ k: "spark", x: bx, y: by, vx: range(-80, 80), vy: range(-80, 80), drag: 4, life: range(0.08, 0.18), ramp: T });
      else add({ k: "mote", x: bx + range(-hw, hw), y: by + range(-hw, hw), vx: range(-20, 20), vy: range(-20, 20), drag: 3, life: range(0.25, 0.45), ramp: T });
    }
    if (rand() < 0.9 * k) {
      const a = Math.atan2(-dy, -dx) + range(-1.2, 1.2), sp = range(40, 110);
      if (type === "water") add({ k: "drop", x: ex, y: ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 320, life: range(0.4, 0.7), ramp: T, gy: ey + 10 });
      else if (type === "fire") add({ k: rand() < 0.3 ? "smoke" : "ember", x: ex, y: ey, vx: Math.cos(a) * 20, vy: -range(20, 50), life: range(0.6, 1.1), size: 2 });
      else add({ k: "spark", x: ex, y: ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.12, 0.3), ramp: T });
    }
    queued.push((L) => {
      band(L, `s${id}`, type, x, y, dx, dy, len, hw, 1);
      L.l.glow(x, y, hw * 2, type === "fire" ? HEAT[1] : T[2], 0.6);
      L.l.glow(ex, ey, hw * 2.5, type === "fire" ? HEAT[4] : T[3], 0.5);
    });
  }
  /* A BEAM FIRED (render.js `take`, a move without stream art of its own):
     at full width for a beat, then thinning out over its `life`. */
  let beams = 0;
  function beam(type, wx, wy, dx, dy, wlen, whw, life) {
    const [x, y] = toPx(wx, wy), len = wlen * BODY_PX, hw = whw * BODY_PX * 0.55, id = `b${beams++}`;
    let t = 0;
    fxs.push({ life, get t() { return t; }, update(dt) { t += dt; },
      draw(L) { const u = t / life; band(L, id, type, x, y, dx, dy, len, hw, u < 0.25 ? 1 : 1 - (u - 0.25) / 0.75); L.l.glow(x + dx * len, y + dy * len, hw * 2.5, (RAMP[type] ?? RAMP.normal)[3], 0.6 * (1 - u)); } });
  }

  /* A STATUS ON THE BODY'S OWN OUTLINE (Phase 4): `body` is render.js's
     `maskOf` - the PMD frame it drew last, its alpha a pixel each, and where
     it stood. Burn licks up the top edge, paralysis crackles between edge
     pixels, poison bubbles off it, freeze crusts it, sleep drifts Zs. */
  function status(id, kind, body, k = 1) {
    const [bx, by] = toPx(body.wx, body.wy), x0 = Math.round(bx + body.ox), y0 = Math.round(by + body.oy);
    const { w, h, m, flip } = body;
    const on = (i, j) => i >= 0 && j >= 0 && i < w && j < h && m[j * w + (flip ? w - 1 - i : i)] === 1;
    const any = () => { for (let n = 0; n < 30; n++) { const i = Math.floor(rand() * w), j = Math.floor(rand() * h); if (on(i, j)) return [x0 + i + 0.5, y0 + j + 0.5]; } return [x0 + w / 2, y0 + h / 2]; };
    const T = RAMP[kind === "brn" ? "fire" : kind === "par" ? "electric" : kind === "psn" ? "poison" : kind === "frz" ? "ice" : "psychic"];
    if (kind === "brn" && rand() < 0.35 * k) { const [ex, ey] = any(); add({ k: "ember", x: ex, y: ey - 3, vx: range(-10, 10), vy: range(-40, -15), life: range(0.6, 1.2) }); }
    if (kind === "psn" && rand() < 0.15 * k) { const [ex, ey] = any(); add({ k: "bubble", x: ex, y: ey, vx: range(-4, 4), vy: range(-18, -8), life: range(0.4, 0.7), size: 1, ramp: T }); }
    if (kind === "slp" && rand() < 0.03 * k) add({ k: "z", x: x0 + w * 0.7, y: y0 + 2, vx: range(6, 12), vy: -range(10, 16), life: 1.3, size: rand() < 0.5 ? 2 : 3, ramp: RAMP.normal });
    if (kind === "frz" && rand() < 0.04 * k) { const [ex, ey] = any(); add({ k: "star", x: ex, y: ey, life: 0.35, size: 2, ramp: T }); }
    queued.push((L) => {
      if (kind === "brn") {
        // A tongue on every second column of the top edge, its height from noise.
        for (let i = 0; i < w; i += 2) {
          let top = -1;
          for (let j = 0; j < h; j++) if (on(i, j)) { top = j; break; }
          if (top < 0) continue;
          const n = i * 7.3, ht = (3 + 4 * ((i * 37) % 10) / 10) * (0.8 + 0.4 * noise(time * 3.3 + n, i)) * (1 + Math.max(0, noise(time * 2.6 + n, i + 70) - 0.5) * 1.6);
          const fx0 = x0 + i, fy0 = y0 + top + 2, sway = noise(time * 2.2 + n, i + 40) * 1.4;
          for (let yy = 0; yy < ht; yy++) {
            const u = yy / ht, hw = 1.3 * Math.pow(1 - u, 0.7) + 0.2, cx = fx0 + sway * u * u;
            for (let xx = Math.floor(cx - hw); xx <= Math.ceil(cx + hw); xx++) {
              const e = Math.abs(xx + 0.5 - cx);
              if (e <= hw) L.f.set(xx, fy0 - yy, HEAT[Math.min(9, (e > hw - 0.8 && u > 0.2 ? 3 : 1) + Math.floor(u * 6))]);
            }
          }
        }
        L.l.glow(x0 + w / 2, y0 + h * 0.4, w, HEAT[4], 0.3 * (0.9 + 0.1 * Math.sin(time * 23)));
      } else if (kind === "par") {
        // Crackle between pixels of its own edge, re-rolled 15 times a second.
        const v = reroll(`p${id}`, () => {
          const edge = [];
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (on(i, j) && (!on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1) || !on(i, j + 1))) edge.push([i, j]);
          const out = [];
          for (let n = 0; n < 2 && edge.length; n++) { const a = edge[Math.floor(rand() * edge.length)], b = edge[Math.floor(rand() * edge.length)]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 16) out.push(bolt(a[0], a[1], b[0], b[1], 0.4)); }
          return out;
        });
        for (const p of v) for (let i = 0; i < p.length - 1; i++) L.f.line(x0 + p[i][0], y0 + p[i][1], x0 + p[i + 1][0], y0 + p[i + 1][1], i % 2 ? T[2] : T[0]);
        L.l.glow(x0 + w / 2, y0 + h / 2, w * 0.8, T[3], 0.2 + 0.12 * Math.sin(time * 57));
      } else if (kind === "frz") {
        // Its own pixels crusted with ice: solid at the edge, scattered inside.
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          if (!on(i, j)) continue;
          if (!on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1)) L.f.set(x0 + i, y0 + j, T[1]);
          else if (((i * 17 + j * 31) % 100) < 45) L.f.dot(x0 + i, y0 + j, ((i + j * 9) % 2) ? T[2] : T[3], 0.85);
        }
        L.l.glow(x0 + w / 2, y0 + h / 2, w * 0.7, T[3], 0.25);
      } else if (kind === "psn") {
        L.l.glow(x0 + w / 2, y0 + h / 2, w * 0.6, T[3], 0.15 + 0.1 * Math.sin(time * 6));
      }
    });
  }

  /* ---------- Phase 5: movement and guarding ---------- */
  // Each side's body as last drawn (render.js `maskOf`), for what follows it: an aura.
  const bodies = [null, null];
  const setBody = (side, body) => { bodies[side] = body; };
  const origin = (body) => { const [bx, by] = toPx(body.wx, body.wy); return [Math.round(bx + body.ox), Math.round(by + body.oy)]; };
  const maskAt = (body) => (i, j) => i >= 0 && j >= 0 && i < body.w && j < body.h && body.m[j * body.w + (body.flip ? body.w - 1 - i : i)] === 1;

  /* AN AFTERIMAGE (a dash, a dodge, a lunge, a surge): the body's own
     silhouette where it was, in a ramp, stepping down it and dithering out. */
  function afterimage(body, type, life) {
    const R = type === "dash" ? DASHR : RAMP[type] ?? RAMP.normal, [x0, y0] = origin(body), on = maskAt(body);
    let t = 0;
    fxs.push({ life, get t() { return t; }, update(dt) { t += dt; },
      draw(L) {
        const k = t / life, c = R[Math.min(R.length - 1, 1 + Math.floor(k * (R.length - 2)))], a = k < 0.4 ? 0.9 : 0.9 * (1 - k) / 0.6;
        for (let j = 0; j < body.h; j++) for (let i = 0; i < body.w; i++) if (on(i, j)) L.b.dot(x0 + i, y0 + j, c, a);
      } });
  }
  // Speed lines behind a body on the move, along `dx, dy`.
  function speed(wx, wy, dx, dy, type = "dash") {
    const R = type === "dash" ? DASHR : RAMP[type] ?? RAMP.normal, [x, y] = toPx(wx, wy);
    add({ k: "line", x: x + range(-6, 6), y: y + range(-14, 2), ux: -dx, uy: -dy, size: range(8, 22), life: 0.2, ramp: R, front: false });
  }

  /* PROTECT'S DOME: hex cells rising from the ground round the body while
     the shield holds, a hit rippling out from where it landed (`shieldHit`),
     and shards when it drops. render.js queues it while drawing the body,
     after this frame's paint, so a dome not queued since the last paint
     (`live`) has broken. */
  const domes = new Map();
  function shield(id, wx, wy) {
    const [x, y] = toPx(wx, wy - 0.3);
    let d = domes.get(id);
    if (!d) domes.set(id, (d = { born: time, pulses: [] }));
    d.x = x; d.y = y; d.live = true;
    queued.push((L) => {
      const C = SHIELDR, RX = 15, RY = 16, CELL = 3.6, form = clamp((time - d.born) / 0.35);
      for (let py = Math.floor(y - RY); py <= y + RY; py++) for (let px2 = Math.floor(x - RX); px2 <= x + RX; px2++) {
        const ddx = (px2 + 0.5 - x) / RX, ddy = (py + 0.5 - y) / RY, dd = ddx * ddx + ddy * ddy;
        if (dd > 1) continue;
        // Which hex cell, and how near its edge (cube rounding).
        const q = ((px2 - x) * 0.5773 - (py - y) / 3) / CELL, r = ((py - y) * 2 / 3) / CELL;
        let rx = Math.round(q), rz = Math.round(r); const ry = Math.round(-q - r);
        const ex = Math.abs(rx - q), ez = Math.abs(rz - r), ey = Math.abs(ry + q + r);
        if (ex > ey && ex > ez) rx = -ry - rz; else if (ey <= ez) rz = -rx - ry;
        const edge = Math.max(ex, ey, ez), up = 1 - (py - (y - RY)) / (2 * RY);
        const appear = clamp((form * 1.5 - up * 0.8 - (((rx * 31 + rz * 17) % 7 + 7) % 7) / 28) * 4);
        if (appear <= 0) continue;
        let hot = 0;
        for (const p of d.pulses) { const age = time - p.t, dist = Math.hypot(px2 - p.x, py - p.y); hot = Math.max(hot, clamp(1 - Math.abs(dist - age * 70) / 4) * clamp(1 - age / 0.35), dist < 5 && age < 0.12 ? 1 : 0); }
        const buf = py > y + RY * 0.3 ? L.f : L.b;
        if (dd > 0.82) buf.dot(px2, py, hot > 0.4 ? C[0] : C[2], appear * 0.95);
        else if (edge > 0.36) buf.dot(px2, py, hot > 0.4 ? C[0] : hot > 0.1 ? C[1] : C[3], appear * (0.6 + hot));
        else if (hot > 0.1) buf.dot(px2, py, C[2], appear * hot * 0.6);
      }
      L.l.glow(x, y, 20, C[3], 0.2 * form);
      for (const p of d.pulses) { const age = time - p.t; if (age < 0.3) L.l.glow(p.x, p.y, 10, C[2], 0.6 * (1 - age / 0.3)); }
      d.pulses = d.pulses.filter((p) => time - p.t < 0.4);
    });
  }
  function shieldHit(id, wx, wy) {
    const d = domes.get(id);
    if (!d) return;
    const [hx, hy] = toPx(wx, wy - 0.3), a = Math.atan2(hy - d.y, hx - d.x);
    d.pulses.push({ x: d.x + Math.cos(a) * 15, y: d.y + Math.sin(a) * 16, t: time });
  }
  function breakDomes() {
    for (const [id, d] of domes) {
      if (d.live) { d.live = false; continue; }
      for (let i = 0; i < 26; i++) { const a = range(Math.PI, TAU), x = d.x + Math.cos(a) * 15 * range(0.8, 1), y = d.y + Math.sin(a) * 16 * range(0.8, 1); add({ k: "shard", x, y, vx: (x - d.x) * 3, vy: (y - d.y) * 2 - 20, g: 280, life: range(0.4, 0.8), size: range(1, 2), a: range(0, TAU), va: range(-14, 14), ramp: SHIELDR, gy: d.y + 18 }); }
      domes.delete(id);
    }
  }

  /* A HEAL: crosses rising round the body over half a second, and a ring on the floor. */
  function heal(wx, wy) {
    const [x, y] = toPx(wx, wy), gy = toPx(0, wy + 0.42)[1];
    for (let i = 0; i < 12; i++) add({ k: "cross", x: x + range(-10, 10), y: y + range(-6, 4), vy: -range(16, 30), sway: 30, life: range(0.7, 1.1), size: rand() < 0.35 ? 2 : 1, ramp: HEALR, front: rand() < 0.6, delay: i * 0.05 });
    fxs.push(floorRing(x, gy, HEALR, 0.9, 16));
  }

  /* A STAT RAISED OR LOWERED: an aura shaped to the body by its own distance
     field, flaring once and dithering out, and chevrons going its way. Up is
     warm, down cold - the words over it already say which stat. */
  const AURA = 12;
  function boost(side, up) {
    const R = up ? RAMP.fighting : RAMP.water;
    let t = 0;
    const life = 0.8;
    const body = bodies[side];
    if (body) { const [x0, y0] = origin(body); for (let i = 0; i < 5; i++) add({ k: "chev", x: x0 + body.w * (0.2 + 0.6 * rand()), y: up ? y0 + body.h * 0.8 : y0, vy: up ? -range(20, 34) : range(20, 34), life: 0.6, up, ramp: R, delay: i * 0.06 }); }
    fxs.push({ life, get t() { return t; }, update(dt) { t += dt; },
      draw(L) {
        const b = bodies[side];
        if (!b) return;
        const [x0, y0] = origin(b), on = maskAt(b), W2 = b.w + 2 * AURA, H2 = b.h + 2 * AURA, dist = new Uint8Array(W2 * H2);
        for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) dist[j * W2 + i] = on(i - AURA, j - AURA) ? 0 : 255;
        const relax = (i, j2, w) => { if (dist[j2] + w < dist[i]) dist[i] = dist[j2] + w; };
        for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) { const n = j * W2 + i; if (i > 0) relax(n, n - 1, 3); if (j > 0) { relax(n, n - W2, 3); if (i > 0) relax(n, n - W2 - 1, 4); if (i < W2 - 1) relax(n, n - W2 + 1, 4); } }
        for (let j = H2 - 1; j >= 0; j--) for (let i = W2 - 1; i >= 0; i--) { const n = j * W2 + i; if (i < W2 - 1) relax(n, n + 1, 3); if (j < H2 - 1) { relax(n, n + W2, 3); if (i < W2 - 1) relax(n, n + W2 + 1, 4); if (i > 0) relax(n, n + W2 - 1, 4); } }
        const u = t / life, a = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8, flare = Math.exp(-(((u - 0.15) / 0.08) ** 2));
        for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
          const d = dist[j * W2 + i] / 3;
          if (d === 0 || d > AURA) continue;
          const px2 = x0 - AURA + i, py = y0 - AURA + j, n = noise(px2 * 0.5 + (py + (up ? time * 34 : -time * 34)) * 0.26, 3) * 0.5 + 0.5;
          const reach = a * (2 + 9 * n * (up ? clamp(1 - (j - AURA) / Math.max(1, b.h)) + 0.3 : 1)) * (1 + 0.4 * flare);
          if (d > reach) continue;
          const bandK = d / reach;
          if (bandK < 0.25) L.b.set(px2, py, flare > 0.4 ? R[0] : R[1]);
          else if (bandK < 0.5) L.b.set(px2, py, R[2]);
          else if (bandK < 0.75) L.b.set(px2, py, R[3]);
          else L.b.dot(px2, py, R[4], (1 - bandK) * 2.6);
        }
        L.l.glow(x0 + b.w / 2, y0 + b.h / 2, b.w, R[3], 0.4 * a + 0.3 * flare);
      } });
  }

  /* ---------- Phase 6: the big moments ---------- */
  /* A BOLT FROM THE SKY (render.js `strike`: Thunder, Thunderbolt, a storm's
     ULTI): a leader stepping down in nine, the stroke flickering on the
     envelope real lightning has, forks, arcs crawling over the floor, and a
     scorch cooling through the heat ramp to dithered soot. */
  function strike(wx, wy) {
    const V = RAMP.electric, [x, y] = toPx(wx, wy), gy = toPx(0, wy + 0.42)[1], top = Math.max(0, y - 110);
    const b = { main: bolt(x + range(-14, 14), top, x, gy, 0.22), forks: [] };
    for (let i = 0; i < 3; i++) { const p = b.main[Math.floor(range(0.2, 0.6) * b.main.length)], a = Math.PI / 2 + range(-1, 1); b.forks.push(bolt(p[0], p[1], p[0] + Math.cos(a) * range(12, 28), p[1] + Math.sin(a) * range(10, 22), 0.35)); }
    const LEAD = 0.12;
    let t = 0, hit = false, crawls = [], at = -1;
    fxs.push({ life: 1.8, get t() { return t; },
      update(dt) {
        t += dt;
        if (!hit && t >= LEAD) {
          hit = true;
          for (let j = 0; j < 30; j++) { const a = -Math.PI / 2 + range(-1.4, 1.4), sp = range(60, 200); add({ k: "spark", x, y: gy - 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 260, drag: 2, life: range(0.2, 0.6), ramp: V, gy }); }
          for (let j = 0; j < 3; j++) add({ k: "smoke", x: x + range(-6, 6), y: gy - 4, vx: range(-6, 6), vy: range(-14, -6), life: range(1.2, 2), size: range(2, 3.5), front: false });
        }
        const f = Math.floor(t * 30);
        if (hit && t < LEAD + 0.4 && f !== at) { at = f; crawls = Array.from({ length: 2 }, () => { const sd = rand() < 0.5 ? -1 : 1; return bolt(x + sd * 2, gy - 1, x + sd * range(6, 16), gy - range(0, 2), 0.35); }); }
        if (t > LEAD + 0.4) crawls = [];
      },
      draw(L) {
        const a = t - LEAD;
        if (hit) {
          const T0 = Math.pow(clamp(1 - a / 1.6), 1.3), rx = 13, ry = 3;
          for (let py = Math.floor(gy - ry); py <= gy + ry; py++) for (let px2 = Math.floor(x - rx); px2 <= Math.ceil(x + rx); px2++) {
            const ddx = (px2 + 0.5 - x) / rx, ddy = (py + 0.5 - gy) / ry, d = Math.sqrt(ddx * ddx + ddy * ddy);
            if (d > 1) continue;
            const T = T0 * (1.25 - d) - (((px2 * 31 + py * 7) % 100) / 100) * 0.35;
            if (T > 0.06) L.b.set(px2, py, HEAT[Math.min(9, Math.floor((1 - Math.min(1, T)) * 9))]);
            else L.b.dot(px2, py, d < 0.5 ? SMOKE[4] : SMOKE[3], T0 > 0 ? Math.min(1, (1 - d) * 2) * clamp(1 - (a - 0.6) / 1) : 0);
          }
        }
        if (t < LEAD) {
          const reach = top + (gy - top) * Math.floor((t / LEAD) * 9) / 9;
          for (let i = 0; i < b.main.length - 1; i++) { if (b.main[i + 1][1] > reach) break; L.f.line(b.main[i][0], b.main[i][1], b.main[i + 1][0], b.main[i + 1][1], V[3]); }
          return;
        }
        const k = a < 0.03 ? 1 : a < 0.06 ? 0.5 : a < 0.1 ? 0.95 : a < 0.14 ? 0.4 : a < 0.17 ? 0.7 : 0;
        if (k > 0) {
          for (const [paths, trunk] of [[[b.main], true], [b.forks, false]]) for (const p of paths) for (let i = 0; i < p.length - 1; i++) {
            const [ax, ay] = p[i], [bx2, by2] = p[i + 1];
            if (trunk) { L.f.line(ax - 1, ay, bx2 - 1, by2, V[5]); L.f.line(ax + 1, ay, bx2 + 1, by2, V[5]); L.f.line(ax, ay, bx2, by2, V[2]); }
            L.f.line(ax, ay, bx2, by2, trunk ? V[0] : V[2], trunk || k > 0.5 ? 1 : 0);
            if (i % 3 === 0) L.l.glow(ax, ay, trunk ? 12 : 6, V[3], 0.45 * k);
          }
          L.f.disc(x, gy - 1, 3 * k + 1, V[2]); L.f.disc(x, gy - 1, 2 * k, V[0]);
          L.l.glow(x, gy - 8, 60, V[4], 0.5 * k);
        } else if (a < 0.45) for (const [px2, py] of b.main) L.f.dot(px2, py, V[5], (1 - (a - 0.17) / 0.28) * 0.8);
        for (const p of crawls) for (let i = 0; i < p.length - 1; i++) L.f.line(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], V[1]);
      } });
  }

  /* AN ULTI'S PILLAR (render.js, every ULTI strike): a column of its type
     rising off the floor in a quarter of its life, banded across its width
     - fire a heat column licking up, water a geyser, the rest their ramp -
     holding, then dithering out from the top; its matter thrown up with it. */
  function pillar(type, wx, wy, wr, life) {
    const T = RAMP[type] ?? RAMP.normal, R = type === "fire" ? HEAT : T, [x] = toPx(wx, wy), gy = toPx(0, wy + 0.3)[1];
    const hw = Math.max(0.9, wr) * 0.9 * BODY_PX * 0.75, H2 = 80;
    for (let i = 0; i < 18; i++) {
      const hx = x + range(-hw, hw);
      if (type === "fire") add({ k: "ember", x: hx, y: gy - range(0, 20), vx: range(-15, 15), vy: -range(40, 90), life: range(0.6, 1.2) });
      else if (type === "water") add({ k: "drop", x: hx, y: gy - range(10, 60), vx: range(-50, 50), vy: -range(20, 80), g: 300, life: range(0.6, 1), ramp: T, gy: gy + 2 });
      else if (type === "rock" || type === "ground") add({ k: "chunk", x: hx, y: gy - 2, vx: range(-60, 60), vy: -range(60, 140), g: 360, life: range(0.6, 1), ramp: T, gy });
      else if (type === "ice") add({ k: "shard", x: hx, y: gy - range(0, 30), vx: range(-40, 40), vy: -range(30, 90), g: 260, life: range(0.5, 0.9), size: range(1, 2), a: range(0, TAU), va: range(-12, 12), ramp: T, gy });
      else if (type === "grass" || type === "bug") add({ k: "leaf", x: hx, y: gy - range(0, 40), vx: range(-30, 30), vy: -range(20, 60), g: 40, drag: 1.5, life: range(0.8, 1.3), a: range(0, TAU), va: range(-8, 8), ramp: T });
      else add({ k: "mote", x: hx, y: gy - range(0, 50), vx: range(-15, 15), vy: -range(30, 80), drag: 1.5, life: range(0.6, 1.1), ramp: T });
    }
    let t = 0;
    fxs.push({ life, get t() { return t; }, update(dt) { t += dt; },
      draw(L) {
        const u = t / life, up = Math.min(1, u * 4), fade = u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1, h = H2 * up;
        for (let yy = 0; yy < h; yy++) {
          const q = yy / H2, w = hw * (type === "fire" ? 1.1 - q * 0.6 : type === "water" ? 0.75 - q * 0.2 : 0.8) * (0.85 + 0.25 * noise(yy * 0.3 - time * 18, 5));
          const sway = noise(yy * 0.08 + time * 2, 9) * 2 * q, cy = gy - yy, a = fade * (yy > h - 6 ? (h - yy) / 6 : 1) * (q > 0.75 ? (1 - q) * 4 : 1);
          for (let o = -w - 1; o <= w + 1; o += 1) {
            const b = Math.abs(o) / Math.max(0.5, w), px2 = x + o + sway;
            if (b > 1.15) continue;
            const c = b > 1 ? R[Math.min(R.length - 1, 5)] : R[Math.min(R.length - 1, Math.floor(b * 3 + q * 3 + (b > 0.8 ? 1 : 0)))];
            L.f.dot(px2, cy, c, b > 1 ? a * 0.5 : a);
          }
          if (yy % 8 === 0) L.l.glow(x, cy, hw * 2.2, type === "fire" ? HEAT[4] : T[3], 0.25 * fade);
        }
        if (type === "water") for (let i = 0; i < 6; i++) L.f.dot(x + noise(i * 3 + time * 8, 2) * hw, gy - h + noise(i * 5, 4) * 3, T[0], fade);
        L.b.ring(x, gy, hw * 1.4 * (1 + u), 1.5, R[2], fade * 0.8, 0.32, -1);
        L.f.ring(x, gy, hw * 1.4 * (1 + u), 1.5, R[2], fade * 0.8, 0.32, 1);
      } });
  }

  /* THE WEATHER, A PIXEL A DROP (render.js `drawAir`, its own list so a fight
     never evicts it): queued as it moves, drawn on the next paint. */
  const SAND = hex("#e0b878"), RAIN = hex("#cfe8ff"), SNOWC = hex("#ffffff");
  function air(kind, wx, wy, kk, size = 0.06, glint = false) {
    const [x, y] = toPx(wx, wy);
    queued.push((L) => {
      if (kind === "rain") {
        const fall = kk * 1.4 * BODY_PX, x1 = x - fall * 0.5, y1 = y + fall;
        L.f.line(x1, y1, x1 - 2, y1 + 5, RAIN, 0.45);
        if (kk > 0.92) { L.b.dot(x1 - 4, y1 + 9, RAIN, 0.6); L.b.dot(x1 - 2, y1 + 8, RAIN, 0.6); L.b.dot(x1, y1 + 9, RAIN, 0.6); }
      } else if (kind === "snow") {
        L.f.set(x, y, SNOWC);
        if (size > 0.08) { L.f.set(x + 1, y, RAMP.ice[1]); L.f.set(x, y + 1, RAMP.ice[2]); }
      } else if (kind === "sand") {
        const l = Math.max(2, size * BODY_PX);
        L.f.line(x, y, x - l, y - l * 0.08, SAND, 0.5);
      } else if (kind === "ember") {
        if (((frame >> 2) + Math.round(wx * 10)) % 3) { L.f.set(x, y, kk < 0.5 ? HEAT[2] : HEAT[4]); L.l.glow(x, y, 3, HEAT[3], 0.35 * Math.sin(kk * Math.PI)); }
      } else if (kind === "mote") {
        const a = Math.sin(Math.min(1, kk * 4) * Math.PI / 2) * (glint ? 0.5 + 0.5 * Math.sin(time * 6 + wx) : 0.4);
        if (glint && a > 0.85) sparkle(L.f, x, y, 1, RAMP.flying[1], RAMP.flying[3]);
        else L.f.dot(x, y, glint ? RAMP.flying[1] : SNOWC, a);
      }
    });
  }

  // Effect frames (render.js's `k`, through its hit-stop and slow motion): everything moves by them.
  function step(k) {
    const dt = k / 60;
    frame++;
    time += dt;
    for (let i = fxs.length - 1; i >= 0; i--) { fxs[i].update(dt); if (fxs[i].t > fxs[i].life) fxs.splice(i, 1); }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      if ((p.t += dt) >= p.life) { parts.splice(i, 1); continue; }
      if (p.sway) p.vx += Math.sin(p.t * 6 + p.seed) * p.sway * dt;
      p.vy += p.g * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.a += p.va * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > p.gy && p.vy > 0) { p.y = p.gy; p.vy *= -0.35; p.vx *= 0.6; }
    }
  }
  /* The frame's three buffers, each put to its canvas. Nothing live, nothing
     drawn: a match spends no time here between blows. */
  function paint(light) {
    breakDomes();
    if (!fxs.length && !parts.length && !queued.length) return false;
    L.b.clear(); L.f.clear(); L.l.clear(); L.l.on = light;
    for (const e of fxs) e.draw(L);
    for (const p of parts) if (p.delay <= 0) drawPart(L, p, frame);
    for (const q of queued) q(L);
    queued.length = 0;
    for (const [id, c] of arcs) if (c.seen !== frame) arcs.delete(id);
    canvases[0].getContext("2d").putImageData(L.b.img, 0, 0);
    canvases[1].getContext("2d").putImageData(L.f.img, 0, 0);
    if (light) { L.l.bake(); canvases[2].getContext("2d").putImageData(L.l.img, 0, 0); }
    return true;
  }
  /* Drawn in world space by render.js: `x0, y0` the canvas point of the
     buffer's corner (the court's corner less MARGIN), `scale` one effect
     pixel. The colour layers stay hard pixels; the light is upscaled soft. */
  function blit(ctx, layer, x0, y0, scale) {
    const c = canvases[layer === "back" ? 0 : layer === "front" ? 1 : 2];
    ctx.save();
    if (layer === "light") { ctx.globalCompositeOperation = "lighter"; ctx.imageSmoothingEnabled = true; }
    else ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, x0, y0, bw * scale, bh * scale);
    ctx.restore();
  }
  return { impact, shot, stream, beam, status, setBody, afterimage, speed, shield, shieldHit, heal, boost, strike, pillar, air, step, paint, blit, MARGIN, lite(on) { cap = on ? 180 : 360; } };
}
