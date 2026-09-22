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
import { createHash } from "node:crypto";
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

/* AND A THIRD FAMILY: THE REST OF WHAT BULBAPEDIA CALLS A FORM DIFFERENCE.
   =========================================================================

   The two families above are Megas (made) and regions (met), and between them
   they miss most of the list: Deoxys, Rotom, the Therian trio, Wormadam's
   cloaks, Oricorio's four islands, Basculin's stripes, every gender form with
   its own art. PokeAPI carries 136 varieties past the National Dex that this
   file was dropping, and the question was which of them are POKEMON.

   TWO DERIVED FILTERS DO ALMOST ALL OF IT, and neither needs maintaining:

   `is_battle_only` is PokeAPI's own field and it is exactly the right cut -
   35 of the 136. Aegislash's Blade stance, Darmanitan's Zen mode, Mimikyu's
   busted disguise, Minior's broken shell, Palafin's Hero form, Cramorant with
   a fish in its mouth: those are STATES, and a game with no battle has nothing
   to put them in. It also catches the six form-of-form megas and all three
   `-mega-z`, so there is no real Mega missing here - which a suffix list would
   have had to be told.

   THE ART HASH IS THE SECOND, and it is the `"COSTUME PIKACHU-ROCK-STAR" IS A
   DATABASE ROW` rule with a measurement behind it: a form drawn with the
   base's own sprite is not a Pokemon you could tell apart. It removes the nine
   Totems (a Totem is the same creature, bigger), Greninja's Battle Bond,
   Rockruff's Own Tempo - and then, compared against each OTHER and against
   what we already ship, Pumpkaboo's and Gourgeist's four sizes (size is a
   stat, not a drawing), five of Minior's six meteors, and the two Totems that
   are really the Alolan forms we already have. 12 + 11 = 23 more.

   WHAT IS LEFT IS A JUDGEMENT AND SO IT IS A LIST. Nothing in PokeAPI
   separates "Rotom climbed into a microwave" from "Oricorio drank the nectar
   on Melemele": both are `is_battle_only: false` with their own art. The split
   is this game's own, it is the same one the file already draws, and the list
   is honest for the reason `COSTUMES` is - it is CLOSED. These are forms that
   already shipped in games that already exist; nothing is coming that this
   would have to remember. A new one arrives as a line, the way a new map does.

   THE NAME IS THE GAMES' NAME AND IT SHIPS AS `title`, because there is no
   rule that gets "Black Kyurem", "Heat Rotom" and "Wormadam (Sandy Cloak)"
   right from one another - the word goes in front for some and in brackets for
   others, and `label()` already prefers a title over anything it could build. */

/* MADE: something you DO to a Pokemon - a machine, a fusion, a held item.
   An evolution target at Lv 100, exactly like a Mega, and `fetch-evolutions`
   needs no change to emit the row: it already writes one for every form that
   is not `wild`. Most of these bases are legendary, so the cost is catching a
   1-in-3,760 Pokemon and then spending a hundred candy on it - which is the
   most expensive thing in the game, and the right price for the Origin Forme
   of a box legendary. */
const MADE = new Map([
  ["deoxys-attack", "Deoxys (Attack Forme)"],
  ["deoxys-defense", "Deoxys (Defense Forme)"],
  ["deoxys-speed", "Deoxys (Speed Forme)"],
  ["shaymin-sky", "Sky Forme Shaymin"],
  ["giratina-origin", "Origin Forme Giratina"],
  ["dialga-origin", "Origin Forme Dialga"],
  ["palkia-origin", "Origin Forme Palkia"],
  ["rotom-heat", "Heat Rotom"],
  ["rotom-wash", "Wash Rotom"],
  ["rotom-frost", "Frost Rotom"],
  ["rotom-fan", "Fan Rotom"],
  ["rotom-mow", "Mow Rotom"],
  ["tornadus-therian", "Therian Forme Tornadus"],
  ["thundurus-therian", "Therian Forme Thundurus"],
  ["landorus-therian", "Therian Forme Landorus"],
  ["enamorus-therian", "Therian Forme Enamorus"],
  ["kyurem-black", "Black Kyurem"],
  ["kyurem-white", "White Kyurem"],
  ["keldeo-resolute", "Resolute Form Keldeo"],
  ["hoopa-unbound", "Hoopa Unbound"],
  ["necrozma-dusk", "Dusk Mane Necrozma"],
  ["necrozma-dawn", "Dawn Wings Necrozma"],
  ["urshifu-rapid-strike", "Rapid Strike Urshifu"],
  ["zarude-dada", "Dada Zarude"],
  ["calyrex-ice", "Ice Rider Calyrex"],
  ["calyrex-shadow", "Shadow Rider Calyrex"],
  ["magearna-original", "Original Color Magearna"],
  ["ogerpon-wellspring-mask", "Wellspring Mask Ogerpon"],
  ["ogerpon-hearthflame-mask", "Hearthflame Mask Ogerpon"],
  ["ogerpon-cornerstone-mask", "Cornerstone Mask Ogerpon"],
]);

/* MET: something that LIVES somewhere - an island, a cloak, a stripe, a
   plumage, a gender. Caught in the grass like any other species, which is what
   `wild` means here and what no evolution row is the whole mechanism for.

   THE GENERATION IS THE FORM'S OWN, exactly as it is for a regional form, and
   for all but two that is the base's own generation - a Wormadam's cloak
   shipped with Wormadam. The two that did not are the ones worth writing down:
   White-Striped Basculin is Legends Arceus (8) off a Gen 5 base, and Bloodmoon
   Ursaluna is the Indigo Disk (9) off a Gen 8 one. Written per row rather than
   derived because the exceptions are the point. */
const WILD_FORMS = new Map([
  ["wormadam-sandy", ["Wormadam (Sandy Cloak)", 4, "Sandy Cloak"]],
  ["wormadam-trash", ["Wormadam (Trash Cloak)", 4, "Trash Cloak"]],
  ["basculin-blue-striped", ["Blue-Striped Basculin", 5, "Blue Stripe"]],
  ["basculin-white-striped", ["White-Striped Basculin", 8, "White Stripe"]],
  ["meowstic-female", ["Meowstic (Female)", 6, "Female"]],
  ["pumpkaboo-small", ["Small Size Pumpkaboo", 6, "Small Size"]],
  ["gourgeist-small", ["Small Size Gourgeist", 6, "Small Size"]],
  ["zygarde-10", ["10% Forme Zygarde", 6, "10% Forme"]],
  ["oricorio-pom-pom", ["Pom-Pom Style Oricorio", 7, "Pom-Pom Style"]],
  ["oricorio-pau", ["Pa'u Style Oricorio", 7, "Pa'u Style"]],
  ["oricorio-sensu", ["Sensu Style Oricorio", 7, "Sensu Style"]],
  ["lycanroc-midnight", ["Midnight Form Lycanroc", 7, "Midnight Form"]],
  ["lycanroc-dusk", ["Dusk Form Lycanroc", 7, "Dusk Form"]],
  ["toxtricity-low-key", ["Low Key Toxtricity", 8, "Low Key"]],
  ["indeedee-female", ["Indeedee (Female)", 8, "Female"]],
  ["basculegion-female", ["Basculegion (Female)", 8, "Female"]],
  ["oinkologne-female", ["Oinkologne (Female)", 9, "Female"]],
  ["squawkabilly-blue-plumage", ["Blue Plumage Squawkabilly", 9, "Blue Plumage"]],
  ["squawkabilly-yellow-plumage", ["Yellow Plumage Squawkabilly", 9, "Yellow Plumage"]],
  ["squawkabilly-white-plumage", ["White Plumage Squawkabilly", 9, "White Plumage"]],
  ["tatsugiri-droopy", ["Droopy Form Tatsugiri", 9, "Droopy Form"]],
  ["tatsugiri-stretchy", ["Stretchy Form Tatsugiri", 9, "Stretchy Form"]],
  ["dudunsparce-three-segment", ["Three-Segment Dudunsparce", 9, "Three-Segment"]],
  ["maushold-family-of-three", ["Maushold (Family of Three)", 9, "Family of Three"]],
  ["gimmighoul-roaming", ["Roaming Form Gimmighoul", 9, "Roaming Form"]],
  ["ursaluna-bloodmoon", ["Bloodmoon Ursaluna", 9, "Bloodmoon"]],
]);

const byName = new Map(SPECIES.map((sp) => [sp.name, sp]));
const tierOf = (r) => (r >= 200 ? "C" : r >= 100 ? "B" : r >= 45 ? "A" : "S");

async function sprite(name) {
  const res = await fetch(`${GH}/other/home/${name}.png`).catch(() => null);
  return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

async function one(name, base, kind, extra = {}) {
  const pk = await fetch(`${API}/pokemon/${name}`).then((r) => r.json());
  /* PokeAPI'S OWN WORD FOR "THIS IS A STATE, NOT A POKEMON", AND IT IS AN
     ASSERTION RATHER THAN A FILTER - WHICH COST A RUN TO FIND OUT.

     `is_battle_only` is exactly the right cut for the third family: it is what
     separates Aegislash's Blade stance and Minior's broken shell from Heat
     Rotom, and it is what says a `-mega-z` is a battle variant rather than a
     Mega this file forgot. As a gate in here it would have deleted **all 120
     Megas, Primals and Gigantamax**, because in the games those only exist in
     battle too and PokeAPI says so: `charizard-mega-x` is `is_battle_only:
     true`. Measured before running rather than after.

     So it is scoped to the two curated lists and it THROWS, because what it is
     really checking is that the lists are still right - a form PokeAPI has
     reclassified should stop the build, not vanish from the dex in silence. */
  if (kind === "alt" || kind === "variant") {
    const form = await fetch(pk.forms[0].url).then((r) => r.json());
    if (form.is_battle_only) {
      throw new Error(`${name} is is_battle_only - a state, not a Pokemon; ` +
        "drop it from MADE/WILD_FORMS");
    }
  }
  const png = await fetch(`${GH}/${pk.id}.png`);
  if (!png.ok) return null;                       // no art, no form
  const shiny = await fetch(`${GH}/shiny/${pk.id}.png`);
  const art = Buffer.from(await png.arrayBuffer());
  /* A FORM DRAWN WITH THE BASE'S OWN SPRITE IS A DATABASE ROW.

     Measured over the 92 varieties that survive `is_battle_only`: twelve are
     byte-for-byte the base's picture - every Totem (a Totem is the same
     creature, bigger), Greninja's Battle Bond, Rockruff's Own Tempo - and
     eleven more are byte-for-byte EACH OTHER or a form we already ship.
     Pumpkaboo and Gourgeist draw one sprite for four sizes, because a size is
     a stat; five of Minior's six meteors are one drawing; and the two Alolan
     Totems are the Alolan forms themselves.

     The test is "is this picture already in the dex" rather than "does it
     match its own base" - the weaker version passes six Miniors that are one
     Minior. It is decided AFTER the fetch loop rather than inside it: the loop
     runs eight at a time, so a shared set would let two identical sprites in
     one batch both win and the dex would differ between runs. */
  await writeFile(`public/sprites/${pk.id}.png`, art);
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
    /* SHAPED LIKE WHAT IT IS A FORM OF. PokeAPI keys `shape` to the SPECIES
       and never to a variety, so there is nothing else to read - and it is the
       right answer anyway: a White-Striped Basculin is a fish because Basculin
       is one, and Mega Gyarados is shaped like Gyarados. */
    shape: base.shape,
    height: pk.height,
    weight: pk.weight,
    stats: ["hp", "attack", "defense", "special-attack", "special-defense", "speed"]
      .map(stat),
    art: createHash("md5").update(art).digest("hex"),   // dropped below
    ...extra,
  };
}

/* THE LONGEST PREFIX THAT IS A SHIPPED SPECIES. The two maps above are keyed
   on the variety's full slug and the base is whatever of it names a real dex
   entry, which `-` counting cannot do: `ogerpon-cornerstone-mask` has three
   tails and `basculin-white-striped` has two. The same reachability rule the
   rest of this file is held to - no shipped base, no form. */
const baseOf = (name) => {
  for (let i = name.length; i > 0; i--) {
    if (name[i] !== "-" && i !== name.length) continue;
    const head = byName.get(name.slice(0, i));
    if (head) return head;
  }
  return null;
};

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

  /* THE THIRD FAMILY, ASKED BEFORE THE REGIONS for the reason the costumes
     are: `basculin-white-striped` and `lycanroc-midnight` carry no region
     marker, but `ogerpon-cornerstone-mask` and `wormadam-trash` would both
     survive a loose suffix test, and a named row beats an inferred one. */
  const made = MADE.get(name);
  if (made) {
    const base = byName.get(name.replace(/-[a-z0-9-]+$/, "")) ?? baseOf(name);
    if (base) {
      want.push({
        name, base, kind: "alt",
        extra: { wave: 2, title: made, genus: "Alternate Forme" },
      });
    }
    continue;
  }
  const met = WILD_FORMS.get(name);
  if (met) {
    const base = baseOf(name);
    if (base) {
      const [title, gen, word] = met;
      want.push({
        name, base, kind: "variant",
        extra: { wave: 2, wild: true, gen, title, genus: `${word} Form` },
      });
    }
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
/* A THIRD WAVE, AND IT SORTS AFTER BOTH THE OTHERS FOR THE REASON THE SECOND
   DID. `wild` first was already this trick: it kept the 120 Megas byte
   identical and appended the 70 regional and costume forms. The third family
   carries ids from 10001 up - Deoxys is 10001, below every Mega - so ANY sort
   that mixes it in is an insert, and an insert moves saved positions and
   quietly renames what is in somebody's collection.

   `wave` is therefore the order these families arrived in THIS game rather
   than a fact about Pokemon, which is exactly what it is for. Measured: 0
   positions change meaning, `layoutIds` still returns null for the new length,
   and `padDex` is still the right answer - so there is no `LAYOUTS` entry and
   no `remap`, which is the whole point of appending. */
const wave = (f) => f.wave ?? (f.wild ? 1 : 0);
out.sort((a, b) => wave(a) - wave(b) || a.id - b.id);

/* ONE PICTURE, ONE ROW - see the note in `one()`. Run over the SORTED list,
   so the survivor is deterministic and is always the earliest wave.

   AND IT MAY REFUSE A NEWCOMER, NEVER EVICT A SHIPPED FORM. The first version
   applied to everything and dropped `appletun-gmax`, which is drawn with the
   same picture as another Gigantamax already in the dex - true, and it took
   **117 saved positions with it**, because every form after position 73 slid
   up by one. A save keyed on POSITION does not care that the row was a
   duplicate; it cares that position 74 now means a different Pokemon, which is
   the Hoenn migration exactly and the thing the `wave` sort above exists to
   avoid. A duplicate that has already shipped is somebody's collection.

   So waves 0 and 1 are kept unconditionally and only seed the set. Verified by
   diffing the whole list against the previous one: 0 positions changed. */
const seen = new Map();
const kept = out.filter((f) => (wave(f) < 2
  ? (seen.set(f.art, f.name), true)
  : !seen.has(f.art) && seen.set(f.art, f.name)));
const dropped = out.length - kept.length;
for (const f of kept) delete f.art;

await writeFile("src/data/forms.js", `export const FORMS = ${JSON.stringify(kept)};\n`);
const kinds = kept.reduce((n, f) => ({ ...n, [f.form]: (n[f.form] ?? 0) + 1 }), {});
const wild = kept.filter((f) => f.wild).length;
console.log(`\nwrote src/data/forms.js — ${kept.length} forms ` +
  `(${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(", ")}) ` +
  `over ${new Set(kept.map((f) => f.of)).size} species; ` +
  `${kept.length - wild} evolved into, ${wild} met in the wild` +
  (dropped ? `; ${dropped} drawn with a picture the dex already holds` : ""));
