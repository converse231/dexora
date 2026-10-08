/* WHAT A RARE FORM AND AN ALPHA DO IN A LEAGUE BATTLE (your call, 2026-10-02;
   docs/battles.md, *Perks*). Each perk is the form's own look made into a
   small edge, with NO COST - a form is still a kind, and a plain Pokemon still
   fights exactly as it did. A form's perk and an alpha's stack.

   League battles only. Ranked's format is species and nothing else
   (`rankedFighter` never reads this), and opponents have none, so every
   solved level and every replayed battle is unchanged: the reference team
   the ladder is tuned against is plain.

   Light on purpose: the Box and the Rare forms guide read the words from
   here, so this must not import the League's data (`battle.js` imports it).

   `st` multiplies stats [HP, Atk, Def, SpA, SpD, Spe]; `crit` adds crit
   stages; `shrug` is the chance a new status fails; `roll` widens the damage
   roll upward (0.15 is the games' 85-100%); `evade` is evasion stages at the
   start; `resist` is what a resisted hit's x0.5 becomes; `super` multiplies a
   super-effective hit. */
export const PERKS = {
  gold:       { says: "Defense +15%", st: [1, 1, 1.15, 1, 1, 1] },
  /* The treasure set, each one the material made into an edge. Platinum is
     DelugeRPG's Metallic without its immunity: an absolute is a different
     game, a coin flip is a look that happens to help. */
  diamond:    { says: "Defense and Sp. Def +10%", st: [1, 1, 1.1, 1, 1.1, 1] },
  platinum:   { says: "Half of all status moves fail", shrug: 0.5 },
  emerald:    { says: "Attack +15%", st: [1, 1.15, 1, 1, 1, 1] },
  showdown:   { says: "Speed +10%", st: [1, 1, 1, 1, 1, 1.1] },
  cadence:    { says: "Max HP +6% and Speed +6%", st: [1.06, 1, 1, 1, 1, 1.06] },
  shiny:      { says: "25% chance to shrug off a status", shrug: 0.25 },
  shadow:     { says: "Attack and Sp. Atk +8%", st: [1, 1.08, 1, 1.08, 1, 1] },
  astral:     { says: "Sp. Atk +12%", st: [1, 1, 1, 1.12, 1, 1] },
  chaotic:    { says: "Critical hits more often (+1 stage)", crit: 1 },
  glitched:   { says: "Damage rolls run higher (85-115%)", roll: 0.3 },
  projection: { says: "Starts each battle harder to hit (+1 evasion)", evade: 1 },
  holo:       { says: "Sp. Def +12%", st: [1, 1, 1, 1, 1.12, 1] },
  origin:     { says: "Max HP +10%", st: [1.1, 1, 1, 1, 1, 1] },
  noir:       { says: "Resisted hits land harder (x0.65, not x0.5)", resist: 0.65 },
  vivid:      { says: "Super-effective hits x1.15", super: 1.15 },
};
export const ALPHA_PERK = { says: "Max HP +10% and Attack +5%", st: [1.1, 1.05, 1, 1, 1, 1] };

/* Every perk a box entry carries, form first, then alpha's. */
export const perksOf = (variant, alpha) => [PERKS[variant], alpha ? ALPHA_PERK : null].filter(Boolean);
