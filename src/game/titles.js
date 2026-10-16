/* TITLES (docs/cards.md, phase 4): earned, never chosen into being. Each is
   an id the server derives the same way from the stored save
   (db/trading.sql, `card_titles`), so a trainer card never shows one a save
   has not earned:

     set:<id>     a card set completed       "Mega Evolution Collector"
     master:<id>  every printing of a set    "Mega Evolution Master Collector"
     dex:<g>      a generation's Pokédex     "Kanto Dex Master"
     tier:<t>:<g> that Pokédex in one tier   "Kanto Gold Dex Master"

   Pure and browser-free; the order is the server's (sorted). */
import { CARD_SETS } from "../data/cards/index.js";
import { REGION_NAME, TIERS, tierName } from "./biomes.js";
import { MILESTONES } from "./cards.js";

// `milestones` counts MILESTONES paid per set, one past them for a master set.
export const MASTER_STEP = MILESTONES.length + 1;

export function titleIds(milestones = {}, medals = []) {
  const out = [];
  for (const [id, n] of Object.entries(milestones ?? {})) {
    if (n >= MILESTONES.length) out.push(`set:${id}`);
    if (n >= MASTER_STEP) out.push(`master:${id}`);
  }
  for (const m of medals ?? []) if (/^gen:[1-9]$/.test(m)) out.push(`dex:${m.slice(4)}`);
  for (const m of medals ?? []) if (/^tier:[a-z]+:[1-9]$/.test(m) && TIERS.includes(m.split(":")[1])) out.push(m);
  return out.sort();
}

/* THE DRAWN ONES: public/titles/<kind>-<id>.png (art/titles, npm run ranks).
   Every region's Dex Master so far; a card set's gets a line here once its
   art exists (check.mjs holds each named file to the disk). */
const DRAWN = /^dex:[1-9]$/;
/* A TIER'S POKEDEX wears its region's badge with the tier's own mark as a
   tag at its foot (`titleTier`; asked for, 2026-10-15 - no art of its own). */
export const titleTier = (t) => (/^tier:[a-z]+:[1-9]$/.test(t) ? t.split(":")[1] : null);
export const titleBadge = (t) => (DRAWN.test(t) ? `titles/${t.replace(":", "-")}.png`
  : titleTier(t) ? `titles/dex-${t.split(":")[2]}.png` : null);

/* A CARD SET'S TITLE IS ITS LOGO (asked for, 2026-10-15: "Phantasmal Flames
   Master Collector" as a pill was a sentence on a trainer card): the set's
   own logo, which every set ships (public/cards/<id>/logo.webp, npm run
   cards; check.mjs holds each to the disk), the name in its tooltip. */
export const titleLogo = (t) => (/^(set|master):/.test(t) ? `cards/${t.split(":")[1]}/logo.webp` : null);

/* What a trainer card shows: a set's Master Collector says its Collector
   already, so the two are one badge.
   And a region's tier Pokédexes are ONE badge, its rarest (TIERS runs
   rarest first): twenty tiers by nine regions is 180 badges on a card.
   The badge's tooltip names every tier finished (`regionTiers`). */
const tierRank = (t) => TIERS.indexOf(titleTier(t));
export const regionTiers = (titles, gen) => titles.filter((t) => titleTier(t) && t.endsWith(`:${gen}`))
  .sort((a, b) => tierRank(a) - tierRank(b));
export const shownTitles = (titles = []) =>
  titles.filter((t) => !(t.startsWith("set:") && titles.includes(`master:${t.slice(4)}`))
    && !(titleTier(t) && regionTiers(titles, t.split(":")[2])[0] !== t));

const setName = (id) => CARD_SETS.find((s) => s.id === id)?.name ?? id;
export function titleName(t) {
  const [kind, id] = t.split(":");
  if (kind === "set") return `${setName(id)} Collector`;
  if (kind === "master") return `${setName(id)} Master Collector`;
  if (kind === "dex") return `${REGION_NAME[id] ?? `Gen ${id}`} Dex Master`;
  if (titleTier(t)) {
    const g = t.split(":")[2];
    return `${REGION_NAME[g] ?? `Gen ${g}`} ${tierName(id)} Dex Master`;
  }
  return t;
}
