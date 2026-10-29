/* THE ARENA'S RULES: real-time battles (the Arena plan; phase 0 2026-10-22,
   phase 1 the same week).

   A FIXED-STEP SIMULATION AT `TPS` TICKS A SECOND. `tick(s, inputs)` moves a
   match on by one tick, in place, from the match and the two sides' inputs
   ALONE: every roll comes from `s.rs` (mulberry32), and nothing here reads a
   clock, the DOM or `Math.random`. So a seed and a list of inputs replay one
   match exactly - check.mjs does, and it is what CPU-vs-CPU balance runs and
   lockstep netcode (phase 3) stand on.

   DETERMINISTIC ON EVERY BROWSER: + - * / and Math.sqrt are exact in every
   engine; sin, cos, atan2, exp, pow and hypot are not (their last digits
   differ between V8, SpiderMonkey and JavaScriptCore), so none is used here -
   check.mjs refuses one. An aim arrives as a vector the input layer made.

   THE LEAGUE'S DAMAGE, IN REAL TIME: a hit is `battle.js`'s own formula
   (`rawDamage`: STAB, the type chart, burn halving, stat stages) times
   `DAMAGE`, so a super-effective hit means what it means in the League.
   Accuracy is aim - there are no random misses - and a match never writes a
   box entry.

   EVERY MOVE IS ONE OF EIGHT SHAPES (`shapeOf`), read off its own data plus
   short name lists for what the data cannot say (that Earthquake hits all
   around, that Hyper Beam is a beam): a shot, a beam, a melee blow, a dash, a
   pulse around the user, a field hazard, a self move, a multi-shot burst.
   A status move the shapes cannot play is left out of the kit, never faked.

   EACH ARENA IS ITS OWN GROUND (phase 2, `GROUND`), read off its floor's
   art: what lies there (water, a hot edge, tall grass, ice, falling rock),
   four blocks of cover in its own material, and two mirrored ZONES that open
   on a timer and pay whoever holds one for a second.

   Units are tiles and ticks. The court is W x H tiles inside a wall `INSET`
   deep (the arena floors' own walls). */
import { moveOf, rawDamage, CRIT, effectiveness, expected, fighter, movesAt, stageAt, neverHits, STRUGGLE, immuneTo, learnable } from "./battle.js";
import { MOVES } from "../data/moves.js";
import { TYPES } from "../data/types.js";
import { SPECIES, isForm, isEvent } from "../data/dex.js";
import { speciesById } from "./biomes.js";
import { hash } from "./daily.js";
import { PMD_IDS } from "../data/pmd.js";
import { EVOLUTIONS } from "../data/evolutions.js";
import { KITS } from "../data/kits.js";

export const TPS = 60;
export const W = 26, H = 16;                    // the floor, in tiles
export const INSET = 1.35;                      // its wall, inside which bodies stay
export const LIMIT = 5 * 60 * TPS;              // 5:00, then the clock decides
const sec = (s) => Math.round(s * TPS);

/* The floors (public/arena/<id>.webp, `npm run arenas` from art/arena/). */
// The floors live in floors.js, where the main bundle can name one without this file.
import { ARENAS } from "./floors.js";
import { LEAGUES } from "../data/leagues.js";
export { ARENAS };

/* THE GROUND, arena by arena. Tile rectangles [x0, y0, x1, y1] are measured
   on the floors themselves (art/arena/, on a tile grid): Seaside's water
   strips between the posts, the Grove's four corners of tall grass.
   `cover`: the material its four blocks are, and the types that break it
   fastest (`weak`) or barely (`resist`). `zone`: what holding a zone pays. */
export const GROUND = {
  indigo: { cover: "statue", weak: ["fighting", "ground"], zone: "ready" },
  moon: { cover: "boulder", weak: ["fighting", "water"], resist: ["rock", "steel"], zone: "dodge", rocks: true },
  seaside: { cover: "crate", weak: ["fire"], zone: "cure",
    water: [[1.2, 0, 10, 2.3], [15.5, 0, 24.8, 2.3], [1.2, 13.4, 10, 16], [15.5, 13.4, 24.8, 16]] },
  caldera: { cover: "basalt", weak: ["water", "ground"], zone: "cool", heat: 0.75, erode: true },
  grove: { cover: "tree", weak: ["fire", "ice"], zone: "heal",
    grass: [[2, 2, 5.2, 5.2], [20.8, 2, 24, 5.2], [2, 10.2, 5.2, 13.6], [20.6, 10.2, 24, 13.6]] },
  rink: { cover: "ice", weak: ["fire", "fighting"], zone: "swift", ice: true },
};
export const ZONE_SAYS = { ready: "Your slowest move ready at once", dodge: "Dash ready at once", cure: "Cures burn and poison",
  cool: "-2 s on every cooldown", heal: "Heals 6% HP", swift: "+15% speed for 10 s" };
const T = (name) => TYPES.indexOf(name);
const inRects = (rects, x, y) => (rects ?? []).some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);

const R = 0.45;                                 // a body's radius
const X0 = INSET + R, X1 = W - INSET - R, Y0 = INSET + R, Y1 = H - INSET - R;
/* THE DASH (2026-10-23, asked for: "instead of dodge, let's use dash"; the
   code keeps "dodge", as Surge is ULTI on screen): a short burst along the
   stick, quicker and longer than the 0.3 s, 2.2-tile roll it replaced, still
   untouchable for its first beat - so dashing THROUGH an attack is still a
   PERFECT. */
export const DODGE_CD = sec(1.6);
const DODGE = sec(0.2), DODGE_INV = sec(0.16), DODGE_DIST = 3.2;
export const SWAP_CD = sec(4);
const SWAP = sec(0.6), SWAP_INV = sec(0.5), KO_WAIT = sec(1);
const STUN = sec(0.12), KB = sec(0.15), FLINCH = sec(0.25);
export const SHOT_SPEED = 10 / TPS;
const SHOT_RANGE = 9, SHOT_R = 0.35;
const MELEE_RANGE = 1.75, MELEE_COS = 0.6;      // an arc of about 105 degrees (1.5 read as too small, 2026-10-23)
// 0.32 was hard to land (2026-10-23); 10 x 0.5 read as thin and short beside its drawing (2026-10-24, asked for).
export const BEAM_LEN = 13, BEAM_W = 0.85;
/* MOVES THAT TOUCH THE FOE (2026-10-24, asked for: "Vine Whip grabbing the
   Pokemon then throwing it; flamethrowers with lasting flames"). A GRAB
   lands, holds the foe GRAB_T pulled in toward its user, then hurls it
   THROW_DIST along the blow - into a wall-splat where there is a wall. A
   FLAME move's shot leaves FIRE patches along its path for FIRE_T: whoever
   of the other side stands in one is singed every FIRE_TICK and may burn. */
export const GRABS = new Set(["vine-whip", "power-whip", "circle-throw", "dragon-tail", "vital-throw", "submission"]);
const FLAMES = new Set(["flamethrower", "inferno", "fire-blast"]);
const GRAB_T = sec(0.3), THROW_DIST = 3.2, FIRE_T = sec(3), FIRE_TICK = sec(0.5), FIRE_R = 0.6, FIRE_EVERY = 6, FIRE_MAX = 24;
/* WALL-SPLAT (2026-10-24, asked for): a Pokemon knocked back into the wall
   or a block of cover - a real blow's knockback, SPLAT_PUSH or more, never a jab's or a shot's - takes SPLAT_HURT of its HP and is stunned SPLAT_STUN -
   once a knockback. Where you fight starts to matter. PERFECT BLOCK: a hit
   that lands in a shield's first PARRY_T is thrown back - its attacker takes
   PARRY_HURT of its HP and reels PARRY_STUN. */
const SPLAT_PUSH = 0.9, SPLAT_HURT = 14, SPLAT_STUN = sec(0.5), PARRY_T = sec(0.25), PARRY_HURT = 12, PARRY_STUN = sec(0.4);
/* DOUBLE TEAM MAKES COPIES THAT STAND THERE (asked for twice, 2026-10-23:
   "multiply the sprites, like Naruto's shadow clones; an illusion is gone
   when hit"): two copies at CLONE_OFF either side of the user, moving with
   it, for CLONE_T. A shot, blow, beam or blast that reaches a copy first
   pops it and is spent; a CPU may chase a copy. */
const CLONE_T = sec(8), CLONE_OFF = 1.7, CLONE_WANDER = sec(0.9), CLONE_NEAR = 1.2;
/* WIND-UPS, SHORTER (asked for, 2026-10-23: "it's hard to make it hit both
   on desktop and mobile"): every move charges WIND_K of what its power
   alone would make it. */
const WIND_K = 0.5;     // 0.7 until the second ask, same day: "delays on skills are still long"
/* NO CHARGE AT ALL (2026-10-27, asked for: "remove the charges in skills, it
   makes it really hard to aim"): a move goes QUICK ticks after the press -
   enough for its flash and its sound - and what was its wind-up is now its
   RECOVERY, the stand after it (`recOf`), so a big hit still costs a big
   moment, just never between the aim and the target. */
const QUICK = 2;
/* HOLD AND AIM (asked for: "flamethrower and hydro pump are hold-and-aim
   skills"): a beam-shaped move is a STREAM - it pours out while its button is
   held (at least STREAM_MIN, at most STREAM_MAX), sweeping after the aim at
   STREAM_TRACK a tick, and strikes along its line every STREAM_TICK for a
   share of one beam's hit: held to the end it deals a beam, let go early
   less. A tick never staggers (a stream would stun-lock), and its chances to
   burn or flinch are shared out the same way. */
export const STREAM_MAX = sec(1.2), STREAM_MIN = sec(0.3), STREAM_TICK = sec(0.15);
const STREAM_PART = 1 / Math.ceil(STREAM_MAX / STREAM_TICK), STREAM_TRACK = 0.22;
/* CONFUSION (2026-10-23, asked for): the moves the games give a chance to
   confuse (the League's data drops it - `fb`), here a dizzy CONFUSE_T in
   which its movement runs backwards and slower. */
export const CONFUSES = { confusion: 10, psybeam: 10, "signal-beam": 10, "water-pulse": 20, "dizzy-punch": 20, "rock-climb": 20,
  hurricane: 30, "strange-steam": 20, "dynamic-punch": 100 };
const CONFUSE_T = sec(2.5), CONFUSE_SLOW = 0.85;
/* SMOKE: Smokescreen leaves a cloud where its user stands, hiding whoever
   is in it as steam does (2026-10-23). */
const SMOKE = new Set(["smokescreen"]), SMOKE_T = sec(4);
/* THROWN: a rock lifted and thrown is a shot, whatever its category says
   (Rock Throw was a blow, 2026-10-23). */
const THROWN = new Set(["rock-throw", "rock-tomb", "rock-wrecker"]);
/* WEATHER, one a match (asked for, 2026-10-23), drawn from the seed - the
   same odds on every floor: a floor that leaned to its own (rain on the
   Boardwalk) would hand a type its home, which phase 2 rules out. Rain:
   Water 1.5x, Fire 0.5x and Fire types slower, everyone soaked. Sun: the
   other way round. Sand and snow: all but their own types lose a
   WEATHER_HURT-th every WEATHER_CHIP. */
export const WEATHERS = ["clear", "rain", "sun", "sand", "snow"];
const WEATHER_ODDS = [8, 3, 3, 3, 3];
const WEATHER_CHIP = sec(6), WEATHER_HURT = 40, RAIN_SLOW = 0.88;
const SAND_SAFE = ["rock", "ground", "steel"], SNOW_SAFE = ["ice"];
/* TYPE COMBOS (asked for, 2026-10-23): a Water hit on a burned Pokemon
   puts the burn out in a STEAM cloud (STEAM_T) that hides whoever stands in
   it; a Water hit soaks for WET_T, and an Electric hit on a soaked Pokemon
   lands SHOCK times as hard. */
const STEAM_T = sec(3.5), STEAM_R = 1.7, WET_T = sec(5), SHOCK = 1.5;
/* THE MATCH'S EVENTS (asked for, 2026-10-23), planned from the seed: a
   legendary flies over between FLY_FIRST and FLY_FIRST + FLY_SPAN and drops
   a Full Restore at the centre - as far from either start - FLY_DROP later;
   and, DARK_ODDS of the time, the lights go out for DARK_T, when only what
   glows is seen (the CPU loses a foe past DARK_SEE, as a player does). */
const FLY_FIRST = sec(25), FLY_SPAN = sec(30), FLY_DROP = sec(1.6), RARE_LIFE = sec(20);
const DARK_ODDS = 0.45, DARK_FIRST = sec(35), DARK_SPAN = sec(40), DARK_T = sec(14);
export const DARK_SEE = 5;
/* ULTIS (asked for, 2026-10-23: "Pikachu's ULTI calls Thunder down on the
   whole court"): a full meter still throws the foe off and powers its user
   up, and now also looses a SIGNATURE in its first type: a STORM (strikes
   on the foe and around the court), a NOVA (a blast round its user), a
   CANNON (a huge beam at the foe) or a BARRAGE (a fan of shots). Famous
   Pokemon have their own by name. Every strike shows on the ground for
   ULT_WARN and stops following its target ULT_LOCK before it lands, so it
   can be dodged. Its hits are the League's formula on a 90-power move of
   that type, scaled by the part (`k`). */
export const ULT_BASE = -100;   // an ULTI's move index is at or under it (render.js tells its shots apart)
const ULT_P = 90, ULT_WARN = sec(0.75), ULT_LOCK = sec(0.45);
export const ULT_TYPE_NAME = { electric: "Thunderstorm", fire: "Inferno", water: "Tidal Cannon", grass: "Leaf Storm", ice: "Absolute Zero",
  fighting: "Final Fist", poison: "Venom Rain", ground: "Fissure", flying: "Hurricane", psychic: "Mind Crush", bug: "Swarm",
  rock: "Rockfall", ghost: "Phantom Barrage", dragon: "Draco Cannon", dark: "Nightfall", steel: "Steel Cannon", fairy: "Starfall", normal: "Hyper Impact" };
/* MOVES THAT LEAVE THE COURT (asked for, 2026-10-23: "Fly takes the Pokemon
   out of the map, then dives into the enemy; Dig appears exactly under
   it"): its user is gone - up, under, beneath the water, into the shadows -
   for VANISH_T, where nothing can touch it, and comes back down ON the foe,
   its landing marked on the ground and following the foe until ULT_LOCK
   before it lands (an ULTI's strike), so a roll still beats it. */
export const VANISH = { fly: "air", bounce: "air", dig: "ground", dive: "water", "phantom-force": "shadow", "shadow-force": "shadow" };
const VANISH_T = sec(1.3), VANISH_R = 1.1;
/* MOVES THAT FILL THE COURT (asked for, 2026-10-23): Heat Wave, Blizzard and
   Petal Blizzard reach the foe anywhere, at WIDE_K of a hit - unless cover
   stands between, or it rolls through. */
export const WIDE = new Set(["heat-wave", "blizzard", "petal-blizzard"]);
const WIDE_K = 0.7;
/* SUDDEN DEATH (asked for, 2026-10-23): the clock out with as many Pokemon
   standing on each side, every one of them drops to 1 HP and the fight
   runs SUDDEN_T longer - the next blow wins it. Past that, HP decides. */
export const SUDDEN_T = sec(30);
const DASH = sec(0.2), DASH_DIST = 3.2;
const PULSE_R = 2.6;
const HAZARD_R = 1.1, HAZARD_T = sec(15), HAZARD_CD = sec(2), HAZARD_MAX = 3, PLACE = 5;
const ACTIVE = sec(0.1);
const BUFF_T = sec(10), STAGE_CAP = 2;
const SHIELD = sec(1);
const COVER_HALF = 0.6, COVER_HP = 160;
const COVER_AT = [[8, 5.2], [8, 10.8], [18, 5.2], [18, 10.8]];
const ZONE_R = 1.3, ZONE_HOLD = sec(1), ZONE_FIRST = sec(20), ZONE_OPEN = sec(12), ZONE_SHUT = sec(18);
const ZONE_AT = [[W / 2, INSET + 2.1], [W / 2, H - INSET - 2.1]];
const ROCKS_EVERY = sec(25), ROCKS_FIRST = sec(15), ROCK_WARN = sec(1.2), ROCK_R = 1;
const HEAT_BURN = sec(1), SWIFT = sec(10);

/* WHO FIGHTS HERE (2026-10-23, asked for: "if there are no animations for
   Gigantamax and other Megas, let's not make it usable - consistent battle
   animations"): only a Pokemon with its own PMD body - a form, and since
   2026-10-24 a species too ("still able to pick Pokemon that have no sprites
   for the Arena"): every fighter moves the same way. */
const PMD = new Set(PMD_IDS.split(",").filter(Boolean).map((h) => parseInt(h, 16)));
export const arenaReady = (id) => PMD.has(id);
/* EVOLVING IN A MATCH (2026-10-23, asked for). A Pokemon with a next stage
   fills its evolution bar (`xp`) with the share of a foe's HP it deals, a
   knockout worth a whole bar (EVO_XP), and at a full bar EVOLVES where it
   stands: EVOLVE_T untouchable and still, then the new stage's stats (its
   own, scaled by what this one's were - IVs and perks carry), its types, its
   HP share and EVO_HEAL more. A second stage can follow in the same match.
   Only into what may fight here (`arenaReady`); a branch is drawn from the
   seed. MEGA EVOLUTION is once a match a side, on the trainer's word (the
   `mega` input), for a Pokemon whose line has a Mega it is allowed (`megas`,
   which the page fills from the Pokedex; the CPU from Hard and the Fair
   format, every one). */
const EVO_ROWS = EVOLUTIONS.filter((r) => !r.look && !r.event && arenaReady(r.to));
const MEGA = new Set(["mega", "primal"]);
export const evoTargets = (id) => EVO_ROWS.filter((r) => r.from === id && !MEGA.has(r.kind) && r.kind !== "gmax").map((r) => r.to);
export const megaTargets = (id) => EVO_ROWS.filter((r) => r.from === id && MEGA.has(r.kind)).map((r) => r.to);
/* A MEGA ENTERS AS ITS BASE (2026-10-24, asked for: "consistent and less confusing"). A Box entry that
   IS a Mega fights as the Pokemon it Mega Evolves from - Mega Charizard X as Charizard - with that one
   Mega to turn into (`megas`); a plain one has none. `enteringAs` is the entry a match builds from, the
   lobby and picker show, and the Fair format takes; `megaBase` the Pokemon a Mega comes from (0: none).
   A Mega with no Arena body of its own (Mega Charizard Y) does not fight at all (your call, same day: one that
   entered and never Mega Evolved read as broken). */
export const megaBase = (id) => EVOLUTIONS.find((r) => r.to === id && MEGA.has(r.kind))?.from ?? 0;
export const enteringAs = (m) => {
  const base = megaBase(m.species);
  return base && arenaReady(base) && arenaReady(m.species) ? { ...m, species: base, mega: m.species } : m;
};
// Every Mega a Pokemon's line can reach in a match: its own, and its evolutions'.
export function lineMegas(id, seen = new Set()) {
  if (seen.has(id)) return [];
  seen.add(id);
  return [...megaTargets(id), ...evoTargets(id).flatMap((to) => lineMegas(to, seen))];
}
export const EVO_XP = 0.6;
/* MEGA EVOLUTION WARMS UP (2026-10-24, asked for: "not something immediately ready"): it unlocks this
   far into the match - off the intro, the same clock both ends of an online match count - and the
   button fills toward it like the ULTI's meter. */
export const MEGA_WARM = sec(25);
export const megaReady = (s) => s.t >= MEGA_WARM;
export const EVOLVE_T = sec(1.6);
/* EVOLVING IS A POWER SPIKE (2026-10-24, asked for: would a Charmander ever be picked?): a stage that can
   still evolve fills its bar EVO_FAST faster, and evolving heals EVO_HEAL and charges EVO_ULT of the ULTI -
   so a first stage is a ramp that rides two comebacks, not a worse Charizard. Mega Evolution is its own. */
export const EVO_HEAL = 0.3, EVO_FAST = 1.5, EVO_ULT = 0.35;
/* EACH FLOOR'S OWN EVENT (2026-10-23, asked for: "maps should have their
   unique mechanics or events"): once a match, at a time read off the seed
   (no draw, so every other roll stays where it was), announced on screen -
   and fair: whatever falls, falls mirrored or across the whole court. */
export const FLOOR_EVENT = { indigo: "roar", moon: "moonstone", seaside: "tide", caldera: "eruption", grove: "stampede", rink: "whiteout" };
export const FLOOR_SAYS = {
  roar: ["THE CROWD ROARS!", "Both ULTI meters surge"],
  moonstone: ["A MOON STONE FELL!", "Grab it: your Pokemon evolves on the spot"],
  tide: ["HIGH TIDE!", "The water rises - only Water and Flying types move freely"],
  eruption: ["ERUPTION!", "Lava bombs - watch the ground"],
  stampede: ["STAMPEDE!", "Get out of the marked lane"],
  whiteout: ["WHITEOUT!", "A blizzard hides everyone not close by"],
};
const FLOOR_FIRST = sec(30), FLOOR_SPAN = sec(25);
const ROAR_GAIN = 35, TIDE_T = sec(12), TIDE_GROW = 2.4, WHITE_T = sec(10);
export const ERUPT_T = sec(6);
const ERUPT_EVERY = sec(0.6), LAVA_WARN = sec(1), LAVA_R = 1.1;
export const LANE_WARN = sec(1.5), LANE_RUN = sec(1.2), LANE_H = 2.4;
// The court's water, risen with the tide (the renderer draws the same rectangles).
export const waterOf = (s) => (s.tide > 0
  ? (GROUND[s.arena].water ?? []).map(([a, b, c, d]) => (b <= 0 ? [a, b, c, d + TIDE_GROW] : [a, b - TIDE_GROW, c, d]))
  : GROUND[s.arena].water);
// Where a stampede's herd is: its front, running the lane's length.
export const herdAt = (l) => (l.dir > 0 ? -1 + (1 - l.t / LANE_RUN) * (W + 2) : W + 1 - (1 - l.t / LANE_RUN) * (W + 2));

/* POWER-UPS ON THE FLOOR (asked for, 2026-10-23: "power ups on the maps,
   usable objects"). Every PICK_EVERY a MIRRORED PAIR of one kind appears -
   one on each half, point for point - so no side is nearer one by the
   draw. Touched, a Potion, a Full Heal or a Shiny Stone works at once; an X
   item is HELD (one a side, `sd.held`) until its player USES it - the
   decision is when. Uncollected, a pair fades after PICK_LIFE. */
export const PICKUPS = {
  potion: { held: false, name: "Potion", says: "Heals 20% HP" },
  "full-heal": { held: false, name: "Full Heal", says: "Cures a status and any lowered stat" },
  "shiny-stone": { held: false, name: "Shiny Stone", says: "+40% Surge" },
  "x-attack": { held: true, name: "X Attack", says: "Use it: hits 30% harder for 8 s" },
  "x-speed": { held: true, name: "X Speed", says: "Use it: faster, and cooldowns run quicker, for 8 s" },
  "x-defense": { held: true, name: "X Defense", says: "Use it: a shield for 1.5 s" },
  "poke-ball": { held: false, name: "Poke Ball", says: "Releases a helper Pokemon on your side" },
  // The flyover's drop alone (`stepEvents`), never one of a pair.
  "full-restore": { held: false, rare: true, name: "Full Restore", says: "Heals half, cures any status, +50% ULTI" },
  /* THE REVIVE (2026-10-24, asked for: "a revive mid-game, reviving a random downed teammate"): once a
     match, from REVIVE_AT and only once somebody has fainted, the pair a PICK_EVERY lays is Revives -
     still mirrored, so neither side is nearer. Touched, it brings a random fainted teammate back to the
     bench at REVIVE_HP; a side with nobody down walks over it. */
  revive: { held: false, rare: true, name: "Revive", says: "Brings a fainted teammate back at half HP" },
  // Mt. Moon's floor event alone.
  "moon-stone": { held: false, rare: true, name: "Moon Stone", says: "Evolves your Pokemon on the spot - or fills its ULTI" },
};
const PICK_KINDS = Object.keys(PICKUPS).filter((k) => !PICKUPS[k].rare);
/* THE POKE BALL (2026-10-23, asked for - Smash Bros.' item): touched, it
   releases a HELPER for its trainer, drawn from the seed. Electrode flashes
   and explodes where it stands; Snorlax falls on the foe (it stops following
   HELPER_LOCK before it lands, so a dash beats it); Chansey's Soft-Boiled
   heals its trainer; Jigglypuff sings a foe near it to sleep. Each takes
   `t` to act - the picture's warning. */
export const HELPERS = {
  electrode: { id: 101, t: sec(1.2), r: 2.4 },
  snorlax: { id: 143, t: sec(0.9), r: 1.5 },
  chansey: { id: 113, t: sec(0.8) },
  jigglypuff: { id: 39, t: sec(1.4), r: 4 },
  /* SUPPORT (2026-10-24, asked for: "Pokemon that follow you for a while,
     mini healings, buffs, or target the enemy"): each FOLLOWS its trainer's
     Pokemon for FOLLOW_T. Audino's Heal Pulse heals a little every `every`;
     Plusle's Helping Hand makes its trainer hit HELP_HIT harder; Mr. Mime's
     Light Screen takes SCREEN_K off what its trainer is dealt; Magnemite
     Thunder Shocks the foe every `every`, wherever it stands. */
  audino: { id: 531, t: sec(8), follow: true, every: sec(1.5), name: "Heal Pulse" },
  plusle: { id: 311, t: sec(8), follow: true, name: "Helping Hand" },
  "mr-mime": { id: 122, t: sec(8), follow: true, name: "Light Screen" },
  magnemite: { id: 81, t: sec(8), follow: true, every: sec(1.2), name: "Thunder Shock" },
};
const HELPER_KINDS = Object.keys(HELPERS), HELPER_LOCK = sec(0.3), HELPER_HEAL = 0.25;
const PULSE_HEAL = 0.03, HELP_HIT = 1.25, SCREEN_K = 0.7, SHOCK_HURT = 40;
// A follower's place: beside its trainer, a little behind.
const SIDE_AT = { audino: [-0.9, 0.5], plusle: [0.9, 0.5], "mr-mime": [-0.9, -0.5], magnemite: [0.9, -0.6] };
// A follower helping this side in this way, now.
const helping = (s, side, kind) => s.helpers.some((h) => h.side === side && h.kind === kind);
const PICK_FIRST = sec(10), PICK_EVERY = sec(16), PICK_LIFE = sec(14), PICK_R = 0.5;
export const REVIVE_AT = sec(35), REVIVE_HP = 0.5;
const downed = (sd) => sd.team.filter((f) => f.hp <= 0);
const X_TIME = sec(8), X_ATTACK = 1.3, X_GUARD = sec(1.5);
/* WHAT ONE HIT IS WORTH, against the plan's 30-45 s a Pokemon. Measured
   2026-10-22 over 40 Hard-vs-Hard CPU matches at Lv 50: 0.32 was 54 s a
   Pokemon and nearly every match ran out the clock; 0.75 was 27 s; 0.6 is
   33 s. Re-measured with phase 1's shapes and statuses (check.mjs). The
   basic attack (2026-10-22) took a third of the damage and the CPU in to
   its reach: a Hard-vs-Hard 3v3 fell from 83 s to 45 s at 0.6, so 0.4 -
   76 s, Normal over Easy 31 of 40, as it was. Wind-ups 30% shorter and
   the ULTIs' signatures (2026-10-23) brought it to 38 s; 0.3 with the ULTI
   parts below is 76 s again, an ULTI ~14% of the damage dealt. Shorter
   wind-ups and cooldowns (2026-10-23, asked for again) made it 53 s; 0.23 is
   77 s, and brawler teams still win ~42% against blasters. NO CHARGE
   (2026-10-27) took every wind-up, and with it every chance to dodge or
   read a blow: Hard v Hard fell to 40 s, a Pokemon to 10 s on court, and a
   type-advantaged team won 79% (96% before) - reported as "my Pokemon is
   dead though it has the same level and type advantage". 0.16 with the
   Surge and hit-cap changes below is 57 s, 16 s and ~90%.
   ARENA HP (2026-10-23, reported: "my basic attack became just 3 or 4"): a
   body's HP is its stat times HP_K and every hit DAMAGE_K of that larger
   scale - the same fight, ten times the numbers, so a hit reads as a hit
   and `floor` no longer eats most of a small one (a basic jab was 1). */
export const HP_K = 10;
const DAMAGE_K = 0.16;
export const DAMAGE = DAMAGE_K * HP_K;
/* THE OPENING: the count before a fight, in which nobody moves. It is
   ticks of the match - both ends of an online fight count the same ones -
   off the match clock, and 0 for every test that drives a match. */
export const INTRO = sec(3.2);
/* SURGE, the Arena's twist: a meter a side, filled by landing hits, taking
   them, a PERFECT DODGE (rolling through an attack) and a zone. Full, one
   press: a shockwave that throws the foe off you and breaks a stagger, then
   SURGE_T of blows at SURGE_DMG with cooldowns recovering half as fast
   again. The meter rides across a switch; the surge ends with the Pokemon.
   Both sides have it, so the per-arena fairness suites hold it fair. With
   the meter filling on a knockout's worth of trading and cooldowns doubled,
   it carried 44% of all damage (2026-10-27): the sudden deaths. Now 1.15x,
   1.5x the recovery and slower gains (GAIN_DEAL, GAIN_TAKE): about 30%. */
export const SURGE_MAX = 100;
export const SURGE_T = sec(6);
const SURGE_DMG = 1.15, SURGE_PUSH = 2.6;
/* THERE IS NO PP (2026-10-23, asked for): a move is limited by its cooldown
   alone. PP ran out mid-match, and Struggle and a CPU benching a spent
   Pokemon existed only to stop the stalemate that made (13 of 40 Hard
   matches to the clock, 2026-10-22). A move by its act's index: the kit's,
   or the basic attack's. */
export const moveAt = (f, k) => (k === BASIC_K ? f.basic : f.kit[k]);

/* THE BASIC ATTACK (asked for, 2026-10-22: "a normal attack that users can
   spam while waiting for the skills"): always there, no PP, HELD to repeat.
   A fighter whose Attack is the higher jabs - a blow in reach - and one
   whose Sp. Atk is throws a bolt. It is its user's FIRST TYPE (2026-10-23,
   asked for: typeless, a type advantage meant nothing to it), STAB and all,
   so a Water type's jab douses a Fire type. Every third in a row (each within BASIC_CHAIN of the last)
   lands harder: the rhythm a held button wants. A filler between moves,
   never a strategy - check.mjs holds what it deals to a sliver of a kit's. */
export const BASIC_K = 5;
export const BASIC_P = -2, BASIC_S = -3;
const BASIC = {
  // 15 until 2026-10-24 ("add a bit more damage in basic attacks").
  [BASIC_P]: { n: "basic-attack", t: null, c: 0, p: 18, pp: 1 },
  [BASIC_S]: { n: "basic-shot", t: null, c: 1, p: 18, pp: 1 },
};
export const arenaMove = (i) => BASIC[i] ?? (i <= ULT_BASE ? ultMove(i) : moveOf(i));
// An ULTI's hit: a 90-power move of its user's first type, physical or special by the higher attack.
const ULTS = new Map();
function ultMove(i) {
  if (!ULTS.has(i)) { const k = ULT_BASE - i; ULTS.set(i, { n: "ulti", t: TYPES[k >> 1] ?? "normal", c: k & 1, p: ULT_P, pp: 1 }); }
  return ULTS.get(i);
}
export const isUlt = (i) => i <= ULT_BASE;
export const BASIC_CD = sec(0.42);
// BASIC_RANGE 4.5 until 2026-10-23 ("long range basic shots seem too short").
const BASIC_WIND = sec(0.1), BASIC_REC = sec(0.08), BASIC_RANGE = 6.5, BASIC_CHAIN = sec(1.2), BASIC_BOOST = 1.6;
export const basicShape = (f) => (f.basic.i === BASIC_P ? "melee" : "shot");
/* ROLES (asked for, 2026-10-23: "they all feel long ranged and slow to
   attack - melee and ranged Pokemon, with perks for each"). By the higher
   attack stat, as the basic attack already is: a BRAWLER (Attack) runs
   BRAWL_RUN faster, jabs on BRAWL_CD of the cooldown, hits BRAWL_HIT harder
   with every blow and dash, and takes BRAWL_GUARD of a shot's damage - built
   to close the gap; a BLASTER (Sp. Atk) fires shots BLAST_SPEED faster and
   BLAST_RANGE farther, and its streams reach BLAST_RANGE farther too -
   built to keep it. Measured over 100 Hard matches of one role's team
   against the other's: with no perks brawlers won 18 (range was simply
   better); these 48, a 3v3 still ~74 s. The basic bolt's longer reach
   (2026-10-23) took it to 9 of 40 again, and BRAWL_GUARD 0.72 -> 0.6 back to
   16; moves priced by their worth (2026-10-24) left 13, and 0.55 is 16.
   FIXED KITS (2026-10-27) handed brawlers their lines' dashes and melee
   finishers, and they won 33 of 40: BRAWL_HIT 1.3 -> 1 (the kit is the
   punch now) and BRAWL_GUARD 0.55 -> 0.85 is 20 of 40 (43 of 80). */
// A fighter outside a match (the lobby, the tutor) has no `basic` yet: its stats answer the same.
export const roleOf = (f) => ((f.basic?.i ?? basicOf(f)) === BASIC_P ? "brawler" : "blaster");
export const BRAWL_RUN = 1.2, BRAWL_CD = 0.65, BRAWL_HIT = 1, BRAWL_GUARD = 0.85;
export const BLAST_SPEED = 1.15, BLAST_RANGE = 1.1;
export const basicCd = (f) => (roleOf(f) === "brawler" ? Math.round(BASIC_CD * BRAWL_CD) : BASIC_CD);
/* A SPECIES' ROLE (2026-10-24, reported: "Jirachi is a Brawler - it should be a Blaster"). It was the
   fighter's own Attack against its Sp. Atk, IVs and all, so a species whose two are level (Jirachi's
   100 and 100) came out either way by a point of IV. Now it is the SPECIES': a clear lean in its base
   stats (`ROLE_LEAN`, 15%) decides; closer than that, its ULTI's move does - the signature it is known
   by - and a support ULTI leaves it to the power of what it learns. Jirachi's Doom Desire: a Blaster.
   The jab, the bolt and the ULTI's stat all follow the role. */
const ROLE_LEAN = 1.15;
const ROLES = new Map();
export function speciesRole(id) {
  if (ROLES.has(id)) return ROLES.get(id);
  const st = speciesById(id)?.stats ?? [0, 1, 0, 1, 0, 0];
  let role;
  if (st[1] >= st[3] * ROLE_LEAN) role = "brawler";
  else if (st[3] >= st[1] * ROLE_LEAN) role = "blaster";
  else {
    // Its ULTI's move - its signature, the move it is known by (Hydro Cannon, Aura Sphere, Doom Desire)
    // - decides; a support ULTI leaves it to what it learns, a move of its own type counting double.
    // A line keeps one role where it is close: an earlier stage takes its evolution's (Squirtle, Blastoise's).
    // The four named ULTIs no move entry holds - Frenzy Plant, Blast Burn, Hydro Cannon, Shadow Storm - are special.
    const u = ultiPick(id), ult = MOVES[u.move], next = evoTargets(id);
    if (next.length) role = speciesRole(next[0]);
    else if (u.move < 0 && u.why === "named") role = "blaster";
    else if (ult?.p > 1 && ult.c < 2) role = ult.c === 0 ? "brawler" : "blaster";
    else {
      let phys = 0, spec = 0;
      const types = speciesById(id)?.types ?? [];
      for (const i of learnable(id, 100, true)) {
        const m = MOVES[i];
        if (!(m.p > 1)) continue;
        if (m.c === 0) phys += m.p * (types.includes(m.t) ? 2 : 1); else if (m.c === 1) spec += m.p * (types.includes(m.t) ? 2 : 1);
      }
      role = spec > phys ? "blaster" : phys > spec ? "brawler" : st[1] >= st[3] ? "brawler" : "blaster";
    }
  }
  ROLES.set(id, role);
  return role;
}
// Which a fighter has: the jab for a Brawler, the bolt for a Blaster.
export const basicOf = (f) => (speciesRole(f.id) === "brawler" ? BASIC_P : BASIC_S);
/* THE FINAL MINUTE: the clock's last FINAL_T hits harder and fills Surge
   twice as fast, announced on screen - a long fight ends on a swing, not a
   tally of HP. */
export const FINAL_T = sec(60);
const FINAL_DMG = 1.5, FINAL_GAIN = 2;
const finalMinute = (s) => s.t >= LIMIT - FINAL_T;
/* THE RING (2026-10-28, asked for: "a match never ends in a slow chase"):
   the clock's last RING_T closes the court to RING_KEEP of its span, and
   whoever stands outside it loses RING_HURT of its HP a second. It stays
   closed through sudden death. `ringOf` is [x0, y0, x1, y1], or null while
   open. */
export const RING_T = sec(30), RING_KEEP = 0.45, RING_HURT = 0.05;
export function ringOf(s) {
  const k = clamp((s.t - (LIMIT - RING_T)) / RING_T, 0, 1);
  if (k <= 0) return null;
  const ix = (X1 - X0) * (1 - RING_KEEP) / 2 * k, iy = (Y1 - Y0) * (1 - RING_KEEP) / 2 * k;
  return [X0 + ix, Y0 + iy, X1 - ix, Y1 - iy];
}
const outsideRing = (r, f) => f.x < r[0] || f.x > r[2] || f.y < r[1] || f.y > r[3];
/* TAG-IN (same day, asked for: "switching becomes a play, not an escape"):
   a switch pressed within TAG_WIN of taking a hit is a TAG - the one coming
   in arrives with its basic attack on the foe at TAG_HIT, wherever the foe
   stands within TAG_RANGE, staggering it TAG_STUN - the pressure broken.
   SWAP_CD still paces it. */
export const TAG_WIN = sec(0.6), TAG_HIT = 2.5, TAG_RANGE = 7, TAG_STUN = sec(0.6);
const GAIN_DEAL = 45, GAIN_TAKE = 30, GAIN_DODGE = 12, GAIN_ZONE = 15;
/* NO ONE BLOW TAKES MORE THAN HIT_CAP OF A BODY (2026-10-27): every move is
   instant now, so a stacked hit (STAB, super effective, a crit, the weather,
   Surge, an X Attack) could not be seen coming - High Jump Kick took 89%.
   An ULTI is exempt: it is telegraphed, and a dash beats it. */
const HIT_CAP = 0.3;

// ------------------------------------------------------------------ shapes

const PULSE = new Set(["earthquake", "magnitude", "bulldoze", "surf", "discharge", "lava-plume", "boomburst",
  "sludge-wave", "explosion", "self-destruct", "petal-blizzard", "heat-wave", "icy-wind", "snarl", "hyper-voice",
  "blizzard", "rock-slide", "muddy-water", "eruption", "water-spout", "dazzling-gleam", "parabolic-charge",
  "mind-blown", "misty-explosion", "precipice-blades", "struggle-bug", "electroweb", "breaking-swipe",
  "disarming-voice", "echoed-voice", "fiery-wrath", "glacial-lance", "astral-barrage", "springtide-storm",
  "bleakwind-storm", "wildbolt-storm", "sandsear-storm", "make-it-rain", "thousand-arrows", "thousand-waves",
  "synchronoise", "uproar", "air-cutter", "razor-wind", "twister", "powder-snow", "bug-buzz", "dragon-energy"]);
const DASH_NAMES = new Set(["tackle", "take-down", "body-slam", "headbutt", "zen-headbutt", "iron-head", "horn-attack",
  "giga-impact", "rollout", "rapid-spin", "u-turn", "flip-turn", "dragon-rush", "skull-bash", "submission",
  "high-horsepower", "spin-out", "steel-roller", "dive", "fly", "bounce", "horn-drill", "megahorn", "smart-strike",
  "aerial-ace", "wing-attack", "drill-run", "play-rough", "seismic-toss"]);
const BEAM_NAMES = new Set(["hydro-pump", "flamethrower", "eternabeam", "dynamax-cannon", "prismatic-laser", "origin-pulse",
  "dark-pulse", "dragon-pulse", "blast-burn", "frenzy-plant", "hydro-cannon", "seed-flare", "luster-purge",
  "mist-ball", "doom-desire", "psystrike", "steel-beam", "meteor-beam", "fleur-cannon", "core-enforcer"]);
const BEAM_RE = /(beam|cannon|laser)$/;
const FIELD_NAMES = new Set(["spikes", "toxic-spikes", "stealth-rock", "sticky-web"]);
export const SHIELDS = new Set(["protect", "detect", "kings-shield", "spiky-shield", "baneful-bunker", "obstruct",
  "silk-trap", "burning-bulwark", "max-guard", "endure"]);

/* A MOVE'S SHAPE, or null for a status move the Arena cannot play. */
export function shapeOf(m) {
  if (!m) return null;
  if (m.n === "struggle") return "melee";
  if (FIELD_NAMES.has(m.n)) return "field";
  if (m.c === 2) {
    if (SHIELDS.has(m.n) || m.n === "rest") return "self";
    // Accuracy means nothing where aim is the accuracy: Sand Attack and Kinesis would do nothing (2026-10-24).
    if (m.sg && m.sg.every(([st]) => st === 6) && !SMOKE.has(m.n)) return null;
    if (m.self && (m.sg || m.h)) return "self";
    if (!m.self && m.st != null) return "shot";            // a status shot: Thunder Wave, Will-O-Wisp
    if (!m.self && m.sg) return "pulse";                  // a stat drop around you: Growl, Screech
    return null;
  }
  // A power of 1 is a placeholder for a rule the Arena does not play (Ruination, Comeuppance): no damage, so no move.
  if (!m.p || m.p <= 1) return null;
  if (PULSE.has(m.n)) return "pulse";
  if (THROWN.has(m.n)) return "shot";
  if (m.hits) return "multi";
  if (m.c === 1 && (BEAM_NAMES.has(m.n) || (BEAM_RE.test(m.n) && m.n !== "charge-beam"))) return "beam";
  if (m.c === 0 && ((m.pr ?? 0) > 0 || (m.dr ?? 0) < 0 || DASH_NAMES.has(m.n))) return "dash";
  return m.c === 1 ? "shot" : "melee";
}
export const SHAPES = ["shot", "beam", "melee", "dash", "pulse", "field", "self", "multi"];

// A move's timing, from its own data: big hits are slow and readable.
export const windOf = (m) => {
  const s = shapeOf(m);
  return s === "self" || s === "field" ? sec(0.12) : QUICK;
};
// The stand after a move: what its wind-up was, halved - big hits are still slow to follow up.
const recOf = (m) => Math.max(1, Math.round(Math.max(sec(0.08), Math.round((sec(0.18 + 0.004 * (m.p ?? 0)) - sec(0.12) * (m.pr ?? 0)) * WIND_K)) / 2));
/* A MOVE'S WAIT IS WHAT IT IS WORTH (2026-10-24, reported: "some healing
   moves are OP - CDs should depend on the skill"). Power alone was the wait:
   a drain move's heal came free (Leech Life, Drain Punch and Horn Leech were
   the three best moves in the game), a multi-hit move waited on ONE hit's
   power (Bullet Seed out-damaged Hyper Beam), a move that raised its user's
   stats paid nothing for them (Power-Up Punch, 40 power, beat every 120),
   and Recover and Swords Dance came back (9 s) before their effect was gone
   - a boost lasts BUFF_T, so it never wore off, and Recover out-healed what
   a shot deals. Now a damaging move waits on its VALUE (`valueOf`): its
   power times its hits and its crits (Wicked Blow always lands one), plus
   what it drains, plus STAGE_UP for each stage it raises its user (at its
   chance) and less STAGE_DOWN for each it lowers. Recoil buys nothing back:
   Brave Bird already hit as hard as any 120 (reported as too strong). A
   boost waits SELF_CD, past its BUFF_T; a heal HEAL_CD - at 14 s Recover's
   half was 3.6% a second, near a whole attacker's damage. */
const STAGE_UP = 25, STAGE_DOWN = 10, SELF_CD = sec(14), HEAL_CD = sec(18);
export const valueOf = (m) => {
  const hits = m.hits ? (m.hits[0] + m.hits[1]) / 2 : 1;
  let v = (m.p ?? 0) * hits * (1 + 0.5 * CRIT[Math.min(3, m.cr ?? 0)]) * (1 + Math.max(0, m.dr ?? 0) / 100);
  // A raise of the stat it hits with makes every later hit half again as hard (Fiery Dance was 1.18x a Fire Blast): half its power.
  const at = m.c === 1 ? 3 : 1, chance = (m.sgc ?? 100) / 100;
  if (m.sgu && m.sg) v += m.sg.reduce((n, [st, k]) => n + (k > 0 ? (st === at ? (m.p ?? 0) * 0.5 * Math.min(1, 2 * chance) : k * STAGE_UP * chance) : k * STAGE_DOWN * chance), 0);
  return Math.max(20, v);
};
export const cooldownOf = (m) => {
  if (m.c === 2) return SHIELDS.has(m.n) ? sec(7) : m.n === "rest" ? sec(20) : m.st === 3 ? sec(15) : m.h ? HEAL_CD : m.self ? SELF_CD : sec(9);
  // 0.8 + p/35, then 0.6 + p/45 ("still long"), then 0.9 + p/40 with PP gone; now of the move's worth: Fire Blast 3.65 s.
  return sec(0.9 + valueOf(m) / 40);
};
const multiCount = (m) => (m.hits ? Math.round((m.hits[0] + m.hits[1]) / 2) : 1);

// ------------------------------------------------------------------ fighters

/* A FIGHTER'S KIT: its four League moves (`movesOf`/the Move Tutor) that the
   Arena can play. A kit that would not hit at all keeps Struggle beside them
   (a status-only kit), thrown like any move. */
/* A FIXED KIT (docs/arena-kits.md, 2026-10-27, asked for: "consistent move
   sets, easier to learn and master"): every Pokemon fights with its line's
   four from tools/build_kits.mjs - Main (RMB), Move (Q), Control (E), Power
   (R) - whatever it knows in the League, so two players' Pikachu are one
   Pikachu. Only a test's fighter that names its own moves (`custom`) plays
   those instead. */
const KIT_AT = new Map(MOVES.map((m, i) => [m.n, i]));
export const SLOT_NAMES = ["Main", "Move", "Control", "Power"];
export const fixedKit = (id) => (KITS[id] ?? []).slice(0, 4).map((n) => (n == null ? -1 : KIT_AT.get(n) ?? -1));
export const kitClass = (id) => KITS[id]?.[4] ?? null;
/* THE KIT'S COMBO (2026-10-28, asked for: "turns skill into a reward"): its
   Control move landing opens COMBO_WIN; its payoff - Power where Power hits,
   else Main (`payoffSlot`, which Kit.jsx prints) - landing inside it hits
   COMBO_DMG harder and stuns COMBO_STUN. A Control that touches nobody (a
   setup, a hazard) opens it as it is cast. */
export const COMBO_WIN = sec(3), COMBO_DMG = 1.3, COMBO_STUN = sec(0.5);
export const payoffSlot = (kit) => (kit[3] >= 0 && arenaMove(kit[3]).p > 0 ? 3 : 0);
const CONTROL = 2;
function openCombo(s, f) {
  if (f.comboT <= s.t) s.ev.push({ k: "comboOpen", side: f.side, x: f.x, y: f.y });
  f.comboT = s.t + COMBO_WIN;
}
export function kitOf(f) {
  if (!f.custom && KITS[f.id]) {
    const kit = fixedKit(f.id).filter((i) => i >= 0 && shapeOf(arenaMove(i))).map((i) => ({ i, cd: 0 }));
    if (!kit.some((m) => arenaMove(m.i).p > 0)) { if (kit.length === 4) kit.pop(); kit.push({ i: STRUGGLE, cd: 0 }); }
    return kit;
  }
  /* ITS ULTI'S MOVE IS NEVER ALSO ONE OF ITS FOUR (2026-10-24, reported: Machamp's fourth button and its
     ULTI were both Dynamic Punch). The slot it leaves goes to the newest other move it has learned by its
     level that the Arena plays - a kit stays four where the learnset allows. */
  const ult = ultiPick(f.id).move;
  const kit = f.moves.filter((m) => m.i !== STRUGGLE && m.i !== ult && shapeOf(arenaMove(m.i))).slice(0, 4)
    .map((m) => ({ i: m.i, cd: 0 }));
  if (ult >= 0 && kit.length < 4 && f.moves.some((m) => m.i === ult)) {
    const more = learnable(f.id, f.level ?? 100).reverse()
      .find((i) => i !== ult && i !== STRUGGLE && !kit.some((m) => m.i === i) && arenaMove(i).p > 1 && shapeOf(arenaMove(i)));
    if (more != null) kit.push({ i: more, cd: 0 });
  }
  if (!kit.some((m) => arenaMove(m.i).p > 0)) {
    if (kit.length === 4) kit.pop();
    kit.push({ i: STRUGGLE, cd: 0 });
  }
  return kit;
}

function rnd(s) {
  s.rs = (s.rs + 0x6D2B79F5) | 0;
  let t = s.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const norm = (x, y) => { const l = Math.sqrt(x * x + y * y); return l ? [x / l, y / l] : [0, 0]; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const STAGE = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
// A small turn, without trig: rotate by about `k` radians (exact enough for a spread).
const turn = (x, y, k) => norm(x - y * k, y + x * k);

/* A CARD'S PERKS (game/cardperks.js `teamPerks`), one object a Pokemon: plain numbers and flags, so
   this file never reads a card. None for the CPU, online or a test. */
const NO_CP = Object.freeze({ dmg: 0, regen: 0, cd: 0, guard: 0, ult: 0, status: 0, sig: [] });
/* Small on purpose (2026-10-24, asked for: "not game breaking - just the chase cards a bit better"):
   the golden rules' numbers, and every chase card's SIGNATURE (cardperks.js says each in words). */
const AEGIS_T = sec(1), SPRING_K = 0.15, SHADE_START = 0.25, VENOM_P = 1 / 12, FLAME_P = 0.25, SPARK_K = 0.75;
export const hasSig = (f, k) => (f.cp?.sig ?? []).includes(k);
// A signature's hand on the damage of one hit, attacker and defender.
function sigK(s, a, d, m, move, contact) {
  const fallen = s.sides[a.side].team.filter((x) => x.hp <= 0).length;
  return (isUlt(move) && hasSig(a, "vflare") ? 1.5 : 1) * (a.megaOn && hasSig(a, "aura") ? 1.1 : 1)
    * ((m.t === "fire" || m.t === "dragon") && hasSig(a, "blueflame") ? 1.15 : 1) * (shapeOf(m) === "beam" && hasSig(a, "psydrive") ? 1.15 : 1) * (!contact && hasSig(a, "shuriken") ? 1.15 : 1)
    * (hasSig(a, "rage") ? 1 + 0.03 * Math.floor((1 - a.hp / a.max) * 10) : 1)
    * (hasSig(a, "protean") && !BASIC[move] && !isUlt(move) && !a.types.some((t) => TYPES[t] === m.t) ? 1.5 : 1)
    * (hasSig(a, "lost") ? 1.25 : 1) * (hasSig(a, "fury") ? 1 + 0.08 * fallen : 1) * (!contact && hasSig(d, "shell") ? 0.8 : 1);
}
function body(f, side, slot, cp = NO_CP) {
  return {
    cp,
    ...f, hp: f.hp * HP_K, max: f.max * HP_K, side, slot, kit: kitOf(f), stages: [...f.stages], stageT: [0, 0, 0, 0, 0, 0, 0, 0],
    x: side ? X1 - 2.5 : X0 + 2.5, y: H / 2, px: 0, py: 0, fx: side ? -1 : 1, fy: 0, moving: false,
    act: null, dodge: 0, dx: 0, dy: 0, dodgeCd: 0, inv: 0, shield: 0, stun: 0, kbx: 0, kby: 0, kbt: 0, flash: 0,
    status: -1, statusT: 0, statusN: 0, badly: false, sleptAt: 0,
    vx: 0, vy: 0, heat: 0, swift: 0, hidden: false, surge: 0, power: 0, haste: 0, clones: [], cloneT: 0, wet: 0, rained: false, away: null, confused: 0,
    basic: { i: basicOf(f), cd: 0 }, basicN: 0, basicT: -BASIC_CHAIN,
    xp: 0, evo: 0, evoTo: 0, megaOn: false, megas: f.megas ?? [], fortress: 0, regen: 0, awake: 0,
    comboT: 0, hitAt: -sec(9), tag: false,
  };
}

/* A MATCH. `teams`: two lists of League fighters (`playerFighter` for yours,
   `fighter` for the CPU's). `cpu`: per side, null for a person or a CPU's
   level (`LEVELS`, or "dummy"). `arena`: a GROUND id, its cover and zones. */
export function newMatch({ teams, cpu = [null, "normal"], seed = 1, arena = "indigo", intro = 0, weather = null, events = true, perks = [null, null] }) {
  const g = GROUND[arena] ? arena : "indigo";
  const s = {
    t: 0, intro, rs: seed | 0, over: false, winner: -1, why: "", ev: [], shots: [], hazards: [], nextId: 1,
    arena: g, drops: [], items: [], helpers: [], strikes: [], clouds: [], dark: 0, white: false, tide: 0, erupt: 0, lanes: [], domes: [], domain: null, perish: 0, throws: [], fires: [],
    cover: COVER_AT.map(([x, y], i) => ({ id: i, x, y, hp: COVER_HP, max: COVER_HP })),
    zone: { open: false, t: ZONE_FIRST, claimed: [false, false], hold: [[0, 0], [0, 0]] },
    sides: teams.map((team, side) => ({
      team: team.map((f, slot) => body(f, side, slot, perks?.[side]?.[slot] ?? NO_CP)), active: 0, swapT: 0, next: -1, swapCd: 0, tag: false, koT: 0, meter: 0, held: null, megaUsed: false, trapT: 0,
      // What the result screen tells (never read by the rules): damage dealt, hits, the best run of hits unanswered, perfect dodges, surges.
      stats: { dealt: 0, hits: 0, chain: 0, best: 0, perfect: 0, surges: 0 },
      cpu: cpu[side] ? { level: cpu[side], seen: 0, seenId: 0, strafe: 1, dodged: 0, lx: W / 2, ly: H / 2 } : null,
    })),
  };
  for (const side of s.sides) for (const f of side.team) { f.px = f.x; f.py = f.y; }
  // Golden Shade: the ULTI starts part-charged; Golden Aegis: the lead comes out untouchable.
  for (const sd of s.sides) {
    if (sd.team.some((f) => f.cp.shade)) sd.meter = Math.round(SURGE_MAX * SHADE_START);
    if (sd.team.some((f) => hasSig(f, "starraid"))) sd.meter = SURGE_MAX;
    if (sd.team[0]?.cp.aegis) sd.team[0].inv = AEGIS_T;
    for (const f of sd.team) f.fresh = true;
  }
  // The weather and the match's two events, drawn now so a seed replays them.
  const roll = rnd(s) * WEATHER_ODDS.reduce((n, x) => n + x, 0);
  let acc = 0;
  s.weather = weather ?? WEATHERS.find((w, k) => (acc += WEATHER_ODDS[k]) > roll) ?? "clear";
  const fly = FLY_FIRST + Math.floor(rnd(s) * FLY_SPAN), dir = rnd(s) < 0.5 ? 1 : -1;
  const dark = rnd(s) < DARK_ODDS ? DARK_FIRST + Math.floor(rnd(s) * DARK_SPAN) : -1;
  const floor = FLOOR_FIRST + (Math.imul(seed | 0, 2654435761) >>> 0) % FLOOR_SPAN;
  s.plan = events ? { fly, dir, dark, floor } : { fly: -1, dir, dark: -1, floor: -1 };
  // Drought (Groudon's chase card): the sun is out from the start.
  if (s.sides.some((sd) => sd.team.some((f) => hasSig(f, "drought")))) s.weather = "sun";
  return s;
}
// Where Double Team's copies stand: beside their user, inside the court.
export const clonesOf = (f) => f.clones.map(([ox, oy]) => [clamp(f.x + ox, X0, X1), clamp(f.y + oy, Y0, Y1)]);
function popClone(s, f, k) {
  const [x, y] = clonesOf(f)[k];
  f.clones.splice(k, 1);
  s.ev.push({ k: "decoy", side: f.side, x, y });
}

export const activeOf = (s, side) => {
  const sd = s.sides[side];
  return sd.swapT > 0 || sd.koT > 0 ? null : sd.team[sd.active];
};
const alive = (sd) => sd.team.filter((f) => f.hp > 0);
export const PAR = 0, BRN = 1, PSN = 2, SLP = 3, FRZ = 4;
const held = (f) => f.stun > 0 || f.status === SLP || f.status === FRZ || Boolean(f.away);

export const NO_INPUT = Object.freeze({ mx: 0, my: 0, ax: 0, ay: 0, fire: -1, hold: -1, basic: false, dodge: false, swap: -1, surge: false, use: false, mega: false });

export function tick(s, inputs) {
  if (s.over) return s;
  s.ev = [];
  if (s.intro > 0) {
    if (--s.intro === 0) s.ev.push({ k: "go" });
    return s;
  }
  for (let side = 0; side < 2; side++) {
    const sd = s.sides[side];
    for (const f of sd.team) { f.px = f.x; f.py = f.y; }
    const inp = sd.cpu ? cpuInput(s, side) : inputs?.[side] ?? NO_INPUT;
    stepSide(s, side, inp);
  }
  stepShots(s);
  stepStrikes(s);
  stepHazards(s);
  stepGround(s);
  stepEvents(s);
  stepBench(s);
  stepRing(s);
  for (let side = 0; side < 2; side++) settleKO(s, side);
  s.t++;
  if (s.t === LIMIT - FINAL_T) s.ev.push({ k: "final" });
  if (s.t === LIMIT - RING_T) s.ev.push({ k: "ring" });
  if (!s.over && s.t >= LIMIT && !s.sudden) {
    if (alive(s.sides[0]).length === alive(s.sides[1]).length) suddenDeath(s);
    else timeUp(s);
  }
  if (!s.over && s.sudden && s.t >= LIMIT + SUDDEN_T) timeUp(s);
  return s;
}

function stepSide(s, side, inp) {
  const sd = s.sides[side];
  if (sd.swapCd > 0) sd.swapCd--;
  if (sd.trapT > 0) sd.trapT--;
  // A switch in progress: the side has nobody out until it lands.
  if (sd.swapT > 0) {
    if (--sd.swapT === 0) {
      const from = sd.team[sd.active], to = sd.team[sd.next];
      Object.assign(to, { x: from.x, y: from.y, px: from.x, py: from.y, fx: from.fx, fy: from.fy, inv: to.cp.aegis ? AEGIS_T : SWAP_INV, act: null, dodge: 0, kbt: 0, fresh: true });
      sd.active = sd.next; sd.next = -1;
      s.ev.push({ k: "in", side, slot: sd.active });
      if (sd.tag) { sd.tag = false; tagIn(s, side, to); }
    }
    return;
  }
  if (sd.koT > 0) return;
  const f = sd.team[sd.active];
  // Surge recovers 1.5x (2 ticks every other tick, whole ticks so a replay is exact); an X Speed 2x.
  for (const m of [...f.kit, f.basic]) if (m.cd > 0) m.cd = Math.max(0, m.cd - (f.haste > 0 ? 2 : f.surge > 0 ? (s.t % 2 ? 2 : 1) : 1));
  if (f.surge > 0) f.surge--;
  if (f.fortress > 0) f.fortress--;
  if (f.awake > 0) f.awake--;
  // Sanctuary's warmth: a little a second, until a hit lands.
  if (f.regen > 0 && --f.regen % TPS === 0 && f.hp > 0) heal(s, f, Math.max(1, Math.floor(f.max * SANCT_REGEN)));
  // A healing card: its share of HP a second, while out.
  const rg = f.cp.regen + (hasSig(f, "moonlight") ? 0.01 : 0);
  if (rg > 0 && s.t % TPS === 0 && f.hp > 0 && f.hp < f.max) heal(s, f, Math.max(1, Math.floor(f.max * rg)));
  // Speed Boost (Blaziken's): +1 Speed every 10 s, to +2, held there.
  if (hasSig(f, "speedboost") && s.t > 0 && s.t % sec(10) === 0) { f.stages[5] = Math.min(2, f.stages[5] + 1); f.stageT[5] = sec(11); }
  if (f.dodgeCd > 0) f.dodgeCd--;
  if (f.inv > 0) f.inv--;
  if (f.shield > 0) f.shield--;
  if (f.flash > 0) f.flash--;
  for (let k = 1; k < 8; k++) if (f.stageT[k] > 0 && --f.stageT[k] === 0) f.stages[k] = 0;
  stepStatus(s, f);
  if (f.hp <= 0) return;
  // Evolving: still and untouchable until the new stage stands there.
  if (f.evo > 0) {
    if (--f.evo === 0) evolveInto(s, f);
    return;
  }
  if (!f.act && !f.dodge && !f.away && !held(f)) {
    const mega = megaOf(f);
    if (inp.mega && mega && !sd.megaUsed && (megaReady(s) || hasSig(f, "aura"))) { sd.megaUsed = true; startEvo(s, side, f, mega, true); return; }
    const next = f.xp >= EVO_XP ? evoTargets(f.id) : [];
    if (next.length) { startEvo(s, side, f, next.length > 1 ? next[Math.floor(rnd(s) * next.length)] : next[0], false); return; }
  }

  const [ax, ay] = norm(inp.ax, inp.ay);
  let [mx, my] = norm(inp.mx, inp.my);
  if (f.confused > 0) { f.confused--; mx = -mx; my = -my; }     // dizzy: it walks the wrong way
  f.moving = Boolean(mx || my);

  // A surge breaks a stagger (never sleep or freeze): the fighting game's burst.
  if (inp.surge && sd.meter >= SURGE_MAX && !f.act && !f.dodge && !f.away && f.status !== SLP && f.status !== FRZ) surge(s, side, f);
  if (f.away) f.inv = Math.max(f.inv, 2);
  if (held(f)) { if (f.stun > 0) f.stun--; }
  else {
    if (inp.use && sd.held) { useItem(s, f, sd.held); s.ev.push({ k: "use", side, item: sd.held, x: f.x, y: f.y }); sd.held = null; }
    if (inp.swap >= 0 && sd.swapCd === 0 && !sd.trapT && !f.act && !f.dodge) {
      const next = inp.swap < sd.team.length ? inp.swap : -1;
      if (next >= 0 && next !== sd.active && sd.team[next].hp > 0) {
        sd.next = next; sd.swapT = SWAP; sd.swapCd = SWAP_CD; f.surge = 0; f.clones = [];
        sd.tag = s.t - f.hitAt <= TAG_WIN;
        s.ev.push({ k: "out", side, slot: sd.active });
        return;
      }
    }
    if (inp.dodge && f.dodgeCd === 0 && !f.dodge && f.act?.shape !== "dash") {
      // A dash cancels a wind-up (the move's cooldown not spent), and ends a stream.
      if (f.act?.ph === "wind" || f.act?.ph === "chan") f.act = null;
      const [dx, dy] = mx || my ? [mx, my] : [-f.fx, -f.fy];
      f.dodge = DODGE; f.dx = dx; f.dy = dy; f.inv = Math.max(f.inv, DODGE_INV);
      // Evasion stages shorten the dash's cooldown.
      f.dodgeCd = Math.round(DODGE_CD * (1 - 0.15 * clamp(f.stages[7], -2, 2)) * (f.cp.spark ? SPARK_K : 1));
      s.ev.push({ k: "dodge", side });
    }
    // A move pressed during a basic attack's recovery cuts it short: the basic never holds a move back.
    if (inp.fire >= 0 && f.act?.basic && f.act.ph === "rec") f.act = null;
    if (inp.fire >= 0 && !f.act && !f.dodge) {
      const k = inp.fire, m = f.kit[k];
      if (m && m.cd === 0) {
        const data = arenaMove(m.i);
        const [dx, dy] = ax || ay ? [ax, ay] : [f.fx, f.fy];
        f.fx = dx; f.fy = dy;
        const w = windOf(data);
        f.act = { k, ph: "wind", t: w, t0: w, dx, dy, id: s.nextId++, shape: shapeOf(data), aimX: inp.ax, aimY: inp.ay };
        s.ev.push({ k: "wind", side, move: m.i, shape: f.act.shape });
      }
    }
    // Held, the basic attack goes whenever nothing else is: it never waits on a move.
    if (inp.basic && !f.act && !f.dodge && f.basic.cd === 0) {
      const [dx, dy] = ax || ay ? [ax, ay] : [f.fx, f.fy];
      f.fx = dx; f.fy = dy;
      f.act = { k: BASIC_K, ph: "wind", t: BASIC_WIND, t0: BASIC_WIND, dx, dy, id: s.nextId++, shape: basicShape(f), aimX: inp.ax, aimY: inp.ay, basic: true };
      s.ev.push({ k: "wind", side, move: f.basic.i, shape: f.act.shape, basic: true });
    }
  }

  // Moving: a dodge dashes, a dash move lunges, a wind-up walks at half speed, a recovery stands.
  const v = speedOf(f) * domainSpeed(s, f);
  if (f.dodge > 0) {
    const d = DODGE_DIST / DODGE;
    f.x += f.dx * d; f.y += f.dy * d; f.dodge--;
  } else if (f.act?.shape === "dash" && f.act.ph === "act") {
    const d = DASH_DIST / DASH;
    f.x += f.act.dx * d; f.y += f.act.dy * d;
  } else if (!held(f) && f.act?.ph !== "rec") {
    const k = f.act ? 0.5 : 1;
    const wx = mx * v * k, wy = my * v * k;
    /* ICE (the Rink): a non-Ice type's speed changes slowly, so it keeps
       sliding after it lets go and turns wide. */
    if (GROUND[s.arena].ice && !f.types.includes(T("ice"))) {
      f.vx += (wx - f.vx) * 0.08; f.vy += (wy - f.vy) * 0.08;
    } else { f.vx = wx; f.vy = wy; }
    f.x += f.vx; f.y += f.vy;
    if (!f.act && (ax || ay)) { f.fx = ax; f.fy = ay; } else if (!f.act && f.moving) { f.fx = mx; f.fy = my; }
  } else if (GROUND[s.arena].ice && !f.types.includes(T("ice"))) {
    f.vx *= 0.94; f.vy *= 0.94; f.x += f.vx; f.y += f.vy;
  }
  const flung = f.kbt > 0, wx = f.x + (flung ? f.kbx : 0), wy = f.y + (flung ? f.kby : 0);
  if (flung) { f.x = wx; f.y = wy; f.kbt--; }
  f.x = clamp(f.x, X0, X1); f.y = clamp(f.y, Y0, Y1);
  pushOut(s, f);
  // Flung into the wall or cover: stopped short of where the blow sent it.
  if (flung && !f.splat && f.inv <= 0 && (f.kbx * f.kbx + f.kby * f.kby) * KB * KB >= SPLAT_PUSH * SPLAT_PUSH && (Math.abs(f.x - wx) > 1e-6 || Math.abs(f.y - wy) > 1e-6)) {
    f.splat = true; f.kbt = 0;
    hurt(s, f, Math.max(1, Math.floor(f.max / SPLAT_HURT)), null);
    f.stun = Math.max(f.stun, SPLAT_STUN);
    s.ev.push({ k: "splat", side, x: f.x, y: f.y, dx: Math.sign(wx - f.x), dy: Math.sign(wy - f.y) });
  }
  if (!f.kbt) f.splat = false;

  // A stream sweeps after the aim while it pours; it pours while its button is held.
  if (f.act?.ph === "chan" && (ax || ay)) {
    const [nx, ny] = norm(f.act.dx + (ax - f.act.dx) * STREAM_TRACK, f.act.dy + (ay - f.act.dy) * STREAM_TRACK);
    if (nx || ny) { f.act.dx = nx; f.act.dy = ny; f.fx = nx; f.fy = ny; }
  }
  if (f.act) f.act.held = inp.hold === f.act.k;
  if (f.act) stepAct(s, side, f);
}

// Speed from the Speed stat and its stage; paralysis halves it, a swift zone lifts it.
const speedOf = (f) => Math.min(6, Math.max(3, 3 + 2.5 * (f.st[5] * STAGE(f.stages[5]) / 200)))
  / TPS * (f.status === PAR ? 0.5 : 1) * (f.swift > 0 ? 1.15 : 1) * (f.wading ? 0.5 : 1) * (f.rained ? RAIN_SLOW : 1)
  * (roleOf(f) === "brawler" ? BRAWL_RUN : 1) * (f.confused > 0 ? CONFUSE_SLOW : 1)
  * (hasSig(f, "mythic") ? 1.15 : 1) * (hasSig(f, "tailwind") ? 1.1 : 1);

// The Mega a fighter may become now: its own species', one the page allowed.
export const megaOf = (f) => megaTargets(f.id).find((id) => f.megas.includes(id)) ?? 0;
function startEvo(s, side, f, to, mega) {
  f.evo = EVOLVE_T; f.evoTo = to; f.act = null; f.inv = Math.max(f.inv, EVOLVE_T);
  s.ev.push({ k: "evolve", side, slot: f.slot, from: f.id, to, mega, x: f.x, y: f.y });
}
function evolveInto(s, f) {
  const from = f.id, to = f.evoTo, mega = MEGA.has(EVO_ROWS.find((r) => r.from === from && r.to === to)?.kind);
  const moves = f.moves.map((m) => m.i), was = fighter(from, f.level, f.uid ?? 1, moves), now = fighter(to, f.level, f.uid ?? 1, moves);
  const share = f.hp / f.max;
  f.st = f.st.map((v, k) => Math.max(1, Math.round(v * now.st[k] / was.st[k])));
  f.max = f.st[0] * HP_K;
  f.hp = Math.min(f.max, Math.round(f.max * share) + Math.floor(f.max * EVO_HEAL));
  f.types = now.types; f.id = to; f.xp = 0; f.evoTo = 0;
  // The line's kit grows with it: each slot takes the new stage's move, its cooldown kept.
  if (!f.custom && KITS[to]) fixedKit(to).forEach((i, k) => { if (i >= 0 && f.kit[k] && shapeOf(arenaMove(i))) f.kit[k].i = i; });
  if (mega) f.megaOn = true;
  else gain(s, f.side, SURGE_MAX * EVO_ULT);
  f.basic.i = basicOf(f);
  s.ev.push({ k: "evolved", side: f.side, slot: f.slot, from, to, mega, x: f.x, y: f.y });
}

function stepAct(s, side, f) {
  const a = f.act;
  const m = moveAt(f, a.k), data = arenaMove(m.i);
  if (a.ph === "chan") {
    // Struck as it starts (stepAct's switch), then every STREAM_TICK while it pours.
    const gone = STREAM_MAX - --a.t;
    if (gone % STREAM_TICK === 0 && a.t > 0) stream(s, side, f, a, m.i);
    // Let go after STREAM_MIN, or poured out: the stream stops.
    if (a.t > 0 && (a.held || gone < STREAM_MIN)) return;
    a.ph = "rec"; a.t = Math.round(recOf(data) * 1.4); a.len = 0;
    return;
  }
  if (--a.t > 0) {
    if (a.ph === "act" && (a.shape === "melee" || a.shape === "dash") && !a.hit) contact(s, side, f);
    if (a.ph === "act" && a.shape === "multi" && a.t % 4 === 0 && a.left > 0) burst(s, side, f, a, data);
    return;
  }
  if (a.ph === "wind") {
    if (a.basic) {
      m.cd = basicCd(f);
      f.basicN = s.t - f.basicT <= BASIC_CHAIN ? f.basicN + 1 : 1;
      f.basicT = s.t;
      a.boost = f.basicN % 3 === 0;
    } else m.cd = Math.round(cooldownOf(data) * (1 - f.cp.cd) * (hasSig(f, "ancient") ? 0.8 : 1) * (data.t === "fire" && hasSig(f, "reign") ? 0.7 : 1));
    s.ev.push({ k: "fire", side, move: m.i, shape: a.shape, x: f.x, y: f.y, dx: a.dx, dy: a.dy, basic: Boolean(a.basic), boost: Boolean(a.boost) });
    // A move that changes its user's own stages does so as it fires (Close Combat, Overheat).
    // ...but never past +1 (2026-10-24: Fiery Dance re-raised itself to a standing +2, doubling all it dealt); +2 is a setup move's.
    if (data.p && data.sgu && data.sg && rnd(s) * 100 < (data.sgc ?? 100)) stages(s, f, data.sg, 1);
    const rec = a.basic ? BASIC_REC : recOf(data);
    if (!a.basic && VANISH[data.n]) { vanish(s, side, f, m.i, VANISH[data.n]); return; }
    if (!a.basic && a.k === CONTROL && (a.shape === "self" || a.shape === "field")) openCombo(s, f);
    switch (a.shape) {
      case "shot":
        shoot(s, side, f, a.dx, a.dy, m.i, a.basic ? BASIC_RANGE : SHOT_RANGE, a.boost);
        a.ph = "rec"; a.t = rec; break;
      case "multi":
        a.left = multiCount(data);
        burst(s, side, f, a, data);
        a.ph = "act"; a.t = 4 * a.left + 1; break;
      case "beam":
        a.ph = "chan"; a.t = STREAM_MAX;
        stream(s, side, f, a, m.i); break;
      case "melee":
        a.ph = "act"; a.t = ACTIVE;
        contact(s, side, f); break;
      case "dash":
        a.ph = "act"; a.t = DASH; break;
      case "pulse":
        pulse(s, side, f, m.i);
        a.ph = "rec"; a.t = rec; break;
      case "field":
        place(s, side, f, a, m.i);
        a.ph = "rec"; a.t = rec; break;
      case "self":
        self(s, f, data);
        a.ph = "rec"; a.t = rec; break;
    }
  } else if (a.ph === "act") {
    a.ph = "rec"; a.t = a.basic ? BASIC_REC : recOf(data);
  } else {
    f.act = null;
  }
}

function shoot(s, side, f, dx, dy, move, range = SHOT_RANGE, boost = false, k = 1) {
  const blast = roleOf(f) === "blaster";
  s.shots.push({ id: s.nextId++, side, move, x: f.x + dx * (R + SHOT_R), y: f.y + dy * (R + SHOT_R), dx, dy,
    left: range * (blast ? BLAST_RANGE : 1), v: SHOT_SPEED * (blast ? BLAST_SPEED : 1), from: f.slot, boost, k });
}
// A burst: one shot of a multi-hit move, the spread fanning a little each time.
function burst(s, side, f, a, data) {
  const n = multiCount(data), k = n - a.left;
  const spread = ((k % 3) - 1) * 0.08;
  const [dx, dy] = turn(a.dx, a.dy, spread);
  shoot(s, side, f, dx, dy, moveAt(f, a.k).i);
  a.left--;
}

// A blow or a lunge: the first time the foe is in reach, it lands. A blow chips cover in its arc.
function contact(s, side, f) {
  if (f.act.shape === "melee" && !f.act.chipped) {
    f.act.chipped = true;
    for (const c of s.cover) {
      if (c.hp <= 0) continue;
      const ex = c.x - f.x, ey = c.y - f.y, dist = Math.sqrt(ex * ex + ey * ey);
      if (dist < MELEE_RANGE + COVER_HALF + R && (ex * f.act.dx + ey * f.act.dy) / (dist || 1) > MELEE_COS) chip(s, c, moveAt(f, f.act.k).i, c.x, c.y);
    }
  }
  const d = activeOf(s, 1 - side);
  if (!d || d.hp <= 0) return;
  const reaches = (tx, ty) => {
    const ex = tx - f.x, ey = ty - f.y, dist = Math.sqrt(ex * ex + ey * ey);
    if (f.act.shape === "dash") return dist <= 2 * R + 0.15 ? dist : -1;
    if (dist > MELEE_RANGE + R) return -1;
    return dist > 0 && (ex * f.act.dx + ey * f.act.dy) / dist < MELEE_COS ? -1 : dist;
  };
  // A copy nearer than its user takes the blow and is gone.
  const real = reaches(d.x, d.y);
  const copies = clonesOf(d).map(([cx, cy], k) => [reaches(cx, cy), k]).filter(([r]) => r >= 0).sort((a, b) => a[0] - b[0]);
  if (copies.length && (real < 0 || copies[0][0] < real)) {
    f.act.hit = true; popClone(s, d, copies[0][1]);
    if (f.act.shape === "dash") { f.act.ph = "rec"; f.act.t = sec(0.25); }
    return;
  }
  if (real < 0) return;
  f.act.hit = true;
  hit(s, f, d, moveAt(f, f.act.k).i, f.act.dx, f.act.dy, true, d.x, d.y, f.act.boost ? BASIC_BOOST : 1);
  if (f.act.shape === "dash") { f.act.ph = "rec"; f.act.t = sec(0.25); }
}

// A stream's strike: the beam along where it points now, for its share; its length is the picture's.
function stream(s, side, f, a, move) {
  a.len = beamAt(s, side, f, f.x, f.y, a.dx, a.dy, move, BEAM_W, BEAM_LEN * (roleOf(f) === "blaster" ? BLAST_RANGE : 1), STREAM_PART, false, true);
  // A Flamethrower sets the floor alight where it lands, as its shot did.
  if (FLAMES.has(arenaMove(move).n)) {
    if (s.fires.length >= FIRE_MAX) s.fires.shift();
    s.fires.push({ x: f.x + a.dx * a.len, y: f.y + a.dy * a.len, t: FIRE_T, side });
  }
}
/* A beam from (x, y): up to the first cover; the first of the foe and its
   copies along it is struck - a copy pops and the beam is spent on it. */
function beamAt(s, side, a, x, y, dx, dy, move, width, length, k, big = false, part = false) {
  let len = length, block = null;
  for (const c of s.cover) {
    if (c.hp <= 0) continue;
    const t = rayBox(x, y, dx, dy, c, width);
    if (t != null && t < len) { len = t; block = c; }
  }
  s.ev.push({ k: "beam", side, move, x, y, dx, dy, len, big, stream: part });
  if (block) chip(s, block, move, x + dx * len, y + dy * len);
  const d = activeOf(s, 1 - side);
  if (!d || d.hp <= 0) return len;
  const along = (tx, ty) => {
    const ex = tx - x, ey = ty - y, l = ex * dx + ey * dy;
    return l > 0 && l < len + R && Math.abs(ex * dy - ey * dx) < R + width ? l : -1;
  };
  const real = along(d.x, d.y);
  const copies = clonesOf(d).map(([cx, cy], n) => [along(cx, cy), n]).filter(([l]) => l >= 0).sort((p, q) => p[0] - q[0]);
  if (copies.length && (real < 0 || copies[0][0] < real)) { popClone(s, d, copies[0][1]); return len; }
  if (real >= 0) hit(s, a, d, move, dx, dy, false, d.x, d.y, k, part ? k : 1);
  return len;
}

/* Where a ray from (x, y) along (dx, dy) first enters a block (its half
   size grown by `pad`), or null: the slab test - divisions only, no trig. */
function rayBox(x, y, dx, dy, c, pad = 0) {
  const h = COVER_HALF + pad;
  let lo = 0, hi = Infinity;
  for (const [o, d, mid] of [[x, dx, c.x], [y, dy, c.y]]) {
    if (d === 0) { if (o < mid - h || o > mid + h) return null; continue; }
    let t1 = (mid - h - o) / d, t2 = (mid + h - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    lo = Math.max(lo, t1); hi = Math.min(hi, t2);
    if (lo > hi) return null;
  }
  return lo > 0 ? lo : null;
}
// Does a straight line from a to b cross live cover? (The CPU will not fire into it.)
export function blocked(s, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = Math.sqrt(dx * dx + dy * dy) || 1;
  return s.cover.some((c) => { if (c.hp <= 0) return false; const t = rayBox(ax, ay, dx / l, dy / l, c, SHOT_R * 0.5); return t != null && t < l; });
}

/* A blow on cover: its power, twice for a type its material is weak to,
   half for one it resists. At nothing it breaks, and stays broken. */
function chip(s, c, move, x, y) {
  const m = arenaMove(move), g = GROUND[s.arena];
  if (!m.p) { s.ev.push({ k: "fizzle", x, y, move }); return; }
  const k = g.weak?.includes(m.t) ? 2 : g.resist?.includes(m.t) ? 0.5 : 1;
  c.hp = Math.max(0, c.hp - Math.round(m.p * k * 0.5));
  s.ev.push({ k: c.hp ? "chip" : "break", id: c.id, x, y, move, weak: k > 1 });
}

// Bodies cannot stand in cover: pushed out along the shortest way.
function pushOut(s, f) {
  for (const c of s.cover) {
    if (c.hp <= 0) continue;
    const nx = clamp(f.x, c.x - COVER_HALF, c.x + COVER_HALF), ny = clamp(f.y, c.y - COVER_HALF, c.y + COVER_HALF);
    let ex = f.x - nx, ey = f.y - ny, d = Math.sqrt(ex * ex + ey * ey);
    if (d >= R) continue;
    if (d === 0) { ex = f.x < c.x ? -1 : 1; ey = 0; d = 1; }
    f.x = nx + (ex / d) * R; f.y = ny + (ey / d) * R;
    if (f.act?.shape === "dash" && f.act.ph === "act" && !f.act.hit) {
      f.act.hit = true; chip(s, c, moveAt(f, f.act.k).i, nx, ny);
      f.act.ph = "rec"; f.act.t = sec(0.25);
    }
  }
}

// A pulse: a ring around the user (Earthquake, Surf, Growl). It shakes the cover in it too.
function pulse(s, side, f, move) {
  if (WIDE.has(arenaMove(move).n)) {
    // The whole court: every cover takes it, and the foe unless cover stands between.
    s.ev.push({ k: "pulse", side, move, x: f.x, y: f.y, r: W, wide: true });
    for (const c of s.cover) if (c.hp > 0) chip(s, c, move, c.x, c.y);
    const d = activeOf(s, 1 - side);
    if (d && d.hp > 0 && !blocked(s, f.x, f.y, d.x, d.y)) { const [dx, dy] = norm(d.x - f.x, d.y - f.y); hit(s, f, d, move, dx || 1, dy, false, d.x, d.y, WIDE_K); }
    else if (d && d.hp > 0) s.ev.push({ k: "sheltered", side: d.side, x: d.x, y: d.y });
    return;
  }
  s.ev.push({ k: "pulse", side, move, x: f.x, y: f.y, r: PULSE_R });
  if (SMOKE.has(arenaMove(move).n)) {
    s.clouds.push({ id: s.nextId++, x: f.x, y: f.y, t: SMOKE_T, smoke: true });
    s.ev.push({ k: "smoke", side, x: f.x, y: f.y });
  }
  for (const c of s.cover) {
    if (c.hp <= 0) continue;
    const ex = c.x - f.x, ey = c.y - f.y;
    if (ex * ex + ey * ey < (PULSE_R + COVER_HALF) * (PULSE_R + COVER_HALF)) chip(s, c, move, c.x, c.y);
  }
  blast(s, f, f.x, f.y, PULSE_R, move, 1);
}
// Off the court: the user is gone, and its landing is a strike on the foe.
function vanish(s, side, f, move, kind) {
  const d = activeOf(s, 1 - side);
  f.away = kind; f.act = null; f.clones = []; f.inv = Math.max(f.inv, 2);
  s.strikes.push({ id: s.nextId++, side, from: f.slot, move, k: 1, t: VANISH_T, t0: VANISH_T, type: arenaMove(move).t, r: VANISH_R,
    x: d ? d.x : f.x, y: d ? d.y : f.y, follow: true, vanish: kind });
  s.ev.push({ k: "vanish", side, kind, move, x: f.x, y: f.y });
}
// A blast round (x, y): every copy in it pops, and the foe in it is struck.
function blast(s, a, x, y, r, move, k) {
  const d = activeOf(s, 1 - a.side);
  if (!d || d.hp <= 0) return;
  for (let n = clonesOf(d).length - 1; n >= 0; n--) {
    const [cx, cy] = clonesOf(d)[n];
    if ((cx - x) * (cx - x) + (cy - y) * (cy - y) <= (r + R) * (r + R)) popClone(s, d, n);
  }
  const ex = d.x - x, ey = d.y - y;
  if (ex * ex + ey * ey > (r + R) * (r + R)) return;
  const [dx, dy] = norm(ex, ey);
  hit(s, a, d, move, dx || 1, dy, false, d.x, d.y, k);
}

// A hazard: laid where you aim, up to PLACE tiles away, for HAZARD_T.
function place(s, side, f, a, move) {
  const [ux, uy] = norm(a.aimX, a.aimY);
  const reach = Math.min(PLACE, Math.sqrt(a.aimX * a.aimX + a.aimY * a.aimY) || PLACE);
  const dx = ux || a.dx, dy = uy || a.dy;
  const mine = s.hazards.filter((z) => z.side === side);
  if (mine.length >= HAZARD_MAX) s.hazards = s.hazards.filter((z) => z !== mine[0]);
  const z = { id: s.nextId++, side, move, kind: arenaMove(move).n, t: HAZARD_T,
    x: clamp(f.x + dx * reach, X0, X1), y: clamp(f.y + dy * reach, Y0, Y1), last: -HAZARD_CD };
  s.hazards.push(z);
  s.ev.push({ k: "field", side, move, x: z.x, y: z.y });
}

function stepHazards(s) {
  s.hazards = s.hazards.filter((z) => {
    if (--z.t <= 0) return false;
    const d = activeOf(s, 1 - z.side);
    if (!d || d.hp <= 0 || d.inv > 0 || s.t - z.last < HAZARD_CD) return true;
    const ex = d.x - z.x, ey = d.y - z.y;
    if (ex * ex + ey * ey > (HAZARD_R + R) * (HAZARD_R + R)) return true;
    // Spikes, Toxic Spikes and Sticky Web lie on the ground: a flier is above them.
    const flying = d.types.includes(9);
    if (z.kind !== "stealth-rock" && flying) return true;
    z.last = s.t;
    if (z.kind === "spikes") hurt(s, d, Math.floor(d.max / 10), z.move);
    else if (z.kind === "stealth-rock") hurt(s, d, Math.floor(d.max / 8 * effectiveness("rock", d.types)), z.move);
    else if (z.kind === "toxic-spikes") afflict(s, d, PSN, false);
    else if (z.kind === "sticky-web") stages(s, d, [[5, -1]]);
    return true;
  });
}

/* THE GROUND'S OWN TICK: the zones' clock and claims, falling rock, the
   hot edge, water, tall grass, eroding basalt, a swift zone running out. */
function stepGround(s) {
  const g = GROUND[s.arena];
  const z = s.zone;
  if (--z.t <= 0) {
    z.open = !z.open; z.t = z.open ? ZONE_OPEN : ZONE_SHUT;
    z.claimed = [false, false]; z.hold = [[0, 0], [0, 0]];
    s.ev.push({ k: z.open ? "zones" : "zonesShut" });
  }
  const bodies = [activeOf(s, 0), activeOf(s, 1)];
  if (z.open) {
    ZONE_AT.forEach(([zx, zy], k) => {
      const inside = bodies.map((f) => f && f.hp > 0 && (f.x - zx) * (f.x - zx) + (f.y - zy) * (f.y - zy) < ZONE_R * ZONE_R);
      for (let side = 0; side < 2; side++) {
        // Held alone: a contested zone pays nobody.
        if (inside[side] && !inside[1 - side] && !z.claimed[side]) {
          if (++z.hold[k][side] >= ZONE_HOLD) { z.claimed[side] = true; reward(s, bodies[side], g.zone); gain(s, side, GAIN_ZONE); s.ev.push({ k: "claim", side, zone: k, x: zx, y: zy }); }
        } else z.hold[k][side] = 0;
      }
    });
  }
  if (g.rocks) {
    if (s.t >= ROCKS_FIRST && (s.t - ROCKS_FIRST) % ROCKS_EVERY === 0) {
      for (let n = 0; n < 3; n++) {
        const x = X0 + 1 + rnd(s) * (X1 - X0 - 2), y = Y0 + 1 + rnd(s) * (Y1 - Y0 - 2);
        s.drops.push({ x, y, t: ROCK_WARN });
      }
      s.ev.push({ k: "rumble" });
    }
  }
  // A falling rock, or an eruption's lava bomb: shown on the ground, then down.
  s.drops = s.drops.filter((r) => {
    if (--r.t > 0) return true;
    s.ev.push({ k: r.lava ? "lava" : "rock", x: r.x, y: r.y });
    const rr = r.lava ? LAVA_R : ROCK_R;
    for (const f of bodies) {
      if (!f || f.hp <= 0 || f.inv > 0) continue;
      if ((f.x - r.x) * (f.x - r.x) + (f.y - r.y) * (f.y - r.y) > (rr + R) * (rr + R)) continue;
      if (r.lava) {
        hurt(s, f, Math.max(1, Math.floor(f.max / 10 * effectiveness("fire", f.types))), null);
        if (rnd(s) < 0.3) afflict(s, f, BRN);
      } else hurt(s, f, Math.max(1, Math.floor(f.max / 8 * effectiveness("rock", f.types))), null);
      f.stun = Math.max(f.stun, sec(0.3));
    }
    return false;
  });
  stepItems(s, bodies);
  stepHelpers(s);
  s.clouds = s.clouds.filter((c) => --c.t > 0);
  for (const f of bodies) {
    if (!f || f.hp <= 0) continue;
    if (f.swift > 0) f.swift--;
    if (f.power > 0) f.power--;
    if (f.cloneT > 0 && --f.cloneT === 0 && f.clones.length) { s.ev.push({ k: "poof", side: f.side, at: clonesOf(f) }); f.clones = []; }
    /* THE COPIES MOVE ON THEIR OWN (asked for, 2026-10-23): each drifts to a
       new spot round its user every CLONE_WANDER, staggered, never closer
       than CLONE_NEAR - so they weave and cross, and keep the eye guessing. */
    f.clones.forEach((c, k) => {
      if ((s.t + k * (CLONE_WANDER >> 1)) % CLONE_WANDER === 0) {
        let tx = (rnd(s) * 2 - 1) * 2.4, ty = (rnd(s) * 2 - 1) * 1.7;
        const l = Math.sqrt(tx * tx + ty * ty);
        if (l < CLONE_NEAR) { const g = CLONE_NEAR / (l || 1); tx = (l ? tx : 1) * g; ty *= g; }
        c[2] = tx; c[3] = ty;
      }
      c[0] += (c[2] - c[0]) * 0.07; c[1] += (c[3] - c[1]) * 0.07;
    });
    if (f.wet > 0) f.wet--;
    if (s.weather === "rain") f.wet = Math.max(f.wet, 2);
    f.rained = s.weather === "rain" && f.types.includes(T("fire"));
    if ((s.weather === "sand" || s.weather === "snow") && s.t > 0 && s.t % WEATHER_CHIP === 0
      && !(s.weather === "sand" ? SAND_SAFE : SNOW_SAFE).some((t) => f.types.includes(T(t)))) hurt(s, f, Math.max(1, Math.floor(f.max / WEATHER_HURT)), null);
    if (f.haste > 0) f.haste--;
    // WATER (the Boardwalk): only a Water or Flying type moves freely in it.
    f.wading = inRects(waterOf(s), f.x, f.y) && !f.types.includes(T("water")) && !f.types.includes(T("flying"));
    // TALL GRASS (the Grove): it hides you while you are not attacking.
    f.hidden = Boolean(f.away) || (inRects(g.grass, f.x, f.y) && !f.act && !f.dodge)
      || s.clouds.some((c) => (c.x - f.x) * (c.x - f.x) + (c.y - f.y) * (c.y - f.y) < STEAM_R * STEAM_R);
    // THE HOT EDGE (the Caldera): a second against the wall burns a non-Fire type.
    if (g.heat && (f.x < X0 + g.heat || f.x > X1 - g.heat || f.y < Y0 + g.heat || f.y > Y1 - g.heat)) {
      if (++f.heat >= HEAT_BURN) { f.heat = 0; afflict(s, f, BRN); }
    } else f.heat = 0;
  }
  // BASALT ERODES (the Caldera): the cover thins out over the match.
  if (g.erode && s.t % sec(0.5) === 0) for (const c of s.cover) if (c.hp > 0 && --c.hp === 0) s.ev.push({ k: "break", id: c.id, x: c.x, y: c.y, move: STRUGGLE });
}

/* The floor's power-ups: a mirrored pair every PICK_EVERY, kept clear of
   cover; touched, worked at once or held (one a side - a held one leaves a
   second where it lies); gone after PICK_LIFE. */
function stepItems(s, bodies) {
  if (s.t >= PICK_FIRST && (s.t - PICK_FIRST) % PICK_EVERY === 0) {
    const revive = !s.revived && s.t >= REVIVE_AT && s.sides.some((sd) => downed(sd).length);
    if (revive) s.revived = true;
    const kind = revive ? "revive" : PICK_KINDS[Math.floor(rnd(s) * PICK_KINDS.length)];
    let x = 0, y = 0;
    for (let n = 0; n < 6; n++) {
      x = X0 + 2 + rnd(s) * (W / 2 - X0 - 3); y = Y0 + 1.2 + rnd(s) * (Y1 - Y0 - 2.4);
      if (!s.cover.some((c) => c.hp > 0 && Math.abs(c.x - x) < COVER_HALF + 0.9 && Math.abs(c.y - y) < COVER_HALF + 0.9)) break;
    }
    for (const [px, py] of [[x, y], [W - x, H - y]]) s.items.push({ id: s.nextId++, kind, x: px, y: py, t: PICK_LIFE });
    s.ev.push({ k: "items", kind });
  }
  s.items = s.items.filter((it) => {
    if (--it.t <= 0) return false;
    for (const f of bodies) {
      if (!f || f.hp <= 0) continue;
      if ((f.x - it.x) * (f.x - it.x) + (f.y - it.y) * (f.y - it.y) > (R + PICK_R) * (R + PICK_R)) continue;
      const sd = s.sides[f.side];
      if (it.kind === "revive" && !downed(sd).length) continue;
      if (PICKUPS[it.kind].held) { if (sd.held) continue; sd.held = it.kind; }
      else useItem(s, f, it.kind);
      s.ev.push({ k: "pick", side: f.side, item: it.kind, x: it.x, y: it.y, held: PICKUPS[it.kind].held });
      return false;
    }
    return true;
  });
}
/* RESTING IN ITS BALL (2026-10-24, asked for): a Pokemon on the bench heals
   BENCH_REGEN of its HP a second, never past BENCH_CAP - a switch out is a
   breather, never a full heal. A fainted one stays down. */
const BENCH_REGEN = 0.01, BENCH_CAP = 0.75;
function stepBench(s) {
  if (s.t % TPS) return;
  for (const sd of s.sides) sd.team.forEach((f, k) => {
    const cap = Math.floor(f.max * BENCH_CAP);
    if (k !== sd.active && f.hp > 0 && f.hp < cap) f.hp = Math.min(cap, f.hp + Math.max(1, Math.floor(f.max * BENCH_REGEN * (hasSig(f, "friend") ? 2 : 1))));
  });
}
function stepHelpers(s) {
  s.helpers = s.helpers.filter((h) => {
    const foe = activeOf(s, 1 - h.side), mine = activeOf(s, h.side);
    if (h.kind === "snorlax" && h.t > HELPER_LOCK && foe && foe.hp > 0) { h.x = foe.x; h.y = foe.y; }
    const H0 = HELPERS[h.kind];
    if (H0.follow) {
      if (mine) { const [ox, oy] = SIDE_AT[h.kind]; h.x += (mine.x + ox - h.x) * 0.12; h.y += (mine.y + oy - h.y) * 0.12; }
      if (H0.every && (H0.t - h.t) % H0.every === H0.every - 1) {
        if (h.kind === "audino" && mine && mine.hp > 0) heal(s, mine, Math.max(1, Math.floor(mine.max * PULSE_HEAL)));
        else if (h.kind === "magnemite" && foe && foe.hp > 0 && foe.inv <= 0 && !foe.hidden && effectiveness("electric", foe.types) > 0) {
          hurt(s, foe, Math.max(1, Math.floor(foe.max / SHOCK_HURT * effectiveness("electric", foe.types))), null);
          s.ev.push({ k: "zap", side: h.side, x: h.x, y: h.y, tx: foe.x, ty: foe.y });
        }
      }
      if (--h.t > 0) return true;
      s.ev.push({ k: "helperGone", kind: h.kind, side: h.side, x: h.x, y: h.y });
      return false;
    }
    if (--h.t > 0) return true;
    s.ev.push({ k: "helperHit", kind: h.kind, side: h.side, x: h.x, y: h.y });
    const r = HELPERS[h.kind].r ?? 0;
    const near = foe && foe.hp > 0 && foe.inv <= 0 && (foe.x - h.x) * (foe.x - h.x) + (foe.y - h.y) * (foe.y - h.y) < (r + R) * (r + R);
    if (h.kind === "chansey") { if (mine && mine.hp > 0) heal(s, mine, Math.floor(mine.max * HELPER_HEAL)); }
    else if (h.kind === "jigglypuff") { if (near) afflict(s, foe, SLP); }
    else if (near) {
      hurt(s, foe, Math.max(1, Math.floor(foe.max / (h.kind === "snorlax" ? 6 : 7) * effectiveness("normal", foe.types))), null);
      const [dx, dy] = norm(foe.x - h.x || 1, foe.y - h.y);
      foe.kbx = dx * 1.4 / KB; foe.kby = dy * 1.4 / KB; foe.kbt = KB;
      foe.stun = Math.max(foe.stun, sec(h.kind === "snorlax" ? 0.6 : 0.4));
    }
    return false;
  });
}
function useItem(s, f, kind) {
  if (kind === "poke-ball") {
    const h = HELPER_KINDS[Math.floor(rnd(s) * HELPER_KINDS.length)], d = activeOf(s, 1 - f.side);
    const [x, y] = h === "snorlax" && d ? [d.x, d.y] : [f.x, f.y];
    s.helpers.push({ id: s.nextId++, kind: h, side: f.side, x, y, t: HELPERS[h].t });
    s.ev.push({ k: "helper", kind: h, side: f.side, x, y });
    return;
  }
  if (kind === "moon-stone") {
    if (evoTargets(f.id).length) f.xp = Math.max(f.xp, EVO_XP);
    else gain(s, f.side, SURGE_MAX);
    return;
  }
  if (kind === "revive") {
    const down = downed(s.sides[f.side]), back = down[Math.floor(rnd(s) * down.length)];
    back.hp = Math.max(1, Math.floor(back.max * REVIVE_HP)); back.status = -1; back.badly = false; back.stages = back.stages.map(() => 0);
    s.ev.push({ k: "revived", side: f.side, slot: back.slot, id: back.id, x: f.x, y: f.y });
    return;
  }
  if (kind === "potion") heal(s, f, Math.floor(f.max * 0.2));
  else if (kind === "full-heal") {
    if (f.status >= 0) { f.status = -1; f.badly = false; s.ev.push({ k: "cured", side: f.side }); }
    for (let k = 1; k < 8; k++) if (f.stages[k] < 0) { f.stages[k] = 0; f.stageT[k] = 0; }
  } else if (kind === "shiny-stone") gain(s, f.side, 40);
  else if (kind === "full-restore") {
    heal(s, f, Math.floor(f.max * 0.5));
    if (f.status >= 0) { f.status = -1; f.badly = false; s.ev.push({ k: "cured", side: f.side }); }
    gain(s, f.side, 50);
  }
  else if (kind === "x-attack") f.power = X_TIME;
  else if (kind === "x-speed") { f.swift = Math.max(f.swift, X_TIME); f.haste = X_TIME; }
  else if (kind === "x-defense") { f.shield = X_GUARD; f.inv = Math.max(f.inv, X_GUARD); s.ev.push({ k: "shield", side: f.side, x: f.x, y: f.y }); }
}

// What holding a zone pays, by the arena's kind.
function reward(s, f, kind) {
  if (!f) return;
  if (kind === "ready") {
    const m = [...f.kit].sort((a, b) => b.cd - a.cd)[0];
    if (m) m.cd = 0;
  } else if (kind === "dodge") f.dodgeCd = 0;
  else if (kind === "cure") { if (f.status === BRN || f.status === PSN) { f.status = -1; f.badly = false; s.ev.push({ k: "cured", side: f.side }); } }
  else if (kind === "cool") for (const m of f.kit) m.cd = Math.max(0, m.cd - sec(2));
  else if (kind === "heal") heal(s, f, Math.floor(f.max * 0.06));
  else if (kind === "swift") f.swift = SWIFT;
}

// A self move: a shield, a rest, a heal, a buff.
function self(s, f, m) {
  if (SHIELDS.has(m.n)) { f.shield = SHIELD; f.inv = Math.max(f.inv, SHIELD); s.ev.push({ k: "shield", side: f.side, x: f.x, y: f.y }); return; }
  if (m.n === "rest") {
    heal(s, f, f.max);
    f.status = -1; afflict(s, f, SLP, false, sec(3));
    return;
  }
  if (m.h) heal(s, f, Math.floor(f.max * m.h / 100));
  if (m.sg) stages(s, f, m.sg);
  if (m.n === "double-team") {
    // Either side of the way it faces.
    f.clones = [[-f.fy * CLONE_OFF, f.fx * CLONE_OFF], [f.fy * CLONE_OFF, -f.fx * CLONE_OFF]].map(([x, y]) => [x, y, x, y]);
    f.cloneT = CLONE_T;
    s.ev.push({ k: "clones", side: f.side, x: f.x, y: f.y });
  }
}

function heal(s, f, n) {
  const got = Math.min(f.max - f.hp, Math.max(0, n));
  if (got <= 0) return;
  f.hp += got;
  s.ev.push({ k: "heal", side: f.side, x: f.x, y: f.y, n: got });
}

// Timed stat stages: each lasts BUFF_T and the Arena caps them at +/-2.
function stages(s, f, list, cap = STAGE_CAP) {
  for (const [stat, n] of list) {
    if (stat < 1 || stat > 7) continue;
    f.stages[stat] = clamp(f.stages[stat] + n, -STAGE_CAP, n > 0 ? Math.max(f.stages[stat], cap) : STAGE_CAP);
    f.stageT[stat] = BUFF_T;
    s.ev.push({ k: "stage", side: f.side, stat, n, x: f.x, y: f.y });
  }
}

// ------------------------------------------------------------------ statuses

/* STATUSES TICK IN REAL TIME (the plan's table): burn 1/16 every 2 s for 8 s
   and halved physical damage; poison 1/12 every 2 s for 10 s (badly: n/16,
   rising); paralysis halves speed for 6 s with a 25% chance of a 0.4 s stun
   every 2 s; sleep 2-4 s, woken by a hit after its first second; freeze
   2.5 s, thawed by a Fire hit. */
const LASTS = { [PAR]: sec(6), [BRN]: sec(8), [PSN]: sec(10), [FRZ]: sec(2.5) };
function afflict(s, f, st, badly = false, sleep = 0) {
  if (f.status !== -1 || f.hp <= 0 || immuneTo(f, st)) return false;
  if (s.domain && ((s.domain.kind === "misty-terrain" && s.domain.side === f.side) || (s.domain.kind === "electric-terrain" && st === SLP))) return false;
  f.status = st; f.badly = badly; f.statusN = 0;
  f.statusT = st === SLP ? (sleep || sec(2 + rnd(s) * 2)) : LASTS[st];
  f.sleptAt = s.t;
  if ((f.act?.ph === "wind" || f.act?.ph === "chan") && (st === SLP || st === FRZ)) f.act = null;
  s.ev.push({ k: "status", side: f.side, st, x: f.x, y: f.y });
  return true;
}
function stepStatus(s, f) {
  if (f.status === -1) return;
  const every = sec(2);
  const k = LASTS[f.status] ? LASTS[f.status] - f.statusT : 0;
  if (k > 0 && k % every === 0) {
    f.statusN++;
    if (f.status === BRN) hurt(s, f, Math.max(1, Math.floor(f.max / 16)));
    if (f.status === PSN) hurt(s, f, Math.max(1, Math.floor(f.badly ? f.max * f.statusN / 16 : f.max / 12)));
    if (f.status === PAR && rnd(s) < 0.25) { f.stun = sec(0.4); s.ev.push({ k: "para", side: f.side, x: f.x, y: f.y }); }
  }
  if (--f.statusT <= 0) { f.status = -1; f.badly = false; s.ev.push({ k: "cured", side: f.side }); }
}
function hurt(s, f, n, move = null) {
  if (n <= 0 || f.hp <= 0) return;
  f.hp = Math.max(0, f.hp - n);
  s.ev.push({ k: "tick", side: f.side, x: f.x, y: f.y, dmg: n, st: f.status, move });
}

function stepShots(s) {
  s.shots = s.shots.filter((p) => {
    p.x += p.dx * p.v; p.y += p.dy * p.v; p.left -= p.v;
    if (FLAMES.has(arenaMove(p.move).n) && (p.age = (p.age ?? 0) + 1) % FIRE_EVERY === 0) {
      if (s.fires.length >= FIRE_MAX) s.fires.shift();
      s.fires.push({ x: p.x, y: p.y, t: FIRE_T, side: p.side });
    }
    if (p.left <= 0 || p.x < INSET || p.x > W - INSET || p.y < INSET || p.y > H - INSET) { s.ev.push({ k: "fizzle", x: p.x, y: p.y, move: p.move }); return false; }
    const c = s.cover.find((b) => b.hp > 0 && Math.abs(p.x - b.x) < COVER_HALF + SHOT_R && Math.abs(p.y - b.y) < COVER_HALF + SHOT_R);
    if (c) { chip(s, c, p.move, p.x, p.y); return false; }
    const d = activeOf(s, 1 - p.side);
    if (!d || d.hp <= 0 || d.away) return true;
    // A copy in the way takes the shot and is gone.
    const cn = clonesOf(d).findIndex(([cx, cy]) => (cx - p.x) * (cx - p.x) + (cy - p.y) * (cy - p.y) <= (R + SHOT_R) * (R + SHOT_R));
    if (cn >= 0) { popClone(s, d, cn); return false; }
    const ex = d.x - p.x, ey = d.y - p.y;
    if (ex * ex + ey * ey > (R + SHOT_R) * (R + SHOT_R)) return true;
    const a = s.sides[p.side].team[p.from];
    hit(s, a, d, p.move, p.dx, p.dy, false, p.x, p.y, (p.boost ? BASIC_BOOST : 1) * (p.k ?? 1));
    return false;
  });
}

function surge(s, side, f) {
  s.sides[side].meter = 0;
  s.sides[side].stats.surges++;
  f.surge = SURGE_T; f.stun = 0; f.inv = Math.max(f.inv, sec(0.3));
  const d = activeOf(s, 1 - side);
  if (d && d.hp > 0) {
    const ex = d.x - f.x, ey = d.y - f.y;
    if (ex * ex + ey * ey < SURGE_PUSH * SURGE_PUSH) {
      const [dx, dy] = norm(ex, ey);
      d.kbx = dx * 2 / KB; d.kby = dy * 2 / KB; d.kbt = KB;
      d.stun = Math.max(d.stun, FLINCH);
      if (d.act?.ph === "wind") d.act = null;
    }
  }
  s.ev.push({ k: "surge", side, x: f.x, y: f.y });
  ultimate(s, side, f);
}
/* THE ULTI ARCHETYPES (2026-10-24, asked for: "ULTs should have bigger
   impacts, more epic, really worth the use - some defensive, buff, attack").
   Every Pokemon has ONE ULTI (`ultiPick`): a named one the game already had,
   its signature move, a support ULTI for a wall, else its strongest
   same-type attack - each in one of fourteen ARCHETYPES. An attack ULTI is
   worth ~35% of its target's HP if it all lands (`ultDamage`: a SHARE of the
   target's HP, its type matchup and the two Pokemon's stats folded in, so
   it is the same size from a Pichu as from a Mewtwo); a defence, a buff or
   a control one is worth as much in what it prevents, adds or takes away.
   Everything telegraphs, everything has an answer (docs: the Arena Move
   Codex). */
export const ARCHETYPES = ["Cataclysm", "Storm", "Cannon", "Nova", "Barrage", "Onslaught", "Phantom", "Sacrifice",
  "Fortress", "Barrier", "Sanctuary", "Awakening", "Domain", "Snare"];
const FORT_T = sec(3), FORT_HURT = 0.1, DOME_T = sec(10), DOME_R = 2.5, DOME_K = 0.6, VEIL_K = 0.5;
const SANCT_HEAL = 0.35, SANCT_REGEN = 0.03, SANCT_T = sec(6), SANCT_BENCH = 0.15, AWAKE_T = sec(10);
const DOMAIN_T = sec(12), SNARE_R = 4, TRAP_T = sec(8), PERISH_T = sec(6);
const ULT_STORM = new Set(["thunder", "blizzard", "hurricane", "draco-meteor", "precipice-blades", "thousand-arrows", "diamond-storm", "bleakwind-storm",
  "wildbolt-storm", "sandsear-storm", "springtide-storm", "meteor-beam", "fire-blast", "leaf-storm", "seed-flare", "judgment", "core-enforcer"]);
const ULT_FORTRESS = new Set(["kings-shield", "spiky-shield", "baneful-bunker", "obstruct", "silk-trap", "burning-bulwark", "max-guard", "wide-guard", "mat-block", "crafty-shield"]);
const ULT_BARRIER = new Set(["reflect", "light-screen", "aurora-veil", "safeguard"]);
const ULT_SANCT = new Set(["wish", "healing-wish", "lunar-dance", "life-dew", "jungle-healing", "lunar-blessing", "heal-bell", "aromatherapy", "moonlight",
  "morning-sun", "synthesis", "recover", "roost", "slack-off", "soft-boiled", "milk-drink", "shore-up", "heal-order"]);
const ULT_DOMAIN = { "rain-dance": "rain", "sunny-day": "sun", sandstorm: "sand", hail: "snow", snowscape: "snow", "trick-room": "trick-room",
  gravity: "trick-room", "tailwind": "tailwind", "electric-terrain": "electric-terrain", "psychic-terrain": "psychic-terrain",
  "grassy-terrain": "grassy-terrain", "misty-terrain": "misty-terrain" };
const ULT_SNARE = { spore: SLP, hypnosis: SLP, "sleep-powder": SLP, "dark-void": SLP, sing: SLP, "grass-whistle": SLP, "lovely-kiss": SLP,
  glare: PAR, "stun-spore": PAR, "mean-look": "trap", block: "trap", octolock: "trap", "perish-song": "perish" };
// Named ULTIs the game already had (by dex id): [name, archetype].
export const ULT_NAMES = { 25: ["Thunder", "Storm"], 26: ["Thunder", "Storm"], 145: ["Thunder", "Storm"], 135: ["Thunder", "Storm"],
  6: ["Blast Burn", "Nova"], 9: ["Hydro Cannon", "Cannon"], 3: ["Frenzy Plant", "Storm"], 150: ["Psystrike", "Cannon"],
  94: ["Shadow Storm", "Barrage"], 448: ["Aura Sphere", "Barrage"], 130: ["Hyper Beam", "Cannon"], 149: ["Outrage", "Onslaught"],
  143: ["Giga Impact", "Onslaught"], 384: ["Dragon Ascent", "Onslaught"], 248: ["Stone Edge", "Nova"], 445: ["Dragon Rush", "Onslaught"],
  658: ["Water Shuriken", "Barrage"], 282: ["Moonblast", "Cataclysm"], 257: ["Blaze Kick", "Onslaught"] };
// How many species learn each move by Lv 100 - a move three or fewer learn is a SIGNATURE. Counted once, when first asked.
let LEARNED = null;
const learnersOf = (i) => {
  if (!LEARNED) {
    LEARNED = new Map();
    for (const sp of SPECIES) if (sp.id <= 1025) for (const j of learnable(sp.id, 100, true)) LEARNED.set(j, (LEARNED.get(j) ?? 0) + 1);
  }
  return LEARNED.get(i) ?? 0;
};
const titled = (n) => n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
/* A move's ULTI archetype, or null when it is no ULTI. An attack is one at
   130 power or more, a signature at 90 or more, or a named storm. */
export function ultiArchetype(i) {
  const m = MOVES[i];
  if (!m) return null;
  if (ULT_FORTRESS.has(m.n)) return "Fortress";
  if (ULT_BARRIER.has(m.n)) return "Barrier";
  if (ULT_SANCT.has(m.n) && (m.h >= 50 || !m.h)) return "Sanctuary";
  if (ULT_DOMAIN[m.n]) return "Domain";
  if (ULT_SNARE[m.n] != null) return "Snare";
  if (m.c === 2 && m.sg && m.self && m.sg.reduce((n, [, k]) => n + Math.max(0, k), 0) >= 3) return "Awakening";
  if (!m.p || m.p <= 1) return null;
  const big = m.p >= 130 || (learnersOf(i) <= 3 && m.p >= 90) || ["hyper-beam", "giga-impact", "explosion", "self-destruct", "misty-explosion"].includes(m.n);
  if (!big && !ULT_STORM.has(m.n)) return null;
  return ultiShape(m);
}
const ultiShape = (m) => (["explosion", "self-destruct", "misty-explosion"].includes(m.n) ? "Sacrifice" : VANISH[m.n] ? "Phantom"
  : ULT_STORM.has(m.n) ? "Storm" : ({ beam: "Cannon", pulse: "Nova", multi: "Barrage", melee: "Onslaught", dash: "Onslaught" })[shapeOf(m)] ?? "Cataclysm");
const SUPPORT_ORDER = ["Sanctuary", "Fortress", "Barrier", "Awakening", "Domain", "Snare"];
/* A POKEMON'S ONE ULTI: { move (its MOVES index, -1 for a named one), name,
   arch, type, why }. Remembered per species. */
const PICKS = new Map();
export function ultiPick(id) {
  if (PICKS.has(id)) return PICKS.get(id);
  const sp = speciesById(id);
  const types = sp?.types ?? ["normal"];
  const named = ULT_NAMES[id] ?? ULT_NAMES[sp?.of];
  let pick = null;
  if (named) {
    const i = MOVES.findIndex((m) => titled(m.n) === named[0]);
    pick = { move: i, name: named[0], arch: named[1], type: i >= 0 ? MOVES[i].t : types[0], why: "named" };
  }
  if (!pick && sp) {
    // Its base stats' lean, not `speciesRole` (which asks this for its ULTI): which attacks to weigh.
    const st = sp.stats ?? [0, 1, 0, 1, 0, 0], physical = st[1] >= st[3];
    const can = learnable(id, 100, true);
    const sig = can.filter((i) => MOVES[i].p && learnersOf(i) <= 3 && MOVES[i].p >= 90 && ultiArchetype(i)).sort((a, b) => MOVES[b].p - MOVES[a].p)[0];
    // Its most ITS OWN support move first (fewest learners - King's Shield is Aegislash's), then by archetype.
    const support = can.filter((i) => SUPPORT_ORDER.includes(ultiArchetype(i)))
      .sort((a, b) => learnersOf(a) - learnersOf(b) || SUPPORT_ORDER.indexOf(ultiArchetype(a)) - SUPPORT_ORDER.indexOf(ultiArchetype(b)))[0];
    const atk = can.filter((i) => MOVES[i].p > 1 && shapeOf(MOVES[i]))
      .sort((a, b) => worthOf(MOVES[b]) - worthOf(MOVES[a]))[0];
    function worthOf(m) { return m.p * (types.includes(m.t) ? 1.5 : 1) * ((m.c === 0) === physical ? 1.2 : 1); }
    const as = (i, why) => ({ move: i, name: titled(MOVES[i].n), arch: ultiArchetype(i) ?? ultiShape(MOVES[i]), type: MOVES[i].t, why });
    if (sig != null) pick = as(sig, "signature");
    // A wall's ULTI protects; so does anyone's whose support move is its own (three or fewer learn it).
    else if (support != null && (Math.max(st[1], st[3]) < Math.max(st[2], st[4]) * 0.8 || learnersOf(support) <= 3)) pick = as(support, "support");
    else if (atk != null) pick = as(atk, "attack");
    else if (support != null) pick = as(support, "support");
  }
  if (!pick) pick = { move: -1, name: ULT_TYPE_NAME[types[0]] ?? "Ultimate", arch: "Nova", type: types[0], why: "type" };
  PICKS.set(id, pick);
  return pick;
}
// What a Pokemon's ULTI looses: its one pick (`kind` the archetype, lower-case, as the picture names it).
export function ultOf(f) {
  const u = ultiPick(f.id);
  return { name: u.name, kind: u.arch.toLowerCase(), arch: u.arch, type: u.type, move: u.move };
}
/* A ULTI's damage: a SHARE of the target's max HP, by type matchup (resisted
   0.6x, super effective 1.4x, doubly 1.6x) and by the two Pokemon's stats
   (its attack over the foe's matching defence, held to 0.8-1.3x). */
function ultDamage(a, d, m, eff, share) {
  const effK = eff >= 4 ? 1.6 : eff > 1 ? 1.4 : eff < 1 ? 0.6 : 1;
  const [as, ds] = m.c === 0 ? [1, 2] : [3, 4];
  const ratio = (a.st[as] * STAGE(a.stages[as])) / Math.max(1, d.st[ds] * STAGE(d.stages[ds]));
  return d.max * share * effK * clamp(0.75 + 0.25 * ratio, 0.8, 1.3);
}
// A Barrier dome its side stands in, and a terrain's lift for its side's moves.
const domeK = (s, d) => s.domes.find((dm) => dm.side === d.side && (d.x - dm.x) * (d.x - dm.x) + (d.y - dm.y) * (d.y - dm.y) < dm.r * dm.r)?.k ?? 1;
const TERRAIN_TYPE = { "electric-terrain": "electric", "psychic-terrain": "psychic", "grassy-terrain": "grass", "misty-terrain": "fairy" };
const domainHit = (s, a, t) => (s.domain && s.domain.side === a.side && TERRAIN_TYPE[s.domain.kind] === t ? 1.3 : 1);
const domainSpeed = (s, f) => (!s.domain ? 1 : s.domain.kind === "trick-room" ? (f.side === s.domain.side ? 1.3 : 0.7)
  : s.domain.kind === "tailwind" && f.side === s.domain.side ? 1.3 : 1);
function ultimate(s, side, f) {
  const u = ultOf(f);
  // Star Chronos (Dialga's chase card): its ULTI readies every move.
  if (hasSig(f, "chrono")) for (const m of f.kit) m.cd = 0;
  const move = ULT_BASE - TYPES.indexOf(u.type) * 2 - (roleOf(f) === "brawler" ? 0 : 1);   // its ULTI hits with its role's stat
  const d = activeOf(s, 1 - side);
  const tx = d ? d.x : W - f.x, ty = d ? d.y : f.y;
  s.ev.push({ k: "ult", side, name: u.name, kind: u.kind, arch: u.arch, type: u.type, id: f.id, x: f.x, y: f.y });
  const strike = (z) => s.strikes.push({ id: s.nextId++, side, from: f.slot, move, t0: z.t, type: u.type, arch: u.arch, ...z });
  const [dx, dy] = norm(tx - f.x, ty - f.y);
  switch (u.arch) {
    case "Cataclysm": strike({ x: tx, y: ty, t: ULT_WARN + sec(0.3), r: 1.6, follow: true, k: 0.35, big: true }); break;
    case "Storm":
      for (let n = 0; n < 3; n++) strike({ x: tx, y: ty, t: ULT_WARN + n * sec(0.45), r: 1.2, follow: true, k: 0.1 });
      for (let n = 0; n < 4; n++) strike({ x: X0 + 1 + rnd(s) * (X1 - X0 - 2), y: Y0 + 1 + rnd(s) * (Y1 - Y0 - 2), t: ULT_WARN + sec(0.2) + n * sec(0.3), r: 1.4, k: 0.05 });
      break;
    case "Cannon": strike({ x: f.x, y: f.y, dx: dx || 1, dy, t: ULT_WARN, beam: true, follow: true, k: 0.32 }); break;
    case "Nova": strike({ x: f.x, y: f.y, t: ULT_WARN, r: 4.5, nova: true, k: 0.3, kb: 2.2 }); break;
    case "Barrage":
      for (const sp of [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45]) { const [ax, ay] = turn(dx || 1, dy, sp); shoot(s, side, f, ax, ay, move, SHOT_RANGE * 1.2, false, 0.05); }
      break;
    case "Onslaught":
      f.inv = Math.max(f.inv, sec(1.4));
      for (let n = 0; n < 3; n++) strike({ x: tx, y: ty, t: sec(0.4) + n * sec(0.3), r: 1.1, follow: true, k: 0.12, rush: true, kb: n === 2 ? 2.4 : 0 });
      break;
    case "Phantom": vanish(s, side, f, move, "shadow"); Object.assign(s.strikes[s.strikes.length - 1], { k: 0.33, crit: true, arch: "Phantom" }); break;
    case "Sacrifice": strike({ x: f.x, y: f.y, t: sec(1), r: 6, nova: true, k: 0.6, kb: 2.5, sac: true }); break;
    case "Fortress": f.fortress = FORT_T; f.shield = Math.max(f.shield, FORT_T); f.inv = Math.max(f.inv, FORT_T); s.ev.push({ k: "fortress", side, x: f.x, y: f.y }); break;
    case "Barrier": s.domes.push({ id: s.nextId++, side, x: f.x, y: f.y, r: DOME_R, t: DOME_T, k: u.name === "Aurora Veil" ? VEIL_K : DOME_K }); s.ev.push({ k: "dome", side, x: f.x, y: f.y, r: DOME_R }); break;
    case "Sanctuary": {
      heal(s, f, Math.floor(f.max * SANCT_HEAL));
      if (f.status >= 0) { f.status = -1; f.badly = false; s.ev.push({ k: "cured", side }); }
      f.regen = SANCT_T;
      s.sides[side].team.forEach((b, k2) => { if (k2 !== s.sides[side].active && b.hp > 0) b.hp = Math.min(b.max, b.hp + Math.floor(b.max * SANCT_BENCH)); });
      s.ev.push({ k: "sanctuary", side, x: f.x, y: f.y });
      break;
    }
    case "Awakening": {
      // Its two best stats (of Atk, Def, SpA, SpD, Spe) to +2, and cooldowns running twice as fast.
      const best = [1, 2, 3, 4, 5].sort((a, b) => f.st[b] - f.st[a] || a - b).slice(0, 2);
      stages(s, f, best.map((st) => [st, 2]));
      for (const st of best) f.stageT[st] = AWAKE_T;
      f.awake = AWAKE_T; f.haste = Math.max(f.haste, AWAKE_T);
      s.ev.push({ k: "awaken", side, x: f.x, y: f.y });
      break;
    }
    case "Domain": {
      const kind = ULT_DOMAIN[MOVES[u.move]?.n] ?? "trick-room";
      const weather = ["rain", "sun", "sand", "snow"].includes(kind);
      const was = s.domain?.was ?? s.weather;
      s.domain = { kind, side, t: DOMAIN_T, was: weather ? was : null };
      if (weather) s.weather = kind;
      s.ev.push({ k: "domain", side, kind, x: f.x, y: f.y });
      break;
    }
    case "Snare": strike({ x: tx, y: ty, t: ULT_WARN, r: SNARE_R, k: 0, snare: ULT_SNARE[MOVES[u.move]?.n] ?? SLP }); break;
  }
}
/* An ULTI's strikes: each shows where it will land, follows its target
   until ULT_LOCK before it does, then lands - a blast, or a cannon's beam. */
function stepStrikes(s) {
  s.strikes = s.strikes.filter((z) => {
    const a = s.sides[z.side].team[z.from], d = activeOf(s, 1 - z.side);
    if (z.follow && z.t > ULT_LOCK && d && d.hp > 0) {
      if (z.beam) { const at = activeOf(s, z.side); if (at) { z.x = at.x; z.y = at.y; } [z.dx, z.dy] = norm(d.x - z.x, d.y - z.y); if (!z.dx && !z.dy) z.dx = 1; }
      else { z.x = d.x; z.y = d.y; }
    }
    if (--z.t > 0) return true;
    if (z.vanish) {
      // Back on the court, on the spot it marked - unless it fell while it was gone.
      a.away = null;
      if (a.hp <= 0) return false;
      a.x = a.px = clamp(z.x, X0, X1); a.y = a.py = clamp(z.y, Y0, Y1);
      a.inv = 0;
      pushOut(s, a);
    }
    if (z.snare != null) {
      // A SNARE lands: whoever it caught sleeps, is paralysed, is trapped - or Perish Song starts counting for everyone.
      s.ev.push({ k: "snare", side: z.side, x: z.x, y: z.y, r: z.r, what: z.snare });
      if (z.snare === "perish") { s.perish = PERISH_T; return false; }
      if (d && d.hp > 0 && !d.away && (d.x - z.x) * (d.x - z.x) + (d.y - z.y) * (d.y - z.y) < (z.r + R) * (z.r + R)) {
        if (z.snare === "trap") s.sides[1 - z.side].trapT = TRAP_T; else afflict(s, d, z.snare, false, sec(2));
      }
      return false;
    }
    if (z.rush && a.hp > 0) {
      // ONSLAUGHT: its user is there with each blow, from alternate sides.
      const sideX = (z.t0 / sec(0.3)) % 2 ? 1 : -1;
      a.x = a.px = clamp(z.x - sideX * 1.1, X0, X1); a.y = a.py = z.y;
      s.ev.push({ k: "rush", side: z.side, x: a.x, y: a.y, tx: z.x, ty: z.y });
    }
    if (z.beam) beamAt(s, z.side, a, z.x, z.y, z.dx, z.dy, z.move, BEAM_W * 2.6, BEAM_LEN * 1.7, z.k, true);
    else {
      s.ev.push({ k: "strike", side: z.side, x: z.x, y: z.y, r: z.r, nova: Boolean(z.nova), move: z.move, vanish: z.vanish ?? null, big: Boolean(z.big || z.sac), arch: z.arch ?? null });
      blast(s, a, z.x, z.y, z.r, z.move, z.k);
      // A Nova, a Sacrifice, the last blow of an Onslaught: whoever it hit is hurled - into a wall-splat if there is one.
      if (z.kb && d && d.hp > 0 && !d.inv && (d.x - z.x) * (d.x - z.x) + (d.y - z.y) * (d.y - z.y) <= (z.r + R) * (z.r + R)) {
        const [kx, ky] = norm(d.x - (z.rush ? a.x : z.x) || 1, d.y - (z.rush ? a.y : z.y));
        d.kbx = kx * z.kb / KB; d.kby = ky * z.kb / KB; d.kbt = KB;
      }
    }
    if (z.sac && a.hp > 1) { a.hp = 1; s.ev.push({ k: "sacrifice", side: z.side, x: a.x, y: a.y }); }
    return false;
  });
}
const weatherK = (s, t) => (s.weather === "rain" ? (t === "water" ? 1.5 : t === "fire" ? 0.5 : 1)
  : s.weather === "sun" ? (t === "fire" ? 1.5 : t === "water" ? 0.5 : 1) : 1);
/* The match's planned events: the flyover and its drop, the lights. */
function stepEvents(s) {
  if (s.t === s.plan.fly) s.ev.push({ k: "flyover", dir: s.plan.dir });
  if (s.plan.fly >= 0 && s.t === s.plan.fly + FLY_DROP) {
    s.items.push({ id: s.nextId++, kind: "full-restore", x: W / 2, y: H / 2, t: RARE_LIFE });
    s.ev.push({ k: "drop", x: W / 2, y: H / 2 });
  }
  if (s.t === s.plan.dark) { s.dark = DARK_T; s.ev.push({ k: "dark" }); }
  else if (s.dark > 0 && --s.dark === 0) { s.white = false; s.ev.push({ k: "light" }); }
  if (s.t === s.plan.floor) floorEvent(s);
  s.domes = s.domes.filter((dm) => --dm.t > 0);
  s.throws = s.throws.filter((th) => {
    if (--th.t > 0) return true;
    const d = activeOf(s, th.side);
    if (d && d.hp > 0) { d.kbx = th.dx * THROW_DIST / KB; d.kby = th.dy * THROW_DIST / KB; d.kbt = KB; s.ev.push({ k: "throw", side: th.side, x: d.x, y: d.y, dx: th.dx, dy: th.dy }); }
    return false;
  });
  s.fires = s.fires.filter((fl) => {
    if (fl.t % FIRE_TICK === 0) {
      const d = activeOf(s, 1 - fl.side);
      if (d && d.hp > 0 && d.inv <= 0 && !d.away && (d.x - fl.x) * (d.x - fl.x) + (d.y - fl.y) * (d.y - fl.y) < (FIRE_R + R) * (FIRE_R + R)) {
        const k = effectiveness("fire", d.types);
        if (k > 0) { hurt(s, d, Math.max(1, Math.floor(d.max / 60 * k)), null); if (rnd(s) < 0.1) afflict(s, d, BRN); }
      }
    }
    return --fl.t > 0;
  });
  if (s.domain && --s.domain.t <= 0) {
    if (s.domain.was) s.weather = s.domain.was;
    s.ev.push({ k: "domainEnd", kind: s.domain.kind });
    s.domain = null;
  } else if (s.domain?.kind === "grassy-terrain" && s.t % TPS === 0) {
    const f = activeOf(s, s.domain.side);
    if (f && f.hp > 0) heal(s, f, Math.max(1, Math.floor(f.max * 0.01)));
  }
  if (s.perish > 0 && --s.perish === 0) {
    for (let side = 0; side < 2; side++) { const f = activeOf(s, side); if (f && f.hp > 1) { f.hp = 1; s.ev.push({ k: "perish", side, x: f.x, y: f.y }); } }
  }
  if (s.tide > 0 && --s.tide === 0) s.ev.push({ k: "ebb" });
  if (s.erupt > 0) {
    if (s.erupt % ERUPT_EVERY === 0) {
      const x = X0 + 1 + rnd(s) * (X1 - X0 - 2), y = Y0 + 1 + rnd(s) * (Y1 - Y0 - 2);
      for (const [px, py] of [[x, y], [W - x, H - y]]) s.drops.push({ x: px, y: py, t: LAVA_WARN, lava: true });
    }
    s.erupt--;
  }
  // A stampede: the lane is shown, then the herd runs it and tramples whoever is in it.
  s.lanes = s.lanes.filter((l) => {
    if (--l.t <= 0) return false;
    if (l.t > LANE_RUN) return true;
    const hx = herdAt(l);
    for (let side = 0; side < 2; side++) {
      const f = activeOf(s, side);
      if (!f || f.hp <= 0 || f.inv > 0 || l.hit[side] || Math.abs(f.y - l.y) > LANE_H / 2 || Math.abs(f.x - hx) > 1.2) continue;
      l.hit[side] = true;
      hurt(s, f, Math.max(1, Math.floor(f.max / 8 * effectiveness("normal", f.types))), null);
      const out = f.y >= l.y ? 1 : -1;
      f.kbx = l.dir * 1.5 / KB; f.kby = out * 1.2 / KB; f.kbt = KB;
      f.stun = Math.max(f.stun, sec(0.5));
      s.ev.push({ k: "trample", side, x: f.x, y: f.y });
    }
    return true;
  });
}
function floorEvent(s) {
  const kind = FLOOR_EVENT[s.arena];
  s.ev.push({ k: "floor", kind });
  if (kind === "roar") for (let side = 0; side < 2; side++) gain(s, side, ROAR_GAIN);
  else if (kind === "moonstone") s.items.push({ id: s.nextId++, kind: "moon-stone", x: W / 2, y: H / 2, t: RARE_LIFE });
  else if (kind === "tide") s.tide = TIDE_T;
  else if (kind === "eruption") s.erupt = ERUPT_T;
  else if (kind === "stampede") s.lanes.push({ y: Y0 + 2 + rnd(s) * (Y1 - Y0 - 4), dir: rnd(s) < 0.5 ? 1 : -1, t: LANE_WARN + LANE_RUN, hit: [false, false] });
  else if (kind === "whiteout") { s.dark = WHITE_T; s.white = true; }
}
function gain(s, side, n) {
  const sd = s.sides[side], was = sd.meter;
  const f = sd.team[sd.active];
  sd.meter = Math.min(SURGE_MAX, sd.meter + n * (finalMinute(s) ? FINAL_GAIN : 1) * (1 + (f?.cp.ult ?? 0) + (f && hasSig(f, "embrace") ? 0.5 : 0)));
  if (was < SURGE_MAX && sd.meter >= SURGE_MAX) s.ev.push({ k: "ready", side });
}

function hit(s, a, d, move, dx, dy, contact, hx = d.x, hy = d.y, boost = 1, part = 1) {
  if (d.away) return;
  // Struck in its wind-up: a COUNTER (the picture calls it; the rules already cancel the move).
  const counter = d.act?.ph === "wind" && d.act.k !== BASIC_K;
  if (d.inv > 0) {
    // A FORTRESS throws a blow back hard: its attacker hurt and hurled off.
    if (d.fortress > 0 && contact && a.hp > 0 && !a.away) {
      hurt(s, a, Math.max(1, Math.floor(a.max * FORT_HURT)), null);
      const [kx, ky] = norm(a.x - d.x || 1, a.y - d.y);
      a.kbx = kx * 2 / KB; a.kby = ky * 2 / KB; a.kbt = KB;
      a.stun = Math.max(a.stun, sec(0.4));
      s.ev.push({ k: "parry", side: d.side, x: d.x, y: d.y, tx: a.x, ty: a.y });
    }
    // Blocked as it raised its shield: a PERFECT BLOCK throws the hit back on its attacker.
    if (d.shield > SHIELD - PARRY_T && a.hp > 0 && !a.away) {
      hurt(s, a, Math.max(1, Math.floor(a.max / PARRY_HURT)), null);
      a.stun = Math.max(a.stun, PARRY_STUN);
      if (a.act?.ph === "wind") a.act = null;
      s.ev.push({ k: "parry", side: d.side, x: d.x, y: d.y, tx: a.x, ty: a.y });
    }
    // Rolled THROUGH it: a perfect dodge, paid in Surge.
    const perfect = !d.shield && d.dodge > 0;
    if (perfect) { gain(s, d.side, GAIN_DODGE); s.sides[d.side].stats.perfect++; }
    s.ev.push({ k: d.shield ? "blocked" : "evade", side: d.side, x: d.x, y: d.y, perfect });
    return;
  }
  if (hasSig(d, "phase") && rnd(s) < 0.2) { s.ev.push({ k: "evade", side: d.side, x: d.x, y: d.y, perfect: false }); return; }
  const m = BASIC[move] ? { ...BASIC[move], t: TYPES[a.types[0]] } : arenaMove(move);
  const eff = effectiveness(m.t, d.types);
  if (eff === 0) { s.ev.push({ k: "immune", side: d.side, x: d.x, y: d.y }); return; }
  const slot = BASIC[move] ? -1 : a.kit.findIndex((km) => km.i === move);
  const combo = slot >= 0 && a.comboT > s.t && slot === payoffSlot(a.kit.map((km) => km.i));
  let dmg = 0;
  if (m.p) {
    const crit = rnd(s) < CRIT[Math.min(3, (m.cr ?? 0) + (a.perk?.crit ?? 0) + (hasSig(a, "victory") ? 1 : 0))];
    const roll = 0.85 + rnd(s) * (a.perk?.roll ?? 0.15);
    // A multi-shot's every shot is one of its hits; a pulse or a blow carries the average.
    const hits = shapeOf(m) === "multi" || !m.hits ? 1 : (m.hits[0] + m.hits[1]) / 2;
    const shock = m.t === "electric" && d.wet > 0;
    const guard = (helping(s, d.side, "mr-mime") ? SCREEN_K : 1) * domeK(s, d) * domainHit(s, a, m.t);
    dmg = isUlt(move) ? ultDamage(a, d, m, eff, boost) * weatherK(s, m.t) * guard
      : rawDamage(a, d, m, crit) * (crit ? 1.5 : 1) * roll * hits * DAMAGE * boost * (a.surge > 0 ? SURGE_DMG : 1) * (a.power > 0 ? X_ATTACK : 1)
      * (finalMinute(s) ? FINAL_DMG : 1) * weatherK(s, m.t) * (shock ? SHOCK : 1)
      * (contact && roleOf(a) === "brawler" ? BRAWL_HIT : 1) * (!contact && roleOf(d) === "brawler" ? BRAWL_GUARD : 1)
      * (helping(s, a.side, "plusle") ? HELP_HIT : 1) * guard * (combo ? COMBO_DMG : 1) * (a.tag ? TAG_HIT : 1);
    dmg *= (1 + a.cp.dmg) * (1 - d.cp.guard) * sigK(s, a, d, m, move, contact);
    dmg = Math.max(1, Math.floor(isUlt(move) ? dmg : Math.min(dmg, d.max * HIT_CAP)));
    // Star Requiem (Giratina's): its ULTI finishes a foe under a quarter of its HP.
    if (isUlt(move) && hasSig(a, "requiem") && d.hp <= d.max / 4) dmg = d.hp;
    d.regen = 0;
    d.hp = Math.max(0, d.hp - dmg);
    d.hitAt = s.t;
    a.xp += (dmg / d.max + (d.hp === 0 ? EVO_XP : 0)) * (hasSig(a, "splash") ? 2 : 1) * (evoTargets(a.id).length ? EVO_FAST : 1);
    const st = s.sides[a.side].stats;
    st.dealt += dmg; st.hits++; st.chain++; st.best = Math.max(st.best, st.chain);
    s.sides[d.side].stats.chain = 0;
    gain(s, a.side, GAIN_DEAL * dmg / d.max); gain(s, d.side, GAIN_TAKE * dmg / d.max);
    // Inner Focus (Umbreon's): never staggered.
    d.flash = sec(0.08); if (!hasSig(d, "focus") && part === 1) d.stun = Math.max(d.stun, STUN);
    if (combo) {
      a.comboT = 0;
      if (!hasSig(d, "focus")) d.stun = Math.max(d.stun, COMBO_STUN);
      s.ev.push({ k: "combo", side: a.side, x: hx, y: hy });
    }
    const push = (contact ? (m.p ?? 40) / 40 : 0.25) * part;
    d.kbx = dx * push / KB; d.kby = dy * push / KB; d.kbt = KB;
    if (contact && GRABS.has(m.n) && d.hp > 0) {
      // Caught: pulled in, held, then thrown along the blow.
      d.kbx = -dx * 0.5 / KB; d.kby = -dy * 0.5 / KB;
      d.stun = Math.max(d.stun, GRAB_T + sec(0.35));
      s.throws.push({ side: d.side, t: GRAB_T, dx, dy });
      s.ev.push({ k: "grab", side: a.side, x: a.x, y: a.y, tx: d.x, ty: d.y, move });
    }
    if (d.act?.ph === "wind" && !hasSig(d, "focus")) d.act = null;     // a hit interrupts a wind-up
    // Sleep breaks on a hit after its first second; a Fire hit thaws.
    if (d.status === SLP && s.t - d.sleptAt > sec(1)) { d.status = -1; s.ev.push({ k: "cured", side: d.side }); }
    if (d.status === FRZ && m.t === "fire") { d.status = -1; s.ev.push({ k: "cured", side: d.side }); }
    if (m.fl && !hasSig(d, "focus") && rnd(s) * 100 < m.fl * part) { d.stun = Math.max(d.stun, FLINCH); s.ev.push({ k: "flinch", side: d.side }); }
    if (CONFUSES[m.n] && d.hp > 0 && rnd(s) * 100 < CONFUSES[m.n] * part) { d.confused = CONFUSE_T; s.ev.push({ k: "confused", side: d.side, x: d.x, y: d.y }); }
    // Water on a burn: the burn goes out in steam that hides whoever stands in it. Water soaks; a shock dries.
    if (m.t === "water") {
      if (d.status === BRN) {
        d.status = -1; s.ev.push({ k: "cured", side: d.side });
        s.clouds.push({ id: s.nextId++, x: d.x, y: d.y, t: STEAM_T });
        s.ev.push({ k: "steam", side: d.side, x: d.x, y: d.y });
      }
      d.wet = Math.max(d.wet, WET_T);
    }
    if (shock && s.weather !== "rain") d.wet = 0;
    // Golden Flame leaves fire where it hits (G-Max Wildfire every time); Golden Spring heals on a knockout; Golden Venom's basics poison.
    if (d.hp > 0 && (hasSig(a, "wildfire") || (a.cp.flame && rnd(s) < FLAME_P))) {
      if (s.fires.length >= FIRE_MAX) s.fires.shift();
      s.fires.push({ x: d.x, y: d.y, t: FIRE_T, side: a.side });
    }
    if (a.cp.spring && d.hp === 0) heal(s, a, Math.floor(a.max * SPRING_K));
    if (a.cp.venom && BASIC[move] && d.hp > 0 && rnd(s) < VENOM_P) afflict(s, d, PSN);
    // The chase cards' signatures that ride a hit.
    if (d.hp > 0) {
      if (m.t === "fire" && hasSig(a, "classicburn") && rnd(s) < 1 / 3) afflict(s, d, BRN);
      if (hasSig(a, "void") && rnd(s) < 0.1) afflict(s, d, SLP);
      if (BASIC[move] && hasSig(a, "lick") && rnd(s) < 1 / 7) afflict(s, d, PAR);
      if (m.t === "electric" && hasSig(a, "static") && rnd(s) < 0.25) afflict(s, d, PAR);
      if (hasSig(a, "terror")) s.sides[d.side].trapT = Math.max(s.sides[d.side].trapT, sec(3));
      if (a.fresh && hasSig(a, "fakeout") && !hasSig(d, "focus")) d.stun = Math.max(d.stun, sec(0.6));
      if (hasSig(d, "core") && !d.coreUsed && d.hp < d.max * 0.3) { d.coreUsed = true; heal(s, d, Math.floor(d.max / 3)); }
    }
    a.fresh = false;
    if (hasSig(a, "lost")) hurt(s, a, Math.max(1, Math.floor(dmg / 10)));
    if (m.dr > 0) heal(s, a, Math.floor(dmg * m.dr / 100));
    if (m.dr < 0) hurt(s, a, Math.max(1, Math.floor(dmg * -m.dr / 100)));
    // Where it came from and how hard, for the picture alone (events are not in the replay hash).
    s.ev.push({ k: "hit", side: d.side, x: hx, y: hy, dmg, crit, eff, move, heavy: (m.p ?? 0) >= 90 || crit || a.surge > 0 || boost > 1, dx, dy, frac: dmg / d.max, ko: d.hp <= 0, surge: a.surge > 0, basic: Boolean(BASIC[move]), boost: boost > 1, counter, shock, ult: move <= ULT_BASE });
  } else {
    s.ev.push({ k: "touch", side: d.side, x: hx, y: hy, move });
  }
  if (m.st != null && rnd(s) * 100 < (m.p ? (m.stc ?? 0) * (1 + a.cp.status) * part : 100)) afflict(s, d, m.st, m.n === "toxic");
  if (m.sg && !m.sgu && !m.self && rnd(s) * 100 < (m.sgc ?? 100) * part) stages(s, d, m.sg);
  if (slot === CONTROL && d.hp > 0) openCombo(s, a);
}

// A tag's arrival: its basic attack, TAG_HIT over, on a foe within reach.
function tagIn(s, side, f) {
  const foe = activeOf(s, 1 - side);
  if (!foe || foe.hp <= 0 || foe.away) return;
  const ex = foe.x - f.x, ey = foe.y - f.y;
  if (ex * ex + ey * ey > TAG_RANGE * TAG_RANGE) return;
  const [dx, dy] = norm(ex || f.fx, ey);
  f.fx = dx; f.fy = dy;
  s.ev.push({ k: "tag", side, x: f.x, y: f.y, tx: foe.x, ty: foe.y });
  f.tag = true;
  hit(s, f, foe, f.basic.i, dx, dy, basicShape(f) === "melee", foe.x, foe.y);
  f.tag = false;
  if (foe.hitAt === s.t && !hasSig(foe, "focus")) foe.stun = Math.max(foe.stun, TAG_STUN);
}

// The ring's burn: outside it, a share of HP every half second.
function stepRing(s) {
  const r = ringOf(s);
  if (!r || s.t % (TPS / 2)) return;
  for (let side = 0; side < 2; side++) {
    const f = activeOf(s, side);
    if (f && f.hp > 0 && !f.away && outsideRing(r, f)) hurt(s, f, Math.max(1, Math.floor(f.max * RING_HURT / 2)));
  }
}

function settleKO(s, side) {
  const sd = s.sides[side];
  if (sd.koT > 0) {
    if (--sd.koT === 0) {
      const next = sd.team.findIndex((f) => f.hp > 0);
      const from = sd.team[sd.active], to = sd.team[next];
      Object.assign(to, { x: from.x, y: from.y, px: from.x, py: from.y, inv: to.cp.aegis ? AEGIS_T : SWAP_INV, act: null, fresh: true });
      sd.active = next;
      s.ev.push({ k: "in", side, slot: next });
    }
    return;
  }
  if (sd.swapT > 0) return;
  const f = sd.team[sd.active];
  if (f.hp > 0) return;
  s.ev.push({ k: "ko", side, slot: sd.active, x: f.x, y: f.y });
  f.act = null; f.status = -1; f.surge = 0;
  if (!alive(sd).length) {
    s.over = true; s.winner = 1 - side; s.why = "knockout";
    return;
  }
  sd.koT = KO_WAIT;
}

function suddenDeath(s) {
  s.sudden = true;
  for (const sd of s.sides) for (const f of sd.team) if (f.hp > 0) { f.hp = 1; f.status = -1; f.badly = false; }
  s.ev.push({ k: "sudden" });
}

// The clock: more Pokemon left wins, then more of their HP.
function timeUp(s) {
  const score = (sd) => [alive(sd).length, sd.team.reduce((n, f) => n + f.hp / f.max, 0)];
  const [a, b] = s.sides.map(score);
  s.over = true; s.why = "time";
  s.winner = a[0] !== b[0] ? (a[0] > b[0] ? 0 : 1) : a[1] !== b[1] ? (a[1] > b[1] ? 0 : 1) : -1;
}

// ------------------------------------------------------------------ the CPU

/* THE CPU PLAYS THROUGH THE SAME INPUT a person does, so it obeys the same
   cooldowns and dodges. A level only changes how human it is: how late it
   sees a wind-up, how far off its aim is, how often it rolls. */
export const LEVELS = {
  dummy: { react: 0, err: 0, dodge: 0 },
  /* `surge`: how close the foe must be before it spends a full meter. Easy
     never does, and misses more: with Surge (a comeback for whoever is being
     hit) Normal beat the old Easy 64% of 40 matches; this Easy, 78%. */
  // `jab`: how often it takes a basic attack it could (1 when unsaid). Easy swings at half its chances.
  easy: { react: sec(0.5), err: 0.45, dodge: 0.08, jab: 0.5 },
  normal: { react: sec(0.3), err: 0.18, dodge: 0.4, swap: 0.25, surge: 3, items: true },
  hard: { react: sec(0.18), err: 0.07, dodge: 0.7, swap: 0.35, lead: true, shield: true, zones: true, surge: 3.5, items: true, mega: true },
  // The Arena Ladder's top masters (ladder.js): faster, surer, and it takes the zones.
  champion: { react: sec(0.14), err: 0.03, dodge: 0.8, swap: 0.35, lead: true, shield: true, zones: true, surge: 3.5, items: true, mega: true },
};

// How far each shape reaches, for choosing where to stand and when to throw.
const reachOf = (shape) => ({ shot: SHOT_RANGE * 0.75, multi: SHOT_RANGE * 0.6, beam: BEAM_LEN * 0.9,
  melee: MELEE_RANGE + R * 0.5, dash: DASH_DIST + 0.4, pulse: PULSE_R + R * 0.5, field: PLACE + 1, self: 99 })[shape] ?? 2;

/* What a move is worth now, to the CPU: damage by the League's own estimate;
   a status shot when the foe has none; a buff when it has none running; a
   heal when it is low; a hazard early; a shield never (it is reactive). */
function worth(me, foe, m) {
  const data = arenaMove(m.i);
  const shape = shapeOf(data);
  if (data.p) return expected(me, foe, m.i);
  const base = Math.max(1, ...me.kit.filter((k) => arenaMove(k.i).p).map((k) => expected(me, foe, k.i))) * 0.7;
  if (SHIELDS.has(data.n)) return 0;
  if (data.n === "rest") return me.hp / me.max < 0.3 ? base * 1.5 : 0;
  if (shape === "self") {
    if (data.h) return me.hp / me.max < 0.45 ? base * 1.3 : 0;
    return data.sg?.every(([st]) => me.stageT[st] > 0) ? 0 : base * 0.9;
  }
  if (shape === "field") return base * 0.6;
  if (data.st != null) return foe.status === -1 && !immuneTo(foe, data.st) ? base : 0;
  if (data.sg) return data.sg.every(([st]) => foe.stageT[st] > 0) ? 0 : base * 0.5;
  return 0;
}

function cpuInput(s, side) {
  const c = s.sides[side].cpu, L = LEVELS[c.level] ?? LEVELS.normal;
  const me = activeOf(s, side), foe = activeOf(s, 1 - side);
  if (!me || me.away) return NO_INPUT;
  if (c.level === "dummy") {
    // Wanders a slow square and never attacks: something to hit.
    const k = (s.t % (TPS * 8)) / (TPS * 8);
    return { ...NO_INPUT, mx: k < 0.25 ? 1 : k < 0.5 ? 0 : k < 0.75 ? -1 : 0, my: k < 0.25 ? 0 : k < 0.5 ? 1 : k < 0.75 ? 0 : -1 };
  }
  if (!foe) return { ...NO_INPUT, mx: (W / 2 - me.x) > 0 ? 1 : -1 };
  if (L.mega && megaOf(me) && !s.sides[side].megaUsed && megaReady(s) && !me.act && !me.evo) return { ...NO_INPUT, mega: true };
  // A stampede's lane shown under it: off it, the short way.
  const lane = s.lanes.find((l) => l.t > LANE_RUN && Math.abs(me.y - l.y) < LANE_H / 2 + 0.4);
  if (lane && L.react) return { ...NO_INPUT, my: me.y >= lane.y ? 1 : -1 };
  /* A foe in tall grass is where it was last seen: the CPU goes there and
     holds its fire. */
  const gap = Math.abs(foe.x - me.x) + Math.abs(foe.y - me.y);
  const unseen = (foe.hidden && gap >= 2) || (s.dark > 0 && gap > DARK_SEE);
  if (!unseen) { c.lx = foe.x; c.ly = foe.y; }
  if (unseen) {
    const gx = c.lx - me.x, gy = c.ly - me.y;
    return { ...NO_INPUT, mx: gx, my: gy, ax: gx, ay: gy };
  }
  /* Double Team's copies: the CPU takes one of the three for the real one,
     and thinks again every second or so. */
  let aimX = foe.x, aimY = foe.y;
  if (foe.clones.length) {
    if (c.decoy == null || c.decoy >= foe.clones.length || s.t % sec(1.2) === 0) c.decoy = Math.floor(rnd(s) * (foe.clones.length + 1)) - 1;
    if (c.decoy >= 0) [aimX, aimY] = clonesOf(foe)[c.decoy];
  } else c.decoy = -1;
  // An ULTI's strike about to land on it: rolled out of, at its odds.
  const threat = s.strikes.find((z) => z.side !== side && !z.beam && z.t <= L.react + sec(0.2) && c.rolled !== z.id
    && (z.x - me.x) * (z.x - me.x) + (z.y - me.y) * (z.y - me.y) < (z.r + R + 0.4) * (z.r + R + 0.4));
  if (threat) {
    c.rolled = threat.id;
    if (me.dodgeCd === 0 && rnd(s) < L.dodge) {
      const [ox, oy] = norm(me.x - threat.x || 1, me.y - threat.y);
      return { ...NO_INPUT, mx: ox, my: oy, dodge: true };
    }
  }
  const ex = aimX - me.x, ey = aimY - me.y, dist = Math.sqrt(ex * ex + ey * ey) || 1;
  const ux = ex / dist, uy = ey / dist;
  if (L.surge && s.sides[side].meter >= SURGE_MAX && !me.act && dist < L.surge) return { ...NO_INPUT, surge: true, ax: ex, ay: ey };

  /* AN ATTACK AIMED AT ME: a stream pouring my way, a lunge or a blow under
     way, or a shot in flight toward me (with no wind-up, what it can read is
     what is already coming) - seen after its reaction time, rolled from (or
     shielded) at its odds. */
  const incoming = s.shots.find((p) => p.side !== side && c.dodged !== p.id
    && (p.x - me.x) * (p.x - me.x) + (p.y - me.y) * (p.y - me.y) < 3.5 * 3.5
    && (p.dx * (me.x - p.x) + p.dy * (me.y - p.y)) > 0.92 * Math.sqrt((p.x - me.x) * (p.x - me.x) + (p.y - me.y) * (p.y - me.y)));
  const fa = incoming ? { id: incoming.id, dx: incoming.dx, dy: incoming.dy, shape: "shot", ph: "wind" }
    : foe.act && foe.act.ph !== "rec" && !foe.act.basic ? foe.act : null;
  if (fa && c.dodged !== fa.id && ((fa.dx * -ux + fa.dy * -uy) > 0.85 || fa.shape === "pulse")) {
    if (c.seenId !== fa.id) { c.seen = s.t; c.seenId = fa.id; }
    if (s.t - c.seen >= L.react) {
      c.dodged = fa.id;
      if (me.dodgeCd === 0 && rnd(s) < L.dodge) {
        const way = rnd(s) < 0.5 ? 1 : -1;
        const away = fa.shape === "pulse" ? 1 : 0;
        return { ...NO_INPUT, mx: -uy * way - ux * away, my: ux * way - uy * away, dodge: true };
      }
      if (L.shield && !me.act) {
        const k = me.kit.findIndex((m) => SHIELDS.has(arenaMove(m.i).n) && !m.cd);
        if (k >= 0) return { ...NO_INPUT, fire: k };
      }
    }
  }
  // Switch out when low, if a teammate is healthier.
  const sd = s.sides[side];
  if (L.swap && me.hp / me.max < L.swap && sd.swapCd === 0 && !me.act && s.t % 30 === 0) {
    const best = sd.team.map((f, i) => [f.hp / f.max, i]).filter(([h, i]) => i !== sd.active && h > 0.5)
      .sort((a, b) => b[0] - a[0])[0];
    if (best && rnd(s) < 0.5) return { ...NO_INPUT, swap: best[1] };
  }
  /* The move worth most now, among those ready - and the CPU goes to ITS
     range: in for a blow, out to a shot's distance. Choosing only among
     moves already in reach left a mixed kit standing at range with its
     blows never usable, firing once in ten seconds. */
  let pick = -1, bestV = 0;
  me.kit.forEach((m, k) => {
    if (m.cd) return;
    const v = worth(me, foe, m);
    if (v > bestV) { bestV = v; pick = k; }
  });
  const shapeAt = (k) => shapeOf(arenaMove(me.kit[k].i));
  const reach = pick >= 0 ? reachOf(shapeAt(pick)) : 4;
  // Nothing ready: in to the basic attack's reach, a jab's or a bolt's.
  const basicReach = basicShape(me) === "melee" ? MELEE_RANGE + R * 0.5 : BASIC_RANGE * 0.8;
  const want = pick < 0 ? basicReach - 0.4 : Math.min(reach - 0.4, ["shot", "beam", "multi"].includes(shapeAt(pick)) ? 4.5 : reach - 0.4);
  if (s.t % (TPS * 2) === 0) c.strafe = rnd(s) < 0.5 ? 1 : -1;
  const toward = dist > want + 0.4 ? 1 : dist < want - 0.8 ? -1 : 0;
  let mx = ux * toward - uy * c.strafe * 0.6, my = uy * toward + ux * c.strafe * 0.6;
  // A held X item: X Attack in reach of the foe, X Speed at once, X Defense against a wind-up aimed at it.
  const hi = s.sides[side].held;
  if (hi && L.items && !me.act && (hi === "x-speed" || (hi === "x-attack" && dist < 4)
    || (hi === "x-defense" && fa && (fa.dx * -ux + fa.dy * -uy) > 0.85))) return { ...NO_INPUT, use: true };
  // Nothing ready, and a power-up nearer than the foe: the CPU goes for it.
  if (L.items && pick < 0 && !me.act) {
    const near = s.items.filter((it) => !(PICKUPS[it.kind].held && hi) && (it.kind !== "revive" || downed(s.sides[side]).length))
      .map((it) => [(it.x - me.x) * (it.x - me.x) + (it.y - me.y) * (it.y - me.y), it]).sort((a, b) => a[0] - b[0])[0];
    if (near && near[0] < 25 && near[0] < dist * dist) { mx = near[1].x - me.x; my = near[1].y - me.y; }
  }
  // An open zone it has not claimed this cycle: the CPU goes and takes it.
  const z = s.zone;
  if (L.zones && z.open && !z.claimed[side]) {
    const d2 = ([x, y]) => (x - me.x) * (x - me.x) + (y - me.y) * (y - me.y);
    const [zx, zy] = d2(ZONE_AT[0]) <= d2(ZONE_AT[1]) ? ZONE_AT[0] : ZONE_AT[1];
    mx = zx - me.x; my = zy - me.y;
  }
  // Off the walls: a corner is where a strafing CPU used to end up and stay.
  const edge = INSET + 1.3;
  if (me.x < edge) mx += 1; else if (me.x > W - edge) mx -= 1;
  if (me.y < edge) my += 1; else if (me.y > H - edge) my -= 1;
  // Inside the closing ring, with a step to spare.
  const ring = ringOf(s);
  if (ring) {
    if (me.x < ring[0] + 0.6) mx = 2; else if (me.x > ring[2] - 0.6) mx = -2;
    if (me.y < ring[1] + 0.6) my = 2; else if (me.y > ring[3] - 0.6) my = -2;
  }
  // On the way, anything ready that reaches now is thrown.
  if (pick >= 0 && dist > reach) {
    let now = -1, nowV = 0;
    me.kit.forEach((m, k) => {
      if (m.cd || dist > reachOf(shapeAt(k))) return;
      const v = worth(me, foe, m);
      if (v > nowV) { nowV = v; now = k; }
    });
    pick = now;
  }
  if (pick < 0 && !me.act && me.basic.cd === 0 && dist <= basicReach + 0.3 && rnd(s) < (L.jab ?? 1)
    && (basicShape(me) === "melee" || !blocked(s, me.x, me.y, foe.x, foe.y))) {
    const off = (rnd(s) * 2 - 1) * L.err;
    return { ...NO_INPUT, mx, my, ax: ux - uy * off, ay: uy + ux * off, basic: true };
  }
  // A stream is held and steered after its target - a CPU that leads its shots holds it to the end, the rest let go early.
  if (me.act) {
    const pour = me.act.ph === "chan" && (L.lead || me.act.t > STREAM_MAX / 3);
    return { ...NO_INPUT, mx, my, ax: ex, ay: ey, hold: pour ? me.act.k : -1 };
  }
  if (pick < 0) return { ...NO_INPUT, mx, my, ax: ex, ay: ey };
  // A shot or a beam into cover is a shot at the cover: step round it instead.
  if (["shot", "beam", "multi"].includes(shapeAt(pick)) && blocked(s, me.x, me.y, foe.x, foe.y)) {
    return { ...NO_INPUT, mx: -uy * c.strafe + ux * 0.3, my: ux * c.strafe + uy * 0.3, ax: ex, ay: ey };
  }
  // Aim, with the level's error, and on Hard a lead on a moving target.
  let tx = ex, ty = ey;
  if (L.lead && ["shot", "multi"].includes(shapeAt(pick))) {
    const tt = dist / (SHOT_SPEED * (roleOf(me) === "blaster" ? BLAST_SPEED : 1));
    tx += (foe.x - foe.px) * tt; ty += (foe.y - foe.py) * tt;
  }
  const off = (rnd(s) * 2 - 1) * L.err;
  const [nx, ny] = norm(tx, ty);
  const far = Math.sqrt(tx * tx + ty * ty);
  return { ...NO_INPUT, mx, my, ax: (nx - ny * off) * far, ay: (ny + nx * off) * far, fire: pick };
}

// ------------------------------------------------------------------ teams

/* A CPU TEAM for Quick Battle and Training: unevolved species that hit, each
   at the stage its level reaches (`stageAt`, as the League's opponents are),
   chosen by the seed so a match's foes replay with it. */
const POOL = SPECIES.filter((sp) => !isForm(sp.id) && !isEvent(sp.id) && !sp.legendary && !sp.mythical
  && !neverHits(sp.id) && arenaReady(sp.id)).map((sp) => sp.id);
export function cpuTeam(seed, level, n = 3) {
  const s = { rs: seed | 0 };
  const lv = clamp(Math.round(level), 5, 100);
  const picks = new Set();
  while (picks.size < n) picks.add(stageAt(POOL[Math.floor(rnd(s) * POOL.length)], lv));
  return [...picks].filter((id) => speciesById(id)).map((id, slot) => fighter(id, lv, hash(`arena:${seed}:${slot}`), movesAt(id, lv)));
}

/* A GYM OF THE CIRCUIT (ladder.js): the League's own leader, Elite Four
   member or Champion as an Arena opponent - name, portrait, badge, a floor
   for their type - with their three strongest: from their strongest roster
   (the hard party, where the League has one), highest level first and the
   bigger base stats on a tie, one of a species, each with an Arena body (a
   Mega enters as its base, Mega Evolving in the match). They fight at the
   player's level or their own, whichever is higher, with their own moves
   where the Arena plays them and their level-up moves to fill the rest. */
const GYM_OF = new Map(LEAGUES.flatMap((r) => [
  ...r.gyms.map((o) => [o.id, { ...o, title: r.id === "alola" ? "Kahuna" : "Gym Leader" }]),
  ...r.league.map((o) => [o.id, { ...o, title: o.champion ? "Champion" : "Elite Four" }]),
]));
const GYM_FLOOR = { rock: "moon", ground: "moon", steel: "moon", ghost: "moon", dark: "moon", water: "seaside", flying: "seaside",
  ice: "rink", fire: "caldera", dragon: "caldera", grass: "grove", bug: "grove", poison: "grove", fairy: "grove" };
const bstOf = (id) => (speciesById(id)?.stats ?? []).reduce((a, b) => a + b, 0);
function gymPicks(o) {
  // The strongest roster first; its everyday party fills in where that has too few with an Arena body (Kalos).
  const out = [];
  const rank = (list) => [...(list ?? [])].sort((a, b) => b[1] - a[1] || bstOf(b[0]) - bstOf(a[0]));
  for (const [sp, lv, moves] of [...rank(o.hard), ...rank(o.party)]) {
    const e = enteringAs({ species: sp });
    if (!arenaReady(e.species) || out.some((p) => p.sp === e.species)) continue;
    out.push({ sp: e.species, lv, moves: moves ?? [], mega: e.mega ?? 0 });
    if (out.length === 3) break;
  }
  return out;
}
export const gymOf = (id) => GYM_OF.get(id) ?? null;
export function gymMaster(id, level, cpu) {
  const o = GYM_OF.get(id);
  if (!o) return null;
  const picks = gymPicks(o);
  const lv = clamp(Math.max(Math.round(level), ...picks.map((p) => p.lv)), 5, 100);
  const type = o.type ?? speciesById(picks.at(-1)?.sp)?.types?.[0] ?? "normal";
  return { id: `gym:${id}`, gym: id, name: o.name, title: o.title, pic: o.pic, badge: o.badge ? id : null, cpu, level: lv,
    arena: o.champion ? "indigo" : GYM_FLOOR[type] ?? "indigo", type, team: picks.map((p) => [p.sp, speciesById(p.sp)?.name]) };
}
// Its moves: its own where the Arena plays them, then its level-up moves, four at most.
function gymMoves(sp, names, lv) {
  const own = names.map((n) => MOVES.findIndex((m) => m.n === n)).filter((i) => i >= 0 && shapeOf(arenaMove(i)));
  for (const i of movesAt(sp, lv)) if (own.length < 4 && !own.includes(i) && shapeOf(arenaMove(i))) own.push(i);
  return own.slice(0, 4);
}
export const gymTeam = (m) => gymPicks(GYM_OF.get(m.gym)).map((p, slot) =>
  ({ ...fighter(p.sp, m.level, hash(`gym:${m.gym}:${slot}`), gymMoves(p.sp, p.moves, m.level)), megas: p.mega ? [p.mega] : [] }));

/* AN ARENA MASTER'S TEAM (ladder.js): its species at the stage the
   master's level reaches, with their own level-up moves. A gym is its own (`gymTeam`). */
export const masterTeam = (m) => (m.gym ? gymTeam(m) : m.team.map(([id], slot) => {
  const at = stageAt(id, m.level);
  return fighter(at, m.level, hash(`ladder:${m.id}:${slot}`), movesAt(at, m.level));
}));

/* THE FAIR FORMAT (an online match between friends): your species, each at
   FAIR_LEVEL with every IV at 31 and its level-up moves there - what you
   bring is which Pokemon, never how far you raised them. */
export const FAIR_LEVEL = 50;
// A Mega in it enters as its base and may Mega Evolve into it, as offline (`enteringAs`).
export const fairTeam = (ids) => ids.map((id) => {
  const e = enteringAs({ species: id }), at = e.species;
  return { ...fighter(at, FAIR_LEVEL, hash(`fair:${id}`), movesAt(at, FAIR_LEVEL), 0, 31), megas: e.mega ? [e.mega] : [] };
});

// ------------------------------------------------------------------ playing online

/* LOCKSTEP (an online match, phase 3). Two ends play the same match from the
   same seed, and a tick is stepped only with BOTH players' inputs for it.
   Yours for tick n is sampled at n - DELAY and sent at once, so the round
   trip hides inside the delay; ticks under DELAY are nobody's. Every
   HASH_EVERY ticks each end sends its state hash and a difference is a
   desync. `link` is anything with send(message) and an `onmessage` hook (a
   WebRTC data channel in the page, a queue in check.mjs); `round` tells a
   rematch's messages from the last match's. An input is cleaned the same
   way at both ends (`cleanInput`), so a float rounded on the wire is the
   float both sims see. */
export const DELAY = 4, HASH_EVERY = 60;
const q64 = (v, lim) => (Number.isFinite(v) ? Math.round(clamp(v, -lim, lim) * 64) / 64 : 0);
const pick = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : -1);
export const cleanInput = (i) => ({
  mx: q64(i?.mx, 1), my: q64(i?.my, 1), ax: q64(i?.ax, 40), ay: q64(i?.ay, 40),
  fire: pick(i?.fire, 0, 3), hold: pick(i?.hold, 0, 3), basic: Boolean(i?.basic), dodge: Boolean(i?.dodge), swap: pick(i?.swap, 0, 5), surge: Boolean(i?.surge), use: Boolean(i?.use), mega: Boolean(i?.mega),
});
export function lockstep(link, me, round = 0) {
  const mine = new Map(), theirs = new Map(), myHash = new Map(), theirHash = new Map();
  let made = 0, sent = DELAY, desync = -1;
  const check = (n) => {
    if (myHash.has(n) && theirHash.has(n)) {
      if (myHash.get(n) !== theirHash.get(n) && desync < 0) desync = n;
      myHash.delete(n); theirHash.delete(n);
    }
  };
  const hear = (m) => {
    if (m?.r !== round) return;
    if (m.t === "in" && Number.isInteger(m.n) && m.n >= made) theirs.set(m.n, cleanInput(m.i));
    else if (m.t === "hash" && Number.isInteger(m.n)) { theirHash.set(m.n, m.h); check(m.n); }
  };
  return {
    hear,
    // Send your inputs up to DELAY ticks ahead; `sample` builds one.
    feed(sample) {
      while (sent <= made + DELAY) {
        const i = cleanInput(sample());
        mine.set(sent, i);
        link.send({ t: "in", r: round, n: sent, i });
        sent++;
      }
    },
    ready: () => made < DELAY || theirs.has(made),
    // The other end is ahead of you: step an extra tick to catch up.
    behind: () => theirs.has(made + DELAY + 2),
    step(s) {
      const a = made < DELAY ? NO_INPUT : mine.get(made), b = made < DELAY ? NO_INPUT : theirs.get(made);
      mine.delete(made); theirs.delete(made);
      tick(s, me === 0 ? [a, b] : [b, a]);
      made++;
      if (made % HASH_EVERY === 0) { const h = stateHash(s); myHash.set(made, h); link.send({ t: "hash", r: round, n: made, h }); check(made); }
    },
    get made() { return made; },
    get desync() { return desync; },
  };
}

/* WHICH RULES THIS BUILD PLAYS (an online match's handshake): a fixed match,
   Fair teams against a CPU team on a floor with falling rocks, run thirty
   seconds and hashed. Two builds whose rules, species or moves differ
   anywhere a fight reaches print differently, and never start a match that
   would drift apart. */
let printed = null;
export function rulesPrint() {
  if (printed) return printed;
  const s = newMatch({ teams: [fairTeam([6, 25, 94]), cpuTeam(11, 50)], cpu: ["hard", "hard"], seed: 3, arena: "moon" });
  for (let t = 0; t < 30 * TPS && !s.over; t++) tick(s, [null, null]);
  printed = hash(`${stateHash(s)}:${DELAY}:${HASH_EVERY}:${INTRO}`);
  return printed;
}

// What a replay compares: where everyone is and how they are, each tick's end.
export const stateHash = (s) => hash(JSON.stringify([s.t, s.intro, s.rs, s.winner,
  s.items.map((it) => [it.kind, it.x, it.y, it.t]), s.weather, s.dark, s.tide, s.erupt, s.lanes.map((l) => [l.y, l.t]), s.helpers.map((h) => [h.kind, h.x, h.y, h.t]), s.domes.map((dm) => [dm.x, dm.y, dm.t]), s.domain && [s.domain.kind, s.domain.t], s.perish, s.throws.map((th) => th.t), s.fires.map((fl) => [fl.x, fl.y, fl.t]), s.strikes.map((z) => [z.x, z.y, z.t]), s.clouds.map((c) => [c.x, c.y, c.t]),
  s.sudden ? 1 : 0, s.revived ? 1 : 0,
  s.sides.map((sd) => [sd.active, sd.swapT, sd.koT, sd.meter, sd.held, sd.team.map((f) => [f.x, f.y, f.hp, f.status, f.stages, f.surge, f.kit.map((m) => m.cd), f.basic.cd, f.basicN, f.clones.flat(), f.wet, f.away, f.confused, f.id, f.xp, f.evo, f.splat, f.fortress, f.regen, f.awake, f.comboT, f.hitAt]), sd.trapT, sd.tag]),
  s.shots.map((p) => [p.x, p.y]), s.hazards.map((z) => [z.x, z.y, z.t]),
  s.cover.map((c) => c.hp), [s.zone.open, s.zone.t, s.zone.claimed], s.drops.map((r) => [r.x, r.y, r.t])]));
