/* THE MOVE ANIMATION PLAYER (docs/battles.md, Art, phase 7).

   `tools/build_anims.py` compiled every move's own animation script from
   pokeemerald-expansion into a timeline (src/data/anims.js): sprites with a
   sheet, a frame sequence, a scale/rotation table and a motion, and events
   for the Pokemon themselves, the colours and the background. This plays one
   over the fight's scene:

     - sprites on a <canvas> laid over the scene (z 1: over the mons, under
       the health boxes), in GBA pixels mapped onto where the two mons really
       stand, mirrored when the foe is the attacker - the scripts are written
       for the player's side, as the games mirror them;
     - the mons' shakes, lunges, slides, scales, tilts, blinks and tints as
       Web Animations on each mon's sprite (never on `.ft-mon`, whose own
       entrance and faint are CSS);
     - backgrounds on a layer between the ground and the mons, fading in and
       out; the background's own tint (Thunderbolt's dark, Earthquake's) on
       a layer just over it, and flashes over the mons and under the boxes.

   Time is the games' 60 frames a second, times the speed (`quick` doubles
   it), and a timeline past `ANIM_MAX` is played faster, then cut there. The
   data is its own lazy chunk: the League page never waits for it. */

export const ANIM_MAX = 2.6;      // seconds; longer timelines speed up to 2.5x, then are cut
export const SPEEDS = { full: 1, quick: 2 };
const FPS = 60;
const GBA_W = 240;
const WAVE = 134;                 // frames AnimTask_CreateSurfWave runs (26 in, 82 held, 26 out)

let data = null;
let loading = null;
export const loadAnims = () => (loading ??= import("../../data/anims.js").then((m) => (data = m)));

const images = new Map();
const loaded = new Map();         // path -> the decoded Image, for its size
const asset = (p) => new URL(p, document.baseURI).href;
function image(path) {
  if (!images.has(path)) {
    images.set(path, new Promise((ok) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => { loaded.set(path, im); ok(im); };
      im.onerror = () => ok(null);
      im.src = asset(path);
    }));
  }
  return images.get(path);
}

const sheetPath = (i) => (data.SHEETS[i]?.[0] ? `battle/anim/s/${data.SHEETS[i][0]}.png` : null);
const bgPath = (i) => (i >= 0 && data.BGS[i] ? `battle/anim/bg/${data.BGS[i]}.png` : null);

// Every image a move's timeline draws.
function needs(slug) {
  const a = data?.ANIMS[slug];
  if (!a) return [];
  const out = new Set();
  for (const e of a[2]) {
    if (e[0] === "s") { const p = sheetPath(data.SPRITES[e[2]][0]); if (p) out.add(p); }
    if (e[0] === "g" || e[0] === "w") for (const i of e.slice(2)) { const p = bgPath(i); if (p) out.add(p); }
  }
  return [...out];
}

/* Fetch everything these moves draw, so a turn never waits on the network.
   Resolves when done or after `ms`, whichever is first. */
export async function preload(slugs, ms = 4000) {
  await loadAnims();
  const all = [...new Set(slugs.flatMap(needs))];
  await Promise.race([Promise.all(all.map(image)), new Promise((r) => setTimeout(r, ms))]);
}

// Whether a move has a timeline to play (15 of 775 are one special task each and fall back to the type burst).
export const hasAnim = (slug) => Boolean(data?.ANIMS[slug]?.[2]?.length);

const sin256 = (a) => Math.sin((a * Math.PI * 2) / 256);
const cos256 = (a) => Math.cos((a * Math.PI * 2) / 256);

/* Play `slug` with `attacker` 0 (yours) or 1 (the foe). `stage` holds the
   scene's elements: { scene, canvas, bg, tint, flash, mons: [mine, theirs] } where
   each mon is the element whose transform the animation may drive.
   Returns { skip } - finishing at once - and calls `onImpact` once (the hit:
   the health bar falls) and `onDone` once. */
export function play({ slug, attacker, stage, speed = 1, onImpact, onDone }) {
  const anim = data?.ANIMS[slug];
  const { scene, canvas, bg, tint, flash } = stage;
  const ctx = canvas.getContext("2d");
  const W = scene.clientWidth, H = scene.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const S = W / GBA_W;                         // scene px per GBA px
  const mx = attacker === 0 ? 1 : -1;          // offsets are written for the player attacking
  const monEl = [stage.mons[attacker], stage.mons[1 - attacker]];   // 0 attacker, 1 target
  // A mon's centre in scene px, read off layout (offset*, never a box: its idle bob is a transform).
  const centre = (el) => {
    const host = el?.closest(".ft-mon") ?? el;
    if (!host) return [W / 2, H / 2];
    return [host.offsetLeft + host.offsetWidth / 2, host.offsetTop + host.offsetHeight * 0.55];
  };
  const anchors = [centre(monEl[0]), centre(monEl[1])];
  const at = ([b, x, y], flipY) => {
    if (b === 2) {
      const gx = mx === 1 ? x : GBA_W - x;
      return [gx * S, (y / 160) * H];
    }
    const [cx, cy] = anchors[b];
    return [cx + x * S * mx, cy + y * S * (flipY && mx === -1 ? -1 : 1)];
  };

  const total = anim[0];
  const fast = Math.min(2.5, Math.max(1, total / (ANIM_MAX * FPS)));
  const rate = FPS * speed * fast;             // timeline frames per second
  const end = Math.min(total, ANIM_MAX * FPS * fast);
  const impactAt = anim[1] >= 0 ? Math.min(anim[1], end) : Math.round(end * 0.6);

  const live = [];            // sprites on the canvas
  const waapi = [];           // mon and layer animations, cancelled on skip
  let i = 0, t0 = performance.now(), raf = 0, hit = false, over = false;
  const events = anim[2];
  const imgs = {};
  const ms = (frames) => (frames / rate) * 1000;

  function run(el, keyframes, frames, opts = {}) {
    if (!el?.animate) return;
    const a = el.animate(keyframes, { duration: Math.max(16, ms(frames)), easing: "linear", fill: "none", composite: "add", ...opts });
    waapi.push(a);
  }
  const side = (b) => (b === 0 ? attacker : 1 - attacker);      // 0 attacker/1 target -> 0 mine/1 theirs
  const monDir = (b) => (side(b) === 0 ? 1 : -1);             // mon events are written for the player's side

  function tintLayers(layers, color, from, to, frames, pulses = 0) {
    const a0 = from / 16, a1 = to / 16;
    if (layers & 1) {
      const kf = pulses
        ? Array.from({ length: pulses * 2 + 1 }, (_, k) => ({ backgroundColor: color, opacity: k % 2 ? a1 : 0 }))
        : [{ backgroundColor: color, opacity: a0 }, { backgroundColor: color, opacity: a1 }];
      run(tint, kf, frames, { composite: "replace", fill: pulses ? "none" : "forwards" });
    }
    for (const [bit, b] of [[2, 0], [4, 1]]) {
      if (!(layers & bit)) continue;
      const f = (k) => (color === "#000000" ? `brightness(${1 - k * 0.85})`
        : color === "#ffffff" ? `brightness(${1 + k * 1.6}) saturate(${1 - k})`
        : `sepia(${k}) saturate(${1 + k * 3}) hue-rotate(${hueOf(color) - 40}deg) brightness(${1 + k * 0.2})`);
      const kf = pulses
        ? Array.from({ length: pulses * 2 + 1 }, (_, k) => ({ filter: f(k % 2 ? a1 : 0) }))
        : [{ filter: f(a0) }, { filter: f(a1) }, { filter: f(a0 === a1 ? a1 : 0) }];
      run(monEl[b], kf, frames, { composite: "replace" });
    }
  }

  function fire(e) {
    const [op, t] = e;
    switch (op) {
      case "s": {
        const [, , spec, m] = e;
        live.push({ t, spec, m, img: imgs[data.SPRITES[spec][0]] });
        break;
      }
      case "k": {                          // shake: n swings of the offset, `per` frames each
        const [, , b, ax, ay, n, per] = e;
        const kf = [];
        for (let k = 0; k <= n * 2; k++) {
          const s = k === n * 2 ? 0 : k % 2 ? -1 : 1;
          kf.push({ transform: `translate(${ax * S * s}px, ${ay * S * s}px)` });
        }
        run(monEl[b], kf, n * 2 * per);
        break;
      }
      case "l": {                          // lunge out and back
        const [, , b, dx, dy, f] = e;
        run(monEl[b], [{ transform: "translate(0,0)" }, { transform: `translate(${dx * S * monDir(b)}px, ${dy * S}px)` },
          { transform: "translate(0,0)" }], f * 2, { easing: "ease-in-out" });
        break;
      }
      case "m": {                          // slide to an offset and hold
        const [, , b, dx, dy, f] = e;
        monEl[b].__slide = [dx * S * monDir(b), dy * S];
        run(monEl[b], [{ transform: "translate(0,0)" }, { transform: `translate(${monEl[b].__slide[0]}px, ${monEl[b].__slide[1]}px)` }],
          f, { fill: "forwards" });
        break;
      }
      case "r": {                          // back to where it stood
        const [, , b, f] = e;
        const [x, y] = monEl[b].__slide ?? [0, 0];
        run(monEl[b], [{ transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0,0)" }], f, { fill: "forwards" });
        break;
      }
      case "z": {                          // scale out and back (the GBA's inverse scale: a smaller number is bigger)
        const [, , b, sx, sy, f] = e;
        const k = (v) => 1 / Math.max(0.3, 1 + v);
        run(monEl[b], [{ transform: "scale(1,1)" }, { transform: `scale(${k(sx)},${k(sy)})` }, { transform: "scale(1,1)" }], f);   // added: a flipped sprite stays flipped
        break;
      }
      case "e": {                          // an elliptical wobble
        const [, , b, ax, ay, f] = e;
        const kf = Array.from({ length: 9 }, (_, k) => ({
          transform: `translate(${Math.sin((k / 8) * Math.PI * 2) * ax * S * monDir(b)}px, ${Math.cos((k / 8) * Math.PI * 2) * ay * S - ay * S}px)`,
        }));
        run(monEl[b], kf, f);
        break;
      }
      case "o": {                          // a tilt and back
        const [, , b, deg, f] = e;
        run(monEl[b], [{ transform: "rotate(0deg)" }, { transform: `rotate(${deg * monDir(b)}deg)` }, { transform: "rotate(0deg)" }], f);
        break;
      }
      case "h": {                          // hide / show
        const [, , b, show] = e;
        run(monEl[b], [{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }], 8, { composite: "replace", fill: show ? "none" : "forwards" });
        break;
      }
      case "c": { const [, , layers, color, from, to, f] = e; tintLayers(layers, color, from, to, f); break; }
      case "x": { const [, , layers, color, peak, f, n] = e; tintLayers(layers, color, 0, peak, f, n); break; }
      case "f": {
        const [, , color, f] = e;
        run(flash, [{ backgroundColor: color, opacity: 0.8 }, { backgroundColor: color, opacity: 0 }], f, { composite: "replace" });
        break;
      }
      case "g": {                          // a background: in, or out (-1); a pair is [target is the foe, target is you]
        const which = e.length > 3 ? (side(1) === 1 ? e[2] : e[3]) : e[2];
        const p = bgPath(which);
        if (which < 0 || !p) {
          run(bg, [{ opacity: 1 }, { opacity: 0 }], 16, { composite: "replace", fill: "forwards" });
        } else {
          showBg(p);
          run(bg, [{ opacity: 0 }, { opacity: 1 }], 16, { composite: "replace", fill: "forwards" });
        }
        break;
      }
      case "gs": {                         // the background scrolls
        const [, , vx, vy] = e;
        const px = (v) => (v / 256) * S * FPS * 4;         // per 4 seconds of play
        run(bg, [{ backgroundPosition: "0px 0px" }, { backgroundPosition: `${px(vx) * mx}px ${px(vy)}px` }], 4 * FPS, { composite: "replace", iterations: Infinity });
        break;
      }
      case "b": live.push({ t, bolt: [e[2], e[3]] }); break;
      case "w": {                          // a wave across the field (Surf, Muddy Water, Sludge Wave)
        /* AnimTask_CreateSurfWave: the map scrolls 2px across and 1px up a
           frame from where each side's tilemap starts, blended in by 1/16
           every 2 frames to 13/16, held, and out the same way. It has its own
           tilemap per side, so it is never mirrored. */
        const p = bgPath(attacker === 0 ? e[2] : e[3]);
        if (p) {
          showBg(p);
          const [x0, y0, dx, dy] = attacker === 0 ? [0, 48, 2, -1] : [224, 0, -2, 1];
          const pos = (f) => `${(x0 + dx * f) * S}px ${(y0 + dy * f) * S}px`;
          run(bg, [{ opacity: 0, backgroundPosition: pos(0) }, { opacity: 13 / 16, offset: 26 / WAVE },
            { opacity: 13 / 16, offset: 108 / WAVE }, { opacity: 0, backgroundPosition: pos(WAVE) }], WAVE, { composite: "replace" });
        }
        break;
      }
      default: break;
    }
  }

  // A background at the GBA's scale (a map is 256 or 512 pixels wide), from its top left, wrapping as the GBA's do.
  function showBg(p) {
    const im = loaded.get(p);
    bg.style.backgroundImage = `url("${asset(p)}")`;
    bg.style.backgroundSize = im ? `${im.naturalWidth * S}px ${im.naturalHeight * S}px` : "";
    bg.style.backgroundPosition = "0px 0px";
  }

  function drawSprite(s, now) {
    const [sheetI, seq, loops, aff, blend] = data.SPRITES[s.spec];
    const sheet = data.SHEETS[sheetI];
    const m = s.m;
    let age = now - s.t - (m.d || 0);
    if (age < 0) return true;
    const f = m.f || 0;
    // Its frame: the sequence's ticks, looped or held on the last.
    const seqLen = seq.reduce((n, x) => n + x[1], 0);
    let tick = loops ? age % Math.max(1, seqLen) : Math.min(age, seqLen - 1);
    let fr = seq[0];
    for (const x of seq) { fr = x; if (tick < x[1]) break; tick -= x[1]; }
    // Its scale and rotation, the affine table run to `age`.
    let sx = 1, sy = 1, rot = 0, affLen = 0;
    if (aff) {
      let left = age;
      for (const [ax, ay, ar, dur] of aff) {
        if (dur === 0) { sx = ax / 256 || sx; sy = ay / 256 || sy; rot = (ar * 256 * 360) / 65536; continue; }
        const n = Math.min(left, dur);
        sx += (ax * n) / 256; sy += (ay * n) / 256; rot += (ar * n * 360) / 256;
        affLen += dur;
        left -= dur;
        if (left <= 0) break;
      }
    }
    const lifeEnd = f ? f : aff && affLen ? affLen : loops ? 30 : seqLen;
    if (age > lifeEnd + (m.after || 0)) return false;
    if (m.fl && Math.floor(age / m.fl) % 2) return true;
    if (m.after && age > lifeEnd && Math.floor(age) % 2) return true;
    // Where it is.
    const p = Math.min(1, age / Math.max(1, f || lifeEnd));
    let [x, y] = at(m.o, m.fy);
    const k = m.k;
    if (k === "line" || k === "arc" || k === "wave") {
      const [x0, y0] = [x, y];
      const [x1, y1] = at(m.to, m.fy);
      const nx = x0 + (x1 - x0) * p, ny = y0 + (y1 - y0) * p;
      if (k === "arc") { x = nx; y = ny + (m.h || -24) * S * Math.sin(Math.PI * p); }
      else if (k === "wave") {
        // Across the line of travel, not along it.
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const off = Math.sin(p * Math.PI * 2 * (m.w || 1)) * (m.a || 8) * S;
        x = nx - ((y1 - y0) / len) * off; y = ny + ((x1 - x0) / len) * off;
      } else { x = nx; y = ny; }
      if (m.wob) { const a = (m.a0 || 0) + (m.sp || 8) * age; x += sin256(a) * m.wob * S; y += cos256(a) * m.wob * S; }
    } else if (k === "vel") {
      x += (m.vx || 0) * age * S * (m.fx === 0 ? 1 : mx);
      y += (m.vy || 0) * age * S + (m.sway ? Math.sin(age / 8) * m.sway * S : 0);
    } else if (k === "rise") {
      const moving = m.stop ? Math.min(age, m.stop) : age;
      y += (m.vy || 0) * moving * S;
      x += sin256((m.sp || 0) * age) * (m.a || 0) * S * (m.fx === 0 ? 1 : mx);
    } else if (k === "orbit") {
      const a = (m.a0 || 0) + (m.sp || 8) * age;
      const r = ((m.r || 0) + (m.rs || 0) * age) * S;
      x += sin256(a) * r; y += cos256(a) * r;
    }
    // Draw it, frame `fr[0]` of the strip.
    const img = s.img;
    if (!img || !sheet) return true;
    const [, w, h] = sheet;
    const flipX = (fr[2] ? -1 : 1) * (m.hf ? -1 : 1) * (m.fx === 0 ? 1 : mx);
    const flipY = (fr[3] ? -1 : 1) * (m.vf ? -1 : 1);
    ctx.save();
    ctx.globalAlpha = blend ? 0.75 : 1;
    ctx.translate(x, y);
    if (rot || m.rot) ctx.rotate((((rot + (m.rot || 0)) * Math.PI) / 180) * mx);
    ctx.scale(flipX * sx * S, flipY * sy * S);
    ctx.drawImage(img, fr[0] * w, 0, w, h, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  function drawBolt(s, now) {                // Thunderbolt's bolts: a jagged column down onto the target
    const age = now - s.t;
    if (age > 14) return false;
    const [tx, ty] = anchors[1];
    const x0 = tx + s.bolt[0] * S * mx, y0 = Math.max(0, ty + s.bolt[1] * S - 60 * S);
    ctx.save();
    ctx.globalAlpha = age < 10 ? 1 : (14 - age) / 4;
    ctx.lineJoin = "miter";
    for (const [wid, col] of [[5 * S, "rgba(255,240,120,.55)"], [2 * S, "#fffbe0"]]) {
      ctx.strokeStyle = col; ctx.lineWidth = wid;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      let y = y0, x = x0, k = 0;
      while (y < ty) { y += 10 * S; x = x0 + ((k++ % 2 ? 1 : -1) * 6 + ((s.t * 7 + k * 13) % 5) - 2) * S; ctx.lineTo(x, Math.min(y, ty)); }
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function finish() {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    for (const a of waapi) a.cancel();
    ctx.clearRect(0, 0, W, H);
    bg.style.backgroundImage = bg.style.backgroundSize = bg.style.backgroundPosition = "";
    for (const el of monEl) if (el) delete el.__slide;
    if (!hit) { hit = true; onImpact?.(); }
    onDone?.();
  }

  function frame(nowMs) {
    if (over) return;
    const now = ((nowMs - t0) / 1000) * rate;
    while (i < events.length && events[i][1] <= now) fire(events[i++]);
    if (!hit && now >= impactAt) { hit = true; onImpact?.(); }
    ctx.clearRect(0, 0, W, H);
    for (let k = live.length - 1; k >= 0; k--) {
      const s = live[k];
      const keep = s.bolt ? drawBolt(s, now) : drawSprite(s, now);
      if (!keep) live.splice(k, 1);
    }
    if (now >= end) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }

  // Every image this timeline draws is already fetched (`preload`); a straggler draws when it lands.
  Promise.all([...new Set(events.filter((e) => e[0] === "s").map((e) => data.SPRITES[e[2]][0]))].map(async (sh) => {
    const p = sheetPath(sh);
    imgs[sh] = p ? await image(p) : null;
    for (const s of live) if (!s.img && data.SPRITES[s.spec]?.[0] === sh) s.img = imgs[sh];
  }));
  for (const e of events) if (e[0] === "s") { const p = sheetPath(data.SPRITES[e[2]][0]); if (p) image(p).then((im) => { imgs[data.SPRITES[e[2]][0]] = im; }); }
  t0 = performance.now();
  raf = requestAnimationFrame(frame);
  return { skip: finish };
}

// A colour's hue, for a mon tinted something other than black or white.
function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}
