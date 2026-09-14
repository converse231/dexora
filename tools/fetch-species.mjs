// Run once:  node tools/fetch-species.mjs
// Pulls the facts we need from PokeAPI (no key, no account) and saves the
// sprites locally so the game works offline.
//
// THE RANGES ARE A LIST, AND GEN 3 IS DELIBERATELY ABSENT. Nothing downstream
// may assume the dex is contiguous or that it starts at 1 and ends at its own
// length - `genOf` reads GEN_LAST, `dex` is indexed by position rather than by
// id, and check.mjs asserts both. Skipping a generation is the cheapest
// possible test of that, which is why it is skipped.
import { writeFile, mkdir } from "node:fs/promises";

const API = "https://pokeapi.co/api/v2";
const GH = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const FRLG = `${GH}/versions/generation-iii/firered-leafgreen`;
const HGSS = `${GH}/versions/generation-iv/heartgold-soulsilver`;

/* Which generations ship, and where each one's ART comes from.

   FireRed drew the whole National Dex of its day, so 1-251 is one consistent
   set of 64x64 sprites and Gen 2 costs nothing to match. Gen 4 did not exist
   yet; HeartGold/SoulSilver is the closest 2D set and is 80x80, so those get
   reframed to 64 by build_origin.py - the same fit the Origin art already
   goes through, for the same reason. */
const RANGES = [[1, 151], [152, 251], [387, 493]];
const artFor = (id) => (id <= 386 ? FRLG : HGSS);

const tierOf = (r) => (r >= 200 ? "C" : r >= 100 ? "B" : r >= 45 ? "A" : "S");

// Dex text is hyphenated with soft hyphens and page-broken with form feeds.
const clean = (t) => t.replace(/­/g, "").replace(/\s+/g, " ").trim();

/* `where` is "" for the ordinary sprite and "shiny/" for the alternate palette.
   FireRed's own art first, so a shiny matches the game the tiles came from, then
   the generic sprite as a fallback - both exist for all 151. */
async function sprite(id, where = "") {
  for (const url of [`${artFor(id)}/${where}${id}.png`, `${GH}/${where}${id}.png`]) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`no ${where || "normal"} sprite for ${id}`);
}

async function one(id) {
  const [sp, pk, png, shiny] = await Promise.all([
    fetch(`${API}/pokemon-species/${id}`).then((r) => r.json()),
    fetch(`${API}/pokemon/${id}`).then((r) => r.json()),
    sprite(id),
    sprite(id, "shiny/"),
  ]);
  await writeFile(`public/sprites/${id}.png`, png);
  await writeFile(`public/sprites/shiny/${id}.png`, shiny);

  /* Prefer the entry from the game the sprites came from, so the words and the
     picture are from the same place. Falls through to anything English: a Gen 4
     species has no FireRed entry to find. */
  const en = sp.flavor_text_entries.filter((e) => e.language.name === "en");
  const entry = en.find((e) => /firered|leafgreen/.test(e.version.name))
    ?? en.find((e) => /heartgold|soulsilver|platinum|diamond|pearl/.test(e.version.name))
    ?? en[0];
  const stat = (n) => pk.stats.find((s) => s.stat.name === n)?.base_stat ?? 0;

  return {
    id,
    name: sp.name,
    types: pk.types.map((t) => t.type.name),
    rate: sp.capture_rate,
    tier: tierOf(sp.capture_rate),
    from: sp.evolves_from_species?.name ?? null,
    genus: clean(sp.genera.find((g) => g.language.name === "en")?.genus ?? ""),
    flavor: clean(entry?.flavor_text ?? ""),
    height: pk.height, // decimetres
    weight: pk.weight, // hectograms
    stats: [
      stat("hp"), stat("attack"), stat("defense"),
      stat("special-attack"), stat("special-defense"), stat("speed"),
    ],
  };
}

await mkdir("public/sprites/shiny", { recursive: true });
await mkdir("src/data", { recursive: true });

const out = [];
const ids = RANGES.flatMap(([lo, hi]) =>
  Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
for (let i = 0; i < ids.length; i += 8) {
  // ponytail: batches of 8, polite to a free API. Raise it if you get impatient.
  out.push(...(await Promise.all(ids.slice(i, i + 8).map(one))));
  process.stdout.write(`\rfetched ${out.length}/${ids.length}`);
}

await writeFile("src/data/species.js", `export const SPECIES = ${JSON.stringify(out)};\n`);
console.log(`\nwrote src/data/species.js (${out.length} species) and public/sprites/ (normal + shiny)`);
