# Dexora

A personal, non-commercial browser game: catch, collect and evolve 493 Pokémon
across eight hand-made areas — Kanto, Johto, Hoenn and Sinnoh, the whole
National Dex to Arceus. Inspired by DelugeRPG's loop — walk, meet, throw, bank
the duplicates, evolve.

**The dex is contiguous again, and that is a loss.** The Hoenn-shaped hole used
to be the test that stopped a dex id being used as an array index — the one
thing that made `SPECIES[id - 1]` fail loudly. Nothing enforces that by accident
now, so `speciesById(id)` and `dexIndex(id)` have to be used on purpose. See
*A DEX ID IS NOT AN ARRAY INDEX* below; it is the same rule with its safety net
removed.

Evolution is paid for in **Rare Candy**, one candy per level, on a single
Pokémon named by `uid`. If you find a doc anywhere describing a *feed* that
spends a pile of duplicates, it is describing a system that was deleted — see
"EVOLUTION IS CANDY AND A LEVEL" below.

**Standing constraint: this stays personal and non-commercial.** No ads, no
payments, no store listing, no distribution. It uses Nintendo's characters and
Game Freak's art. Community tilesets marked ☆ in the README require crediting
the artist before anything ships.

`README.md` is the design document — economy, trainer stats, evolution pricing,
UI rationale, per-screen decisions. Read it before changing behaviour. This file
is how to work in the codebase: the invariants, the traps, and the method.

**`README.md` also carries a "Deferred on purpose" section**, and it is the first
place to look before designing anything that sounds like it has been thought
about before — band budgets for rarity dilution, pity for the rare tiers, the
hybrid data model, and a watch-list of things decided one way that may want
revisiting. Each carries the TRIGGER that should bring it back. Adding something
there beats opening a ticket, because a ticket loses the reason.

## Commands

```
npm run dev        vite dev server           npm run check   check.mjs (30) + play.mjs
npm run build      vite build                npm run art     python tools/build_assets.py
npm run preview    serve dist/               npm run map     python tools/build_map.py
npm run play       drive the engine in Node
                                             npm run layout  composition metrics
                                             npm run shape   structural metrics
                                             npm run assets  PokéAPI species/items/evolutions
                                             npm run tilesets fetch pret tilesets
```

`npm run check` after any logic change; `npx vite build` before calling it done.

## Architecture

**The game loop lives outside React.** `createEngine(canvas, onChange)` in
[src/game/engine.js](src/game/engine.js) owns mutable state, runs its own
`requestAnimationFrame`, and draws to the canvas. React re-renders only on
discrete events (`useReducer` force via `onChange`). Do not move the loop into
React state — 60fps through a reducer is what this design avoids.

**Because state is mutated in place, `changed()` bumps `state.rev`.** Memoised
panels key off it. Without it a `state.box.push()` keeps the same array
reference and `useMemo([box, ...])` never recomputes — the BOX tab silently
stopped updating after a catch, while selling worked because `sell()` replaces
the array. Any new memo over engine state must include `rev`.

**Generated files. Never hand-edit:**

| File | Made by | From |
|---|---|---|
| `src/game/mapdata.js` | `npm run map` | hand-drawn + procedural area functions |
| `public/tilesets/route.{png,json}` | `npm run art` | pret/pokefirered tilesets |
| `src/data/species.js`, `evolutions.js` | `npm run assets` | PokéAPI |
| `.assets-src/` | fetch-on-demand cache | pret raw + PokéAPI (gitignored) |

Change the generator, re-run it, commit the output.

## Method: read it out of the real game data

Every tile rule here was decoded from a real FireRed map, not chosen by eye.
When something looks wrong, **measure — do not reason about it**:

1. `python tools/study_tiles.py` renders real maps and labelled tile-usage
   sheets into `.study/` (not part of the build).
2. Decode the map yourself: `.assets-src/layouts.json` gives every layout's
   size and `blockdata_filepath`; `map.bin` is `<u2` per tile, bits 0-9 the
   metatile id, 10-11 collision, 12-15 elevation.
3. Print the 2D id grid for the feature you care about, then reproduce it.
4. Turn the finding into an assertion, and **verify the assertion by
   reintroducing the bug**.

This found: Viridian Forest's canopy grammar, Route 1's rectangles-and-right-
angles vocabulary, the wooden pier autotile, and the water shore. It also
corrected two confident wrong readings that had already shipped.

Useful maps: `ViridianForest` (canopy), `Route1` (route vocabulary),
`SafariZone_Center` (the one pond with an island — uses every water piece),
`Route12`/`Route24` (bridges), `CeruleanCity`/`Route25` (decks).

**A ripped compilation sheet is not a source.** `.assets-src/reference/` holds
two Spriters-Resource sheets of Emerald's tilesets. They are **not** in
`public/`: Vite copies everything under public into the build, and these two
rode along in every dist for nothing. They are flat PNGs: no metatile
boundaries, no palettes, no collision, and nothing saying which tileset a block
came from — so naming a tile off one is exactly the eyeballing this file exists
to prevent. `python tools/identify_tiles.py <sheet> <General|Building>` matches
every cell against pokeemerald's own rendered metatiles and writes
`.study/identify/<sheet>.{tsv,png}`: a per-cell table of *tileset + metatile id*,
and the sheet with each block outlined and named. **98% of the exterior sheet's
real art resolves across 15 tilesets; 99% of the interior's across 53.** Use it
to find a thing, then pull that tileset properly through `load_emerald()` and
derive its placement from a real map by masking.

`--game=firered` reads pokefirered instead (640 tiles and 7 palettes per
primary, not Emerald's 512 and 6). The FireRed outdoors sheet is the most useful
of the three, because it is **8 metatiles per row - the tileset editor's own
grid**, so a match reads straight off as a local index. Its blocks, by sheet
row: `general` 0-76, `pallet_town` 77-88, `viridian_city` 89-100, `pewter_city`
101-109, `cerulean_city` 110-127, `lavender_town` 128-155 (the bridge),
`vermilion_city` 156-176, `celadon_city` 177-206, `fuchsia_city` 207-230,
`cinnabar_island` 231-238, `indigo_plateau` 239-260, `saffron_city` 261-285,
`cave` 286-308, `viridian_forest` 347-353, `rock_tunnel` 354-372,
`digletts_cave` 373-392, `seafoam_islands` 393-423, `cerulean_cave` 424-440,
`mt_ember` 441-469, `berry_forest` 470-475, `navel_rock` 476-504,
`island_harbor` 589-598. 80% of its real art resolves; the gaps are animation
frames and door tiles.

Name the primary the sheet is drawn against; widen to `all` only if it mixes
them, as the interior sheet does (Building, General and SecretBase all appear in
it). Widening costs attribution — the more tilesets indexed, the more ways a
shared tile can be explained, and the exterior sheet starts crediting interior
tilesets for its grass.

Two traps that tool hit, both worth knowing:
- **The rip and the decomp differ by 1 on every channel.** GBA colour is 5 bits,
  and expanding it as `v << 3` or `v << 3 | v >> 2` gives two identical-looking
  pictures that hash differently. Compare at 5 bits (`>> 3`).
- **A metatile below the primary split belongs to the primary**, which every
  secondary shares, so it is no evidence of any one of them. Crediting the first
  tileset that happened to contain it put 804 of 805 matches in the wrong place.
- **Not every secondary is a directory.** The six secret bases are variants of
  one metatile set: `secondary/secret_base/metatiles.bin` is shared and each
  variant is a subdirectory with its own tiles and palettes. All six 404'd, and
  they turned out to be 1680 of the interior sheet's 1909 unmatched cells - the
  block it repeats six times in six palettes, which the ripper had annotated
  "these look like there repeating but they're actually not". Resolving them
  took the interior from 83% to 99%.

## Four times the map: what scaling one actually breaks

Every area is four times the area it was - 10,068 tiles to 40,740, which is
4.05x - and almost nothing about that was a matter of changing W and H. What it
was, over and over, was **a rule that held for one of a thing and not for four**.
Worth reading before growing anything else here.

**PLACE NOTHING ON GENERATED GROUND.** Three separate faults, all the same one:
staircases hard-coded onto composed cave floor came down into rock; ledges
placed by coordinate were cut to two tiles by a path column, a tree wall, a pond
corner and a tree `fill_the_empty` had stood on the approach - four different
obstacles on one map; and spawns typed in by hand landed inside a trunk.
`stair_cols`, `ledge_in` and the spawn searches all answer the same way the
spring and the craters already did. **If the ground under a thing is derived,
the thing has to be searched for.**

**AND LAY IT LAST.** `ledge_in` runs after every tree is standing, because
`fill_the_empty` puts trees where the map is emptiest and "emptiest" is exactly
where a ledge was just given its approach.

**ORDER IS A DESIGN DECISION, NOT A TIDINESS ONE.** Eight tree masses were added
to the meadow and `open` went UP, because they were painted before the fields
and the fields cut them to pieces. A mass beats grass and loses to the path - a
wood with a route through it - and that is the order the three are painted in.

**`turns` AND `tight` PULL APART, AND THE CLUMP SIZE IS THE LEVER.** A 2x3 clump
is six tiles of adjacency for eight corners; a 2x5 is ten for the same eight. The
meadow wanted mass (turns 0.25 -> 0.14) and got `tight` back at the same count by
going taller. Pond & Shore wanted the opposite - it came out at turns 0.08, BELOW
the band, because a lake is already one enormous straight-edged mass - and took
eighty short clumps instead of thirty-eight tall ones.

**A COMB IS ONE CORRIDOR.** Deep Woods is a comb of canopy teeth, and seven cross
walls - each a correct odd run - cut off 2,746 of 3,061 tiles between them. A wall
across a lane is not a wall in a maze, it is the end of the maze. What breaks up
long runs there is clearings and ponds: holes in the floor cannot disconnect
anything.

**A CONNECTIVITY TEST THAT ASKS A BOOLEAN CANNOT COUNT.** `punch_ladders` kept a
ladder only if the map went from broken to whole, which is right for two levels
and wrong for three - no single ladder can finish the job while another band is
solid, so every one looked useless and was reverted. `islands()` counts, and a
ladder earns its place by lowering that count.

**`join_islands` CARVES THROUGH WHATEVER IS STAMPED**, so `keep` is not optional
once there is more than one set piece: a cliff became floor and the plateau above
it dropped onto open ground. And **anything it carves on a transcribed map stops
being a copy** - a tile turned from wall into floor is not the tile Game Freak
put there, and left with its own id it draws a wall you can walk through.

**A COPY CANNOT BE STRETCHED.** Frost Hollow IS Seafoam Islands B3F. It grew the
only way a copy honestly can: by copying more of Seafoam - four floors, in a
square, joined by passages that tunnel to the nearest ice because every Seafoam
floor is drawn with a solid border and nothing is ever adjacent to a seam.

**AND A GENERATOR CAP IS A MAP SIZE IN DISGUISE.** `forestId` walked down at most
64 tiles to find where its mass ended, which was twice the tallest canopy that
had ever existed - and then a map was 89 rows tall and every border tile above
row 24 paired from the wrong foot. Sliced crowns down both edges. **Grep for
bounded loops before growing a map.**

## Composition: the part that was still done by eye

Tiles are measured; layout was not, and it showed - the Power Plant and Ember
Caldera both shipped as horizontal bands on their first pass, twice, and nothing
caught it but looking at a render. `npm run layout` measures the real maps and
ours on the same six numbers and flags anything outside the range real maps of
that kind occupy:

| | what it is | real range |
|---|---|---|
| stripe | mean solid run along rows / along columns | 0.83 - 1.63 |
| turns | corners per tile of wall boundary | 0.08 - 0.36 |
| dead | walkable tiles with one walkable neighbour | 0.00 - 0.07 |
| loops | independent cycles per 100 walkable tiles | 24 - 81 |
| tight | walkable tiles within a step of a wall | 0.39 - 0.99 |
| open | walkable share of the map | 0.20 - 0.63 |

**No single number is a target.** Route 1 is nearly all hall and Rock Tunnel
nearly all corridor; both are good maps. The band is the point.

What it found on its first run, which is the case for keeping it:

- **`power` stripe 2.51**, against a real ceiling of 1.63 - and that ceiling *is*
  FireRed's own Power Plant, the most banded map Game Freak shipped. That is
  "it reads as stripes" expressed as a number. Banks were 12-17 long; nothing is
  over 9 now and it measures **1.83**. Closing the last of that gap needs
  vertical bank segments, which the real map has and our bank grammar does not.
- **`dead` = 0.000 on five maps.** Ours had none, because they are composed of
  rectangles, so nooks were added. **Half of that reading was an artefact** - see
  *the ruler was bent* below. Measured honestly, real routes have essentially no
  dead ends either (0.0000, 0.0017, 0.0023), so Route 1 never needed a nook;
  real towers (0.03-0.08) and caves (0.00-0.07) genuinely do. The nooks stay - 1%
  of tiles, and an empty field reads better with them - but they were justified
  by a measurement, and the measurement was wrong.
- `meadow` and `clearing` are too open, too loopy and not tight enough - fields
  with almost no wall in them.

### Composing one: tools/compose.py

`study_shape.py` went further than the bands and measured what a cave is *made
of*, over fourteen real ones. The answer is not what we had been drawing:

|  | real caves | hand-drawn Rock Ridge |
|---|---|---|
| tiles 1-3 wide | **97%** | 75% |
| wall runs straight for | 2.7 (p90 6) | 6.2 (p90 10) |
| chambers per 1000 tiles | ~46, radius 2.3 | 39, radius 2.9 |
| tiles offering 3+ ways | 88% | 96% |

**A cave is a dense net of narrow passages knotting at small chambers - not
halls with walls between them.** We had it inside out. `compose.py` builds that:
chamber sites on a jittered grid (the grid is what keeps two passages two apart,
which the autotile needs), stepped paths between them jogging every 2-5 tiles
(this is what makes a wall turn every three tiles instead of running ten), a
spanning tree first so reachability is structural, then extra edges to hit the
loop density - and then it **scores the candidate against every measured band
and tries another seed**. A map that would read as stripes cannot get out.

Rock Ridge is composed this way, and it went 75% -> 84% narrow, straight
6.2 -> 3.6, turns 0.09 -> 0.18, dead 0.000 -> 0.014. Its ledges, pond and
spring are still stamped by hand where they were always meant to go, because
those carry the map's intent; the generator supplies the connective tissue and
`join_islands` puts back anything the stamping cut off.

**Two things the generator taught us the hard way.** Both are the same lesson -
a metric you have not written cannot catch anything:

- The first version matched *every* band and still looked wrong: its wall came
  out as scattered clumps where Mt Moon's is a few big slabs. Nothing measured
  wall masses. `masses` and `massfill` exist because of that.
- Scoring "inside the band" let it sit on an edge of all nine at once, which is
  a map that is technically a cave and looks like none. `score()` now adds a
  nudge towards the middle of each band.

**Not every map is a warren, and the composer only builds warrens.** The Haunted
Tower has no passages to carve — it is one square room, and what shapes it is
the graves standing in it. So it generate-and-tests too, but over grave plots
rather than corridors, against `compose.TOWER` (measured off 2F-7F alone, and
layout metrics only, since there is nothing for the shape ones to say). Three
passes, each added because a measurement said the last one was not enough:
rows, then **stubs** hung off them (rows alone give `dead` 0.019 against a real
0.031-0.100 — you can walk round anything a free-standing row builds), then
**alcoves**, one floor tile walled on three sides, because stubs still only
reached 0.026. A dead end has to be built on purpose.

**One caveat on `score()` at narrow bands.** Being 0.02 outside a band costs
0.03; sitting at a band's edge *inside* costs 0.075, because of the middle
nudge. For a cave's nine wide bands that trade is right. For the tower's six
narrow ones it is not — it preferred a plan with `stripe` outside the band — so
`haunted_tower()` ranks **inside-the-band first, distance second**, and asserts
that something landed inside.

**The ruler was bent, twice.** Both faults were in the measuring, and both are
worth more than anything they were used to measure.

**A real map's collision bits are not its reachable floor.** `real_walkable`
called every passable tile walkable - including the fill outside a cave mouth and
every pocket the layout seals off. That is **63% of Rock Tunnel 1F**, 45% of
Route 2, 36% of Seafoam B2F, so every band these tools ever produced was part
measured on ground no player can stand on. It surfaced as Frost Hollow appearing
to *drift* from the Seafoam B3F it is copied from tile for tile - ours `open
0.40` against the real map's `0.47`. Restricted to what you can reach the real
one is `open 0.40, dead 0.00`, exactly ours: the copy was faithful and the ruler
was bent. `reachable()` keeps the largest connected run and both readers go
through it, so two things being compared are measured the same way. Two flags
vanished with it - ridge and frost `stripe` - which is the point. **If a
transcription looks like it drifted, suspect the ruler first.**

**And the flag was coarser than its own wording.** It claimed "the range every
real map of *its kind* occupies" while `band[k]` pooled every kind, so a tower
could sit outside all six real tower floors and pass because a cave was wider.
It judges per kind now, against `OURS`, and it knows when it cannot: a kind with
fewer than `MIN_SAMPLE` (3) real maps is reported and **not** flagged, because a
band from one map is that map. Berry Forest took forest to 2, still short, so
**Deep Woods is honestly unjudged**; three more interiors took indoor from 1 to 4
so the Power Plant stopped being measured against itself. A band of zero width is
a value, not a range, and does not flag either.

`compose.CAVE`, `VOLCANO` and `TOWER` were derived before the reachability fix
and are therefore slightly stale. **The maps are not** - ridge, ember and tower
all pass the corrected per-kind bands with no flags - so re-deriving the
constants would churn three approved maps for no measured gain. Left deliberately.

Nine flags survive, and each says one thing: `meadow` turns 0.23 (v 0.11-0.18)
and open 0.60 (v 0.22-0.58) - its tree edges wiggle where Route 1 is rectangles;
`pond` loops 77 (v 71-75) and tight 0.47 (v 0.50-0.57) - a shade too open;
`power` turns 0.16 (v 0.20-0.26), loops 49 (v 57-71), tight 0.83 (v 0.64-0.77) -
more maze than building, which is the **vertical bank segments** already named
above. All measured, named, and not regenerated on a QA pass.

## The tile system

Gen 3 metatiles: 8 entries — 4 bottom-layer opaque, 4 top-layer colour-keyed.
**The top layer draws over sprites.** That is how a trainer walks behind a tree
top. Our atlas composites both layers into one image, so anything that must
draw over the player needs a second, top-layer-only tile baked separately
(`forest.fringeTop`, id 1648, painted after `drawPlayer` by `drawOverhangs`).

Ids < 640 are primary (`gTileset_General`, shared by every outdoor map);
≥ 640 secondary. Our atlas bases: mt_ember 656, seafoam_islands 896,
power_plant 1152, pokemon_tower 1312, cave 1424, viridian_forest 1600,
lavaridge 1648, and the overhang tile last at 2096. Bases move whenever a set
is added — read them out of `route.json`, never hard-code one.

**A second decomp, for lava only.** FireRed has no molten tile anywhere: Mt
Ember's Ruby Path is dry rock, and the gold a colour sweep finds in
`sevii_islands_123` is the Ember Spa's water. Ember Caldera is therefore built
from **pokeemerald**'s `lavaridge` — the tileset behind Magma Hideout.
`load_emerald()` handles it, and Emerald's constants are **not** FireRed's:
`NUM_TILES_IN_PRIMARY` is **512** (not 640) and `NUM_PALS_IN_PRIMARY` is **6**
(not 7). Get either wrong and the sheet renders as plausible green-and-white
stripes rather than as an error.

**A secondary is only correct against its own primary.** A Gen 3 metatile takes
palettes 0-6 and any tile id below 640 from the *primary*, so pairing is not a
detail: `power_plant` and `pokemon_tower` are **Building** maps, and we baked
both against General for months, which washed every crate and barrel in them to
grey. `SECONDARY` in `build_assets.py` now carries the primary with each name;
`layouts.json` is where to check, never assume.

**The autotile ceiling, and why it is not worth raising.** Our masses use a 3x3
- four neighbours, nine cases - and a real tileset carries far more pieces than
that. Both obvious fixes were measured against Seafoam's own wall and both were
rejected:

- An **8-neighbour blob autotile** (the standard 47-case reduction) scored
  **34%** where ours scores **31%**, for 31 extra cases. Adding depth into the
  mass as a fourth key added nothing. The id simply is not a function of the
  neighbourhood: Game Freak hand-places directional crystal pieces through a
  mass, and authored decoration is not derivable.
- **Scattering the interior** from the measured mix (about half of every
  enclosed wall cell in a real map is a decorative piece, not the plain fill)
  produced noise, because our walls are bands two or three thick where every
  cell is an *edge*. The only "interiors" we have are the out-of-bounds border
  ring, so it decorated where nobody walks. Mt Moon can do it because its masses
  are eight tiles thick - and what it packs the middle with is **black void**
  (`cave` local 114, 42% of its enclosed cells), which nobody ever sees.

So the ceiling is real and it does not matter at our wall thickness. What did
matter, and is fixed: the **map edge** (see `autotile`'s `outside`) and, for a
copied map, **carrying the real ids** (see `AREAS.frost.tiles`).

**Two grids, do not confuse them.** `route.png` is 16 metatiles per row
(`atlasCols`). FireRed's tileset editor is **8 per row**, and that is the space
autotiles are laid out in — a 3×3 autotile is three consecutive rows of ids
`n, n+8, n+16` at three consecutive columns. Read picks in the 8-wide grid or
they look arbitrary.

**Primary metatiles using palettes 7-15 render blank unless a secondary tileset
is loaded** (its palettes fill those slots). A tile that comes out pale and
featureless is usually this, not a bad pick.

### The sets in `route.json`

- **path** `[[211,212,213],[219,220,221],[227,228,229]]` — 3×3 autotile.
- **deck** `[[313,314,315],[321,322,323],[329,330,331]]` — the wooden pier;
  same 3×3 shape, so one `autotile()` serves both. Cols 0 and 4 of those rows
  (312/316…) are the sand-and-rail approach pieces.
- **pond** — rim on the water's **top and sides only**; the bottom edge lives on
  the **land tile below** (`bank` 307, char `b`). Read 306/307/308 as grass and
  a lake ends in a hard blue-to-green line with no bank. Four inner corners
  (`capLeft/capRight` 297/296, `nookLeft/nookRight` 305/304) are what let an
  island or a pier sit *inside* water without the rim stopping dead.
- **tree** tip 14/15, bodyA 30/31, bodyB 22/23, base 36/37 — 2 wide on **even
  columns**, ≥3 tall.
- **forest** (viridian_forest locals) crown 8/9/10, fringe 1, midA 16/17/18,
  midB 24/25/26, trunk 32/33/34, shadow 35/36/37. A column is
  `crown + (midA,midB)×n + trunk + shadow` — **always an odd number of rows**.
  Even leaves half a crown stranded. `fringe` is the only canopy metatile with
  no collision: the walkable overhang you pass behind.
- **ledge** `[176,135,177]` left cap / mid / right cap.
- **frost** (`seafoam_islands` locals) — Frost Hollow is **Seafoam Islands B3F,
  transcribed tile for tile** from its own map.bin, and it carries **the real
  map's own metatile ids** as well as our characters (see below). The classification is the
  map's collision and **elevation** bits, never an eye: elevation 3 is the lower
  ice, 4 the raised shelf, 1 the water, 0 the striped step. Three autotiles,
  each derived by masking all five Seafoam floors:
  shelf `80/81/82 · 88/89/90 · 96/97/98` (a clean 3×3, the same nine slots the
  cave's plateau uses), wall `27/25/31 · 18/17/16 · 24/25/26`, and the river
  `160/151/162 · 163/141/164` with the third row repeating the second — rust-
  coloured banks down the sides, no bottom rim, like every other water here.
  **25 is both the wall's top and bottom edge**: ice is a texture rather than a
  lit surface, so the mass has no separate near face. That is measured, so do
  not "fix" it into two tiles. The waterfall is **primary** — 295 over 303 over
  311 — under Seafoam's own dark opening (12). Stalactites 29/30 over 37/38 are
  2×2 and hang shoulder to shoulder, so which half a tile is has to be
  **counted along the run**, not read off "is my neighbour one too".
  **Elevation 0 covers three different things in Seafoam** — the step (4), shelf
  edges doing duty as a ramp, and the snow fringe outside the cave — and only
  the first is a staircase. Ladders and boulder holes were replaced by the
  ground they stood in: they lead to another floor there and nowhere here.
- **volcano** (pokeemerald `lavaridge`; local index is the Emerald id minus
  512). Every pick was derived from Magma Hideout's own map.bin by masking —
  for each tile, which of its four neighbours are wall (or lava), then the
  commonest id per mask. Rock is a 3×3 autotile,
  `616/780/618 · 624/625/626 · 632/628/634`.
  **Lava is one flat tile (701).** Everything that makes a pool read as a pool
  is drawn on the rock **bank** around it, keyed by which sides the lava lies
  on: `D` 839 above the pool, `R` 838 left of it, `L` 649 right of it, `U` 827
  below it, corners `DR` 541 / `DL` 539 / `UL` 531 / `UR` 533, and 540 for a
  rock the lava surrounds. **Do not put the rim on the lava.** That shipped
  once: the rock beside a pool went on drawing its own plain edge, so any pool
  under a wall came out with two dark bands and two grey lips stacked, which is
  what it looks like when the orientations are wrong. `lava_banks()` in
  `build_map.py` paints the bank after the bridges, and check() asserts lava
  never meets open floor except along its **bottom** edge — bare in Magma
  Hideout exactly as a FireRed lake's bottom edge is bare.
  Bubbling lava 819 scatters over the body; 687 is the ladder; 784-787 the
  floor with a crystal in it. **110/111-style traps here too:** the 2×2 "rock
  hump" a blob search finds is Team Magma's machinery, and 598/606 — which
  looks like a tunnel mouth — is scenery you cannot walk into, so it was cut. A
  free-standing boulder is just a 2×2 of our own wall character.
- **power** (power_plant locals, a **Building** map) floor 31. A machine bank
  is **three** rows of left/middle/right, and every row caps on the same two
  columns: `33/34/35` plinth over `17/13/18` machine top over `25/21/26` body.
  The plinth is the slab the machine stands on — drawing only its middle across
  a run leaves it uncapped, and an uncapped grey slab the length of a bank reads
  as a wall with a walkable top. FireRed leaves the plinth walkable; **we make
  it solid**, because there a bank is one side of a room and here it stands
  alone in the open. Below the foot, 29 across the whole width — that one has no
  caps (28/30 belong to the outer-wall bank 19/20/21/22/24, a different set).
  Consoles are `57/58`, replacing 13/21 in one column under the plinth's middle,
  both solid. **110/111 is a different object** — a free-standing terminal whose
  lower half is 118/119 — and drawing its top alone is what once cut ours in
  two. Barrels are 53 over 54, 1 or 2 tall, and never free-standing: 41 of the
  real map's 54 hang directly off a bank's foot and the rest stand on a plinth.
  The room's own outer wall is a separate 3×3 with the void drawn beyond it —
  corners 3/7/41/45, sides 5/19/23/43 — lifted off the real map's four corners.
- **tower** (pokemon_tower locals, also a **Building** map). Masked out of all
  seven real Pokémon Tower floors. Two rules carry the whole room:

  **A wall shows its face only where there is floor below it** — 672, with the
  white lip 664 on the tile above it. Everywhere else the wall is flat black
  (641). That is not a shortcut: it is why the real oval is purple across its
  top and pure black down its sides and along its bottom, and it is what lets a
  **square** room be drawn with no corner pieces at all. There are none to
  draw with — 648/656/652/653 exist only for the arc's diagonal steps, and a
  first attempt at a chamfered corner hung a white block off each top corner.

  **The floor carries the shadow, and the light comes from the upper left**:
  wall above → 644, wall to the left → 645, both → 658. A wall to the **right**
  or **below** gives plain 642, measured across all seven floors. Graves cast
  nothing — they are furniture standing on the floor, not part of the room — and
  a grave set into the wall (`A`, 729 opening a run and 728 continuing it, with
  no closing piece) blocks the wall's own shadow, which is why the renderer's
  `shade()` counts only `H` where `wall()` counts `H` and `A` both.

  The headstone is **657**, one tile, solid. Graves lie in rows: of 240 vertical
  runs across the seven floors **172 are a single tile**, and the commonest plot
  bounding boxes are 1×1, 2×1, 3×1 and 3×2. The ward is 5F's cyan sigil,
  665-667 over 673-675 over 681-683 — three consecutive rows of the 8-wide
  editor grid — 3×3 and **walkable**, so it costs no floor.

  **No staircases.** 2F and 5F each carry two 3×3 stair blocks, and they are the
  strongest furniture in the tileset, but they lead to another floor there and
  nowhere here — the same reason Frost Hollow's ladders were replaced by the
  ground they stood in.

### The trainer sheet

`.assets-src/…Player Sprites.png` is a Spriters Resource rip. It draws a
**backing rectangle behind every frame**, so the grid can be measured out of the
image rather than guessed — that is how these offsets were found, and how to
find any others.

**But it uses two colours: orange for frames it considers used, green for the
rest — and both are cells.** Measuring only the orange ones hides three whole
sets, including the jump, which is why this file once said the sheet had none.

Four rows on a 33px pitch from y=42: down / up / left / right. Across:

| set | first x | pitch | size | frames | |
|---|---|---|---|---|---|
| walk | 8 | 17 | 16×32 | 3 | stand / step / step |
| run | 68 | 17 | 16×32 | 3 | same cycle, leaning |
| bike | 128 | 33 | 32×32 | 3 | **unused** |
| fish | 236 | 33 | 32×32 | 4 | the cast |
| surf | 377 | 33 | 32×32 | 2 | **unused** |
| surf | 452 | 33 | 32×32 | 2 | on green, **unused** |
| jump | 527 | 33 | 32×32 | 1 | on green — legs tucked, one pose per facing |

The 32-wide sets keep the figure in their middle 16, so centring on the tile
puts the rod's overhang where it belongs with no per-set nudge.

**The jump is one mid-air pose per facing, not a cycle**, so the arc and the
shadow on the ground are the renderer's job — `drawPlayer`'s `lift`.

**Fishing frame order is not uniform.** Each facing runs wind-up → rod-extended,
except `right`, whose frames sit in reverse order on the rip. `fishFrame()`
carries both indices per direction because nothing about the image says so.

Running is gated on the **Running Shoes key item** at Lv 15, not on the level
alone - `canRun(level, bag)` checks both, and `loadState` grants the shoes to
any save past that level that predates them.

There is still **no official Running Shoes icon anywhere**: not in PokeAPI,
which has no such item, and not in pokefirered or pokeemerald, whose item-icon
directories were both checked (Gen 3 grants the shoes invisibly). So the icon
is the trainer mid-stride, cropped from the run set above by `build_shoes()` -
real art already in this repository rather than an invented shoe. It is the one
item icon that is not a picture of an object; that is the trade, and it is why
this note used to say running could not be an item at all.

### Map characters

Legend lives in [src/game/map.js](src/game/map.js). Lowercase walkable,
uppercase solid. `SOLID = "T~wRMIPHLFCWXBEVkKdt"` — it is in [src/game/map.js](src/game/map.js)
and [tools/build_map.py](tools/build_map.py), and the two must agree: `E` was
missing from the generator's copy for a whole area, so check() flooded straight
through the Power Plant's outer wall and counted it as walkable ground.

`.` grass · `,` tall grass · `f` flowers · `#` sand · `w` water · `b` shore ·
`T` tree · `L` ledge · `F` canopy · `c` canopy overhang · `D` pier

Cave (Rock Ridge only): `r` floor · `R` wall · `o` floor crater (2×2, x even) ·
`u` plateau · `C` cliff below it · `S` stairs · `W` spring (2×2 in a rock face)

Power Plant: `p` floor · `P` machine bank (3 rows, ≥3 wide) · `X` console in a
bank · `B` barrels (1 wide, 1–2 tall, hung off a bank's foot) · `E` room edge

Ember Caldera: `m` floor · `M` volcanic rock (≥2×2, or one tile of bank beside
lava) · `V` lava · `l` ladder · `n` bridge over lava

Frost Hollow: `i` lower ice · `j` raised ice shelf · `I` ice wall · `d` ice
boulder · `t` stalactite (2×2) · `k` water · `K` waterfall · `s` stairs

Rare tiers ride on the box entry and the dex, not on a character: a mon carries
one of `TIERS` and never two, and `state[tier]` is one byte per species for each
of them. Those arrays are BUILT from `TIERS` in both `freshState` and
`loadState`, so a save that predates a tier simply has no key for it and
`normalise(undefined)` gives a fresh row of zeroes - adding a tier is a non-event
for saves. The one hand-written exception is the migration that must run AFTER
that spread or it is overwritten: a save written before Origin existed filed its
Gen 1 sprites under `astral`, so those move across - same Pokemon, same artwork,
only the word changed.

Haunted Tower: `h` floor · `H` wall (≥2 thick over floor) · `G` a grave standing
on the floor (rows 1–5 across, one deep) · `A` a grave set into the wall face ·
`y` the ward (one 3×3, walkable)

**Bridges** are `n` over lava and `N` over water, and both are **Route 12's
bridge planks** (`lavender_town` 755/757 north-south, 764/772 east-west). The
useful fact: those planks are the metatile's **top layer** — the colour-keyed
one — so they lift off the water they were drawn on and `build_assets.py`
composites them over lava or over ice instead, the same trick the canopy
overhang and Ekat99's boulders use. That is the only honest way to get a bridge
over lava: **no Gen 3 game has one**, so there is no tile to go and find.

The character says what a bridge crosses, so nothing is guessed at draw time.
Planks lie **across** the way you walk and alternate every other tile, and which
axis that is comes from the run's own extents — so a bridge must be **≥2 across**
or it is half a bridge. The sea pier (`deck`) is a **jetty**, not a bridge: its
outer ring is drawn to meet sand and brought a green fringe with it over lava.
**And it was wrong for Pond & Shore too, which is the only place that used
it.** Those two spans cross the lake - water on both sides, dry ground at each
end - so they are bridges, and the jetty's sand-meeting outer ring fringed them
in beach. They are `N` now, two across as Route 12's own bridge is. `D` and
`pier()` are kept and currently have NO caller: the deck is real, correct art
for a jetty that runs out from land and stops, and this map simply never had
one. Do not reach for it to cross anything.

Biomes: `m/M` ember · `i/I` ice · `p/P` plant · `h/H` tower

**A copied map carries the real map's ids.** Characters alone are not enough for
a transcription: put through our autotiles, Frost Hollow drew **397 of its 836
cells** differently from Seafoam B3F. Two reasons, and the second is general:

1. Seafoam varies its wall among half a dozen interchangeable pieces, and its
   floor and shelf the same way. A 3×3 is nine cases and has no way to say
   which — no rule was going to fix this.
2. `autotile()` treated **off the edge of the map** as "not the mass", so the
   outer ring of every cave drew edges facing out of the world. That was 176 of
   the 397. It now takes an `outside` flag: false for a path or a pier, which
   really do end, and **true for a mass of rock**, which does not.

So `frost_hollow()` returns a third channel: `AREAS.frost.tiles`, one id per
cell, `-1` where we authored something (the bridge, the two staircases) and the
rules draw it instead. `drawTile`'s `fixed` argument beats every rule in this
file. That took the difference to **18 cells, every one of them a change we
chose**. Rules are for maps you invent; a map you copied should be copied.

The ids are rebased against wherever the atlas packs `seafoam_islands`, so
`AREAS.frost.tileBase` records the base used and check.mjs asserts it still
matches `route.json`. Run `npm run art` without `npm run map` and that fails
loudly rather than drawing rubble at the right coordinates.

**Ledges are one-way.** Solid to ordinary movement; walking *south* into one
hops it and lands two tiles down. Any reachability check must therefore be a
**directed** flood fill — an undirected one passes maps that trap the player on
a terrace.

**Every walkable tile spawns Pokémon.** There are no special encounter tiles.

## Invariants the build asserts

`check()` in [tools/build_map.py](tools/build_map.py) refuses to emit a map that
breaks these. They exist because each one shipped as a bug that looked fine in a
screenshot:

- trees 2 wide on even columns, ≥3 tall
- canopy 3 wide, on the 3-column grid, **odd** ≥3 tall, crown visible
- water and path runs ≥3 wide; every tile under water is shore/water/pier
- piers ≥3 wide with somewhere to step on *and* off at each end
- ledges ≥3 long, reachable from above, with a landing tile
- machine banks exactly 3 rows and ≥3 wide; a console never on the plinth and
  never an end cap; barrels ≤2 tall and never standing on open floor
- an ice shelf tile never standing alone; stairs joining the shelf to the lower
  ice, never the same ground at both ends; water never a single tile;
  stalactite runs an even number of columns and exactly 2 tall; a waterfall
  ≥3 tall and landing in water
- volcanic rock never one tile thin, except the one-tile bank beside lava;
  lava never meeting open floor above or beside it, only below; pools ≥3×2;
  bridges ≥2 across and reaching dry rock on two opposite sides; ladders one
  column with somewhere to step on and off
- tower wall never one tile thin over floor (it would have no lip to draw, and
  the black void would abut the purple panel); a wall grave with wall above and
  floor below; the ward exactly one 3×3 block; graves 20–40% of the room

**A BRIDGE LANDS ACROSS ITS WHOLE WIDTH, and `lava_banks()` runs after it.**
The bank is made out of the floor beside a pool, and in the caldera it runs four
more times after the causeway is laid - so a crossing placed onto floor at both
ends had a landing tile turned to rock afterwards, and shipped two wide with
only its left column landing. `spans_clear()` asked whether the blob had ground
SOMEWHERE on each side, which one tile of landing satisfies; it checks every
column of a vertical span now, and runs in `check()` for every map rather than
only where `place_lava` calls it. `heal_spans()` is the repair, and it EXTENDS
rather than moves, because the bank is the shore and a bridge crosses its shore.
The whole width moves together - a version that only extended when every end
cell was rock refused to touch a span with one column on floor and one on rock,
which is precisely the broken case.

**Draw a bridge exactly 2 across.** The plank set is baked from Route 12, whose
own bridge is two wide, so `bridge` in `route.json` holds a left half and a
right half and nothing else. `bridgeId()` picks by the parity of the distance
to the near end, so three across comes out left/right/left and draws a rail
down the middle of its own deck. And a bridge can be broken by something placed
*after* it: a pool sunk beside Ember's causeway merged with the lake and drowned
the approach, leaving a span you could walk onto and never leave — nothing was
disconnected by it, so `spans_clear()` is what catches that, alongside
`ladders_clear()`, whenever a pool is placed.
- spawn not inside a wall; ≥200 walkable tiles; ≥90% reachable (directed)

[tools/check.mjs](tools/check.mjs) adds thirty suites — catch rules, phase
machine, balls, master balls, economy, evolution, evolution scene, trainer
stats, casting, tileset, player, map ladder, medals, origin gate, variant rows,
steps, minimap, battle scene, band budgets, pity, daily, field items, berries,
origin art, senses, spawn ladder, clock, habitat, save migration, confirm,
areas. The count in the command table above is the same number;
both are printed by the run, so a new suite means editing both.
The tileset suite lays out Safari Zone's **real** pond through our own
`waterId` and asserts 102 tiles match FireRed exactly, and asserts every canopy
crown is whole. Biome ground and solid lists must be disjoint (an "invisible
wall" shipped once because a wall list contained a floor tile).

It also asserts **every species is gettable** — in a biome table, on a rod, or
evolved from something that is, closed under evolution. That is the check a
deleted map runs into: removing the Flower Clearing orphaned eight species, five
of them (Tauros, Ditto, Farfetch'd, Lickitung, Porygon) with nowhere else at all,
and this is the only thing that said so. Add a map, add its residents; remove a
map, rehome them.

## Design data: what not to break in `biomes.js` and `trainer.js`

`README.md` carries the reasoning. These four are the ones that go wrong quietly.

**`LEVEL_XP`'s first thirty rows are frozen.** A save holds raw XP, not a level,
so editing any of them silently re-levels every trainer who already exists. The
table was extended from 30 entries to 50 by appending only — each new increment
about 7.5% larger than the last, which is what the old tail was already doing.

**Doubling `MAX_RANK` means halving every coefficient in `trainer.js`.** Ranks
went 10 → 20 and all five coefficients halved with them, so rank 20 is worth
exactly what rank 10 used to be: `catchMult` .06→.03, `rarityPower` .04→.02
(twice — the live one and `rareShareAt`'s copy), `stepScale` .04→.02,
`sellScale` .04→.02, `priceScale` .02→.01, `xpScale` .08→.04, and the five
`effect()` strings that quote them. Miss one and the ceiling moves without
anything failing — the numbers stay monotone, which is all the suite checks.
The design number is **49 points against 100 ranks**, asserted directly.

**EVOLUTION IS CANDY AND A LEVEL, and there is no feed any more.** `evolve`
takes ONE `uid`, checks `evolveState(mon, bag, row)`, and mutates that entry in
place - the uid survives, which is what makes it a Pokemon rather than a slot.
1 candy = 1 level, `evoLevel(row)` is the real PokeAPI number, and nothing is
consumed but the stone. Do not reintroduce a pile: `feedable`/`feedSelection`/
`ANY_HERO` existed only to answer "which of these six is the hero", and a uid
cannot be asked that wrong.

**`candyValue` reads through to the BASE FORM, and that is load-bearing.**
Caterpie evolves at Lv 7 and a wild one can be caught at 7 - it evolves for free
into a Metapod a tier above it, so "evolve then convert" beat "convert" on every
line whose tier climbs. Reading through makes evolving unable to raise the yield
at all, which closes the class rather than out-tuning one case. `sellValue`
deliberately does NOT read through: cash tracks the species in hand, candy is a
wage for catching. The two measuring different things is the design, and
check.mjs pins both directions.

**The candy yield must never be flat.** Flat makes one map strictly best to
grind and the other seven scenery. `CANDY` is tiered 1/2/4/8 and must stay
FLATTER than `SELL` - if candy tracked cash, a common catch would be worthless
in both currencies, and commons are what the economy runs on. Measured spread
across the eight maps is 1.48-2.58 candy per encounter.

**A synthetic evolution level is derived, never tabled.** A stone or trade row
has no level in PokeAPI; `evoLevel` gives it the parent's plus `SYNTH_STEP`,
floored at `SYNTH_MIN`. A table of per-method levels grows every generation and
this does not. check.mjs asserts a chain always climbs, because that is the only
thing making the derivation sound.

**Evolved forms are appended to every biome table by rule too, and for the
same reason.** 41 of the 151 were in no table and on no rod - every third stage
but Dragonite's - and the fix is `encounterTable(biome, level)`, which walks the
evolution graph out from whatever the map already spawns. **Never hand-write an
evolved form into a table to "fix" one species**: a species listed once and
derived once has two weights in the same map, and nothing fails when they
disagree. A hand-written row keeps its own weight and gets no derived one (the
`weight.has(to)` guard) but still seeds the next step, so **depth is measured
from what the map already spawns** - Ember lists Charmeleon, so Charizard is one
step away there and Venusaur is two from Deep Woods' Bulbasaur.

`EVO_FLOOR` is the load-bearing number, not `EVO_SHARE`. Proportional weight
compounds, so a weight-1 line's third stage lands at 0.04 - a rounding error,
not a chance. The floor is what makes the rarest lines reachable, and it is why
the "an evolution is never commoner than what it evolves from" assertion has to
exempt rows sitting ON the floor.

The engine calls `tableFor`, which caches one (biome, level) pair - it is asked
on every step that spawns. And **anything that grows a table dilutes the
legendaries**, whose weights are fixed: check.mjs asserts their share can only
fall as the level rises, because a floor applied carelessly could raise it and
nothing else would say so.

**MAPS ARE ON A LEVEL LADDER, and this file used to assert the opposite.**
`BIOMES[i].level` gates travel: Tall Grass at 1, the Haunted Tower at `MAP_LAST`
(20). The old design paced you with the price of balls and check.mjs asserted no
area carried a `level` at all - a good argument that lost to a better one, since
a new player cannot act on "all eight are open but seven will waste your balls"
until after they have wasted them. **`areaOpen()` is the single answer**, used by
the engine's refusal, the Travel panel's padlock AND the Dex sheet's WHERE TO
LOOK - which is a way to GO to the map rather than only the name of it, so it
is a third screen offering travel and check.mjs asserts all three ask. A menu
that offers a map the engine will not travel to is worse than no menu, and the
failure is silent: the button is there, it is pressed, and nothing happens. `loadState` sends a save home if
it is standing somewhere it has not earned, or a pre-ladder save is stranded.
The suite asserts the SHAPE - starts at `MAP_FIRST`, ends at `MAP_LAST`,
non-decreasing, and `MAP_LAST < MAX_LEVEL` so the ladder always finishes with
levelling left.

**`PLAIN_MULT` is what a plain throw is worth, and the four situational balls
share it.** An unboosted Net Ball IS a Poke Ball - and every `bonus()` used to
return a typed-in `1.0` for its unboosted case, so dropping the plain throw to
0.8 silently made an out-of-water Net Ball strictly better than the cheap ball at
six times the price. check.mjs's `min(bonus) === ball.mult` caught it. Never type
the unboosted value into a `bonus()`.

**Catching got harder and fleeing got kinder, deliberately in opposite
directions.** Both in one pass: `PLAIN_MULT` 1.0 -> 0.8 and `fleeChance`
`0.2 + .4x` -> `0.12 + .3x`. Two nerfs pointing the same way would have made
encounters shorter AND less winnable; pointing them apart makes an encounter
last longer so a failed throw is a setback rather than the end of it. If either
is retuned alone, check that the pair still points apart.

**A LEGENDARY'S HOME IS ITS PRIMARY TYPE.** Matching on ANY type gave half of
them no home at all: Articuno is Ice/Flying and the starting map is
Normal/Flying, so it was exactly as likely in Tall Grass as in Frost Hollow -
the opposite of what "hunt where it lives" means. Three tiers now, off the type
ORDER, which is already in the data: `LEGEND_HOME` for the primary,
`LEGEND_HAUNT` for a later one, `LEGEND_STRAY` everywhere else.

**And `legendTier` is exported because the RULE is the only thing worth
asserting.** A legendary's share of a finished table is confounded twice - by
how big that map's table is (Deep Woods has the smallest in the game, so every
legendary looks commoner there) and by how many others call the same map home
(the Tower is home to Mewtwo AND Mew, which dilutes Celebi's slice). Both
measures said Celebi belonged in Deep Woods while it was weighted correctly the
whole time.

**ONE FIELD EFFECT AT A TIME, whatever family it is in.** The families still
stop two of the same KIND colliding, but a repel and a honey running together
is a contradiction a player can buy: one says "meet nothing" and the other says
"what you meet is rarer". Starting anything cancels everything.

**A REPEL IS TOTAL, and its tiers are DURATION.** It used to scale the encounter
rate to 0.55/0.35/0.20 - a repel that mostly works, and "mostly" is the one
thing it must not be, since the whole reason to carry one is crossing farmed
ground without being stopped.

**A BRANCH YOU HAVE REACHED MUST LEAVE THE RECKONING.** The Box's RAISE button
showed while `need > 0`, and `need` was the minimum over ALL branches. Slowpoke
evolves into Slowbro at 37 and into Slowking on a trade, which `evoLevel` gives
a synthetic 16 - so past 16 the minimum was 0, RAISE hid itself, and Slowbro was
unreachable for the rest of the game. Reported as "Slowking is blocking
Slowbro", which is exactly what it was doing. **Any panel that reduces over
branches has to drop the ones already satisfied.**

**Legendaries are appended to every biome table by rule, never listed in one.**
`LEGENDARY` holds the dex ids; `legendsFor()` adds each to every table at
`LEGEND_MATCHED` (0.5) where the biome shares one of its types and
`LEGEND_STRAY` (0.08) everywhere else. Hand-writing one into a table as well
gives it two different sets of odds in the same place — caught, as a species
listed twice. A new generation's legendary needs one dex number here and nothing
else. Both weights are deliberately sub-1, which is also what gives **Fortune**
its teeth: `w ** 0.6` more than doubles 0.08 while a weight-22 Pidgey falls to a
quarter of itself.

**The Master Ball divisor is derived from the level cap, not chosen.**
`level % 15` in `levelReward` exists to make "three in a whole game" true at
`MAX_LEVEL` 50; it was `% 10` at 30. Move the cap and this moves with it, or the
rarest item in the game quietly quintuples — which is exactly what the economy
suite caught when the cap went up.

**Four rare tiers, and each is a different KIND of rare** - which is what lets
all four stand together instead of being four strengths of the same idea:

| | odds | its tell |
|---|---|---|
| **Origin** | 1/160 | the **artwork** - its Generation I sprite, the 1996 drawing |
| **Holo** | 1/160 | the **finish** - the ordinary art, with foil travelling over it |
| **Shiny** | 1/240 | the **palette** - the alternate colours |
| **Astral** | 1/480 | the **substance** - a starlight duotone, no new art at all |

**The SPREAD matters more than the rate, and that is not obvious.** These were
1 : 2 : 8 and the completion rosette - caught plus all four variants of ONE
species - was unreachable: 0.7% chance that any of the 151 completed over a
10,000-encounter run, because a product is governed by its smallest term.
Scaling the whole ladder cannot fix that (the base has to reach ~1/64 before it
works, which is a rare every 25 encounters); COMPRESSING it can. The ratio is
1 : 1.5 : 3 now. **If completion ever needs to move again, move the ratio, not
the base.** Retune one tier alone and the ladder re-sorts itself quietly.

Origin and Holo are the *kindest* on purpose: their tells are the artwork and the
finish, and both are worth meeting often enough to recognise. Astral is the
rarest because its tell is only a treatment.

**`TIERS` in `biomes.js` is the single ordered list**, rarest first, and it is
the roll's precedence, the Box's choice of sprite, the Dex's mark order, the
encounter badge, the save's byte arrays and `keeper()`. It replaced five
hand-written copies of `["astral", "shiny", "origin"]` in five files - which is
exactly how a fourth tier ends up protected from the sell sweep and not from the
feed. **Adding a fifth is one row in `TIER_ODDS` and one drawn icon**; if a
change needs more than that, the list has been bypassed somewhere.

**Two tiers wear the ordinary sprite.** Origin and Shiny have folders; Holo and
Astral do not, because neither is about artwork - they fall through to `""` in
`Sprite.jsx`'s `FOLDER`, and CSS does the rest. That fall-through is now
behaviour rather than an omission.

**A READOUT CAN OUTLIVE ITS SYSTEM TWICE.** The encounter's evolution card was
built for the feed, where catching one more of a species moved its bar - the
throw was what the number was about. Under candy a catch is fungible progress
toward anything, so the card implied a relationship that no longer existed, and
it put the level of a Pokemon you OWN a hand's width from the level of the one
you are looking at. It was relabelled `Lv 5/16` first, which fixed the wording
and kept the false implication; it is deleted now. **When a system goes, audit
what READ it, not just what called it** - and a panel that no longer has a
question to answer should go rather than be reworded.

**A READOUT OUTLIVES THE SYSTEM THAT WROTE IT.** The encounter's evolution card
said `5/16`, which under the feed meant five duplicates of sixteen and now means
level five of sixteen - same shape, same corner, different meaning, and it was
read from play as the merge system still being there. It says `Lv 5/16`. When a
number changes what it COUNTS, change how it reads, or the old meaning is what
people will see.

**`VariantFx` is the moving half of a tier, and there is one of it.** Holo's
travelling foil, Astral's breathing aura and Shiny's sparks existed ONLY in the
encounter, plus a hand-rolled copy of the foil in the Dex FORMS strip - so a
Holo in the Box was a still picture with a filter on it. `Sprite fx` wraps the
image so the layers have something to be absolute inside; the Box row, the FORMS
strip and the evolution REVEAL all use it. Not during the evolution cycle: that
phase is a white silhouette and a foil band over a white shape is a rainbow with
no creature in it. A Dex GRID cell still gets none, deliberately - see the next
note, which is the reason it can afford to.

**A tier's look must survive as a bare `<img>`** - still the rule, and still
why Holo's rim is three drop-shadows and NOT a `hue-rotate`: a 52px sprite with
nothing animating has to be identifiable from `filter` alone, and any screen may
end up drawing one that way.

**But "the Dex cell has nowhere to hang a layer" was wrong, and this file said
it for months.** `.cell` is a `position: relative` button with `overflow:
hidden` - a container. The claim was true of the SPRITE and got written down
about the cell, and it is what kept the grid a wall of stills: reported from
play as "the animations don't run in the dex tab", which was exactly right.
Every screen that draws a variant now draws its layer - grid cell, sheet
portrait, FORMS strip, Box row, encounter, evolution reveal.

`inset: 6%` on the grid cell's foil is not a nudge: the sprite is drawn at 88%
of the cell and centred, so a layer at `inset: 0` masks itself to a silhouette
14% bigger than the sprite it is sheening. And `.cell-marks` / `.cell-no` /
`.cell-full` needed a `z-index` - the foil is 3 and they had none, so a Holo
tile had a rainbow travelling over its own entry number.

**The lever, if 151 animated cells ever costs anything:** `content-visibility:
auto` on `.cell`. `grid-auto-rows` already fixes the row height, so it is safe
to add and has not been, because a realistic save holds a few dozen variants
rather than 151.

**A TIER IS TWO THINGS, and a second copy of `FOLDER` only ever gets one.**
Shiny and Origin have their own artwork; **Holo and Astral have no folder** and
are the ordinary sprite plus a CSS filter. `Evolve.jsx` kept its own
`const FOLDER` and picked the sprite from it - right for the two with folders,
a no-op for the two without - so an Astral evolution played out in entirely
ordinary art: you watched a normal Pokemon become a normal Pokemon and found an
Astral in the box afterwards. The exact failure this file already recorded for
shiny, reintroduced by a duplicated constant that was only fixed in one copy.
**Never re-derive a sprite path**: `spriteUrl(id, variant)` is the one that
knows, and anything drawing a tier needs `sprite-${variant}` as well as the
path. check.mjs asserts both, against the source, because neither half fails
loudly - a missing folder is the right picture and a missing class is a picture
that is merely the wrong colour.

**And the evo scene's whiten needs `!important` back.** The tier filters carry
it (an animation outranks a plain declaration), so the moment those classes
reached `.evo-mon` the duotone won there too and an Astral stayed blue through a
transformation whose whole point is a white silhouette. Two classes beat one
inside the `!important` tier, so `.evo-whiten .evo-mon` wins - but only because
it also says `!important`.

**`Sprite.jsx` takes the one word the engine decided** (`"origin"`, `"shiny"`,
`"holo"`, `"astral"` or nothing) and picks the folder; no screen re-derives it,
so none can disagree, and `spriteUrl()` exports the same path for the things
that need it - the Origin reveal's silhouette and gleam, the Astral star field
and the Holo foil are all `mask-image: var(--art)`, the sprite's own PNG, so
they follow the creature's outline instead of being rectangles over it.

**`spriteUrl()` returns an ABSOLUTE url, and that is load-bearing.** A relative
`url()` inside a custom property is resolved against the stylesheet that
CONSUMES it, not the element that declares it. `--art` is set inline on a React
element and read by a rule in `styles.css`, so `sprites/54.png` was fetched from
`/src/sprites/54.png` under the dev server and `/assets/sprites/54.png` in a
build - both 404, silently, because a mask that cannot load just masks nothing.
The Astral star field and the **entire Origin reveal** had therefore never drawn
in the real app; they worked only in the render harness, whose stylesheet sits
beside the sprites. Built against `document.baseURI`, not a leading slash,
because `vite.config.js` sets `base: "./"`. **If a masked layer is invisible,
log the request before touching the CSS.** That filter is a **duotone, not a hue shift** - rotating hue makes a
green Charizard and a wrong colour reads as a rendering fault, while a duotone
throws the palette away and rebuilds it on one ramp, so the creature is still
recognised by its shape. It also has to work where nothing is animating: a 52px
Dex cell has no aura to explain it.

`tools/build_origin.py` reframes all 151 Gen 1 sprites at build time - Gen 1 art
fills 0.34-0.58 of a 96px canvas where ours fills 0.53-1.00 of 64px, so a raw
`src` swap draws every Origin visibly smaller. Its assertion has to measure
**apparent size, not pose**: comparing widths flagged Metapod at 0.49, and that
is two different drawings (Gen 1 head-on and narrow, FireRed angled and wide),
both 25px tall. The right test is that the `min()` fit touches one axis.

**Pity is a MULTIPLIER on the whole ladder, and capped.** `pityBoost(dry)` is
1 until `PITY_AFTER` and then ramps to `PITY_CAP`; `state.dry` counts encounters
since the last variant of ANY tier and resets on the ROLL, not the catch - the
misery is not meeting one. Boosting a single tier would re-sort `TIER_ODDS`,
which is walked rarest-first, for the same reason the ratio moves as a unit.
Uncapped it stops being a mercy and becomes a farm: park at 3,000 dry
encounters and every throw is a variant. `rollVariant`'s `boost` defaults to 1
so the 400k-roll rate test still measures the unaided odds.

**Origin is gated on the generation's dex.** `rollVariant` takes a `locked`
Set and `lockedTiers(dex, speciesId)` supplies it - Origin cannot roll until
`genComplete` says every ordinary Pokemon of that generation is CAUGHT (state
2, not seen). Per generation, not globally, or adding Gen 2 would take a Gen 1
player's Origins away. The gate is passed IN rather than checked inside the
roll, so the roll stays pure and check.mjs can still drive it 400k times on a
seeded clock. check.mjs asserts all three silent failures: a gate that never
opens, one that was never closed, and one that leaks the tier it holds back -
plus that locking a tier does not change what the others are worth.

**Tab icons are MASKS, not pictures.** A tab is pale-on-dark when idle and
dark-on-pale when active, so a fixed-colour icon disappears in one of the two.
`public/icons/<tab>.png` is alpha only and `.tab-glyph` fills it with
`currentColor`. `tools/build_icons.py` normalises them; the `--icon` url is
built ABSOLUTE in Rail.jsx for the reason documented under `spriteUrl`.

**The variant roll lives in one function.** `rollVariant()` walks `TIER_ODDS`
**rarest first** and returns one word. They are mutually exclusive because there
is no shiny Gen 1 sprite - a Pokemon that was two of them would have no picture
to draw - and rolling commonest-first would mean the rarest tier never happens at
all. Splitting this into four `Math.random()` calls at the call site is how both
invariants get lost.

**Origin and Holo share odds on purpose, so the ladder test cannot be strict.**
check.mjs asserts `TIER_ODDS` is non-decreasing rather than strictly ordered, and
only compares MEASURED counts for pairs whose odds actually differ - asserting an
order between two equal tiers is a test that fails on a new seed. It also pins
each tier's count to within 40% of what its odds predict over 400k rolls, because
"every tier is reachable" is not the same claim as "every tier arrives at its own
rate".

**A seeded RNG in a test has to be a good one.** The roll test used the textbook
LCG `seed * 1103515245 + 12345 & 0x7fffffff`, which overflows 2^53 in JS before
the mask lands; the degenerate sequence never returned a value below 1/4096, so
**Astral came up zero times in 400,000 rolls** - and the two-tier version of that
test had been passing on luck. `mulberry32` uses `Math.imul` throughout and
loses nothing to float precision.

**Master Balls come from THREE places now, and all three are pinned.**
`levelReward` pays one every `MASTER_EVERY` levels and `stepReward` pays one
every fifth haul, gated at `TREASURE_LEVEL`. The third is the shop.

**AND THE PRICE IS THE ONLY THING BALANCING IT.** It never fails, so it cannot
be balanced by odds; it used to be balanced by being unbuyable at all, on the
grounds that "a price is only ever a delay - grind long enough and you could
hold twenty". That is still the risk, and it is now bounded by two MEASURED
numbers rather than by refusing to have the conversation:

- **Floor.** The cheapest honest route to a rate-3 legendary measures ~¥1,500
  (Timer Balls at their best case). The Master Ball must cost a large multiple
  of that or it IS the cheap way to catch a legendary and the whole ball ladder
  inverts. At ¥50,000 it is 34x.
- **Ceiling.** It must stay reachable. The best map nets ~¥42 a head and a
  50,000-step playthrough is ~3,500 encounters, so it is 34% of everything a
  whole game earns. **A ball nobody can afford is the unbuyable one again,
  wearing a number.**

Both are computed in check.mjs from the live tables, not typed in, because they
move whenever the economy is retuned. Retune `SELL`, the ball prices, the
encounter rate or `fleeChance` and re-read what it prints.

**The step reward is still counted, never priced.** `worth` in the steps suite
sums the three priced balls by hand and leaves the Master Ball out, which was
right when it had no price and is still right now that it has one: what walking
pays is a count, and folding a ¥50,000 item into that total would make a step
budget approve anything.

**A variant is its own row in the Box, and its own hero.** Rows key on
species AND variant. That is a UI change with a logic tail: `feedable(box,
row, want)` takes which variant is evolving - `ANY_HERO` (the old "rarest
present", still the default), `null` for the ordinary pile, or a tier name -
and `evolveState`/`feedSelection` thread the same `want`, or a row says READY
over a feed it cannot assemble. The FEED is untouched and must stay so: it is
`!keeper`, so no variant is ever eaten no matter who is evolving. `ANY_HERO`
is the string `"*"` rather than `undefined`, because the other two answers are
a tier name and `null`, and `undefined`-means-any next to `null`-means-ordinary
is one typo from evolving the wrong Pokemon.

**Counts that said "species" now count rows.** Three Pidgey rows are still one
Pidgey - `speciesCount` is a Set over `g.species`, and the sell-all dialog
counts what is kept as `box.length - spares` rather than the row count.

**No rare tier is ever taken by a bulk action.** `duplicateUids` (sell spares) holds
shinies out of the spare list *entirely* rather than sorting them to the front —
sorting only ever protects the first `keep` of them - and `feedable()` excludes
them from the feed while preferring one as the **hero**, which is the one that
survives and comes out the far side still shiny, or still Astral. Both are
one-button actions with no undo, and at these odds there is no farming another.
**`keeper()` is the single predicate** for it, and check.mjs runs every one of
these cases over a `TIERS` list rather than naming two of them: two answers to
"which ones are precious" is exactly how a third tier ships protected from the
sweep and not the feed. Adding a fourth means adding it to `keeper()` and to
that list, and nowhere else.
`evolveState` and `feedSelection` both count through `feedable()` for the same
reason: two counts of the same pool is how a panel comes to say READY over a
feed that cannot be assembled. **A test for this needs TWO shinies** — both of
these tests passed with the protection deleted when written with one, because a
lone shiny is kept by the reserve anyway and a lone shiny is always the hero.

**Walking pays, and `stepReward()` is pure so both sides can call it.** The
engine grants the balls in `onArrive`; the top bar calls the same function on the
same step count to float the `+N`. One function, not a number passed around, so
the two cannot disagree. Only every tenth parcel raises a banner - a 3.2s overlay
every half minute of walking is an interruption. It is also the easiest reward in
the game to make accidentally infinite, so check.mjs pins the cadence, the
scaling, that ordinary parcels never pay Ultras, and the 50,000-step total.

**Medals are derived, never listed.** `medals.js` builds all 80 from the
evolution graph, the type lists and the biome tables, so a new species or a new
map grows the set with nothing edited by hand. `medalsFor()` is indexed by
species — registering a Rattata looks at the four medals that mention Rattata,
never at all eighty. `state.medals` banks the ids so nothing can pay twice, and
check.mjs walks a whole dex asserting every medal fires **exactly once** and
prints the total payout, because a reward table is exactly the sort of thing
that grows a zero by accident.

**A SAVE THAT FAILS TO LOAD MUST SURVIVE THE SESSION THAT COULD NOT READ IT.**
`loadState` catches everything and falls back to `freshState()`, which is right
— a save you cannot read should not stop you playing. What was wrong is what
happened NEXT: the first step called `save()` and wrote the fresh state straight
over the file that had failed. One bad parse and a real collection was gone,
with nothing anywhere to recover from and no message saying so. It has now cost
two.

Three keys, and the other two exist because of that. **BROKEN** is the raw text
of anything that failed, kept verbatim by `stash()` on EVERY failure path and
never parsed — the one thing you want from a file you cannot read is the file.
**BACKUP** is the last save that loaded cleanly, written at LOAD time and not at
save time, so it is always a whole previous session rather than a copy of
whatever went wrong a moment ago. `recoverable()` is what the Trainer panel
reads, so the offer only appears when there is something behind it, and
`restore()` validates through `saveProblem` and reloads — the same path
`importSave` takes, for the same reason.

It does not take a bug in this file to trigger it: a dev server hot-reloads a
source edit the moment it is typed, so a half-applied change to the save shape
is live in an open tab before it is finished. tools/play drives a real session
over a truncated save and asserts the overwrite HAPPENED (or the test proves
nothing) and that the original survived it anyway.

**One validator for a save, wherever it came from.** `saveProblem()` is used by
both `loadState` (localStorage) and `importSave` (a chosen file). It is
deliberately shallow — anything merely odd is repaired by `loadState`, because a
save that is strange should still open; what it rejects is a file that was never
a save. `importSave` writes and reloads rather than swapping state in place: the
engine closes over the map rows and their dimensions, and a reload is the one
path that is certainly consistent.

**`normalise` IS FOR ONE-BIT ROWS; THE DEX IS THREE-VALUED.** `padDex` for the
dex, `normalise` for the tier rows. They are the same function one value apart,
and using the wrong one demotes every CAUGHT species in every save to SEEN - it
shipped to a dev server for twenty minutes and cost a real collection.
`repairDex` puts back what a save can still prove: anything in the BOX was
caught, and any registered VARIANT was caught (tier rows are one-bit, so they
could not be damaged). It only ever raises a 1 to a 2. **A source edit reaches a
running dev server immediately - a save-format change is live the moment it is
typed, not when it is committed.**

**A DEX ID IS NOT AN ARRAY INDEX.** `speciesById(id)` for the species,
`dexIndex(id)` for its POSITION - which is what `dex` and every per-tier byte
row are keyed on. `SPECIES[id - 1]` and `dex[id - 1]` are correct only for a
contiguous 1..N dex, and Gen 3 does not ship: ids run 1-251 then 387-493 across
358 entries, so every Sinnoh catch was writing off the end. Both lookups are
Maps, built once, because the Dex grid asks per cell per render. **Gen 3's
absence is deliberate** - a contiguous dex hides this entire class, so the hole
is the test.

**A GENERATION INSERTED IN THE MIDDLE MOVES EVERY POSITION AFTER IT.** A save's
`dex` and every per-tier row are keyed on POSITION in `SPECIES`, which is
correct, compact, and survives exactly as long as nothing is inserted before the
end. Hoenn is inserted before the end: position 251 was Turtwig and is now a
Hoenn species, so a save loaded by position shows every Sinnoh Pokemon somebody
ever caught as a different one — silently, with no error anywhere.

**Padding is right for a generation APPENDED and wrong for one INSERTED.**
`LAYOUTS` records every shape `SPECIES` has shipped in, `layoutIds(len)` returns
the ids that shape was keyed on, and `remap()` rebuilds the row BY ID. Add a
generation anywhere but the end and add its old layout there, or the next hole
is silent.

**And `repairDex` takes the REBUILT rows, not the save.** It recovers caught
status from the box and from registered variants, and reading `s[tier]` meant
reading OLD positions into a NEW dex: a shiny Turtwig at old position 251 marked
whatever now sits there as caught, which after Hoenn is Treecko. The box loop is
safe either way because a box entry carries its species id; the tier rows are
not. tools/play loads a real pre-Hoenn save through `loadState` to prove it.

**Kanto is the first 151 positions of `SPECIES`, and saves depend on it.** A
save written before Johto keyed its bytes by `id - 1`; padding it works only
because position and `id - 1` agree for Kanto. check.mjs asserts that alignment
- insert a generation BEFORE Kanto and it is the only thing that will notice.
`loadState` pads a short dex rather than rejecting it (rejecting deleted every
existing collection) and uses `padDex`, NOT `normalise`: the dex is three-valued
and `normalise` coerces `? 1 : 0`, which demotes every caught species to seen.

**A MAP'S RARITY MIX IS FROZEN FROM ITS OWN TABLE.** `BAND_SHAPE` is computed
per biome from `RESIDENTS` - the hand-written rows - and `balance()` rescales
each rarity band back to it. Per map and not globally, because one global mix
would flatten Tall Grass (78/13/5) and the Haunted Tower (18/51/30) into the
same map and that difference IS the design. Measured before it existed: adding
Johto and Sinnoh TRIPLED Tall Grass's rare band, 5.1% -> 15.4%, because
newcomers arrive on a flat tier weight while the Gen 1 commons are hand-tuned
at 22.

**A derived evolution is banded with its PARENT, and the band travels the whole
chain.** Slot 3 of a row is the band it competes in. Banding by its own tier
splits Tangela (B) from Tangrowth (A) and rescaling then makes the evolution
commoner than the thing it evolves from; carrying it only one step fixes that
pair and leaves Mareep -> Flaaffy -> Ampharos broken. Inside one band the scale
is uniform, so `parent x EVO_SHARE` survives exactly. `BAND_FLOOR` is what stops
a band with no Gen 1 members (Rock Ridge has no S-tier) from giving a newcomer a
zero weight and making it unreachable.

**The guarantee is about RESIDENTS, not the whole table.** The evolved-form
overlay is supposed to enrich a map as you level, so check.mjs measures the mix
with depth-tagged rows filtered out - counting them would assert that the
feature does not work. Residents hold to half a point; the overlay moves meadow
to 69.8/18.2/9.6 and that is progression.

**THREE FIELD FAMILIES, THREE LEVERS, AND NO TWO ON THE SAME ONE.** `repel`
scales how OFTEN an encounter happens, `rarity` (the White Flute) moves WHICH
SPECIES through Fortune's own exponent, `variant` (the honeys) moves WHICH TIER
through the variant roll. That separation is the whole answer to "three things
reshaping one table need one rule, not three" - nothing here invents a
mechanism, each borrows one the game already had. check.mjs asserts every item
declares exactly ONE of `rate`/`tilt`/`lift`, that a family never mixes two, and
that no two families share one; two families on one lever are one family with
two names. **A new field item belongs to a family or it needs a new lever.**

**`state.field` IS KEYED ON THE FAMILY, NOT THE ITEM ID.** That is what makes
"one of each kind at a time" structural rather than a rule somebody enforces: a
Max Repel replaces a Repel by being written to the same slot. Keyed on the id,
two honeys could run at once and "what are the odds" would have two answers.

**ONE EXPONENT DECIDES HOW RARE THE WORLD IS, and `tilt` is a NUMBER.**
`rarityPower(stats, tilt)` is the only thing in the game that reshapes an
encounter table by rarity: Fortune is a permanent investment in it and a White
Flute is four hundred steps of one. They are the same number rather than two
transforms stacked on one table, and the pile-up being guarded against is a
second `w ** q` pass ANYWHERE. **Never add one.** The test has no literal in it:
if the flute IS Fortune's exponent then what it is worth cannot depend on your
Fortune rank, so check.mjs asserts the delta is the same at every rank. A
second transform would compound and fail it.

`RARITY_FLOOR` is insurance against a future retune, not a description of this
one: maxed Fortune plus a flute is 0.45 against a floor of 0.4, so the clamp
never fires today. Its assertion is therefore written against the CONSTANT -
`22 ** RARITY_FLOOR > 2` - because what it exists to catch is somebody moving
the coefficients above it. At exponent 0 every row in the table is worth the
same and rarity stops existing.

**REPEL IS ON ITS OWN AXIS AND MUST STAY THERE.** check.mjs asserts the word
`repel` appears in the CODE of neither `trainer.js` nor `biomes.js` - comments
stripped first, because the prose should absolutely name it and the first
version of that assertion failed on the comment explaining the rule. Crude, and
exactly right: the failure it guards is somebody giving it "a small table
effect too".

**A COLOURED HONEY IS THE JAR PLUS THE TIER'S OWN TREATMENT.** `art: "honey"`
points all four at one picture and `tier` is what makes a Holo Honey look like
a Holo - the same foil, the same layer, masked to the jar instead of a
creature. So `ItemIcon` is the one thing that draws an item (shop shelf,
floating rail, effect readout) and `artOf(item)` is what knows they share art:
the sprite assertion goes through it, or three correct items fail for missing
files that should not exist. Adding a fifth tier adds its honey for free.
**There is deliberately no Origin honey** - Origin is gated on catching every
ordinary Pokemon of a generation, and an item that shortcuts a gate is the gate
deleted. check.mjs asserts that absence, so it reads as a decision.

**BOUGHT IS NO LONGER USED, and the reversal is the note.** These were
buy-and-start in one click with no inventory, which was right while there were
two of them and wrong the moment there were eight: you cannot carry a Max Repel
for the cave you are about to enter if buying it starts it in the field you are
standing in. They are ordinary bag items now - same shelf as the balls, same
`buy()` - and `useField(id)` spends one out of `state.bag` and charges nothing.
It ASSIGNS the step count; `+=` would make the price of a long effect the price
of a short one typed twice. Steps, not seconds, so an effect is not burned by
walking away from the keyboard. The readout sits opposite the minimap, because
an effect paid for in steps belongs where the steps happen.

**RESIZE THE CANVAS, NEVER THE CREATURE.** `normalise()` in build_origin.py
puts Sinnoh's 80x80 HGSS art on the 64px canvas everything else uses, and its
first version cropped to the art's bounding box and scaled THAT to fill - which
does put every sprite on the right canvas and destroys relative size doing it.
Measured: Gen 1 and Gen 2 fill a median 0.73 of their canvas (a Caterpie is
small, a Snorlax is not) and every Sinnoh sprite came out at 1.00. Reported from
play as a Piplup drawn the size of a Dialga, which is exactly what it was. The
raw art already carries the scale - Piplup fills 0.44 of its 80px canvas and
Dialga 0.99 - so the only correct operation is a uniform canvas resize.
build_origin.py asserts the median fill and the completely-full count now,
because nothing measured relative size and the numbers all looked fine.

**A BERRY MOVES ONE ROLL, AND THE THREE MOVE THREE DIFFERENT ONES** - the same
test the four situational balls had to pass. `effect` names which (`catch`,
`flee`, `xp`) and `per` is what one of them is worth, so two berries moving one
number are one berry with two prices and check.mjs can say so directly.

**FEEDING THE SAME BERRY AGAIN DEEPENS IT; A DIFFERENT ONE REPLACES.** The
encounter holds `{ id, stage }`, not an id. The first version replaced in both
cases, so a second Razz was worth exactly nothing - and the long encounter that
needs help is precisely where doubling down should be possible. **A berry at its
cap is REFUSED, not eaten**: "cannot stack" should cost a click, not a berry,
and `berryRoom()` is the single answer that both the tile greys on and
`useBerry` refuses on, so the two cannot disagree about a wasted berry.

**A NANAB IS A LOCK, NOT A DISCOUNT.** `per: 1, stages: 1` takes the flee
multiplier to zero: a Pokemon that has eaten one does not run, full stop. It is
the strongest single thing any item does here and is priced at the top of the
berry band because of it - the thing it is for is the legendary that keeps
getting away, where the alternative is losing the encounter outright. Asserted
as an absolute (`berryCalm === 0`, and 2,000 real `resolveThrow` rolls) rather
than as "lower", because "lower" is what it used to be.

**USING SOMETHING HAS TO LOOK LIKE USING SOMETHING.** A field item's only
feedback was a chip in the far corner of the screen and a berry's was a line of
text in the same box every other message uses - so on a fast click neither read
as "that worked", and the honest failure is feeding a second one because you are
not sure the first landed. The rail tile pops and the berry itself tosses into
the encounter. Both are keyed on a COUNTER, not a flag: `e.ate` is bumped on
every feed, because remounting is the only way to restart a CSS animation and a
flag that is already true cannot say "again". The pop only plays when the engine
actually spent one - an animation that fires when nothing happened is worse than
none, because it is a lie about state.

**THE WORLD'S CLOCK RUNS ON STEPS, NOT ON `new Date()`.** A real clock means a
player who plays at lunch never sees night, never meets the one condition the
Dusk Ball exists for, and is told about a feature they cannot reach - which is
the complaint Gold and Silver actually got. Steps are a counter the game already
keeps and already saves, so everybody sees the whole cycle in the order it was
designed. `clock.js` is pure for the same reason `daily.js` is: check.mjs walks
a whole day without waiting for one.

**THE PHASE IS FROZEN ONTO THE ENCOUNTER**, exactly like `known` and `areaId`
and for exactly the same reason - a ball that read the clock at throw time would
change value because you took a step mid-animation. `items.js` reads `enc.night`
and must NEVER import the clock; check.mjs asserts both halves, because a live
read is invisible from the outside.

**A CAVE IS DARK ROUND THE CLOCK.** The Dusk Ball is boosted at night OR in an
`ENCLOSED` area, and those must not collapse into one condition: drop the cave
case and "night and caves" is only "night", which costs the ball half of what
makes it different from the other three. The phase tints skip the enclosed areas
for the same reason - what is overhead there never changes.

**`data-phase` GOES ON THE SAME ELEMENT AS `data-area`.** The phase overrides
the area's `--sky`, and a custom property only inherits downwards: `.battle-sky`
is a SIBLING of the field, so a phase set one level lower would never reach it.
That is the exact mistake the area colours made once.

**TODAY'S QUEST LIVES IN THE TOP BAR.** It was on the YOU tab behind a `!` on
the tab badge, which is a fine place to read it and a bad place to discover it -
reported as "I am not sure where to see the missions", which is the whole
verdict on a feature one tab deep behind a dot. The top bar is the only thing on
screen in every state of the game. There is ONE card: `Missions` in TopBar.jsx
renders `Daily.jsx`, the same component the rail used to, rather than a second
smaller copy that would drift - and the claim moved to App.jsx with it, because
two places to claim from would be two sources for one number.

**THE LEGENDARY MARK IS NOT A TIER**, and it is kept out of the row of tier
marks for that reason: those are four things you can earn and this is a fact
about the species, so sitting among them it would read as a fifth tier. It goes
beside the name on the nameplate and in the opposite corner of a Dex tile - and
only on an entry you have at least SEEN, because spoiling which silhouettes are
the legendaries hands over the most interesting thing the grid has left to say.
`build_marks.py` generates a placeholder and says so loudly until the drawn one
lands at `.assets-src/marks/legendary.png`.

**A RAZZ BERRY GOES THROUGH `liveMult`, NOT THROUGH `resolveThrow`.** (At every
depth - check.mjs sweeps the full stack against every catch rate in the dex.) That is
the load-bearing half: `liveMult` is the single answer to "what is this ball
worth against this Pokemon", the engine rolls with it and the rail prints it,
so a berry applied anywhere else would make the rail advertise 3.0 over a throw
that quietly used 4.5. Going through the ball also means going through
`catchChance`'s own ceiling, so no berry can push anything to certainty and the
ball ladder cannot invert - check.mjs sweeps every catch rate in the dex for
both. The Master Ball is exempt: it is already past certain.

**`fleeChance`'s `calm` is a MULTIPLIER, not a subtraction.** Subtracting
flattens the slope this function exists to have and takes the commonest species
below zero. A multiplier reaches 0 cleanly, which is what lets a Nanab be a
lock, and it is worth most exactly where a berry gets spent.

**A DAILY QUEST MUST BE FINISHABLE IN THE MAP YOU ARE STANDING IN.**
`QUEST_TYPES` is derived from the STARTING map by weight share (>= `QUEST_SHARE`
of Tall Grass), not from a biome's `types` list - the first version used the
list and asked for four Dragon-types, of which the entire game holds two. Six
types qualify. Everything in `daily.js` is pure and takes the day key as an
argument, which is the only way to test something keyed on the date without
waiting a day, and is why it is written that way: `dailyFor(key)` hashes the
key, so a quest cannot be rerolled by reloading. The streak caps at
`STREAK_CAP`; uncapped, day sixty is worth more than the first fifty together
and missing one leaves nothing to come back for.

**Legendaries are a SHARE of the table, never a fixed weight.** `LEGEND_SHARE`
is 1% of whatever the table comes to, split by type match, added by
`encounterTable` after the residents and the evolved overlay - so it cannot be
in `BIOMES[i].table`, and `foundIn`/check.mjs read the assembled table instead.
Fixed weights survive exactly one dex size: 5 legendaries became 24 and the
tables tripled, which would have multiplied the rate by five. Adding a
generation, a legendary or a map now moves nothing.

**A generation ARRIVES, and `GEN_UNLOCK` IS DERIVED FROM `GEN_LAST`.** Gen 1
from the first minute, then one every `GEN_STEP` (5) levels from `GEN_FIRST`
(10): Johto 10, Hoenn 15, Sinnoh 20, and the five that have not shipped already
paced through Paldea at 45. Filtered inside `encounterTable` by the level it
already took, so it is a filter and not a mechanism.

**Derived, because the default is the dangerous one.** `genOpen` treats a
generation with no entry as open from the FIRST minute - right for a hole in the
dex, and exactly wrong for a generation somebody forgot to add a gate for. A
table would have to be remembered on the day Unova ships; this cannot be.
check.mjs asserts one gate per entry in `GEN_LAST`, that they climb, and that
the last lands under `MAX_LEVEL` - the same shape as `MAP_LAST < MAX_LEVEL`,
and what pins `GEN_STEP`: at 8 the ladder runs to Lv 66 and the last three
generations ship unreachable.

**THE LEVELS CAME DOWN FROM 22/28/35, AND HALF THE ARGUMENT FOR THEM WAS STALE.**
They were justified by "every weight in `RESIDENTS` would be quietly halved",
measured back when adding Johto and Sinnoh tripled Tall Grass's rare band
(5.1% -> 15.4%). That was before `BAND_SHAPE` and `balance()`. Measured now,
Lv 1 to Lv 50 in Tall Grass: the C band moves **78.2% -> 71.8%** and the S band
**3.2% -> 3.3%**. The mix those levels were defending is already defended, by
the thing whose job it is.

**What a generation actually dilutes is one species' FINDABILITY**, and that is
the number to watch when this moves: Pidgey, the weight-22 anchor of the
starting table, goes 12.4% of encounters at Lv 1 to 5.4% at Lv 50. A daily quest
and a specific hunt both feel that, and nothing else measures it. It is why the
ladder is spread rather than front-loaded.

**Origin is DEBUT artwork, not Gen 1 artwork.** `DEBUT` in build_origin.py maps
each range to its own source set - Yellow/Red-Blue for Kanto, Crystal/Gold for
Johto. Reading the tier as "the Gen 1 sprite" would have left 207 of 358
without one. Every sprite - ordinary, shiny, Origin - is normalised to a 64x64
canvas; Sinnoh's HGSS art is 80x80 and is reframed, or it is simply a different
SIZE from everything beside it in a row.

**BUT DEBUT ARTWORK IS ONLY A TELL WHILE IT IS OLDER, and for a third of the
dex it is not.** Sinnoh shipped with Diamond/Pearl as its Origin and that was
wrong: our ordinary Sinnoh sprite is HeartGold/SoulSilver, both are Gen IV, and
one of the three fallbacks was literally the base sprite. Reported from play as
"the Gen 4 Origins look the same as the normal ones", which was exactly right.

Measured, per sprite: **a Kanto or Johto Origin uses a median of 4 colours
against the ordinary art's 13** - that is the Game Boy and Game Boy Color
palette, and it IS what reads as ancient. Sinnoh gave 13 against **14**. Not
older, and not even fewer.

So `hasOrigin(id)` is `genOf(id) < baseArtGen(id)` - **a species can wear Origin
only if it debuted in an older generation than the one its ordinary art comes
from.** Derived, not listed, which also settles Hoenn before it ships:
Ruby/Sapphire and FireRed/LeafGreen are both Gen III, so a Hoenn species gets
no Origin either, and nothing has to be edited on the day. `ART_GEN` is the one
place saying where base art comes from and check.mjs asserts it against
`artFor()` in fetch-species.mjs, because two copies would drift the day a base
set changes and the symptom would be Origins that are the same picture.

**`tiersFor(id)` is what both the Dex grid and the sheet count through**, and
it exists because the completion rosette would otherwise have become
IMPOSSIBLE for 107 species rather than merely hard - the one mark in the game
that is supposed to be earnable by playing long enough. A Sinnoh entry drops
the Origin column from FORMS entirely rather than showing a silhouette nobody
can fill: a slot that cannot be earned reads as a bug in the collection.

**A MEDIAN OVER THE WHOLE DEX HID A FAULT IN A THIRD OF IT.** The first palette
assertion in build_origin.py compared medians, and putting the Gen 4 set back
left the median at 4 - 251 four-colour sprites outvote 107 fourteen-colour
ones. It is **per sprite** now, and two assertions catch different halves: the
relational one (fewer colours than this creature's own ordinary art) catches 92
of the 107, and `PALETTE_MAX` catches the rest. That bound is measured, not
picked: Kanto's worst is 7 and Sinnoh's best is 8, so the two sets do not
overlap anywhere.

**Every non-level evolution method is `bond`.** Happiness, time of day, a held
item on a trade, a move, a place: a game with no clock, no moves and no map
transitions cannot express any of them, and a per-method table grows every
generation. `evoLevel` gives the row a synthetic level from its parent, so a
third of Johto needed no new code. **But a `stone` row needs its stone ON THE
SHELF** - check.mjs asserts `STONES` against `EVOLUTIONS` both ways, because an
unbuyable stone is not a hard evolution, it is an impossible one.

**A generation is derived from the dex id.** `GEN_LAST` in `biomes.js` holds the
last national dex number of each generation and `genOf()` reads it; nothing is
stored per species, because it already is a fact about the id and 151 copies of
"1" is not data. The chip goes on the encounter nameplate now, while Gen 1 is all
that ships and it therefore says nothing — that is the point. A badge that
arrives the same day as the thing it distinguishes reads as a label; one that was
always there reads as information.

## The engine itself: tools/play.mjs

**Twenty-five suites tested every function the engine calls and nothing tested
the engine.** It owns mutable state behind a `requestAnimationFrame` loop and
draws to a canvas, so `check.mjs` could only ever reach the pure functions
around it - and a catch that froze mid-animation got through all of them,
because every function it called was individually correct.

`npm run play` stubs the six DOM things `createEngine` touches (canvas,
`localStorage`, `performance.now`, `requestAnimationFrame`, `document`,
`Image`) and drives the frame clock BY HAND. That fake clock is the whole
trick: `tick(ms)` advances `performance.now()` and runs exactly the callbacks
that were registered, so a 3.2-second catch animation resolves in a few dozen
synchronous frames, the run takes milliseconds, and **if the loop ever stops
asking for a frame, `tick` runs out of callbacks and says so** rather than
hanging. It walks a real map with held keys, throws real balls, feeds real
berries and starts real field items - never `startEncounter()` directly, since
that skips the code an encounter bug lives in.

It runs as part of `npm run check`. Add to it whenever a change touches the
loop, `settle`, the phase machine or the step handler.

**Do not try to do this in the browser.** `chrome-headless-shell` throttles rAF
while `--virtual-time-budget` fires timers instantly, so a seeded iframe
harness releases held keys before the engine has run one frame and the trainer
never moves - which reads exactly like "the keys are not registering". The
headless shell is for looking at the DOM and at pixels; the engine is for Node.

**AN IMPORT CAN BE SHADOWED BY A LOCAL, SILENTLY, AND IT FROZE EVERY CATCH.**
`engine.js` imports `advance` from `daily.js` (quest progress) and
`createEngine` declares its own `function advance(now)` for the phase machine.
Because the local one is inside the closure it SHADOWS the import instead of
colliding with it - no syntax error, no warning, and `noteDaily` called the
phase machine instead of the quest counter. That re-entered `settle`, which
called `noteDaily`, which called `advance`: a catch died of a stack overflow
the instant the ball stopped shaking, and what a player saw was the animation
freezing before the Gotcha. It is `advance as advanceGoal` now. **Alias
anything imported into a file whose name a local function might reuse** - the
existing `reward as dailyReward` on the same line is the pattern, and it was
aliased only because `reward` obviously clashed.

## QA findings worth keeping

Four defects a pass over the whole app turned up. All fixed, and all the sort a
screenshot cannot show you.

**Window key listeners play the game while you type.** The Dex and Box both have
a search field and the handlers are on `window`: typing "pidgey" walked the
trainer, `b` got on the bicycle, `f` cast a rod into the grass, and shift for a
capital broke into a run - encounters started while you were looking something
up. `typing(ev)` in `App.jsx` bails on INPUT/TEXTAREA/SELECT/contentEditable.
**Key releases are deliberately NOT gated**: releasing a key that was never
pressed is a no-op, but missing a release because focus moved mid-stride leaves
the trainer walking on his own.

**A rule enforced in one of two places is not a rule.** `duplicateUids` refused
to put a shiny in the sell-spares list, and then the Box computed a second list
of its own - `held`, for "sell what an evolution is saving" - which sorted by
level and took all but the highest. So a shiny at Lv 2 behind an ordinary one at
Lv 30 was the single thing that row offered to sell, labelled "1 x Rattata". One
click, no undo. It is `heldUids()` in `items.js` now, beside its sibling, where
check.mjs holds both to `keeper()`.

**An effect cleanup can cancel the thing it was meant to finish.** The floating
money delta set a timer to remove itself and returned `clearTimeout` as cleanup,
so the next change to money cancelled the *previous* delta's removal: every one
but the last stayed on screen for the rest of the session, stacked on one spot,
and the array grew with it. Pruning by age on insert makes it self-healing and
the timer only has to clear the last one.

**A margin that belonged to the row was on one button.** `.sheet-close` carried
`margin-top: 18px` from when it was the only control on the dex sheet. Put in a
flex row beside SEE IN BOX, that margin pushed CLOSE down while its
`align-items: stretch` sibling grew to the full line height - so SEE IN BOX came
out as a tall square next to a short wide bar, with its label wrapped over two
lines for good measure. The margin is the ROW's now, the label is `nowrap`, and
both buttons measure 45px high on the same baseline. **When two things in a flex
row are different heights, look for a margin that predates the row.**

**Unseen dex cells fetched a sprite in order to hide it.** Every cell rendered an
`<img>` and `.cell.unseen img { opacity: 0 }` hid it - a screenful of requests on
a fresh save, for pictures nobody sees, with the answer in the DOM. `grid-auto-rows`
fixes the row height, so a cell keeps its shape with no image in it at all.

## The rail's panels

**One control for search, filters and sort.** `FilterBar` is a search box plus a
list of `<select>`s, and both the Dex and the Box pass it a different list - so
they cannot drift apart, which is what a shared control is for. It was a row of
counted chips, and chips ran out of room at the second axis: seven of them across
a 360px rail were 8.5px tall, and there was nowhere to put "fire-types" or "by
name" at all. A closed select is one line however many options it holds, so an
axis now costs nothing on screen, and the counts moved into the option labels
where they were always most useful.

Native `<select>` deliberately: one element, keyboard- and screen-reader-correct
for free, and the platform's own picker on a phone. The whole row sits in a
`<details>` that says what is filtered while closed, so collapsing it hides
nothing.

**The Dex grid is four columns, not auto-fill.** A tile carries a sprite, a
number, up to three variant marks and a completion badge; at the ~52px auto-fill
produced they fought for the same corner. Four fixed columns give ~76px.

**The marks are shapes, not just colours.** Origin is a ring, shiny a four-point
star, Holo a hexagon, Astral a diamond - a row of four coloured dots is
unreadable to anyone who cannot separate the colours, and these stay distinct in
greyscale. They are drawn art now, normalised by `tools/build_marks.py`. The
completion rosette is `.cell-full`, and it is the only mark in the game that
cannot be had by playing long enough: it needs the ordinary catch **and** all
four variants of one species.

**`build_marks.py`'s contact sheet is a fact about a drawing, not a list of
tiers.** `complete.png` splits into the four icons it was drawn with, in that
order; `SHEET_ORDER` therefore does NOT grow when a tier is added, or every
column silently re-maps. A new tier arrives as its own single file, and a single
file always beats the sheet. Missing art generates a placeholder and says so
loudly - a 404 on a Dex tile is worse than a plain icon.

**A WILD LEVEL IS A PRICE, NOT ONLY A FLAVOUR.** Evolving costs
`evoLevel - level` in candy, so `wildBand` sets what an evolution bought with
what you catch there COSTS. That is why `WILD_STEP` is 0.5 and not 1: at a full
level of band per level of map gate the ladder ran 2-7 to 21-26 and the late
maps handed out free evolutions 45-50% of the time, which is the flat-candy
failure seen from the other side - one map becomes strictly best and the other
seven are scenery. Measured across every biome table before choosing. check.mjs
pins a 15% ceiling on the free share in any map, because every number stays
monotone while this goes wrong and nothing else would say so. **Retuning the
band or the map ladder means re-measuring that share.**

`bornLevel` is still the floor and still wins: a wild Venusaur is a Lv 32
Venusaur wherever you meet it, and the band can only lift a Pokemon above its
own floor. The `+ 2` on that floor is why an evolved form is not pinned to
exactly its own threshold.

**A SIZE IS STORED, AND OLD SAVES HASH THEIR UID.** `species.js` has carried
`height` and `weight` since the first fetch and nothing read them; `measured()`
does, scaled by this individual's own roll, so two Rattata are 0.22m and 0.38m.
The roll happens ON THE ENCOUNTER and is copied to the box entry - both halves
are needed, and the failure if the copy is dropped is silent in the worst way:
the enormous Rattata you threw six balls at is an ordinary one in the Box,
because `sizeOf` falls back to the uid hash when nothing was stored. tools/play
asserts it survives a real catch for exactly that reason.

That fallback is what stops a pre-size save being a box of identical creatures,
and it has to be stable, in range and SPREAD - a fallback returning one number
is the thing it exists to avoid. Stored as a small integer, because it goes in
every box entry. **Weight scales with the CUBE of the size**, because that is
what volume does; halving it to make the number look tamer would be printing a
measurement that is wrong.

## One tooltip, and it is an attribute

**`data-tip="..."`, never `title="..."`.** `Tip.jsx` renders ONE element at the
app root and a single set of listeners fills it from whatever is hovered or
focused. Every tip in the game is therefore the same object, which is the whole
point: the native `title` takes about a second to appear, cannot be styled at
all, and is most often explaining text that has been CLIPPED - which is how the
shop shipped descriptions cut off with the rest behind a tooltip nobody waits
for.

**A wrapper component was the other option and it loses on the case that
matters.** The shop and the ball rail are inside `overflow: hidden` scrollers,
so a bubble rendered beside its trigger is clipped by the trigger's own
container. The singleton is `position: fixed`, so nothing can clip it, and
converting a call site is one word with no layout consequence.

Three things to know when adding one:

- **Anything labelled ONLY by its title needs an `aria-label`.** A native title
  is an accessible name for free and `data-tip` is not. Controls with visible
  text or an `alt` already have theirs; an icon-only button does not, which is
  why the rail's kit tiles carry one.
- **A `title:` KEY IN A SPREAD is not a `title=` attribute**, and the sweep that
  converted all twenty-five call sites missed exactly one for that reason - the
  ball rail's tab builds its props in an object literal. Grep for both.
- `pointer-events: none` on `.tip` is load-bearing: a bubble under the pointer
  eats its own hover and flickers forever.

**The shop's description slot fits 27 characters**, measured off a rendered row
at the tightest it ever gets (169px, next to "you have 12") rather than
estimated - the same mistake the 21-character ball hint made, for the same
reason: the count's digits share the line. `BLURB_FITS` in check.mjs pins it.
A stone's blurb is a list of species names and overruns by design; that is what
the tooltip is for, and it is why the bound applies to blurbs we WRITE.

## The shop opens as you level

**It used to show everything, always** - greyed, with the level printed where
the price goes, on the argument that "nothing is hidden, because a wall you can
read is a goal". That was right when the shop was nine items. It is
twenty-seven now, and at level one twenty-four of them are grey: the wall
stopped being a goal and became the shop.

`onShelf(items, level)` returns everything you can buy plus the NEXT thing to
open, and a count of the rest, printed once under the shelf. The original
argument survives intact - one wall you can read, instead of a row of them.

**Order is preserved rather than sorted**, and that is not cosmetic: `FIELD` is
grouped by family (three repels, then the flute, then four honeys) and is
deliberately NOT in level order, so appending the next unlock at the end would
move an item out of the family it belongs to. The next goal is found by level
and then shown where it already sits.

## Balls

**`liveMult(ball, enc)` is the single answer to "what is this ball worth".** The
engine rolls with it and the rail draws with it, so the number on screen is the
number that was used - the alternative is a rail advertising 3.5 over a roll
that quietly used 1.0, which is unfalsifiable from the outside. It takes the
WHOLE ENCOUNTER, not a hand-built context: every field a condition needs is
already on it, and a second shape to keep in step is a second thing to forget.
No encounter means no condition can hold.

**Everything a throw depends on is frozen when the Pokemon appears.** `known`,
`areaId` and `types` are copied onto the encounter, never read off `state` at
throw time - settling a catch registers the species, so a live read would make a
Repeat Ball change value halfway through its own throw.

**`boost` is a headline and `bonus()` is the truth**, and check.mjs holds them
together: no `bonus()` may exceed its `boost`, and each must actually reach it
over a sampled set of encounters. A headline the ball cannot deliver is the
worst bug available here, because nothing about it looks wrong.

**Price a ramp by simulating it, never by its cap.** The Timer Ball at 140
looked fine beside its 4x cap and measured out at 606 a head - the most
expensive ball in the game - because every throw on the way up is paid for at
full price and most are worth about 1x. `perCatch()` in check.mjs walks the
throws; the flat `ballsPerCatch()` is only correct for a ball with one
multiplier.

**The plain ladder and the situational balls need different assertions.** Poke /
Great / Ultra must climb in mult, price AND level. A situational ball is
deliberately CHEAPER than the Ultra it beats, so including it in that loop
asserts the opposite of the design. `PLAIN_BALLS` exists for exactly this.

**No new ball may out-earn grinding with Poke Balls.** Rares are already mildly
profitable with the cheapest ball and always were - that is the grind, paid for
in time. The invariant is relative, not absolute, and is measured at each ball's
best case.

**Four conditions must key off four different systems**, asserted by comparing
the pattern of answers each ball gives over every sampled encounter - two balls
boosting on exactly the same encounters are one ball with two prices. The Nest
Ball and the Dive Ball were rejected on this: every wild level here is 2-7, so
Nest is a flat ~3.5 everywhere, and everything on a rod is Water, so Dive is the
Net Ball again.

**A ball hint is 16 characters.** The shop prints "x3.5 " plus the hint opposite
"YOU HAVE N" on one line and clips it. The first limit written here was 21,
measured off a hint that fitted - next to "YOU HAVE 5". The same 21 characters
clipped next to "YOU HAVE 14", because the COUNT'S DIGITS share the line. 16
leaves room for a three-digit stack.

**`tools/fetch-items.mjs` holds a second list of ball ids** and the two drift
silently, so check.mjs asserts every item in `ALL_ITEMS` has a
`public/items/<id>.png`. That script also used to throw on the first 404 and
`running-shoes` - which is not an item in this game and has no PokeAPI sprite -
sat in the middle of its list, so it died there every run and the three rods
below it were never fetched. Misses are collected and reported together now.

**The throw animation is a 32-frame strip per ball**, sliced by
`tools/build_balls.py` from Anarlaurendil's sheet (CC BY 3.0, credited in
README - that credit is the licence, not a courtesy). Four facts about it that
are not visible in the CSS:

- **The column order is the artist's, taken from the artwork description.** A
  pass that tried to identify the 28 columns by matching colours against our
  PokeAPI icons was checked against the four nobody can get wrong - Poke,
  Great, Ultra, Master - and got two. Two red-and-white balls and four blue
  ones is where a guess ships a Net Ball that throws a Dive Ball.
- **Percentage `background-position` is not "scroll by p%".** It aligns the p%
  point of the image with the p% point of the box, so with 32 frames stacked
  at `background-size: 100% 3200%`, frame i sits at `i/31`, not `i/32`. A range
  a..b animates `from` a `to` b+1 with `steps(b-a+1)`, because `steps()` shows
  the start value first and never reaches the end.
- **The shake wobble is drawn into f15-f19** - they swing to x-centre 28 and
  36 where every other frame is 32 - so the element must NOT also be wobbled
  by CSS. The two compound into a lurch.
- **A duplicate `@keyframes` name fails silently, and the LATER one wins.** The
  new frame-stepping `ball-click` was added above the old transform-based one,
  so the old one overrode it and the catch played a scale-pop over frame 27.
  Deleting a replaced animation is not tidying, it is the fix.

**The thrown ball draws in front.** `.ball-slot` is `z-index: 4`, clearing the
sprite (1), the captured sprite (2) and the effect layers (3). It had none at
all, which only became a bug when `.mon-slot .mon` was given `z-index: 1` for
the Astral aura - and then every throw in the game arced behind the Pokemon.

## The minimap

**The engine draws it, React only hosts the canvas.** The camera rectangle on it
has to BE the camera; a second copy of `render()`'s clamp, computed a frame
later in a component, lags by a frame and drifts at the map edges - which is
where the clamp bites and where a player is actually looking at it.

**Terrain is baked once per area**, in `bakeMini()`, which is called at engine
start and from `travel()` and nowhere else. `rows` changing without a re-bake is
the one way this goes wrong: the map would be of the area you just left. Per
frame it is one `drawImage`, one stroked rect and two arcs.

**The palette is `MINI` in `map.js`, beside `SOLID`, because it is the legend.**
A second list of map characters anywhere else is a list that falls behind.
check.mjs asserts every character any of the eight maps uses has a colour, that
each parses as a hex colour (a typo does not crash - canvas silently reuses the
previous `fillStyle`, so one bad entry paints its tiles as whatever was drawn
before), and that **Rock Ridge's plateau and Frost Hollow's shelf are far from
their own floors**: those two levels connect only at a staircase, so painting
them alike draws a route that does not exist.

**Hidden, never unmounted.** The engine is handed the canvas once, at
`createEngine`. Unmount it for an encounter and everything after the first
encounter draws to a detached element - a dead grey box, with no error.

**The marker is a red dot under a white ring**, and the ring is the point: red
alone vanishes on lava, white alone on ice. A marker that relies on the colour
it happens to be standing on is a marker that disappears exactly where the map
is hardest to read.

## Traps

**A flex `basis` is the wrap threshold, not the final width.** The filter row
is two selects and a type swatch; at a 118px basis they summed to exactly the
rail's 330px, and the widest badge (FIGHTING) wrapped the swatch onto its own
line - which is the row the compaction existed to remove. Size a basis so the
row FITS, and let `flex-grow` do the filling. And test it against the longest
content the game can produce: a native `<select>` clips, it does not ellipsize.

**A flex item with no content shrinks first.** `.rail > .panel` is a column
flex container on a wide screen, so every child of a panel is a flex item -
and the dex progress bar, having no content, was squashed to whatever was left
after the grid took what it wanted. It was never the 9px its rule asked for.
Anything in a panel whose height IS its design - a bar, a rule, a spacer -
needs `flex: none`.

**`steps(n)` and `forwards` disagree about the end of a sprite range.** Running
`to` one frame past the end and stepping n times is right while an animation
plays and wrong when it holds: `forwards` holds the END value, which is the
frame past the range. The catch held frame 32 of a 32-frame strip and went
invisible; the break-out held frame 27, the catch's own flash. Use
`steps(n, jump-none)` and end the range on the real last frame. A looping
animation still wants plain `steps()` - a loop needs equal frames that wrap.

**Sample an animation ACROSS ITS WHOLE CYCLE before judging it.** A negative
`animation-delay` plus `animation-play-state: paused` freezes an animation at a
chosen time, so N copies of the real markup lay the whole sequence out as a
strip. Both frame bugs above were invisible in the code and obvious in one
screenshot.

**One frame is not a sample, and that cost a whole detour.** `holo-sweep` runs
`background-position: 220% -> -80%`, so a freeze at -1.1s of 3.6s catches the
band already off the element and the foil looks entirely absent. It looked like
`mix-blend-mode: color-dodge` failing on a light background - it showed on dark,
after all - and three blend modes and an `isolation: isolate` went by before an
UNMASKED layer at 0.6 opacity was still invisible, which is impossible and is
what finally indicted the harness. The glow on the dark background was Holo's
rim (three drop-shadows), not the foil. Sampled across the full 3.6s it is
plainly there. Same story for `spark`, which holds `opacity: 0` for most of its
cycle.

**`Array.prototype.sort` never calls the comparator on 0 or 1 elements**, and
that hid a crash for weeks. Box.jsx declared `const SORTS` six lines BELOW the
`.sort()` that reads it - a temporal dead zone - and the BOX tab went blank
white with "Cannot access 'SORTS' before initialization" the moment anyone held
a second species. An empty box worked. One species worked. **A smoke test on a
fresh save cannot see this class of bug**; seed a save with real content.


**One listbox, and only one.** Every other control in the rail is a native
`<select>`, deliberately. The type filter cannot be: `<option>` styling is
ignored outright on some platforms and unreliable on the rest, and that control
is entirely about the colour of its options. So it is hand-rolled, and it has to
carry what the platform was giving away free - Escape, click-away, arrow keys,
focus returned to the opener, a worded `aria-label` (a screen reader gets
nothing from a background colour), and **the modal lock**. `useModalLock()` is
the same counter `Confirm` uses and App.jsx already bails on `modalOpen()`;
without it the arrow keys walk the trainer while the menu is open. Reach for a
`<select>` for anything else.

**An effect layer is not a child of the sprite.** Every tier's extras - the
Holo foil, the Astral sky and aura and orbit, the shiny sparks, the Origin
seal - are SIBLINGS of `.mon`, so `mon-absorb` shrinking the sprite into the
ball does nothing to them. They were all gated on `!monGone`, which is only
true once something has FLED, so from the moment the ball opened they went on
playing over an empty patch of grass. Gate on `monHere` (`!monCaptured &&
!monGone`). Anything new that decorates the Pokemon has to be gated the same
way; Holo is just the one people notice, because a moving rainbow is.

**A STALL IS A STALL, WHATEVER CAUSED IT - measure it in the frame loop.**
Every deadline is an absolute `performance.now()` stamp, so time that passes
while rAF is not running has to be paid back. This was a `visibilitychange`
listener, which covers a hidden TAB and nothing else: it does not fire when you
alt-tab to another window or when the window is occluded, and Chrome throttles
or stops rAF in both - so the engine came back past every deadline with no
compensation and the phase machine fired one step per frame until it caught up.
`frame()` compares `now` against the last frame and pushes `move.startedAt`,
`encounter.until` and `fishing.until` forward by any gap over `STALL` (400ms),
drops held keys and calls `changed()`. No event to miss, and a debugger pause
and a sleeping laptop are handled by the same three lines. Keep that deadline
list complete if a fourth timer is ever added.

**A hidden tab freezes and then fast-forwards.** `requestAnimationFrame` stops
while the page is hidden - fine - but every deadline in the engine is an
absolute `performance.now()` stamp, so the first frame back finds `now` far
past all of them and the phase machine fires one step per frame: a throw left
mid-air resolves in six frames. `visibilitychange` measures the gap and pushes
the three live deadlines forward by it (`move.startedAt`, `encounter.until`,
`fishing.until`) - keep that list complete if a fourth timer is ever added. It
also drops held keys, because switching TABS does not always fire `blur` the
way switching windows does, and calls `changed()` on return so the rail is not
showing RUN over a trainer who is walking.

**A flat cap or floor flattens the ball ladder.** `catchChance` clamped to
0.95 and 0.03, and `(rate/255) * mult` reaches 0.95 at rate 255/mult - so a
Poke Ball was already capped against the fifteen commonest species in the dex
and a Great Ball bought nothing at all on a Pidgey, while at rate 3 the floor
made Poke and Great identical on every legendary. The ceiling belongs to the
BALL now (`1 - NEVER_CERTAIN / mult`, so a better ball misses less often) and
the floor is low enough (`NEVER_HOPELESS` 0.01) that no species in the dex sits
on it. Everything between the two is untouched, which is why the rare economy
did not move. check.mjs sweeps every catch rate the dex actually contains and
fails if a better ball is ever worth nothing.

**CSS**
- **An animation beats a plain declaration.** `.mon` runs `mon-appear`, whose
  keyframes set `filter: none` with `animation-fill-mode: both` - so
  `.sprite-astral { filter: <duotone> }` applied in the Dex, where the sprite has
  no animation, and silently vanished the instant an Astral landed in an
  encounter. `!important` is the only author declaration that outranks an
  animation, and that is why the duotone carries one.
- **Naming an `animation` replaces the whole list.** `.sprite-origin.mon` sets
  its own reveal and therefore dropped `mon-idle` as well - Origins formed and
  then stood perfectly still while everything else breathed. If you override
  `animation` on a `.mon`, re-list what you still want.
- **`<details open={...}>` in React is a trap.** It is a controlled prop with no
  change event wired up, so React re-asserts it on every render: the filter panel
  slammed shut under the user the moment they typed one letter into the search
  box. Own the state and mirror it back with `onToggle`.
- Media queries add **no specificity** — layout overrides must come last in
  `styles.css`. The responsive block is at the end on purpose.
- `align-items: stretch` equalises grid columns to the **taller** one; keep an
  item out of row sizing with `height: 0; min-height: 100%`.
- `aspect-ratio` cannot size grid rows when columns are `1fr`.
- An ancestor with a live `transform` becomes the containing block for
  `position: fixed` descendants.
- Container queries (`cqw`) with `container-type: inline-size` on `.battle`,
  `.evo`.
- Never `animation-fill-mode: both` on a fade-in — it holds the invisible start
  state if the animation does not run.

**The encounter scene is two different kinds of thing, and they live apart.**
The FLOOR is the area's own metatile, cut by `build_ground()` out of the atlas
with the id read back out of `route.json` (`cave.floor`, `volcano.floor`, ...) -
so it cannot disagree with what the map draws underfoot. The SKY and the light
are CSS custom properties per `[data-area]`, because a cave's problem is not its
floor tile, it is that there is no sky. **They go on `.battle`**: `.battle-sky`
and `.battle-ground` are SIBLINGS of `.battle-field`, and a custom property only
inherits downwards - set one level too low and every area silently drew the
default daylight. check.mjs asserts both halves exist for every area in `AREAS`,
because neither fails loudly on its own, and `--ground` is built against
`document.baseURI` for the same reason `spriteUrl()` is.

**Rendering a map to look at it** — no browser needed, and no temporary
viewport edits to forget to revert. Drive the real `drawTile()` from Node with a
stub `ctx` whose `drawImage` records the source rect, which gives the atlas id
every cell resolved to; paint those out of `route.png` with PIL. Because it runs
the shipped tile rules rather than a second copy, what it draws is what the game
draws. Render the real FireRed map beside it the same way (`map.bin` id `r` is
`r` when `r < 640`, else our base + `r - 640`) and the differences are obvious —
that is how the plinth caps, the 57/58 console and the barrel rule were found.
Overlay `SOLID` in red to see what is walkable.

**Headless rendering** (for UI, where the DOM is the point)
- Use the dev server, not `vite preview` — preview locks `dist/` and a
  concurrent build fails with `emptyDir`, leaving a partial build and 404s.
- `chrome-headless-shell` (in `~/.cache/puppeteer`) is more reliable here than
  `chrome --headless`. Kill stale shells between runs or the next one hangs.
- rAF is throttled and CSS animations freeze at their `from` state;
  `--virtual-time-budget` fires timers. A frozen panel is usually the harness,
  not a bug — confirm before chasing it.

**Editing**
- Patch by **matching block text with assertions**, never line arithmetic. A
  line-offset edit once deleted `setEngine(e)` and the whole rail rendered from
  undefined state while the map kept drawing.
- **Never replace a span between two `index()` anchors.** Rewriting
  `rock_ridge()` as `s[:s.index("def rock_ridge")] + NEW + s[s.index("def bank"):]`
  silently deleted the eight functions that happened to live between them -
  `volcano`, `frost_hollow`, `seafoam_b3f` and the lava and bridge helpers. It
  was recoverable only because the patch scripts were still on disk and
  `mapdata.js` held the last good output to diff against, which is what proved
  the restoration: every map but the intended one came back byte-identical.
  Replace the function, not the gap between two of them.
- **A LITERAL IN AN ASSERTION IS NOT A RULE.** Three broke in one pass and all
  three for the same reason: `fleeChance(255) === 0.2` meant "a common waits
  around", `liveMult(timer, {throws: 0}) === 1` meant "nothing extra on the first
  throw", and `mb <= 3` meant "walking must not out-give levelling". Every one
  failed on a retune that did not touch what it cared about. Write the
  relationship (`fleeChance(3) > fleeChance(30)`, `=== timer.mult`,
  `walked <= fromLevels`); keep a number only as a BOUND with its reason
  attached.
- `assert s != o` is **not enough** when a script makes several replacements —
  one can silently no-op while the others succeed. Assert each replacement
  landed. Two canopy assertions were dead for a whole session this way.
- Write patch scripts with the **Write tool**, not a shell heredoc. Even
  `<<'EOF'` came back a backslash short here, so `"\0"` in a matched block
  arrived as a NUL and the match silently failed.
- Temporary hooks (whole-map viewport, seeded save harness) must be reverted
  before finishing: `VIEW_W/VIEW_H` back to 15/11, `.viewport max-width` back to
  the `calc(...)`, and `__t.html` deleted.

## Working style

- Read the task as a checklist and satisfy each sentence. For details it leaves
  open, follow the nearest existing code rather than inventing.
- Match the surrounding comment density. Comments here explain **why**, and
  usually name the bug that motivated the rule. Keep that.
- Prefer deleting to adding. No abstraction with one caller, no config for a
  value that never changes.
- Batch independent tool calls into one message; background long commands and
  wait once rather than polling. Do not re-run a check that passed until the
  code changed.
- Report faithfully: if a test fails, show the output; if a step was skipped,
  say so. When a reading turns out to be wrong, correct it plainly and move on.
