/* ARENA KITS (docs/arena-kits.md): one fixed four-slot kit per evolution line,
   picked from the line's own learnsets.

     npm run kits      writes src/data/kits.js (the Arena reads it) and
                       reports/Arena kits.md (the map, for review)

   Each slot has one job. MAIN its signature damage, MOVE its mobility (a dash,
   a vanish, a decoy or a speed boost), CONTROL what sets the foe up (sleep,
   paralysis, freeze, confusion, a grab, a slow, a flinch), POWER its finisher
   or, for a Tank or a Support, its shield or heal. A line keeps its slots;
   each stage fills them from its own learnset, so a slot's move grows with
   the line (Ember, Flame Burst, Flamethrower). `FIXED` overrides the rules
   for a line by name. */
import { writeFileSync } from "node:fs";
import * as A from "../src/game/arena.js";
import { learnable } from "../src/game/battle.js";
import { SPECIES } from "../src/data/dex.js";
import { EVOLUTIONS } from "../src/data/evolutions.js";
import { MOVES } from "../src/data/moves.js";

/* HAND-WRITTEN KITS (2026-10-27): a line's last stage by name, its [Main,
   Move, Control, Power]. Every move must be one that Pokemon learns (the
   build stops otherwise); earlier stages take the same move where they learn
   it, and their own best for that job where they do not. `free` (the few
   that learn too little to fill a kit at all: Ditto, Smeargle, Unown...) may
   name any move the Arena plays. `null` leaves a slot to the rules. */
const FIXED = {
  // The starters, every region.
  venusaur: ["petal-blizzard", "take-down", "sleep-powder", "solar-beam"],
  charizard: ["flamethrower", "flare-blitz", "dragon-breath", "heat-wave"],
  blastoise: ["water-pulse", "rapid-spin", "bite", "hydro-pump"],
  meganium: ["magical-leaf", "body-slam", "poison-powder", "synthesis"],
  typhlosion: ["flamethrower", "flame-charge", "lava-plume", "eruption"],
  feraligatr: ["aqua-tail", "agility", "ice-fang", "superpower"],
  sceptile: ["leaf-blade", "quick-attack", "detect", "leaf-storm"],
  blaziken: ["blaze-kick", "bounce", "detect", "flare-blitz"],
  swampert: ["muddy-water", "take-down", "mud-shot", "hydro-pump"],
  torterra: ["giga-drain", "wood-hammer", "bite", "earthquake"],
  infernape: ["flame-wheel", "mach-punch", null, "close-combat"],
  empoleon: ["brine", "aqua-jet", "bubble-beam", "hydro-pump"],
  serperior: ["magical-leaf", null, "vine-whip", "leaf-storm"],
  emboar: ["flame-charge", "take-down", "smog", "flare-blitz"],
  samurott: ["razor-shell", "aqua-jet", "water-pulse", "hydro-pump"],
  chesnaught: ["seed-bomb", "body-slam", "vine-whip", "spiky-shield"],
  delphox: ["mystical-fire", "flame-charge", "will-o-wisp", "fire-blast"],
  greninja: ["water-shuriken", "double-team", "smokescreen", "night-slash"],
  decidueye: ["leaf-blade", "phantom-force", "astonish", "leaf-storm"],
  incineroar: ["fire-fang", "flare-blitz", "lick", "darkest-lariat"],
  primarina: ["sparkling-aria", "aqua-jet", "sing", "moonblast"],
  rillaboom: ["razor-leaf", "wood-hammer", "drum-beating", "boomburst"],
  cinderace: ["flame-charge", "bounce", "headbutt", "pyro-ball"],
  inteleon: ["snipe-shot", "u-turn", "water-pulse", "hydro-pump"],
  meowscarada: ["flower-trick", "quick-attack", "bite", "leaf-storm"],
  skeledirge: ["torch-song", null, "will-o-wisp", "overheat"],
  quaquaval: ["aqua-step", "aqua-jet", "low-sweep", "close-combat"],
  // The pseudo-legendaries.
  dragonite: ["aqua-tail", "extreme-speed", "thunder-wave", "outrage"],
  tyranitar: ["crunch", null, "rock-slide", "stone-edge"],
  salamence: ["dragon-claw", "fly", "dragon-breath", "outrage"],
  metagross: ["meteor-mash", "bullet-punch", "confusion", "hammer-arm"],
  garchomp: ["dragon-claw", "dig", "bulldoze", "crunch"],   // Dragon Rush is its ULTI
  hydreigon: ["dragon-pulse", "body-slam", "dragon-breath", "outrage"],
  goodra: ["dragon-pulse", "body-slam", "dragon-breath", "muddy-water"],
  "kommo-o": ["dragon-claw", "clangorous-soul", "dragon-tail", "clanging-scales"],
  dragapult: ["dragon-darts", "phantom-force", "dragon-breath", "dragon-rush"],
  baxcalibur: ["icicle-crash", "ice-shard", "icy-wind", "glaive-rush"],
  // The favourites.
  pikachu: ["thunderbolt", "quick-attack", "thunder-wave", "discharge"],
  raichu: ["thunderbolt", "quick-attack", "thunder-wave", "thunder"],
  gengar: ["shadow-ball", "sucker-punch", "hypnosis", "dream-eater"],
  alakazam: ["psyshock", null, "confusion", "future-sight"],
  machamp: ["cross-chop", "double-edge", "vital-throw", "dynamic-punch"],
  gyarados: ["waterfall", "dragon-dance", "bite", "hydro-pump"],
  lapras: ["ice-beam", "ice-shard", "sing", "hydro-pump"],
  snorlax: ["crunch", "high-horsepower", "body-slam", "giga-impact"],
  vaporeon: ["muddy-water", "quick-attack", "water-pulse", "hydro-pump"],
  jolteon: ["discharge", "quick-attack", "thunder-wave", "thunder"],
  flareon: ["fire-fang", "quick-attack", "lava-plume", "flare-blitz"],
  espeon: ["psychic", "quick-attack", "confusion", "future-sight"],
  umbreon: ["dark-pulse", "quick-attack", "bite", "moonlight"],
  leafeon: ["razor-leaf", "quick-attack", "bite", "leaf-blade"],
  glaceon: ["freeze-dry", "ice-shard", "icy-wind", "blizzard"],
  sylveon: ["draining-kiss", "quick-attack", "bite", "moonblast"],
  lucario: ["aura-sphere", "extreme-speed", "force-palm", "close-combat"],
  gardevoir: ["psychic", "double-team", "hypnosis", "moonblast"],
  gallade: ["sacred-sword", "aerial-ace", "confusion", "close-combat"],
  scizor: ["x-scissor", "bullet-punch", "iron-head", "swords-dance"],
  heracross: ["brick-break", "aerial-ace", "throat-chop", "megahorn"],
  mimikyu: ["shadow-claw", "shadow-sneak", "astonish", "play-rough"],
  zoroark: ["night-daze", "u-turn", "scary-face", "foul-play"],
  absol: ["night-slash", "sucker-punch", "detect", "future-sight"],
  arcanine: ["fire-fang", "extreme-speed", "bite", "flare-blitz"],
  ninetales: ["flamethrower", "quick-attack", "will-o-wisp", "fire-blast"],
  rhyperior: ["stone-edge", "drill-run", "bulldoze", "rock-wrecker"],
  magnezone: ["discharge", null, "thunder-wave", "zap-cannon"],
  electivire: ["thunder-punch", "quick-attack", "thunder-wave", "thunder"],
  magmortar: ["flamethrower", null, "smokescreen", "fire-blast"],
  aegislash: ["sacred-sword", "shadow-sneak", "iron-head", "kings-shield"],
  toxapex: ["poison-jab", null, "toxic", "baneful-bunker"],
  corviknight: ["drill-peck", "brave-bird", "scary-face", "iron-defense"],
  slowbro: ["psychic", "zen-headbutt", "water-pulse", "slack-off"],
  blissey: ["disarming-voice", "take-down", "sing", "soft-boiled"],
  chandelure: ["shadow-ball", null, "will-o-wisp", "overheat"],
  volcarona: ["fiery-dance", "quiver-dance", "string-shot", "fire-blast"],
  kingdra: ["dragon-pulse", "agility", "smokescreen", "hydro-pump"],
  milotic: ["surf", null, "dragon-tail", "recover"],
  ampharos: ["discharge", "take-down", "thunder-wave", "zap-cannon"],
  steelix: ["iron-tail", "dig", "dragon-breath", "stone-edge"],
  crobat: ["cross-poison", null, "poison-fang", "leech-life"],
  azumarill: ["aqua-tail", "bounce", "bubble-beam", "play-rough"],
  hitmonlee: ["blaze-kick", "fake-out", "low-sweep", "high-jump-kick"],
  hitmonchan: ["drain-punch", "mach-punch", "thunder-punch", "close-combat"],
  kangaskhan: ["crunch", "fake-out", "stomp", "outrage"],
  scyther: ["x-scissor", "quick-attack", "air-slash", "swords-dance"],
  aerodactyl: ["rock-slide", "wing-attack", "bite", "stone-edge"],
  togekiss: ["air-slash", "extreme-speed", "sky-attack", "aura-sphere"],
  golem: ["stone-edge", "rollout", "bulldoze", "earthquake"],
  rapidash: ["flame-wheel", "smart-strike", "stomp", "flare-blitz"],
  // Legendaries.
  mewtwo: ["psychic", "ancient-power", "confusion", "psystrike"],
  mew: ["psychic", "ancient-power", null, "aura-sphere"],
  lugia: ["extrasensory", "ancient-power", "sky-attack", "aeroblast"],
  "ho-oh": ["extrasensory", "ancient-power", "sacred-fire", "fire-blast"],
  rayquaza: ["dragon-pulse", "extreme-speed", "twister", "dragon-ascent"],
  darkrai: ["dark-pulse", "double-team", "dark-void", "dream-eater"],
  giratina: ["shadow-claw", "shadow-force", "dragon-breath", "earth-power"],
  // They learn too little for a kit: any move the Arena plays (`free`).
  ditto: ["tackle", "quick-attack", "scary-face", "body-slam", { free: true }],
  unown: ["hidden-power", "extrasensory", "confusion", "psychic", { free: true }],
  delibird: ["drill-peck", "aerial-ace", "icy-wind", "blizzard", { free: true }],
  smeargle: ["tackle", "quick-attack", "spore", "dazzling-gleam", { free: true }],
  wobbuffet: ["psybeam", "zen-headbutt", "confusion", "psychic", { free: true }],
  pyukumuku: ["water-gun", "rollout", "toxic", "recover", { free: true }],
  blipbug: ["psybeam", "agility", "confusion", "bug-buzz", { free: true }],   // its one move is its ULTI: it plays what Orbeetle will
  "gimmighoul-roaming": ["shadow-ball", "tackle", "astonish", "power-gem", { free: true }],
};
const SLOT_OF = ["main", "move", "control", "power"];
/* A hand-written move that IS the Pokemon's ULTI (Greninja's Water Shuriken, Lucario's Aura Sphere) is
   played as the ULTI and never as a button too: its slot falls to the rules (`poolOf` leaves it out). */
const isUlt = (id, n) => MOVES[A.ultiPick(id).move]?.n === n;

const byId = new Map(SPECIES.map((s) => [s.id, s]));
const name = (id) => byId.get(id)?.name ?? `#${id}`;
const title = (n) => n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

// Lines: plain evolution rows (no Mega, Gigantamax, event or look rows), Arena-ready stages only.
const NOT = new Set(["mega", "gmax"]);
const rows = EVOLUTIONS.filter((r) => !NOT.has(r.kind) && !r.event && !r.look && A.arenaReady(r.from) && A.arenaReady(r.to));
const parent = new Map(rows.map((r) => [r.to, r.from]));
const rootOf = (id) => { let x = id; const seen = new Set(); while (parent.has(x) && !seen.has(x)) { seen.add(x); x = parent.get(x); } return x; };
const ready = SPECIES.filter((s) => A.arenaReady(s.id) && s.form !== "mega" && s.form !== "gmax" && s.form !== "event" && s.form !== "look");
/* A LINE IS A PATH from a first stage to a last: a branch (Eevee's eight,
   Ralts to Gardevoir or Gallade) is a line of its own, with its own class.
   A stage two paths share keeps ONE kit: the first path's (by its last
   stage's number). */
const readyIds = new Set(ready.map((s) => s.id));
const kids = new Map();
for (const r of rows) if (readyIds.has(r.from) && readyIds.has(r.to)) { if (!kids.has(r.from)) kids.set(r.from, []); if (!kids.get(r.from).includes(r.to)) kids.get(r.from).push(r.to); }
const lines = new Map();   // key: the path's ids joined
const walk = (id, path) => {
  const next = (kids.get(id) ?? []).filter((k) => !path.includes(k));
  if (!next.length) { lines.set([...path, id].join(">"), [...path, id]); return; }
  for (const k of next.sort((a, b) => a - b)) walk(k, [...path, id]);
};
for (const s of ready) if (rootOf(s.id) === s.id) walk(s.id, []);

// What a move does, read once.
const STATUS = ["par", "brn", "psn", "slp", "frz"];
function info(i) {
  const m = A.arenaMove(i);
  const shape = A.shapeOf(m);
  const chance = m.st != null ? (m.stc ?? 100) / 100 : 0;
  // A slow lowers the FOE's Speed: never a move that lowers its user's (Hammer Arm, `sgu`).
  const slow = (m.sg ?? []).some(([st, k]) => st === 5 && k < 0) && !m.self && !m.sgu ? (m.sgc ?? 100) / 100 : 0;
  return { i, m, n: m.n, t: m.t, p: m.p > 1 ? m.p : 0, shape, chance, slow, heal: !!m.h || (m.dr ?? 0) > 0 && m.c === 2,
    status: m.st != null ? STATUS[m.st] : null, flinch: (m.fl ?? 0) / 100, confuse: (A.CONFUSES[m.n] ?? 0) / 100,
    grab: A.GRABS.has(m.n), vanish: !!A.VANISH[m.n], shield: A.SHIELDS.has(m.n),
    selfUp: m.self && (m.sg ?? []).some(([, k]) => k > 0), speedUp: (m.sg ?? []).some(([st, k]) => st === 5 && k > 0) && (m.self || m.sgu),
    defUp: m.self && (m.sg ?? []).some(([st, k]) => (st === 2 || st === 4) && k > 0), recoil: (m.dr ?? 0) < 0 };
}
// Never its own ULTI's move: an ULTI and a button of the same move were two of one (arena.js `kitOf`, 2026-10-24).
const poolOf = (id) => [...new Set([...learnable(id, 100), ...learnable(id, 100, true).filter((i) => A.SHIELDS.has(A.arenaMove(i).n))])]
  .filter((i) => i !== A.ultiPick(id).move).map(info).filter((x) => x.shape);

// A line's class, from its last stage's base stats and what it learns.
function classOf(id, pool) {
  const [hp, at, df, sa, sd, sp] = byId.get(id).stats;
  const bulk = hp + df + sd, off = Math.max(at, sa), total = hp + at + df + sa + sd + sp;
  const heals = pool.some((x) => x.heal);
  if (heals && sd + hp >= 2.2 * off && off < 100) return "Support";
  if (bulk / total >= 0.52 && sp < 90) return "Tank";
  if (sp >= 105 && off >= 100 && bulk / total < 0.46) return "Assassin";
  if (A.speciesRole(id) === "brawler") return "Fighter";
  return pool.some((x) => x.p && (x.shape === "pulse" || x.shape === "beam") && byId.get(id).types.includes(x.t)) ? "Mage" : "Marksman";
}

// Each slot's score for a move (0: does not fit). `types` are the stage's; `brawler` its basic style.
const stab = (x, types) => (types.includes(x.t) ? 1.5 : 1);
const SCORE = {
  // The button pressed most: a mid-power same-type attack (60-90), never the big one - that is Power's.
  main: (x, { types, brawler }) => (x.p && !x.recoil && x.shape !== "dash" && x.shape !== "field"
    ? (Math.min(x.p, 90) - Math.max(0, x.p - 90) * 2) * stab(x, types) * ((x.shape === "melee") === brawler ? 1.15 : 0.7) * (x.m.hits ? 1.3 : 1) : 0),
  move: (x, { types }) => (x.vanish ? 200 + x.p
    : x.shape === "dash" && x.p ? 120 + Math.min(x.p, 90) * stab(x, types) / 3
      : x.speedUp ? 110 : x.n === "double-team" ? 100 : x.n === "teleport" ? 90 : 0),
  control: (x) => {
    const v = x.status === "slp" ? 100 * x.chance : x.status === "frz" ? 90 * x.chance : x.status === "par" ? 80 * x.chance : 0;
    const c = Math.max(v, x.grab ? 85 : 0, x.confuse * 70, x.flinch * 55, x.slow * 60, x.n === "smokescreen" ? 50 : 0);
    return c ? c + (x.p ? 15 : 0) : 0;
  },
  power: (x, { types, cls }) => {
    if (cls === "Tank") return x.shield ? 150 : x.defUp ? 140 : x.heal ? 120 : x.p ? x.p * stab(x, types) * 0.5 : 0;
    if (cls === "Support") return x.heal ? 160 : x.selfUp ? 110 : x.p ? x.p * stab(x, types) * 0.5 : 0;
    return x.p ? x.p * stab(x, types) * (x.shape === "pulse" || x.shape === "beam" ? 1.1 : 1) : 0;
  },
};
const ORDER = ["control", "move", "power", "main"];   // the scarce jobs pick first; Power takes the big move before Main can

// One stage's kit: the line's hand-written moves it learns, then each slot its best move not already taken, in ORDER.
const moveIndex = (n) => MOVES.findIndex((m) => m.n === n);
function kitFor(id, cls, fixed) {
  const pool = poolOf(id), sp = byId.get(id), ctx = { types: sp.types, brawler: A.speciesRole(id) === "brawler", cls };
  const kit = {}, used = new Set();
  const free = fixed?.[4]?.free;
  if (fixed) SLOT_OF.forEach((slot, k) => {
    const want = fixed[k];
    if (!want) return;
    const at = moveIndex(want);
    const x = pool.find((y) => y.n === want) ?? (free && at >= 0 && at !== A.ultiPick(id).move && A.shapeOf(A.arenaMove(at)) ? info(at) : null);
    if (x && !used.has(x.i)) { kit[slot] = { ...x, hand: true }; used.add(x.i); }
  });
  for (const slot of ORDER) {
    if (kit[slot]) continue;
    const best = pool.filter((x) => !used.has(x.i)).map((x) => [x, SCORE[slot](x, ctx)]).filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])[0];
    if (best) { kit[slot] = best[0]; used.add(best[0].i); }
  }
  // An empty slot takes the best damaging move left, so every kit has four buttons.
  for (const slot of ORDER) if (!kit[slot]) {
    const fill = pool.filter((x) => !used.has(x.i) && x.p).sort((a, b) => b.p - a.p)[0];
    if (fill) { kit[slot] = { ...fill, filler: true }; used.add(fill.i); }
  }
  return kit;
}

// The map.
const out = [], gaps = { move: 0, control: 0, power: 0, main: 0 }, classes = {}, bad = [];
let hand = 0;
let n = 0;
const sorted = [...lines.values()].sort((a, b) => a[0] - b[0] || a.at(-1) - b.at(-1));
const kitOf = new Map();   // one kit a species: the first path through it decides
const clsOf = new Map();
for (const stages of sorted) {
  const last = stages.at(-1);
  const cls = classOf(last, poolOf(last));
  classes[cls] = (classes[cls] ?? 0) + 1;
  const fixed = FIXED[name(last)];
  if (fixed) {
    // Every hand-written move must reach the last stage: a typo or a move it never learns stops the build.
    const k = kitFor(last, cls, fixed);
    SLOT_OF.forEach((slot, j) => { if (fixed[j] && k[slot]?.n !== fixed[j] && !isUlt(last, fixed[j])) bad.push(`${name(last)} ${slot}: ${fixed[j]}`); });
    hand++;
  }
  // A middle stage with its own entry (Pikachu, under Raichu) plays its own; the rest take the line's.
  const kits = stages.map((id) => { if (!kitOf.has(id)) { kitOf.set(id, kitFor(id, cls, FIXED[name(id)] ?? fixed)); clsOf.set(id, cls); } return [id, kitOf.get(id)]; });
  /* A STAGE THAT LEARNS TOO LITTLE (Abra knows only Teleport, Magikarp Splash) borrows the empty slots
     from the next stage in its line: it plays what it grows into. Last first, so a borrow can chain. */
  for (let j = kits.length - 2; j >= 0; j--) {
    const [id, k] = kits[j], [, next] = kits[j + 1];
    if (ORDER.filter((slot) => k[slot] && !k[slot].filler).length >= 2) continue;
    for (const slot of ORDER) if ((!k[slot] || k[slot].filler) && next[slot] && next[slot].i !== A.ultiPick(id).move) k[slot] = { ...next[slot], borrowed: true };
  }
  const finalKit = kits.at(-1)[1];
  for (const slot of ORDER) if (!finalKit[slot] || finalKit[slot].filler) gaps[slot]++;
  const cell = (k, slot) => (k[slot] ? `${title(k[slot].n)}${k[slot].filler ? "*" : ""}` : "-");
  // The combo lands a hit: Power when it does damage (a Tank's or Support's is a shield or heal), else Main.
  const payoff = finalKit.power?.p ? finalKit.power : finalKit.main;
  const combo = finalKit.control && payoff && !finalKit.control.filler ? `${title(finalKit.control.n)}, then ${title(payoff.n)}` : "";
  const empty = ORDER.filter((s) => !finalKit[s]).length;
  out.push(`| ${stages.map((id) => title(name(id))).join(" → ")} | ${cls}${fixed ? " ✋" : ""} | ${["main", "move", "control", "power"].map((s) => kits.map(([, k]) => cell(k, s)).join(" / ")).join(" | ")} | ${combo}${empty ? ` **(${empty} empty: needs a hand-written kit)**` : ""} |`);
  n += stages.length;
}
const md = `# Arena kits: the full map (for review)

Made by \`node tools/build_kits.mjs\` from each line's real learnsets (docs/arena-kits.md). ${lines.size} lines, ${n} Pokémon.
Each row is one evolution path (a branch, like Eevee's, is a row of its own); each cell lists its stages in order (Charmander / Charmeleon / Charizard). A \`*\` is a filler: the line learns nothing that fits that slot's job, so it took its strongest leftover attack.

✋ marks a hand-written kit (${hand} of them); the rest come from the rules.

Classes: ${Object.entries(classes).sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} ${k}`).join(", ")}.
Lines whose final stage has a filler: Main ${gaps.main}, Move ${gaps.move}, Control ${gaps.control}, Power ${gaps.power}.

| Line | Class | Main (RMB) | Move (Q) | Control (E) | Power (R) | Combo |
|---|---|---|---|---|---|---|
${out.join("\n")}
`;
// An entry for a middle stage is checked against that stage.
for (const [n2, f] of Object.entries(FIXED)) {
  const sp = SPECIES.find((x) => x.name === n2);
  if (!sp) { bad.push(`${n2}: no such Pokemon`); continue; }
  const k = kitFor(sp.id, "Fighter", f);
  SLOT_OF.forEach((slot, j) => { if (f[j] && k[slot]?.n !== f[j] && !isUlt(sp.id, f[j])) bad.push(`${n2} ${slot}: ${f[j]}`); });
}
if (bad.length) { console.error(`hand-written moves the Pokemon does not learn or the Arena does not play:\n  ${bad.join("\n  ")}`); process.exit(1); }
writeFileSync(new URL("../reports/Arena kits.md", import.meta.url), md);
/* THE GAME'S COPY: a species id, its [Main, Move, Control, Power] by move NAME (moves.js's indices move
   when it is re-fetched; a name does not) and its class. Generated: never edit it by hand. */
const data = Object.fromEntries([...kitOf.entries()].sort((a, b) => a[0] - b[0])
  .map(([id, k]) => [id, [...SLOT_OF.map((slot) => k[slot]?.n ?? null), clsOf.get(id)]]));
writeFileSync(new URL("../src/data/kits.js", import.meta.url),
  `// Generated by tools/build_kits.mjs (npm run kits) - never edit by hand. docs/arena-kits.md.\n// species id: [Main, Move, Control, Power, class]\nexport const KITS = ${JSON.stringify(data)};\n`);
console.log(`${lines.size} lines, ${n} Pokemon. classes ${JSON.stringify(classes)}; fillers at the last stage ${JSON.stringify(gaps)}`);
