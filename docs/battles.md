# Battles — the design, decided

The single reference for every battle phase, in the shape of
[trading.md](trading.md). README's *Battles* section is the short reasoning;
this is what was decided (2026-09-28, **Phase 0: awaiting approval**, revision
4) and how it is built. Change a decision here first, then the code.

- **Revision 2: battles left the map.** A League page organised by region,
  DelugeRPG's shape without copying it: catching is the map, battling is the
  page.
- **Revision 3: your answers, and the sources researched.** Leaders fall in
  the games' order, and a region opens only when the one before it is
  cleared. Rosters, gym trainers and badges come from Bulbapedia and
  Bulbagarden Archives, and portraits from Showdown, each tested live (*Sources*).
  Of the twists, only friend ghost battles stay.
- **Revision 4: the last three answers.** Alola's leaders are its four
  Kahunas; the Elite Four and Champion are required to open the next region;
  version differences are settled by one rule (*Game per region*). And a
  *Performance* section: what the League costs the game, measured, and what
  keeps the walk at 60fps.

Every number marked *measured* came from a throwaway prototype of the rules
(the Gen 3 stat and damage formulas, real PokéAPI learnsets and moves, real
pret parties, the live encounter tables, `candyValue`, `catchChance`,
`catchBounty` and `stepWage` imported from `src/game`) over many thousands of
battles. The prototype is not the shipped rules. **Phase 2 re-measures every
figure with `battle.js` and the generated rosters and replaces the numbers
here**; *How this was measured* lists what the prototype left out. Its
eleven-gym ladder is kept below as evidence that the *mechanisms* work.

## The one rule everything else serves

**A battle never gives a Pokémon EXP or a level.** A level is bought only with
Rare Candy (`levelUp`), one candy a level on one `uid`, exactly as evolution
already works. So a team is paid for in candy, and battles are a **candy sink**
that competes with the Pokédex for the same currency. Measured, that
competition is real: evolving one of everything costs **18,989 candy** from
wild levels (7,668 of it outside forms), and a whole Lv 75 game earns about
**19,444** if every catch is converted. The README said "adding battles is a
different game"; that is true of battles that level Pokémon, and this design
does not build those.

## The shape

```
Menu ─ League  (#/battle, a page like the Trade Center)
       ├─ region tabs: Kanto · Johto · Hoenn · Sinnoh · Unova · Kalos · Alola · Galar · Paldea
       │    Kanto is open from the start; each later tab opens when the one before is CLEARED
       │    ├─ Gyms, in the game's order: each gym is its trainers, then its leader
       │    │     a gym is reached when the previous leader is beaten
       │    │     inside it, its trainers in order, then the leader (rev 5)
       │    │     (Alola: the four Kahunas' grand trials, in island order)
       │    └─ Elite Four & Champion   open with the region's badges, each opened by beating the one before
       └─ Friends   ghost battles against a friend's showcase
Card ─ Battle → team select (refusals say why) → the fight → result
       Team   → the opponent's team, shown before you commit
```

**Cleared** = every gym trainer, every leader, the Elite Four and the
Champion of the region beaten. *(rev 4)*

## Decisions

| | Decided | Why |
|---|---|---|
| Where | **A League page, never the map.** `.bt-page`, `#/battle`, built like the Trade Center: pinned header and tabs, one scroll, the modal lock, Back leaves it, a **lazy chunk** holding `battle.js`, the move data and the rosters. The walk engine pauses while it is open. No NPC stands on any map; `build_map.py` does not change. | Catching and battling are different games; a trainer on a map is an obstacle for a player who came to catch. Learnsets, moves and rosters are the heaviest data in the game, and a player who never battles must never download them. |
| Order in a region *(rev 5, 2026-09-29)* | **Leaders in the game's order. A gym is reached when the previous leader is beaten; inside it, its trainers are fought in the roster's order, each opening when the one before is beaten, and the leader opens once every one of its trainers is.** A gym with no trainers (Alola's grand trials, a few in Johto, Galar and Paldea) opens on its leader. **A win is never taken back**: anyone already beaten stays open for a rematch, so a save from rev 3 that beat a leader past its trainers keeps it, and the next gym is reached on that leader as before. | Your call, and the games' own: you walk through a gym's trainers to reach its leader. Rev 3 let the trainers be skipped ("any order", optional until the region's clear). The solver is untouched: the reference player earns candy from catches only, never from prizes, so fighting the trainers first changes no solved level. |
| Region unlock *(rev 4)* | **Kanto is open from the start. Each later region opens when the previous region is cleared**: every gym trainer, every leader, the Elite Four and the Champion beaten. **No trainer-level gate.** | Your call: one gate, earned by playing the League itself, and the Champion is the region's last door as in the games. Candy is still what makes a region *winnable* (the caps), so a region opened early is open but hard, never broken. |
| Game per region *(rev 4)* | **Kanto: FireRed/LeafGreen · Johto: HeartGold/SoulSilver · Hoenn: Emerald · Sinnoh: Platinum · Unova: Black 2/White 2 · Kalos: X/Y · Alola: Ultra Sun/Ultra Moon · Galar: Sword/Shield · Paldea: Scarlet/Violet.** **Where the two versions field different opponents, the FIRST-named version wins** (Black 2's Drayden over White 2's Iris; Sword's Bea and Gordie over Shield's Allister and Melony); where one version's opponent is missing a party, the other's is taken. `fetch-leagues.mjs` applies the rule and records which version each opponent came from. | The enhanced or definitive release of each region, whose Bulbapedia sections are complete. One rule instead of a per-region choice, so it can never be applied inconsistently, and it re-applies itself on a re-fetch. FireRed and Emerald also have pret decompilations, which let the fetch cross-check two independent sources (*Sources*). Paldea's gyms can be taken in any order in the game; its order here is the level order (Katy, Brassius, Iono, Kofu, Larry, Ryme, Tulip, Grusha). |
| Rosters *(rev 3)* | **Generated from Bulbapedia, never typed.** `tools/fetch-leagues.mjs` (`npm run leagues`) reads each gym page's section for the region's game: every `{{Trainerentry}}` (a gym trainer: class, name, species by dex number, levels, sprite) and the leader's `{{Party}}` with its `{{Pokémon}}` rows. Elite Four and Champion come from the region's Pokémon League page the same way. Output: `src/data/leagues.js`, generated. **First battles only; rematch teams are not taken.** | Tested live: Pewter Gym carries Brock's Party per game (RB, Y, GSC, FRLG, HGSS, LGPE), Cortondo Gym its two gym trainers and Katy, Turffield Stadium three gym trainers and Milo. Dex numbers come straight from the page, so no name matching. It is the one source covering all nine regions; pret covers three, and PokéAPI has no trainers. |
| Alola *(rev 4)* | **Alola's leaders are its four Kahunas' grand trials, in island order: Hala, Olivia, Nanu, Hapu**, from the Ultra Sun/Ultra Moon `{{Party}}` blocks on each Kahuna's own Bulbapedia page (checked: Hala's page carries 10, for Sun/Moon and Ultra Sun/Ultra Moon). **Alola has no gym trainers**: the grand trials have none in the games (checked: the *Grand trial* page lists no `{{Trainerentry}}`), so clearing Alola is its four Kahunas, its Elite Four and its Champion. Its badges are the Kahunas' **Z-Crystals**, from Bulbagarden's `Dream <Name> Z Sprite.png` (80 px renders, checked for all four; the 24 px bag sprites would clash with the badge renders). **Four leaders, so its caps climb in four steps** (the same `GYM_CAP_STEP` spread over the region's range). | Your call. Alola has no gyms; the grand trials are its eight-badge equivalent, and the only island-challenge battles against a trainer's full party (the captains' trials are mostly Totem battles). |
| Trainers *(rev 3)* | **A region's trainers are its gyms' own trainers**, with their real classes, names and teams. | Your ask was "all trainers and gym leaders", and a finite, real list is what a clear-the-region gate needs. Hundreds of route trainers would make a region a chore, and invented classes would be a guess where a real list exists. |
| Seeing the team | **A card's "Team" button shows the opponent's party before you commit.** | Choosing counters is the skill a CPU battle has, and the reference player the difficulty is solved against sees the gym's type. |
| No EXP | **Battles never change a level, XP, or anything but money, badges and rematch clocks.** Trainer XP from battles is **0**. | Candy is the only way to a level, and `LEVEL_XP` pays stat points and opens maps. tools/play asserts it. |
| Trust | **All rules run in the browser: no PvP, no leaderboard, no ranked mode.** Friend battles are CPU ghosts with cosmetic stakes. | There is no trust boundary. |
| Rules module | **`src/game/battle.js`, browser-free and pure: `step(battle, action, rng) -> battle`**, seeded by `mulberry32`, never mutating its input. The engine holds the current battle as `state.battle` (VOLATILE); the page computes each step and hands it over. | tools/play and check.mjs simulate thousands of battles in Node. The engine holding it pauses the walk, and a reload drops it. The page computing the step keeps `battle.js` out of the main bundle (asserted, like Supabase in `net/cloud.js`). |
| Volatile | **A battle is never saved. A reload mid-battle is a forfeit with no penalty.** *(phase 2)* A League member is its own battle, opened by beating the one before, like a leader - chained into one run at 50% each, a League would be cleared about 3% of the time, so a reload restarts the run. | A half-battle in a save is a new save shape for a fight of about 15 turns. |
| `changed` / `stepped` | **Each turn's animation calls `stepped()`; only the result calls `changed()`**, once. | A `colRev` bump per turn would rebuild the Dex and Box on every hit. |
| Stats | **Gen 3 formula from `species.stats` and the level. IVs 0-31 from a hash of the uid. No EVs, no natures.** *(phase 2)* An OPPONENT can be trained: past a solved ace of Lv 100, difficulty goes on as effort (the Gen 3 EV term, up to 252 EVs a stat), as post-game trainers in the games are. A player's Pokémon never has any. | EVs and natures need a training loop and a UI, a second grind in a collecting game. A uid hash gives every existing Pokémon IVs already. |
| Size and alpha | **No stat effect.** | Measured: in a mirror match **+5% Speed wins 88%** (Speed is a threshold), +5% HP 58.6%. "XS +Speed, XL +HP" cannot be symmetric, and any shift turns a random roll into strength. |
| Tiers | **A variant gets nothing in battle but its look.** | Tiers are kinds, not strengths. |
| Moves *(phase 1)* | **The four most recently learned level-up moves at the entry's level, read across its line** (the species and its pre-evolutions: a Metapod keeps the Tackle it learned as a Caterpie, which PokéAPI records only under Caterpie), from the newest version group PokéAPI lists for each (Let's Go and Legends: Arceus skipped - a cut-down and a different move system), skipping moves the rules cannot express. A form with no level-up moves of its own (a Mega) takes its species'. A line that learns nothing with power (Wobbuffet) fights with Struggle. **No TMs, no move choice in v1.** *(phase 2)* **An opponent fights with its own game moveset** (Bulbapedia's party row, fetched with the roster), the level-up rule only for a row with none (a gym trainer's) or none the rules can use. | The games' own rule, no UI, no saved field, and derived. The first draft gave opponents the level-up rule too, since their levels are solved; measured, that left Clemont's all-Electric team with nothing but Electric and weak Normal moves against a player who brings Ground-types - 100% at any level. A leader's own set carries the coverage its type lacks, and it is the game's. |
| Move effects | **Supported: damage (multi-hit, priority, crit stage, drain, recoil as negative drain), healing, burn, poison, paralysis, sleep, freeze, stat stages (accuracy and evasion included), flinch.** A damaging move with another side effect keeps its damage; a move with no power and nothing supported is never chosen. `fetch-moves` flags each; check.mjs prints both counts. | Measured over 474 moves: **122 (26%) never chosen** (Protect, Leech Seed, Confuse Ray, weather, terrain, hazards, OHKO, fixed damage), **31 (7%) fall back to plain damage** (confusion, trapping). Confusion is the first to add. |
| Ending | **PP from PokéAPI; out of PP means Struggle.** | The prototype stalled forever on Harden against Slack Off. |
| Format | **Singles. Up to 6 against a gym trainer; up to the opponent's party size against a leader, Elite Four member or Champion.** Switching costs the turn; replacing a fainted Pokémon is free. | Measured: six against a party of three to five at equal levels won **92-100%** of every gym whatever the AI. |
| AI *(phase 2)* | **1 random, 2 best expected damage, 3 one move of look-ahead plus switching. Gym trainers use 1, leaders 2, Elite Four, Champions and rematches 3** (`AI_FOR` in battle.js). | Measured in `battle.js` on identical teams of six at Lv 50: **AI 2 beats AI 1 84%, AI 3 beats AI 2 61%** - so AI 3 earned its place. The prototype's AI 3 read 51% (45% with switching) because it switched on any bad match-up and every switch hands the foe a free hit; it now switches only when it would fall to the reply before landing a KO, and only to a Pokémon that takes that reply for under a third of its HP. |
| AI 3's kill criterion | **Shipped only if it beats AI 2 at least 55% on identical teams; otherwise deleted, and its users take AI 2.** Held by check.mjs every run. | Difficulty comes from solved levels, not the AI, so a third level must earn its code. |
| Difficulty | **Solved, not typed.** A party keeps its game's level spread, and its ace level is **solved per leader** - and past Lv 100, its training (`top` = 100 + effort, `MAX_EFFORT` 63) *(phase 2)* so a reference player wins a target share: **85% at a region's first leader falling to 60% at its eighth; 50% an Elite Four member; 40% the Champion.** A gym's trainers keep their game's levels in the same ratio to their leader. `tools/tune-gyms.mjs` (`npm run gyms`) writes a generated file. *(phase 2)* Each solved rate is measured on a fixed record (200 battles, one seed) that check.mjs **replays exactly**, so any change to the rules or rosters says to re-solve, and holds within **±15 points** of target. | Measured: a flat edge gave 0% at a cap-13 gym and 98% at a cap-53 one; a proportional one still spread gyms 1-99%, because difficulty is the party and what counters it (Glacia crosses Walrein's evolution level between +0% and +10%: 98% to 16%). Solved, all eleven prototype gyms landed within 14 points of target (table below). |
| Reference player | **AI 2, type-aware**, picking from up to 250 catches off the maps open at the leader's intended level, raised lowest-first with the candy of that level. | Measured: ignoring the gym's type made Wattson 1% and Flannery 98%. |
| Level cap | **Every leader has a cap; a Pokémon over it is REFUSED, not scaled down.** Caps come from the ladder (next row) and never go down it. Gym trainers have no cap. | Measured: scaled down, a Lv 100 Metagross is still a Metagross and **won 5 of 11 gyms alone; Groudon 8**. Refused, Metagross exists only from Lv 45. |
| Legendaries *(phase 2)* | **A legendary enters at or under `cap × min(1, 360 / its base stat total)`** (`legendLevel`, `LEGEND_BST` 360): Mewtwo (680) may bring 52% of the cap, Moltres (580) 62%, a legendary weaker than 360 the whole of it. | No evolution floor, so refusal alone does not hold a legendary. The first rule, a flat 80%, measured on the League's own ladder let a wild Complete Zygarde (708) win 7 of Kanto's 8 leaders alone and Mewtwo 5 - several legendary forms are wild, so a lucky early player can own one. Against the solved leaders 420 over BST still let Zygarde and Crowned Zacian take 4; at 360 none takes more than 3 of a region's leaders (the check's bound), and a weak legendary is not punished for a strong one's sake. |
| The ladder *(phase 2)* | **The League is spread over one playthrough and candy sets every cap.** **The League opens when a counter can be caught**: the first trainer level at which, for every one of Kanto's leaders' types, some open map is at least 5% things super effective against it (`QUEST_SHARE`, the daily quest's measure of a task) - trainer Lv 9, when Mt. Moon's Ground-types arrive. From there the 115 capped opponents, in order, are intended at even steps to the end of a playthrough's 3,500 encounters, so each region is about a ninth of the game. Opened at the first encounter instead, Brock faced two Lv 7 catches with nothing that hits Rock and solved to a Lv 2 ace; a floor at his cap then made him unwinnable (24% for 85%). Opened at Lv 9 he solves to Lv 7, near his challenger's own level. An opponent's cap is what a full team can be raised to by then with `share` of the candy earned, over the best wild level on offer, and **`share` is solved so the last Champion asks for a Lv 100 team exactly as the playthrough ends** (7.7%). The first cap falls out of the same sum: Kanto runs 11 to 25, Johto 26 to 34, Hoenn 36 to 43, Sinnoh 46 to 53, Unova to 63, Kalos to 70, Alola to 79, Galar to 89, Paldea 89 to 100. | The first draft's fixed step (+5 a leader) put every region after Johto on the Lv 100 ceiling - thirteen capped opponents a region - where a level stops being a difficulty. `GYM_CAP_FIRST`, `GYM_CAP_STEP` and `CANDY_SHARE` are gone: nothing on the ladder is typed. |
| A trainer's Pokémon *(phase 2)* | **The stage of its line that its solved level reaches**, both ways: below its evolution level it is the stage before, and past the price of any evolution a player could buy (a level, a stone, a trade, a bond) it is the stage after. | Derived from `evoLevel`: a solved level below a Pokémon's evolution level must not field a species a player cannot own at that level. Level rows alone left Brassius's Petilil (a Sun Stone) a Petilil at Lv 100. |
| Badges and HMs | **A badge gates nothing in the world.** Surf and the bike stay tied to level and key items. No HMs are added. | A badge must never take away what a save already has. |
| Traded Pokémon | **May battle; a win pays the trainer.** | The prize is the trainer's. A trade still fills the dex and no credit mark. |
| Locks | **A Pokémon locked in trading cannot join a team**, and the picker says why. | Locks are enforced in the engine; a battle is one more caller. |
| Wild encounters | **Stay throw-only. No weakening before a throw.** | Measured with `catchChance`: a rate-45 rare costs **¥59 a catch with a weakened Poké Ball** against **¥472 with an Ultra Ball at full HP**. Every ball price is tuned at full HP. |
| Trainer card | **`badges` (a count) is a new `trainer_cards` column, computed by `card_stats()` from the stored save**, like `dex_count`, and added to the column grant. | A card's stats are read off the save by the trigger; `update_card` is for the player's choices. |

### The prototype's ladder (first draft, one gym per map)

The mechanism evidence: pret parties, the reference player (AI 2) against AI 3
leaders, verified on fresh seeds (400 battles each). Phase 2 re-solves every
region with the generated rosters.

| # | Type | Leader (pret) | Cap | Ready at | Solved ace | Target | Measured |
|---|---|---|---|---|---|---|---|
| 1 | normal | Norman | 8 | Lv 6 | 9 (+13%) | 85% | 74% |
| 2 | grass | Erika | 13 | Lv 8 | 20 (+54%) | 83% | 90% |
| 3 | water | Juan | 18 | Lv 12 | 23 (+28%) | 80% | 71% |
| 4 | rock | Roxanne | 23 | Lv 12 | 27 (+17%) | 78% | 78% |
| 5 | electric | Wattson | 28 | Lv 15 | 36 (+29%) | 75% | 70% |
| 6 | fire | Flannery | 33 | Lv 17 | 44 (+33%) | 73% | 79% |
| 7 | ground | Giovanni | 38 | Lv 20 | 47 (+24%) | 70% | 66% |
| 8 | ice | Glacia | 43 | Lv 22 | 45 (+5%) | 68% | 54% |
| 9 | poison | Koga | 48 | Lv 21 | 57 (+19%) | 65% | 66% |
| 10 | ghost | Phoebe | 53 | Lv 25 | 69 (+30%) | 63% | 65% |
| 11 | flying | Winona | 58 | Lv 26 | 74 (+28%) | 60% | 55% |

Measured on the same prototype: trainers with the map's own types, their ace
at the map's wild top, against a player two levels in and bringing six, were
won **88-100%** of the time.

## Sources *(rev 3 — each tested live on 2026-09-28)*

| What | Source | Checked | Why it won |
|---|---|---|---|
| Leader, Elite Four and Champion teams; gym trainers | **Bulbapedia**, through its MediaWiki API (`action=parse&prop=wikitext`) | `{{Party}}` + `{{Pokémon}}` blocks per game (dex number, level, moves), and `{{Trainerentry}}` rows for gym trainers (class, name, dex numbers, levels, sprite file), on Pewter Gym, Rustboro Gym, Santalune Gym, Turffield Stadium, Cortondo Gym | The only source covering all nine regions, in one structured shape. pret covers three regions; PokéAPI has none; Serebii is HTML only. |
| Cross-check for Kanto and Hoenn | **pret** `pokefirered` / `pokeemerald` `trainer_parties.h` | parsed for the prototype | Two independent copies of one fact: the fetch compares FireRed's and Emerald's rosters with pret and **fails on a mismatch** (CLAUDE.md: check copies of one fact against each other). |
| Portraits: leaders, Elite Four, Champions, gym trainer classes | **Pokémon Showdown** trainer sprites (`play.pokemonshowdown.com/sprites/trainers/`, 1,500 files) | leaders of every region (Brock, Falkner, Roxanne, Roark, Elesa, Viola, Hala, Olivia, Nanu, Hapu, Milo, Nessa, Kabu, Bea, Allister, Opal, Gordie, Melony, Piers, Raihan, Katy, Iono, Geeta; Nemona as `nemona-s`); classes in era variants (`hiker`, `lass`, `swimmerf`, `blackbelt`, `acetrainer` … `-gen1` to `-gen9`) | **One pixel style across all nine regions.** Bulbagarden's in-game sprites exist for Gens 1-5 only (64-80 px); from Gen 6 the games are 3D and Bulbagarden has only illustrated VS art (400-720 px), so taking the games' own art would change style at Kalos. The unsuffixed Showdown name is used for everyone, which is one consistent style. |
| Move animations *(phase 7)* | **pokeemerald-expansion** (github.com/rh-hideout/pokeemerald-expansion), pinned to one commit by `tools/build_anims.py` | `data/battle_anim_scripts.s` (937 move scripts), `src/battle_anim_*.c` (1,146 sprite templates, their frame and affine tables), `src/data/battle_anim.h` (tag to sheet and palette, backgrounds), `graphics/battle_anims/` (403 sheets, 57 backgrounds); tested live 2026-09-29 | The only source with every move's own animation through Gen 9. pret's `pokeemerald` stops at Gen 3 (279 sheets). Showdown's are AGPL-3.0, code and effect art both. |
| Badges | **Bulbagarden Archives** (`archives.bulbagarden.net`, MediaWiki API) | the set the *Badge* article uses: `<Name> Badge.png` for Kanto to Galar, `SVbadge_VictoryRoad_<type>.png` for Paldea; transparent PNGs, the smallest 44 px (Trio), others 143-1280 px | Your pick, and one consistent render style for every region. Per-game pixel badges exist only for FRLG (16 px) and HGSS (22 px), so mixing them would change style mid-League. The art script scales each to 32 px. |
| Pokémon fronts, backs, item icons | PokéAPI and Showdown back strips | already the pipeline | unchanged |
| Moves, learnsets, the type chart | PokéAPI (`/move`, `/pokemon`, `/type`) | used by the prototype for 588 species and 474 moves | unchanged |

**How the fetch behaves.** Every request carries a descriptive `User-Agent`,
responses are cached under `.assets-src/` (gitignored, where the other fetches
cache) so a re-run hits the wikis once, and requests are paced. Only the generated output is committed.
**Credits**: Bulbapedia (text CC BY-NC-SA) and Bulbagarden Archives, and
Pokémon Showdown's sprite artists, join README *Credits*. The characters
belong to Nintendo and Game Freak, as everything else here does.

**Portrait mapping.** A gym trainer's Bulbapedia class ("Jr. Trainer♂",
"Camper", "Gym Trainer") maps to a Showdown file through one small table in
`fetch-leagues.mjs`; check.mjs asserts every roster entry resolves to a file
that exists. Gen 8-9's generic "Gym Trainer" has no Showdown sprite and maps
to the Ace Trainer of its gender. *(phase 1)* Resolution is: the unsuffixed
sprite, the female one where the trainer is female (read off the class's ♀ or
the page's sprite name), then the era of the region's game, then the newest
era. **162 portraits cover all 391 opponents; 12 exist only in an older era**
and so are GBA-style rather than Gen 5-style: Lorelei, Agatha, Phoebe, Drake,
Tate & Liza, and the Engineer, Tamer, Channeler, Bug Maniac, Kindler and Hex
Maniac classes.

## Limits (one table — `battle.js` exports these, check.mjs holds the relations)

| Constant | Value | |
|---|---|---|
| `TEAM_MAX` | 6 | a gym trainer; a leader takes up to its party size |
| `LEGEND_BST` | 360 | a legendary enters at or under cap × 360 / its base stat total |
| `SHARE` | solved (0.077) | the candy share every cap is built on; `gymtune.js` carries it |
| `target()` | 0.85 → 0.60 | a region's first to last leader; a League member 0.50, its Champion 0.40 |
| `GYM_BAND` | 0.15 | check.mjs's tolerance around each target |
| `TRAINER_FLOOR` | 0.85 | a gym trainer, against the reference player for its gym |
| `GYM_PRIZE` | solved | encounters' net income a first leader win pays; set so every first win in the game stays under `PRIZE_CEIL` |
| `PRIZE_CEIL` | 0.10 | all first wins, of a whole Lv 75 game's income |
| `REMATCH_SHARE` | 0.25 | a rematch at a full clock pays this share of the first prize |
| `REMATCH_STEPS` | derived | the per-leader clock, solved so rematching everything as fast as possible stays under `REMATCH_CEIL` |
| `REMATCH_CEIL` | 0.20 | of catch-plus-wage income per step |
| `REMATCH_CAP_STEP` | 6 | each rematch win raises that leader's cap, to 100 |
| `LEGEND_WINS` | 3 | the most leaders any one Pokémon may beat alone, per region (a check bound) |

## Economy

Every rule is a relationship check.mjs asserts, against the live figures the
Master Ball is priced against: **¥405,985 played + ¥120,000 walked in a
50,000-step playthrough**, catch income **¥8.12 a step** plus the wage
**¥2.40**.

- **Two constants are derived, because the League is large.** With one gym
  per map there were eleven first wins, and 20 encounters of income each came
  to **¥31,168, 5.9% of a playthrough**. Nine regions hold about 70 leaders, 45
  Elite Four and Champions, and a couple of hundred gym trainers. So
  `GYM_PRIZE` is solved from `PRIZE_CEIL` over a whole Lv 75 game, and the
  rematch clock from `REMATCH_CEIL`. The bounds are the design; the two numbers
  are arithmetic, re-solved whenever the League or the shop changes.
- **A prize is income on the maps, not a price list**: `GYM_PRIZE` encounters
  of Poké Ball income (sale plus bounty minus the ball) on the richest map open
  at the leader's intended level, so prizes re-price when the shop does. A gym
  trainer pays a fifth of its leader, once.
- **Rematches decay toward zero if farmed**: a rematch pays
  `REMATCH_SHARE` of the first prize × `min(1, steps since that win /
  REMATCH_STEPS)`. The world clock runs on steps, so it is walked, never waited
  out. Each rematch win raises that leader's cap by `REMATCH_CAP_STEP` and keeps
  its solved ratio. *(phase 4)* Every capped opponent has a rematch clock -
  leaders, Elite Four and Champions - because that is what the clock was
  solved against (`prices()` sums every capped prize); a gym trainer pays once
  and never again. Rematches keep the first-battle roster (your call); the
  party evolves as its level climbs.
- **The Master Ball floor still holds** with battle income added to its
  lifetime: measured on the first draft, **7.8%** against the 5% floor, and
  check.mjs re-runs it with every battle stream counted.
- **Candy demand.** A team costs at most 30% of the candy earned by its
  intended level (by definition; measured 23-29%). All six to Lv 100 is about
  **510 candy, 2.6% of a Lv 75 game's candy**, so **`CANDY`, `SELL` and
  `CANDY_PRICE` stay as they are.** Guard: a full team to 100 stays under 5%
  of `candyBy(MAX_LEVEL)`.
- **Healing items heal a fraction of max HP, never a flat amount.** Measured,
  a flat 20 HP Potion *lowered* a late gym's win rate from 60% to 28%: it heals
  a sliver and costs the turn.

  | Item | Does | Price | From |
  |---|---|---|---|
  | Potion | heals 50% of max HP | ~~¥60~~ **¥8** *(phase 5)* | Lv 6 |
  | Full Heal | cures a status | ~~¥80~~ **¥10** *(phase 5)* | Lv 6 |
  | Revive | a fainted Pokémon back at 50% | ~~¥300~~ **¥40** *(phase 5)* | Lv 15 |

  In battle only, on a new **Battle shelf**; the CPU uses none in v1. Measured,
  five healers meant **3.3 used a battle, 8 points more wins**. Guard: a
  rematch at a full clock nets positive after what the reference player spends.

  *(phase 5)* **The guard re-priced the shelf.** Measured on every capped
  opponent with the reference player carrying 3 Potions, a Full Heal and a
  Revive (`KIT` in league-sim, using them as a sensible player would): **+8.1
  points of wins at 3.1 items a battle**, the prototype's figure again - but
  a full-clock rematch pays about **¥205** (a quarter of a prize that
  saturates near ¥820), and at the first prices the kit cost about ¥400 a
  battle, so the guard failed at **112 of 115** opponents. "Nets positive" is
  read as EXPECTED: win rate × rematch pay over the spend, since a lost
  battle spends its healers too. That allows at most 0.14 of the first prices
  (Lance binds: 34% with the kit, 4.1 items); the shelf keeps their 3:4:15
  ratio a little under it, **¥8 / ¥10 / ¥40**, and check.mjs replays the
  guard on a fixed record (`KIT_RECORD`) at every opponent - tightest 1.05×.
  A Poké Ball is ¥25, so a Potion is now cheap; that is the price of a
  rematch that is small money by design (`REMATCH_CEIL`).
- **An item is spent when it is used**, as a berry is, from the bag, by the
  engine (`battleStep`): a battle lost or left afterwards does not give it
  back, and a turn using one the bag does not hold is refused whole. Using
  one costs the turn, like a switch; one that would do nothing (`canUse`) is
  refused before any turn passes.
- **No held items in v1. Trainer XP 0. Wild encounters throw-only** (above).

## Twists *(rev 3)*

| Twist | Verdict | Why |
|---|---|---|
| **Friend ghost battles** | **Kept** (Phase 6) | A friend's card already carries showcase snapshots (uid, species, level, tier, alpha, size), everything a fighter needs, so there is **no server work**. AI 2, capped at the showcase's highest level. **Nothing is saved, paid or credited.** |
| Bond at last | **Cut** (your call) | Parked in *Deferred*; measured, it would save at most 720 candy, 3.8% of the dex bill. |
| Daily Rival | **Cut** (your call) | Parked in *Deferred*. |
| Variant entrances | **Cut** (your call) | Parked in *Deferred*. |
| Research is power | **Cut** | Measured, **+1 crit stage wins a mirror 57.7%**: research would become an invisible battle stat. |
| Badges as field perks | **Cut** | Every field lever is priced against income by its own guard; eighty badges would re-price all of them. |

## Data model

### Generated files (never hand-edited)

| File | Made by | Holds |
|---|---|---|
| `src/data/leagues.js` | `tools/fetch-leagues.mjs` (`npm run leagues`), Bulbapedia | per region, in order: gyms (leader, type, badge, party `[dex id, level]`, trainers), the League run read off the venue page (five members, or Galar's seven-match Champion Cup), and each opponent's source game and page. **Ids once shipped never change or get reused** (saves key on them); a re-fetch that would drop a shipped id fails. |
| `src/data/moves.js`, `learnsets.js`, `types.js` | `tools/fetch-moves.mjs` (`npm run moves`), PokéAPI | moves with a `fallback` flag; per dex id `[level, move]` rows from the newest version group; the 18×18 chart |
| `src/data/gymtune.js` | `tools/tune-gyms.mjs` (`npm run gyms`) | each opponent's solved ace level, cap and prize, and *(phase 4)* its `region`, `kind` and place `k` - the order the engine enforces without the rosters. Its own file: a generated file with two writers is a trap. |
| `public/trainers/<pic>.png` | `tools/build_battle_art.py` (`npm run battleart`, Python for the scaling), Showdown | portraits, one file per Showdown sprite (`pic` in leagues.js), shared by every opponent wearing it |
| `public/badges/<gym id>.png` | the same script, Bulbagarden Archives | badges and Z-Crystals, 32×32 |
| `public/sprites/back/<id>.png`, `back/shiny/` | the same script, PokéAPI's sprite repository (where the fronts come from) | back sprites; a species with none draws its front flipped. Showdown's `ani-back` strips come with the fight's art in phase 3. |

**Backs follow the front's rules**: a tier drawn as a filter uses the base back
under the same filter; a tier with its own art uses its own back if one was
fetched, else **its front, flipped**. `backUrl(id, variant)` beside `spriteUrl`
is the one thing that derives a back path.

### The save (each field a `savedField` line in tools/play)

| Field | Shape | Notes |
|---|---|---|
| `beaten` | `{[opponent id]: {wins, at}}` | `at` is `state.steps` at the last win (the rematch clock). **Badges, the next open leader and a region's cleared state are all derived from it**, never stored twice. Unknown ids are kept; a bad row is dropped alone (`cleanBeaten`). A win REPLACES the object, so a memo over it sees the change. |
| `team` | up to 6 box uids | the last team, which the picker starts from; a uid no longer in the box is dropped |
| bag | `potion`, `full-heal`, `revive` | the bag's existing handling |

`state.battle` joins `VOLATILE`.

*(phase 4)* **The engine is the judge of a League battle.** `battleBegin(battle,
{ id, uids })` refuses one that is not open (`isOpen`: the order above) or a
team with a Pokémon it would refuse (`refusal` at `capOf(id)`), and
`battleEnd()` records the win in `beaten` and pays `payFor(id)` - a first
win's prize, or a rematch's share of it on its clock. All of it is
`src/game/league.js`, a module with no roster or move data in it, so the
engine can import it; `battle.js` re-exports `refusal` and `legendLevel` from
it, one definition. A gym trainer is fought once for money; a rematch of one
pays nothing. A rematch win raises that opponent's cap by `REMATCH_CAP_STEP`
(to 100) and its level in the same ratio, so the fight grows with you.

### The server

`trainer_cards.badges int not null default 0`, computed in `card_stats()` from
`data->'beaten'` and added to the column grant, SQL first as trading was: a new
`SUPABASE.md` section, run once, after `npm run tradedb` passes on the test
project.

## Art

**Fetched** (see *Sources*): portraits (Showdown), badges (Bulbagarden),
Pokémon fronts and backs and item icons (PokéAPI, Showdown). Battle
backgrounds reuse the `.battle` scene's `data-area` art, by the leader's type.
The overworld character sheet from The Spriters Resource is not needed while
nobody stands on a map (*Deferred*).

**Move animations are the games' own, one per move** *(phase 7, 2026-09-29;
it was ONE CSS burst per type, 18, and "no source has these" was wrong)*.
Researched live: **pokeemerald-expansion** (rh-hideout, a pret fork) carries an
animation script for every move through Gen 9 - 937 scripts, 403 sprite
sheets, 57 backgrounds - and 773 of our 775 moves are there by name (Vise Grip
and Power Gem under their script's spelling). **Pokémon Showdown's are
excluded**: its client, effect sprites included, is AGPL-3.0, which would
bind this game to publishing its source (its maintainer relicenses on
request; not asked). pret's art is Nintendo's, the same footing as every map
and tileset here.

A script is a small language (`createsprite`, `delay`, `call`, visual tasks)
whose motion lives in several hundred C callbacks, so it is **compiled, not
run**: `tools/build_anims.py` (`npm run anims`, pinned to one commit) walks
each move's script into a flat timeline at 60 frames a second - every sprite
it spawns (its sheet, palette, frame sequence and scale/rotation tables,
which are data in the C and read exactly), when, from which battler, and a
MOTION; and the tasks as mon shakes, lunges, slides, tints, screen flashes
and background fades. The most-used callbacks are ported one by one to a
motion descriptor (the top 100 are 86% of all sprites spawned); the rest are
classified by the movement helpers their C calls (a straight line, an arc,
a drift, a circle, in place). Output: `src/data/anims.js` (the League chunk
only) and `public/battle/anim/` (sheets cut into frame strips, backgrounds
composed from their tiles). A canvas over the scene plays a timeline;
the mons' own motion stays on their elements.

**Pace**: a timeline plays at the games' speed; one longer than `ANIM_MAX`
(2.6s) plays up to 2.5x faster, then is cut there (Barb Barrage's 21 seconds,
String Shot's 10). **The health bar falls at the IMPACT** (the first hit on
the target: a hit splat, its shake, a bolt, a tint or a wave), not when the
move is announced. A tap, Space or Enter skips to the end, the bar falling
at once. The fight's **Animations** switch (Full / Quick, twice the speed /
Off, per device, `dexora-anim`) starts Off where the device asks for reduced
motion; Off plays the type burst below. Every move either side can use is
fetched as a battle opens, so nothing waits on the network mid-turn (a
ranked foe's hidden moves load when used and draw as they land). **Sound is
deferred** (*Deferred*).

**Layers, as the GBA's**: a move's background and its tint (Thunderbolt's
dark, Earthquake's) over the ground and UNDER the mons - on the GBA a
background blend never touches a Pokémon; sprites on a canvas and a flash
over the mons and under the health boxes. Backgrounds are drawn at the GBA's
scale from their own size (a map is 256 or 512 pixels wide) and wrap. **Surf
is ported, not guessed** (`AnimTask_CreateSurfWave`): each side's own
tilemap, 2px across and 1px up a frame, blended to 13/16 and out, 134
frames.

**What the headless pass found** (2026-09-29, 14 moves each way, 320 and
800px): the bare `canvas` rule in styles.css (the map's green floor and
border) painted the whole scene green - `.ft-anim` resets it; background
tints darkened the health boxes; 512-pixel maps drew at half size; two
invisible sprites that only move the mons (`AnimShakeMonOrBattlePlatforms`,
Rock Slide's shake) drew nothing and moved nothing; Precipice Blades named
its background by number; Struggle had no timeline (it is not in moves.js).
All fixed. A dev server started before `npm run anims` answers the new
sheets with its HTML fallback - restart it.

The type burst stays as the fallback: ONE CSS effect per type, 18, animating
only `transform` and `opacity`. Its particles were to be **made by you**
(GBA-era pixel art, transparent background, 1px dark outline, at most 8
colours, matching `public/events/*.png`):

| Path | Size | Prompt |
|---|---|---|
| `public/icons/battle.png` | 32×32 | Menu tab icon: two crossed Poké Balls with a small spark where they meet, red and white on transparent, bold 1px outline, readable at 16px. |
| `public/battle/fx/<type>.png` × 18 | 32×32 each | One particle a type, centred, to be scaled, spun and faded by CSS: **normal** a white four-point impact star; **fire** a flame lick; **water** a droplet with a highlight; **electric** a zig-zag spark; **grass** a green leaf; **ice** a hexagonal ice shard; **fighting** an orange impact burst; **poison** a purple bubble; **ground** a dirt clod; **flying** a white feather; **psychic** a pink ring; **bug** a green-yellow stinger; **rock** a rock chunk; **ghost** a purple wisp; **dragon** a violet-blue flare; **dark** a black crescent slash; **steel** a silver glint; **fairy** a pink sparkle. |

## Status

| Phase | State |
|---|---|
| 0. Design | **approved** 2026-09-28 (revision 4) |
| 1. Data | **done** - 9 regions and 391 opponents from Bulbapedia (pret agrees on all 25 FireRed and Emerald leaders and League members it has), 1,303 learnsets and 775 moves with the rosters' own (90 keep only their damage, 195 are never chosen), the chart, 162 portraits, 68 badges, back sprites; 66KB gzipped, imported by nothing in the main bundle |
| 2. Rules core | **done** - `battle.js`, `tools/league-sim.mjs`, `tools/tune-gyms.mjs` → `gymtune.js`. 113 of 115 capped opponents solved within 10 points of target and every one within 15 or on a proved cliff (Kanto's Bruno 73%/24% either side of 50%, Johto's Chuck 88%/24% of 71%); 276 gym trainers all over 85% (6 lowered to get there); AI 2 beats AI 1 82%, AI 3 beats AI 2 60%; no Pokémon takes more than 3 of a region's leaders alone; the longest battle 137 turns. 17 opponents, all from Kalos's Viola on, needed training past Lv 100. First wins pay ¥459-835 a leader (`GYM_PRIZE` 7 encounters), ¥137,858 in all - 8.9% of a Lv 75 game - and a rematch clock is 11,250 steps. |
| 3. League page | **done** - `src/ui/league/` (League, Fight, progress), a lazy chunk of 279KB (81KB gzipped, 66 of it the battle data); the menu's Pokémon League, `#/league`, the engine's `pause` and `battleBegin/Step/End`. Checked in headless Chrome at 320, 360, 390 and 414px phones, a sideways phone (844x390), a tablet (768x1024) and desktop (1280), day and night: nothing wider than its screen (measured by layout, not by boxes - a frozen fade-in reads as overflow otherwise). |
| 4. Progress | **done** - `src/game/league.js`: the unlock order, refusal, caps that climb with rematch wins, first-win prizes and the rematch clock, read by the engine (which enforces them) and by the page (which shows them). `beaten` and `team` saved; a win's badge and pay on the result card; the prize or rematch meter on every card; the picker starts from your last team; `engine.world().rematches` feeds a League card on the Events board; a News entry and a Help section. |
| 5. Items | **done** - `HEALS` in items.js (the Shop's Battle shelf, read by `battle.js` for what each does), `{ item, target }` actions in `step`, `canUse`, the fight's Bag (B) with a target picker, and the engine spending each on its turn. Prices re-derived from the rematch guard (*Economy*). |
| 7b. Polish *(2026-09-29)* | **done** - gyms are walked through (*Order in a region*, rev 5: `gymReached`, the trainers in order, a win never taken back; play.mjs holds all three, each shown to fail with the old rule back); a gym card is its PATH (trainers, then the leader, a line that fills as you win) over a STAGE showing the next opponent or the step tapped; every send-out throws a Poké Ball (the throw strip's f00-f03 in flight, f04-f10 bursting, the Pokémon out of the light); the party under a health bar is Poké Balls; the result is one band (what happened and who stands, the winnings as chips, the next step), stacked on a phone; the Ranked editor's **Suggest a team** (docs/ranked.md). |
| 7. Move animations | **done** - 760 of 775 moves and Struggle have their own animation (572 of the 580 the rules choose); 15 are one special task each (Substitute's doll, Transform, Minimize) and play the type burst. 11,799 events over 765 sprites, 412 sheets and 45 backgrounds: 457 images, 465KB, and `anims.js` 89KB gzipped in its own chunk, loaded by the League's player alone. Checked in headless Chrome with either side attacking at 320 and 800px, and in a real League battle (the bar holds until the bubbles land; Space skips; the switch cycles and is remembered). |
| 6. Backend | **badges done** (with ranked 6a, docs/ranked.md): `trainer_cards.badges`, counted in `card_stats` from the stored save's `beaten`, leaders only (`badge_list()`, held equal to the League's by check.mjs), readable by players and written by nobody, shown on the trainer profile. Friend ghost battles became ranked's practice. |

**What the page settled** *(phase 3)*:

- **The region strip scrolls sideways**, pinned under the title, fading at its
  edges; nine names do not fit a phone. The chosen region is remembered on the
  device and kept in view.
- **A card is the opponent's type**: its accent and portrait ground are the
  type's own `--tc`. Its team is shown with levels on the card, no tap needed,
  and a gym's trainers fold under their leader.
- **Choosing a team** opens on the foe's team and the rules as chips, uses the
  Trade Center's picker (a tile shows the level a tap takes), explains every
  refusal in one sentence, and offers **Suggest a team** (your highest levels,
  counters to their ace favoured). The team and **Battle!** sit in a dock pinned
  to the bottom of the screen, where a thumb is.
- **The fight** is the encounter's own sky and floor, by the opponent's type.
  A portrait screen gives the scene the height it has (a 16:10 strip left a
  quarter of a phone empty); a sideways phone puts the controls beside it.
  Your Pokémon is its back sprite. Each move button wears its type and PP and
  says **SUPER / WEAK / NO EFFECT** against the Pokémon in front of it - the
  games teach that by losing, and a collector's game should not.
- **A turn plays as beats**: the line, the attacker's lunge, a burst of the
  move's type colour on the target, the hit, and the health bar falling to what
  that event left. A Pokémon falls on its own "fainted!" line. Tap, Space or
  Enter hurries a beat; 1-4 pick a move, S the team, Escape asks to forfeit.
- **The 18 type effects are CSS** - one mechanism, the type's colour and a
  spark shape each - so they need no art. The particle images listed under
  *Art* would replace the sparks if made.

**What phase 4 settled**:

- **The engine judges; the page proposes.** `battleBegin(battle, { id, uids })`
  refuses a shut opponent (`shut`), a team that is not the Box's own Pokémon
  at their own levels, repeated, or bigger than the opponent fields (`team`),
  and anything `refusal` refuses at `capOf(id)` (`locked`, `level`,
  `legend`). The page offers only what the same functions allow, so a
  refusal on screen means the Box changed under the picker (a trade landing).
- **What a win pays is one function**, `payFor(id, beaten, steps)`: the page
  prints it on the card and the engine pays it in `battleEnd`, the only place
  money comes from a battle. A loss, a forfeit and a battle cut short by a
  reload pay and record nothing.
- **`gymtune.js` joins the main bundle** (5.8 KB gzipped, bounded at 8 KB by
  check.mjs) and carries each opponent's place, so the engine never needs
  the rosters; check.mjs holds that copy of the order to the rosters, entry
  for entry.
- **Rematches are open to every capped opponent**, as the clock was priced
  (see *Economy*).

Phase 4's checks: tools/play drives the order (a leader, the Elite Four, a
member, a region with one gym trainer or its Champion unbeaten), every
refusal reason, a first win's exact prize and badge, a rematch at once (¥0),
at half a clock (pro rata) and past a full one, a gym trainer paying once,
a battle leaving the Box, XP and candy untouched, a reload mid-battle, and
`savedField` for `beaten` and `team` plus row-by-row cleaning. Nineteen
mutations of `league.js` and the engine, each caught by its own assertion.

Phase 3's checks: tools/play drives a battle through the real engine (turns
move `rev` only, the result is one `changed()`, a save written mid-battle does
not carry it, a paused game walks nowhere and its encounter clock stands
still), and check.mjs refuses a static import of the League's folder. Each was
shown to fail with its bug put back.

Phase 2 changed the design seven times, each recorded in its row: the ladder
(spread over a playthrough, opening when a counter can be caught), League
members as separate battles, opponents' own game movesets, evolution by any
priced row, training past Lv 100, the legendary rule scaled by strength
(`LEGEND_BST` 360), and a move rule that always keeps one move that hits.
**AI 3 earned its place** (60% over AI 2) once it switched only when it would
lose the exchange outright. check.mjs replays every solved battle exactly, so
any change to the rules or rosters says to run `npm run gyms` (about 18
minutes; `-- --trainers` for the gym trainers alone). The suite takes about
two minutes: it plays ~50,000 battles.

Phase 1 corrected the design twice, both found by its checks: **a leader's
type comes from its own party**, because a gym's infobox is written for one
version (Stow-on-Side's says Ghost, Shield's Allister, where Sword fields
Bea); and **a Pokémon's moves are read across its line**, or Bugsy's Metapod
and Cynthia's Roserade had nothing that hits.

## Phases — each ends with `npm run check` and `npx vite build` passing, and every new assertion shown to fail when its bug is put back

| Phase | Ships | Exit criteria |
|---|---|---|
| **1. Data** | `fetch-leagues.mjs` (all nine regions), `fetch-moves.mjs`, `fetch-art.mjs` (portraits, badges, backs), the generated files, README *Credits* | check.mjs: every roster species is a dex id; each region has its game's gyms in order (8, or Alola's 4 Kahunas), 4 Elite Four and a Champion, and every opponent records the version it came from (the first-named where they differ); ids unique, and no shipped id missing; every leader's type is the type most of its party shares; every learnset move exists; every species has a learnset and a damaging move by Lv 100; the chart's types equal `species.js`'s; every portrait and badge file exists at the size CSS asks for (PNG header). The fetch fails if FireRed's or Emerald's rosters disagree with pret. Fallback counts printed. |
| **2. Rules core** | `battle.js`, `tune-gyms.mjs` → `gymtune.js`, the simulations, the derived caps, prizes and clock | check.mjs: `step` pure and seeded; every leader within `GYM_BAND` of target; every gym trainer at or above `TRAINER_FLOOR`; AI 2 beats AI 1 ≥ 65% and AI 3 beats AI 2 ≥ 55% **or AI 3 is deleted**; no Pokémon beats more than `LEGEND_WINS` leaders of a region alone; a battle always ends; the prize and rematch bounds; the Master Ball floor with battle income. **This file's measured numbers are replaced.** |
| **3. League page** | `.bt-page` (`#/battle`, lazy chunk, modal lock, `useDismiss`, one Back), region tabs with locks, gym cards (trainers, then the leader) with Battle and Team, team select with refusal reasons, the fight (HUD, turn log, 18 effects), keyboard, the touch layout on `(hover: none) and (pointer: coarse)`, night tokens, the short-screen shape | tools/play drives a battle through the engine: `stepped()` per turn, one `colRev` bump for the result; `engine.js` imports neither `battle.js` nor the rosters or move data (asserted); the page at phone and desktop, day and night, sideways at 360px tall. |
| **4. Progress** | badges, the unlock rules, first-win prizes, leader rematch clocks and caps, Elite Four runs, the saved fields, `engine.world()` entries (leaders ready for a rematch), a News entry, Help | tools/play: a leader refuses until the previous one is beaten; the Elite Four refuses until the region's badges are all won; a region refuses until the previous one is cleared, Champion included, and opens on that win; a first win pays once; a rematch pays pro rata; a battle leaves every level and `state.xp` unchanged; a reload mid-battle forfeits with nothing spent; a locked and an over-cap Pokémon are refused by the engine. Each saved field has its `savedField` line. |
| **5. Items** | Potion, Full Heal, Revive, the Battle shelf, the bag in battle | the rematch-net-positive guard; healing is a fraction at every level. |
| **7. Move animations** | `tools/build_anims.py` → `src/data/anims.js` + `public/battle/anim/`, the timeline player (`src/ui/league/moveAnim.js`), the impact-timed health bar, the Animations switch | check.mjs: every move the rules can choose has a timeline; every sheet and background exists at the size the data says (PNG header), and nothing else is in the folder; every sprite's frames are on its sheet; every event and impact inside its timeline; fewer than 3% of moves fall back; `anims.js` loaded by `moveAnim.js` alone, with `import()`. A headless pass over a spread of moves (projectile, beam, contact, rain, self-buff, background) at phone and desktop. |
| **6. Backend** | `badges` on the trainer card, friend ghost battles. *(2026-09-28)* **Superseded by [docs/ranked.md](ranked.md)**: ranked battles played live against a CPU ghost of another trainer's defense team, refereed by the server, and a global list; ghost battles become friend practice | `npm run tradedb`: the card's `badges` equals the badges in the stored save and a client cannot write it; a ghost battle saves nothing (tools/play). |

## Deferred on purpose — each with the trigger that brings it back

- **Bond at last, the Daily Rival, variant entrances.** Cut for now at your
  call; designed and costed in revision 2 of this file (git history).
  Trigger: the League shipped and players asking for more to do in it.
- **Rematch rosters** (Emerald's `Roxanne2`-`5`, the post-game teams of later
  games). Trigger: rematches feeling repetitive. Bulbapedia's `[[Rematch]]`
  sections hold them in the same shape.
- **Trainers on the map.** Trigger: the League page feeling detached from the
  world. The Spriters Resource's overworld sheet and a search-placed layout
  are the starting point.
- **Inverse battles.** Trigger: players out of challenges. One flag on the
  chart, and a second solve per leader.
- **TMs and move choice.** Trigger: a leader the reference player cannot bring
  within its band with any team of the open maps.
- **EVs and natures.** Trigger: players asking to *train*, with a design where
  that is not a second grind.
- **Held items; confusion, trapping, weather, hazards, abilities.** Trigger:
  AI 3 being cut, or the fallback list making a well-known Pokémon play wrong.
- **PvP.** Trigger: server-side battle resolution, the leaderboard's trigger.
- **Move sounds.** The scripts name every sound effect (`playsewithpan
  SE_M_FLAMETHROWER`) and pret has them, but the game has no audio at all.
  Trigger: sound arriving anywhere in the game (a mute switch first).

## How this was measured (and what the prototype left out)

A prototype, never committed, of the Gen 3 stat formula, the modern damage
formula (1.5× crit, STAB, the 18-type chart, burn halving physical), the
effect subset, PP and Struggle, and the three AIs, on real data: pret parties
(FireRed and Emerald), PokéAPI learnsets and moves, and `src/game`'s own
encounter tables, wild bands, `candyValue`, `catchChance`, `catchBounty`,
`sellValue` and `stepWage`. The reference box is up to 250 catches from the
maps open at the intended level, raised lowest-first with the ladder's `share` of the
candy earned. "Candy earned" assumes about 9.2 XP an encounter and every catch
converted, so it is a ceiling. The solver bisects an ace level at 200 battles
and verifies at 400 on fresh seeds.

Left out, and re-measured in Phase 2: abilities, held items, weather, the CPU
using items, double battles, the generated rosters (the prototype had only
pret's), gym trainers, Elite Four runs, and a real player's judgement beyond
"pick the strongest counters". Noise at 400 battles is about ±2.5 points; the
±15 band is for the evolution cliffs.

## Performance *(rev 4)*

**The League must cost the walk nothing.** Every item below is a rule with a
check, because "it felt fine" is how the variant-catch lag shipped.

| Cost | Where it could hurt | What keeps it off the walk | Held by |
|---|---|---|---|
| **Download** | the first load of every player, battler or not | `battle.js`, `leagues.js`, `moves.js`, `learnsets.js` and `types.js` live **only in the League's lazy chunk**, fetched the first time the page opens. *(phase 4)* `gymtune.js` - the ladder's numbers only: each opponent's region, role, order, cap, level and prize, about 5KB gzipped - is the exception and ships in the main bundle with `src/game/league.js`, the rules that read it, because the ENGINE enforces the unlock order, refuses a Pokémon over the cap and pays the prize; a page telling the engine what it earned is the page deciding. Measured estimate: learnsets **~90 KB raw / ~31 KB gzip** for all 1,303 species (11.9 rows a species, packed as `level × 1000 + move index` integers, not objects); with moves and rosters the chunk is **~60 KB gzip**. The main bundle does not grow by a byte of battle data. | check.mjs: no module reachable from `main.jsx` except through the lazy import imports any of them (the `net/cloud.js` pattern); a size budget on the built chunk printed by the build. |
| **The walk loop** | `frame()` at 60fps | While the page is open the engine **draws nothing and steps nothing**: the map is not redrawn under a page it cannot be seen through (the `BATTLE_FADE` precedent). No battle code runs in `frame()`; `state.battle` is read once a frame as a flag. | tools/play: `frame()` with the page open does no map draw (a counter, the way throws cap `colRev`). |
| **A turn** | the League page | A battle is **computed once at its start** (stats, moves, the solved levels) into plain arrays; a turn is a few multiplications and one small object copy (`step` is pure but shallow: only the two fighters that changed are new). AI 3 is 4 × 4 expected-damage calls. Animation is CSS on `transform` and `opacity` only, and the fight's components are memoised on primitive props (the Dex `Cell` pattern), so a turn re-renders the HUD and log, not the page. | check.mjs times 1,000 whole battles in Node and prints it (the prototype's slowness was its network cache, not the rules); tools/play caps a battle at one `colRev` bump. |
| **The collection** | the Dex, Box and rail | Each turn calls `stepped()`; **only the result calls `changed()`**, once. | tools/play, as above. |
| **The page itself** | opening the League, switching tabs | A region's cards (at most about 45) render when its tab is first visited and stay mounted after (the rail's `display: contents` pattern); portraits are 80 px PNGs with `loading="lazy"` and badges 32 px, so a tab costs a few dozen small images once. Locked regions render a single card. No windowing is needed at this count. | audited at phone size with the pointer emulated. |
| **The save** | the 400 ms local write | Two new fields only. `beaten` holds `id: {wins, at}` rows, *(phase 4, measured)* **17.8 KB and 0.13 ms to stringify with all 391 opponents beaten** (the ids are long; 6 KB was the estimate for pairs); `team` is six numbers. Badges, unlocks and cleared regions are derived, never stored. | `savedField` lines; the stringify cost is printed by tools/play for a save with everything beaten. |
| **The network** | the walk cycle | **None.** No request during a battle or on the page; the card's `badges` column is computed by the existing save trigger. | — |
| **Simulations** | `npm run check` | The gym solve runs only in `npm run gyms` (dev time, output committed). check.mjs re-simulates at 200 battles a leader, which the ±15 band tolerates, and prints the suite's time. | printed each run |
