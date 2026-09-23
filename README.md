# Dexora

An eight-map, 493-species collecting game: walk, meet, throw, bank the
duplicates, evolve. Kanto, Johto, Hoenn and Sinnoh — the whole National Dex to
Arceus.

**Phase 1 asked one question** — *does "commons fund rares" hold up over an hour,
or is it a grind?* — and it was answered yes: a common nets **+¥14** and a rare
caught with Ultras **costs ¥252 more than it sells for**, both asserted. What was
built to answer it (money, four ball tiers, a shop, storage, selling duplicates)
is all still here, and a good deal more has landed on top: eight hand-made maps
with their tile grammars decoded from the real games, three generations,
evolution paid for in Rare Candy, four rare tiers, fishing, trainer stats, a
daily quest, field items and berries, and legendaries placed by type rule.

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
| `npm run check` | 32 suites over the pure logic, then `tools/play.mjs` — which drives the real engine in Node on a hand-cranked frame clock |
| `npm run play` | Just the engine harness: walk, throw, feed a berry, start a field item |
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
  data/species.js    358 species from PokéAPI (generated)
public/
  sprites/           358 sprites: FireRed art to Lv 251, HGSS above (generated)
  sprites/origin/    251 debut sprites - only where an older drawing exists
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
| Master Ball | **¥50,000**, Lv 30 — never fails, so only the price balances it |
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
`MASTER_EVERY` levels a **Master Ball** — six across the whole curve, with four
more from walking. That divisor is derived from the cap, not chosen: it was every
tenth level while the cap was 30, and extending the cap to 50 without touching it
would have quietly changed the count. **The total is the design; the cadence is
arithmetic**, so `npm run check` prints the count rather than pinning a literal.
The shop unlocking a
tier and the game handing you a few of it land together, so a new ball is
something you get to try before you have to fund it.

**The Master Ball reached the shelf, and the price is what balances it.** It was
unbuyable, on the grounds that a price is only ever a delay — grind long enough
and you could hold twenty. True, and still the risk. What that missed is that an
unbuyable item has no dial at all: the only way to tune it was to change how many
the game *hands* you, and a player who wants one more than the schedule allows
had nothing to do about it. A price is a delay, and a delay is what an economy is
for.

So it is **¥50,000, from Lv 30**, and neither number was picked. Landing a
rate-3 legendary the hard way measures at about ¥1,500 in balls — so at anything
near that the Master Ball becomes the *cheap* way to catch a legendary, which
inverts the whole shelf. At 50,000 it is **34× the cheapest route**: never the
efficient choice, only the certain one. That is what it should be bought for —
the legendary you have already watched run away. Measured the other way, it is
**34% of everything a whole playthrough earns**, which is the other bound: a
ball nobody can afford is the unbuyable one again, wearing a number. `npm run
check` computes both from the live tables and prints them. It stays hidden from the
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

The whole design rests on one number: **74 points against 100 ranks of capacity**
(49 while the cap was Lv 50 - see *The cap went to 75* below). You reach the level
cap unable to have finished four stats, so the screen
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

## Evolution: a level, paid in Rare Candy

Nothing gains levels here — there are no battles — so evolution spends a
currency instead, and **the real evolution level sets the price**. Those levels
come straight from PokéAPI via `tools/fetch-evolutions.mjs` into
`src/data/evolutions.js`.

**One candy is one level, and the bill is the gap.** A Lv 9 Charmander needs
`16 - 9 = 7` candy to become a Charmeleon. Candy comes from converting
duplicates (`CANDY` is tiered 1/2/4/8 by rarity) or from the shop at ¥120,
which is deliberately the worse deal — three common duplicates sold buys one
candy where converting the same duplicate gives one outright, so buying is
always the impatient option.

| Kind | What it costs |
|---|---|
| Level-up | `evoLevel - this Pokémon's level`, in candy |
| Stone | the same, **and** the stone off the shop shelf |
| Everything else | the same, against a *synthetic* level — see below |

**Every non-level method is `bond`.** Happiness, time of day, a held item on a
trade, a move, a place: a game with no clock, no moves and no map transitions
cannot express any of them, and a per-method table grows every generation.
`evoLevel` gives such a row its parent's level plus `SYNTH_STEP`, floored at
`SYNTH_MIN` — derived, never tabled, and `npm run check` asserts a chain always
climbs, because that is the only thing making the derivation sound.

**This replaced a feed**, where evolving spent a pile of duplicates of the same
species. Candy is spent on one `uid`, so the questions that made the feed hard —
which of these six Pidgey is the hero, does the Holo get eaten — cannot be asked
wrong. See *Rare Candy: duplicates became fungible* and *What the feed took with
it when it went* below for why it changed and what went with it.

**`candyValue` reads through to the base form, and that is load-bearing.**
Caterpie evolves at Lv 7 and a wild one can be caught at 7, so it becomes a
Metapod a tier above it for free — "evolve then convert" beat "convert" on every
line whose tier climbs. Reading through makes evolving unable to raise the yield
at all, which closes the class rather than out-tuning one case. `sellValue`
deliberately does **not** read through: cash tracks the species in hand, candy is
a wage for catching, and the two measuring different things is the design.

### Not selling what you were saving

Evolution is the only way to reach the species that never spawn as a first
stage, so the BOX row shows how much candy the next step wants and a stone
evolution prints which stone it needs right on the button.

**No rare tier is ever taken by a bulk action.** The *sell spares* sweep keeps
the best ordinary one of each species and holds every variant out of the spare
list entirely — sorting them to the front only ever protects the first few.
`keeper()` is the single predicate for it, and `npm run check` runs every case
over the `TIERS` list rather than naming two of them: two answers to "which
ones are precious" is exactly how a third tier ships protected from one sweep
and not the other.

**The reserve is one, and it collapsed to one deliberately.** It used to hold
back a whole feed, because a sweep could otherwise eat the Dratini you were
saving. Nothing is saved for anything now, and counting variants against the
reserve meant owning a Holo Pidgey made your only ordinary Pidgey a spare.

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

### The world opens as you level

**This section used to say the opposite**, and the argument it made was a good
one that lost to a better one — kept here because the reversal is the
interesting part, and written up in full under *The world opens as you level*
below.

It said every area was open from the first minute and the ball economy paced
you: walk into Frost Hollow at Lv 1 and simply fail to afford the throws, a gate
that says *not yet* rather than *no*. The trouble is that a new player cannot
act on "all eight are open but seven will waste your balls" until after they
have wasted them.

So `BIOMES[i].level` gates travel — Tall Grass at 1, the Haunted Tower at 20 —
and **`areaOpen()` is the single answer**, asked by the engine's own refusal,
the Travel panel's padlock and the Dex sheet's WHERE TO LOOK. The ball economy
still paces you *inside* a map, which is what it was always best at.

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

There are no battles, so a caught Pokémon never gains levels. Evolution spends
**Rare Candy**, one candy per level, on a single Pokémon named by `uid`. That
gives duplicates a second job besides selling and creates a real decision every
time — cash the spare Pidgeys, or convert them toward anything. See
**Evolution: a level, paid in Rare Candy** above for how the bill is worked out.

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

**Dex medals.** 105 of them, plus 11 counting milestones, and every one is
**derived rather than listed** — which is the point: Johto and Sinnoh grew the
set from 80 to 105 with nothing edited by hand.

| | | | pays |
|---|---|---|---|
| **line** | an evolution family, end to end | 78 | ¥250 × members + balls |
| **type** | every species carrying one type | 18 | ¥1,000 + 3 Ultra |
| **biome** | every species on one map's table | 8 | ¥2,000 + 5 Ultra |
| **dex** | the whole thing, all 358 | 1 | ¥25,000 + a Master Ball |

A species that never evolves is **not** a line — a medal for owning one
Farfetch'd is a participation trophy. Rewards lean on **balls over money**,
because balls are the real bottleneck: a rare costs about four Ultras and money
can already be ground out of duplicates. Over a full dex that totals
**¥328,750 and 400 Ultra Balls**, which `npm run check` prints on every run so
the figure cannot drift quietly — and which is exactly how the older numbers in
this paragraph were caught after two generations landed. It is deliberately generous; it is also one
table to change.

**Shinies, at 1 in 240.** Kinder than the real games (1/8192, or 1/4096 since
Gen 6) on purpose — a full run is a few thousand encounters, so that is a
handful in a playthrough: rare enough to be a story, common enough not to be a
rumour. It started at 1/1,024 and came down when the tier ladder was
*compressed* rather than scaled; see *The spread was the problem, not the rate*
below, which is the reasoning and supersedes any looser figure above it.

`npm run assets` pulls the shiny palettes too, the roll is snapshotted onto the
encounter so no re-render can change the answer, and shininess **carries
through evolution** the way it does in the real games.

The important half of shinies is not the palette:

> **No rare tier is ever taken by a bulk action.**
> Selling spares and converting spares are both one button with no undo, and at
> these odds there is no farming another. The sweep holds them out of the spare
> list entirely rather than sorting them to the front — sorting only protects
> the first `keep` of them.
>
> *(This paragraph used to name `feedable()`, which was deleted with the feed.
> Under candy nothing is consumed but the stone, so "eaten as feed" is not a
> risk that exists any more — the sweep is.)*
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
- **It cannot be evolved by accident.** This one was real: the hero was always
  the *rarest one present*, which is the right answer when one row stands for a
  whole species and the wrong one the moment rows split — press evolve on the
  ordinary pile and your Holo would be what evolved.

**And candy settled the third one for good.** Evolving takes a single `uid` now,
so "which of these is the hero" is not a question the code can be asked, let
alone answered wrongly — the Pokémon that goes in is the Pokémon that comes out,
carrying its own level and its own tier. The machinery that used to answer it
(`feedable`, `feedSelection`, `ANY_HERO`) is gone; see *What the feed took with
it when it went*. A variant still evolves and still comes out the far side
Holo, which was always the design.

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

### R runs

Fleeing was Escape only. Escape is the right key for *dismiss this* and it
stays, but it is also across the keyboard from a hand that is on WASD, and the
button it dismisses has the word **RUN** printed on it. `r` was free — not a
movement key, not fishing (F), not the bike (B) — so nothing had to move to
make room, and the `<kbd>` on the button says R now because that is the key a
player will actually reach for.

### A sale names what it is taking

`Sell spares` said **"23 Pokémon sold, ¥4,140"**. That is a number you have to
*trust*: the box holds thirty-odd rows, the rule for what counts as spare is
three sentences long, and the action has no undo at all. If one of those
twenty-three was a Lv 30 you had been walking up for an hour, you found out
afterwards.

Both sell dialogs now carry a **manifest** — a scrollable list of exactly what
is going, one line per species with the levels beside it, **lowest first,
because that is the order they are taken in**. A Lv 30 sitting in a pile of Lv 3s
is visible before you press the button rather than after. It is a new optional
`manifest` prop on `Confirm`, not a new dialog: `lines` answers *how many* and
this answers *which ones*, and most confirmations in the game are about a single
named thing where a manifest of one would be noise.

The per-row sale lists the individual Pokémon; the whole-box sweep groups by
species, because forty separate lines is not a thing anyone reads.

### The bar got thinner, and stopped being two shapes

The last pass took the dex bar from 9px to 16px to fit a second fill in it, and
16px of chrome above a grid of sprites is a **slab**. It is 9px again, and the
second fill did not have to go: both fills are `position: absolute` in the same
track now rather than flex items sharing it, so they **overlap** — the caught
fill sits on top of the seen fill, at the same left edge, which is the honest
picture since everything caught was also seen.

That also fixed the thing that made it look odd at low percentages. As flex
items each fill was its own rounded pill, so at 3% the bar was a stubby capsule
floating in a longer capsule and the two radii fought. One track has the
rounding now; the fills are square and are simply clipped by it.

`flex: none` stays, for the reason the last pass found it: on a wide screen the
bar is a flex item in a column, and a flex item with no content shrinks first.

### The dex entry says where to go and look

The single most useful thing a Pokédex can tell you about something you have
never met is **where it lives**, and the sheet did not say. Every entry now
carries a **WHERE TO LOOK** block: the areas it rolls in, ordered by how likely
you are to find one there, each marked *common* / *uncommon* / *rare* — and
those words mean common **in that place**, which is the question being asked.
Rods are listed beside them.

`foundIn()` in `biomes.js` reads it straight out of the tables that actually
roll, so it cannot drift from them; move a species between biomes and its entry
updates itself. Two cases needed handling by hand:

- **Legendaries** are appended to every table by rule, so listing their eight
  areas would be true and useless. They get one line: *Anywhere · vanishingly
  rare*.
- **51 of the 151 are in no table at all** — every second and third stage — and
  for those the sheet said nothing whatsoever, on exactly the entries a player
  is most likely to open wondering where the thing is. They fall back to the
  evolution graph: *Evolve Machoke · by trade*.

It shows on the locked entries too, which is the point of it. A silhouette with
no information is a door; a silhouette that names a map is a lead.

### The encounter happens where you are

You could walk to the bottom of Ember Caldera, meet a Geodude, and fight it
standing on **grass under a blue sky** — the battle scene was one fixed
backdrop, and it was the meadow's.

Two halves, and they are deliberately different kinds of thing:

**The floor is the map's own metatile.** `build_ground()` cuts one 16×16 tile
per area out of the same atlas the map draws from, and it reads the ids back out
of `route.json` — `cave.floor`, `volcano.floor`, `tower.floor` — rather than
picking them by eye, because this script is what wrote them there. So the ground
under an encounter is, exactly, the ground you were standing on.

**The sky is CSS**, because a cave's problem is not its floor tile — it is that
there is no sky. Each area sets four custom properties: the gradient overhead,
the tint and the near-ground glow that say what light is falling, and the lip
under the horizon. Rock Ridge is brown dark over warm lamplight, the Power Plant
a badly-lit room, Ember Caldera lit **from below**, Frost Hollow pale with blue
shadows, the Haunted Tower purple-black. Deep Woods keeps the meadow's grass and
changes only its light, which is what being under a canopy is.

Two things went wrong building it, both worth keeping:

- The properties were first set on `.battle-field` — and `.battle-sky` and
  `.battle-ground` are its **siblings**, not its children. A custom property
  only inherits downwards, so every area drew the default. They live on
  `.battle` now.
- The near-ground highlight was a fixed 30% white sitting on top of every tint,
  which washed the cave, the plant and the tower straight back to daylight: a
  dark sky over a floor lit by nothing. It is `--ground-glow`, per area.

`check.mjs` asserts every area has both a floor PNG and a sky block, because
neither half fails loudly — a missing PNG is a blank floor and a missing sky is
the default daylight, which is the exact bug this replaced.

### The wild had no tail

Measured, before anything was changed: **41 of the 151 appeared in no biome
table and on no rod** — every third stage in the game except Dragonite's line,
so **1 of 16**. They existed only as something you built in the Box. And the
starters were not comparable with each other at all:

| | best share, before |
|---|---|
| Charmander | 10.66% |
| Squirtle | 0.99% |
| Bulbasaur | **0.86%** |

A twelfth of Charmander's odds, and then eight of them to reach an Ivysaur that
appeared nowhere, and eight of *those* for a Venusaur that appeared nowhere
either. Bulbasaur and Squirtle are weight 8 now, alongside the rest of their
maps' mid-tier residents. **Charmander was left at 10** — it is an outlier, but
the ask was a kinder game and trimming it would have made something worse. Ember
Caldera's table is also the smallest in the game, which is half of why its share
is high.

**Evolved forms now appear in the wild, and they are DERIVED, not listed.**
Forty-one new rows across eight tables is exactly the data `legendsFor()` exists
to avoid — a species written into a table twice has two different sets of odds
in the same map and nothing fails when they disagree. So it is a rule over the
evolution graph: everything a biome already spawns brings its line with it.
Adding a species to a table brings its evolutions for free, and Gen 2 costs
nothing here.

Three numbers, and **the floor is the one doing the kindness**:

- `EVO_SHARE` **0.2** — an evolved form is a fifth as common as what it comes from.
- `EVO_FLOOR` **0.3** — but never rarer than this. Proportional weight alone
  compounds: a Lapras at weight 1 would give its line 0.04, which is not a
  chance, it is a rounding error. The floor is what makes the *hardest* species
  findable without touching the easy ones.
- `EVO_STEP` **8** — one more step of a line opens every eight levels, ramping to
  full strength over the following 24.

**Depth is measured from what the map already spawns**, not from the bottom of
the line. Ember Caldera lists Charmeleon by hand, so Charizard is one step away
*there* (Lv 8) while Venusaur is two steps from Deep Woods' Bulbasaur (Lv 16).
That is the honest reading of "how far is this from something I can already
find". A hand-written row always keeps its own weight and gets no derived one,
but it still seeds the next step.

What it comes to:

| | wild species | |
|---|---|---|
| Lv 1 | **100** of 151 | base forms only — the early game is unchanged |
| Lv 16 | 142 | |
| Lv 32 | **151** | everything in the game has a place to be found |

Deep Woods at the cap: Bulbasaur 5.62%, Ivysaur 1.12% (from Lv 8), Venusaur
0.22% (from Lv 16) — about one in 450 encounters, which is a hunt rather than a
grind. Blastoise and Dragonite land near 0.2% in Pond & Shore.

**Legendaries got harder everywhere, and that needed no change.** They are
appended to every table at a fixed weight, so anything that grows a table
dilutes them: 0.93% → 0.77% in Tall Grass, 0.30% → 0.24% in Pond & Shore. The
suite asserts the share can only ever fall, because a floor applied carelessly
could have raised it and nothing else would have noticed.

**Fortune compounds with this on purpose.** It raises every weight to a power
below 1, which flattens a table toward its tail — and the tail is now where the
evolved forms live. A trainer who built for Fortune is the trainer who finds
Venusaurs.

### The shore was a swimming pool

Pond & Shore was the only biome whose type list was a single type, and it read
as one: thirteen rows, twelve of them Water. Half that map is bank — sand, grass
and a stand of trees — and nothing lived on it. Oddish, Bellsprout, Paras,
Exeggcute and Tangela now hold about **20%** of the table between them.

The type list is not decoration — `legendsFor()` matches legendaries against it
— so adding `"grass"` is a real change. It is a no-op today because no Gen 1
legendary is Grass, and it is the right answer the day a Celebi exists.

### The sale shows you the Pokémon

The manifest added last pass listed names and levels. A name is something you
read and then check; **a sprite is something you recognise before you have
finished reading**, which is what you want from the last screen before an action
with no undo. `manifest` rows take an optional `icon`, so both sell dialogs draw
the real art — the per-row one at the variant it is actually selling, the sweep
always ordinary, because `duplicateUids` holds every keeper out of the spare list
entirely.

### The twenty minutes that demoted everybody's dex

Reported as "why is the dex misty, and I think I lost my data". Both halves are
right, and the second one is mine.

**Misty is the *seen but not caught* state** — `.cell.seen img { filter:
brightness(0); opacity: .3 }` — working exactly as designed. The whole dex looked
like that because the whole dex really had been demoted to *seen*.

The cause was a build that existed for about twenty minutes. Padding the dex for
the new generations first used `normalise`, which exists for the one-bit tier
rows and coerces `? 1 : 0` — so every **caught** species in every save that
loaded under it became merely **seen**, and was written straight back out. The
code was fixed before it was committed. The saves were not, because a dev server
picks up a source edit the moment it is made.

**`repairDex` recovers what the file can still prove.** Two things in a save
cannot be wrong about a catch:

- a Pokémon **in the Box** was caught — there is no other way for it to be there;
- a registered **variant** was caught — `rollVariant` only ever fires on a catch,
  and the tier rows are one-bit, so `normalise` could not damage them.

It runs on load, only ever raises a 1 to a 2, and is a no-op on a healthy save.
It is **not complete**, and that is worth stating plainly: a species caught,
registered, and then sold or evolved away with no variant left no trace, and
nothing can bring those back.

Two smaller things in the same report:

- **The top bar said `/151`.** Typed in, survived two generations, and told every
  player they had finished at 151 of 358. It reads `SPECIES.length` — off the
  data rather than threaded as a prop, because `total` already means "catches
  made" two rows down, and one word meaning two things is how this gets made
  twice.
- **Origin gating was already correct.** Completing Kanto opens Kanto's Origins
  and leaves Johto's and Sinnoh's locked; `check.mjs` asserts all three
  directions. Nothing to change — verified rather than assumed.

### One region at a time

358 cells is nine screens of scrolling, and Hoenn alone would be another 135. The
Dex filter row gains a **REGION** select — *All / Kanto / Johto / Sinnoh* — and
the counts on it are what you have **caught** in each, because "Johto 12" is a
progress bar you can read at a glance where "Johto 100" is a fact about Pokémon.

`GENERATIONS` is derived from what actually shipped, so a region appears the day
it is fetched and **the gap where Hoenn is never shows up as an empty tab**.
`check.mjs` asserts the regions add up to the dex and that none of them is empty.

It also had to move below `genOf`: it is an IIFE, it runs at module init, and
placed above it the whole module threw `Cannot access 'genOf' before
initialization` — the same temporal dead zone that once blanked the BOX tab.

### Johto and Sinnoh, and the hole where Hoenn is

**358 species: Kanto, Johto, Sinnoh — and no Hoenn, deliberately.** Gen 3 is
skipped so the dex is *not* contiguous, because a dex that runs 1..N with
nothing missing hides every assumption that a species id is an array index. The
hole is the test.

It found the big one immediately.

#### A dex id is not an array index

`SPECIES[id - 1]` and `dex[id - 1]` were everywhere — 44 of the first, 17 of the
second — and both are correct for exactly one shape of dex. Ids now run 1–251
and then 387–493 while the array holds 358 entries, so `SPECIES[486]` is
`undefined` and `dex[486]` is off the end of a 358-byte row. **Every catch,
every dex mark and every variant byte for a Sinnoh species was writing into
nowhere.**

Two lookups replace them, built once as Maps because the Dex grid asks per cell
per render:

| | |
|---|---|
| `speciesById(id)` | the species, by national number |
| `dexIndex(id)` | its **position**, which is what every per-species byte array is keyed on |

#### The saves nearly died twice

`loadState` read `s.dex.length !== 151` and returned `freshState()` — so the
update that added two generations **would have silently deleted every collection
that existed.** It pads now.

And the first padding fix used `normalise`, which exists for the one-bit tier
rows and coerces with `? 1 : 0` — it would have quietly demoted every *caught*
species in every save to merely *seen*. `padDex` is the same function one value
apart.

Padding is exactly right rather than merely adequate, and it is worth knowing
why: **Kanto sits at the front of `SPECIES` in id order**, so position and
`id − 1` agree for the first 151 and old bytes land where they already were.
`check.mjs` asserts that alignment — insert a generation before Kanto one day
and that assertion is the only thing that will notice.

#### Origin is *debut* artwork

The tier was written as "the Generation I sprite" because Gen 1 was all that
shipped. Its identity — *the drawing from before anyone had drawn it a second
time* — generalises without changing a word: Johto debuted in Gold/Silver,
Sinnoh in Diamond/Pearl. Read literally as "Gen 1 art" it would have made the
second-rarest tier a Kanto-only curiosity for 207 of the 358.

All 1,074 sprites (ordinary, shiny, Origin) now land on one 64×64 canvas.
FireRed drew 1–386 at that size already; Sinnoh comes from HeartGold/SoulSilver
at 80×80 and is reframed, because an 80px sprite in a 64px slot is not "a big
Pokémon", it is a different size from everything beside it in a Box row.

#### Legendaries are a *share*, not a weight

This is the anti-dilution answer, and it arrived the hard way. The old weights
were absolute — 0.5 matched, 0.03 stray — which works for a fixed number of
legendaries in a fixed-size table and nothing else. Going from **5 legendaries
to 24** in tables that roughly tripled would have multiplied the legendary rate
per map by about five: the rarest thing in the game becoming commonplace purely
through the arithmetic of adding content.

`LEGEND_SHARE` is **1% of whatever the table turns out to be**, split among the
legendaries by whether the biome matches their types. Add a generation, a
legendary or a map and the rate a player experiences does not move — by
construction, not by re-tuning. Measured at every level on every map: 1.00%.

#### A generation *arrives*

207 species could have been poured into the eight tables on day one, and that
would have wrecked the thing this game is actually tuned around: the first hour.
A new trainer would meet Bidoof before Pidgey, and every measured weight in
`RESIDENTS` would have been halved by arithmetic nobody chose.

So a generation arrives on the same clock the maps do. It reuses
`encounterTable`'s existing level argument, so it is a filter rather than a
mechanism, and it turns "we added 200 Pokémon" from a dilution into an event.

**The ladder is derived, not listed** — Gen 1 from the first minute, then one
every `GEN_STEP` (5) levels from `GEN_FIRST` (10). `GEN_LAST` already carries
all nine generations, so all nine gates exist today and the five that have not
shipped are already paced, out to Paldea at Lv 45. That matters because the
default is the dangerous one: a generation with no gate opens from the *first
minute*, so a table would have to be remembered on the day Unova ships.

| | Tall Grass holds | the mix |
|---|---|---|
| Lv 1 | 31 species | all Kanto |
| **Lv 10** — Johto | 98 | 71% gen 1 · 29% gen 2 |
| **Lv 15** — Hoenn | 148 | 46 / 17 / 37 |
| **Lv 20** — Sinnoh | 206 | 42 / 15 / 32 / 11 |

**These were 22 / 28 / 35, and they came down because half their justification
had gone stale.** The argument above — that every measured weight in `RESIDENTS`
would be halved — was written before `BAND_SHAPE` and `balance()` existed. Now
the rarity mix is held by the thing whose job that is: across the *entire*
ladder, Lv 1 to Lv 50, Tall Grass's common band moves 78.2% → 71.8% and its S
band 3.2% → 3.3%. What a generation really costs is the findability of any one
species — Pidgey goes from 12.4% of encounters to 5.4% — and that is the number
to watch, because a daily quest and a specific hunt both feel it.

#### Homes by rule, and one new evolution kind

The eight hand-measured Gen 1 tables are untouched. The 207 newcomers get homes
from their **types** — each to the single biome it overlaps most, ties by map
order, anything matching nothing to Tall Grass. Only species with no shipped
pre-evolution need one; the rest are reached by evolving. That rule quietly
handles the hole too: Roserade evolves from a Gen 3 Roselia that does not ship,
so nothing evolves into it, so it needs a table entry — and gets one without
anybody noticing the gap.

Gen 2 brought happiness and time-of-day; Gen 4 brought held items on trades,
moves in the moveset, places on the map and three new stones. A game with no
clock, no moves and no map transitions cannot express any of them, and a table
of per-method rules grows every generation forever. They collapse to one kind,
**`bond`** — "keep raising it" — and `evoLevel` already gives any row without a
level a synthetic one derived from its parent. **The design held: a third of
Johto's evolutions arrived needing no new code at all.**

The three new stones *are* real, though, and were missing from the shop on the
day the species arrived — a stone that is not buyable is not a hard evolution,
it is an impossible one. `check.mjs` now asserts `STONES` against `EVOLUTIONS`
in both directions.

#### What else moved

- **`MILESTONES` stopped at 151** and is now a ladder to `SPECIES.length`, with
  151 keeping its reward as *Kanto finished*. A milestone nobody can reach is
  the one kind of reward that costs nothing to leave broken.
- **`content-visibility: auto`** on the Dex cell — the lever noted two passes
  ago, pulled now that a full variant dex is 358 animating masked layers of
  which a dozen are ever on screen.
- Payout and Master Ball bounds became **rates** rather than totals, because the
  totals are allowed to grow with the dex and the rates are not.
- Dark, Steel, Fairy and Dragon joined the biome type lists — not decoration:
  both the home-finder and `legendsFor` match on them.

Bundle at the end of that pass: 108 KB gzipped JS, 4.7 MB of assets for 1,074
sprites, 20 suites, clean boot, no console errors. (A snapshot of that day, not
of now — `npm run check` prints the current figures.)

### QA pass: three findings, one of them mine

A sweep over the joins the unit suites do not cover — map ladder against spawn
ladder, item unlocks against map unlocks, the economy per map at its own unlock
level, and a scan for exports nothing imports.

**The Dex was hiding locked doors.** 138 mentions across the entries named a map
that is gated, with no hint of the gate — the panel cheerfully told a Lv 3
trainer that Lapras is common in Frost Hollow. Two different things can hold a
line back (a map's unlock, an evolved form's), and they are the same *kind* of
number from the player's side, so `foundIn` prints the later of the two: **one
number meaning "not before this level"**, and the sheet needed no change at all.
`check.mjs` asserts no entry names a gated map with a level below its gate.

**66 tiles of water you could not fish.** `castable()` tested `"wW"` — outdoor
water and the Rock Ridge spring — and Frost Hollow's water is `k`, because that
map is transcribed from Seafoam and carries its own ids. So you stood at the
edge of an ice lake, pressed F, and nothing happened and nothing said why. That
reads as a broken rod rather than a rule, because there was no rule. `K` stays
out: it is the waterfall, which is falling.

**And one finding that was mine, not the game's.** The probe reported the Old Rod
(Lv 4) as unusable until Pond & Shore (Lv 6) — it had asked which biomes have
`"water"` in their *type list* rather than which maps have water *tiles*. Tall
Grass has 24 of them and is open from the first minute. The harness was wrong;
measuring the thing itself is the only reason that was caught.

Everything else came back clean: **151/151 species obtainable by Lv 20**, no
levelling stall (~2,500 steps to the last map), no export nothing imports, and a
boot with no console errors.

### The evolution card was the feed's last survivor

Reported as confusing, and it was — but "confusing" is the kind half of it.

The card showed the level of the best one you already **own**, on a screen whose
nameplate shows the level of the one **in front of you**. Two `Lv` numbers about
two different individuals, a hand's width apart. And I made that worse two passes
ago by *adding* the `Lv` prefix to disambiguate it from the old merge counter —
I fixed one ambiguity and manufactured another.

The reason to delete rather than relabel is one step behind that: **under candy
the throw no longer decides it.** The card was built for the feed, where catching
one more of the species genuinely moved the bar — "9/16 caught" was a number the
throw was about. Candy is fungible, so this Growlithe is two candy toward
*anything* and has no special relationship with the Growlithe in your box at all.
The card did not merely read oddly; it implied a link that no longer exists.

So this was the real remnant of merge-to-evolve in the wild encounter, spotted
two passes ago and patched too shallowly — the label was a symptom and the card
was the thing.

Nothing is lost with it. The stone it sometimes named belongs where you act on
it, which is the Box; the odds per ball are on the rail; and **the one level that
does matter here is still on the nameplate**, because a wild evolved form arrives
grown and a Lv 34 Venusaur is thirty candy of progress you did not have to pay
for. `box` is no longer passed to `Encounter` at all.

### The world opens as you level

This reverses a decision the design document argued for, and the old argument is
worth keeping because it was a good one:

> Nothing is locked. The ball economy paces you instead — walk into Frost Hollow
> at level one and simply fail to afford the throws. A gate that says "not yet,
> and here is why" beats one that says no.

It lost to a better one. **A new player handed eight maps at once has no idea
which of them is for them**, and the honest answer — *all of them, but seven will
waste your balls* — is something you can only act on after you have wasted them.
A ladder says the same thing in advance.

| | | | |
|---|---|---|---|
| Tall Grass | 1 | Power Plant | 12 |
| Deep Woods | 3 | Ember Caldera | 15 |
| Pond & Shore | 6 | Frost Hollow | 18 |
| Rock Ridge | 9 | **Haunted Tower** | **20** |

A locked row still shows its **name and its types**. That is the whole reason to
draw it rather than hide it: the ladder is a thing to read ahead on, and a list
that grows out of nowhere teaches nothing about where you are going.

`areaOpen()` is one function, used by the engine's refusal *and* the Travel
panel's padlock — a menu that offers a map the engine will not travel to is worse
than no menu. And `loadState` sends a save home if it is standing somewhere its
trainer has not earned, because maps were all open once and without that a Lv 5
save parked in the tower would be stranded: `travel` now refuses to move it and
every other map is a lock away.

The suite asserts the **shape** rather than eight numbers — somewhere to start,
somewhere to finish, nothing out of order, nothing past the cap, and `MAP_LAST`
strictly under `MAX_LEVEL` so you always reach the end of the ladder with
levelling left to do. Inside a map nothing is gated; the ball economy still paces
you there.

### A harder throw that runs away less

Two changes pointing deliberately **opposite** ways.

`PLAIN_MULT` is **0.8**, down from 1.0. Done on the ball rather than by scaling
`rate` or putting a handicap inside `catchChance`, because both of those move
every ball at once and re-tune the rare economy `catch.js` exists to defend. The
cheap throw is the only thing that should get worse — and it widens the plain
ladder from below, which is the direction the Great Ball wanted anyway:

| | was | now |
|---|---|---|
| Poké at rate 255 | 0.80 | **0.75** |
| Poké at rate 45 | 0.176 | **0.141** |
| Great at rate 45 | 0.318 | 0.318 |
| Ultra at rate 45 | 0.529 | 0.529 |

And fleeing came **down**: `0.2 + (1 − rate/255) × 0.4` → `0.12 + … × 0.3`. A
common now waits around eight times in nine and a legendary flees two in five
rather than three. Both numbers moved together so the *shape* — rarer flees more
— survives intact. The point of pairing them is that an encounter is **harder to
finish and lasts longer**: a failed throw is a setback rather than the end of it.
Losing a rare to a flee on throw two is the version of this game nobody wants.

**The assertion earned its keep immediately.** `PLAIN_MULT` is shared with the
four situational balls, because a Net Ball thrown at something that is not a
Water type *is* a Poké Ball — but each `bonus()` returned a typed-in `1.0` for
its unboosted case. So the moment the plain throw dropped to 0.8, an unboosted
Net Ball became **strictly better than a Poké Ball at six times the price**. The
suite already asserted `min(bonus over every encounter) === ball.mult`, and that
is what caught it.

### Skipping the evolution

The catch animation has had a skip for a long time and this did not, and they sit
in the same place in the loop — you are watching something whose result you
already know. Click or press Space/Enter/Escape during the sequence to jump to
the reveal; the same key on the reveal closes it, so there is one rule rather than
two.

It jumps to the **end of the cycle** rather than cancelling: `paint()` has to run
the last pair or the two sprites hold whatever scale the flash caught them at, and
the reveal opens on a half-grown Pokémon.

### A literal is not a rule

Three assertions broke this pass, and all three for the same reason: they pinned a
*number* that was only ever standing in for a *rule*.

- `fleeChance(255) === 0.2` meant "a common waits around".
- `liveMult(timer, {throws: 0}) === 1` meant "nothing extra on the first throw".
- `mb <= 3`, last pass, meant "walking must not out-give levelling".

Every one of them failed on a retune that did not touch the thing it cared about.
They are written as relationships now — `fleeChance(3) > fleeChance(30)`,
`liveMult(timer, …) === timer.mult` — and the numeric ones that remain are
*bounds* with a reason attached, not snapshots.

### The Dex grid was a wall of stills

"The animations don't run in the dex tab" — right, and the reason was a claim in
`CLAUDE.md` that had been wrong for months: *a Dex cell is one image with
nowhere to hang a layer.* `.cell` is a `position: relative` button with
`overflow: hidden`. It is a container. The claim was true of the **sprite** and
got written down about the **cell**, and a note like that is self-fulfilling —
nobody puts a layer somewhere the documentation says there is no room.

Every screen that draws a variant now draws its treatment: **grid cell, sheet
portrait**, FORMS strip, Box row, encounter, evolution reveal.

Two details that are not nudges:

- **`inset: 6%` on the grid cell's foil.** The sprite is drawn at 88% of the
  cell and centred, so a layer at `inset: 0` masks itself to a silhouette 14%
  larger than the sprite it is supposed to be sheening — close enough to look
  like a rendering fault rather than a misalignment.
- **`z-index: 4` on the marks, the number and the rosette.** The foil is 3 and
  they carried none, so a Holo tile had a rainbow travelling over its own entry
  number.

`rarest()` only ever names a tier you have **registered**, so the grid cannot
leak an unearned treatment the way the FORMS strip did — and it draws at most
one layer per cell, because it shows the rarest tier rather than all of them.

If 151 animated cells ever costs anything, the lever is one line —
`content-visibility: auto` on `.cell`, which `grid-auto-rows` already makes safe.
It is not there yet, because a realistic save holds a few dozen variants and not
151.

### "5/16" was the merge counter's ghost

Reported from play as a remnant of the old merge-to-evolve system still living
in the wild encounter. The **logic** was gone — there is no live `feedable`,
`feedSelection`, `feedCost` or `reserveFor` anywhere in `src/`, only comments
naming them — but the READOUT was not.

The evolution card said `5/16` over the word EVOLUTION. Under the feed that
meant *five duplicates of sixteen*; it now means *level five of sixteen*. Same
shape, same corner of the same screen, entirely different meaning, and nothing
on it said which. It reads **`Lv 5/16`** now, and the prefix is the whole fix.

The card had a second fault the same size: it printed the stone's name whenever
one was missing, so a Growlithe eleven levels away was told **FIRE STONE** — the
last obstacle named as though it were the next. The stone shows only when it is
genuinely the only thing left.

### A treatment you have not earned

Adding the aura and the sparks to the Dex's FORMS strip quietly started giving
two of them away. An unheld variant is a flat silhouette on purpose — the shape
is a hint and the colours are the reward — and the rule that enforced it named
`.holo-foil` alone, because Holo was the only tier with a moving layer when it
was written. `VariantFx` grew from one layer to three and the rule did not.

`check.mjs` asserts every layer is hidden for `:not(.got)`, over the list rather
than by name, which is the same shape as `keeper()` reading `TIERS`: a rule that
enumerates is a rule that falls behind.

**What animates where**, since this keeps coming up:

| | |
|---|---|
| Encounter | everything, at full size |
| Box row, FORMS strip, evolution reveal | the tier's own layer |
| Dex **grid** cell | nothing, deliberately — one `<img>`, no container |
| An ordinary Pokémon | nothing anywhere. Three of the four tiers are a treatment; ordinary is not one |

### The causeway was a bridge with a shelf attached

Reported as "the bridge is misaligned in Ember". It was not drawn wrong — it was
**two tiles wide with only its left column landing**. The right column ran into
solid rock at both ends, so half the span was a shelf welded to a cliff, which
is what a one-tile offset looks like.

The cause is ordering. `lava_banks()` makes a pool's bank out of the floor beside
it, and in the caldera it runs **four more times after the causeway is laid**,
inside the join loop. A crossing that landed on floor at both ends when it was
placed had one of its landing tiles turned to rock afterwards.

`spans_clear()` was supposed to catch exactly this — it exists because "a bridge
can be broken by something placed after it" — but it asked whether the blob had
walkable ground *somewhere* on its north edge and *somewhere* on its south edge.
One tile of landing passed. It now requires **every column of a vertical span to
land, every row of a horizontal one**, and it runs in `check()` for every map
rather than only where `place_lava` happened to call it.

The repair is `heal_spans()`, and extending is right rather than moving: what the
bank *is*, is the pool's shore, and a bridge is supposed to cross the shore. It
pushes a span out a tile at a time (capped at two — more than that is tunnelling
through a mountain) and eats only bank rock.

The half that took two goes: the whole **width** has to move together. The first
version only extended when every end cell was rock, and the causeway had one
column on floor and one on rock — so it refused to touch it and left the bridge
exactly as broken as it found it. A bridge is one object; it cannot be a tile
longer on one side.

### A tier animates wherever it is shown

Reported as "holo, astral and shiny animations don't work on previews or after
the evolution — it has the filters but the animation stops". Correct, and it was
never anything else: the moving layers existed **only in the encounter**, plus
one hand-rolled copy of the foil in the Dex's FORMS strip. A Holo in the Box was
a still picture with a filter on it.

`VariantFx` is one component now — Holo's travelling foil, Astral's breathing
aura, Shiny's sparks — used by the Box row, the FORMS strip and the evolution
**reveal**. Not during the evolution cycle: that phase is a white silhouette
morphing, and a foil band travelling over a white shape is a rainbow with no
creature in it.

A Dex **grid** cell still gets nothing, and that stays deliberate rather than
forgotten: it is one `<img>` in a four-column grid with nowhere to hang a layer,
which is the whole reason a tier's identity has to survive `filter` alone.

Two false trails on the way, both worth keeping because both looked like bugs:

- Freeze-framing `holo-sweep` at −1.1s showed **no foil at all** on the Box's
  cream background, and it showed on a dark one — which reads exactly like
  `mix-blend-mode: color-dodge` failing on a light ground. Three blend modes and
  an `isolation: isolate` later, an unmasked layer at 0.6 opacity was *still*
  invisible, which is impossible. It was the harness: the sweep runs
  `background-position: 220% → -80%`, and −1.1s is a moment when the band has
  swept off the element. Sampled across the whole 3.6s it is plainly there. The
  glow on the dark background was Holo's **rim** — three drop-shadows — not the
  foil.
- The sparks looked broken for the same reason: `spark` holds `opacity: 0` for
  most of its cycle, so a freeze-frame at the wrong offset shows nothing.

**Sample an animation across its whole cycle before judging it** — this file
already said so, and one frame is not a sample.

### Master Balls, and a bound that was standing in for a rule

Five in a whole playthrough made the Master Ball a museum piece: with five
legendaries in the dex, spending one always felt like a mistake you would regret
at the sixth. It is **ten** now — six from levelling (`MASTER_EVERY` 8 into a cap
of 50) and four from walking (every fifth haul, 12,500 steps, from Lv 15).

Enough to cover every legendary and a few over, which is the point where the item
becomes a decision rather than something to hoard.

The interesting part was the assertion. `mb <= 3` sat beside a levelling count of
three, and it was never really about three — it was standing in for **"walking
must not out-give levelling"**. Raising both halves broke a bound that had no
opinion of its own. It compares the two sources directly now, and a second
assertion pins the *combined* total, because neither half alone is the number a
player experiences.

### Articuno in a volcano

Not a bug — `legendsFor()` appends every legendary to every table, at
`LEGEND_MATCHED` where the biome shares one of its types and `LEGEND_STRAY`
everywhere else. The rule earns its keep: it is what stops any one map being the
map you *have* to grind, and it means a Gen 2 legendary needs one dex number and
nothing else.

But an ice bird in a volcano is the worst pairing the game can produce, and four
strays at 0.08 apiece came to **one encounter in 290** in Ember — often enough to
read as a mistake rather than as a miracle. `LEGEND_STRAY` is 0.03, so a given
stray is about one in 3,000 and a matched legendary is untouched. The gap between
hunting where it lives and hunting anywhere goes from 6× to 17×, which is the
signal the rule was always meant to send.

### "The game stops when I switch tabs"

It never stopped. It **fast-forwarded**, and the fix for that was already in —
for exactly one of the ways it happens.

Every deadline in the engine is an absolute `performance.now()` stamp, so time
that passes while `requestAnimationFrame` is not running has to be paid back. A
`visibilitychange` listener did that for a hidden **tab**. It does not fire when
you alt-tab to another window, or when the window is merely occluded by another
one — and Chrome throttles or stops rAF in both. So the engine came back to a
`now` far past every deadline with no compensation at all, and the phase machine
fired one step per frame until it caught up: a throw left mid-air resolved in six
frames.

The gap is measured **in the frame loop** now, so it needs no event and cannot
miss one. Anything past 400ms between frames is not a frame, it is the tab coming
back — and a hidden tab, an unfocused window, a debugger pause and a sleeping
laptop all look the same from there, because they are the same thing. The
listener is gone.

### An Astral evolved into an ordinary Pokémon

Reported from play: evolving a variant "produces a normal one and an astral
evolution". The engine was innocent — it mutates one box entry in place and
never pushes a second — so this was the scene lying about what happened.

`Evolve.jsx` kept **its own copy of `FOLDER`**. That is right for Shiny and
Origin, the two tiers with their own artwork, and does nothing whatsoever for
Holo and Astral, which are the ordinary sprite plus a CSS filter. So the whole
transformation played out in ordinary art and the Astral only appeared once you
got back to the Box. It is the exact failure this document already records for
shiny, reintroduced by a duplicated constant that was only ever fixed in the
first copy.

The scene takes `spriteUrl()` now and wears `sprite-${variant}` as well —
**both halves of what a tier is**. And the whiten needed `!important` back:
the tier filters carry it, so the duotone would otherwise win during the cycle
and an Astral would stay blue through a transformation that is meant to be a
white silhouette morphing.

`check.mjs` asserts both halves against the source, because neither fails
loudly: a missing folder is the right picture, and a missing class is a picture
that is merely the wrong colour. The second of those two assertions found a hole
in itself — a 200-character window ran past the rule's closing brace into the
next rule, which has its own `!important`, so deleting one of the two passed. It
reads the rule's own braces now.

**Rare Candy wears its real sprite.** It was a text star beside eight
photographed item icons, which reads as a placeholder for a sprite nobody had
fetched — which is exactly what it was. `rare-candy` is in `fetch-items.mjs` now
and draws in all four places it appears: the top bar, the sweep, the row button
and the shop.

### Rare Candy: duplicates became fungible

The old system was already "spend duplicates to evolve" — `feedCost` was
`clamp(evolutionLevel / 2, 3, 20)`, paid out of the line. Candy changes exactly
one thing about it: **a spare Zubat used to be worthless unless you wanted a
Golbat, and is now one candy toward anything.**

That is the real argument for it, and it is not the familiar-levels one: it
makes every ball thrown at every species pay. Ball demand goes *up*.

**1 candy = 1 level, flat, forever.** A rising curve was considered and dropped
— it is a second table to keep in step, and the curve already exists in the
evolution levels themselves (Metapod at 7, Dragonair at 55). It is also why this
scales to 1,025 species with nothing typed in per species: PokéAPI has the level.

| | old | new |
|---|---|---|
| Dragonite | 20 **Dratini**, ~1,600 encounters | ~48 candy, any species |
| Butterfree | 3 Caterpie | 3 candy |
| walls | one bad species stops the line | none — candy is fungible |

Measured over the real tables: **the whole dex costs 1,343 candy, about 910
encounters, ~26% of one 50,000-step playthrough's catching.**

### The yield must not be flat, and that is the load-bearing decision

A flat rate makes the optimal play "farm the highest encounters-per-minute
species and ignore the other seven maps" — here a weight-22 Pidgey in Tall
Grass, no travel, biggest table. Weighting by the tier each species already
carries closes it:

```
CANDY = { C: 1, B: 2, A: 4, S: 8 }
```

Measured spread across the eight maps: **1.48 – 2.58 candy per encounter, a
1.75× range.** Every map is worth walking. Deliberately flatter than `SELL`'s
1 : 2.25 : 5.5 : 15, because cash is optional and candy is progression — if
candy tracked cash, a common catch would be worthless in both.

### A Pokémon is worth what its BASE FORM is worth

Found by assertion, not by reasoning. Caterpie evolves at **Lv 7** and a wild one
can be caught **at 7** — so it evolves for nothing, and Metapod is a tier above
it. "Evolve, then convert" beat "convert" on every line whose tier climbs: a free
multiplier on every catch.

Capping the yield or raising the cheap evolution levels both fix Caterpie and
leave the class open for Gen 2 to reopen. Reading through to the base form closes
it *structurally* — evolving cannot raise the yield, because the yield never
depended on the form. It is also the honest measure: **candy is a wage for
catching, and evolving is not catching.**

A simulation then found the side effect, which is kept deliberately: `sellValue`
does *not* read through, so 22 evolved forms of commons sell for ¥220 and convert
for 1. Selling those and buying candy does beat converting them. No candy is
printed and cash still comes only from catching, so it is a texture rather than a
hole — and a legible one: **commons are candy, rares are cash.** Both currencies
get a natural source. The suite pins the part that matters: it must never reach
the commons, because those are what the grind is made of.

### Buying candy, and why it needs no cap

¥120, three times what a common duplicate sells for. Buying is always worse than
catching — that ordering is the rule, the number is a starting value.

**No purchase cap, and it needs none:** cash comes from selling duplicates, so
cash-bought candy is gated by catching anyway. The sink is self-limiting because
its input is the same input. It also puts candy in competition with Poké Balls
for one wallet, which is the choice that makes the shop interesting.

### Non-level evolutions are derived, not tabled

About twenty Gen 1 species evolve by stone or trade, and PokéAPI gives those rows
no level at all. The obvious fix is `SYNTH = {stone: 25, trade: 30, ...}`, and
the obvious fix is wrong: that table grows every generation and every new method
needs a row in it.

Derived from the chain instead — **parent's level + 10, floored at 16.** Kadabra
evolves at 16, so Alakazam is 26. A Gen 5 trade-with-held-item evolution gets a
sane number on the day it lands with nothing edited. `check.mjs` asserts **a
chain must climb**, over every row, because the derived half is exactly the half
nothing else looks at.

### What the feed took with it when it went

The evolution feed consumed a pile, and every hard part of it was a consequence
of that: which of six Pidgey is the hero, does the Holo get spent to make an
ordinary Pidgeotto, does the panel agree with the selection about what is
available. **Candy is spent on a `uid`, so the question cannot be asked wrong.**

Deleted: `feedCost`, `feedPool`, `feedable`, `feedSelection`, `heldUids`,
`reserveFor`, `ANY_HERO`, `SPENT_ON`, `stoneFeed`, and the Box's "dig into what
an evolution is saving" branch with its `risky` button. `items.js` got shorter.

**The reserve collapsed to one**, and that is a deliberate collapse: it used to
hold back a whole feed (up to 20) because a sweep could otherwise eat the Dratini
you were saving. Nothing is saved for anything now. The one kept back is the best
*ordinary* one — counting variants against the reserve meant owning a Holo Pidgey
made your only ordinary Pidgey spare, because the sweep grouped by species while
the Box groups by species **and** variant. Same rule on both sides now.

**Your calls, answered:** generous rewards, and kinder odds.

### Coming back tomorrow

Phase 4 was four items and one shared risk: **every one of them touches the
encounter table or the reward curve**, which are the two things this project has
repeatedly broken quietly. They are written up here in the order they shipped,
which is also the order of increasing collision.

**The band budgets went in first, and the drift was the opposite of the expected
one.** The deferred note assumed a growing dex would *thin* the rares out.
Measured, adding Johto and Sinnoh **tripled** them: Tall Grass went 5.1% A-tier
to 15.4%, because a newcomer arrives on a flat tier-derived weight while the Gen
1 commons that hold a route together are hand-tuned at 22. The gentlest map in
the game had quietly become a third rare. `BAND_SHAPE` is frozen **per map** out
of its own hand-written table — one global mix would flatten Tall Grass
(78/13/5) and the Haunted Tower (18/51/30) into the same map, and that
difference is the design — and `balance()` rescales whatever the table has grown
into back onto it. `BAND_FLOOR` exists because Rock Ridge has no S-tier resident
at all, and a band with no members would otherwise hand a newcomer a zero and
make it unreachable.

**A derived evolution is banded with its PARENT, and the band travels the whole
chain.** Banding by own tier split Tangela (B) from Tangrowth (A), and the
rescale then made the evolution commoner than the thing it evolves from. Fixing
that pair by carrying the band one step left Mareep → Flaaffy → Ampharos
broken, which is what says the band has to travel the chain rather than a link
of it. Inside one band the scale is uniform, so `parent × EVO_SHARE` survives
the rescale exactly.

**The guarantee is about the residents.** The evolved-form overlay is *meant* to
enrich a map as you level, so the assertion filters depth-tagged rows out —
counting them would be asserting that the feature does not work. Residents hold
to half a point (79.0 → 78.5); with the overlay, Tall Grass reaches
69.8/18.2/9.6, and that is progression rather than drift.

**Pity counts the drought, not the misses.** `state.dry` resets on the **roll**
rather than on the catch, because what is miserable is not meeting one — a
variant that flees still ended the drought. It multiplies the whole ladder
rather than one tier, because `rollVariant` walks `TIER_ODDS` rarest first and
boosting one tier alone re-sorts it. Capped at 10×, or a long drought stops
being a mercy and becomes the efficient way to farm. `rollVariant`'s `boost`
defaults to 1 so the 400k-roll rate assertions still measure unaided odds.

**The daily is a quest, not a login bonus** — your call, and the cheaper one:
everything a quest needs already exists (`advance` reads the same catch event
the medals do). Three kinds, keyed on the date through a hash, so it cannot be
rerolled by reloading. Two details are load-bearing:

- **A quest must be finishable in the map you are standing in.** The first
  version drew its "catch 4 <type>" from the biome's own `types` list, and
  dragon has **two species in the entire game**. `QUEST_TYPES` is derived from
  the starting map by weight share instead — a type has to be at least 5% of
  Tall Grass to be askable — which gives six types and no unfinishable day.
- **The streak caps at seven.** Uncapped, day sixty is worth more than the first
  fifty together, and missing one leaves nothing to come back for — which is the
  opposite of what a streak is for.

**And the lures went last, because they were the collision.** Fortune already
reshapes the encounter table and the band budgets now hold its mix, so a lure
written as a third weight transform is exactly the pile-up the deferred note
warned about. The answer was not to tune one — it was to notice that "make
rares commoner" is three different wishes wearing one word, and to give each of
them its own lever:

| family | what it moves | how |
|---|---|---|
| **repel** | how OFTEN something appears | scales the encounter rate |
| **rarity** | WHICH SPECIES appears | Fortune's own exponent |
| **variant** | WHICH TIER it wears | the variant roll |

Nothing there invents a mechanism; each one borrows the mechanism the game
already had, which is why they compose instead of fighting. `state.field` is
keyed on the family rather than the item id, so "one of each kind at a time" is
structural — a Max Repel replaces a Repel by landing in the same slot, and two
honeys at once is not a state the game can represent.

**The names came out of what actually exists.** `lure`, `super-lure` and
`max-lure` all 404 in the PokéAPI sprite set, which is the sort of thing to
check before naming a feature after it. The `white-flute` is there, and in Gen 3
it already *is* the item that brings out rarer wild Pokémon — so it takes the
rarity job under its own name, and Honey is freed to be the variant family. The
repel line is real and really tiered (100/200/250 steps in canon; ours are
longer because a step here is a tile, and the ratio is what was copied).

**A coloured honey is the jar plus the tier's own treatment, and that is the
whole art budget.** Holo Honey, Shiny Honey and Astral Honey have no sprite and
want none: `art: "honey"` points all four at one picture and `tier` puts the
same travelling foil over it that a Holo Pokémon wears. It is the cheapest
possible drawing of exactly the right idea — you can see what the jar is for —
and it means a fifth tier would arrive with its honey already drawn. There is
deliberately **no Origin honey**: Origin is gated on catching every ordinary
Pokémon of a generation, and an item that shortcuts a gate is the gate deleted.
check.mjs asserts that absence so it reads as a decision rather than an
oversight.

**Bought is no longer used, and the reversal is worth recording.** The first
version had no inventory at all — one click bought and started an effect, on the
argument that stockpiling a consumable you cannot stack is a UI for nothing.
That was right for two items and wrong for eight the moment you try to carry a
Max Repel for the cave you are *about* to enter. They are ordinary bag items
now: bought in quantity from the same shelf as the balls, used from the floating
rail, counted down in steps beside the minimap because an effect paid for in
steps belongs where the steps happen.

### The shop grew past the argument that kept it open

The shop showed every item at every level, greyed with its unlock level printed
where the price goes, and the reasoning was written down: *nothing is hidden,
because a wall you can read is a goal.*

That was written when the shop held nine items. Balls, berries, field items and
stones make **twenty-seven**, and a new trainer saw one row they could buy and
twenty-four they could not. The argument did not become wrong — it stopped
applying. You can aim at one wall. You cannot aim at twenty-four; that is just
the shop being grey.

So a shelf shows what you can buy, plus **the next thing to open**, plus a
count of what is behind it. One goal per shelf, which is what the original
sentence was actually describing.

### The description slot fits 27 characters

Measured off a rendered row rather than estimated, and at the tightest the row
ever gets — 169px, next to "you have 12". Three of the new blurbs overran it
and were cut; the stones' species lists overrun it by design and always have,
which is what the tooltip is for.

That tooltip is now one element at the app root rather than the browser's own:
`title` takes a second to appear, cannot be styled, and the thing it is usually
explaining is text that has been clipped. Every hint in the game is the same
object now — and it had to be a singleton rather than a component beside each
trigger, because the shop and the rail are inside scrollers that would clip
their own bubbles.

### A Piplup the size of a Dialga

`normalise()` puts Sinnoh's 80×80 HeartGold art on the 64px canvas the rest of
the game draws on, and its first version cropped to the art's bounding box and
scaled *that* to fill. Every sprite ends up on the right canvas — and every
sprite also ends up the same size.

Measured across the build: Gen 1 and Gen 2 fill a **median 0.73** of their
canvas, because a Caterpie is small and a Snorlax is not. Every Sinnoh sprite
came out at **1.00**. The raw art had the scale all along — Piplup fills 0.44 of
its 80px canvas against Dialga's 0.99 — so the only correct operation was to
resize the *canvas* and leave everything inside it alone.

**Resize the canvas, never the creature.** `build_origin.py` asserts the median
fill and the completely-full count now, because nothing measured relative size
and every other number looked fine.

### A berry you can spend twice

A second Razz Berry used to replace the first and be worth exactly nothing —
which is a berry you stop carrying, because the long encounter that actually
needs help is precisely where doubling down should be possible. Feeding the
same berry again **deepens** it (Razz ×1.5 → ×2.5, Pinap ×2 → ×4, three deep);
a *different* berry still replaces, at stage one, because one-at-a-time is what
makes them a choice rather than a checklist.

**A berry at its cap is refused rather than eaten.** "Cannot stack" should cost
a click, not a berry, and `berryRoom()` is the single answer that the tile greys
on and that `useBerry` refuses on.

**And a Nanab Berry is a lock.** Not a reduction — zero. A Pokémon that has
eaten one does not run, full stop, which makes it the strongest single thing any
item does here and is why it sits at the top of the berry band at ¥450. What it
is *for* is the legendary that keeps getting away, where the alternative is
losing the encounter outright rather than losing a ball.

### Using something looks like using something

A field item's only feedback was a chip appearing in the far corner of the
screen; a berry's was a line of text in the same box every other message uses.
Neither reads as "that worked" on a fast click, and the honest failure mode is
feeding a second one because you are not sure the first landed. The rail tile
pops, and the berry itself tosses into the scene and settles at the Pokémon's
feet.

Both key off a **counter, not a flag** — remounting is the only way to restart a
CSS animation, and a flag that is already true cannot say "again", which is
exactly what re-feeding needs it to say. The pop only plays when the engine
really spent one: an animation that fires when nothing happened is worse than no
animation, because it is a lie about state.

### Legendaries wear a mark

Twenty-four of the 358 are legendary and nothing said so — you found out by
looking at the catch rate, or by losing one. There is a badge on the encounter
nameplate and in the corner of the Dex tile now.

**It is deliberately not in the row of tier marks.** Those are four things you
can earn; this is a fact about the species, and among them it would read as a
fifth tier. On a Dex tile it only appears on an entry you have at least *seen* —
spoiling which of the unseen silhouettes are the legendaries would hand over the
most interesting thing the grid has left to tell you.

### Berries, and the three rolls they are allowed to touch

Fed to the Pokémon standing in front of you, and chosen on the test the four
situational balls had to pass: **each must key off a different system**, or two
of them are one item with two prices. The Pokémon GO trio lands exactly on three
numbers this game already had.

| | what it moves | where |
|---|---|---|
| **Razz Berry** | ×1.5 catch odds, all encounter | the catch roll |
| **Nanab Berry** | flee chance ×0.35 | the flee roll |
| **Pinap Berry** | double XP on the catch | the XP award |

One at a time, replacing — which is what makes them a choice (safety, odds, or
reward) rather than a checklist you work through before every throw. A berry
lasts the encounter rather than the throw, because a berry you had to re-feed
after every miss is a berry nobody can afford to use on the long fights that are
the only ones worth using it on. Feeding costs no turn and risks nothing: a
berry that could scare the Pokémon off would be a berry nobody spends on the
rare they bought it for.

**The Razz Berry goes through `liveMult`, and that is the load-bearing half.**
`liveMult` is the single answer to "what is this ball worth against this
Pokémon" — the engine rolls with it and the rail prints it — so a berry applied
anywhere else would have the rail advertising ×3.0 over a throw that quietly
used ×4.5, which is unfalsifiable from outside. Going through the ball also
means going through `catchChance`'s own ceiling, so no berry can push anything
to certainty and the ball ladder cannot invert; check.mjs sweeps every catch
rate in the dex for both, and the Master Ball is left alone because it is
already past certain.

**Nanab is a multiplier on the flee line, not a subtraction from it.**
Subtracting flattens the slope that makes rarity *feel* like rarity, and takes
the commonest species below zero — which is how "nothing ever flees at rate 255"
ended up as an assertion. A multiplier is worth most exactly where a berry gets
spent: on the legendary that keeps running away.

**Prices are bounded from both sides, and the reason is on each side.** Dearer
than a Poké Ball or the berry is simply always correct and stops being a
decision; no dearer than half again an Ultra Ball, or the answer is always "buy
better balls instead".

### The senses: a map that feels late, and a Pokémon that is its own size

**Every wild Pokémon in the game was Lv 2-7, everywhere.** Frost Hollow
*contained* later species without ever *feeling* like a later map — the thing
you met there arrived at the level of the first Pidgey of the game. `wildBand`
reads a band off the map ladder that already exists, so adding a map gets it a
band the day it gets a gate, and the span stays constant across the ladder:
widening it later would make a late map a lottery on top of being late, and
which species turns up is already `encounterTable`'s job.

**The tuning is the interesting part, because a wild level is a PRICE.**
Evolving costs `evoLevel - level` in candy, so raising the band lowers what
every evolution bought with what you catch there costs. At a full level of band
per level of gate:

| per gate | Tall Grass | Haunted Tower | free evolutions |
|---|---|---|---|
| 1.0 | 2-7 | 21-26 | 3% … **45%** |
| 0.6 | 2-7 | 13-18 | 3% … 15% |
| **0.5** | **2-7** | **12-17** | **3% … 10%** |
| 0.4 | 2-7 | 10-15 | 3% … 0% |

A full step gutted the candy sink in exactly the maps a player spends the most
time in — which is the flat-candy failure from the other side: one map becomes
strictly best to grind and the other seven are scenery. **0.5 is where a late
map still plainly feels late** (its Pokémon are twice the level of the first
map's) while the free-evolution rate stays at or under the 7% Deep Woods
already had and nobody objected to. check.mjs pins a 15% ceiling, because every
number stays monotone while this goes wrong.

**And `species.js` has carried height and weight since the first fetch with
nothing reading them.** Now the nameplate does: a scale rolled per individual,
so two Rattata are 0.22 m / 1.5 kg and 0.38 m / 6.8 kg rather than both being
"a Rattata". Triangular rather than flat, because the average Rattata should be
an average Rattata — flat makes "unusually large" as common as ordinary, which
is what turns a tell into wallpaper. About **9%** wear an XS or XL tag; the
rest just have their own numbers. Weight scales with the cube of length,
because that is what volume does.

A save written before sizes existed hashes the uid instead — stable, free, and
the difference between an old collection and a box of identical creatures.

**The candy watch-list: three of four stay as they are, and that is the
finding.** Caterpie and Weedle still evolve for free, and that is still the
right call — it happens in the first ten minutes and teaches the mechanic —
and the general class it belongs to is now guarded by the free-evolution
ceiling above rather than by nothing. Charmander is still weight 10 where
Bulbasaur and Squirtle are 8, and trimming it would make Charmander rarer in
the only map it lives in, which is the opposite of the kinder game that was
asked for. Commons-are-candy-rares-are-cash is still a solved decision for 22
species and still gives both currencies a natural source. The same-line
conversion bonus is still held in reserve and still should not be built until
playtesting asks. **None of the four was a defect; the list was a list of
things to look at again, and looking was the work.**

### Phase 3 — The senses — **shipped**

*Goal: the same second of play — the moment a Pokémon appears and you throw
at it.*

Split out of the old Phase 3 because it is one coherent job — **everything here
is about the same second of play**, the moment a Pokémon appears and you throw
at it. None of it needs new systems, new data or new maps; all of it is felt
immediately.

**Audio was the headline here and has moved to Phase 7**, at your call. It is
the only item in the whole roadmap gated on a decision you have not made (where
the sound comes from), and a phase that cannot start until a question is
answered is a phase that blocks the ones behind it. Everything else here is
unblocked, so it goes first and audio goes last.

| | What shipped |
|---|---|
| **Encounter variety** | `wildBand` reads a level band off the map ladder — 2-7 in Tall Grass, 12-17 in the Haunted Tower. Tuned against the free-evolution rate, not by eye, because a wild level is a price. |
| **Flavour on the nameplate** | Height and weight, scaled per individual and finally read. ~9% carry an XS/XL tag; a save without sizes hashes its uid. |
| **The candy watch-list** | Looked at, and three of four deliberately stand. The one class that was a real risk — free evolutions — now has a measured ceiling in check.mjs instead of a note. |

---

### Phase 4 — Coming back tomorrow — **shipped**

*Goal: nothing currently brings you back. Everything here is about the session
after this one.*

All four items are in. The write-up is *Coming back tomorrow* above; this is the
ledger.

| | What shipped |
|---|---|
| **Session structure** | A dated quest with a seven-day streak, on the YOU tab with a `!` on the existing tab badge. Three kinds, six askable types, no unfinishable day. |
| **Band budgets** | `BAND_SHAPE` frozen per map from its own hand-written table, `balance()` rescaling whatever the table grows into, `BAND_FLOOR` for a band with no residents. A derived evolution is banded with its parent, the whole chain. |
| **Pity for the rare tiers** | `state.dry`, opening at 300 encounters, ramping over 100 and capped at 10× on the whole ladder. Silent — your other call. |
| **Lures and repels** | Three families on three levers — repel on the encounter rate, the White Flute on Fortune's exponent, the honeys on the variant roll — plus three berries on the catch, flee and XP rolls. Nothing reshapes one table twice. |

**Your calls, answered:** a quest rather than a login bonus, and pity silent —
a visible counter would make the drought the thing you are playing.

---

### Day and night, on the step counter

*Phase 5's first item, and the one the roadmap said had a dependency: "if
generations are coming, this wants to land first". They came.*

**A real clock was the obvious choice and it is the wrong one.** Tie the sky to
`new Date()` and a player who plays at lunch never sees night, never meets the
one condition the Dusk Ball exists for, and is told about a feature they cannot
reach — which is the complaint Gold and Silver actually got. The clock runs on
**steps** instead: a counter the game already keeps and already saves, so
everybody sees the whole cycle in the order it was designed.

A full day is 1,200 steps — about five parcels of walking — so a session crosses
into night a few times rather than once an hour or once a playthrough. Four
phases, and the two short ones are the point: dawn and dusk are three hours each
against nine for day and night, because a transition as long as the thing it
transitions between is not a transition.

**Night is 38% of the day, and that number is asserted.** It is the one phase
with a mechanic hanging off it, so it has to be a real slice: rare enough that a
Dusk Ball is situational, common enough that you can plan around it.

| | |
|---|---|
| **The Dusk Ball** | boosted at night **or** in a cave — canon, and until there was a clock it could only be the cave half |
| **The scene** | dawn, dusk and night each get their own sky and light over every open map |
| **The readout** | a chip in the top bar that tints with the phase |

**The two Dusk Ball conditions must not collapse into one.** A cave is dark
round the clock, so the ball stays boosted in one at midday — drop that and
"night and caves" is only "night", and the ball loses half of what makes it
different from the other three. The phase tints skip the enclosed maps for the
same reason.

**And the phase is frozen onto the encounter**, exactly like `known` and
`areaId`: a ball that read the clock at throw time would change value because
you took a step mid-animation. `items.js` reads the frozen flag and never
imports the clock, and both halves are asserted, because a live read is
invisible from the outside.

### Today's quest moved to the top bar

It lived on the YOU tab behind a `!` on the tab badge — a fine place to read it,
a bad place to discover it. Reported as *"I am not sure where to see the
missions"*, which is the whole verdict on a feature one tab deep behind a dot.

It is a collapsible chip in the top bar now: the count is what you glance at,
the card is what you open once a day, and the top bar is the only thing on
screen in every state of the game. There is **one** card — the chip renders the
same `Daily.jsx` the rail used to, rather than a second smaller copy that would
drift — and the claim moved with it, because two places to claim from would be
two sources for one number.

### Four times the world

*Phase 5's main item. No new maps, no weather, travel stays a menu — the eight
that exist, four times the size, with four times in them.*

| | was | is | walkable |
|---|---|---|---|
| Tall Grass | 32x40 | **64x80** | 762 → 2,724 |
| Deep Woods | 36x45 | **72x89** | 609 → 3,452 |
| Pond & Shore | 42x34 | **84x68** | 768 → 2,524 |
| Rock Ridge | 42x32 | **84x64** | ~1,000 → 2,799 |
| Power Plant | 40x30 | **80x60** | 546 → 2,584 |
| Ember Caldera | 44x32 | **88x64** | 453 → 2,175 |
| Frost Hollow | 38x22 | **78x46** | 332 → 1,829 |
| Haunted Tower | 34x28 | **76x54** | 309 → 1,280 |

10,068 tiles to 40,740 — 4.05x — and the composition flag list went **down**,
from nine to six, on maps four times the size. The Power Plant had been flagged
on three of its six numbers since the tooling was written and cleared all of
them; Pond & Shore cleared two of three; the meadow cleared `open` and `turns`.

**The extra space is not spent on more field.** Every map that measured "too
open with nothing near you" got tree masses, machine ranks or pillars rather
than more ground — because `open`, `turns` and `tight` are the numbers that say
"this feels empty", and they are the numbers that moved.

**Almost none of it was changing W and H.** What it was, over and over, was a
rule that held for one of a thing and not for four — a staircase placed on
generated floor, a ledge derived by hand against four layers of painting, a
connectivity test that asked a boolean where it needed a count, a generator cap
set at twice the tallest map that had ever existed. Those are written up in
CLAUDE.md under *Four times the map*, because they are what the next person
growing something here will hit.

**And one map could not be scaled at all.** Frost Hollow *is* Seafoam Islands
B3F, read out of its own map.bin, so it grew the only way a copy honestly can:
by copying more of Seafoam. Four floors, in a square, in the order you would
walk them.

### Phase 5 — More world

*Goal: your first stated want — more maps, or bigger ones.*

| | Why now |
|---|---|
| **More maps, or bigger ones** | The generator and the measurement tooling exist: `compose.py` composes against measured bands, `npm run layout`/`npm run shape` flag anything that reads wrong, and adding an area is a spec plus a biome table. This is the cheapest content in the project *per map*. |
| **Do maps connect?** | Today they are switched from a menu, deliberately — no transition tiles between biomes, so every zone would be a hard rectangle butted against grass. Connecting them is a real piece of tile work, not a wiring change. |
| **Day / night** | ✅ **shipped** — see *Day and night, on the step counter* above. The clock exists and the Dusk Ball uses it; what it deliberately does *not* do yet is change which table rolls, because that needs real per-species time data rather than an invented type→time mapping, and inventing one is the eyeballing this project exists to avoid. |
| **Weather** | Same idea, one layer up, and it gives the eight existing maps a second face. |

**Your calls:** more maps *or* bigger maps (they pull in opposite directions —
more maps means more biome identities to invent, bigger maps means more walking
per encounter), and whether the world connects or stays a menu.

---

### Hoenn, and the migration it forced

*Phase 6. 358 species to 493, and the hole in the middle of the dex is filled.*

**Almost all of it was free**, which is the payoff for rules written as rules:

| | what it took |
|---|---|
| species + sprites | one range in `fetch-species.mjs` |
| the region filter | nothing — `GENERATIONS` is derived from `SPECIES` |
| homes in the biome tables | nothing — `encounterTable` places newcomers by type |
| Origin | nothing — `hasOrigin` already said no, because Hoenn debuts in Gen III and its art IS Gen III |
| evolutions | nothing — every non-level method is already `bond` |
| medals | nothing — all derived from the evolution graph and the type lists |
| legendaries | ten dex numbers |
| the arrival level | one entry in `GEN_UNLOCK` (28) |

**What was not free is the one that could have ruined real collections.** A
save's dex and every variant row are keyed on POSITION in `SPECIES`. Hoenn goes
in the middle, so position 251 — Turtwig — became a Hoenn species, and a save
loaded by position would show every Sinnoh Pokémon somebody had ever caught as a
different one. Silently. No error anywhere.

Padding is the right answer when a generation is *appended* and exactly the
wrong one when it is *inserted*. So every shape `SPECIES` has ever shipped in is
recorded, and a save whose length matches an old one is rebuilt **by id**.

**And the first version of that fix was still wrong.** `repairDex` recovers
caught status from registered variants, and it was reading the raw save's tier
rows — old positions into a new dex. A shiny Turtwig marked Treecko as caught.
It takes the rebuilt rows now, and `tools/play` loads a genuine pre-Hoenn save
through the real loader to prove it end to end: Sinnoh intact, its shinies
intact, Hoenn empty.

**Two assertions were written to fail on this day and did.** One said Gen 3 was
vacuously complete because it shipped no species; the other said Hoenn must not
appear as a region. Both were left in place years of commits ago precisely so
somebody would read them when the hole was filled.

### Phase 6 — The rest of the generations

*Goal: what is left of your second stated want. **Johto and Sinnoh already
shipped** — see "Johto and Sinnoh, and the hole where Hoenn is" above — so this
phase is now much smaller than it was, and the hard parts are done.*

**What the first two generations proved, and what is therefore no longer work:**
a dex id is not an array index and both lookups exist; Origin means debut
artwork and the source list is data; legendaries are a share so their rate
cannot drift; a generation arrives on a level; homes come from types by rule;
and every evolution method that is not a level is `bond`. **Hoenn is the next
one, and the hole in the middle of the dex is already sized for it.**

| | Why now |
|---|---|
| **Gen 3 (+135 species)** | The hole in the middle of the dex is exactly Hoenn-shaped, and `fetch-species.mjs` takes a range list — it is one line plus a run. |
| **New types** | Dark and Steel arrive with Gen 2 and need badge colours; `KNOWN_TYPES` in `check.mjs` will fail loudly on the first one it does not recognise, which is the point. |
| **New evolution kinds** | Happiness, time-of-day, trade-with-held-item. The evolution graph handles `level`/`stone`/`trade` today and every new kind needs a price rule of its own. |
| **The dex at scale** | The Dex and Box share one `FilterBar` with search and counted chips, which is fine at 151 and will not be at 500. Per-generation filtering, and a look at 1,025 sprites — 405 KB today, roughly 2.8 MB then. |

**Your calls:** one generation at a time or several at once, and whether the
older maps get new-generation residents or the new generations get new maps.

---

### Deferred on purpose

Designed, costed, and **not built** — each with the trigger that should bring it
back. They are here rather than in a tracker because every one of them is a
design decision with a reason, and a one-line ticket loses the reason.

### Band budgets, and pity — **both built, see above**

Both were deferred here with a trigger, both triggers fired, and both shipped in
Phase 4. The designs survived contact with one correction each and the
corrections are the interesting part, so they are written up in *Coming back
tomorrow* rather than kept as pseudocode here: the band drift ran the **opposite
way** from the one this section predicted, and pity had to boost the whole
ladder rather than one tier.

### A second art tier, for the species that cannot have Origin

**Trigger: if Sinnoh players report the tier ladder feeling thinner than
Kanto's.** It is one tier short for them and that is a real asymmetry, not a
bug - see *Origin needs an older drawing* above.

There is no OLDER drawing of a Sinnoh Pokémon, so Origin cannot be rescued. But
PokéAPI's sprite repository carries several sets that cover **all 358 of ours,
Sinnoh included**, and each is a genuinely different medium rather than a
different cartridge:

| set | what it is |
|---|---|
| `other/dream-world` | flat vector SVG - a completely different drawing style |
| `other/official-artwork` | Sugimori's illustrations, high-res |
| `other/home` | Pokémon HOME's 3D renders |
| `versions/generation-v/black-white/animated` | animated GIFs, the last 2D sprite set |
| `other/showdown` | Showdown's own animated sprites |

The whole catalogue, checked rather than assumed: Gen I ships red-blue, yellow
and red-green-japan; Gen II crystal, gold, silver; Gen III ruby-sapphire,
firered-leafgreen, emerald; Gen IV diamond-pearl, platinum,
heartgold-soulsilver; Gen V black-white (still and animated); Gen VI x-y and
omegaruby-alphasapphire; Gen VII ultra-sun-ultra-moon; Gen VIII
brilliant-diamond-shining-pearl; Gen IX scarlet-violet and champions. Most of
the later ones are 3D renders and would not sit beside our 2D sprites.

**The two worth having are `dream-world` and `black-white/animated`**, for
opposite reasons: the vector one is unmistakably a different hand, and the
animated one moves, which no other tier does. Both need the same reframing
`build_origin.py` already does. Do not build either until the asymmetry is
actually felt - a fifth tier changes the completion rosette for every species,
and the ladder's SPREAD is the thing that took two attempts to get right.

### The hybrid data model

**Trigger: a box that is slow to render or slow to save. Not a species count.**

`box` would keep instances for keepers and your best of each species, while
ordinary spares collapse to `dupes: { [speciesId]: count }`. A variant has
identity — you would name it, keep it, trade it — so it must be a row. Forty
ordinary Pidgey rows are forty objects to serialise, sort, filter and render,
carrying one bit of information: "forty".

Counts lose nothing, because a duplicate's only use is conversion and
`candyValue` reads the species, not the individual.

**Deliberately not built now.** It is a scale optimisation, the box is cleared
regularly in practice so it does not grow without bound, and it has the largest
blast radius of anything on this list — it touches the sweep, the row sale, the
manifests and every memo over `box`. The migration has a precedent in
`loadState`, and must run *after* the `TIERS` spread or it gets overwritten.

The four atomic transactions to name if this ever moves to a server: `catch`
(ball decremented **iff** box incremented), `convert` (dupes decremented **iff**
candy incremented), `spendCandy` (candy decremented **iff** level raised, on one
named uid), `evolve` (old form gone **iff** new form created, level and variant
carried across).

### Watch-list from the candy pass

Not bugs. Things that were decided a particular way and are worth looking at
again with a controller in hand.

- **Caterpie and Weedle evolve for free.** Both evolve at Lv 7 and a wild one can
  be caught at 7, so the cost is 0 candy. Left in deliberately: it means your
  first evolution happens in the first ten minutes and teaches the mechanic. If
  it reads as anticlimactic instead, the fix is a floor on `evoLevel`, not a
  change to `candyValue` — that one is load-bearing.
- **Charmander is still weight 10 where Bulbasaur and Squirtle are 8.** A real
  inconsistency, left because trimming it would make something worse and the ask
  was a kinder game. Ember Caldera also has the smallest table in the game, which
  is half of why its share is high.
- **Commons are candy, rares are cash.** 22 evolved forms of commons are worth
  more sold than converted. No candy is printed and it gives both currencies a
  natural source, so it is kept — but it means the payout choice is a solved
  decision for those 22 rather than a real one.
- **A same-line conversion bonus** (a duplicate fed to its own family worth 2×)
  is the tuning lever held in reserve if generic candy ends up feeling flat. Do
  not build it until playtesting asks for it.

---

### Phase 7 — Sound

*Goal: it is mechanically complete and completely silent. Fix the silence.*

Last, and **not because it matters least** — it is the single largest gap
between what this is and what it feels like, and a small amount of code against
a large amount of feel. It is last because it is the only item in the roadmap
gated on a decision rather than on work.

| | |
|---|---|
| **The throw** | The one sound the game most obviously wants: a click, an arc, three shakes, a set. The animation is already frame-accurate; the audio would sit straight on top of it. |
| **The catch sting** | And a different one per rare tier — Astral already gets a whole visual treatment nobody hears. |
| **The encounter cue** | Enough to make a legendary land differently from a Pidgey without a word on screen. |
| **Music, per area** | Eight maps with eight identities that currently differ only by eye. |

**Your call, and it is the whole gate:** where the audio comes from. The same
decompilation the tiles and the evolution animation came from is consistent with
the standing constraint and is already credited; something original is more work
but yours. Nothing here can start before that is answered — which is exactly why
it sits at the end rather than in front of four phases that can.

---

### Trading

Asked for directly, and it is the first feature whose main design problem is not
a game-design problem. The fun is easy and mostly already invented; what needs
deciding is what stops it destroying the collection for people who never used
it. Both halves are below, and the trust half comes first because it gates
everything.

#### What breaks, stated precisely

**THERE IS NO TRUST BOUNDARY.** Every roll, price and dex write happens in the
browser and the server stores the result. That is written at the top of
CLAUDE.md and it is why there is no leaderboard. Trading is a **harder** case
than a leaderboard, and the difference is worth being exact about:

- A leaderboard publishes numbers that cannot be trusted. The damage is bounded
  by not looking at it.
- Trading is a **distribution channel into other people's saves**. One person
  with devtools writes a Shiny Mewtwo into `localStorage`, posts twenty of them,
  and now the scarcity every number in this game is tuned around is gone — for
  players who never opened a console and never asked.

So "ship trading on today's architecture" is not a smaller version of this
feature. It is the version that ends the game.

**AND DUPLICATION IS THE ABUSE THAT MATTERS, NOT LYING.** These are usually
lumped together and they should not be. A player who forges themselves one
Shiny Rattata has done what they can already do today, alone, and it touches
nobody. A player who can make ONE of anything become a THOUSAND breaks the
economy for everybody in an afternoon. Every guard below is aimed at the second
one first, because it is both the worse harm and the cheaper thing to stop:
duplication is a fact about ids and rows, which a database is good at, where
"was this roll honest" needs the roll to have happened somewhere we control.

#### Phase T0 — a Pokémon needs an identity the server issued

Nothing is tradeable until this is true, and today it is not: `uid` is
`state.nextUid++` in the browser, so two players both hold a uid 7 and neither
id means anything outside its own save.

A `mons` table — server-issued id, owner, species, level, variant, size,
`caught_at` — and **only the server may insert a row**. The save stays exactly
what it is: local-first, written every 400ms, mirrored on the 15s cadence. A
mon that has never been traded does not need a row at all, which keeps the cost
proportional to the feature rather than to the dex.

**This is the expensive step and there is no way round it.** It is also the step
CLAUDE.md has been scoping since accounts arrived — *"the ten browser-free
modules in `src/game` are what makes the fix affordable when it is wanted"* —
so the work is: stand up one Edge Function that imports `biomes.js` and
`items.js` unchanged and mints a caught mon. The rule modules already run
without a browser and check.mjs already drives them in Node, which is the whole
reason that constraint was kept.

#### Phase T1 — the swap is one statement

Two ownership updates in one Postgres function, the same shape `save_game`
already uses for the session claim, and for the same reason recorded there:
**read-then-write from a browser races with itself**, and two devices can both
read "this is mine" and both proceed. A trade that is two updates is a trade
that can duplicate under a double-click.

`trade_execute(offer_id, taker)` verifies in one transaction that both sides
still own what they posted, both rows move, and the offer closes. Anything else
returns false and the UI says so — the pattern App already has for a lost
session claim.

#### Phase T2 — three modes, in this order

Ordered by fun-per-unit-of-risk, so each one ships and is enjoyed before the
next one's problems have to be solved.

1. **Wonder Trade.** Put one in, get one back, no idea what. **The one mode
   where forging does not pay**, because you do not choose what you receive —
   which makes it both the safest to ship first and, historically, the one
   people actually play. It also solves its own liquidity problem: it needs no
   browsing UI, no search, no negotiation.

2. **Offers — the GTS shape.** Post a spare, say what you would take for it,
   come back later. **Asynchronous on purpose**: there is no matchmaking here
   and a browser game cannot assume two people are online together. This is the
   mode the request actually described ("post/offer trades").

3. **Trade evolutions, which this unlocks for free.** CLAUDE.md records that
   every non-level evolution method collapses to `bond` because *"a game with no
   clock, no moves and no map transitions cannot express any of them"* — and
   trade is the one of those that stops being impossible the day this ships.
   Machoke, Haunter, Kadabra and Graveler becoming a real reason to trade is the
   single most Pokémon thing this feature can do, and it costs one flag on
   `EVOLUTIONS`, not a mechanism.

#### What keeps it from being game-breaking

Six guards. Each is one rule, and each is aimed at something specific:

- **SPARES ONLY.** You may trade what `duplicateUids` already calls spare. The
  best of each stays, exactly as the sweep does — one predicate, both features,
  and the request's own instinct ("specially the dupes").
- **A TRADED MON FILLS THE DEX AND NOTHING ELSE.** It counts as seen and caught;
  it does **not** count toward medals or the completion rosette. This is the
  load-bearing line. Dex completion becomes social, which is the fun part and
  the historically correct one — you were always meant to need trades to finish
  a Pokédex — while the two marks that measure *your own* play stay yours. It
  costs one field (`traded: true`) on the box entry, and `medalsFor` and the
  rosette read it.
- **THE ROSETTE IS WHY.** It is four variants of one species, and if variants
  are tradeable then the one mark in the game that cannot be bought becomes the
  one that can. Without this rule, trading deletes it.
- **POKÉMON ONLY, NEVER ITEMS.** Balls, candy and money are fungible, so
  trading them is a currency, and a currency between untrusted clients is the
  duplication problem wearing a hat. A Master Ball costs ¥50,000 for reasons
  measured in check.mjs; none of that survives a gift economy.
- **A RATE, TIED TO SOMETHING ALREADY EARNED.** A handful of trades a day, on
  the `daily.js` cadence — which is pure, keyed on the day, and already
  untestable-by-reloading. A cap makes the forger's throughput finite even if
  the forging is never caught.
- **AND A TRADE IS LOGGED.** Both sides, both mons, the timestamp, server-side.
  Not to police it on day one, but because the day something is wrong the only
  question will be "what actually moved", and that is not a question a save can
  answer.

#### The trigger

**Not the wanting; the trust boundary.** This is one of the two features in
this file that cannot ship as a smaller version of itself — the other is the
leaderboard, and it is blocked on exactly the same thing. When catching runs
server-side, both unblock together, and that is the moment to come back here.

Building T2 before T0 is not an early version of trading. It is a working
duplication exploit with a trading UI on it.

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
