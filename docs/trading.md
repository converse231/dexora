# Trading — the design, decided

The single reference for every trading phase. README's old "Trading" section is
the reasoning that led here; this is what was decided (2026-09-26) and how it is
built. Change a decision here first, then the code.

## Decisions

| | Decided | Why |
|---|---|---|
| Trust | **Contained, friends first.** Server-owned trades (duplication impossible), daily caps, server validation. Direct offers and profiles are open to all; **Surprise Trade and the Trade Board run between friends** (added by friend code). | Forgery can only be *stopped* by server-side catching, a rewrite. It can be *contained*: a forged mon only spreads through people who chose each other, a few a day, and every move is logged. |
| What moves | **Pokémon for Pokémon only.** No candy, money, balls or items; no buying or selling. | Items and money are fungible - a currency between untrusted clients is the duplication problem again, and every price in check.mjs stops meaning anything. A swap creates nothing. |
| Credit | **A traded Pokémon fills the Pokédex and nothing else.** It is caught-in-the-dex, but not a medal, a milestone reward, a tier mark / the completion rosette, the dex bonus, or a catch-type research task. | Dex completion becomes social (the historically correct kind); the marks that measure *your own* play stay yours. |
| Tradeable | **Anything but the last one you hold of a species**, and never while locked (listed, offered, pooled) or mid-evolution. Variants and alphas included; a legendary asks first. | The old "spares only" guard reused `duplicateUids`, which never counts a variant as spare - it would make every shiny untradeable. |
| First release | Direct offers + trainer profiles, Surprise Trade, Trade Board. | Trade evolutions are parked (cheap to add later: one flag on `EVOLUTIONS`). |
| Accounts | Trading needs an account. Guests and local mode see a "sign in to trade" screen. | There is no server identity to own a row without one. |
| Safety (13+) | No free text anywhere: preset messages and emotes only. Block and report. | Moderation-free by construction. |

## Limits (one table - `trade.js` exports these, the SQL mirrors them, check.mjs holds them equal)

| Constant | Value | |
|---|---|---|
| `TRADES_PER_DAY` | 10 | completed trades of any kind, per trainer, on the `daily.js` day |
| `SURPRISE_PER_DAY` | 5 | deposits |
| `OPEN_OFFERS` | 10 | pending offers you have sent |
| `OPEN_LISTINGS` | 5 | board listings |
| `LISTING_DAYS` | 7 | a listing (or a surprise deposit) expires and its mon comes home |
| `MAX_SIDE` | 3 | Pokémon per side of one offer |
| `SHOWCASE` | 6 | profile showcase slots |
| `SEEKING` | 12 | "looking for" species on a profile |
| `FRIENDS` | 100 | friends and pending requests per trainer |

## Data model (Supabase)

The save stays one JSONB document. What changes is that **a Pokémon that has
entered trading has a row the server owns**, and only server functions move it.

| Table | Holds | Who writes |
|---|---|---|
| `trainer_cards` | public card: username, char, level, dex count, variant count, stars, trades, `showcase` (≤6 snapshots), `seeking` (≤12 species), `friend_code` | stats by trigger from `saves` (like the summary columns); showcase/seeking via `update_card()` |
| `friends` | (a, b, status) | `add_friend(code)`, `answer_friend()`, `remove_friend()` |
| `mons` | server id, owner, species, level, tier, alpha, size, caught_at, `ot`/`ot_name`, `local_uid`, `status` (held/offered/listed/pooled/arriving), `traded` count | **RPC only** - no insert/update policy |
| `trades` | kind (direct/surprise/board), a, b, what each gives (mon ids), status, preset message, times | RPC only |
| `listings` | owner, mon, wants (species and/or tier), expires | RPC only |
| `surprise_pool` | mon, owner, deposited_at | RPC only |
| `deliveries` | a mon that arrived for a user, until the client claims it | RPC only |
| `trade_log` | append-only record of every move | RPC only |
| `blocks`, `reports` | | own rows |

Every function is `security definer`, `set search_path = ''`, takes no user id
(it reads `auth.uid()`), and does its whole job in **one transaction with the
rows locked** (`for update`) - the `save_game` pattern, because read-then-write
from a browser races with itself and a trade that is two statements is a trade
that duplicates under a double-click.

### The functions

- `register_mons(snapshots)` - gives box entries a server id when they first
  enter trading. Checks each against the caller's **stored** save (the uid is
  there, the fields match), validates shape (species in range, level 1-100,
  tier in `TIERS`, alpha only where `canBeAlpha`), applies the daily cap.
- `propose_trade(to, give[], get[], msg)` / `answer_trade(id, yes)` /
  `cancel_trade(id)` - direct offers. Proposing locks your side; accepting
  re-verifies both sides, swaps owners, writes both deliveries and the log.
- `surprise_deposit(mon)` - matches immediately against a **friend's** waiting
  deposit, or waits (≤7 days, then comes home).
- `post_listing(mon, wants)` / `fulfil_listing(listing, mon)` /
  `withdraw_listing(id)` - the board, friends-only.
- `trade_inbox()` - one round trip with exactly what `reconcileTrades` takes:
  what arrived, what is locked, what is gone, the open offers. It also
  expires the caller's stale offers on the way (a lazy sweep: no cron).
- `update_card(showcase, seeking)`, `add_friend(code)`, `answer_friend(id, yes)`,
  `block(user)`, `report(user, reason)`.

### The save, reconciled on the server

A `before insert or update` trigger on `saves` (so it covers `save_game` and any
direct upsert, and `save_game` itself is untouched):

- **a box entry whose `mid` another trainer owns is stripped** - a device
  holding an old save, an imported file or a restored backup cannot bring a
  traded-away Pokémon back, the one path by which duplication could re-enter;
- **an entry whose `mid` is unknown is kept** - never strip what we cannot
  prove is gone;
- **delivery completes by saving**: an `arriving` row becomes `held` when a
  save containing it is written. There is no "claim" step to lose - a client
  that crashes mid-merge is simply offered the same Pokémon again, and the
  merge is idempotent by `mid`;
- owned rows learn their uid, level and species from the box; a `held` row
  missing from the box is `released` (sold, converted, starred) and **revives**
  if it reappears (a restore);
- **it can never fail an upload**: any error inside lets the save through
  untouched. The collection outranks the trade.

## Scale, speed and the data players already have

- **Existing saves are untouched.** Every new field is optional; a Pokémon only
  gets a server row when its owner first offers it. `loadState` cleans the new
  fields one at a time and never drops an entry for them. No migration runs.
- **The walk cycle never waits on the network.** Trading is async; the engine's
  new checks are one property read on a box entry.
- **The save trigger costs nothing for most saves**: a trainer who has never
  traded exits on the first indexed lookup. For traders it is set-based SQL over
  the box (hundreds of entries), with the rebuild only when something is
  actually stripped.
- **Every hot query is indexed**: `mons (owner, status)`, `mons (owner,
  local_uid)`, `trades (a, status)`, `trades (b, status)`, `trade_log (from/to, at)`.
- **One round trip per poll** (`trade_inbox`), skipped while the tab is hidden.
- **The Trade Center loads on demand** (a dynamic import), so the game's first
  load does not grow for players who never open it.
- **Deadlock-free**: the swap locks rows in id order, so two accepts that share
  a Pokémon queue instead of deadlocking.

## The client

- `src/game/trade.js` (browser-free): the limits, `tradeable(box, uid)`,
  snapshot shape, the preset messages. check.mjs drives it.
- **Box entries** gain `mid` (server id), `ot` (original trainer), `traded`
  (count) and `lock` (why it cannot move). `loadState` validates each; one bad
  field is dropped, never the entry. Each is a `savedField` line in tools/play.
- **Locks are enforced in the engine** - `sell`, `convert`, `evolve`, `star`,
  `levelUp` refuse a locked entry, and the sweep's spare list skips it.
- **`state.gifted`** - dex ids registered only by a trade. Medals, milestones,
  the rosette, tier rows (`repairDex` skips traded entries) and the dex bonus
  read it; catching one yourself removes it.
- **Research** gains an appended *bonus* task, "Get one in a trade".
- **`net/cloud.js` stays the only file that imports Supabase** - every trade
  call lives there, answering `{ok, ...}` like `pull`.
- **Polling, not a socket, to start**: deliveries and offers are checked at
  login, on the mirror's 15s cadence while the Trade Center is open, and every
  60s otherwise. Realtime is a later optimisation, not a dependency.

## Screens

- **Trade Center** - full screen, the Events pattern. Tabs: **Board** ·
  **Offers** (inbox, sent, history) · **Surprise** · **Friends & my card**.
  Opened from a new top-bar button with a badge.
- **Trainer profile** - trainer art, level, dex ring, stars, variant and trade
  counts, a 6-slot showcase with each tier's effect, "Up for trade", "Looking
  for", friend button, propose trade, block/report. Shareable link
  (`#/trainer/<name>`).
- **Offer composer** - "You give / You get", up to three each, preset message,
  a confirm that names both sides.
- **The trade scene** - two Poké Balls ride a glowing link cable into a centre
  ring, swap in a burst, and the arriving Pokémon is revealed with its tier's
  reveal. Plays for the second party the next time they open the game.
- Entry points: Box row "Trade", Dex sheet "Find trades", a board listing's
  trainer name.

## Status

| Phase | State |
|---|---|
| 0. Foundation | **done** - client and `db/trading.sql` pass on the test project |
| 1. Profiles | **done** - cards, showcase, wishes, friends, search, profile page, links |
| 2-5 | not started |

**Not on the live project yet.** Until `db/trading.sql` is run there, the Trade
Center answers "Trading isn't open yet" (a missing function is its own answer,
never an error). Before running it, run SUPABASE.md §3c too: the base summary
trigger fails a save whose `dex` is not a list or whose `xp` is not a number,
and §3c is the fix (found while testing phase 1).

## Phases - each ends in QA and your review

| Phase | Ships | QA |
|---|---|---|
| **0. Foundation** | `db/trading.sql` (tables, RLS, register, offers, swap, inbox, the save trigger), `trade.js`, box fields, locks, `gifted`, the credit rules | pure rules in check.mjs; engine in play.mjs; **`npm run tradedb`: every function against the test project with two test trainers**, including racing two accepts of one offer |
| **1. Profiles** | trainer cards, showcase, friend codes, profile page, trainer search | card RLS (a stranger reads the card, never the save); UI at phone and desktop, day and night |
| **2. Surprise Trade** | deposit, match, deliveries, the trade scene | a mon cannot be in the pool and sold; expiry returns it |
| **3. Direct offers** | composer, inbox, accept/decline/cancel, history | both sides locked; a stale device cannot resurrect a traded mon |
| **4. Trade Board** | listings, wants, fulfil, search by species | fulfilment races |
| **5. Polish** | badges, block/report, Help, What's new, the full sweep | everything end to end, performance |

## The test project

Nothing in phase 0 touches the live database. A second Supabase project holds
the tests; its keys live in `.env.test` (gitignored):

```
TEST_SUPABASE_URL=...
TEST_SUPABASE_ANON_KEY=...
TEST_SUPABASE_SERVICE_KEY=...   # tests only: creates the two test trainers
TEST_DATABASE_URL=...           # applies the SQL
```

They may live in `.env` beside the live keys (it is gitignored, and only
`VITE_` names reach the bundle) or in `.env.test`. `tools/tradedb.mjs`
**refuses to run** if either test URL points at the live project.

The live project gets the SQL only after a phase passes on the test one, as a
new numbered section of SUPABASE.md, run once - the §3c pattern.
