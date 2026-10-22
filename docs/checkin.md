# Daily check-in and the weekly roulette

Asked for 2026-10-07: a reason to come back every day. It is separate from the
daily **quest** (`daily.js`), which asks for play. The check-in asks only that
you came back.

## Check-in (`src/game/checkin.js`, `engine.checkIn`)

- **The first visit of a day opens it by itself,** once a session. It never
  opens over an encounter or before the trainer is chosen. If dismissed, it
  waits as a **Check in** pill on the map.
- **The day is `dayKey`,** the device's calendar date, as the quest's is.
  Nothing here is ranked (no trust boundary).
- **The streak:** checking in the day after the last stamp keeps it. Any gap
  starts it again at 1, and `best` is kept.
- **The reward** is the week's ladder, `CHECKIN_REWARDS`, repeating every 7
  days:

  | Day | Reward |
  |---|---|
  | 1 | ¥1,000 |
  | 2 | 5 Great Balls |
  | 3 | 3 Rare Candy |
  | 4 | ¥2,500 |
  | 5 | 3 Ultra Balls |
  | 6 | 1 Honey |
  | 7 | ¥5,000 and a roulette spin |

- **The press pays and SAVES first;** the stamp and the celebration play after.
- **The streak pays card packs** (asked for, 2026-10-22; `STREAK_PACKS`):
  10 on day 10, 20 on 20, 30 on 30, 50 on 50, 70 on 70 and 100 on day 100,
  then `STREAK_MONTHLY` (100) every `STREAK_MONTH` (30) days after - 130, 160,
  and so on. They come in lots of `LOT` (10), and each lot is ONE set:
  `lotSets` draws it from the sets open at your level, weighted 0.25 plus the
  share of the set you still lack, so a long streak fills the collection
  rather than stacking one set's spares, and a finished set can still land.
  Decided, earned (`checkin:<day>`) and SAVED in `checkIn`; `StreakPacks.jsx`
  (lazy) only shows the lots on the reel, quicker spins, Skip lands them all.
  280 packs by day 100 (about ¥1.1M at `PACK_PRICE`), then ~3 a day: a
  one-off pool for coming back, never income - cards are a collection.
- **Milestone days** (`isMilestone`: day 7 and every pack day) take the whole
  screen: a turning burst, confetti and the number.
- **The streak is always on screen**: a flame chip in the top bar
  (`streakNow`: the stamped streak, or yesterday's until today ends, 0 once a
  day was missed), dotted while today is unstamped; it opens the check-in,
  which draws the road to the next pack day as one bar.
- **Saved as `checkin`:** `{ last, streak, best, spins }`, checked field by
  field on load.

## The roulette (`engine.spinRoulette`, `Roulette.jsx`, lazy)

- **CS2's case opening:** a horizontal strip under a marker. It races, slows
  and settles slightly off-centre on the prize. A tap, Enter or Space lands it
  at once, and reduced motion lands it straight away.
- **The motion is `Reel.jsx`, and there is one of it.** A finished generation's
  booster box (`DexClaim.jsx`) rolls on the same strip; the caller owns the
  cells and draws them, so the two can never drift apart. That reward was a
  logo flicking in place until 2026-10-08, which read as a loading spinner.
- **The prize is decided and SAVED before the strip moves.** The strip is
  dressed around it; the filler cells are drawn from the same odds.
- **Fifteen equal slots** (`ROULETTE`):
  - Thirteen are card packs: `ROULETTE_PACKS` (3) packs of a set, every set
    equally likely, earned and stamped `roulette:<streak>`.
  - Two are a Gold Pokémon: any species up to #1025 that is not legendary, at
    `ROULETTE_LEVEL`. It counts as CAUGHT, registering both the species and its
    Gold mark (your call, 2026-10-07: as a gift it left the Gold mark empty,
    which read as a bug).
  - So 2 spins in 15 land a Gold Pokémon (it was 5 in 15).
- **Spins are banked** (`spins`), so a week can be spun later. The map shows
  a **Spin** pill while one is waiting.
- **Tips and banners wait** while the check-in or the roulette is open: a
  pack's first-time tip once named the prize mid-spin.
