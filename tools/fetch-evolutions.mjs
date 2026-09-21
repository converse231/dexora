/* node tools/fetch-evolutions.mjs — evolution requirements from PokeAPI.

   Writes src/data/evolutions.js: for every Gen 1 species that evolves, what it
   becomes and what the real games ask for. We need the *method*, not just the
   pairing, because the game charges you by it: a level-up evolution costs its
   level in duplicates, a stone evolution costs a stone.

   PokeAPI reports today's requirements, not Red/Blue's, which is what we want -
   Pikachu takes a Thunder Stone in both, but the API is the one that also knows
   Eevee has three stone branches. Anything pointing outside the SHIPPED ids is
   dropped, and that list has a hole in it - Gen 3 is not in this game, so
   Roserade keeps its row only if Roselia ships, which it does not. Those
   species are not lost; they need a wild table entry instead, and check.mjs is
   what says so. */

import { writeFile } from "node:fs/promises";

const API = "https://pokeapi.co/api/v2";

/* READ OFF WHAT ACTUALLY SHIPPED, never a second copy of the ranges.

   This held its own `RANGES` literal, "duplicated rather than imported because
   these two scripts are run independently" - and it drifted, exactly as a
   second copy of anything in this codebase does. It still read
   `[[1,151],[152,251],[387,493]]` after Hoenn landed, so **135 Hoenn species
   shipped with zero evolution rows**: Treecko could not become Grovyle, and
   nothing failed, because check.mjs's gettable-check is satisfied by a species
   being in a biome table and every Hoenn species is homed by type.

   species.js is written before this runs (`npm run assets` orders them), so
   importing it is not a missing-import risk - it is the only thing that knows
   what shipped. The base dex, not the merged one: PokeAPI has no chains for
   the Mega and Gigantamax forms, which get their rows from `formRows` below. */
/* AND A STONE ROW IS ONLY A STONE IF WE SELL THE STONE. Anything else is a
   `bond`, which is the same collapse every other unexpressible method takes.

   This emitted `kind: "stone"` for ANY held-item trigger, which was safe while
   the only ones that existed were the eight on the shelf. The rest of the dex
   brings twelve more - black-augurite, tart-apple, malicious-armor, a cracked
   pot - and each one would have become an evolution gated on an item that is
   not in the game: check.mjs calls that out, correctly, as "an unbuyable stone
   is not a hard evolution, it is an impossible one". Reading `STONES` means the
   shop decides, so adding a stone to the shelf is what promotes its evolutions
   from `bond`, and shipping a generation never strands a line. */
const { STONES } = await import("../src/game/items.js");
const SELLS = new Set(STONES.map((s) => s.id));

const { SPECIES: SHIPPED_SPECIES } = await import("../src/data/species.js");
const SHIPPED = new Set(SHIPPED_SPECIES.map((sp) => sp.id));
const ids = [...SHIPPED];

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

const idOf = (url) => Number(url.match(/\/(\d+)\/?$/)[1]);

// Every chain a shipped species belongs to, fetched once each.
const chainUrls = new Set();
for (let i = 0; i < ids.length; i += 8) {
  const batch = await Promise.all(
    ids.slice(i, i + 8).map((id) => get(`${API}/pokemon-species/${id}`)));
  for (const sp of batch) chainUrls.add(sp.evolution_chain.url);
  process.stdout.write(`\r  species ${Math.min(i + 8, ids.length)}/${ids.length}`);
}
console.log();
console.log(`  ${chainUrls.size} distinct evolution chains`);

/* One row per edge. `kind` is what the player has to do about it; everything
   else is the detail that kind needs. */
const rows = [];

/* PokeAPI's chains are not all evolutions. Phione and Manaphy share a chain
   because one can be BRED from the other, and the walk below reads that as
   Phione -> Manaphy. The species record is the authority: if the target does
   not name the source as what it evolves from, the edge is not an evolution.

   Checked against the species file we just wrote rather than by another
   request, and check.mjs asserts the same thing independently - which is how
   this was found. */
const { SPECIES } = await import("../src/data/species.js");
const spById = new Map(SPECIES.map((sp) => [sp.id, sp]));
const realEdge = (from, to) =>
  spById.get(to)?.from === spById.get(from)?.name;

function walk(node) {
  const from = idOf(node.species.url);
  for (const next of node.evolves_to) {
    const to = idOf(next.species.url);
    // evolution_details is a list of alternatives; the first is the classic one.
    const d = next.evolution_details[0] ?? {};
    const trigger = d.trigger?.name ?? "level-up";

    if (SHIPPED.has(from) && SHIPPED.has(to) && realEdge(from, to)) {
      if (trigger === "use-item" && d.item && SELLS.has(d.item.name)) {
        rows.push({ from, to, kind: "stone", item: d.item.name });
      } else if (trigger === "trade") {
        rows.push({ from, to, kind: "trade" });
      } else if (d.min_level) {
        rows.push({ from, to, kind: "level", level: d.min_level });
      } else {
        /* EVERYTHING ELSE IS ONE KIND, and that is the whole scalability
           answer for evolution methods.

           Gen 2 brought happiness and time of day, Gen 4 brought a held item
           on a trade, a move in the moveset, a place on the map, and the
           Sinnoh stones. A game with no clock, no moves and no map transitions
           cannot express any of them, and a table of per-method rules grows
           every generation forever.

           So they collapse to `bond` - "keep raising it" - and `evoLevel`
           already gives any row without a level a synthetic one derived from
           its parent. A Gen 5 method nobody has thought of yet lands here on
           the day it ships, with nothing edited.

           This used to throw. Throwing was right while Gen 1 was all that
           shipped and nothing could reach this branch; it would now reject
           about a third of Johto. */
        rows.push({ from, to, kind: "bond" });
      }
    }
    walk(next);
  }
}

for (const url of chainUrls) walk((await get(url)).chain);

/* MEGA, PRIMAL AND GIGANTAMAX ARE ROWS LIKE ANY OTHER, at a level of 100.

   PokeAPI has no evolution chain for them - they are battle FORMS there, not
   evolutions - so nothing above can find them and they are added here from
   forms.js instead. They need no new machinery at all: `evoLevel` already
   returns `row.level` when a row carries one, `stoneFor` already returns null
   for a kind that is not "stone", and `evolveState` already gates on the
   Pokemon's own level. A row with `level: 100` is simply the dearest evolution
   in the game.

   AND 100 IS A REAL PRICE. Evolving costs `evoLevel - level` in Rare Candy, so
   a form is about a hundred candy on top of whatever the line already cost -
   which is the late-game sink the economy was short of, and the reason this is
   a level rather than a new item. The branch is a CHOICE and it is permanent:
   Charizard reaches 100 and becomes Mega X or Mega Y, never both, which the
   Box's existing branch UI already handles because Slowpoke taught it to. */
const FORM_LEVEL = 100;
const { FORMS } = await import("../src/data/forms.js");
for (const f of FORMS) {
  /* A WILD FORM GETS NO ROW, AND THAT ABSENCE IS THE WHOLE MECHANISM.

     An Alolan Vulpix is not something you make, it is something that lives in
     the snow - so it must not be an evolution target. Writing no row is not
     merely "skipping" it: `derivedHomes` builds its candidate pool as
     everything that is NOT in `EVOLUTIONS.to` and not legendary, so a form
     with no row falls into the wild pool BY CONSTRUCTION and gets homed on its
     own types like any other species. Nothing had to be told about it.

     It is also what keeps the other half honest. The evolution overlay refuses
     `isForm(to)` so a Mega can never be met in the grass; a wild form never
     reaches that code at all, because there is no edge to walk. Two families,
     one field, and neither can leak into the other. */
  if (f.wild) continue;
  rows.push({ from: f.of, to: f.id, kind: f.form, level: FORM_LEVEL });
}

rows.sort((a, b) => a.from - b.from || a.to - b.to);

const body = rows
  .map((r) => "  " + JSON.stringify(r))
  .join(",\n");

await writeFile(
  "src/data/evolutions.js",
  `// Generated by tools/fetch-evolutions.mjs — do not edit by hand.\n` +
  `// kind: "level" (needs .level) | "stone" (needs .item) | "trade"\n` +
  `//       | "mega" | "primal" | "gmax" (a form, always .level ${FORM_LEVEL})\n` +
  `export const EVOLUTIONS = [\n${body},\n];\n`,
);

const byKind = rows.reduce((m, r) => ((m[r.kind] = (m[r.kind] ?? 0) + 1), m), {});
console.log(`evolutions -> src/data/evolutions.js`);
console.log(`  ${rows.length} edges:`, byKind);
console.log(`  stones:`, [...new Set(rows.filter((r) => r.item).map((r) => r.item))].join(", "));
console.log(`  levels: ${Math.min(...rows.filter((r) => r.level).map((r) => r.level))}` +
            `..${Math.max(...rows.filter((r) => r.level).map((r) => r.level))}`);
