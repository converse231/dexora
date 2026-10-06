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
- **Milestone days** (`STREAK_MILESTONES`: 7, 14, 30, 50, 100, 180 and 365)
  take the whole screen: a turning burst, confetti and the number.
- **Saved as `checkin`:** `{ last, streak, best, spins }`, checked field by
  field on load.

## The roulette (`engine.spinRoulette`, `Roulette.jsx`, lazy)

- **CS2's case opening:** a horizontal strip under a marker. It races, slows
  and settles slightly off-centre on the prize. A tap or Enter lands it at once,
  and reduced motion lands it straight away.
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
