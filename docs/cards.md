# Cards — the design, a concept (not built)

The single reference for the Pokémon card phase. **Nothing here is built yet**;
this is the plan, written so a session can implement it phase by phase without
re-deciding anything. Change a decision here first, then the code. Where a
number is marked *proposed*, the rule that bounds it is the decision and the
number is a starting value that the named check will hold or reject.

Researched 2026-10-01 and re-read 2026-10-02 against the live TCGdex API: every
field, count and size below was read off a real response. Re-check them when
the build starts.

**Revised 2026-10-02 (your calls):** the sets are the Mega Evolution era -
Mega Evolution, Phantasmal Flames and Ascended Heroes - replacing Base Set,
Jungle, Fossil and 151; Cards is a **fifth tab**; every set has a discounted
multi-pack (a box for the two main sets, a bundle for Ascended Heroes); a Mega
card links to the game's **Mega form**; card images ship small and load large
on inspect. **Cards are the game's main cash sink, built to be the most
rewarding thing money buys** - our own pull rates, tuned for frequent hits and
a real chase (see *Pull rates* and *Built to be opened*).

## The one rule everything else serves

**Cards are a collection, never a strength.** No card, pack, binder page or set
completion changes a catch chance, a spawn table, a tier roll, a flee, a price,
a battle stat or a League level. They are a place for money and rewards to go,
and a record of the journey. The moment a card moves a roll, every economy
guard in check.mjs stops meaning anything and packs become the only purchase
worth making.

Asserted, not trusted: `game/cards.js` and `src/data/cards/*` are imported by
nothing in `game/` except the engine's card actions, and never by `catch.js`,
`biomes.js`, `battle.js`, `league.js`, `trainer.js`, `perks.js` or `items.js`
(check.mjs, the same shape as the League's data rule).

## Decisions

| | Decided | Why |
|---|---|---|
| What a card is | **A real printed Pokémon TCG card**, its data and image from TCGdex, fetched at build time. | Asked for. Real cards are what make a binder worth filling. |
| Source | **TCGdex** (api.tcgdex.net, open source). | Small `low.webp` images, per-card variants and illustrator, open source. Its licence and terms are checked and recorded here before phase 1 ships. |
| When it is fetched | **Build time only** (`npm run cards`), into generated files. Never at runtime. | Local-first: the game is fully playable offline and the network never sits in the walk cycle. |
| Which sets | **The Mega Evolution era: `me01` Mega Evolution, `me02` Phantasmal Flames, `me02.5` Ascended Heroes** (your call, 2026-10-02). More only by trigger. | They cover all nine generations (325 species), where Base Set covered Kanto alone, and their Mega cards meet the game's own Mega forms. |
| Which cards | **Every card in a shipped set** - Pokémon, Trainer and Energy, secret rares included - because set completion means the whole set. | A binder with holes the player can never fill reads as a bug. |
| Rarity | **The set's own printed rarity**, normalised onto one ordered list, `CARD_RARITIES`. Our rare-form tiers are NOT reused. | The card's rarity is a fact about the card. |
| Pack contents | **The era's real booster structure** (slots), from `SET_PROFILES` in `game/cards.js`, at measured pull rates. | Authentic packs are the whole appeal. |
| Money | Packs, boxes and bundles are bought with **¥ only**. No real money, ever. | Non-commercial; a paid pack would make this a gambling product. |
| Earned too | Packs are also **rewards** (badges, Champions, streaks, Pokédex ranks). | A sink you also earn by playing reads as a reward track, not a tax. |
| Duplicates | **Kept as a count; spare copies can be turned into Card Dust, and dust crafts any card you are missing.** Never automatic. | A sink and a pity in one, and it bounds the cost of completing a set. |
| Pity | **A capped "dry" counter per set** guarantees a hit, like `dry` on the tier ladder. | Twenty packs with nothing is the moment a player quits. |
| Link to the game | Through the **National Dex number** (`dexId`), and for a **Mega card, the game's Mega form** (your call, 2026-10-02): its catch stamp and Dex link are the form's. | The binder becomes a record of *your* journey. |
| Where it lives | **A fifth tab, Cards** (your call, 2026-10-02), beside Catch, Trade, Battles and You. | It is a place you go, like the League, not a setting. |
| Images | **`low.webp` for all 613 cards shipped (~11 MB); `high.webp` fetched when a card is inspected** and cached by the browser (your call, 2026-10-02). | A pack opening never waits on the network; the 39 MB of large art is only paid for by cards you look at. |
| Pull rates | **Ours, not the real print run's** (your call, 2026-10-02): about half of all packs hold a hit, every pack shows its odds, and every chase has a visible, honest guarantee. | It is the main cash sink, so a pack has to feel worth ¥3,200 nearly every time; real rates are built to sell boxes, not to be fun with play money. |
| Honest odds | **Every rate, pity count and guarantee is shown on screen**, from the same constants the roll uses. Never a hidden rate, never a "luckier" pack you can pay for, never real money. | Engaging is fine; deceptive is not. The non-commercial rule is what keeps this a game. |
| Trading cards | **Not in the first releases.** Deferred. | trading.md decided "Pokémon for Pokémon only": a client-owned card is the duplication problem. |
| Ranking | **Nothing card-related is ranked.** | There is no trust boundary: a save can claim any card. |
| Credit | Every card view names its **illustrator** and TCGdex; README credits TCGdex and the illustrators. | The art is theirs and The Pokémon Company's. |

## The three sets *(read 2026-10-02, every card fetched)*

| Set | id | Released | Cards (official + secret) | Pokémon / Trainer / Energy | Species | Mega cards |
|---|---|---|---|---|---|---|
| Mega Evolution | `me01` | 2025-09-26 | 188 (132 + 56) | 152 / 36 / 0 | 112 | 30 |
| Phantasmal Flames | `me02` | 2025-11-14 | 130 (94 + 36) | 110 / 19 / 1 | 86 | 14 |
| Ascended Heroes | `me02.5` | 2026-01-30 | 295 (217 + 78) | 243 / 50 / 2 | 178 | 34 |
| **All three** | | | **613** | 505 / 105 / 3 | **325, all nine generations** | 78 |

Rarities printed (count across the three):

| Rarity | me01 | me02 | me02.5 |
|---|---|---|---|
| Common | 67 | 43 | 84 |
| Uncommon | 43 | 31 | 69 |
| Rare | 12 | 10 | 25 |
| Double rare | 10 | 10 | 39 |
| Illustration rare | 22 | 13 | 33 |
| Ultra Rare | 22 | 17 | 21 |
| Special illustration rare | 10 | 5 | 22 |
| **Mega Hyper Rare** | 2 | 1 | 2 |

Other facts that shape the build:
- Variants seen: `normal`, `holo`, `reverse`. No 1st Edition.
- **No basic Energy** in any of the three (it is the separate `mee` set). The
  three Energy cards (Ignition, Prism, Team Rocket's) are special Energy and
  ordinary pack cards.
- Every card has an image; 3 of 613 have no illustrator (shown as "Illustrator
  unknown", never blank).
- Every Pokémon card has a `dexId`. A Mega card's `dexId` is its BASE species
  (Mega Venusaur ex → `[3]`); 77 of 78 Mega Pokémon cards match a Mega form in
  `SPECIES` by `label()` (the one Trainer, "Mega Signal", has no species).
- Measured image sizes: `low.webp` 14-26 KB, `high.webp` 52-94 KB. All 613:
  ~11 MB low, ~39 MB high.
- TCGdex lists no `boosters` for these sets - the pack shape is ours to write
  (below).

## Sources

| Need | Endpoint | Notes |
|---|---|---|
| Series | `GET https://api.tcgdex.net/v2/en/series/me` | the era's sets, in release order. |
| One set | `GET /v2/en/sets/{id}` | `cards[]` (id, localId, name, image), `releaseDate`, `cardCount`. |
| One card | `GET /v2/en/cards/{id}` | `category`, `rarity`, `dexId[]`, `variants`, `illustrator`, `hp`, `types`, `stage`, `trainerType`, `energyType`. |
| Card image | `{image}/low.webp`, `{image}/high.webp` | sizes above. |

**Fetch etiquette.** One request per card at build time (613), 4 in flight,
cached on disk under `.assets-src/cards/` like every other fetcher, so a
re-run downloads nothing it has. The fetcher refuses a rarity string it does
not know - a new rung is a decision, not a default.

## The ladder: `CARD_RARITIES`

One ordered list in `game/cards.js`, rarest last: the single source for sort
order, filters, dust values, the reveal's anticipation colour, the finish a
card wears and its rarity icon - the `TIERS` rule applied to cards. No screen
types a rarity.

| id | Printed as | Icon | Reveal cue | Finish (binder and inspect) |
|---|---|---|---|---|
| `common` | Common | ● | none | none |
| `uncommon` | Uncommon | ◆ | none | none |
| `rare` | Rare | ★ | a soft white edge | none |
| `holo` | Rare, holo variant | ★ | foil sweep on the flip | foil over the art box |
| `reverse` | any card, reverse-holo variant | (its own) | foil on the frame | foil on the frame, never the art |
| `double` | Double rare (ex) | ★★ black | gold edge before the flip | rainbow foil, whole card |
| `illustration` | Illustration rare | ★ gold | turns face up slowly | textured sparkle, whole card |
| `ultra` | Ultra Rare | ★★ silver | gold edge + light burst | etched silver foil |
| `special` | Special illustration rare | ★★ gold | screen dims, burst, slow flip | textured sparkle + gold glint |
| `mega` | **Mega Hyper Rare** | Mega symbol | as `special`, then a Mega symbol flare in gold light | gold foil with a slow glint |

Variants are held per card: `normal`, `holo`, `reverse`, plus our own
**`earned`** stamp. A card that came from a *reward* pack carries `earned` with
where it came from ("Boulder Badge · day 40"); bought packs never stamp.

## Packs: the algorithm

### The era's booster (`SET_PROFILES` in `game/cards.js`)

All three sets share the modern Scarlet & Violet / Mega Evolution shape, 10
cards:

| Slot | Count | Contents |
|---|---|---|
| Common | 4 | `common` |
| Uncommon | 3 | `uncommon` |
| Reverse 1 | 1 | a reverse-holo of any common / uncommon / rare |
| Reverse 2 | 1 | a reverse-holo, **or** an `illustration`, `special` or `mega` in its place |
| Rare | 1 | `rare` (holo), **or** `double` / `ultra` in its place |

### Pull rates *(ours - decided 2026-10-02; check.mjs holds each within ±15%)*

Per pack, the same for all three sets, written as `RATES` in `game/cards.js`
and read by both the roll and the Packs tab:

| Rarity | Slot | Chance per pack | About |
|---|---|---|---|
| `double` | Rare | 25% | 1 in 4 |
| `ultra` | Rare | 10% | 1 in 10 |
| `illustration` | Reverse 2 | 16.7% | 1 in 6 |
| `special` | Reverse 2 | 4% | 1 in 25 |
| `mega` | Reverse 2 | 0.83% | 1 in 120 |
| any of the above | - | ~49% | **every other pack** |
| a holo rare (when the rare slot is not upgraded) | Rare | 65% | most packs |

What that means for a player, at ¥3,200 a pack (raised from ¥2,400, 2026-10-02):
- **About every second pack holds a hit**, and every pack holds at least two
  reverse holos and a rare - nothing opens to only commons.
- **An Illustration rare** (the full-art cards people collect) about every 6
  packs, ¥14,400.
- **A Special illustration rare** about every 25 packs, ¥60,000 - one a
  booster box opens about one and a half of.
- **A Mega Hyper Rare** at 1 in 120 before pity; with the soft pity below
  it lands on average after about 75 packs (median about 83, measured over
  20,000 simulated chases, ~¥180,000-200,000) and never later than 150 - the
  chase. The Packs tab prints both numbers: the base rate and "guaranteed
  within N".
- Which card of a rarity you get is uniform within the set; the odds of *a
  specific* chase card are its rarity's rate over its count, and the Card Dex
  shows that too.

### Pity, three counters, all shown

| Counter | Soft | Hard | What it guarantees |
|---|---|---|---|
| `hit` | - | 4 dry packs | the 5th pack after four with no hit holds a `double` or better |
| `special` | from 20 packs, each pack adds +2% to `special` | 35 | a `special` or better |
| `mega` | from 100 packs, each pack adds +1% to `mega` | 150 | a `mega` |

Per set, in `cardPity` (`{ me01: { hit: 2, special: 14, mega: 61 } }`); each
resets when it pays, and a better hit resets the counters below it. The Packs
tab draws all three as meters ("Special illustration guaranteed within 21
packs"), like the rift's ring - a guarantee you can see is what makes the
next pack worth opening. check.mjs replays 20,000 seeded packs and holds that
no streak passes a hard pity and that the rates with pity land in their band.

### The God Pack

1 pack in 300 (any set) is a **God Pack**: every card in it is a reverse holo,
an Illustration rare or better, with at least three Illustration rares. It has
its own wrapper glow on the tear and its own banner, and it never counts toward
the pity counters (it is a gift on top). Shown in the Packs tab's odds.

### Opening a pack (`openPack(set, rng, pity)`, pure)

1. For each slot in order, roll its table with `rng` for a `(rarity,
   variant)`, then pick a card of that rarity uniformly from the set.
2. **No card twice in one pack** (re-pick within the slot; a slot whose pool
   the pack has used up takes the next rarity down).
3. **Pity:** the three counters above (`hit`, `special`, `mega`) raise the
   upgrade's chance (soft) and force it (hard); a God Pack roll comes first.
   Each counter resets when it pays.
4. Return the cards in **reveal order**: commons first, the best hit last.

Pure and browser-free, every roll from `rng`, so tools/play and check.mjs
replay it with `mulberry32` seeds. The engine calls it with `Math.random`.

## Duplicates and dust

**What a duplicate is.** Copies are counted per card per variant (a reverse
Pikachu and a normal Pikachu are different entries), capped at `CARD_MAX` 99.
A pocket in the binder shows the best copy and a "×3" badge. Nothing is ever
dusted automatically: a duplicate sits in the binder until you choose.

**Dust.** Spare copies (anything beyond your first of that card and variant)
can be dusted; dust crafts a missing card.

| Rarity | Dust for a duplicate | Craft cost |
|---|---|---|
| common | 5 | 40 |
| uncommon | 10 | 80 |
| rare | 25 | 200 |
| holo / reverse | 50 | 400 |
| double | 80 | 640 |
| illustration | 100 | 800 |
| ultra | 150 | 1,200 |
| special | 300 | 2,400 |
| mega | 400 | 3,200 |

*Proposed.* The relation is the rule: **craft = 8 × dust**. Never your last
copy; never an `earned` copy without asking (a keeper, like a rare-form
Pokémon); dusting rare-or-better asks first (`state.ask`); dust is earned only,
never bought with ¥. The Dust tab has one sweep, "dust all spares below rare",
with keepers listed unticked (the Box sweep's rules).

## Economy

A 50,000-step playthrough earns about ¥525,700; a full Lv 75 game about
¥1,588,599, League one-off prizes ¥140,910 of it (check.mjs, 2026-10-02).
Cards are the sink that has no ceiling and buys no advantage.

| Item | Price (*proposed*) | Bound check.mjs holds |
|---|---|---|
| Booster pack (any set) | ¥3,200 (was ¥2,400) | between 150 and 400 steps of median income at the level its set opens |
| Booster box, `me01` / `me02` (36 packs) | ¥96,000 (≈17% off) | never beats packs by more than 20% |
| **Bundle, `me02.5` (6 packs)** | ¥17,280 (10% off) | never beats packs by more than 20%; never cheaper per pack than a box |
| Card craft | dust only | never buyable with ¥ |

Ascended Heroes is a special set sold in collection products, not booster
boxes, so its multi-pack is a smaller bundle - every set still has one
discounted way to buy in quantity (your call, 2026-10-02).

**Sets open on trainer level**, like maps: Mega Evolution near the League's
opening (*proposed* Lv 10), Phantasmal Flames Lv 25, Ascended Heroes Lv 40. A
set not yet open is visible and locked in the Packs tab.

**The sink, measured.** tools/play simulates a reference player spending half
their surplus on packs from mid-game; check.mjs holds that completing Mega
Evolution (all 188, packs + dust) costs between 25% and 60% of a playthrough's
money, and that no other price guard moves (honey, the Master Ball band, the
League rematch guard).

### Rewards (packs you earn)

| Source | Reward | Stamp |
|---|---|---|
| A gym badge (first win) | 1 pack of the newest set you have open | `earned` · the badge |
| A region's Champion (first win) | a box (or Ascended Heroes' bundle) of the newest set you have open | `earned` · the League |
| Daily quest, 7-day streak | 1 pack | `earned` · the streak |
| Pokédex rank up | 1 pack per rank | `earned` · the rank |
| A set completed | a title ("Mega Evolution Collector") and a binder cover; no pack | - |

Paid in `battleEnd` and `register`, once each and recorded, landing in
`state.packs` unopened. A badge pack changes `battleEnd`'s result (a `pack`
field) and the League's prices, so phase 1 ends with `npm run gyms`, `npm run
edge`, and the tools/play cases that compare that result whole. check.mjs
holds reward packs to at most a third of the packs the reference player opens.

## Data model

### Generated files (never hand-edited)

| File | Made by | Holds |
|---|---|---|
| `src/data/cards/<set>.js` | `npm run cards` | one set: `{id, name, released, logo, total, cards: [[localId, name, category, rarity, variants, speciesIds[], illustrator]]}` |
| `src/data/cards/index.js` | `npm run cards` | the shipped set list, counts and open levels - the only card data the main bundle carries |
| `public/cards/<set>/<localId>.webp` | `npm run cards` | the small image, shipped |
| `public/cards/<set>/logo.webp` | `npm run cards` | the set logo, for the pack wrapper |

`speciesIds` are the GAME's ids, resolved at build time: a card's `dexId`, and
for a Mega card the Mega form whose `label()` matches its name ("Mega
Gardevoir ex" → Mega Gardevoir's form id). The fetcher fails on a Mega card it
cannot match, so a new Mega never silently links to its base. The large image
is not shipped: the inspect view loads TCGdex's `high.webp` URL, recorded per
card, and shows the small one until it arrives (offline: the small one stays).

The main bundle carries `index.js` only (under 1 KB gzipped, asserted).

### The save (each field a `savedField` line in tools/play)

| Field | Shape | Notes |
|---|---|---|
| `cards` | `{ "me01-004": { n: 2, reverse: 1, earned: ["badge:kanto-brock"] } }` | keyed by card id, never position: a new set never moves a save. Counts whole, capped at `CARD_MAX`. |
| `packs` | `{ me01: 3 }` | unopened packs by set |
| `earnedPacks` | `{ me01: ["badge:kanto-brock"] }` | which unopened packs were earned (opened first; never longer than `packs`) |
| `dust` | number | whole, ≥ 0 |
| `cardPity` | `{ me01: { hit: 2, special: 14, mega: 61 } }` | packs since each kind of hit, per set |
| `cardLog` | `[["me01-180", 1730000000, "pack"], ...]` | your best pulls, newest first, at most 50 (the Pulls wall) |
| `milestones` | `{ me01: 3 }` | set-completion rewards already paid (25/50/75/100%) |

"New" badges on cards are per-device localStorage, like News. `loadState`
drops a bad card row, never the whole object; an unknown id (a newer build's
set) is kept, shown nowhere and never dusted. An old save loads with all five
empty. Nothing here is VOLATILE.

### The engine's card actions (the only writers)

`buyPacks(setId, n)`, `buyBox(setId)` (the box or the bundle, by set),
`openPack(set)` (takes the set the page has lazily loaded; decides, records
and saves the pack before a frame plays; one `changed()`), `dustCard(id,
variant, n)`, `craftCard(id, variant)`. All through `whole()`, all refuse with
a reason, and the irreversible ones ask first through `state.ask`.

### The server

**Nothing new in phase 1.** Cards ride in the save JSONB. A card showcase on
the trainer card is a `trading.sql` column (phase 4, SQL first).

## Frontend

### The fifth tab

**Cards is the fifth tab** (`goTab("cards")`, hash `#/cards`, the same history
rule as the other pages): Catch, Trade, Battles, Cards, You. It is a PAGE like
the League (`src/ui/cards/`, reached only by `lazy()`, asserted with its data),
pauses the engine while open, and shows a dot while you hold unopened packs.

- **Desktop** app bar: one more pill, which fits beside the money row at
  1,280px and up (check the 1,100px breakpoint).
- **Phone** bottom bar: five tabs at 78px each on a 390px screen, still above
  the 36px touch minimum; labels stay one word.
- **Sideways phone**: the left rail takes a fifth icon.
- A fight (`body.fighting`) and a phone encounter (`.app.busy`) hide it with
  the rest of the bar, unchanged.

### Sub-tabs (the League page's strip)

1. **Packs** - each set as its wrapper art, price, what it holds ("10 cards ·
   a hit 1 in N"), your unopened count, and **Open** / **Buy** / **Buy a box**
   (or **Buy a bundle**). Locked sets show their level.
2. **Binder** - one set at a time, **nine-pocket pages** (3×3 desktop, 2×3
   phone), page-turn left/right, cards in set order. An empty pocket shows the
   card's number and name faintly. A pocket holds the best copy and a count.
3. **Card Dex** - every card of every shipped set in one windowed grid (the
   Dex's `useRows`), filterable by set, rarity, category, owned/missing and
   species; sortable by set order, rarity and Dex number.
4. **Dust** - spares with their dust value, the sweep, and each set's missing
   cards with their craft cost.

### The card view (inspect)

A dialog (`useDismiss`, the modal lock): the large image, name, set, number,
rarity icon, illustrator, your copies by variant and stamp, the species' (or
Mega form's) Dex entry one tap away, and the card's **finish** from the ladder,
following the pointer on desktop and a drag on a phone, a slow automatic sweep
otherwise - never the motion sensors.

**The finishes are written fresh.** The well-known `pokemon-cards-css` effects
are GPL-3.0 and must not be copied (Pokémon Showdown's battle effects were left
out for a licence too). Each finish is one or two masked gradient layers moved
by `transform` and `opacity` only, sized so a binder page of nine runs on a
phone without dropping frames (measured, the Dex's tier-loop budget).

### Layout

Matches the rest of the game: the Events board's `ev-card`s, the League page's
strip, chips; no side stripes, no rings round icons, colour only where it
carries information. Size container; phone = `(hover: none) and (pointer:
coarse)`; short-screen dialog shape; never scrolls sideways; 36px targets;
night mode through tokens.

## Animation *(the pack opening, beat by beat)*

Built the RankUp way: delayed CSS keyframes whose resting styles are the final
scene, so a skip and `prefers-reduced-motion` both land on the end. Only
`transform` and `opacity` animate.

| Beat | ms (*proposed*) | What happens |
|---|---|---|
| 1 · Choose | - | the pack floats, centred (`.loop`). |
| 2 · Tear | 600 | tap or drag across the top: the wrapper shakes, a tear runs along the top, the top flies off. |
| 3 · Fan | 500 | the cards slide out face down into a stack. |
| 4 · Flip | 220 each | tap to flip the next, hold to flip all; commons fast. |
| 5 · Anticipation | 400 | the last card's back glows the colour of what it WILL be; a plain rare gets no glow, so the glow is the tell. |
| 6 · Reveal | 700-1,600 | the rarity's reveal cue from the ladder. `mega`: the screen dims, the card rises and turns, then the Mega symbol flares behind it in gold light. |
| 7 · Summary | - | the pack in a row, **NEW** on first-time cards, the catch stamp, "×2 · +10 dust if dusted" on duplicates, **Open another** / **Binder** / **Done**. |

- Images load before the tear (kept `Image`s, the `preloadSprites` rule), with
  a timeout, so no card flips onto a blank face.
- The pack is saved before the animation: a reload mid-opening loses nothing.
- Skip is always on screen (and Escape, and B on the pad).
- A box or bundle opens its packs one after another with a running tally;
  "Open all" goes straight to one summary of every hit.
- Keyboard: Space/Enter flips and advances; the rarity is announced
  (`aria-live`). No sound.

## Built to be opened *(engagement - decided 2026-10-02)*

The goal is that opening a pack is the best moment money buys in this game,
and that a binder pulls you back. Every item here is honest: shown odds, no
real money, nothing that changes play.

**The moment itself**
- **Every pack has a moment.** The tell glow (beat 5) plays on any upgraded
  slot, not only the last card, so a pack with two hits glows twice. Holo
  rares get a quick foil sweep, so even a hitless pack ends on something shiny.
- **The chase on the wrapper.** Each set's pack shows its three chase cards
  fanned behind it (its Mega Hyper Rares and best Special illustration rare),
  and the Packs tab's "chase list" marks which you own.
- **New is loud, duplicates are not wasted.** A first-time card gets a NEW
  burst; a duplicate shows "+10 dust" in gold on the summary - every card in a
  pack adds something.
- **Opening many.** A box or bundle has "Open all": a fast flip through every
  pack with the hits pulled out into a final line-up, biggest last.

**Reasons to keep opening**
- **The pity meters** (above) - always a guarantee in sight.
- **Set milestones**: completing 25%, 50%, 75% and 100% of a set pays dust
  (*proposed* 200 / 500 / 1,000) and, at 100%, the title, a binder cover and a
  free box of the next set. A **master set** (every card in every variant it
  prints) is the long goal: its own title and a gold binder cover.
- **The Pulls wall**: your 50 best pulls with the date, on the Binder tab, and
  the best one (the rarest, then newest) as the set's cover in the Packs tab.
- **Daily first pack**: the first pack you open each day shows its hit tell on
  every card at once before the flips - no better odds, just the thrill of
  seeing them glow. (A presentation bonus only; check.mjs holds that the roll
  ignores the day.)
- **Reward packs** keep coming from play (badges, Champions, streaks, ranks),
  so a player who never spends still opens some, and wants more.

**The sink, held honest**
- A full Mega Evolution set (188, with dust and milestones) costs about 30-50%
  of a full game's money; all three sets more than a game earns, so the
  collection outlives the story (check.mjs: the completion band per set and
  the three together above 100%).
- Prices never rise with your money, the shop never discounts on a timer, and
  there is no "last chance" anything.

## Art needed *(you make it; prompts below)*

| File | Size | What |
|---|---|---|
| `art/cards/rarity/{common,uncommon,rare,double,illustration,ultra,special,mega}.png` | 48px, transparent | the rarity icons, built to 24px by a script like `build_marks.py` |
| `art/cards/back.png` | 600×825 | the card back |
| `art/cards/wrapper.png` | 600×1000 | a blank foil booster wrapper; each set's logo is laid on it in CSS |
| `art/cards/mega-flare.png` | 512px, transparent | the Mega symbol for the `mega` reveal |
| `art/cards/tab.png` | 48px, transparent | the Cards tab icon |
| `art/cards/godpack.png` | 600×1000, transparent | the God Pack's glowing wrapper overlay |

Prompts:
- **Rarity icons:** "Set of 8 small game UI rarity icons on a transparent
  background, flat vector, crisp edges, readable at 24px: a solid black
  circle; a solid black diamond; a single black star; two black stars side by
  side; a single gold star; two silver stars; two gold stars; a gold
  Mega-Evolution-style symbol (a stylised teardrop inside a ring). Each icon
  centred in its own square, no text, no shadow."
- **Card back:** "Trading card back, portrait 600×825, deep navy and blue,
  a large Poké Ball emblem centred over a swirling energy pattern, thin gold
  border, rounded corners, flat illustration, no text."
- **Wrapper:** "Blank sealed booster pack wrapper, portrait, glossy metallic
  foil with crimped top and bottom edges, iridescent purple-to-teal sheen,
  empty centre for a logo, product shot on transparent background, no text."
- **Mega flare:** "Mega Evolution symbol, radiant gold, light rays bursting
  outward, transparent background, game effect sprite, no text."
- **Tab icon:** "Simple line icon of two overlapping playing cards, 2px
  rounded strokes, single colour, transparent background, matches a minimal
  app tab bar."
- **God Pack overlay:** "Radiant rainbow-gold aura and light rays around the
  outline of a booster pack, transparent centre, sparkles, game effect
  overlay, transparent background, no text."

## Game integration, the small stuff

- **The catch stamp**: a Pokémon card whose species (or Mega form) your
  Pokédex has as caught shows a small Poké Ball stamp; seen-only shows nothing.
  A card with several species needs any one.
- **The Dex sheet** (Info tab) gets a "Cards" card: your cards of that species
  or form as small thumbnails, tap to inspect, "none yet" otherwise. A Mega
  form's sheet lists its Mega cards; the base species' sheet lists its own.
- **Regional forms**: a card's `dexId` is a National Dex number; an Alolan or
  Galarian card links to the base species unless a later rule matches it the
  way Megas are matched (deferred).
- **Trainer and Energy cards** have no species: no stamp, no Dex link.
- **News**: one entry when a phase ships. **Help**: a Cards section (what a
  pack holds, what dust is, that cards change nothing in the wild).
  **Hints**: the first reward pack, the first duplicate, the first craft.
- **Research, ranks, perks, the League and trading** read nothing from cards.
- **Offline**: every shipped card shows (its small image); the inspect view
  falls back to the small image without a network - never a broken image.

## Testing *(every assertion shown to fail when its bug is put back)*

check.mjs:
- every card's `speciesIds` are species in `SPECIES`; every Mega Pokémon card
  links to a Mega form; every `rarity` is on `CARD_RARITIES`; every card has
  its small image, under its size bound.
- each set, simulated over a seeded 20,000 packs, lands every rate in
  *Pull rates* within ±15% (pity included), the God Pack near 1 in 300, no
  streak past a hard pity, and no pack holds a card twice; the Packs tab's
  printed odds are read from `RATES`, never typed (the `TIER_ODDS` rule).
- the daily-first-pack bonus changes no roll: the same seed with and without
  it opens the same cards.
- the economy bounds above (pack band, box and bundle discount caps, the
  completion band, the reward share, craft = 8 × dust).
- the one rule: no forbidden module imports card data or `game/cards.js`.
- `index.js` under its gzip budget; the Cards page is `lazy()`.
- the generated files match a re-run of the fetcher over the cached responses.

tools/play:
- `savedField` lines for `cards`, `packs`, `earnedPacks`, `dust`, `cardPity`,
  `cardLog`, `milestones`.
- buy, open, dust and craft through the engine: money and dust move exactly, a
  refused action changes nothing, a reload mid-open keeps the cards, an open
  calls `changed()` once, an earned pack stamps its cards.
- a save from a newer build with an unknown set id loads and keeps it.

Browser (dev server, pointer emulated): the opening's resting state equals the
skipped state; reduced motion lands on the summary; the binder and the
five-tab bar fit at 390×844 and 844×390 without horizontal scroll; a binder
page of nine finishes holds frame rate on a 4x-throttled phone.

## Phases *(each ends with its QA gate passed and your go-ahead)*

**One phase at a time, and nothing starts until the last one's gate is
passed and reviewed** (your call, 2026-10-02). The gate, every phase:

1. **Rules**: `npm run check` and `npx vite build` pass; every new assertion
   is shown to fail with its bug put back (the Testing rule).
2. **Engine**: tools/play drives every new engine action through the real
   engine - success, each refusal, money/dust exact, one `changed()` - and a
   `savedField` line holds each new save field.
3. **Saves (the backend)**: an old save loads with the new fields empty; a
   reload mid-action loses nothing; export and import carry the fields; the
   cloud path is read through (`persisted`, `mirror`, and the save trigger in
   `db/trading.sql`, which must leave the new fields untouched) and, with test
   credentials, a round trip on the TEST project.
4. **Frontend, in a browser** (the dev server, pointer emulated): desktop
   1440×900, phone 390×844, sideways 844×390, night and day; every new screen
   screenshotted and looked at; no console error, no sideways scroll; keyboard,
   Escape and Back work; reduced motion lands on the end state.
5. **Performance**: the new screens on a 4×-throttled phone profile - no long
   task over 100ms on open, the opening scene at frame rate.
6. **Regression**: the four existing tabs, an encounter, a League fight and the
   Trade Center still open and work.
7. **Report**: what was built, the screenshots, what the gate found and fixed,
   and anything deferred - then wait for the go-ahead.

1. **Mega Evolution, end to end.** The fetcher and generated files for
   `me01`; `game/cards.js` (ladder, `RATES`, profile, `openPack`, the three
   pity counters, the God Pack, dust); the save fields; engine actions; the
   fifth tab with Packs (odds, pity meters, chase list), Binder and the opening
   scene; badge reward packs (then `npm run gyms` and `npm run edge`); the
   one-rule and economy guards.
2. **Card Dex, Dust and the card view** (finishes, inspect, crafting, the
   sweep); set milestones, the Pulls wall and the daily first pack; the Dex
   sheet's Cards card; Hints and Help.
3. **Phantasmal Flames and Ascended Heroes**; booster boxes and the Ascended
   Heroes bundle; the remaining rewards (Champion, streak, ranks).
4. **Show-off:** set-completion titles and binder covers; a card showcase on
   the trainer card (SQL first).

## Phase 1 as built *(2026-10-02, gate passed - awaiting your go-ahead)*

- Built: `npm run cards` (me01, 188 cards, 4.2 MB of small images); `game/cards.js`
  (ladder, `RATES`, the three pity counters, the God Pack, dust values);
  `cards`, `packs`, `earnedPacks`, `cardPity` in the save; `buyPacks` and
  `openCardPack`; the badge pack; the fifth tab with Packs (odds, pity meters,
  chase list, Buy 1 / Buy 10) and Binder; the opening scene end to end.
- Measured with pity running (20,000 packs): a hit in 52% of packs, a Special
  illustration rare about 1 in 19, a Mega Hyper Rare about 1 in 75, no streak
  past a guarantee. A pack is about 224 steps of income (the band is 150-400).
- Not art files yet: the tab icon is drawn in `Icon.jsx` and the card back in
  CSS; the God Pack overlay is a CSS glow. The art list above still stands
  for when you make them.
- Found by the gate and fixed: Skip during the tear was undone by the tear's
  timers; on a phone the tab bar covered the summary's buttons; the selected
  strip tab's label was white on white (League's too); a tapped tab kept its
  hover fill on touch screens.
- Not run: the TEST-project round trip (no test credentials here). The save
  path was read through instead: the new fields are not VOLATILE, and the
  server's save trigger rewrites only `box`.

## Phase 1 revisions and Phase 2 as built *(2026-10-02, gate passed - awaiting your go-ahead)*

Revisions asked for after phase 1:
- **The real card back and the real wrappers** (`tools/fetch_card_art.py`,
  Bulbagarden Archives): Mega Evolution has four (Mega Venusaur, Gardevoir,
  Lucario, Kangaskhan); a pack opens in one of them at random, cosmetically.
  Phantasmal Flames' four and Ascended Heroes' one are listed for phase 3.
- **The binder is four across**, twelve pockets a page.
- **The foil follows the real frame** (measured window, mask tested with the
  foil painted solid): reverse holo everywhere but the art, holo rare only in
  it, hits all over; unowned cards wear none.
- **A chase gallery** on each set: every Mega Hyper Rare and Special
  illustration rare, owned or still out there, each with its odds, tap to look.
- **The opening, rebuilt for suspense and payoff**: the pack charges (shakes,
  light leaks) and tears in sparks; a hit's back trembles and glows with a
  line ("Something incredible…"); its tap charges, flashes white, flips,
  bursts and stamps its rarity; Illustration and up add rays and a tinted
  room, Special and Mega a screen shake and confetti; pips track the pack;
  the summary shows the hits large.

Phase 2: the Card Dex (filters, sort, paged tiles), Dust (the sweep, spares,
missing cards and their craft cost), the card view (pointer-tilt foil and
glare, every printing, dust a spare, craft, open in the Pokédex), set
milestones (25/50/75/100%: 200/500/1,000/2,000 dust, the title at 100%), the
Pulls wall and your best pull on the pack, the daily first pack (its hits'
pips glow from the start; presentation only), the Dex sheet's Cards card,
three hints and a Help section. **Craft is 16 spares' worth** (`CRAFT_X`), not
8: measured over 40 seeded collectors, 8x put a full set at 26% of a game's
money, 16x at 35% (about 230 packs).

Found by the gate and fixed: the spare-card tip and a milestone banner fired
over the pack before it was torn (and a frame of the tip cost 46ms); the
binder's cards did not open the card view (it passed no set); the inspect view
showed the plain copy over a foil you own; a missing card's sparkle drew over
its greyed face; opening a pack (104ms) and the Card Dex (103ms) broke the
100ms budget - both now under 81ms. Not built yet: binder covers and the
master-set reward (phase 4), boxes and bundles (phase 3).

## Phase 2 revisions and Phase 3 as built *(2026-10-02, gate passed - awaiting your go-ahead)*

Your calls after phase 2:
- **Every pack ends on a reveal**: the last card always charges, flashes white
  and turns, whatever it is. It pulses white beforehand ("Last card…"), never
  its rarity's colour, so the suspense is real; a hit's colour comes in only
  during the charge. A rarity banner still stamps only for a hit.
- **The chase is packs only**: a Special illustration rare and a Mega Hyper
  Rare can never be crafted (`PACK_ONLY`). Measured over 40 seeded collectors:
  completing Mega Evolution now costs a median **76%** of a full game's money
  (505 packs, 250-1,060 by luck) - past the 25-60% band this plan held, on
  purpose: the collection outlives the playthrough.
- **Cards are their own collection**: no catch indicator on any card (the
  Pokédex link in the card view and the Dex sheet's Cards card stay).
- **The Open button keeps its neighbours' height**: the count is inline, and
  every action stays on one line.

Phase 3: Phantasmal Flames (130 cards, Lv 25) and Ascended Heroes (295, Lv
40), with their real wrappers; a **booster box** for each main set (36 packs,
¥72,000, 17% off) and a **bundle** for Ascended Heroes (6 packs, ¥12,960, 10%
off); **Open all** (every held pack of a set, one summary of every hit, rolled
in a second task so the scene shows first); a **region's Champion** pays the
newest set's box (or bundle); every **7th day of a daily streak** pays a pack.
**Not built: a pack per Pokédex rank** - CLAUDE.md holds the rank "a title,
never a reward" because it counts traded Pokémon, so paying for it would pay
for trades. An alternative that counts only your own catches is open.

Found by the gate and fixed: the charge's glow never drew (no `content`); the
swelling card covered "Last card…"; the box label wrapped and made its button
taller on a phone; opening a pack and Open all crept back over 100ms with three
sets rendered behind the scene (the page is no longer rendered under one, and
Open all is two tasks); a tools/play paint test walked unrepelled and failed
now and then when a step started an encounter.

## Before phase 4 *(2026-10-02, your calls)*

- **No glow before a tap**: a hit's gold halo was a spoiler and is gone. A
  hit and the last card charge white on their tap; the rarity's colour comes
  with the card.
- **The revealed card is simply face up when the flash clears** - no turn, no
  animation. The first fix (a fast turn) measured fine on rotation, but
  leaving the charge restarted the card's entrance animation, which faded it
  in from opacity 0 right after the flash: about 20 bad frames, found by
  sampling opacity as well and confirmed by putting the old rule back.
- **Confetti fires from cannons** in the bottom-left and bottom-right corners,
  arcs up and drifts down, behind the card, its reach the room beside the card
  (the side margins on a phone, a wide fan on a desktop).
- **Fast**: the single-pack scene turns its commons by itself; a hit and the
  last card still charge and reveal, then move on.
- **Open 10 and Open all reveal the hits only**, best last, each with the full
  reveal, then one summary of every pack (boxes and the bundle included).
- **Types in battle**: each health box shows its Pokémon's types.

## Deferred on purpose *(each with the trigger that brings it back)*

- **Trading cards** - needs server-minted card rows; trigger: players asking
  for it *and* a trading SQL phase that would mint them.
- **Playing the TCG** - a second game; trigger: never by default.
- **More sets** (the later Mega Evolution sets: Perfect Order, Chaos Rising,
  Pitch Black; or the classics) - each is disk and fetch time; trigger: a
  shipped set completed by players.
- **Regional-form cards linking to forms** - trigger: the Mega matching
  proving itself and a player asking.
- **Other languages** - trigger: the game being translated.
- **Card prices / market value** - turns a collection into speculation. Never.

## Learned from a first build *(2026-10-01, Base Set, built and reverted)*

Phase 1 was started on Base Set and taken back out to do maps first. What it
proved still holds for the new sets:

- **TCGdex works as described**, and holo is a *variant* on classic cards, a
  rarity only on modern ones.
- **The save needs `earnedPacks`** beside `packs`: a count alone cannot say
  which pack was earned.
- **The engine gets the set from the page**, so the main bundle never carries
  card data.
- **The badge pack is paid in `battleEnd`** and changes its result; tools/play
  compares that result whole in four places.
- **Seeded rolls replay**: 20,000 packs held their rates, pity capped every
  streak, and no pack held a card twice.
