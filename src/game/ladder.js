/* THE ARENA LADDER (the Arena plan, phase 2): ten masters, beaten in order,
   each on one of the Arena's floors with a team of one type, ending on the
   Arena Champion. The engine judges and pays a master from this file alone
   (`arenaMaster`) - it never imports the Arena's rules, which carry the
   League's data - and the Arena page reads the same list.

   IDS NEVER CHANGE (the save's `ladder` keys on them) and the list is
   append-only. A team is typed by dex id WITH the name it was checked by
   (check.mjs holds each id to its `label`, as suggest.js's lineups are); the
   Arena puts each at the stage its level reaches. A master is a title, never
   a person: no real trainer is impersonated.

   WHAT A FIRST WIN PAYS: once, LADDER_YEN x its level - the ten together are
   held under a quarter of one day's road trainers by check.mjs - and the
   Champion adds a card pack. */
export const LADDER_YEN = 80;
// How many fight a side in the Arena: the save's `arenaTeam` holds at most this many.
export const ARENA_TEAM = 3;

export const LADDER = [
  { id: "court", name: "Court Master", arena: "indigo", level: 20, cpu: "normal", type: "normal",
    team: [[16, "pidgey"], [52, "meowth"], [133, "eevee"]] },
  { id: "cavern", name: "Cavern Master", arena: "moon", level: 28, cpu: "normal", type: "rock",
    team: [[74, "geodude"], [95, "onix"], [111, "rhyhorn"]] },
  { id: "tide", name: "Tide Master", arena: "seaside", level: 36, cpu: "normal", type: "water",
    team: [[54, "psyduck"], [72, "tentacool"], [98, "krabby"]] },
  { id: "caldera", name: "Caldera Master", arena: "caldera", level: 44, cpu: "hard", type: "fire",
    team: [[58, "growlithe"], [77, "ponyta"], [126, "magmar"]] },
  { id: "grove", name: "Grove Master", arena: "grove", level: 52, cpu: "hard", type: "grass",
    team: [[43, "oddish"], [123, "scyther"], [102, "exeggcute"]] },
  { id: "rink", name: "Rink Master", arena: "rink", level: 60, cpu: "hard", type: "ice",
    team: [[86, "seel"], [215, "sneasel"], [220, "swinub"]] },
  { id: "storm", name: "Storm Master", arena: "indigo", level: 68, cpu: "hard", type: "electric",
    team: [[81, "magnemite"], [125, "electabuzz"], [179, "mareep"]] },
  { id: "shadow", name: "Shadow Master", arena: "moon", level: 76, cpu: "champion", type: "ghost",
    team: [[92, "gastly"], [228, "houndour"], [200, "misdreavus"]] },
  { id: "dragon", name: "Dragon Master", arena: "caldera", level: 86, cpu: "champion", type: "dragon",
    team: [[147, "dratini"], [371, "bagon"], [443, "gible"]] },
  { id: "champion", name: "Arena Champion", arena: "indigo", level: 100, cpu: "champion", type: "dragon",
    team: [[149, "dragonite"], [248, "tyranitar"], [445, "garchomp"]] },
];

export const masterOf = (id) => LADDER.find((m) => m.id === id) ?? null;
export const ladderPay = (m) => (m ? m.level * LADDER_YEN : 0);
/* MAY THIS ONE BE FOUGHT? In order: the first not yet beaten, and any
   already beaten again (for the practice; it never pays twice). */
export function ladderOpen(id, beaten = []) {
  const k = LADDER.findIndex((m) => m.id === id);
  if (k < 0) return false;
  return LADDER.slice(0, k).every((m) => beaten.includes(m.id));
}
// The save's `ladder`: known ids, each once, in the list's order.
export const cleanLadder = (v) => (Array.isArray(v) ? LADDER.map((m) => m.id).filter((id) => v.includes(id)) : []);
