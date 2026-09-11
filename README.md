# Meadow Route

An eight-map, 151-species collecting game: walk, meet, throw, bank the
duplicates, evolve.

**Phase 1 asked one question** — *does "commons fund rares" hold up over an hour,
or is it a grind?* — and it was answered yes: a common nets **+¥14** and a rare
caught with Ultras **costs ¥252 more than it sells for**, both asserted. What was
built to answer it (money, four ball tiers, a shop, storage, selling duplicates)
is all still here, and a good deal more has landed on top: eight hand-made maps
with their tile grammars decoded from the real games, evolution by feeding
duplicates, fishing, trainer stats, and legendaries placed by type rule.

**The roadmap is at the bottom.** Everything between here and there is *what is
built and why*, which is the part worth reading before changing behaviour.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run check` | Eight suites: catch math, phase machine, economy, evolution graph, evolution animation, trainer stats, tileset sanity, map geometry |
| `npm run assets` | Re-pulls species, sprites, item sprites and evolution requirements from PokéAPI |
| `npm run art` | Rebuilds map tiles, player sheet and encounter ground (needs Python + Pillow) |
| `npm run map` | Regenerates the route from the region definitions in `tools/build_map.py` |
| `npm run tilesets` | Downloads the community tilesets listed in `tools/fetch_tilesets.py` |
| `python tools/study_tiles.py` | Renders the real FireRed maps and their tile usage into `.study/`, for picking biome tiles |

Arrow keys or WASD to walk — **every tile you can stand on can spawn a Pokémon**,
the way DelugeRPG does it, so there is no grass to hunt for and no safe ground.
**F** casts a rod at water you are facing, **B** gets on and off the Bicycle.
In an encounter: **1 / 2 / 3 / 4** throw that ball tier, **Space** throws the
cheapest you own, **Esc** runs, and clicking or any key **skips the throw
animation**. The keys are printed on the
buttons so nobody has to find them. Progress saves to your browser.

## Layout

```
src/
  App.jsx            layout, keyboard, engine wiring
  catch.js           catch odds + shake derivation   (pure, tested)
  game/
    engine.js        state, rAF loop, canvas drawing  (no React)
    phases.js        encounter state machine          (pure, tested)
    map.js           the route, encounter table
    tileset.js       sprite-sheet loading + fallback drawing
  ui/                TopBar, Dex, DexSheet, Encounter
  data/species.js    151 species from PokéAPI (generated)
public/
  sprites/           151 FireRed/LeafGreen sprites (generated)
  items/             ball sprites (generated)
  tilesets/          drop your art here — see below
```

React never re-renders during the game loop. The engine owns state, runs its own
`requestAnimationFrame`, and draws straight to canvas; it calls back into React
only when something the UI shows actually changes.

## Catching

One roll per throw against the species' real Gen 1 capture rate. The roll decides
everything — but the **number of ball wobbles is derived from how close that roll
came**, so 3 shakes then a break-out really was a near miss and 0 shakes really
was hopeless. Same odds, far better feel. `npm run check` asserts the drama never
shifts the odds.

The encounter fills the map screen, and the throw follows the real sequence from
[pret/pokefirered](https://github.com/pret/pokefirered)'s `pokeball.c`, converted
from frames at 60fps:

| Beat | Real game | Here |
|---|---|---|
| arc to target | `TranslateAnimHorizontalArc` | 560ms |
| ball opens, mon shrinks | ~10 frame delay + affine shrink | 460ms |
| ball closes, falls | four bounces, decreasing height | 560ms |
| **stillness** | **31 frames before the first shake** | **520ms** |
| each shake | alternating left/right | 720ms |
| verdict | capture at shake 4 | 1000ms |

A three-shake catch runs about 5.2s, same as the original. The dead half-second
after the ball lands is doing most of the work — that is where you hold your
breath. Always skippable by click or key, because you will throw hundreds.
Beat lengths live in `T` in `game/engine.js` and must stay in step with the
`--t-*` variables in `styles.css`.

The Pokémon drops in with a squash landing and a dust ring, shrinks and spins
into the ball when caught, and bounds away in hops when it flees or you run.
A catch fires a burst of gold stars arcing up and out with rings washing across
the ground.

**Debugging CSS animation:** headless screenshots freeze mid-animation, so a
still of a running keyframe is not trustworthy. The way to inspect one is a
throwaway page that pins `animation-play-state: paused` and sets a *negative*
`animation-delay` per frame you want to sample — that renders any instant of the
timeline exactly, side by side. Outlining the animated element is what showed
the absorb was working all along and only looked broken because it whited out
too early.

## Celebration and feel

Levelling and finishing a Pokédex milestone used to be a line of small text
inside whatever screen happened to be open, which meant the two moments the game
is built around went by unnoticed. A banner owns them now — it drops in above
every other overlay, so it lands the same way mid-encounter, mid-evolution or
walking, and the screens underneath stopped repeating it. Milestones thin out as
the numbers get real: 10, 25, 50, 75, 100, 125, 151.

Everything else is small on purpose. Every button sinks a pixel and shortens its
shadow when pressed, which is the cheapest possible read of "that did something";
keyboard focus draws in the game's own ink rather than the browser's blue; a
panel settles when you switch tabs so content arrives instead of teleporting; a
box row you can evolve *right now* breathes slowly, because it is the one thing
on screen you can act on. A wild encounter opens with three hard white flashes,
which is the part of the FRLG battle cut your eye actually remembers.

All of it is off under `prefers-reduced-motion`.

## Feedback

There is no corner toast — it was easy to miss, which defeats the point. Success
is announced where you are already looking:

- **Catching** — a banner on the encounter itself, top right so it never lands on
  the Pokémon, naming the new dex entry and any trainer level gained. The gold
  star burst carries the moment.
- **Buying and selling** — the amount falls out of the money counter (`+¥940` in
  green, `−¥250` in red) and the figure itself pulses. The number and the reason
  for it are in the same place.

### The idle sprite

The trainer stands still when you do. Worth recording *why* this was wrong twice:
the sheet's columns are **[stride, stand, stride]**, not [stand, stride, stride],
so drawing column 0 when idle left him permanently mid-step. Measured rather than
assumed — in the down and up rows the legs of frame 1 mirror themselves exactly
(feet together) while 0 and 2 are mirror-image strides.

### Fitting the Pokémon

The encounter slot is sized by **height**, from the band between the nameplate
and the message box. It used to be a fixed share of the *width*, so its foot sat
behind the message box and big Pokémon — Snorlax, Gyarados, Onix — were clipped
off at the bottom.

## Pokédex

Clicking any slot opens its entry. How much it shows depends on how far you have
got: an unseen species is a silhouette and nothing else, a seen one gives you its
name and types, and only a caught one opens up the dex text, height, weight,
catch rate and base stats. Holding detail back is deliberate — the gaps are the
reason to keep hunting.

## Art

`npm run art` builds everything the game draws, from `tools/build_assets.py`:

- **Map tiles** — the real FireRed outdoor tileset, taken from the
  [pret/pokefirered](https://github.com/pret/pokefirered) decompilation. Gen 3
  stores 8x8 tiles plus 16x16 "metatile" recipes and separate palettes; the
  script flattens all 640 metatiles into one atlas so the game only ever calls
  `drawImage`.

  **Which metatile is which was read off a real map, not chosen by eye.**
  `data/layouts/Route1/map.bin` was decoded and its tile usage counted, which
  settles every question the atlas alone leaves open:

  | Thing | Truth from Route 1 |
  |---|---|
  | tall grass | one uniform tile, **13** — the only one the real map lays down |
  | tree | **2 wide x 3 tall**: walkable tip (14,15), body (30,31), base with trunk (36,37) |
  | ground | five variants (1, 8, 9, 16, 17) mixed by tile hash |
  | flowers | metatile 4, used at ~3% and placed by hand, not scattered |
  | path | a 3x3 autotile; **220 is the centre fill**, so 219-221 is the middle row |

  Trees being 2 tall instead of 3 is what made them look cut short, and putting
  the flower tile in the random ground pool carpeted the route in flowers.
  `map.js` asserts every tree is 2 wide and at least 3 tall, and every path at
  least 3 wide — the geometry the composition needs to come out whole.
- **Player** — cut from the Spriters Resource FRLG rip in `.assets-src/`:
  16x32 frames on a 17x33 pitch from (8, 42), rows down/up/left/right, columns
  stand/step-A/step-B, with the sheet's orange backdrop keyed out. The sheet is
  authored against 16px tiles while the game draws tiles at 32px, so `player.json`
  carries `scale: 2` — without it the trainer comes out half the size of the map.
- **Encounter ground** — two single metatiles lifted from the atlas so CSS can
  tile them behind the battle scene.

Everything is described by `route.json` / `player.json`, so you can point them at
a different sheet. **Delete either PNG and the game falls back to drawing tiles
procedurally**, so it always runs.

### Community tilesets

`npm run tilesets` pulls the sheets listed in `tools/fetch_tilesets.py` into
`.assets-src/community/` (source art; not shipped). DeviantArt pages embed a
signed full-resolution download URL in their HTML, which is what the script
reads — the displayed image is a cropped, downscaled preview.

**Only one of them is actually in the game**, and that restraint is deliberate:
the map runs on the authentic FireRed tileset, which is internally consistent and
matches the FireRed Pokémon and player sprites. Community sheets are Gen-3
*style* but by different artists, so dropping one in beside ours usually reads as
a palette clash rather than an upgrade. The bar is: does it fix something ours
does badly?

| Sheet | Verdict |
|---|---|
| **All Cliffs** — Ekat99 | **in use.** Its mossy boulders are single-tile overlays and its mint grass matches ours almost exactly. Rock Ridge was our worst art; this fixed it. |
| Water Animation / Next Animated Water — Magiscarf | held. Lovely, credit-free, 8 animated frames — but an RPG-Maker autotile with a tan rim where FireRed uses grey stone, so it needs autotile decoding *and* a style decision. |
| Rock Tiles, Tree Tiles — J-Treecko252 | held. Competent, but ours already reads correctly and these are drawn at a different scale. |
| Pond And Bridge — Ekat99 | held. Useful reeds and a bridge if the pond gets a rework. |

Boulders are composited over our own rocky ground and appended to the atlas as
extra tile ids, so there is still one atlas, one `drawImage` path and no renderer
changes — they are simply higher tile numbers.

## The economy

Commons print money, rares burn it. That one sentence is the whole design, and
`npm run check` asserts the *relationship* rather than the arithmetic — retune a
price in a way that breaks it and the tests fail rather than the play session:

| | |
|---|---|
| Poké / Great / Ultra Ball | ¥25 / ¥90 / ¥250 — ×1.0 / ×1.8 / ×3.0 odds |
| Net / Repeat / Dusk / Timer Ball | ¥150 / ¥170 / ¥190 / ¥70 — ×1.0 until their condition holds |
| Master Ball | **not for sale at any price** — never fails, so only scarcity can balance it |
| Duplicate sells for | ¥40 C · ¥90 B · ¥220 A · ¥600 S |
| New dex entry | ¥100, once per species |
| A common, caught and sold | **nets about +¥14** |
| A rare, caught with Ultras | **costs about ¥250 more than it sells for** |
| A rare, at every ball's best case | ¥142 / 283 / 243 / 275 / 472 / 308 / 303 against ¥220 back |

### Balls that are only good sometimes

Three tiers of "simply better" is a tax you pay for not having enough money.
Four **situational** balls sit beside them instead: each does nothing at all
most of the time and beats an Ultra Ball when its one condition holds, so which
ball to buy becomes a decision you make in the shop and cash in on the route.

| ball | when it is worth it | | price |
|---|---|---|---|
| **Net Ball** | the target is Bug or Water | ×3.5 | ¥150 |
| **Repeat Ball** | the species is already in your dex | ×3.5 | ¥170 |
| **Dusk Ball** | you are in a cave or a building | ×3.5 | ¥190 |
| **Timer Ball** | it keeps breaking free — grows each throw, caps at ×4 | ×1→4 | ¥70 |

Every one is priced **below** the Ultra Ball, so choosing right is cheaper than
brute force and choosing wrong is dearer than a Poké Ball. And each keys off a
*different* system the game already tracks — the species' types, the Pokédex,
the area, the encounter itself — so no two overlap. `npm run check` asserts that
last part by comparing the pattern of answers each ball gives over every sampled
encounter: two balls that boost on exactly the same ones are one ball wearing
two names and two prices.

The Repeat Ball is the best fit and it was not designed for this game: the whole
loop here is re-catching species you already own to find their Origin, Holo,
Shiny and Astral.

The multipliers are the real games' (Gen III–IV), but this game's own ladder is
already tuned above canon — a Great Ball is ×1.8 here against ×1.5 there — so
these sit at ×3.5 rather than ×3, which keeps a situational ball worth more than
the ×3.0 Ultra it competes with.

**Two canon balls were measured and rejected.** The Nest Ball is `(40 − level)
/ 10`, and every wild Pokémon here is level 2–7, so that formula is a flat ~×3.5
on *literally every encounter in the game* — not a condition, an Ultra Ball for
40% less money. The Dive Ball boosts while fishing, and everything on a rod here
is Water-typed, so it would be the Net Ball with a second name and a second
price. A third, the Quick Ball, is ×4 on the first turn, which in a game where
the first throw is the one everybody makes is simply the best ball, always.

**Pricing a ramp is not the same as pricing a multiplier**, and the Timer Ball
shipped wrong once because of it. At ¥140 it looked reasonable next to its ×4
cap — and then measured out at **¥606 per rare, the most expensive ball in the
game**, because you pay full price for every throw on the way up and most of
them are worth about ×1. The cap is not what you buy, it is what you *might*
reach: a rare flees about half the times it breaks free, so a fifth throw at the
same one happens maybe 2% of the time. Being cheap enough to keep throwing *is*
the ball, so it is ¥70 — cheaper than a Great Ball. `npm run check` prices it by
simulating the ramp throw by throw rather than by its cap, and prints what every
ball costs per rare so the next retune cannot drift quietly.

The counter is **throws at this Pokémon**, not Timer Balls thrown, so softening
one up with cheap Poké Balls and then switching is a real tactic rather than an
exploit to close.

**A condition nobody can see is not a condition.** The ball rail prices every
ball against whatever is standing in front of you — through the *same* function
the engine rolls with, so what you are shown is what gets used — and marks the
ones currently earning their keep in gold with their live multiplier. A ball
whose condition is not met says nothing at all rather than "×1.0", because a
row of ×1.0s buries the one line that matters. The shop sells them on the
condition too: printing "×1.0 odds" beside a Net Ball is true, useless, and
reads as a worse Poké Ball for six times the money.

The four stay **hidden from the rail until you own one**, the way the Master
Ball always has — seven tiles of mostly zeroes is not a bag readout.

The shop is a list of one-line rows and only the row you are buying from opens —
nine items each carrying a name, price, stock count and quantity picker did not
fit in the rail, and the panel grew past the screen because it was the one tab
without the `max-height` + `overflow-y` its siblings all had. Buying takes a
quantity rather than a menu: a stepper with a typed field and a **MAX**, so
restocking after a good selling run is one action rather than four clicks through
four confirm dialogs. Stone rows name the Pokémon they are for.

Duplicates are the only meaningful income, so grinding and earning are the same
act. The BOX tab's *sell spares* keeps the best of every species — and whatever
an evolution is still waiting on — and cashes the rest.

One thing the new balls must *not* do is print money. Hunting a rare with the
cheapest ball in the game has always been mildly profitable — that is the grind,
and it is paid for in time rather than in yen — so the assertion is not "rares
must never pay", it is that **no other ball out-earns grinding with Poké Balls**.
Measured at each ball's best case, because best case is where a new ball breaks
an economy.

**Levelling pays out in balls**, not permission. Every trainer level hands you 5
Poké Balls, plus 3 Great Balls from Lv 6 and 2 Ultra Balls from Lv 12, and every
**fifteenth** level a **Master Ball** — three across the whole curve. That divisor
is derived from the cap, not chosen: it was every tenth level while the cap was
30, and extending the cap to 50 without touching it would have quietly handed out
five. **Three in a whole game is the design; the cadence is arithmetic.** The
shop unlocking a
tier and the game handing you a few of it land together, so a new ball is
something you get to try before you have to fund it.

The Master Ball is the one thing money cannot reach. A price is only ever a
delay — grind long enough and you could hold twenty — so the only thing that can
keep a ball that *never fails* scarce is that it is not for sale. Three arrive in
a whole game, at levels 10, 20 and 30. `npm run check` asserts it never reaches
the shelf and that the level table is its only source. It stays hidden from the
encounter until you own one: four ball buttons plus RUN is a crowded row, and a
permanently greyed-out button teaches nothing the shop does not.

## Trainer stats: what a level is worth

Levelling handed out balls and unlocked shop stock. That paces the game but never
changes how you *play* it — every trainer at level 20 played identically. So a
level now also grants **one stat point**, spent where you choose across five
stats of **twenty** ranks each.

| Stat | At rank 20 | What it changes |
|---|---|---|
| **Precision** | +60% catch odds | multiplies the ball's own multiplier |
| **Fortune** | rares ~3% of finds, from ~1% | reshapes the encounter table toward its tail |
| **Stride** | 40% quicker steps | and the Bicycle halves it again on top |
| **Haggle** | +40% sale, −20% prices | the shop shows the discounted number |
| **Insight** | +80% XP | so the next level comes sooner |

**Ranks were ten, and ten was too few.** A point a level fills a stat every
eleven levels, so the interesting half of this screen was finished long before
the dex was — "easy to maximise" is exactly the complaint, and it was right.
Doubling the ranks and **halving every coefficient** leaves rank 20 worth
precisely what rank 10 used to be: the ceiling has not moved a percent, the road
to it is twice as long and has twice as many decisions on it. The level curve was
extended from 30 to **50** to pay for the extra ranks, which is 25,830 XP to the
cap where it was 5,480.

The first thirty rows of `LEVEL_XP` are byte-identical to the old table on
purpose. A save holds raw XP, so changing any of them would silently re-level
every trainer who already exists; the tail just keeps doing what the tail already
did, each increment about 7.5% larger than the last.

Spending is **one click**. It went through a confirm dialog at first, on the
grounds that a point cannot be moved once spent — but that put a modal between
the player and the only reward a level gives, twice a level, to answer a question
the row already answers. The button now states what the next rank buys *before*
you press it, the warning sits on the panel once instead of interrupting every
click, and the row flashes afterwards so a spend is never silent.

The whole design rests on one number: **49 points against 100 ranks of capacity**.
You reach the level cap unable to have finished even three stats, so the screen
is a series of refusals as much as choices — and `npm run check` asserts that
inequality directly, because the day capacity drops below the points available is
the day none of it means anything.

Fortune is the interesting one. Rather than adding a "rare bonus" it raises every
weight in the table to a power below 1, which compresses the distribution toward
its tail: a weight-1 legendary stays at 1 while a weight-22 Pidgey falls toward 6.
No entry is ever added, removed or reordered — asserted — and it can never reach
certainty.

It got sharper teeth when the Flower Clearing went, because legendary weights are
now well below 1: raising **0.08** to the power 0.6 more than doubles it while
that Pidgey falls to a quarter of itself. **Fortune is now how you hunt rares** —
it is a trainer you build rather than a place you walk to, which is the whole
point of not having a rare map.

Every scale is applied at the engine's **call sites** rather than baked into the
economy functions, so the base numbers the loop is pinned to stay true and the
economy suite still means what it did. The two sums Haggle changes live in one
place that both the engine and the shop call, because a shown price and a charged
price drifting apart is exactly what happens when that formula is written twice.

### Key items

Four things a level gives you that no amount of money can:

| | Level | |
|---|---|---|
| **Old Rod** | 4 | Fish any shoreline. Mostly Magikarp. |
| **Bicycle** | 8 | Twice the walking speed, `B` to mount |
| **Good Rod** | 14 | A wider catch off the same shore |
| **Super Rod** | 22 | The deep-water table |

Rods matter because **open water is solid** — a Lapras was never going to walk up
the bank to meet you, so a rod is the only way to reach any of it. Each rod has a
table of its own rather than a modifier on the shore's, which makes upgrading one
feel like somewhere new: the Super Rod's list is almost entirely second-stage
water Pokémon you cannot find any other way. Stand facing water and the hint line
turns into a **button** — the keyboard has `F`, but a touch player had no way to
cast at all.

## Reading the box, and the encounter

Two questions the game has to answer without making you hunt for the answer.

Both the Dex and the Box carry the same **search + counted chips** — they are
two views of one collection and it would be odd for them to disagree about how
you search it. One difference: the Dex will not match an *unseen* entry by name,
or the search box would be a spoiler for a species you have never met; its number
stays searchable, since that is printed on the card already.

**"What can I evolve?"** The box sorts **ready-to-evolve species to the top**,
then anything with spares, then dex order. Eighty species is a scroll, and the
one row you opened the panel to press was as likely to be at the bottom of it as
anywhere. Above the list sits a search (name or type) and four chips — ALL,
READY, SPARE, EVOLVES — each carrying its own count, with READY outlined in gold
whenever it is not empty. Filters run *after* the grouping rather than inside its
memo, since they change on every keystroke and the grouping does not.

**"How close is this one?"** The encounter carries the same progress the box
does, on its own card opposite the nameplate — `EVOLUTION · 2/10 · TO GYARADOS`.
Standing in front of a Magikarp is exactly the moment that count matters, because
it decides whether this is the one worth an Ultra Ball, and until now you had to
leave the encounter to find out. It only shows while you are choosing; the catch
banner takes that corner once the ball has landed.

### The throw is drawn, not transformed

The ball was one PNG that CSS spun, wobbled and popped. It is now a **32-frame
sprite strip** per ball, stepped by phase — Anarlaurendil's sheet, credited
above, whose frame budget maps onto our phase machine almost exactly as drawn:

| frames | what they are | our phase |
|---|---|---|
| f00–f03 | the ball turning, white underside to face-on | `throw`, looped ~3× across the arc |
| f04–f14 | aspiration: opens, the burst, the beam drawing in, closes | `suck` |
| f15–f19 | the shakes, centre button lit | `shake` |
| f20–f26 | the catch failing: bursts open, halves fly apart | `broke` |
| f27–f31 | the catch landing: the click and its sparkles | `caught` |

Three things this changed beyond looking better.

**The CSS rotation is gone.** `ball-arc` used to `rotate(860deg)`, which
resamples a 14-pixel ball into mush at every angle between the right ones. The
first four frames *are* a spin — you can watch the Great Ball's blue come round
the edge — so the element no longer turns at all.

**The wobble is drawn into f15–f19**, which swing the ball out to x-centre 28
and back to 36 where every other frame sits at 32. So there is deliberately no
CSS transform on a shake any more: doing both compounds into a lurch.

**The ball stays on screen when the catch fails.** It used to vanish the
instant one broke free, because a static PNG cannot burst open. Now the
Pokémon comes back out of a ball you can watch throw it out.

The width is derived rather than picked: the art fills 14 of each 64px cell
(21.9%), and the old icon read at 18% of the slot, so the cell is drawn at
82% and the ball is exactly the size it always was — with the rest of the cell
left for the bursts to happen in. `build_balls.py` asserts the 14×14 so that
derivation cannot rot.

**The CSS catch burst is gone** — three rings, seven stars and six glints
thrown outward by hand. It was drawn for a static ball, when nothing else on
screen marked the moment. The sheet's last five frames *are* that moment, drawn
to sit on the ball, so running both put two sets of stars over one event at two
different frame rates. That was most of what made the catch look unsteady.

**Two frame bugs the timeline harness caught, and nothing else would have.**
Sampling an animation means giving it a negative `animation-delay` and pausing
it, so N copies of the real markup lay the sequence out as a strip. What that
showed: the obvious way to step a sprite range is to run `to` one frame *past*
the end with `steps(n)`, which walks a..b and never reaches the end value —
correct while the animation runs, wrong the moment one *holds*. `forwards`
holds the end value, so the catch held frame 32, which is off the strip, and
the ball simply vanished after the click; the break-out held frame 27, which is
the *catch's* gold flash, so a Pokémon that escaped ended on the animation for
keeping it. `steps(n, jump-none)` spreads n values across the range inclusive,
and both now hold the frame they should. The spin is tied to
`calc(var(--t-throw) / 4)` as well, so it turns exactly four times across the
arc instead of being cut off wherever it had got to.

**The catch ends on a plain ball.** The five-frame click held its last frame —
a darkened ball inside an expanding ring — for the rest of the 1,200ms result
beat, which is a flash outstaying its welcome by four times its own length.
Dropping `forwards` means the animation simply ends and the element falls back
to `.ball`'s own resting frame: the closed, face-on ball, which is what a caught
ball looks like once it has stopped doing anything.

**The thrown ball now arcs in front of the Pokémon, not behind it.** `.ball-slot`
had no `z-index` at all, which was invisible until `.mon-slot .mon` was given
`z-index: 1` so an Astral sprite would sit above its own aura — and from that day
every throw in the game went behind the creature. It is `z-index: 4` now, which
clears the sprite (1), the captured sprite (2) and the effect layers (3: the star
field, the foil, the sparks). The absorb reads better for it too: the Pokémon
shrinks *behind* the ball as it is drawn in, which is where it was always going.

### Types are data

A type is the one thing in this game that always means the same thing, so it now
always looks the same: a coloured chip, never prose. It had been printed as plain
text on the map tag and the travel list and as a badge in the dex and the
encounter, which made two of them read as captions rather than as information.
The biome list stored `"Normal · Flying · Bug"` — fine to print, impossible to
colour — so types became ids and `npm run check` asserts every one is a type some
species actually has.

The badge itself was sized in `cqw`, which only resolves inside the battle
overlay's container; that is *why* it could not be reused in the rail. It is
plain `px` now, with container units only where there is a container.

### Density

The shell was capped at 1180px, which left a third of a 1080p screen empty down
both sides while the map sat small in the middle. It is 1500px now, and since
the map is `width: 100%` that makes the *game* bigger rather than just spreading
the furniture out — with the map's width bounded by what is left of the viewport
height, using the canvas's own 15:11 ratio, so a wide window cannot push the page
into scrolling.

Box rows were a 42px thumbnail against three lines of text and a full-width bar
of tall buttons — the card read as chrome with a sticker on it. The sprite is
62px, the padding is tighter, and the buttons are short and single-line. Most of
that last part came from deleting a duplicate: every evolve button carried a
second line saying "2 more to catch" directly under a progress bar already
reading "2 / 4 to evolve". Only a reason the bar *cannot* show — a missing stone
— still gets a line; the rest lives in the button's tooltip.

### The header

Four figures set in the same size and colour — `¥410 DEX 21/151 CAUGHT 69 STEPS
1264` — meant reading the labels to find the one you wanted. Each is a tile now:
a small faint label over a large value, divided from its neighbours, with money
in the path colour. The level sits in a pill with its own XP bar and figures, so
it reads as one object rather than three things sharing a gap.

Side by side, the map and the rail are one object and now end on the same line:
the rail stretches to the map's height and whichever list is open scrolls inside
what is left, instead of every panel carrying a guessed `max-height` that left a
ragged gap under the shorter column.

### The action row

Balls are tiles rather than wide buttons: the sprite is the thing you are aiming
at, so it leads, with the count riding its corner and the hotkey beneath. Four of
those plus RUN fit without wrapping, which the old two-line labels did constantly
— and the Master Ball's name is now light on its purple instead of the near-black
it was drawn in, which made the one ball you cannot buy the hardest to read.

### A badge means "act on this"

The tabs carried plain counts — 22 on the Dex, 48 on the Box — and a number in a
coloured pill at the corner of a tab is the universal shape of an *unread
notification*. So they read as alerts that never cleared no matter what you did,
which is exactly how they were reported. Those figures are on the panels and in
the top bar already.

A badge now means one thing and appears only when pressing that tab would achieve
something: a Pokémon ready to evolve, a stat point unspent. Both clear the moment
you deal with them, and both are the same gold, so the rule only has to be learnt
once.

### Confirm dialogs

A confirm is read in about a second, so it should be about a second tall. The
first one set a 23px title, 10px-padded rows and 15px buttons inside 22px of card
padding, which made three short facts fill half the screen — and the evolve
dialog carried a **"You receive: 1 × Nidorino"** row directly under a title
reading *"Evolve into Nidorino?"*. Cutting the repetition removed a whole row;
tightening the rest removed the other half. The button says `EVOLVE` rather than
`EVOLVE · 8 × NIDORAN♂`, which was wrapping to two lines to repeat the row above
it.

The evolution scene's own message box had the same problem from the other
direction: a fixed `min-height: 24%` for three short lines and a button. It and
the sprite stage above it each gave up 5%, so they still meet flush.

## Evolution: the level sets the price

Nothing gains levels here — there are no battles — so evolution spends the
resource the game actually floods you with, and **the real evolution level sets
the price**: a Charmander line costs more than a Caterpie line because that is
how the games rank them. Those levels (7 to 55) come straight from PokéAPI via
`tools/fetch-evolutions.mjs` into `src/data/evolutions.js`.

The level *sets* the price rather than *being* it. Charging it outright put
Charmeleon at 36 and Dragonair at 55, and at roughly 280 steps per catch of a
named species that is an evening of walking for one dex entry. Halved and capped
at 20, the ordering survives and the walk does too.

| Kind | Cost | Count |
|---|---|---|
| Level-up | half its evolution level, 3–20 | 52 |
| Stone | 8 duplicates **and** the stone | 16 |
| Trade | 10 duplicates | 4 |

Trade evolutions — Kadabra, Machoke, Graveler, Haunter — have nobody to trade
with in a single-player game, and there is no link-cable sprite in the PokéAPI
set either, so they cost extra duplicates instead of an item.

`npm run check` asserts the curve keeps its meaning: no cost above its own
evolution level, none above 20, costs ordered the same way the levels are, and
no complete line costing more than 40 from scratch.

### Why a feed eats the whole line

Halving is not enough on its own, because per species the costs *multiply* down a
chain: 8 Charmander for a Charmeleon and then 18 Charmeleon for a Charizard is
144 Charmander. That is not a goal, it is a wall.

So a feed is paid out of the **species and everything below it** — a Charizard
takes 18 from the Charmeleon-or-Charmander pool, one of which has to be the
Charmeleon that actually evolves. The chain adds up instead of multiplying:

| Line | Steps | From scratch |
|---|---|---|
| Caterpie → Butterfree | 4, 5 | **8** Caterpie |
| Rattata → Raticate | 10 | **10** Rattata |
| Abra → Alakazam | 8, 10 | **17** Abra |
| Charmander → Charizard | 8, 18 | **25** Charmander |
| Dratini → Dragonite | 15, 20 | **34** Dratini |

Steep where it should be, walkable everywhere. `npm run check` asserts
line-feeding stays at least four times cheaper than the naive reading.

Your best one does the evolving and carries its level forward; the bill is paid
from the earliest stage and the weakest levels first, so your good ones are the
last to go.

### Not selling what you were saving

Evolution is the only way to reach the **68 species that never spawn**, so the
BOX row shows the bill as a bar — `6 / 8 to evolve` — and never makes you count
your own Rattata. A stone evolution prints which stone it wants right on the
button, and says so when you do not have one.

**Selling never blocks you, but it never surprises you either.** The bulk *sell
spares* button holds back the whole feed for any evolution you have not registered
yet. Those held-back ones can still be sold from their own row; the confirm dialog
just tells you first how far back it puts you. Hard-blocking would have been
easier and worse: the useful thing is not being told *no*, it is being told *what
it costs*.

The reserve also gets out of the way. Once the whole line is in the Pokédex it
drops to one — otherwise catching anything that evolves would freeze your income
behind a pile you are no longer saving for.

## Tall Grass: drawn, not generated

The first map is composed by hand. Everything else scatters blobs on a jittered
grid, which is fine for a cave and reads as noise on a meadow — **Route 1 has no
organic shapes anywhere in it**. Decoding its `map.bin` shows a vocabulary made
entirely of rectangles and straight lines:

- a sand path **four tiles wide** that switchbacks down the map in a staircase,
  never wandering, always turning at a right angle;
- tall grass in **aligned rectangular fields**, each set beside the path;
- **ledges** — short capped bars along the south edge of the higher ground, so a
  route reads as a stack of terraces and going down is quicker than climbing
  back round;
- clumps of trees and loose handfuls of flowers as landmarks, with a lot of
  plain grass between them so the whole thing breathes.

So `tall_grass()` in `tools/build_map.py` paints those parts in layers, structure
first: frame, fields, path over them, ledges that terrace it, then landmarks and
flowers into whatever open grass is left. Every rectangle is a decision. It is
32×40 — about two screens across and three and a half down, Route 1's own
proportions.

### Ledges

New, and the single thing that most makes a route read as designed. `176/135/177`
is a capped bar; walking **south** into one hops it and lands you on the far
side, and from any other direction it is a wall. So a terrace is quick to leave
and slow to get back onto, which is exactly what the switchbacks are for.

That makes ledges the one thing on a map that can strand you, so reachability is
now a **directed** flood fill in both the generator and `npm run check` — a map
with a terrace you can drop into and never leave would otherwise pass. Every tile
of the meadow is still reachable: the ledges are shortcuts, never the only way.

Two things did not survive the pass. A **route sign** (metatile 2) drew as a pale
blank: it takes its palette from a *secondary* tileset, and our atlas only carries
the primary's for that range. And the first flower beds were filled rectangles,
which looked like a flower farm — Route 1 plants them in threes and fours, offset
from each other, so now so do we.

## Deep Woods: the opposite composition

Drawn by hand like Tall Grass, but the reverse arrangement. A route is an open
field with a path threading through it; a forest is the other way round — **the
trees are the terrain and the walkable part is what is left between them**.
Counting ViridianForest's own `map.bin` settles the proportions: tall grass is
**20% of the whole floor**, laid in solid rectangles, corridors run two to four
tiles wide, and sand appears as open *clearings* rather than as a path.

36×44, of which 30×36 is playable.

### The canopy is a different tree entirely

Viridian Forest does not use the primary tileset's conifer even once. It has its
own round canopy, and the tile counts give away how it is built: the two crown
rows are used ~270 times each while the trunk and shadow rows appear only ~45
times. That is because **a column of trees shares one canopy** — only the lowest
tree in a run shows a stem and casts a shadow.

So `forestId()` measures two things, both from the mass itself rather than any
global grid: how far the tile sits from its own left edge (a crown is three tiles
wide) and how far from the bottom of its own column. A mass can therefore start
anywhere, and the generator asserts the only two rules that follow — a multiple
of three wide, an even number of rows tall and at least four.

That assertion earned its place immediately: the first draft painted a ledge
straight through a canopy mass and sliced a tree column to seven rows. `ledge()`
now refuses anything but open ground, and the run-length check still fires if a
guard trims one too short.

## Biome art: read it off the real map

Each themed biome borrows a FireRed secondary tileset, and picking its tiles by
the obvious heuristic — the most-used walkable metatile and the most-used blocked
one — produced maps that were quietly wrong in three different ways. These are
cave and interior tilesets: their ground is drawn *with edges*, so the most-used
blocked tile is usually the middle of a wall rather than anything you can scatter.

`tools/study_tiles.py` draws the actual FireRed map from its own `map.bin`, plus
a labelled sheet of every metatile it uses and how often, so a choice is a number
read off a picture. What that turned up:

| Was | Actually | Symptom |
|---|---|---|
| Frost Hollow solid = Seafoam **17** | a plain ice floor | **invisible walls** |
| Power Plant solid = Power Plant **21** | the striped top edge of a machine wall | horizontal bands across the floor |
| Ember solid, scattered 2×2 | rock *faces*, no standalone boulder | floating red slabs |
| Ember Slope, a hillside | a volcano has lava, and FireRed has none | a rockery, not a volcano |
| Every biome | meadow grass + a **sand path** | a dirt track across a concrete factory |
| Rock Ridge | grass blobs on rock | hard rectangular edges, no transition tiles |
| A lake | a small ornamental pool, 2 rows | a flat blue rectangle, no shoreline |

All six are fixed. Obstacles are now props that stand on their own — barrels and
rubble in the plant, ice boulders in the hollow, gravestones in the tower — and
each biome's block size is chosen for what its art is: a gravestone stands alone,
ice boulders want a friend, and Mt Ember's rock faces need a 4×4 mass to read as
an outcrop. The indoor biomes lost the sand path entirely, which is exactly what
the real Power Plant is: one uniform floor.

Water turned out to be a proper 3×3 autotile whose bottom row is the walkable
grass bank, found by asking a real map what sits on each side of a water tile:

```
290 291 292   rock rim
298 299 300   open water
306 307 308   grass bank, walkable
```

So shore and water come out of one set and always line up. `npm run check` now
asserts a biome's ground and solid tile lists are disjoint — the invisible-wall
bug, caught as data rather than by looking.

## The evolution scene

Ported beat for beat from `CycleEvolutionMonSprite` in
[pret/pokefirered](https://github.com/pret/pokefirered)'s `evolution_graphics.c`,
because guessing at this produces a cross-fade and the real thing is nothing like
one. Both sprites have **every entry of their palette overwritten with
`RGB_WHITE`**, so the whole cycle is two hard-edged white silhouettes; what
alternates them is a **scale tug-of-war**:

```
pre-evo starts at 256/256, post-evo at 16/256
each swap, one grows toward 256 while the other shrinks back to 16
every frame moves both by `speed`, out of the 240 between them
speed starts at 8 and gains 2 per swap; at 128 the cycle ends
```

That yields **60 swaps over 406 frames** — 24 frames for the first, 2 for the
last. The acceleration into a strobe is a property of that loop, not an easing
curve laid over it. Then one white frame, and the evolved sprite in colour.

The arithmetic lives in `src/game/evocycle.js`, deliberately outside the
component and pure, because **rAF is throttled in headless Chrome and no
screenshot can ever check an animation**. `npm run check` asserts the shape
instead: 60 swaps, both scales inside their bounds, never an empty screen
mid-cycle, ending on the evolved sprite, and an opening swap at least four times
longer than the closing one.

The state change happens in the engine *before* the scene mounts, so there is no
half-evolved Pokémon to recover from if the tab is closed mid-flash.

## Areas: one map each, switched from the MAP tab

Nine maps, one per biome, picked from a list. **Not** one continuous world — that
was the earlier design and it was wrong. A world needs *transition tiles* between
biomes (shore to grass, ash to grass); without them every zone is a hard
rectangle butted against grass and the whole thing reads as a row of enclosures.
Separate maps remove the problem instead of papering over it, and it is what the
real games do: every route is its own layout.

| Area | Types | Ground from |
|---|---|---|
| Tall Grass | Normal · Flying · Bug | primary |
| Deep Woods | Bug · Grass · Poison | primary |
| Pond & Shore | Water | primary — spawns on the **bank**, no Surf |
| Rock Ridge | Rock · Ground · Fighting | primary + Ekat99 boulders |
| Power Plant | Electric | `power_plant` |
| Ember Caldera | Fire | `lavaridge` (pokeemerald) |
| Frost Hollow | Ice · Water | `seafoam_islands` — Seafoam B3F, copied |
| Haunted Tower | Ghost · Psychic | `pokemon_tower` |

### No map for rares

There were nine. The ninth was the **Flower Clearing**: no commons at all, every
encounter worth a ball — and it existed mostly to house the two legendaries whose
types matched no other map. It is gone, because **a map whose stated purpose is
"the rares are here" tells you the other eight are not worth walking**, which is
the opposite of what eight hand-made maps are for. Its Normal-types moved to Tall
Grass and Tangela to the Deep Woods, at weight 2 rather than the 10–12 they had
in a table with no commons to dilute them.

**Every legendary can now turn up in every map, and its own types decide how
often**: the full share where the biome shares one of them, a fraction of it
everywhere else. The Power Plant is still the best place to hunt Zapdos and is no
longer the only one; Tall Grass, being Flying, is the one map where all three
birds are at home.

| | Matched | Stray | Legendary share of finds |
|---|---|---|---|
| weight | 0.50 | 0.08 | |
| Tall Grass | Articuno, Zapdos, Moltres | Mewtwo, Mew | 0.93% |
| Power Plant | Zapdos | the rest | 0.91% |
| Ember Caldera | Moltres | the rest | 0.87% |
| Frost Hollow | Articuno | the rest | 1.04% |
| Haunted Tower | Mewtwo, Mew | the rest | 1.42% |
| Deep Woods / Pond / Rock Ridge | — | all five | 0.34–0.39% |

Both weights are small on purpose: five legendaries in every table would
otherwise make the per-map legendary rate five times what one used to be. At
these numbers each map finds one about **once in a hundred encounters**, which is
where Zapdos-in-his-own-plant already sat, and `npm run check` asserts no map
drifts past 2%.

And this is **a rule, not a table**. A Gen 2 Suicune needs one dex number added
to `LEGENDARY` and nothing else — which matters, because Gen 1 has no grass,
water or rock legendary, so those three maps are carrying only strays until a
later generation fills them in.

### Nothing is locked

Every area is open from the first minute. **The ball economy paces you instead**:
a Lapras needs roughly four Ultra Balls to land, so at ¥300 and a pocket of Poké
Balls you can walk into Frost Hollow and simply not be able to farm it yet. That
is a gate that never says *no* — it says *not yet*, and shows you why.

Trainer level spends itself on the shop rather than on doors: Great Balls unlock
at Lv 6, Ultra Balls at Lv 12. Same pacing, stated as a reward instead of a wall.

### Maps are generated, and organic

`tools/build_map.py` builds each area from a short spec. The shapes matter as
much as the tiles: the path **wanders** rather than running straight, and ground
grows in **ragged blobs** rather than blocks. Feature seeds sit on a jittered
grid, because pure noise clumps them into one corner and leaves half the map
bare. Everything comes from a positional hash, so there is variety but the result
is identical on every run.

It then asserts what the renderer depends on — every tree 2 wide and at least 3
tall, every path and pond at least 3 wide, every spawn tile reachable from the
spawn point — and repairs what the wandering path breaks: cutting through the
tree frame orphans half a tree, so those are dropped rather than drawn as stumps.

`npm run check` closes the loop from the other side, asserting the hand-written
biome config and the generated maps still agree. That is what caught the pond
having only 17 shore tiles — fine as a corner of a world, far too few for a whole
map to pace, so it now has four lakes.

### Evolution — built

There are no battles, so a caught Pokémon never gains levels. Evolution
**feeds duplicates**, like Pokémon GO candy: spend N spares of a species to evolve
one. That gives duplicates a second job besides selling and creates a real
decision every time — cash the spare Pidgeys, or feed them for a new dex entry.
See **Evolution: the level sets the price** above for how the bill is worked out,
and `npm run check` walks all 70 chains.

### Community tilesets

`npm run tilesets` pulls the sheets listed in `tools/fetch_tilesets.py` into
`.assets-src/community/` (source art; not shipped). DeviantArt pages embed a
signed full-resolution download URL in their HTML, which is what the script
reads — the displayed image is a cropped, downscaled preview.

**Only one of them is actually in the game**, and that restraint is deliberate:
the map runs on the authentic FireRed tileset, which is internally consistent and
matches the FireRed Pokémon and player sprites. Community sheets are Gen-3
*style* but by different artists, so dropping one in beside ours usually reads as
a palette clash rather than an upgrade. The bar is: does it fix something ours
does badly?

| Sheet | Verdict |
|---|---|
| **All Cliffs** — Ekat99 | **in use.** Its mossy boulders are single-tile overlays and its mint grass matches ours almost exactly. Rock Ridge was our worst art; this fixed it. |
| Water Animation / Next Animated Water — Magiscarf | held. Lovely, credit-free, 8 animated frames — but an RPG-Maker autotile with a tan rim where FireRed uses grey stone, so it needs autotile decoding *and* a style decision. |
| Rock Tiles, Tree Tiles — J-Treecko252 | held. Competent, but ours already reads correctly and these are drawn at a different scale. |
| Pond And Bridge — Ekat99 | held. Useful reeds and a bridge if the pond gets a rework. |

Boulders are composited over our own rocky ground and appended to the atlas as
extra tile ids, so there is still one atlas, one `drawImage` path and no renderer
changes — they are simply higher tile numbers.

## Bugs this pass found

Worth writing down, because none of them were visible from the code alone:

- **Arrow keys still walked the player under a confirm dialog**, so you could
  stroll into a wild encounter with a sell confirmation open on top of it and
  two dialogs fighting over Enter. The map keeps its own window listener; it now
  checks a shared modal lock (`src/ui/modal.js`) that any dialog registers with.
- **Frost Hollow had invisible walls** — see the biome art section.
- **The map generator picked the spawn before scattering obstacles**, so with
  the sand path removed a rock could land on the spawn tile. It picks last now,
  and the generator's own assertion is what caught it.
- **Evolving during an encounter silently failed** with "Not enough to evolve",
  because the engine refuses while an encounter is open. The button is disabled
  and says why instead.
- **A save holding an unknown species id crashed the box.** It keeps one and
  treats the rest as spare.
- Two CSS animations used `both` fill on a fade-*in*, which holds the invisible
  start state until the animation runs. Harmless in a real browser, but on the
  battle overlay the failure mode was a permanently white encounter, so it now
  defaults to transparent and carries no fill.
- **The BOX tab did not update when you caught something.** The engine mutates
  its state in place and tells React to re-render, which is fine for anything
  read during render but silently breaks `useMemo`: after a catch `state.box` is
  the same array object, so a memo keyed on it never recomputed. Selling *did*
  refresh, because `sell()` replaces the array — which is exactly why it looked
  intermittent rather than broken. Every change now bumps a `rev` counter that
  memoised panels depend on.
- **`buy()` would have given key items away free** once items with no price
  existed, since the cost of `qty × 0` is 0. It now refuses anything not for
  sale, and a test asserts the shop only ever stocks sellable things.
- The celebration banner named rewards with `ballById`, so the first key item
  would have announced itself as "+1 undefined".
- **The rail and the map only pretended to line up.** Each scroll container
  carries its own `max-height`, and those rules are declared far down the file
  while the responsive block sat up beside `.stage`. A media query adds no
  specificity, so every base rule won on source order: the rail stretched while
  its list stayed pinned to a guessed 400px, leaving the gap underneath. Layout
  overrides now go last.
- **Then stretching made the page scroll.** `align-items: stretch` equalises two
  columns to the *taller* one, and the rail's natural height is its whole list —
  so the map grew to match the box rather than the other way round. The rail is
  now `height: 0; min-height: 100%`, which keeps it out of the row calculation
  entirely: the row is the map's height and the rail fills back into it.
- **`setEngine(e)` was deleted by my own cleanup.** Removing an earlier
  screenshot hook by line arithmetic took the line after it too, so `engine`
  stayed null and the whole rail rendered from an undefined state — an empty box,
  ¥0, level 1 — while the map kept drawing, because the engine owns its own
  animation loop and never needed React. Temp hooks are now removed by matching
  the block text, with an assertion that `setEngine` survives.
- **The Pokédex grid collapsed into slivers** once the rail was made to stretch.
  The cells were squared with `aspect-ratio`, but the columns are `1fr`, so a
  cell's inline size is not known while the browser sizes rows — the ratio could
  not contribute to them, rows fell to the height of the cell's content (~8px),
  and every cell overflowed into the one below. Measuring beat guessing here:
  a probe reported `cell 58x58` but `rows = 8.375px`, which named the culprit
  immediately. The grid uses definite `grid-auto-rows` now, which also gives the
  sprite's `height: 88%` something real to resolve against.
- **Fortune described three different ranks identically.** Its effect was stated
  as a share of finds rounded to a whole percent, and rares are only ~1.2% of a
  table to begin with, so ranks 0, 1 and 2 all read "~1% of finds" — the spend
  dialog showed the same string for NOW and AFTER. It is now stated relative to
  rank 0 (`+10%`, `+20%`, `+32%` …), and a test asserts every stat reads
  differently at every rank, since a choice the panel cannot describe is not a
  choice.

## Roadmap

Phase 1 and Phase 2 are done. What follows is ordered by **one argument**: the two things
that are actually wanted next — more maps and more generations — are both
*multiplying* the game, and it is worth fixing what multiplication makes worse
before doing the multiplying. A save you can lose is annoying at 151 species and
ruinous at 1,025.

Nothing below is locked in. Each phase names the calls that are **yours**, and
any of phases 2–5 can be reordered — with one real dependency, marked.

---

### Phase 2 — Keep what you catch ✅ **done**

*Goal: make a collection durable, and make finishing it mean something.*

**Save export / import.** The whole game was one `localStorage` key — clearing
site data, a private window, a new browser, and the entire dex was gone with no
way back. TRAINER → SAVE FILE exports a dated `.json` and imports one, through
the same confirm dialog selling uses, showing what arrives before it replaces
what is running. The file is checked by `saveProblem()`, which is the **same**
function `loadState` uses — an imported file clears exactly the bar a stored one
does, and there is only ever one answer to "is this loadable".

**Dex medals.** 80 of them, plus the seven counting milestones, and every one is
**derived rather than listed** — so a new species or a new map grows the set with
nothing edited by hand:

| | | pays |
|---|---|---|
| **line** | an evolution family, end to end | 54 | ¥250 × members + balls |
| **type** | every species carrying one type | 17 | ¥1,000 + 3 Ultra |
| **biome** | every species on one map's table | 8 | ¥2,000 + 5 Ultra |
| **dex** | all 151 | 1 | ¥25,000 + a Master Ball |

A species that never evolves is **not** a line — a medal for owning one
Farfetch'd is a participation trophy. Rewards lean on **balls over money**,
because balls are the real bottleneck: a rare costs about four Ultras and money
can already be ground out of duplicates. Over a full dex that totals
**¥127,500 and 191 Ultra Balls**, which `npm run check` prints on every run so
the figure cannot drift quietly. It is deliberately generous; it is also one
table to change.

**Shinies, at 1 in 1,024.** Kinder than the real games (1/8192, or 1/4096 since
Gen 6) on purpose — a full run is a few thousand encounters, so that is a
handful in a playthrough: rare enough to be a story, common enough not to be a
rumour. `npm run assets` now pulls FireRed's shiny palettes too (151 more
sprites, 405 KB), the roll is snapshotted onto the encounter so no re-render can
change the answer, and shininess **carries through evolution** the way it does
in the real games.

The important half of shinies is not the palette:

> **No rare tier is ever sold as a spare, or eaten as feed.**
> Both are bulk actions with no undo, and at these odds there is no farming
> another. The sweep holds them out of the spare list entirely rather than
> sorting them to the front — sorting only protects the first `keep` of them —
> and `feedable()` excludes them from the feed while *preferring* one as the
> hero, since the hero is the one that survives (and comes out the far side
> still whatever it was). `evolveState` and `feedSelection` count through
> that one function, because a panel saying READY over a feed that cannot be
> assembled is the bug that split counting creates.
>
> One predicate, `keeper()`, decides it for both tiers. Shipping the second tier
> protected from one of the two bulk actions and not the other is exactly the
> shape of mistake a second tier invites, so the suite runs **every** case for
> both — and it needs **two** of them, because a lone one is kept by the reserve
> anyway and a lone one is always the hero.

**Origin, at 1 in 512** — the tier above shiny, and the rarest thing in the
game. An Origin wears its **Generation I sprite**: the 1996 artwork, from before
anyone had drawn that Pokémon a second time.

That is the whole tell, and it needs no filter. Both filters were tried against
the real sprites and both were rejected: `saturate(1.9)` is invisible next to the
original, and `hue-rotate()` makes a green Charizard — which reads as a rendering
fault, not as treasure. A Gen 1 sprite beside a Gen 3 one is unmistakable at a
glance, costs nothing at runtime, and is the same trick DelugeRPG's Retro uses.

The catch, and why `tools/build_origin.py` exists: **the two sets are framed
differently.** Measured across the dex, Gen 1 art fills 0.34–0.58 of its 96px
canvas where ours fills 0.53–1.00 of 64px — so swapping the `src` alone draws
every Origin visibly *smaller*, which reads as a bug. Each one is trimmed to its
own art, scaled to the box the FireRed sprite of that same species occupies, and
re-centred on it. Per species, because the ratio is not constant; the scale lands
near 1.0 for most of the dex, so there is very little resampling, and what there
is uses NEAREST.

**Holo, at 1 in 512** — the fourth tier, and the only one whose tell is neither
the drawing nor the colours. A Holo wears the **ordinary artwork, untouched**,
with a band of rainbow light travelling across it, clipped to the creature's own
outline. It is the trading-card treatment, and it is the one tier that can be
described to someone who has never played a Pokémon game.

It shares Origin's odds deliberately, because it is the same *kind* of pleasure:
a familiar picture arriving in a form you recognise from somewhere else. That is
also why it is not rarer — a finish you meet twice a playthrough is a curiosity;
one you meet twenty times is a thing you start hoping for.

Holo is built in **two pieces**, and the split is the same one Astral makes. The
`filter` has to carry the tier on its own, because a Dex cell is a single `<img>`
with nowhere to hang a layer — so the iridescence there comes from three
drop-shadows in pink, cyan and violet, which rim the art without repainting a
pixel of it. The travelling band is a second element, and appears only where
there is a container to put it in: the encounter, and the Forms strip.

What the filter deliberately does **not** do is rotate hue. A full rotation was
tried (the "Prism" candidate) and rejected for the same reason `hue-rotate()`
was rejected for Origin: a green Charizard reads as a rendering fault, not as
treasure.

The four tiers are **mutually exclusive**, and the rarest is rolled first: Gen 1
had no shinies, so a Pokémon that was two of them would have no picture to draw.
Rarest-first is not a style choice either — commonest-first would mean Astral is
only ever reached by a Pokémon that already failed three other rolls, so it would
effectively never happen. `rollVariant()` owns that precedence, reading a single
ordered list, `TIER_ODDS`, so it cannot be written down twice.

| | the tell | odds | ~3,000 encounters | ~10,000 |
|---|---|---|---|---|
| **Origin** | the **artwork** | **1/160** | ~19 | ~63 |
| **Holo** | the **finish** | **1/160** | ~19 | ~63 |
| shiny | the **palette** | 1/240 | ~13 | ~42 |
| **Astral** | the **substance** | **1/480** | ~6 | ~21 |

Four different kinds of rare, which is what lets all four stand together instead
of being four strengths of one idea. Any rare at all lands about **1 in 54**
encounters.

### A Great Ball had to be worth something

`catchChance` clamped to a flat 0.95, and `(rate / 255) × mult` hits that at a
catch rate of `255 / mult` — so a **Poké Ball was already capped against the
fifteen commonest species in the dex**. On a Pidgey, a Rattata, a Caterpie — the
throws you actually make — a Great Ball bought you exactly nothing, and at rate
190 even Great and Ultra were the same number. The 0.03 floor did the same
thing at the other end: all four rate-3 legendaries sat on it with both a Poké
Ball and a Great Ball.

The ceiling belongs to the **ball** now, not the game: the chance of missing
shrinks with what you threw (`1 − 0.2 / mult`), so a Poké Ball's best case is
0.80, a Great Ball's 0.89, an Ultra's 0.93 — and nothing reaches 1, because
that is the Master Ball's job alone. The floor drops to 0.01, low enough that
no species in the dex sits on it and the raw numbers differentiate by
themselves.

| catch rate | | Poké | Great | Ultra |
|---|---|---|---|---|
| 255 (Pidgey) | was | 0.95 | 0.95 | 0.95 |
| | now | **0.80** | **0.89** | **0.93** |
| 45 (Dratini) | both | 0.18 | 0.32 | 0.53 |

**Everything between the floor and the ceiling is byte-identical**, which is
why the rare economy did not move at all — the fix lands only on the commons,
which is where the problem was. `npm run check` now sweeps every catch rate the
dex actually contains and fails if a better ball is ever worth nothing on any
of them.

### The pond crossings were piers

Both spans across the lake were drawn with the `D` deck — a **jetty**, which
runs out from land and stops, and whose outer ring is drawn to meet sand. Laid
across open water it fringed both bridges in beach. They cross water with dry
ground at each end, which is a bridge, so they are `N` now and wear Route 12's
planks — and **two across, not three**, because that plank set is a left half
and a right half and nothing else; a third column comes out left/right/left and
draws a rail down the middle of its own deck.

### A variant is its own pile

A Holo Pidgey used to sit inside a row labelled **Pidgey ×12**, under an
evolve button and a sell button. Nothing could actually take it — `keeper()`
has refused since the first shiny — but a guarantee you cannot see is not one
anybody will trust, and the count was a lie either way.

Rows key on **species and variant** now. Three things fall out of that, and
only the third needed new code:

- **It cannot be sold.** `duplicateUids` and `heldUids` both filter keepers, so
  a variant row has no spares and renders no SELL button at all.
- **It cannot be eaten.** The feed in `feedable` is `!keeper`, unchanged.
- **It cannot be evolved by accident.** This one was real: the hero was always
  the *rarest one present*, which is the right answer when one row stands for a
  whole species and the wrong one the moment rows split — press evolve on the
  ordinary pile and your Holo would be what evolved. `feedable(box, row, want)`
  takes the row's own variant now, and `evolveState`/`feedSelection` thread the
  same answer so a row cannot say READY over a feed it cannot assemble.

A variant row can still evolve, feeding on ordinary duplicates, and the hero
comes out the other side still Holo — that was always the design and it would
have been a real loss to break it in the name of safety.

### Origin is earned, not found

**The 1996 artwork does not appear in the wild until every ordinary Pokémon of
that generation is caught.** All 151, for now. It is the one tier whose tell is
a second set of *real art* rather than a treatment, which makes it the better
reward: finishing the dex stops being the end of the game and becomes the
moment a second one opens, on maps you already know, with nothing else about
them changed. The completion banner says so at the moment it becomes true.

Gated **per generation**, not globally, because the alternative ages badly: add
Gen 2 and a player who finished Gen 1 would lose their Origins until they
finished Gen 2 as well. `genOf` already derives the generation from the dex id,
so this needed no data of its own.

The Dex sheet says `finish the dex` under a locked Origin rather than `not
yet` — telling someone to keep hunting for something that cannot spawn is
telling them to waste an afternoon.

One consequence worth stating plainly: **the completion rosette is now strictly
a post-dex pursuit**, since it needs an Origin. The numbers below describe how
fast variants accumulate once they are all available; nothing completes before
the 151st ordinary catch.

### The spread was the problem, not the rate

These were 1 : 2 : 8 — Astral eight times rarer than Origin — and the ladder had
already been divided by 4/3 once to be kinder. That did not help the thing it
was meant to, because **the completion rosette needs all four variants of one
species**, and a product is governed by its smallest term. Measured at the old
numbers: the chance that *any* of the 151 species finished a 10,000-encounter
playthrough complete was **0.7%**. The rosette, the gold tile border and the
Dex's "Complete" filter were all decoration for an event that would not happen.

Scaling the whole ladder does not fix it either — to make completion reachable
at 1 : 2 : 8 the base has to come to about 1/64, which is a rare every 25
encounters and no longer rare at all. So the **ratio** was compressed to
1 : 1.5 : 3 and then the base loosened. Astral is still the rarest and still
visibly so; it is three times rarer than Origin rather than eight.

| encounters | complete species |
|---|---|
| 3,000 | ~0 |
| 10,000 | ~0.5 |
| 30,000 | ~15 |

A completionist finishes a tenth of the dex; the other 141 are the long game.
And the honest part: **a fully complete 151-species dex is not reachable at any
odds that leave a rare feeling rare** — the maths is a product of 604 separate
rolls on 151 specific species — so nothing here pretends otherwise.

Tune one tier on its own and the ladder quietly re-sorts itself. `npm run check`
measures the ladder against `TIER_ODDS` and measures each tier's *rate* over
400,000 seeded rolls, so it would catch that — but the point is not to write it
by accident.

> **One ordered list, not five copies.** `TIERS` in `biomes.js` is the roll's
> precedence, the Box's choice of which sprite a stack wears, the Dex's mark
> order, the encounter's badge, and the sweep-and-feed protection. It used to be
> five hand-written copies of `["astral", "shiny", "origin"]` in five files,
> which is exactly how a fourth tier ends up protected from the sell sweep and
> not from the feed. Adding a fifth is one row in that list and one drawn icon.

Both have their own encounter animation, and both are pure CSS on transform and
opacity — GPU-composited, one sprite on screen. Shiny gets white-and-pale-gold
**four-point sparks** that pop, swell and go. **Origin** is a *restoration*
rather than a reveal — pale-gold particles fall **inward**, the creature forms
out from its own centre (a growing radial `mask-size`, so it reconstructs rather
than fades), an ancient seal of thin golden rings and twelve tick marks turns
behind it, a gleam sweeps up the body, and amber embers drift off. It plays
**once**; only the embers loop, so a player deciding on a ball still has
something alive on screen. Its silhouette and gleam are masked to `--art`, the
sprite's own PNG, so they follow the creature's outline instead of being
rectangles laid over it.

> **And that masking had never once worked in the real app.** A relative `url()`
> inside a custom property is resolved against the stylesheet that *consumes*
> it, not the element that declares it — so `--art: url(sprites/54.png)`, set
> inline on a React element and read by a rule in `styles.css`, was fetched from
> `/src/sprites/54.png` under the dev server and `/assets/sprites/54.png` in a
> build. Both 404, and a mask that cannot load simply masks nothing: the Astral
> star field and the **entire Origin reveal** drew nothing at all, in every
> build ever made. It looked correct only in the render harness, whose stylesheet
> happened to sit beside the sprites. Found by logging the requests while adding
> Holo's foil, which needs the same trick. `spriteUrl()` returns an absolute URL
> now, built against `document.baseURI` rather than a leading slash, because
> `vite.config.js` sets `base: "./"`.

**Holo**'s band is a `linear-gradient` swept across on loop and masked to
`--art`, composited `color-dodge` — because foil does not paint over ink, it
throws light back off it. Unmasked it is a rainbow rectangle sliding over the
grass behind the Pokémon, which is what the first version looked like.

**Astral** is the rarest and the only one that is not about artwork: a
**starlight duotone**, plus a deep blue and violet
**aura behind the sprite** (behind, so it never washes out the artwork being
collected), white/cyan/lavender star particles, and a thin **orbital arc** that
sweeps round. The scale steps in `steps(4)` rather than easing, which is what
makes them read as drawn frames instead of as CSS.

**Walking pays.** Steps were the one number that only ever goes up when someone
is actually playing, and they bought nothing at all. A parcel every **250 steps**
(about half a minute) and a **haul** every tenth, both scaling with trainer level
the way level rewards do — a parcel of Poké Balls at level 40 is a rounding
error, not a reward.

Only the haul reaches Ultra Balls. That is deliberate: Ultras are what rares
cost, and the loop this game rests on is that commons fund rares, so walking
should let you catch commons *faster*, not skip the funding. Over 50,000 steps
that is **740 Poké, 460 Great and 40 Ultra** — ¥69,900 of ball value, which
`npm run check` prints so it cannot drift.

**And every tenth haul — 25,000 steps — is a Master Ball.** It is the one reward
here that is not "keep doing what you were doing, faster", and it is placed where
it is on purpose: 25,000 steps cannot be ground out in an evening, and the Master
Ball cannot be bought at any price, so this is the only one in the game you earn
by *playing* rather than by levelling. Gated at **level 20** as well as on
distance, because a guaranteed catch handed to a level 4 trainer skips the part
of the game it is a reward for.

That is **two** over a 50,000-step playthrough, against three from levelling — so
the whole game's supply goes from three to five, and `npm run check` pins both
numbers. Master Balls are deliberately left out of the ¥ figure above: they have
no price, and pricing the unpriceable is how a budget check starts approving
them. They are counted instead, and the count is the assertion.

The parcel lands **quietly**: a floating `+N balls` over the STEPS counter, the
same shape money already uses on its own counter. Only the haul is worth a
banner — a 3.2-second overlay every half minute of walking is an interruption,
not a celebration. The Master Ball haul says so in its own words rather than
reusing the haul's line, because "the long way round pays" is not what a
guaranteed catch is. `stepReward()` is pure and *both* the engine and the top bar
call it on the same step count, so the balls granted and the number shown cannot
disagree.

### The minimap

Bottom left of the route, and it answers one question the main view cannot:
**where in this map am I.** Three pixels per tile — two was unreadable at Frost
Hollow's corridor widths and four made a 40-row map a third of the viewport
tall. It carries a white rectangle for what is currently on screen and a red dot
under a white ring for you.

The ring is load-bearing. A red dot alone disappears into Ember Caldera's lava
and a white one into Frost Hollow's ice, so the marker carries its own contrast
rather than depending on whatever it is standing on.

**The engine draws it, not React.** The camera rectangle *is* the camera, and a
second copy of `render()`'s clamp computed a frame later in a component is a box
that lags by a frame and drifts at the map edges, which is exactly where the
clamp bites and exactly where you are looking at the minimap. The terrain is
**baked once per area** to an offscreen canvas — an area's shape does not change
while you stand in it, and repainting ~1,300 filled rectangles at 60fps to move
one dot would be the most expensive thing on screen. Per frame it costs one
`drawImage`, one stroked rectangle and two arcs.

The palette lives in `map.js` beside `SOLID`, because it *is* the legend — the
same table that says `V` is lava says lava is orange — and a second list of map
characters somewhere else is how a new tile ends up painted "unknown" and nobody
notices for a month. `npm run check` asserts every character used by any of the
eight maps has a colour, that every colour parses as one, and one rule that a
picture cannot state for itself:

> **Two walkable levels have to be told apart.** Rock Ridge's plateau and Frost
> Hollow's raised shelf are not reachable from the floor beside them except at a
> single staircase. Painted a shade apart from their own floor, the minimap
> shows a route that is not there — which is worse than showing nothing. Their
> colours are deliberately further apart than they look like they need to be,
> and the suite holds them there.

It hides during an encounter and an evolution — the question then is which ball,
not which corner of the map — and it hides below 980px, where there is no room
for both the route and a map of it. It is **hidden, not unmounted**: the engine
is handed the canvas once, at `createEngine`, so unmounting it would hand the
engine a detached element and every minimap after the first encounter would be a
dead grey box.

### The type filter folds away

Two things were both true and pulling opposite ways. A type is recognised by its
**colour** before its name, so a `<select>` listing eighteen words throws away
what the player already knows by sight — that is why the filter was a palette of
coloured chips. But twenty chips standing open took four rows of a rail whose
whole job is the list underneath them.

So it is a dropdown that opens into the palette: one line closed, wearing the
chosen type as its own badge, and the exact coloured grid it always was when
open. Nothing that used to be read as colour is now read as words; it just
folds.

It cannot be a native `<select>` — `<option>` styling is ignored outright on
some platforms and unreliable on the rest, and this control is *entirely* about
the colour of its options. So it is the one listbox in the project, and it pays
the costs of being one: Escape, click-away on `pointerdown` (a click that starts
inside and ends outside is a drag-select, not a dismissal), arrow keys, focus
returned to the opener, and an `aria-label` that says the type in words because
a screen reader gets nothing from a background colour. Opening it focuses the
**selected** badge rather than the first, because finding the cursor on ALL when
you are filtering by WATER loses your place.

It also takes the **modal lock** — the same counter `Confirm` uses. App.jsx keeps
its key handler on `window` and already bails on `modalOpen()`, so this is the
same claim on the keyboard made by the same mechanism, rather than a second one
that has to be kept in step. Without it the arrow keys walk the trainer while
the menu is open.

### The cast throws something

The float used to be in the water on the *first frame* of a cast — the four
frames of the trainer winding up played over a line that had already landed,
which made the whole animation read as decoration. The lure now flies: it arcs
from the trainer to the tile he is facing over the cast's own duration, with no
ripples and no bob until it is down, because those are things water does to a
float and it is not in the water yet. One tile is not far to throw, so the arc
is mostly lift — peaked at 9px, about the height of the rod tip.

`fishing` carries `fromX/fromY` and `castMs` for it. The alternative was to
pass the beat table into the renderer, and the renderer already takes the
fishing object.

### Running is an item

It was a bare level check at **Lv 3** — the one ability that changes how the
game feels arrived with no object and no announcement, and you were simply
faster one day. The **Running Shoes** are a key item at **Lv 15** now, beside
the Bicycle and the rods, so the panel that shows what you have earned shows
this too and the level-up banner hands it over like anything else. `canRun`
takes the bag as well as the level, and a save written before the shoes existed
is granted them on load — losing the ability to run is the one change a player
would feel immediately.

**There is no official Running Shoes icon**, and that is why this used to be a
level rather than an item. Not in PokéAPI, which has no such item at all, and
not in pokefirered or pokeemerald, whose item-icon directories were both
checked: the games grant the shoes invisibly. Rather than draw a fake shoe, the
icon is **the trainer mid-stride**, cropped out of our own player sheet's run
cycle by `build_assets.py`. It is Game Freak's art, already in the repository,
and it shows the thing the item does. It is the only item icon here that is not
a picture of an object, and that is the deliberate trade.

### The entry sheet, reorganised

It was a flat stack of five equal blocks — header, flavour, facts, forms, stats
— which said everything on the card mattered the same amount. It does not.

**FORMS is why the dialog gets opened.** A mark on a Dex tile tells you that you
hold a Holo of something; only this says what that Holo *looks* like and which
three you are still missing, and in a game about collecting variants that is the
content. So it sits directly under the name now, and the dex text and the
measurements follow as the reference material they are.

**The six base-stat bars are gone.** Nothing in this game reads `stats` — there
is no battling — so they were six rows of precise numbers that could not affect
a single decision, and they were the largest block on the card.

**The dex text lost its coloured bar.** It was the only accent on the card and
it was spent on the one block that is pure reference, which had the hierarchy
exactly upside down. It reads as a quoted passage now: no fill, no border, just
a softer colour and a line length that stays near 62 characters. The
measurements went the same way — three filled tiles the same size and weight as
the FORMS slots above them made a Pokémon's height look as important as whether
you own its Astral, so they are one quiet row of label/value pairs under a rule.

### The tabs wear drawn icons

They were unicode characters — a grid, a ball, a yen sign — picked to be
distinct at 15px, which they were, but they were also five different
typefaces' idea of a shape in a UI that is otherwise pixel art all the way
down. They are five drawn silhouettes now, normalised by
`tools/build_icons.py` from ~1250px sources to 32px shown at 16.

**They are masks, not pictures**, and that is the interesting part. A tab is
pale with dark text when idle and dark green with pale text when it is the one
you are on, so *any* fixed-colour icon is invisible in one of those two states.
Emitted as alpha only and filled with `currentColor`, each icon is simply
whatever colour its tab's text is — which is also why the art was asked for as
single-colour silhouettes in the first place.

### The filter bar gave a row back

Four rows of controls sat above a grid that is the entire point of the panel:
search, then SHOW, then SORT, then TYPE, each dropdown carrying a 9px caption
stacked over it. The captions went first — every one of them repeated what its
own value already said, and "All 151" is plainly a filter where "By number" is
plainly a sort. Then the three axes moved onto one row, with TYPE shrunk to a
**swatch**: it only ever shows one badge, so it takes what that badge needs and
gives the rest back. Two rows instead of four, and about 70px of grid returned.

The interesting part was the wrap. A flex **basis is the wrap threshold, not
the final width** — at 118px the three summed to exactly the 330px a rail has,
and the longest type badge (FIGHTING, an 82px swatch) tipped it over, dropping
the swatch to its own line and putting the row count straight back to three the
moment anyone filtered by a long-named type. 100px of basis leaves headroom,
`flex-grow` still fills the row, and the selects end up the same width they
were. Checked at 360px against FIGHTING beside the longest option the game can
show, because a native `<select>` clips rather than ellipsizing.

### The dex bar says two things

It was a 9px line with one fill. Now it is a 16px track with **two**: the pale
fill is everything you have *seen*, the solid one is what you *caught*, and the
gap between them is the game's to-do list — a number the Dex already knew and
never showed. The percentage sits at the right-hand end of the count above it.

The interesting part was why it looked thinner than its own 9px. On a wide
screen `.rail > .panel` is a **column flex container**, so the bar is a flex
item — and a flex item with no content shrinks first when the grid below it
wants room. It was never 9px tall; it was however many pixels were left over.
Thickening it alone would not have fixed that, and nothing in the rule said so.
`flex: none` did.

**A "seen but never caught" view** was already built — the Dex has had a SEEN
chip since the FilterBar landed. It got a **SHINY** chip beside it instead.

**Your calls, answered:** generous rewards, and kinder odds.

---

### Phase 3 — Make it feel like a game

*Goal: the loop is mechanically complete and completely silent.*

| | Why now |
|---|---|
| **Audio** | There is **none** — no throw, no catch, no encounter sting, no music. This is the single largest gap between what this is and what it feels like, and it is a small amount of code against a large amount of feel. |
| **Encounter variety** | Every Pidgey is the same Pidgey: level 2–7 uniformly, everywhere, forever. Per-biome level bands, and the height/weight already in `species.js` used for a "small/large" flavour, cost almost nothing. |
| **Session structure** | Nothing brings you back tomorrow. A daily quest and a streak are the standard answer and they fit the existing XP/money economy without new systems. |
| **Lures and repels** | Bias the encounter table for a while. Interesting because it collides with **Fortune** — two things reshaping the same table need one rule, not two. |

**Your calls:** where audio comes from (the same decompilation the tiles came
from, which is consistent with the standing constraint, or something original),
and whether a daily quest is a *quest* or just a login bonus.

---

### Phase 4 — More world

*Goal: your first stated want — more maps, or bigger ones.*

| | Why now |
|---|---|
| **More maps, or bigger ones** | The generator and the measurement tooling exist: `compose.py` composes against measured bands, `npm run layout`/`npm run shape` flag anything that reads wrong, and adding an area is a spec plus a biome table. This is the cheapest content in the project *per map*. |
| **Do maps connect?** | Today they are switched from a menu, deliberately — no transition tiles between biomes, so every zone would be a hard rectangle butted against grass. Connecting them is a real piece of tile work, not a wiring change. |
| **Day / night** | Changes which table rolls without needing a single new map. **This is the dependency:** Gen 2 has evolutions that only happen at a time of day, so if generations are coming, this wants to land first. |
| **Weather** | Same idea, one layer up, and it gives the eight existing maps a second face. |

**Your calls:** more maps *or* bigger maps (they pull in opposite directions —
more maps means more biome identities to invent, bigger maps means more walking
per encounter), and whether the world connects or stays a menu.

---

### Phase 5 — More generations

*Goal: your second stated want. Last because it is the largest job, not the least
wanted.*

| | Why now |
|---|---|
| **Gen 2 (+100 species)** | `npm run assets` already pulls from PokéAPI, and `genOf`/`GEN_LAST` already know about generations 2–9 — the GEN chip on every encounter was built for exactly this day. |
| **New types** | Dark and Steel arrive with Gen 2 and need badge colours; `KNOWN_TYPES` in `check.mjs` will fail loudly on the first one it does not recognise, which is the point. |
| **New evolution kinds** | Happiness, time-of-day, trade-with-held-item. The evolution graph handles `level`/`stone`/`trade` today and every new kind needs a price rule of its own. |
| **The dex at scale** | The Dex and Box share one `FilterBar` with search and counted chips, which is fine at 151 and will not be at 500. Per-generation filtering, and a look at 1,025 sprites — 405 KB today, roughly 2.8 MB then. |

**Your calls:** one generation at a time or several at once, and whether the
older maps get new-generation residents or the new generations get new maps.

---

### Not planned

Worth saying out loud, so they do not get half-built by accident:

- **Battles.** There are none and the whole economy assumes it — evolution feeds
  duplicates precisely *because* nothing gains levels. Adding battles is a
  different game, not a phase of this one.
- **Trading or anything multiplayer.** The standing constraint is personal and
  non-commercial; a server is neither.
- **Anything that takes payment.** Same reason. No ads, no store listing, no
  distribution.

## Credits

Pokémon sprites, species data, item sprites and evolution requirements via
[PokéAPI](https://pokeapi.co/) (no key needed). Map tileset decoded from, and the
evolution animation ported from, the
[pret/pokefirered](https://github.com/pret/pokefirered) decompilation. **Ember
Caldera's rock, lava and ladders come from
[pret/pokeemerald](https://github.com/pret/pokeemerald)** — its Lavaridge
tileset, the one behind Magma Hideout — because FireRed has no molten tile
anywhere in it. Player
sprites from [The Spriters Resource](https://www.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen/asset/52432/).

**The Poké Ball throw animation is [All Pokeball Sprites for throw animation by
Anarlaurendil](https://www.deviantart.com/anarlaurendil/art/All-Pokeball-Sprites-for-throw-animation-815730891),
used under CC BY 3.0 — attribution required, and this line is it.** 28 balls ×
32 frames on a 64px grid; `tools/build_balls.py` slices out the eight we sell.

**Boulders in Rock Ridge are from [All Cliffs by Ekat99](https://www.deviantart.com/ekat99/art/All-Cliffs-887616852)
— used with credit, as that artist requires.** The Emerald exterior and interior
tileset sheets in `.assets-src/reference/` were ripped by **Heartlessdragoon**,
and the FireRed/LeafGreen outdoors sheet beside them by **ozotwo** (their
own note: credit not needed but welcome, don't claim as own) — they are a
reference for browsing, not a source: everything in them is in
[pret/pokeemerald](https://github.com/pret/pokeemerald) with its real palettes,
layers and collision, which is where map tiles are actually pulled from. If you add any other sheet marked
☆ in the source directory, add its artist here before you share the game.
Uses Nintendo's characters and art — keep it personal and non-commercial: no ads,
no payments, no store listing. **If you add a tileset marked ☆, credit its artist here.**
