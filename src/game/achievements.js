/* ACHIEVEMENTS (asked for, 2026-10-10): the whole game noticed, not only the
   Pokedex. Medals (medals.js) are the dex's - every line, type, map and
   region, paid on the catch; these are everything else: catching, rare forms,
   research, battles, cards, trading and the trainer.

   EVERY ONE IS DERIVED FROM THE SAVE, never counted alongside it. The numbers
   already exist - `caught`, `steps`, the tier rows, `beaten`, the research
   rows, `cards`, `milestones`, `checkin.best` - so an old save opens on the
   page with everything it has already done, and nothing here can drift from
   the thing it counts. Research rows count each task ONCE PER SPECIES (they
   cap), so "kinds caught at night" is a kind count by construction - and
   trades count kinds received, which two accounts cannot farm by passing one
   Pokemon back and forth.

   A LADDER, NOT A LIST: each achievement is a few steps of one number, so
   the page is twenty-odd rows deep rather than a hundred, and the next step
   is always in view. A step is CLAIMED on the page (like a generation's
   medal), never paid on the moment: a step met by an old save pays when its
   trainer looks, not as a wall of banners at boot. `achieved` holds how many
   steps of each are claimed - the only thing stored.

   NO ART: a step is marked done, never drawn (your call, 2026-10-10). Pure
   and browser-free, so check.mjs and tools/play read it in Node. */

import { SPECIES } from "../data/dex.js";
import { CARD_SETS } from "../data/cards/index.js";
import { TIERS, levelFromXp, isLegendary, dexIndex, REGION_NAME } from "./biomes.js";
import { TASKS, researchLevel, RESEARCH_MAX } from "./research.js";
import { REGIONS, leadersOf, leagueOf, badgesOf, hardCleared } from "./league.js";
import { copiesOf, MILESTONES } from "./cards.js";
import { MASTER_STEP } from "./titles.js";

const sum = (row) => (row ?? []).reduce((n, v) => n + (v ? 1 : 0), 0);
// Species whose research row has done this task at least once.
const kinds = (task) => {
  const i = TASKS.findIndex((t) => t.id === task);
  return (s) => Object.values(s.research ?? {}).filter((r) => (r?.[i] ?? 0) > 0).length;
};
// Steps that run up to the game's own size: a smaller game drops the steps it outgrew.
const upTo = (top, ...steps) => [...new Set([...steps.filter((n) => n < top), top])];
const won = (s, id) => Boolean(s.beaten?.[id]);

const BADGES = REGIONS.flatMap(leadersOf).length;
const GENS = Object.keys(REGION_NAME).length;

export const GROUPS = [
  ["catch", "Catching"], ["rare", "Rare forms"], ["research", "Research"],
  ["battle", "Battles"], ["cards", "Cards"], ["trade", "Trading"], ["trainer", "Trainer"],
];

export const ACHIEVEMENTS = [
  // Catching: a playthrough meets ~3,500 encounters, so 2,000 caught is one
  // game well played and 10,000 is somebody who lives here.
  { id: "catches", group: "catch", name: "Catcher", sub: "Every Pokémon you catch counts, duplicates included", steps: [100, 500, 2000, 10000], of: (s) => s.caught ?? 0 },
  { id: "steps", group: "catch", name: "Wanderer", sub: "Every step you take, on any map", steps: [1000, 10000, 50000, 200000], of: (s) => s.steps ?? 0 },
  { id: "legends", group: "catch", name: "Legend hunter", sub: "Legendary species registered in your Pokédex - caught, traded or gifted", steps: [1, 10, 30],
    of: (s) => SPECIES.filter((sp) => isLegendary(sp.id) && s.dex?.[dexIndex(sp.id)] === 2).length },
  { id: "alphas", group: "catch", name: "Alpha hunter", sub: "Different species caught as an alpha, the big ones with the alpha chip", steps: [1, 10, 50], of: kinds("alpha") },
  { id: "night", group: "catch", name: "Night owl", sub: "Different species caught while the clock on the map reads night", steps: [10, 50, 200], of: kinds("night") },
  { id: "sizes", group: "catch", name: "Odd sizes", sub: "Different species caught at an XS or XL size", steps: [10, 50, 200], of: kinds("xs") },
  { id: "first", group: "catch", name: "Sharpshooter", sub: "Different species caught with the very first ball you threw", steps: [10, 50, 200], of: kinds("first") },
  { id: "fed", group: "catch", name: "Berry picker", sub: "Different species you fed a berry to during an encounter", steps: [10, 50, 200], of: kinds("fed") },

  // Rare forms: the tier rows, so a form registered by evolving counts too.
  { id: "rare", group: "rare", name: "Rare finds", sub: `Rare forms registered across all ${TIERS.length} kinds - each species counts once per kind`, steps: [1, 25, 100, 500],
    of: (s) => TIERS.reduce((n, t) => n + sum(s[t]), 0) },
  { id: "kinds", group: "rare", name: "Every kind", sub: `How many of the ${TIERS.length} kinds of rare form you have at least one of`, steps: upTo(TIERS.length, 1, 8),
    of: (s) => TIERS.filter((t) => sum(s[t]) > 0).length },
  { id: "shiny", group: "rare", name: "Shiny hunter", sub: "Different species you have registered as a Shiny", steps: [1, 10, 50], of: (s) => sum(s.shiny) },
  { id: "gold", group: "rare", name: "The chase", sub: "Register a Gold Pokémon, the rarest kind of all", steps: [1], of: (s) => sum(s.gold) },

  { id: "research", group: "research", name: "Professor", sub: "Different species with research at Lv 10 - Events shows what each still needs", steps: [1, 10, 50, 200],
    of: (s) => Object.entries(s.research ?? {}).filter(([id, r]) => researchLevel(Number(id), r) >= RESEARCH_MAX).length },
  { id: "evolve", group: "research", name: "Evolver", sub: "Different species you have evolved, counted by the one you started from", steps: [10, 50, 200], of: kinds("evolve") },

  { id: "badges", group: "battle", name: "Badge collector", sub: `Gym leaders beaten, across every region - ${BADGES} badges in all`, steps: upTo(BADGES, 1, 8, 32), of: (s) => badgesOf(s.beaten) },
  { id: "champion", group: "battle", name: "Champion", sub: "Regions where you beat the Elite Four and the Champion", steps: upTo(REGIONS.length, 1, 3),
    of: (s) => REGIONS.filter((rid) => leagueOf(rid).every((id) => won(s, id))).length },
  { id: "hard", group: "battle", name: "Hard mode", sub: "Regions where you beat every leader, the Elite Four and the Champion on hard mode", steps: upTo(REGIONS.length, 1, 3),
    of: (s) => REGIONS.filter((rid) => hardCleared(rid, s.beaten)).length },

  { id: "cards", group: "cards", name: "Card collector", sub: "Different cards in your binder - any printing, and spares do not count twice", steps: [50, 250, 1000],
    of: (s) => Object.values(s.cards ?? {}).filter((r) => copiesOf(r) > 0).length },
  { id: "sets", group: "cards", name: "Set complete", sub: "Card sets with every card owned, in any printing", steps: upTo(CARD_SETS.length, 1, 3),
    of: (s) => Object.values(s.milestones ?? {}).filter((n) => n >= MILESTONES.length).length },
  { id: "master", group: "cards", name: "Master collector", sub: "Card sets with every printing of every card owned", steps: upTo(CARD_SETS.length, 1, 3),
    of: (s) => Object.values(s.milestones ?? {}).filter((n) => n >= MASTER_STEP).length },

  { id: "trades", group: "trade", name: "Trader", sub: "Different species you received in trades - the same one twice counts once", steps: [1, 10, 50], of: kinds("trade") },

  { id: "level", group: "trainer", name: "Veteran", sub: "Your trainer level - XP comes from almost everything you do", steps: [10, 25, 50, 75, 100], of: (s) => levelFromXp(s.xp ?? 0) },
  { id: "streak", group: "trainer", name: "Regular", sub: "Your longest run of daily check-ins without missing a day", steps: [7, 30, 100], of: (s) => s.checkin?.best ?? 0 },
  { id: "regions", group: "trainer", name: "Dex master", sub: `Regional Pokédexes completed and claimed from the map - ${GENS} regions in all`, steps: upTo(GENS, 1, 3),
    of: (s) => (s.medals ?? []).filter((m) => /^gen:\d+$/.test(m)).length },
];

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id) ?? null;

/* WHAT A STEP PAYS, by its place on the ladder: balls first, as the medals
   do (balls are the bottleneck, money is ground out of spares), and money
   kept small - this is a ONE-OFF POOL, and those are where the late game's
   money comes from (CLAUDE.md, Economy). check.mjs holds the whole ladder's
   money under half of what the Pokedex's medals and milestones pay. The LAST
   step of every ladder adds a card pack: a collection, never a strength. */
export const STEP_PAY = [
  { money: 500, items: { "great-ball": 5 } },
  { money: 1500, items: { "ultra-ball": 5 } },
  { money: 3000, items: { "ultra-ball": 10 } },
  { money: 6000, items: { "ultra-ball": 15 } },
  { money: 10000, items: { "ultra-ball": 20 } },
];
export const payOf = (a, k) => ({ ...STEP_PAY[k], pack: k === a.steps.length - 1 });

/* Where one stands: its number, steps claimed, and steps met but not claimed. */
export function standing(a, s) {
  const value = a.of(s);
  const claimed = Math.min(a.steps.length, s.achieved?.[a.id] ?? 0);
  const met = a.steps.filter((n) => value >= n).length;
  return { value, claimed, due: Math.max(0, met - claimed), done: claimed === a.steps.length };
}

export const dueCount = (s) => ACHIEVEMENTS.reduce((n, a) => n + standing(a, s).due, 0);

/* A saved `achieved`, cleaned entry by entry: a whole number of steps. An id
   this build does not know is KEPT, bounded - a newer build may know it. */
export function cleanAchieved(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v)
    .filter(([k, n]) => /^[a-z]{1,24}$/.test(k) && Number.isInteger(n) && n > 0)
    .map(([k, n]) => [k, Math.min(n, STEP_PAY.length)]));
}
