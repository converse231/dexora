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
| `public/sprites/cadence/`, `src/data/cadence.js` | `npm run cadence` (Black and White's own idle, 16-frame strips at native pixels; `tools/strip_frames.py`, shared with Showdown's builder) |
| `public/titles/` | `npm run ranks` from the drawn originals in `art/titles/` |
| `src/data/cards/prices.js` | `npm run prices` (TCGplayer via TCGdex, a dated snapshot; display only) |
| `public/sprites/<event look id>.png` and its shiny | `npm run eventart` from the drawn originals in `art/events/<event>/<base id>.jpg` (keyed, shrunk to the base's canvas, the shiny by the species' own recolour) |
| `public/arena/<id>.webp`, `public/arena/cover/<material>.webp` | `npm run arenas` from the drawn floors in `art/arena/<id>.png` (26:16, shrunk to 832x512 WebP; one per `ARENAS` id) and the cover blocks in `art/arena/cover/` (transparent, cropped to solid pixels, 128px; one per `GROUND` material) - check.mjs holds both |
| `public/arena/pmd/`, `src/data/pmd.js` | `npm run pmd` (PMD Sprite Repository, pinned `COMMIT`, cached in .assets-src/pmd; ~5 min on all cores - `-- 25 6` bakes a sample but writes no pmd.js) |
| `public/arena/fx/`, `src/data/fx.js` | `npm run fx` from the drawn originals in `art/arena/fx/` (white pixel art, tinted per type by render.js's `tinted`; a sheet's frames found by the gaps nearest even spacing, each anchored in one box; check.mjs reads every header and re-hashes `FX_REV`), the moves' own colour art in `art/arena/fx/moves/` (a new file needs its frame count in `MOVES`, or the build stops; one whose frames grow across the row goes in `WIDEST`), and the optional ULTI panels `ult-<pattern>` / `ult-<dex id>` |
| `public/arena/intro/` | `npm run intro` (the Arena announcement's two fighters, cut from the shipped PMD atlases; re-run after `npm run pmd`) |
| `public/sprites/female/`, `public/sprites/shiny/female/`, `src/data/genders.js` | `npm run genders` (PokeAPI's gender rates and female looks, cached in .assets-src/genders; art from the ordinary sprite's OWN set only) |

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
- **A guest plays before an account** (onboarding, 2026-10-22): the front
  door (`Welcome` in Gate.jsx) is PLAY NOW, which sets `GUEST_KEY` and plays
  local mode's unowned save on a cloud build (Boot drops a stale
  `OWNER_KEY` after `settle` has parked its save). "Save my progress" (You,
  Trade, App's `JoinAsk` at `JOIN_AT` catches) sets `ADOPT_KEY`, and
  `settle` ADOPTS the guest save only for a brand-new account with nothing
  on the server and nothing parked; anything else parks it as below. An
  invite link skips the door for the sign-up it is for.
- **A save of only `{ char }` is a new game, not a broken one**: Boot writes
  it before the engine exists, and reading it as unreadable drew every new
  player's first session as Red and never uploaded it (2026-10-22).
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
- **The admin dashboard is designed in docs/admin.md** (2026-10-20): its own
  app in `admin/` and its own Vercel project, never imported by src/, reading
  only src/game and src/data (check.mjs's `admin ok`). **The database is the
  guard**: every `admin_*` function calls `admin.guard()` first - a listed
  admin (`admin.admins`, inserted by hand), at `aal2` only while
  `admin.mfa_required()` is true (two-factor is PARKED off, your call
  2026-10-20) - and tradedb calls each as anon, a player and, switched on,
  an admin without two-factor.
  `db/admin.sql` goes on after trading, ranked and referrals and redefines
  none of their functions; its `saves` trigger swallows its own errors (a
  statistic never costs an upload); it never writes a save, and a flagged
  account is out of every count and board.

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
- **An event look is a costume from a dated event** (`src/data/eventforms.js`,
  hand-written; Hallowed Night, 2026-10-24 to 11-07, asked for 2026-10-19):
  `form: "event"`, ids 19901+ (under trading.sql's 20000), built from its
  species in dex.js and appended by `wave` (fetch-forms takes a wave past
  it). It is met ONLY as a substitution (`eventLook` in events.js, after
  `rollLook`): `EVENT_SHARE` of its species' meetings on the event's days
  (HALF since 2026-10-24, asked for once live: as common as the species it
  dresses, like one more Pokemon in its slot; the hunt's `dreams` rose 7 -> 20),
  `EVENT_NIGHT` at night, a Spooky Honey's `lure`, never past `EVENT_CAP` -
  so no table, rod or League level moves, and no roll is drawn outside the
  event (seeded records replay). It evolves only into its event's look of
  the next stage (`event` rows, fetch-evolutions). **It is no entry of the
  Pokedex**: `DEX_TOTAL`/`dexCaught` (dex.js) and trading.sql's
  `event_slots()` (held equal) skip it - no medal, milestone, rank, dex
  bonus or "left to find" - and the Dex files it under the Event region.
  Front art only, so it never battles (`refusal`, `teamProblem`, the anchors'
  field) and walks as its species. Every look of an event in the Pokedex is
  `event:<id>`, claimed on the Events board (`claimEvent`): the title and a
  pack. Its items (`event` on an item) are sold and used only on its days,
  on their own shelf; a ball nobody drew is a recolour in build_balls.py
  (`RECOLOURED`: the Hallow Ball is the Poke Ball's every frame and icon), a
  jar nobody drew is the honey jar in CSS (`fx`, ItemIcon). `SeasonIntro`
  announces it once per device - and once more as a teaser in the
  `TEASE_DAYS` before it opens (2026-10-20, asked for), after the day's
  check-in, never beside it. Its countdowns (dialog, board card, the HUD's
  `SeasonChip`) each tick on their own clock (`useNow`), never App's. Its
  `checkin` weekday pays its items on top of the day's reward
  (`eventCheckin`: Friday, five Hallow Balls). **An event's `hunt` is its legendary**
  (Scarecrow Darkrai, 2026-10-20): never a swap or a table row. Each costume
  caught on its days is a Bad Dream (`state.dreams`, `huntOn`); at `dreams`
  the next wild meeting in its `area` after dark IS it (`huntDue`, no alpha,
  it asks before you run); lost, the count falls to `keep`; caught, it is
  `event:<medal>`, a title of its own. Event art is keyed by
  build_event_sprites.py: the border flood, enclosed pockets that fit a
  checker at its own square size (Gemini paints a pocket on a grid of its
  own), specks, and accent colours one at a time.
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
  **A new look first** (2026-10-20, asked for: Minior took ~22 meetings for
  eight drawings): while a family has drawings you have not CAUGHT, `rollLook`
  gives you one of those (`owned`), so N looks take N catches; still one draw.
  **Silvally is its own appended family**, out of `LEGENDARY`: `SILVALLY_SHARE`
  (1 in 250) of every map with types, the drawing narrowed to the map's types
  (`types`), so a Fire Silvally lives on fire maps; Type: Null stays a
  legendary and evolves into a Silvally you lack. check.mjs's `looks ok`.

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
  already hold the species' band - read off the HAND-WRITTEN cast, so a
  species whose type's map lacks the band in its cast lands on a secondary
  type's map; where that reads wrong, `HOME_AT` names the home (Minior: Mt.
  Moon, 2026-10-19 - it was one of ~230 on Tall Grass). The `GEN_HOME_MIN` filler must share a type
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
- **An `only` map is one family's home** (Tanoby: Unown, asked for; the
  Weather Institute: Castform and its three weathers, 2026-10-17), and NO
  OTHER map homes its species (`KEPT`, honoured by `derivedHomes` and the Gen
  2 filler: the filler put Unown in Meteor Falls, and Castform's wild weather
  forms were homed on fire, water and ice maps; check.mjs holds every map,
  surf and rod clear). An `only` map may also hold GUESTS (`kept` names its
  own family; the rest live on their maps too - the Institute's weather
  Pokemon, 2026-10-20), and its written weights are its table: no fit (the
  generation fit made Rotom 27% of the Institute). No `types`, so nothing homes there and no legendary
  lives there; surfing it meets the same table (`surfTable`); check.mjs's mix
  suites (`MIXED`) and the rift-finds bound skip it, and its table rule counts
  DRAWINGS (a row's looks, or the row) - at least four - where every other
  map needs eight rows.
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
- **The twenty tiers are kinds, not strengths.** Keep the spread narrow; move
  the ratio, never the base. Vivid stays rarer than 1 in 100. A new tier keeps
  the any-variant RATE (every rung moves up to make room, held for a species
  without Origin), and the spread stays 2.30x. **Showdown is the chase and
  Cadence is a rung under it** (your call, 2026-10-16: the two drawn from real
  animation), then Gold. Holding the rate moves the kindest rung up with the
  rest, so `variantPay` (relative to it) keeps variant income flat - four
  tiers cost the League nothing (biomes.js).
- **A tier's name is `tierName`** (biomes.js): Fire Red and Leaf Green are two
  words, and eleven screens capitalised the id themselves. Never `t[0]
  .toUpperCase()` a tier.
- **The treasure set is Gold's** (2026-10-08, your call): Diamond, Platinum and
  Emerald sit directly under it, then Ruby and Sapphire (2026-10-16: the same
  stone in two colours, `gem-<tier>`), so the stones are one material each. Each is ONE filter and ONE idea of motion, and the three ideas are
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
  stepped by `steps(16, jump-none)`, and a span has no intrinsic size, so every
  container drawing a Pokemon must size it - 15 of them, asserted. Naming the
  tier instead of the kind made that 24 rules for one tier; the shared hook
  makes a third strip cost no CSS. **Cadence is Showdown's twin and must not
  read as it**: Showdown is the Showdown community's animation, Cadence is the
  one Black and White played, so the tell is life (`it breathes`) and not
  motion. It ARRIVES STILL and wakes after a beat, which is the whole
  separation - every other sprite in the game is a frozen picture, so a Cadence
  one is too, until it starts breathing. Its `cad-breath` bloom is the only
  persistent tell a Dex tile gets, because a tile has no arrival.
  **A strip is drawn only where the species has one** (`drawsStrip`, 2026-10-13):
  a background cannot fall back the way an `<img>` does, and the tier travels
  through evolution, so 164 evolutions (Megas, Gmax, Alolan forms) drew an
  empty tile. Without its strip a creature wears its plain picture and the
  tier's layer. Anything that builds its own strip span (Evolve.jsx) asks it too.
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
- **The Dex filtered to a tier shows its gaps** (2026-10-15, asked for): every
  species that can wear it (`tiersFor`), the held ones in its art and the
  rest as dashed `.lack` tiles - always both (the Held / Missing tabs went,
  2026-10-16, your call).
- **`keeper()` protects variants in the engine**, on `sell` and `convert` both.
  Legendaries are not keepers: sweep dialogs list them unticked, and
  `run(picked)` never falls back to the full list.
  **A rare form's duplicates convert from their own row only**
  (`convertVariants`, `variantSpareUids` in `spares.js` - kept out of
  items.js because the ranked referee bundles it whole): never the row's
  best, an alpha, a trade lock, the walking party or the League team, at the
  ordinary candy rate; never sold, never the sweep's (2026-10-13).
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
- **Showdown is a 16-frame strip on a span, not an `<img>`**, stepped with
  `steps(16, jump-none)`. **Its small sources are Scale2x'd at build time**
  (`up` in strip_frames.py, `UP` 200 in build_showdown.py; 2026-10-16,
  reported blurry): 16-colour pixel art as small as 45px drawn at ~150px
  smeared wherever a browser smooths a background image. ~1.6x the bytes. Both strips keep the source GIF's own pixels on a
  square canvas (`CAP` 192) with the full 256 colours - a 64px, 64-colour canvas
  was the blur (2026-10-10) - and their frames are picked by time; check.mjs
  holds `FRAMES` to the CSS and to every PNG's height. It is sized to 77% of its box (a Showdown frame fills
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
  league-sim), first wins at `PRIZE_CEIL` 15% of it and rematches at
  `REMATCH_CEIL` 30% of income per step (both 1.5x on 2026-10-16, asked for): 76-100 is post-game, and pricing against it would have doubled
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
  queries add no specificity (overrides go last); a lost `}` is not an
  error - browsers take what follows as NESTED rules, the build passes and
  layouts vanish (check.mjs balances the braces and refuses a rule in a
  rule); `<details open>` in React
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
- **A tab notices a new deploy** (`ui/update.js`, 2026-10-10): iOS keeps a
  backgrounded page alive for days, and an old page fetching NEW art drew
  every Cadence twice (16-frame strips under 8-frame CSS). On returning to
  view (and every ten minutes) it compares the live page's hashed main script
  with its own; newer means reload at once on the map with nothing open, and
  the "New version ready" pill anywhere else - an encounter is never lost to
  an update. The page itself is `must-revalidate`, so a reload always lands.
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
  the level is a share of the species' own total. Slot 0 counts EVERY catch,
  a rare form and an alpha too (your call, 2026-10-12), and evolving is asked
  only where a sub-Lv-100 row exists.
  `owned()` credits a catch AND an evolution into a species (evolved forms
  are rarely met wild), and an evolved form (`grown`) is not asked night,
  first ball or a berry. A legendary (met about once a playthrough even
  hunted) is `legend` - TWO catches (the first credited from the dex by
  `loadState`) - plus `fed` and `hundred` (Lv 100, by candy or evolution);
  `first` is not asked of it (luck on luck, reported), and `league` (a League
  win with it) was replaced by the second catch on 2026-10-12 - its slot
  stays, asked of nobody, and nothing credits it. Its
  star asked for a second catch until 2026-10-09; it is free now like every
  other. The catch task is 1, 3, 5 (10 was reported as too many), and those
  five ARE the duplicate incentive.
  The Box offers RAISE to Lv 100 for a legendary with no evolution left. XS and XL are one task (`xl` kept, asked of nobody). A
  level pays an eighth of a sale (`RESEARCH_PAY`, halved 2026-10-04: every
  species to Lv 10 was ~¥2.0M, more than a Lv 75 game's catch income). Lv 10 only OFFERS the lift: `star(id)`
  pushes the id into `state.stars` and `researchLift(id, stars)` multiplies
  that species' tier roll by `RESEARCH_LIFT`.
  **A STAR IS FREE AND SPENDS NOTHING** (your call, 2026-10-09). It took five
  ordinary ones - the same five the catch task had already counted, so the
  price never made anybody catch duplicates; the TASK does. What it did was
  make the Box's sweep a trap: convert your spares, finish the research, and
  the five you needed had gone to candy, which was reported as the reason to
  stop converting at all. Free, it also asks nothing about what you still
  HOLD: the research is what you did, not what you kept. Everything the price
  needed went with it - which ones went, how many stayed, the ranked-defender
  warning, the mid-evolution refusal, and the confirm dialog (`state.ask` has
  no `star` kind). **The lift stays 1.5x BECAUSE it is free**: every finished
  species gets one, so it is closer to a global multiplier than a bonus (any
  variant 1 in 19 -> 1 in 13 across the dex, and variant bounty is renewable
  income the League's prize unit is denominated in). At 2x one species would
  also outrank the Pokedex Charm (2x, a whole generation) and the Region Charm
  (1.5x, nine hard runs) - check.mjs refuses both.
  `loadState` drops a bad row, never the whole object.
- **The first days are `starter.js`** (onboarding, 2026-10-22: new players
  never found the core features). A partner picked with the trainer
  (`STARTERS` at `STARTER_LEVEL`, `grantStarter` into an EMPTY Box only,
  walking; Boot writes it through with `saveNow`, since a dev StrictMode
  engine is built twice). A new player's first throw cannot fail (`caught`
  0, never a legendary). The **Starter Path** (`PATH`, `path` = goals
  claimed, in order, `claimPath`) stands where the daily quest does; the
  quest and the check-in wait for its first goal, the quiz and an
  event's chip and announcement for its second - one thing to do on a first
  visit. Derived like achievements; a save with catches loads it finished
  (`cleanPath`).
- **The catch chain is `combo.js`** (Catch Combo, 2026-10-14): `state.combo`
  `{ species, n }`, keyed by `looksOf`'s base. A catch of it adds one, any
  other catch starts over, running from or losing ANOTHER species is free,
  and the chained one fleeing or run from breaks it (`chainOn` in the
  engine, which banners a rung and a lifted chain lost). `comboLift` is a
  tier lift on that species alone, in the one `rollVariant` call; its top
  rung stays at most `DEX_CHARM` (check.mjs). Its first chain of two shows
  the `combo` hint once - the update's map card.
- **The game makes no sound** (your call, 2026-10-14): Pokemon cries and
  rustling grass spots were built and taken out the same day. Ask before
  adding audio or a clock-driven map effect back. The ONE exception is the
  Arena's sound effects (2026-10-23, asked for), OFF until a player turns
  them on in its pause menu: `ui/league/arena/sfx.js` makes every sound with
  Web Audio from the match's events (no files), a device preference
  (`dexora-arena-sound`), suspended while the page is hidden - and the only
  file that may make a sound (check.mjs).
- **Who's that Pokemon is `quiz.js`** (2026-10-14): `quizFor(dayKey())`
  hashes the day to a species (never a form) and three names of its
  generation; `answerQuiz` takes ONE answer a day (`state.quiz`
  `{ day, ok }`), pays `QUIZ_PAY` (at most a check-in day's candy) and makes
  an unseen species SEEN, never caught. The silhouette carries no name - no
  alt, no tip. A HUD task chip until answered; banners and tips wait while
  it is open.
- **There is no Weekly Bingo** (your call, 2026-10-23: it crowded the
  Events board). It was built 2026-10-14 and taken out whole - `bingo.js`,
  its card, chip, tip and prizes; an old save's `bingo` field is simply not
  read. Ask before adding a weekly card back.
- **Gender is `gender.js`** (2026-10-15), DERIVED from species and size,
  never stored: `size` already rides every save and trade (trading.sql's
  column), so no new field and no server change. `sexAt` places the size in
  `rollSize`'s own spread (its quantile, offset per species) - hashing the
  raw size left a half-female species 24% female, sizes bunching in the
  middle; check.mjs holds every species at its real ratio within one size's
  step. A form reads its base (`of`). **38 species have a female LOOK**,
  only where the female art comes from the ordinary sprite's own set (your
  call: FireRed's 1-386 drew none, and HGSS's beside it was another pose) -
  her picture in the ordinary art and every tier drawn over it, her shiny
  where she has one, never Origin or a strip (`femaleArtFor`; `spriteUrl`
  and `Sprite` take `sex`, tier layers mask to her `art`). `state.females`
  (dex ids) is the Pokedex's record, set by `noteLook` on the catch, on an
  evolution and at boot from the Box, so selling her keeps the mark. In the
  Box she is a row of her own (as an alpha is); in the Dex she is a cell of
  the Forms strip (`"female"`, outside the rosette's count) and `Mark` draws
  her sign. A look, never a strength: nothing in a battle or a roll reads it.
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
  `game/battle.js` and `ui/League.jsx` (and the Arena's `game/arena.js`) may import the League's data**
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
  replaced took 68px of a sideways phone's width from the game (2026-10-02).
  **Held sideways the catch screen IS the screen** (SIDEWAYS, REDESIGNED at
  the end of styles.css, 2026-10-10): no page scroll; the bar is the left
  column's head (a labelled Menu key and money, candy, Pokedex), the D-pad and
  A/B sit in the bottom corners, `--view-w` lives on `.app` so the bar and the
  screen agree; the menu is a full-height DRAWER with your trainer card on
  top; off the map the key is a corner icon in each page header's gutter, and
  the numbers are never drawn over a page. The Bag is a right-hand panel, the
  Rotom panel the whole screen. Audit at 844x390, 740x360 and 667x375. Layers: pages 56, the Rotom sheet 57,
  bar and tab bar 58, banners 60, dialogs 70+ - so a dialog covers the tabs.
  A fight (`body.fighting`, set by League) and a phone encounter (`.app.busy`)
  hide the bar. No `backdrop-filter` where the map shows through.
- **The rail is the Rotom panel**: Dex, Box, Shop, Map and Events (the
  board that was a dialog), its app held in App (`railTab`) so the HUD's
  event cards and "See in Box" open the right one. On a phone it is a sheet
  (`.rail.open`, the pad's ROTOM key) - hidden, never unmounted.
- **The map's HUD is four zones** (`.hud`, a grid over the map; HUD ZONES at
  the end of styles.css, 2026-10-14): WHERE top left (the area card with the
  clock in it, and under it `.hud-tasks` - the quest, check-in, spin, reward),
  WHAT'S ACTING top right (`.hud-status`: events, item rings, the perk, the
  combo ring), THE DOCK bottom left (`.hud-dock`: the party STACKED ABOVE
  the minimap - beside it, a Bag rail opened wide ran over it), the balls
  bottom right. A desktop alert pill is two lines in 40px, tight (an 8px
  gap put its words through the border); `pills.cjs`-style checks measure
  each pill's words against its box. Upright on a phone all of it stays ON the map a size
  down (30px chips, 34px rings: a bottom screen under the map read as outside
  the game, 2026-10-14); held sideways the tasks take the left column under
  Menu, on the Menu key's own offsets. On touch the ALERTS (check-in, quiz,
  a spin, a reward: `.dc-pill`) are icon chips with the dot on the
  corner - as pills, four took three rows of an upright map and ran into the
  sideways D-pad; the quest keeps its pill. A new HUD element joins a zone,
  never a corner of its own. Audit at all nine sizes (desktop, laptop, both tablets, two phones,
  three sideways).
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
  first badge pays one (`battleEnd`'s `pack`) - every reward pack is a
  RANDOM open set (`randomOpen`; the newest by list order paid one set
  forever). **Pull rates are real life,
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
  SPEC too - is packs only (`PACK_ONLY`, derived), and so is a set's own top rarity
  (`canCraft(rarity, cards)`: Base Set's Holo rare, 2026-10-10). The Dust
  tab's Missing list is PER PRINTING: owning a normal card hid its holo and
  reverse holo from it (2026-10-12). The sweep is `sweepOf` (engine and
  Dust tab both): normal commons and uncommons, every printing up to a
  Double rare, or every spare at all (`"all"`, 2026-10-21: a hit's spare had
  no use but dust), the room above earned stamps spent ONCE across printings. The
  card view offers a held printing only its spares and a missing one only its
  craft (2026-10-13); one set (`SetPicker`, grouped by series) is shared by
  the Binder and Dust. **The Binder draws pages through `BinderPages`**
  (Binders.jsx: nine pockets, a two-page spread from 720px), and **My
  Binders** are the save's `binders` (`cleanBinders` in cards.js; the engine's
  `newBinder`, `setBinder`, `deleteBinder`, `addToBinder`): a pocket keeps a
  card you no longer hold and draws it faded, so a sale never loses a layout.
  Anything a binder opens over the page (the picker, its Confirm) is PORTALLED
  to the body - `.tc-main` isolates, and a sheet inside it sat under the
  pinned header (2026-10-13). Dust's other use is a pack
  of an open set (`DUST_PACK` 400, `dustPack`), held above what a pack of
  spares dusts to (check.mjs re-measures every set). The Card Shop takes it AT
  CHECKOUT for the whole cart (`checkout(lines, "dust")`, all or none) at
  `DUST_PACK` a pack: a deal has no dust discount, which would eat that
  margin. A set's deals are `dealsOf` - its BOXES entry, plus the 6-pack
  `BUNDLE` where that entry is a 36-pack box (2026-10-13). Cards carry no catch indicator.
  **Real-life prices are display only** (`prices.js`, dated `PRICED_AT`;
  2026-10-15): raw only (graded prices have no free source), the date in
  one yellow (i) (`PriceInfo`, `data-tap` so a touch opens it), counting up
  (`Money`); the card view and the Binder's value, one lazy chunk named by
  `load.js` alone, never a sale or dust. **The binder is a real binder**
  (docs/cards.md): leather covers (`Cover`, `GRAIN` built in JS), a 3D page
  turn that follows the PAGE, not the control (`bookKey` lands a new set at
  once), My Binders a shelf that opens and closes, drag and drop by window
  pointer events (a touch must HOLD first, so a swipe is never a drag; near
  the edge it scrolls), and covers you colour and patch (`cover` on a binder,
  `patches` bought by `buyPatch` for dust, gym badges won free - derived).
  **A Pokédex binder** (`dex: 1`, 2026-10-16) is a My Binder whose pocket i
  is National Dex #i+1 (`DEX_POCKETS`, held to the dex's species count): an
  empty pocket shows that Pokemon's sprite, number and name, the picker
  offers only its cards (a form files under its base, `of`), pockets never
  drag, Fill from my cards files your rarest printing of each into its EMPTY
  pocket (taken out and restored 2026-10-16, your call both times) among the
  rarities ticked in its dialog (`Confirm`'s pick rows; the device remembers
  the unticked ones, `dexora-dexfill`, only for rarities it was shown), and it
  is RESET, never deleted - one a player, the game's (engine refuses both).
  Diamond is the PRISM HALO (2026-10-16): white ice, a thin dark outline,
  and a rainbow AURA in the creature's own shape turning behind it
  (`.dia-halo`: the rainbow cut to `--art` DILATED - the silhouette stamped
  eight times `--dil` out, never scaled from the box's centre, which leaked
  past the feet - and blurred; a disc and then a ring read as a circle, not
  an aura). **In battle every free layer span rides with the creature**
  (`fx-follow` + `mon-idle`, same clock as `.mon`; 2026-10-16, the aura
  drifted 7px off the bobbing body).
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
  `illustration`). The Packs tab names each rate through it. A rarity with
  its own odds beside the Illustration rare (the ACE SPEC, Paldean Fates'
  `shiny` and `shinyultra`) is an `EXTRA_ROLLS` key a set's row may name.
  **Phase 4**: every printing of a set is its MASTER step (`MILESTONES.length
  + 1`, `MASTER_DUST`); titles are `titleIds` (titles.js) and the SQL's
  `card_titles` the same rule (tradedb holds them equal) - a set's title DRAWS
  as the set's logo (`titleLogo`, `TitleBadges`), a Master's with a gold tag,
  and a Master hides its own Collector (`shownTitles`; your call 2026-10-15,
  the names were sentences on a card); the trainer card's
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
  and `OUTBREAK_LIFT`, your call 2026-10-03). **A region in one rare tier**
  is its own medal (`tier:<tier>:<gen>`, `TIER_MEDALS`, your call
  2026-10-15): every species of the region's medal held in that tier ROW (own
  play; a trade sets none), less a species whose art cannot wear it
  (`tiersFor`). Claimed last through `claimDex` - a random set's box and the
  title "<Region> <Tier> Dex Master" only, no money, Master Ball or charm.
  Its badge is the region's with the tier's mark tagged at its foot, and a
  region shows ONE, its rarest (`shownTitles`; 144 would bury a card). The
  SQL's `card_titles` derives the same ids (re-apply trading.sql).
- **Achievements are DERIVED, never counted** (`achievements.js`, a page
  off You, 2026-10-10): each is a ladder of steps over a number the save
  already holds (`caught`, `steps`, tier rows, `beaten`, research rows -
  which cap once per species, so "kinds traded" cannot be farmed by passing
  one Pokemon back and forth - `cards`, `milestones`, `checkin.best`), so an
  old save opens with what it did. A step is CLAIMED on the page
  (`claimAchievements`, one save and one `changed()`), never paid on the
  moment - an old save would boot into a wall of banners - and `achieved`
  (id -> steps claimed) is the only thing stored. Marked done, never drawn
  (your call). `STEP_PAY` is balls first and small money; the last step of a
  ladder adds a card pack (`feat:<id>`). It is a one-off pool: check.mjs
  holds every step's money under half of the Pokedex's medals and
  milestones, and no step pays a Master Ball. The Pokedex medals show there
  as counts; they still pay on the catch.
- **The trainer card draws the badges won** (`badge_ids`, card_stats in
  trading.sql, League order): the count alone cannot say which, because an
  old save may hold leaders out of order. Named from the id (`kanto-lt-surge`),
  since leagues.js is the League's alone.
- **Cosmetics are designed in docs/cosmetics.md** - a look, never a
  strength: no rule module imports `game/cosmetics.js` or `data/follow.js`
  (asserted). **The walking party** (`state.party`, up to `PARTY_MAX` 3 Box
  uids, `setParty` from the Dex sheet or the strip's +/edit (`PartyPick.jsx`,
  lazy, the trade Picker); `state.buddy` the one walking, one of
  them, `setBuddy`/`cycleBuddy` from the strip on the map or Q) - a switch is
  `stepped()`, never `changed()`, and grows the next out of a flash
  (`SWAP_MS`, which holds the redraw open). **A partner is earned**:
  `partnerRule` (cosmetics.js) lets a species join only once its research is
  STARRED (your call, 2026-10-13; research Lv 5 for a day read as no rule),
  never takes a member away, and lets one walk free until a species is
  starred. **The follower** takes the tile you just left
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
  riding), each effect one lever - encounter `rate` or a `find` - never the
  tier roll. An entry's ability is its species' regular one by uid, an
  alpha's its hidden one. EVERY ONE HAS A PERK: an ability with nothing to do
  here FORAGES by its first type (`forageOf`): berries or balls, and its
  type's STONE (`TYPE_STONE`, 2026-10-19), never one below the level its shop
  sells it (`rollFind`'s level) and never a find worth a Honey (check.mjs). A
  rod's bite is a third lever (`bite`: Suction Cups, Sticky Hold); Cute Charm
  stays out - gender is a look nothing rolls on. There are no type pulls -
  every map is already its types, so one did nothing (2026-10-10).
  Steps together count on the box entry (`walked`) IN PLACE: a heart or a find
  is the one `changed()`, or a big Box rebuilds every step.
- **Road trainers are designed in docs/battles.md** (`road.js`): filed BY
  REGION, as DelugeRPG files them (2026-10-16, asked for) - every class a
  region's games field, one trainer each (`ROSTER`, append-only: a slot is an
  index), every region `GEN_UNLOCK` has opened, new teams daily from a hash of
  day, region and slot; parties from the region's own species (no forms or
  legendaries), staged by `opponent()`; an old save's map-filed id names nobody;
  `battleBegin` judges them by `roadOpen`, `battleEnd` pays once a day into
  `state.road` - never `beaten`, so the League's solved ladder is untouched.
  A road trainer carries `road: true`, which `tuneOf` reads.
- **The daily check-in and the weekly roulette are designed in
  docs/checkin.md** (`checkin.js`): one stamp a day (`dayKey`), a streak kept
  by yesterday, the week's ladder `CHECKIN_REWARDS`, and day 7 banks a spin.
  `checkIn` and `spinRoulette` pay and SAVE before any stamp or reel plays;
  the roulette's Gold Pokemon counts as caught
  (species and Gold row), 2 slots in 15. **The streak pays packs**
  (`streakPacks`, 2026-10-22: days 10/20/30/50/70/100, then 100 every 30
  days), in lots of ten, each lot one open set weighted toward what you lack
  (`lotSets`), earned and saved in `checkIn` before `StreakPacks.jsx` spins;
  the top bar's flame (`streakNow`) shows the streak on every screen.
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
- **The Arena is real-time battles** (2026-10-22, the Arena plan's phase 0)
  and **half of the Battles tab** (2026-10-23, asked for: a fifth tab was one
  too many): `BattleSwitch.jsx` heads both pages, Arena and Classic (the
  League), and `goTab("battles")` opens the one last chosen (`BATTLES_KEY`),
  the Arena first; `goTab("arena")` / `goTab("league")` open that one
  (`#/arena`, `#/league`). App lazy-loads `ui/league/arena/Arena.jsx`, whose
  default export is the page: a game's lobby - team, four mode tiles, the
  Ladder's rungs, floors, one pinned Battle - always dark, its sheets the
  app's own. **A match is built ONCE, at mount** (`Match`'s `useState`
  initializer; reported 2026-10-23, "the battle restarts mid-match"): its
  teams were a memo over the Box, a new array whenever the save moved, so a
  paid prize or a walk notice built a new match under the loop. A rematch
  and an online round remount it (`key`). **The basic attack** (`BASIC_K`, `BASIC_P` jab /
  `BASIC_S` bolt by the higher attack stat, `arenaMove` knows both): held,
  no PP, typeless, every third in a row `BASIC_BOOST`; a move pressed in its
  recovery cuts it; the CPU fills its cooldowns with it. It took a third of
  the damage, so `DAMAGE` went 0.6 -> 0.4 (a 3v3 back to ~76 s); check.mjs
  holds it under 45% of a fight's damage. **The Arena's three are
  `arenaTeam`** (`setArenaTeam`, `ARENA_TEAM` in ladder.js; empty is the
  League team's first three). Keys: LMB held basic, RMB/Q/E/R moves, 1-3
  switch, Space dash (the code's `dodge`), F surge. **Touch is a MOBA's**: a FIXED stick in the
  bottom-left corner that only a touch starting on it steers and that thumb
  keeps (2026-10-23: the left half once floated it under any touch and took
  the party's taps), the
  attack button with the moves on an arc (tap auto-aims at a visible foe,
  drag aims with an arrow and a Cancel), fullscreen and landscape where the
  browser allows (`immerse`), a "turn your phone" card otherwise, the match
  sized to `100dvh` and re-fitted on `visualViewport` resize (URL bars).
  The renderer calls a move by name, turns a rune under its charge, trails
  each type's matter behind a shot and flashes a super-effective hit.
  **Power-ups** (2026-10-23, `PICKUPS` in arena.js): a MIRRORED pair every
  `PICK_EVERY` (point for point, so the floors stay fair - check.mjs), gone
  after `PICK_LIFE`; Potion, Full Heal and Shiny Stone work on touch, the X
  items are HELD one a side (`sd.held`) and used (`use` input, G); the CPU
  from Normal up takes them. **The clutch** is the picture's alone: both
  under a fifth of their HP, within reach, one winding up - slow motion,
  bars and "CLUTCH", once in nine seconds (online never slows its rules).
  **Judgements** (GREAT at 5 hits to LEGENDARY at 25, a rationed COUNTER,
  PERFECT dodges, a PERFECT win untouched) are drawn under the striker's
  combo.
  **Same day, asked for**: a beam TRACKS its aim while it charges
  (`BEAM_TRACK` of the way a tick - a sweep; only a CPU that `lead`s steers
  one, or Easy outran Normal), `BEAM_W` 0.5 and `MELEE_RANGE` 1.75;
  SUDDEN DEATH (`SUDDEN_T`) when the clock runs out level on Pokemon - all
  standing at 1 HP. Surge is called **ULTI** on every screen (the code keeps
  "surge"). The renderer draws each type's own shot and beam (`shotStyle`,
  `beamStyle`) under the move's sprite, a bolt from above for Thunder moves,
  and bodies and cover sorted by depth (a pillar drew over a Pokemon in
  front of it).
  **The big update** (2026-10-23, asked for). Wind-ups are `WIND_K` (0.5
  since the second ask, "still long") of what they were, cooldowns `0.9 +
  p/40` s (a bit longer once PP went), and with the ULTIs `DAMAGE` went 0.4 -> 0.23 to hold a 3v3 at
  ~77 s. **Weather**, one a match from the seed, the SAME odds on every
  floor (a floor leaning to its own would hand a type its home): rain
  (Water 1.5x, Fire 0.5x, Fire types slower, all soaked), sun (the reverse),
  sand and snow (chip all but their types). **Type combos**: Water on a burn
  is STEAM (`s.clouds`, hides whoever stands in it), Water soaks (`wet`), and
  Electric on a soaked Pokemon is a SHOCK (1.5x). **Double Team's copies
  stand** either side of their user and move with it (`clonesOf`); a shot,
  blow, beam or blast that reaches one first pops it, the CPU may chase one,
  the foe's are drawn as solid as the real one. **ULTIs** (`ultimate`, in
  `surge`): each Pokemon's by its first type - a STORM, NOVA, CANNON or
  BARRAGE - and the famous ones by dex id (`ULT_NAMES`: Pikachu's Thunder,
  Charizard's Blast Burn...); every strike (`s.strikes`) shows on the ground
  `ULT_WARN` first and stops following its target `ULT_LOCK` before it lands,
  so a roll beats it; held to ~14% of the damage. **Moves that leave the
  court** (`VANISH`: Fly, Bounce, Dig, Dive, Phantom and Shadow Force) take
  their user off it (`away`: untouchable, unseen) and land it ON the foe as
  a strike; **moves that fill it** (`WIDE`: Heat Wave, Blizzard, Petal
  Blizzard) reach the foe anywhere at `WIDE_K` unless cover stands between.
  **The match's events** (`s.plan`, from the seed; `events: false` for none):
  a legendary flies over and drops a Full Restore in the dead centre, and
  some matches the lights go out (`s.dark`: the CPU loses a foe past
  `DARK_SEE`, the picture shows only what glows and what stands near you).
  **The picture**: an ULTI's cut-in names it and its first landing is a
  MANGA PANEL (negative, then black ink - its type's pattern, its
  silhouette, its name - then the colour back; a famous one's printed on its
  colour), drawn art `ult-<id>`/`ult-<pattern>` taking the pattern's place
  where it exists (build_fx builds only what is there); a full-screen flash
  at most every `FLASH_GAP` (seven Thunder strikes were a strobe); the
  camera tilts (`tilt`) and shakes harder. Only beams of matter (fire,
  water, ice, electric) mark the floor - a Psybeam left a dark scorch.
  **A move's own art** (`art/arena/fx/moves/<slug>.png`, `MOVES` in
  build_fx with its frames counted by eye, `c` in fx.js: drawn in its own
  colours, 256 of them): a projectile loops along its path, a stream lies
  down a beam or trails a shot, a blow plays at its reach, a dash trails its
  user, a blast plays round it, Psychic and Rock Slide where they land
  (`LANDS`), a hazard on the ground. A match loads only the moves its two
  teams know.
  **Roles** (2026-10-23, asked for: "all long ranged and slow to attack"):
  `roleOf` by the higher attack stat, as the basic attack is - a BRAWLER
  runs, jabs and hits up close harder and takes less from shots, a BLASTER's
  shots fly faster and farther and its beams charge sooner. With no perks
  brawler teams won 18 of 100 Hard matches against blasters (range simply
  won); the `BRAWL_*`/`BLAST_*` numbers are 48, and check.mjs holds 40 of
  them inside 30-70%. **The Arena's Move Tutor** is the League's own
  (`engine.tutor`, `TUTOR_PRICE`: the Arena's cash sink) shown the Arena's
  way - each move by its reach, those suiting the role first; online still
  plays the Fair format.
  **Status you can see** (same day, asked for): **confusion** (`CONFUSES`,
  the games' own chances, which the League's data drops) walks a Pokemon
  backwards and slower for `CONFUSE_T`; **Smokescreen** leaves a cloud that
  hides its user as steam does; a **thrown rock** (`THROWN`) is a shot; and
  Double Team's copies WANDER round their user (`CLONE_WANDER`, never nearer
  than `CLONE_NEAR`) - check.mjs holds all four. The renderer lifts and
  throws a Psychic's target, raises a boulder for Rock Throw, charges Hyper
  and Solar Beam as an orb, writes Fire Blast's 大, and draws flinch stars
  and the confusion swirl - each from its drawn sheet (`moves/<slug>`,
  `-charge`, `stun`, `confused`, `smoke`, `psychic-lift`, `boulder`) once
  one exists. **ULTI impact frames are a shop** (`IMPACTS` in cosmetics.js,
  the lobby's ULTI Shop - hidden while its shelf is empty: the first paid
  sequences were WITHDRAWN (2026-10-23, your call; `WITHDRAWN`, refunded
  once at load and dropped from `impacts`, never sold again) for the centred
  single panels everyone sees; preview, buy, equip; the save's `impacts` and
  `impactsOff`, kept even when unknown): a look, never a strength, played
  only for YOUR Pokemon's ULTI. A price of 0 (Pikachu) is everyone's; an
  id is the art's (`ult-<dex>`, stills `ult-<dex>-<n>`) and never renamed -
  another style of the same Pokemon is a new id.
  **HP over every head** (and over Double Team's
  copies, or the bar gave the trick away), bigger desktop plates, a plate
  pulsing red under a quarter. **The result comes up from the bottom** and
  VICTORY sits at the top of the canvas (`stampAt`'s `at`), the winner
  framed above the card and the HUD faded (`.ar-hud.over`) - centred, the
  card covered both. **Classic is a journey** (League.jsx's `JourneyRoad`,
  `NextBattle`): a region's leaders, Elite Four and Champion as a road
  (gold as far as you have walked, the next stop flagged, a stop jumps to
  its card) and a VS card for the next battle through the cards' own
  `onBattle`. `game/arena.js` is its rulebook: a
  FIXED-STEP simulation (`TPS` 60) that `tick(s, inputs)` moves in place from
  the match's own seed (`s.rs`) and the inputs alone, so a seed and its inputs
  replay one match exactly. Nothing in it may differ between browsers: no
  sin/cos/atan2/exp/pow/hypot (their last digits are the engine's), no clock,
  no `Math.random`, no DOM - an aim arrives as a vector (check.mjs's `arena
  ok`). A hit is `battle.js`'s own formula (`rawDamage`) times `DAMAGE`
  (measured: 33 s a Pokemon, Hard against Hard), accuracy is aim (no random
  misses), and a match never writes the save. Like battle.js it carries the
  League's data, so only `ui/league/` may import it (asserted). The picture
  (`ui/league/arena/render.js`) draws each move in its OWN Emerald sprites
  (`arenaArt`, read off the move's League timeline by moveAnim.js - still the
  only loader of anims.js), with a ground telegraph during every wind-up; the
  match is PORTALLED to the body (`.tc-main` isolates) and owns the screen
  through `body.fighting`. Its loop stops while the page is hidden.
  **Phase 1**: every move is one of eight SHAPES (`shapeOf`: shot, beam,
  melee, dash, pulse, field, self, multi - from its data plus short name
  lists; check.mjs holds every playable move to one, only the ally heals
  left out); statuses tick in real time (`afflict`, `stepStatus`: burn,
  poison, toxic, paralysis, sleep, freeze, with the League's immunities) and
  stat stages last 10 s capped at +/-2; the court sits `INSET` inside each
  floor's own wall. A CPU win pays once a level a day (`engine.arenaWin`,
  `arenaPay` in road.js, priced off ROAD_YEN; the save's `arena`), its best
  day held under 5% of the road's (check.mjs).
  **Phase 2**: each floor is its own GROUND (`GROUND` in arena.js, its
  rectangles measured on the art): Mt. Moon's falling rock, the Boardwalk's
  water (only Water and Flying types move freely), the Caldera's hot edge and
  eroding basalt, the Grove's tall grass (hides you from range), the Rink's
  ice; four blocks of cover in the floor's material (weak and resisted types;
  shots stop, beams end, blows and pulses chip, bodies are pushed out); two
  mirrored zones that open every 30 s and pay one team per cycle, held alone
  for a second. No floor favours a side or hands a type its home (check.mjs).
  **The Arena Ladder is `game/ladder.js`** - ten masters, ids append-only,
  teams typed by dex id WITH their names; the engine judges the order and
  pays each first win once (`arenaMaster`, the save's `ladder`), the Champion
  a card pack; the Ladder's total held under a quarter of a road day.
  **The fight's feel** (2026-10-22, asked for): the opening is `INTRO` ticks
  of the sim itself (nobody moves, off the match clock, 0 in every test) so
  both ends of an online match count the same ones; the VS card, the throws
  and the count are drawn from it. **Surge is the twist**: a meter a side
  (`SURGE_MAX`) filled by hits dealt and taken, a PERFECT DODGE (rolling
  through an attack) and a zone; spent, it throws a close foe off, breaks a
  stagger and gives `SURGE_T` of harder blows and double-speed cooldowns,
  ended by a switch. It is a comeback for whoever is being hit, so Easy never
  spends it (Normal beat the old Easy 64% with it; this Easy, 78%). The
  renderer runs every effect on real time scaled by its own hit-stop and slow
  motion (`rate`), which the offline page also steps the sim by: types throw
  their own matter and leave fading floor marks, cover wobbles and crumbles,
  each floor has its own air, the last KO is an impact frame, slow motion,
  K.O. and the winner - and the result card waits for it (`done`). A particle
  gets every field it is drawn with from `part`'s defaults (one without `vx`
  went NaN and threw in `createRadialGradient` every frame).
  **Phase 3, online between friends**: `db/arena.sql` (after trading.sql)
  holds a challenge and its secret room, friends only, one open a trainer,
  two minutes, the table readable by nobody; `net.js` links the two browsers
  by WebRTC (STUN only, so "blocked" is said, never hung on), introduced over
  a Realtime broadcast that `arenaRoom` in cloud.js opens and closes; the
  match is `lockstep` in arena.js (inputs `DELAY` ticks ahead, `cleanInput`
  at both ends, a state hash every `HASH_EVERY`, a round number per rematch)
  in the Fair format (`fairTeam`: species at `FAIR_LEVEL`, IVs 31), and a
  build whose `rulesPrint` differs is refused at the handshake. Online steps
  with the wall clock, never the hit-stop (the other end would wait), has no
  pause, pays nothing and rates nothing. A challenge is taken back by
  LEAVING, never in an effect's cleanup: StrictMode runs that once at mount
  and cancelled every challenge as it was made.
  **Its bodies are PMD sprites** (2026-10-22, asked for: the ARENA ONLY - no
  portraits, nothing on the map or anywhere else, asserted by check.mjs's
  `pmd ok`): `tools/build_pmd.py` bakes nine animations a Pokemon (Walk,
  Idle, Attack, Shoot, Charge, Hurt, Sleep, Hop, Double) into ONE atlas and a
  sidecar - every frame cut to its own pixels, repeats stored once, a
  left-facing row that is its right one mirrored drawn flipped (uncut,
  Rayquaza decoded to 30 MB; check.mjs holds every atlas under 8 MB) - a
  shiny as a palette swap, or its own `-s` atlas where one colour is two; a
  form matched by NAME to PMD's subgroup (`ALIAS` where PMD names it
  otherwise - Paldean Tauros, Crowned Zacian; 13 drawn forms fought in
  follower art until 2026-10-23). PMD draws no Gigantamax and only portraits
  of most Megas, so **only a Pokemon with its own PMD body fights in the
  Arena** (`arenaReady` in arena.js: forms 2026-10-23, every species
  2026-10-24, asked for - "consistent battle animations"): the team picker,
  the CPU's pool, the Fair format, evolving and Mega Evolving all ask it. render.js loads one when a match
  needs it (kept across matches, every url stamped `PMD_REV`), picks the
  animation from the fighter (a blow's frames up to PMD's HitFrame run across
  the wind-up, so it lands as the rules hit), draws it at the follower art's
  pixel scale over the shadow, and tints one piece at a time through a
  scratch canvas, never a whole-atlas copy per colour. A species PMD never
  drew, or an atlas not yet arrived, fights in its follower art. CC BY-NC
  4.0: `credits.json` names every sheet's artists, shown from the Arena's
  Help. The tint cache keys an atlas by a SESSION-wide id (a renderer's own
  counter restarted each match and drew a new foe in the last one's
  silhouette), a glow is a pre-drawn disc stamped (a gradient per glow per
  frame was the hot loop), and the stamp `PMD_REV` is re-hashed by check.mjs;
  a sample bake writes to .assets-src, never the shipped folder.
  **The Arena is announced like an event** (`ArenaIntro.jsx`, variant C,
  2026-10-22): a full-screen takeover once a device on the map - after the
  day's check-in, never over an encounter, never before the Starter Path's
  second goal, never to a save that has fought there - then the map's
  `ar-pill` chip until the Arena is opened (`ARENA_NEWS_KEY`: null,
  "seen", "done"; League.jsx writes "done"). Fight now opens the League on
  its Arena tab (`LEAGUE_TAB_KEY`). One auto-announcement a session: the
  event's dialog waits when this one has played. Its two fighters are PMD
  art baked to `public/arena/intro/` - the Arena's own, announcing it.
  **No stalemate** (2026-10-22): a third of Hard-vs-Hard matches ran out the
  clock with both Pokemon out of PP and full benches; the last `FINAL_T`
  hits harder and fills Surge twice as fast. **There is no PP** (2026-10-23,
  asked for): a move waits on its cooldown alone, so Struggle-when-spent and
  the CPU benching a spent Pokemon went with it (Struggle stays only for a
  status-only kit), and Indigo's zone readies your slowest move. **The dodge
  is a DASH** (same day, asked for): `DODGE_DIST` 3.2 tiles in 0.2 s,
  untouchable for `DODGE_INV`, drawn as a lean, afterimages and streaks -
  never a hop; through an attack it is still a PERFECT.
  **Arena HP is ten times the stat** (`HP_K`, `DAMAGE` = `DAMAGE_K` x it;
  reported 2026-10-23: a basic jab read 1-3 and `floor` ate small hits):
  the same fight, numbers that read as hits. **The basic attack is its
  user's first type** (asked for: type matchups meant nothing to it), STAB
  and all, and a bolt reaches `BASIC_RANGE` 6.5 tiles (4.5 read as short).
  A 3v3 is ~71 s (Hard v Hard), basics a third of the damage, and the
  longer bolt is why `BRAWL_GUARD` is 0.55 (brawler teams fell to 9 of 40).
  **A move waits on its WORTH, not its power** (`valueOf`, 2026-10-24,
  reported: "healing moves are OP - CDs should depend on the skill"): power
  x hits x crits, plus its drain, plus a raise of its own attacking stat at
  half its power (other stats `STAGE_UP`), less `STAGE_DOWN` a stage it
  lowers; recoil buys nothing back. A damaging move raises its user to +1 at
  most (Fiery Dance stood at +2); +2 is a setup move's, which waits
  `SELF_CD` past `BUFF_T`, and a heal `HEAL_CD`. check.mjs throws the
  reported moves (drain, self-boost, always-crit, multi-hit, recoil) for
  20 s and holds each within `WORTH_OVER` of a plain 120 of its shape - on
  power alone Leech Life and Power-Up Punch were 20-39% over. Every move
  button counts its seconds down and the Tutor and team card print each
  move's wait (`waitOf`). **Wall-splat** (2026-10-24, asked for): a real
  blow's knockback (`SPLAT_PUSH`+, never a jab's or a shot's) stopped by the
  wall or cover costs `SPLAT_HURT` of HP and stuns. **Perfect block**: a hit
  in a shield's first `PARRY_T` hurts and staggers its attacker instead.
  Beams are `BEAM_LEN` 13 x `BEAM_W` 0.85, and the picture and the wind-up's
  marker draw from those two numbers. The default ULTI panel draws the
  Pokemon in its own colours inside an ink rim (the flat silhouette read as
  nobody). Move art falls back to a FAMILY sheet (render.js) - `slam`,
  `claw`, and the shared `heal`, `power-up`, `stat-drop` - until drawn
  alone; art/arena/fx/MOVE_PROMPTS.md holds only what is still to draw.
  **ULTIs are fourteen ARCHETYPES** (2026-10-24, asked for: "bigger impacts,
  really worth the use - some defensive, buff, attack"; the Arena Move
  Codex artifact is the design): Cataclysm, Storm, Cannon, Nova, Barrage,
  Onslaught, Phantom, Sacrifice, Fortress, Barrier, Sanctuary, Awakening,
  Domain, Snare. **Every Pokemon has ONE** (`ultiPick`, remembered per
  species): a named one (`ULT_NAMES`, now [name, archetype]), else its
  signature move (90+ power, three or fewer learn it), else its own support
  move (a wall's, or one three or fewer learn - `learnable(id, 100, true)`
  reads the League's unused moves for this alone), else its strongest
  same-type attack shaped into an archetype. A ULTI-tier move that is its
  ULTI is never also in its kit (`kitOf`: Pikachu's Thunder); an everyday
  attack made a ULTI stays (Machamp's Dynamic Punch). An attack ULTI's damage is a SHARE of the target's HP
  (`ultDamage`: resisted 0.6x, super effective 1.4x, its attack over the
  foe's defence held to 0.8-1.3x) - ~35% if it all lands, the same from a
  Pichu as from a Mewtwo; every archetype telegraphs and has an answer.
  check.mjs holds every archetype to somebody and to its effect.
  **Moves that touch the foe** (same day, asked for): a GRAB (Vine Whip,
  Power Whip, Circle Throw, Dragon Tail, Vital Throw, Submission) holds the
  foe, then throws it `THROW_DIST` (a wall-splat if one is there); a FLAME
  move's shot leaves burning patches (`s.fires`); a strong Psychic move
  hurls rocks off the floor (the picture's). Teleport, Roar, Whirlwind and
  Leech Seed are League-unused (`no`) and wait on an Arena-only move list.
  A move that does nothing here is never in a kit (accuracy-only drops,
  the placeholder power 1 of Ruination and Comeuppance).
  **The team picker is a fighting game's character select**
  (`FighterSelect.jsx`, asked for): three slots on top, a spotlight (sprite,
  role, ULTI, stats, moves), a roster of one portrait a species (its best
  copy; the others a switch in the spotlight), type filters, arrow keys,
  Enter, Backspace, Escape.
  **Evolving in a match** (asked for): a Pokemon with a next stage fills its
  bar (`xp`) with the share of a foe's HP it deals, a knockout a whole bar
  (`EVO_XP`), and evolves where it stands - `EVOLVE_T` untouchable and still,
  then the next stage's stats scaled from its own (IVs and perks carry), its
  types, its HP share plus `EVO_HEAL`; twice in a match for a three-stage
  line, a branch from the seed. **Mega Evolution** is once a match a side
  (`megaUsed`, the `mega` input: T, D-pad down, the HUD's rainbow button),
  for a line's Mega in `megas` - the page fills it from the Pokedex (caught
  or made); the CPU from Hard and the Fair format get every one. Both only
  into an `arenaReady` form. The picture is the games': white, flickering
  between the two bodies faster and faster in a pillar of light (a Mega in
  rainbow, its symbol's strands turning), then a white-out, a shockwave and
  the new name stamped (`moves/evolve`, `moves/mega-evolve`,
  `moves/mega-symbol` take over once drawn).
  **Every floor has its own event** (`FLOOR_EVENT`, asked for: "maps should
  have their unique mechanics or events"), once a match at a time read off
  the seed (`plan.floor`, no draw): Indigo's crowd roars (+35 ULTI each),
  a Moon Stone falls at Mt. Moon's centre (evolves whoever grabs it, else a
  full ULTI), the Boardwalk's tide rises (`waterOf`), the Caldera erupts
  (mirrored lava bombs through `drops`), a Tauros herd stampedes a shown
  lane in the Grove (`lanes`, `herdAt`), and a whiteout blinds the Rink
  (the lights-out machinery, `s.white`). **The Poke Ball** is one of the
  mirrored pickups (asked for, Smash Bros.' item): it releases a `HELPERS`
  Pokemon for its trainer from the seed - Electrode explodes where it
  stands, Snorlax falls on the foe (it stops following `HELPER_LOCK` before,
  so a dash beats it), Chansey heals a quarter, Jigglypuff sings a near foe
  asleep - or one FOLLOWS its trainer's Pokemon for 8 s (2026-10-24, asked
  for): Audino heals a little at a time, Plusle's Helping Hand (`HELP_HIT`),
  Mr. Mime's Light Screen (`SCREEN_K`, both in the one damage line), and
  Magnemite Thunder-Shocking the foe. **A benched Pokemon rests**
  (`stepBench`): `BENCH_REGEN` of its HP a second up to `BENCH_CAP` (75%),
  never a fainted one. The basic attack is 18 power (15 until 2026-10-24,
  asked for); basics are ~42% of a fight's damage against check.mjs's 45%. A title too wide for the screen is
  shrunk to it (`stampAt`). The result grades the win (S-D: the win, HP kept, best combo,
  perfect dashes, a quick KO) from `stats` the sim keeps a side, and the
  device remembers the best grade and the win streak (`dexora-arena-record`,
  never the save). A fallen body is never drawn: the last KO ends the match in
  its own tick, still "active". Online: messages before a match listens are
  kept (each tick's input is sent once; a dropped one froze it), the hello
  compares both Fair teams' hashes, a closed page says "bye" on `pagehide`,
  and `connect` says "blocked" only when WebRTC does.
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
  blocked; their count lights You, not Trade); the Trainers tab is search,
  your friends and **Trainers to meet** (2026-10-15, asked for:
  `suggest_trainers`, eight shuffled strangers - recently played first,
  never a friend or request, never across a block, never a flagged account;
  a page answers nothing, never `closed`, until the server has it).
  **Invites are docs/trading.md's Referrals** (2026-10-15): `?ref=<name>`
  links, `db/referrals.sql` (after trading.sql) decides EVERYTHING - a new
  account, once, to an older one, progress counted from the save it had when
  linked, over separate server days, no flag, the first `cap` paid - and
  `referral_rule()` equals `REF_RULE`; the engine's `claimReferrals` pays
  each id once (`referralsPaid`). A followed link's answer is never dropped
  for an effect re-run (the account object changes right after sign-in).
  The way in is You › Invite friends, Trading's Your friends banner, and an
  Invite card on the Events board (2026-10-16).
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
- **The world is designed in docs/world.md** (2026-10-16) - change a decision
  there first. **A road is doors on the edge**: `ROADS` in build_map.py opens
  the stretch two maps share (the games' own `connections`) and `open_roads`
  pairs each cell as a door, landing on the first cell inside the other map;
  a door on the outer ring is a road (`exitsOf`). The area card's signpost is
  `exitNear`; the Map tab's world map draws from the doors themselves, its
  places in Travel.jsx's `AT`. tools/play rides every door and road cell both
  ways. Levels are never reordered to fit geography. A room with a floor
  above it is `UPSTAIRS` in build_map (empty since the Weather Institute
  became its own map): attach_inside shelves both and pairs the stairs.
  **A building's door is on the map it really stands on** (2026-10-17,
  reported: the Mansion was a plain house on Monsoon Trail and the Power
  Plant a cave hatch on Seaside Road): the Mansion's on Cinnabar Island,
  the Power Plant's on Route 10 (Lavender's road north; its north half, the
  river to the Plant, is the ferry's), both FireRed towns; the Weather
  Institute is a map of its own (`em_rooms` with `pad` 1 - a front door on
  a room's bottom row is otherwise walled up by the ring). Cinderpeak is four floors (Mt Chimney,
  Route 112, Jagged Pass, the Fiery Path), its spawn held to Route 112.
  **A TOWN is an area with no biome** (`town: true` in build_map's spec and
  mapdata): streets and doors, never an encounter, a rod or a rift (its rift
  ring says so, `TOWN`), always open, not a Travel stop; check.mjs holds every
  other area to a biome. A shut road banners ONCE (`shutTold`), not per cell. A
  road door carries a sixth element, 1 (`exitsOf` reads it - a map with a
  shelf has its real edge inside the grid). New Emerald towns and routes go
  through `em_route(layout, secondary, meta, sec, sides, door)`: nothing a
  road on `sides` can reach is culled, and the spawn is the most-reaching
  cell of `sides[0]`. **check.mjs's world check**: every map joined by doors
  and roads is walkable to and from Mauville City (`fillFrom`, the per-map
  fill, run from every arrival).
- **Doors join maps** (`DOOR_PAIRS` in build_map.py): each builder reports its
  door and arrival tile, `mapdata` carries `doors: [x, y, area, ax, ay]`, and
  the engine takes one late in `onArrive` (the step counts, no encounter). A
  door to a map your level has not opened stays shut and says so. A map with a
  second door names it by where it leads (`doors`: Meteor Falls' Route 115
  mouth, kept open by `em_rooms`' `exits`). A road is never laid over open
  sea: Route 122 (18 cells of land) is not a map.
- **Kanto is islands by THE FERRY** (docs/world.md, phase 5): a map's `ferry`
  cells are walked into like a door and offer every stop (`boarding`,
  VOLATILE; App's `Ferry.jsx`); `sail(id)` lands on that stop's `dock`
  facing in, refused while the level has not opened it, and `leaveFerry`
  steps back. Stops are read off mapdata (`FERRY_STOPS`): a town's harbor
  (`em_route`'s `ferry` warp - Lilycove, Four Island) or an edge
  (`edge_ferry`: Lavender's road out, Route 123's path down from Mt. Pyre -
  its only way into its east half; opened after the per-map check as a road
  is), else the map's own way in
  (`FERRY_SPAWN`, `spawn_ferry`: a cave mouth, or the foot of Tall Grass's
  path - a ferry cell in the open boards you for stepping on it). check.mjs's
  world check walks through it; tools/play boards and sails every stop.
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
  always on screen. A sideways phone is 360-430px tall; audit there. **The
  Dex entry's** is a full-height left PANEL (the type's tint behind all of
  it, the portrait as big as the height allows), the X in the card's own
  corner, tabs and a scrolling body right with forms four across (blurbs in
  the tooltip), and one compact action row - no CLOSE beside the X
  (2026-10-15, THE DEX ENTRY, SIDEWAYS at the end of styles.css).
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
