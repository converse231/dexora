// Run once:  node tools/fetch-species.mjs
// Pulls the Gen 1 facts we need from PokeAPI (no key, no account) and saves the
// FireRed/LeafGreen sprites locally so the game works offline.
import { writeFile, mkdir } from "node:fs/promises";

const API = "https://pokeapi.co/api/v2";
const GH = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
const FRLG = `${GH}/versions/generation-iii/firered-leafgreen`;

const tierOf = (r) => (r >= 200 ? "C" : r >= 100 ? "B" : r >= 45 ? "A" : "S");

// Dex text is hyphenated with soft hyphens and page-broken with form feeds.
const clean = (t) => t.replace(/­/g, "").replace(/\s+/g, " ").trim();

/* `where` is "" for the ordinary sprite and "shiny/" for the alternate palette.
   FireRed's own art first, so a shiny matches the game the tiles came from, then
   the generic sprite as a fallback - both exist for all 151. */
async function sprite(id, where = "") {
  for (const url of [`${FRLG}/${where}${id}.png`, `${GH}/${where}${id}.png`]) {
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

  // Prefer the FireRed entry so the flavour text matches the sprites.
  const en = sp.flavor_text_entries.filter((e) => e.language.name === "en");
  const entry = en.find((e) => /firered|leafgreen/.test(e.version.name)) ?? en[0];
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
for (let i = 1; i <= 151; i += 8) {
  // ponytail: batches of 8, polite to a free API. Raise it if you get impatient.
  const batch = [];
  for (let id = i; id < i + 8 && id <= 151; id++) batch.push(one(id));
  out.push(...(await Promise.all(batch)));
  process.stdout.write(`\rfetched ${out.length}/151`);
}

await writeFile("src/data/species.js", `export const SPECIES = ${JSON.stringify(out)};\n`);
console.log(`\nwrote src/data/species.js (${out.length} species) and public/sprites/ (normal + shiny)`);
