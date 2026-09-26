# Dexora

A non-commercial browser game: walk, meet, throw, bank the duplicates, evolve.
It covers the whole National Dex from Kanto to Paldea plus its forms (count:
`SPECIES.length`) across eleven maps, most of them tile-for-tile copies of real
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
  touching each other's saves; it does not make a save honest. So there is no
  leaderboard.
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
- **Settings is a dialog off the top bar**, with one profile writer
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
  when it has one. Never parse slugs.
- **`genOf` has its own Map** because it runs at module init, before
  `speciesById` exists.

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
  more than `SPECIES_CAP` (6%) per species it has there.
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
- **Legendaries live only on maps sharing their primary type** (`legendTier`,
  `LEGEND_HAUNT` and `LEGEND_STRAY` are 0). Each is worth `LEGEND_EACH` per
  head, capped at `LEGEND_CEIL`; a zero-weight row is not emitted. `types` on a
  map decides legendary homes, so widening it is never flavour. Every
  legendary must keep a home.
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
- **The eight tiers are kinds, not strengths.** Keep the spread narrow; move the
  ratio, never the base. Vivid stays rarer than 1 in 100.
- **`rollVariant` walks rarest first** and takes a `locked` set from
  `lockedTiers(id)`, an art check only (one argument). `tiersFor` derives from
  it. Origin means debut art older than the base art (`genOf < baseArtGen`,
  `ART_GEN` a row per generation). Showdown needs a real strip
  (`hasShowdown` reads the files).
- **Pity is a capped multiplier on the whole ladder**; `dry` resets on the roll.
- **`keeper()` protects variants in the engine**, on `sell` and `convert` both.
  Legendaries are not keepers: sweep dialogs list them unticked, and
  `run(picked)` never falls back to the full list.
- **An evolution can cost a tier** when the target has no such art; warn with
  `lockedTiers(target)`.
- **A tier's `filter` carries `!important`; its `animation` must not.** An
  animation outranks a plain declaration, and `.mon.captured` / `.mon.gone`
  carry `!important` so capture and flee beat any tier idle.
- **`VariantFx` is the one moving layer.** Layers are siblings of `.mon` and
  are gated on `monHere`.
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
  (`stepWage`, denominated in the dearest ball that can still fail). The dex
  bonus climbs but is not income.
- **Priced items are checked against the live economy**: a honey costs less
  than its run earns (dearest vs richest map, cheapest vs starting map); the
  Master Ball has a computed floor and ceiling; Master Balls total 8-12 per game
  (`MASTER_EVERY` 10 at a Lv 75 cap).
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
  the White Flute and a honey stack. `rarityPower` is the only rarity transform.
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
  every trainer. The cap is Lv 75.
- **74 points against 100 ranks**, asserted: a trainer can never max
  everything. Doubling `MAX_RANK` means halving every coefficient in
  `trainer.js`, `effect()` strings included.
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
  needs a walkable neighbour. Area ids never change (`ridge` is Mt Moon, `tower`
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
  later one win silently; hold a sprite range with `steps(n, jump-none)`;
  percentage `background-position` aligns p% of image to p% of box; media
  queries add no specificity (overrides go last); `<details open>` in React
  needs owned state; a flex item's `min-height` is `auto`; a percentage size is
  of the containing block.
- **Long lists use `content-visibility: auto`**, and anything that runs forever
  on a Box row animates only `opacity` and `transform`.
- **The pixel face is Geist Pixel, self-hosted and registered in `main.jsx`**
  as `Pixel` through `FontFace` (a url in styles.css would resolve against the
  built stylesheet). `sizeAdjust` 110% is the one scale knob: it is
  proportional and narrower than the Silkscreen the layout was sized for.
  A pixel rule never goes under 9px, never uses a bare `cqw`, and never sets
  `letter-spacing` (asserted); rules that only inherit the face need the same
  care by hand. Touch targets on a coarse pointer are 36px (end of styles.css).
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
  plus `fed`, `first` and `hundred` (Lv 100, by candy or evolution); its
  star costs `starCost` 1 and `starKeeps` 1, so it needs a second catch.
  The Box offers RAISE to Lv 100 for a legendary with no evolution left. XS and XL are one task (`xl` kept, asked of nobody). A
  level pays a quarter of a sale (`RESEARCH_PAY`, under a fifth of catch
  income, measured). Lv 10 only OFFERS the lift: `star(id)` spends
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
- **The Events page (`Events.jsx`) reads the world through `engine.world()`**
  (today's outbreak even once over, the rift where you stand, `sinceTravel`)
  and computes research from `state.research`; every number on it is a live
  constant. The corner's event cards are buttons that open it. **What's new
  (`News.jsx`) is a list, newest first**: add an entry at the top with a new
  id and the menu's dot returns. "Seen" is localStorage, never the save.
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
- **Trading is designed in docs/trading.md** - change a decision there first.
  A Pokémon that enters trading gets a server row (`mons`) and moves only
  through `db/trading.sql`'s functions, one locked transaction each. The save
  trigger strips a `mid` someone else owns, keeps an unknown one, completes a
  delivery when it is saved, and never fails an upload. What the server says
  reaches the engine through ONE call, `reconcileTrades`; locks (`lock` on a
  box entry) are enforced in the engine; a trade fills the dex only (`gifted`
  is excluded from every reward, and tier rows ignore `traded` entries).
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
  A board listing is one Pokemon for a species (+ tier if named), friends
  only; `fits` in trade.js mirrors `fulfil_listing`'s rule for the button.
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
  is `V`, as Cinderpeak's crater; `lift` as Monsoon Trail.
- **Doors join maps** (`DOOR_PAIRS` in build_map.py): each builder reports its
  door and arrival tile, `mapdata` carries `doors: [x, y, area, ax, ay]`, and
  the engine takes one late in `onArrive` (the step counts, no encounter). A
  door to a map your level has not opened stays shut and says so.
- **Grass is a field effect** (`grassfx.png`, Emerald's frames on every map):
  stepping into `,` rustles once, then the rest frame covers your feet;
  drawn after the trainer and before the overhangs, never saved.
- **Elevation decides who draws over whom** where a map carries `lift`
  (Monsoon Trail): `^` puts the trainer above the upper layer, `v` under it,
  `.` (Emerald's 0 and 15: bridges) keeps the last. Updated in `tryStep` and
  `travel`. Without it a trainer walking a bridge or a clifftop went under it.
- **Night mode is tokens.** `data-theme` on <html> (`theme.js`, mirrored in
  index.html before first paint; a device preference, never the save). Any
  colour that must change at night is a `:root` token redefined in the one
  `[data-theme="dark"]` block at the end of styles.css (check.mjs holds every
  colour token to a night value); a few pastel banners and the silhouettes
  have their own dark rules there. The map, battle skies and tier effects are
  art and do not change. Never type a light literal where a token exists.
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
- **Stalls are paid back in `frame()`**: any gap over `STALL` pushes every live
  deadline forward (`move.startedAt`, `encounter.until`, `fishing.until`) and
  drops held keys. A new timer joins that list.
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
