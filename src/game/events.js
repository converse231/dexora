/* WORLD EVENTS - things that change the world for a while, as opposed to field
   items, which the player buys to change it. Pure, like daily.js, and for the
   same reason: check.mjs walks a month of days without waiting for one.

   MASS OUTBREAK. Once a day one map the player has opened is overrun by one
   species that already lives there: `OUTBREAK_SHARE` of the walking encounters
   on that map ARE that species, for `OUTBREAK_SIZE` of them, and each rolls its
   tier at `OUTBREAK_LIFT` times the odds. It is what a rosette wants - four
   variants of ONE species - and it is the thing the generation fit makes
   hardest, because spreading a table over nine generations makes every
   individual species rarer.

   A COUNT, NOT A CLOCK. Fifteen encounters is a session wherever the day
   falls, and it cannot be burned by leaving the game open. Once they are met
   it is over until tomorrow. */
import { SPECIES } from "../data/dex.js";
import { EVENTS } from "../data/eventforms.js";
import { BIOMES, areaOpen, dexIndex, encounterTable, isLegendary, speciesById } from "./biomes.js";
import { dayKey, hash } from "./daily.js";
import { STONES } from "./items.js";

export const OUTBREAK_SHARE = 0.3;
export const OUTBREAK_SIZE = 15;
export const OUTBREAK_LIFT = 4;

const costume = new Set(SPECIES.filter((sp) => sp.form === "costume").map((sp) => sp.id));

/* The species a map can be overrun by: its residents and homes at this level -
   never the evolved overlay (a flock of Charizard is a free evolution line, and
   the overlay is meant to be a late find), never a legendary (a legendary is one
   of a kind), never a costume (an event does not host an event). */
export function outbreakPool(biome, level) {
  return encounterTable(biome, level)
    .filter((r) => !r[2] && r[1] > 0 && !isLegendary(r[0]) && !costume.has(r[0]))
    .map((r) => r[0]);
}

/* Today's outbreak for a trainer at `level`, or null. UNIFORM over open maps
   and over the pool, not weighted: an outbreak of the commonest thing on the
   map is a normal afternoon, and the rare ones are what make it an event.
   Frozen onto the save at first sight by the engine, so levelling mid-day
   (which opens a map) cannot move it under the player. */
export function outbreakFor(key, level) {
  const open = BIOMES.filter((b) => areaOpen(b.id, level));
  if (!open.length) return null;
  const biome = open[hash(key + ":outbreak") % open.length];
  const pool = outbreakPool(biome, level);
  if (!pool.length) return null;
  return { areaId: biome.id, speciesId: pool[hash(key + ":" + biome.id) % pool.length] };
}

/* SPACE-TIME RIFT. Stay on one map long enough and the world tears: for
   `RIFT_STEPS` steps the rarer end of that map's table comes forward, and the
   ground turns things up. Legends: Arceus opens its distortions on a clock
   ("10% at five minutes, certain at forty"); this game's clock is steps, so it
   opens on `sinceTravel` - steps since you last changed map - which is also
   what makes it a reward for staying rather than for hopping.

   A PER-STEP HAZARD, NOT A PER-STEP COIN. A flat chance would open most rifts
   in the first few hundred steps past the gate; a hazard rising from zero at
   `RIFT_FROM` puts the median at `RIFT_MEDIAN` and is forced to certain at
   `RIFT_SURE`, so a long session always sees one and a short one rarely does.
   Solved for, not picked: with hazard k(s - FROM), the chance of still being
   shut is exp(-k(s - FROM)^2 / 2), and that is one half at the median. */
export const RIFT_FROM = 600;
export const RIFT_MEDIAN = 1500;
export const RIFT_SURE = 3000;
export const RIFT_STEPS = 150;
const RIFT_K = (2 * Math.LN2) / (RIFT_MEDIAN - RIFT_FROM) ** 2;
export const riftChance = (since) =>
  (since < RIFT_FROM ? 0 : since >= RIFT_SURE ? 1 : RIFT_K * (since - RIFT_FROM));

/* WHAT A RIFT DOES TO THE TABLE IS A `tilt`, the same number a White Flute
   adds to Fortune's exponent - `rarityPower` is the ONE rarity transform in
   this game, and a second pass would compound with it. Stacked with a flute
   and maxed Fortune it lands on `RARITY_FLOOR`, which is what the floor is
   for. It moves which SPECIES, never which tier, so a honey still stacks. */
export const RIFT_TILT = 0.2;

/* WHAT THE GROUND TURNS UP: a find on one step in `1 / RIFT_FIND`, half a
   stone the shop would already sell you at this level, half Rare Candy. Sized
   against what the steps to earn a rift make (check.mjs holds it there): at
   1 in 60 it measured up to 18% of that, which is the rift paying for itself
   twice over; at 1 in 80 about two finds a rift. */
export const RIFT_FIND = 1 / 80;
export const RIFT_CANDY = 3;
export function riftFind(random, level) {
  if (random() >= RIFT_FIND) return null;
  const shelf = STONES.filter((st) => st.level <= level);
  if (shelf.length && random() < 0.5) {
    return { items: { [shelf[Math.floor(random() * shelf.length)].id]: 1 } };
  }
  return { candy: RIFT_CANDY };
}

// What the "it is over" card calls each event.
export const EVENT_NAME = { outbreak: "Outbreak", rift: "Rift" };

/* A DATED EVENT (eventforms.js): for its week, a species it dressed is
   sometimes met in its costume instead - `EVENT_SHARE` of the meetings with
   that species, wherever and however it is met (grass, water, a rod, an
   outbreak), and never where the species is not. A substitution and not a
   table row, so no spawn table, no League level and no rod moves for it: the
   event is over the day it ends and the world is exactly the world.

   HALF of the species' meetings (2026-10-24, asked for once the event was
   live: "make their odds normal like the non-event Pokemon, just additional
   Pokemon"): a costume is met as often as the species it dresses, as one
   more Pokemon sharing its slot would be. It was 1 in 16 - a witch Gastly one
   Pokemon Tower meeting in 115. Night (`EVENT_NIGHT`) and a Spooky Honey's
   `lure` raise it, never past `EVENT_CAP`, so both still do something. */
export const EVENT_SHARE = 1 / 2;
export const EVENT_NIGHT = 1.5;
export const EVENT_CAP = 0.75;

// The event running on a local day (dayKey), or null.
export const eventOn = (day = dayKey()) =>
  EVENTS.find((ev) => day >= ev.start && day <= ev.end) ?? null;
// The items an event sells (items.js `event`): its celebration's, shared by its weeks.
export const shelfOf = (ev) => ev?.shelf ?? ev?.id ?? null;
/* THE NEXT WEEK, when another event opens within TEASE_DAYS of this one's
   end: the running week's card says what follows (the teaser never runs
   while an event does - `eventSoon`). */
export function eventAfter(ev) {
  const end = eventCloses(ev);
  return EVENTS.find((e) => e !== ev && eventOpens(e) >= end && eventOpens(e) - end < TEASE_DAYS * 86400000) ?? null;
}

// Every event look, by the species it dresses, for the event running.
export const eventLooks = (day) => eventOn(day)?.looks ?? [];

// An event may set its own `share` (The Haunting's is harder); night and a lure still lift it, never past the cap.
export const shareOf = (ev) => ev?.share ?? EVENT_SHARE;
export const eventChance = ({ night = false, lure = 1, share = EVENT_SHARE } = {}) =>
  Math.min(EVENT_CAP, share * (night ? EVENT_NIGHT : 1) * lure);

/* The species met: `sp`, or its costume. Draws from `random` ONLY when the
   running event dressed this species, so every other roll in the game - and
   every seeded record check.mjs replays - is untouched by an event.
   A LOOK `on` ANOTHER SPECIES (eventforms.js) is met in place of it too: a
   line's later stages, costumed, where its base lives - the costume is one of
   them, picked evenly by a second draw only when there is a choice. */
/* A `rare` look takes that share of the odds (Phantom Thief Sableye, a
   fifth): in a choice it is picked by weight, so the others keep theirs. */
/* A `daytime` event (Shichi-Go-San: a shrine visit is by day) takes the
   EVENT_NIGHT lift in daylight instead. */
export function eventLook(sp, random, { day, night, lure } = {}) {
  const ev = eventOn(day);
  const looks = (ev?.looks ?? []).filter((l) => l.of === sp.id || l.on === sp.id);
  if (!looks.length) return sp;
  const w = looks.map((l) => l.rare ?? 1), sum = w.reduce((a, b) => a + b, 0);
  const lit = ev.daytime ? !night : !!night;
  if (random() >= eventChance({ night: lit, lure, share: shareOf(ev) }) * (sum / looks.length)) return sp;
  if (looks.length === 1) return speciesById(looks[0].id);
  let r = random() * sum, k = 0;
  while (r >= w[k] && k < looks.length - 1) r -= w[k++];
  return speciesById(looks[k].id);
}
/* ONE MEETING IN HOW MANY with its base is this look, by day and without a
   lure (the Dex's and the poster's number). */
export function lookEvery(ev, look) {
  const base = look.on ?? look.of;
  const n = ev.looks.filter((l) => l.of === base || l.on === base).length;
  return Math.round(n / (shareOf(ev) * (look.rare ?? 1)));
}

/* EVERY LOOK OF AN EVENT IN THE POKEDEX, AND ITS HUNT, is its medal
   (`event:<id>`) and its title, claimed on the Events board (`claimEvent`) -
   never paid on the catch, like a generation. A trade counts, as it does for
   the Pokedex; a look evolved into counts, which is how most of each line is
   held. The hunt's own medal is no title of its own (2026-10-26, asked for:
   "Hallowed Hunter only when all are caught, Darkrai included") - it is
   what the title waits on. A title claimed before that rule is kept. */
export const EVENT_PACKS = 1;
export const eventHeld = (ev, dex) => ev.looks.filter((l) => dex?.[dexIndex(l.id)] === 2).length;
export const eventDone = (ev, dex, medals = []) => eventHeld(ev, dex) === ev.looks.length
  && (!ev.hunt || medals.includes(`event:${ev.hunt.medal}`));
export const eventDue = (dex, medals = []) =>
  EVENTS.filter((ev) => eventDone(ev, dex, medals) && !medals.includes(`event:${ev.id}`));

/* THE NIGHTMARE (an event's `hunt`, eventforms.js): `state.dreams` holds
   each event's Bad Dreams, one a costume caught on its days. Full, the hunt
   is DUE until its medal is won: the next wild meeting in its area after
   dark is it. A save's count is held to the hunt's own range. */
/* THE HUNT'S WORDS: Hallowed Night's dreams and new moon, unless an event
   names its own (`hunt.words`: Shichi-Go-San's blessings and shrine bell). */
const HUNT_WORDS = {
  token: "Bad Dream", tokens: "Bad Dreams", due: "The new moon has risen", rise: "THE NEW MOON RISES",
  falls: "The Nightmare falls...", fade: "THE NIGHTMARE FADES", back: "the new moon will bring it back",
  run: "The Nightmare fades if you run",
};
export const huntWords = (h) => ({ ...HUNT_WORDS, ...h?.words });
export function huntDue(dreams, medals = [], day) {
  const ev = eventOn(day);
  const h = ev?.hunt;
  if (!h || medals.includes(`event:${h.medal}`)) return null;
  return (dreams?.[ev.id] ?? 0) >= h.dreams ? h : null;
}
export const cleanDreams = (d) => Object.fromEntries(EVENTS.filter((ev) => ev.hunt).flatMap((ev) => {
  const n = d?.[ev.id];
  return Number.isInteger(n) && n >= 0 && n <= ev.hunt.dreams ? [[ev.id, n]] : [];
}));

/* THE CLOCK ON AN EVENT, for its countdowns: it opens at local midnight on
   its first day and closes at local midnight after its last - the same days
   `eventOn` keys on, as instants. Announced `TEASE_DAYS` before it opens. */
export const TEASE_DAYS = 7;
const midnight = (k, plus = 0) => new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8) + plus).getTime();
export const eventOpens = (ev) => midnight(ev.start);
export const eventCloses = (ev) => midnight(ev.end, 1);
// The event about to open (within TEASE_DAYS), or null - never one running.
export function eventSoon(now = Date.now()) {
  if (eventOn(dayKey(new Date(now)))) return null;
  return EVENTS.find((ev) => eventOpens(ev) > now && eventOpens(ev) - now <= TEASE_DAYS * 86400000) ?? null;
}

/* AN EVENT'S CHECK-IN DAY (its `checkin`): what a check-in on that weekday
   pays besides its own reward, or null. */
export function eventCheckin(day = dayKey()) {
  const ev = eventOn(day);
  const d = new Date(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));
  return ev?.checkin && d.getDay() === ev.checkin.weekday ? { event: ev, items: ev.checkin.items } : null;
}

// Days left in an event, today included (the dialog's and the board's count).
export function eventDaysLeft(ev, day = dayKey()) {
  const at = (k) => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));
  return Math.max(0, Math.round((at(ev.end) - at(day)) / 86400000) + 1);
}
