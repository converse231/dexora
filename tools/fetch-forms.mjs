// Run after fetch-species.mjs:  node tools/fetch-forms.mjs
//
// MEGA, PRIMAL AND GIGANTAMAX ARE SPECIES HERE, NOT A FIFTH RARE TIER.
//
// They have to be, because of what the game already is: `mon.species` is a dex
// id, `evolve(uid, targetId)` mutates that id in place, and every table, medal
// and dex row is keyed on it. A form that is an evolution TARGET is therefore a
// species with its own id, types, art and stats - which is exactly what PokeAPI
// already serves them as, at ids in the 10000s, well clear of the National Dex.
// Making them a tier instead would have put them in `TIERS`, which is the roll's
// precedence and the save's byte arrays, and they are neither: a tier is a thing
// that HAPPENS to a Pokemon you meet, and this is a thing you spend a hundred
// levels to do on purpose.
//
// THE BASE MUST BE A SPECIES WE SHIP, and that one rule does all the filtering.
// PokeAPI carries 131 of these and some are forms OF forms -
// `magearna-original-mega`, `tatsugiri-curly-mega` - whose base is itself a
// variety rather than a dex entry. Rather than curate a list by hand (which
// would need revisiting every time PokeAPI grows one), anything whose base name
// is not in `SPECIES` is dropped, which is the same reachability rule the rest
// of the dex is held to.
import { writeFile, mkdir } from "node:fs/promises";
import { SPECIES } from "../src/data/species.js";

const API = "https://pokeapi.co/api/v2";
const GH = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

// The suffixes that mean "a form you evolve INTO at Lv 100", longest first so
// `-mega-x` is not read as `-mega` with a stray `-x`.
const KINDS = [
  ["-mega-x", "mega"], ["-mega-y", "mega"], ["-mega", "mega"],
  ["-primal", "primal"], ["-gmax", "gmax"], ["-eternamax", "gmax"],
];

const byName = new Map(SPECIES.map((sp) => [sp.name, sp]));
const tierOf = (r) => (r >= 200 ? "C" : r >= 100 ? "B" : r >= 45 ? "A" : "S");

async function sprite(name) {
  const res = await fetch(`${GH}/other/home/${name}.png`).catch(() => null);
  return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

async function one(name, base, kind) {
  const pk = await fetch(`${API}/pokemon/${name}`).then((r) => r.json());
  const png = await fetch(`${GH}/${pk.id}.png`);
  if (!png.ok) return null;                       // no art, no form
  const shiny = await fetch(`${GH}/shiny/${pk.id}.png`);
  await writeFile(`public/sprites/${pk.id}.png`, Buffer.from(await png.arrayBuffer()));
  if (shiny.ok) {
    await writeFile(`public/sprites/shiny/${pk.id}.png`,
      Buffer.from(await shiny.arrayBuffer()));
  }
  const stat = (n) => pk.stats.find((s) => s.stat.name === n)?.base_stat ?? 0;
  /* THE CATCH RATE IS THE BASE'S, and it is never used - a form is not
     something you meet in the grass (see `form` below, and `encounterTable`'s
     exclusion). It is carried so `sellValue` and `candyValue` have a tier to
     read, and it is the BASE's tier so evolving into one cannot mint money. */
  return {
    id: pk.id,
    name: pk.name,
    types: pk.types.map((t) => t.type.name),
    rate: base.rate,
    tier: base.tier,
    from: base.name,
    form: kind,
    of: base.id,
    genus: kind === "gmax" ? "Gigantamax Pokémon"
      : kind === "primal" ? "Primal Pokémon" : "Mega Pokémon",
    flavor: base.flavor,
    height: pk.height,
    weight: pk.weight,
    stats: ["hp", "attack", "defense", "special-attack", "special-defense", "speed"]
      .map(stat),
  };
}

const list = await fetch(`${API}/pokemon?limit=1500&offset=1025`).then((r) => r.json());
const want = [];
for (const { name } of list.results) {
  for (const [suffix, kind] of KINDS) {
    if (!name.endsWith(suffix)) continue;
    const base = byName.get(name.slice(0, -suffix.length));
    if (base) want.push({ name, base, kind });
    break;                                        // longest suffix wins
  }
}

await mkdir("public/sprites/shiny", { recursive: true });
const out = [];
for (let i = 0; i < want.length; i += 8) {
  const got = await Promise.all(
    want.slice(i, i + 8).map((w) => one(w.name, w.base, w.kind)));
  out.push(...got.filter(Boolean));
  process.stdout.write(`\rfetched ${out.length}/${want.length}`);
}
out.sort((a, b) => a.id - b.id);

await writeFile("src/data/forms.js", `export const FORMS = ${JSON.stringify(out)};\n`);
const kinds = out.reduce((n, f) => ({ ...n, [f.form]: (n[f.form] ?? 0) + 1 }), {});
console.log(`\nwrote src/data/forms.js — ${out.length} forms ` +
  `(${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(", ")}) ` +
  `over ${new Set(out.map((f) => f.of)).size} species`);
