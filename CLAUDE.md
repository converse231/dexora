# Dexora

A non-commercial browser game: walk, meet, throw, bank the duplicates, evolve.
It covers the whole National Dex from Kanto to Paldea plus its forms (count:
`SPECIES.length`) across sixteen maps, most of them tile-for-tile copies of real
Gen 3 maps. Inspired by DelugeRPG.

This file is the rulebook: each rule once, with its reason. The full record
behind the rules - what was reported, measured, tried and reverted - is in
[docs/decisions.md](docs/decisions.md); search it by rule name, constant or
symptom before redesigning something that sounds already decided. `README.md`
is the design document (economy, stats, UI rationale), and its "Deferred on
purpose" section lists ideas parked on purpose, each with the trigger that
should bring it back.

## Standing constraints

- **Non-commercial.** No ads, payments or store listing. The art and characters
  belong to Nintendo and Game Freak; tilesets marked in the README need their
  artist credited.
- **There is no trust boundary.** Every roll, price and dex write happens in the
  browser and the server stores the result. Row-level security stops players
  touching each other's saves; it does not make a save honest. So nothing the
  browser decides is ranked: the one leaderboard, ranked battles
  (docs/ranked.md), is played and rated on the server, in a format where a
  save can claim a species but never a stronger one. **A save cannot outrun
  the clock** (`check_save_pace` in trading.sql, 2026-10-07, after MORPH's
  forged million-step save): steps and catches past real time since the last
  save flag the account, which keeps its game but leaves trading - the one
  road a forged save has to other players. Flag, never refuse.
- **Players' collections must never be lost or overwritten.** Every save-path
  rule below serves this; when in doubt, keep the data.

## Commands

```
npm run dev      vite dev server          npm run check    check.mjs + play.mjs
npm run build    vite build               npm run play     drive the engine in Node
npm run map      python tools/build_map.py
npm run art      python tools/build_assets.py
npm run layout   composition metrics      npm run shape    structural metrics
npm run assets   PokeAPI species/items/evolutions
npm run leagues  Bulbapedia rosters       npm run moves    PokeAPI moves/learnsets
npm run battleart  League portraits, badges, back sprites
npm run gyms     solve every League opponent's level (~30 min)
npm run edge     bundle the referee into the ranked-step Edge Function
npm run anchors  solve the League anchors' ranked ratings (then npm run edge)
npm run follow   follower sheets         npm run skins    trainer skins
```

Run `npm run check` after any logic change and `npx vite build` before calling
anything done. The run prints each suite; the count is not typed anywhere.

## Architecture

- **The game loop lives outside React.** `createEngine(canvas, onChange)` in
  `src/game/engine.js` owns mutable state, runs its own `requestAnimationFrame`
  and draws to the canvas. React re-renders only on discrete events. Keep 60fps
  out of reducers.
- **State is mutated in place, so `changed()` bumps `state.rev`** (and
  `colRev` when the collection moves). Every memo over engine state includes
  the right one, or it never recomputes after a `push`.
- **Generated files are never hand-edited.** Change the generator, re-run it,
  commit the output:

| File | Made by |
|---|---|
| `src/game/mapdata.js` | `npm run map` |
| `public/tilesets/route.{png,json}`, `route_top.png` | `npm run art` |
| `src/data/species.js`, `evolutions.js`, forms | `npm run assets` / fetch scripts |
| `src/data/leagues.js` | `npm run leagues` (Bulbapedia; FireRed and Emerald cross-checked against pret) |
| `src/data/moves.js`, `learnsets.js`, `types.js` | `npm run moves` |
| `public/trainers/`, `public/badges/`, `public/sprites/back/` | `npm run battleart` |
| `src/data/gymtune.js` | `npm run gyms` (check.mjs re-derives it and says when to re-run; `-- --hard` re-solves hard mode alone, ~20 min) |
| `supabase/functions/ranked-step/rules.js` | `npm run edge` (check.mjs re-bundles and compares) |
| `src/data/anchors.js` | `npm run anchors` (check.mjs re-solves and compares) |
| `public/ranks/{battle,dex}/` | `npm run ranks` from the drawn originals in `art/ranks/` (check.mjs: one per rank id, 192px, small) |
| `src/data/anims.js`, `public/battle/anim/` | `npm run anims` (pokeemerald-expansion, pinned; restart a running dev server after) |
| `public/follow/`, `src/data/follow.js` | `npm run follow` (the same pin; check.mjs reads each header) |
| `public/skins/` | `npm run skins` (from `SKINS` in cosmetics.js plus the tool's `SRC`) |
| `src/data/abilities.js` | `npm run abilities` (PokeAPI, cached in .assets-src/abilities) |
| `public/sprites/cadence/`, `src/data/cadence.js` | `npm run cadence` (Black and White's own idle, 8-frame strips) |
| `public/titles/` | `npm run ranks` from the drawn originals in `art/titles/` |

- **`SPECIES` comes from `src/data/dex.js`**, never `species.js` (that is the
  National Dex alone, read by the fetchers).
- **`src/game` rule modules are browser-free** (the engine, tileset and store
  are the exceptions) so tools/check can run them in Node.
- **`Boot.jsx` settles session, trainer and save before mounting `App`**, and
  `App` is keyed: the engine closes over the map rows at construction, so a save
  can never arrive after it starts.
- **`net/cloud.js` is the only file that imports Supabase** (asserted). With no
  credentials the game is fully playable offline; local mode is the game, not a
  fallback.

## Saves and accounts

- **Local first, cloud after.** `write` is synchronous and local (every 400ms);
  `mirror` trails it, coalesced every 15s, plus `flushNow` on `visibilitychange`
  and `pagehide`. The network never sits in the walk cycle.
- **Never overwrite a save you failed to read.** `pull` and `getProfile` answer
  `{ok, raw}`: failed, empty, or present. `push` stays latched shut until a read
  succeeded. A paused free Supabase project errors every read, so "failed" must
  never look like "new player". Latches reset when the user changes, not on a
  token refresh; exactly one function assigns `session`.
- **At login, whichever save has walked further wins** (`steps` never goes
  down). A loser ahead on `steps`, `caught` or `xp` is a branch, not an older
  copy: `diverged` keeps it as OTHER on the YOU panel.
- **One session owns the save; the newest takes it.** `claim()` stamps
  `saves.session`, and `save_game(payload, sess)` checks ownership in the same
  statement. A losing tab stops writing localStorage too. `WRITER_KEY` does the
  same between tabs in local mode.
- **Other people's saves are parked, never written over** (`PARKED_KEY`, scoped
  to the owner). A guest save is parked at first sign-in and offered back.
  Recovery copies are `scoped(key, owner)`; BACKUP is written at load time,
  BROKEN keeps unparseable text verbatim.
- **`loadState` returns `[state, verdict]`.** Only a clean load mirrors upward.
  An unreadable save plays a fresh game and never uploads it. A save longer than
  this build's dex is `stale: "outdated"`: nothing is written anywhere.
- **Session fields never ride in a save.** `VOLATILE` is the one list, stripped
  on write and export and reset on load.
- **Every new saved field gets one `savedField(name, good, bad, empty)` line in
  tools/play**: a save without it loads empty, a value survives a reload, and
  garbage is dropped to empty.
- **Restore and import win once** (`CHOSEN_KEY`), keep the account copy as
  OTHER, and set `halted` so the reload's `pagehide` cannot write the old game
  back.
- **Unusable box entries go to `limbo`**, not the bin, and repeated uids are
  renumbered. One bad entry must not blank the Box.
- **Saves are keyed by POSITION in `SPECIES`.** Append, never insert: an insert
  moves every later position. Kanto must stay the first 151. Forms sort by `wave`
  (read off the shipped file) so new families append. A shipped form is never
  evicted, even a duplicate. A shape that must change needs a `LAYOUTS` entry
  and `remap()`.
- **`padDex` for the three-valued dex, `normalise` for one-bit tier rows.**
  Swapping them demotes every caught species to seen. `repairDex` works on the
  rebuilt rows and only raises 1 to 2.
- **Tier rows are built from `TIERS`**, so a new tier is a non-event for saves.
- **`char` is null until asked**; null is what puts up the trainer screen.
- **A dev server hot-reloads source edits immediately**, so a half-typed change
  to the save shape reaches an open tab before it is finished.
- **The server stamps `updated_at`.** Column grants in `SUPABASE.md` mirror the
  client's profile writes (tools/play holds them together). `SUPABASE.md`
  §3c and §3d (trading) are live since 2026-09-26.
- **Settings is a dialog off You**, with one profile writer
  (`updateProfile(patch)`). Email is shown, not editable. Sign-up stores a
  username, a trainer and a birthdate (the age gate: `MIN_AGE` 13 in `name.js`,
  counted on the calendar), and the insert stamps `terms_at`; nothing else
  personal is collected. Password reset uses the implicit flow with
  `detectSessionInUrl`.
  Log out replaced reset; it waits for the upload before dropping the cache.

## Dex, forms and ids

- **A dex id is not an array index.** `speciesById(id)` for the species,
  `dexIndex(id)` for its position. The dex runs to 1025 and then jumps to
  10001+ for forms.
- **A form is a species, and `isForm(id)` (id >= 10000) is the one predicate.**
  Forms are never in the evolution overlay (you make a Mega, you never meet
  one), `genOf` reads a Mega through to its base, and `hasOrigin` is false.
- **`wild` is the one field for forms you meet.** No evolution row is what makes
  a form wild; `derivedHomes` homes it on its own types. A wild form keeps the
  generation it was introduced in. A form that is both wild and buildable
  declares `evo`, and its row still costs Lv 100. **A regional form also
  evolves the way its species does**: `fetch-evolutions` copies the species'
  own rows marked `regional` - form to form when the parent has a form of that
  region, a branch from the ordinary parent when not (Quilava -> Hisuian
  Typhlosion) - at the base row's price, and check.mjs holds each to its twin.
- **Names come from `label()`**: a form's base name from `from`, or its `title`
  when it has one. Never parse slugs. **Every hyphenated slug is in
  `NAME_FIX`** (map.js) unless its real name keeps the hyphen lower-case
  (`HYPHEN_NAMES`, Jangmo-o's line); check.mjs reads every label. 36 were
  shown as slugs ("Iron-bundle", "Chi-yu", "Type-null") until 2026-09-29.
- **`genOf` has its own Map** because it runs at module init, before
  `speciesById` exists.
- **A look is one of a family's drawings** (`form: "look"`: Unown's letters,
  Furfrou's trims, Flabebe's colours, Silvally's types - `LOOK_FAMILIES` in
  fetch-forms, ids `PLATE_BASE` + form id like the plates). It is a species
  and NEVER a spawn row: the family's base keeps its one slot, and
  `rollLook` picks the drawing when you meet one (`startEncounter`) or evolve
  into it from a parent with no looks (Type: Null -> some Silvally).
  `fetch-evolutions` copies the species' rows for a look, marked `look`
  (Blue Flabebe -> Blue Floette; Sandy Burmy -> the wild Sandy Wormadam).
  Kept out of `derivedHomes` (it once took every trim as a resident and
  pushed Eevee past findable), and out of `baseForm` where a real row
  decides. A look changes no spawn table: every table and rod hashed
  identical before and after the 95 arrived. Vivillon and Alcremie (19 and
  62 looks) were left out on purpose - README's Deferred list.

## Spawn tables

The pipeline in `encounterTable(biome, level)`: residents (hand-written rows plus
`derivedHomes`) and the evolved overlay, fitted by `fitShares`, then `capLines`,
then legendaries and costumes appended. `tableFor` caches one (biome, level).

- **`fitShares` alternates two marginals and always ends on the band step.**
  The band mix per map (`BAND_SHAPE`, frozen from that map's own hand-written
  rows) is asserted exactly. The generation spread comes from `genShares`, the
  one function both the fit and check.mjs call.
- **`genShares`**: a generation's weight is how many of its species live on the
  map, times an arrival ramp (`GEN_RAMP` levels, floor `RAMP_MIN`). Gen 1, each
  map's classic cast, never drops below `HEADLINE` (20%). No generation is owed
  more than `SPECIES_CAP` (6%) per species it has there. **Once every
  generation on a map has grown in, `bandShares` holds each non-Kanto one in
  [`GEN_LOW`, `GEN_HIGH`] (5-15%) and Kanto under `CAST_TOP` (25%)** - fair
  per species while regions arrive, no region running a map late (asked for,
  2026-10-01). Not 1/N: equal shares hand a thin generation's one species the
  whole slice. Kanto may run over `CAST_TOP` only by what `capLines` spills
  into the cast (the Desert, 32%: every common non-Kanto ground species is
  already there; shrinking its cast starved Cacnea).
- **`capLines` holds any non-Kanto line above 6% and any Kanto line above
  `CAST_CEIL` (25%).** A line is a resident plus the evolutions grown from it
  (slot 5), scaled together. The excess goes within its own band: first to
  generations short of target (only up to the shortfall), then to cast rows
  under the ceiling, and only then softens a cap. Rows only grow or are held,
  so nothing can be driven to zero. Held lines stay held.
- **A written weight is a rank within its own (band, generation) cell**, not a
  share of the map. To make a species felt, put it in a generation the fit is
  not already suppressing. A map's written weights also set its band mix, so
  weighting one band heavily can force a few species to fill it.
- **Never hand-write an evolved form into a table.** The overlay derives it; a
  species listed twice has two weights. `EVO_FLOOR` is what keeps rare lines
  findable. Evolutions carry their parent's band (slot 3) and generation
  (slot 4).
- **`derivedHomes` homes on primary type** (primary 2, secondary 1). A home must
  already hold the species' band. The `GEN_HOME_MIN` filler must share a type
  with the map and never brings a new band.
- **A fish (`shape: fish`) only spawns on maps with water.** `b.water` is
  declared and asserted against the map's water tiles. Legendaries are exempt.
- **The water is every generation's.** Surfing meets `surfTable`: the map's
  fitted table filtered to Water types and fish, at the map's weights (the
  rod's pool only under `SURF_MIN` of them). Each rod lists every generation,
  and `rodTable(id, level)` lets one bite from its `GEN_UNLOCK`. Both were
  Kanto's alone once - surfing drew the rods' three Gen 1 lists - and every
  lake in the game was the same. check.mjs holds Kanto under half of every
  rod and every map's surf at the cap.
- **Legendaries live only on maps sharing their primary type** (`legendTier`,
  `LEGEND_HAUNT` and `LEGEND_STRAY` are 0). Each is worth `LEGEND_EACH` per
  head, capped at `LEGEND_CEIL`; a zero-weight row is not emitted. `types` on a
  map decides legendary homes, so widening it is never flavour; `legends`
  (`legendTypes`) adds a type for legendary homes alone - the Mansion's psychic,
  where `types` measured 49% psychic residents. Every legendary must keep a home.
- **An `only` map is one species' home** (Tanoby: Unown, asked for), and
  NO OTHER map homes its species (`KEPT`: the Gen 2 filler put Unown in
  Meteor Falls; check.mjs holds every map, surf and rod clear). No
  `types`, so nothing homes there and no legendary lives there; surfing it
  meets the same table (`surfTable`); check.mjs's mix suites (`MIXED`), the
  eight-row table rule and the rift-finds bound skip it, and nothing else
  does. Its roll is the look, not the row.
- **Costumes live where a Pikachu lives**: appended like legendaries at
  `LEGEND_EACH` and homed by the same `legendTier`, so all thirteen (pure
  Electric) are Power Plant only. They were flat on every map once and read
  as costume Pikachu in a volcano. Both appended families share one
  denominator, `taken`.
- **`bandFor` is the one band answer**: a non-legendary on the catch floor drops
  one band, so difficulty is charged once, on the throw.
- **Generations arrive on `GEN_UNLOCK`**, derived from `GEN_LAST`, `GEN_FIRST`
  and `GEN_STEP`; the last must land under `MAX_LEVEL`.
- **Guards in check.mjs**: every species findable (nothing evolves into it, so
  it must turn up within a 3,500-encounter playthrough or be on a rod); no
  non-Kanto species above 6%; no species above 30% from Lv 20; a new generation
  under 10% on its opening level; generations near target except where the cap
  held them; band budgets; the legendary share equation.

## Rare tiers

- **`TIERS` in `biomes.js` is the single ordered list** (rarest first): the roll
  order, sprite choice, Dex marks, badge, save arrays and `keeper()`. Adding a
  tier is one `TIER_ODDS` row plus a drawn icon. Every screen drawing a row of
  tiers (FORMS strip, catch banner, `Variants.jsx`) takes its order from `TIERS`
  and its prose from `TIER_TELL`, which never quotes a number. `Variants.jsx`
  computes odds from `TIER_ODDS`.
- **The sixteen tiers are kinds, not strengths.** Keep the spread narrow; move
  the ratio, never the base. Vivid stays rarer than 1 in 100. A new tier keeps
  the any-variant RATE (every rung moves up to make room, held for a species
  without Origin); Gold alone sits above the 2.0x spread, as the chase.
- **The treasure set is Gold's** (2026-10-08, your call): Diamond, Platinum and
  Emerald sit directly under it, so the four rarest tiers are one material
  each. Each is ONE filter and ONE idea of motion, and the three ideas are
  disjoint on purpose - a sweep, a flash, a drift - because the filters alone
  are three bright metals and do not separate on a 56px Box row. Platinum takes
  the sweep so Gold keeps the sparkle; Diamond's points are round where Shiny's
  are four-pointed; Emerald drifts and never pulses, because a pulse is
  Cadence's breath and that tell is all that separates it from Showdown.
- **A tier also lives in the SQL**: `public.tier_list()` in `db/trading.sql`
  is the one list the CHECKs and functions read (asserted equal to `TIERS`),
  and the constraints are re-added from it every run. A new tier is SQL first:
  a box entry in a tier the server does not know cannot enter trading.
- **A tier that is a STRIP shares one class, `.sprite-strip`** (`STRIP_TIERS`
  in Sprite.jsx: Showdown and Cadence). A strip is a span with a background
  stepped by `steps(8, jump-none)`, and a span has no intrinsic size, so every
  container drawing a Pokemon must size it - 15 of them, asserted. Naming the
  tier instead of the kind made that 24 rules for one tier; the shared hook
  makes a third strip cost no CSS. **Cadence is Showdown's twin and must not
  read as it**: Showdown is the Showdown community's animation, Cadence is the
  one Black and White played, so the tell is life (`it breathes`) and not
  motion. It ARRIVES STILL and wakes after a beat, which is the whole
  separation - every other sprite in the game is a frozen picture, so a Cadence
  one is too, until it starts breathing. Its `cad-breath` bloom is the only
  persistent tell a Dex tile gets, because a tile has no arrival.
- **A tier added since Glitched draws its motion through `VariantFx`**
  (`SCENE_FX` in the battle): a `.sprite-<tier>` filter for the bare `<img>`
  plus a few layers in the sprite's box, sized for forty Dex tiles at once.
- **`rollVariant` walks rarest first** and takes a `locked` set from
  `lockedTiers(id)`, an art check only (one argument). `tiersFor` derives from
  it. **The art gates are a LIST (`ART_GATES`), and the answer is memoised on
  which of them failed** - Origin, Showdown and Cadence are three gates and all
  eight combinations occur in the dex, so the old "three named Sets and a
  branch" shape does not survive a third one. A fourth gate is one row. Origin means debut art older than the base art (`genOf < baseArtGen`,
  `ART_GEN` a row per generation) **or a SageDeoxys drawing** (`SAGE_IDS`,
  written by `build_origin.py` from `art/sage/`, imported once by
  `tools/import_sage.py`; Kanto and Johto keep their own debut art), and
  every Sage Origin shown carries `SAGE_CREDIT` (catch banner, encounter
  corner, Dex header, Rare forms). `build_origin.py` READS the ordinary
  sprites and never resizes them: they are 64, 80 and 96px by generation,
  and its old `normalise` shrank 2,062 of them. Showdown needs a real strip
  (`hasShowdown` reads the files).
- **Pity is a capped multiplier on the whole ladder**; `dry` resets on the roll.
- **`keeper()` protects variants in the engine**, on `sell` and `convert` both.
  Legendaries are not keepers: sweep dialogs list them unticked, and
  `run(picked)` never falls back to the full list.
- **An evolution can cost a tier** when the target has no such art; warn with
  `lockedTiers(target)`.
- **The evolution cycle switches a tier's own animation off** until the
  reveal (Showdown's strip excepted): it scales both sprites through an
  inline `transform`, and Glitched's `glitch-shift`, which sets `transform`,
  held both at full size for the whole cycle. check.mjs reads any tier
  animation that moves `transform` and asks for the rule.
- **A tier's `filter` carries `!important`; its `animation` must not.** An
  animation outranks a plain declaration, and `.mon.captured` / `.mon.gone`
  carry `!important` so capture and flee beat any tier idle.
- **`VariantFx` is the one moving layer.** Layers are siblings of `.mon` and
  are gated on `monHere`.
- **A container holding a tier wrapper (`.sprite-fx`, `.item-fx`) sizes its
  image with a CHILD selector** (`> img`). Every layer is `inset: 0` and masked
  at `center / contain`, so the `<img>` must fill exactly the wrapper; a sized
  descendant `img` also reaches the one inside it (the Rare forms dialog drew
  its creatures at 77% of 77%, top-left, every effect off to the side).
  Asserted in check.mjs.
- **Showdown is an 8-frame strip on a span, not an `<img>`**, stepped with
  `steps(8, jump-none)`. It is sized to 77% of its box (a Showdown frame fills
  its canvas where an ordinary sprite fills 0.77), and that must be set in each
  container that draws it. A percentage is of the containing block, so the
  evolution scene sizes it against `.evo-mon`'s `cqw` (asserted).

## Economy

- **Evolution is Rare Candy and a level on one `uid`**: 1 candy = 1 level, and
  only the stone is consumed. There is no feed. Branch panels drop branches
  already satisfied.
- **`candyValue` reads through to the base form; `sellValue` does not.** Candy
  stays tiered and flatter than `SELL`. `SELL.S` is capped so a sale never buys
  back more candy than the evolution spent.
- **Income must be renewable.** `catchBounty` pays on every variant catch (never
  more than half of what an encounter pays). Walking pays a wage
  (`stepWage`, denominated in the dearest ball that can still fail;
  `STEP_WAGE` 1 throw since 2026-10-04, halved - money came too easily; it
  moves the rematch clock, so `npm run gyms` after). The dex
  bonus climbs (`DEX_CLIMB` 4: ¥100 to ¥500) but is not income. **The
  late game's money is the one-off pools** (research, the dex bonus,
  medals), not the renewable streams - audited 2026-10-04 at ~2.8x a Lv 75
  game's catch income before research and the dex bonus were cut; measure
  them before touching catch or walking.
- **Priced items are checked against the live economy**: a honey costs less
  than its run earns (dearest vs richest map, cheapest vs starting map); the
  Master Ball has a computed floor and ceiling; Master Balls total 8-12 per game
  (`MASTER_EVERY` 14 at a Lv 100 cap).
- **`liveMult(ball, enc)` is the one answer to what a ball is worth.** The
  engine rolls with it and the rail prints it; berries go through it. `boost`
  must never exceed what `bonus()` can reach. Never type the unboosted value in
  `bonus()` (`PLAIN_MULT`, in `catch.js`). Price ramp balls by simulation.
- **Everything a throw depends on is frozen on the encounter** (`known`,
  `knownForm`, `areaId`, `types`, `night`, size).
- **`catchChance` has a per-ball ceiling (`NEVER_CERTAIN`) and a low floor
  (`NEVER_HOPELESS`)**, so a better ball is never worthless. Catching and
  fleeing were tuned in opposite directions; retune them as a pair.
- **Field items: each family moves one lever** (`rate`, `tilt` or `lift`), and
  `state.field` is keyed by family. A repel is total and cancels everything;
  the White Flute and a honey run together. Using one while its family runs
  STACKS: the new effect takes the slot and the old one's steps carry over
  (`total` is what the ring drains against; asked for, 2026-10-03). `rarityPower` is the only rarity transform.
- **Berries each move one roll**: the same berry deepens, a different one
  replaces, and one at its cap is refused (`berryRoom`), never eaten. A Nanab
  is a lock.
- **Wild levels are a price**: `WILD_STEP` keeps free evolutions under 15% on
  any map.
- **Synthetic evolution levels are derived** (`evoLevel`); stone rows need their
  stone on the shelf (`STONES` checked both ways).
- **`ENCOUNTER_RATE` lives in `biomes.js`** and check.mjs imports it.

## Trainer and levels

- **`LEVEL_XP` is append-only.** A save holds raw XP, so an edited row re-levels
  every trainer. The cap is Lv 100; levels 76-100 each cost what 75 did.
- **99 points against 140 ranks** (seven stats), asserted: a trainer can never
  max everything. Raising the cap means adding capacity, not erasing the
  choice. Doubling `MAX_RANK` means halving every coefficient in
  `trainer.js`, `effect()` strings included. **Lustre** (tier roll) stays at
  most a research star's lift; **Coach** pays on converting duplicates only.
- **League prices are measured on a Lv 75 game** (`PRICE_LEVEL` in
  league-sim): 76-100 is post-game, and pricing against it would have doubled
  every prize without the ladder moving.
- **`state.paid` is the highest level whose reward was paid.** `payLevels()`
  pays from there, on every gain and once at boot. Old saves count as paid to
  their level capped at `LEGACY_CAP` (50).
- **Key items come from `grantKeys`**, and running and surfing check level and
  item both (`canRun`, `canSurf`).
- **Surfing is where you stand, not a flag.** Getting off is always allowed,
  getting on is gated, and `ashore()` moves anyone stranded on water.
- **Maps open on `BIOMES[i].level`, and `areaOpen()` is the one answer**
  (engine, Travel panel and Dex WHERE TO LOOK). `loadState` sends a save home
  from a map it has not earned.
- **The world clock runs on steps**, not `new Date()`.

## Maps and tiles

- **Read the real map data; never eyeball.** `map.bin` is `<u2` per tile: bits
  0-9 metatile, 10-11 collision, 12-15 elevation. In Emerald, behaviour (bits
  0-8 of the attribute) decides water, grass and ledges, not collision. A
  ripped sheet or screenshot is not a source (`tools/identify_tiles.py` names
  cells). Compare GBA colours at 5 bits.
- **A copied map carries the real map's metatile ids** (`tiles`, rebased;
  `tileBase` per map, checked against `route.json`). `drawTile`'s fixed id
  beats every rule, and copied cells are exempt from the art-shape rules only.
- **A secondary tileset is only right against its own primary.** `SECONDARY`
  carries the pairing; `FR_PRIMARY` and `EM_PRIMARY` bake whole primaries.
  Emerald has 512 primary tiles and 6 palettes. Atlas bases move whenever a set
  is added: read them from `route.json`.
- **Collision comes from the map, not the tileset.** Passable is not reachable:
  cull what no step reaches (to solid, keeping its art). `seal_hidden` makes
  cells the upper layer hides solid. The outer ring of every map is solid.
- **Reachability is directed.** `walk_steps()` is the one definition of a step;
  `LEDGE = { L: [0,1], J: [1,0] }` and `SOLID` live in `map.js` and
  `build_map.py` and must agree (asserted). A ledge with no landing is a wall;
  culling and landing checks run to a fixed point.
- **Warps are read from `warp_events`, kept only when reciprocal, taken in
  `onArrive`**, and ridden both ways by tools/play on every map. Every warp
  needs a walkable neighbour. **A hole is one-way**: a 5th element `1`
  (`FROST_HOLES`) warps down only, its landing is plain floor, and every
  fill (build_map's `check()`, the engine's `warpMap`, check.mjs) is
  directed; two-way, Frost Hollow's landings bounced you back up. A ladder
  whose warp leaves the game's maps is never a dead rung: `MOON_EXIT` (Mt
  Moon B1F's Route 4 ladder) is one way onto the cave's mouth, Route 4 being
  outside both. It was the door to the Power Plant once, and walking out of
  the Power Plant onto a cave ladder read as a bug (2026-10-07); the Power
  Plant's front door is a doormat. Area ids never change (`ridge` is Mt Moon, `tower`
  the Pokémon Tower, `ember` Magma Hideout, `woods` Monsoon Trail), because
  saves store them. A map replaced under its id can leave a save standing on
  rock: `createEngine` sends a spot with nowhere to stand to the map's spawn.
- **Place nothing on generated ground by coordinate; search for it**, and lay
  ledges last.
- **The upper layer is redrawn over the player from `route_top.png`**, a
  parallel image at the same ids and dimensions (asserted), on walkable cells
  only.
- **Look at the render.** `tools/render_area.mjs` plus `render_area.py` drive
  the shipped `drawTile`; `tiles` are already rebased, so never add the base
  again. Layout metrics (`npm run layout`) judge per kind and do not replace
  looking.
- **The minimap is drawn by the engine** from `MINI` in `map.js` (every
  character needs a colour); it is baked in `bakeMini()` only, sized by
  `miniScale`, and its canvas is hidden, never unmounted.

## UI and CSS

- **No `url()` in `styles.css` may name a path.** A relative url resolves
  against the stylesheet. Assets arrive as custom properties built against
  `document.baseURI` (`spriteUrl`, `TrainerArt`, `--icon`, `--ground`,
  `--strip`). Never re-derive a sprite path: `spriteUrl(id, variant)` plus the
  `sprite-${variant}` class.
- **Custom properties inherit downward only**; set them on the common ancestor
  (`.battle` for `data-area` and `data-phase`, `.viewport` for `--tb-h`).
- **Cascade traps**: an animation beats a plain declaration; naming an
  `animation` replaces the whole list; a duplicate `@keyframes` name lets the
  later one win silently, and so does a class name reused for something new
  (grep before naming - a second `.dx-ring` resized the Dex sheet's); hold a sprite range with `steps(n, jump-none)`;
  percentage `background-position` aligns p% of image to p% of box; media
  queries add no specificity (overrides go last); `<details open>` in React
  needs owned state; a flex item's `min-height` is `auto`; a percentage size is
  of the containing block.
- **A LOOP NOBODY CAN SEE IS NOT FREE** (`ui/pause.js`, 2026-10-08): neither
  `content-visibility: auto` nor windowing stops an animation's clock, and at
  sixteen tiers a 400-entry Box ran two hundred of them at once - 39fps
  scrolling it, 60fps with only the loops off (the masks, the blend modes and
  the sprite filters were each tried alone and none of them mattered).
  `useOffscreenPause` quiets a whole grid, `usePauseOffscreenRows` one row of a
  long list. Pausing them WHILE THE LIST SCROLLS was tried and is a LOSS -
  restyling a `*` subtree once per gesture costs more than the loops save,
  19fps against 27 on a continuous flick - so an observer, never a scroll
  handler.
- **Long lists skip what is off screen**: the Box's rows use
  `content-visibility: auto`; the Dex is WINDOWED (`useRows` renders the rows
  in view, geometry read off `.dexgrid`'s CSS) - at 1,300 tiles
  `content-visibility`'s per-tile intersection checks halved the frame rate.
  Anything that runs forever on a Box row animates only `opacity` and
  `transform`. **A Dex grid out of view pauses its tier loops**
  (`useOffscreenPause`, `.dexgrid.offscreen`): on a phone the Dex sits below
  the game, and its unseen loops were a quarter of the idle main thread. **Rail tabs stay mounted once visited** (`.rail-pane`,
  `display: contents`, hidden when not current): a switch never rebuilds.
  **The Picker builds tiles a `PAGE` at a time** as its end scrolls near
  (filters still read the whole box): a 600-Pokemon box blocked a throttled
  phone's team pick for a second. The League's cards are `content-visibility:
  auto`.
- **Every face is self-hosted and registered in `main.jsx`** through
  `FontFace` (a url in styles.css would resolve against the built
  stylesheet), and preloaded by index.html: Rubik (`--display`, `--body`, one
  variable woff2) and Chakra Petch (`--pixel`, the label-and-number face;
  three weight files, each answering for a weight RANGE). No third-party font
  host: it was a render-blocking stylesheet from two more origins, and
  offline play lost its headings. The pixel font (Geist Pixel) is retired
  from the interface (Rotom, 2026-10-01); `--pixel` kept its name, so its
  rules still never go under 9px, never use a bare `cqw`, and never set
  `letter-spacing` (asserted); rules that only inherit the face need the same
  care by hand. Touch targets on a coarse pointer are 36px (end of styles.css).
  **Every mark Rubik cannot draw is in `Symbols`** (`symbols.woff2`, Noto,
  made by `python tools/build_symbols.py` from what src/ types - re-run it
  after adding one; it refuses a mark no Noto face has). Each missing glyph
  sent a phone to its system fonts mid-layout (37ms of the fight's first
  frame). News's colour emoji stay the system's (`EMOJI`).
- **A banner waits while an encounter is undecided**: `App` holds `cheers`
  until the encounter is caught, fled or ran, so it never covers the nameplate.
  Holding UNMOUNTS it, so its clock lives on the entry (`seen`): one shown a
  second is dropped, not replayed, and `dropCheer(entry)` drops that entry.
  Its timer is keyed on the cheer, never on `onDone` (a fresh arrow a render).
- **The engine takes whole numbers**: `buy`, `buyCandy` and `levelUp` go
  through `whole()`, because the UI flooring its input does not cover the
  engine's other callers, and a NaN level sends a Pokemon to limbo.
- **Tooltips are `data-tip`, never `title`**; an icon-only control also needs an
  `aria-label`.
- **The Trade Center is a PAGE, not a dialog** (`.tc-page`): it covers the game
  with one scroll (a picker scrolling inside a scrolling card fought the
  thumb), pins its header and tabs, takes the modal lock, and pushes `#/trade`
  so the browser's Back closes it (App's hashchange). No inner `max-height`
  scrollers in it.
- **The Trade Center has ONE back**, the pinned header's corner button: it
  peels a stacked view (as Escape does) and leaves from the tabs. The offer
  composer is a trade table - the deal (give, get, Send) pinned under the
  header at `--tc-head-h`, one picker below turned to either side. `.tc-main`
  isolates, so a tier layer never draws over the header.
- **Cards in a wide rail row are one height** (stretch); the buttons sit on
  the card's floor, and an open shop row spans the row. `#root` fills
  `body`'s flex row, so the app's width never depends on what is inside it.
- **Nothing may blank the game** (`ui/crash.jsx`, 2026-10-08): React unmounts
  the whole tree when render throws, so with no boundary a crash left an empty
  page - which is what accepting a trade did when the tab had been open across
  a deploy and `TradeScene`'s chunk was gone from the CDN. `Boundary` wraps
  `Boot` in main.jsx and answers with a card and a Reload, and EVERY `lazy()`
  goes through `lazyPage`, which reloads the tab ONCE (`dexora-stale` in
  sessionStorage, so never a loop) when the failure is a module that would not
  load - the fix for a stale build being literally a reload. A lazy page added
  with a bare `lazy()` can still blank on the next deploy.
- **Every dialog closes through `useDismiss`**, never a bare `onClick` on a
  scrim, and takes the modal lock (`App` ignores keys while `modalOpen()`).
  Custom listboxes carry keyboard handling, focus return and the lock.
- **Window key handlers ignore typing** (`typing(ev)`); key releases are never
  gated. Check `KEYS` before claiming a letter.
- **Mobile is gated on `(hover: none) and (pointer: coarse)`, never width.**
  The touch pad and bag sheet appear there, the rail elsewhere. No
  `setPointerCapture`; hold state lives in a ref declared above any early return.
- **World events (outbreaks, rifts) reach the HUD only through
  `engine.events()`** (`{id, count, label, tip}`, derived, never stored),
  drawn as a gold-rimmed field card. Their icons come from
  `tools/build_events.py` (32px, checked by check.mjs).
- **A mass outbreak is one map and one species a day, picked by `outbreakFor`
  in `events.js`** (a hash of `dayKey`, like the quest), from open maps and
  from residents only: no evolved overlay, no legendary, no costume. The
  engine FREEZES it at first sight into `state.outbreak`, because the pick
  depends on level and levelling mid-day must not move it. It takes
  `OUTBREAK_SHARE` of WALKING encounters on its own map (never rod or ride),
  multiplies the tier roll by `OUTBREAK_LIFT`, ends after `OUTBREAK_SIZE`,
  and says so through `state.worn` with `event: true`. check.mjs holds it
  under a Master Ball of bounty a week and under one variant in three.
- **Research is a 0-10 level per species, in `research.js`, stored in
  `state.research` keyed by DEX ID** (never position), one row of counters
  per species touched. `TASKS` is append-only: a task's index is its slot in
  every saved row. Tasks read facts already frozen on the encounter (`night`,
  size, `throws`, `variant`) in `settle`, plus `useBerry` and `evolve` (credited
  to the species evolved FROM). EVERY TASK IS REQUIRED except a `bonus` one
  (the alpha: required, it left 0-2 species finishable a playthrough), and
  the level is a share of the species' own total. Slot 0 counts ORDINARY
  catches only, and evolving is asked only where a sub-Lv-100 row exists.
  `owned()` credits a catch AND an evolution into a species (evolved forms
  are rarely met wild), and an evolved form (`grown`) is not asked night,
  first ball or a berry. A legendary (met about once a playthrough even
  hunted) is `legend` - one catch, credited from the dex by `loadState` -
  plus `fed`, `league` (a League win with it on the team, credited to every
  Pokemon that fought in `battleEnd`) and `hundred` (Lv 100, by candy or
  evolution); `first` is not asked of it (luck on luck, reported). Its
  star costs `starCost` 1 and `starKeeps` 1, so it needs a second catch.
  Catches and `STAR_COST` are both 5 (10 was reported as too many).
  The Box offers RAISE to Lv 100 for a legendary with no evolution left. XS and XL are one task (`xl` kept, asked of nobody). A
  level pays an eighth of a sale (`RESEARCH_PAY`, halved 2026-10-04: every
  species to Lv 10 was ~¥2.0M, more than a Lv 75 game's catch income). Lv 10 only OFFERS the lift: `star(id)` spends
  `STAR_COST` ordinary box entries (lowest level first, never a keeper,
  asked first) into `state.stars`, and `researchLift(id, stars)` multiplies
  that species' tier roll by `RESEARCH_LIFT`, weaker than an outbreak.
  `loadState` drops a bad row, never the whole object.
- **An alpha is a LAYER, not a tier**: `rollAlpha` (1 in `ALPHA_CHANCE`, never
  a legendary or costume, `canBeAlpha`) rolls BESIDE the tier, so an Alpha
  Shiny exists and is rarer than either. It was a tier for one pass and lost
  that stacking. It is shown as an ICON (the alpha mark in a chip on the
  nameplate and the Box row), never a treatment, so it cannot fight a tier's
  look. `alpha: 1` is copied to the box entry like `size`; it never flees
  (calm 0), catches at `ALPHA_CATCH` inside `liveMult`, is a `keeper()`, pays
  candy at capture (`alphaCandy`), sizes `.mon-slot` (never `.mon`), and
  gets its own Box row. `enc.alpha` is a boolean - a 0 renders as "0".
- **A rift opens on `sinceTravel`** (steps since the map changed) through
  `riftChance`, a per-step hazard solved so the median is `RIFT_MEDIAN` and
  `RIFT_SURE` is certain. It lasts `RIFT_STEPS`, one at a time, and travel
  closes it. Its table effect is `RIFT_TILT` ADDED to the flute's tilt in the
  one `weighted` call, never a second transform. Finds (`riftFind`) are a
  shelf stone at your level or candy, held under a sixth of a rift cycle's
  sale income. Its tint is an element after the canvas, not a canvas pass.
  `engine.events()` ALWAYS carries the rift, as a RING (`.rift-ring`, `--p`
  from `ring`): filling with `sinceTravel / RIFT_SURE` while it builds,
  draining with `left / RIFT_STEPS` while `open`. Anything reading
  `events()` for an open rift checks `ev.open`, not the id.
- **The Events page (`Events.jsx`) reads the world through `engine.world()`**
  (today's outbreak even once over, the rift where you stand, `sinceTravel`)
  and computes research from `state.research`; every number on it is a live
  constant. The corner's event cards are buttons that open it. Discovery
  lists finished-but-unstarred research first, with its own Star button
  (`engine.star`'s spend rule), then the nearest unfinished - a finished
  entry used to vanish the moment it became starrable. **What's new
  (`News.jsx`) is a list, newest first**: add an entry at the top with a new
  id and the menu's dot returns. An entry is an `icon` (one emoji) and a
  title, its items a line each - the headline, never the design notes
  (check.mjs: ids unique, every entry an emoji, items under two phone lines);
  the two newest open, the rest a row each. "Seen" is localStorage, never the save.
- **The Dex sheet has two tabs, Forms and Info** (four left three mostly
  white space). Info is one board of Events' `ev-card`s (field notes,
  research checklist, evolution, where to look); the type-tinted hero carries
  the research ring, forms held and owned. The last tab used is remembered; header and tabs fixed, only `.sheet-body`
  scrolls, and a caught entry's card has a fixed height (`.tabbed`) so
  switching tabs never resizes it. The evolution line names only entries the
  dex has seen (`dexOf`) and walks to them (`onSelect`).
- **Events is a quest board**: progress is drawn (outbreak pips, the rift's
  zone meter and drain, research rings). A board card must not set
  `overflow: hidden` - a clipping grid item has min-height 0 and the grid
  squeezes it - and dialog-scoped headings need `.evcard` in front to beat
  `.hp-body h4`.
- **Battles are designed in docs/battles.md** - change a decision there
  first. They live on a League page (a lazy chunk), never on a map, and never
  give a Pokémon EXP or a level: a team is bought with Rare Candy. **Only
  `game/battle.js` and `ui/League.jsx` may import the League's data**
  (`leagues`, `moves`, `learnsets`, `types`; asserted), or a player who never
  battles downloads it. **League ids never change** (`beaten` keys on them;
  the fetch refuses to drop one). A leader's type comes from its OWN party,
  never the gym infobox, which is written for one version. A Pokémon's moves
  are read across its line (a Metapod keeps Caterpie's Tackle).
- **`battle.js` is pure**: `step(battle, action, rng)` returns a new battle,
  never mutates the old one, and takes every roll from `rng` (asserted). The
  engine never imports it. **Opponents are built by `opponent()` only** - their
  game movesets, their stage at the solved level, and past Lv 100 training
  (`effort`); a player's Pokémon never has effort, and a size changes no
  stat. **A rare form and an alpha carry League perks** (`perks.js`, no cost,
  stacking; your call 2026-10-02), folded in by `playerFighter` alone
  (`withPerks`): never an opponent's, never ranked's, and a perk's extra roll
  is drawn only by a fighter that has one, so every recorded battle replays.
  `perks.js` imports no League data - the Box and Rare forms read it. **Nothing on the League ladder is typed**: caps, intended
  levels, prizes and the rematch clock are derived in `tools/league-sim.mjs`
  and every level is solved by `npm run gyms`; any change to the rules, the
  rosters or the economy means re-running it (check.mjs says so). AI 3 stays
  only while it beats AI 2 55% of the time.
- **The League's cards and hero are plain** (your call, 2026-09-29): no
  coloured stripe down a card's side - the type chip and the portrait's
  ground already say it - and the region's badges sit on the title's line,
  greyed until won, with no rings. Colour and frames only where they carry
  information.
- **The League page is `src/ui/league/`, reached only by `lazy()`** (asserted,
  with the data it imports). It pauses the engine while open (`pause`: no
  walk, no redraw, deadlines shifted on resume), hands each turn to
  `battleStep` (`stepped()`) and ends with one `battleEnd` (`changed()`).
  A turn is played back as beats from its log; each event's `after` snapshot
  is what moves a health bar, so a bar falls with the hit that caused it.
  Health bars are a `scaleX`, never a width. A type's colour is `--tc` on its
  `.t-<type>` class - read it, never copy a hex.
- **The League page's own tabs** sit beside Ranked in its strip: **Shop**
  (the Battle shelf) and **Train** (Rare Candy bought and spent, and the Move
  Tutor), which reads the Box fresh each render - the engine raises a level
  in place, so a memoised copy showed the old level. **A won fight offers
  the next battle** of its own sequence (`nextAfter` in League.jsx: a gym's
  path, the League run, the hard run), starting it with the same team when
  all of it may enter, else its team pick.
- **Suggesting a team is `ui/league/suggest.js`**, for the League's team
  pick and ranked's editor both (`Suggest.jsx`): styles score, a greedy
  build spreads types and weaknesses, and a lineup is found by species or
  evolution line. Famous lineups are typed by dex id WITH the name they
  were checked by (check.mjs holds each id to its `label`); Champions come
  from leagues.js, never typed.
- **The profile is the Trade Center in `profile` mode**: your card alone,
  titled, no trading tabs, its editing and sharing unchanged - one loader,
  one editor. You › Your trainer card opens it (`.sub`: it has a Back to You),
  and You is NOT rendered under it: both are pages at one layer and You
  comes later, so the card opened behind it and the button read as dead.
- **The app is four tabs, and the tabs ARE the pages** (Rotom, 2026-10-01):
  Catch (the map), Trade (the Trade Center), Battles (the League) and You
  (`You.jsx`: the card, stat points, saves, key items, guides, settings,
  log out - everything the ☰ menu and the rail's YOU pane held; there is no
  menu). `goTab` in App is the one switch: it REPLACES the history entry
  between pages and pushes one leaving the map, so Back is always one press
  to the game, and each page reads its own hash (`#/trade`, `#/league`,
  `#/you`) and pushes nothing. One `nav` in TopBar, placed by CSS (ROTOM
  SHELL, end of styles.css): the app bar on a desktop, a bottom tab bar on a
  phone, and held sideways a MENU behind one corner button (`.tb-menu`,
  TopBar's `MenuScrim`: modal lock, Escape, `useDismiss`) - the left rail it
  replaced took 68px of a sideways phone's width from the game (2026-10-02). Layers: pages 56, the Rotom sheet 57,
  bar and tab bar 58, banners 60, dialogs 70+ - so a dialog covers the tabs.
  A fight (`body.fighting`, set by League) and a phone encounter (`.app.busy`)
  hide the bar. No `backdrop-filter` where the map shows through.
- **The rail is the Rotom panel**: Dex, Box, Shop, Map and Events (the
  board that was a dialog), its app held in App (`railTab`) so the HUD's
  event cards and "See in Box" open the right one. On a phone it is a sheet
  (`.rail.open`, the pad's ROTOM key) - hidden, never unmounted. The quest
  is a pill on the map (`.hud-left`, beside the area's name).
- **Cards are designed in docs/cards.md** - change a decision there first, and
  build one phase at a time behind its QA gate. **A collection, never a
  strength**: no rule module (`catch`, `biomes`, `battle`, `league`, `trainer`,
  `items`, `perks`, `research`, `events`) imports `game/cards.js` or card
  data (asserted). Cards is the FIFTH tab (`#/cards`, `goTab`), a lazy page
  (`ui/cards/`); `ui/cards/load.js` is the only module that names
  `data/cards/sets/*` (a lazy glob - the Dex sheet's Cards card loads through
  it too) and the main bundle carries `data/cards/index.js` alone. `npm run
  cards` (`tools/fetch-cards.mjs`, TCGdex: the sets and small images; then
  `tools/fetch_card_art.py`, Bulbagarden: the real card back and each set's
  wrappers, cosmetic) writes them;
  a Mega card links its Mega FORM by `label()`, and the fetch stops on a Mega
  it cannot match or a rarity not on `CARD_RARITIES`. The engine's
  `buyPacks` and `openCardPack(set)` are the only writers of `cards`,
  `packs`, `earnedPacks` and `cardPity`; a pack is decided and SAVED before
  the scene plays, an earned pack opens first and stamps its cards, and a
  first badge pays one (`battleEnd`'s `pack`). **Pull rates are real life,
  one row a set** (`SET_RATES`, TCGplayer's per-pack data; your call
  2026-10-06): `rulesOf(setId)` is a set's rates, hit rate and pity, and
  `openPack` takes it. A set with no row fails check.mjs, so a new
  expansion ships with its own real numbers. Pity is a safety net scaled
  to each set (`PITY_NET`: rising from 1.5x the average wait, certain at
  3x), which makes the chase ~20-25% kinder than real; `GOD_PACK` is ours,
  kept as a treat. The Packs tab prints all of it, never a typed number. The opening hides the bars (`body.cd-opening`), and
  each beat moves on only from the beat it follows (a skip mid-tear was
  dragged back by its timers). **While cards are face down, App holds
  banners and tips** (`cardScene`, raised by the page BEFORE the open, in the
  same render: a frame of the spare-card tip cost 46ms and spoiled the pack).
  Dust is spares only (`sparesOf`: never the last copy of a card and variant,
  never below its earned stamps); a craft costs `CRAFT_X` (16) spares' worth -
  the one ratio that sets what a set costs (35% of a game, measured; scaling
  `DUST` moves nothing). A card's finish follows the real frame (`CardFace`):
  a reverse holo everywhere but the art window, a holo rare only in it, a hit
  all over; a card you do not own wears none. **Crafting ends at the Double rare**
  (`canCraft`, your call 2026-10-07): an Illustration rare and up - the ACE
  SPEC too - is packs only (`PACK_ONLY`, derived). Dust's other use is a pack
  of an open set (`DUST_PACK` 400, `dustPack`), held above what a pack of
  spares dusts to (check.mjs re-measures every set). Cards carry no catch indicator.
  The last card of every pack charges and flashes (white until the charge),
  and a revealed card runs NO animation or transition (`.boom`): leaving the
  charge restarted the entrance animation and faded it in after the flash.
  Confetti lives outside the stage, whose quake transform made it the box a
  fixed layer measures from. **The scene never scrolls** (`.cd-open`
  `overflow: hidden`, the page under it locked): its rays, tear and
  confetti bleed past the screen by design, so the card and pack are held
  to the screen's height instead, and only a summary (`.scroll`) scrolls,
  downwards. A box/bundle per set (`BOXES`); a Champion pays a box, every
  `STREAK_PACK`th streak day a pack - never the Pokédex rank (a title).
  One open is one `changed()` (`settleOpen`), Open all included.
  **The Card Shop is a store** (2026-10-07, `CardShop.jsx`): tiles, a product
  page of variants (`variantsOf`: 1, 5, 10 or the set's box), a cart kept on
  the device (`dexora-cart`, never the save), and `engine.checkout(lines)`,
  which buys the WHOLE cart or none of it. My Packs opens what you hold.
  **A roll lands on the first rung at or below it the set prints**
  (`landsOn`): one `RATES` table serves every era - the top roll is a Mega
  Hyper Rare or a Hyper rare (`isTop`, what the top pity resets on), and
  Prismatic's illustration roll an ACE SPEC (`ace` sits under
  `illustration`). The Packs tab names each rate through it.
  **Phase 4**: every printing of a set is its MASTER step (`MILESTONES.length
  + 1`, `MASTER_DUST`); titles are `titleIds` (titles.js) and the SQL's
  `card_titles` the same rule (tradedb holds them equal); the trainer card's
  `card_show` comes off the STORED save through `card_showcase` (held
  printings only, `CARD_SHOW` = `trade_limit`), written by the trigger alone.
- **A finished generation is a medal** (`gen:<g>` in medals.js, your call
  2026-10-03): its non-form species in your Pokédex (trades and gifts
  count), and a family of LOOKS is held by any one drawing (`owns`: catching Unown
  registers a letter, and Johto waited on Unown A). It is CLAIMED, never
  paid on the catch: what is due is derived (`dexClaims`, the map's REWARD
  pill), and `claimDex` banks the medal, money and Master Ball and a RANDOM
  set's box in one save before `DexClaim`'s reel plays (an old
  `boxVouchers` entry is claimed the same way, rolled). The medal gives the
  title and the Pokedex Charm (`dexCharm`, `DEX_CHARM` 2x on that
  generation's tier roll, a Mega through `genOf`; between `RESEARCH_LIFT`
  and `OUTBREAK_LIFT`, your call 2026-10-03).
- **Cosmetics are designed in docs/cosmetics.md** - a look, never a
  strength: no rule module imports `game/cosmetics.js` or `data/follow.js`
  (asserted). **The walking party** (`state.party`, up to `PARTY_MAX` 3 Box
  uids, `setParty` from the Dex sheet or the strip's +/edit (`PartyPick.jsx`,
  lazy, the trade Picker); `state.buddy` the one walking, one of
  them, `setBuddy`/`cycleBuddy` from the strip on the map or Q) - a switch is
  `stepped()`, never `changed()`, and grows the next out of a flash
  (`SWAP_MS`, which holds the redraw open). **The follower** takes the tile you just left
  (`trail` in `tryStep` and `surf`); its position is never saved, and every
  teleport (`goThrough`, a ladder, `travel`) stands it on you unseen
  (`snapBuddy`); afloat, on a rail or a bike road it is in its ball. Only its
  own sheet loads, and the draw key carries its arrival. Its sprite box joins
  the trainer's for the upper layer, whoever is lower draws in front, and the
  grass goes between. `public/follow/` is `npm run follow` (indexed,
  asserted lossless). **Skins** (`skins` bought by `buySkin` and kept even when
  unknown, `skin` worn) are the walk set alone in player.json's shape (`npm
  run skins`); every other pose is drawn from it, water on the Surf blob.
  **There is no bike pose** for anyone - a rail is the walk or the run.
  The Box preview is PORTALLED to the body (`container: rail` trapped it under
  the ball rail).
- **The walking Pokemon lends its field ability and grows friendship**
  (`abilities.js`, docs/cosmetics.md): only while it is out (`walker()` - not
  riding), each effect one lever - encounter `rate`, a type's weight in
  `pickSpecies` (`TYPE_PULL`), or a `find` - never the tier roll. An entry's
  ability is its species' regular one by uid, an alpha's its hidden one.
  Steps together count on the box entry (`walked`) IN PLACE: a heart or a find
  is the one `changed()`, or a big Box rebuilds every step.
- **Road trainers are designed in docs/battles.md** (`road.js`): four a
  map a day, a hash of day, map and slot; parties from the map's own table;
  `battleBegin` judges them by `roadOpen`, `battleEnd` pays once a day into
  `state.road` - never `beaten`, so the League's solved ladder is untouched.
  A road trainer carries `road: true`, which `tuneOf` reads.
- **The daily check-in and the weekly roulette are designed in
  docs/checkin.md** (`checkin.js`): one stamp a day (`dayKey`), a streak kept
  by yesterday, the week's ladder `CHECKIN_REWARDS`, and day 7 banks a spin.
  `checkIn` and `spinRoulette` pay and SAVE before any stamp or reel plays;
  the roulette's Gold Pokemon counts as caught
  (species and Gold row), 2 slots in 15.
  Tips and banners wait while either is open.
- **A running field item is a ring** (`fx-ring`, the rift's `.rift-ring`
  rules): its rim drains with steps left over the item's own `steps`.
- **Hard mode is designed in docs/battles.md, phase 8.** A cleared region's
  leaders, Elite Four and Champion again, ids `<id>:hard`, on the strongest
  core-series party each trainer has (`hard` in leagues.js, fetched), all at
  Lv 100, their TRAINING solved to `HARD_TARGET` (20%) - `HARDTUNE` in
  gymtune.js, replayed exactly by check.mjs; a team the most training leaves
  above it stays at the most. Every attempt pays `HARD_FEE` in `battleBegin`,
  given back with the win in `battleEnd`, which also gives a first win's
  signature Pokemon (`giftOf`, arriving `traded: 1`: it counts for the dex
  like a trade, never a tier row) and a run's Master Ball. The Region Charm
  (`charmOf`) is derived from `beaten` and multiplies the tier roll; it stays
  at most a research star's lift. **The Move Tutor** saves up to four move
  NAMES on a box entry (`moves`, `cleanTaught` drops a bad field alone);
  `playerFighter`/`movesOf` is the one way a League fighter is built from the
  Box; ranked never reads it.
- **Move animations are the games' own, compiled** (docs/battles.md, Art):
  `tools/build_anims.py` turns each move's pokeemerald-expansion script into
  a timeline; `moveAnim.js` is the one player and the only loader of
  `anims.js` (`import()`, asserted). A move's bar falls at its IMPACT
  (`onImpact`), and a hurry skips, never cuts the bar. Scripts are written
  for the player attacking: mirror x when the foe does, unless the game
  has its own branch (Surf). A background and its tint sit UNDER the mons;
  sprites and flashes over them and under the boxes. The bare `canvas` rule
  is the map's - a new canvas resets it. Port a callback from its C; a
  guessed motion is where the bad frames were.
- **The engine judges a League battle; `game/league.js` is the one rulebook.**
  The order (leaders in turn; inside a reached gym its trainers in the
  roster's order, then its leader - `gymReached`, rev 5; a win never taken
  back; the Elite Four on every badge; a region on the whole of the last one,
  gym trainers and Champion included), `refusal`,
  `capOf`/`topOf` (a rematch win raises both) and `payFor` live there, and
  both the engine and the page read them - the page never decides. It reads
  only `gymtune.js`, which ships in the main bundle for this (each opponent's
  `region`, `kind` and `k`; held to the rosters and under 8KB gzipped by
  check.mjs); nothing else of the League may join it. `battleBegin(battle,
  { id, uids })` refuses (answering why) and `battleEnd()` is the only place a
  battle pays or records a win, replacing `beaten` rather than editing it
  (the page's memo keys on it). A loss, forfeit or reload pays nothing.
- **The Battle shelf is `HEALS` in items.js, one list**: the League page's
  Shop tab sells it (`ShopShelf`, shared with the rail's shop, which no
  longer carries it - phase 8) and `battle.js` reads what each item does from it - a SHARE of max HP,
  never a flat amount (a flat Potion lowered a late gym's win rate; check.mjs
  holds the share from Lv 5 to 100). `canUse` is the one answer to whether
  an item would do anything (the Bag greys on it, `step` refuses on it with
  no turn passing). `battleStep` is the only place one is spent, and it
  refuses a turn using one the bag does not hold. The prices are bounded by
  the rematch guard (a full-clock rematch outearns, in expectation, the
  healers the reference player spends at every capped opponent, replayed on
  `KIT_RECORD`); the solved levels are measured without items. The CPU uses
  none.
- **There is no level cap** (your call, 2026-10-03): `refusal` refuses only
  a trade lock, so any level and any legendary enter any battle; `capOf`
  only scales a rematch's opponent. **Your team is the save's `team`**
  (`engine.setTeam`, the League's Team tab, ordered by drag - `TeamOrder`,
  window pointer events, arrow keys); every team pick starts from it and a
  battle taken replaces it. If a battle rule ever gates legendaries, use the
  species' `legendary` field too - `isLegendary()` is false for the 17
  legendary forms.
- **Ranked is designed in docs/ranked.md** - change a decision there first.
  **Its format is species, nothing else**: `rankedFighter` (battle.js) takes
  the level, IVs and moves from `ranked.js`, because a save can choose its
  levels and uids (a uid picks IVs); asserted. **Entry asks for Lv 100 in the
  Box** (`RANKED_LEVEL`, `ranked_limit('LEVEL')`, held equal): the SQL refuses
  an under-level member when a team is saved or a challenger's read, and
  leaves one out of a stored team when matching or practising; the page's
  `present` is the same filter. A gate, never a strength: the battle is still
  the format's. `ranked.js` is the one
  rulebook (the page reads it; 6b's server function bundles it). The species
  clause counts a form as its species (`baseOf`), through the Picker's `kin`.
  **Defense teams live on the server** (`db/ranked.sql`, applied AFTER
  `db/trading.sql`, re-runnable), every uid checked against and read back
  from the STORED save - flush before `set_defense_team`, which refuses
  (never trims) a uid it cannot see. **Practice is blind on the server**
  (`practice_team` picks one team at random; the page never holds the
  others), is played in ranked's format with no Bag, and hands nothing to
  the engine. **The card is trading.sql's**: badges (`badge_list()`, held
  equal to the League's leaders) are counted in `card_stats` there - never
  redefine a trading.sql function in another file, or re-running
  trading.sql reverts it. `npm run tradedb` tests both files on the TEST
  project.
- **A ranked battle is played on the server** (docs/ranked.md, 6b). The
  referee (`src/game/referee.js`) is pure and is imported by NOTHING in src
  (asserted): the page gets views, never the state. The `ranked-step` Edge
  Function is `handler.js` (portable, run in Node by the tests) plus a thin
  Deno `index.ts`; it imports only `rules.js`, the referee bundled by `npm
  run edge` (a deployed function cannot reach src/; check.mjs fails when it
  is stale). **The seed and the state never leave the server**: every roll
  is `hash(seed:n)`, `ranked_battles` is unreadable and unwritable by every
  client, its functions are the service role's only, and `viewOf` shows the
  defender's Pokemon only once sent out (asserted). A save is
  compare-and-set on the step counter. Timers are lazy (a late turn is AI 2's;
  ten quiet minutes lose, marked on the next request). **Any change to the
  battle rules is a redeploy** (SUPABASE.md §3f), and one that makes an old
  page and the server disagree bumps `RULES_VERSION`. `npm run tradedb` runs
  the handler against the TEST project.
- **Ratings are the database's** (docs/ranked.md, 6c). Elo runs in
  `ranked_rate`, inside the transaction that finishes a battle (rows locked in
  id order), exactly once per battle; abandonment is a rated loss; no client
  may read or write `ranked_ratings` - the page reads standings through
  functions, and the result screen shows what the server says. `ranked.js`
  holds only the words (`RANKS`, `rankOf`, seasons), and its tier edges ARE
  the SQL's floors (asserted). **The anchors are solved, never typed** (`npm
  run anchors`, replayed exactly by check.mjs; then `npm run edge`, since the
  server carries them). A rank on a profile comes from `ranked_standing`,
  never a `trainer_cards` column: the card's grants belong to trading.sql,
  which must not name a column ranked.sql creates. `RankBadge` lives outside
  `ui/league/` because the Trade Center draws it too. The eight battle ranks
  run Challenger to Sovereign (`TOP_RANK` shows the rating; every band's
  edge is a SQL floor). **`RankMedal` is the one place either ladder is
  drawn**: the built `ranks/{battle|dex}/{id}.png` (`npm run ranks` - never
  ship an original from `art/`), or a disc in the rank's own `color` (on
  `RANKS` / `DEX_RANKS`, also the rank-up glow) if one is missing, asked
  once a session.
- **The Pokédex rank is a title, never a reward** (README *Pokédex*):
  `DEX_RANKS` in medals.js, SHARES of `SPECIES.length` (never counts, so a new
  generation moves them) ending on the whole dex. It reads the Pokédex as
  the card counts it (`dex_count`, trades included), so a profile works out
  anyone's rank with nothing on the server. Every registration goes through the engine's `register(at)`,
  which is what announces a step, whichever way the count moved.
- **A new rank is a ceremony, never a banner** (`RankUp.jsx`, both ladders):
  App plays a `kind: "rank"` cheer through it (held with the banners while
  an encounter is undecided), and the ranked result card plays it when
  `promotion()` says the battle crossed a rank or ended placement. Its
  timeline is delayed CSS keyframes whose RESTING styles are the final
  scene, so a skip (every non-`.loop` delay and duration crushed to 1ms)
  and reduced motion both land on the end; anything that repeats forever
  carries `.loop`, or a skip turns it into a strobe.
- **Who defends is the server's, held VOLATILE as `state.defense`** (uid ->
  "Team A", `defenders()` over `my_defense`): App reads it at sign-in and
  Ranked hands every edit to `engine.setDefense`. It exists only so a press
  that breaks a team warns: the Box's sell and evolve dialogs (a sweep lists
  a defender unticked, as a legendary), every trading screen (`defendNote`),
  and `star`, which spends a defender last and names it.
- **A remembered uid is found in the Box, then keyed with `keyOf(mon)`** -
  never `keyOf({ uid })`: a Pokemon registered for trading is keyed by its
  server id, and the League's remembered team silently lost every such one.
- **check.mjs replays every solved battle EXACTLY** (seeded record, not a
  fresh sample - fresh samples read noise as drift), holds each solve within
  ±15 points of target unless a replayed neighbour proves a cliff, and keeps
  gym trainers over 85% (lowered by the solver, never above their leader's
  proportion). The League opens when a counter can be caught (5% of an open
  map); opened at the first encounter it solved Brock to Lv 2.
- **Trading is designed in docs/trading.md** - change a decision there first.
  A Pokémon that enters trading gets a server row (`mons`) and moves only
  through `db/trading.sql`'s functions, one locked transaction each. The save
  trigger strips a `mid` someone else owns, keeps an unknown one, completes a
  delivery when it is saved, and never fails an upload. What the server says
  reaches the engine through ONE call, `reconcileTrades`; locks (`lock` on a
  box entry) are enforced in the engine; **a trade counts** (your call,
  2026-10-03, as in the games): a species that arrives by trade or as a
  hard-mode gift registers like a catch through `registerGift` - every
  medal, milestone, a generation's claim and the dex bonus - and only the
  tier rows ignore `traded` entries. `gifted` is legacy: a save's list is
  paid what it finishes once at boot, then cleared.
  `trade.js` LIMITS equal the SQL's `trade_limit()` (asserted). `npm run
  tradedb` tests the SQL against the TEST project and refuses the live one.
  Trainer cards are written by triggers and `update_card` only (the showcase
  is read off the STORED save, so flush first); the Trade Center is a lazy
  chunk; `net/cloud.js` answers `closed` when the server has no trading yet.
  App polls `trade_inbox` (60s, 15s with the Trade Center open, never hidden)
  into `reconcileTrades` via `inboxToReconcile`, flushes after anything moves
  (a delivery completes when its save lands), and queues `TradeScene` for
  `freshTrades` (per-device "seen", through store.js). Every swap goes through
  `perform_swap`, which also frees the offers it fails. An offer can ask only
  for what is on the other trainer's SHELF. A Pokemon enters trading through
  one path, `enterTrading` (flush, register, assign). App holds the ONE inbox
  every tab reads (a tab's own copy went stale when a trade finished).
  A board listing is one Pokemon for a species (+ tier if named), and the
  board is GLOBAL (your call, 2026-10-06; it was friends only) - anyone not
  blocked either way sees and completes it (`blocked_between` in
  `trade_board` and `fulfil_listing`); `fits` in trade.js mirrors
  `fulfil_listing`'s rule for the button. **Friends live on your trainer
  card** (the profile's Friends panel: requests, the list, add by code,
  blocked; their count lights You, not Trade); the Trainers tab is search.
  **A block works both ways and ends the friendship**, and friending refuses
  across one, so friends implies no block and the friends-only modes need no
  check of their own; every other read (search, card, shelf, offer, request)
  calls `blocked_between`. **Friend codes are readable by their own trainer
  only**: a column grant on `trainer_cards` (a new column is unreadable until
  granted there), so cards come through functions (`my_card`,
  `card_by_name`, `public_card` strips the code), never `from("trainer_cards")`.
  A SQL-language function is checked when created, so anything one reads
  (`blocks`, `blocked_between`) is defined above it in the file.
  `REPORT_REASONS` is append-only (the server stores the index; check.mjs
  holds it inside the SQL's range). Going live is SUPABASE.md §3d; tradedb
  applies §3c every run so the test project has live's shape.
  **Phase 6**: a FRIEND's spares are askable by box uid (`want_uids`,
  registered for them by `register_for`), a stranger's shelf only; six a
  side. A Pokemon may sit in several open offers - offering no longer sets
  `offered` (the inbox reports it as a lock, so the game still refuses to sell
  it), `trade_release` frees only `offered`, and a direct offer's give uses
  `tradeable(box, m, true)`. **`answer_trade` says `sync`** until the
  accepter's saved box carries the ids it gives; the trigger strips and keeps
  entries by uid+species as well as by id. **The last of a species is
  counted over the whole move** (`leaves_one` in SQL, `keepLast` in trade.js
  and the Picker's `limit`). Listings are bundles (`mon || bundle`). Every
  trading screen picks through `Picker.jsx` (grouped, searchable, filtered);
  wishes and wants search ANY species. The trade scene throws one ball per
  Pokemon each way. SQL first, client second: the new client calls
  `post_listing(mids)` and `propose_trade(..., want_uids)`.
- **Seaside Road is Emerald's Route 110** in Pond & Shore's slot (id `pond`),
  General + `mauville` (appended last in `EM_SECONDARY`). The Cycling Road is
  reached only through its two gatehouses (`R110_WARPS`, a same-map warp pair
  each), so the cull counts warps and Surf. Its road is upper-layer planks at
  elevation 4 and 15: `seal_hidden(g, tiles, wall, elev)` never seals an
  `EM_HIGH` or bridge (15) cell. `em_cell` is the one Emerald cell reader, and
  COLLISION OUTRANKS WATER AND BRIDGE (a sea rock is `R`, a waterfall edge `K`).
  The road is BIKE GROUND (`cycling: true`; `onRoad` = elevation 4, or 15
  while high), gated by `canBike` like a rail. Low under a bridge you are
  afloat only if you came in afloat (`wet`, set in `rise`): from the grass
  you walk beneath it, covered by the planks (`drawOverlays` draws a `hides`
  tile whole when you are low).
- **Mirage Desert is Emerald's Route 111** (id `desert`, Lv 20), General +
  Mauville - Seaside Road's blocks, so `route111` in route.json costs no art.
  Its five doors are sealed from its own `warp_events`; its two muddy slopes
  are one-way `L` (no Mach Bike). It took Ground from Mt. Moon, homes Regirock
  through `legends: ["rock"]`, and its written B band stays small because at
  Lv 20 only three B lines are open (the 6% cap).
- **The ladder goes past Surf** (2026-10-16): Rainwood Crossing is Route 120
  (id `rainwood`, Lv 25, Monsoon Trail's Fortree blocks), Meteor Falls (id
  `falls`, Lv 30, `meteor_falls`) and Icefall Cave (id `shoal`, Lv 35 -
  FireRed's, in the slot Emerald's Shoal Cave held until 2026-10-02; General
  + SeafoamIslands, no art of its own), and past them Tanoby Ruins (id
  `tanoby`, Lv 40, ONE chamber, the Monean - one floor, asked for). A new
  Emerald map reads its layout through `em_layout`, a FireRed one through
  `fr_layout`; rooms on shelves go through `em_rooms` (its `load` reads
  FireRed's), which drops a warp pair only when BOTH ends are culled.
  FireRed's ice is 0x23/0x26/0x27 (`FR_ICE`), not Emerald's 0x20. A floor
  joined only by a GBA script (Icefall's thin ice, then sliding) stays
  walled off: a one-way hole there was tried and trapped you below.
  **A walkable cell at elevation 15 is a bridge (`N`) in `em_rooms`** even
  with floor behaviour (Meteor Falls' log bridge), and **nobody surfs down
  off raised ground** (`surf_ok`, the GBA surfs from 3 only; mirrored in
  `surfable` and check.mjs): you surfed off that bridge onto a river with no
  shore and were stranded. A save afloat on water with no legal shore is
  sent to the way in at load.
- **Only the room you stand in is drawn** (2026-10-02): a map with floors
  side by side carries `rooms` ([x, y, w, h], from each builder), the camera
  stays inside the one under the trainer (centring a small one), everything
  else is black, and the minimap bakes that room alone (`bakeMini` on a room
  change). Other floors showed across the gap and the minimap drew them all.
  A new multi-floor builder returns its `rooms`. Every pond bridge (0x71-0x7D) is `N`, like the
  ocean one. Each map's cast is a few Kanto rows that set its rarity mix,
  never the route's own encounter table (your call); the types bring every
  generation. A Kanto water row on a map whose types are not Water made
  surfing it mostly Kanto; a fish-shaped row on a map with no water fails.
- **Wild levels stop rising at `WILD_TOP` (Lv 20)**: at the same half step a
  Lv 25 map met its Grass pool at Lv 14 and handed out free evolutions 21% of
  the time. Later maps are later through what lives there, not wild levels.
- **The desktop view widens, never stretches**: App fits VIEW_W to
  `VIEW_W_MAX` columns at the height `.viewport` allows (`engine.setView`,
  `--cols`); phones and tablets keep 15x11.
- **Doors are walked into, ladders stepped on.** `route.json`'s `ladders` are
  the MB_LADDER (0x61) metatiles; every other warp or door tile that some
  approach can walk into a wall is in the area's `enter`, and the engine takes
  it only when the step points into that wall or you push into it standing
  there (`intoIt`, `goThrough`, held keys dropped). tools/play drives both.
- **Monsoon Trail is Emerald's Route 119** in Deep Woods' slot (id `woods`),
  transcribed like the Safari Zone against Emerald General + `fortree`
  (appended last in `EM_SECONDARY`). Long grass is laid as tall; rails are `-` and `|`
  (`RAIL`, mirrored in map.js and build_map.py): bike-only ground in ANY
  direction - an axis rule cut the network to 11 of 55 rails. `canBike` needs
  the Acro Bike key item (`BIKE_LEVEL`); stepping off is always allowed, and
  riding draws the `bike` set, appended last in player.png. Every
  reachability fill counts SURF (`SURFABLE`, mirrored): the northwest lake is
  surf-only, and a walk-only cull walled it off.
- **Ember Caldera is Emerald's Magma Hideout**, all eight rooms in shelves on
  one grid (`MAGMA_SHELVES`), warps and the way in read from each room's
  map.json. It was Victory Road re-skinned in our volcano autotile, which
  could not draw a real cave's thin walls or rungs. Lava (Lavaridge 189/307)
  is `V`, as Cinderpeak's crater; `elev` as Monsoon Trail.
- **Doors join maps** (`DOOR_PAIRS` in build_map.py): each builder reports its
  door and arrival tile, `mapdata` carries `doors: [x, y, area, ax, ay]`, and
  the engine takes one late in `onArrive` (the step counts, no encounter). A
  door to a map your level has not opened stays shut and says so.
- **A route's houses and small caves are ROOMS on its own grid**
  (`attach_inside`, `INSIDE` in build_map.py; asked for, 2026-10-07): the
  real Emerald layout each door's `warp_events` names, on a shelf under the
  route, joined by a warp pair door <-> mat (a second mat cell one way onto
  the door - tools/play's hole test excuses a landing that is another warp's
  end). A room is `rooms` [x, y, w, h, 1]; the fifth element is INDOORS and
  `onArrive` rolls no encounter there. Its art is baked only up to the last
  metatile any room uses (`EM_UPTO` in build_assets, `inside.n` asserted).
  Doors further in stay shut; New Mauville, Trainer Hill (lobbies to whole
  facilities) and the Scorched Slab (surfed up to: a warp reached only afloat
  has nothing to step off onto) stay sealed.
- **Grass is a field effect** (`grassfx.png`, Emerald's frames on every map):
  stepping into `,` rustles once, then the rest frame covers your feet;
  drawn after the trainer and before the overhangs, never saved.
- **Elevation is the GBA's, where a map carries `elev`** (the real map's
  0-15, one hex digit a cell: Frost Hollow, the Safari Zone, Monsoon Trail,
  Ember Caldera). It decides WHERE YOU WALK: a step onto another elevation is
  refused unless one side is 0 (steps, ramps) or the target is 15 (a bridge) -
  `elev_step`/`reach` in build_map.py, `elevOk` in the engine, and check.mjs's
  fill, all three one rule. Surfing, going ashore, a hop and a ladder are
  exempt. Without it Frost's shelf lips and the Safari's raised ground (38 and
  51 edges) were floor. And it decides DRAWING: the last elevation not 0 or 15
  in `HIGH_ELEV` (= build_map's `EM_HIGH`, asserted) puts the trainer above
  the upper layer - Frost's shelf drew its lip over him. Stepping OFF a
  bridge takes the new elevation (the GBA keeps the old). LEAVING THE WATER
  obeys elevation too (`shore_ok`, mirrored in engine and check.mjs): onto a
  plank only under a span (15), never into a deck (4); ashore never onto
  raised ground; and from UNDER a bridge only as a walk, so the land beneath
  one is not a shore (it was, and a surfer came out on top of the Cycling
  Road). When you are low, raised cells (4+, 15) near the sprite draw over
  it even if solid (`raisedOver`). A test that moves the trainer must load
  him there (`boot`), not write x and y: he keeps the elevation he walks at.
- **Night mode is tokens.** `data-theme` on <html> (`theme.js`, mirrored in
  index.html before first paint; a device preference, never the save; night
  unless chosen otherwise - Rotom is a screen). The palettes are Rotom's:
  navy glass at night, frosted white by day; `--cta` is the orange of the one
  action a screen has, `--accent` cyan is what is selected. Any
  colour that must change at night is a `:root` token redefined in the one
  `[data-theme="dark"]` block at the end of styles.css (check.mjs holds every
  colour token to a night value); a few pastel banners and the silhouettes
  have their own dark rules there. The map, battle skies and tier effects are
  art and do not change. Never type a light literal where a token exists.
- **The rail is a size container** (`container: rail`): its lists answer to
  the rail's width, never the device's - cards in columns from 620px, and
  the Dex takes as many >= 76px columns as fit (`useRows` reads the count).
- **Dialogs have a short-screen shape** (`max-height: 540px`, tighter at
  420px): picture left, the rest right, and the close or confirm button
  always on screen. A sideways phone is 360-430px tall; audit there.
- **An encounter's sprite is fetched before the encounter**: App warms the
  map's table through `preloadSprites` in idle time and KEEPS the Images
  (the host answers `no-cache`; a dropped one revalidated and drew late),
  and the battle's `<Sprite eager>` is never lazy.
- **`vercel.json` sets the cache headers** (2026-10-07): hashed `/assets/`
  for a year, fonts a month, every art folder a day plus a week stale. With
  Vercel's default every visit re-checked every sprite, and the free tier's
  1M CDN requests ran to 75%. A new art folder joins its list.
  **The atlas urls carry `ATLAS_REV`** (mapdata.js, the sha1 of route.png,
  route_top.png and route.json; tileset.js and the index.html preloads via
  vite.config's `stampAtlas`; check.mjs re-hashes): every tile id is an
  index into that atlas, and after a re-bake a cached old one drew every
  map's tiles wrong with sprite ghosts (reported 2026-10-07).
- **The page never scrolls sideways**: `html, body { overflow-x: clip }` is the
  guard, not the fix - an overflow is still a bug to find and size down.
- **Irreversible presses ask first, gated in the engine** (`state.ask` in
  `throwBall`, `flee` - a legendary or an alpha - `star`, and `travel` off a
  map with an open rift, which covers doors too), so every call site is
  covered. App shows the non-encounter ones (`star`, `rift`) outside a battle.
- **The nameplate is one row on a phone**: `@container (max-width: 520px)` on
  `.battle` drops the flavour (height/weight, GEN, the tier's word; the alpha's
  word under 330px), never the name, level, XS/XL, types or badges.
- **An alpha announces itself once**: `.alpha-ring` and `.alpha-stamp` are
  siblings of `.mon` that play and fade; the nameplate chip stays.
- **The Box preview** (`Preview.jsx`) is a button laid over the sprite's
  grid cell, never wrapped round it (`.boxrow > img` sizes every variant).
- **A readout outlives its system**: when a system changes, audit what reads it.

## Engine

- **`changed()` means the collection moved; `stepped()` means only the scene
  did.** Steps, a throw's phases and a cast's beats call `stepped()` (rev
  only), or the Dex, Box and rail rebuild per frame of animation - the
  variant-catch lag (tools/play caps a throw at 2 `colRev` bumps). The map is
  not redrawn under a battle once it has faded in (`BATTLE_FADE`), and Dex
  tiles are a memoised `Cell` on primitive props.
- **A still scene is not drawn again**: `frame()` renders only while a step,
  a rustle, a cast or a battle's fade is playing, or when `drawnKey` moves
  (`rev`, where the trainer stands and faces, the view's width, the art). The
  map has no clock-driven animation, so anything new drawn on the canvas that
  changes by itself must join that condition. Standing still, the redraw was
  half of a phone's idle main thread (tools/play counts the paints).
- **The ground is baked in chunks** (`CHUNK` 16 tiles, at most `CHUNK_MAX`
  a layer, least recently drawn first): the same `drawTile` calls into
  offscreen canvases, one missing neighbour baked a frame, the upper layer
  its own canvas where there is canopy, each cell's tile id kept for the
  overlays. Pixel-identical to the tile loop (compared per map in a browser,
  2026-09-30). A new map or new art starts it over; anything that makes a
  tile change mid-map must clear it. One map-sized canvas is too big for an
  iPhone's Safari.
- **A walk tells React a few times a second** (`walked()`, `WALK_NOTICE`):
  a step bumps `rev` at once (the canvas redraws on it) and hands the UI one
  notice per 250ms; `changed()`/`stepped()` notify at once and take a
  pending one with them. tools/play holds both.
- **Stalls are paid back in `frame()`**: any gap over `STALL` pushes every live
  deadline forward (`move.startedAt`, `encounter.until`, `fishing.until`). A
  new timer joins that list. It is `stepped()`, and it drops held keys only
  without focus or past `AWAY`: as `changed()` on every gap, one heavy frame
  (a big Box rebuilding) bumped colRev, rebuilt the Box, stalled again - a loop
  that stopped every held walk (reported as choppy walking, 2026-10-07).
- **Alias imports a local function might shadow** (`advance as advanceGoal`).
- **A stored size is copied from the encounter to the box entry**; the uid hash
  is only the fallback.

## Testing

- **Verify every new assertion by putting its bug back.** A test that moves with
  the thing it tests (reading the same constant) proves nothing; break the
  mechanism instead.
- **A literal in an assertion is not a rule.** Assert the relationship; keep a
  number only as a bound with its reason. Check copies of one fact against each
  other (CSS against the PNG header, `tileBase` against `route.json`).
- **tools/play drives the real engine** with a hand-driven clock. Never walk to
  trigger something that is not the walk (every step can start an encounter);
  call the engine directly. Never use `startEncounter()` for encounter bugs.
- **Seeded randomness uses `mulberry32`**, and smoke tests need a save with real
  content (a one-species box hides whole classes of bug).
- **In a headless browser, measure layout with `offsetWidth`** (bounding boxes
  include frozen transforms), sample animations across their whole cycle,
  emulate the pointer (not just the size), and use the dev server, not
  `vite preview`.

## Editing

- **Keep CRLF line endings.** Git Bash's `sed -i` strips them; write patches in
  Python with `newline="\r\n"`, and check with `file` afterwards.
- **Write patch scripts with the Write tool, never a shell heredoc**, which
  drops backslashes.
- **Patch by matching block text and assert each replacement matched exactly
  once.** Never replace the span between two `index()` anchors; replace the
  function.
- **Revert temporary harnesses** (`__t.html`, viewport edits) before finishing.

## Working style

- Read the task as a checklist and satisfy each sentence. For details it leaves
  open, follow the nearest existing code rather than inventing.
- Match the surrounding comment density. Comments explain why, and usually name
  the bug that motivated the rule.
- Prefer deleting to adding. No abstraction with one caller, no config for a
  value that never changes.
- Do not re-run a check that passed until the code changed.
