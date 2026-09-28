# Ranked ghost battles — design (rev 3, decisions taken 2026-09-28)

Phase 6 was "badges on the trainer card, and friend ghost battles: nothing
saved, paid or credited". This replaces the second half with **ranked ghost
battles**: each trainer registers 2-3 defense teams, a challenger meets one
of them blind and plays it live against the CPU, the server referees every
turn, and both trainers carry a rating with a named rank and a place on a
global list.

Nothing here is built yet. Numbers marked *provisional* are re-measured in
the build, the way docs/battles.md's were.

## Decisions (rev 2, your calls)

| | Decided | Consequence, measured |
|---|---|---|
| Battles | **The challenger plays live against a CPU ghost**: the defender is not there, their team is played by AI 3, and the challenger picks every move as in the League. *(rev 3: rev 2 read "auto battle" as AI against AI; you meant live against the CPU.)* **Real-time person against person is parked** (*Deferred*). | The server steps every turn: about 20 calls a battle (measured, a mean of 17 turns). |
| Format | **Flat Lv 100, no bans** (species clause kept, see *Format*) | Measured, AI 3 against AI 3 at Lv 100: the six biggest stat totals (Eternamax, Mega Mewtwo X, Mega Rayquaza, Primal Kyogre and Groudon, Ultra Necrozma) beat random teams **100%**; the six best non-legendaries (all Megas) **99%**; the first beats the second **99%** - but two legendaries and four Megas beat the six legendaries **49%**. So the ladder rewards owning strong Pokémon (legendaries caught, Megas raised to Lv 100) and, among strong teams, guessing the match-up. It measures the collection, which is this game's progress. |
| Rank names | **Beginner, Poké Ball, Great Ball, Ultra Ball, Master Ball** | |
| Global top list | **Yes**, from season 1 | The one place a forged save would want to be - see *Moderation*. |
| Rewards | **Cosmetic only** | |
| Season | **One month** | |

## The trust constraint, answered

CLAUDE.md says there is no leaderboard because the browser decides
everything. Two things change for ranked, and only for ranked:

1. **The server decides who won.** It picks the defense team, keeps the
   seed, steps every turn with `battle.js` and writes both ratings. The
   client sends only its choice each turn, never a result - and never sees
   the seed, so it cannot try its moves against the dice before choosing.
2. **A team is species, nothing else.** Level (100), IVs (fixed) and moves
   (the level-up rule at 100) come from the format, so a hand-edited save
   cannot make a stronger Pokémon - only claim one it never caught.

**What stays forgeable** is owning a species you never caught, and at flat
Lv 100 with no bans that is worth more than anything. So the list has
moderation (below) and the Help page says so plainly.

## What a player sees

1. **Defense teams** - a new **Ranked** tab on the League page. Up to three
   teams of up to six from the Box, with the League's picker; at least **two**
   to enter, so a challenger always has to guess.
2. **Find a battle.** The server picks the opponent (never you - see
   *Abuse*): their name, trainer sprite, rank and record, **never their
   teams**. You pick one of your teams (or build one) and press Battle.
3. **You play it.** The server picks one of their teams at random; their
   Pokémon are revealed as they are sent out. You choose each move or switch
   on the League's fight screen; the CPU (AI 3) answers for the defender.
   Each turn goes to the server and comes back as the turn's log, which the
   screen already plays as beats.
4. **The result**: win or loss, rating change, rank progress, their whole
   team. The defender sees it in a **defense log**.

## Format

| Rule | Decided | Why |
|---|---|---|
| Size | Singles, up to 6 a side | The League's format and screen. |
| Level | **100, for everyone** | Your call. |
| IVs | Fixed and equal for everyone | A uid decides IVs today, and a save can choose its uids. |
| Moves | The level-up rule at Lv 100 (`movesAt`) | Deterministic; nothing to forge. |
| Species clause | One of each species; a form counts as its species | Not a ban - it stops six Eternamax. Without it, forging one species would be forging a whole team. |
| Items | None | The bag is client-written. |
| AI | 3 for the defender | The strongest the game has, and the same for every defender. |
| Tiers, size, alpha | Look only | Your Shiny Rayquaza is seen by everyone who meets it. |
| Turn cap | *provisional* 150; past it, the side with the larger share of HP left wins | battle.js counts 500 turns as a loss for the player, wrong when both sides are players. 400 Lv 50 mirrors ran 54 turns at most. |
| Legendary forms | Read `legendary` off the species data | `isLegendary()` misses 17 forms (Mega Mewtwo, the Primals, Eternamax...). Nothing here bans them, but the list's "legendaries used" stat and the League both need the right answer - see the end. |

## The server

- **One Edge Function, `ranked-step`**, bundling `battle.js` and its data -
  already browser-free and pure (asserted). `start` validates the
  challenger's team against their STORED save, picks the defender and team,
  draws a seed and stores the battle; each later call takes the challenger's
  choice, draws that turn's rolls from `hash(seed, turn)`, steps, stores the
  state and returns the turn's log; the last one writes both ratings in the
  same transaction.
- **The seed is never sent**, not even after the battle, and the column is
  not granted to clients. *Rejected:* letting the client play from a seed and
  having the server verify its moves afterwards (two calls a battle) - a
  client holding the seed can try every move against the coming rolls before
  choosing, which is exactly what a global list rewards.
- **Reload resumes.** A League battle is a free forfeit on reload; a ranked
  battle lives on the server, so closing the tab and coming back continues
  it. **Timers** (*provisional*): 60 s a turn, then the AI plays your move;
  10 minutes with no request and the battle is lost. Only the challenger has
  timers - the CPU answers at once.
- **Cost:** about 20 calls a battle (a start and ~17 turns). The free tier's
  500,000 a month is ~25,000 battles; the daily cap bounds a single player.
  A turn is ~1 ms of `battle.js`; the rest is the round trip, which the
  fight screen's beats (about a second each) cover.
- **Versioning:** a `RULES_VERSION` in `ranked.js`; the function refuses an
  older client, which reloads.
- **Offline / local mode:** the tab hides itself without an account. A paused
  free project stops ranked, never the game.

## Ratings

- **Elo** from 1000 on a 400-point scale. *K* 40 for the first 5 battles
  (shown as **Beginner**), then 20. **The defender moves at half K** - they
  were not there to choose.
- **Monthly seasons.** At the end ratings move halfway back to 1000, and
  your **season badge** (the highest rank reached) stays on your card.
- **Rank floors:** reaching a Ball tier in a season keeps you in it until the
  season ends; divisions can drop.

| Rank | Rating (*provisional*) | Divisions |
|---|---|---|
| **Beginner** | the 5 placement battles | - |
| **Poké Ball** | below 1100 | III, II, I |
| **Great Ball** | 1100 - 1249 | III, II, I |
| **Ultra Ball** | 1250 - 1399 | III, II, I |
| **Master Ball** | 1400 + | the rating, shown ("Master Ball · 1,532") |

Bands are fixed for season 1 and re-cut from its distribution (aim: Master
Ball the top ~5%).

## Matchmaking

- From trainers with **two or more valid defense teams**, active in the last
  14 days, within ±100 rating widening by 50 until someone is found; never
  yourself, never across a block, never the same defender twice in 24 hours.
- **League ghosts** - each region's Elite Four and Champion in the ranked
  format with their game teams - stand at fixed anchor ratings, so the ladder
  is never empty and ratings cannot drift while few play. They are not on
  the list.
- **Daily cap** (*provisional*) 20 ranked battles.

## The global list

- **Top 100 of the current season**: rank, name, trainer sprite, rating,
  record, and the Pokémon of their most-used defense team (revealed only
  once it has defended 10 times, so the list is not a scouting sheet).
- **Past seasons**: the top 10, kept.
- Your own place shown even outside the top 100. A **friends standings**
  view beside it.

## Moderation (because a forged box tops a flat Lv 100 list)

- Reports gain **"impossible team"** (`REPORT_REASONS` is append-only).
- A server-side **void**: an admin function (service role only, never
  granted to clients) that removes a trainer from the season's list and
  matchmaking and resets their rating, keeping their battles for the record.
  Their opponents' rating changes stand - undoing them would punish people
  who did nothing.
- **Plausibility shown, not enforced**: each list entry shows the trainer's
  level, dex count and days played (already on the card), so an account at
  Lv 12 with six Lv 100 Mega legendaries reads as what it is.

## Rewards

Cosmetic only: the rank emblem on your trainer card, the season badge, a
card border for Master Ball, and the list. No money, candy, items or EXP -
every income stream is held under a ceiling by a guard, and ranked pay would
be farmable with a second account.

## Abuse, and what stops it

| Abuse | Stopped by |
|---|---|
| Forging a win | The server plays and scores the battle; clients cannot write ratings, battles or the list. |
| Forging a stronger Pokémon | Level, IVs and moves come from the format. |
| Forging species | **Not stopped**: reports, the void, plausibility on the list. |
| Rage-quitting a loss | The battle is on the server: leaving is a loss after 10 minutes. |
| Reading the dice | The seed never leaves the server; each turn's rolls are drawn there. |
| Farming an alt | You cannot choose the opponent; a win far below your rating is worth ~0; one battle per defender per day; the daily cap. |
| Scouting a defender | One team a battle, picked at random, once a day; the list hides a team until it has defended 10 times; teams change any time. |
| A team that no longer exists | Checked against the stored save at battle time (flush first, as trading does); a defense team with a member gone is skipped, and fewer than two valid takes you out of matchmaking until fixed. |

## How it changes the rest of the game

- **Legendaries and Megas become the chase.** A legendary is met about once a
  playthrough and a Mega needs a Lv 100 evolution, so the ladder pulls
  players toward legendary hunting and toward candy (a Mega is 100 levels of
  it). The League stays the level-by-level candy sink.
- **Trading gets demand** for strong species. A defense-team member warns on
  sell, trade and evolve (evolving changes its species); it is not locked.
- **The League is unchanged**; Ranked is a tab on its page, in its lazy chunk.
- **The save gains no fields.** Teams, ratings, battles and the list are
  server rows.
- **The walk loop pays nothing**; the network is used on the Ranked tab only.
- **One rulebook, `src/game/ranked.js`** (browser-free): the format, legality,
  Elo, rank bands and `RULES_VERSION`, imported by the page and bundled into
  the function.
- **CLAUDE.md's constraint gets new wording**: "nothing the browser decides
  is ranked; ranked battles are resolved on the server".
- **Friend practice** (Phase 6's ghost battles): challenge a friend's defense
  teams, blind, in the browser, nothing saved or rated.
- **Trainer card badges** (the rest of Phase 6) ship first, unchanged.

## Data model (server; SQL first, as trading was)

| Table / function | Holds |
|---|---|
| `defense_teams` | `(owner, slot 1-3, uids int[])`, written only by `set_defense_team(slot, uids)`, validated against the stored save. |
| `ratings` | `(user_id, season, rating, games, wins, placement, floor_tier, peak_tier, voided)`, written only by the function. |
| `ranked_battles` | `(id, season, challenger, defender, defense_slot, teams, seed, state jsonb, turn, status, deadline, result, deltas, rules_version, at)`; `seed` is never granted to clients. |
| `defense_log`, `ranked_list(season)`, `my_ranked()` | the defender's inbox, the top list, your own standing - read through functions, as cards are. |
| Edge Function `ranked-step` | `start(uids)` and `turn(battle, action)`: the one writer of battles and ratings. |
| `void_trainer(user, season)` | moderation, service role only. |

Tested by `npm run tradedb` against the TEST project (refusing the live
one), which applies `db/ranked.sql` after `db/trading.sql` as the live project
does.

## Art - made by you (GBA-era pixel art, transparent background, 1px dark outline, at most 8 colours, matching `public/events/*.png`)

| Path | Size | Prompt |
|---|---|---|
| `public/ranks/beginner.png` | 48×48 | Rank emblem, the first of a matching set of five: a plain round bronze-brown medal with a single small white star in the centre and a short ribbon tail below. Simple and humble. Readable at 24px. |
| `public/ranks/poke.png` | 48×48 | Rank emblem, second of the set: a shield-shaped badge, red top half and white bottom half split by a black band, a small Poké Ball button at its centre, one green laurel sprig under it. Readable at 24px. |
| `public/ranks/great.png` | 48×48 | Rank emblem, third of the set: the same shield silhouette in Great Ball colours - blue body with two red stripes on the top half - a white button at the centre, two laurel sprigs. Readable at 24px. |
| `public/ranks/ultra.png` | 48×48 | Rank emblem, fourth of the set: the same shield in Ultra Ball colours - black top with a yellow H-shaped band - a white button at the centre, two gold laurel sprigs. Readable at 24px. |
| `public/ranks/master.png` | 48×48 | Rank emblem, the highest of the set: the same shield in Master Ball colours - purple with two pink bosses and a white "M" - a white button at the centre, gold laurels and a small crown on top, a two-pixel sparkle at one corner. Readable at 24px. |
| `public/icons/ranked.png` | 32×32 | Tab icon: two crossed swords over a small shield, silver and red on transparent, bold 1px outline, readable at 16px. |

Divisions (III, II, I), the season number and the Master Ball rating are CSS
on the emblem - no art.

## Status

| Phase | State |
|---|---|
| **6a. Cards and teams** | **done** 2026-09-28 - see below |
| 6b. The server referees | **done** 2026-09-29 - see below |
| 6c. The ladder | not started |

**What 6a shipped:**

- **Badges on the trainer card**, counted by the server's `card_stats` from
  the stored save's `beaten` - League leaders only (`badge_list()`, the 68
  ids in the League's order), with a whole-number `wins` (a JSON number, as
  the game's `cleanBeaten` keeps one: a string `"3"` counted until the local
  Postgres run caught it). Backfilled once for existing cards.
- **`src/game/ranked.js`**: the format (`RANKED_LEVEL` 100, `RANKED_IV` 31),
  `baseOf` and `teamProblem` (the species clause counts a form as its
  species), `DEFENSE_SLOTS`, `DEFENSE_MIN`, `RULES_VERSION`, and `CHAR_PIC`.
  `rankedFighter` in battle.js builds a fighter from a species alone.
- **`db/ranked.sql`**: `defense_teams` (read-own, write-none),
  `set_defense_team` (every uid in the STORED save, distinct, six at most,
  slots 1-3; REFUSED, not trimmed, when a uid is not there yet),
  `my_defense` (each member as the stored save has it now, a gone one as
  gone), `practice_team` (a friend's team, picked on the server at random,
  its gone members left out). The species clause is the rules' (the
  database cannot see the dex's forms); 6b's function re-checks it.
- **The Ranked tab**, first in the League's strip: three team slots edited
  with the League's picker (one of each species, through `kin`), and
  **practice** against a friend's teams - blind, ranked's format, the CPU at
  AI 3, no Bag, nothing handed to the engine. "Another team" draws again.
- **The friend's trainer** is drawn from Showdown's FireRed/LeafGreen art
  (`red-gen3`, `leaf-gen3`), fetched by `npm run battleart`.
- **Found and fixed on the way**: the League's legendary rule missed the 17
  forms of legendaries (`legendary()` in league.js now reads the data); a
  remembered League team, and a defense team being edited, lost any member
  registered for trading (the Picker keys those by server id, not uid).

**Tested:** check.mjs (the format, the clause, the legendary forms, the
server's copies of the badges and limits, the portraits); the SQL run for
real twice - on a local Postgres with Supabase's roles, RLS and grants
(PGlite, outside the repo), and by `npm run tradedb` on the TEST project -
and every guard shown to fail with its bug put back (13 mutations).

**6b's decisions** *(2026-09-29, taken before building; the design left them
open)*:

- **Whom you meet before there are ratings:** the server picks a random
  eligible trainer - two or more legal defense teams, played in the last 14
  days, never yourself, never across a block, never the same one twice in 24
  hours. 6c narrows it to the rating window and adds the League anchors.
  **6b's battles are recorded but unrated**; the result screen says so.
- **Your side is one of your own defense teams** (legal, with a member still
  in your Box). Building a team on the spot waits for 6c.
- **Three pieces, one rulebook.** `src/game/referee.js` (pure: the battle a
  pair of teams makes, one refereed turn, the view a challenger may see);
  `supabase/functions/ranked-step/handler.js` (the requests, portable, run in
  Node by the tests); `index.ts` (the Deno shell: CORS, who is asking). The
  function imports `rules.js`, **generated** from referee.js by `npm run edge`
  (esbuild; check.mjs re-bundles and compares), because a deployed function
  cannot reach `src/`.
- **SQL does the storing, JS does the rules.** `db/ranked.sql` gains
  `ranked_battles` and five functions only the service role may call
  (`ranked_candidates`, `ranked_create`, `ranked_load`, `ranked_save`,
  `ranked_expire`). A save is compare-and-set on the step counter, so two tabs
  sending one turn make one turn.
- **Who is asking** is Supabase Auth's answer to the request's token
  (`auth.getUser`), so the function is deployed with `verify_jwt = false` and
  works whichever JWT keys the project signs with.
- **The seed never leaves the server, and neither does the state.** Each
  step's rolls come from `hash(seed:n)`; the battle row holds the full state,
  the foe's whole team included, and no client may read the table. The
  challenger receives a VIEW: their own side, and of the foe only what has
  been sent out.
- **Timers are lazy.** Each decision has 60 s; a request after that plays AI
  2's choice instead (the game says so). A battle with no request for 10
  minutes is lost, marked when its challenger next asks and whenever anybody
  starts a battle - no scheduled job.
- **One battle at a time**: asking to start with one open resumes it.
- **Deploying** needs the Supabase CLI (SUPABASE.md §3f). The shell was run
  here under Deno against the TEST project; nothing is deployed from here.

**What 6b shipped:**

- **`src/game/referee.js`**: `openBattle`, `refereeTurn` (a legal action or
  the stand-in's when late; rolls from `hash(seed:n)`; the turn cap decided
  on health), `viewOf` (the challenger's side, and of the defender only what
  was sent out), `legal`, `autoAction`. Bundled into the function as
  `rules.js` by `npm run edge`.
- **The `ranked-step` Edge Function**: `handler.js` (resume, start, turn,
  forfeit; answers a code for every refusal) and `index.ts` (CORS, who is
  asking). **`db/ranked.sql`**: `ranked_battles` (no client may read or write
  it) and `ranked_expire`, `ranked_team`, `ranked_candidates`,
  `ranked_create`, `ranked_load`, `ranked_save` (compare-and-set), for the
  service role only.
- **The page**: the Ranked tab finds or resumes a battle; the fight screen
  plays a turn from the server's log and view as it plays a local one, shows
  the decision's clock, says when the AI played a late turn, and resyncs when
  another tab took the turn. Unrated: the result says so.

**Tested:** check.mjs (a refereed battle is battle.js stepped from
`hash(seed:n)`; the view never names an unseen defender; illegal actions;
the stand-in; the turn cap; `rules.js` is today's referee; the function
imports nothing past it; its gates); the SQL and the handler on a local
Postgres with Supabase's roles and RLS, on the TEST project by `npm run
tradedb`, and **the Deno shell itself** run locally under Deno against the
TEST project and called over HTTP with real tokens (CORS, missing and forged
tokens, broken bodies, a whole battle). 16 guards shown to fail with their
bug put back. **Not done here:** deploying - SUPABASE.md §3f.

**Deferred from 6a to 6c:** a warning when you sell, trade or evolve a
defense-team member. A team whose member is gone already says so on the tab,
and nothing costs anything until the ladder exists.

## Phases (each ends as every phase does: check, build, mutations, a CLAUDE.md rule)

| Phase | Ships | Exit criteria |
|---|---|---|
| **6a. Cards and teams** | `badges` on the trainer card; `src/game/ranked.js` (format, legality, species clause, fixed IVs, Lv 100); the Ranked tab's defense teams; `defense_teams` + `set_defense_team`; friend practice (blind, in the browser, nothing saved) | check.mjs: a ranked fighter depends on species alone (the same for any uid, level or IVs in the save); the species clause reads forms through to their species. `tradedb`: a team naming a uid not in the stored save is refused; nobody writes another's teams; the card's `badges` equals the stored save's and a client cannot write it. |
| **6b. The server referees** | the Edge Function, `ranked_battles`, per-turn stepping with a hidden seed, the fight screen driven by server turns, resume, timers, `RULES_VERSION` | a battle stepped by the function equals one stepped in Node with the same seed and choices; clients can read neither the seed nor another's battle, and write no battle row; reload resumes; a timeout plays the AI's move; abandoning loses; an old client is refused. |
| **6c. The ladder** | `ratings`, Elo, placement, floors, seasons and the reset, matchmaking with League anchors, the daily cap, the top list and past seasons, friends standings, the defense log, card emblems, the void, News and Help | ratings change only through the function; a battle moves the two ratings by the stated amounts; the 24-hour rule, the cap and blocks hold; a voided trainer leaves the list and matchmaking and their opponents keep their points. |

## Deferred on purpose - each with its trigger

- **Real-time battles, person against person** (both trainers present,
  choosing at once). Needs presence, simultaneous turns and a disconnect
  rule, on the per-turn server this design already builds. Trigger: players
  asking to battle each other directly.
- **A balanced format** (level by strength, rev 1: at PIVOT 500 the biggest
  stat totals win 27% instead of 100%). Trigger: the top of the list being
  the same six Pokémon for a whole season.

## Found while measuring (a bug in shipped code)

`isLegendary(id)` is false for 17 forms of legendaries - Mega Mewtwo X and Y,
Primal Kyogre and Groudon, Mega Rayquaza, Eternamax and 11 more - though
their data says `legendary: true`. All are Lv 100 evolutions, so in the League
they reach only the Lv 100 caps, but there `refusal` lets a Lv 100 Eternamax
(BST 1,125) in at the full cap where the legendary rule would hold it to
Lv 32. Fix: the League's legendary test reads the species' own `legendary`
field. Not fixed yet.
