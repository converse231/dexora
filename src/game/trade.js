/* TRADING'S RULES, browser-free like research.js and events.js, so check.mjs
   drives them with no engine and no network. The design and every decision
   behind these numbers is docs/trading.md - change it there first.

   THE SERVER IS THE AUTHORITY for anything that moves between players; these
   are the client's copy of the same rules, used to grey out a button before a
   round trip rather than to decide anything. The SQL mirrors LIMITS, and
   check.mjs holds the two equal. */
import { variantOf } from "./items.js";

export const LIMITS = {
  TRADES_PER_DAY: 10,     // completed trades of any kind, per trainer per day
  SURPRISE_PER_DAY: 5,    // surprise deposits per day
  OPEN_OFFERS: 10,        // pending direct offers you have sent
  OPEN_LISTINGS: 5,       // live board listings
  LISTING_DAYS: 7,        // a listing or a deposit comes home after this
  MAX_SIDE: 3,            // Pokemon per side of one offer
  SHOWCASE: 6,            // profile showcase slots
  SEEKING: 12,            // "looking for" species on a profile
  FRIENDS: 100,           // friends and pending requests, per trainer
  SHELF: 12,              // Pokemon a trainer puts up for trade
};

/* WHY A BOX ENTRY CANNOT MOVE. Set by the engine from what the server says the
   Pokemon is doing; every one of them is enforced in the engine, not the UI. */
export const LOCKS = ["offer", "listing", "pool"];

/* THE ONLY THINGS A TRAINER CAN SAY. No free text anywhere - the age gate is
   13, and a preset cannot carry anything a moderator would have to read.
   APPEND-ONLY: a message is stored by its index. */
export const PRESETS = [
  "Hi! Want to trade?",
  "Looking for rare forms!",
  "Fair trade?",
  "Thank you!",
  "Good luck out there!",
  "Completing my Pokédex!",
];

/* A SERVER ID IS A UUID, and nothing else may pose as one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Same shape as the username rule in SUPABASE.md / name.js.
const TRAINER = /^[A-Za-z0-9 _-]{3,16}$/;

/* A saved box entry's trade fields, each kept only if it is sound. One bad
   field is dropped, never the entry - the save rule for everything else. */
export function cleanTradeFields(mon) {
  const out = { ...mon };
  if (out.mid !== undefined && !(typeof out.mid === "string" && UUID.test(out.mid))) delete out.mid;
  if (out.ot !== undefined && !(typeof out.ot === "string" && TRAINER.test(out.ot))) delete out.ot;
  if (out.traded !== undefined && !(Number.isInteger(out.traded) && out.traded > 0 && out.traded < 1000)) delete out.traded;
  if (out.lock !== undefined && !LOCKS.includes(out.lock)) delete out.lock;
  // A lock with no server id is a lock nothing can ever lift.
  if (out.lock && !out.mid) delete out.lock;
  return out;
}

/* WHY A TRAINER IS REPORTED. The server stores the INDEX (0-15, `reports`),
   so this list is append-only, like `TASKS`: an edited row re-labels every
   report already filed. No free text - nothing to moderate twice. */
export const REPORT_REASONS = ["Offensive name", "Spam or harassment", "Cheating", "Something else"];

/* CAN THIS ONE BE OFFERED? Anything but the LAST of its species you hold, and
   never while something already holds it. Variants and alphas included: the
   old "spares only" rule read `duplicateUids`, which never counts a variant as
   spare - it would have made every shiny untradeable. */
export function tradeable(box, mon) {
  if (!mon || mon.lock) return false;
  let same = 0;
  for (const m of box) if (m.species === mon.species && ++same > 1) return true;
  return false;
}

/* THE SERVER'S INBOX, AS THE ENGINE TAKES IT. `trade_inbox()` names a
   Pokemon's state the server's way ('offered', 'pooled'...); `reconcileTrades`
   takes box locks. One mapping, here, so the two vocabularies meet once. A
   status this build does not know is left out rather than guessed. */
const LOCK_OF = { held: null, offered: "offer", listed: "listing", pooled: "pool" };
export function inboxToReconcile(inbox) {
  const locks = {};
  for (const [mid, status] of Object.entries(inbox?.locks ?? {})) {
    if (status in LOCK_OF) locks[mid] = LOCK_OF[status];
  }
  return {
    locks,
    gone: Array.isArray(inbox?.gone) ? inbox.gone.filter((m) => typeof m === "string") : [],
    arrived: Array.isArray(inbox?.arrived) ? inbox.arrived.filter((m) => m && typeof m.mid === "string") : [],
  };
}

/* WHICH FINISHED TRADES STILL NEED THEIR SCENE: not seen on this device,
   something came to you, and from the last day - a new device must not replay
   a week of trades. Oldest first, at most three, so a burst queues in order. */
export const SCENE_WINDOW = 24 * 60 * 60 * 1000;
export function freshTrades(recent, seen, now = Date.now()) {
  return (Array.isArray(recent) ? recent : [])
    .filter((r) => r && r.id && !seen.has(r.id) && r.got?.length && now - Date.parse(r.at) < SCENE_WINDOW)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-3);
}

/* DOES THIS ONE FIT THAT LISTING? The server's rule in `fulfil_listing`,
   copied so the board can say "you have one" before a round trip: the wanted
   species, and the wanted tier if one was named - and free to trade at all. */
export const fits = (box, mon, listing) => tradeable(box, mon)
  && mon.species === listing.want_species
  && (!listing.want_tier || variantOf(mon) === listing.want_tier);

/* What the server is shown when a Pokemon first enters trading. It checks each
   field against the save it already holds, so this is a claim to verify, not a
   thing to trust. */
export const snapshot = (mon) => ({
  uid: mon.uid,
  species: mon.species,
  level: mon.level,
  size: mon.size ?? null,
  tier: variantOf(mon),
  alpha: !!mon.alpha,
});
