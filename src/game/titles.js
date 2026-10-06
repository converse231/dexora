/* TITLES (docs/cards.md, phase 4): earned, never chosen into being. Each is
   an id the server derives the same way from the stored save
   (db/trading.sql, `card_titles`), so a trainer card never shows one a save
   has not earned:

     set:<id>     a card set completed       "Mega Evolution Collector"
     master:<id>  every printing of a set    "Mega Evolution Master Collector"
     dex:<g>      a generation's Pokédex     "Kanto Dex Master"

   Pure and browser-free; the order is the server's (sorted). */
import { CARD_SETS } from "../data/cards/index.js";
import { REGION_NAME } from "./biomes.js";
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
  return out.sort();
}

/* THE DRAWN ONES: public/titles/<kind>-<id>.png (art/titles, npm run ranks).
   Every region's Dex Master so far; a card set's gets a line here once its
   art exists (check.mjs holds each named file to the disk). */
const DRAWN = /^dex:[1-9]$/;
export const titleBadge = (t) => (DRAWN.test(t) ? `titles/${t.replace(":", "-")}.png` : null);

const setName = (id) => CARD_SETS.find((s) => s.id === id)?.name ?? id;
export function titleName(t) {
  const [kind, id] = t.split(":");
  if (kind === "set") return `${setName(id)} Collector`;
  if (kind === "master") return `${setName(id)} Master Collector`;
  if (kind === "dex") return `${REGION_NAME[id] ?? `Gen ${id}`} Dex Master`;
  return t;
}
