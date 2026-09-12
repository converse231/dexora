// node tools/fetch-items.mjs — item sprites from PokeAPI (no key needed).
import { writeFile, mkdir } from "node:fs/promises";
const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items";

/* Every ball in src/game/items.js, and the list must stay in step with it -
   a ball with no sprite is a broken image on the rail and in the shop. The
   four situational ones were added with the tier; check.mjs asserts the two
   lists match, so a ball added in one place fails the suite rather than
   shipping as a grey square. */
const BALLS = [
  "poke-ball", "great-ball", "net-ball", "repeat-ball",
  "ultra-ball", "dusk-ball", "timer-ball", "master-ball",
];
// The five Gen 1 evolution stones. There is no sprite for a link cable in the
// PokeAPI set, so the four trade evolutions cost extra duplicates instead of an
// item - see TRADE_FEED in src/game/items.js.
const TOOLS = [
  "fire-stone", "water-stone", "thunder-stone", "leaf-stone", "moon-stone",
];
/* Key items: earned at a trainer level, never bought, never used up.

   `running-shoes` used to be on this list and is NOT an item in this game -
   running is gated on trainer level, because Gen 3 grants it invisibly and
   PokeAPI has no sprite for it. It 404'd, and since this script threw on the
   first miss it died there every run, leaving the three rods unfetched and the
   error looking like a network problem. Misses are collected now and reported
   together at the end, so one bad name cannot hide the rest of the list. */
const KEYS = ["bicycle", "old-rod", "good-rod", "super-rod"];
/* Rare Candy is a CURRENCY here, not a bag item - it is spent per level and
   lives beside the money in the top bar rather than in the bag. It still wants
   its real sprite: the shop row and the Box buttons were drawing a text star,
   and a drawn star next to eight real item icons reads as a placeholder. */
const CURRENCY = ["rare-candy"];

await mkdir("public/items", { recursive: true });
const missing = [];
for (const name of [...BALLS, ...TOOLS, ...KEYS, ...CURRENCY]) {
  const res = await fetch(`${BASE}/${name}.png`);
  if (!res.ok) {
    missing.push(`${name} (${res.status})`);
    continue;
  }
  await writeFile(`public/items/${name}.png`, Buffer.from(await res.arrayBuffer()));
  console.log("  saved", name);
}
if (missing.length) throw new Error(`no sprite for: ${missing.join(", ")}`);
console.log(`${BALLS.length + TOOLS.length + KEYS.length} item sprites -> public/items/`);
