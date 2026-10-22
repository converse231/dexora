/* THE ARENA'S PICTURE (game/arena.js is the rules; this only draws them).

   One canvas. The floor (public/arena/<id>.webp) is baked once at the screen's
   size and copied each frame; what moves is drawn over it between two ticks
   (`alpha`), so a 120 Hz phone and a 60 Hz laptop see the same match. Every
   effect runs on the frame's real time (`k`, 60ths of a second), scaled by
   the hit-stop and the slow motion - so a frozen frame freezes everything but
   the body that was struck, which shakes, as in a fighting game.

   EVERY ATTACK WEARS ITS OWN ART: what flies is the move's Emerald sprite
   (`arenaArt` reads it off the League's own move timeline), over a glow and a
   trail in the move's type colour; a beam is that sprite laid end to end down
   a bright core; where a move lands, its burst plays. A wind-up is drawn ON
   THE GROUND first - the line a shot or beam will take, the arc a blow will
   cover, the ring a pulse will fill, the lane a dash will run - and the body
   crouches and gathers its colour, so a dodge is a read, not a guess.

   A HIT IS FELT THREE WAYS. The body: squashed, tilted off the blow, flashed
   white then its attacker's colour, shaking through the hit-stop. The
   camera: trauma-based shake with a kick along the blow, a punch of zoom at
   the point. The ground: each type throws its own matter (embers, droplets,
   bolts, shards, leaves, chunks, bubbles...) and leaves its own mark on the
   floor (scorch, wet, frost, char, cracks), which fades. Cover wobbles,
   chips and crumbles into rubble. Each floor has its own air (embers, snow,
   rain, spray, dust, the stadium's camera flashes).

   EVERY BODY IS ITS PMD SPRITE where the PMD Sprite Repository drew one
   (`npm run pmd`: one cropped atlas and a sidecar a Pokemon, loaded when a
   match needs it and kept for the next), in eight directions: it walks,
   stands, swings a blow whose HIT FRAME lands on the tick the rules hit,
   shoots, stamps a pulse, charges, flinches, sleeps and hops - every frame
   still squashed, tilted and flashed by the same pose. A Pokemon PMD never
   drew, or one whose atlas has not arrived, fights in its follower art, so
   nothing waits on a download.

   THE CEREMONY: a match opens on a VS card, two Poke Balls thrown in and the
   count; a surge cuts in on a band of its colour; the last knockout is an
   impact frame, slow motion and K.O., then the camera finds the winner.
   Reduced motion keeps every word and number and drops the shake, the zoom
   and the weather. */
import { W, H, TPS, INSET, INTRO, LIMIT, FINAL_T, moveAt, activeOf, PAR, BRN, PSN, SLP, FRZ, GROUND, ZONE_SAYS,
  arenaMove as moveOf, BASIC_P, BASIC_S, BASIC_K } from "../../../game/arena.js";
import { arenaArt, loadAnims } from "../moveAnim.js";
import { followSheet } from "../../../game/cosmetics.js";
import { MOVES } from "../../../data/moves.js";
import { TYPES } from "../../../data/types.js";
import { STRUGGLE } from "../../../game/battle.js";
import { spriteUrl } from "../../Sprite.jsx";
import { PMD_IDS, PMD_REV } from "../../../data/pmd.js";

const asset = (p) => new URL(p, document.baseURI).href;
// The basic attack (arena.js) is no League move: no slug, no sprite - it is drawn in its user's colour.
const slugOf = (i) => (i === STRUGGLE ? "struggle" : MOVES[i]?.n ?? null);
const isBasic = (i) => i === BASIC_P || i === BASIC_S;
// A move's name as the callout says it ("Thunder Punch").
const callName = (i) => (i === STRUGGLE ? "Struggle" : MOVES[i].n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "));
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = Math.random;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => 1 - (1 - k) ** 3;
const back = (k) => { const c = 1.9; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const STATUS = {
  [PAR]: { tag: "PAR", colour: "#f6d23a" }, [BRN]: { tag: "BRN", colour: "#ff7a3d" },
  [PSN]: { tag: "PSN", colour: "#b060e8" }, [SLP]: { tag: "SLP", colour: "#9aa5c8" }, [FRZ]: { tag: "FRZ", colour: "#8fe3ff" },
};
const STAT = ["", "ATK", "DEF", "SP.A", "SP.D", "SPE", "ACC", "EVA"];
const FACE = `"Rubik", "Chakra Petch", sans-serif`;
const MINE = "#45d4ff", THEIRS = "#ff7a4d";

/* THE OPENING'S BEATS, in seconds of INTRO (the sim's own ticks). */
const VS_IN = 0.12, VS_SLAM = 0.5, VS_OUT = 1.1, THROW = 1.15, LAND = 1.6, COUNT = [1.75, 2.2, 2.65];
/* THE ENDING'S, in real milliseconds once the match is over. */
const KO_SLOW = 1100, RESULT_AT = 1150, DONE_AT = 2400;
// How close the upright camera may come (the court fills the width at 1).
const UPRIGHT_ZOOM = 2.4;
/* ...and how far it may stand back: at 1 the court was a strip across the
   middle of a tall phone with empty bands above and below the fight. Past
   it the camera favours your own Pokemon, the one you steer. */
const UPRIGHT_MIN = 1.3;

/* A type's colour is `--tc` on its `.t-<type>` class (the rulebook: read it,
   never copy a hex), read once off a hidden probe. */
function typeColours() {
  const out = {};
  const probe = document.createElement("i");
  probe.style.display = "none";
  document.body.append(probe);
  for (const t of TYPES) {
    probe.className = `t-${t}`;
    out[t] = getComputedStyle(probe).getPropertyValue("--tc").trim() || "#c8c8d8";
  }
  probe.remove();
  return out;
}

// Images, each loaded once; a flat copy of each sheet per colour for the flash, the tint and the aura.
const imgs = new Map();
function img(path, onload) {
  if (!imgs.has(path)) {
    const im = new Image();
    im.decoding = "async";
    im.src = asset(path);
    imgs.set(path, im);
  }
  const im = imgs.get(path);
  if (onload && !(im.complete && im.naturalWidth)) im.addEventListener("load", onload, { once: true });
  return im.complete && im.naturalWidth ? im : null;
}
const flats = new WeakMap();
function flat(im, colour = "#fff") {
  let per = flats.get(im);
  if (!per) flats.set(im, (per = new Map()));
  if (per.has(colour)) return per.get(colour);
  const c = document.createElement("canvas");
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext("2d");
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = colour;
  x.fillRect(0, 0, c.width, c.height);
  per.set(colour, c);
  return c;
}

/* THE FLOOR: the arena's own picture, or a plain court while it loads - art,
   so it does not change with the theme (the map and battle skies do not). */
function bakeFloor(px, pic) {
  const c = document.createElement("canvas");
  c.width = W * px; c.height = H * px;
  const x = c.getContext("2d");
  if (pic) {
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(pic, 0, 0, c.width, c.height);
    return c;
  }
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    x.fillStyle = (tx + ty) % 2 ? "#3b4a6b" : "#40507a";
    x.fillRect(tx * px, ty * px, px, px);
  }
  x.strokeStyle = "rgba(220,235,255,0.55)";
  x.lineWidth = Math.max(2, px / 8);
  x.strokeRect(INSET * px, INSET * px, (W - 2 * INSET) * px, (H - 2 * INSET) * px);
  x.beginPath(); x.moveTo((W / 2) * px, INSET * px); x.lineTo((W / 2) * px, (H - INSET) * px); x.stroke();
  x.beginPath(); x.arc((W / 2) * px, (H / 2) * px, 2.6 * px, 0, TAU); x.stroke();
  return c;
}

/* COVER, drawn in its arena's own material (`GROUND[arena].cover`): a block
   about 1.2 tiles a side, lit from the upper left like the floors, cracking
   as it loses its HP. */
const MATERIAL = {
  statue: { fill: "#c9ced8", dark: "#7d8597", light: "#eef1f6" },
  boulder: { fill: "#8a7a68", dark: "#4f4438", light: "#b5a58f" },
  crate: { fill: "#b07c45", dark: "#6b4524", light: "#d6a46a" },
  basalt: { fill: "#3b3536", dark: "#1e1a1b", light: "#5b5253" },
  tree: { fill: "#3f8a3a", dark: "#1f4f22", light: "#6cbf5a" },
  ice: { fill: "#a9e4f5", dark: "#5aa8c8", light: "#e8fbff" },
};
/* `pic` is the drawn block (public/arena/cover/<material>.webp, `npm run
   arenas`); the shapes below stand in only while it loads. */
function drawCover(ctx, kind, cx, cy, size, frac, t, pic) {
  const m = MATERIAL[kind] ?? MATERIAL.statue;
  const h = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath(); ctx.ellipse(size * 0.08, h * 0.92, h * 1.02, h * 0.36, 0, 0, TAU); ctx.fill();
  if (pic) {
    // The drawing stands a little taller than its block, as a GBA object does.
    const d = size * 1.4;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(pic, -d / 2, -d * 0.58, d, d);
    ctx.imageSmoothingEnabled = false;
  } else if (kind === "tree") {
    ctx.fillStyle = "#5a3b22"; ctx.fillRect(-size * 0.09, 0, size * 0.18, h * 0.85);
    for (const [ox, oy, r, c] of [[0, -h * 0.2, h * 0.95, m.dark], [-h * 0.12, -h * 0.32, h * 0.8, m.fill], [-h * 0.3, -h * 0.5, h * 0.36, m.light]]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ox, oy, r, 0, TAU); ctx.fill();
    }
  } else if (kind === "boulder") {
    ctx.fillStyle = m.dark; ctx.beginPath(); ctx.ellipse(0, 0, h * 1.02, h * 0.92, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = m.fill; ctx.beginPath(); ctx.ellipse(-h * 0.06, -h * 0.08, h * 0.9, h * 0.78, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = m.light; ctx.beginPath(); ctx.ellipse(-h * 0.35, -h * 0.38, h * 0.32, h * 0.2, -0.4, 0, TAU); ctx.fill();
  } else {
    const r = kind === "ice" ? h * 0.25 : kind === "statue" ? h * 0.18 : h * 0.08;
    const box = (x, y, w, hh, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); ctx.fill(); };
    box(-h, -h, size, size, m.dark);
    box(-h, -h, size * 0.94, size * 0.9, m.fill);
    ctx.fillStyle = m.light; ctx.fillRect(-h + size * 0.08, -h + size * 0.08, size * 0.5, size * 0.1);
    if (kind === "crate") {
      ctx.strokeStyle = m.dark; ctx.lineWidth = Math.max(1, size / 16);
      ctx.strokeRect(-h + size * 0.1, -h + size * 0.1, size * 0.74, size * 0.7);
      ctx.beginPath(); ctx.moveTo(-h + size * 0.1, -h + size * 0.1); ctx.lineTo(-h + size * 0.84, -h + size * 0.8); ctx.stroke();
    } else if (kind === "statue") {
      ctx.fillStyle = "#e8413c"; ctx.beginPath(); ctx.arc(-size * 0.03, -size * 0.05, size * 0.16, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#fafafa"; ctx.beginPath(); ctx.arc(-size * 0.03, -size * 0.05, size * 0.16, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = m.dark; ctx.lineWidth = Math.max(1, size / 20); ctx.beginPath(); ctx.arc(-size * 0.03, -size * 0.05, size * 0.16, 0, TAU); ctx.stroke();
    } else if (kind === "basalt") {
      ctx.strokeStyle = `rgba(255,${120 + 60 * Math.abs(Math.sin(t / 30))},40,${0.5 + 0.4 * (1 - frac)})`;
      ctx.lineWidth = Math.max(1, size / 18);
      ctx.beginPath(); ctx.moveTo(-h * 0.5, -h * 0.6); ctx.lineTo(-h * 0.1, -h * 0.1); ctx.lineTo(-h * 0.35, h * 0.5); ctx.moveTo(-h * 0.1, -h * 0.1); ctx.lineTo(h * 0.45, h * 0.1); ctx.stroke();
    } else if (kind === "ice") {
      ctx.globalAlpha = 0.6; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.moveTo(-h * 0.6, h * 0.3); ctx.lineTo(-h * 0.2, -h * 0.6); ctx.lineTo(-h * 0.05, -h * 0.6); ctx.lineTo(-h * 0.45, h * 0.3); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // Cracks as it weakens.
  if (frac < 0.66) {
    ctx.strokeStyle = "rgba(20,14,10,0.75)"; ctx.lineWidth = Math.max(1, size / 22);
    ctx.beginPath(); ctx.moveTo(h * 0.1, -h * 0.7); ctx.lineTo(-h * 0.05, -h * 0.15); ctx.lineTo(h * 0.25, h * 0.25);
    if (frac < 0.33) { ctx.moveTo(-h * 0.05, -h * 0.15); ctx.lineTo(-h * 0.55, h * 0.05); ctx.moveTo(h * 0.25, h * 0.25); ctx.lineTo(h * 0.1, h * 0.75); }
    ctx.stroke();
  }
  ctx.restore();
}
const CHIP = { statue: "#c9ced8", boulder: "#8a7a68", crate: "#b07c45", basalt: "#5b5253", tree: "#3f8a3a", ice: "#bfefff" };

/* MARKS ON THE FLOOR: what a type leaves where it lands, painted once into a
   small canvas (in tiles, so a resize only rescales it) and faded out. */
const MARK_LIFE = 12000, MARK_FADE = 4000, MARK_MAX = 40;
const MARK_OF = { fire: "scorch", water: "wet", ice: "frost", electric: "char", ground: "crack", rock: "crack",
  grass: "leaves", poison: "goo", fighting: "crack", steel: "crack" };
function paintMark(kind, size, px, colour, len = 0) {
  const n = Math.max(8, Math.ceil(size * px));
  const c = document.createElement("canvas");
  c.width = len ? Math.ceil(len * px) : n; c.height = n;
  const x = c.getContext("2d");
  const m = n / 2;
  if (len) {
    // A beam's line: dark down its length, ragged at the edges.
    const g = x.createLinearGradient(0, 0, 0, n);
    const ink = kind === "wet" ? "rgba(20,60,110," : kind === "frost" ? "rgba(225,250,255," : "rgba(18,10,6,";
    g.addColorStop(0, `${ink}0)`); g.addColorStop(0.5, `${ink}0.5)`); g.addColorStop(1, `${ink}0)`);
    x.fillStyle = g; x.fillRect(0, 0, c.width, n);
    return c;
  }
  if (kind === "scorch" || kind === "char") {
    const g = x.createRadialGradient(m, m, 0, m, m, m);
    g.addColorStop(0, "rgba(12,6,3,0.7)"); g.addColorStop(0.55, "rgba(30,16,8,0.4)"); g.addColorStop(1, "rgba(30,16,8,0)");
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    if (kind === "char") {
      x.strokeStyle = "rgba(10,8,4,0.45)"; x.lineWidth = Math.max(1, n / 90);
      for (let i = 0; i < 5; i++) {
        let a = rand() * TAU, r = n * 0.05;
        x.beginPath(); x.moveTo(m, m);
        while (r < m * 0.7) { r += n * 0.06; a += (rand() - 0.5) * 0.9; x.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r); }
        x.stroke();
      }
    }
  } else if (kind === "wet") {
    x.fillStyle = "rgba(25,70,120,0.32)";
    x.beginPath(); x.ellipse(m, m, m * 0.7, m * 0.5, rand() * 0.6, 0, TAU); x.fill();
    for (let i = 0; i < 6; i++) {
      const a = rand() * TAU, r = m * (0.6 + rand() * 0.35);
      x.beginPath(); x.arc(m + Math.cos(a) * r, m + Math.sin(a) * r * 0.75, n * (0.03 + rand() * 0.04), 0, TAU); x.fill();
    }
    x.strokeStyle = "rgba(190,235,255,0.25)"; x.lineWidth = Math.max(1, n / 50);
    x.beginPath(); x.ellipse(m, m, m * 0.7, m * 0.5, 0, 0, TAU); x.stroke();
  } else if (kind === "frost") {
    x.fillStyle = "rgba(210,245,255,0.18)";
    x.beginPath(); x.arc(m, m, m * 0.8, 0, TAU); x.fill();
    x.strokeStyle = "rgba(235,252,255,0.75)"; x.lineWidth = Math.max(1, n / 45);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + rand() * 0.3, r = m * (0.7 + rand() * 0.25);
      x.beginPath(); x.moveTo(m, m); x.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      for (const f of [0.45, 0.7]) {
        const bx = m + Math.cos(a) * r * f, by = m + Math.sin(a) * r * f, b = r * 0.22;
        x.moveTo(bx, by); x.lineTo(bx + Math.cos(a + 0.7) * b, by + Math.sin(a + 0.7) * b);
        x.moveTo(bx, by); x.lineTo(bx + Math.cos(a - 0.7) * b, by + Math.sin(a - 0.7) * b);
      }
      x.stroke();
    }
  } else if (kind === "crack") {
    const g = x.createRadialGradient(m, m, 0, m, m, m * 0.45);
    g.addColorStop(0, "rgba(10,8,6,0.55)"); g.addColorStop(1, "rgba(10,8,6,0)");
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    x.strokeStyle = "rgba(14,10,6,0.78)"; x.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      let a = (i / 7) * TAU + rand() * 0.5, r = n * 0.04;
      x.lineWidth = Math.max(1, n / 28);
      x.beginPath(); x.moveTo(m, m);
      while (r < m * (0.6 + rand() * 0.4)) { r += n * 0.07; a += (rand() - 0.5) * 0.7; x.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r); x.lineWidth *= 0.85; }
      x.stroke();
    }
    x.strokeStyle = "rgba(255,240,210,0.18)"; x.lineWidth = Math.max(1, n / 60);
    x.beginPath(); x.arc(m, m, m * 0.42, 0, TAU); x.stroke();
  } else if (kind === "leaves") {
    for (let i = 0; i < 7; i++) {
      x.fillStyle = rand() < 0.5 ? "rgba(70,150,60,0.8)" : "rgba(140,200,90,0.8)";
      x.save(); x.translate(m + (rand() - 0.5) * n * 0.7, m + (rand() - 0.5) * n * 0.6); x.rotate(rand() * TAU);
      x.beginPath(); x.ellipse(0, 0, n * 0.07, n * 0.03, 0, 0, TAU); x.fill(); x.restore();
    }
  } else if (kind === "goo") {
    x.fillStyle = "rgba(120,40,160,0.4)";
    x.beginPath(); x.ellipse(m, m, m * 0.65, m * 0.45, rand(), 0, TAU); x.fill();
    x.strokeStyle = "rgba(220,150,255,0.45)"; x.lineWidth = Math.max(1, n / 50);
    for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(m + (rand() - 0.5) * m, m + (rand() - 0.5) * m * 0.6, n * 0.04, 0, TAU); x.stroke(); }
  } else {
    x.strokeStyle = colour; x.globalAlpha = 0.4; x.lineWidth = Math.max(1, n / 30);
    x.beginPath(); x.arc(m, m, m * 0.6, 0, TAU); x.stroke();
  }
  return c;
}

/* THE PMD ATLASES (tools/build_pmd.py): which ids have one, each loaded once
   - its sidecar, then its image - and kept across matches. A shiny is the
   atlas recoloured by the sidecar's swap (`s`, once, on a canvas) or its own
   `-s` atlas (`S`); a sheet with neither has no shiny, and a shiny of it
   keeps the follower art (its shiny row), never the plain colours. */
const PMD = new Set(PMD_IDS.split(",").filter(Boolean).map((h) => parseInt(h, 16)));
const atlases = new Map();
let atlasIds = 0;
const glows = new Map();
function glowOf(colour) {
  let c = glows.get(colour);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, colour); g.addColorStop(1, "transparent");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    glows.set(colour, c);
  }
  return c;
}
function recolour(im, pairs) {
  const c = document.createElement("canvas");
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(im, 0, 0);
  const data = x.getImageData(0, 0, c.width, c.height), px = data.data;
  const swap = new Map(pairs.map((p) => [parseInt(p.slice(0, 6), 16), parseInt(p.slice(6), 16)]));
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const to = swap.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    if (to != null) { px[i] = to >> 16; px[i + 1] = (to >> 8) & 255; px[i + 2] = to & 255; }
  }
  x.putImageData(data, 0, 0);
  return c;
}
function atlasOf(id, shiny) {
  if (!PMD.has(id)) return null;
  const key = shiny ? `${id}s` : String(id);
  let got = atlases.get(key);
  if (!got) {
    got = { ready: false };
    atlases.set(key, got);
    fetch(asset(`arena/pmd/${id}.json?v=${PMD_REV}`)).then((r) => (r.ok ? r.json() : null)).then((meta) => {
      if (!meta || (shiny && !meta.s && !meta.S)) return;
      const im = new Image();
      im.decoding = "async";
      im.onload = () => { got.img = shiny && meta.s ? recolour(im, meta.s) : im; got.meta = meta; got.ready = true; };
      im.src = asset(`arena/pmd/${id}${shiny && meta.S ? "-s" : ""}.png?v=${PMD_REV}`);
    }).catch(() => { /* the follower art stands in */ });
  }
  return got.ready ? got : null;
}
// Its eight rows run down, down-right, right, up-right, up, up-left, left, down-left.
const rowOf = (fx, fy) => {
  const k = Math.round(Math.atan2(fy || 0, fx || 0) / (Math.PI / 4));
  return (((2 - k) % 8) + 8) % 8;
};
// The frame `at` 60ths into durations `d`: looped, or held on the last.
function frameAt(d, at, loop) {
  const total = d.reduce((n, v) => n + v, 0) || 1;
  let t = loop ? at % total : at;
  for (let i = 0; i < d.length; i++) { t -= d[i]; if (t < 0) return i; }
  return d.length - 1;
}
// What a move looks like on the body, and what stands in where a sheet lacks one.
const SHAPE_ANIM = { melee: "Attack", dash: "Attack", shot: "Shoot", multi: "Shoot", beam: "Shoot", field: "Shoot", pulse: "Double", self: "Charge" };
const STAND_IN = { Shoot: "Attack", Double: "Attack", Charge: "Idle", Sleep: "Idle", Hop: "Idle" };
const LOOPS = new Set(["Walk", "Idle", "Sleep", "Charge"]);

// Which of a walking sheet's eight frames: down, down, up, up, west, west, east, east.
const frameOf = (f, t) => {
  const step = f.moving || f.dodge ? Math.floor(t / 8) % 2 : 0;
  const base = Math.abs(f.fx) > Math.abs(f.fy) ? (f.fx < 0 ? 4 : 6) : f.fy < 0 ? 2 : 0;
  return base + step;
};

/* `sides`: each team's looks ({id, shiny}). `names`: per side, who fights
   ("You", a master's name, "CPU - Hard") for the VS card. `me`: which side
   is the player's (the low-HP pulse and the combo's corner). */
export function createRenderer(canvas, sides, arena = "indigo", { names = [["You"], ["CPU"]], me = 0 } = {}) {
  const ground = GROUND[arena] ?? GROUND.indigo;
  const coverPath = `arena/cover/${ground.cover}.webp`;
  const ctx = canvas.getContext("2d");
  const colours = typeColours();
  const colourOf = (i) => colours[moveOf(i).t] ?? "#e8e8f0";
  const typeOf = (i) => moveOf(i).t ?? "normal";
  // A side's Pokemon's first type: what its typeless basic attack wears.
  const typeAt = (s, side) => { const sd = s.sides[side]; return TYPES[sd.team[sd.active]?.types[0]] ?? "normal"; };
  const tintOf = (i, s, side) => (isBasic(i) ? colours[typeAt(s, side)] ?? "#e8e8f0" : colourOf(i));
  /* WHAT A TYPE LEAVES IN THE AIR behind a shot: its own matter, a little
     at a time - embers, droplets, sparks, frost, leaves - so a Flamethrower
     and a Water Gun read apart at a glance, before either lands. */
  function trailBit(type, x, y, dx, dy, colour) {
    const [vx, vy] = [-dx * 0.02 + (rand() - 0.5) * 0.03, -dy * 0.02 + (rand() - 0.5) * 0.03];
    switch (type) {
      case "fire": part({ k: "glow", x, y, vx, vy, lift: 0.002, colour: rand() < 0.5 ? "#ffd27a" : "#ff5a1f", life: 18 + rand() * 10, size: 0.1 + rand() * 0.08 }); break;
      case "water": part({ k: "dot", x, y, vx, vy, vz: 0.02, g: 0.004, colour: rand() < 0.5 ? "#7fd4ff" : "#d8f6ff", life: 22, size: 0.09 }); break;
      case "electric": if (rand() < 0.5) part({ k: "bolt", x, y, ang: rand() * TAU, len: 0.4 + rand() * 0.5, colour: "#fff59a", life: 5 }); break;
      case "ice": part({ k: "shard", x, y, vx, vy, colour: rand() < 0.5 ? "#bff3ff" : "#ffffff", life: 20, size: 0.12, vr: 0.3 }); break;
      case "grass": case "bug": part({ k: "leaf", x, y, vx, vy, colour: rand() < 0.5 ? "#5fd35a" : "#a6e86b", life: 26, size: 0.12, vr: 0.2 }); break;
      case "psychic": case "fairy": part({ k: "star", x, y, vx, vy, colour: rand() < 0.5 ? colour : "#ffffff", life: 18, size: 0.12 }); break;
      case "rock": case "ground": part({ k: "chunk", x, y, vx, vy, colour: "#9b8466", life: 18, size: 0.09 }); break;
      default: part({ k: "glow", x, y, vx, vy, wob: type === "ghost" ? 1 : 0, colour, life: 16, size: 0.1 });
    }
  }
  let px = 16, floor = null, ox = 0, oy = 0, dpr = 1;
  const fx = [];          // live effects: bursts, numbers, words, rings, beams, corpses
  const parts = [];       // matter: embers, droplets, shards, chunks...
  const air = [];         // the floor's weather, apart so a fight never evicts it
  const marks = [];       // on the floor, fading
  const overlays = [];    // screen space: impact frames, speed lines, cut-ins, stamps
  const trails = new Map();
  const ghosts = [];
  const poses = new Map();
  const covShake = new Map();
  const combo = [{ n: 0, at: -1e9, pop: 0 }, { n: 0, at: -1e9, pop: 0 }];
  const lastHit = [[1, 0], [-1, 0]];
  const cam = { x: W / 2, y: H / 2, z: 1, trauma: 0, kx: 0, ky: 0, rot: 0 };
  const punch = { z: 0, x: W / 2, y: H / 2 };
  let stopMs = 0, slowMs = 0, slowK = 1, scale = 1;
  let clock = 0, lastNow = 0, ghostAcc = 0;
  let landed = false, overAt = -1, overSeen = null;
  const shiny = sides.map((team) => team.map((m) => m?.shiny ?? false));
  const floorPath = `arena/${arena}.webp`;
  const still = calm();

  // The sheets this match can draw, fetched before the first frame needs them.
  loadAnims();
  img(coverPath);
  for (const team of sides) for (const m of team) {
    const id = followSheet(m.id);
    if (id != null) img(`follow/${id}.png`);
    atlasOf(m.id, m.shiny);
  }
  const leads = sides.map((team) => team[0] && spriteUrl(team[0].id, team[0].shiny ? "shiny" : null));
  for (const u of leads) if (u) img(u);

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    px = Math.max(8, Math.floor(Math.min(canvas.width / W, canvas.height / H)));
    ox = Math.floor((canvas.width - W * px) / 2); oy = Math.floor((canvas.height - H * px) / 2);
    floor = bakeFloor(px, img(floorPath, () => { floor = bakeFloor(px, img(floorPath)); }));
  }
  resize();

  const sx = (x) => ox + x * px, sy = (y) => oy + y * px;

  // ------------------------------------------------------------- feel

  const shake = (n) => { if (!still) cam.trauma = Math.min(1, cam.trauma + n); };
  const kick = (dx, dy, n) => { if (!still) { cam.kx += dx * n; cam.ky += dy * n; } };
  const zoomAt = (x, y, n) => { if (!still && n > punch.z) { punch.z = n; punch.x = x; punch.y = y; } };
  const stop = (ms) => { stopMs = Math.max(stopMs, ms); };
  const slow = (ms, k) => { slowMs = Math.max(slowMs, ms); slowK = Math.min(slowK, k); };
  const poseOf = (side, slot) => {
    const key = side * 8 + slot;
    if (!poses.has(key)) poses.set(key, { sx: 1, sy: 1, vsx: 0, vsy: 0, ox: 0, oy: 0, vox: 0, voy: 0, tilt: 0, vt: 0, jit: 0, tint: null, tintT: 0 });
    return poses.get(key);
  };
  // A springy body: squash it, tilt it or push it, and it wobbles home.
  function settle(p, k) {
    const spring = (x, v, rest) => {
      v += (rest - x) * 0.32 * k;
      v *= 0.72 ** k;
      return [x + v * k, v];
    };
    [p.sx, p.vsx] = spring(p.sx, p.vsx, 1);
    [p.sy, p.vsy] = spring(p.sy, p.vsy, 1);
    [p.ox, p.vox] = spring(p.ox, p.vox, 0);
    [p.oy, p.voy] = spring(p.oy, p.voy, 0);
    [p.tilt, p.vt] = spring(p.tilt, p.vt, 0);
    if (p.tintT > 0) p.tintT -= k;
    if (p.hurt > 0) p.hurt -= k;
  }
  /* WHAT THE BODY IS DOING, for its PMD sheet: the animation, how far in (in
     60ths, through the hit-stop: a held frame holds), a wind-up's progress
     (the blow's frames up to its hit run across it, so the hit frame lands as
     the rules hit), the direction row - and the follower frame beside it. */
  function poseNow(f, p, k, won, t) {
    const a = f.act;
    let anim = "Idle", hold = false;
    if (won) anim = "Hop";
    else if (f.status === SLP) anim = "Sleep";
    else if (f.status === FRZ) { anim = "Hurt"; hold = true; }
    else if (p.hurt > 0) anim = "Hurt";
    else if (a) anim = SHAPE_ANIM[a.shape] ?? "Attack";
    else if (f.dodge > 0) anim = "Hop";
    else if (f.moving) anim = "Walk";
    const key = a && !won ? `${anim}:${a.id}:${a.ph === "wind" ? "w" : "go"}` : anim;
    if (key !== p.key) { p.key = key; p.at = 0; p.d0 = f.dodge; }
    else if (!hold) p.at += k;
    const prog = a?.ph === "wind" ? 1 - a.t / Math.max(1, a.t0) : anim === "Hop" && f.dodge > 0 ? 1 - f.dodge / Math.max(1, p.d0) : null;
    const still = f.status === SLP || f.status === FRZ;
    p.fr = { anim, at: p.at, prog, go: Boolean(a) && a.ph !== "wind" && !won, row: rowOf(a ? a.dx : f.fx, a ? a.dy : f.fy),
      frame: still ? frameOf({ ...f, moving: false }, 0) : frameOf(f, t) };
    return p.fr;
  }

  function part(p) {
    if (parts.length > 420) parts.shift();
    parts.push({ t: 0, vx: 0, vy: 0, z: 0, vz: 0, g: 0, drag: 0.92, rot: rand() * TAU, vr: 0, size: 0.12, life: 30, ...p });
  }
  const spray = (dx, dy, cone, v) => {
    const a = Math.atan2(dy, dx) + (rand() - 0.5) * cone, sp = v * (0.5 + rand());
    return [Math.cos(a) * sp, Math.sin(a) * sp];
  };
  const around = (v) => spray(1, 0, TAU, v);
  function mark(kind, x, y, size, colour, len = 0, ang = 0) {
    if (marks.length >= MARK_MAX) marks.shift();
    marks.push({ cv: paintMark(kind, size, px, colour, len), x, y, size, len, ang, born: clock, rot: len ? ang : rand() * TAU });
  }

  /* WHAT EACH TYPE THROWS where it lands: the line of the blow first (every
     hit sprays along it), then its own matter. */
  function impact(type, x, y, dx, dy, heavy) {
    const n = heavy ? 1.7 : 1;
    const c = colours[type] ?? "#fff";
    const hx = dx || rand() - 0.5, hy = dy || rand() - 0.5;
    for (let i = 0; i < 6 * n; i++) { const [vx, vy] = spray(hx, hy, 1.1, 0.1); part({ k: "streak", x, y, vx, vy, colour: "#ffffff", life: 11, size: 0.55, drag: 0.84 }); }
    const each = (count, fn) => { for (let i = 0; i < count * n; i++) part(fn(i)); };
    switch (type) {
      case "fire":
        each(14, () => { const [vx, vy] = spray(hx, hy, 2.4, 0.07); return { k: "glow", x, y, vx, vy, lift: 0.0025, colour: rand() < 0.5 ? "#ffd27a" : "#ff5a1f", life: 28 + rand() * 24, size: 0.12 + rand() * 0.1, drag: 0.93 }; });
        each(4, () => ({ k: "smoke", x: x + (rand() - 0.5) * 0.4, y, vx: (rand() - 0.5) * 0.02, vy: -0.012, colour: "rgba(60,40,30,", life: 54, size: 0.35 }));
        break;
      case "water":
        each(14, () => { const [vx, vy] = spray(hx, hy, 2.6, 0.06); return { k: "dot", x, y, vx, vy, vz: 0.06 + rand() * 0.09, g: 0.008, colour: rand() < 0.5 ? "#7fd4ff" : "#d8f6ff", life: 46, size: 0.11, drag: 0.97, splash: rand() < 0.2 }; });
        part({ k: "ring", x, y, colour: "#bff0ff", life: 22, size: 0.3, grow: 0.07 });
        break;
      case "electric":
        each(5, () => ({ k: "bolt", x, y, ang: rand() * TAU, len: 0.8 + rand() * 1, colour: "#fff59a", life: 7 + rand() * 7 }));
        each(8, () => { const [vx, vy] = around(0.09); return { k: "glow", x, y, vx, vy, colour: "#ffe74a", life: 16, size: 0.09 }; });
        break;
      case "ice":
        each(11, () => { const [vx, vy] = spray(hx, hy, 2.2, 0.07); return { k: "shard", x, y, vx, vy, vz: 0.05 + rand() * 0.08, g: 0.007, colour: rand() < 0.5 ? "#bff3ff" : "#ffffff", life: 48, size: 0.2, vr: (rand() - 0.5) * 0.4, bounce: 1, drag: 0.95 }; });
        each(3, () => ({ k: "smoke", x, y, vx: (rand() - 0.5) * 0.02, vy: -0.004, colour: "rgba(220,245,255,", life: 40, size: 0.4 }));
        break;
      case "grass": case "bug":
        each(10, () => { const [vx, vy] = spray(hx, hy, 2.6, 0.06); return { k: "leaf", x, y, vx, vy, vz: 0.05 + rand() * 0.05, g: 0.0022, colour: type === "bug" ? (rand() < 0.5 ? "#b6d84a" : "#8fb33a") : rand() < 0.5 ? "#5fd35a" : "#a6e86b", life: 64, size: 0.17, vr: (rand() - 0.5) * 0.3, drag: 0.95 }; });
        break;
      case "rock": case "ground":
        each(10, () => { const [vx, vy] = spray(hx, hy, 2.8, 0.06); return { k: "chunk", x, y, vx, vy, vz: 0.07 + rand() * 0.09, g: 0.009, colour: type === "rock" ? (rand() < 0.5 ? "#9b8466" : "#6e5c48") : (rand() < 0.5 ? "#b58b52" : "#8a6a3e"), life: 58, size: 0.13 + rand() * 0.12, vr: (rand() - 0.5) * 0.3, bounce: 2, drag: 0.96 }; });
        each(5, () => ({ k: "smoke", x: x + (rand() - 0.5) * 0.6, y, vx: (rand() - 0.5) * 0.03, vy: -0.006, colour: "rgba(200,176,138,", life: 50, size: 0.4 }));
        break;
      case "poison":
        each(10, () => ({ k: "bubble", x: x + (rand() - 0.5) * 0.7, y: y + (rand() - 0.5) * 0.4, vx: (rand() - 0.5) * 0.02, vy: -0.02 - rand() * 0.02, colour: "#d48cff", life: 34 + rand() * 20, size: 0.08 + rand() * 0.12, drag: 0.98 }));
        break;
      case "psychic":
        for (let i = 0; i < 3; i++) part({ k: "ring", x, y, colour: "#ff7ad9", life: 26, size: 0.25, grow: 0.08, t: -i * 4 });
        each(6, () => { const [vx, vy] = around(0.05); return { k: "star", x, y, vx, vy, colour: "#ffc2ef", life: 30, size: 0.16 }; });
        break;
      case "ghost":
        each(8, () => { const [vx, vy] = around(0.03); return { k: "glow", x, y, vx, vy, lift: 0.0018, wob: 1, colour: rand() < 0.5 ? "#8f6fe0" : "#5a3d9a", life: 52, size: 0.22, drag: 0.96 }; });
        break;
      case "dark":
        for (let i = 0; i < 3; i++) part({ k: "slash", x, y, ang: rand() * Math.PI, len: 1.5, colour: "#c08aff", life: 13, t: -i * 2 });
        break;
      case "fighting":
        part({ k: "burst", x, y, colour: "#ffb15a", life: 12, size: 1.1 * n });
        part({ k: "ring", x, y, colour: "#ffffff", life: 16, size: 0.3, grow: 0.12 });
        break;
      case "steel":
        each(14, () => { const [vx, vy] = spray(hx, hy, 2, 0.16); return { k: "streak", x, y, vx, vy, colour: rand() < 0.5 ? "#fff6c0" : "#ffffff", life: 15, size: 0.4, drag: 0.88 }; });
        break;
      case "dragon":
        each(10, () => { const [vx, vy] = spray(hx, hy, 2.4, 0.08); return { k: "shard", x, y, vx, vy, colour: rand() < 0.5 ? "#9b7bff" : "#5fb8ff", life: 30, size: 0.2, vr: 0.3, drag: 0.92 }; });
        each(5, () => { const [vx, vy] = around(0.04); return { k: "glow", x, y, vx, vy, colour: "#7a5cff", life: 34, size: 0.18 }; });
        break;
      case "fairy":
        each(10, () => { const [vx, vy] = around(0.06); return { k: "star", x, y, vx, vy, colour: rand() < 0.5 ? "#ffb3e6" : "#ffffff", life: 36, size: 0.18, drag: 0.94 }; });
        break;
      case "flying":
        for (let i = 0; i < 4; i++) part({ k: "arc", x, y, ang: Math.atan2(hy, hx) + (rand() - 0.5) * 1.2, colour: "#eaf6ff", life: 15, size: 0.9 + rand() * 0.4, t: -i });
        break;
      default:
        part({ k: "burst", x, y, colour: "#ffffff", life: 10, size: 0.9 * n });
        each(6, () => { const [vx, vy] = around(0.07); return { k: "star", x, y, vx, vy, colour: "#fff8d0", life: 24, size: 0.15 }; });
    }
    if (heavy) part({ k: "glow", x, y, colour: c, life: 14, size: 1.2 });
  }
  // Dust kicked up at the feet (a roll, a landing, a dash).
  const dust = (x, y, n = 4) => {
    const c = ground.ice ? "rgba(235,250,255," : arena === "caldera" ? "rgba(70,55,50," : arena === "grove" ? "rgba(120,150,90," : "rgba(210,200,180,";
    for (let i = 0; i < n; i++) part({ k: "smoke", x: x + (rand() - 0.5) * 0.5, y: y + 0.35, vx: (rand() - 0.5) * 0.03, vy: -0.003, colour: c, life: 30, size: 0.22 });
  };
  const crowd = (n) => {
    if (arena !== "indigo" || still) return;
    for (let i = 0; i < n; i++) air.push(flashBulb());
  };
  function flashBulb() {
    // A camera in the stands: somewhere on the border outside the wall.
    const edge = rand() * 4 | 0, u = rand();
    const [x, y] = edge === 0 ? [u * W, 0.35] : edge === 1 ? [u * W, H - 0.35] : edge === 2 ? [0.35, u * H] : [W - 0.35, u * H];
    return { k: "bulb", x, y, t: 0, life: 6 + rand() * 4 };
  }

  // The floor's own air, a few each frame.
  function weather(k) {
    if (still) return;
    const spawn = (rate, make) => { let n = rate * k; while (n > 0) { if (n >= 1 || rand() < n) air.push(make()); n -= 1; } };
    if (arena === "caldera") spawn(0.35, () => ({ k: "ember", x: INSET + rand() * (W - 2 * INSET), y: H - INSET - rand() * 3, vx: (rand() - 0.5) * 0.01, vy: -0.015 - rand() * 0.015, t: 0, life: 90 + rand() * 60, size: 0.05 + rand() * 0.06 }));
    else if (arena === "rink") spawn(0.3, () => ({ k: "snow", x: -2 + rand() * (W + 2), y: -0.5, vx: 0.01 + rand() * 0.01, vy: 0.02 + rand() * 0.02, t: 0, life: 900, size: 0.05 + rand() * 0.06, ph: rand() * TAU }));
    else if (arena === "grove") spawn(1.1, () => ({ k: "rain", x: rand() * (W + 3), y: rand() * H, t: 0, life: 10 + rand() * 6 }));
    else if (arena === "seaside") spawn(0.12, () => ({ k: "mote", x: -0.5, y: rand() * H, vx: 0.02 + rand() * 0.02, vy: (rand() - 0.5) * 0.004, t: 0, life: 1500, size: 0.04 + rand() * 0.05 }));
    else if (arena === "moon") spawn(0.1, () => ({ k: "mote", x: rand() * W, y: rand() * H, vx: (rand() - 0.5) * 0.004, vy: 0.002 + rand() * 0.003, t: 0, life: 200, size: 0.03 + rand() * 0.04, glint: rand() < 0.15 }));
    else if (arena === "indigo" && rand() < 0.04 * k) air.push(flashBulb());
    if (air.length > 180) air.splice(0, air.length - 180);
  }

  const word = (x, y, text, colour, life = 50, big = false) => fx.push({ k: "word", x, y, text, colour, t: 0, life, big });
  const sparks = (x, y, colour, n, v) => {
    for (let i = 0; i < n; i++) { const [vx, vy] = around(v); part({ k: "dot", x, y, vx, vy, colour, life: 22, size: 0.14, drag: 0.9 }); }
  };
  const stamp = (text, colour, life, sub = null) => overlays.push({ k: "stamp", text, colour, t: 0, life, sub });
  const impactFrame = (x, y, dark = false) => { if (!still) overlays.push({ k: "frame", x, y, t: 0, life: dark ? 10 : 6, dark }); };

  // ------------------------------------------------------------- events

  // Events from the ticks since the last frame become effects.
  function take(ev, s) {
    for (const e of ev) {
      const body = e.side != null ? activeOf(s, e.side) : null;
      if (e.k === "hit") {
        // A basic attack hits in its user's colour and type, lighter - its third, boosted, does not.
        const bas = isBasic(e.move);
        const colour = tintOf(e.move, s, 1 - e.side), type = bas ? typeAt(s, 1 - e.side) : typeOf(e.move);
        const art = arenaArt(slugOf(e.move));
        const heavy = e.heavy || e.ko || e.frac > 0.25;
        fx.push({ k: "burst", x: e.x, y: e.y, art: art?.burst ?? art?.shot, colour, t: 0, life: bas && !e.boost ? 16 : 30 });
        impact(type, e.x, e.y, e.dx, e.dy, heavy);
        if (e.boost) {
          word(e.x + 0.5, e.y - 1.1, "x3!", "#ffd23f", 36, true);
          for (let i = 0; i < 2; i++) part({ k: "ring", x: e.x, y: e.y, colour: i ? colour : "#ffffff", life: 16, size: 0.25, grow: 0.12 - i * 0.03, t: -i * 2 });
        }
        /* SUPER EFFECTIVE IS FELT: the screen flashes the move's colour and a
           ring of it goes out from the hit. */
        if (e.eff > 1 && !bas) {
          overlays.push({ k: "tint", colour, t: 0, life: 14 });
          fx.push({ k: "ring", x: e.x, y: e.y, colour, t: 0, life: 24, big: true });
        }
        const bounce = e.dx > 0 ? 1 : -1;
        fx.push({ k: "num", x: e.x, y: e.y - 0.6, vx: bounce * (0.012 + rand() * 0.01), text: String(e.dmg), crit: e.crit, eff: e.eff, t: 0, life: 52, size: e.crit ? 0.82 : heavy ? 0.7 : 0.6 });
        const w = e.crit ? "Critical!" : e.eff > 1 ? "Super effective!" : e.eff < 1 ? "Not very effective" : null;
        if (w) word(e.x, e.y - 1.35, w, e.eff > 1 ? "#ffd23f" : e.crit ? "#ff9d52" : "#b9c2e4", 60, e.eff > 1 || e.crit);
        // The body: knocked off the blow, squashed, flashed, and shaking while the frame holds.
        const p = poseOf(e.side, s.sides[e.side].active);
        const power = Math.min(1.4, 0.45 + e.frac * 2.4 + (heavy ? 0.3 : 0));
        p.sx = 1 + 0.32 * power; p.sy = 1 - 0.28 * power;
        p.ox += e.dx * 0.25 * power; p.oy += e.dy * 0.25 * power;
        p.vt += (e.dx >= 0 ? 1 : -1) * 0.12 * power;
        p.tint = colour; p.tintT = 12; p.hurt = 16;
        lastHit[e.side] = [e.dx || 0, e.dy || 0];
        // A plain basic attack barely holds the frame: twenty a second of full hit-stops would be a slideshow.
        const hold = bas && !e.boost ? 14 : (e.ko ? 0 : 40) + (heavy ? 45 : 0) + (e.crit ? 25 : 0) + (e.eff > 1 ? 15 : 0) + (e.surge ? 20 : 0);
        stop(hold); p.jit = hold;
        shake(0.18 + 0.4 * power * (heavy ? 1 : 0.6));
        kick(e.dx, e.dy, px * 0.12 * power);
        if (heavy) { zoomAt(e.x, e.y, e.crit ? 0.07 : 0.05); impactFrame(sx(e.x), sy(e.y)); crowd(3); }
        if (MARK_OF[type] && (heavy || type !== "fighting" && type !== "steel" && rand() < 0.55)) mark(MARK_OF[type], e.x + (rand() - 0.5) * 0.3, e.y + 0.3, heavy ? 1.6 : 1.1, colour);
        else if (heavy) mark("ring", e.x, e.y + 0.3, 1.4, colour);
        // The striker's combo; the struck one's is broken.
        const by = 1 - e.side, cb = combo[by];
        cb.n = clock - cb.at < 1500 ? cb.n + 1 : 1; cb.at = clock; cb.pop = 1;
        combo[e.side].n = 0;
      } else if (e.k === "tick") {
        fx.push({ k: "num", x: e.x + 0.3, y: e.y - 0.5, text: String(e.dmg), size: 0.46, colour: STATUS[e.st]?.colour ?? "#d8d8e8", t: 0, life: 40 });
        const p = poseOf(e.side, s.sides[e.side].active); p.sx = 1.12; p.sy = 0.9; p.tint = STATUS[e.st]?.colour; p.tintT = 8;
      } else if (e.k === "heal") {
        fx.push({ k: "num", x: e.x, y: e.y - 0.6, text: `+${e.n}`, size: 0.46, colour: "#5fe08a", t: 0, life: 50 });
        for (let i = 0; i < 8; i++) fx.push({ k: "rise", x: e.x + (rand() - 0.5) * 1.2, y: e.y + 0.3, colour: "#7dffa8", t: -i * 3, life: 34 });
      } else if (e.k === "stage") {
        word(e.x, e.y - 1.1 - (e.stat % 2) * 0.35, `${STAT[e.stat]} ${e.n > 0 ? "▲" : "▼"}`, e.n > 0 ? "#ff9d52" : "#7ab8ff", 45);
        for (let i = 0; i < 6; i++) fx.push({ k: "arrow", x: e.x + (rand() - 0.5), y: e.y + 0.2, up: e.n > 0, colour: e.n > 0 ? "#ff9d52" : "#7ab8ff", t: -i * 4, life: 30 });
      } else if (e.k === "status") {
        word(e.x, e.y - 1.2, { [PAR]: "Paralysed!", [BRN]: "Burned!", [PSN]: "Poisoned!", [SLP]: "Fell asleep!", [FRZ]: "Frozen solid!" }[e.st], STATUS[e.st].colour, 55);
        sparks(e.x, e.y, STATUS[e.st].colour, 10, 0.07);
        if (e.st === FRZ) { impact("ice", e.x, e.y, 0, 0, false); mark("frost", e.x, e.y + 0.3, 1.5); }
      } else if (e.k === "para") {
        impact("electric", e.x, e.y - 0.2, 0, 0, false);
        const p = poseOf(e.side, s.sides[e.side].active); p.jit = 300;
      } else if (e.k === "evade") {
        if (e.perfect) {
          word(e.x, e.y - 1.1, "PERFECT!", "#45d4ff", 48, true);
          part({ k: "ring", x: e.x, y: e.y, colour: "#9fe9ff", life: 20, size: 0.3, grow: 0.11 });
          slow(260, 0.3);
        } else word(e.x, e.y - 1, "Dodged", "#45d4ff", 40);
      } else if (e.k === "blocked") {
        word(e.x, e.y - 1, "Blocked", "#9fe3ff", 40);
        fx.push({ k: "ring", x: e.x, y: e.y, colour: "#9fe3ff", t: 0, life: 18 });
        sparks(e.x, e.y - 0.3, "#e8fbff", 8, 0.08);
        shake(0.12);
      } else if (e.k === "immune") {
        word(e.x, e.y - 1, "No effect", "#8d9ac4", 50);
      } else if (e.k === "fizzle") {
        fx.push({ k: "ring", x: e.x, y: e.y, colour: colourOf(e.move), t: 0, life: 16 });
      } else if (e.k === "wind" && body) {
        if (!isBasic(e.move)) part({ k: "ring", x: body.x, y: body.y + 0.35, colour: colourOf(e.move), life: 14, size: 1.2, grow: -0.06 });
      } else if (e.k === "fire" && body) {
        // The release: a lunge into a blow, a kick back off a shot, a stamp for a pulse.
        const p = poseOf(e.side, s.sides[e.side].active), colour = tintOf(e.move, s, e.side);
        /* A MOVE IS CALLED, as the games call it: its name over its user, a
           shockwave in its colour, and the camera answering its power. The
           basic attack is never called - it is the rhythm under the moves. */
        if (!isBasic(e.move)) {
          const pow = moveOf(e.move).p ?? 0;
          fx.push({ k: "call", x: body.x, y: body.y, text: callName(e.move), colour, mine: e.side === me, t: 0, life: 50 });
          part({ k: "ring", x: body.x, y: body.y + 0.3, colour, life: 16, size: 0.4, grow: 0.12 });
          if (pow >= 90) { shake(0.32); zoomAt(body.x, body.y, 0.045); impactFrame(sx(body.x), sy(body.y)); }
          else if (pow) shake(0.08 + pow / 600);
        }
        if (e.shape === "melee" || e.shape === "dash") { p.ox += e.dx * 0.4; p.oy += e.dy * 0.4; p.sx = 0.86; p.sy = 1.16; if (e.shape === "dash") dust(body.x, body.y, 5); }
        else if (e.shape === "shot" || e.shape === "multi" || e.shape === "beam") {
          p.ox -= e.dx * 0.14; p.oy -= e.dy * 0.14; p.sx = 1.12; p.sy = 0.9;
          part({ k: "glow", x: body.x + e.dx * 0.6, y: body.y - 0.2 + e.dy * 0.6, colour, life: 8, size: 0.7 });
          part({ k: "ring", x: body.x + e.dx * 0.6, y: body.y - 0.2 + e.dy * 0.6, colour: "#ffffff", life: 9, size: 0.15, grow: 0.06 });
        } else if (e.shape === "pulse") { p.sx = 1.3; p.sy = 0.72; dust(body.x, body.y, 6); }
        else { p.oy -= 0.3; p.sy = 1.15; p.sx = 0.9; }
      } else if (e.k === "beam") {
        fx.push({ k: "beam", x: e.x, y: e.y, dx: e.dx, dy: e.dy, len: e.len, colour: colourOf(e.move), art: arenaArt(slugOf(e.move))?.shot, t: 0, life: 24 });
        shake(0.4); kick(-e.dx, -e.dy, px * 0.14);
        // Sparks thrown off all along it, and a burst where it ends.
        for (let d = 0.5; d < e.len; d += 0.6) {
          const side = rand() < 0.5 ? 1 : -1;
          part({ k: "glow", x: e.x + e.dx * d, y: e.y + e.dy * d, vx: -e.dy * side * (0.03 + rand() * 0.04), vy: e.dx * side * (0.03 + rand() * 0.04), colour: rand() < 0.4 ? "#ffffff" : colourOf(e.move), life: 18 + rand() * 12, size: 0.1 + rand() * 0.08 });
        }
        impact(typeOf(e.move), e.x + e.dx * e.len, e.y + e.dy * e.len, e.dx, e.dy, true);
        const type = typeOf(e.move);
        if (moveOf(e.move).p) mark(type === "water" ? "wet" : type === "ice" ? "frost" : "scorch", e.x + e.dx * e.len / 2, e.y + 0.25 + e.dy * e.len / 2, 0.9, null, e.len, Math.atan2(e.dy, e.dx));
      } else if (e.k === "pulse") {
        const type = typeOf(e.move), colour = colourOf(e.move);
        fx.push({ k: "wave", x: e.x, y: e.y, r: e.r, colour, art: arenaArt(slugOf(e.move))?.burst, t: 0, life: 24 });
        if (!moveOf(e.move).p) continue;
        const quake = type === "ground" || type === "rock";
        shake(quake ? 0.55 : 0.25);
        if (quake) {
          mark("crack", e.x, e.y + 0.3, e.r * 2, colour);
          for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; impactRing(e.x + Math.cos(a) * e.r * 0.8, e.y + Math.sin(a) * e.r * 0.8); }
        } else if (MARK_OF[type]) mark(MARK_OF[type], e.x, e.y + 0.3, e.r * 1.6, colour);
        else mark("ring", e.x, e.y + 0.3, e.r * 2, colour);
      } else if (e.k === "field") {
        fx.push({ k: "ring", x: e.x, y: e.y, colour: colourOf(e.move), t: 0, life: 20, big: true });
      } else if (e.k === "shield") {
        fx.push({ k: "bubble", side: e.side, t: 0, life: 60 });
      } else if (e.k === "touch") {
        sparks(e.x, e.y, colourOf(e.move), 6, 0.05);
      } else if (e.k === "chip" || e.k === "break") {
        const c = CHIP[ground.cover];
        covShake.set(e.id, 1);
        const n = e.k === "break" ? 16 : e.weak ? 6 : 4;
        for (let i = 0; i < n; i++) { const [vx, vy] = around(e.k === "break" ? 0.07 : 0.045); part({ k: ground.cover === "tree" ? "leaf" : "chunk", x: e.x, y: e.y, vx, vy, vz: 0.06 + rand() * 0.08, g: 0.008, colour: c, life: 60, size: 0.1 + rand() * 0.14, vr: (rand() - 0.5) * 0.3, bounce: 2, drag: 0.96 }); }
        if (e.k === "break") {
          fx.push({ k: "ring", x: e.x, y: e.y, colour: c, t: 0, life: 26, big: true });
          for (let i = 0; i < 6; i++) part({ k: "smoke", x: e.x + (rand() - 0.5), y: e.y + (rand() - 0.5) * 0.6, vx: (rand() - 0.5) * 0.02, vy: -0.006, colour: "rgba(190,180,165,", life: 60, size: 0.5 });
          mark("crack", e.x, e.y + 0.2, 1.8, c);
          shake(0.4);
        }
        if (e.weak && e.k === "chip") word(e.x, e.y - 0.9, "Cracked!", "#ffd23f", 30);
      } else if (e.k === "claim") {
        const mine = e.side === me;
        word(e.x, e.y - 1.4, mine ? ZONE_SAYS[ground.zone] : "The foe took the zone", mine ? "#5fe08a" : "#ff9d52", 70);
        fx.push({ k: "ring", x: e.x, y: e.y, colour: mine ? "#5fe08a" : "#ff9d52", t: 0, life: 30, big: true });
        for (let i = 0; i < 12; i++) fx.push({ k: "rise", x: e.x + (rand() - 0.5) * 2, y: e.y + 0.4, colour: mine ? "#7dffa8" : "#ffb37a", t: -i * 2, life: 34 });
      } else if (e.k === "zones") {
        for (const z of [[W / 2, INSET + 2.1], [W / 2, H - INSET - 2.1]]) { word(z[0], z[1] - 1.5, "Zone open!", "#45d4ff", 60); fx.push({ k: "ring", x: z[0], y: z[1], colour: "#45d4ff", t: 0, life: 30, big: true }); }
      } else if (e.k === "rumble") {
        shake(0.35);
      } else if (e.k === "rock") {
        impact("rock", e.x, e.y, 0, 0, true);
        fx.push({ k: "ring", x: e.x, y: e.y, colour: "#c8b090", t: 0, life: 24, big: true });
        mark("crack", e.x, e.y + 0.2, 2.2);
        shake(0.6);
      } else if (e.k === "ready") {
        const f = s.sides[e.side].team[s.sides[e.side].active];
        if (e.side === me) word(f.x, f.y - 1.6, "SURGE READY", "#ffd23f", 60, true);
        part({ k: "ring", x: f.x, y: f.y, colour: "#ffd23f", life: 24, size: 0.3, grow: 0.1 });
      } else if (e.k === "surge") {
        const f = activeOf(s, e.side);
        const colour = f ? colours[TYPES[f.types[0]]] ?? "#ffd23f" : "#ffd23f";
        for (let i = 0; i < 3; i++) part({ k: "ring", x: e.x, y: e.y, colour: i ? colour : "#ffffff", life: 26, size: 0.3, grow: 0.16 - i * 0.03, t: -i * 3 });
        impact(f ? TYPES[f.types[0]] : "normal", e.x, e.y, 0, 0, true);
        mark("ring", e.x, e.y + 0.3, 3, colour);
        overlays.push({ k: "cut", side: e.side, colour, id: f?.id, shiny: f ? shiny[e.side]?.[f.slot] : false, t: 0, life: 44 });
        stop(420); shake(0.6); zoomAt(e.x, e.y, 0.12); crowd(6);
      } else if (e.k === "ko") {
        const f = s.sides[e.side].team[e.slot];
        const last = s.sides[e.side].team.every((m) => m.hp <= 0);
        const [dx, dy] = lastHit[e.side];
        fx.push({ k: "corpse", id: f.id, side: e.side, slot: e.slot, x: e.x, y: e.y, dx, dy, frame: { anim: "Hurt", at: 1e6, row: rowOf(f.fx, f.fy), frame: frameOf(f, 0) }, t: 0, life: 40 });
        impactFrame(sx(e.x), sy(e.y), true);
        fx.push({ k: "ring", x: e.x, y: e.y, colour: "#ffffff", t: 0, life: 40, big: true });
        stop(160); shake(0.85); zoomAt(e.x, e.y, 0.1); crowd(10);
        if (last) slow(KO_SLOW, 0.3); else { slow(520, 0.35); word(e.x, e.y - 1.6, "KNOCKED OUT", "#ffffff", 60, true); }
      } else if (e.k === "dodge" && body) {
        dust(body.x, body.y, 4);
        if (ground.water && body.wading) part({ k: "ring", x: body.x, y: body.y + 0.35, colour: "#bff3ff", life: 18, size: 0.3, grow: 0.06 });
      } else if (e.k === "go") {
        stamp("FIGHT!", "#ffd23f", 46);
        shake(0.45); impactFrame(canvas.width / 2, canvas.height / 2);
      } else if (e.k === "final") {
        stamp("FINAL MINUTE", "#ff5a4d", 80, "Hits land harder · Surge fills twice as fast");
        shake(0.35); crowd(8);
      } else if (e.k === "in" || e.k === "out") {
        const f = activeOf(s, e.side) ?? s.sides[e.side].team[e.slot];
        fx.push({ k: "ball", x: f.x, y: f.y, t: 0, life: 26, out: e.k === "out" });
        if (e.k === "in") { const p = poseOf(e.side, e.slot); p.sx = 0.15; p.sy = 0.15; sparks(f.x, f.y - 0.3, "#ffffff", 10, 0.08); dust(f.x, f.y, 3); }
      }
    }
  }
  const impactRing = (x, y) => part({ k: "chunk", x, y, vx: 0, vy: 0, vz: 0.05 + rand() * 0.06, g: 0.008, colour: "#8a7a68", life: 40, size: 0.12 + rand() * 0.1, vr: 0.2, bounce: 1 });

  // ------------------------------------------------------------- the frame

  function draw(s, alpha, now = performance.now()) {
    const rdt = lastNow ? clamp(now - lastNow, 0, 50) : 16.7;
    lastNow = now;
    const k = (rdt / (1000 / 60)) * scale;     // effect frames this draw, through the hit-stop and slow motion
    clock += rdt;
    const t = s.t;
    const cw = canvas.width, ch = canvas.height;
    const intro = s.intro > 0 ? (INTRO - s.intro + alpha) / TPS : null;
    if (s.over && overAt < 0) { overAt = clock; overSeen = { winner: s.winner, why: s.why }; }
    const outro = overAt >= 0 ? clock - overAt : -1;

    const bodies = [];
    for (let side = 0; side < 2; side++) {
      const f = activeOf(s, side);
      // A fallen body is its knockout's to draw: the last KO ends the match in its own tick, still "active", and stood beside its own fall.
      if (f && f.hp > 0 && !(intro != null && intro < LAND)) bodies.push(f);
    }
    const lerp = (f) => [f.px + (f.x - f.px) * alpha, f.py + (f.y - f.py) * alpha];

    // The camera: where it looks, how close, how hard it shakes.
    let tz = 1, tx = W / 2, ty = H / 2;
    if (intro != null) { const u = ease(clamp(intro / 1.3, 0, 1)); tz = 1.45 - 0.45 * u; }
    else if (outro >= 0) {
      const win = overSeen.winner >= 0 ? activeOf(s, overSeen.winner) : null;
      const lost = fx.find((e) => e.k === "corpse");
      if (outro < RESULT_AT && lost && overSeen.why === "knockout") { tz = 1.45; tx = lost.x; ty = lost.y; }
      else if (win) { tz = 1.55; [tx, ty] = lerp(win); }
    } else if (bodies.length === 2) {
      const [ax, ay] = lerp(bodies[0]), [bx, by] = lerp(bodies[1]);
      if (ch > cw) {
        /* UPRIGHT (a phone held tall): the whole court fits only the width, so
           a body was some 30px with empty bands above and below. The camera
           frames the two fighters instead, as a fighting game does - closer
           while they are close, the whole court once they are apart. */
        const fit = Math.min(cw / ((Math.abs(ax - bx) + 7) * px), ch / ((Math.abs(ay - by) + 5) * px));
        tz = clamp(fit, UPRIGHT_MIN, UPRIGHT_ZOOM);
        const k = fit < UPRIGHT_MIN ? (bodies[0].side === me ? 0.7 : 0.3) : 0.5;
        tx = ax * k + bx * (1 - k); ty = ay * k + by * (1 - k);
      } else {
        // A little closer while they are close: the fight fills the screen.
        const d = Math.hypot(ax - bx, ay - by);
        tz = 1 + 0.06 * clamp((7 - d) / 5, 0, 1);
        tx = W / 2 + ((ax + bx) / 2 - W / 2) * 0.5; ty = H / 2 + ((ay + by) / 2 - H / 2) * 0.5;
      }
    }
    if (still) { tz = 1; tx = W / 2; ty = H / 2; }
    const lag = 1 - 0.86 ** (rdt / 16.7);
    cam.z += (tz - cam.z) * lag; cam.x += (tx - cam.x) * lag; cam.y += (ty - cam.y) * lag;
    punch.z *= 0.86 ** (rdt / 16.7);
    const z = cam.z + punch.z;
    const pw = clamp(punch.z / 0.08, 0, 1);
    let fxw = cam.x + (punch.x - cam.x) * pw * 0.5, fyw = cam.y + (punch.y - cam.y) * pw * 0.5;
    // Never past the floor's edge where the screen can be filled.
    const hw = cw / 2 / (z * px), hh = ch / 2 / (z * px);
    const lx = [hw - ox / px, W + ox / px - hw], ly = [hh - oy / px, H + oy / px - hh];
    fxw = lx[0] <= lx[1] ? clamp(fxw, lx[0], lx[1]) : W / 2;
    fyw = ly[0] <= ly[1] ? clamp(fyw, ly[0], ly[1]) : H / 2;
    const sh = cam.trauma * cam.trauma;
    const jx = (rand() * 2 - 1) * sh * px * 0.55 + cam.kx, jy = (rand() * 2 - 1) * sh * px * 0.55 + cam.ky;
    const rot = (rand() * 2 - 1) * sh * 0.012;
    cam.trauma = Math.max(0, cam.trauma - 0.022 * (rdt / 16.7));
    cam.kx *= 0.8 ** (rdt / 16.7); cam.ky *= 0.8 ** (rdt / 16.7);
    view.z = z; view.x = fxw; view.y = fyw;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0b1124";
    ctx.fillRect(0, 0, cw, ch);
    ctx.translate(cw / 2 + jx, ch / 2 + jy);
    ctx.rotate(rot);
    ctx.scale(z, z);
    ctx.translate(-sx(fxw), -sy(fyw));
    if (floor) ctx.drawImage(floor, ox, oy);

    // 0. Marks on the floor, fading.
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i], age = clock - m.born;
      if (age > MARK_LIFE) { marks.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = age < MARK_LIFE - MARK_FADE ? 1 : (MARK_LIFE - age) / MARK_FADE;
      ctx.translate(sx(m.x), sy(m.y)); ctx.rotate(m.rot);
      const w = (m.len || m.size) * px, h2 = m.size * px;
      ctx.imageSmoothingEnabled = true;
      if (m.len) ctx.drawImage(m.cv, -w / 2, -h2 / 2, w, h2);
      else ctx.drawImage(m.cv, -w / 2, -w / 2 * 0.75, w, w * 0.75);
      ctx.restore();
    }

    // 0. The zones: a ring each, filling as someone holds it, its reward written in.
    const zn = s.zone;
    [[W / 2, INSET + 2.1], [W / 2, H - INSET - 2.1]].forEach(([zx, zy], kz) => {
      ctx.save();
      ctx.translate(sx(zx), sy(zy));
      const r = 1.3 * px;
      if (zn.open) {
        const pulse = 0.5 + 0.5 * Math.sin(clock / 170);
        ctx.globalAlpha = 0.22 + 0.12 * pulse; ctx.fillStyle = "#45d4ff";
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = "#9fe9ff"; ctx.lineWidth = Math.max(2, px / 9);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        for (let side = 0; side < 2; side++) {
          const held = zn.hold[kz][side] / TPS;
          if (held <= 0) continue;
          ctx.strokeStyle = side === me ? "#5fe08a" : "#ff9d52"; ctx.lineWidth = Math.max(3, px / 6);
          ctx.beginPath(); ctx.arc(0, 0, r + px * 0.18, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, held)); ctx.stroke();
        }
        ctx.globalAlpha = 0.95; ctx.fillStyle = "#e9faff";
        ctx.font = `700 ${Math.max(9, Math.round(px * 0.3))}px "Chakra Petch", Rubik, sans-serif`; ctx.textAlign = "center";
        ctx.fillText(ZONE_SAYS[ground.zone], 0, px * 0.12);
      } else {
        ctx.globalAlpha = 0.25; ctx.strokeStyle = "#9fe9ff"; ctx.lineWidth = Math.max(1, px / 14); ctx.setLineDash([px * 0.3, px * 0.25]);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.6; ctx.fillStyle = "#e9faff";
        ctx.font = `700 ${Math.max(9, Math.round(px * 0.3))}px "Chakra Petch", Rubik, sans-serif`; ctx.textAlign = "center";
        ctx.fillText(`Opens in ${Math.ceil(zn.t / TPS)}`, 0, px * 0.12);
      }
      ctx.restore();
    });
    // Falling rock (Mt. Moon): a shadow that grows, then the rock.
    for (const r of s.drops) {
      const kk = 1 - r.t / Math.round(1.2 * TPS);
      ctx.save(); ctx.globalAlpha = 0.25 + 0.45 * kk; ctx.fillStyle = "#1a1410";
      ctx.beginPath(); ctx.ellipse(sx(r.x), sy(r.y), px * (0.4 + 0.75 * kk), px * (0.25 + 0.45 * kk), 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = "#ffb37a"; ctx.lineWidth = Math.max(2, px / 10);
      ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), px * 1.45, 0, TAU * kk); ctx.stroke();
      if (kk > 0.7) {
        const fall = (1 - kk) / 0.3;
        ctx.fillStyle = "#8a7a68"; ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y) - fall * px * 4, px * 0.45, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // 0. Hazards on the ground: spikes, rocks, toxic spikes, a web.
    for (const zz of s.hazards) {
      const colour = colourOf(zz.move), fade = Math.min(1, zz.t / 60);
      ctx.save(); ctx.globalAlpha = 0.85 * fade;
      ctx.translate(sx(zz.x), sy(zz.y));
      if (zz.kind === "sticky-web") {
        ctx.strokeStyle = "rgba(240,240,255,0.8)"; ctx.lineWidth = Math.max(1, px / 14);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * px * 1.1, Math.sin(a) * px * 1.1); ctx.stroke(); }
        for (const r of [0.4, 0.75, 1.05]) { ctx.beginPath(); ctx.arc(0, 0, r * px, 0, TAU); ctx.stroke(); }
      } else {
        const art = arenaArt(slugOf(zz.move))?.shot;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + zz.id, r = (i % 2 ? 0.55 : 0.25) * px;
          if (!drawArt(art, Math.cos(a) * r, Math.sin(a) * r, Math.max(1, px / 18), 0, 0, fade)) {
            ctx.fillStyle = colour; ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r - px * 0.22);
            ctx.lineTo(Math.cos(a) * r - px * 0.16, Math.sin(a) * r + px * 0.12);
            ctx.lineTo(Math.cos(a) * r + px * 0.16, Math.sin(a) * r + px * 0.12); ctx.fill();
          }
        }
        ctx.globalAlpha = 0.25 * fade; ctx.strokeStyle = colour; ctx.lineWidth = Math.max(1, px / 12);
        ctx.beginPath(); ctx.arc(0, 0, 1.1 * px, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }

    // 1. Telegraphs on the ground, under everything.
    for (const f of bodies) {
      const a = f.act;
      if (!a || a.ph !== "wind" || a.k === BASIC_K) continue;
      const [x, y] = lerp(f);
      const m = moveAt(f, a.k), colour = colourOf(m.i);
      const kk = 1 - a.t / Math.max(1, a.t0);
      const ang = Math.atan2(a.dy, a.dx);
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.4 * kk;
      ctx.fillStyle = colour; ctx.strokeStyle = colour;
      ctx.translate(sx(x), sy(y));
      if (a.shape === "shot" || a.shape === "multi" || a.shape === "beam" || a.shape === "dash") {
        const len = (a.shape === "beam" ? 10 : a.shape === "dash" ? 3.6 : 9) * px;
        const wd = (a.shape === "beam" ? 1.1 : a.shape === "dash" ? 1 : 0.7) * px;
        ctx.rotate(ang);
        ctx.fillRect(0, -wd / 2, len, wd);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(0, -wd / 2, len * kk, wd);
        // Chevrons running down the lane: where it will go.
        ctx.globalAlpha = 0.5 * kk; ctx.fillStyle = "#ffffff";
        for (let d = (clock / 9) % (px * 1.2); d < len; d += px * 1.2) {
          ctx.beginPath(); ctx.moveTo(d, -wd * 0.3); ctx.lineTo(d + px * 0.3, 0); ctx.lineTo(d, wd * 0.3); ctx.lineTo(d + px * 0.12, 0); ctx.fill();
        }
      } else if (a.shape === "melee") {
        const r = 1.95 * px;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, ang - 0.88, ang + 0.88); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(2, px / 7);
        ctx.beginPath(); ctx.arc(0, 0, r * kk, ang - 0.88, ang + 0.88); ctx.stroke();
      } else if (a.shape === "pulse") {
        ctx.beginPath(); ctx.arc(0, 0, 3.05 * px, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.lineWidth = Math.max(2, px / 7);
        ctx.beginPath(); ctx.arc(0, 0, 3.05 * px * kk, 0, TAU); ctx.stroke();
      } else {
        // A self move or a hazard: a gathering glow at the user's feet.
        ctx.globalAlpha = 0.5 * kk; ctx.lineWidth = Math.max(2, px / 8);
        ctx.beginPath(); ctx.arc(0, 0, px * (1.2 - 0.6 * kk), 0, TAU); ctx.stroke();
      }
      ctx.restore();
      /* THE CHARGE: a rune turning at its feet - two rings, opposite ways, and
         six marks between - that brightens to the release. */
      if (!still) {
        ctx.save();
        ctx.translate(sx(x), sy(y + 0.38)); ctx.scale(1, 0.42);
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = colour; ctx.fillStyle = colour;
        ctx.globalAlpha = 0.3 + 0.55 * kk; ctx.lineWidth = Math.max(2, px / 9);
        ctx.rotate(clock / 260);
        ctx.setLineDash([px * 0.42, px * 0.18]); ctx.beginPath(); ctx.arc(0, 0, px * 1.3, 0, TAU); ctx.stroke();
        ctx.rotate(-clock / 130);
        ctx.setLineDash([px * 0.14, px * 0.26]); ctx.beginPath(); ctx.arc(0, 0, px * 0.9, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < 6; i++) { const r2 = (i / 6) * TAU; ctx.fillRect(Math.cos(r2) * px * 1.1 - px * 0.06, Math.sin(r2) * px * 1.1 - px * 0.06, px * 0.12, px * 0.12); }
        ctx.restore();
      }
      // The body gathers its colour: motes drawn in, a glow that swells, a flare just before.
      if (rand() < 1.4 * k * (0.4 + kk)) {
        const a2 = rand() * TAU, r = 1.1 + rand() * 0.7;
        part({ k: "glow", x: x + Math.cos(a2) * r, y: y - 0.3 + Math.sin(a2) * r, vx: -Math.cos(a2) * r / 12, vy: -Math.sin(a2) * r / 12, colour: rand() < 0.25 ? "#ffffff" : colour, life: 12, size: 0.13, drag: 1 });
      }
      glow(sx(x), sy(y - 0.3), px * (0.55 + 0.8 * kk), colour, 0.2 + 0.4 * kk);
      if (kk > 0.82) glow(sx(x), sy(y - 0.3), px * 0.5, "#ffffff", 0.5 * (kk - 0.82) / 0.18);
    }

    // 2. Bodies: shadow, afterimages, the walking sprite, its status and flash.
    ghostAcc += k;
    for (const f of bodies) {
      const [x, y] = lerp(f);
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(sx(x), sy(y + 0.42), px * 0.6, px * 0.22, 0, 0, TAU); ctx.fill();
      ctx.restore();
      const lunging = f.act?.shape === "dash" && f.act.ph === "act";
      if ((f.dodge > 0 || lunging || (f.surge > 0 && f.moving)) && ghostAcc >= 2) {
        const tint = lunging ? colourOf(moveAt(f, f.act.k).i) : f.surge > 0 ? colours[TYPES[f.types[0]]] : f.dodge > 0 ? "#9fe9ff" : null;
        ghosts.push({ x, y, f: poseOf(f.side, f.slot).fr ?? { frame: frameOf(f, t) }, id: f.id, side: f.side, slot: f.slot, life: lunging ? 10 : 14, t: 0, tint });
      }
      if (lunging && rand() < k) { const [vx, vy] = [-f.act.dx * 0.12, -f.act.dy * 0.12]; part({ k: "streak", x: x + (rand() - 0.5) * 0.6, y: y - 0.3 + (rand() - 0.5) * 0.6, vx, vy, colour: "#ffffff", life: 9, size: 0.7, drag: 0.9 }); }
    }
    if (ghostAcc >= 2) ghostAcc = 0;
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      if ((g.t += k) > g.life) { ghosts.splice(i, 1); continue; }
      sprite(g.id, g.side, g.slot, g.x, g.y, g.f, 0.4 * (1 - g.t / g.life), g.tint);
    }
    for (const f of bodies) {
      const [x, y] = lerp(f);
      const p = poseOf(f.side, f.slot);
      settle(p, k);
      if (p.jit > 0) p.jit -= rdt;
      const blink = f.inv > 0 && !f.dodge && !f.shield && Math.floor(clock / 66) % 2;
      // A wind-up crouches and leans back; the blow itself leans in.
      let lean = f.act?.ph === "act" || (f.act?.ph === "rec" && f.act.shape === "melee") ? 0.18 : 0;
      let csx = 1, csy = 1;
      if (f.act?.ph === "wind") { const kk = 1 - f.act.t / Math.max(1, f.act.t0); lean = -0.12 * kk; csx = 1 + 0.12 * kk; csy = 1 - 0.12 * kk; }
      const won = outro > RESULT_AT && f.side === overSeen?.winner;
      const fr = poseNow(f, p, k, won, t);
      // A PMD sheet hops in its own frames; the follower art is lifted instead.
      const hop = won && !atlasOf(f.id, shiny[f.side]?.[f.slot]) ? Math.abs(Math.sin((outro - RESULT_AT) / 170)) * 0.45 : 0;
      if (intro != null && intro < LAND + 0.35) { const u = clamp((intro - LAND) / 0.35, 0, 1); csx *= back(u); csy *= back(u); }
      if (f.wading) {
        ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = "#bff3ff"; ctx.lineWidth = Math.max(1, px / 12);
        const kk = (clock % 500) / 500;
        ctx.beginPath(); ctx.ellipse(sx(x), sy(y + 0.4), px * (0.5 + 0.4 * kk), px * (0.18 + 0.12 * kk), 0, 0, TAU); ctx.stroke(); ctx.restore();
      }
      if (f.heat > 0) glow(sx(x), sy(y), px * 1.1, "#ff5a2a", 0.25 + 0.4 * (f.heat / TPS));
      if (f.swift > 0) glow(sx(x), sy(y), px * 0.9, "#7dffd8", 0.25);
      if (ground.ice && f.moving && rand() < k / 4) part({ k: "dot", x, y: y + 0.35, vx: 0, vy: 0, colour: "#e8fbff", life: 18, size: 0.12 });
      if (!ground.ice && f.moving && !f.wading && rand() < k / 14) dust(x, y, 1);
      // In tall grass: yours shows faint (you know where you are), the foe's barely.
      const hid = f.hidden ? (f.side === me ? 0.5 : 0.12) : 1;
      const jit = p.jit > 0 && !still ? [(rand() - 0.5) * 0.14, (rand() - 0.5) * 0.1] : [0, 0];
      const surging = f.surge > 0;
      const tcol = colours[TYPES[f.types[0]]] ?? "#ffd23f";
      const at = { x: x + f.fx * lean + p.ox + jit[0], y: y + f.fy * lean + p.oy + jit[1] - hop, sx: p.sx * csx, sy: p.sy * csy, tilt: p.tilt };
      if (surging) {
        // The surge's aura: the body's own outline in its type's colour, flickering, and its colour rising off it.
        glow(sx(at.x), sy(at.y - 0.3), px * 1.3, tcol, 0.3 + 0.15 * Math.sin(clock / 60));
        aura(f, at, fr, tcol, hid);
        if (rand() < 0.8 * k) part({ k: "glow", x: at.x + (rand() - 0.5) * 0.8, y: at.y + 0.1, vx: 0, vy: -0.03 - rand() * 0.02, colour: tcol, life: 24, size: 0.12, drag: 0.98 });
      }
      sprite(f.id, f.side, f.slot, at.x, at.y, fr, (blink ? 0.45 : 1) * hid, f.flash > 0 ? "#ffffff" : null, at);
      if (p.tintT > 0 && p.tint && f.flash <= 0) sprite(f.id, f.side, f.slot, at.x, at.y, fr, 0.55 * (p.tintT / 12) * hid, p.tint, at);
      if (f.hidden) {
        ctx.save(); ctx.fillStyle = "rgba(40,110,45,0.85)";
        const sway = Math.sin(clock / 300) * 0.04;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(sx(x + i * 0.22), sy(y + 0.45)); ctx.lineTo(sx(x + i * 0.22 + 0.08 + sway), sy(y - 0.25)); ctx.lineTo(sx(x + i * 0.22 + 0.16), sy(y + 0.45)); ctx.fill(); }
        ctx.restore();
      }
      statusOn(f, x, y, k);
      if (f.shield > 0) {
        ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.abs(Math.sin(clock / 100));
        ctx.strokeStyle = "#9fe3ff"; ctx.lineWidth = Math.max(2, px / 8);
        ctx.fillStyle = "rgba(160,230,255,0.15)";
        ctx.beginPath(); ctx.arc(sx(x), sy(y - 0.3), px * 1.25, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }

    // 2b. Cover, over the bodies' feet: its material, cracking as it weakens, wobbling when struck.
    const pic = img(coverPath);
    for (const c of s.cover) {
      if (c.hp <= 0) continue;
      const w = covShake.get(c.id) ?? 0;
      const wob = w > 0 ? Math.sin(clock / 22) * w * px * 0.08 : 0;
      if (w > 0) covShake.set(c.id, Math.max(0, w - 0.06 * k));
      drawCover(ctx, ground.cover, sx(c.x) + wob, sy(c.y), 1.2 * px, c.hp / c.max, t, pic);
    }

    // 3. Shots: glow, trail, the move's own sprite turned along its path.
    const live = new Set();
    for (const p of s.shots) {
      live.add(p.id);
      const x = p.x - p.dx * (10 / TPS) * (1 - alpha), y = p.y - p.dy * (10 / TPS) * (1 - alpha);
      const bas = isBasic(p.move), colour = tintOf(p.move, s, p.side);
      const tr = trails.get(p.id) ?? [];
      tr.push([x, y]); if (tr.length > (bas ? 6 : 12)) tr.shift();
      trails.set(p.id, tr);
      tr.forEach(([qx, qy], n) => glow(sx(qx), sy(qy), px * (bas ? 0.1 + 0.04 * n : 0.18 + 0.07 * n), colour, 0.07 + 0.05 * n));
      glow(sx(x), sy(y), px * (bas ? 0.6 : 1.15), colour, 0.65);
      if (!bas) glow(sx(x), sy(y), px * 0.4, "#ffffff", 0.55);
      if (rand() < (bas ? 0.35 : 1.1) * k) trailBit(bas ? typeAt(s, p.side) : typeOf(p.move), x, y, p.dx, p.dy, colour);
      const art = arenaArt(slugOf(p.move))?.shot;
      if (!drawArt(art, sx(x), sy(y), Math.max(1, px / 12), Math.atan2(p.dy, p.dx), clock / 16.7)) {
        // No sprite (a basic bolt): a comet - a bright head and a tapered tail along its path.
        const r = px * (bas ? (p.boost ? 0.3 : 0.2) : 0.32), ang = Math.atan2(p.dy, p.dx);
        ctx.save(); ctx.translate(sx(x), sy(y)); ctx.rotate(ang);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = colour; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 4, -r * 0.6); ctx.lineTo(-r * 4, r * 0.6); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
    for (const id of trails.keys()) if (!live.has(id)) trails.delete(id);

    // 4. Melee swings: a bright smear that sweeps across the blow's reach.
    for (const f of bodies) {
      const a = f.act;
      if (!a || a.shape !== "melee" || (a.ph !== "act" && !(a.ph === "rec" && a.t > 2))) continue;
      const [x, y] = lerp(f);
      const bas = a.k === BASIC_K;
      const colour = tintOf(moveAt(f, a.k).i, s, f.side);
      const ang = Math.atan2(a.dy, a.dx), r = (bas ? 1.25 : 1.7) * px;
      const sweep = Math.min(1, a.ph === "act" ? 1 - a.t / 6 : 1);
      ctx.save();
      ctx.translate(sx(x), sy(y - 0.2));
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const [w, c, al] of bas ? [[0.36, colour, 0.5], [0.1, "#fff", 0.95]] : [[0.9, colour, 0.3], [0.5, colour, 0.8], [0.16, "#fff", 0.95]]) {
        ctx.strokeStyle = c; ctx.globalAlpha = al; ctx.lineWidth = px * w;
        ctx.beginPath(); ctx.arc(0, 0, r, ang - 0.95, ang - 0.95 + 1.9 * sweep); ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Matter and effects over everything.
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if ((p.t += k) > p.life) { if (p.splash && !still) mark("wet", p.x, p.y, 0.35); parts.splice(i, 1); continue; }
      if (p.t < 0) continue;
      stepPart(p, k);
      drawPart(p);
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      if ((e.t += k) > e.life) {
        if (e.k === "corpse") { for (let n = 0; n < 8; n++) part({ k: "smoke", x: e.x + (rand() - 0.5) * 0.8, y: e.y + (rand() - 0.5) * 0.4, vx: (rand() - 0.5) * 0.02, vy: -0.01, colour: "rgba(230,230,240,", life: 40, size: 0.45 }); }
        fx.splice(i, 1); continue;
      }
      if (e.t < 0) continue;
      drawFx(e);
    }
    // 6. The air over the floor.
    weather(k);
    for (let i = air.length - 1; i >= 0; i--) {
      const a = air[i];
      if ((a.t += k) > a.life) { air.splice(i, 1); continue; }
      drawAir(a, k);
    }

    // ------------------------------------------------ screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    screen(s, k, intro, outro);
  }

  function stepPart(p, k) {
    const d = p.drag ** k;
    p.vx *= d; p.vy *= d;
    if (p.lift) p.vy -= p.lift * k;
    if (p.wob) p.x += Math.sin((p.t + p.rot * 10) / 6) * 0.006 * k;
    p.x += p.vx * k; p.y += p.vy * k;
    if (p.g) {
      p.vz -= p.g * k; p.z += p.vz * k;
      if (p.z < 0) {
        p.z = 0;
        if (p.bounce > 0) { p.vz = -p.vz * 0.38; p.vx *= 0.6; p.vy *= 0.6; p.bounce--; }
        else { p.vz = 0; p.vx *= 0.4; p.vy *= 0.4; p.g = 0; p.vr = 0; }
      }
    }
    p.rot += p.vr * k;
  }
  function drawPart(p) {
    const kk = p.t / p.life, a = 1 - kk;
    const x = sx(p.x), y = sy(p.y - p.z), s = p.size * px;
    ctx.save();
    if (p.k === "glow") {
      ctx.restore();
      glow(x, y, s * (1 + kk * 0.5) * 2.2, p.colour, 0.85 * a);
      return;
    }
    if (p.z > 0.02 && (p.k === "chunk" || p.k === "shard" || p.k === "dot")) {
      ctx.globalAlpha = 0.3 * a; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(sx(p.x), sy(p.y), s * 0.6, s * 0.25, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.colour; ctx.strokeStyle = p.colour;
    if (p.k === "dot") { ctx.fillRect(x - s / 2, y - s / 2, s, s); }
    else if (p.k === "streak") {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = Math.max(1, px * 0.07 * a); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * px * 6 * p.size * 2, y - p.vy * px * 6 * p.size * 2); ctx.stroke();
    } else if (p.k === "shard") {
      ctx.translate(x, y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.4, s * 0.5); ctx.lineTo(-s * 0.4, s * 0.5); ctx.closePath(); ctx.fill();
    } else if (p.k === "leaf") {
      ctx.translate(x, y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.42, 0, 0, TAU); ctx.fill();
    } else if (p.k === "chunk") {
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.translate(x, y); ctx.rotate(p.rot);
      ctx.fillRect(-s / 2, -s / 2, s, s * 0.8);
      ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(-s / 2, -s / 2, s, s * 0.22);
    } else if (p.k === "bubble") {
      ctx.lineWidth = Math.max(1, px / 18);
      ctx.beginPath(); ctx.arc(x, y, s * (0.7 + kk * 0.5), 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * 0.25; ctx.fill();
    } else if (p.k === "smoke") {
      ctx.fillStyle = `${p.colour}${(0.35 * a).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, s * (0.6 + kk * 1.4), 0, TAU); ctx.fill();
    } else if (p.k === "star") {
      ctx.globalCompositeOperation = "lighter";
      const r = s * (0.6 + 0.4 * Math.sin(p.t / 2));
      ctx.translate(x, y); ctx.rotate(p.rot);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.25 : r; ctx.lineTo(Math.cos((i / 8) * TAU) * rr, Math.sin((i / 8) * TAU) * rr); }
      ctx.closePath(); ctx.fill();
    } else if (p.k === "bolt") {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = Math.max(1.5, px * 0.08); ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(x, y);
      let bx = x, by = y;
      for (let i = 1; i <= 5; i++) {
        const d = (i / 5) * p.len * px, j = (rand() - 0.5) * px * 0.35;
        bx = x + Math.cos(p.ang) * d - Math.sin(p.ang) * j; by = y + Math.sin(p.ang) * d + Math.cos(p.ang) * j;
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, px * 0.03); ctx.stroke();
    } else if (p.k === "ring") {
      const r = Math.max(1, (p.size + (p.grow ?? 0) * p.t) * px);
      ctx.lineWidth = Math.max(1.5, px * 0.12 * a);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    } else if (p.k === "slash") {
      ctx.globalCompositeOperation = "lighter";
      const l = p.len * px * Math.min(1, kk * 3);
      ctx.translate(x, y); ctx.rotate(p.ang);
      ctx.lineCap = "round";
      ctx.lineWidth = px * 0.22 * a; ctx.strokeStyle = "#1a0a2a"; ctx.globalCompositeOperation = "source-over";
      ctx.beginPath(); ctx.moveTo(-l / 2, 0); ctx.quadraticCurveTo(0, -px * 0.3, l / 2, 0); ctx.stroke();
      ctx.lineWidth = px * 0.08 * a; ctx.strokeStyle = p.colour;
      ctx.beginPath(); ctx.moveTo(-l / 2, 0); ctx.quadraticCurveTo(0, -px * 0.3, l / 2, 0); ctx.stroke();
    } else if (p.k === "burst") {
      // A comic impact star: the blow's shape, for a frame or two.
      ctx.globalCompositeOperation = "lighter";
      const r = p.size * px * (0.6 + kk * 0.6);
      ctx.translate(x, y); ctx.rotate(p.rot);
      const star = (rad) => {
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const rr = i % 2 ? rad * 0.45 : rad * (0.8 + ((i * 7) % 5) / 10); ctx.lineTo(Math.cos((i / 16) * TAU) * rr, Math.sin((i / 16) * TAU) * rr); }
        ctx.closePath(); ctx.fill();
      };
      star(r);
      ctx.fillStyle = "#fff"; ctx.globalAlpha = a * 0.8; star(r * 0.5);
    } else if (p.k === "arc") {
      ctx.lineWidth = Math.max(1.5, px * 0.08); ctx.lineCap = "round";
      const r = p.size * px * (0.6 + kk);
      ctx.beginPath(); ctx.arc(x, y, r, p.ang - 0.5, p.ang + 0.5); ctx.stroke();
    }
    ctx.restore();
  }
  function drawAir(a, k) {
    const x = sx(a.x), y = sy(a.y);
    const kk = a.t / a.life;
    ctx.save();
    if (a.k === "ember") {
      a.x += a.vx * k + Math.sin(a.t / 9) * 0.004 * k; a.y += a.vy * k;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.sin(kk * Math.PI) * (0.6 + 0.4 * Math.sin(a.t / 3));
      ctx.fillStyle = kk < 0.5 ? "#ffcf6a" : "#ff6a2a";
      const s = a.size * px; ctx.fillRect(x - s / 2, y - s / 2, s, s);
    } else if (a.k === "snow") {
      a.x += (a.vx + Math.sin(a.t / 40 + a.ph) * 0.006) * k; a.y += a.vy * k;
      if (a.y > H + 0.5) a.t = a.life;
      ctx.globalAlpha = 0.8; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(x, y, a.size * px, 0, TAU); ctx.fill();
    } else if (a.k === "rain") {
      const fall = kk * 1.4;
      ctx.globalAlpha = 0.28; ctx.strokeStyle = "#cfe8ff"; ctx.lineWidth = Math.max(1, px / 28);
      ctx.beginPath(); ctx.moveTo(x - fall * px * 0.5, y + fall * px); ctx.lineTo(x - (fall + 0.25) * px * 0.5, y + (fall + 0.5) * px); ctx.stroke();
      if (a.t + k > a.life) { ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.ellipse(x - 0.7 * px * 0.5, y + 1.4 * px, px * 0.12, px * 0.05, 0, 0, TAU); ctx.stroke(); }
    } else if (a.k === "mote") {
      a.x += a.vx * k; a.y += a.vy * k;
      if (a.x > W + 0.5) a.t = a.life;
      ctx.globalAlpha = Math.sin(Math.min(1, kk * 4) * Math.PI / 2) * (a.glint ? 0.5 + 0.5 * Math.sin(a.t / 8) : 0.35);
      ctx.fillStyle = a.glint ? "#bfe0ff" : "#ffffff";
      ctx.beginPath(); ctx.arc(x, y, a.size * px, 0, TAU); ctx.fill();
    } else if (a.k === "bulb") {
      ctx.restore();
      glow(x, y, px * 0.5 * (1 - kk), "#ffffff", 0.9 * (1 - kk));
      return;
    }
    ctx.restore();
  }
  function drawFx(e) {
    const kk = e.t / e.life;
    if (e.k === "burst") {
      glow(sx(e.x), sy(e.y), px * (0.6 + 1.2 * kk), e.colour, 0.7 * (1 - kk));
      drawArt(e.art, sx(e.x), sy(e.y), Math.max(1, px / 11) * (1 + 0.4 * kk), 0, e.t, 1 - kk * kk);
    } else if (e.k === "beam") {
      // A beam: a wide glow, a white core, and the move's sprite laid down it.
      const ang = Math.atan2(e.dy, e.dx), len = e.len * px, wide = px * (1 - kk) * (still ? 1 : 0.85 + rand() * 0.35);
      ctx.save(); ctx.translate(sx(e.x), sy(e.y)); ctx.rotate(ang);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 * (1 - kk); ctx.fillStyle = e.colour; ctx.fillRect(0, -wide, len, wide * 2);
      ctx.globalAlpha = 0.95 * (1 - kk); ctx.fillStyle = "#fff"; ctx.fillRect(0, -wide * 0.3, len, wide * 0.6);
      ctx.restore();
      if (e.art) for (let d = 0.6; d < e.len; d += 0.8) drawArt(e.art, sx(e.x + e.dx * d), sy(e.y + e.dy * d), Math.max(1, px / 14), ang, e.t + d * 7, 1 - kk);
      glow(sx(e.x + e.dx * e.len), sy(e.y + e.dy * e.len), px * 1.2, e.colour, 0.6 * (1 - kk));
    } else if (e.k === "call") {
      // The move's name: punched in over its user, slanted, then lifting away.
      const pop = e.t < 6 ? back(e.t / 6) : 1, fade = kk > 0.72 ? (1 - kk) / 0.28 : 1;
      const size = Math.max(11, Math.round(px * 0.48));
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(sx(e.x), sy(e.y - 1.7 - kk * 0.35)); ctx.scale(pop, pop); ctx.transform(1, 0, -0.18, 1, 0, 0);
      ctx.font = `italic 900 ${size}px ${FACE}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const w = ctx.measureText(e.text).width + size * 1.1;
      ctx.fillStyle = "rgba(8,10,24,0.88)"; ctx.fillRect(-w / 2, -size * 0.72, w, size * 1.44);
      ctx.fillStyle = e.colour; ctx.fillRect(-w / 2, size * 0.56, w, size * 0.16);
      ctx.fillRect(e.mine ? -w / 2 : w / 2 - size * 0.16, -size * 0.72, size * 0.16, size * 1.44);
      ctx.fillStyle = "#ffffff"; ctx.fillText(e.text, 0, 0);
      ctx.restore();
    } else if (e.k === "wave") {
      const r = e.r * px * (0.25 + 0.75 * Math.min(1, kk * 1.6));
      ctx.save(); ctx.globalAlpha = 0.7 * (1 - kk); ctx.strokeStyle = e.colour; ctx.lineWidth = px * 0.35 * (1 - kk * 0.6);
      ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), r, 0, TAU); ctx.stroke(); ctx.restore();
      glow(sx(e.x), sy(e.y), r, e.colour, 0.25 * (1 - kk));
      if (e.art) for (let n = 0; n < 8; n++) {
        const a = (n / 8) * TAU;
        drawArt(e.art, sx(e.x) + Math.cos(a) * r, sy(e.y) + Math.sin(a) * r, Math.max(1, px / 16), 0, e.t, 1 - kk);
      }
    } else if (e.k === "rise" || e.k === "arrow") {
      const y = e.y - kk * 1.3 * (e.k === "arrow" && !e.up ? -1 : 1);
      ctx.save(); ctx.globalAlpha = 1 - kk; ctx.fillStyle = e.colour;
      if (e.k === "rise") { ctx.fillRect(sx(e.x) - px * 0.06, sy(y) - px * 0.18, px * 0.12, px * 0.36); ctx.fillRect(sx(e.x) - px * 0.18, sy(y) - px * 0.06, px * 0.36, px * 0.12); }
      else { ctx.beginPath(); const d = e.up ? -1 : 1; ctx.moveTo(sx(e.x), sy(y) + d * px * 0.2); ctx.lineTo(sx(e.x) - px * 0.15, sy(y) - d * px * 0.05); ctx.lineTo(sx(e.x) + px * 0.15, sy(y) - d * px * 0.05); ctx.fill(); }
      ctx.restore();
    } else if (e.k === "ring") {
      ctx.save(); ctx.globalAlpha = 1 - kk; ctx.strokeStyle = e.colour; ctx.lineWidth = Math.max(2, px / 8);
      ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), px * (e.big ? 0.4 + 2.4 * kk : 0.2 + 0.7 * kk), 0, TAU); ctx.stroke(); ctx.restore();
    } else if (e.k === "ball") {
      // Dropped in from above, it bursts open; called back, it shrinks the body into red.
      const drop = e.out ? 0 : Math.max(0, 1 - kk / 0.35);
      const r = px * 0.32 * (e.out ? 1 - kk : kk < 0.5 ? 1 : 1 - (kk - 0.5) * 2);
      const y = sy(e.y - drop * drop * 2.4);
      ctx.save(); ctx.globalAlpha = 1 - kk * 0.6;
      ctx.translate(sx(e.x), y); ctx.rotate(drop * 6);
      ctx.fillStyle = "#e8413c"; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#f4f4f4"; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "#202020"; ctx.fillRect(-r, -r * 0.1, r * 2, r * 0.2);
      ctx.restore();
      glow(sx(e.x), sy(e.y), px * (0.6 + kk * 1.4), e.out ? "#ff4d4d" : "#ffffff", 0.6 * (1 - kk));
    } else if (e.k === "corpse") {
      // Knocked out: thrown off the last blow, spinning, flashing, gone in a puff.
      const fly = ease(Math.min(1, kk * 1.3));
      const x = e.x + e.dx * fly * 1.6, y = e.y + e.dy * fly * 1.6 - Math.sin(Math.min(1, kk * 1.3) * Math.PI) * 1.1;
      const at = { x, y, sx: 1 - kk * 0.3, sy: 1 - kk * 0.3, tilt: (e.dx >= 0 ? 1 : -1) * kk * TAU * 1.2 };
      const flash = Math.floor(e.t / 3) % 2 === 0;
      sprite(e.id, e.side, e.slot, x, y, e.frame, Math.min(1, (1 - kk) * 2.2), flash ? "#ffffff" : null, at);
    } else if (e.k === "num" || e.k === "word") {
      // A number pops, arcs off the blow and falls; a word rises.
      const pop = e.t < 6 ? 1 + (1 - e.t / 6) * 0.7 : 1;
      const x = e.x + (e.vx ?? 0) * e.t;
      const y = e.k === "num" ? e.y - 0.9 * Math.sin(Math.min(1, kk * 1.6) * Math.PI / 2) + Math.max(0, kk - 0.6) * 0.8 : e.y - kk * 0.5;
      ctx.save();
      ctx.globalAlpha = kk < 0.75 ? 1 : 1 - (kk - 0.75) * 4;
      const size = Math.round(px * (e.k === "num" ? e.size ?? 0.62 : e.big ? 0.62 : 0.48) * pop);
      ctx.font = `${e.k === "num" || e.big ? 900 : 700} ${size}px ${FACE}`;
      ctx.textAlign = "center";
      ctx.translate(sx(x), sy(y));
      if (e.big) ctx.transform(1, 0, -0.15, 1, 0, 0);
      ctx.lineWidth = Math.max(3, size / 4.5); ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(8,10,24,0.92)";
      ctx.strokeText(e.text, 0, 0);
      if (e.k === "num" && (e.crit || e.eff > 1)) {
        const g = ctx.createLinearGradient(0, -size, 0, 0);
        g.addColorStop(0, "#fff6b0"); g.addColorStop(1, e.crit ? "#ff7a2a" : "#ffc21a");
        ctx.fillStyle = g;
      } else ctx.fillStyle = e.colour ?? "#ffffff";
      ctx.fillText(e.text, 0, 0);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------- the screen's own layer

  function screen(s, k, intro, outro) {
    const cw = canvas.width, ch = canvas.height, u = Math.min(cw, ch);
    // A heartbeat at the edges while your Pokemon is nearly down.
    const mine = activeOf(s, me);
    if (mine && mine.hp > 0 && mine.hp / mine.max < 0.25 && !s.over) {
      const beat = still ? 0.5 : Math.max(0, Math.sin(clock / 140)) ** 6 + 0.6 * Math.max(0, Math.sin(clock / 140 - 0.9)) ** 6;
      vignette("rgba(220,30,40,", 0.22 + 0.22 * beat);
    }
    // The final minute: a slow red breath at the edges.
    if (!s.over && intro == null && LIMIT - s.t <= FINAL_T) vignette("rgba(255,60,50,", still ? 0.1 : 0.08 + 0.06 * Math.sin(clock / 400));
    const surger = s.sides.findIndex((sd) => sd.team[sd.active]?.surge > 0);
    if (surger >= 0 && !s.over) vignette(surger === me ? "rgba(255,200,60," : "rgba(255,90,60,", 0.12);
    // The last five seconds, counted in the middle of the floor.
    const left = LIMIT - s.t;
    if (!s.over && intro == null && left > 0 && left <= 5 * TPS) {
      const sec = Math.ceil(left / TPS), f = 1 - (left % TPS) / TPS;
      big(String(sec), cw / 2, ch / 2, u * 0.32 * (1.2 - 0.2 * ease(Math.min(1, f * 4))), "rgba(255,255,255,", 0.22 * (1 - f * 0.6));
    }
    // The combo: hits in a row, in the striker's corner.
    for (let side = 0; side < 2; side++) {
      const cb = combo[side];
      if (cb.n < 2 || clock - cb.at > 1600) continue;
      cb.pop = Math.max(0, cb.pop - 0.12 * k);
      const fade = clamp((1600 - (clock - cb.at)) / 400, 0, 1);
      const ours = side === me;
      const x = ours ? cw * 0.05 : cw * 0.95, y = ch * 0.32, size = u * 0.085 * (1 + cb.pop * 0.5);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(x, y); ctx.transform(1, 0, -0.18, 1, 0, 0);
      ctx.textAlign = ours ? "left" : "right";
      ctx.font = `900 ${Math.round(size)}px ${FACE}`;
      ctx.lineJoin = "round"; ctx.lineWidth = size / 6; ctx.strokeStyle = "rgba(8,10,24,0.9)";
      ctx.strokeText(String(cb.n), 0, 0);
      ctx.fillStyle = cb.n >= 5 ? "#ffd23f" : ours ? "#ffffff" : "#ffb39a";
      ctx.fillText(String(cb.n), 0, 0);
      ctx.font = `800 ${Math.round(size * 0.34)}px ${FACE}`;
      ctx.lineWidth = size / 14;
      ctx.strokeText("HITS", 0, size * 0.42); ctx.fillText("HITS", 0, size * 0.42);
      ctx.restore();
    }
    // The opening.
    if (intro != null) opening(s, intro);
    // Impact frames, cut-ins, stamps.
    for (let i = overlays.length - 1; i >= 0; i--) {
      const o = overlays[i];
      o.t += o.k === "stamp" || o.k === "cut" ? rdtFrames : k;
      if (o.t > o.life) { overlays.splice(i, 1); continue; }
      const kk = o.t / o.life;
      if (o.k === "frame") {
        ctx.save();
        if (o.dark && o.t < 4) {
          ctx.fillStyle = "rgba(6,4,14,0.78)"; ctx.fillRect(0, 0, cw, ch);
          speedLines(o.x, o.y, "rgba(255,255,255,0.85)", 1);
        } else {
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = `rgba(255,255,255,${(0.35 * (1 - kk)).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch);
          ctx.globalCompositeOperation = "source-over";
          speedLines(o.x, o.y, "rgba(10,8,20,0.5)", 1 - kk);
        }
        ctx.restore();
      } else if (o.k === "tint") {
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.3 * (1 - kk); ctx.fillStyle = o.colour; ctx.fillRect(0, 0, cw, ch); ctx.restore();
      } else if (o.k === "cut") cutIn(o, kk);
      else if (o.k === "stamp") stampAt(o.text, o.colour, o.t, o.life, o.sub);
    }
    // The ending.
    if (outro >= 0) {
      const res = overSeen;
      if (outro < RESULT_AT) {
        const t = outro / 16.7;
        if (res.why === "knockout" && outro > 160) stampAt("K.O.", "#ff4d5e", t - 10, 60);
        if (res.why === "time") stampAt("TIME!", "#ffffff", t, 60);
      } else {
        const t = (outro - RESULT_AT) / 16.7;
        const won = res.winner === me, draw = res.winner < 0;
        stampAt(draw ? "DRAW" : won ? "VICTORY" : "DEFEAT", draw ? "#d8deff" : won ? "#ffd23f" : "#9aa5c8", t, Infinity);
        if (won && !still) confetti(k, t);
      }
    }
    drawConfetti(k);
  }
  let rdtFrames = 1;
  const conf = [];
  function confetti(k, t) {
    const cw = canvas.width;
    const rate = t < 90 ? 3 : 0.6;
    let n = rate * k;
    while (n > 0) {
      if (n >= 1 || rand() < n) conf.push({ x: rand() * cw, y: -20, vx: (rand() - 0.5) * 2, vy: 2 + rand() * 3, r: rand() * TAU, vr: (rand() - 0.5) * 0.3, c: ["#ffd23f", "#45d4ff", "#ff6a8a", "#7dffa8", "#ffffff"][rand() * 5 | 0], w: 6 + rand() * 8 });
      n -= 1;
    }
  }
  function drawConfetti(k) {
    for (let i = conf.length - 1; i >= 0; i--) {
      const c = conf[i];
      c.x += c.vx * k * dpr; c.y += c.vy * k * dpr; c.r += c.vr * k; c.vx += Math.sin(c.r) * 0.05;
      if (c.y > canvas.height + 20) { conf.splice(i, 1); continue; }
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.scale(1, Math.cos(c.r * 2));
      ctx.fillStyle = c.c; ctx.fillRect(-c.w * dpr / 2, -c.w * dpr / 4, c.w * dpr, c.w * dpr / 2);
      ctx.restore();
    }
  }
  function vignette(rgb, a) {
    const cw = canvas.width, ch = canvas.height;
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.hypot(cw, ch) / 2);
    g.addColorStop(0, `${rgb}0)`); g.addColorStop(1, `${rgb}${a.toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
  }
  function speedLines(x, y, colour, a) {
    const cw = canvas.width, ch = canvas.height, far = Math.hypot(cw, ch);
    const clear = Math.min(cw, ch) * 0.2;
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = colour;
    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * TAU + rand() * 0.08, w = 0.008 + rand() * 0.018, r0 = clear * (1 + rand() * 0.8);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
      ctx.lineTo(x + Math.cos(ang - w) * far, y + Math.sin(ang - w) * far);
      ctx.lineTo(x + Math.cos(ang + w) * far, y + Math.sin(ang + w) * far);
      ctx.fill();
    }
    ctx.restore();
  }
  function big(text, x, y, size, rgb, a, skew = -0.16) {
    ctx.save();
    ctx.translate(x, y); ctx.transform(1, 0, skew, 1, 0, 0);
    ctx.font = `900 ${Math.round(size)}px ${FACE}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.globalAlpha = a;
    ctx.lineJoin = "round"; ctx.lineWidth = size / 9; ctx.strokeStyle = "rgba(8,10,24,0.95)";
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = `${rgb}1)`;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  // A word slammed onto the screen: in big, landing with a jolt, held, then gone.
  function stampAt(text, colour, t, life, sub = null) {
    if (t < 0) return;
    const cw = canvas.width, ch = canvas.height, u = Math.min(cw, ch);
    const inK = Math.min(1, t / 9);
    const outK = life === Infinity ? 0 : clamp((t - (life - 10)) / 10, 0, 1);
    const size = u * (text.length > 5 ? 0.17 : 0.22) * (1 + (1 - ease(inK)) * 1.4) * (1 + outK * 0.3);
    ctx.save();
    ctx.globalAlpha = inK * (1 - outK);
    ctx.translate(cw / 2, ch / 2); ctx.transform(1, 0, -0.16, 1, 0, 0);
    ctx.font = `900 ${Math.round(size)}px ${FACE}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // A band behind it, the width of the screen.
    if (inK >= 1 || life === Infinity) {
      ctx.save(); ctx.globalAlpha *= 0.55; ctx.fillStyle = "#070a18";
      ctx.fillRect(-cw, -size * 0.55, cw * 2, size * 1.1); ctx.restore();
    }
    ctx.lineJoin = "round"; ctx.lineWidth = size / 8; ctx.strokeStyle = "rgba(8,10,24,0.95)";
    ctx.strokeText(text, 0, 0);
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.55, colour); g.addColorStop(1, colour);
    ctx.fillStyle = g; ctx.fillText(text, 0, 0);
    if (sub) { ctx.font = `700 ${Math.round(size * 0.2)}px ${FACE}`; ctx.fillStyle = "#e9eeff"; ctx.fillText(sub, 0, size * 0.62); }
    ctx.restore();
  }
  // A surge's cut-in: the screen darkens, a band of its colour sweeps across with the Pokemon on it.
  function cutIn(o, kk) {
    const cw = canvas.width, ch = canvas.height, u = Math.min(cw, ch);
    const dir = o.side === me ? 1 : -1;
    const slide = kk < 0.2 ? ease(kk / 0.2) : kk > 0.8 ? 1 + ease((kk - 0.8) / 0.2) : 1;
    const off = (1 - slide) * cw * 1.2 * -dir;
    const hgt = ch * 0.26, y = ch * 0.5;
    ctx.save();
    ctx.fillStyle = `rgba(4,4,12,${(0.5 * Math.sin(Math.min(1, kk * 1.2) * Math.PI)).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch);
    ctx.translate(off, 0);
    ctx.beginPath();
    ctx.moveTo(-cw * 0.2, y - hgt / 2); ctx.lineTo(cw * 1.2, y - hgt / 2 - hgt * 0.35 * dir);
    ctx.lineTo(cw * 1.2, y + hgt / 2 - hgt * 0.35 * dir); ctx.lineTo(-cw * 0.2, y + hgt / 2); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, cw, 0);
    g.addColorStop(0, o.colour); g.addColorStop(0.5, "#0b0f22"); g.addColorStop(1, o.colour);
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    // Streaks running through the band.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 14; i++) {
      const sy2 = y - hgt / 2 + ((i * 53) % 100) / 100 * hgt, l = cw * (0.15 + ((i * 37) % 10) / 30);
      const sx2 = ((clock * 2.4 * dir + i * 197) % (cw * 1.4) + cw * 1.4) % (cw * 1.4) - cw * 0.2;
      ctx.fillRect(sx2, sy2, l, Math.max(1, hgt * 0.012));
    }
    const lead = o.id != null && img(spriteUrl(o.id, o.shiny ? "shiny" : null));
    if (lead) {
      const d = hgt * 1.5;
      ctx.imageSmoothingEnabled = false;
      ctx.save(); ctx.translate(dir > 0 ? cw * 0.26 : cw * 0.74, y);
      if (dir > 0) ctx.scale(-1, 1);
      ctx.drawImage(flat(lead, "rgba(0,0,0,0.5)"), -d / 2 + 8, -d / 2 + 8, d, d);
      ctx.drawImage(lead, -d / 2, -d / 2, d, d);
      ctx.restore();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(off + (dir > 0 ? cw * 0.62 : cw * 0.38), y);
    ctx.transform(1, 0, -0.2, 1, 0, 0);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.round(u * 0.16)}px ${FACE}`;
    ctx.lineJoin = "round"; ctx.lineWidth = u * 0.018; ctx.strokeStyle = "rgba(8,10,24,0.95)";
    ctx.strokeText("SURGE!", 0, 0);
    ctx.fillStyle = "#ffffff"; ctx.fillText("SURGE!", 0, 0);
    ctx.restore();
  }
  // THE OPENING: the VS card, two balls thrown in, the count.
  function opening(s, e) {
    const cw = canvas.width, ch = canvas.height, u = Math.min(cw, ch);
    if (e < 0.25) { ctx.fillStyle = `rgba(4,6,16,${(1 - e / 0.25).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
    // The VS card: two slanted slabs from either side meet in the middle.
    if (e >= VS_IN && e < VS_OUT + 0.3) {
      const into = ease(clamp((e - VS_IN) / (VS_SLAM - VS_IN), 0, 1));
      const away = ease(clamp((e - VS_OUT) / 0.3, 0, 1));
      const hgt = ch * 0.3, y = ch / 2;
      for (let side = 0; side < 2; side++) {
        const dir = side === 0 ? -1 : 1;
        const shift = (1 - into) * cw * 0.7 * dir + away * cw * 0.8 * dir;
        ctx.save();
        ctx.translate(shift, 0);
        ctx.beginPath();
        const slant = hgt * 0.35;
        if (side === 0) { ctx.moveTo(-10, y - hgt / 2); ctx.lineTo(cw / 2 + slant, y - hgt / 2); ctx.lineTo(cw / 2 - slant, y + hgt / 2); ctx.lineTo(-10, y + hgt / 2); }
        else { ctx.moveTo(cw + 10, y - hgt / 2); ctx.lineTo(cw / 2 + slant + 6, y - hgt / 2); ctx.lineTo(cw / 2 - slant + 6, y + hgt / 2); ctx.lineTo(cw + 10, y + hgt / 2); }
        ctx.closePath();
        const tone = side === me ? MINE : THEIRS;
        const g = ctx.createLinearGradient(side === 0 ? 0 : cw, 0, cw / 2, 0);
        g.addColorStop(0, tone); g.addColorStop(1, "#0b0f22");
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = Math.max(2, u * 0.006); ctx.stroke();
        ctx.clip();
        const lead = leads[side] && img(leads[side]);
        if (lead) {
          const d = hgt * 1.25;
          ctx.imageSmoothingEnabled = false;
          ctx.save(); ctx.translate(side === 0 ? cw * 0.3 : cw * 0.7, y + hgt * 0.06);
          if (side === 0) ctx.scale(-1, 1);
          ctx.drawImage(lead, -d / 2, -d / 2, d, d);
          ctx.restore();
        }
        const who = names[side] ?? [];
        ctx.textAlign = side === 0 ? "left" : "right";
        const tx = side === 0 ? cw * 0.04 : cw * 0.96;
        ctx.save(); ctx.translate(tx, y); ctx.transform(1, 0, -0.16, 1, 0, 0);
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = `700 ${Math.round(u * 0.035)}px ${FACE}`;
        ctx.fillText(String(who[0] ?? "").toUpperCase(), 0, -hgt * 0.22);
        ctx.font = `900 ${Math.round(u * 0.065)}px ${FACE}`;
        ctx.lineJoin = "round"; ctx.lineWidth = u * 0.01; ctx.strokeStyle = "rgba(8,10,24,0.9)";
        ctx.strokeText(String(who[1] ?? "").toUpperCase(), 0, hgt * 0.05); ctx.fillStyle = "#ffffff"; ctx.fillText(String(who[1] ?? "").toUpperCase(), 0, hgt * 0.05);
        ctx.font = `700 ${Math.round(u * 0.03)}px ${FACE}`; ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText("●".repeat(sides[side].length), 0, hgt * 0.3);
        ctx.restore();
        ctx.restore();
      }
      if (e >= VS_SLAM && e < VS_OUT + 0.2) {
        const kk = clamp((e - VS_SLAM) / 0.12, 0, 1);
        big("VS", cw / 2 + 3, ch / 2, u * 0.2 * (1 + (1 - kk) * 1.2), "rgba(255,210,63,", (1 - clamp((e - VS_OUT) / 0.2, 0, 1)));
      }
    }
    if (e >= VS_SLAM && e < VS_SLAM + 0.05 && !opening.slammed) { opening.slammed = true; shake(0.5); }
    // The throws: each side's ball arcs in from its edge and bursts where its Pokemon stands.
    if (e >= THROW && e < LAND) {
      const kk = (e - THROW) / (LAND - THROW);
      for (let side = 0; side < 2; side++) {
        const f = s.sides[side].team[s.sides[side].active];
        const from = side === 0 ? -1.5 : W + 1.5;
        const x = from + (f.x - from) * kk, y = f.y + 1 - kk - Math.sin(kk * Math.PI) * 3.2;
        const [qx, qy] = worldToScreen(x, y), r = px * view.z * 0.34;
        ctx.save(); ctx.translate(qx, qy); ctx.rotate(kk * 14);
        ctx.fillStyle = "#e8413c"; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#f4f4f4"; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fill();
        ctx.fillStyle = "#202020"; ctx.fillRect(-r, -r * 0.1, r * 2, r * 0.2);
        ctx.restore();
      }
    }
    if (e >= LAND && !landed) {
      landed = true;
      for (let side = 0; side < 2; side++) {
        const f = s.sides[side].team[s.sides[side].active];
        fx.push({ k: "ring", x: f.x, y: f.y, colour: "#ffffff", t: 0, life: 26, big: true });
        part({ k: "glow", x: f.x, y: f.y - 0.3, colour: "#ffffff", life: 14, size: 1.4 });
        sparks(f.x, f.y - 0.3, "#ffffff", 12, 0.09);
        dust(f.x, f.y, 5);
      }
      shake(0.3);
    }
    // The count.
    COUNT.forEach((at, i) => {
      if (e < at || e >= (COUNT[i + 1] ?? INTRO / TPS)) return;
      const t = (e - at) * 60;
      stampAt(String(3 - i), "#ffffff", t, 27);
      if (!opening[`c${i}`]) { opening[`c${i}`] = true; shake(0.15); }
    });
  }
  opening.slammed = false;

  const view = { z: 1, x: W / 2, y: H / 2 };
  function worldToScreen(x, y) {
    const cw = canvas.width, ch = canvas.height;
    return [cw / 2 + (sx(x) - sx(view.x)) * view.z, ch / 2 + (sy(y) - sy(view.y)) * view.z];
  }

  // A status on the body: its tint and motion, and a chip over its head.
  function statusOn(f, x, y, k) {
    if (f.status === -1) return;
    const st = STATUS[f.status];
    const cx = sx(x), cy = sy(y - 0.3);
    if (f.status === BRN && rand() < k / 6) fx.push({ k: "rise", x: x + (rand() - 0.5) * 0.8, y: y - 0.2, colour: "#ff7a3d", t: 0, life: 24 });
    if (f.status === PSN && rand() < k / 10) part({ k: "bubble", x: x + (rand() - 0.5) * 0.7, y: y - 0.4, vx: 0, vy: -0.015, colour: "#d48cff", life: 30, size: 0.1 });
    if (f.status === PAR && rand() < k / 12) part({ k: "bolt", x: x + (rand() - 0.5) * 0.6, y: y - 0.5, ang: rand() * TAU, len: 0.5, colour: "#fff59a", life: 6 });
    if (f.status === FRZ) {
      ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = "#bff0ff";
      ctx.beginPath(); ctx.arc(cx, cy, px * 0.9, 0, TAU); ctx.fill(); ctx.restore();
    }
    if (f.status === SLP) {
      ctx.save(); ctx.fillStyle = "#e9eeff"; ctx.globalAlpha = 0.9;
      ctx.font = `700 ${Math.round(px * 0.45)}px "Chakra Petch", Rubik, sans-serif`;
      const kk = (clock % 1000) / 1000;
      ctx.fillText("z", cx + px * 0.5, cy - px * (0.6 + kk * 0.5)); ctx.fillText("Z", cx + px * 0.8, cy - px * (1 + kk * 0.4));
      ctx.restore();
    }
    ctx.save();
    const size = Math.round(px * 0.34);
    ctx.font = `700 ${size}px "Chakra Petch", Rubik, sans-serif`;
    const w = ctx.measureText(st.tag).width + size * 0.8;
    ctx.fillStyle = st.colour; ctx.globalAlpha = 0.92;
    ctx.fillRect(cx - w / 2, cy - px * 1.55, w, size * 1.3);
    ctx.fillStyle = "#0b1020"; ctx.textAlign = "center";
    ctx.fillText(st.tag, cx, cy - px * 1.55 + size * 1.02);
    ctx.restore();
  }

  function sheetFrame(art, k) {
    // Which frame of a sprite's own animation, by its GBA ticks (60 a second).
    const frames = art.frames?.length ? art.frames : [[0, 1]];
    const total = frames.reduce((n, f) => n + Math.max(1, f[1]), 0);
    let at = Math.floor(k) % total;
    for (const f of frames) { at -= Math.max(1, f[1]); if (at < 0) return f; }
    return frames[0];
  }
  function drawArt(art, x, y, sc, angle, k, alpha = 1) {
    const im = art && img(art.path);
    if (!im) return false;
    const f = sheetFrame(art, k);
    ctx.save();
    ctx.globalAlpha = alpha * (art.blend ? 0.85 : 1);
    if (art.blend) ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.scale(f[2] ? -sc : sc, f[3] ? -sc : sc);
    ctx.drawImage(im, f[0] * art.w, 0, art.w, art.h, -art.w / 2, -art.h / 2, art.w, art.h);
    ctx.restore();
    return true;
  }
  /* A GLOW is one pre-drawn soft disc per colour (`glowOf`), stamped at its
     size: a fresh radial gradient per glow per frame ran to 100-200 a frame
     in a busy fight (a shot's trail alone is eleven). */
  function glow(x, y, r, colour, a = 0.55) {
    if (!(r > 0) || !(a > 0)) return;
    const prev = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalAlpha = Math.min(1, a); ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glowOf(colour), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = prev; ctx.globalCompositeOperation = op;
  }

  const sheetOf = (id) => { const sheet = followSheet(id); return sheet != null && img(`follow/${sheet}.png`); };
  /* The piece of a PMD atlas a pose shows: [x, y, w, h, offset x, offset y]
     and whether its row is drawn flipped, or null for an empty frame. */
  function pieceOf(meta, fr) {
    let name = fr.anim ?? "Idle";
    let a = meta.a[name];
    while (!a && STAND_IN[name]) { name = STAND_IN[name]; a = meta.a[name]; }
    if (!a) return null;
    const d = a.d, n = d.length, hit = Math.max(1, Math.min(n - 1, a.h ?? Math.floor(n / 2)));
    const at = fr.at ?? 0;
    let i;
    if (fr.anim === "Hop" && fr.prog != null) i = Math.min(n - 1, Math.floor(fr.prog * n));     // a dodge: one hop across the roll
    else if (LOOPS.has(name) || name === "Hop") i = frameAt(d, at, true);                     // walking, standing, charging, the winner's hops
    else if (fr.prog != null && !fr.go) i = Math.min(hit - 1, Math.floor(fr.prog * hit));     // the wind-up: up to the hit frame
    else if (fr.go) i = hit + frameAt(d.slice(hit), at, false);                              // the blow: the hit, then the follow-through
    else i = frameAt(d, at, false);                                                          // a flinch, held on its last frame
    let line = a.r[a.r.length === 8 ? fr.row ?? 0 : 0], flip = false;
    if (typeof line === "number") { flip = true; line = a.r[-1 - line]; }
    const q = line?.[Math.min(i, line.length - 1)];
    if (q == null || q < 0) return null;
    const o = q * 6;
    return [meta.q[o], meta.q[o + 1], meta.q[o + 2], meta.q[o + 3], meta.q[o + 4], meta.q[o + 5], flip];
  }
  /* A TINTED PIECE, made once and kept (least recently used out past
     TINTS): never a whole-atlas copy per colour, and never one scratch
     canvas redrawn per draw - the GPU re-uploads a canvas each time it
     changes, and a flash, a hit's colour, afterimages and a surge's aura
     took a desktop at 4x throttle from 64 fps to 55. */
  const tints = new Map(), TINTS = 240;
  function flatPiece(src, x, y, w, h, colour) {
    // Numbered ONCE for the session: the atlases outlive a match, and a counter per renderer gave a new foe the last one's id - and its silhouette.
    src.tintId ??= ++atlasIds;
    const key = `${src.tintId}|${colour}|${x}|${y}`;
    let c = tints.get(key);
    if (c) { tints.delete(key); tints.set(key, c); return c; }
    c = document.createElement("canvas");
    c.width = w; c.height = h;
    const t = c.getContext("2d");
    t.drawImage(src, x, y, w, h, 0, 0, w, h);
    t.globalCompositeOperation = "source-in";
    t.fillStyle = colour;
    t.fillRect(0, 0, w, h);
    tints.set(key, c);
    if (tints.size > TINTS) tints.delete(tints.keys().next().value);
    return c;
  }
  // A PMD body: its frame's centre stands over the shadow, at the same pixel scale as the follower art.
  function pmdBody(atlas, fr, x, y, alpha, tint, at, grow = 1) {
    const pc = pieceOf(atlas.meta, fr);
    if (!pc) return;
    const [qx, qy, w, h, ox, oy, flip] = pc;
    const sc = (px * 2.6) / 32;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(sx(x), sy(y + 0.42));
    if (at) { ctx.rotate(at.tilt); ctx.scale(at.sx * grow, at.sy * grow); }
    if (flip) ctx.scale(-1, 1);
    const dx = ox * sc, dy = (oy - atlas.meta.f) * sc;
    if (tint) ctx.drawImage(flatPiece(atlas.img, qx, qy, w, h, tint), 0, 0, w, h, dx, dy, w * sc, h * sc);
    else ctx.drawImage(atlas.img, qx, qy, w, h, dx, dy, w * sc, h * sc);
    ctx.restore();
  }
  /* A body. `fr` is its pose (`poseNow`); `tint` draws it flat in one colour
     (the white flash, a hit's colour, an afterimage); `at` is its squash,
     tilt and offset about its feet. */
  function sprite(id, side, slot, x, y, fr, alpha, tint = null, at = null) {
    const atlas = atlasOf(id, shiny[side]?.[slot]);
    if (atlas) { pmdBody(atlas, fr, x, y, alpha, tint, at); return; }
    const frame = fr.frame ?? 0;
    const im = sheetOf(id);
    const size = px * 2.6;
    const row = shiny[side]?.[slot] ? 1 : 0;
    if (!im) {
      ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = tint ?? (side === me ? "#7ad4ff" : "#ff8a7a");
      ctx.beginPath(); ctx.arc(sx(x), sy(y), px * 0.45, 0, TAU); ctx.fill(); ctx.restore();
      return;
    }
    const fw = im.naturalWidth / 8, fh = im.naturalHeight / 2;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    const feet = sy(y) + size * 0.2;
    ctx.translate(sx(x), feet);
    if (at) { ctx.rotate(at.tilt); ctx.scale(at.sx, at.sy); }
    ctx.drawImage(tint ? flat(im, tint) : im, frame * fw, row * fh, fw, fh, -size / 2, -size * 0.92, size, size);
    ctx.restore();
  }
  function aura(f, at, fr, colour, alpha) {
    const flick = 0.55 + 0.45 * Math.sin(clock / 45);
    const atlas = atlasOf(f.id, shiny[f.side]?.[f.slot]);
    if (atlas) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pmdBody(atlas, fr, at.x + dx * 0.035, at.y + dy * 0.035, 0.5 * flick * alpha, colour, at, 1.06);
      ctx.restore();
      return;
    }
    const frame = fr.frame ?? 0;
    const im = sheetOf(f.id);
    if (!im) return;
    const size = px * 2.6, fw = im.naturalWidth / 8, fh = im.naturalHeight / 2;
    const row = shiny[f.side]?.[f.slot] ? 1 : 0;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 * flick * alpha;
    const flatIm = flat(im, colour);
    const feet = sy(at.y) + size * 0.2;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      ctx.save();
      ctx.translate(sx(at.x) + dx * px * 0.09, feet + dy * px * 0.09);
      ctx.rotate(at.tilt); ctx.scale(at.sx * 1.06, at.sy * 1.06);
      ctx.drawImage(flatIm, frame * fw, row * fh, fw, fh, -size / 2, -size * 0.92, size, size);
      ctx.restore();
    }
    ctx.restore();
  }

  return {
    resize, take,
    draw(s, alpha, now) { draw(s, alpha, now); },
    /* THE MATCH'S TIME SCALE this frame: 0 while a hit holds the frame, a
       fraction in slow motion. The page multiplies its tick clock by it (an
       online match does not: both ends must step together). */
    rate(dt, live = false) {
      rdtFrames = dt / (1000 / 60);
      /* Online the match never holds, so neither may the bodies' animation:
         a surge's hold slid a running body 420 ms in one frozen frame. */
      if (live) { stopMs = slowMs = 0; slowK = 1; scale = 1; return 1; }
      if (stopMs > 0) { stopMs -= dt; scale = 0; }
      else if (slowMs > 0) { slowMs -= dt; scale = slowK; if (slowMs <= 0) slowK = 1; }
      else scale = 1;
      return scale;
    },
    // The ending has played: the result card may come up.
    done: () => overAt >= 0 && clock - overAt > DONE_AT,
    // Where a body is on screen, in CSS pixels - for aiming with the mouse.
    toScreen: (x, y) => { const [a, b] = worldToScreen(x, y); return [a / dpr, b / dpr]; },
    tile: () => (px * view.z) / dpr,
  };
}
