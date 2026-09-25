import { SPECIES } from "../data/dex.js";
import { EVOLUTIONS as EVO_ROWS } from "../data/evolutions.js";
import { GUARANTEED, PLAIN_MULT } from "../catch.js";
import {
  TIERS, TIER_ODDS, ENCLOSED, ENCOUNTER_RATE, speciesById,
} from "./biomes.js";

/* The economy and evolution, free of DOM so tools/check.mjs can test them.

   The whole design rests on one sentence: commons print money, rares burn it.
   Grinding Pidgeys nets a little every catch; hunting a Dratini is a deliberate
   losing bet you fund with that. Every number below exists to keep that true,
   so if you retune one, re-run `npm run check` - it asserts the relationship
   still holds rather than just checking the arithmetic. */

/* Trainer level unlocks stock rather than places. It is the same pacing the old
   area locks were doing, but stated as "you can buy this now" instead of "you
   may not go there" - a reward rather than a wall. */
/* SITUATIONAL BALLS.

   Four of these do nothing at all most of the time and beat an Ultra Ball when
   their one condition holds. That shape is the whole point: a ball that is
   simply better is a tax you pay for not having enough money, while a ball
   that is better HERE is a decision you make in the shop and cash in on the
   route. Each is priced BELOW the Ultra Ball, so choosing right is cheaper than
   brute force and choosing wrong is dearer than a Poke Ball.

   Every condition keys off something the game already tracks, and each one off
   a DIFFERENT system, so no two overlap:

     Net     the species' types      Repeat  the Pokedex
     Dusk    which area you are in   Timer   throws at this encounter

   The multipliers come from the real games (Gen III-IV), but the game's own
   ladder is already tuned above canon - a Great Ball is 1.8 here against 1.5
   there - so these sit at 3.5 rather than 3, which keeps a situational ball
   worth more than the 3.0 Ultra it is competing with.

   TWO CANON BALLS WERE MEASURED AND REJECTED:

   * Nest Ball is (40 - level) / 10 - but every wild Pokemon here is level 2 to
     7, so that formula is a flat ~3.5 on literally every encounter in the
     game. That is not a condition, it is an Ultra Ball for 40% less money.
   * Dive Ball boosts while fishing, and everything on a rod here is Water-
     typed, so it would be the Net Ball wearing a second name and a second
     price. One of them had to go and the Net Ball covers more ground.

   A fifth, the Quick Ball, is 4x on the first turn - which in a game where the
   first throw is the one everybody makes is just the best ball, always. */
/* WHAT A PLAIN THROW IS WORTH, and it is 0.8 rather than 1.0.

   Asked for as "a bit harder to catch with a Poke Ball". Done here rather than
   by scaling `rate` in catch.js, or by putting a handicap inside
   `catchChance`: both of those move EVERY ball at once and re-tune the rare
   economy that file exists to defend. The cheap throw is the only thing that
   should get worse.

   It is a shared constant and not a number typed into one row, because the
   four situational balls carry the same baseline: a Net Ball thrown at
   something that is not a Water type IS a Poke Ball, and that has to stay true
   or the expensive ball is quietly better than the cheap one even when its
   condition fails. Their `boost` is untouched, so the condition is worth more
   than it was.

   It also WIDENS the plain ladder from below - 0.8 / 1.8 / 3.0 - which is the
   direction the Great Ball wanted anyway. */
export { PLAIN_MULT };

export const BALLS = [
  { id: "poke-ball", name: "Poké Ball", short: "POKÉ", mult: PLAIN_MULT, price: 25, level: 1 },
  { id: "great-ball", name: "Great Ball", short: "GREAT", mult: 1.8, price: 90, level: 6 },
  {
    id: "net-ball", hideWhenEmpty: true, boost: 3.5, name: "Net Ball", short: "NET", mult: PLAIN_MULT, price: 150, level: 8,
    hint: "on Bug and Water",
    bonus: (enc) => (enc.types.some((t) => t === "bug" || t === "water") ? 3.5 : PLAIN_MULT),
  },
  {
    id: "repeat-ball", hideWhenEmpty: true, boost: 3.5, name: "Repeat Ball", short: "REPEAT", mult: PLAIN_MULT, price: 170, level: 10,
    /* The best-fitting ball in the game and it was not designed for it: this
       whole game is re-catching species you already own to find their Origin,
       Holo, Shiny and Astral. `known` is the dex snapshot taken when the
       encounter began, not live state - settling a catch registers the
       species, and reading it live would make the ball change value halfway
       through its own throw. */
    hint: "on ones you know",
    bonus: (enc) => (enc.known ? 3.5 : PLAIN_MULT),
  },
  { id: "ultra-ball", name: "Ultra Ball", short: "ULTRA", mult: 3.0, price: 250, level: 12 },
  {
    id: "dusk-ball", hideWhenEmpty: true, boost: 3.5, name: "Dusk Ball", short: "DUSK", mult: PLAIN_MULT, price: 190, level: 14,
    /* CANON IS NIGHT AND CAVES, and until there was a clock it could only be
       caves. `enc.night` is frozen onto the encounter when the Pokemon appears,
       like `known` and `areaId` and for the same reason: a throw must not
       change value because you took a step mid-animation. */
    hint: "night and caves",
    bonus: (enc) => (enc.night || ENCLOSED.has(enc.areaId) ? 3.5 : PLAIN_MULT),
  },
  {
    id: "timer-ball", hideWhenEmpty: true, boost: 4, name: "Timer Ball", short: "TIMER", mult: PLAIN_MULT, price: 70, level: 16,
    /* Canon is (turns + 10) / 10, capping at 4x after THIRTY turns. There are
       no turns here and a throw costs a ball, so nobody was ever going to
       reach thirty: rescaled to reach the same 4x cap after five misses, which
       is a long fight in this game and about what thirty turns is in that one.
       The curve, not the constant, is what was copied.

       AND IT IS THE CHEAP ONE - cheaper than a Great Ball, which looks wrong
       next to a 4x cap until you price the ramp. Every throw on the way up is
       paid for at full price and most of them are worth ~1x, so at 140 it
       measured as the most expensive way to catch a rare in the game: 606 a
       head against the Ultra Ball's 472. The cap is not what you buy, it is
       what you might reach - a rare flees about half the time it breaks free,
       so a fifth throw at the same one happens maybe 2% of the time. Being
       cheap enough to keep throwing IS the ball. check.mjs prices it by
       simulating the ramp, not by its cap. */
    hint: "grows each throw",
    /* Counts every throw at this Pokemon, not every Timer Ball - so softening
       one up with cheap Poke Balls and then switching is a real tactic rather
       than an exploit to close. */
    bonus: (enc) => Math.min(4, PLAIN_MULT + 0.6 * (enc.throws ?? 0)),
  },
  /* NEVER FAILS, AND NOW IT HAS A PRICE - which reverses what this comment
     used to say, so here is the old argument and what changed.

     It was unbuyable on the grounds that "a price is only ever a delay - grind
     long enough and you could hold twenty". That is true, and it is still the
     risk. What it missed is that an unbuyable item has no dial at all: the only
     way to tune it was `MASTER_EVERY`, which moves how many the game HANDS you,
     and a player who wants one more than the schedule allows has nothing to do
     about it. A price is a delay, but a delay is exactly what an economy is for.

     SO THE PRICE IS SET AGAINST THE CHEAPEST HONEST ROUTE, not picked. Landing
     a rate-3 legendary the hard way measures at ~1,500 in balls (Timer Balls,
     at its best case, over about five encounters with it). Anything near that
     and the Master Ball becomes the CHEAP way to catch a legendary, which
     inverts the ball ladder the whole shelf is built on. At 50,000 it is
     thirty-three times the cheapest route: never the efficient choice, only the
     certain one. That is the thing it should be bought for - the legendary you
     have already watched run away, where the alternative is losing it again.

     And it is priced against income, not against the other balls. The best map
     nets about 42 a head and a 50,000-step playthrough is ~3,500 encounters, so
     this is roughly a third of everything a whole game earns, for one ball.
     check.mjs measures both of those and fails if either stops being true.

     Level 30 is well past the last shop unlock (Astral Honey at 24): it opens
     when a player has an income to spend rather than a hole to save into.
     Hidden from the ENCOUNTER until you own one, which is unchanged - that is
     about the ball rail, not the shelf. */
  {
    id: "master-ball", name: "Master Ball", short: "MASTER", mult: GUARANTEED,
    price: 50000, level: 30, hideWhenEmpty: true, hint: "never fails",
  },
];

export const ballById = (id) => BALLS.find((b) => b.id === id);

/* What a ball is worth RIGHT NOW. One function, called by the engine when it
   rolls and by the rail when it draws, so the number on screen is the number
   that will be used - the alternative is a rail that advertises 3.5 and a roll
   that quietly used 1.0, which is unfalsifiable from the outside.

   `enc` is the whole encounter object rather than a hand-built context: every
   field a condition needs is already on it, and a second shape to keep in step
   is a second thing to forget. No encounter (standing on the map, or a shop
   shelf) means no condition can hold, so the base multiplier is the answer. */
/* An unboosted situational ball IS a Poke Ball, and every `bonus()` above
   falls back to `PLAIN_MULT` rather than to a typed-in 1.0 for that reason.
   They did type it in, and the day the plain throw was weakened to 0.8 that
   made a Net Ball out of water strictly better than the cheap ball at six times
   the price - the exact thing the shared constant exists to prevent. check.mjs
   asserts `min(bonus over every encounter) === ball.mult`, which is what
   caught it. */
/* A RAZZ BERRY GOES THROUGH HERE, and that is the whole reason it is not an
   argument to `resolveThrow`. This function is the single answer to "what is
   this ball worth against this Pokemon" - the engine rolls with it and the
   rail prints it - so a berry that multiplied the roll somewhere else would
   make the rail advertise 3.0 over a throw that quietly used 4.5. The berry
   is a fact about the encounter and the encounter is already the argument. */
export const liveMult = (ball, enc) => {
  const base = enc && ball.bonus ? ball.bonus(enc) : ball.mult;
  // Never the Master Ball: it is already past certain and scaling it is noise.
  if (base >= GUARANTEED) return base;
  /* An ALPHA holds on harder, and it is here rather than beside the roll so
     the rail prints what the throw uses. */
  return base * (enc?.berries ? berryCatch(enc.berries) : 1) * (enc?.alpha ? ALPHA_CATCH : 1);
};

/* WHAT AN ALPHA COSTS AND PAYS. It never flees, so the price is balls rather
   than the chance of losing it: 0.6 of a throw's worth, which is a harder
   catch and not a hopeless one. And because `keeper()` protects it from the
   sweep, it can never be converted - so its candy is paid at the moment of
   capture, the same shape the variant bounty takes for the same reason. */
export const ALPHA_CATCH = 0.6;
export const ALPHA_CANDY = 10;
export const alphaCandy = (sp) => ALPHA_CANDY * candyValue(sp);

/* `boost` is the HEADLINE: the most a ball can ever be worth, which is what the
   shop shelf prints because "×1.0 odds" is a true and useless thing to say
   about a Net Ball. It is a second copy of a number that `bonus()` already
   knows, so check.mjs holds the two together - it asserts no `bonus()` ever
   exceeds its `boost` and that each one actually reaches it. A headline the
   ball cannot deliver would be the worst bug in this file, because nothing
   about it looks wrong. */

// The balls with no condition: the plain ladder, which must stay a ladder.
export const PLAIN_BALLS = BALLS.filter((b) => !b.bonus);

/* The five Gen 1 evolution stones. One price for all of them: which stone you
   need is decided by what you caught, not by how good the evolution is, so
   charging different amounts would only tax you for your luck. */
/* Every stone an evolution asks for must be BUYABLE, and check.mjs asserts the
   list against `EVOLUTIONS` rather than trusting it. Johto and Sinnoh brought
   three more, and a stone that is not on this shelf is not a hard evolution -
   it is an impossible one, with nothing on screen to say so.

   The three new ones unlock later than the Kanto five, because the species
   that want them belong to generations that have not arrived yet at Lv 8. */
export const STONES = [
  { id: "fire-stone", name: "Fire Stone", price: 1200, level: 8 },
  { id: "water-stone", name: "Water Stone", price: 1200, level: 8 },
  { id: "thunder-stone", name: "Thunder Stone", price: 1200, level: 8 },
  { id: "leaf-stone", name: "Leaf Stone", price: 1200, level: 8 },
  { id: "moon-stone", name: "Moon Stone", price: 1200, level: 8 },
  { id: "sun-stone", name: "Sun Stone", price: 1400, level: 22 },
  { id: "shiny-stone", name: "Shiny Stone", price: 1400, level: 22 },
  { id: "dusk-stone", name: "Dusk Stone", price: 1400, level: 35 },
];

/* FIELD ITEMS, in three families, and the families are the design.

   The note this was deferred behind said it plainly: **three things reshaping
   one encounter table need one rule, not three.** So each family pulls exactly
   one lever, and no two families pull the same one:

     repel    HOW OFTEN something appears   - scales the encounter rate
     rarity   WHICH SPECIES appears         - Fortune's own exponent
     variant  WHICH TIER it wears           - the variant roll

   That is the whole reason a lure could not just be "a weight transform": one
   already existed. Nothing here invents a mechanism; each borrows the one the
   game already had, which is why they compose instead of fighting.

   ONE PER FAMILY RUNS AT A TIME, which is structural rather than enforced:
   `state.field` is keyed on the family, so a Max Repel replaces a Repel by
   being written to the same slot. Two honeys at once would be two variant
   tilts, and then which one is the odds is a question with two answers.

   Counted in STEPS, not seconds, so an effect you paid for is not burned by
   walking away from the keyboard.

   THE COLOURED HONEYS HAVE NO ART AND WANT NONE. `art: "honey"` points all
   four at the one jar, and `tier` is what makes a Holo Honey look like a Holo:
   the same foil travelling over the same picture. It is the cheapest possible
   drawing of exactly the right idea, and it means adding a fifth tier adds a
   honey for free.

   THERE IS NO ORIGIN HONEY, deliberately. Origin is gated on catching every
   ordinary Pokemon of a generation, and an item that shortcuts a gate is the
   gate deleted. The other three tiers are luck, and luck is a thing you are
   allowed to buy help with. */
/* ONE JAR PER TIER, AND EVERY NUMBER ON ONE IS DERIVED.

   There were three - Holo, Astral, Shiny - written when there were four tiers,
   so five of the eight had no jar at all. Reported as missing honeys for the
   new variants. The earlier argument for stopping at three was shelf bloat,
   and the shelf answers that itself: `onShelf` shows what you can buy plus the
   NEXT thing to open, so a jar you have not levelled to is not on it.

   THE LIFT IS COMPUTED, NOT TYPED, AND THAT IS THE REAL FIX. These were hand
   numbers, and hand numbers drift the moment the odds move. It has now
   happened twice in opposite directions: this file used to record a Shiny
   Honey quietly falling to 43% when Shiny went 1/240 to 1/600, and when the
   ladder was compressed the other way they drifted UP, to 82-91% against a
   design that says three-in-four. Both times a jar changed value because a
   number in another file changed, which is the one thing a derived value
   cannot do.

   AND IT SOLVES FOR A COUNT NOW, NOT FOR A CHANCE. It used to solve
   P(at least one) = `HONEY_LANDS`, three-in-four over the run - which is a jar
   that one time in four does nothing at all, at a price you paid up front.
   That is a lottery ticket rather than an item, and it is the reason the
   honeys read as not worth buying.

   `HONEY_MEETS` is how many of that tier one jar is meant to hand you, so
   lift = MEETS / (met x odds). Three, because three is what makes the purchase
   obvious: you buy a Shiny Honey and you meet shinies, plural, and there is
   nothing to be unlucky about. The jars cost about two and a half times what
   they did and are worth about four, which is the trade being made on purpose.

   Every jar is still equally good at its own tier BY CONSTRUCTION - they all
   land within a rounding step of three - so the price goes on saying which
   tier you want rather than which jar works.

   THE CLAMP IS WHAT STOPS THIS RUNNING AWAY. `LIFT_CEILING` caps any tier at
   1 in 5 however many multipliers stack, so three meets per jar cannot become
   a tier you are simply handed, and pity on top of a honey is still bounded.
   Raise `HONEY_MEETS` far enough and the clamp, not this formula, is what
   decides - check.mjs asserts the two do not meet. */
export const HONEY_STEPS = 600;
export const HONEY_MEETS = 3;

/* WHAT A JAR COSTS, AND IT IS ANCHORED TO THE PLAY IT COVERS.

   These were `6000 + 900 * rank`, two typed numbers with no relationship to
   the economy - and that is exactly how they drifted into being unaffordable
   with nothing able to say so. Measured: a honey runs 600 steps, which is 42
   encounters, and 42 encounters GROSS about Y3,800 on the starting map and
   Y7,300 on the richest. A Showdown Honey at Y12,300 was **168% of the best
   map's take and 324% of the starting map's** - so six of the nine jars cost
   more than the entire income of the run they covered, and using one could
   only ever be funded by not using one. Reported as too expensive; it was
   measurably that.

   The rule a price like this needs is that **a jar must cost less than the
   play it covers earns**, or the item is a net loss by construction. At
   `2000 + 250` the dearest is Y3,750: 80% of a mid-map run and 51% of the
   best, so a jar pays for itself and the decision is which tier you want
   rather than whether you can eat the cost.

   AND IT IS STILL A REAL SPEND. Spending a whole playthrough's ~Y128,000 on
   jars covers about half its runs and roughly DOUBLES the variants a
   playthrough meets (134 bought against 167 that arrive on their own) - for
   every yen, so no balls and no candy. That is a trade, which is what this
   was supposed to be. At the old band the same total bought 42, a quarter
   uplift for all your money, which is why they read as not worth buying.

   check.mjs computes the gross from the live tables and asserts the dearest
   jar sits under it, so this cannot drift again the way it just did. */
export const HONEY_BASE = 2000;
export const HONEY_RANK = 250;

const HONEY_MET = HONEY_STEPS * ENCOUNTER_RATE;
export const honeyLift = (odds) =>
  Math.max(2, Math.ceil(HONEY_MEETS / (HONEY_MET * odds)));

/* Kindest first, so the shelf reads as a ladder and the cheapest opens first.
   `TIER_ODDS` is rarest-first, hence the reverse. */
const TIER_HONEY = [...TIER_ODDS].reverse().map(([tier, odds], rank) => {
  const lift = honeyLift(odds);
  const name = tier.charAt(0).toUpperCase() + tier.slice(1);
  /* PRICE AND LEVEL COME FROM THE RANK, NOT FROM THE LIFT, and the suite is
     what said so. The lift is an integer ceiling, so Vivid at 1/105 and Noir
     at 1/118 both round to x4 and priced identically - and a shelf where two
     jars cost the same breaks the ladder the shop asserts. Origin and Holo are
     worse than a rounding tie: they share odds exactly, so no function of odds
     can ever separate them. Position on the ladder can, and is the honest
     thing for a price to track anyway. Effectiveness is derived from the odds
     because that is what makes a jar work; price is derived from the rank
     because that is what makes it a ladder. */
  return {
    id: `honey-${tier}`, art: "honey", tier, family: "variant",
    name: `${name} Honey`,
    /* DEARER, BECAUSE IT IS WORTH MORE. A jar was ¥2,400 for a three-in-four
       chance at ONE of its tier; it is three of them now, so the band moved
       with the value rather than staying where it was and quietly becoming
       the best purchase in the shop. A Showdown Honey is ¥12,300 against a
       playthrough's ~¥147,000 - a real decision, and an obvious one. */
    price: HONEY_BASE + HONEY_RANK * rank,
    level: 16 + rank,
    steps: HONEY_STEPS, lift,
    blurb: `${name}, ×${lift} as likely`,
  };
});

export const FIELD = [
  /* --- repel: how OFTEN ------------------------------------------------
     Canon durations are 100 / 200 / 250 steps. Ours are longer because a step
     here is a tile on a 30-wide map rather than a step in a whole region, and
     100 of them is one crossing. The RATIO is what was copied. */
  /* A REPEL IS TOTAL, and the tiers are DURATION rather than strength. It used
     to scale the encounter rate to 0.55 / 0.35 / 0.20, which is a repel that
     mostly works - and "mostly" is the one thing it must not be, because the
     entire reason to carry one is crossing ground you have already farmed
     without being stopped. Nothing appears while one is running; what you pay
     more for is how far it gets you. */
  {
    id: "repel", family: "repel", name: "Repel", price: 200, level: 8,
    steps: 200, rate: 0, blurb: "No wild Pokémon, 200 steps",
  },
  {
    id: "super-repel", family: "repel", name: "Super Repel", price: 450, level: 12,
    steps: 450, rate: 0, blurb: "No wild Pokémon, 450 steps",
  },
  {
    id: "max-repel", family: "repel", name: "Max Repel", price: 800, level: 16,
    steps: 900, rate: 0, blurb: "No wild Pokémon, 900 steps",
  },

  /* --- rarity: WHICH SPECIES -------------------------------------------
     The White Flute, under its own name and doing its own job: in Gen 3 it is
     already the item that brings out rarer wild Pokemon. `tilt` is subtracted
     from `rarityPower`'s exponent - the SAME number Fortune moves - so there
     is one place in the codebase where how rare the world is gets decided. */
  {
    id: "white-flute", family: "rarity", name: "White Flute", price: 900, level: 12,
    steps: 400, tilt: 0.15, blurb: "Rarer Pokémon come out",
  },

  /* --- variant: WHICH TIER ---------------------------------------------
     `lift` multiplies the variant roll. Plain Honey lifts every tier a little;
     a coloured one lifts its own tier a lot and leaves the rest alone, which is
     what makes it worth four times the price when you are hunting one thing. */
  /* MEASURED AGAINST WHAT ONE JAR ACTUALLY BUYS, which is the only honest way
     to price these. 300 steps at a 7% encounter rate is about 21 encounters, so
     a x6 Astral Honey - 6/480 - landed one 23% of the time. For ¥4,200 that is
     a jar that usually does nothing, and it was reported as not working at all.
     The user had simply never seen it fire.
     600 steps is about 42 encounters, and the lift is set PER TIER so all three
     come out at roughly the same three-in-four: x5 on Holo (1/160), x8 on Shiny
     (1/240), x16 on Astral (1/480). Equal effectiveness at their own tier means
     the price difference is about which tier you want rather than about which
     jar works, which is the honest thing for it to be about. */
  {
    id: "honey", family: "variant", name: "Honey", price: 1500, level: 14,
    steps: HONEY_STEPS, lift: 3, blurb: "Every rare tier, ×3 likely",
  },
  ...TIER_HONEY,
];

/* WHICH BALL EACH NUMBER KEY THROWS, AND IT IS THE PLAYER'S TO ARRANGE.

   The keys were `BALLS.indexOf(ball) + 1` - the shipped order, the same for
   everybody, and a Timer Ball you throw all afternoon sat on 6 because that is
   where it happened to be declared. Reported as wanting to reassign them, and
   on a phone as wanting to say which ball the A button throws; those turn out
   to be one question, because slot 1 is both.

   `saved` is a list of ball ids, most-favoured first, and it is a PREFERENCE
   rather than a ranking of every ball: anything it does not name keeps its
   shipped order behind the ones it does. So promoting one ball is one id in
   the list and nothing else moves relative to anything else.

   Unknown and duplicate ids are dropped rather than trusted - this comes out
   of `localStorage`, which anyone can edit and a half-written value can
   truncate, and a bad entry here would silently take a key away from a real
   ball. `BALLS` is always the fallback and always complete. */
export function ballOrder(saved) {
  if (!Array.isArray(saved) || !saved.length) return BALLS;
  const seen = new Set();
  const front = [];
  for (const id of saved) {
    const ball = BALLS.find((b) => b.id === id);
    if (ball && !seen.has(id)) { seen.add(id); front.push(ball); }
  }
  return [...front, ...BALLS.filter((b) => !seen.has(b.id))];
}

/* Move one ball to the front, keeping everything else in the order it was in.
   Returns the new list of ids - the caller is what persists it. */
export const promoteBall = (saved, id) =>
  [id, ...ballOrder(saved).map((b) => b.id).filter((x) => x !== id)];

/* THE BALL A BARE THROW USES. Space and the pad's A are the same action and
   must stay so, which is why this is one function rather than a rule in each:
   your slot-1 ball if you are holding any, and otherwise the cheapest you
   have, which is what both did before anybody could arrange anything.

   A BALL THAT CANNOT FAIL IS NEVER THE ONE A BARE THROW PICKS UP. That is
   `mult >= GUARANTEED` and not a name, and it is not `forSale` either - the
   first version of this used that and it did nothing, because the shop sells
   Master Balls. What makes this ball different is not that it is unbuyable,
   it is that throwing one ENDS the encounter, so a press that reaches for it
   by accident cannot be taken back. check.mjs caught it.

   It is still throwable - by its own key, or by choosing it on the sheet -
   and if it is genuinely the only ball left the fallback below still finds
   it, because then there is nothing else to throw. What it may not be is the
   ball you get without asking for it. */
export function defaultBall(bag, saved) {
  const first = ballOrder(saved)[0];
  if (first && first.mult < GUARANTEED && (bag?.[first.id] ?? 0) > 0) return first;
  return BALLS.find((b) => (bag?.[b.id] ?? 0) > 0) ?? null;
}

export const fieldById = (id) => FIELD.find((f) => f.id === id) ?? null;
/* The families, in the order they should be read and drawn. Derived, so adding
   a family is one row above and nothing here. */
export const FAMILIES = [...new Set(FIELD.map((f) => f.family))];

/* BERRIES, fed to the Pokemon standing in front of you.

   The Pokemon GO trio, and they were picked on the same test the four
   situational balls had to pass: each one must key off a DIFFERENT system, or
   two of them are one item with two prices. `effect` names which, and there is
   exactly one per berry so nothing has to infer it: `catch` moves the catch
   roll, `flee` moves the flee roll, `xp` moves the XP award.

   FEEDING THE SAME BERRY AGAIN DEEPENS IT, and that is a change from the first
   version, where a second Razz simply replaced the first and was worth nothing
   at all. A berry you cannot usefully spend twice is a berry you stop carrying:
   the long encounter that actually needs help is exactly where you would want
   to double down, and the answer was "that does nothing". `stage` counts how
   many are in it and every effect reads it.

   ONE PER EFFECT, NOT ONE AT A TIME. A different berry used to replace the one
   being eaten, and that was wrong in the way that matters: feed a Nanab to a
   Raikou so it cannot run, then a Razz to land it, and the Razz silently took
   the Nanab away - reported as "Raikou ran after eating a Nanab", which is
   exactly what happened. The three move three different rolls and nothing about
   them collides, so there is no mechanical reason they cannot all be in play.
   A berry replaces only another of its OWN effect.

   AND A BERRY AT ITS CAP REFUSES TO BE FED, rather than being eaten for
   nothing. "Cannot stack" should cost you a click, not a berry.

   A berry lasts the ENCOUNTER, not a throw. One you had to re-feed after every
   miss is one nobody can afford to use on the long fights that are the only
   ones worth using it on. */
export const BERRIES = [
  {
    id: "razz-berry", name: "Razz Berry", price: 300, level: 10,
    effect: "catch", per: 0.5, stages: 3,
    blurb: "Easier to catch; stacks ×3",
  },
  {
    /* ONE STAGE, BECAUSE ONE IS ALL IT TAKES. `per: 1` takes the flee
       multiplier to zero: a Pokemon that has eaten a Nanab does not run, full
       stop. That is the strongest single thing any item does in this game and
       it is priced like it - the whole point of it is the legendary that keeps
       getting away, where the alternative is losing the encounter outright. */
    id: "nanab-berry", name: "Nanab Berry", price: 450, level: 10,
    effect: "flee", per: 1, stages: 1,
    blurb: "It will not run. At all.",
  },
  {
    id: "pinap-berry", name: "Pinap Berry", price: 280, level: 14,
    effect: "xp", per: 1, stages: 3,
    blurb: "Double XP; stacks ×3",
  },
];

export const berryById = (id) => BERRIES.find((b) => b.id === id) ?? null;

/* WHAT IS BEING EATEN, AS A NUMBER, and one function per system so no screen
   or roll has to know how a stage becomes a multiplier.

   `fed` is the encounter's `{ id, stage }` or nothing. Every one of these
   answers 1 - "no change" - when there is no berry of its kind in play, which
   is what lets the call sites stay a single multiply. */
/* `fed` is the encounter's `{ [effect]: { id, stage } }`, so each of these
   reads only its own slot and the three cannot take each other away. */
const stageOf = (fed, effect) => {
  const one = fed?.[effect];
  return one && berryById(one.id) ? Math.max(1, one.stage ?? 1) : 0;
};

// Multiplies the ball, so it goes through catchChance's own ceiling.
export const berryCatch = (fed) => {
  const n = stageOf(fed, "catch");
  return n ? 1 + berryById(fed["catch"].id).per * n : 1;
};

/* Multiplies the whole flee line, and may reach 0 - a Nanab is a lock, not a
   discount. Floored there, because a negative flee chance is not a kinder
   berry, it is a number that means nothing. */
export const berryCalm = (fed) => {
  const n = stageOf(fed, "flee");
  return n ? Math.max(0, 1 - berryById(fed.flee.id).per * n) : 1;
};

export const berryXp = (fed) => {
  const n = stageOf(fed, "xp");
  return n ? 1 + berryById(fed["xp"].id).per * n : 1;
};

// Whether another one would do anything. The UI greys on it and `useBerry`
// refuses on it, so the two cannot disagree about a wasted berry.
export const berryRoom = (fed, id) => {
  const b = berryById(id);
  if (!b) return false;
  const one = fed?.[b.effect];
  // Room if this effect is empty, if something else of the same effect is in
  // it (a replace), or if the same berry has not reached its cap.
  return !one || one.id !== id || (one.stage ?? 1) < b.stages;
};

/* Which picture an item is drawn with. Only the coloured honeys need this -
   everything else is its own id - and it exists so no screen has to know that:
   `items/${artOf(item)}.png` is right for all of them. */
export const artOf = (item) => item?.art ?? item?.id ?? "";

/* Key items: earned at a trainer level, never bought, never used up. They are
   held in the same bag as everything else - a count of 1 means you have it -
   because a second bag for four things is a second thing to keep in sync. */
/* Lv 20, which is where the map ladder finishes (`MAP_LAST`). Every area is
   open by then, so this is a reward for having seen all eight rather than a key
   to one of them - and it turns the water and the lava those maps are drawn
   with from scenery into somewhere to go. */
export const SURF_LEVEL = 20;
/* THE ACRO BIKE, and it is not the Bicycle that was removed. That was a second
   way to go FAST, a toggle beside the Running Shoes. This goes nowhere faster:
   it is what lets you onto a rail - the white bars on Monsoon Trail and in the
   Safari Zone, which only an Acro Bike crosses in Emerald. Automatic, the way
   surfing is where you stand: step onto a rail holding it and you are riding. */
export const BIKE_LEVEL = 10;

export const KEY_ITEMS = [
  { id: "old-rod", name: "Old Rod", price: 0, level: 4,
    blurb: "Fish any shoreline. Mostly Magikarp, but it is a start." },
  { id: "acro-bike", name: "Acro Bike", price: 0, level: BIKE_LEVEL,
    blurb: "Ride the white rails. Step onto one and you are on it." },
  { id: "good-rod", name: "Good Rod", price: 0, level: 14,
    blurb: "A wider catch off the same shore." },
  { id: "running-shoes", name: "Running Shoes", price: 0, level: 15,
    blurb: "Hold Shift to run. Everything after this is faster." },
  { id: "super-rod", name: "Super Rod", price: 0, level: 22,
    blurb: "Reaches the deep water, where the rare things are." },
  { id: "surf", name: "Surf", price: 0, level: SURF_LEVEL,
    blurb: "Ride out onto water, and onto lava." },
];

/* THE SAME SHAPE AS `canRun`, and for the same reason: a level on its own is a
   gate nobody was told about, and an item on its own can be held by a save that
   never earned it. `loadState` hands it to any save already past the level,
   exactly as it does the Running Shoes. */
export const canSurf = (level, bag) =>
  level >= SURF_LEVEL && (bag?.surf ?? 0) > 0;
// The same two-part gate, for the rails.
export const canBike = (level, bag) =>
  level >= BIKE_LEVEL && (bag?.["acro-bike"] ?? 0) > 0;

const keyItemsAt = (level) => KEY_ITEMS.filter((k) => k.level === level);

/* Running Shoes, granted rather than carried. Gen 3 hands them over as an
   invisible key item - there is no bag sprite for them anywhere in the PokeAPI
   set, which is the honest reason they are a level and not an entry in
   KEY_ITEMS: inventing an icon for them would be the only fake art here.
   Early, because everything after it is faster and that should not be a
   late-game reward. */
export const RUN_LEVEL = 15;
/* Running is an ITEM now, not a birthday. It was a bare level check, which
   made the one ability that changes how the game feels arrive with no object
   and no announcement - you were simply faster one day. The Running Shoes sit
   in KEY_ITEMS beside the Bicycle and the rods, so the same panel that shows
   what you have earned shows this too, and the same level-up banner hands it
   over.

   `level` stays in the signature and is still checked. The bag is the real
   gate, but a hand-edited save that grants the shoes at level 2 should not
   also skip the pacing, and a save written before the shoes existed has a
   level and no item - see `loadState`, which grants them on sight. */
export const canRun = (level, bag) =>
  level >= RUN_LEVEL && holding(bag, "running-shoes");
export const holding = (bag, id) => (bag?.[id] ?? 0) > 0;
// Best rod held, or null. Later rods are strictly better, so last wins.
export const bestRod = (bag) =>
  [...KEY_ITEMS].reverse().find((k) => k.id.endsWith("-rod") && holding(bag, k.id)) ?? null;

/* What the shop will actually sell. A price of zero means it is not for sale at
   any level - the Master Ball's whole design, and the key items' too. */
export const forSale = (item) => item.price > 0 && item.level !== null;
export const SHOP_BALLS = BALLS.filter(forSale);

// Everything the game can name, whether or not it is for sale.
export const ALL_ITEMS = [...BALLS, ...STONES, ...KEY_ITEMS, ...FIELD, ...BERRIES];

/* WHAT THE BAG SHOWS, asked in one place because two screens now ask it.

   The rail down the left edge and the sheet the touch pad opens are the same
   inventory drawn twice, and the rules about what appears in it are exactly
   the sort of one-liner that gets copied and then fixed in one copy: this file
   already records a shiny surviving one bulk action and not its sibling, and
   Hoenn shipping with no evolutions because a second list of ranges drifted.

   A ball you have never owned stays hidden - the Master Ball always did, and
   the four situational ones joined it, because seven tiles of zeroes is a shop
   you cannot buy from rather than a bag readout. */
export const carriedBalls = (bag) =>
  BALLS.filter((b) => !b.hideWhenEmpty || (bag?.[b.id] ?? 0) > 0);

/* And the other strip: one row of things you can press RIGHT NOW, never a row
   of things you cannot. On the map that is the field items - is a repel worth
   starting before I cross this - and in front of a Pokemon it is the berries,
   because a repel is no longer a decision you can act on. */
export const usefulItems = (bag, enc) =>
  (enc ? BERRIES : FIELD).filter((i) => (bag?.[i.id] ?? 0) > 0);
export const SHOP_ITEMS = [...SHOP_BALLS, ...BERRIES, ...FIELD, ...STONES];
export const itemById = (id) => ALL_ITEMS.find((i) => i.id === id);

/* WHAT A SHELF SHOWS AT A GIVEN LEVEL, and this reverses a decision the shop
   used to make loudly.

   It showed everything, always, greyed with its level printed where the price
   goes - "nothing is hidden, because a wall you can read is a goal". That was
   right when the shop was nine items. It is twenty-seven now, and at level one
   twenty-four of them are grey: the wall stopped being a goal and became the
   shop. You cannot aim at twenty-four things.

   So: everything you can buy, plus the NEXT thing to open, and a count of the
   rest. That keeps the original argument exactly - a wall you can read is a
   goal - and gives you one wall instead of a row of them.

   ORDER IS PRESERVED rather than sorted, because a shelf's order is its own:
   FIELD is grouped by family (repel, repel, repel, flute, honey...) and is
   deliberately NOT in level order, so appending the next unlock at the end
   would move an item out of the family it belongs to. The next goal is found
   by level and then shown where it already sits. */
export function onShelf(items, level) {
  const shut = items.filter((i) => level < i.level);
  if (!shut.length) return { rows: items, later: 0 };
  const next = shut.reduce((a, b) => (b.level < a.level ? b : a));
  return {
    rows: items.filter((i) => level >= i.level || i === next),
    later: shut.length - 1,
  };
}

/* Levelling pays out in balls. It is the same pacing the old area locks were
   doing, but it hands you something instead of taking somewhere away. */
/* Every this many levels pays a Master Ball: 75 / 10 is seven over the cap.
   It was 8 while the cap was 50 (six), and keeping 8 at 75 made a whole game
   13 with walking's four - one over the 8-12 band check.mjs holds the total
   to, the band being the design ("enough to cover the legendaries and a few
   over, not so many that a Snorlax is worth one"). Ten puts it at 11. A ball
   already paid is never taken back; a new trainer gets five by Lv 50 instead
   of six, and two more past it. A divisor rather than a list, so the cap is
   the only number that decides. */
export const MASTER_EVERY = 10;

export function levelReward(level) {
  const items = { "poke-ball": plain(5, level) };
  if (level >= 12) items["ultra-ball"] = 2;
  else if (level >= 6) items["great-ball"] = 3;
  /* A COUNT, NOT A CADENCE - still the rule, and the count moved.

     It was three from levelling and two from walking, five in a whole
     playthrough, which made the Master Ball a thing you read about rather than
     a thing you used: with five legendaries in the dex, spending one always
     felt like a mistake you would regret at the sixth. Ten across the two
     sources is enough to cover every legendary and leave a few over, which is
     the point at which the item becomes a decision instead of a museum piece.

     Derived from the cap, as before: `MASTER_EVERY` levels into `MAX_LEVEL` is
     the count, so moving the cap moves this and nothing has to be remembered.
     check.mjs asserts the total rather than the divisor. */
  if (level % MASTER_EVERY === 0) items["master-ball"] = 1;
  for (const key of keyItemsAt(level)) items[key.id] = 1;
  return items;
}

/* Walking pays. Steps are the one number that only ever goes up when someone is
   actually playing, and until now they bought nothing at all.

   A parcel every 250 steps - about half a minute of walking - and a haul every
   tenth of those. Both scale with trainer level the same way `levelReward` does,
   because a parcel of Poke Balls at level 40 is not a reward, it is a rounding
   error.

   It pays in Poke and Great Balls, and only the haul reaches Ultras. That is
   deliberate: Ultras are what rares cost, and the loop this game is built on is
   that commons fund rares. Walking should let you keep catching commons faster,
   not let you skip the funding.

   And every tenth HAUL - 25,000 steps, which is most of a playthrough's walking
   - is a Master Ball. That is the one reward here that is not "keep doing what
   you were doing faster", and it is placed where it is for a reason: 25,000
   steps cannot be ground out in an evening and it cannot be bought, so it is
   the only Master Ball in the game you earn by playing rather than by
   levelling. Gated at level 20 as well as on distance, because a guaranteed
   catch handed to a level 4 trainer skips the part of the game it is a reward
   for. Two of them over 50,000 steps, against three from levelling - so the
   whole game's supply goes from three to five, and `check.mjs` pins both
   numbers. */
export const STEP_PARCEL = 250;
export const STEP_HAUL = 10;            // every tenth parcel is a bigger one
/* Every fifth HAUL carries a Master Ball - 12,500 steps, so four over a
   50,000-step playthrough where it used to be two. Walking is the slower of the
   two sources and it is the one a player who is not levelling still has. */
export const STEP_TREASURE = 5;
export const TREASURE_LEVEL = 15;

/* HOW MUCH OF THE CHEAPEST BALL IS STILL WORTH HANDING OVER.

   Both reward paths paid a FLAT Poke Ball grant at every level, which is right
   while it is the only ball you have and wrong the moment it is not: past Lv 12
   you are catching with Ultras and the plain ones bank up untouched. Reported
   from play at Lv 30 holding 122 of them - "I rarely see myself buying Poke
   Balls", which is the cheapest ball in the game having become a dead resource
   AND the shop losing its entry-level customer at the same time.

   The grant is a SAMPLE of the tier you just unlocked - that is the whole
   design of paying out in balls (see README) - so the plain one should fade as
   better ones arrive. Derived from the plain ladder's OWN unlock levels rather
   than typed, so retuning `BALLS` moves this with it instead of leaving two
   numbers to disagree. One function, called by both payers, because a taper
   applied in one of two places is the pile-up again at half speed. */
export const plainShare = (level) => {
  const ladder = PLAIN_BALLS.filter(forSale).map((b) => b.level);
  const great = ladder[1] ?? 6;
  const ultra = ladder[2] ?? 12;
  return level >= ultra ? 0.2 : level >= great ? 0.6 : 1;
};

// Never zero: the cheapest ball is the floor of the economy, not a retired one.
const plain = (n, level) => Math.max(1, Math.round(n * plainShare(level)));

/* WALKING PAYS CASH, AND IT IS THE ONLY INCOME THAT IS NOT AN ENCOUNTER.

   Asked for directly - *"a consistent source of income like for steps"* - and
   the reason it is the right shape is the one the last pass measured: every
   other stream here is paid per CATCH, so all of them dry up together on the
   run of bad luck that is exactly when you need one. Twenty Ultra Balls at a
   legendary that flees is -¥5,000 and nothing to sell, and no per-catch
   reward can help, because nothing was caught.

   **DERIVED FROM THE BALL LADDER, never a curve.** The wage is `STEP_WAGE`
   throws of the dearest ball you can currently buy that can still FAIL - so
   it is denominated in the thing you are running out of, and it re-prices
   itself if the shelf is ever retuned. A typed curve would have to be
   remembered on the day a ball's price moves; this cannot be.

   The Master Ball is excluded by the same predicate `defaultBall` uses, and
   for a sharper reason here: at 50,000 it is not a ball, it is the thing you
   are saving FOR, and pricing a wage against it would pay ¥200,000 a parcel
   the moment you passed Lv 30. */
export const STEP_WAGE = 2;
export const STEP_WAGE_HAUL = 3;   // the haul multiplies the balls; it multiplies this too

export const stepWage = (level, haul = false) => {
  const buyable = PLAIN_BALLS
    .filter((b) => forSale(b) && b.level <= level && b.mult < GUARANTEED)
    .map((b) => b.price);
  const dearest = buyable.length ? Math.max(...buyable) : BALLS[0].price;
  return dearest * STEP_WAGE * (haul ? STEP_WAGE_HAUL : 1);
};

export function stepReward(steps, level) {
  if (!steps || steps % STEP_PARCEL !== 0) return null;
  const parcels = steps / STEP_PARCEL;
  const haul = parcels % STEP_HAUL === 0;
  /* A treasure is always a haul as well, so the banner and the bigger stack
     come with it rather than a Master Ball arriving on its own in silence. */
  const treasure = haul
    && parcels % (STEP_HAUL * STEP_TREASURE) === 0
    && level >= TREASURE_LEVEL;
  const items = { "poke-ball": plain(haul ? 10 : 3, level) };
  if (level >= 12) items["great-ball"] = haul ? 5 : 2;
  else if (level >= 6) items["great-ball"] = haul ? 3 : 1;
  if (haul && level >= 12) items["ultra-ball"] = 2;
  if (treasure) items["master-ball"] = 1;
  return { items, money: stepWage(level, haul), haul, treasure };
}

// What a duplicate fetches, by the rarity tier already stored on each species.
/* WHAT A HEAD IS WORTH, AND THE TOP OF IT HAD STOPPED TRACKING THE DIFFICULTY.

   Reported from play at Lv 45 as money being hard to earn. Measured per
   encounter, averaged over each map's whole table, with the Haggle rank a
   trainer at that level would actually hold:

                            sell   bounty   dex    balls     NET
     Lv 5  Tall Grass       ¥ 61     ¥ 0   ¥103    -¥ 38   +¥126
     Lv 45 last map, Poke   ¥ 84     ¥ 0   ¥  0    -¥ 53   +¥ 31
     Lv 45 last map, Ultra  ¥142     ¥ 0   ¥  1    -¥317   -¥146   <- underwater

   **THE GAP IS ENTIRELY THE DEX BONUS**, and that is the finding: two thirds
   of early income is a stream that MUST end, so when it does the floor drops
   out. Nothing was wrong with the late game that was not wrong with the early
   game's honesty about where its money came from.

   What a catch COSTS in balls - the median catch rate of every species that
   actually spawns - is the column nobody had put beside this table before:

     band    rate    Poke/catch    was    now
     C        255    ¥   33        ¥ 40   ¥  40    the grind, untouched
     B        150    ¥   53        ¥ 90   ¥  90    untouched
     A         45    ¥  177        ¥220   ¥ 260    was thin
     S          3    ¥2,509        ¥600   ¥1,400   was 4x under water

   **THE S BAND HAS A CEILING AND THE EVOLUTION DATA SETS IT.** ¥2,800 was the
   first pick and check.mjs refused it: `happiny -> chansey` evolves at 16, so
   nine candy of commons buys a head that sells for the S band, and above
   ¥1,410 the sale buys back more candy than the evolution spent. That is a
   printer, and the bound is `(spent + 2) * CANDY_PRICE + SELL.B` - solved for
   over every evolution row rather than guessed at. Raising S again means
   raising `CANDY_PRICE` or reading `sellValue` through to the base form, and
   the second is deliberately not done (see `candyValue`).

   The commons did not move, because **the commons are the grind and the grind
   was never the problem.** */
export const SELL = { C: 40, B: 90, A: 260, S: 1400 };

export const sellValue = (sp) => SELL[sp.tier] ?? SELL.C;

/* A VARIANT PAYS A BOUNTY ON THE CATCH, AND IT HAS TO BE THE CATCH.

   Asked for as "the variants rewards are greater", and the obvious shape - a
   multiplier inside `sellValue` - is **dead code**, which is worth writing
   down because it took a second look to see. `keeper()` is enforced in the
   ENGINE on `sell` and `convert` both, so a variant can never be sold at all,
   deliberately: they are the one thing no bulk action may take. A sale price
   for something that cannot be sold pays exactly nothing.

   So it is cash at the moment of capture, and that is the better answer
   anyway. It is RENEWABLE where the dex bonus is not - about 1 in 18
   encounters, for as long as you play - which is precisely the hole the late
   game had: every other income here dries up or stays flat while the balls
   get dearer.

   DERIVED FROM THE LADDER, never a table: `VARIANT_PAY` scaled by how much
   rarer this tier is than the kindest, so a ninth tier prices itself and
   retuning `TIER_ODDS` carries the money with it. The ladder is 2.0x wide, so
   the spread is x9 to x18 on the species' own BAND - a Vivid common is ¥360
   and a Showdown legendary is ¥50,400, which is the jackpot and is meant to
   be: at 1 in 210 on top of 1 in 3,760 it is one encounter in 790,000.

   18 IS MEASURED, not picked. It is the value that flattens the whole curve -
   see the table above `SELL` - and each step of it is worth about ¥3 an
   encounter, so it is the coarse lever for how much of late income comes from
   luck rather than from volume. */
export const VARIANT_PAY = 18;

const KINDEST = Math.max(...TIER_ODDS.map(([, o]) => 1 / o));
export const variantPay = (variant) => {
  const row = TIER_ODDS.find(([t]) => t === variant);
  return row ? VARIANT_PAY * ((1 / row[1]) / KINDEST) : 0;
};

/* What catching THIS one pays, over and above the dex entry. Zero for an
   ordinary catch - the wage for those is selling the spare, which is what the
   whole `SELL` table is - so this adds an income stream rather than inflating
   the one that already exists. */
export const catchBounty = (sp, variant) =>
  Math.round((SELL[sp.tier] ?? SELL.C) * variantPay(variant));

/* PAID ONCE PER SPECIES, AND IT USED TO BE FLAT.

   ¥100 whether it was your ninth new species or your nine-hundredth - and the
   nine-hundredth is enormously harder to find, which is precisely the
   complaint: *"I caught many pokemon now and new pokemon is getting a bit
   scarce"*. So it CLIMBS with how much of the dex is already done: the first
   is ¥100 and the last is `1 + DEX_CLIMB` times that.

   **IT IS NOT THE INCOME FIX, and the first version of this comment claimed
   it was.** Measured, it is worth ¥103 an encounter at 3% of the dex and ¥0
   at 80% - because what is left to find late is the RAREST fifth of every
   table, and you almost never meet it. Making the payment bigger cannot fix a
   stream whose problem is its RATE. The first model missed this by treating
   the unmet share as a flat fraction of everything caught; sorting the table
   by weight and leaving the commons out is what showed it.

   What it does buy is worth having on its own terms: the scarce late find
   pays ¥820 instead of ¥100, so the thing that got harder got better. The
   income that actually holds up is `catchBounty`, which is renewable. */
export const DEX_BONUS = 100;
export const DEX_CLIMB = 9;
export const dexBonus = (caught, total) =>
  Math.round(DEX_BONUS * (1 + DEX_CLIMB * Math.min(1, (caught ?? 0) / (total || 1))));

/* THE OTHER THING A DUPLICATE IS WORTH.

   A spare is sold for cash OR converted to Rare Candy - the player picks at the
   point of sale, which is the whole reason candy can never become a dead
   resource: you only ever mint what you are about to spend.

   **The yield is rarity-weighted, and that is the load-bearing decision.** A
   flat rate makes the optimal play "farm the highest encounters-per-minute
   species and ignore the other seven maps" - which here is a weight-22 Pidgey
   in Tall Grass, no travel, biggest table. Weighting by tier means an hour
   anywhere pays about the same:

     C at weight 22 is 15.7% of a table -> 15.7 candy per 100 encounters
     S at weight  1 is  0.7% of a table ->  5.7 candy per 100 encounters

   2.7 : 1 rather than the 22 : 1 a flat rate would give. Commons stay the
   reliable grind; rares stay prizes. Deliberately FLATTER than `SELL`'s
   1 : 2.25 : 5.5 : 15, because cash is optional and candy is progression - if
   candy tracked cash exactly, a common catch would be worthless in both. */
export const CANDY = { C: 1, B: 2, A: 4, S: 8 };

/* A POKEMON IS WORTH WHAT ITS BASE FORM IS WORTH, and that is the rule that
   closes the exploit rather than out-tuning it.

   Found by assertion, not by thought: Caterpie evolves at Lv 7 and a wild one
   can be caught AT 7, so it evolves for nothing - and Metapod is a tier above
   it. "Evolve, then convert" was strictly better than "convert", a free
   multiplier on every catch of every line whose tier rises. Not infinite, but
   degenerate: the optimal play would have been to evolve everything you meant
   to throw away.

   Capping the yield, or raising the cheap evolution levels, both fix the
   Caterpie and leave the class open for the next generation to reopen. Reading
   through to the base form closes it structurally: evolving cannot raise the
   yield, because the yield never depended on the form.

   It is also the honest measure. Candy is a wage for CATCHING, and evolving is
   not catching - you did the work when you caught the Caterpie. Cash still
   tracks the species in your hand (`sellValue`), so a wild Venusaur is still
   worth what a Venusaur is worth; the two currencies measure different things
   on purpose. */
const BASE_OF = new Map();
for (const r of EVO_ROWS) BASE_OF.set(r.to, r.from);
const baseForm = (id) => {
  let at = id;
  for (let up = BASE_OF.get(at); up; up = BASE_OF.get(at)) at = up;
  return at;
};

export const candyValue = (sp) =>
  CANDY[speciesById(baseForm(sp?.id ?? 0))?.tier ?? sp?.tier] ?? CANDY.C;

/* Candy is also buyable, at 3x what selling the same duplicate pays. That
   ordering is the rule, not the number: buying must always be worse than
   catching, so this is the impatient option rather than the efficient one.

   No purchase cap, and that falls out rather than being decided - cash comes
   from selling duplicates, so cash-bought candy is gated by catching anyway.
   The sink is self-limiting because its input is the same input. It also puts
   candy in competition with balls for one wallet, which is a real choice. */
export const CANDY_PRICE = 120;

export function startingState() {
  return {
    money: 300,
    bag: { "poke-ball": 10, "great-ball": 0, "ultra-ball": 0, "master-ball": 0 },
    box: [],
    candy: 0,
  };
}


// ---------------------------------------------------------------- evolution

/* LEVELS ARE REAL, AND CANDY BUYS THEM.

   This replaced a feed: you used to spend N duplicates OF THE LINE, priced at
   `clamp(evolutionLevel / 2, 3, 20)`. That worked, and it walled - a Dragonite
   was 20 Dratini specifically, which at 1.2% of the Pond table is about 1,600
   encounters for one dex entry, and no amount of Pidgey helped.

   The change is exactly one thing: **duplicates became fungible.** A spare
   Zubat used to be worthless unless you wanted a Golbat; it is now one candy
   toward anything. That is what makes every ball thrown pay, which is the real
   argument for candy - the familiar "evolves at Lv 16" rule is a bonus.

   1 candy = 1 level, flat, forever. A rising curve was considered and rejected:
   it is a second table to keep in step, and the curve already EXISTS in the
   evolution levels themselves - Metapod at 7, Dragonair at 55. A flat rate over
   real levels is that curve. It is also why this scales to 1,025 species with
   nothing typed in per species: PokeAPI hands us the level. */

/* The level a row evolves at, INCLUDING the rows that have no level.

   A stone, trade or friendship evolution carries no level in PokeAPI - there is
   none to carry - and about twenty Gen 1 species evolve that way. The obvious
   fix is a table of synthetic levels per method, and the obvious fix is wrong:
   that table grows every generation and every new method needs a row in it.

   Derived from the chain instead. Kadabra evolves at 16, so Alakazam is 26. A
   Gen 5 trade-with-held-item evolution gets a sane number on the day it lands
   with nothing edited. The floor stops a stone evolution hanging off a base
   form from being free - an Eevee has no level below it at all.

   Memoised because the Box asks per row per render, and a chain walk that
   returns the same answer forever should be walked once. */
export const SYNTH_STEP = 10;
export const SYNTH_MIN = 16;

const PARENT_ROW = new Map(EVO_ROWS.map((r) => [r.to, r]));
const EVO_LEVEL = new Map();

export function evoLevel(row) {
  if (!row) return 0;
  const hit = EVO_LEVEL.get(row.to);
  if (hit !== undefined) return hit;
  let at = row.level;
  if (!at) {
    const up = PARENT_ROW.get(row.from);
    at = Math.max(SYNTH_MIN, (up ? evoLevel(up) : 0) + SYNTH_STEP);
  }
  EVO_LEVEL.set(row.to, at);
  return at;
}

export const evolutionsOf = (id) => EVO_ROWS.filter((r) => r.from === id);

export const stoneFor = (row) => (row.kind === "stone" ? row.item : null);

/* Which species a given stone is for. The shop asks this - "what is a Leaf Stone
   even for" is the question you have while looking at the price, not later. */
export const speciesNeedingStone = (id) => [
  ...new Set(EVO_ROWS.filter((r) => r.item === id).map((r) => r.from)),
];

export const evolutionRow = (from, to) =>
  EVO_ROWS.find((r) => r.from === from && r.to === to) ?? null;

/* A Pokemon no bulk action may ever take: any rare tier at all.

   One predicate, used by the sell sweep, the row sale and the feed, because
   "which ones are precious" is a single question - and two answers to it is
   exactly how a THIRD tier ships protected from one bulk action and not the
   others. It now reads `TIERS` rather than naming them: the fourth tier was
   added by writing one row in `biomes.js`, and this line did not have to be
   remembered, which is the whole reason the list exists. */
export const keeper = (mon) => !!mon && (TIERS.some((t) => mon[t]) || !!mon.alpha);

/* Which tier a box entry is, or null for an ordinary one. Rarest first, so a
   hand-edited save carrying two is described by its best - the same order
   every other panel reads. */
export const variantOf = (mon) => TIERS.find((t) => mon?.[t]) ?? null;

/* Everything the UI needs about ONE Pokemon and ONE of its evolutions.

   Per INSTANCE, not per species, and that deletes a whole class of bug with it.
   The feed had to answer "which of these six Pidgey is the one that evolves"
   (`ANY_HERO`, the hero sort, the variant-row threading) because it consumed a
   pile. Candy is spent on a `uid`, so the question cannot be asked wrong: a
   Holo levels up and a Holo comes out, with nothing to choose between.

   `need` is candy, because 1 candy = 1 level. */
export function evolveState(mon, bag, row) {
  const at = evoLevel(row);
  const stone = stoneFor(row);
  const hasStone = !stone || (bag?.[stone] ?? 0) > 0;
  const need = Math.max(0, at - (mon?.level ?? 0));
  return { at, need, stone, hasStone, ready: !!mon && need === 0 && hasStone };
}

/* The cheapest way forward for one Pokemon, for a panel that only has room to
   say one thing. Ready beats near, and near is measured in candy. */
export function evoNext(mon, bag) {
  const rows = evolutionsOf(mon?.species ?? 0);
  if (!rows.length) return null;
  const all = rows.map((row) => ({ row, ...evolveState(mon, bag, row) }));
  return all.find((st) => st.ready) ?? all.reduce((a, b) => (b.need < a.need ? b : a));
}

/* Which box entries a bulk sell may take: everything but the best of each
   species, and never a variant.

   **The reserve collapsed to one when the feed was deleted.** It used to hold
   back a whole evolution's worth of material - up to 20 - because a sweep could
   otherwise eat the Dratini you were saving. Nothing is saved for anything now:
   a spare's only jobs are cash and candy, so holding any back is holding back
   progress. `reserveFor`, `heldUids` and the Box's "dig into what an evolution
   is saving" branch all went with it.

   The best is the HIGHEST LEVEL one, which now means the one you have spent
   candy on - so a sweep can never sell your investment. */
export function duplicateUids(box) {
  const bySpecies = new Map();
  for (const mon of box) {
    if (!bySpecies.has(mon.species)) bySpecies.set(mon.species, []);
    bySpecies.get(mon.species).push(mon);
  }
  const spare = [];
  for (const mons of bySpecies.values()) {
    /* A variant is never spare, whatever its level and however many you hold.
       Held out of the list ENTIRELY rather than sorted to the front, because
       sorting only ever protects the first of them. Selling one deliberately,
       from its own row, still works.

       The one kept back is the best ORDINARY one, not the best of the species.
       Counting keepers against the reserve meant that owning a Holo Pidgey made
       your only ordinary Pidgey spare - the sweep grouped by species while the
       Box groups by species AND variant, so it offered to empty a row that the
       row itself considered full. Same rule on both sides now: every row you
       can see keeps one. */
    const rest = mons.filter((m) => !keeper(m))
      .sort((a, b) => b.level - a.level || a.uid - b.uid);
    spare.push(...rest.slice(1).map((m) => m.uid));
  }
  return spare;
}
