/* Pure catch math. No DOM, no React — tools/check.mjs imports this directly. */

/* A throw can always miss - except the Master Ball, which is defined by never
   failing. That is the whole reason it is a reward rather than something you
   can buy. */
export const GUARANTEED = 255;

/* HOW OFTEN THE BEST CASE STILL FAILS. One in five, for a Poke Ball thrown at
   something that barely resists.

   This exists because a single flat 95% ceiling made the ball tiers
   meaningless exactly where they are used most. `(rate/255) * mult` reaches
   0.95 at a catch rate of 255/mult, so a Poke Ball was already capped against
   the FIFTEEN commonest species in the dex - every Pidgey, Rattata and
   Caterpie - and a Great Ball bought you nothing at all on them. At rate 190
   even Great and Ultra were identical. Measured across the dex before
   touching anything, which is the only reason it was believable.

   So the ceiling belongs to the ball, not to the game: the chance of missing
   shrinks with the ball you threw. Poke 0.80, Great 0.89, Ultra 0.93, a
   boosted situational 0.94, a Timer Ball at its cap 0.95 - and nothing
   reaches 1, because that is the Master Ball's job alone.

   Below the ceiling NOTHING CHANGES. A rare at rate 45 is 0.18 / 0.32 / 0.53
   exactly as it was, so the economy this whole file defends is untouched; the
   fix lands only on the commons, which is where the complaint was. */
export const NEVER_CERTAIN = 0.2;

/* AND NEVER HOPELESS - but only just. This was 0.03, which flattened the ball
   ladder at the BOTTOM of the range exactly as the flat ceiling flattened it
   at the top: the four rate-3 legendaries sat on the floor with a Poke Ball
   AND a Great Ball, so the two were the same throw at Articuno as they were
   at a Pidgey. At 0.01 the floor binds for no species in the dex - the
   rawest of them, rate 3, computes 1.2% / 2.1% / 3.5% and differentiates on
   its own - while a throw still cannot be worth nothing. */
export const NEVER_HOPELESS = 0.01;

/* WHAT A PLAIN THROW IS WORTH, and it lives here rather than in `items.js`
   because it is one of the three numbers that bound a throw - the ceiling, the
   floor, and the multiplier the four situational balls fall back to. It was in
   `items.js` for as long as only balls asked; `biomes.js` asks now (a species
   sitting ON the floor is banded kinder - see `bandFor`) and cannot import
   `items.js`, which already imports `ENCOUNTER_RATE` from IT. Moving one
   constant to the file that has no imports at all is the honest way out of
   that; re-exporting it from `items.js` keeps every existing caller.

   Never type this value into a `bonus()`: an unboosted Net Ball IS a Poke
   Ball, and typing 1.0 there made it strictly better than the cheap ball at
   six times the price. */
export const PLAIN_MULT = 0.8;

export function catchChance(rate, ballMult) {
  if (ballMult >= GUARANTEED) return 1;
  const ceiling = Math.min(0.95, 1 - NEVER_CERTAIN / ballMult);
  return Math.min(ceiling, Math.max(NEVER_HOPELESS, (rate / 255) * ballMult));
}

/* Rarer species flee more. The line that makes rarity feel like rarity - and
   the SHAPE is the part that matters, so both numbers came down together
   rather than the slope being flattened.

   It was `0.2 + (1 - rate/255) * 0.4`: a common fled one throw in five and a
   legendary nearly three in five. Paired with a Poke Ball that is now 20%
   weaker (see `PLAIN_MULT`) that would have been two nerfs pointing the same
   way. They deliberately point opposite ways instead: an encounter is HARDER
   to finish and LASTS LONGER, so a failed throw is a setback rather than the
   end of it. Losing a rare to a flee on throw two is the version of this game
   nobody wants to play.

   HALVED AGAIN, and in the same direction as before. `0.12 + .3x` still lost a
   legendary two encounters in five, which is the number that hurts: the maps
   are four times the size now, so meeting one is four times the walk, and a
   coin flip at the end of that walk is not a challenge, it is the session. A
   common now waits through twenty throws and a legendary through five.

   THE SLOPE IS THE PART THAT MATTERS and both numbers moved together, so
   rarity still flees more - which is what stops this from being "nothing ever
   runs". If either half is retuned alone, check the pair still points apart
   from `PLAIN_MULT`, and check `fleeChance(3) > fleeChance(255)` still holds.

   `calm` is a Nanab Berry, and it is a MULTIPLIER on the whole line rather
   than a subtraction from it. Subtracting would flatten the slope - the thing
   this function exists to have - and would take the commonest species to a
   flee chance of nearly nothing, which is a berry wasted on a Pidgey. A
   multiplier keeps rarity feeling like rarity and is worth most exactly where
   you would spend a berry: on the legendary that keeps running away. */
export function fleeChance(rate, calm = 1) {
  return (0.05 + (1 - rate / 255) * 0.15) * calm;
}

/* How close was a losing roll? 3 shakes = agonising, 0 = never had a chance.
   This changes nothing about the odds — it only tells the player the truth
   about the roll they just lost, which is what makes a near miss land. */
export function shakesFor(roll, need) {
  const margin = roll / need;
  if (margin < 1.4) return 3;
  if (margin < 2.2) return 2;
  if (margin < 4.0) return 1;
  return 0;
}

/* One roll decides everything. The animation is a readout of that roll,
   never a second chance to change it.

   A Razz Berry arrives folded into `ballMult` at the call site rather than as
   an argument here, and that is deliberate: it multiplies the ball, so it goes
   through `catchChance`'s own ceiling and cannot push any ball to certainty.
   A separate argument would have been a second place for the cap to be
   forgotten. */
export function resolveThrow(rate, ballMult, rng = Math.random, calm = 1) {
  const need = catchChance(rate, ballMult);
  const roll = rng();
  if (roll < need) return { caught: true, shakes: 3, fled: false };
  return {
    caught: false,
    shakes: shakesFor(roll, need),
    fled: rng() < fleeChance(rate, calm),
  };
}
