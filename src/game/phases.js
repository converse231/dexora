/* The encounter phase machine, kept pure so it can be driven by a fake clock
   in tools/check.mjs. A bug here means an encounter hangs forever with the
   buttons disabled, which is exactly the kind of thing a test should catch. */

const PHASES = ["idle", "throw", "suck", "drop", "wait", "shake", "caught", "broke", "fled", "ran"];
export const TERMINAL = ["caught", "fled", "ran"];

/* What should happen to this encounter at time `now`? Returns null while the
   current phase is still running, otherwise one of:
     { phase, until, ... }  advance to a new phase
     { settle: true }       time to apply the pending result
     { close: true }        encounter is over, clear it */
/* Casting a line, kept pure for the same reason as the encounter above: it is
   a timed sequence that can strand the player if a case is missed, and a fake
   clock in the tests is the cheapest way to know it cannot.

     cast -> wait -> roll   the line goes out, the float sits, then chance
     bite -> hook           something took it; hand over to an encounter
     miss -> close          nothing did. The rod is the whole reason a miss is
                            worth showing rather than skipping: a cast that
                            always succeeded would just be a slower button. */
export const CAST_PHASES = ["cast", "wait", "bite", "miss"];

export function nextCast(f, now, F) {
  if (!f.until || now < f.until) return null;
  switch (f.phase) {
    case "cast":
      return { phase: "wait", until: now + F.wait };
    case "wait":
      // The engine owns the dice; this stays pure.
      return { roll: true };
    case "bite":
      return { hook: true };
    default:
      return { close: true };
  }
}

export function nextStep(enc, now, T) {
  if (!enc.until || now < enc.until) return null;

  switch (enc.phase) {
    case "throw":
      return { phase: "suck", until: now + T.suck };

    case "suck":
      // The ball always falls and settles before any shaking — that beat of
      // stillness is most of where the suspense lives.
      return { phase: "drop", until: now + T.drop };

    case "drop":
      // FireRed waits 31 frames after the ball lands before the first shake.
      // That half second of nothing happening is the whole hook.
      return { phase: "wait", until: now + T.wait };

    case "wait":
      return enc.shakesTotal === 0
        ? { settle: true }
        : { phase: "shake", shakesDone: 1, until: now + T.shake };

    case "shake":
      return enc.shakesDone >= enc.shakesTotal
        ? { settle: true }
        : { phase: "shake", shakesDone: enc.shakesDone + 1, until: now + T.shake };

    case "broke":
      // Back to idle so the player can throw again at the same Pokémon.
      return { phase: "idle", until: 0, pending: null };

    case "caught":
    case "fled":
    case "ran":
      return { close: true };

    default:
      return null;
  }
}

// Which terminal phase a resolved throw lands in.
export function settlePhase(pending) {
  if (pending.caught) return "caught";
  if (pending.fled) return "fled";
  return "broke";
}
