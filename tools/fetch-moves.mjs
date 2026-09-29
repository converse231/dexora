/* node tools/fetch-moves.mjs — moves, learnsets and the type chart, from PokéAPI.

   Writes three generated files the battle rules read (docs/battles.md):

     src/data/learnsets.js  per dex id, the level-up moves as `level * 1000 +
                            move index` integers - one number a row, because
                            this is the heaviest data in the League's chunk
     src/data/moves.js      every move a learnset uses, with the fields the
                            effect subset reads and nothing else
     src/data/types.js      the 18 types and the chart between them

   THE NEWEST STANDARD VERSION GROUP, per species. The newest gives every
   species to 1025 one consistent source and the physical/special split. Two
   groups are skipped: Let's Go (a cut-down moveset for 153 species) and
   Legends: Arceus (a different move system); a species found only there
   takes its newest other group. And the JAPANESE releases (`red-green-japan`,
   `blue-japan`): PokéAPI added them with the highest ids of all, so "newest
   by id" gave every Kanto species its Red/Blue moveset - Charizard with
   Scratch, Rage and Fire Spin, Articuno with five moves (reported 2026-09-29).

   A FORM WITH NO LEVEL-UP MOVES OF ITS OWN (a Mega, a Gigantamax) TAKES ITS
   SPECIES'. PokéAPI lists none for most of them, and a form is fought as the
   creature it is a form of.

   Extracted learnsets and moves are cached in .assets-src/pokeapi/ - the raw
   /pokemon responses are ~200KB each and only the level-up rows are kept. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { SPECIES } from "../src/data/dex.js";

const ROOT = new URL("../", import.meta.url);
const CACHE = new URL(".assets-src/pokeapi/", ROOT);
mkdirSync(CACHE, { recursive: true });
const API = "https://pokeapi.co/api/v2";
const SKIP_GROUPS = new Set(["lets-go-pikachu-lets-go-eevee", "legends-arceus"]);

async function get(url) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404 || res.status === 400) return null;   // no such name
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= 4) throw new Error(`${url}: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 500 * (i + 1)));
    }
  }
}

async function cached(name, make) {
  const file = new URL(name + ".json", CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const v = await make();
  writeFileSync(file, JSON.stringify(v));
  return v;
}

async function pool(items, n, fn, label) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      if (++done % 50 === 0 || done === items.length) process.stdout.write(`\r  ${label} ${done}/${items.length}`);
    }
  }));
  console.log();
  return out;
}

// ------------------------------------------------------------------ learnsets

const groupId = (url) => Number(url.match(/\/(\d+)\/?$/)[1]);

/* [[level, move name], ...] from the newest standard group, or null for a
   species PokéAPI has no level-up moves for at all. */
const levelUp = (id) => cached(`learn-${id}`, async () => {
  const j = await get(`${API}/pokemon/${id}`);
  if (!j) return null;
  const byGroup = new Map();
  for (const mv of j.moves) {
    for (const d of mv.version_group_details) {
      if (d.move_learn_method.name !== "level-up" || SKIP_GROUPS.has(d.version_group.name)
        || /-japan$/.test(d.version_group.name)) continue;
      const g = groupId(d.version_group.url);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push([d.level_learned_at, mv.move.name]);
    }
  }
  if (!byGroup.size) return null;
  const rows = byGroup.get(Math.max(...byGroup.keys()));
  return rows.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
});

const learned = await pool(SPECIES, 8, (sp) => levelUp(sp.id), "learnsets");
const ROWS = new Map();
const borrowed = [];
for (const [i, sp] of SPECIES.entries()) {
  let rows = learned[i];
  if (!rows?.length && sp.of) {
    rows = learned[SPECIES.findIndex((x) => x.id === sp.of)];
    borrowed.push(sp.name);
  }
  if (!rows?.length) throw new Error(`${sp.name} (${sp.id}) has no level-up moves, and no species to borrow them from`);
  ROWS.set(sp.id, rows);
}

// ------------------------------------------------------------------ moves

/* WHAT THE RULES CAN SAY ABOUT A MOVE. The effect subset (docs/battles.md,
   *Move effects*): damage with multi-hit, priority, crit stage, drain and
   recoil (negative drain); healing; the five major statuses; stat stages;
   flinch. PokéAPI's `meta.category` names the move's kind. */
const SUPPORTED = new Set(["damage", "ailment", "net-good-stats", "heal",
  "damage-ailment", "damage-lower", "damage-raise", "damage-heal"]);
const AILMENTS = ["paralysis", "burn", "poison", "sleep", "freeze"];
const STAT = { attack: 1, defense: 2, "special-attack": 3, "special-defense": 4, speed: 5,
  accuracy: 6, evasion: 7 };
const CLASS = { physical: 0, special: 1, status: 2 };

/* Every move a learnset uses, and every move a League opponent carries in
   its game (leagues.js: a party row's third field). A roster name PokéAPI
   does not know stops the fetch here, naming it, so fetch-leagues can alias it. */
const { LEAGUES } = await import("../src/data/leagues.js");
// Hard mode's teams too (phase 8): a hard row's own moves are the game's, as a first battle's are.
const roster = LEAGUES.flatMap((r) => [...r.gyms, ...r.league])
  .flatMap((o) => [...o.party, ...(o.hard ?? [])].flatMap((p) => p[2] ?? []));
const names = [...new Set([...[...ROWS.values()].flatMap((rows) => rows.map(([, m]) => m)), ...roster])].sort();
const unknown = [];
const raw = (await pool(names, 8, (name) => cached(`move-${name}`, async () => {
  const j = await get(`${API}/move/${name}`);
  if (!j) { unknown.push(name); return null; }
  const meta = j.meta ?? {};
  return {
    name, type: j.type.name, cls: j.damage_class.name, power: j.power ?? 0,
    acc: j.accuracy ?? 0, pp: j.pp ?? 5, pri: j.priority, target: j.target.name,
    cat: meta.category?.name ?? "", ailment: meta.ailment?.name ?? "none",
    ailChance: meta.ailment_chance ?? 0, drain: meta.drain ?? 0, heal: meta.healing ?? 0,
    crit: meta.crit_rate ?? 0, flinch: meta.flinch_chance ?? 0,
    minHits: meta.min_hits ?? 0, maxHits: meta.max_hits ?? 0,
    stats: (j.stat_changes ?? []).map((s) => [s.stat.name, s.change]), statChance: meta.stat_chance ?? 0,
  };
}), "moves")).filter(Boolean);
const missing = names.filter((n) => !raw.some((m) => m.name === n));
if (missing.length) {
  throw new Error(`PokéAPI has no move called: ${missing.join(", ")} - alias them in fetch-leagues.mjs`);
}

let fallback = 0, never = 0;
const MOVES = raw.map((m) => {
  const ail = AILMENTS.indexOf(m.ailment);
  const known = SUPPORTED.has(m.cat) && (m.ailment === "none" || ail >= 0);
  // Omitted fields are zero or false: most moves are a type, a class and a power.
  const o = { n: m.name, t: m.type, c: CLASS[m.cls], pp: m.pp };
  if (m.power) o.p = m.power;
  if (m.acc) o.a = m.acc;                  // absent: never misses
  if (m.pri) o.pr = m.pri;
  if (m.target === "user" || m.target === "users-field" || m.target === "user-and-allies") o.self = 1;
  if (ail >= 0) { o.st = ail; if (m.cls !== "status") o.stc = m.ailChance || 100; }
  if (m.drain) o.dr = m.drain;
  if (m.heal) o.h = m.heal;
  if (m.crit) o.cr = m.crit;
  if (m.flinch) o.fl = m.flinch;
  if (m.maxHits > 1) o.hits = [m.minHits, m.maxHits];
  const stages = m.stats.filter(([s]) => STAT[s]).map(([s, c]) => [STAT[s], c]);
  if (stages.length) {
    o.sg = stages;
    if (m.cls !== "status" && m.statChance) o.sgc = m.statChance;
    // A damaging move whose stages are the user's own: Power-Up Punch raises
    // them, Close Combat lowers them - both are PokéAPI's `damage-raise`.
    if (m.cat === "damage-raise") o.sgu = 1;
  }
  if (!known) {
    if (m.power) { o.fb = 1; fallback++; }   // keeps its damage, loses the side effect
    else { o.no = 1; never++; }              // nothing the rules can do with it
  } else if (!m.power && ail < 0 && !stages.length && !m.heal) { o.no = 1; never++; }
  return o;
});
const INDEX = new Map(MOVES.map((m, i) => [m.n, i]));

// ------------------------------------------------------------------ types

const TYPES = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];
const relations = await pool(TYPES, 6, (t) => cached(`type-${t}`, async () => {
  const d = (await get(`${API}/type/${t}`)).damage_relations;
  return { x2: d.double_damage_to.map((x) => x.name), x05: d.half_damage_to.map((x) => x.name),
    x0: d.no_damage_to.map((x) => x.name) };
}), "types");
const CHART = relations.map((r) => TYPES.map((d) =>
  r.x0.includes(d) ? 0 : r.x2.includes(d) ? 2 : r.x05.includes(d) ? 0.5 : 1));

// ------------------------------------------------------------------ write

const head = (what) => `// Generated by tools/fetch-moves.mjs from PokéAPI - do not edit by hand.\n// ${what}\n`;
const learnBody = [...ROWS].map(([id, rows]) =>
  `${id}:[${rows.map(([lv, m]) => lv * 1000 + INDEX.get(m)).join(",")}]`).join(",\n");
writeFileSync(new URL("src/data/learnsets.js", ROOT), head(
  "Per dex id, level-up moves as level * 1000 + index into MOVES (moves.js), in level order.") +
  `export const LEARNSETS = {\n${learnBody}\n};\n`);
writeFileSync(new URL("src/data/moves.js", ROOT), head(
  "n name, t type, c class (0 physical 1 special 2 status), p power, a accuracy (absent: never " +
  "misses), pp, pr priority,\n// self targets the user, st status (0 par 1 brn 2 psn 3 slp 4 frz) " +
  "and stc its chance, dr drain (negative: recoil), h heal %,\n// cr crit stage, fl flinch %, hits " +
  "[min, max], sg [[stat, stages]] (1 atk .. 5 spe, 6 acc, 7 eva), sgc its chance and sgu\n// " +
  "when a damaging move's stages are the user's own, fb keeps " +
  "its damage and loses an effect the rules lack, no is never chosen.") +
  `export const MOVES = [\n${MOVES.map((m) => JSON.stringify(m)).join(",\n")}\n];\n`);
writeFileSync(new URL("src/data/types.js", ROOT), head("CHART[attacker][defender], both indexing TYPES.") +
  `export const TYPES = ${JSON.stringify(TYPES)};\n` +
  `export const CHART = [\n${CHART.map((r) => JSON.stringify(r)).join(",\n")}\n];\n`);

console.log(`  ${SPECIES.length} learnsets (${borrowed.length} forms take their species'), ` +
  `${MOVES.length} moves: ${fallback} keep only their damage, ${never} are never chosen`);
