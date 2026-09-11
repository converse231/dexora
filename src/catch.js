/* Pure catch math. No DOM, no React — tools/check.mjs imports this directly. */

/* Every ball caps at 95% - a throw can always miss - except the Master Ball,
   which is defined by never failing. That is the whole reason it is a reward
   rather than something you can buy. */
export const GUARANTEED = 255;

export function catchChance(rate, ballMult) {
  if (ballMult >= GUARANTEED) return 1;
  return Math.min(0.95, Math.max(0.03, (rate / 255) * ballMult));
}

// Rarer species flee more. The line that makes rarity feel like rarity.
export function fleeChance(rate) {
  return 0.2 + (1 - rate / 255) * 0.4;
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
   never a second chance to change it. */
export function resolveThrow(rate, ballMult, rng = Math.random) {
  const need = catchChance(rate, ballMult);
  const roll = rng();
  if (roll < need) return { caught: true, shakes: 3, fled: false };
  return {
    caught: false,
    shakes: shakesFor(roll, need),
    fled: rng() < fleeChance(rate),
  };
}
