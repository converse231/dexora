/* KIT MASTERY (docs/arena-kits.md, built 2026-11-04, asked for: "the rare candy
   is not often used anymore" once the Pokedex is nearly done). A Box entry's
   fixed Arena kit is trained with Rare Candy, a level at a time, each a small
   step on damage and cooldowns: better, never a different game. Only against
   the CPU, the Ladder and the Gym Circuit - online and ranked play the species,
   and the League never reads it.

   One Pokemon to the top costs what raising eleven to Lv 100 does: a late
   game's candy, and bought candy is a money sink besides. The field rides on
   the entry and nowhere else, so a mastered Pokemon is a `keeper()` and never
   enters trading, whose server row would drop it. */
export const MASTERY_MAX = 10;
export const MASTERY_STEP = 0.01;
export const masteryCost = (level) => 20 * (level + 1);
export const masteryK = (level) => (level || 0) * MASTERY_STEP;

// A bad field is dropped alone: never a reason to lose the entry.
export function cleanMastery(m) {
  if (m.mastery === undefined) return m;
  const n = m.mastery;
  if (Number.isInteger(n) && n >= 1 && n <= MASTERY_MAX) return m;
  const { mastery: _, ...rest } = m;
  return rest;
}

// Added to a team's card perks (`teamPerks`), which is what the match reads; `mons` is in the team's order.
export const withMastery = (perks, mons) => perks.map((p, k) => {
  const add = masteryK(mons[k]?.mastery);
  return add ? { ...p, dmg: p.dmg + add, cd: p.cd + add } : p;
});
