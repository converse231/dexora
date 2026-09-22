/* THE TUTORIAL IS NOT A TUTORIAL. Nobody reads a five-step tour of a game they
   have not played yet, and this one has nothing to explain until you are
   standing in front of the thing: "spares convert to Rare Candy" means nothing
   before you have a spare, and it is obvious the moment you do.

   So there is no sequence, no overlay and nothing to sit through. Each line
   appears the first time you reach the moment it is about, once ever, and then
   never again. That is the whole design, and it is why this file is a list
   rather than a state machine - there is no "step 3", so there is nothing to be
   on, nothing to resume, and nothing to get stuck in.

   PURE, AND THE ORDER HERE IS THE PRIORITY. `nextHint` takes what just happened
   and what has already been shown, and returns at most one - because two tips
   at once is a dialog, which is the thing being avoided. When a catch is both
   somebody's first duplicate AND their first Holo, the rarer fact wins. */

/* Fifty catches is about half an hour of play: past the tutorial tips, and
   enough of a dex that losing it would be a loss rather than a restart. */
export const BACKUP_AT = 50;

export const HINTS = [
  /* Before anything else, because it is the only one you cannot work out by
     looking: every tile spawns, so there is nowhere special to stand. */
  {
    id: "spawn",
    when: (e) => e.kind === "step" && e.steps >= 12,
    text: "Anywhere can spawn — there are no special tiles. Just keep walking.",
  },
  {
    id: "throw",
    when: (e) => e.kind === "encounter",
    text: "Throw a ball to catch it. A weaker ball still works, it just takes more.",
  },
  /* The rare tiers are the one thing in the game you can meet and not notice.
     Ahead of the duplicate tip on purpose - a spare will come round again in a
     minute, and this one might not for hours. */
  {
    id: "variant",
    when: (e) => e.kind === "encounter" && !!e.variant,
    text: (e) => `That one is ${e.variant.toUpperCase()} — a rare form. They are `
      + "worth spending a better ball on.",
  },
  {
    id: "flee",
    when: (e) => e.kind === "fled",
    text: "It ran. Berries make that less likely — a Nanab stops it outright.",
  },
  {
    id: "duplicate",
    when: (e) => e.kind === "caught" && e.duplicate,
    text: "A second one. Spares sell for cash or convert to Rare Candy in BOX — "
      + "you pick, every time.",
  },
  /* A COLLECTION WORTH LOSING IS WORTH A COPY, AND THAT IS SAID ONCE. EXPORT
     has been on the YOU panel since saves existed and nothing ever pointed at
     it, so it was found by the people who had already lost something. It is
     the one copy that survives everything else going wrong - a cleared
     browser, a deleted account, a server that goes away - and it is worth
     one sentence at the moment there is something to lose. Asked for as
     "just once, just to make the player know": a reminder that came back
     would be a nag about a chore. After `duplicate`, which a first catch
     reaches long before the fiftieth. */
  {
    id: "backup",
    when: (e) => e.kind === "caught" && e.caught >= BACKUP_AT,
    text: "That is a collection worth keeping. EXPORT in YOU saves a copy you "
      + "hold yourself — it outlives this browser and any account.",
  },
  {
    id: "candy",
    when: (e) => e.kind === "candy",
    text: "Rare Candy is levels. Levels are how a Pokémon evolves — raise one in BOX.",
  },
  {
    id: "point",
    when: (e) => e.kind === "level" && e.free > 0,
    text: "You have a stat point. They are permanent, and there are fewer than "
      + "there are ranks — spend it in YOU.",
  },
  {
    id: "travel",
    when: (e) => e.kind === "level" && e.opened,
    text: (e) => `${e.opened} is open. Every map has its own residents — MAP to travel.`,
  },
];

/* WHAT TO SAY NOW, or nothing. `shown` is the ids already used, straight off the
   save, so this survives a reload and cannot repeat. Returns the hint rather
   than mutating anything: the engine decides whether to bank it, and check.mjs
   can walk every branch without one. */
export function nextHint(event, shown = []) {
  const seen = new Set(shown);
  const hit = HINTS.find((h) => !seen.has(h.id) && h.when(event));
  if (!hit) return null;
  return { id: hit.id, text: typeof hit.text === "function" ? hit.text(event) : hit.text };
}

export const HINT_IDS = HINTS.map((h) => h.id);
