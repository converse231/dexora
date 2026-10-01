# Cards — the design, a concept (not built)

The single reference for the Pokémon card phase. **Nothing here is built yet**;
this is the plan, written so a session can implement it phase by phase without
re-deciding anything. Change a decision here first, then the code. Where a
number is marked *proposed*, the rule that bounds it is the decision and the
number is a starting value that the named check will hold or reject.

Researched 2026-10-01 against the live APIs (every field and size below was
read off a real response that day - re-check them when the build starts).

## The one rule everything else serves

**Cards are a collection, never a strength.** No card, pack, binder page or set
completion changes a catch chance, a spawn table, a tier roll, a flee, a price,
a battle stat or a League level. They are a place for money and rewards to go,
and a record of the journey. The moment a card moves a roll, every economy
guard in check.mjs stops meaning anything and packs become the only purchase
worth making.

Asserted, not trusted: `game/cards.js` and `src/data/cards/*` are imported by
nothing in `game/` except the engine's card actions, and never by `catch.js`,
`biomes.js`, `battle.js`, `league.js`, `trainer.js` or `items.js` (check.mjs,
the same shape as the League's data rule).

## Decisions

| | Decided | Why |
|---|---|---|
| What a card is | **A real printed Pokémon TCG card**, its data and image from TCGdex, fetched at build time. | Asked for. Real cards carry the history (Base Set Charizard) that makes a binder worth filling. |
| Source | **TCGdex** (api.tcgdex.net, open source) primary; **Pokémon TCG API** (pokemontcg.io) only to cross-check a card's National Dex link. | TCGdex's `low.webp` is ~17-20 KB against pokemontcg.io's ~160 KB PNG, it lists each card's variants and illustrator, and it is open source. |
| When it is fetched | **Build time only** (`npm run cards`), into generated files. Never at runtime. | Local-first: the game is fully playable offline and the network never sits in the walk cycle. |
| Images | **Self-hosted for the sets we ship**, `low.webp` for grids and `high.webp` for the inspect view, under `public/cards/<set>/`. | Hotlinking a third-party CDN breaks offline play and rides on its uptime. |
| Which sets | **Phase 1: Base Set.** Then Jungle, Fossil (the Kanto classics), then **151** (Scarlet & Violet's modern Kanto set, the modern rarities). More only by trigger. | Kanto first matches the game's own start; 151 proves the modern rarity ladder on the same 151 species. |
| Which cards | **Every card in a shipped set** - Pokémon, Trainer and Energy - because set completion means the whole set. | A binder with holes the player can never fill reads as a bug. |
| Rarity | **The set's own printed rarity**, read from the API and normalised onto one ordered list, `CARD_RARITIES`. Our rare-form tiers are NOT reused. | The card's rarity is a fact about the card; inventing ours would misdescribe real cards. |
| Pack contents | **The set's real booster structure** (slots), from a per-set profile in `game/cards.js`, with hit rates close to measured real ones. | Authentic packs are the whole appeal; a flat random pick would make a Base Set pack feel like nothing. |
| Money | Packs and boxes are bought with **¥ (the game's money) only**. No real money, ever. | Non-commercial constraint; a paid pack would make this a gambling product. |
| Earned too | Packs are also **rewards** (badges, League clears, daily streaks, Pokédex ranks). | A sink that only drains money feels like a tax; one you also earn by playing feels like a reward track. |
| Duplicates | **Recycled into Card Dust; dust crafts any card you are missing.** | Pity and a second sink in one, and it bounds the cost of completing a set. |
| Pity | **A capped "dry" counter per set** guarantees a rare-slot hit, like `dry` on the tier ladder. | Twenty packs with nothing is the moment a player quits. |
| Link to the game | Through the **National Dex number** on each Pokémon card (`dexId`): a card of a species you have caught wears your catch stamp; the Dex sheet lists your cards of that species. | The binder becomes a record of *your* journey, not a second copy of the Pokédex. |
| Trading cards | **Not in the first releases.** Deferred (see Deferred). | trading.md decided "Pokémon for Pokémon only": a card is fungible and client-owned, so trading it is the duplication problem. |
| Ranking | **Nothing card-related is ranked or on a leaderboard.** | There is no trust boundary: a save can claim any card. |
| Credit | Every card view names its **illustrator** (TCGdex field) and the source; README credits TCGdex and the illustrators. | The art is theirs and The Pokémon Company's. |

## Sources *(each tested live on 2026-10-01)*

| Need | Endpoint | Notes |
|---|---|---|
| Set list | `GET https://api.tcgdex.net/v2/en/sets` | 220 sets. Each: `id`, `name`, `cardCount.{total,official}`, `logo`. |
| One set | `GET /v2/en/sets/{id}` | `cards[]` (id, localId, name, image), `releaseDate`, `serie`, `cardCount.{firstEd,holo,normal,reverse,official,total}`. Base Set: 102 cards. 151 (`sv03.5`): 207 total, 165 official. |
| One card | `GET /v2/en/cards/{id}` | `category` (Pokemon / Trainer / Energy), `rarity`, `dexId[]` (National Dex numbers, absent on Trainer/Energy), `variants.{normal,holo,reverse,firstEdition,wPromo}`, `illustrator`, `hp`, `types`, `stage`, `trainerType`, `energyType`. |
| Card image | `{image}/low.webp`, `{image}/high.webp` | Measured: low 17-20 KB, high 57-79 KB. |
| Cross-check | `GET https://api.pokemontcg.io/v2/cards?q=set.id:base1` | `nationalPokedexNumbers[]`, `rarity` ("Rare Holo" folded into rarity). Used only by the fetcher to confirm `dexId`. |

Rarity strings seen: classic `Common`, `Uncommon`, `Rare` (holo is a *variant*:
Base Set Charizard is `rarity: "Rare"`, `variants.holo: true`). Modern (151):
`Common`, `Uncommon`, `Rare`, `Double rare`, `Illustration rare`,
`Ultra Rare`, `Special illustration rare`, `Hyper rare`. The fetcher refuses a
rarity string it does not know - it is a new rung to decide, not a default.

**Fetch etiquette.** One request per card at build time (Base Set = 103
requests), 4 in flight, cached on disk under `.assets-src/cards/` like every
other fetcher, so a re-run downloads nothing it has. Check TCGdex's licence and
terms when the build starts and record them here.

## The ladder: `CARD_RARITIES`

One ordered list in `game/cards.js`, rarest last, the single source for sort
order, filters, dust values, the reveal's anticipation colour and the binder's
rarity marks - the `TIERS` rule applied to cards. Every screen reads its order
and words from it; none types a rarity.

| id | Printed as | Seen in | Reveal cue |
|---|---|---|---|
| `common` | Common | all | none |
| `uncommon` | Uncommon | all | none |
| `rare` | Rare | all | a soft white edge |
| `holo` | Rare + holo variant | classic | foil sweep on the flip |
| `reverse` | any card, reverse-holo variant | modern | foil on the frame, not the art |
| `double` | Double rare (ex) | modern | gold edge before the flip |
| `illustration` | Illustration rare | modern | full-art: the card turns face up slowly |
| `ultra` | Ultra Rare | modern | gold edge + light burst |
| `special` | Special illustration rare | modern | screen dims, burst, slow flip |
| `hyper` | Hyper rare (gold) | modern | as special, gold light |

Variants are held per card: `normal`, `holo`, `reverse`, plus our own
**`earned`** stamp (below). `firstEdition` is not reproduced - "1st Edition"
was a print run we cannot honestly simulate; `earned` takes its place as the
thing that makes one copy of a card special.

**The Earned stamp.** A card that came from a *reward* pack (a badge, a League
clear, a Pokédex rank) carries `earned` with where it came from ("Boulder
Badge · day 40"). It is the same card; the stamp is the story. Bought packs
never stamp.

## Packs: the algorithm

### Per-set profiles (`SET_PROFILES` in `game/cards.js`)

A profile is the set's booster: an ordered list of slots, each a weighted
table of `(rarity, variant)`. Weights are *proposed*, from real print
structures and community-measured pull rates; check.mjs simulates each profile
and holds the hit rates below within ±15%, so an edit that moves a rate fails.

**Base Set (classic, 11 cards)** - the real Base Set booster shape:

| Slot | Count | Contents |
|---|---|---|
| Common | 5 | `common` Pokémon and Trainers |
| Uncommon | 3 | `uncommon` |
| Rare | 1 | `rare` 2/3, `holo` 1/3 |

Hit rate: a holo rare in **1 pack in 3**. Jungle and Fossil use the same shape.

**Basic Energy is given, not packed** (decided 2026-10-01): the real booster
carried two, and two dull cards in every opening is the thing that makes a
pack feel like nothing. A set's basic Energy cards are granted, one copy each,
the first time its packs open, so the set still completes; packs hold only
Pokémon and Trainers (a Base Set pack is 9 cards). Special Energy (Double
Colorless) is an ordinary card of its printed rarity and stays in packs.

**151 (modern, 10 cards)** - the Scarlet & Violet booster shape:

| Slot | Count | Contents |
|---|---|---|
| Common | 4 | `common` |
| Uncommon | 3 | `uncommon` |
| Reverse 1 | 1 | a reverse-holo of any common/uncommon/rare |
| Reverse 2 | 1 | a reverse-holo, **or** an `illustration`, `special` or `hyper` in its place |
| Rare | 1 | `rare`, **or** `double` / `ultra` in its place |

Hit rates to hold (per pack, *proposed from measured community rates -
re-measure before shipping*): `double` 1 in 8, `illustration` 1 in 12,
`ultra` 1 in 16, `special` 1 in 32, `hyper` 1 in 51.

### Opening a pack (`openPack(setId, rng, pity)`, pure)

1. For each slot in order, roll its table with `rng` for a `(rarity,
   variant)`, then pick a card of that rarity uniformly from the set.
2. **No card twice in one pack** (re-pick within the slot; a slot whose pool
   the pack has used up takes the next rarity down).
3. **Pity:** `pity[setId]` counts packs since the last pack with a hit (the
   set's `hitAt` rarity or better: `holo` for classic sets, `double` for
   modern). At `PITY_AT` (*proposed* 10) the rare slot is forced to a hit
   and the counter resets. The counter resets on any hit, like `dry`.
4. Return the cards in **reveal order**: commons first, the hit last - the
   order *is* the drama, so it is decided here, not in the UI.

It is pure and browser-free (the `src/game` rule) and takes every roll from
`rng`, so tools/play and check.mjs replay it with `mulberry32` seeds. The
engine calls it with `Math.random` - there is no trust boundary to defend,
and a seeded RNG a player could reset would only be a way to reroll.

### Completing a set, bounded

Opening packs is a coupon-collector problem: the last few commons of a
102-card set take many packs. **Dust bounds it**:

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
| hyper | 400 | 3,200 |

*Proposed.* The relation is the rule: **craft = 8 × dust** (you trade eight
duplicates for one card you choose), and check.mjs holds that the expected
spend to complete a set by packs plus dust stays inside the band in Economy.
Only duplicates dust: you can never dust your last copy of a card-variant.
`earned` copies never dust automatically (a keeper, like a variant Pokémon).

## Economy

What money is for today: balls, candy, berries, field items, stones, League
items - all needed up to a point, then money piles up. Measured 2026-09-30 by
check.mjs: a 50,000-step playthrough earns about **¥525,700** (¥405,700 played,
¥120,000 walked); a full Lv 75 game about **¥1,556,693**, of which League
one-off prizes are ¥137,769. Cards are the sink that has no ceiling and buys
no advantage.

| Item | Price (*proposed*) | Bound check.mjs holds |
|---|---|---|
| Booster pack | ¥2,400 | between 150 and 400 steps of median income at the level its set opens |
| Booster box (36 packs) | ¥72,000 (≈ 17% off) | a box never beats packs by more than 20% |
| Card craft | dust only | never buyable with ¥ (dust is earned, not bought) |

**Sets open on trainer level**, like maps (`areaOpen` shape): Base Set at the
League's opening, Jungle and Fossil at their proposed levels, 151 at Lv 40.
A set you have not opened is visible and locked in the shop.

**The sink, measured.** tools/play simulates a reference player who spends
50% of surplus money on packs from mid-game: check.mjs holds that completing
Base Set (all 102, packs + dust) costs **between 25% and 60% of a playthrough's
money**, and that no other price guard moves (honey, the Master Ball band,
the League rematch guard). A pack must never be cheaper than a stack of balls
you still need: the shop orders it after them.

### Rewards (packs you earn)

| Source | Reward | Stamp |
|---|---|---|
| A gym badge (first win) | 1 pack of that region's set (Kanto: Base Set) | `earned` · the badge |
| A region's Champion (first win) | a booster box of that region's set | `earned` · the League |
| Hard mode leader (first win) | the leader's signature Pokémon's rarest card in a shipped set, if any | `earned` |
| Daily quest, 7-day streak | 1 pack | `earned` · the streak |
| Pokédex rank up | 1 pack per rank | `earned` · the rank |
| A set completed | a title ("Base Set Collector") and a binder cover; no pack | - |

Paid in `battleEnd`, `payLevels`-style: the engine pays once and records it,
reward packs land in `state.packs` unopened. check.mjs holds that reward packs
over a playthrough are at most a third of the packs the reference player opens.

## Data model

### Generated files (never hand-edited)

| File | Made by | Holds |
|---|---|---|
| `src/data/cards/<set>.js` | `npm run cards` | one set: `{id, name, released, logo, total, cards: [[localId, name, category, rarity, variants, dexId[], illustrator]]}` - compact arrays, like `learnsets.js` |
| `src/data/cards/index.js` | `npm run cards` | the shipped set list and each set's card count - the only card data the main bundle carries |
| `public/cards/<set>/<localId>{,-hi}.webp` | `npm run cards` | the two images |

Size budget, asserted: Base Set ~2 MB low + ~8 MB high on disk, lazy by
nature (only an opened pack or an open page fetches them). The main bundle
carries `index.js` only (under 1 KB gzipped, asserted like `gymtune.js`).

### The save (each field a `savedField` line in tools/play)

| Field | Shape | Notes |
|---|---|---|
| `cards` | `{ "base1-4": { n: 2, holo: 1, earned: ["badge:kanto-brock"] } }` | **keyed by card id, never position** (the Research rule): a new set never moves a save. Counts are whole numbers, capped at `CARD_MAX` 99. |
| `packs` | `{ base1: 3 }` | unopened packs by set. |
| `dust` | number | whole, ≥ 0. |
| `cardPity` | `{ base1: 4 }` | packs since the last hit. |
| `cardSeen` | not in the save | "new" badges on cards are per-device localStorage, like News. |

`loadState` drops a bad card row, never the whole object; an id the build does
not know is kept (a newer build's set), shown nowhere, and never dusted.
Exports carry all four. Nothing here is VOLATILE.

### The engine's card actions (the only writers)

`buyPacks(setId, n)`, `buyBox(setId)`, `openPack(setId)` (returns the reveal
list, records it, calls `changed()` once at the end, never per card),
`dustCard(id, variant, n)`, `craftCard(id, variant)`. All go through
`whole()`, refuse when a set is not open or money/dust is short (answering
why, like `battleBegin`), and the irreversible ones ask first through
`state.ask`: dusting a rare-or-better, and dusting an `earned` copy.

### The server

**Nothing new in phase 1.** Cards ride in the save JSONB like everything else;
the save trigger, `mirror` and the ownership latch cover them unchanged. The
trainer card's showcase can show cards only once `trading.sql` grows a
`card_showcase` column (a trading.sql change, never redefined in another
file) - phase 4. Card trading would need server-owned card rows minted by the
server - deferred.

## Frontend

**The Cards page is `src/ui/cards/`, reached only by `lazy()`** (asserted,
with the data it imports) - a player who never opens it downloads none of it.
It is a PAGE like the Trade Center (`.cd-page`, one scroll, pinned header and
tabs, takes the modal lock, pushes `#/cards` so Back closes it) and pauses the
engine while open, like the League.

Entry points: the menu (**Cards**, with a dot while you hold unopened packs),
the Dex sheet's Info tab (a "Cards of this Pokémon" card), and the reward
banner after a badge ("A Base Set pack! Open it").

### Tabs

1. **Packs** - the sets as pack art (the set logo on a foil wrapper we draw),
   each with price, what it holds ("11 cards · holo 1 in 3"), your unopened
   count, and **Open** / **Buy** / **Buy a box**. Locked sets show their level.
2. **Binder** - one set at a time, **nine-pocket pages** like a real binder
   (3×3 on desktop, 2×3 on a phone), page-turn left/right, cards in set order
   (`localId`). An empty pocket shows the card's number and name faintly, so
   you know what you are missing. A pocket holds the best copy you own and a
   small count badge.
3. **Card Dex** - every card of every shipped set in one windowed grid (the
   Dex's `useRows`), filterable by set, rarity, category, owned/missing and
   species; sortable by set order, rarity, National Dex number. Each tile:
   the image, rarity mark, owned count, the catch stamp if you have caught
   that species.
4. **Dust** - duplicates listed with their dust value; a "dust all spares
   below rare" sweep (keepers and `earned` unticked, the Box sweep's rules);
   the missing cards of a set with their craft cost.

### The card view (inspect)

A dialog (`useDismiss`, the modal lock): the `high.webp` large, name, set,
number, rarity, illustrator, your copies by variant and stamp, the species'
Dex entry one tap away, and **the holo treatment**: a foil layer that follows
the pointer (desktop) or the tilt of a drag (phone) - never the device's
motion sensors. On a coarse pointer it plays a slow automatic sweep.

### Layout

Matches the rest of the game (decided 2026-10-01): the Events board's
`ev-card`s, the Trade Center's page, tabs and chips; no side stripes, no rings
round icons, colour only where it carries information. The rules that hold:
the page is a size container; a phone is `(hover: none) and (pointer:
coarse)`, never a width; a sideways phone gets the short-screen dialog shape;
the page never scrolls sideways; touch targets 36px; night mode through
tokens only.

## Animation *(the pack opening, beat by beat)*

Built the RankUp way: **delayed CSS keyframes whose resting styles are the
final scene**, so a skip (every non-`.loop` delay and duration crushed to 1ms)
and `prefers-reduced-motion` both land on the end. Only `transform` and
`opacity` animate; the foil is a masked gradient layer moved by transform.

| Beat | ms (*proposed*) | What happens |
|---|---|---|
| 1 · Choose | - | the pack sits centred, idles with a gentle float (`.loop`). |
| 2 · Tear | 600 | tap (or drag across the top): the wrapper shakes, a tear line runs along the top edge, the top flies off. |
| 3 · Fan | 500 | the cards slide out face down into a stack. |
| 4 · Flip | 220 each | tap to flip the next (or hold to flip all); commons and uncommons flip fast. |
| 5 · Anticipation | 400 | before the rare slot flips, its back glows in the colour of the rarity it WILL be (`CARD_RARITIES` reveal cue). A plain rare gets no glow, so the glow itself is the tell. |
| 6 · Reveal | 700-1,600 | holo: a foil sweep across the face. `double`/`ultra`: a gold edge and light burst. `illustration`/`special`/`hyper`: the screen dims, the card rises and turns slowly, light rays behind it (`.loop` only while shown). |
| 7 · Summary | - | the pack laid out in a row, **NEW** on first-time cards, the catch stamp on species you have caught, dust earned by duplicates shown as a counter, and **Open another** / **Binder** / **Done**. |

Details that matter:
- **Images load before the tear.** `openPack` has already decided the cards, so
  the page preloads their `low.webp` (and the hit's `high.webp`) during beat 1
  and keeps the `Image` objects (the `preloadSprites` rule: the host answers
  `no-cache`, a dropped one revalidates and draws late). The tear waits for
  them, with a timeout, so a card never flips onto a blank face.
- **The pack is decided before the animation, and saved at once.** A reload
  mid-opening loses nothing: the cards are already in `cards`, and the next
  visit shows them as NEW.
- **Skip** is always on screen (and Escape, and B on the touch pad).
- **Opening a box** opens its packs one after another with the same scene and
  a running tally; "Open all" skips to one summary of every hit.
- **Keyboard:** Space/Enter flips and advances, Escape skips; focus moves to
  the revealed card; the rarity is announced (`aria-live`).
- **Sound:** the game has none; do not add it here alone.

## Game integration, the small stuff

- **The catch stamp**: a Pokémon card whose `dexId` includes a species your
  Pokédex has as caught shows a small Poké Ball stamp; seen-only shows
  nothing. A card with several `dexId`s (tag teams) needs any one.
- **The Dex sheet** (Info tab) gets a "Cards" card: your cards of that
  species as small thumbnails, tap to inspect, and "none yet" otherwise.
- **Forms**: a card's `dexId` is a National Dex number, never a form id -
  Alolan cards link to the base species (`isForm` is the game's own concept).
- **Trainer and Energy cards** have no species: no stamp, no Dex link, and
  the Card Dex's species filter hides them.
- **News**: one entry when the phase ships (the News rules: an emoji, a
  title, items under two phone lines).
- **Help**: a Cards section (what a pack holds, what dust is, that cards
  change nothing in the wild).
- **Hints** (first time): the first reward pack, the first duplicate, the
  first time you could craft a card.
- **Research, ranks, the League and trading** read nothing from cards.
- **The top bar** shows nothing new; unopened packs are a dot on the menu,
  like trades waiting.
- **Offline**: every shipped set works offline once its images are cached by
  the browser; a set's page with no network shows the card data and a
  placeholder back for an image not yet loaded - never a broken image.

## Testing *(every assertion shown to fail when its bug is put back)*

check.mjs:
- every shipped card's `dexId` is a species in `SPECIES`; every `rarity` is on
  `CARD_RARITIES`; every card has both image files, each under its size bound.
- each `SET_PROFILES` entry, simulated over a seeded 20,000 packs, lands every
  hit rate within ±15% of the table above; pity never lets a streak exceed
  `PITY_AT`; no pack holds a card twice.
- the economy bounds above (pack price band, box discount cap, the
  completion-cost band, the reward share, craft = 8 × dust).
- the one rule: no forbidden module imports card data or `game/cards.js`.
- `src/data/cards/index.js` is under its gzip budget; the Cards page is
  `lazy()`.
- the generated files match a re-run of the fetcher's parse over the cached
  responses (the `npm run edge` shape: stale output fails).

tools/play:
- `savedField` lines for `cards`, `packs`, `dust`, `cardPity`.
- buy, open, dust and craft through the engine: money and dust move exactly,
  a refused action changes nothing, a reload mid-open keeps the cards, and an
  open calls `changed()` once.
- a save from a newer build with an unknown set id loads and keeps it.

Browser (the dev server, pointer emulated): the opening's resting state
equals the skipped state; reduced motion lands on the summary; the binder
turns pages at 390×844 and 844×390 without horizontal scroll.

## Phases *(each ends with `npm run check` and `npx vite build` passing)*

1. **Base Set, end to end.** Fetcher and generated files for `base1`; `game/cards.js`
   (ladder, profile, `openPack`, pity, dust); the save fields; engine actions;
   the Cards page with Packs, Binder and the opening scene; badge reward packs;
   the one-rule and economy guards.
2. **Card Dex, Dust and the card view** (holo treatment, inspect, crafting,
   the sweep); the Dex sheet's Cards card; Hints and Help.
3. **Jungle, Fossil, then 151** (the modern profile and the full rarity
   ladder); booster boxes; the remaining rewards (Champion, streak, ranks).
4. **Show-off:** set-completion titles and binder covers; a card showcase on
   the trainer card (a `trading.sql` column, SQL first).

## Deferred on purpose *(each with the trigger that brings it back)*

- **Trading cards** - needs server-minted card rows so a traded card cannot be
  forged; trigger: players asking for it *and* the trading SQL phase that
  would mint them.
- **Playing the TCG** (decks, matches) - a second game; trigger: never by
  default, a separate design if ever.
- **More sets** - each one is disk and fetch time; trigger: a shipped set
  completed by players, or a region's maps arriving.
- **Other languages** - TCGdex serves them; trigger: the game being translated.
- **1st Edition** - replaced by `earned`; trigger: none.
- **Card prices / market value** - TCGdex carries real-world prices; showing
  them turns a collection into speculation. Not shown, not stored.

## Learned from a first build *(2026-10-01, built and reverted - parked, not rejected)*

Phase 1 was started and taken back out at the player's call to do maps first.
What it proved, so the next build does not rediscover it:

- **TCGdex works as described.** Base Set is 102 cards: 16 holo rares (read as
  `rarity: "Rare"` with only `variants.holo`), 16 rares, 32 uncommons, 38
  commons, 6 of them basic Energy (`energyType: "Normal"`). Low and high images
  together are 9.3 MB.
- **The save needs `earnedPacks`** beside `packs` (`{ base1: ["badge:kanto-brock"] }`,
  never longer than the unopened count): a count alone cannot say which pack
  was earned, and an earned pack is what stamps its cards. Opened first.
- **The engine gets the set from the page.** `openPack(set)` takes the set the
  page has lazily loaded, so the main bundle never carries card data; the
  engine checks its id and decides and saves the pack before a frame plays.
- **Base Set opens at Lv 10**, near the first gym: at a playthrough's average
  of about ¥10.5 a step, ¥2,400 is about 228 steps, inside the 150-400 band.
- **The badge pack is paid in `battleEnd`** on a first win over a `leader`
  whose region has a set (`REGION_SET`), and `battleEnd`'s result gains a
  `pack` field - tools/play compares that result whole in four places.
- **The rolls held** over 20,000 seeded packs: a holo 1 in 2.94 (pity nudges
  it past 1 in 3), never more than 9 dry packs, no card twice in a pack.

## Decided before phase 1 *(2026-10-01)*

1. **Pack price ¥2,400**, as proposed.
2. **Basic Energy is given, not packed** - see Base Set's profile.
3. **Reward packs as the table above.**
4. **The Cards page matches the rest of the game** (the Events board's cards,
   the Trade Center's tabs and chips); the pack opening is its one showpiece.
