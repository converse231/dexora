/* SUGGEST A TEAM: one answer for the League's team pick and ranked's editor.

   A STYLE scores each candidate, then the team is built greedily so it is a
   TEAM and not six copies of the best Pokemon: a candidate sharing a type
   with the picks so far is worth less, and so is one that would make three
   weak to the same attack.

     balanced  base stat total, spread across types and weaknesses
     attack    its better attacking stat and its Speed
     defense   HP and both defences
     counter   (a known opponent) its types against theirs, both ways

   A LINEUP is a famous trainer's team: each member is found in your Box -
   that species, or failing it any of its evolution line - and a slot you
   cannot fill takes the balanced pick, which the answer names. Ash's and
   Gary's are the anime's, each species checked against its trainer's
   Pokemon on Bulbapedia (2026-09-30; Gary's Golem is not listed there, so
   his lineup does not have one); Red's is Mt. Silver's in HeartGold and
   SoulSilver; the Champions' are read off leagues.js, never typed.

   `level` weighs in the League (a Pokemon's stats grow with it); ranked sets
   every level, so there the species alone decides. `kin` is who counts as
   the same Pokemon: the species in the League, `baseOf` (the species
   clause) in ranked. */
import { speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { effectiveness } from "../../game/battle.js";
import { TYPES } from "../../data/types.js";
import { LEAGUES } from "../../data/leagues.js";
import { EVOLUTIONS } from "../../data/evolutions.js";

export const STYLES = [
  ["balanced", "Balanced"],
  ["attack", "All-out attack"],
  ["defense", "Wall of defense"],
  ["counter", "Counter their team"],
];

/* Famous lineups, by dex id with the name as its game writes it (check.mjs
   holds each id to its name, so a typo cannot pick the wrong Pokemon). */
const FAMOUS = [
  ["ash-kanto", "Ash · Kanto", [[25, "Pikachu"], [12, "Butterfree"], [18, "Pidgeot"], [1, "Bulbasaur"], [6, "Charizard"], [7, "Squirtle"]]],
  ["ash-johto", "Ash · Johto", [[25, "Pikachu"], [155, "Cyndaquil"], [158, "Totodile"], [153, "Bayleef"], [214, "Heracross"], [164, "Noctowl"]]],
  ["ash-hoenn", "Ash · Hoenn", [[25, "Pikachu"], [254, "Sceptile"], [277, "Swellow"], [341, "Corphish"], [324, "Torkoal"], [362, "Glalie"]]],
  ["ash-sinnoh", "Ash · Sinnoh", [[25, "Pikachu"], [392, "Infernape"], [389, "Torterra"], [398, "Staraptor"], [418, "Buizel"], [472, "Gliscor"]]],
  ["ash-unova", "Ash · Unova", [[25, "Pikachu"], [495, "Snivy"], [501, "Oshawott"], [499, "Pignite"], [553, "Krookodile"], [521, "Unfezant"]]],
  ["ash-kalos", "Ash · Kalos", [[25, "Pikachu"], [658, "Greninja"], [663, "Talonflame"], [701, "Hawlucha"], [706, "Goodra"], [715, "Noivern"]]],
  ["ash-alola", "Ash · Alola", [[25, "Pikachu"], [722, "Rowlet"], [745, "Lycanroc"], [727, "Incineroar"], [804, "Naganadel"], [809, "Melmetal"]]],
  ["ash-journeys", "Ash · World Champion", [[25, "Pikachu"], [448, "Lucario"], [149, "Dragonite"], [94, "Gengar"], [865, "Sirfetch'd"], [882, "Dracovish"]]],
  ["gary", "Gary · rival", [[9, "Blastoise"], [59, "Arcanine"], [31, "Nidoqueen"], [126, "Magmar"], [212, "Scizor"], [466, "Electivire"]]],
  ["red", "Red · Mt. Silver", [[25, "Pikachu"], [196, "Espeon"], [143, "Snorlax"], [3, "Venusaur"], [6, "Charizard"], [9, "Blastoise"]]],
];
export const FAMOUS_LINEUPS = FAMOUS;

// Every region's Champion, from the rosters - one of each species, in their order.
const CHAMPIONS = LEAGUES.map((r) => {
  const c = r.league.find((p) => p.champion);
  return [`champ-${r.id}`, `${c.name} · ${r.name} Champion`, [...new Set(c.party.map(([id]) => id))].map((id) => [id, null])];
});
export const LINEUPS = [...FAMOUS, ...CHAMPIONS];

// A Pokemon's evolution line, as its first stage: a lineup's Charizard is met by your Charmeleon.
const PARENT = new Map();
for (const e of EVOLUTIONS) if (!PARENT.has(e.to)) PARENT.set(e.to, e.from);
export const lineOf = (id) => {
  let x = speciesById(id)?.of ?? id;
  for (let g = 0; g < 8 && PARENT.has(x); g++) x = PARENT.get(x);
  return x;
};

const typeIdx = (types) => types.map((t) => TYPES.indexOf(t));
const hitBest = (mine, theirs) => Math.max(...mine.map((t) => effectiveness(t, typeIdx(theirs))));
const takes = (att, mine) => effectiveness(att, typeIdx(mine));

/* WHAT ONE CANDIDATE IS WORTH in a style, before the team around it. */
function worth(m, style, foes) {
  const sp = speciesById(m.species);
  const [hp, at, df, sa, sd, spe] = sp.stats;
  const lv = (m.level ?? 100) / 100;
  if (style === "attack") return (Math.max(at, sa) * 1.2 + spe * 0.8) * lv;
  if (style === "defense") return (hp + (df + sd) * 0.9) * lv;
  const bst = hp + at + df + sa + sd + spe;
  if (style === "counter" && foes?.length) {
    const off = foes.reduce((n, f) => n + hitBest(sp.types, f), 0) / foes.length;
    const def = foes.flat().reduce((n, t) => n + takes(t, sp.types), 0) / foes.flat().length;
    return bst * lv * (0.6 + 0.4 * off) / (0.7 + 0.3 * def);
  }
  return bst * lv;
}

/* THE TEAM AROUND IT: a type the picks already have, or a weakness three
   would share, costs a sixth each. */
function fits(m, team) {
  const types = speciesById(m.species).types;
  let k = 1;
  for (const t of types) if (team.some((p) => speciesById(p.species).types.includes(t))) k *= 0.85;
  for (const att of TYPES) {
    if (takes(att, types) <= 1) continue;
    if (team.filter((p) => takes(att, speciesById(p.species).types) > 1).length >= 2) k *= 0.85;
  }
  return k;
}

function greedy(pool, size, style, foes, kin, team = []) {
  const used = new Set(team.map((m) => kin(m.species)));
  const score = new Map(pool.map((m) => [m, worth(m, style, foes)]));
  while (team.length < size) {
    let best = null, bestV = -1;
    for (const m of pool) {
      if (used.has(kin(m.species))) continue;
      const v = score.get(m) * fits(m, team);
      if (v > bestV) { best = m; bestV = v; }
    }
    if (!best) break;
    team.push(best);
    used.add(kin(best.species));
  }
  return team;
}

/* `mons` are the Pokemon allowed in (already filtered by the fight's rules),
   `foes` each opposing member's types (names) when the opponent is known.
   Answers `{ team, missing }`: `missing` names a lineup's members you do not
   have, their slots filled by the balanced pick. */
export function suggestTeam(mons, { size, style = "balanced", foes = null, kin = (id) => id } = {}) {
  const lineup = LINEUPS.find(([id]) => id === style);
  if (!lineup) return { team: greedy(mons, size, style, foes, kin), missing: [] };
  const team = [], missing = [];
  const used = new Set();
  for (const [id, name] of lineup[2].slice(0, size)) {
    const same = (m) => !used.has(kin(m.species));
    const best = (list) => list.filter(same).sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];
    const got = best(mons.filter((m) => m.species === id)) ?? best(mons.filter((m) => lineOf(m.species) === lineOf(id)));
    if (got) { team.push(got); used.add(kin(got.species)); } else missing.push(name ?? label(speciesById(id)));
  }
  return { team: greedy(mons, size, "balanced", foes, kin, team), missing };
}
