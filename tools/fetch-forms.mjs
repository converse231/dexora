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

/* AND THE OTHER HALF OF THE FAMILY IS MET, NOT MADE.
   ===================================================

   A Mega is something you DO to a Pokemon; an Alolan Vulpix is something that
   LIVES somewhere. The file above treated every 10000-id as the first kind,
   because for a long time every one of them was - and that is why the game
   shipped no regional form at all and it was reported as never meeting one.

   So a form now declares `wild`, and that single field is what decides
   whether it is an evolution target at Lv 100 or a row in an encounter table.
   Megas, Primals and Gigantamax keep everything they had.

   THE GENERATION IS THE FORM'S OWN, NOT ITS BASE'S, and that is the one place
   a wild form must NOT read through. `genOf` reads a Mega through to its base
   because a Mega's own id is in the 10000s and would otherwise file under the
   last generation - and it costs nothing, because a Mega is never in a table
   for `fitShares` to balance. A wild form IS in a table: all 18 Alolan forms
   and all 13 costume Pikachu have Gen 1 bases, so reading through would drop
   31 new rows into the generation this game has fought hardest to stop
   dominating. Filing them where they were actually introduced puts them in
   Gen 6-9, which are thin, and gates them behind those generations' arrival
   levels - which is also what they are: a late find, not a starting one. */
const REGIONS = [
  ["-alola", "alolan", "Alolan", 7],
  ["-galar", "galarian", "Galarian", 8],
  ["-hisui", "hisuian", "Hisuian", 8],
  ["-paldea", "paldean", "Paldean", 9],
];

/* MATCHED ANYWHERE, NOT AS A SUFFIX, because three of them carry a tail:
   `darmanitan-galar-standard` and the three `tauros-paldea-*-breed`. A plain
   `endsWith` misses all four, which is how a first pass came back with 53
   regional forms instead of 57. The base is everything before the marker. */
const REGION_AT = (name) => {
  for (const [mark, kind, word, gen] of REGIONS) {
    const at = name.indexOf(mark);
    if (at < 0) continue;
    const tail = name.slice(at + mark.length);
    /* `-zen` is Galarian Darmanitan's BATTLE form - a transformation, like a
       Mega, not a place - so it is dropped the way `-mega` would be. The three
       Paldean Tauros breeds are kept: those are three distinct Pokemon, each
       with its own types, and all three are catchable. */
    if (tail === "-zen") return null;
    /* "-combat-breed" -> "Combat". Only the Paldean Tauros keep one: the three
       breeds are three Pokemon and the name is all that separates them.
       `-standard` is dropped - it is Galarian Darmanitan's ordinary state,
       named only because a `-zen` exists to contrast with, and "Galarian
       Darmanitan (Standard)" is a database row talking about itself. */
    const extra = tail.replace(/-breed$/, "").replace(/^-standard$/, "").replace(/^-/, "");
    return {
      base: name.slice(0, at), kind, word, gen,
      tail: extra ? extra.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : "",
    };
  }
  return null;
};

/* THE COSTUME PIKACHU ARE A LIST, AND A LIST IS HONEST HERE.

   This file's own rule is that a list needing an edit per generation gets that
   edit skipped - which is what `LEGENDARY` did as 34 hand-written numbers that
   missed sixty. The difference is that this set is CLOSED: Cosplay Pikachu is
   Gen 6 and was never revisited, and the Cap series ended at World Cap in Gen
   8. There is nothing arriving that this would have to remember.

   It also has to be named rather than derived, because PokeAPI's Pikachu
   varieties include `pikachu-cosplay` and `pikachu-starter` - a placeholder
   and a Let's Go exclusive - which are neither costumes nor anything a player
   should be able to hold. Deriving "every variety" would sweep both in.

   AND IT HAS TO BE TESTED BEFORE THE REGIONS: `pikachu-alola-cap` carries the
   string `-alola` and is a HAT, not an Alolan Pikachu - which does not exist,
   and neither does a Hisuian one. Ask the regions first and the dex ships a
   species labelled "Alolan Pikachu" that Game Freak never drew. */
/* THE NAME IS THE GAMES' NAME, CARRIED RATHER THAN DERIVED. The cosplay five
   put the costume AFTER the species (Pikachu Libre) and the eight caps put it
   BEFORE (Original Cap Pikachu), which is what the games call them and is not
   a rule anything could infer from the slug. So the title ships on the record
   and `label()` prefers it - there is nothing for a regex to get right. */
const COSTUMES = new Map([
  ["pikachu-rock-star", ["Pikachu Rock Star", 6]],
  ["pikachu-belle", ["Pikachu Belle", 6]],
  ["pikachu-pop-star", ["Pikachu Pop Star", 6]],
  ["pikachu-phd", ["Pikachu, Ph.D.", 6]],
  ["pikachu-libre", ["Pikachu Libre", 6]],
  ["pikachu-original-cap", ["Original Cap Pikachu", 7]],
  ["pikachu-hoenn-cap", ["Hoenn Cap Pikachu", 7]],
  ["pikachu-sinnoh-cap", ["Sinnoh Cap Pikachu", 7]],
  ["pikachu-unova-cap", ["Unova Cap Pikachu", 7]],
  ["pikachu-kalos-cap", ["Kalos Cap Pikachu", 7]],
  ["pikachu-alola-cap", ["Alola Cap Pikachu", 7]],
  ["pikachu-partner-cap", ["Partner Cap Pikachu", 7]],
  ["pikachu-world-cap", ["World Cap Pikachu", 8]],
]);

const byName = new Map(SPECIES.map((sp) => [sp.name, sp]));
const tierOf = (r) => (r >= 200 ? "C" : r >= 100 ? "B" : r >= 45 ? "A" : "S");

async function sprite(name) {
  const res = await fetch(`${GH}/other/home/${name}.png`).catch(() => null);
  return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

async function one(name, base, kind, extra = {}) {
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
    /* CARRIED FROM THE BASE, because three of these are legendary birds.
       Galarian Articuno, Zapdos and Moltres are the only wild forms whose base
       is legendary, and `LEGENDARY` is keyed on dex id - so at id 10169 a
       Galarian Articuno was not legendary to anything and `derivedHomes` put
       it in the Safari Zone at band A, spawning like an ordinary bird. Never
       read for a form you EVOLVE into (a Mega has no spawn weight to scale),
       which is exactly why nothing had needed it before. */
    legendary: !!base.legendary,
    genus: kind === "gmax" ? "Gigantamax Pokémon"
      : kind === "primal" ? "Primal Pokémon" : "Mega Pokémon",
    /* THE BASE'S FLAVOUR, and for a wild form that is a known compromise
       rather than an oversight. PokeAPI keys flavour text to the SPECIES and
       to a game version, never to a form, so there is no entry to read that
       says "Alolan Vulpix" - Sun/Moon's Vulpix text is the Alolan one and
       nothing in the payload says so. Taking the base's is the honest
       fallback; the genus below is what actually names the form. */
    flavor: base.flavor,
    height: pk.height,
    weight: pk.weight,
    stats: ["hp", "attack", "defense", "special-attack", "special-defense", "speed"]
      .map(stat),
    ...extra,
  };
}

const list = await fetch(`${API}/pokemon?limit=1500&offset=1025`).then((r) => r.json());
const want = [];
for (const { name } of list.results) {
  /* COSTUMES FIRST - see the note on `COSTUMES`. `pikachu-alola-cap` is a hat
     and would otherwise be read as a region that Pikachu does not have. */
  const dressed = COSTUMES.get(name);
  if (dressed) {
    const [title, gen] = dressed;
    want.push({
      name, base: byName.get("pikachu"), kind: "costume",
      /* The genus stays the BASE's - "Mouse Pokemon" - because that is what it
         is. A costume is not a classification, it is a hat, and the title is
         where the hat belongs. */
      extra: { wild: true, gen, title },
    });
    continue;
  }

  const region = REGION_AT(name);
  if (region) {
    const base = byName.get(region.base);
    if (base) {
      want.push({
        name, base, kind: region.kind,
        /* `tail` is what the slug carries past the region marker, which is
           empty for all but the three Paldean Tauros - "Paldean Tauros" three
           times over would be three dex rows with one name. No title for the
           rest: `label()` builds those from `from`, which is the base's real
           name and gets "Mr. Mime" and "Farfetch'd" right for free. */
        extra: {
          wild: true, gen: region.gen, genus: `${region.word} Form`,
          ...(region.tail ? { tail: region.tail } : {}),
        },
      });
    }
    continue;
  }

  for (const [suffix, kind] of KINDS) {
    if (!name.endsWith(suffix)) continue;
    const base = byName.get(name.slice(0, -suffix.length));
    if (base) want.push({ name, base, kind, extra: {} });
    break;                                        // longest suffix wins
  }
}

await mkdir("public/sprites/shiny", { recursive: true });
const out = [];
for (let i = 0; i < want.length; i += 8) {
  const got = await Promise.all(
    want.slice(i, i + 8).map((w) => one(w.name, w.base, w.kind, w.extra)));
  out.push(...got.filter(Boolean));
  process.stdout.write(`\rfetched ${out.length}/${want.length}`);
}
/* MADE FIRST, MET SECOND - AND THAT ORDER IS A SAVE MIGRATION AVOIDED.

   Every save is keyed on POSITION in `SPECIES`, and `SPECIES` is the National
   Dex with `FORMS` appended. A plain `a.id - b.id` was right while every form
   was a Mega, and becomes an INSERT the moment a costume Pikachu (10080) or an
   Alolan Rattata (10091) arrives: 74 of the 120 shipped forms sit above 10080,
   so sorting by id alone would have moved 74 saved positions and quietly
   renamed 74 forms in every existing collection. That is the Hoenn migration
   exactly, and this file's own header already says why it must not happen -
   *"the forms go on the END - appending moves nothing"*.

   Sorting on `wild` first keeps the evolution forms in the id order they
   already shipped in, byte for byte, and appends the new ones after. No
   `LAYOUTS` entry, no `remap`, and `padDex` stays the right answer. */
out.sort((a, b) => Number(!!a.wild) - Number(!!b.wild) || a.id - b.id);

await writeFile("src/data/forms.js", `export const FORMS = ${JSON.stringify(out)};\n`);
const kinds = out.reduce((n, f) => ({ ...n, [f.form]: (n[f.form] ?? 0) + 1 }), {});
const wild = out.filter((f) => f.wild).length;
console.log(`\nwrote src/data/forms.js — ${out.length} forms ` +
  `(${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(", ")}) ` +
  `over ${new Set(out.map((f) => f.of)).size} species; ` +
  `${out.length - wild} evolved into, ${wild} met in the wild`);
