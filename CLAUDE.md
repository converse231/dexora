# Dexora

A personal, non-commercial browser game: catch, collect and evolve the 151 Gen 1
Pokémon across eight hand-made areas. Inspired by DelugeRPG's loop — walk, meet,
throw, bank the duplicates, evolve.

**Standing constraint: this stays personal and non-commercial.** No ads, no
payments, no store listing, no distribution. It uses Nintendo's characters and
Game Freak's art. Community tilesets marked ☆ in the README require crediting
the artist before anything ships.

`README.md` is the design document — economy, trainer stats, evolution pricing,
UI rationale, per-screen decisions. Read it before changing behaviour. This file
is how to work in the codebase: the invariants, the traps, and the method.

## Commands

```
npm run dev        vite dev server           npm run check   node tools/check.mjs (18 suites)
npm run build      vite build                npm run art     python tools/build_assets.py
npm run preview    serve dist/               npm run map     python tools/build_map.py
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

[tools/check.mjs](tools/check.mjs) adds seventeen suites — catch odds, phase
machine, balls, economy, evolution, evolution animation, trainer stats,
casting, tileset, player, medals, origin gate, variant rows, steps, minimap,
battle scene, spawn ladder, areas.
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

**A tier's look must survive as a bare `<img>`.** A Dex cell is one image with
nowhere to hang a layer, so whatever identifies the tier there has to come from
`filter` alone - which is why Holo's rim is three drop-shadows and NOT a
`hue-rotate`. The travelling foil band is a second element and exists only where
there is a container: the encounter and the Forms strip. Astral splits the same
way (duotone everywhere, sky and aura and orbit only in the encounter).

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

**Master Balls come from two places now, and both are pinned.** `levelReward`
pays one every fifteenth level (three over the cap) and `stepReward` pays one
every tenth haul - 25,000 steps - gated at level 20, which is two over a
50,000-step playthrough. Five in a whole game. The step one is counted, never
priced: a Master Ball has no price, and pricing the unpriceable is how a budget
assertion starts approving them.

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

**One validator for a save, wherever it came from.** `saveProblem()` is used by
both `loadState` (localStorage) and `importSave` (a chosen file). It is
deliberately shallow — anything merely odd is repaired by `loadState`, because a
save that is strange should still open; what it rejects is a file that was never
a save. `importSave` writes and reloads rather than swapping state in place: the
engine closes over the map rows and their dimensions, and a reload is the one
path that is certainly consistent.

**A generation is derived from the dex id.** `GEN_LAST` in `biomes.js` holds the
last national dex number of each generation and `genOf()` reads it; nothing is
stored per species, because it already is a fact about the id and 151 copies of
"1" is not data. The chip goes on the encounter nameplate now, while Gen 1 is all
that ships and it therefore says nothing — that is the point. A badge that
arrives the same day as the thing it distinguishes reads as a label; one that was
always there reads as information.

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

**Sample an animation before judging it.** A negative `animation-delay` plus
`animation-play-state: paused` freezes an animation at a chosen time, so N
copies of the real markup lay the whole sequence out as a strip. Both frame
bugs above were invisible in the code and obvious in one screenshot.

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
