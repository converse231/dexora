/* THE ARENA'S PIXEL EFFECTS (2026-10-29, asked for: "greatly improve the
   pixel art effects"; the plan and its live drafts are the Arena VFX Lab
   artifact). The bodies are PMD pixel art and the effects round them were
   vectors - gradients, anti-aliased strokes, alpha fades - so they read as
   another game laid over this one. Here an effect draws into a buffer on the
   bodies' own pixel grid (`BODY_PX` effect pixels a tile, the same scale
   render.js draws a PMD body at), in its type's ramp, fading by DITHER and
   never by alpha, with its glow in a separate light buffer added on top.

   Each frame is two colour buffers - BACK (under the bodies: rings on the
   floor, smoke) and FRONT (over them: sparks, stars, bolts) - and one LIGHT
   buffer, put to their own canvases and drawn by render.js inside the
   camera's transform. Nothing here reads or moves the match: arena.js never
   imports it, so every recorded match replays as before.

   The techniques and several recipes (the Bayer dither, the two buffers, the
   bolt by midpoint displacement, spark streaks) follow Sprite Fusion's pixel
   art VFX library: MIT License, Copyright (c) 2026 Hugo Duprez. */

// Effect pixels a tile: a PMD body's own pixel (render.js draws a body at `px / BODY_PX` a pixel).
export const BODY_PX = 32 / 2.6;
// The buffer reaches this far past the court on every side: sparks fly off it, stars rise over a top-row body.
const MARGIN = 2;

/* ---------- colour: a 7-step ramp a type, white to its darkest ---------- */
const rgb = (r, g, b) => ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
const hex = (h) => { const v = parseInt(h.slice(1), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); };
const R8 = (c) => c & 255, G8 = (c) => (c >>> 8) & 255, B8 = (c) => (c >>> 16) & 255;
const RAW = {
  normal: ["#ffffff", "#f3f0e6", "#d9d4c4", "#b3ac98", "#8a836f", "#5e584a", "#37332b"],
  fire: ["#ffffff", "#fff3a6", "#ffd23d", "#ff8a2a", "#f2561d", "#c9281f", "#5a160f"],
  water: ["#ffffff", "#e0f7ff", "#8fdcff", "#45a8ff", "#2a6be0", "#1d3f9e", "#12205a"],
  electric: ["#ffffff", "#fffbd0", "#ffe95c", "#ffc21a", "#e88f00", "#a85a00", "#4f2a00"],
  grass: ["#ffffff", "#eaffc8", "#a8f06a", "#5fcf3a", "#2f9a2a", "#1d6424", "#0f3317"],
  ice: ["#ffffff", "#e8fcff", "#b6f1ff", "#7fd8f2", "#4aa8d8", "#2e6ea8", "#1b3c66"],
  fighting: ["#ffffff", "#ffe3cc", "#ffad7a", "#e8683a", "#b83a22", "#7a1f17", "#3d0f0c"],
  poison: ["#ffffff", "#f6d8ff", "#d98cff", "#b04fe8", "#7f2bb8", "#4f1a7a", "#2a0e42"],
  ground: ["#ffffff", "#fff0c8", "#f0cf7a", "#d4a24a", "#a8742e", "#6e4a1f", "#3a2610"],
  flying: ["#ffffff", "#eef4ff", "#c8d8ff", "#9fb4f5", "#7486d8", "#4d58a8", "#2b2f66"],
  psychic: ["#ffffff", "#ffe0f0", "#ff9fcf", "#ff5fa8", "#d6337f", "#8f1f58", "#4a0f2e"],
  bug: ["#ffffff", "#f4ffcc", "#d6f06a", "#a8c83a", "#789a1f", "#4a6a14", "#26380a"],
  rock: ["#ffffff", "#f3ead4", "#d8c79a", "#b39e6a", "#857245", "#574a2c", "#2e2717"],
  ghost: ["#ffffff", "#ecdcff", "#b89cff", "#8a66e8", "#5f3fb8", "#3a2478", "#1c1040"],
  dragon: ["#ffffff", "#e4dcff", "#a99cff", "#7a5cff", "#5233e0", "#3218a0", "#190a52"],
  dark: ["#ffffff", "#e6dde8", "#a99aa8", "#7a6a7c", "#534556", "#352a38", "#1a141c"],
  steel: ["#ffffff", "#f0f4f8", "#cfd9e4", "#a4b3c4", "#7a8a9e", "#52606f", "#2c343e"],
  fairy: ["#ffffff", "#ffe8f4", "#ffbfe0", "#ff92c8", "#e86aa8", "#a8457a", "#5a2442"],
};
export const RAMP = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, v.map(hex)]));
export const RAMP_STEPS = 7;
const HEAT = ["#ffffff", "#fff3a6", "#ffe26b", "#ffc23d", "#ff8a2a", "#f2561d", "#c9281f", "#8a1f17", "#4f1a13", "#2a120e"].map(hex);
const SMOKE = ["#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e"].map(hex);
const DUST = hex("#8a8098");
// Not a type's: a dash's cold white-blue, Protect's mint, a heal's green.
const DASHR = ["#ffffff", "#e0f6ff", "#9fe3ff", "#4fb8ff", "#2a6fd8", "#1b3c80"].map(hex);
const SHIELDR = ["#ffffff", "#e6fff6", "#a6ffe0", "#4fe8c0", "#1fb89a", "#147a70", "#0b3f3e"].map(hex);
const HEALR = ["#ffffff", "#eaffe0", "#b6ffa0", "#6fe86a", "#2fbf4f", "#1f7a3f", "#0f3f24"].map(hex);
// The named ULTIs' own (Phase 7): Blast Burn's blue fire, Outrage's red, Frenzy Plant's bark, Psystrike's violet,
// Shadow Storm's black-purple, Aura Sphere's blue, Hyper Beam's orange, Stone Edge's white stone, Dragon Rush's
// menace, Dragon Ascent's green-white, Moonblast's pink and its moon.
const BLUEFIRE = ["#ffffff", "#e0fbff", "#9ff0ff", "#4fd2ff", "#2a8fe8", "#1d4fb0", "#122a66"].map(hex);
const REDAURA = ["#ffffff", "#ffd6d6", "#ff8a7a", "#e83a3a", "#a81e2e", "#5e0f1e", "#2a0610"].map(hex);
const BARK = ["#f4e8b8", "#d8bd7a", "#a8844a", "#7a5a2e", "#4e3618", "#2a1a0a"].map(hex);
const PSYB = ["#ffffff", "#e6e0ff", "#b6a8ff", "#8a78ff", "#6a4ce8", "#40289e", "#1e124a"].map(hex);
const DARKP = ["#ffffff", "#e0c8ff", "#a77bff", "#6f3fd0", "#3a1f78", "#1c0f3c", "#08050f"].map(hex);
const AURAB = ["#ffffff", "#dff4ff", "#9fdcff", "#4fb0ff", "#2a74e8", "#1a44a8", "#0c2058"].map(hex);
const HBEAM = ["#ffffff", "#fff3c0", "#ffd27a", "#ff9a3d", "#e8641e", "#a83a12", "#4f1a08"].map(hex);
const ROCKW = ["#ffffff", "#eef2ff", "#c8d4f0", "#9aa8cc", "#6e7aa0", "#48506e", "#262a3e"].map(hex);
const MENACE = ["#ffffff", "#dff0ff", "#9fc8ff", "#5f8fff", "#3a5ce0", "#24349e", "#121a52"].map(hex);
const SKYG = ["#ffffff", "#eafff0", "#9ff0c0", "#4fd88a", "#2aa060", "#1a6a3c", "#0c3620"].map(hex);
const MOONP = ["#ffffff", "#ffe8f6", "#ffbfe4", "#ff8fcf", "#c76ad8", "#6a5cc8", "#2e2a6a"].map(hex);
const MOONC = ["#fffbe8", "#f4ecc8", "#d8cfa4", "#b0a67c"].map(hex);
// Signature moves (2026-10-30): sunlight, a psychic's blue, a vine's dark green, Wild Charge's gold.
const SUNR = ["#ffffff", "#fffbe0", "#fff0a0", "#ffe066", "#f0c030", "#b88a1a", "#5a420a"].map(hex);
const PSYL = ["#ffffff", "#e0f8ff", "#a8e8ff", "#6fc8ff", "#4a8fe8", "#2e58b0", "#182c66"].map(hex);
const VINE = ["#e8ffc8", "#9fe06a", "#4fb03a", "#2e7a2a", "#1a4a1c", "#0c2610"].map(hex);
const GOLD = ["#ffffff", "#fffbd0", "#ffe95c", "#ffc21a", "#e88f00", "#a85a00", "#4f2a00"].map(hex);
/* THE SIGNATURE MOVES, the anime way (the Arena VFX Lab's batch 1, 2026-10-30): each drawn by `sig`
   at its own moment; render.js leaves out the generic look and any drawn sheet for these. */
export const SIGNATURES = ["surf", "razor-leaf", "thunderbolt", "vine-whip", "psychic", "solar-beam", "fire-blast", "wild-charge",
  // Batch 2 (2026-10-30): the moves the most Pokemon carry in their kits.
  "earth-power", "air-slash", "hyper-beam", "iron-head", "giga-drain", "rock-slide", "dragon-claw", "earthquake",
  // Batch 3 (2026-10-30): the next most carried.
  "tackle", "scary-face", "quick-attack", "discharge", "hypnosis", "water-pulse", "ancient-power", "dragon-pulse",
  // Batch 4 (2026-10-30): eight more, each its own look.
  "astonish", "sucker-punch", "zen-headbutt", "thunder-wave", "confusion", "dragon-breath", "aqua-tail", "icy-wind",
  // Batch 5 (2026-10-30): the charges that played the drawn slam sheet.
  "take-down", "headbutt", "double-edge", "body-slam", "slam",
  // Batch 6 (same day, asked for: "more moves instead of bit by bit"), the next most carried.
  "slash", "spark", "fake-out", "wing-attack", "extreme-speed", "mud-shot", "future-sight", "sing",
  "bubble-beam", "psybeam", "uproar", "string-shot", "bulldoze", "harden", "defense-curl",
  // Batch 7 (same day): twenty more.
  "stone-edge", "bug-bite", "night-slash", "poison-jab", "bug-buzz", "leaf-blade", "agility", "water-gun", "thrash", "power-gem",
  "stun-spore", "aerial-ace", "giga-impact", "zap-cannon", "flame-charge", "metal-claw", "iron-defense", "outrage", "stomp", "hurricane",
  // Batch 8 (same day): twenty more.
  "close-combat", "dragon-tail", "seed-bomb", "sleep-powder", "hyper-voice", "dazzling-gleam", "last-resort", "magical-leaf", "amnesia", "rapid-spin",
  "psyshock", "brine", "synthesis", "foul-play", "scratch", "flash-cannon", "superpower", "nuzzle", "acrobatics", "u-turn",
  // Batch 9 (same day, asked for: "bigger batch"): thirty-seven more.
  "lick", "shadow-sneak", "venoshock", "assurance", "drill-peck", "belch", "hex", "covet", "muddy-water", "rollout",
  "razor-shell", "pound", "air-cutter", "knock-off", "pluck", "ice-shard", "wood-hammer", "dynamic-punch", "sacred-sword", "power-whip",
  "glare", "peck", "will-o-wisp", "swallow", "leech-life", "extrasensory", "lava-plume", "brick-break", "shadow-claw", "head-smash",
  "crush-claw", "disarming-voice", "low-sweep", "dream-eater", "liquidation", "dark-pulse", "incinerate",
  // Batch 10 (same day, asked for: "anime accurate, much better"): the last drawn blow sheets.
  "thunder-punch", "fire-punch", "ice-punch", "x-scissor", "iron-tail",
  // Batch 11 (same day): the court-filling moves and the ones that leave the court.
  "blizzard", "petal-blizzard", "heat-wave", "twister", "fly", "bounce", "dig", "dive", "phantom-force",
  // Batch 12 (same day, asked for: "no more animations to revamp?"): the most carried still on the generic look.
  "protect", "detect", "double-team", "recover", "withdraw", "life-dew", "roost", "quiver-dance",
  "play-rough", "shadow-ball", "energy-ball", "moonblast", "sludge-bomb", "ice-beam", "aqua-jet", "flare-blitz",
  "brave-bird", "megahorn", "cross-chop", "retaliate", "sky-attack", "double-kick", "stomping-tantrum", "tri-attack",
  "aura-sphere", "inferno", "leaf-storm", "shock-wave", "sludge-wave", "self-destruct", "explosion", "boomburst",
  // Sweep 2 (same day, asked for: "do it in bigger sweeps"): every move two kits carry (families in render.js take the rest).
  "flamethrower", "hydro-pump", "aurora-beam", "dragon-rush", "drill-run", "first-impression", "feint", "lunge", "flame-wheel", "icicle-crash",
  "force-palm", "poison-sting", "throat-chop", "gunk-shot", "payback", "facade", "fire-lash", "steel-wing", "crabhammer", "strength",
  "fell-stinger", "wave-crash", "avalanche", "aqua-cutter", "skitter-smack", "waterfall", "smack-down", "lands-wrath", "grav-apple", "false-surrender",
  "bolt-beak", "barb-barrage", "ice-spinner", "pay-day", "wrap", "meteor-mash", "drain-punch", "shadow-punch", "blaze-kick", "high-jump-kick",
  "bullet-seed", "gear-grind", "double-hit", "pin-missile", "dragon-darts", "echoed-voice", "struggle-bug", "venom-drench", "snarl", "powder-snow",
  "cotton-spore", "water-spout", "electroweb", "eruption", "breaking-swipe", "thousand-arrows", "endure", "charge", "moonlight", "slack-off",
  "bulk-up", "autotomize", "calm-mind", "coil", "swords-dance", "dragon-dance", "acid-armor", "stuff-cheeks", "work-up", "defend-order",
  "rock-polish", "spiky-shield", "clangorous-soul", "shift-gear", "freeze-dry", "gust", "volt-switch", "draining-kiss", "spore", "overheat",
  "thunder", "petal-dance", "ember", "swift", "acid", "mega-drain", "absorb", "stored-power", "leaf-tornado", "smog",
  "toxic", "fairy-wind", "frost-breath", "whirlpool", "mystical-power", "thunder-shock", "fiery-dance", "mystical-fire", "photon-geyser", "bitter-malice",
  "snore",
  "branch-poke", "spirit-shackle", "flower-trick", "octazooka", "mud-slap", "sludge", "weather-ball", "vacuum-wave", "flame-burst", "clear-smog",
  "charge-beam", "glaciate", "scald", "snipe-shot", "infestation", "terrain-pulse", "esper-wing"];
const PETAL = ["#ffffff", "#fff0f8", "#ffc8e4", "#ff9ac8", "#e868a8", "#a83a78", "#4a1838"].map(hex);
const DIRT = ["#e8d0a0", "#c8a46a", "#a07a44", "#7a5428", "#543614", "#2e1c08"].map(hex);
const PHANTOM = ["#ffffff", "#e8d0ff", "#b080ff", "#7a40d8", "#4a1e98", "#24104e", "#0c0420"].map(hex);
const XSC = ["#ffffff", "#f4ffd8", "#d8f880", "#a8e040", "#6ab028", "#3a6a18", "#18300a"].map(hex);
const TONGUE = ["#ffffff", "#ffd8ec", "#ff9ac8", "#e868a8", "#b04080", "#6a2048", "#300c20"].map(hex);
const VENOM = ["#ffffff", "#f0d8ff", "#d098f8", "#a85ae0", "#7a30b8", "#481878", "#200838"].map(hex);
const GASR = ["#e8f0c8", "#c0d088", "#98a860", "#a87ab8", "#7a5090", "#4a3058"].map(hex);
const WOODR = ["#ffffff", "#f0f8d0", "#c8d888", "#8aa850", "#a07040", "#6a4824", "#30200e"].map(hex);
const BLAST = ["#ffffff", "#fff0c0", "#ffc870", "#ff8a3a", "#e0501e", "#902a10", "#401006"].map(hex);
const EYESR = ["#ffffff", "#fffbd0", "#fff07a", "#ffd83a", "#c8a018", "#7a600c", "#342804"].map(hex);
const DRAINRED = ["#ffffff", "#ffd8d8", "#ff9a9a", "#e85a6a", "#b02a40", "#6a1224", "#30060e"].map(hex);
const EXTRA = ["#ffffff", "#e8fff8", "#a8f8e0", "#6ae0c8", "#3aa8b0", "#22607a", "#0e2c3a"].map(hex);
const DREAM = ["#ffffff", "#f4e8ff", "#d8c0ff", "#b498f0", "#8a6ad0", "#5a4090", "#2a1c48"].map(hex);
const DARKPB = ["#d8c8f0", "#5a3a90", "#3a2468", "#2a1850", "#1a0e38", "#100822", "#06040e"].map(hex);
const SWORD = ["#ffffff", "#fffbf0", "#fff0c0", "#f8d880", "#d8a840", "#8a6420", "#3a280a"].map(hex);
const FIGHTR = ["#ffffff", "#ffe0c8", "#ffa870", "#f06a2a", "#c03a1a", "#701a0e", "#300a06"].map(hex);
const SLEEPR = ["#ffffff", "#e0fff8", "#9af0e0", "#5ad0c8", "#3a98a8", "#225a70", "#0e2a3a"].map(hex);
const VOICE = ["#ffffff", "#fff0f8", "#ffd0ec", "#ff9ad0", "#e060a8", "#90306a", "#401430"].map(hex);
const GLEAM = ["#ffffff", "#fff4fc", "#ffd8f4", "#ffb0e4", "#f080c8", "#a04888", "#481c3a"].map(hex);
const STARW = ["#ffffff", "#fffbe8", "#fff0b0", "#ffe070", "#e8b840", "#9a7420", "#40300c"].map(hex);
const AMNES = ["#ffffff", "#e8f4ff", "#b0d8ff", "#78b4ff", "#4a80e0", "#2a4ca0", "#121e48"].map(hex);
const PSYSH = ["#ffffff", "#ffe0fa", "#ffa0f0", "#e060e0", "#a83ac8", "#622080", "#2a0c38"].map(hex);
const BRINE = ["#ffffff", "#e8fbff", "#b0ecf8", "#6ad0e8", "#3a98c0", "#225e88", "#0e2c44"].map(hex);
const SYNTH = ["#ffffff", "#f4ffd8", "#d8f88a", "#a8e050", "#6ab838", "#3a7a24", "#183a10"].map(hex);
const FOUL = ["#ffffff", "#d8c8f0", "#8a6ac0", "#5a3a90", "#33205a", "#1a0e30", "#08040e"].map(hex);
const FLASHC = ["#ffffff", "#dfe8f8", "#9fb4d8", "#7088b8", "#4c5e8a", "#2c3858", "#141a2a"].map(hex);   // white core, steel-blue edge
const STONEB = ["#ffffff", "#e8f4ff", "#b8d8f0", "#8aa8c8", "#5c7898", "#3a4c64", "#1c2432"].map(hex);
const BUGG = ["#ffffff", "#f0ffc8", "#c8f06a", "#90d03a", "#5ca024", "#346418", "#16300a"].map(hex);
const NIGHT = ["#ffffff", "#e8d8ff", "#9a7ad8", "#5a3aa0", "#2e1c5c", "#16102e", "#08060e"].map(hex);
const POISONJ = ["#ffffff", "#f8d8ff", "#e09aff", "#b05ae8", "#7a2ab0", "#481670", "#200830"].map(hex);
const BUZZ = ["#ffffff", "#ffe0d0", "#ff9a7a", "#e8503a", "#a82a1e", "#5a120c", "#280604"].map(hex);
const LEAFB = ["#ffffff", "#e8ffd8", "#a8f07a", "#5ad04a", "#2e9a34", "#186422", "#0a3010"].map(hex);
const AGIL = ["#ffffff", "#ffe8d0", "#ffb87a", "#ff8a4a", "#e05a2a", "#8a3214", "#3a1408"].map(hex);
const RAGE = ["#ffffff", "#ffd8c8", "#ff8a6a", "#e8402a", "#a81e1a", "#5a0c10", "#28040a"].map(hex);
const GEMS = ["#ffffff", "#ffe0f0", "#ff9ad8", "#e85ab0", "#b02a80", "#681448", "#2a0620"].map(hex);
const SPORE = ["#ffffff", "#fffbd0", "#ffe870", "#f0c030", "#c8901a", "#7a5410", "#342206"].map(hex);
const GIGA = ["#ffffff", "#f0d8ff", "#c08aff", "#8a4ae0", "#ff9a3d", "#5a1e9a", "#200a3a"].map(hex);
const WINDC = ["#ffffff", "#f0fff8", "#c8f4e8", "#9ae0d0", "#6ab8b0", "#3a7a7a", "#1a3a3a"].map(hex);
const TDOWN = ["#ffffff", "#fff0c8", "#ffc870", "#ff9a3d", "#d8641e", "#8a3a12", "#3a1808"].map(hex);
const DEDGE = ["#ffffff", "#fffbd8", "#ffe880", "#ffc83a", "#e09a10", "#8a5a08", "#3a2604"].map(hex);
const DUSTR = ["#f0e8d8", "#d8ccb4", "#b8a88c", "#8c7c64", "#5c5040", "#2c261e"].map(hex);
const MUD = ["#e8d0a8", "#c8a070", "#a07848", "#7a5430", "#58381c", "#38220e", "#1c1006"].map(hex);
const FSIGHT = ["#ffffff", "#ffe8fa", "#ffb8f0", "#e07ae8", "#a84ad0", "#6a2a98", "#30124a"].map(hex);
const NOTES = ["#ffffff", "#ffe8f4", "#ffb8dc", "#ff7ab8", "#d84a90", "#8a2a5a", "#3a0e24"].map(hex);
const SILK = ["#ffffff", "#f4f4f8", "#dcdce8", "#b8b8cc", "#8888a0", "#585870", "#2a2a38"].map(hex);
const RAINBOW = ["#ff6a6a", "#ffb84a", "#ffe95c", "#7ae86a", "#5ac8ff", "#8a7aff", "#e07ae8"].map(hex);
const PSYBEAMR = ["#ffe8fa", "#ff9ae0", "#d8a8ff", "#b07aff", "#7a8aff", "#4a5ac8", "#22265a"].map(hex);
const BUBBLER = ["#ffffff", "#e0f8ff", "#a8e4ff", "#6ac4ff", "#3a8ae8", "#2458a8", "#102a54"].map(hex);
const GHOSTF = ["#ffffff", "#ffc8f0", "#ff7ad9", "#a03ad0", "#5a1e8a", "#2a0e44", "#0e0418"].map(hex);
const SUCKER = ["#ffffff", "#e8c8ff", "#b07aff", "#7a3ad8", "#4a1e8a", "#260e48", "#0c0418"].map(hex);
const ZEN = ["#ffffff", "#e0f4ff", "#a8dcff", "#6ab4ff", "#3a7ae8", "#2448a8", "#102454"].map(hex);
const TWAVE = ["#ffffff", "#fffbd0", "#ffe95c", "#ffd21a", "#e0a000", "#8a6200", "#3a2800"].map(hex);
const CONFL = ["#ffffff", "#e8f8ff", "#b8ecff", "#7ad4ff", "#4aa0e8", "#2a68b0", "#14325a"].map(hex);
const DBREATH = ["#ffffff", "#f0ffd0", "#c8ff6a", "#7ae84a", "#3ab83a", "#1e7a3a", "#0c3a1e"].map(hex);
const ICYW = ["#ffffff", "#eefcff", "#c8f4ff", "#8ee0ff", "#5ab4e8", "#3a7ab0", "#1a3a5a"].map(hex);
const SCARY = ["#ffffff", "#ffd0d0", "#ff6a6a", "#d81e3a", "#8a1030", "#3e0a24", "#14040e"].map(hex);
const HYPNO = ["#ffffff", "#f6e8ff", "#d8b8ff", "#b088ff", "#7a5ce0", "#4a34a0", "#221650"].map(hex);
const APOW = ["#ffffff", "#f0e0ff", "#d0a8ff", "#a070f0", "#7040c0", "#40207a", "#1e0e3a"].map(hex);
const DPULSE = ["#ffffff", "#d8f0ff", "#8ec8ff", "#5a8cff", "#5a4ce0", "#3a2aa0", "#1a1250"].map(hex);
const DISCH = ["#ffffff", "#e0fbff", "#9ff0ff", "#ffe95c", "#f0c020", "#a87a10", "#4a3608"].map(hex);
const EARTHG = ["#ffffff", "#fff6c8", "#ffe27a", "#ffc23d", "#e8901e", "#a85a12", "#4f2a08"].map(hex);
const AIRB = ["#ffffff", "#eefaff", "#c4ecff", "#8fd4ff", "#5aa8e8", "#3a6fb0", "#1e3a66"].map(hex);
const HPINK = ["#ffffff", "#ffe0f0", "#ffb3d9"].map(hex);
const STEELW = ["#ffffff", "#f0f4ff", "#d0d8ec", "#a8b4d0", "#7884a8", "#4c5474", "#262a3e"].map(hex);
const DRAINR = ["#ffffff", "#eaffd8", "#b6ff8a", "#6fe84a", "#2fbf2f", "#1f7a24", "#0f3f14"].map(hex);
const DCLAW = ["#ffffff", "#e0fff4", "#9ff5d8", "#4fe0b0", "#22b088", "#16705a", "#0a3a30"].map(hex);
const ROCKC = ["#f4ead0", "#d8c49a", "#b09a6e", "#857250", "#5c4e36", "#3a3022", "#1e1912"].map(hex);
const EARTHC = ["#e8d8b0", "#c8ac78", "#a08050", "#785c36", "#503c22", "#2c2014"].map(hex);
const GREYS = hex("#5a5f78"), SHADE = hex("#0b0d18");
// Hyper Beam's band: a pale gold core, orange through it, red-orange at its edge (the anime's orange, not a white beam).
const HYPERB = ["#fff3c0", "#ff9a3d", "#ffb45a", "#e8641e", "#c84a14", "#a83a12", "#4f1a08"].map(hex);
// Dragon Pulse's band: a pale blue core, blue through it, violet at its edge (DPULSE's white top read as a white beam).
const DPULSEB = ["#d8f0ff", "#5a8cff", "#7a7cf0", "#5a4ce0", "#4a3ac0", "#3a2aa0", "#1a1250"].map(hex);
// Batch 12: Shadow Ball's black-violet, Energy Ball's light green, sludge, Ice Beam's pale cyan, Megahorn's white-green,
// Recover's gold, feathers, Sky Attack's dawn, Boomburst's violet sound.
const SHADOWB = ["#ffffff", "#e0c8ff", "#a070f0", "#6a3cc8", "#3e1f88", "#200f4a", "#0a0418"].map(hex);
const ENERGYB = ["#ffffff", "#f4ffd8", "#d0ff8a", "#9ae84a", "#5cc03a", "#2e8a2a", "#145018"].map(hex);
const SLUDGE = ["#f8e0ff", "#d8a0f0", "#b060d8", "#8a38b8", "#62208a", "#3a1058", "#1a0628"].map(hex);
const ICEBEAM = ["#ffffff", "#e8fcff", "#bff2ff", "#86dcf8", "#4fb4e8", "#2e78b8", "#163c6a"].map(hex);
const MEGAH = ["#ffffff", "#f4ffe0", "#d8f8a0", "#a8e05a", "#78b030", "#4a7a1a", "#203a0a"].map(hex);
const RECOV = ["#ffffff", "#fffbe8", "#fff0b8", "#ffe080", "#f0c040", "#b08a20", "#5a440c"].map(hex);
const FEATHER = ["#ffffff", "#f8f8ff", "#e8ecf8", "#c8d0e8", "#9aa4c8", "#6a7498", "#3a405a"].map(hex);
const SKYATK = ["#ffffff", "#fffbe8", "#fff0c0", "#ffd890", "#f0a850", "#a86020", "#4a2a0a"].map(hex);
const BOOM = ["#ffffff", "#f4ecff", "#d8c8ff", "#b0a0f0", "#8a78d0", "#5a4c98", "#2c2450"].map(hex);
const AURORA = ["#ffffff", "#f0fff8", "#c8f0ff", "#a8c8ff", "#d8a8ff", "#ffb8e0", "#5a6aa0"].map(hex);
const AURORAB = ["#ff9ad0", "#ffd88a", "#b8ff9a", "#8ae8ff", "#b49aff"].map(hex);
const STREAM_RAMP = { "aurora-beam": AURORA, "ice-beam": ICEBEAM, "solar-beam": SUNR, "hyper-beam": HYPERB, "dragon-pulse": DPULSEB, "bubble-beam": BUBBLER, "psybeam": PSYBEAMR, "zap-cannon": RAMP.electric, "flash-cannon": FLASHC, "dark-pulse": DARKPB };
const SHURIKEN = ["#ffffff", "#fff0c8", "#ffc46a", "#ff9a3d", "#e8641e", "#a83a12", "#4f1a08"].map(hex);
const ramp = (R, k) => R[Math.max(0, Math.min(R.length - 1, Math.floor(k * R.length)))];

/* ---------- maths ---------- */
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const outBack = (t, s = 1.7) => { const u = clamp(t) - 1; return 1 + (s + 1) * u * u * u + s * u * u; };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = Math.random;
const range = (a, b) => a + (b - a) * rand();
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/* ---------- a colour buffer: a pixel is drawn whole, or not at all ---------- */
class Px {
  constructor(w, h) { this.w = w; this.h = h; this.img = new ImageData(w, h); this.d = new Uint32Array(this.img.data.buffer); }
  clear() { this.d.fill(0); }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[y * this.w + x] = c; }
  // A fade: the 4x4 Bayer pattern drops pixels, so every one left is a solid colour.
  dot(x, y, c, a = 1) { if (a <= 0.01) return; x = Math.floor(x); y = Math.floor(y); if (a >= 1 || a > bayer(x, y)) this.set(x, y, c); }
  disc(cx, cy, r, c, a = 1) {
    if (r <= 0.6) return this.dot(cx, cy, c, a);
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const dy = y + 0.5 - cy;
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const dx = x + 0.5 - cx; if (dx * dx + dy * dy <= r2) this.dot(x, y, c, a); }
    }
  }
  // A ring, squashed by `sy` to lie on the floor; `half` -1 is its far half, +1 its near one.
  ring(cx, cy, r, th, c, a = 1, sy = 1, half = 0) {
    const ro = r + th / 2, ri = Math.max(0, r - th / 2);
    for (let y = Math.floor(cy - ro * sy); y <= Math.ceil(cy + ro * sy); y++) {
      if ((half < 0 && y > cy) || (half > 0 && y < cy)) continue;
      const dy = (y + 0.5 - cy) / sy;
      for (let x = Math.floor(cx - ro); x <= Math.ceil(cx + ro); x++) { const dx = x + 0.5 - cx, d = Math.sqrt(dx * dx + dy * dy); if (d <= ro && d >= ri) this.dot(x, y, c, a); }
    }
  }
  line(x0, y0, x1, y1, c, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 512; n++) {
      this.dot(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}
/* ---------- the light buffer: glow added over the frame, never painted into it ---------- */
class Light {
  constructor(w, h) { this.w = w; this.h = h; this.r = new Float32Array(w * h); this.g = new Float32Array(w * h); this.b = new Float32Array(w * h); this.img = new ImageData(w, h); this.on = true; }
  clear() { this.r.fill(0); this.g.fill(0); this.b.fill(0); }
  glow(cx, cy, r, c, k) {
    if (!this.on || r < 1 || k <= 0.01) return;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    const cr = R8(c), cg = G8(c), cb = B8(c);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / r;
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / r, d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const f = 1 - Math.sqrt(d), q = f * f * k, i = y * this.w + x;
        this.r[i] += cr * q; this.g[i] += cg * q; this.b[i] += cb * q;
      }
    }
  }
  bake() {
    const D = this.img.data, n = this.w * this.h;
    for (let i = 0; i < n; i++) { const r = this.r[i], g = this.g[i], b = this.b[i]; D[i * 4] = r > 255 ? 255 : r; D[i * 4 + 1] = g > 255 ? 255 : g; D[i * 4 + 2] = b > 255 ? 255 : b; D[i * 4 + 3] = r + g + b > 1 ? 255 : 0; }
  }
}

/* ---------- shapes ---------- */
function sparkle(buf, x, y, arm, c, tip) {
  const px = Math.round(x), py = Math.round(y), n = Math.round(arm);
  if (n < 1) return buf.set(px, py, c);
  buf.set(px, py, RAMP.normal[0]);
  for (let d = 1; d <= n; d++) { const cc = d > n * 0.6 ? tip : c; buf.set(px + d, py, cc); buf.set(px - d, py, cc); buf.set(px, py + d, cc); buf.set(px, py - d, cc); }
}
// A bolt by midpoint displacement: the jag halves each pass, so it reads as lightning at any length.
function bolt(x0, y0, x1, y1, jag = 0.35) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  let pts = [[x0, y0], [x1, y1]], off = L * jag;
  while (pts.length < 2 + L / 3) {
    const nxt = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay) || 1, o = range(-off, off);
      nxt.push([(ax + bx) / 2 + (-(by - ay) / l) * o, (ay + by) / 2 + ((bx - ax) / l) * o], [bx, by]);
    }
    pts = nxt; off *= 0.52;
  }
  return pts;
}

/* ---------- matter: every kind takes its colour from its ramp by age ---------- */
function drawPart(L, p, frame) {
  // Flame, ember, smoke and dust bring their own colours; the rest take a type's ramp.
  const k = p.t / p.life, buf = p.front ? L.f : L.b, R = p.ramp ?? RAMP.normal, n = R.length;
  switch (p.k) {
    case "spark": {
      const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = Math.min(6, 1 + sp * 0.018);
      buf.line(p.x - ux * len, p.y - uy * len, p.x, p.y, R[Math.min(n - 1, Math.floor(k * 4))], k > 0.75 ? (1 - k) / 0.25 : 1);
      L.l.glow(p.x, p.y, 3, R[2], 0.5 * (1 - k));
      break;
    }
    case "mote": buf.dot(p.x, p.y, R[Math.min(n - 1, 1 + Math.floor(k * (n - 2)))], k > 0.6 ? (1 - k) / 0.4 : 1); break;
    case "ember": if (((frame >> 2) + p.seed) % 4) { buf.set(p.x, p.y, ramp(HEAT, 0.1 + k * 0.6)); L.l.glow(p.x, p.y, 2.5, HEAT[3], 0.4 * (1 - k)); } break;
    case "smoke": buf.disc(p.x, p.y, p.size * (0.7 + k * 0.9), ramp(p.smoke ?? SMOKE, k), 0.6 * Math.min(1, k * 8) * (1 - k)); break;
    case "dust": buf.disc(p.x, p.y, p.size * (0.6 + k * 0.9), DUST, Math.pow(1 - k, 1.3) * 0.7); break;
    case "flame": {
      const r = p.size * (0.5 + 1.6 * Math.sin(Math.PI * Math.min(1, k * 0.9 + 0.1))), i = Math.floor(k * 7), a = k > 0.75 ? (1 - k) / 0.25 : 1;
      buf.disc(p.x, p.y, r + 0.9, HEAT[Math.min(9, i + 3)], a);
      buf.disc(p.x, p.y, r, HEAT[Math.min(9, i + 1)], a);
      if (k < 0.55) buf.disc(p.x - 0.3, p.y - 0.4, r * 0.45, HEAT[Math.min(9, i)], a);
      if (k < 0.5) L.l.glow(p.x, p.y, 6 + r * 2, HEAT[4], 0.18);
      break;
    }
    case "drop": buf.set(p.x, p.y, R[2]); buf.dot(p.x, p.y - 1, R[1], 0.7); break;
    case "shard": {
      const ca = Math.cos(p.a) * p.size, sa = Math.sin(p.a) * p.size;
      buf.line(p.x - ca, p.y - sa, p.x + ca, p.y + sa, k < 0.5 ? R[2] : R[4], k > 0.8 ? (1 - k) / 0.2 : 1);
      buf.set(p.x - ca, p.y - sa, R[1]);
      break;
    }
    case "chunk": { const a = k > 0.8 ? (1 - k) / 0.2 : 1; buf.dot(p.x, p.y, R[3], a); buf.dot(p.x + 1, p.y, R[4], a); buf.dot(p.x, p.y + 1, R[5], a); buf.dot(p.x + 1, p.y + 1, R[5], a); break; }
    case "leaf": {
      const ca = Math.cos(p.a), sa = Math.sin(p.a), a = k > 0.75 ? (1 - k) / 0.25 : 1;
      buf.dot(p.x - ca, p.y - sa, R[4], a); buf.dot(p.x, p.y, R[2], a); buf.dot(p.x + ca, p.y + sa, R[3], a);
      break;
    }
    case "bubble": buf.ring(p.x, p.y, p.size, 1, R[2], k > 0.8 ? (1 - k) / 0.2 : 1); buf.set(p.x - p.size * 0.4, p.y - p.size * 0.4, R[0]); break;
    case "line": { const l = p.size * (1 - k * 0.6); for (let d = 0; d < l; d++) buf.dot(p.x + p.ux * d, p.y + p.uy * d, d < 3 ? R[0] : d < l * 0.4 ? R[1] : R[3], (1 - d / l) * (1 - k)); break; }
    case "cross": {
      const a = k > 0.7 ? (1 - k) / 0.3 : 1, s = p.size;
      for (let d = -s; d <= s; d++) { buf.dot(p.x + d, p.y, R[2], a); buf.dot(p.x, p.y + d, R[2], a); }
      for (const d of [-s - 1, s + 1]) { buf.dot(p.x + d, p.y, R[5], a); buf.dot(p.x, p.y + d, R[5], a); }
      buf.dot(p.x, p.y, R[0], a);
      L.l.glow(p.x, p.y, 5, R[3], 0.35 * a);
      break;
    }
    case "chev": { const a = k > 0.6 ? (1 - k) / 0.4 : 1, s = p.up ? -1 : 1; for (let d = -2; d <= 2; d++) { buf.dot(p.x + d, p.y + Math.abs(d) * -s, R[1], a); buf.dot(p.x + d, p.y + Math.abs(d) * -s + s, R[3], a); } break; }
    case "heart": { const a = k > 0.7 ? (1 - k) / 0.3 : 1; for (const [dx, dy] of [[-1, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) buf.dot(p.x + dx, p.y + dy, dy < 0 ? R[2] : R[3], a); buf.dot(p.x - 1, p.y - 1, R[0], a); break; }
    case "z": { const a = k > 0.7 ? (1 - k) / 0.3 : 1, s = p.size; for (let d = 0; d <= s; d++) { buf.dot(p.x + d, p.y, R[1], a); buf.dot(p.x + d, p.y + s, R[1], a); buf.dot(p.x + s - d, p.y + d, R[2], a); } break; }
    case "star": sparkle(buf, p.x, p.y, p.size * (k < 0.15 ? outBack(k / 0.15) : 1 - (k - 0.15) / 0.85), R[1], R[3]); L.l.glow(p.x, p.y, 5, R[2], 0.4 * (1 - k)); break;
  }
}

/* ---------- one hit: a white core, a ring, a star, sparks, and its type's matter ---------- */
function blowFx(x, y, R, heavy) {
  const S = heavy ? 1.5 : 1, rays = Array.from({ length: 7 }, (_, i) => (i / 7) * TAU + range(-0.2, 0.2)), len = rays.map(() => range(5, 10));
  let t = 0;
  return {
    life: 0.42,
    update(dt) { t += dt; },
    get t() { return t; },
    draw(L) {
      if (t < 0.05) { L.f.disc(x, y, (6 - t * 60) * S, R[3]); L.f.disc(x, y, (4.5 - t * 60) * S, R[1]); L.f.disc(x, y, (3 - t * 50) * S, R[0]); }
      if (t < 0.28) { const k = t / 0.28; L.f.ring(x, y, (3 + 10 * (1 - Math.pow(1 - k, 3))) * S, Math.max(1, 2.2 * (1 - k)), k < 0.4 ? R[1] : R[3], 1.2 - k); }
      if (t < 0.24) for (let i = 0; i < 7; i++) { const l = len[i] * (t < 0.05 ? outBack(t / 0.05, 2.2) : 1 - (t - 0.05) / 0.19) * S; L.f.line(x, y, x + Math.cos(rays[i]) * l, y + Math.sin(rays[i]) * l, t < 0.08 ? R[0] : R[2]); }
      L.l.glow(x, y, 20 * S, R[3], 0.8 * Math.exp(-t * 9));
    },
  };
}
// Short arcs re-rolled 15 times a second round a point: an electric hit's crackle.
function crackleFx(x, y, R, life) {
  let t = 0, at = -1, arcs = [];
  return {
    life,
    update(dt) {
      t += dt;
      const f = Math.floor(t * 15);
      if (f !== at) { at = f; arcs = Array.from({ length: 3 }, () => { const a = range(0, TAU), d = range(3, 7), a2 = a + range(-1.4, 1.4); const x0 = x + Math.cos(a) * d, y0 = y + Math.sin(a) * d; return bolt(x0, y0, x0 + Math.cos(a2) * range(5, 10), y0 + Math.sin(a2) * range(5, 10)); }); }
    },
    get t() { return t; },
    draw(L) {
      const k = 1 - t / life;
      for (const pts of arcs) for (let i = 0; i < pts.length - 1; i++) { L.f.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], k > 0.5 ? R[1] : R[3], Math.min(1, k * 1.6)); if (i % 3 === 0) L.l.glow(pts[i][0], pts[i][1], 5, R[3], 0.35 * k); }
    },
  };
}
// A ring on the floor in two halves, behind and in front of the body: a splash's ripple, a psychic wave.
function floorRing(x, y, R, life, reach, delay = 0) {
  let t = -delay;
  return {
    life,
    update(dt) { t += dt; },
    get t() { return t; },
    draw(L) {
      if (t < 0) return;
      const u = t / life, r = 3 + reach * (1 - Math.pow(1 - u, 2));
      L.b.ring(x, y, r, 1.2, u < 0.4 ? R[1] : R[3], 1 - u, 0.32, -1);
      L.f.ring(x, y, r, 1.2, u < 0.4 ? R[1] : R[3], 1 - u, 0.32, 1);
    },
  };
}

/* ---------- the layer render.js holds for a match ---------- */
export function createPix(W, H) {
  const bw = Math.ceil((W + 2 * MARGIN) * BODY_PX), bh = Math.ceil((H + 2 * MARGIN) * BODY_PX);
  const L = { b: new Px(bw, bh), f: new Px(bw, bh), l: new Light(bw, bh) };
  const canvases = [0, 1, 2].map(() => Object.assign(document.createElement("canvas"), { width: bw, height: bh }));
  const parts = [], fxs = [];
  let frame = 0, cap = 360;
  const toPx = (x, y) => [(x + MARGIN) * BODY_PX, (y + MARGIN) * BODY_PX];
  const add = (p) => { if (parts.length >= cap) parts.shift(); parts.push({ t: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0.5, size: 1, front: true, gy: 1e9, a: 0, va: 0, seed: (rand() * 4) | 0, delay: 0, sway: 0, ...p }); };
  const spray = (dx, dy, cone, a, b) => { const ang = Math.atan2(dy, dx) + (rand() - 0.5) * cone, sp = range(a, b); return [Math.cos(ang) * sp, Math.sin(ang) * sp]; };

  /* A BLOW LANDS (render.js `impact`, every hit, a freeze and a jolt of
     paralysis): world tiles in, where the body stands; `dx, dy` the line of
     the blow. Its matter is its type's. */
  function impact(type, wx, wy, dx = 0, dy = 0, heavy = false) {
    const R = RAMP[type] ?? RAMP.normal, n = heavy ? 1.7 : 1;
    const [x, y] = toPx(wx, wy - 0.2), gy = toPx(0, wy + 0.42)[1];
    const hx = dx || rand() - 0.5, hy = dy || rand() - 0.5;
    const each = (count, make) => { for (let i = 0; i < Math.round(count * n); i++) add(make(i)); };
    fxs.push(blowFx(x, y, R, heavy));
    // Along the line of the blow, whatever the type.
    each(6, () => { const [vx, vy] = spray(hx, hy, 1.1, 90, 200); return { k: "spark", x, y, vx, vy, drag: 3, life: range(0.12, 0.3), ramp: R }; });
    switch (type) {
      case "fire":
        each(7, () => { const [vx, vy] = spray(hx, hy, 2.4, 20, 60); return { k: "flame", x, y, vx, vy: vy - 20, drag: 2, life: range(0.3, 0.5), size: range(1, 1.8) }; });
        each(5, () => ({ k: "ember", x: x + range(-4, 4), y: y + range(-4, 4), vx: range(-20, 20), vy: range(-50, -20), life: range(0.6, 1.2) }));
        each(2, () => ({ k: "smoke", x: x + range(-3, 3), y, vx: range(-5, 5), vy: range(-16, -8), life: range(1, 1.5), size: range(2, 3), front: false }));
        break;
      case "water":
        each(12, () => { const [vx, vy] = spray(hx, hy, 2.6, 40, 110); return { k: "drop", x, y, vx, vy: vy - 60, g: 320, life: range(0.4, 0.8), ramp: R, gy }; });
        fxs.push(floorRing(x, gy, R, 0.6, 16));
        break;
      case "electric":
        fxs.push(crackleFx(x, y, R, heavy ? 0.4 : 0.25));
        each(8, () => { const a = range(0, TAU), sp = range(80, 200); return { k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 260, drag: 2, life: range(0.15, 0.4), ramp: R, gy }; });
        break;
      case "ice":
        each(10, () => { const [vx, vy] = spray(hx, hy, 2.2, 40, 110); return { k: "shard", x, y, vx, vy: vy - 50, g: 300, life: range(0.4, 0.8), size: range(1, 2), a: range(0, TAU), va: range(-12, 12), ramp: R, gy }; });
        each(6, () => ({ k: "mote", x: x + range(-5, 5), y: y + range(-5, 5), vx: range(-30, 30), vy: range(-40, 0), drag: 2, life: range(0.4, 0.7), ramp: R }));
        break;
      case "grass": case "bug":
        each(9, () => { const [vx, vy] = spray(hx, hy, 2.6, 30, 90); return { k: "leaf", x, y, vx, vy: vy - 30, g: 60, drag: 2, life: range(0.7, 1.2), a: range(0, TAU), va: range(-8, 8), ramp: R }; });
        break;
      case "rock": case "ground":
        each(9, () => { const [vx, vy] = spray(hx, hy, 2.8, 40, 110); return { k: "chunk", x, y, vx, vy: vy - 70, g: 380, life: range(0.5, 0.9), ramp: R, gy }; });
        each(4, () => ({ k: "dust", x: x + range(-5, 5), y: gy - 1, vx: range(-30, 30), vy: range(-10, -2), drag: 4, life: range(0.4, 0.7), size: range(1.5, 2.6), front: false }));
        break;
      case "poison":
        each(8, () => ({ k: "bubble", x: x + range(-7, 7), y: y + range(-4, 4), vx: range(-6, 6), vy: range(-24, -10), life: range(0.4, 0.8), size: rand() < 0.3 ? 2 : 1, ramp: R }));
        break;
      case "psychic":
        for (let i = 0; i < 3; i++) fxs.push(floorRing(x, y, R, 0.4, 12 + i * 3, i * 0.07));
        each(5, () => { const a = range(0, TAU), sp = range(20, 50); return { k: "star", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2, life: range(0.4, 0.7), size: 2, ramp: R }; });
        break;
      case "ghost":
        each(6, () => ({ k: "smoke", x: x + range(-5, 5), y: y + range(-4, 4), vx: range(-8, 8), vy: range(-18, -8), life: range(0.8, 1.3), size: range(2, 3), smoke: [R[3], R[4], R[5], R[6], SMOKE[4]] }));
        each(6, () => { const a = range(0, TAU), sp = range(30, 80); return { k: "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.4, 0.7), ramp: R }; });
        break;
      case "dark":
        each(6, () => { const a = range(0, TAU), sp = range(30, 90); return { k: "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.3, 0.6), ramp: R }; });
        each(3, () => ({ k: "smoke", x: x + range(-4, 4), y, vx: range(-6, 6), vy: range(-14, -6), life: range(0.7, 1.1), size: range(2, 3), smoke: [R[4], R[5], R[6], SMOKE[4]] }));
        break;
      case "steel":
        each(10, () => { const [vx, vy] = spray(hx, hy, 2, 120, 260); return { k: "spark", x, y, vx, vy, g: 200, drag: 2, life: range(0.15, 0.35), ramp: HEAT.slice(0, 7), gy }; });
        break;
      case "dragon":
        each(8, () => { const [vx, vy] = spray(hx, hy, 2.4, 50, 120); return { k: "shard", x, y, vx, vy, drag: 2.5, life: range(0.3, 0.6), size: range(1, 2), a: range(0, TAU), va: range(-10, 10), ramp: R }; });
        each(5, () => { const a = range(0, TAU), sp = range(20, 60); return { k: "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2, life: range(0.5, 0.8), ramp: R }; });
        break;
      case "fairy":
        each(8, () => { const a = range(0, TAU), sp = range(30, 70); return { k: "star", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, drag: 2, life: range(0.5, 0.9), size: rand() < 0.4 ? 2 : 1, ramp: R }; });
        break;
      case "flying":
        each(8, () => { const [vx, vy] = spray(hx, hy, 1.6, 60, 140); return { k: "spark", x, y, vx, vy, drag: 4, life: range(0.2, 0.4), ramp: R }; });
        each(5, () => ({ k: "mote", x: x + range(-4, 4), y: y + range(-4, 4), vx: range(-30, 30), vy: range(-20, 10), drag: 1.5, life: range(0.5, 0.9), ramp: R }));
        break;
      case "fighting":
        fxs.push(blowFx(x, y, R, true));
        break;
      default:
        each(6, () => { const a = range(0, TAU), sp = range(30, 70); return { k: "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2, life: range(0.4, 0.6), ramp: R }; });
    }
    // Debris thrown off a heavy blow, along it.
    if (heavy) each(5, () => { const [vx, vy] = spray(hx, hy, 1.6, 140, 260); return { k: "spark", x, y, vx, vy, g: 200, drag: 2, life: range(0.2, 0.4), ramp: R, gy }; });
  }

  /* A SHOT IN FLIGHT (Phase 2): drawn this frame from where the rules have
     it, so it is queued, never kept. `trail` is render.js's own (world
     points, oldest first); `orb` is false when the move brings its own art,
     which then flies over its pixel trail. Each type sheds its matter. */
  const queued = [], arcs = new Map();
  let time = 0;
  const reroll = (id, make) => {
    const f = Math.floor(time * 15), c = arcs.get(id);
    if (c && c.f === f) { c.seen = frame; return c.v; }
    const v = make();
    arcs.set(id, { f, v, seen: frame });
    return v;
  };
  /* `ult`: a Barrage ULTI's name, which gives its shots their own look (`centre`: the middle of its fan). */
  function shot(id, type, wx, wy, dx, dy, trail, { basic = false, boost = false, orb = true, k = 1, ult = null, centre = false } = {}) {
    const LOOK = { "Water Shuriken": centre ? SHURIKEN : RAMP.water, "Aura Sphere": AURAB, "Shadow Storm": DARKP }[ult];
    const R = LOOK ?? (type === "fire" ? HEAT : RAMP[type] ?? RAMP.normal), T = LOOK ?? RAMP[type] ?? RAMP.normal;
    const [x, y] = toPx(wx, wy), r = basic ? (boost ? 2.2 : 1.5) : 2.6;
    const pts = trail.map(([tx, ty]) => toPx(tx, ty));
    // Its matter, shed behind it: a few a second for the basic attack, more for a move.
    if (rand() < (basic ? 0.25 : 0.7) * k) {
      const bx = x - dx * r * 2, by = y - dy * r * 2;
      switch (type) {
        case "fire": add({ k: rand() < 0.5 ? "ember" : "flame", x: bx, y: by, vx: range(-10, 10), vy: range(-30, -10), drag: 2, life: range(0.25, 0.5), size: 0.8 }); break;
        case "water": add({ k: "drop", x: bx, y: by, vx: -dx * 20, vy: range(-20, 0), g: 300, life: range(0.3, 0.5), ramp: T, gy: y + 8 }); break;
        case "electric": add({ k: "spark", x: bx, y: by, vx: range(-60, 60), vy: range(-60, 60), drag: 4, life: range(0.1, 0.2), ramp: T }); break;
        case "ice": add({ k: "shard", x: bx, y: by, vx: range(-15, 15), vy: range(-10, 10), g: 60, life: range(0.3, 0.5), size: 1, a: range(0, TAU), va: range(-10, 10), ramp: T }); break;
        case "grass": case "bug": add({ k: "leaf", x: bx, y: by, vx: range(-15, 15), vy: range(-15, 5), g: 40, drag: 2, life: range(0.5, 0.8), a: range(0, TAU), va: range(-8, 8), ramp: T }); break;
        case "poison": add({ k: "bubble", x: bx, y: by, vx: range(-6, 6), vy: range(-14, -4), life: range(0.3, 0.5), size: 1, ramp: T }); break;
        case "ghost": case "dark": add({ k: "smoke", x: bx, y: by, vx: range(-4, 4), vy: range(-8, -2), life: range(0.4, 0.7), size: 1.4, smoke: [T[3], T[4], T[5], T[6]] }); break;
        case "psychic": case "fairy": add({ k: "star", x: bx + range(-2, 2), y: by + range(-2, 2), life: 0.35, size: 1, ramp: T }); break;
        case "steel": add({ k: "spark", x: bx, y: by, vx: -dx * 60 + range(-20, 20), vy: -dy * 60 + range(-20, 20), drag: 4, life: 0.15, ramp: HEAT.slice(0, 7) }); break;
        default: add({ k: "mote", x: bx + range(-1, 1), y: by + range(-1, 1), vx: -dx * 20, vy: -dy * 20, drag: 3, life: range(0.25, 0.45), ramp: T });
      }
    }
    queued.push((L) => {
      // The trail: discs tapering and darkening with age, dithered out.
      const n = pts.length;
      // Never under a pixel before it fades, or the tail breaks into loose dots.
      pts.forEach(([qx, qy], i) => { const u = 1 - i / n; L.f.disc(qx, qy, Math.max(0.75, r * (1 - u) * 0.95), R[Math.min(R.length - 1, 2 + Math.floor(u * 4))], Math.pow(1 - u, 0.7)); });
      L.l.glow(x, y, basic ? 7 : 12, T[3], basic ? 0.35 : 0.55);
      if (!orb) return;
      // The Barrage ULTIs, as the anime draws them (Phase 7).
      if (ult === "Water Shuriken") { shuriken(L, x, y, centre ? 12 : 5, time * (centre ? 18 : 26), T); return; }
      if (ult === "Aura Sphere") {
        const rr = centre ? 5 : 3.5;
        for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + time * 3, l = (2 + 3 * (0.5 + 0.5 * noise(time * 8 + i, 3))) * (rr / 5); for (let d = 0; d < l; d++) L.f.dot(x + Math.cos(a) * (rr + d), y + Math.sin(a) * (rr + d), d < l * 0.5 ? T[2] : T[4], 1 - d / l); }
        orbAt(L, x, y, rr, T); return;
      }
      if (ult === "Shadow Storm") {
        orbAt(L, x, y, centre ? 5 : 4, T);
        const v = reroll(id, () => [0, 1].map(() => { const a = range(0, TAU); return bolt(Math.cos(a) * 2, Math.sin(a) * 2, Math.cos(a) * 8, Math.sin(a) * 8, 0.45); }));
        for (const p of v) for (let i = 0; i < p.length - 1; i++) L.f.line(x + p[i][0], y + p[i][1], x + p[i + 1][0], y + p[i + 1][1], i < 2 ? T[4] : T[6]);
        return;
      }
      switch (type) {
        case "water":
          L.f.disc(x, y, r + 0.6, T[3], 0.5); L.f.ring(x, y, r, 1, T[2]); L.f.set(x - r * 0.4, y - r * 0.5, T[0]);
          return;
        case "ice":
          for (let qy = -r - 1; qy <= r + 1; qy++) for (let qx = -r - 1; qx <= r + 1; qx++) {
            const d = Math.abs(qx) + Math.abs(qy);
            if (d <= r + 0.5) L.f.set(x + qx, y + qy, d > r - 0.6 ? T[5] : qx < 0 ? T[1] : T[3]);
          }
          L.f.set(x, y - r, T[0]);
          return;
        case "grass": case "bug": {
          L.f.disc(x, y, r * 0.7 + 0.5, T[5]); L.f.disc(x, y, r * 0.7, T[3]); L.f.set(x - 0.5, y - 0.5, T[1]);
          for (let i = 0; i < 3; i++) { const a = time * 10 + (i * TAU) / 3, lx = x + Math.cos(a) * (r + 1.5), ly = y + Math.sin(a) * (r + 1.5); L.f.set(lx, ly, T[2]); L.f.set(lx + Math.cos(a + 1.6), ly + Math.sin(a + 1.6), T[4]); }
          return;
        }
        default:
          L.f.disc(x, y, r + 0.9, R[Math.min(R.length - 1, 5)]); L.f.disc(x, y, r, R[3]); L.f.disc(x - 0.4, y - 0.4, r * 0.55, R[1]); L.f.set(x - r * 0.35, y - r * 0.45, R[0]);
      }
      // Electric crackles round its ball, a ghost trails filaments: both re-rolled 15 times a second, not 60.
      if (type === "electric" || type === "ghost") {
        const v = reroll(id, () => Array.from({ length: type === "electric" ? 2 : 3 }, () => { const a = range(0, TAU), d0 = r * 0.6, d1 = r + range(3, 6); return bolt(Math.cos(a) * d0, Math.sin(a) * d0, Math.cos(a + range(-0.6, 0.6)) * d1, Math.sin(a + range(-0.6, 0.6)) * d1, 0.4); }));
        for (const p of v) for (let i = 0; i < p.length - 1; i++) L.f.line(x + p[i][0], y + p[i][1], x + p[i + 1][0], y + p[i + 1][1], i < 2 ? T[1] : T[3]);
      }
    });
  }

  /* A BEAM ACROSS ITS WIDTH (Phase 3): banded from a white core out through
     its type's ramp to a dithered edge, every pixel solid. Fire is a cone
     that whitens at the mouth, water a jet with foam on its edges and flow
     running down it, ice a beam with beads and glints, electric bolts
     re-rolled 15 times a second; `fade` thins it as it goes. */
  function band(L, id, type, x, y, ux, uy, len, hw, fade, T = RAMP[type] ?? RAMP.normal) {
    if (type === "electric") {
      const v = reroll(id, () => Array.from({ length: 3 }, () => bolt(0, 0, len, 0, 0.18)));
      v.forEach((p, b) => { for (let i = 0; i < p.length - 1; i++) { const [a0, o0] = p[i], [a1, o1] = p[i + 1]; L.f.line(x + ux * a0 - uy * o0, y + uy * a0 + ux * o0, x + ux * a1 - uy * o1, y + uy * a1 + ux * o1, b ? T[2] : T[0], fade); } });
      for (let d = 0; d <= len; d += 6) L.l.glow(x + ux * d, y + uy * d, hw * 2, T[3], 0.35 * fade);
      return;
    }
    for (let d = 0; d <= len; d += 0.5) {
      const q = d / Math.max(1, len), cx = x + ux * d, cy = y + uy * d;
      let w = hw * (0.45 + 0.55 * Math.min(1, d / 12)) * fade;
      if (type === "fire") w = hw * (0.35 + q * 1.1) * (0.85 + 0.25 * Math.sin(d * 0.5 - time * 26)) * fade;
      else if (type === "water") w = hw * (0.7 + q * 0.5 + Math.sin(d * 0.45 - time * 32) * 0.12) * fade;
      const wob = type === "ice" ? 0 : Math.sin(d * 0.4 - time * 30) * 0.3;
      for (let o = -w - 1; o <= w + 1; o += 0.5) {
        const b = Math.abs(o + wob) / Math.max(0.5, w), px = cx - uy * o, py = cy + ux * o;
        if (type === "fire") {
          // The heat ramp: white at the mouth and the core, red and then soot at the edge and the tip.
          if (b > 1) continue;
          const i = Math.min(9, Math.floor(b * 5 + q * 4 + (b > 0.8 ? 1 : 0)));
          if (b > 0.85 && bayer(Math.floor(px), Math.floor(py)) > 0.6) continue;
          L.f.set(px, py, HEAT[i]);
        } else if (type === "water") {
          const foam = noise(d * 0.6 - time * 24, Math.round(o * 2)) > 0.35;
          if (b < 0.3) L.f.set(px, py, T[1]);
          else if (b < 0.75) L.f.set(px, py, (Math.floor(d - time * 160) & 7) < 2 ? T[1] : T[2]);
          else if (b < 1) L.f.set(px, py, foam ? T[0] : T[3]);
          else if (foam) L.f.dot(px, py, T[0], 0.5);
        } else {
          if (b < 0.35) L.f.set(px, py, T[0]);
          else if (b < 0.7) L.f.set(px, py, T[1]);
          else if (b < 1) L.f.set(px, py, T[3]);
          else L.f.dot(px, py, T[5], 0.6);
        }
      }
      if (d % 7 < 0.5) L.l.glow(cx, cy, hw * 1.6, type === "fire" ? HEAT[4] : T[3], 0.3 * fade);
    }
    if (type === "ice" || type === "psychic" || type === "fairy" || type === "dragon") {
      // Beads running down it, and a glint off it now and then.
      for (let k2 = 0; k2 < 4; k2++) { const d = (time * 220 + k2 * 23) % Math.max(1, len); L.f.line(x + ux * d, y + uy * d, x + ux * (d + 3), y + uy * (d + 3), T[0], fade); }
      if (Math.floor(time * 30) % 3 === 0) { const d = len * ((Math.floor(time * 10) * 0.618) % 1); sparkle(L.f, x + ux * d - uy * hw, y + uy * d + ux * hw, 2, T[1], T[3]); }
    }
  }
  const noise = (v, seed = 0) => { const i = Math.floor(v), f = v - i, u = f * f * (3 - 2 * f), h = (n) => ((Math.imul(n + 1 + seed * 7919, 2654435761) >>> 0) % 100000) / 100000; return (h(i) * 2 - 1) + ((h(i + 1) * 2 - 1) - (h(i) * 2 - 1)) * u; };

  /* A STREAM AS IT POURS (render.js `pour`, held and aimed): queued each
     frame from the fighter's act, with its matter thrown off along it and a
     splash where it lands. `hw` is the beam's half-width in world tiles. */
  function stream(id, type, wx, wy, dx, dy, wlen, whw, k = 1, slug = null) {
    // A signature move held (`STREAM_RAMP`: Solar Beam's sunlight, Hyper Beam's orange) pours in its own colours, wider.
    const own = STREAM_RAMP[slug];
    if (own && slug !== "zap-cannon") type = "sig";     // Zap Cannon keeps electric's bolts, its ball riding them
    const [x, y] = toPx(wx, wy), len = wlen * BODY_PX, hw = whw * BODY_PX * (own ? 0.8 : 0.55), T = own ?? RAMP[type] ?? RAMP.normal;
    const ex = x + dx * len, ey = y + dy * len;
    for (let q = 0; q < 3; q++) if (rand() < 0.8 * k) {
      const d = rand() * len, bx = x + dx * d, by = y + dy * d;
      if (type === "fire") add({ k: "flame", x: bx, y: by, vx: dx * 40 + range(-15, 15), vy: dy * 40 - range(10, 30), drag: 2, life: range(0.25, 0.45), size: range(0.8, 1.4) });
      else if (type === "water") add({ k: "drop", x: bx - dy * hw, y: by + dx * hw, vx: dx * 30 + range(-20, 20), vy: range(-40, 0), g: 320, life: range(0.3, 0.6), ramp: T, gy: by + 14 });
      else if (type === "electric") add({ k: "spark", x: bx, y: by, vx: range(-80, 80), vy: range(-80, 80), drag: 4, life: range(0.08, 0.18), ramp: T });
      else add({ k: "mote", x: bx + range(-hw, hw), y: by + range(-hw, hw), vx: range(-20, 20), vy: range(-20, 20), drag: 3, life: range(0.25, 0.45), ramp: T });
    }
    if (rand() < 0.9 * k) {
      const a = Math.atan2(-dy, -dx) + range(-1.2, 1.2), sp = range(40, 110);
      if (type === "water") add({ k: "drop", x: ex, y: ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 320, life: range(0.4, 0.7), ramp: T, gy: ey + 10 });
      else if (type === "fire") add({ k: rand() < 0.3 ? "smoke" : "ember", x: ex, y: ey, vx: Math.cos(a) * 20, vy: -range(20, 50), life: range(0.6, 1.1), size: 2 });
      else add({ k: "spark", x: ex, y: ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.12, 0.3), ramp: T });
    }
    queued.push((L) => {
      // Bubble Beam is a STREAM OF BUBBLES, not a beam: rings of three sizes pouring along it, wobbling, a white glint on each.
      if (slug === "bubble-beam") for (let i = 0; i < 16; i++) {
        const d = (time * 150 + (i * len) / 16) % Math.max(1, len), o = Math.sin(d * 0.25 + i * 1.7) * hw * 1.4, r = 1.5 + ((i * 7) % 3) * 1.2 + d / Math.max(1, len) * 1.5;
        const bx = x + dx * d - dy * o, by = y + dy * d + dx * o;
        L.f.ring(bx, by, r, 1, T[i % 3 ? 2 : 1], 1); L.f.set(bx - r * 0.4, by - r * 0.5, T[0]);
      }
      // Psybeam is a RAINBOW beam (the anime's multicoloured ray): bands of every colour running down it, a white core.
      else if (slug === "psybeam") for (let d = 0; d <= len; d += 0.5) {
        const c = RAINBOW[Math.floor(d / 5 - time * 24) % RAINBOW.length < 0 ? (Math.floor(d / 5 - time * 24) % RAINBOW.length) + RAINBOW.length : Math.floor(d / 5 - time * 24) % RAINBOW.length], w = hw * (0.75 + 0.25 * Math.sin(d * 0.3 - time * 30));
        for (let o = -w; o <= w; o += 0.5) { const b = Math.abs(o) / w; L.f.set(x + dx * d - dy * o, y + dy * d + dx * o, b < 0.3 ? RAMP.normal[0] : b < 0.8 ? c : PSYBEAMR[5]); }
      }
      // Flash Cannon: a narrow white core in a beam of polished steel, dark-rimmed (a plain band read as a white laser).
      else if (slug === "flash-cannon") for (let d = 0; d <= len; d += 0.5) {
        const w = hw * (0.8 + 0.2 * Math.sin(d * 0.25 - time * 30));
        for (let o = -w - 1; o <= w + 1; o += 0.5) { const bb = Math.abs(o) / w; L.f.set(x + dx * d - dy * o, y + dy * d + dx * o, bb < 0.22 ? T[0] : bb < 0.55 ? T[2] : bb < 0.9 ? T[3] : bb <= 1 ? T[4] : T[6]); }
      }
      else band(L, `s${id}`, type, x, y, dx, dy, len, hw, 1, T);
      // Flash Cannon: a silver beam with glints running down it and a white flare at its mouth.
      if (slug === "flash-cannon") { for (let i = 0; i < 4; i++) { const d = (time * 200 + (i * len) / 4) % Math.max(1, len); sparkle(L.f, x + dx * d, y + dy * d, 3, FLASHC[0], FLASHC[2]); } sparkle(L.f, x, y, 5, FLASHC[0], FLASHC[3]); L.l.glow(x, y, hw * 3, FLASHC[2], 0.6); }
      // Flamethrower: tongues of flame curling off the cone's edges, and a white-hot flare at the mouth.
      if (slug === "flamethrower") {
        for (let i = 0; i < 10; i++) { const d = (time * 110 + (i * len) / 10) % Math.max(1, len), q = d / Math.max(1, len), side2 = i % 2 ? 1 : -1, w = hw * (0.35 + q * 1.1) + 1, cx2 = x + dx * d - dy * side2 * w, cy2 = y + dy * d + dx * side2 * w; for (let j = 0; j < 4; j++) L.f.dot(cx2 - dy * side2 * j + Math.sin(time * 30 + i + j) * 0.8, cy2 + dx * side2 * j - j * 0.5, HEAT[Math.min(9, 3 + j + Math.floor(q * 3))]); }
        sparkle(L.f, x, y, 4, HEAT[0], HEAT[2]);
      }
      // Hydro Pump: two white foam ribbons twisting round the jet, a ring of spray at its mouth.
      if (slug === "hydro-pump") {
        for (let i = 0; i < 2; i++) for (let d = 0; d < len; d += 0.5) { const o = Math.sin(d * 0.3 - time * 26 + i * Math.PI) * (hw + 1.5); L.f.dot(x + dx * d - dy * o, y + dy * d + dx * o, Math.cos(d * 0.3 - time * 26 + i * Math.PI) > 0 ? T[0] : T[2]); }
        L.f.ring(x, y, hw + 3 + Math.sin(time * 40), 1.5, T[0], 0.9);
      }
      // Aurora Beam: soft bands of every pastel colour rippling down a pale core.
      if (slug === "aurora-beam") for (let d = 0; d <= len; d += 0.5) {
        const n = AURORAB.length, c = AURORAB[((Math.floor(d / 6 - time * 18) % n) + n) % n], w = hw * (0.8 + 0.2 * Math.sin(d * 0.25 - time * 20));
        for (let o = -w; o <= w; o += 0.5) { const bb = Math.abs(o) / w; if (bb > 0.35 && bb < 0.9) L.f.set(x + dx * d - dy * o, y + dy * d + dx * o, c); }
      }
      // Ice Beam: snowflake crystals forming along both edges, and ice spikes splaying back where it lands.
      if (slug === "ice-beam") {
        for (let i = 0; i < 6; i++) { const d = (time * 120 + (i * len) / 6) % Math.max(1, len), o = (i % 2 ? 1 : -1) * (hw + 2); flake(L, x + dx * d - dy * o, y + dy * d + dx * o, 3, T); }
        for (let i = 0; i < 7; i++) { const a = Math.atan2(dy, dx) + Math.PI + (i - 3) * 0.42, l = 5 + (i % 2) * 5; L.f.line(ex, ey, ex + Math.cos(a) * l, ey + Math.sin(a) * l, T[i % 2 ? 1 : 0]); L.f.line(ex + 1, ey, ex + 1 + Math.cos(a) * l, ey + Math.sin(a) * l, T[3]); }
        sparkle(L.f, ex, ey, 4, T[0], T[2]);
      }
      if (slug === "zap-cannon") { const d = (time * 160) % Math.max(1, len), bx = x + dx * d, by = y + dy * d; orbAt(L, bx, by, 6, RAMP.electric); for (let i = 0; i < 3; i++) { const p = bolt(bx, by, bx + range(-10, 10), by + range(-10, 10), 0.4); for (let j = 0; j < p.length - 1; j++) L.f.line(p[j][0], p[j][1], p[j + 1][0], p[j + 1][1], RAMP.electric[1]); } }
      // Dark Pulse: dark rings of malice rolling down it, a pale rim to each.
      if (slug === "dark-pulse") for (let i = 0; i < 5; i++) { const d = (time * 110 + (i * len) / 5) % Math.max(1, len); for (let q = 0; q < TAU; q += 0.2) L.f.dot(x + dx * d + dx * Math.cos(q) * 3 - dy * Math.sin(q) * (hw + 4), y + dy * d + dy * Math.cos(q) * 3 + dx * Math.sin(q) * (hw + 4), q < Math.PI ? T[0] : T[2], 1); }
      // Dragon Pulse's rings of force running down it.
      if (slug === "dragon-pulse") for (let i = 0; i < 4; i++) { const d = (time * 140 + (i * len) / 4) % Math.max(1, len); for (let q = 0; q < TAU; q += 0.25) L.f.dot(x + dx * d + dx * Math.cos(q) * 2.5 - dy * Math.sin(q) * (hw + 3), y + dy * d + dy * Math.cos(q) * 2.5 + dx * Math.sin(q) * (hw + 3), T[i % 2 ? 1 : 2], 1); }
      // Hyper Beam's light pink streaks twisting round it.
      if (slug === "hyper-beam") for (let i = 0; i < 3; i++) for (let d = 0; d < len; d += 0.5) { if ((d + i * 7 + time * 90) % 10 >= 6) continue; const o = Math.sin(d * 0.25 + time * 18 + i * 2.1) * (hw + 3); L.f.dot(x + dx * d - dy * o, y + dy * d + dx * o, HPINK[i], 1); }
      L.l.glow(x, y, hw * 2, type === "fire" ? HEAT[1] : T[2], 0.6);
      L.l.glow(ex, ey, hw * 2.5, type === "fire" ? HEAT[4] : T[3], 0.5);
    });
  }
  /* A BEAM FIRED (render.js `take`, a move without stream art of its own):
     at full width for a beat, then thinning out over its `life`. */
  let beams = 0;
  function beam(type, wx, wy, dx, dy, wlen, whw, life) {
    const [x, y] = toPx(wx, wy), len = wlen * BODY_PX, hw = whw * BODY_PX * 0.55, id = `b${beams++}`;
    let t = 0;
    fxs.push({ life, get t() { return t; }, update(dt) { t += dt; },
      draw(L) { const u = t / life; band(L, id, type, x, y, dx, dy, len, hw, u < 0.25 ? 1 : 1 - (u - 0.25) / 0.75); L.l.glow(x + dx * len, y + dy * len, hw * 2.5, (RAMP[type] ?? RAMP.normal)[3], 0.6 * (1 - u)); } });
  }

  /* A STATUS ON THE BODY'S OWN OUTLINE (Phase 4): `body` is render.js's
     `maskOf` - the PMD frame it drew last, its alpha a pixel each, and where
     it stood. Burn licks up the top edge, paralysis crackles between edge
     pixels, poison bubbles off it, freeze crusts it, sleep drifts Zs. */
  function status(id, kind, body, k = 1) {
    const [bx, by] = toPx(body.wx, body.wy), x0 = Math.round(bx + body.ox), y0 = Math.round(by + body.oy);
    const { w, h, m, flip } = body;
    const on = (i, j) => i >= 0 && j >= 0 && i < w && j < h && m[j * w + (flip ? w - 1 - i : i)] === 1;
    const any = () => { for (let n = 0; n < 30; n++) { const i = Math.floor(rand() * w), j = Math.floor(rand() * h); if (on(i, j)) return [x0 + i + 0.5, y0 + j + 0.5]; } return [x0 + w / 2, y0 + h / 2]; };
    const T = RAMP[kind === "brn" ? "fire" : kind === "par" ? "electric" : kind === "psn" ? "poison" : kind === "frz" ? "ice" : "psychic"];
    if (kind === "brn" && rand() < 0.35 * k) { const [ex, ey] = any(); add({ k: "ember", x: ex, y: ey - 3, vx: range(-10, 10), vy: range(-40, -15), life: range(0.6, 1.2) }); }
    if (kind === "psn" && rand() < 0.15 * k) { const [ex, ey] = any(); add({ k: "bubble", x: ex, y: ey, vx: range(-4, 4), vy: range(-18, -8), life: range(0.4, 0.7), size: 1, ramp: T }); }
    if (kind === "slp" && rand() < 0.03 * k) add({ k: "z", x: x0 + w * 0.7, y: y0 + 2, vx: range(6, 12), vy: -range(10, 16), life: 1.3, size: rand() < 0.5 ? 2 : 3, ramp: RAMP.normal });
    if (kind === "frz" && rand() < 0.04 * k) { const [ex, ey] = any(); add({ k: "star", x: ex, y: ey, life: 0.35, size: 2, ramp: T }); }
    queued.push((L) => {
      if (kind === "brn") {
        // A tongue on every second column of the top edge, its height from noise.
        for (let i = 0; i < w; i += 2) {
          let top = -1;
          for (let j = 0; j < h; j++) if (on(i, j)) { top = j; break; }
          if (top < 0) continue;
          const n = i * 7.3, ht = (3 + 4 * ((i * 37) % 10) / 10) * (0.8 + 0.4 * noise(time * 3.3 + n, i)) * (1 + Math.max(0, noise(time * 2.6 + n, i + 70) - 0.5) * 1.6);
          const fx0 = x0 + i, fy0 = y0 + top + 2, sway = noise(time * 2.2 + n, i + 40) * 1.4;
          for (let yy = 0; yy < ht; yy++) {
            const u = yy / ht, hw = 1.3 * Math.pow(1 - u, 0.7) + 0.2, cx = fx0 + sway * u * u;
            for (let xx = Math.floor(cx - hw); xx <= Math.ceil(cx + hw); xx++) {
              const e = Math.abs(xx + 0.5 - cx);
              if (e <= hw) L.f.set(xx, fy0 - yy, HEAT[Math.min(9, (e > hw - 0.8 && u > 0.2 ? 3 : 1) + Math.floor(u * 6))]);
            }
          }
        }
        L.l.glow(x0 + w / 2, y0 + h * 0.4, w, HEAT[4], 0.3 * (0.9 + 0.1 * Math.sin(time * 23)));
      } else if (kind === "par") {
        // Crackle between pixels of its own edge, re-rolled 15 times a second.
        const v = reroll(`p${id}`, () => {
          const edge = [];
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (on(i, j) && (!on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1) || !on(i, j + 1))) edge.push([i, j]);
          const out = [];
          for (let n = 0; n < 2 && edge.length; n++) { const a = edge[Math.floor(rand() * edge.length)], b = edge[Math.floor(rand() * edge.length)]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 16) out.push(bolt(a[0], a[1], b[0], b[1], 0.4)); }
          return out;
        });
        for (const p of v) for (let i = 0; i < p.length - 1; i++) L.f.line(x0 + p[i][0], y0 + p[i][1], x0 + p[i + 1][0], y0 + p[i + 1][1], i % 2 ? T[2] : T[0]);
        L.l.glow(x0 + w / 2, y0 + h / 2, w * 0.8, T[3], 0.2 + 0.12 * Math.sin(time * 57));
      } else if (kind === "frz") {
        // Its own pixels crusted with ice: solid at the edge, scattered inside.
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          if (!on(i, j)) continue;
          if (!on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1)) L.f.set(x0 + i, y0 + j, T[1]);
          else if (((i * 17 + j * 31) % 100) < 45) L.f.dot(x0 + i, y0 + j, ((i + j * 9) % 2) ? T[2] : T[3], 0.85);
        }
        L.l.glow(x0 + w / 2, y0 + h / 2, w * 0.7, T[3], 0.25);
      } else if (kind === "psn") {
        L.l.glow(x0 + w / 2, y0 + h / 2, w * 0.6, T[3], 0.15 + 0.1 * Math.sin(time * 6));
      }
    });
  }

  /* ---------- Phase 5: movement and guarding ---------- */
  // Each side's body as last drawn (render.js `maskOf`), for what follows it: an aura.
  const bodies = [null, null];
  const setBody = (side, body) => { bodies[side] = body; };
  const origin = (body) => { const [bx, by] = toPx(body.wx, body.wy); return [Math.round(bx + body.ox), Math.round(by + body.oy)]; };
  const maskAt = (body) => (i, j) => i >= 0 && j >= 0 && i < body.w && j < body.h && body.m[j * body.w + (body.flip ? body.w - 1 - i : i)] === 1;

  /* AN AFTERIMAGE (a dash, a dodge, a lunge, a surge): the body's own
     silhouette where it was, in a ramp, stepping down it and dithering out. */
  function afterimage(body, type, life) {
    const R = type === "dash" ? DASHR : RAMP[type] ?? RAMP.normal, [x0, y0] = origin(body), on = maskAt(body);
    let t = 0;
    fxs.push({ life, get t() { return t; }, update(dt) { t += dt; },
      draw(L) {
        const k = t / life, c = R[Math.min(R.length - 1, 1 + Math.floor(k * (R.length - 2)))], a = k < 0.4 ? 0.9 : 0.9 * (1 - k) / 0.6;
        for (let j = 0; j < body.h; j++) for (let i = 0; i < body.w; i++) if (on(i, j)) L.b.dot(x0 + i, y0 + j, c, a);
      } });
  }
  // Speed lines behind a body on the move, along `dx, dy`.
  function speed(wx, wy, dx, dy, type = "dash") {
    const R = type === "dash" ? DASHR : RAMP[type] ?? RAMP.normal, [x, y] = toPx(wx, wy);
    add({ k: "line", x: x + range(-6, 6), y: y + range(-14, 2), ux: -dx, uy: -dy, size: range(8, 22), life: 0.2, ramp: R, front: false });
  }

  /* PROTECT'S DOME: hex cells rising from the ground round the body while
     the shield holds, a hit rippling out from where it landed (`shieldHit`),
     and shards when it drops. render.js queues it while drawing the body,
     after this frame's paint, so a dome not queued since the last paint
     (`live`) has broken. */
  const domes = new Map();
  function shield(id, wx, wy) {
    const [x, y] = toPx(wx, wy - 0.3);
    let d = domes.get(id);
    if (!d) domes.set(id, (d = { born: time, pulses: [] }));
    d.x = x; d.y = y; d.live = true;
    queued.push((L) => {
      const C = SHIELDR, RX = 15, RY = 16, CELL = 3.6, form = clamp((time - d.born) / 0.35);
      for (let py = Math.floor(y - RY); py <= y + RY; py++) for (let px2 = Math.floor(x - RX); px2 <= x + RX; px2++) {
        const ddx = (px2 + 0.5 - x) / RX, ddy = (py + 0.5 - y) / RY, dd = ddx * ddx + ddy * ddy;
        if (dd > 1) continue;
        // Which hex cell, and how near its edge (cube rounding).
        const q = ((px2 - x) * 0.5773 - (py - y) / 3) / CELL, r = ((py - y) * 2 / 3) / CELL;
        let rx = Math.round(q), rz = Math.round(r); const ry = Math.round(-q - r);
        const ex = Math.abs(rx - q), ez = Math.abs(rz - r), ey = Math.abs(ry + q + r);
        if (ex > ey && ex > ez) rx = -ry - rz; else if (ey <= ez) rz = -rx - ry;
        const edge = Math.max(ex, ey, ez), up = 1 - (py - (y - RY)) / (2 * RY);
        const appear = clamp((form * 1.5 - up * 0.8 - (((rx * 31 + rz * 17) % 7 + 7) % 7) / 28) * 4);
        if (appear <= 0) continue;
        let hot = 0;
        for (const p of d.pulses) { const age = time - p.t, dist = Math.hypot(px2 - p.x, py - p.y); hot = Math.max(hot, clamp(1 - Math.abs(dist - age * 70) / 4) * clamp(1 - age / 0.35), dist < 5 && age < 0.12 ? 1 : 0); }
        const buf = py > y + RY * 0.3 ? L.f : L.b;
        if (dd > 0.82) buf.dot(px2, py, hot > 0.4 ? C[0] : C[2], appear * 0.95);
        else if (edge > 0.36) buf.dot(px2, py, hot > 0.4 ? C[0] : hot > 0.1 ? C[1] : C[3], appear * (0.6 + hot));
        else if (hot > 0.1) buf.dot(px2, py, C[2], appear * hot * 0.6);
      }
      L.l.glow(x, y, 20, C[3], 0.2 * form);
      for (const p of d.pulses) { const age = time - p.t; if (age < 0.3) L.l.glow(p.x, p.y, 10, C[2], 0.6 * (1 - age / 0.3)); }
      d.pulses = d.pulses.filter((p) => time - p.t < 0.4);
    });
  }
  function shieldHit(id, wx, wy) {
    const d = domes.get(id);
    if (!d) return;
    const [hx, hy] = toPx(wx, wy - 0.3), a = Math.atan2(hy - d.y, hx - d.x);
    d.pulses.push({ x: d.x + Math.cos(a) * 15, y: d.y + Math.sin(a) * 16, t: time });
  }
  function breakDomes() {
    for (const [id, d] of domes) {
      if (d.live) { d.live = false; continue; }
      for (let i = 0; i < 26; i++) { const a = range(Math.PI, TAU), x = d.x + Math.cos(a) * 15 * range(0.8, 1), y = d.y + Math.sin(a) * 16 * range(0.8, 1); add({ k: "shard", x, y, vx: (x - d.x) * 3, vy: (y - d.y) * 2 - 20, g: 280, life: range(0.4, 0.8), size: range(1, 2), a: range(0, TAU), va: range(-14, 14), ramp: SHIELDR, gy: d.y + 18 }); }
      domes.delete(id);
    }
  }

  /* A HEAL: crosses rising round the body over half a second, and a ring on the floor. */
  function heal(wx, wy) {
    const [x, y] = toPx(wx, wy), gy = toPx(0, wy + 0.42)[1];
    for (let i = 0; i < 12; i++) add({ k: "cross", x: x + range(-10, 10), y: y + range(-6, 4), vy: -range(16, 30), sway: 30, life: range(0.7, 1.1), size: rand() < 0.35 ? 2 : 1, ramp: HEALR, front: rand() < 0.6, delay: i * 0.05 });
    fxs.push(floorRing(x, gy, HEALR, 0.9, 16));
  }

  /* A STAT RAISED OR LOWERED: an aura shaped to the body by its own distance
     field, flaring once and dithering out, and chevrons going its way. Up is
     warm, down cold - the words over it already say which stat. */
  const AURA = 12;
  function boost(side, up) {
    const R = up ? RAMP.fighting : RAMP.water;
    let t = 0;
    const life = 0.8;
    const body = bodies[side];
    if (body) { const [x0, y0] = origin(body); for (let i = 0; i < 5; i++) add({ k: "chev", x: x0 + body.w * (0.2 + 0.6 * rand()), y: up ? y0 + body.h * 0.8 : y0, vy: up ? -range(20, 34) : range(20, 34), life: 0.6, up, ramp: R, delay: i * 0.06 }); }
    fxs.push({ life, get t() { return t; }, update(dt) { t += dt; },
      draw(L) { const u = t / life; auraOn(L, bodies[side], R, u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8, Math.exp(-(((u - 0.15) / 0.08) ** 2)), up ? 1 : 0); } });
  }
  /* AN AURA SHAPED TO THE BODY by its own distance field (a stat's boost, Frenzy Plant's green, Aura Sphere's
     blue, Dragon Rush's menace): `amt` 0..1, `flare` a flash, `rise` how much it climbs (0: it falls). */
  function auraOn(L, b, R, amt, flare = 0, rise = 1) {
    if (!b || amt <= 0.02) return;
    const [x0, y0] = origin(b), on = maskAt(b), W2 = b.w + 2 * AURA, H2 = b.h + 2 * AURA, dist = new Uint8Array(W2 * H2);
    for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) dist[j * W2 + i] = on(i - AURA, j - AURA) ? 0 : 255;
    const relax = (i, j2, w) => { if (dist[j2] + w < dist[i]) dist[i] = dist[j2] + w; };
    for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) { const n = j * W2 + i; if (i > 0) relax(n, n - 1, 3); if (j > 0) { relax(n, n - W2, 3); if (i > 0) relax(n, n - W2 - 1, 4); if (i < W2 - 1) relax(n, n - W2 + 1, 4); } }
    for (let j = H2 - 1; j >= 0; j--) for (let i = W2 - 1; i >= 0; i--) { const n = j * W2 + i; if (i < W2 - 1) relax(n, n + 1, 3); if (j < H2 - 1) { relax(n, n + W2, 3); if (i < W2 - 1) relax(n, n + W2 + 1, 4); if (i > 0) relax(n, n + W2 - 1, 4); } }
    for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
      const d = dist[j * W2 + i] / 3;
      if (d === 0 || d > AURA) continue;
      const px2 = x0 - AURA + i, py = y0 - AURA + j, n = noise(px2 * 0.5 + (py + (rise > 0 ? time * 34 : -time * 34)) * 0.26, 3) * 0.5 + 0.5;
      const reach = amt * (2 + 9 * n * (rise > 0 ? rise * clamp(1 - (j - AURA) / Math.max(1, b.h)) + 0.3 : 1)) * (1 + 0.4 * flare);
      if (d > reach) continue;
      const bandK = d / reach;
      if (bandK < 0.25) L.b.set(px2, py, flare > 0.4 ? R[0] : R[1]);
      else if (bandK < 0.5) L.b.set(px2, py, R[2]);
      else if (bandK < 0.75) L.b.set(px2, py, R[3]);
      else L.b.dot(px2, py, R[4], (1 - bandK) * 2.6);
    }
    L.l.glow(x0 + b.w / 2, y0 + b.h / 2, b.w, R[3], 0.4 * amt + 0.3 * flare);
  }

  /* ---------- Phase 6: the big moments ---------- */
  /* A BOLT FROM THE SKY (render.js `strike`: Thunder, Thunderbolt, a storm's
     ULTI): a leader stepping down in nine, the stroke flickering on the
     envelope real lightning has, forks, arcs crawling over the floor, and a
     scorch cooling through the heat ramp to dithered soot. */
  function strike(wx, wy) {
    const V = RAMP.electric, [x, y] = toPx(wx, wy), gy = toPx(0, wy + 0.42)[1], top = Math.max(0, y - 110);
    const b = { main: bolt(x + range(-14, 14), top, x, gy, 0.22), forks: [] };
    for (let i = 0; i < 3; i++) { const p = b.main[Math.floor(range(0.2, 0.6) * b.main.length)], a = Math.PI / 2 + range(-1, 1); b.forks.push(bolt(p[0], p[1], p[0] + Math.cos(a) * range(12, 28), p[1] + Math.sin(a) * range(10, 22), 0.35)); }
    const LEAD = 0.12;
    let t = 0, hit = false, crawls = [], at = -1;
    fxs.push({ life: 1.8, get t() { return t; },
      update(dt) {
        t += dt;
        if (!hit && t >= LEAD) {
          hit = true;
          for (let j = 0; j < 30; j++) { const a = -Math.PI / 2 + range(-1.4, 1.4), sp = range(60, 200); add({ k: "spark", x, y: gy - 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 260, drag: 2, life: range(0.2, 0.6), ramp: V, gy }); }
          for (let j = 0; j < 3; j++) add({ k: "smoke", x: x + range(-6, 6), y: gy - 4, vx: range(-6, 6), vy: range(-14, -6), life: range(1.2, 2), size: range(2, 3.5), front: false });
        }
        const f = Math.floor(t * 30);
        if (hit && t < LEAD + 0.4 && f !== at) { at = f; crawls = Array.from({ length: 2 }, () => { const sd = rand() < 0.5 ? -1 : 1; return bolt(x + sd * 2, gy - 1, x + sd * range(6, 16), gy - range(0, 2), 0.35); }); }
        if (t > LEAD + 0.4) crawls = [];
      },
      draw(L) {
        const a = t - LEAD;
        if (hit) {
          const T0 = Math.pow(clamp(1 - a / 1.6), 1.3), rx = 13, ry = 3;
          for (let py = Math.floor(gy - ry); py <= gy + ry; py++) for (let px2 = Math.floor(x - rx); px2 <= Math.ceil(x + rx); px2++) {
            const ddx = (px2 + 0.5 - x) / rx, ddy = (py + 0.5 - gy) / ry, d = Math.sqrt(ddx * ddx + ddy * ddy);
            if (d > 1) continue;
            const T = T0 * (1.25 - d) - (((px2 * 31 + py * 7) % 100) / 100) * 0.35;
            if (T > 0.06) L.b.set(px2, py, HEAT[Math.min(9, Math.floor((1 - Math.min(1, T)) * 9))]);
            else L.b.dot(px2, py, d < 0.5 ? SMOKE[4] : SMOKE[3], T0 > 0 ? Math.min(1, (1 - d) * 2) * clamp(1 - (a - 0.6) / 1) : 0);
          }
        }
        if (t < LEAD) {
          const reach = top + (gy - top) * Math.floor((t / LEAD) * 9) / 9;
          for (let i = 0; i < b.main.length - 1; i++) { if (b.main[i + 1][1] > reach) break; L.f.line(b.main[i][0], b.main[i][1], b.main[i + 1][0], b.main[i + 1][1], V[3]); }
          return;
        }
        const k = a < 0.03 ? 1 : a < 0.06 ? 0.5 : a < 0.1 ? 0.95 : a < 0.14 ? 0.4 : a < 0.17 ? 0.7 : 0;
        if (k > 0) {
          for (const [paths, trunk] of [[[b.main], true], [b.forks, false]]) for (const p of paths) for (let i = 0; i < p.length - 1; i++) {
            const [ax, ay] = p[i], [bx2, by2] = p[i + 1];
            if (trunk) { L.f.line(ax - 1, ay, bx2 - 1, by2, V[5]); L.f.line(ax + 1, ay, bx2 + 1, by2, V[5]); L.f.line(ax, ay, bx2, by2, V[2]); }
            L.f.line(ax, ay, bx2, by2, trunk ? V[0] : V[2], trunk || k > 0.5 ? 1 : 0);
            if (i % 3 === 0) L.l.glow(ax, ay, trunk ? 12 : 6, V[3], 0.45 * k);
          }
          L.f.disc(x, gy - 1, 3 * k + 1, V[2]); L.f.disc(x, gy - 1, 2 * k, V[0]);
          L.l.glow(x, gy - 8, 60, V[4], 0.5 * k);
        } else if (a < 0.45) for (const [px2, py] of b.main) L.f.dot(px2, py, V[5], (1 - (a - 0.17) / 0.28) * 0.8);
        for (const p of crawls) for (let i = 0; i < p.length - 1; i++) L.f.line(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], V[1]);
      } });
  }

  /* AN ULTI'S PILLAR (render.js, every ULTI strike): a column of its type
     rising off the floor in a quarter of its life, banded across its width
     - fire a heat column licking up, water a geyser, the rest their ramp -
     holding, then dithering out from the top; its matter thrown up with it. */
  function pillar(type, wx, wy, wr, life) {
    const T = RAMP[type] ?? RAMP.normal, R = type === "fire" ? HEAT : T, [x] = toPx(wx, wy), gy = toPx(0, wy + 0.3)[1];
    const hw = Math.max(0.9, wr) * 0.9 * BODY_PX * 0.75, H2 = 80;
    for (let i = 0; i < 18; i++) {
      const hx = x + range(-hw, hw);
      if (type === "fire") add({ k: "ember", x: hx, y: gy - range(0, 20), vx: range(-15, 15), vy: -range(40, 90), life: range(0.6, 1.2) });
      else if (type === "water") add({ k: "drop", x: hx, y: gy - range(10, 60), vx: range(-50, 50), vy: -range(20, 80), g: 300, life: range(0.6, 1), ramp: T, gy: gy + 2 });
      else if (type === "rock" || type === "ground") add({ k: "chunk", x: hx, y: gy - 2, vx: range(-60, 60), vy: -range(60, 140), g: 360, life: range(0.6, 1), ramp: T, gy });
      else if (type === "ice") add({ k: "shard", x: hx, y: gy - range(0, 30), vx: range(-40, 40), vy: -range(30, 90), g: 260, life: range(0.5, 0.9), size: range(1, 2), a: range(0, TAU), va: range(-12, 12), ramp: T, gy });
      else if (type === "grass" || type === "bug") add({ k: "leaf", x: hx, y: gy - range(0, 40), vx: range(-30, 30), vy: -range(20, 60), g: 40, drag: 1.5, life: range(0.8, 1.3), a: range(0, TAU), va: range(-8, 8), ramp: T });
      else add({ k: "mote", x: hx, y: gy - range(0, 50), vx: range(-15, 15), vy: -range(30, 80), drag: 1.5, life: range(0.6, 1.1), ramp: T });
    }
    let t = 0;
    fxs.push({ life, get t() { return t; }, update(dt) { t += dt; },
      draw(L) {
        const u = t / life, up = Math.min(1, u * 4), fade = u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1, h = H2 * up;
        for (let yy = 0; yy < h; yy++) {
          const q = yy / H2, w = hw * (type === "fire" ? 1.1 - q * 0.6 : type === "water" ? 0.75 - q * 0.2 : 0.8) * (0.85 + 0.25 * noise(yy * 0.3 - time * 18, 5));
          const sway = noise(yy * 0.08 + time * 2, 9) * 2 * q, cy = gy - yy, a = fade * (yy > h - 6 ? (h - yy) / 6 : 1) * (q > 0.75 ? (1 - q) * 4 : 1);
          for (let o = -w - 1; o <= w + 1; o += 1) {
            const b = Math.abs(o) / Math.max(0.5, w), px2 = x + o + sway;
            if (b > 1.15) continue;
            const c = b > 1 ? R[Math.min(R.length - 1, 5)] : R[Math.min(R.length - 1, Math.floor(b * 3 + q * 3 + (b > 0.8 ? 1 : 0)))];
            L.f.dot(px2, cy, c, b > 1 ? a * 0.5 : a);
          }
          if (yy % 8 === 0) L.l.glow(x, cy, hw * 2.2, type === "fire" ? HEAT[4] : T[3], 0.25 * fade);
        }
        if (type === "water") for (let i = 0; i < 6; i++) L.f.dot(x + noise(i * 3 + time * 8, 2) * hw, gy - h + noise(i * 5, 4) * 3, T[0], fade);
        L.b.ring(x, gy, hw * 1.4 * (1 + u), 1.5, R[2], fade * 0.8, 0.32, -1);
        L.f.ring(x, gy, hw * 1.4 * (1 + u), 1.5, R[2], fade * 0.8, 0.32, 1);
      } });
  }

  /* THE WEATHER, A PIXEL A DROP (render.js `drawAir`, its own list so a fight
     never evicts it): queued as it moves, drawn on the next paint. */
  const SAND = hex("#e0b878"), RAIN = hex("#cfe8ff"), SNOWC = hex("#ffffff");
  function air(kind, wx, wy, kk, size = 0.06, glint = false) {
    const [x, y] = toPx(wx, wy);
    queued.push((L) => {
      if (kind === "rain") {
        const fall = kk * 1.4 * BODY_PX, x1 = x - fall * 0.5, y1 = y + fall;
        L.f.line(x1, y1, x1 - 2, y1 + 5, RAIN, 0.45);
        if (kk > 0.92) { L.b.dot(x1 - 4, y1 + 9, RAIN, 0.6); L.b.dot(x1 - 2, y1 + 8, RAIN, 0.6); L.b.dot(x1, y1 + 9, RAIN, 0.6); }
      } else if (kind === "snow") {
        L.f.set(x, y, SNOWC);
        if (size > 0.08) { L.f.set(x + 1, y, RAMP.ice[1]); L.f.set(x, y + 1, RAMP.ice[2]); }
      } else if (kind === "sand") {
        const l = Math.max(2, size * BODY_PX);
        L.f.line(x, y, x - l, y - l * 0.08, SAND, 0.5);
      } else if (kind === "ember") {
        if (((frame >> 2) + Math.round(wx * 10)) % 3) { L.f.set(x, y, kk < 0.5 ? HEAT[2] : HEAT[4]); L.l.glow(x, y, 3, HEAT[3], 0.35 * Math.sin(kk * Math.PI)); }
      } else if (kind === "mote") {
        const a = Math.sin(Math.min(1, kk * 4) * Math.PI / 2) * (glint ? 0.5 + 0.5 * Math.sin(time * 6 + wx) : 0.4);
        if (glint && a > 0.85) sparkle(L.f, x, y, 1, RAMP.flying[1], RAMP.flying[3]);
        else L.f.dot(x, y, glint ? RAMP.flying[1] : SNOWC, a);
      }
    });
  }

  /* ---------- Phase 7: the named ULTIs, the anime way ---------- */
  /* Drafted in the Arena VFX Lab artifact from the anime's own descriptions.
     Each named ULTI (arena.js ULT_NAMES) has a CAST, played from the "ult"
     event round its user (its body as last drawn, `bodies`), and a LANDING,
     played where the rules land it: a strike, a cannon's beam, or (Barrage)
     its shots' look in `shot`. The rules' timing decides; this follows it. */
  const timed = (life, draw, update) => { let t = 0; fxs.push({ life, get t() { return t; }, update(dt) { t += dt; update?.(t, dt); }, draw(L) { draw(L, t); } }); };
  const centreOf = (body) => { const [x0, y0] = origin(body); return [x0 + body.w / 2, y0 + body.h / 2, x0, y0]; };
  // Flames off a body's own top-facing edges, between `y0f` and `y1f` of its height.
  function edgeFlames(L, body, R, lv, y0f = 0, y1f = 1, tall = 1) {
    if (!body || lv <= 0.02) return;
    const [x0, y0] = origin(body), on = maskAt(body);
    for (let x = 0; x < body.w; x++) for (let y = Math.floor(body.h * y0f); y < Math.min(body.h, Math.ceil(body.h * y1f)); y++) {
      if (!on(x, y) || on(x, y - 1) || (x + Math.floor(time * 12)) % 2) continue;
      const n = x * 7.3 + y * 3.1, h = (2 + 4 * (((x * 13 + y) * 37) % 10) / 10) * tall * (0.7 + 0.5 * noise(time * 3.3 + n, x)) * lv, sway = noise(time * 2.2 + n, x + 40) * 1.2;
      for (let yy = 0; yy < h; yy++) {
        const u = yy / h, hw = 1.1 * Math.pow(1 - u, 0.7) + 0.2, cx = x0 + x + sway * u * u;
        for (let xx = Math.floor(cx - hw); xx <= Math.ceil(cx + hw); xx++) if (Math.abs(xx + 0.5 - cx) <= hw) L.f.set(xx, y0 + y + 1 - yy, R[Math.min(R.length - 1, 1 + Math.floor(u * (R.length - 2)))]);
      }
    }
    const [cx, cy] = centreOf(body);
    L.l.glow(cx, cy, body.w, R[3], 0.35 * lv);
  }
  // A ring drawn as an outline of dots: an orb's rim, a ring rising round a body.
  const oval = (buf, cx, cy, rx, ry, c, a = 1) => { const n = Math.ceil((rx + ry) * 4); for (let i = 0; i < n; i++) { const q = (i / n) * TAU; buf.dot(cx + Math.cos(q) * rx, cy + Math.sin(q) * ry, c, a); } };
  const orbAt = (L, x, y, r, R) => { if (r < 0.6) return; L.f.disc(x, y, r + 1, R[5]); L.f.disc(x, y, r, R[3]); L.f.disc(x - 0.4, y - 0.4, r * 0.6, R[1]); L.f.set(x - r * 0.35, y - r * 0.45, R[0]); L.l.glow(x, y, r * 3 + 4, R[3], 0.5); };
  // A 4-point shuriken drawn per pixel, so it spins without a rotated sprite.
  function shuriken(L, x, y, r, ang, C) {
    const c = Math.cos(-ang), s = Math.sin(-ang);
    for (let py = Math.floor(y - r - 1); py <= y + r + 1; py++) for (let px2 = Math.floor(x - r - 1); px2 <= x + r + 1; px2++) {
      const dx = px2 + 0.5 - x, dy = py + 0.5 - y, u = dx * c - dy * s, v = dx * s + dy * c, au = Math.abs(u), av = Math.abs(v), d = Math.hypot(u, v);
      const arm = (au < r && av < r * 0.26 * (1 - au / r) + 0.8) || (av < r && au < r * 0.26 * (1 - av / r) + 0.8);
      if ((!arm && d > r * 0.38) || d < r * 0.14) continue;
      L.f.set(px2, py, d > r * 0.8 ? C[4] : (u > 0) === (v > 0) ? C[1] : C[3]);
    }
    L.l.glow(x, y, r * 2, C[3], 0.5);
  }
  // A thorned root out of the floor (Frenzy Plant): `g` how far up, `curve` its lean.
  function root(L, x, gy, h, w, curve, g) {
    const H2 = h * g;
    for (let yy = 0; yy < H2; yy++) {
      const u = yy / Math.max(1, h), cx = x + curve * u * u * h * 0.5, hw = w * Math.pow(Math.max(0, 1 - u), 0.8) + 0.3;
      for (let xx = Math.floor(cx - hw); xx <= Math.ceil(cx + hw); xx++) {
        const rel = (xx + 0.5 - cx) / hw;
        if (Math.abs(rel) <= 1) L.f.set(xx, gy - yy, Math.abs(rel) > 0.8 ? BARK[4] : rel < -0.3 ? BARK[1] : rel < 0.35 ? BARK[2] : BARK[3]);
      }
      if (yy % 4 === 2 && u < 0.85) { const sd = (yy / 4) % 2 ? 1 : -1; L.f.set(cx + sd * (hw + 1), gy - yy, BARK[1]); L.f.set(cx + sd * (hw + 2), gy - yy - 1, BARK[0]); }
    }
    L.f.set(x + curve * h * 0.5 * g * g, gy - H2, RAMP.grass[2]);
  }
  // A dragon's (or a biter's) jaws, open then snapping shut over `t` of 0.3 s, in a ramp.
  function jawsAt(L, x, y, t, R, s = 1) {
    const open = t < 0.12 ? 1 : 1 - clamp((t - 0.12) / 0.06), fade = t < 0.22 ? 1 : 1 - (t - 0.22) / 0.08;
    for (let i = -8; i <= 8; i++) {
      const u = Math.abs(i) / 8, top = y - (2 + open * 9 * (1 - u * u)) * s, bot = y + (2 + open * 8 * (1 - u * u)) * s;
      L.f.dot(x + i * s, top, R[1], fade); L.f.dot(x + i * s, top - 1, R[4], fade); L.f.dot(x + i * s, bot, R[1], fade); L.f.dot(x + i * s, bot + 1, R[4], fade);
      if (i % 3 === 0) { L.f.dot(x + i * s, top + 1, R[0], fade); L.f.dot(x + i * s, top + 2, R[0], fade); L.f.dot(x + i * s, bot - 1, R[0], fade); L.f.dot(x + i * s, bot - 2, R[0], fade); }
    }
    L.l.glow(x, y, 16 * s, R[3], 0.5 * fade);
  }
  /* A BITE (Crunch, the Fangs, 2026-10-30: the drawn sheets lost their teeth on the bodies' grid):
     jaws in the move's type snapping shut where the blow lands, sparks on the close. */
  function jaws(type, wx, wy) {
    const R = type === "dark" ? DARKP : RAMP[type] ?? RAMP.normal, [x, y] = toPx(wx, wy - 0.25);
    timed(0.3, (L, t) => jawsAt(L, x, y, t, R), (t, dt) => { if (t > 0.17 && t - dt <= 0.17) for (let i = 0; i < 10; i++) { const a = range(0, TAU), sp = range(50, 130); add({ k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.15, 0.3), ramp: R }); } });
  }
  /* DIZZY STARS, THE CONFUSION SWIRL, A CLOUD (2026-10-30: their drawn sheets retired): queued each frame like a status. */
  function dizzy(wx, wy, a) {
    const [x, y] = toPx(wx, wy);
    queued.push((L) => { for (let i = 0; i < 3; i++) { const q = time * 6 + (i * TAU) / 3; sparkle(L.f, x + Math.cos(q) * 9, y + Math.sin(q) * 3, a > 0.5 ? 2 : 1, RAMP.electric[1], RAMP.electric[3]); } });
  }
  function swirl(wx, wy) {
    const [x, y] = toPx(wx, wy), C = RAMP.psychic;
    queued.push((L) => { for (let i = 0; i < 18; i++) { const q = time * 5 + i * 0.6, r = 2 + i * 0.45; L.f.dot(x + Math.cos(q) * r, y + Math.sin(q) * r * 0.45, i < 6 ? C[1] : C[3], 1 - i / 22); } });
  }
  // Over the bodies, not behind: a cloud hides whoever stands in it (arena.js steam and Smokescreen).
  const STEAM = ["#f4f8fc", "#dfe7f0", "#c4cfdc"].map(hex);
  function cloud(wx, wy, a, smoke = true) {
    const [x, y] = toPx(wx, wy), R = 2 * BODY_PX * 0.6, C = smoke ? SMOKE : STEAM;
    queued.push((L) => { for (let i = 0; i < 7; i++) { const q = (i / 7) * TAU + time * 0.4; L.f.disc(x + Math.cos(q) * R * 0.5, y + Math.sin(q) * R * 0.25, R * (0.45 + 0.1 * Math.sin(time * 2 + i)), C[i % 2 ? 1 : 2], (smoke ? 0.85 : 0.7) * a); } });
  }

  const ULT = {
    Thunder: {
      // Its cheeks crackle and a bolt goes UP into the sky; the strikes then come down (render.js `strike`).
      cast(c) { let up = null, at = -1; timed(0.55, (L) => { const b = bodies[c.side]; if (!b || !up) return; for (let i = 0; i < up.length - 1; i++) { L.f.line(up[i][0], up[i][1], up[i + 1][0], up[i + 1][1], RAMP.electric[0]); L.f.line(up[i][0] + 1, up[i][1], up[i + 1][0] + 1, up[i + 1][1], RAMP.electric[3]); } const [cx, cy] = centreOf(b); L.l.glow(cx, cy, 20, RAMP.electric[2], 0.6); },
        (t) => { const b = bodies[c.side], f = Math.floor(t * 15); if (b && f !== at) { at = f; const [cx, , , y0] = centreOf(b); up = bolt(cx, y0, cx + range(-10, 10), Math.max(0, y0 - 110), 0.28); if (rand() < 0.8) add({ k: "spark", x: cx + range(-4, 4), y: y0 + 4, vx: range(-60, 60), vy: range(-60, 20), drag: 4, life: 0.15, ramp: RAMP.electric }); } }); },
      land() {},
    },
    "Frenzy Plant": {
      cast(c) { timed(0.8, (L, t) => { const b = bodies[c.side]; auraOn(L, b, RAMP.grass, smooth(0, 0.3, t) * (1 - smooth(0.6, 0.8, t)), Math.exp(-(((t - 0.4) / 0.06) ** 2))); if (b && t > 0.4) { const [cx] = centreOf(b), gy = origin(b)[1] + b.h; const u = (t - 0.4) / 0.4; L.b.ring(cx, gy, 6 + 22 * u, 1.5, BARK[1], 1 - u, 0.3); } }); },
      // A giant thorned root out of the ground where each strike lands.
      land(c) { const [x, gy] = toPx(c.x, c.y + 0.42), h = c.follow ? 30 : 20, curve = range(-0.6, 0.6); for (let i = 0; i < 6; i++) add({ k: "shard", x, y: gy - 1, vx: range(-40, 40), vy: -range(40, 100), g: 360, life: range(0.4, 0.7), size: 1, a: range(0, TAU), va: range(-10, 10), ramp: RAMP.ground, gy });
        timed(1.3, (L, t) => root(L, x, gy, h, c.follow ? 5 : 3.5, curve, Math.min(1, outBack(t / 0.12, 2)) * (1 - smooth(0.9, 1.3, t)))); },
    },
    "Blast Burn": {
      // Wrapped in blue flame through the warning, then a punch into the ground.
      cast(c) { timed(0.8, (L, t) => edgeFlames(L, bodies[c.side], BLUEFIRE, smooth(0, 0.25, t) * (1 - smooth(0.65, 0.8, t)))); },
      // The energy runs out under the floor in fissures and erupts in columns of fire.
      land(c) {
        const [x, gy] = toPx(c.x, c.y + 0.42), reach = (c.r || 4) * BODY_PX, n = 6, a0 = range(0, TAU);
        const ends = Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * TAU; return [x + Math.cos(a) * reach, gy + Math.sin(a) * reach * 0.32]; });
        timed(1.6, (L, t) => {
          const run = smooth(0, 0.25, t), heat = clamp(1 - (t - 0.3) / 1.2);
          for (const [ex, ey] of ends) for (let d = 0; d <= run; d += 0.02) { const px2 = x + (ex - x) * d, py = gy + (ey - gy) * d + noise(d * 20, Math.round(ex)) * 1.2; L.b.set(px2, py, heat > 0.05 ? HEAT[Math.min(9, 1 + Math.floor((1 - heat) * 7 + d * 2))] : SMOKE[4]); }
          if (t > 0.22) for (const [ex, ey] of [...ends, [x, gy]]) { const u = (t - 0.22) / 1.1; if (u >= 1) continue; const H2 = (ex === x ? 50 : 26) * Math.min(1, u * 5) * (u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1);
            for (let yy = 0; yy < H2; yy++) { const q = yy / 50, w = (ex === x ? 7 : 4) * (1 - q * 0.5) * (0.85 + 0.3 * noise(yy * 0.3 - time * 18, 5)); for (let o = -w; o <= w; o++) L.f.set(ex + o, ey - yy, HEAT[Math.min(9, Math.floor((Math.abs(o) / w) * 4 + q * 4))]); }
            L.l.glow(ex, ey - H2 / 2, 18, HEAT[4], 0.4); }
        }, (t, dt) => { if (t > 0.22 && t - dt <= 0.22) for (let i = 0; i < 24; i++) { const [ex, ey] = ends[i % n]; add({ k: "flame", x: ex, y: ey - range(0, 10), vx: range(-20, 20), vy: -range(40, 110), drag: 1.5, life: range(0.4, 0.7), size: range(1, 1.8) }); } });
      },
    },
    "Stone Edge": {
      // Light blue rings rise round it and turn into white stones orbiting it.
      cast(c) { timed(0.8, (L, t) => { const b = bodies[c.side]; if (!b) return; const [cx, cy] = centreOf(b);
        if (t < 0.5) for (let i = 0; i < 3; i++) { const k = smooth(i * 0.08, i * 0.08 + 0.15, t) * (1 - smooth(0.35, 0.5, t)); if (k > 0) oval(L.f, cx, cy + 8 - i * 9 - t * 6, 16, 4.5, RAMP.ice[2], k); }
        if (t > 0.35) for (let i = 0; i < 8; i++) { const q = (i / 8) * TAU + t * 5, g = smooth(0.35, 0.5, t); orbAt(L, cx + Math.cos(q) * 18, cy + Math.sin(q) * 6 - 4, 2.4 * g, ROCKW); } }); },
      // Fired outward, they burst up as pointed stone pillars round it.
      land(c) { const [x, gy] = toPx(c.x, c.y + 0.42), reach = (c.r || 4) * BODY_PX, a0 = range(0, TAU);
        const spires = Array.from({ length: 8 }, (_, i) => { const a = a0 + (i / 8) * TAU; return { x: x + Math.cos(a) * reach * range(0.55, 1), y: gy + Math.sin(a) * reach * 0.32, h: range(10, 18) }; });
        timed(1.2, (L, t) => { for (const s of spires) { const g = Math.min(1, outBack(clamp((t - 0.05) / 0.1), 2.2)) * (1 - smooth(0.85, 1.2, t)), h = s.h * g;
          for (let yy = 0; yy < h; yy++) { const half = 3 * (1 - yy / Math.max(1, s.h)); for (let xx = Math.floor(s.x - half); xx <= s.x + half; xx++) { const rel = xx + 0.5 - s.x; L.f.set(xx, s.y - yy, Math.abs(rel) > half - 0.6 ? ROCKW[5] : rel < 0 ? ROCKW[1] : ROCKW[3]); } } } },
        (t, dt) => { if (t > 0.9 && t - dt <= 0.9) for (const s of spires) for (let i = 0; i < 3; i++) add({ k: "shard", x: s.x, y: s.y - range(2, 10), vx: range(-40, 40), vy: -range(30, 80), g: 300, life: range(0.4, 0.7), size: 1.5, a: range(0, TAU), va: range(-10, 10), ramp: ROCKW, gy: s.y }); }); },
    },
    "Hydro Cannon": {
      // An orb of water swells in each shell cannon through the warning.
      cast(c) { timed(0.8, (L, t) => { const b = bodies[c.side]; if (!b) return; const [cx, , , y0] = centreOf(b), r = 4.5 * smooth(0, 0.6, t) * (1 - smooth(0.75, 0.8, t)); for (const ox of [-3, 4]) { const x = cx + ox, y = y0 + 3; L.f.disc(x, y, r + 0.8, RAMP.water[3], 0.6); L.f.ring(x, y, r, 1, RAMP.water[2]); L.f.set(x - r * 0.4, y - r * 0.5, RAMP.water[0]); L.l.glow(x, y, 10, RAMP.water[3], 0.5); } }); },
      // Both fired down the cannon's line, a jet behind them, a crown where they land.
      land(c) { const [x, y] = toPx(c.x, c.y - 0.3), len = c.len * BODY_PX, ex = x + c.dx * len, ey = y + c.dy * len;
        timed(0.7, (L, t) => { const fade = t < 0.25 ? 1 : 1 - (t - 0.25) / 0.45; band(L, `hc${x}`, "water", x, y, c.dx, c.dy, len, 9, fade);
          for (const lag of [0, 0.07]) { const u = clamp((t - lag) / 0.2); if (u > 0 && u < 1) { const px2 = x + c.dx * len * u, py = y + c.dy * len * u; L.f.disc(px2, py, 7, RAMP.water[4]); L.f.disc(px2, py, 6, RAMP.water[2]); L.f.ring(px2, py, 6, 1, RAMP.water[1]); L.f.disc(px2 - 2, py - 2, 1.6, RAMP.water[0]); } }
          if (t > 0.2) for (let i = 0; i < 11; i++) { const a = -Math.PI / 2 + (i - 5) * 0.27, r = (10 + 6 * noise(time * 9 + i, 3)) * fade; L.f.line(ex, ey, ex + Math.cos(a) * r * 0.7, ey + Math.sin(a) * r, i % 3 ? RAMP.water[1] : RAMP.water[0]); } },
          (t, dt) => { if (t > 0.2 && t - dt <= 0.2) for (let i = 0; i < 26; i++) { const a = -Math.PI / 2 + range(-1.5, 1.5), sp = range(50, 150); add({ k: "drop", x: ex, y: ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 320, life: range(0.5, 0.9), ramp: RAMP.water, gy: ey + 12 }); } }); },
    },
    Psystrike: {
      // Its eyes alight and a bubble of psychic force swelling round it.
      cast(c) { timed(0.8, (L, t) => { const b = bodies[c.side]; if (!b) return; const [cx, cy, , y0] = centreOf(b), r = 6 + 22 * smooth(0, 0.75, t);
        L.f.set(cx + 3, y0 + 4, PSYB[0]); L.f.set(cx, y0 + 4, PSYB[0]); L.l.glow(cx + 1, y0 + 4, 8, PSYB[2], 0.8);
        L.f.ring(cx, cy, r, 2, PSYB[1], 0.85); L.b.ring(cx, cy, r * 0.8, 1, PSYB[4], 0.5); L.l.glow(cx, cy, r * 1.4, PSYB[3], 0.3); }); },
      // The wave: rings racing down the line, a psychic band, the foe's end lit.
      land(c) { const [x, y] = toPx(c.x, c.y - 0.3), len = c.len * BODY_PX;
        timed(0.8, (L, t) => { const fade = t < 0.2 ? 1 : 1 - (t - 0.2) / 0.6; band(L, `ps${x}`, "normal", x, y, c.dx, c.dy, len, 5, fade * 0.8, PSYB);
          for (let k = 0; k < 4; k++) { const d = ((t * 240 + k * 26) % len); oval(L.f, x + c.dx * d, y + c.dy * d, 3 + d / len * 6, 8 + d / len * 10, PSYB[k % 2 ? 1 : 3], fade); } }); },
    },
    "Hyper Beam": {
      cast(c) { timed(0.8, (L, t) => { const b = bodies[c.side]; if (!b) return; const [cx, , , y0] = centreOf(b), r = 1 + 5 * smooth(0, 0.7, t); orbAt(L, cx + 6 * Math.sign(c.dx || 1), y0 + 5, r, HBEAM); },
        (t) => { const b = bodies[c.side]; if (b && rand() < 0.8) { const [cx, , , y0] = centreOf(b), a = range(0, TAU), d = range(12, 20); add({ k: "mote", x: cx + Math.cos(a) * d, y: y0 + 5 + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, life: 0.3, ramp: HBEAM }); } }); },
      // The huge orange beam with rings spiralling down it - and its user, briefly spent.
      land(c) { const [x, y] = toPx(c.x, c.y - 0.3), len = c.len * BODY_PX;
        timed(0.9, (L, t) => { const fade = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.45; band(L, `hb${x}`, "normal", x, y, c.dx, c.dy, len, 9, fade, HBEAM);
          for (let d = (t * 160) % 16; d < len; d += 16) oval(L.f, x + c.dx * d, y + c.dy * d, 2, 7 * fade + 3, HBEAM[1], fade);
          const b = bodies[c.side]; if (b && t > 0.5) { const [x0, y0] = origin(b), on = maskAt(b); for (let j = 0; j < b.h; j += 2) for (let i = (j / 2) % 2; i < b.w; i += 2) if (on(i, j)) L.f.dot(x0 + i, y0 + j, SMOKE[2], 0.45 * (1 - smooth(0.7, 0.9, t))); } }); },
    },
    Outrage: {
      // Wrapped in red rage for the rampage; each blow lands in it.
      cast(c) { timed(1.5, (L, t) => edgeFlames(L, bodies[c.side], REDAURA, smooth(0, 0.2, t) * (1 - smooth(1.2, 1.5, t)), 0, 1, 1.4)); },
      land(c) { const [x, y] = toPx(c.x, c.y - 0.2); fxs.push(blowFx(x, y, REDAURA, true)); for (let i = 0; i < 6; i++) add({ k: "flame", x, y, vx: range(-50, 50), vy: -range(30, 80), drag: 2, life: range(0.3, 0.5), size: 1.2 }); },
    },
    "Giga Impact": {
      // An orb round it, its colour walking from orange to purple, orange streaks spiralling round it.
      cast(c) { timed(1.4, (L, t) => { const b = bodies[c.side]; if (!b) return; const [cx, cy] = centreOf(b), on = smooth(0, 0.2, t) * (1 - smooth(1.1, 1.4, t)), r = 16 * on, q = smooth(0.2, 1.1, t), C = q < 0.5 ? HBEAM : DARKP;
        if (r < 1) return;
        for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r; if (d <= 1) L.b.dot(x, y, d > 0.88 ? C[2] : C[Math.min(6, 3 + Math.floor(d * 2))], d > 0.88 ? 1 : 0.35); }
        for (let arm = 0; arm < 4; arm++) for (let s2 = 0; s2 < 14; s2++) { const a = time * 9 + (arm * TAU) / 4 + s2 * 0.18, rr = r * (0.3 + s2 / 20); L.f.dot(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9, HBEAM[s2 < 4 ? 1 : 3], 1 - s2 / 16); }
        L.l.glow(cx, cy, r * 2, C[3], 0.5 * on); }); },
      land(c) { const [x, y] = toPx(c.x, c.y - 0.2), gy = toPx(0, c.y + 0.42)[1]; fxs.push(blowFx(x, y, DARKP, true)); fxs.push(floorRing(x, gy, HBEAM, 0.6, 30)); for (let i = 0; i < 8; i++) add({ k: "dust", x: x + range(-8, 8), y: gy - 1, vx: range(-80, 80), vy: -range(5, 25), drag: 4, life: range(0.5, 0.8), size: range(1.8, 3), front: false }); },
    },
    "Dragon Ascent": {
      // Streaks of green rising off it as it soars.
      cast(c) { timed(0.5, () => {}, () => { const b = bodies[c.side]; if (b && rand() < 0.9) { const [x0, y0] = origin(b); add({ k: "line", x: x0 + range(0, b.w), y: y0 + range(0, b.h), ux: 0, uy: 1, size: range(8, 18), life: 0.25, ramp: SKYG, front: false }); } }); },
      // Each blow drops out of the sky: a green-white meteor's trail onto the spot, a crater ring, rubble.
      land(c) { const [x, y] = toPx(c.x, c.y - 0.2), gy = toPx(0, c.y + 0.42)[1];
        timed(0.35, (L, t) => { const k = 1 - t / 0.35; for (let i = 0; i < 16; i++) { const yy = y - i * 6; if (yy < 0) break; L.f.disc(x + i * 1.5, yy, Math.max(0.8, 6 * (1 - i / 16)) * k, SKYG[Math.min(6, 1 + Math.floor(i / 3))], k * (1 - i / 18)); } L.f.disc(x, y, 6 * k, SKYG[1]); L.l.glow(x, y, 26, SKYG[3], 0.8 * k); });
        fxs.push(blowFx(x, y, SKYG, true)); fxs.push(floorRing(x, gy, RAMP.rock, 0.7, 24));
        for (let i = 0; i < 10; i++) add({ k: "shard", x, y: gy - 2, vx: range(-80, 80), vy: -range(60, 140), g: 380, life: range(0.5, 0.8), size: range(1, 2), a: range(0, TAU), va: range(-10, 10), ramp: RAMP.rock, gy }); },
    },
    "Dragon Rush": {
      cast(c) { timed(1.4, (L, t) => auraOn(L, bodies[c.side], MENACE, smooth(0, 0.25, t) * (1 - smooth(1.1, 1.4, t)), 0, 0.6)); },
      // A dragon's jaws snapping shut on each blow.
      land(c) { const [x, y] = toPx(c.x, c.y - 0.25); timed(0.3, (L, t) => jawsAt(L, x, y, t, MENACE, 1.3)); fxs.push(blowFx(x, y, MENACE, true)); },
    },
    "Blaze Kick": {
      // Its leg alight: flames off the lower half of its outline only.
      cast(c) { timed(1.4, (L, t) => edgeFlames(L, bodies[c.side], HEAT.slice(0, 7), smooth(0, 0.2, t) * (1 - smooth(1.1, 1.4, t)), 0.55, 1, 1.1)); },
      // Each kick a crescent of flame swept up through the spot.
      land(c) { const [x, y] = toPx(c.x, c.y - 0.2), flip = rand() < 0.5 ? 1 : -1;
        timed(0.3, (L, t) => { const head = Math.min(1, t / 0.06), tail = smooth(0.08, 0.3, t), a0 = 2.4, a1 = -0.6;
          for (let s2 = tail; s2 <= head; s2 += 0.01) { const a = a0 + (a1 - a0) * s2, w = 4 * Math.sin(Math.PI * clamp((s2 - tail) / Math.max(0.01, head - tail))); for (let d = 0; d <= w; d += 0.5) { const r = 16 - d; L.f.set(x + flip * Math.cos(a) * r, y + Math.sin(a) * r * 0.8, HEAT[Math.min(9, Math.floor((d / Math.max(0.5, w)) * 4 + t * 10))]); } }
          L.l.glow(x, y, 22, HEAT[3], 0.6 * (1 - t / 0.3)); });
        fxs.push(blowFx(x, y, HEAT.slice(0, 7), true)); for (let i = 0; i < 8; i++) add({ k: "flame", x, y, vx: range(20, 80) * flip, vy: range(-70, 10), drag: 2, life: range(0.3, 0.5), size: 1.3 }); },
    },
    Moonblast: {
      // The moon comes up over it, its light pouring down into an orb of pink and blue at its hands.
      cast(c) { timed(1.05, (L, t) => { const b = bodies[c.side]; if (!b) return; const [cx, , , y0] = centreOf(b), mx = cx - 22, my = Math.max(8, y0 - 46), mk = smooth(0, 0.25, t) * (1 - smooth(0.9, 1.05, t));
        for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) { const d = Math.hypot(x, y); if (d <= 7) L.b.dot(mx + x, my + y, d > 6.2 || Math.hypot(x - 2, y + 2) < 1.6 || Math.hypot(x + 3, y - 1) < 1.2 ? MOONC[2] : MOONC[x + y < 0 ? 0 : 1], mk); }
        L.l.glow(mx, my, 26, MOONP[2], 0.5 * mk);
        const hx = cx + 7 * Math.sign(c.dx || 1), hy = y0 + 8;
        if (t > 0.25 && t < 0.85) for (let i = 0; i < 3; i++) L.f.line(mx + (i - 1) * 3, my + 6, hx + (i - 1), hy, MOONP[i === 1 ? 1 : 2], 0.5 * mk);
        const r = 1 + 5 * smooth(0.25, 0.8, t) * (1 - smooth(0.95, 1.05, t)); if (r > 1) { L.f.disc(hx, hy, r + 1, MOONP[5]); L.f.disc(hx, hy, r, MOONP[3]); L.f.disc(hx - 0.5, hy - 0.5, r * 0.6, MOONP[1]); L.l.glow(hx, hy, r * 3 + 4, MOONP[3], 0.6); } }); },
      // The orb arrives as a streak and bursts pink, four glints flying out of it.
      land(c) { const [x, y] = toPx(c.x, c.y - 0.2); fxs.push(blowFx(x, y, MOONP, true));
        timed(0.4, (L, t) => { for (let i = 0; i < 4; i++) sparkle(L.f, x + Math.cos(i * 1.57 + 0.6) * 40 * t, y + Math.sin(i * 1.57 + 0.6) * 40 * t, 3 * (1 - t / 0.4), MOONP[1], MOONP[3]); });
        for (let i = 0; i < 10; i++) add({ k: "star", x: x + range(-10, 10), y: y + range(-10, 10), vx: range(-30, 30), vy: range(-40, 0), drag: 2, life: range(0.5, 0.9), size: 2, ramp: MOONP }); },
    },
    // Barrage ULTIs: their cast round the user; their landing is their shots' look (`shot`).
    "Aura Sphere": { cast(c) { timed(0.8, (L, t) => auraOn(L, bodies[c.side], AURAB, smooth(0, 0.2, t) * (1 - smooth(0.5, 0.8, t)))); }, land() {} },
    "Shadow Storm": { cast(c) { timed(0.5, () => {}, () => { const b = bodies[c.side]; if (b && rand() < 0.8) { const [cx, cy] = centreOf(b), a = range(0, TAU), d = range(12, 20); add({ k: "mote", x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, life: 0.3, ramp: DARKP }); } }); }, land() {} },
    "Water Shuriken": { cast(c) { timed(0.7, (L, t) => { const b = bodies[c.side]; if (!b) return; const [cx, , , y0] = centreOf(b), k = smooth(0, 0.15, t) * (1 - smooth(0.5, 0.7, t)), gy = y0 + b.h; for (let i = 0; i < 3; i++) oval(L.f, cx, gy - 4 - i * 8 - t * 12, 14 - i * 2, 4, RAMP.water[2], k); }); }, land() {} },
  };
  /* ---------- the signature moves (2026-10-30, the lab's batch 1) ---------- */
  // A leaf drawn per pixel at any angle, so it spins without rotated art: blade, midrib, dark edge.
  function leafAt(L, x, y, ang, len, C) {
    const c = Math.cos(ang), s2 = Math.sin(ang);
    for (let d = -len; d <= len; d += 0.5) {
      const w = 1.7 * Math.sqrt(Math.max(0, 1 - (d / len) ** 2));
      for (let o = -w; o <= w; o += 0.5) L.f.set(x + c * d - s2 * o, y + s2 * d + c * o, Math.abs(o) < 0.5 ? C[1] : Math.abs(o) > w - 0.6 ? C[5] : o < 0 ? C[2] : C[3]);
    }
  }
  const bez = (p0, p1, p2, u) => [(1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]];
  const boltLine = (L, pts, c, a = 1) => { for (let i = 0; i < pts.length - 1; i++) L.f.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, a); };
  // The body's outline lit in a colour (a Thunderbolt's foe, a Psychic's held one).
  function outline(L, b, c, a = 1) {
    if (!b) return;
    const [x0, y0] = origin(b), on = maskAt(b);
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (on(i, j) && (!on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1) || !on(i, j + 1))) L.f.dot(x0 + i, y0 + j, c, a);
  }
  // Where a side's body stands now, in pixels, or its world point when no body was drawn.
  const at = (side, wx, wy) => { const b = bodies[side]; return b ? centreOf(b) : [...toPx(wx, wy - 0.4), ...toPx(wx, wy - 0.8)]; };
  /* `c`: `side` the user (the struck one for "hit"), `x, y` where it stands or the blow lands, `dx, dy` its
     line, `r` a pulse's reach, `len` a beam's. A missing hook leaves that moment to the generic look. */
  const SIG = {
    // A wall of water rolls out to the pulse's reach, banded by height with foam on its crest, and breaks.
    surf: { pulse({ x: wx, y: wy, r }) {
      const V = RAMP.water, [x, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX;
      for (let i = 0; i < 20; i++) { const a = range(0, TAU); add({ k: "drop", x: x + Math.cos(a) * R * 0.9, y: gy + Math.sin(a) * R * 0.4 - 8, vx: Math.cos(a) * range(20, 60), vy: -range(40, 90), g: 320, life: range(0.5, 0.8), ramp: V, gy: gy + Math.sin(a) * R * 0.4, delay: range(0.15, 0.4) }); }
      timed(0.85, (L, t) => {
        const u = smooth(0, 0.55, t), rr = 4 + (R - 4) * u, H = 16 * (1 - 0.8 * smooth(0.5, 0.85, t)), fade = 1 - smooth(0.6, 0.85, t);
        const n = Math.ceil(rr * 5);
        for (let k = 0; k < n; k++) {
          const q = (k / n) * TAU, px2 = x + Math.cos(q) * rr, py = gy + Math.sin(q) * rr * 0.42, buf = Math.sin(q) < 0 ? L.b : L.f;
          const h = H * (0.8 + 0.3 * noise(q * 4 + t * 6, 2));
          for (let yy = 0; yy < h; yy++) { const f = yy / h; buf.dot(px2, py - yy, f > 0.85 ? V[0] : f > 0.6 ? V[1] : f > 0.3 ? V[2] : V[3], fade); }
        }
        if (t > 0.5) oval(L.b, x, gy, rr, rr * 0.42, V[1], 1 - smooth(0.5, 0.85, t));
        L.l.glow(x, gy - H / 2, rr, V[3], 0.3 * fade);
      });
    } },
    // Sharp leaves come out from the top of the user, spinning, curving in on where the blow lands.
    "razor-leaf": { fire({ side, x: wx, y: wy, dx, dy }) {
      const G = RAMP.grass, [, , bx, by] = at(side, wx, wy), b = bodies[side], src = [bx + (b ? b.w / 2 : 0), by + 2];
      const [tx, ty] = toPx(wx + dx * 1.5, wy - 0.3 + dy * 1.5);
      const leaves = Array.from({ length: 8 }, (_, i) => ({ t0: i * 0.035, bend: range(-14, 14), spin: range(18, 30) * (rand() < 0.5 ? -1 : 1), oy: range(-5, 5) }));
      timed(0.6, (L, t) => { for (const l of leaves) {
        const u = (t - l.t0) / 0.22;
        if (u <= 0) continue;
        if (u < 1) { const [lx, ly] = bez(src, [(src[0] + tx) / 2, Math.min(src[1], ty) - 8 + l.bend], [tx, ty + l.oy], u); leafAt(L, lx, ly, t * l.spin, 3.5, G); L.l.glow(lx, ly, 5, G[3], 0.25); }
        else if (u < 1.6) { const k = 1 - (u - 1) / 0.6; L.f.line(tx - 5, ty + l.oy - 2, tx + 4, ty + l.oy + 2, G[1], k); L.f.line(tx - 4, ty + l.oy + 2, tx + 4, ty + l.oy - 2, RAMP.normal[0], k); }
      } });
    } },
    // Its cheeks crackle as it fires; on the hit, forked bolts leap from it to the foe and light its outline.
    thunderbolt: {
      fire({ side, x: wx, y: wy }) { const [, , bx, by] = at(side, wx, wy), b = bodies[side]; fxs.push(crackleFx(bx + (b ? b.w / 2 : 0), by + (b ? b.h * 0.35 : 0), RAMP.electric, 0.25)); },
      hit({ side, x: wx, y: wy, ux, uy }) {
        const V = RAMP.electric, [tx, ty] = toPx(wx, wy - 0.3);
        let f = -1, bolts = [];
        timed(0.35, (L, t) => {
          const [sx2, sy2] = at(1 - side, ux, uy), k = 1 - smooth(0.2, 0.35, t);
          bolts.forEach((p, i) => { boltLine(L, p, i === 1 ? V[0] : V[2], k); for (let j = 0; j < p.length; j += 4) L.l.glow(p[j][0], p[j][1], 7, V[3], 0.4 * k); });
          outline(L, bodies[side], V[1], k * 0.9);
          L.l.glow(sx2, sy2, 12, V[2], 0.5 * k);
        }, (t) => { const n = Math.floor(t * 15); if (n !== f) { f = n; const [sx2, sy2] = at(1 - side, ux, uy); bolts = [0, 1, 2].map((i) => bolt(sx2, sy2 - 4, tx + range(-4, 4), ty + (i - 1) * 4, 0.22)); } });
      },
    },
    // Two dark green vines out of the user's sides, lashing to the blow's reach one after the other, a white snap at each tip.
    "vine-whip": { fire({ side, x: wx, y: wy, dx, dy }) {
      const [cx, cy] = at(side, wx, wy), [tx, ty] = toPx(wx + dx * 1.6, wy - 0.3 + dy * 1.6);
      const lashes = [{ t0: 0, side: -1, oy: -3 }, { t0: 0.12, side: 1, oy: 3 }];
      timed(0.5, (L, t) => { for (const l of lashes) {
        const u = t - l.t0, reach = u < 0 ? 0 : u < 0.12 ? 1 - Math.pow(2, -10 * u / 0.12) : 1 - smooth(0.18, 0.32, u);
        if (reach <= 0.01) continue;
        const p0 = [cx + l.side * 4, cy - 4], p2 = [tx, ty + l.oy], p1 = [(p0[0] + p2[0]) / 2, Math.min(p0[1], p2[1]) - 14 + Math.sin(t * 20 + l.side) * 2];
        let last = p0;
        for (let q = 0; q <= reach; q += 0.02) { const [vx, vy] = bez(p0, p1, p2, q); L.f.disc(vx, vy, 1.2, VINE[4]); L.f.set(vx, vy - 0.5, VINE[2]); L.f.set(vx, vy, VINE[3]); last = [vx, vy]; }
        leafAt(L, last[0], last[1], 0.4, 2.5, RAMP.grass);
        if (u > 0.1 && u < 0.18) { sparkle(L.f, last[0] + 1, last[1], 3, RAMP.normal[0], VINE[1]); L.l.glow(last[0], last[1], 9, VINE[1], 0.6); }
      } });
    } },
    // Its eyes glow and rings of force roll out; the foe it lands on glows in a blue outline while it is held.
    psychic: {
      fire({ side, x: wx, y: wy, dx, dy }) {
        const [cx, , , by] = at(side, wx, wy);
        timed(0.45, (L, t) => {
          const k = 1 - smooth(0.25, 0.45, t);
          L.f.set(cx - 2, by + 5, PSYL[0]); L.f.set(cx + 2, by + 5, PSYL[0]); L.l.glow(cx, by + 5, 7, PSYL[2], 0.8 * k);
          for (let i = 0; i < 3; i++) { const u = clamp(t * 2.6 - i * 0.25); if (u <= 0 || u >= 1) continue; const d = u * 3 * BODY_PX; oval(L.f, cx + dx * d, by + 8 + dy * d, 2 + u * 3, 5 + u * 6, PSYL[i % 2 ? 1 : 3], 1 - u); }
        });
      },
      hit({ side }) {
        timed(0.75, (L, t) => { const k = smooth(0, 0.08, t) * (1 - smooth(0.55, 0.75, t)); auraOn(L, bodies[side], PSYL, k, 0, 0.4); outline(L, bodies[side], PSYL[1], k); });
      },
    },
    // Sunlight pours down onto it and gathers as it fires.
    "solar-beam": {
      fire({ side, x: wx, y: wy }) {
        const [cx, cy] = at(side, wx, wy);
        for (let i = 0; i < 14; i++) { const sx2 = cx + range(-40, 20), sy2 = cy - range(50, 80); add({ k: "mote", x: sx2, y: sy2, vx: (cx - sx2) * 3.2, vy: (cy - sy2) * 3.2, life: 0.3, ramp: SUNR, delay: i * 0.012 }); }
        timed(0.4, (L, t) => { const k = 1 - smooth(0.2, 0.4, t); for (let i = 0; i < 4; i++) L.f.line(cx - 30 + i * 10, cy - 70, cx + (i - 1.5) * 2, cy, SUNR[2], 0.35 * k); auraOn(L, bodies[side], SUNR, k * 0.8, 0, 1); L.l.glow(cx, cy, 18, SUNR[3], 0.6 * k); });
      },
      // ...and a wide beam of white and gold light.
      beam({ x: wx, y: wy, dx, dy, len: wl, w }) {
        const [x, y] = toPx(wx, wy), len = wl * BODY_PX, hw = w * BODY_PX * 0.7, id = `b${beams++}`;
        for (let d = 0; d < len; d += 6) add({ k: "spark", x: x + dx * d, y: y + dy * d, vx: -dy * range(-60, 60), vy: dx * range(-60, 60), drag: 3, life: range(0.2, 0.4), ramp: SUNR });
        timed(0.6, (L, t) => { const u = t / 0.6; band(L, id, "solar", x, y, dx, dy, len, hw, u < 0.3 ? 1 : 1 - (u - 0.3) / 0.7, SUNR); L.l.glow(x + dx * len, y + dy * len, hw * 3, SUNR[3], 0.7 * (1 - u)); });
      },
    },
    // A fireball bursts into the character 大 on the foe, burns, and goes out in embers.
    "fire-blast": { hit({ x: wx, y: wy }) {
      const [x, y] = toPx(wx, wy - 0.35), strokes = [[0, -7, 0, -20], [-20, -7, 20, -7], [0, -7, -16, 16], [0, -4, 16, 16]];
      timed(1.1, (L, t) => {
        const grow = Math.min(1, outBack(t / 0.12, 2)), fade = 1 - smooth(0.7, 1.1, t);
        for (const [x0, y0, x1, y1] of strokes) {
          const full = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / full, uy = (y1 - y0) / full;
          for (let d = 0; d <= full * grow; d += 0.5) {
            const q = d / full, w = (3.6 - q * 1.2) * (0.85 + 0.3 * noise(d * 0.4 - time * 20, x1 + 50));
            for (let o = -w; o <= w; o += 0.5) L.f.dot(x + x0 + ux * d - uy * o, y + y0 + uy * d + ux * o, HEAT[Math.min(9, Math.floor((Math.abs(o) / w) * 4 + q * 3 + t * 3))], fade);
          }
        }
        L.l.glow(x, y - 2, 30, HEAT[4], 0.7 * fade);
      }, (t) => { if (t < 0.9 && rand() < 0.7) { const [x0, y0, x1, y1] = strokes[Math.floor(rand() * 4)], u = rand(); add({ k: "ember", x: x + x0 + (x1 - x0) * u, y: y + y0 + (y1 - y0) * u, vx: range(-15, 15), vy: -range(30, 70), life: range(0.6, 1.2) }); } });
    } },
    // It charges wrapped in a shell of golden electricity with a bolt trailing behind; the hit sparks back over it too.
    "wild-charge": {
      fire({ side, x: wx, y: wy }) {
        const [x0, y0] = at(side, wx, wy);
        let f = -1, arcs2 = [], trail = null;
        timed(0.45, (L, t) => {
          const [cx, cy] = at(side, wx, wy), k = 1 - smooth(0.3, 0.45, t);
          oval(L.f, cx, cy, 13, 11, GOLD[2], k); oval(L.b, cx, cy, 15, 13, GOLD[4], k * 0.6);
          for (const p of arcs2) boltLine(L, p, GOLD[1], k);
          if (trail) boltLine(L, trail, GOLD[2], k * 0.8);
          L.l.glow(cx, cy, 26, GOLD[3], 0.6 * k);
        }, (t) => { const n = Math.floor(t * 15); if (n !== f) { f = n; const [cx, cy] = at(side, wx, wy);
          arcs2 = [0, 1, 2].map(() => { const a = range(0, TAU), a2 = a + range(0.6, 1.4); return bolt(cx + Math.cos(a) * 13, cy + Math.sin(a) * 11, cx + Math.cos(a2) * 13, cy + Math.sin(a2) * 11, 0.4); });
          trail = Math.hypot(cx - x0, cy - y0) > 6 ? bolt(x0, y0 + 4, cx, cy, 0.25) : null; } });
      },
      hit({ side, x: wx, y: wy }) {
        timed(0.5, () => {}, () => { const b = bodies[1 - side]; if (!b || rand() > 0.6) return; const [x0, y0] = origin(b); add({ k: "spark", x: x0 + range(0, b.w), y: y0 + range(0, b.h), vx: range(-40, 40), vy: -range(20, 60), drag: 3, life: range(0.15, 0.3), ramp: GOLD }); });
        const [x, y] = toPx(wx, wy - 0.3);
        fxs.push(blowFx(x, y, GOLD, true));
      },
    },
  };
  /* ---------- batch 2 (2026-10-30): the moves the most Pokemon carry ---------- */
  // A crack along the floor from (x0, y0) to (x1, y1), jagged by its own distance so it holds still frame to frame.
  function crack(L, x0, y0, x1, y1, C, k = 1, seed = 0) {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / 3)), ux = (x1 - x0) / (len || 1), uy = (y1 - y0) / (len || 1);
    let px0 = x0, py0 = y0;
    for (let i = 1; i <= n; i++) {
      const d = (i / n) * len, o = i < n ? noise(d * 0.35, seed) * 2.2 : 0, qx = x0 + ux * d - uy * o, qy = y0 + uy * d + ux * o * 0.5;
      L.b.line(px0, py0, qx, qy, C[2], k); L.b.line(px0, py0 + 1, qx, qy + 1, C[4], k);
      if (i % 2 === 0) L.l.glow(qx, qy, 6, C[3], 0.4 * k);
      px0 = qx; py0 = qy;
    }
  }
  // A saw-disc of air (Air Slash): a ring with six teeth swept back along its spin, pale at the hub.
  function sawDisc(L, x, y, r, spin, C) {
    for (let py = Math.floor(y - r - 3); py <= y + r + 3; py++) for (let px2 = Math.floor(x - r - 3); px2 <= x + r + 3; px2++) {
      const dx = px2 + 0.5 - x, dy = py + 0.5 - y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - spin;
      const tooth = ((a / TAU) * 6 % 1 + 1) % 1;
      if (d > r + 3 * (1 - tooth) || d < r * 0.35) continue;
      L.f.set(px2, py, d > r ? C[3] : d > r - 2 ? C[1] : d > r * 0.6 ? C[2] : C[0]);
    }
    L.l.glow(x, y, r * 2.2, C[3], 0.45);
  }
  // A rock drawn per pixel: a lumpy disc lit from the top left, a dark rim.
  function rockAt(L, x, y, r, seed) {
    const C = ROCKC;
    for (let py = Math.floor(y - r - 1); py <= y + r + 1; py++) for (let px2 = Math.floor(x - r - 1); px2 <= x + r + 1; px2++) {
      const dx = px2 + 0.5 - x, dy = py + 0.5 - y, a = Math.atan2(dy, dx), rr = r * (0.85 + 0.2 * noise(a * 2 + seed, seed)), d = Math.hypot(dx, dy);
      if (d > rr) continue;
      const lit = (-dx - dy) / (rr * 1.4);
      L.f.set(px2, py, d > rr - 1 ? C[5] : lit > 0.35 ? C[1] : lit > -0.1 ? C[2] : lit > -0.5 ? C[3] : C[4]);
    }
  }
  // The top of a body turned to steel, a glint sweeping it (Iron Head).
  function steelTop(L, b, k) {
    if (!b || k <= 0.02) return;
    const [x0, y0] = origin(b), on = maskAt(b), top = Math.floor(b.h * 0.45), sweep = ((time * 1.6) % 1) * (b.w + 10) - 5;
    for (let j = 0; j < top; j++) for (let i = 0; i < b.w; i++) if (on(i, j)) {
      const edge = !on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1);
      L.f.dot(x0 + i, y0 + j, Math.abs(i - sweep + j * 0.5) < 2 ? STEELW[0] : edge ? STEELW[5] : j < top * 0.4 ? STEELW[2] : STEELW[3], k);
    }
    L.l.glow(x0 + b.w / 2, y0 + top / 2, b.w, STEELW[2], 0.5 * k);
  }
  const earthStart = new Map();
  Object.assign(SIG, {
    // Its body flashes gold; glowing gold cracks run along the floor with the shot, and the ground erupts under the foe.
    "earth-power": {
      fire({ side }) { timed(0.35, (L, t) => auraOn(L, bodies[side], EARTHG, 1 - t / 0.35, 0.6, 0.6)); },
      shot({ id, x: wx, y: wy }) {
        const [x, gy] = toPx(wx, wy + 0.42);
        if (!earthStart.has(id)) earthStart.set(id, [x, gy]);
        const [x0, y0] = earthStart.get(id);
        queued.push((L) => { for (let i = -1; i <= 1; i++) crack(L, x0, y0 + i * 2, x, gy + i * 2, EARTHG, 1, i + 2); sparkle(L.f, x, gy - 1, 2, EARTHG[1], EARTHG[3]); });
        if (earthStart.size > 8) earthStart.delete(earthStart.keys().next().value);
        return true;
      },
      hit({ side, x: wx, y: wy, ux: uwx, uy: uwy }) {
        const [x, gy] = toPx(wx, wy + 0.42), [ux] = toPx(uwx, uwy), uy = gy;
        for (let i = 0; i < 12; i++) add({ k: "chunk", x: x + range(-8, 8), y: gy - 2, vx: range(-50, 50), vy: -range(60, 140), g: 380, life: range(0.6, 1), ramp: EARTHC, gy });
        timed(1.0, (L, t) => {
          const k = 1 - smooth(0.4, 1.0, t), h = 40 * Math.min(1, outBack(t / 0.12, 1.5)) * (1 - smooth(0.35, 0.8, t));
          for (let i = -1; i <= 1; i++) crack(L, ux, uy + i * 2, x, gy + i * 2, EARTHG, k, i + 2);
          for (let yy = 0; yy < h; yy++) { const q = yy / Math.max(1, h), w = 8 * (1 - q * 0.5) * (0.85 + 0.3 * noise(yy * 0.3 - time * 20, 4)); for (let o = -w; o <= w; o += 0.5) L.f.dot(x + o, gy - yy, EARTHG[Math.min(6, Math.floor((Math.abs(o) / w) * 4 + q * 2))], k); }
          L.l.glow(x, gy - 14, 30, EARTHG[3], 0.8 * k);
        }, (t) => { if (t < 0.6 && rand() < 0.8) add({ k: "spark", x: x + range(-7, 7), y: gy - 2, vx: range(-20, 20), vy: -range(80, 180), drag: 2, life: range(0.3, 0.6), ramp: EARTHG }); });
      },
    },
    // Its wings glow light blue, and each flap sends out a spinning saw-disc of air.
    "air-slash": {
      fire({ side }) { timed(0.4, (L, t) => auraOn(L, bodies[side], AIRB, (1 - t / 0.4) * 0.8, 0, 0.3)); },
      shot({ x: wx, y: wy, dx, dy }) {
        const [x, y] = toPx(wx, wy - 0.3);
        queued.push((L) => { sawDisc(L, x, y, 7, time * 26, AIRB); for (let i = 1; i < 5; i++) L.f.dot(x - dx * 3 * i, y - dy * 3 * i, AIRB[2], 1 - i / 5); });
        return true;
      },
    },
    // An orange beam wrapped in light pink streaks; after it the user flickers grey, spent (a look only - the Arena has no recharge).
    "hyper-beam": {
      fire({ side, x: wx, y: wy, dx, dy }) {
        const [cx, cy] = at(side, wx, wy), mx = cx + dx * 8, my = cy + dy * 8;
        for (let i = 0; i < 10; i++) { const a = range(0, TAU), d = range(10, 18); add({ k: "mote", x: mx + Math.cos(a) * d, y: my + Math.sin(a) * d, vx: -Math.cos(a) * d * 5, vy: -Math.sin(a) * d * 5, life: 0.18, ramp: HBEAM }); }
        timed(1.1, (L, t) => { if (t < 0.5) return; const on = Math.floor(t * 10) % 2; outline(L, bodies[side], on ? GREYS : RAMP.normal[0], 1 - smooth(0.9, 1.1, t)); });
      },
      beam({ x: wx, y: wy, dx, dy, len: wl, w }) {
        const [x, y] = toPx(wx, wy), len = wl * BODY_PX, hw = w * BODY_PX * 0.7, id = `b${beams++}`;
        timed(0.55, (L, t) => {
          const u = t / 0.55, k = u < 0.3 ? 1 : 1 - (u - 0.3) / 0.7;
          band(L, id, "hyper", x, y, dx, dy, len, hw, k, HYPERB);
          for (let i = 0; i < 3; i++) for (let d = 0; d < len; d += 0.5) { if ((d + i * 7 + time * 90) % 10 >= 6) continue; const o = Math.sin(d * 0.25 + time * 18 + i * 2.1) * (hw + 3) * k; L.f.dot(x + dx * d - dy * o, y + dy * d + dx * o, HPINK[i], k); }
          L.l.glow(x + dx * len, y + dy * len, hw * 3, HBEAM[3], 0.7 * k);
        });
      },
    },
    // Its head turns to gleaming steel as it charges; the blow throws steel sparks.
    "iron-head": {
      fire({ side }) { timed(0.55, (L, t) => steelTop(L, bodies[side], smooth(0, 0.08, t) * (1 - smooth(0.4, 0.55, t)))); },
      hit({ x: wx, y: wy, dx, dy }) {
        const [x, y] = toPx(wx, wy - 0.3), gy = toPx(0, wy + 0.42)[1];
        fxs.push(blowFx(x, y, STEELW, true));
        for (let i = 0; i < 12; i++) { const [vx, vy] = spray(-(dx || 1), -(dy || 0), 2.4, 70, 180); add({ k: "spark", x, y, vx, vy: vy - 30, g: 260, drag: 2, life: range(0.2, 0.4), ramp: STEELW, gy }); }
      },
    },
    // Green light wraps the foe, and its energy streams back into the user, which glows as it heals.
    "giga-drain": { hit({ side, x: wx, y: wy, ux: uwx, uy: uwy }) {
      timed(1.1, (L, t) => {
        const held = smooth(0, 0.1, t) * (1 - smooth(0.75, 0.95, t)), [bx, by] = at(side, wx, wy), [ax, ay] = at(1 - side, uwx, uwy);
        if (held > 0) {
          auraOn(L, bodies[side], DRAINR, held, 0, -1);
          for (let i = 0; i < 3; i++) { const ph = time * 6 + i * 2; for (let d = 0; d <= 1; d += 0.01) { if ((Math.floor(d * 100) + Math.floor(time * 40) + i * 3) % 6 >= 3) continue; L.f.dot(bx + (ax - bx) * d, by + (ay - by) * d + Math.sin(d * 9 + ph) * 5 * Math.sin(d * Math.PI), DRAINR[i === 1 ? 1 : 3], held * 0.9); } }
        }
        auraOn(L, bodies[1 - side], DRAINR, smooth(0.3, 0.6, t) * (1 - smooth(0.8, 1.1, t)), 0, 1);
      }, (t, dt) => {
        const [bx, by] = at(side, wx, wy), [ax, ay] = at(1 - side, uwx, uwy);
        if (t < 0.75 && rand() < 0.8) { const yy = by + range(-8, 8); add({ k: "mote", x: bx + range(-5, 5), y: yy, vx: (ax - bx) * 2, vy: (ay - yy) * 2, life: 0.5, ramp: DRAINR }); }
        if (t > 0.7 && t - dt <= 0.7) for (let i = 0; i < 8; i++) add({ k: "cross", x: ax + range(-9, 9), y: ay + range(-5, 5), vy: -range(16, 30), sway: 30, life: range(0.6, 0.9), size: rand() < 0.4 ? 2 : 1, ramp: DRAINR });
      });
    } },
    // Rocks appear overhead round the user, their shadows growing on the floor, and fall and crack apart.
    "rock-slide": { pulse({ x: wx, y: wy, r }) {
      const [cx, cy] = toPx(wx, wy + 0.42), R = r * BODY_PX;
      const rocks = Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * TAU + range(-0.3, 0.3), d = R * range(0.35, 0.95); return { t0: i * 0.07, x: cx + Math.cos(a) * d, gy: cy + Math.sin(a) * d * 0.42, r: range(5, 8), seed: range(0, 9), hit: false }; });
      timed(0.9, (L, t) => { for (const k of rocks) {
        const u = (t - k.t0) / 0.38;
        if (u <= 0 || u >= 1) continue;
        const y = k.gy - k.r - 70 * (1 - u * u), sr = k.r * (0.4 + 0.8 * u);
        for (let py = -2; py <= 2; py++) for (let px2 = -sr; px2 <= sr; px2++) if ((px2 / sr) ** 2 + (py / (sr * 0.3 + 0.5)) ** 2 <= 1) L.b.dot(k.x + px2, k.gy + py, SHADE, 0.4 + 0.4 * u);
        rockAt(L, k.x, y, k.r, k.seed);
        if (u < 0.2) oval(L.f, k.x, y, k.r + 2, k.r + 2, ROCKC[0], 1 - u / 0.2);
      } }, (t) => { for (const k of rocks) if (!k.hit && t > k.t0 + 0.38) {
        k.hit = true;
        for (let i = 0; i < 6; i++) add({ k: "chunk", x: k.x, y: k.gy - 2, vx: range(-50, 50), vy: -range(40, 100), g: 380, life: range(0.4, 0.8), ramp: ROCKC, gy: k.gy });
        for (let i = 0; i < 3; i++) add({ k: "dust", x: k.x + range(-4, 4), y: k.gy - 1, vx: range(-30, 30), vy: -range(2, 10), drag: 4, life: 0.6, size: 2, front: false });
      } });
    } },
    // Its claws glow light green in a claw-shaped aura, and it slashes - three marks, twice.
    "dragon-claw": { fire({ x: wx, y: wy, dx, dy }) {
      const [tx, ty] = toPx(wx + dx * 1.3, wy - 0.3 + dy * 1.3), base = Math.atan2(dy, dx) + Math.PI / 2;
      for (const [t0, tilt] of [[0, -0.5], [0.13, 0.5]]) timed(t0 + 0.4, (L, t) => {
        const u = t - t0;
        if (u < 0) return;
        const a = base + tilt, reach = Math.min(1, u / 0.06), fade = u < 0.12 ? 1 : 1 - (u - 0.12) / 0.28;
        for (let k = -1; k <= 1; k++) for (let d = -11; d <= 11 * (reach * 2 - 1); d += 0.5) {
          const x = tx + d * Math.cos(a) - k * 4 * Math.sin(a), y = ty + d * Math.sin(a) + k * 4 * Math.cos(a);
          L.f.dot(x, y, DCLAW[Math.abs(d) < 5 ? 0 : 2], fade); L.f.dot(x, y + 1, DCLAW[4], fade);
        }
        L.l.glow(tx, ty, 18, DCLAW[3], 0.6 * fade);
      });
    } },
    // It stamps; rings of heaving floor run out to the pulse's reach, and cracks split from its feet.
    earthquake: { pulse({ x: wx, y: wy, r }) {
      const [cx, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX;
      const lines = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * TAU + range(-0.3, 0.3), l = R * range(0.5, 0.95); return [cx + Math.cos(a) * l, gy + Math.sin(a) * l * 0.42, i]; });
      for (let i = 0; i < 16; i++) { const a = range(0, TAU), d = R * range(0.2, 1); add({ k: "dust", x: cx + Math.cos(a) * d, y: gy + Math.sin(a) * d * 0.42, vx: range(-10, 10), vy: -range(4, 14), drag: 3, life: range(0.5, 0.9), size: range(1.5, 2.5), front: false, delay: range(0, 0.4) }); }
      timed(1.4, (L, t) => {
        for (let i = 0; i < 3; i++) {
          const u = (t - i * 0.15) / 0.7;
          if (u <= 0 || u >= 1) continue;
          const rr = 4 + u * R;
          L.b.ring(cx, gy, rr, 3, EARTHC[0], Math.min(1, (1 - u) * 1.6), 0.42);
          L.b.ring(cx, gy + 2, rr - 3, 3, EARTHC[4], Math.min(1, (1 - u) * 1.4), 0.42);
        }
        const run = smooth(0, 0.3, t), fade = 1 - smooth(0.9, 1.4, t);
        for (const [x1, y1, i] of lines) crack(L, cx, gy, cx + (x1 - cx) * run, gy + (y1 - gy) * run, EARTHC, fade, i + 5);
      });
    } },
  });
  /* ---------- batch 3 (2026-10-30): the next most carried ---------- */
  // A comic impact star: spikes out from a white heart, yellow-edged - the POW of a body blow.
  function powStar(L, x, y, u) {
    if (u < 0 || u > 0.4) return;
    const g = (u < 0.05 ? outBack(u / 0.05, 2) : 1 - (u - 0.05) / 0.35) * 1.3;
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * TAU, a1 = ((i + 1) / 18) * TAU, r0 = (i % 2 ? 5 : 12) * g, r1 = (i % 2 ? 12 : 5) * g;
      L.f.line(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0, x + Math.cos(a1) * r1, y + Math.sin(a1) * r1, HEAT[2]);
      L.f.line(x + Math.cos(a0) * (r0 + 1), y + Math.sin(a0) * (r0 + 1), x + Math.cos(a1) * (r1 + 1), y + Math.sin(a1) * (r1 + 1), HEAT[5]);
    }
    L.f.disc(x, y, 4 * g, RAMP.normal[0]);
    L.l.glow(x, y, 22, HEAT[2], 0.6 * g);
  }
  const eyesAt = (side, wx, wy) => { const b = bodies[side]; if (!b) { const [x, y] = toPx(wx, wy - 1); return [x, y]; } const [x0, y0] = origin(b); return [x0 + b.w / 2, y0 + b.h * 0.3]; };
  const rings = (buf, x, y, rx, ry, c, a) => oval(buf, x, y, rx, ry, c, a);
  Object.assign(SIG, {
    // A run-up kicking dust, and a full-body blow that lands with a POW star.
    tackle: { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); timed(0.4, (L, t) => powStar(L, x, y, t)); } },
    // Its eyes glow red, and an illusion of a menacing face flies at the foe (a pulse: the foe when it is in reach).
    "scary-face": { pulse({ side, x: wx, y: wy, r, fx: fwx, fy: fwy }) {
      const [ex, ey] = eyesAt(side, wx, wy), near = fwx != null && Math.hypot(fwx - wx, fwy - wy) < r * 1.6;
      const [tx, ty] = near ? toPx(fwx, fwy - 0.5) : [ex, ey - 6];
      timed(0.9, (L, t) => {
        if (t < 0.45) { L.f.set(ex - 2, ey, SCARY[1]); L.f.set(ex + 2, ey, SCARY[1]); L.l.glow(ex, ey, 9, SCARY[3], 0.9); }
        const u = smooth(0.1, 0.5, t), k = (t < 0.1 ? 0 : 1) * (1 - smooth(0.6, 0.9, t)), x = ex + (tx - ex) * u, y = ey + (ty - ey) * u, sc = 0.6 + 0.8 * u;
        if (k <= 0) return;
        for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) { L.f.dot(x + sd * (4 + i) * sc, y - 4 * sc + sd * i * 0.4 * sc, SCARY[2], k); L.f.dot(x + sd * (4 + i) * sc, y - 3 * sc + sd * i * 0.4 * sc, SCARY[4], k); }
        for (let i = -10; i <= 10; i++) { const zig = (i & 1) * 2; L.f.dot(x + i * sc, y + (5 + zig) * sc, SCARY[3], k); L.f.dot(x + i * sc, y + (9 - zig) * sc, SCARY[3], k); }
        rings(L.f, x, y, 15 * sc, 13 * sc, SCARY[5], k * 0.7);
        L.l.glow(x, y - 3 * sc, 14 * sc, SCARY[3], 0.5 * k);
      });
    } },
    // So fast it is almost invisible: a white trail of light behind it all the way to the foe.
    "quick-attack": { fire({ side, x: wx, y: wy }) {
      const trail = [];
      timed(0.55, (L, t) => {
        for (let i = 1; i < trail.length; i++) { const q = i / trail.length, k = 1 - smooth(0.3, 0.55, t); const [ax, ay] = trail[i - 1], [bx, by] = trail[i]; for (let d = 0; d <= 1; d += 0.2) L.f.disc(ax + (bx - ax) * d, ay + (by - ay) * d, (2.4 * q + 0.6) * k, q > 0.6 ? RAMP.normal[0] : DASHR[1]); }
        if (trail.length) { const [x, y] = trail[trail.length - 1]; L.l.glow(x, y, 12, DASHR[2], 0.6 * (1 - t / 0.55)); }
      }, (t) => { if (t < 0.3) trail.push(at(side, wx, wy).slice(0, 2)); });
    } },
    // Its cheeks spark, then bolts fire out of its body in every direction at once.
    discharge: { pulse({ side, x: wx, y: wy, r }) {
      const [cx, cy] = at(side, wx, wy), R = r * BODY_PX;
      fxs.push(crackleFx(cx, cy - 4, DISCH, 0.2));
      let f = -1, bolts = [];
      timed(0.6, (L, t) => {
        const k = 1 - smooth(0.4, 0.6, t);
        bolts.forEach((p, i) => { boltLine(L, p, i % 2 ? DISCH[1] : DISCH[3], k); for (let j = 0; j < p.length; j += 5) L.l.glow(p[j][0], p[j][1], 6, DISCH[i % 2 ? 2 : 4], 0.4 * k); });
        L.l.glow(cx, cy, R * 0.6, DISCH[2], 0.4 * k);
      }, (t) => { const n = Math.floor(t * 15); if (n !== f && t > 0.08) { f = n; bolts = Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * TAU + range(-0.2, 0.2), l = R * range(0.6, 1); return bolt(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.6, 0.3); }); } });
    } },
    // Its eyes glow, and rings of hypnotic light grow as they travel (the shot); the sleep is the status's own Zs.
    hypnosis: {
      fire({ side, x: wx, y: wy }) { const [ex, ey] = eyesAt(side, wx, wy); timed(0.4, (L, t) => { const k = 1 - t / 0.4; L.f.set(ex - 2, ey, HYPNO[0]); L.f.set(ex + 2, ey, HYPNO[0]); L.l.glow(ex, ey, 8, HYPNO[3], 0.8 * k); }); },
      shot({ x: wx, y: wy, dx }) {
        const [x, y] = toPx(wx, wy - 0.4);
        queued.push((L) => { for (let i = 0; i < 3; i++) { const q = (time * 2.5 + i / 3) % 1, rr = 3 + q * 8; rings(L.f, x - dx * q * 10, y, rr * 0.5, rr, HYPNO[i % 2 ? 2 : 3], 1 - q * 0.7); } L.l.glow(x, y, 10, HYPNO[3], 0.4); });
        return true;
      },
    },
    // A sphere of water ringed by pulses as it flies, bursting on the foe into a wave of water.
    "water-pulse": {
      shot({ x: wx, y: wy }) {
        const V = RAMP.water, [x, y] = toPx(wx, wy - 0.35), r = 5;
        queued.push((L) => { L.f.disc(x, y, r + 1, V[4]); L.f.disc(x, y, r, V[2]); L.f.disc(x - r * 0.3, y - r * 0.3, r * 0.45, V[1]); L.f.set(x - r * 0.4, y - r * 0.5, V[0]); for (let i = 0; i < 2; i++) { const q = (time * 3 + i * 0.5) % 1; rings(L.f, x, y, r + 2 + q * 6, r + 2 + q * 6, V[1], 1 - q); } L.l.glow(x, y, r * 3, V[3], 0.4); });
        return true;
      },
      hit({ x: wx, y: wy }) {
        const V = RAMP.water, [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1];
        for (let i = 0; i < 18; i++) { const a = range(0, TAU), sp = range(40, 120); add({ k: "drop", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, g: 320, life: range(0.4, 0.8), ramp: V, gy }); }
        timed(0.5, (L, t) => { const k = 1 - t / 0.5; L.b.ring(x, gy, 4 + t * 70, 2, V[1], k, 0.4); L.f.ring(x, y, 6 + t * 40, 2, V[2], k); });
      },
    },
    // Rocks wrapped in purple energy rise from the ground and are hurled (the shot: three rocks round it).
    "ancient-power": {
      fire({ side, x: wx, y: wy }) { const [cx] = at(side, wx, wy), gy = toPx(0, wy + 0.42)[1]; for (let i = 0; i < 8; i++) add({ k: "dust", x: cx + range(-10, 10), y: gy - 1, vx: range(-20, 20), vy: -range(4, 12), drag: 4, life: 0.5, size: 2, front: false }); timed(0.3, (L, t) => auraOn(L, bodies[side], APOW, 1 - t / 0.3, 0, 1)); },
      shot({ id, x: wx, y: wy }) {
        const [x, y] = toPx(wx, wy - 0.4), seed = (typeof id === "number" ? id : 3) % 9;
        queued.push((L) => { for (let i = 0; i < 3; i++) { const a = time * 4 + (i * TAU) / 3, rx = x + Math.cos(a) * 6, ry = y + Math.sin(a) * 3; for (let k = 0; k < 2; k++) rings(L.b, rx, ry, 5 + k, 5 + k, APOW[2 + k], 0.8); rockAt(L, rx, ry, 3.5, seed + i); } L.l.glow(x, y, 16, APOW[3], 0.5); });
        return true;
      },
      hit({ x: wx, y: wy }) {
        const [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1];
        fxs.push(blowFx(x, y, APOW, false));
        for (let i = 0; i < 8; i++) add({ k: "chunk", x, y, vx: range(-50, 50), vy: -range(30, 80), g: 380, life: 0.6, ramp: ROCKC, gy });
      },
    },
    // A shock wave from its gaping mouth: the stream's colours and rings are `STREAM_RAMP`'s; here, the orb it gathers.
    "dragon-pulse": { fire({ side, x: wx, y: wy, dx, dy }) { const [cx, cy] = at(side, wx, wy), mx = cx + dx * 8, my = cy + dy * 8; timed(0.2, (L, t) => orbAt(L, mx, my, 1 + 3 * (t / 0.2), DPULSE)); } },
  });
  /* ---------- batch 4 (2026-10-30): eight more, each its own look ---------- */
  // The top of a body lit in a ramp (Zen Headbutt's blue).
  function topGlow(L, b, C, k) {
    if (!b || k <= 0.02) return;
    const [x0, y0] = origin(b), on = maskAt(b), top = Math.floor(b.h * 0.35);
    for (let j = 0; j < top; j++) for (let i = 0; i < b.w; i++) if (on(i, j)) L.f.dot(x0 + i, y0 + j, j < top * 0.5 ? C[1] : C[2], k * 0.9);
  }
  Object.assign(SIG, {
    // It pops up in the foe's face: a black ghost face with pink glowing eyes and a grin, and dark smoke.
    astonish: { hit({ x: wx, y: wy }) {
      const [x, y] = toPx(wx, wy - 0.55);
      for (let i = 0; i < 6; i++) add({ k: "smoke", x: x + range(-8, 8), y: y + range(-6, 6), vx: range(-10, 10), vy: -range(4, 12), life: range(0.5, 0.8), size: range(2.5, 3.5), smoke: [GHOSTF[4], GHOSTF[5], GHOSTF[6], GHOSTF[6]] });
      timed(0.6, (L, t) => {
        const k = 1 - smooth(0.4, 0.6, t), sc = 1 + 0.25 * outBack(Math.min(1, t / 0.12), 2);
        L.f.disc(x, y, 11 * sc, GHOSTF[6], k); L.f.ring(x, y, 11 * sc, 1.5, GHOSTF[4], k);
        for (const sd of [-1, 1]) { L.f.disc(x + sd * 4 * sc, y - 3 * sc, 2 * sc, GHOSTF[2], k); L.f.set(x + sd * 4 * sc, y - 3 * sc, GHOSTF[0]); }
        for (let i = -6; i <= 6; i++) L.f.dot(x + i * sc, y + 4 * sc - Math.abs(i) * 0.35 * sc + (i & 1), GHOSTF[1], k);
        L.l.glow(x, y - 3, 14, GHOSTF[2], 0.5 * k);
      });
    } },
    // Dark purple energy swirls round it as it lunges, faster than the foe; a burst of it on contact.
    "sucker-punch": {
      fire({ side, x: wx, y: wy }) { timed(0.35, (L, t) => { const [cx, cy] = at(side, wx, wy), k = 1 - smooth(0.2, 0.35, t); for (let i = 0; i < 8; i++) { const a = time * 9 + i * 0.8, d = 9 + Math.sin(time * 20 + i) * 2; L.f.dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, SUCKER[i % 2 ? 2 : 3], k); } L.l.glow(cx, cy, 14, SUCKER[3], 0.5 * k); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, SUCKER, true)); for (let i = 0; i < 10; i++) { const a = range(0, TAU), sp = range(50, 130); add({ k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.15, 0.3), ramp: SUCKER }); } },
    },
    // The top of its head glows blue inside a see-through shield as it leaps head first.
    "zen-headbutt": {
      fire({ side, x: wx, y: wy }) { timed(0.5, (L, t) => { const b = bodies[side], k = smooth(0, 0.06, t) * (1 - smooth(0.35, 0.5, t)); topGlow(L, b, ZEN, k); if (!b) return; const [x0, y0] = origin(b), hx = x0 + b.w / 2, hy = y0 + b.h * 0.15; L.f.ring(hx, hy, b.w * 0.45, 1, ZEN[2], k * 0.8); L.l.glow(hx, hy, 16, ZEN[3], 0.6 * k); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, ZEN, true)); },
    },
    // Rings of electricity, crackling as they fly; the paralysis is the status's own crackle.
    "thunder-wave": { shot({ x: wx, y: wy, dx }) {
      const [x, y] = toPx(wx, wy - 0.35);
      queued.push((L) => { for (let i = 0; i < 3; i++) { const q = (time * 3 + i / 3) % 1, r = 3 + q * 4, cx = x - dx * q * 12; for (let a = 0; a < TAU; a += 0.15) { const j = Math.sin(a * 7 + time * 40 + i) * 1.2; L.f.dot(cx + Math.cos(a) * (r * 0.5 + j * 0.3), y + Math.sin(a) * (r + j), TWAVE[(Math.floor(a * 3 + time * 30) & 1) ? 1 : 3], 1 - q * 0.5); } } L.l.glow(x, y, 10, TWAVE[3], 0.5); });
      return true;
    } },
    // Its eyes glow blue, a ripple of force flies, and the foe is wrapped in a light blue outline and shaken.
    confusion: {
      fire({ side, x: wx, y: wy }) { const [ex, ey] = eyesAt(side, wx, wy); timed(0.35, (L, t) => { L.f.set(ex - 2, ey, CONFL[0]); L.f.set(ex + 2, ey, CONFL[0]); L.l.glow(ex, ey, 8, CONFL[3], 0.8 * (1 - t / 0.35)); }); },
      shot({ x: wx, y: wy, dx }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let k = 0; k < 3; k++) rings(L.f, x - dx * k * 4, y, 2 + k, 5 + k * 2, CONFL[1 + k], 1 - k * 0.25); L.l.glow(x, y, 9, CONFL[3], 0.4); }); return true; },
      hit({ side }) { timed(0.6, (L, t) => { const k = smooth(0, 0.06, t) * (1 - smooth(0.4, 0.6, t)); auraOn(L, bodies[side], CONFL, k * 0.8, 0, 0.3); outline(L, bodies[side], CONFL[1], k); }); },
    },
    // It draws breath, then breathes out a thick green-and-yellow blast that bursts on the foe.
    "dragon-breath": {
      fire({ side, x: wx, y: wy, dx, dy }) { const [cx, cy] = at(side, wx, wy), mx = cx + dx * 8, my = cy + dy * 8; for (let i = 0; i < 10; i++) { const a = range(0, TAU), d = range(6, 12); add({ k: "mote", x: mx + Math.cos(a) * d, y: my + Math.sin(a) * d, vx: -Math.cos(a) * d * 5, vy: -Math.sin(a) * d * 5, life: 0.2, ramp: DBREATH }); } },
      shot({ x: wx, y: wy, dx, dy }) {
        const [x, y] = toPx(wx, wy - 0.35);
        queued.push((L) => { for (let i = 0; i < 10; i++) { const q = i / 10, bx = x - dx * 3 * i, by = y - dy * 3 * i + Math.sin(i * 1.3 + time * 30) * 1.5; L.f.disc(bx, by, 4.5 - q * 3, DBREATH[q < 0.3 ? 2 : q < 0.6 ? 3 : 4], 1 - q * 0.6); } L.f.disc(x, y, 3, DBREATH[1]); L.l.glow(x, y, 14, DBREATH[3], 0.6); });
        return true;
      },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, DBREATH, true)); },
    },
    // Water spirals round its tail as it swings: three twisting streams sweep across the reach; the blow throws drops.
    "aqua-tail": {
      fire({ x: wx, y: wy, dx, dy }) {
        const V = RAMP.water, [cx, cy] = toPx(wx + dx * 0.9, wy - 0.25 + dy * 0.9), base = Math.atan2(dy, dx) - 1.5;
        timed(0.45, (L, t) => {
          const sw = smooth(0, 0.22, t), k = 1 - smooth(0.25, 0.45, t);
          for (let s2 = 0; s2 < 3; s2++) for (let q = 0; q <= 3.0 * sw; q += 0.03) { const a = base + q, r = 14 + Math.sin(q * 6 + s2 * 2.1 + time * 20) * 3; L.f.disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, s2 === 1 ? 0.9 : 1.3, V[s2 === 1 ? 0 : s2 ? 1 : 3], k); }
          L.l.glow(cx, cy, 18, V[3], 0.4 * k);
        });
      },
      hit({ x: wx, y: wy, dx }) { const V = RAMP.water, [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; for (let i = 0; i < 16; i++) { const [vx, vy] = spray(dx || 1, 0, 2.8, 50, 130); add({ k: "drop", x, y, vx, vy: vy - 40, g: 320, life: range(0.4, 0.8), ramp: V, gy }); } },
    },
    // Its mouth glows light blue and a wind full of light blue sparkles blows out (toward the foe, round it otherwise).
    "icy-wind": { pulse({ side, x: wx, y: wy, r, fx: fwx, fy: fwy }) {
      const [cx, cy] = at(side, wx, wy), R = r * BODY_PX, a0 = fwx != null ? Math.atan2(fwy - wy, fwx - wx) : 0;
      for (let i = 0; i < 40; i++) { const a = a0 + range(-0.7, 0.7), sp = range(R * 1.2, R * 2); add({ k: rand() < 0.35 ? "star" : "mote", x: cx, y: cy + range(-4, 4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, drag: 1.2, life: range(0.5, 0.8), size: 1, ramp: ICYW, delay: range(0, 0.3) }); }
      timed(0.8, (L, t) => {
        const k = smooth(0, 0.1, t) * (1 - smooth(0.5, 0.8, t)), ux = Math.cos(a0), uy = Math.sin(a0);
        L.l.glow(cx, cy, 10, ICYW[3], 0.8 * k);
        for (let i = 0; i < 6; i++) { const off = (i - 2.5) * 4, ph = (t * 160 + i * 23) % R; for (let d = 0; d < 20; d++) { const p = ph + d; L.f.dot(cx + ux * p - uy * off, cy + uy * p * 0.5 + ux * off + Math.sin(p * 0.08 + i) * 2, ICYW[d < 4 ? 0 : 2], k * (1 - d / 20)); } }
      });
    } },
  });
  /* ---------- batches 5 and 6 (2026-10-30) ---------- */
  // A white edge on a body's outline, sparkled (Harden, Double-Edge's gold).
  function edgeLit(L, b, C, k, every = 7) {
    if (!b || k <= 0.02) return;
    const [x0, y0] = origin(b), on = maskAt(b);
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (on(i, j)) {
      const edge = !on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1);
      if (edge || (i + j + Math.floor(time * 20)) % every === 0) L.f.dot(x0 + i, y0 + j, edge ? C[2] : C[0], k);
    }
  }
  // Three white slash streaks across a point, at angle `a` (Slash, Wing Attack).
  function streaks(L, x, y, a, t, C, n = 3, gap = 4, len = 11) {
    const reach = Math.min(1, t / 0.06), fade = t < 0.12 ? 1 : 1 - (t - 0.12) / 0.25;
    if (fade <= 0) return;
    for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * gap; for (let d = -len; d <= len * (reach * 2 - 1); d += 0.5) { const px2 = x + d * Math.cos(a) - o * Math.sin(a), py = y + d * Math.sin(a) + o * Math.cos(a); L.f.dot(px2, py, C[Math.abs(d) < len * 0.45 ? 0 : 2], fade); L.f.dot(px2, py + 1, C[4], fade * 0.8); } }
    L.l.glow(x, y, 16, C[3], 0.5 * fade);
  }
  const reachOf = (wx, wy, dx, dy, d = 1.3) => toPx(wx + dx * d, wy - 0.3 + dy * d);
  Object.assign(SIG, {
    // An orange aura with a golden force field ahead of it on the charge; an orange burst; the recoil jolts it.
    "take-down": {
      fire({ side, dx, dy }) { timed(0.45, (L, t) => { const b = bodies[side], k = 1 - smooth(0.3, 0.45, t); auraOn(L, b, TDOWN, k, 0, 0.6); if (!b) return; const [cx, cy] = centreOf(b); for (let q = -1.1; q <= 1.1; q += 0.05) { const ax = Math.cos(q) * 6, ay = Math.sin(q) * 13; L.f.dot(cx + dx * 12 + ax * dx - ay * dy, cy + dy * 12 + ax * dy + ay * dx, q > -0.4 && q < 0.4 ? TDOWN[0] : TDOWN[2], k); } }); },
      hit({ side, x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, TDOWN, true)); timed(0.25, (L, t) => outline(L, bodies[1 - side], TDOWN[1], 1 - t / 0.25)); },
    },
    // A plain ram, no glow: a white knock ring over the foe's head and stars circling it.
    headbutt: { hit({ side, x: wx, y: wy }) {
      timed(1.0, (L, t) => {
        const b = bodies[side], [hx, hy] = b ? (() => { const [x0, y0] = origin(b); return [x0 + b.w / 2, y0 - 2]; })() : toPx(wx, wy - 1.2);
        if (t < 0.25) { const k = t / 0.25; L.f.ring(hx, hy + 6, 4 + k * 14, Math.max(1, 3 * (1 - k)), RAMP.normal[0], 1 - k); }
        for (let i = 0; i < 3; i++) { const q = time * 6 + (i * TAU) / 3; sparkle(L.f, hx + Math.cos(q) * 9, hy + Math.sin(q) * 3, 2, RAMP.electric[1], RAMP.electric[3]); }
      });
    } },
    // Its body glows bright gold as it charges recklessly; the biggest burst of the charges; the recoil sparks over it.
    "double-edge": {
      fire({ side }) { timed(0.5, (L, t) => { const k = smooth(0, 0.08, t) * (1 - smooth(0.35, 0.5, t)); edgeLit(L, bodies[side], DEDGE, k); auraOn(L, bodies[side], DEDGE, k * 0.7, 0, 1); }); },
      hit({ side, x: wx, y: wy }) {
        const [x, y] = toPx(wx, wy - 0.35);
        fxs.push(blowFx(x, y, DEDGE, true));
        timed(0.6, (L, t) => { if (t < 0.3) L.f.ring(x, y, 6 + t * 80, 2, DEDGE[1], 1 - t / 0.3); outline(L, bodies[1 - side], Math.floor(t * 16) % 2 ? DEDGE[2] : RAMP.normal[0], 1 - t / 0.6); },
          () => { const b = bodies[1 - side]; if (!b || rand() > 0.6) return; const [x0, y0] = origin(b); add({ k: "spark", x: x0 + range(0, b.w), y: y0 + range(0, b.h), vx: range(-40, 40), vy: -range(20, 60), drag: 3, life: range(0.15, 0.3), ramp: DEDGE }); });
      },
    },
    // Its whole weight lands on the foe: a heavy burst, three dust rings racing out, cracks, rock chunks and a ring of dust (asked for: "more intense").
    "body-slam": { hit({ side, x: wx, y: wy }) {
      const [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1];
      fxs.push(blowFx(x, y, RAMP.normal, true));
      for (let i = 0; i < 22; i++) { const a = range(0, TAU), sp = range(50, 120); add({ k: "dust", x: x + Math.cos(a) * 8, y: gy - 1 + Math.sin(a) * 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * 14 - range(4, 14), drag: 3.5, life: range(0.6, 1), size: range(2, 3.2), front: false }); }
      for (let i = 0; i < 10; i++) add({ k: "chunk", x: x + range(-8, 8), y: gy - 2, vx: range(-60, 60), vy: -range(60, 130), g: 380, life: range(0.5, 0.9), ramp: DUSTR, gy });
      const lines = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * TAU + range(-0.3, 0.3), l = range(14, 26); return [x + Math.cos(a) * l, gy + Math.sin(a) * l * 0.4, i]; });
      timed(1.1, (L, t) => {
        for (let i = 0; i < 3; i++) { const u = (t - i * 0.07) / 0.5; if (u <= 0 || u >= 1) continue; L.b.ring(x, gy, 6 + u * 46, 3 - i * 0.5, DUSTR[i ? 2 : 0], 1 - u, 0.38); }
        if (t < 0.12) { L.f.disc(x, y, 14 * (1 - t / 0.12) + 4, RAMP.normal[0], 1 - t / 0.12); }
        const fade = 1 - smooth(0.6, 1.1, t);
        for (const [x1, y1, i] of lines) crack(L, x, gy, x + (x1 - x) * smooth(0, 0.12, t), gy + (y1 - gy) * smooth(0, 0.12, t), DUSTR, fade, i + 9);
        L.l.glow(x, y, 30, RAMP.normal[2], 0.6 * (1 - smooth(0, 0.3, t)));
      });
      timed(0.2, (L, t) => outline(L, bodies[side], RAMP.normal[0], 1 - t / 0.2));
    } },
    // A long tail (or tongue) whips over the top and down onto the foe: a white arc; the foe pressed into the floor, a crack and dust.
    slam: {
      fire({ x: wx, y: wy, dx, dy }) {
        const [cx, cy] = reachOf(wx, wy, dx, dy, 1.0), base = Math.atan2(dy, dx) - 2.6;
        timed(0.35, (L, t) => { const u = smooth(0, 0.18, t), k = 1 - smooth(0.2, 0.35, t); for (let q = 0; q <= 2.4 * u; q += 0.03) { const head = q > 2.4 * u - 0.5; L.f.disc(cx + Math.cos(base + q) * 18, cy + Math.sin(base + q) * 14, head ? 1.6 : 1, head ? RAMP.normal[0] : RAMP.normal[2], k * (head ? 1 : 0.6)); } });
      },
      hit({ x: wx, y: wy }) {
        const [x] = toPx(wx, wy), gy = toPx(0, wy + 0.42)[1];
        for (let i = 0; i < 10; i++) add({ k: "dust", x: x + range(-10, 10), y: gy - 1, vx: range(-50, 50), vy: -range(5, 20), drag: 4, life: 0.6, size: range(1.8, 2.6), front: false });
        timed(0.8, (L, t) => { for (let i = -1; i <= 1; i++) crack(L, x, gy, x + i * 9 + 2, gy + (i ? 2 : 3), DUSTR, 1 - t / 0.8, i + 20); });
      },
    },
    // Its claws glow white and it slashes: three white streaks.
    slash: { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2 + 0.5; timed(0.45, (L, t) => streaks(L, x, y, a, t, RAMP.normal, 3, 5, 15)); } },
    // Wrapped in crackling electricity, it tackles the foe.
    spark: {
      fire({ side }) { let f = -1, arcs = []; timed(0.4, (L, t) => { const k = 1 - smooth(0.25, 0.4, t), b = bodies[side]; edgeLit(L, b, RAMP.electric, k, 11); for (const p of arcs) boltLine(L, p, RAMP.electric[1], k); }, (t) => { const n = Math.floor(t * 15); if (n !== f) { f = n; const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b); arcs = [0, 1, 2].map(() => { const a = range(0, TAU), a2 = a + range(0.6, 1.4); return bolt(cx + Math.cos(a) * b.w * 0.55, cy + Math.sin(a) * b.h * 0.5, cx + Math.cos(a2) * b.w * 0.55, cy + Math.sin(a2) * b.h * 0.5, 0.4); }); } }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(crackleFx(x, y, RAMP.electric, 0.35)); },
    },
    // It claps its hands right in front of the foe's face: two white arcs snapping together, a flash, the foe flinches.
    "fake-out": { hit({ x: wx, y: wy, dx }) {
      const [x, y] = toPx(wx - (dx || 1) * 0.3, wy - 0.6);
      timed(0.45, (L, t) => {
        const u = Math.min(1, t / 0.08), k = 1 - smooth(0.15, 0.45, t);
        for (const sd of [-1, 1]) for (let q = -1; q <= 1; q += 0.08) L.f.dot(x + sd * (10 * (1 - u) + 2) + Math.cos(q) * 3 * sd, y + Math.sin(q) * 8, RAMP.normal[0], k);
        if (t > 0.08 && t < 0.2) { L.f.ring(x, y, 4 + (t - 0.08) * 120, 2, RAMP.normal[0], 1 - (t - 0.08) / 0.12); sparkle(L.f, x, y, 5, RAMP.normal[0], RAMP.electric[2]); }
        L.l.glow(x, y, 14, RAMP.normal[2], 0.5 * k);
      });
    } },
    // Its wings glow white and it swoops: two wide white streaks.
    "wing-attack": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.1), a = Math.atan2(dy, dx) + Math.PI / 2; timed(0.45, (L, t) => streaks(L, x, y, a, t, AIRB, 2, 10, 17)); } },
    // So fast it vanishes: white streaks of light behind it, and a burst of speed lines on the hit.
    "extreme-speed": {
      fire({ side, x: wx, y: wy }) { const trail = []; timed(0.45, (L, t) => { const k = 1 - smooth(0.25, 0.45, t); for (let i = 1; i < trail.length; i++) { const [ax, ay] = trail[i - 1], [bx, by] = trail[i]; for (let o = -6; o <= 6; o += 6) L.f.line(ax, ay + o, bx, by + o, o ? DASHR[2] : RAMP.normal[0], k * (i / trail.length)); } }, (t) => { if (t < 0.25) trail.push(at(side, wx, wy).slice(0, 2)); }); },
      hit({ x: wx, y: wy, dx }) { const [x, y] = toPx(wx, wy - 0.35); for (let i = 0; i < 10; i++) add({ k: "line", x: x - (dx || 1) * range(4, 14), y: y + range(-12, 12), ux: -(dx || 1), uy: 0, size: range(10, 22), life: 0.25, ramp: DASHR }); fxs.push(blowFx(x, y, DASHR, false)); },
    },
    // Globs of mud flung at the foe (the shot), splattering it.
    "mud-shot": {
      shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.35); if (rand() < 0.5) add({ k: "drop", x: x - dx * 4, y, vx: -dx * 20 + range(-15, 15), vy: -range(10, 40), g: 320, life: 0.4, ramp: MUD, gy: y + 12 });
        queued.push((L) => { for (let i = 0; i < 5; i++) { const bx = x - dx * 4.5 * i + Math.sin(i * 2 + time * 20) * 1.5, by = y - dy * 4.5 * i + Math.cos(i * 3 + time * 17) * 1, r = 5 - i * 0.8; L.f.disc(bx, by, r + 0.8, MUD[5]); L.f.disc(bx, by, r, MUD[i ? 3 : 2]); L.f.disc(bx - r * 0.3, by - r * 0.35, r * 0.4, MUD[1]); } }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; for (let i = 0; i < 14; i++) { const a = range(0, TAU), sp = range(40, 100); add({ k: "drop", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 320, life: range(0.4, 0.7), ramp: MUD, gy }); } timed(1.0, (L, t) => { for (let i = 0; i < 5; i++) L.b.disc(x + (i - 2) * 4, gy + (i % 2), 2.5, MUD[3], 1 - t); }); },
    },
    // A sphere of psychic light sent ahead (the shot); where it lands, a pillar of light falls on the foe from above.
    "future-sight": {
      shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { orbAt(L, x, y, 4 + Math.sin(time * 12), FSIGHT); rings(L.f, x, y, 7, 7, FSIGHT[2], 0.6); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), top = Math.max(0, y - 90); timed(0.6, (L, t) => { const k = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.5; for (let yy = top; yy < y + 6; yy++) { const w = 6 * k * (0.8 + 0.2 * Math.sin(yy * 0.3 + time * 30)); for (let o = -w; o <= w; o += 0.5) L.f.dot(x + o, yy, FSIGHT[Math.abs(o) < w * 0.35 ? 0 : Math.abs(o) < w * 0.7 ? 2 : 4], k); } L.l.glow(x, y, 24, FSIGHT[3], 0.7 * k); }); },
    },
    // It sings: musical notes float out to the foe (the shot); the sleep is the status's own Zs.
    sing: { shot({ x: wx, y: wy }) {
      const [x, y] = toPx(wx, wy - 0.45);
      queued.push((L) => { for (let i = 0; i < 3; i++) { const nx = x - i * 6, ny = y + Math.sin(time * 8 + i * 2) * 3, c = NOTES[i === 1 ? 2 : 3]; L.f.disc(nx, ny + 3, 1.6, c); for (let k = 0; k < 6; k++) L.f.set(nx + 1.5, ny + 3 - k, c); L.f.set(nx + 2.5, ny - 2, c); L.f.set(nx + 3, ny - 1, c); } L.l.glow(x - 6, y, 12, NOTES[3], 0.4); });
      return true;
    } },
    // It roars: rings of sound burst out to the pulse's reach.
    uproar: { pulse({ side, x: wx, y: wy, r }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX; timed(0.6, (L) => {}, (t, dt) => { for (let i = 0; i < 3; i++) if (t > i * 0.12 && t - dt <= i * 0.12) fxs.push(floorRing(cx, cy, RAMP.normal, 0.45, R)); }); timed(0.5, (L, t) => { for (let i = 0; i < 3; i++) { const u = (t - i * 0.1) / 0.35; if (u > 0 && u < 1) L.f.ring(cx, cy, 6 + u * R * 0.7, 1.5, RAMP.normal[i % 2 ? 1 : 0], 1 - u, 0.8); } }); } },
    // Sticky white silk sprayed out round it to the pulse's reach.
    "string-shot": { pulse({ side, x: wx, y: wy, r, fx: fwx, fy: fwy }) {
      const [cx, cy] = at(side, wx, wy), R = r * BODY_PX, a0 = fwx != null ? Math.atan2(fwy - wy, fwx - wx) : 0;
      const threads = Array.from({ length: 7 }, (_, i) => ({ a: a0 + (i - 3) * 0.28, l: R * range(0.7, 1), w: range(-3, 3) }));
      timed(0.8, (L, t) => { const u = smooth(0, 0.2, t), k = 1 - smooth(0.5, 0.8, t); for (const th of threads) for (let d = 0; d < th.l * u; d += 1) { const o = Math.sin(d * 0.2) * th.w; L.f.dot(cx + Math.cos(th.a) * d - Math.sin(th.a) * o, cy + Math.sin(th.a) * d * 0.6 + Math.cos(th.a) * o, SILK[d % 6 < 3 ? 0 : 2], k); } });
    } },
    // It stamps: a ring of raised earth runs out to the pulse's reach, throwing dust.
    bulldoze: { pulse({ x: wx, y: wy, r }) {
      const [cx, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX;
      timed(0.7, (L, t) => { const u = smooth(0, 0.5, t), rr = 4 + u * R, k = 1 - smooth(0.4, 0.7, t); L.b.ring(cx, gy - 1, rr, 3, EARTHC[1], k, 0.42); L.b.ring(cx, gy + 1, rr - 2, 2, EARTHC[4], k, 0.42); for (let q = 0; q < TAU; q += 0.6) if (rand() < 0.15) add({ k: "dust", x: cx + Math.cos(q) * rr, y: gy + Math.sin(q) * rr * 0.42, vx: Math.cos(q) * 20, vy: -range(4, 12), drag: 4, life: 0.5, size: 2, front: false }); });
    } },
    // Its body hardens: a white-silver edge and a shine sweeping across it.
    harden: { fire({ side }) { timed(0.6, (L, t) => { const k = smooth(0, 0.08, t) * (1 - smooth(0.4, 0.6, t)); edgeLit(L, bodies[side], STEELW, k, 9); steelTop(L, bodies[side], k * 0.6); }); } },
    // It curls up: a white ring closes in on it and it glows for a beat.
    "defense-curl": { fire({ side, x: wx, y: wy }) { timed(0.55, (L, t) => { const [cx, cy] = at(side, wx, wy), u = smooth(0, 0.3, t), k = 1 - smooth(0.35, 0.55, t); L.f.ring(cx, cy, 22 - 12 * u, 1.5, RAMP.normal[0], k); auraOn(L, bodies[side], TDOWN, k * 0.5, 0, 0); }); } },
  });
  /* ---------- batch 7 (2026-10-30): twenty more ---------- */
  // A sharp stone spike jutting out of the floor, lit on one face (Stone Edge), `g` how far up.
  function spike(L, x, gy, h, w, g, C, lean = 0) {
    const H2 = h * g;
    for (let yy = 0; yy < H2; yy++) { const u = yy / h, hw = w * (1 - u) + 0.3, cx = x + lean * yy; for (let xx = Math.floor(cx - hw); xx <= Math.ceil(cx + hw); xx++) { const rel = (xx + 0.5 - cx) / hw; if (Math.abs(rel) <= 1) L.f.set(xx, gy - yy, Math.abs(rel) > 0.75 ? C[6] : rel < -0.3 ? C[2] : rel < 0.25 ? C[3] : C[4]); } if (yy > H2 - 2) L.f.set(cx, gy - yy, C[0]); }
    L.l.glow(x, gy - H2 / 2, w * 3, C[2], 0.4 * g);
  }
  // A crescent cut drawn per pixel (Night Slash, Leaf Blade, Aerial Ace): `t` its age, swept in 0.06 s and faded by 0.35.
  function crescentCut(L, x, y, a, r, t, C) {
    const reach = Math.min(1, t / 0.06), fade = t < 0.1 ? 1 : 1 - (t - 0.1) / 0.25;
    if (fade <= 0) return;
    for (let q = -1.2; q <= -1.2 + 2.4 * reach; q += 0.02) { const th = 3 * Math.sin(((q + 1.2) / 2.4) * Math.PI); for (let o = 0; o <= th; o += 0.5) L.f.dot(x + Math.cos(a + q) * (r - o), y + Math.sin(a + q) * (r - o) * 0.8, o < 1 ? C[0] : o < 2 ? C[2] : C[3], fade); }
    L.l.glow(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, r, C[3], 0.5 * fade);
  }
  // A whole body turned to steel: silver, a dark rim, a shine sweeping it (Iron Defense).
  function steelBody(L, b, k) {
    if (!b || k <= 0.02) return;
    const [x0, y0] = origin(b), on = maskAt(b), sweep = ((time * 1.4) % 1) * (b.w + b.h) - 5;
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (on(i, j)) { const edge = !on(i - 1, j) || !on(i + 1, j) || !on(i, j - 1) || !on(i, j + 1); L.f.dot(x0 + i, y0 + j, Math.abs(i + j - sweep) < 2 ? STEELW[0] : edge ? STEELW[6] : j < b.h * 0.3 ? STEELW[3] : j < b.h * 0.65 ? STEELW[4] : STEELW[5], k); }
    L.l.glow(x0 + b.w / 2, y0 + b.h / 2, b.w, STEELW[2], 0.4 * k);
  }
  // The body's own silhouette in a ramp, left behind as it moves (Agility's afterimages).
  function ghostAt(L, b, x0, y0, C, k) { const on = maskAt(b); for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (on(i, j)) L.b.dot(x0 + i, y0 + j, (i + j) % 3 ? C[3] : C[2], k); }
  Object.assign(SIG, {
    // Sharp stones jut out of the floor where it strikes, glowing pale blue, and crumble.
    // Under the foe, after the blow's flash: they rise round it (drawn behind as well as in front, so the foe stands among them).
    "stone-edge": { hit({ x: wx, y: wy }) {
      const [x] = toPx(wx, wy), gy = toPx(0, wy + 0.42)[1], D = 0.1;
      const sp = [[-13, 22, 4.5, -0.12, 1], [0, 34, 6, 0, 0], [12, 26, 5, 0.12, 1], [-6, 16, 3.5, -0.2, 0], [7, 17, 3.5, 0.2, 0], [-19, 12, 3, -0.25, 1], [18, 13, 3, 0.25, 1]];
      for (let i = 0; i < 12; i++) add({ k: "chunk", x: x + range(-14, 14), y: gy - 2, vx: range(-60, 60), vy: -range(60, 130), g: 380, life: range(0.5, 0.9), ramp: STONEB, gy, delay: D });
      timed(0.85 + D, (L, t) => { const u = t - D; if (u < 0) return; const g = Math.min(1, outBack(u / 0.08, 1.8)) * (1 - smooth(0.55, 0.85, u)); for (const [ox, h, w, lean, back] of sp) spike(back ? { ...L, f: L.b } : L, x + ox, gy + (back ? -3 : 2), h, w, g, STONEB, lean); });
    } },
    // It bites with glowing light green jaws.
    "bug-bite": { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.25); timed(0.3, (L, t) => jawsAt(L, x, y, t, BUGG), (t, dt) => { if (t > 0.17 && t - dt <= 0.17) for (let i = 0; i < 8; i++) { const a = range(0, TAU), sp = range(50, 120); add({ k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.15, 0.3), ramp: BUGG }); } }); } },
    // Its claw glows dark and it cuts a black-violet crescent through the foe.
    "night-slash": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 0.9), a = Math.atan2(dy, dx); timed(0.4, (L, t) => { crescentCut(L, x, y, a, 15, t, NIGHT); crescentCut(L, x - dx * 3, y, a, 11, t - 0.04, NIGHT); }); } },
    // Its arm glows purple and jabs: a poison spike stabbing in, bubbles off the foe.
    "poison-jab": {
      fire({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx + dx * 0.4, wy - 0.35 + dy * 0.4); timed(0.25, (L, t) => { const u = Math.min(1, t / 0.08), k = 1 - smooth(0.12, 0.25, t), len = 18 * u; for (let d = 0; d < len; d += 0.5) { const w = 2.2 * (1 - d / 18) + 0.3; for (let o = -w; o <= w; o += 0.5) L.f.dot(x + dx * d - dy * o, y + dy * d + dx * o, d > len - 3 ? POISONJ[0] : Math.abs(o) < w * 0.4 ? POISONJ[1] : POISONJ[3], k); } L.l.glow(x + dx * len, y + dy * len, 10, POISONJ[3], 0.5 * k); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); for (let i = 0; i < 8; i++) add({ k: "bubble", x: x + range(-6, 6), y: y + range(-4, 4), vy: -range(10, 30), sway: 20, life: range(0.5, 0.9), size: range(1, 2.2), ramp: POISONJ }); },
    },
    // Its wings buzz: red sound waves ripple out to the pulse's reach.
    "bug-buzz": { pulse({ side, x: wx, y: wy, r }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX; timed(0.7, (L, t) => { for (let i = 0; i < 4; i++) { const u = (t - i * 0.1) / 0.45; if (u <= 0 || u >= 1) continue; const rr = 6 + u * R * 0.8; for (let q = 0; q < TAU; q += 0.06) { const j = Math.sin(q * 10 + time * 40) * 1.5; L.f.dot(cx + Math.cos(q) * (rr + j), cy + Math.sin(q) * (rr + j) * 0.7, BUZZ[i % 2 ? 2 : 3], 1 - u); } } L.l.glow(cx, cy, 16, BUZZ[3], 0.4 * (1 - t / 0.7)); }); } },
    // Its leaf-arm glows green and it cuts a long green crescent.
    "leaf-blade": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 0.9), a = Math.atan2(dy, dx); for (let i = 0; i < 6; i++) add({ k: "leaf", x, y, vx: range(-40, 40), vy: -range(10, 40), g: 60, drag: 2, life: range(0.6, 1), a: range(0, TAU), va: range(-8, 8), ramp: RAMP.grass, delay: 0.06 }); timed(0.45, (L, t) => crescentCut(L, x, y, a, 18, t, LEAFB)); } },
    // It moves so fast it leaves glowing orange afterimages of itself.
    agility: { fire({ side }) { const b = bodies[side]; if (!b) return; const [x0, y0] = origin(b); timed(0.7, (L, t) => { const k = 1 - smooth(0.3, 0.7, t); for (let i = 1; i <= 3; i++) ghostAt(L, b, x0 + Math.sin(time * 30 + i * 2) * i * 4, y0, AGIL, k * (1 - i / 4)); auraOn(L, bodies[side], AGIL, k * 0.6, 0, 1); }); } },
    // A jet of water from its mouth (the shot), splashing on the foe.
    "water-gun": {
      shot({ x: wx, y: wy, dx, dy }) { const V = RAMP.water, [x, y] = toPx(wx, wy - 0.35); if (rand() < 0.6) add({ k: "drop", x: x - dx * 6, y, vx: -dx * 20 + range(-20, 20), vy: -range(10, 50), g: 320, life: 0.4, ramp: V, gy: y + 12 }); queued.push((L) => { for (let d = 0; d < 16; d += 0.5) { const w = 2.4 * (1 - d / 20) + Math.sin(d * 0.8 - time * 40) * 0.4; for (let o = -w; o <= w; o += 0.5) L.f.set(x - dx * d - dy * o, y - dy * d + dx * o, Math.abs(o) < w * 0.35 ? V[0] : Math.abs(o) < w * 0.75 ? V[1] : V[3]); } L.l.glow(x, y, 10, V[3], 0.4); }); return true; },
      hit({ x: wx, y: wy }) { const V = RAMP.water, [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; for (let i = 0; i < 14; i++) { const a = range(0, TAU), sp = range(40, 110); add({ k: "drop", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 320, life: range(0.4, 0.7), ramp: V, gy }); } },
    },
    // It thrashes about in a rage, wrapped in red: blows land all around the foe.
    thrash: {
      fire({ side }) { timed(0.5, (L, t) => auraOn(L, bodies[side], RAGE, 1 - smooth(0.3, 0.5, t), 0.5, 1)); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 3; i++) { const ox = range(-10, 10), oy = range(-10, 6); timed(0.3 + i * 0.09, (L, t) => { const u = t - i * 0.09; if (u >= 0) powStar(L, x + ox, y + oy, u * 1.2); }); } },
    },
    // The gem on its head glows, and it fires a burst of glittering gems (the shot).
    "power-gem": { shot({ x: wx, y: wy, dx, dy }) {
      const [x, y] = toPx(wx, wy - 0.4);
      queued.push((L) => { for (let i = 0; i < 6; i++) { const bx = x - dx * i * 3.5 + Math.sin(i * 2.3 + time * 10) * 2, by = y - dy * i * 3.5 + Math.cos(i * 1.7 + time * 9) * 2, r = 3 - i * 0.35; for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (Math.abs(xx) + Math.abs(yy) <= r) L.f.set(bx + xx, by + yy, Math.abs(xx) + Math.abs(yy) > r - 1 ? GEMS[4] : xx + yy < 0 ? GEMS[1] : GEMS[3]); } sparkle(L.f, x, y, 3, GEMS[0], GEMS[2]); L.l.glow(x, y, 14, GEMS[3], 0.5); });
      return true;
    } },
    // A cloud of yellow spores drifting to the foe (the shot); the paralysis is the status's own crackle.
    "stun-spore": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); if (rand() < 0.8) add({ k: "mote", x: x + range(-6, 6), y: y + range(-5, 5), vx: range(-10, 10), vy: range(-6, 10), drag: 2, life: range(0.5, 0.9), ramp: SPORE }); queued.push((L) => { for (let i = 0; i < 18; i++) { const a = i * 2.4 + time * 2, d = 2 + (i % 6) * 1.2; L.f.dot(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, SPORE[i % 3 ? 2 : 1], 1); } L.l.glow(x, y, 10, SPORE[3], 0.3); }); return true; } },
    // It glows white and strikes faster than the eye: a white streak along its path and a crescent cut on the foe.
    "aerial-ace": {
      fire({ side, x: wx, y: wy }) { const [x0, y0] = at(side, wx, wy); timed(0.35, (L, t) => { const [x1, y1] = at(side, wx, wy), k = 1 - smooth(0.2, 0.35, t); for (let o = -1; o <= 1; o++) L.f.line(x0, y0 + o * 2, x1, y1 + o * 2, o ? DASHR[2] : RAMP.normal[0], k); edgeLit(L, bodies[side], RAMP.normal, k, 13); }); },
      hit({ x: wx, y: wy, dx }) { const [x, y] = toPx(wx, wy - 0.4); timed(0.4, (L, t) => crescentCut(L, x, y, (dx || 1) > 0 ? -0.6 : Math.PI + 0.6, 16, t, AIRB)); },
    },
    // Wrapped in swirling violet and orange energy it charges with all its might; a huge burst on impact.
    "giga-impact": {
      fire({ side }) { timed(0.55, (L, t) => { const b = bodies[side], k = 1 - smooth(0.4, 0.55, t); auraOn(L, b, GIGA, k, 0.6, 1); if (!b) return; const [cx, cy] = centreOf(b); for (let i = 0; i < 2; i++) for (let q = 0; q < TAU; q += 0.08) { const a = q + time * (i ? -9 : 9), r = b.w * 0.6 + i * 4; L.f.dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, GIGA[i ? 4 : 2], k * (0.5 + 0.5 * Math.sin(q * 3))); } }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, GIGA, true)); timed(0.5, (L, t) => { for (let i = 0; i < 2; i++) { const u = (t - i * 0.08) / 0.35; if (u > 0 && u < 1) L.f.ring(x, y, 6 + u * 40, 2.5, GIGA[i ? 4 : 2], 1 - u); } }); for (let i = 0; i < 16; i++) { const a = range(0, TAU), sp = range(60, 160); add({ k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.2, 0.4), ramp: GIGA }); } },
    },
    // Flames engulf it as it charges in.
    "flame-charge": { fire({ side }) { timed(0.5, (L, t) => edgeFlames(L, bodies[side], HEAT, 1 - smooth(0.3, 0.5, t), 0, 1, 1.3)); } },
    // Its claws glow silver and slash: three bright metal streaks.
    "metal-claw": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2 - 0.5; timed(0.45, (L, t) => streaks(L, x, y, a, t, STEELW, 3, 5, 14)); } },
    // Its whole body turns to gleaming steel.
    "iron-defense": { fire({ side }) { timed(0.7, (L, t) => steelBody(L, bodies[side], smooth(0, 0.08, t) * (1 - smooth(0.5, 0.7, t)))); } },
    // It rampages wrapped in a blazing red aura, its eyes glowing.
    outrage: {
      fire({ side, x: wx, y: wy }) { const [ex, ey] = eyesAt(side, wx, wy); timed(0.6, (L, t) => { const k = 1 - smooth(0.4, 0.6, t); edgeFlames(L, bodies[side], RAGE, k, 0, 1, 1.4); L.f.set(ex - 2, ey, RAGE[1]); L.f.set(ex + 2, ey, RAGE[1]); L.l.glow(ex, ey, 8, RAGE[3], 0.8 * k); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, RAGE, true)); },
    },
    // Its foot glows and it stomps down on the foe: a big impact and a ring through the floor.
    stomp: { hit({ x: wx, y: wy }) {
      const [x, y] = toPx(wx, wy - 0.6), gy = toPx(0, wy + 0.42)[1];
      timed(0.6, (L, t) => { const drop = Math.min(1, t / 0.08), k = 1 - smooth(0.25, 0.45, t); if (k > 0) { const fy = y - 14 * (1 - drop); L.f.disc(x, fy, 6, RAMP.normal[3], k); L.f.disc(x, fy, 4.5, RAMP.normal[1], k); for (const ox of [-4, 0, 4]) L.f.disc(x + ox, fy + 5, 1.6, RAMP.normal[0], k); } if (t > 0.08) { const u = (t - 0.08) / 0.4; if (u < 1) L.b.ring(x, gy, 4 + u * 30, 2.5, DUSTR[0], 1 - u, 0.4); } });
      for (let i = 0; i < 12; i++) { const a = range(0, TAU); add({ k: "dust", x: x + Math.cos(a) * 6, y: gy - 1, vx: Math.cos(a) * range(30, 70), vy: -range(4, 14), drag: 4, life: 0.6, size: range(1.8, 2.8), front: false, delay: 0.08 }); }
    } },
    // A whirling tornado flung at the foe (the shot), spinning debris round it.
    hurricane: { shot({ x: wx, y: wy }) {
      const [x, y] = toPx(wx, wy + 0.3);
      queued.push((L) => { for (let yy = 0; yy < 30; yy++) { const u = yy / 30, r = 3 + u * 9, sway = Math.sin(yy * 0.2 + time * 8) * 2 * u; for (let q = 0; q < TAU; q += 0.35) { const a = q + time * 14 - yy * 0.3, px2 = x + sway + Math.cos(a) * r, front = Math.sin(a) > 0; if ((yy + Math.floor(q * 3)) % 3 === 0) (front ? L.f : L.b).dot(px2, y - yy + Math.sin(a) * r * 0.25, WINDC[front ? 1 : 3], 0.9); } } L.l.glow(x, y - 15, 18, WINDC[3], 0.3); });
      return true;
    } },
  });
  /* ---------- batch 8 (2026-10-30): twenty more ---------- */
  // A five-point star drawn per pixel (Last Resort, Dazzling Gleam's sparkles).
  function starAt(L, x, y, r, a, C, k = 1) {
    for (let py = Math.floor(y - r - 1); py <= y + r + 1; py++) for (let px2 = Math.floor(x - r - 1); px2 <= x + r + 1; px2++) {
      const dx = px2 + 0.5 - x, dy = py + 0.5 - y, d = Math.hypot(dx, dy), q = ((Math.atan2(dy, dx) - a) / TAU * 5 % 1 + 1) % 1, edge = r * (0.45 + 0.55 * Math.abs(q - 0.5) * 2);
      if (d <= edge) L.f.dot(px2, py, d > edge - 1 ? C[4] : d < r * 0.3 ? C[0] : C[2], k);
    }
  }
  // A jagged sound ring (Hyper Voice): a ring whose radius zig-zags.
  function zigRing(buf, x, y, r, C, k, sy = 0.75) { for (let q = 0; q < TAU; q += 0.04) { const rr = r + ((Math.floor(q * 12) & 1) ? 2 : -1); buf.dot(x + Math.cos(q) * rr, y + Math.sin(q) * rr * sy, C, k); } }
  Object.assign(SIG, {
    // A blur of punches and kicks: a fighting aura, then a flurry of blows all over the foe, the last the biggest.
    "close-combat": {
      fire({ side }) { timed(0.35, (L, t) => auraOn(L, bodies[side], FIGHTR, 1 - smooth(0.2, 0.35, t), 0.6, 1)); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 5; i++) { const ox = range(-10, 10), oy = range(-10, 6), t0 = i * 0.06; timed(t0 + 0.4, (L, t) => { if (t >= t0) powStar(L, x + ox, y + oy, (t - t0) * (i === 4 ? 0.9 : 1.4)); }); } for (let i = 0; i < 8; i++) add({ k: "line", x: x + range(-14, 14), y: y + range(-12, 12), ux: range(-1, 1), uy: range(-1, 1), size: range(6, 12), life: 0.25, ramp: FIGHTR, delay: range(0, 0.25) }); },
    },
    // A tail glowing teal-violet sweeps in a wide arc and flings the foe away.
    "dragon-tail": {
      fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 0.8), a = Math.atan2(dy, dx); timed(0.45, (L, t) => { crescentCut(L, x, y, a, 20, t, DPULSE); crescentCut(L, x, y, a, 15, t - 0.03, DCLAW); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, DPULSE, true)); },
    },
    // Hard seeds hurled at the foe, each bursting in a green pop.
    "seed-bomb": {
      fire({ side, x: wx, y: wy, dx, dy }) { const [sx2, sy2] = at(side, wx, wy), [tx, ty] = reachOf(wx, wy, dx, dy, 1.3); const seeds = [0, 1, 2, 3].map((i) => ({ t0: i * 0.05, ox: range(-6, 6), oy: range(-5, 5), h: range(10, 18) })); timed(0.4, (L, t) => { for (const sd of seeds) { const u = (t - sd.t0) / 0.18; if (u <= 0 || u >= 1) continue; const x = sx2 + (tx + sd.ox - sx2) * u, y = sy2 + (ty + sd.oy - sy2) * u - Math.sin(Math.PI * u) * sd.h; L.f.disc(x, y, 2.4, RAMP.grass[4]); L.f.disc(x - 0.5, y - 0.5, 1.4, RAMP.grass[2]); L.f.set(x - 1, y - 1, RAMP.grass[0]); } }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 4; i++) { const ox = range(-9, 9), oy = range(-8, 6), t0 = i * 0.05; timed(t0 + 0.35, (L, t) => { const u = t - t0; if (u < 0) return; const k = 1 - u / 0.3; if (k <= 0) return; L.f.disc(x + ox, y + oy, 6 * (1 - k) + 2, RAMP.grass[u < 0.06 ? 0 : 2], k); L.f.ring(x + ox, y + oy, 3 + u * 30, 1, RAMP.grass[1], k); }); for (let j = 0; j < 3; j++) add({ k: "smoke", x: x + ox, y: y + oy, vx: range(-10, 10), vy: -range(5, 15), life: 0.5, size: 2, smoke: [RAMP.grass[3], RAMP.grass[4], RAMP.grass[5], RAMP.grass[6]], delay: t0 }); } },
    },
    // A cloud of pale blue-green sleep powder drifting to the foe (the shot); the sleep is the status's own Zs.
    "sleep-powder": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); if (rand() < 0.8) add({ k: "mote", x: x + range(-7, 7), y: y + range(-5, 5), vx: range(-10, 10), vy: range(-4, 12), drag: 2, life: range(0.6, 1), ramp: SLEEPR }); queued.push((L) => { for (let i = 0; i < 22; i++) { const a = i * 2.4 + time * 1.6, d = 2 + (i % 7) * 1.1; L.f.dot(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, SLEEPR[i % 3 ? 2 : 1], 1); } L.l.glow(x, y, 11, SLEEPR[3], 0.35); }); return true; } },
    // A shattering shout: jagged rings of sound blast out to the pulse's reach, lines of force between them.
    "hyper-voice": { pulse({ side, x: wx, y: wy, r }) {
      const [cx, cy] = at(side, wx, wy), R = r * BODY_PX;
      timed(0.6, (L, t) => { for (let i = 0; i < 4; i++) { const u = (t - i * 0.08) / 0.4; if (u <= 0 || u >= 1) continue; zigRing(L.f, cx, cy, 6 + u * R, VOICE[i % 2 ? 2 : 0], 1 - u); } for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.3, u = smooth(0, 0.3, t), k = 1 - smooth(0.25, 0.5, t); L.f.line(cx + Math.cos(a) * (8 + u * R * 0.4), cy + Math.sin(a) * (8 + u * R * 0.4) * 0.75, cx + Math.cos(a) * (14 + u * R * 0.7), cy + Math.sin(a) * (14 + u * R * 0.7) * 0.75, VOICE[3], k); } L.l.glow(cx, cy, R * 0.5, VOICE[3], 0.4 * (1 - t / 0.6)); });
    } },
    // A dazzling flash of pink-white light: rays out to the pulse's reach and sparkles scattered through it.
    "dazzling-gleam": { pulse({ side, x: wx, y: wy, r }) {
      const [cx, cy] = at(side, wx, wy), R = r * BODY_PX, stars = Array.from({ length: 10 }, () => [range(0, TAU), range(0.3, 1), range(2, 4)]);
      timed(0.7, (L, t) => { const k = t < 0.08 ? t / 0.08 : 1 - smooth(0.25, 0.7, t); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + time * 0.8, l = R * (0.6 + 0.4 * ((i & 1) ? 1 : 0.6)) * smooth(0, 0.2, t); L.f.line(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.75, GLEAM[i & 1 ? 2 : 0], k * 0.8); } for (const [a, d, r2] of stars) starAt(L, cx + Math.cos(a) * d * R * smooth(0, 0.25, t), cy + Math.sin(a) * d * R * 0.75 * smooth(0, 0.25, t), r2, time * 3, GLEAM, k); L.f.disc(cx, cy, 6 * k, GLEAM[0], k); L.l.glow(cx, cy, R * 0.8, GLEAM[3], 0.6 * k); });
    } },
    // It glows white and charges with everything it has left: stars burst off it and off the foe.
    "last-resort": {
      fire({ side }) { timed(0.45, (L, t) => { const b = bodies[side], k = 1 - smooth(0.3, 0.45, t); edgeLit(L, b, STARW, k, 5); auraOn(L, b, STARW, k * 0.6, 0.4, 1); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); fxs.push(blowFx(x, y, STARW, true)); const st = Array.from({ length: 7 }, () => [range(0, TAU), range(40, 90)]); timed(0.6, (L, t) => { for (const [a, sp] of st) starAt(L, x + Math.cos(a) * sp * t, y + Math.sin(a) * sp * t - 20 * t, 3.5 * (1 - t / 0.6) + 0.5, t * 8, STARW, 1 - smooth(0.4, 0.6, t)); }); },
    },
    // Glowing leaves of many colours that seek the foe (the shot).
    "magical-leaf": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), R3 = [LEAFB, GEMS, SPORE, AMNES]; queued.push((L) => { for (let i = 0; i < 4; i++) { const a = time * 7 + (i * TAU) / 4; leafAt(L, x + Math.cos(a) * 6, y + Math.sin(a) * 4, time * 20 + i, 3, R3[i]); } L.l.glow(x, y, 12, GEMS[3], 0.4); }); return true; } },
    // Its mind empties: a soft blue glow, a ring round its head and thought-bubbles rising off it.
    amnesia: { fire({ side, x: wx, y: wy }) { const [hx, hy] = eyesAt(side, wx, wy); for (let i = 0; i < 3; i++) add({ k: "bubble", x: hx + 4 + i * 3, y: hy - 6 - i * 4, vy: -12, sway: 6, life: 0.8, size: 1 + i * 0.6, ramp: AMNES, delay: i * 0.12 }); timed(0.7, (L, t) => { const k = 1 - smooth(0.45, 0.7, t); auraOn(L, bodies[side], AMNES, k * 0.7, 0, 1); oval(L.f, hx, hy - 4, 9, 3, AMNES[1], k); L.l.glow(hx, hy, 12, AMNES[3], 0.4 * k); }); } },
    // It spins at high speed: white rings whirling round its body as it shoots forward.
    "rapid-spin": { fire({ side }) { timed(0.45, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b), k = 1 - smooth(0.3, 0.45, t); for (let i = 0; i < 3; i++) for (let q = 0; q < TAU; q += 0.1) { const a = q + time * 30 + i * 2, rr = b.w * 0.5 + i * 3, front = Math.sin(a) > 0; if ((Math.floor(q * 4) & 1) === 0) (front ? L.f : L.b).dot(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.35 + (i - 1) * 5, i === 1 ? RAMP.normal[0] : DASHR[2], k); } }); } },
    // Waves of psychic energy take shape as solid shards (the shot), which pierce the foe.
    psyshock: {
      shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 3; i++) { const a = time * 9 + (i * TAU) / 3; orbAt(L, x + Math.cos(a) * 5, y + Math.sin(a) * 4, 2.2, PSYSH); } rings(L.f, x, y, 9, 7, PSYSH[2], 0.6); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); const sh = Array.from({ length: 6 }, (_, i) => (i / 6) * TAU + range(-0.2, 0.2)); timed(0.35, (L, t) => { const u = Math.min(1, t / 0.12), k = 1 - smooth(0.15, 0.35, t); for (const a of sh) { const d = 20 * (1 - u) + 3; for (let j = 0; j < 7; j++) L.f.dot(x + Math.cos(a) * (d + j), y + Math.sin(a) * (d + j), j < 2 ? PSYSH[0] : PSYSH[3], k); } L.l.glow(x, y, 14, PSYSH[3], 0.6 * k); }); },
    },
    // A ball of salt water (the shot), crusted with white salt crystals, splashing salt and spray.
    brine: {
      shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), r = 4.5; queued.push((L) => { L.f.disc(x, y, r + 0.8, BRINE[5]); L.f.disc(x, y, r, BRINE[3]); L.f.disc(x - 1, y - 1, r * 0.5, BRINE[1]); for (let i = 0; i < 6; i++) { const a = i * 1.1 + time * 5; L.f.set(x + Math.cos(a) * r, y + Math.sin(a) * r, BRINE[0]); } L.l.glow(x, y, r * 3, BRINE[3], 0.4); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; for (let i = 0; i < 14; i++) { const a = range(0, TAU), sp = range(40, 110); add({ k: rand() < 0.4 ? "shard" : "drop", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 320, life: range(0.4, 0.7), size: 1, a: range(0, TAU), ramp: BRINE, gy }); } },
    },
    // Light pours down onto it: green-gold motes rising, its body glowing as it heals.
    synthesis: { fire({ side, x: wx, y: wy }) { const [cx, cy] = at(side, wx, wy); for (let i = 0; i < 14; i++) add({ k: "mote", x: cx + range(-10, 10), y: cy + range(-6, 10), vy: -range(15, 30), sway: 15, life: range(0.6, 1), ramp: SYNTH, delay: i * 0.03 }); timed(0.8, (L, t) => { const k = 1 - smooth(0.55, 0.8, t); for (let i = 0; i < 5; i++) L.f.line(cx - 24 + i * 12, cy - 70, cx + (i - 2) * 3, cy - 6, SUNR[2], 0.3 * k); auraOn(L, bodies[side], SYNTH, k * 0.8, 0, 1); }); } },
    // A dark shroud round it as it turns the foe's own strength back on it: the foe outlined in darkness, a dark burst.
    "foul-play": {
      fire({ side }) { timed(0.35, (L, t) => auraOn(L, bodies[side], FOUL, 1 - smooth(0.2, 0.35, t), 0, -1)); },
      hit({ side, x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, FOUL, true)); timed(0.45, (L, t) => { const k = 1 - t / 0.45; outline(L, bodies[side], FOUL[1], k); auraOn(L, bodies[side], FOUL, k * 0.7, 0, -1); }); },
    },
    // Three quick white scratch marks.
    scratch: { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2 + 0.35; timed(0.35, (L, t) => streaks(L, x, y, a, t, RAMP.normal, 3, 3.5, 8)); } },
    // It summons its full strength - a towering red aura - and the blow shakes the floor.
    superpower: {
      fire({ side }) { const b = bodies[side]; if (b) { const [x0, y0] = origin(b); for (let i = 0; i < 6; i++) add({ k: "chev", x: x0 + b.w * (0.15 + 0.7 * rand()), y: y0 + b.h * 0.8, vy: -range(24, 40), life: 0.6, up: true, ramp: FIGHTR, delay: i * 0.05 }); } timed(0.5, (L, t) => edgeFlames(L, bodies[side], FIGHTR, 1 - smooth(0.3, 0.5, t), 0, 1, 1.5)); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; fxs.push(blowFx(x, y, FIGHTR, true)); timed(0.5, (L, t) => { const u = t / 0.5; L.b.ring(x, gy, 6 + u * 40, 2.5, FIGHTR[2], 1 - u, 0.4); }); },
    },
    // It rubs its electrified cheeks against the foe: a crackle, small sparks and a heart.
    nuzzle: { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.45); fxs.push(crackleFx(x, y, RAMP.electric, 0.35)); for (let i = 0; i < 2; i++) add({ k: "heart", x: x + range(-6, 6), y: y - 4, vy: -range(14, 24), sway: 10, life: 0.7, ramp: GLEAM, delay: i * 0.1 }); for (let i = 0; i < 6; i++) { const a = range(0, TAU), sp = range(40, 90); add({ k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.12, 0.25), ramp: RAMP.electric }); } } },
    // Nimble flips: a zig-zag trail of light blue behind it to the foe.
    acrobatics: {
      fire({ side, x: wx, y: wy }) { const trail = []; timed(0.45, (L, t) => { const k = 1 - smooth(0.25, 0.45, t); for (let i = 1; i < trail.length; i++) { const [ax, ay] = trail[i - 1], [bx, by] = trail[i], z1 = (i - 1) % 2 ? 6 : -6, z2 = i % 2 ? 6 : -6; L.f.line(ax, ay + z1, bx, by + z2, i % 2 ? AIRB[1] : AIRB[3], k * (i / trail.length)); } }, (t) => { if (t < 0.3 && Math.floor(t * 40) % 2 === 0) trail.push(at(side, wx, wy).slice(0, 2)); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, AIRB, false)); timed(0.35, (L, t) => streaks(L, x, y, -0.8, t, AIRB, 2, 6, 12)); },
    },
    // It strikes and wheels straight back: a green U-shaped trail.
    "u-turn": {
      fire({ side, x: wx, y: wy }) { const trail = []; timed(0.7, (L, t) => { const k = 1 - smooth(0.45, 0.7, t); for (let i = 1; i < trail.length; i++) { const [ax, ay] = trail[i - 1], [bx, by] = trail[i]; L.f.line(ax, ay, bx, by, BUGG[2], k); L.f.line(ax, ay + 1, bx, by + 1, BUGG[4], k * 0.8); } }, (t) => { if (t < 0.6) trail.push(at(side, wx, wy).slice(0, 2)); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, BUGG, false)); },
    },
  });
  /* ---------- batch 9 (2026-10-30): thirty-seven more ---------- */
  // A blob of liquid with drips (Venoshock, Belch's gas uses `puff`).
  function blob(L, x, y, r, C, wob = 1) { for (let py = Math.floor(y - r - 2); py <= y + r + 2; py++) for (let px2 = Math.floor(x - r - 2); px2 <= x + r + 2; px2++) { const dx = px2 + 0.5 - x, dy = py + 0.5 - y, a = Math.atan2(dy, dx), rr = r * (1 + 0.15 * wob * Math.sin(a * 5 + time * 12)), d = Math.hypot(dx, dy); if (d <= rr) L.f.set(px2, py, d > rr - 1 ? C[5] : dx + dy < -r * 0.4 ? C[1] : C[3]); } L.l.glow(x, y, r * 2.5, C[3], 0.4); }
  // A burst of matter: count particles of `k` thrown round a point.
  const spray2 = (k, x, y, n, ramp, a, b, extra = {}) => { for (let i = 0; i < n; i++) { const q = range(0, TAU), sp = range(a, b); add({ k, x, y, vx: Math.cos(q) * sp, vy: Math.sin(q) * sp - 20, drag: 2.5, life: range(0.4, 0.8), size: 2, ramp, a: range(0, TAU), va: range(-10, 10), ...extra }); } };
  // A drain: beads streaming from `from` to `to` (side bodies) for `life`.
  function drainBeads(fromSide, toSide, wf, ramp, life = 0.8) { timed(life, () => {}, (t) => { if (t > life - 0.2 || rand() > 0.8) return; const [bx, by] = at(fromSide, wf.x, wf.y), [ax, ay] = at(toSide, wf.ux, wf.uy), yy = by + range(-6, 6); add({ k: "mote", x: bx + range(-4, 4), y: yy, vx: (ax - bx) * 2.2, vy: (ay - yy) * 2.2, life: 0.45, ramp }); }); }
  Object.assign(SIG, {
    // A long pink tongue lashes out to the foe, a ghostly shiver where it licks.
    lick: { fire({ side, x: wx, y: wy, dx, dy }) { const [cx, cy] = at(side, wx, wy), [tx, ty] = reachOf(wx, wy, dx, dy, 1.2); timed(0.4, (L, t) => { const reach = t < 0.1 ? t / 0.1 : 1 - smooth(0.2, 0.4, t), p1 = [(cx + tx) / 2, Math.min(cy, ty) - 8 + Math.sin(time * 20) * 3]; let last = [cx, cy]; for (let q = 0; q <= reach; q += 0.02) { const [x, y] = bez([cx + dx * 6, cy], p1, [tx, ty], q); L.f.disc(x, y, 2 - q * 0.6, TONGUE[3]); L.f.set(x, y - 1, TONGUE[1]); last = [x, y]; } L.f.disc(last[0], last[1], 2.4, TONGUE[2]); }); }, hit({ side }) { timed(0.4, (L, t) => outline(L, bodies[side], GHOSTF[2], 1 - t / 0.4)); } },
    // Its shadow stretches across the floor to the foe and strikes up out of it.
    "shadow-sneak": {
      fire({ side, x: wx, y: wy, dx, dy }) { const [sx2, sy2] = toPx(wx, wy + 0.42), [tx, ty] = toPx(wx + dx * 2.2, wy + 0.42 + dy * 2.2); timed(0.5, (L, t) => { const u = smooth(0, 0.18, t), k = 1 - smooth(0.3, 0.5, t); for (let q = 0; q <= u; q += 0.01) { const x = sx2 + (tx - sx2) * q, y = sy2 + (ty - sy2) * q, w = 4 * (1 - q * 0.5); for (let o = -w; o <= w; o++) L.b.dot(x - dy * o, y + dx * o * 0.4, DARKP[q > u - 0.08 ? 3 : 5], k); } }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.2), gy = toPx(0, wy + 0.42)[1]; timed(0.45, (L, t) => { const u = Math.min(1, t / 0.12), k = 1 - smooth(0.25, 0.45, t); for (const ox of [-5, 0, 5]) { const h = (14 + Math.abs(ox)) * u; for (let yy = 0; yy < h; yy++) L.f.dot(x + ox + Math.sin(yy * 0.4 + ox) * 1.5, gy - yy, DARKP[yy > h - 3 ? 2 : 4], k); } L.l.glow(x, y, 14, DARKP[3], 0.5 * k); }); },
    },
    // A glob of poisonous liquid (the shot) splashing the foe in purple.
    venoshock: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); if (rand() < 0.5) add({ k: "drop", x, y: y + 3, vx: range(-10, 10), vy: 10, g: 320, life: 0.4, ramp: VENOM, gy: y + 14 }); queued.push((L) => { blob(L, x, y, 6.5, VENOM); for (let i = 1; i < 4; i++) L.f.disc(x - i * 4, y + i * 0.6, 2.4 - i * 0.5, VENOM[3], 1 - i / 4); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; spray2("drop", x, y, 14, VENOM, 40, 110, { g: 320, gy }); spray2("bubble", x, y, 6, VENOM, 10, 30, { vy: -20, sway: 15, size: 1.5 }); } },
    // A dark fist with a double-hard punch: a dark burst and a ring of shadow.
    assurance: { fire({ side }) { timed(0.3, (L, t) => auraOn(L, bodies[side], SUCKER, 1 - t / 0.3, 0.4, -1)); }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, SUCKER, true)); timed(0.4, (L, t) => L.f.ring(x, y, 6 + t * 70, 2, SUCKER[3], 1 - t / 0.4)); } },
    // Its beak spins like a drill: a white spiral boring into the foe.
    "drill-peck": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.0); timed(0.4, (L, t) => { const k = 1 - smooth(0.25, 0.4, t); for (let q = 0; q < 14; q += 0.25) { const r = 6 * (1 - q / 14), a = q * 1.6 + time * 30; L.f.dot(x - dx * q + -dy * Math.cos(a) * r, y - dy * q + dx * Math.cos(a) * r + Math.sin(a) * r * 0.3, q < 3 ? RAMP.normal[0] : AIRB[2], k); } L.l.glow(x, y, 10, AIRB[3], 0.5 * k); }); }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, AIRB, false)); } },
    // A belch of foul gas, a green-purple cloud.
    belch: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); if (rand() < 0.7) add({ k: "smoke", x: x + range(-4, 4), y: y + range(-4, 4), vx: range(-10, 10), vy: -range(2, 10), life: range(0.4, 0.7), size: range(2, 3.5), smoke: GASR }); queued.push((L) => { for (let i = 0; i < 5; i++) { const a = i * 1.3 + time * 3; L.f.disc(x + Math.cos(a) * 3, y + Math.sin(a) * 2.5, 3, GASR[i % 2 ? 1 : 3], 0.9); } }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); for (let i = 0; i < 10; i++) add({ k: "smoke", x: x + range(-8, 8), y: y + range(-6, 6), vx: range(-15, 15), vy: -range(4, 14), life: range(0.6, 1), size: range(2.5, 4), smoke: GASR }); } },
    // A ghostly wisp-orb with a staring ring (the shot); the foe's outline flickers with purple ghost-fire.
    hex: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { orbAt(L, x, y, 3.5, DARKP); for (let i = 0; i < 3; i++) { const a = time * 7 + (i * TAU) / 3; L.f.disc(x + Math.cos(a) * 7, y + Math.sin(a) * 4, 1.4, GHOSTF[2]); } }); return true; }, hit({ side }) { timed(0.6, (L, t) => edgeFlames(L, bodies[side], DARKP, 1 - t / 0.6, 0, 1, 0.9)); } },
    // It glows pink and lunges, hearts bursting off the foe.
    covet: { fire({ side }) { timed(0.35, (L, t) => auraOn(L, bodies[side], TONGUE, 1 - t / 0.35, 0, 1)); }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); spray2("heart", x, y, 6, TONGUE, 30, 70); fxs.push(blowFx(x, y, TONGUE, false)); } },
    // A muddy wave rolls out to the pulse's reach.
    "muddy-water": { pulse({ x: wx, y: wy, r }) { const [x, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX; timed(0.8, (L, t) => { const u = smooth(0, 0.55, t), rr = 4 + (R - 4) * u, H = 12 * (1 - 0.8 * smooth(0.5, 0.8, t)), fade = 1 - smooth(0.6, 0.8, t); const n = Math.ceil(rr * 5); for (let k = 0; k < n; k++) { const q = (k / n) * TAU, px2 = x + Math.cos(q) * rr, py = gy + Math.sin(q) * rr * 0.42, buf = Math.sin(q) < 0 ? L.b : L.f; const h = H * (0.8 + 0.3 * noise(q * 4 + t * 6, 2)); for (let yy = 0; yy < h; yy++) { const f = yy / h; buf.dot(px2, py - yy, f > 0.85 ? MUD[1] : f > 0.5 ? MUD[2] : MUD[3], fade); } } }); spray2("drop", x, gy - 8, 16, MUD, 30, 90, { g: 320, gy, delay: 0.2 }); } },
    // It curls up and rolls: a spinning dust ring round it and a trail of dust.
    rollout: { fire({ side, x: wx, y: wy }) { timed(0.5, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b), k = 1 - smooth(0.35, 0.5, t), r = Math.max(b.w, b.h) * 0.5; for (let q = 0; q < TAU; q += 0.1) { const a = q + time * 25; if ((Math.floor(q * 3) & 1) === 0) L.f.dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, DUSTR[1], k); } }, () => { if (rand() < 0.6) { const [cx, cy] = at(side, wx, wy); add({ k: "dust", x: cx, y: cy + 8, vx: range(-20, 20), vy: -range(2, 10), drag: 4, life: 0.5, size: 2, front: false }); } }); } },
    // A blade of water off its shell: a blue crescent.
    "razor-shell": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 0.9), a = Math.atan2(dy, dx); timed(0.45, (L, t) => { crescentCut(L, x, y, a, 17, t, RAMP.water); crescentCut(L, x, y, a + 0.2, 12, t - 0.04, BRINE); }); } },
    // A plain hard pound: a small white star.
    pound: { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); timed(0.35, (L, t) => powStar(L, x, y, t * 1.3)); } },
    // Blades of wind: crescents whirling out toward the foe.
    "air-cutter": { pulse({ side, x: wx, y: wy, r, fx: fwx, fy: fwy }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX, a0 = fwx != null ? Math.atan2(fwy - wy, fwx - wx) : 0; timed(0.5, (L, t) => { for (let i = 0; i < 3; i++) { const u = (t - i * 0.06) / 0.35; if (u <= 0 || u >= 1) continue; const a = a0 + (i - 1) * 0.35; crescentCut(L, cx + Math.cos(a) * u * R, cy + Math.sin(a) * u * R * 0.75, a, 9, 0.08, AIRB); } }); } },
    // A dark swipe that knocks something loose: a gold glint flies off the foe.
    "knock-off": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.0), a = Math.atan2(dy, dx) + 0.6; timed(0.4, (L, t) => crescentCut(L, x, y, a, 14, t, NIGHT)); }, hit({ x: wx, y: wy, dx }) { const [x, y] = toPx(wx, wy - 0.5); add({ k: "star", x, y, vx: (dx || 1) * 90, vy: -90, g: 300, life: 0.7, size: 3, ramp: SPORE }); } },
    // Quick pecks: two small white jabs and a feather.
    pluck: { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 2; i++) timed(0.25 + i * 0.08, (L, t) => { const u = t - i * 0.08; if (u >= 0) powStar(L, x + (i ? 5 : -4), y + (i ? 3 : -3), u * 2); }); add({ k: "leaf", x, y, vx: range(-30, 30), vy: -40, g: 40, drag: 2, life: 0.9, a: 0, va: 6, ramp: RAMP.normal }); } },
    peck: { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); timed(0.25, (L, t) => powStar(L, x, y, t * 2)); } },
    // Shards of ice flung fast ahead of it.
    "ice-shard": { fire({ side, x: wx, y: wy, dx, dy }) { const [cx, cy] = at(side, wx, wy); for (let i = 0; i < 8; i++) add({ k: "shard", x: cx + dx * 6, y: cy, vx: dx * range(160, 240) + range(-30, 30), vy: dy * range(160, 240) + range(-30, 30), drag: 2, life: range(0.25, 0.4), size: range(1.5, 2.5), a: Math.atan2(dy, dx), ramp: RAMP.ice }); }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); spray2("shard", x, y, 10, RAMP.ice, 50, 120); } },
    // A trunk of hard wood swung down: a green-brown aura, then splinters everywhere.
    "wood-hammer": { fire({ side }) { timed(0.35, (L, t) => auraOn(L, bodies[side], WOODR, 1 - t / 0.35, 0.4, 1)); }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; fxs.push(blowFx(x, y, WOODR, true)); spray2("chunk", x, y, 14, WOODR, 60, 140, { g: 380, gy }); } },
    // A punch with all its might: its fist glows, and the blow explodes.
    "dynamic-punch": { fire({ side }) { timed(0.3, (L, t) => edgeFlames(L, bodies[side], BLAST, 1 - t / 0.3, 0.3, 0.8, 0.8)); }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); fxs.push(blowFx(x, y, BLAST, true)); timed(0.6, (L, t) => { for (let i = 0; i < 3; i++) { const u = (t - i * 0.07) / 0.4; if (u > 0 && u < 1) L.f.ring(x, y, 5 + u * 32, 2.5 - i * 0.5, BLAST[i + 1], 1 - u); } }); for (let i = 0; i < 8; i++) add({ k: "smoke", x: x + range(-8, 8), y: y + range(-8, 8), vx: range(-20, 20), vy: -range(5, 20), life: range(0.6, 1), size: range(2.5, 4), delay: 0.08 }); } },
    // A long blade of white-gold light cuts the foe.
    "sacred-sword": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 0.8), a = Math.atan2(dy, dx); timed(0.5, (L, t) => { crescentCut(L, x, y, a, 22, t, SWORD); if (t < 0.15) sparkle(L.f, x + Math.cos(a) * 22, y + Math.sin(a) * 18, 4, SWORD[0], SWORD[3]); }); } },
    // One long, thick vine whips down on the foe.
    "power-whip": { fire({ side, x: wx, y: wy, dx, dy }) { const [cx, cy] = at(side, wx, wy), [tx, ty] = reachOf(wx, wy, dx, dy, 1.5); timed(0.45, (L, t) => { const reach = t < 0.12 ? 1 - Math.pow(2, -10 * t / 0.12) : 1 - smooth(0.2, 0.4, t), p1 = [(cx + tx) / 2, Math.min(cy, ty) - 22 + Math.sin(time * 18) * 3]; let last = [cx, cy]; for (let q = 0; q <= reach; q += 0.012) { const [x, y] = bez([cx, cy - 4], p1, [tx, ty], q); L.f.disc(x, y, 2.2 - q, VINE[4]); L.f.set(x, y - 1, VINE[2]); L.f.set(x, y, VINE[3]); last = [x, y]; } if (t > 0.1 && t < 0.2) { sparkle(L.f, last[0], last[1], 4, RAMP.normal[0], VINE[1]); L.l.glow(last[0], last[1], 12, VINE[1], 0.6); } }); } },
    // A paralysing stare: two glowing yellow eyes fly at the foe (the shot).
    glare: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.45); queued.push((L) => { for (const sd of [-1, 1]) { const ex = x + sd * 8; for (let i = -6; i <= 6; i++) { const h = 3.2 * Math.sqrt(1 - (i / 6.5) ** 2); for (let j = -h; j <= h; j += 0.5) { const yy = y + j + i * 0.3 * sd; L.f.set(ex + i, yy, Math.abs(j) > h - 0.8 ? EYESR[5] : Math.hypot(i, j * 1.4) < 2.2 ? RAMP.normal[6] : EYESR[j < 0 ? 1 : 2]); } } L.f.set(ex - 1, y - 1, RAMP.normal[0]); } L.l.glow(x, y, 20, EYESR[3], 0.8); }); return true; } },
    // Ghostly blue-purple flames drifting to the foe (the shot); the burn is the status's own.
    "will-o-wisp": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 3; i++) { const a = time * 6 + (i * TAU) / 3, fx2 = x + Math.cos(a) * 6, fy2 = y + Math.sin(a) * 4; for (let yy = 0; yy < 6; yy++) { const w = 2.2 * (1 - yy / 6); for (let o = -w; o <= w; o += 0.5) L.f.set(fx2 + o + Math.sin(yy + time * 15) * 0.6, fy2 - yy, BLUEFIRE[yy < 2 ? 3 : yy < 4 ? 2 : 1]); } } L.l.glow(x, y, 12, BLUEFIRE[3], 0.5); }); return true; } },
    // It swallows its stockpile: a green glow drawn in and a heal.
    swallow: { fire({ side, x: wx, y: wy }) { const [cx, cy] = at(side, wx, wy); for (let i = 0; i < 12; i++) { const a = range(0, TAU), d = range(16, 26); add({ k: "mote", x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, life: 0.32, ramp: SYNTH, delay: i * 0.02 }); } timed(0.6, (L, t) => auraOn(L, bodies[side], SYNTH, smooth(0.2, 0.35, t) * (1 - smooth(0.4, 0.6, t)), 0, 1)); } },
    // It bites and drinks: red beads streaming back to it.
    "leech-life": { hit({ side, x: wx, y: wy, ux, uy }) { const [x, y] = toPx(wx, wy - 0.25); timed(0.3, (L, t) => jawsAt(L, x, y, t, DRAINRED, 0.8)); drainBeads(side, 1 - side, { x: wx, y: wy, ux, uy }, DRAINRED, 0.7); } },
    // Odd, unseen power: green-blue ripples like an eye's gaze (the shot), the foe's outline flashing eerie.
    extrasensory: { shot({ x: wx, y: wy, dx }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 3; i++) { const q = (time * 3 + i / 3) % 1; for (let a = 0; a < TAU; a += 0.15) L.f.dot(x - dx * q * 8 + Math.cos(a) * (3 + q * 6), y + Math.sin(a) * (2 + q * 4) + Math.sin(a * 4 + time * 20) * 0.8, EXTRA[i === 1 ? 1 : 3], 1 - q); } L.f.disc(x, y, 2, EXTRA[0]); L.l.glow(x, y, 10, EXTRA[3], 0.5); }); return true; }, hit({ side }) { timed(0.4, (L, t) => outline(L, bodies[side], EXTRA[1], 1 - t / 0.4)); } },
    // Lava bursts up round it to the pulse's reach.
    "lava-plume": { pulse({ x: wx, y: wy, r }) { const [cx, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX; for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, d = R * range(0.4, 1); add({ k: "flame", x: cx + Math.cos(a) * d, y: gy + Math.sin(a) * d * 0.42 - 2, vx: range(-8, 8), vy: -range(30, 70), drag: 2, life: range(0.4, 0.7), size: range(1.2, 2), delay: (d / R) * 0.2 }); } timed(0.7, (L, t) => { const u = smooth(0, 0.3, t); L.b.ring(cx, gy, 4 + u * R, 3, HEAT[4], 1 - smooth(0.4, 0.7, t), 0.42); L.b.ring(cx, gy + 1, 2 + u * R, 2, HEAT[6], 1 - smooth(0.4, 0.7, t), 0.42); }); } },
    // A karate chop straight down: a white-orange downward streak, and the guard breaking into pieces.
    "brick-break": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.0); timed(0.35, (L, t) => streaks(L, x, y, Math.PI / 2, t, FIGHTR, 1, 0, 16)); }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; spray2("chunk", x, y, 10, FIGHTR, 50, 120, { g: 380, gy }); } },
    // A huge ghostly claw: three dark purple slashes.
    "shadow-claw": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.1), a = Math.atan2(dy, dx) + Math.PI / 2 + 0.4; timed(0.5, (L, t) => streaks(L, x, y, a, t, DARKP, 3, 7, 18)); } },
    // A reckless headbutt wrapped in rock: a stone aura, then a burst, rubble and a floor ring.
    "head-smash": { fire({ side }) { timed(0.4, (L, t) => auraOn(L, bodies[side], STONEB, 1 - t / 0.4, 0.6, 0.5)); }, hit({ side, x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; fxs.push(blowFx(x, y, STONEB, true)); spray2("chunk", x, y, 16, ROCKC, 60, 150, { g: 380, gy }); timed(0.5, (L, t) => { L.b.ring(x, gy, 6 + t * 80, 2.5, DUSTR[0], 1 - t / 0.5, 0.4); outline(L, bodies[1 - side], STONEB[1], 1 - t / 0.5); }); } },
    // Heavy claws that crush: three thick white streaks and grit.
    "crush-claw": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2 + 0.3; timed(0.45, (L, t) => streaks(L, x, y, a, t, RAMP.normal, 3, 6, 15)); }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); spray2("chunk", x, y, 6, DUSTR, 40, 90, { g: 380, gy: y + 14 }); } },
    // A charming cry: pink rings of sound and hearts out to the pulse's reach.
    "disarming-voice": { pulse({ side, x: wx, y: wy, r }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX; spray2("heart", cx, cy, 8, TONGUE, 40, 80); timed(0.6, (L, t) => { for (let i = 0; i < 3; i++) { const u = (t - i * 0.1) / 0.4; if (u > 0 && u < 1) L.f.ring(cx, cy, 6 + u * R * 0.8, 1.5, TONGUE[i % 2 ? 1 : 2], 1 - u, 0.75); } }); } },
    // A low sweeping kick at the foe's feet: an arc along the floor and dust.
    "low-sweep": { fire({ x: wx, y: wy, dx, dy }) { const [x] = toPx(wx + dx * 0.9, wy), gy = toPx(0, wy + 0.42 + dy * 0.9)[1]; timed(0.4, (L, t) => { const u = smooth(0, 0.12, t), k = 1 - smooth(0.2, 0.4, t); for (let q = -1.4; q <= -1.4 + 2.8 * u; q += 0.03) L.f.disc(x + Math.cos(q) * 16, gy - 3 + Math.sin(q) * 4, 1.3, q > -1.4 + 2.8 * u - 0.4 ? RAMP.normal[0] : FIGHTR[2], k); }); for (let i = 0; i < 6; i++) add({ k: "dust", x: x + range(-10, 10), y: gy - 1, vx: range(-30, 30), vy: -range(2, 10), drag: 4, life: 0.5, size: 2, front: false, delay: 0.08 }); } },
    // It eats the foe's dreams: a lilac dream-wisp (the shot), and the dream drained back into it.
    "dream-eater": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 16; i++) { const a = time * 5 + i * 0.5, r = 1 + i * 0.35; L.f.dot(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, DREAM[i < 5 ? 1 : 3], 1); } L.l.glow(x, y, 10, DREAM[3], 0.5); }); return true; }, hit({ side, x: wx, y: wy, ux, uy }) { drainBeads(side, 1 - side, { x: wx, y: wy, ux, uy }, DREAM, 0.8); timed(0.5, (L, t) => auraOn(L, bodies[side], DREAM, 1 - t / 0.5, 0, -1)); } },
    // A strike wrapped in water: a crashing wave crescent, then a big splash.
    liquidation: { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.0), a = Math.atan2(dy, dx); timed(0.4, (L, t) => crescentCut(L, x, y, a, 16, t, RAMP.water)); }, hit({ x: wx, y: wy }) { const V = RAMP.water, [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; spray2("drop", x, y, 20, V, 60, 140, { g: 320, gy }); timed(0.45, (L, t) => { L.f.ring(x, y, 6 + t * 50, 2, V[1], 1 - t / 0.45); L.b.ring(x, gy, 4 + t * 60, 2, V[2], 1 - t / 0.45, 0.4); }); } },
    // A ball of fire with an ember tail (the shot); the foe's edges catch fire.
    incinerate: { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.35); if (rand() < 0.8) add({ k: "ember", x: x - dx * 4, y: y + range(-3, 3), vx: -dx * 30 + range(-10, 10), vy: -range(10, 30), life: range(0.3, 0.6) }); queued.push((L) => { for (let i = 1; i < 6; i++) L.f.disc(x - dx * i * 2.5, y - dy * i * 2.5, 3.5 - i * 0.5, HEAT[Math.min(9, 2 + i)], 1 - i / 7); L.f.disc(x, y, 3.8, HEAT[4]); L.f.disc(x, y, 2.6, HEAT[2]); L.f.set(x - 1, y - 1, HEAT[0]); L.l.glow(x, y, 12, HEAT[4], 0.6); }); return true; }, hit({ side }) { timed(0.5, (L, t) => edgeFlames(L, bodies[side], HEAT, 1 - t / 0.5, 0, 1, 1)); } },
  });
  /* ---------- batch 10 (2026-10-30): the elemental punches, X-Scissor, Iron Tail ---------- */
  // Where its leading fist is: the front edge of its body, a little above the middle, along the blow's line.
  const fistOf = (side, wx, wy, dx, dy) => { const b = bodies[side]; if (!b) return toPx(wx + dx * 0.5, wy - 0.45 + dy * 0.5); const [cx, cy] = centreOf(b); return [cx + dx * b.w * 0.5, cy - b.h * 0.08 + dy * b.h * 0.3]; };
  // A fist of light: a hard white core, its element's glow and rim, pulsing as it winds up.
  function fistGlow(L, x, y, C, k, r = 4) { const p = 1 + 0.15 * Math.sin(time * 40); L.f.disc(x, y, (r + 1.5) * p, C[4], k); L.f.disc(x, y, r * p, C[2], k); L.f.disc(x - 0.5, y - 0.5, r * 0.55, C[0], k); L.l.glow(x, y, r * 5, C[3], 0.7 * k); }
  // A punch's shockwave: an oval ring flattened along the blow, expanding past the foe.
  function punchRing(L, x, y, dx, u, C, k) { const rr = 4 + u * 26; for (let q = 0; q < TAU; q += 0.04) { const ax = Math.cos(q) * rr * 0.45, ay = Math.sin(q) * rr; L.f.dot(x + ax * (dx || 1) + dx * u * 10, y + ay, C[q < Math.PI ? 1 : 3], k); } }
  Object.assign(SIG, {
    // ITS FIST CRACKLES WITH ELECTRICITY (Pikachu, Electabuzz): arcs leap round the glowing fist as it swings;
    // the punch lands in a burst of bolts that crawl over the foe.
    "thunder-punch": {
      fire({ side, x: wx, y: wy, dx, dy }) {
        let f = -1, arcs = [];
        timed(0.32, (L, t) => { const [fx2, fy2] = fistOf(side, wx, wy, dx, dy), k = 1 - smooth(0.22, 0.32, t); fistGlow(L, fx2, fy2, RAMP.electric, k); for (const p of arcs) boltLine(L, p.map(([a, b]) => [fx2 + a, fy2 + b]), RAMP.electric[p.c], k); },
          (t) => { const n = Math.floor(t * 20); if (n !== f) { f = n; arcs = [0, 1, 2, 3].map((i) => { const a = range(0, TAU), a2 = a + range(-1, 1); const p = bolt(Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(a2) * range(8, 13), Math.sin(a2) * range(8, 13), 0.45); p.c = i % 2 ? 0 : 2; return p; }); } });
      },
      hit({ side, x: wx, y: wy, dx }) {
        const V = RAMP.electric, [x, y] = toPx(wx, wy - 0.4);
        fxs.push(blowFx(x, y, V, true));
        let f = -1, bolts = [];
        timed(0.55, (L, t) => { const k = 1 - smooth(0.3, 0.55, t); if (t < 0.25) punchRing(L, x, y, dx, t / 0.25, V, 1 - t / 0.25); for (const p of bolts) { boltLine(L, p, V[0], k); for (let j = 0; j < p.length; j += 4) L.l.glow(p[j][0], p[j][1], 6, V[3], 0.45 * k); } outline(L, bodies[side], V[1], k * 0.9); },
          (t) => { const n = Math.floor(t * 15); if (n !== f) { f = n; bolts = Array.from({ length: 6 }, () => { const a = range(0, TAU), l = range(10, 22); return bolt(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0.4); }); } });
        for (let i = 0; i < 14; i++) { const a = range(0, TAU), sp = range(70, 170); add({ k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.15, 0.35), ramp: V }); }
      },
    },
    // ITS FIST BURSTS INTO FLAME (Hitmonchan, Infernape): a blazing fist trailing fire; the punch
    // explodes in a fireball that licks up the foe's outline and showers embers.
    "fire-punch": {
      fire({ side, x: wx, y: wy, dx, dy }) {
        timed(0.32, (L, t) => { const [fx2, fy2] = fistOf(side, wx, wy, dx, dy), k = 1 - smooth(0.22, 0.32, t); fistGlow(L, fx2, fy2, HEAT, k, 3.5); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.45, h = 6 + 4 * Math.sin(time * 30 + i); for (let d = 0; d < h; d++) L.f.dot(fx2 + Math.cos(a) * (3 + d * 0.5), fy2 - 2 - d + Math.sin(a) * 2, HEAT[Math.min(9, 1 + Math.floor(d / h * 6))], k); } },
          (t) => { if (t < 0.25) { const [fx2, fy2] = fistOf(side, wx, wy, dx, dy); add({ k: "flame", x: fx2 - dx * 3, y: fy2, vx: -dx * 30 + range(-10, 10), vy: -range(20, 40), drag: 2, life: range(0.2, 0.35), size: range(0.8, 1.3) }); } });
      },
      hit({ side, x: wx, y: wy, dx }) {
        const [x, y] = toPx(wx, wy - 0.4);
        fxs.push(blowFx(x, y, HEAT, true));
        for (let i = 0; i < 14; i++) { const a = range(0, TAU), sp = range(30, 90); add({ k: "flame", x: x + Math.cos(a) * 3, y: y + Math.sin(a) * 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, drag: 2.5, life: range(0.3, 0.55), size: range(1.2, 2) }); }
        for (let i = 0; i < 10; i++) add({ k: "ember", x: x + range(-6, 6), y: y + range(-6, 6), vx: range(-30, 30), vy: -range(30, 80), life: range(0.6, 1.1), delay: 0.05 });
        timed(0.6, (L, t) => { if (t < 0.25) punchRing(L, x, y, dx, t / 0.25, HEAT, 1 - t / 0.25); edgeFlames(L, bodies[side], HEAT, 1 - smooth(0.2, 0.6, t), 0, 1, 1.1); });
      },
    },
    // ITS FIST GLOWS ICY LIGHT BLUE, CRYSTALS FORMING ROUND IT (Hitmonchan, Sneasel): the punch
    // cracks ice across the foe - shards fly, and frost crystals stay on it a moment.
    "ice-punch": {
      fire({ side, x: wx, y: wy, dx, dy }) {
        timed(0.32, (L, t) => { const [fx2, fy2] = fistOf(side, wx, wy, dx, dy), k = 1 - smooth(0.22, 0.32, t); fistGlow(L, fx2, fy2, RAMP.ice, k); for (let i = 0; i < 5; i++) { const a = time * 4 + (i * TAU) / 5, r = 7; sparkle(L.f, fx2 + Math.cos(a) * r, fy2 + Math.sin(a) * r * 0.7, 2, RAMP.ice[0], RAMP.ice[3]); } },
          (t) => { if (t < 0.25 && rand() < 0.6) { const [fx2, fy2] = fistOf(side, wx, wy, dx, dy); add({ k: "mote", x: fx2, y: fy2, vx: range(-20, 20), vy: range(-20, 10), drag: 3, life: 0.35, ramp: RAMP.ice }); } });
      },
      hit({ side, x: wx, y: wy, dx }) {
        const I = RAMP.ice, [x, y] = toPx(wx, wy - 0.4), gy = toPx(0, wy + 0.42)[1];
        fxs.push(blowFx(x, y, I, true));
        for (let i = 0; i < 14; i++) { const a = range(0, TAU), sp = range(60, 150); add({ k: "shard", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 300, life: range(0.4, 0.7), size: range(1.5, 2.8), a: range(0, TAU), va: range(-12, 12), ramp: I, gy }); }
        // Frost crystals growing on the foe where the punch landed, then shattering.
        const xs = Array.from({ length: 5 }, () => [range(-9, 9), range(-10, 8), range(3, 6), range(0, TAU)]);
        timed(0.8, (L, t) => { if (t < 0.25) punchRing(L, x, y, dx, t / 0.25, I, 1 - t / 0.25); const g = Math.min(1, t / 0.12) * (1 - smooth(0.55, 0.8, t)); for (const [ox, oy, r, a] of xs) for (let i = 0; i < 6; i++) { const q = a + (i * TAU) / 6; for (let d = 0; d <= r * g; d += 0.5) L.f.set(x + ox + Math.cos(q) * d, y + oy + Math.sin(q) * d, d > r * g - 1 ? I[0] : I[2]); } outline(L, bodies[side], I[1], g * 0.8); });
      },
    },
    // ITS CLAWS GLOW AND CROSS, SLASHING AN X (Scizor, Scyther): two blades of green-white light
    // sweep in opposite diagonals one after the other and stay crossed as an X a beat before fading.
    "x-scissor": {
      fire({ side }) { timed(0.25, (L, t) => edgeLit(L, bodies[side], XSC, 1 - t / 0.25, 9)); },
      hit({ x: wx, y: wy }) {
        const [x, y] = toPx(wx, wy - 0.5), R = 24;
        timed(0.75, (L, t) => {
          const fade = 1 - smooth(0.45, 0.75, t);
          for (const [t0, a] of [[0, Math.PI / 4], [0.08, -Math.PI / 4]]) {
            const u = Math.min(1, Math.max(0, (t - t0) / 0.07)); if (u <= 0) continue;
            for (let d = -R; d <= -R + 2 * R * u; d += 0.5) { const w = 3.6 * (1 - (Math.abs(d) / R) ** 2) + 0.5; for (let o = -w - 1; o <= w + 1; o += 0.5) L.f.dot(x + Math.cos(a) * d - Math.sin(a) * o, y + Math.sin(a) * d + Math.cos(a) * o, Math.abs(o) > w ? XSC[6] : Math.abs(o) < w * 0.35 ? XSC[0] : Math.abs(o) < w * 0.7 ? XSC[2] : XSC[4], fade); }
            L.l.glow(x, y, R * 1.6, XSC[3], 0.7 * fade);
          }
          if (t > 0.15 && t < 0.35) { const v = (t - 0.15) / 0.2; sparkle(L.f, x, y, 9 * (1 - v) + 2, XSC[0], XSC[2]); L.f.ring(x, y, 4 + v * 28, 2, XSC[1], 1 - v); }
        });
        for (let i = 0; i < 10; i++) { const a = (i % 4) * Math.PI / 2 + Math.PI / 4 + range(-0.2, 0.2), sp = range(60, 140); add({ k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.15, 0.3), ramp: XSC, delay: 0.14 }); }
      },
    },
    // ITS TAIL GLOWS WHITE AND HARDENS LIKE STEEL (Pikachu, Steelix): its whole outline turns to
    // shining steel, it swings an arc of silver down - and the blow rings like metal on the foe.
    "iron-tail": {
      fire({ side, x: wx, y: wy, dx, dy }) {
        const [cx, cy] = reachOf(wx, wy, dx, dy, 0.6), base = Math.atan2(dy, dx) - 2.4;
        timed(0.4, (L, t) => {
          const k = 1 - smooth(0.25, 0.4, t); edgeLit(L, bodies[side], STEELW, k, 6); steelTop(L, bodies[side], k * 0.5);
          const u = smooth(0.02, 0.18, t); for (let q = 0; q <= 2.4 * u; q += 0.02) { const w = 3.2 * Math.sin((q / 2.4) * Math.PI) + 0.8, r = 24; for (let o = 0; o <= w; o += 0.5) L.f.dot(cx + Math.cos(base + q) * (r - o), cy + Math.sin(base + q) * (r - o) * 0.75, o < 1 ? STEELW[0] : o < w - 1 ? STEELW[2] : STEELW[5], k); } L.l.glow(cx, cy, 22, STEELW[2], 0.5 * k);
        });
      },
      hit({ side, x: wx, y: wy, dx }) {
        const [x, y] = toPx(wx, wy - 0.4);
        // Gunmetal, not white: the hit's own flash is white, and a white clang vanished into it.
        const GUN = [STEELW[0], STEELW[2], STEELW[3], STEELW[4], STEELW[6], STEELW[5], STEELW[6]];
        fxs.push(blowFx(x, y, GUN, true));
        timed(0.6, (L, t) => { for (let i = 0; i < 3; i++) { const u = (t - i * 0.06) / 0.3; if (u > 0 && u < 1) L.f.ring(x, y, 5 + u * 30, 2.5, STEELW[i ? 5 : 4], 1 - u); } if (t < 0.35) { const g = t < 0.04 ? t / 0.04 : 1 - (t - 0.04) / 0.31; starAt(L, x, y, 14 * g + 1, 0.3, GUN, 1); } outline(L, bodies[side], STEELW[2], 1 - t / 0.6); });
        // The clang: metal sparks, hot orange as well as white.
        for (let i = 0; i < 18; i++) { const [vx, vy] = spray(-(dx || 1), 0, 3.4, 80, 200); add({ k: "spark", x, y, vx, vy: vy - 40, g: 300, drag: 1.5, life: range(0.25, 0.5), ramp: i % 3 ? STEELW : HEAT.slice(0, 7), gy: y + 18 }); }
      },
    },
  });
  /* ---------- batch 11 (2026-10-30): the court-filling moves, and the ones that leave it ---------- */
  // `wide`: the whole court, `dir` -1 or 1 the way it blows (toward the foe). `vanish`/`land`: off the court and back.
  const across = (dir, f) => { const n = f.n ?? 60; for (let i = 0; i < n; i++) { const x = dir > 0 ? range(-20, bw * 0.6) : range(bw * 0.4, bw + 20), y = range(MARGIN * BODY_PX, bh - MARGIN * BODY_PX); add({ x, y, delay: range(0, f.spread ?? 0.5), ...f.make(x, y) }); } };
  // A snowflake: six arms per pixel.
  function flake(L, x, y, r, C, k = 1) { for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6 + 0.3; for (let d = 0; d <= r; d += 0.5) L.f.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, d > r - 1 ? C[0] : C[2], k); } }
  Object.assign(SIG, {
    // A FIERCE SNOWSTORM ACROSS THE WHOLE FIELD (Articuno, Abomasnow): driving snow and ice crystals
    // blowing toward the foe, a cold haze, and the foe crusted with frost where it stands.
    blizzard: { wide({ side, fx: fwx, fy: fwy, x: wx }) {
      const I = RAMP.ice, dir = fwx != null && fwx < wx ? -1 : 1;
      across(dir, { n: 110, spread: 0.7, make: () => ({ k: rand() < 0.25 ? "star" : "mote", vx: dir * range(160, 260), vy: range(30, 70), drag: 0.3, life: range(0.6, 1.0), size: 1.5, ramp: I }) });
      const flakes = Array.from({ length: 60 }, () => [range(0, bw), range(0, bh), range(2, 5), range(0.7, 1.3)]);
      const winds = Array.from({ length: 30 }, () => [range(0, bw), range(0, bh), range(20, 50), range(0.8, 1.4)]);
      timed(1.4, (L, t) => {
        const k = smooth(0, 0.12, t) * (1 - smooth(1.0, 1.4, t));
        for (const [x0, y0, len, sp] of winds) { const x = ((x0 + dir * t * 520 * sp) % bw + bw) % bw, y = (y0 + t * 90 * sp) % bh; for (let d = 0; d < len; d++) { const c = d < 4 ? I[0] : I[1]; L.f.dot(x - dir * d, y - d * 0.18, c, k * (1 - d / len)); } }
        for (const [x0, y0, r, sp] of flakes) { const x = ((x0 + dir * t * 300 * sp) % bw + bw) % bw, y = (y0 + t * 80 * sp) % bh; flake(L, x, y, r, I, k); }
        for (let i = 0; i < 3; i++) { const yb = bh * (0.25 + i * 0.25) + Math.sin(t * 3 + i) * 10; for (let x = 0; x < bw; x += 2) for (let o = -4; o <= 4; o++) if ((x + o * 3 + Math.floor(t * 30)) % 5 === 0) L.b.dot(x, yb + o + Math.sin(x * 0.05 + t * 8) * 3, I[1], k * 0.5); }
        L.l.glow(bw / 2, bh / 2, bw * 0.6, I[2], 0.25 * k);
        if (fwx != null) { const b = bodies[1 - side]; if (b) { outline(L, b, I[0], k); auraOn(L, b, I, k * 0.6, 0, -1); } }
      });
    } },
    // A STORM OF CHERRY PETALS (Lilligant, Leafeon): pink petals whirling across the field in a swirl that sweeps the foe.
    "petal-blizzard": { wide({ side, fx: fwx, x: wx }) {
      const dir = fwx != null && fwx < wx ? -1 : 1;
      const petals = Array.from({ length: 70 }, () => [range(0, bw), range(0, bh), range(2.5, 4), range(0.7, 1.3)]);
      across(dir, { n: 60, spread: 0.6, make: () => ({ k: rand() < 0.3 ? "heart" : "leaf", vx: dir * range(120, 200), vy: range(-30, 30), sway: 60, drag: 0.4, life: range(0.7, 1.1), a: range(0, TAU), va: range(-10, 10), ramp: PETAL }) });
      timed(1.1, (L, t) => {
        const k = smooth(0, 0.15, t) * (1 - smooth(0.8, 1.1, t)), b = bodies[1 - side];
        for (const [x0, y0, r, sp] of petals) { const x = ((x0 + dir * t * 260 * sp) % bw + bw) % bw, y = y0 + Math.sin(t * 6 * sp + x0) * 14; leafAt(L, x, y, t * 9 * sp + x0, r, PETAL); }
        if (!b) return;
        const [cx, cy] = centreOf(b);
        for (let i = 0; i < 28; i++) { const a = time * 7 + i * 0.6, r = 6 + (i % 7) * 2.2; leafAt(L, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6 - (i % 4) * 3, a * 2, 2.2, PETAL); }
        L.l.glow(cx, cy, 24, PETAL[3], 0.4 * k);
      });
    } },
    // A SCORCHING WIND (Charizard, Heatran): the air across the court ripples orange in waves of heat, embers carried on it.
    "heat-wave": { wide({ side, fx: fwx, x: wx }) {
      const dir = fwx != null && fwx < wx ? -1 : 1;
      across(dir, { n: 60, spread: 0.6, make: () => ({ k: "ember", vx: dir * range(80, 150), vy: -range(10, 40), life: range(0.7, 1.2) }) });
      timed(1.2, (L, t) => {
        const k = smooth(0, 0.15, t) * (1 - smooth(0.85, 1.2, t));
        for (let i = 0; i < 9; i++) { const yb = ((i / 9) * bh + t * 30) % bh; for (let x = 0; x < bw; x += 1) { const y = yb + Math.sin(x * 0.06 - dir * t * 14 + i) * 5; L.b.dot(x, y - 1, HEAT[3], k * 0.6); L.b.dot(x, y, HEAT[4], k * 0.75); L.b.dot(x, y + 1, HEAT[6], k * 0.55); } }
        L.l.glow(bw / 2, bh / 2, bw * 0.6, HEAT[4], 0.25 * k);
        const b = bodies[1 - side]; if (b) edgeFlames(L, b, HEAT, k * 0.8, 0, 1, 0.8);
      });
    } },
    // A TORNADO WHIRLS UP ROUND IT (Dragonair, Gyarados): a twisting column of teal-green wind with debris spinning in it.
    twister: { pulse({ side, x: wx, y: wy, r }) {
      const [cx, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX * 0.8;
      timed(0.9, (L, t) => {
        const k = smooth(0, 0.12, t) * (1 - smooth(0.6, 0.9, t)), H = 64 * smooth(0, 0.25, t);
        for (let yy = 0; yy < H; yy++) { const u = yy / 64, rr = 5 + u * R * 1.3, sway = Math.sin(yy * 0.1 + time * 6) * 4; for (let q = 0; q < TAU; q += 0.18) { const a = q + time * 16 - yy * 0.22, front = Math.sin(a) > 0; if ((yy + Math.floor(q * 4)) % 2) continue; (front ? L.f : L.b).dot(cx + sway + Math.cos(a) * rr, gy - yy + Math.sin(a) * rr * 0.22, front ? (q < 1 ? WINDC[0] : WINDC[2]) : DCLAW[4], k); } }
        L.l.glow(cx, gy - 20, R, DCLAW[3], 0.35 * k);
      }, () => { if (rand() < 0.5) add({ k: "leaf", x: cx + range(-R, R), y: gy - range(0, 40), vx: range(-60, 60), vy: -range(10, 40), drag: 2, life: 0.5, a: range(0, TAU), va: 15, ramp: RAMP.grass }); });
    } },
    // FLY: it beats its wings and soars out of sight in a gust; then dives out of the sky onto the foe in a white streak.
    fly: {
      vanish({ x: wx, y: wy }) { const [x, gy] = toPx(wx, wy + 0.42); for (let i = 0; i < 10; i++) add({ k: "leaf", x: x + range(-8, 8), y: gy - range(4, 20), vx: range(-50, 50), vy: -range(20, 60), g: 40, drag: 2, life: range(0.7, 1.1), a: range(0, TAU), va: range(-8, 8), ramp: RAMP.normal }); timed(0.4, (L, t) => { L.b.ring(x, gy, 4 + t * 70, 2, WINDC[1], 1 - t / 0.4, 0.4); L.b.ring(x, gy, 2 + t * 50, 1.5, WINDC[3], 1 - t / 0.4, 0.4); }); },
      land({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), gy = toPx(0, wy + 0.42)[1]; timed(0.5, (L, t) => { const u = Math.min(1, t / 0.12), k = 1 - smooth(0.25, 0.5, t); for (let o = -4; o <= 4; o += 2) L.f.line(x + o, Math.max(0, y - 90), x + o * 0.3, y - 90 * (1 - u) + 4, o ? WINDC[2] : RAMP.normal[0], k); if (t > 0.1) { const v = (t - 0.1) / 0.4; L.b.ring(x, gy, 6 + v * 60, 2.5, WINDC[1], 1 - v, 0.4); } }); for (let i = 0; i < 8; i++) add({ k: "leaf", x, y, vx: range(-80, 80), vy: -range(20, 70), g: 60, drag: 2, life: 0.9, a: range(0, TAU), va: 10, ramp: RAMP.normal, delay: 0.1 }); },
    },
    // BOUNCE: it springs high off the ground; then comes down on the foe with a springy shockwave.
    bounce: {
      vanish({ x: wx, y: wy }) { const [x, gy] = toPx(wx, wy + 0.42); for (let i = 0; i < 10; i++) add({ k: "dust", x: x + range(-6, 6), y: gy - 1, vx: range(-50, 50), vy: -range(4, 14), drag: 4, life: 0.6, size: 2, front: false }); timed(0.35, (L, t) => { for (let i = 0; i < 3; i++) L.b.ring(x, gy - i * 3, 5 + i * 2 + t * 20, 1.5, RAMP.normal[i ? 2 : 0], 1 - t / 0.35, 0.4); }); },
      land({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), gy = toPx(0, wy + 0.42)[1]; fxs.push(blowFx(x, y, RAMP.normal, true)); timed(0.55, (L, t) => { for (let i = 0; i < 2; i++) { const v = (t - i * 0.1) / 0.4; if (v > 0 && v < 1) L.b.ring(x, gy, 6 + v * 50, 3, DUSTR[i ? 2 : 0], 1 - v, 0.4); } }); for (let i = 0; i < 5; i++) add({ k: "star", x, y: y - 6, vx: range(-60, 60), vy: -range(40, 90), g: 200, life: 0.7, size: 2, ramp: SPORE }); },
    },
    // DIG: it burrows fast, throwing up a fountain of dirt; then bursts up out of the ground under the foe.
    dig: {
      vanish({ x: wx, y: wy }) { const [x, gy] = toPx(wx, wy + 0.42); for (let i = 0; i < 18; i++) add({ k: "chunk", x: x + range(-6, 6), y: gy - 2, vx: range(-70, 70), vy: -range(60, 150), g: 380, life: range(0.5, 0.9), ramp: DIRT, gy: gy + range(-3, 3) }); timed(0.6, (L, t) => { const k = 1 - smooth(0.3, 0.6, t); L.b.disc(x, gy, 7, DIRT[5], k); L.b.ring(x, gy, 7, 2, DIRT[3], k, 0.45); }); },
      land({ x: wx, y: wy }) { const [x, gy] = toPx(wx, wy + 0.42); for (let i = 0; i < 24; i++) add({ k: "chunk", x: x + range(-8, 8), y: gy - 4, vx: range(-90, 90), vy: -range(90, 190), g: 400, life: range(0.6, 1.0), ramp: i % 3 ? DIRT : ROCKC, gy: gy + range(-3, 3) }); timed(1.0, (L, t) => { const k = 1 - smooth(0.6, 1.0, t), u = Math.min(1, t / 0.12); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3; crack(L, x, gy, x + Math.cos(a) * 22 * u, gy + Math.sin(a) * 9 * u, DIRT, k, i + 30); } L.b.disc(x, gy, 9 * u, DIRT[5], k); L.b.ring(x, gy, 10 * u, 2.5, DIRT[2], k, 0.45); }); },
    },
    // DIVE: it splashes down under the water; then a geyser erupts under the foe as it bursts out.
    dive: {
      vanish({ x: wx, y: wy }) { const V = RAMP.water, [x, gy] = toPx(wx, wy + 0.42); for (let i = 0; i < 16; i++) add({ k: "drop", x: x + range(-5, 5), y: gy - 4, vx: range(-60, 60), vy: -range(80, 160), g: 320, life: range(0.5, 0.8), ramp: V, gy }); timed(0.6, (L, t) => { for (let i = 0; i < 2; i++) { const v = (t - i * 0.12) / 0.45; if (v > 0 && v < 1) L.b.ring(x, gy, 4 + v * 30, 2, V[i ? 2 : 1], 1 - v, 0.4); } }); },
      land({ x: wx, y: wy }) { const V = RAMP.water, [x, gy] = toPx(wx, wy + 0.42); for (let i = 0; i < 24; i++) add({ k: "drop", x: x + range(-6, 6), y: gy - range(10, 40), vx: range(-70, 70), vy: -range(60, 160), g: 320, life: range(0.6, 1.0), ramp: V, gy, delay: range(0, 0.15) }); timed(0.9, (L, t) => { const g = Math.min(1, outBack(t / 0.12, 1.5)) * (1 - smooth(0.45, 0.9, t)), h = 54 * g; for (let yy = 0; yy < h; yy++) { const q = yy / Math.max(1, h), w = 7 * (1 - q * 0.4) * (0.85 + 0.25 * Math.sin(yy * 0.5 - time * 30)); for (let o = -w; o <= w; o += 0.5) L.f.dot(x + o, gy - yy, Math.abs(o) < w * 0.3 ? V[0] : Math.abs(o) < w * 0.7 ? V[1] : V[3], 1); } if (h > 2) for (let i = 0; i < 6; i++) L.f.dot(x + range(-9, 9), gy - h + range(-3, 3), V[0], 1); L.b.ring(x, gy, 8 + t * 40, 2, V[1], 1 - t / 0.9, 0.4); }); },
    },
    // PHANTOM FORCE: it fades into a dark portal and is gone; then lunges out of a rift beside the foe in violet slashes.
    "phantom-force": {
      vanish({ side, x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); timed(0.6, (L, t) => { const k = 1 - smooth(0.35, 0.6, t), r = 14 * Math.min(1, t / 0.15); for (let q = 0; q < TAU; q += 0.05) { const rr = r * (1 + 0.15 * Math.sin(q * 5 + time * 12)); L.f.dot(x + Math.cos(q) * rr * 0.6, y + Math.sin(q) * rr, PHANTOM[2], k); } L.f.disc(x, y, r * 0.45, PHANTOM[6], k); L.l.glow(x, y, 20, PHANTOM[3], 0.6 * k); }); for (let i = 0; i < 10; i++) add({ k: "smoke", x: x + range(-8, 8), y: y + range(-10, 10), vx: range(-10, 10), vy: -range(4, 14), life: range(0.6, 1), size: range(2.5, 4), smoke: [PHANTOM[4], PHANTOM[5], PHANTOM[6], PHANTOM[6]] }); },
      land({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.45); timed(0.6, (L, t) => { const k = 1 - smooth(0.3, 0.6, t), g = Math.min(1, t / 0.08); for (let q = 0; q < TAU; q += 0.05) L.f.dot(x - 10 + Math.cos(q) * 6 * g, y + Math.sin(q) * 13 * g, PHANTOM[2], k); streaks(L, x, y, Math.PI / 2 + 0.6, t - 0.06, PHANTOM, 3, 6, 16); L.l.glow(x, y, 22, PHANTOM[3], 0.6 * k); }); fxs.push(blowFx(x, y, PHANTOM, true)); },
    },
  });
  /* ---------- the last drawn sheets (2026-10-30, asked for: "redo all") ---------- */
  Object.assign(SIG, {
    // THE SLAM FAMILY (Thrash, Giga Impact's kin, Headbutt's...: render.js FAMILY): a full-body blow in
    // its type's colours - a POW star, a ring through the floor and dust thrown out.
    _slam: { hit({ x: wx, y: wy, type }) {
      const R = RAMP[type] ?? RAMP.normal, [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1];
      timed(0.5, (L, t) => { powStar(L, x, y, t); const u = t / 0.45; if (u < 1) L.b.ring(x, gy, 5 + u * 34, 2.5, R[2], 1 - u, 0.4); });
      for (let i = 0; i < 10; i++) { const a = range(0, TAU); add({ k: "dust", x: x + Math.cos(a) * 6, y: gy - 1, vx: Math.cos(a) * range(30, 70), vy: -range(4, 14), drag: 4, life: 0.6, size: range(1.8, 2.6), front: false }); }
    } },
    // THE CLAW FAMILY (Fury Swipes, Metal Claw's kin...): three slashes in its type's colours, white at the core.
    _claw: { fire({ x: wx, y: wy, dx, dy, type }) {
      const R = RAMP[type] ?? RAMP.normal, C = [RAMP.normal[0], R[0], R[1], R[2], R[4], R[5], R[6]];
      const [x, y] = reachOf(wx, wy, dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2 + 0.45;
      timed(0.45, (L, t) => streaks(L, x, y, a, t, C, 3, 5, 14));
    } },
  });
  /* ---------- batch 12 (2026-10-30, asked for: "no more animations to revamp?"): the most carried left ---------- */
  // A blast where its user stands (Self-Destruct, Explosion): a white flash, rings of fire, smoke - Explosion's a mushroom.
  function blowUp(wx, wy, r, big) {
    const [cx, cy] = toPx(wx, wy - 0.4), gy = toPx(0, wy + 0.42)[1], R = r * BODY_PX, C = BLAST;
    timed(big ? 1.5 : 1.0, (L, t) => {
      const f = smooth(0, 0.06, t) * (1 - smooth(0.1, 0.3, t)), u = smooth(0, 0.35, t), k = 1 - smooth(0.3, 0.6, t);
      if (f > 0) { L.f.disc(cx, cy, R * 0.6 * f + 4, C[0], f); L.l.glow(cx, cy, R * 1.3, C[1], f); }
      for (let i = 0; i < (big ? 3 : 2); i++) { const uu = smooth(0, 0.4, t - i * 0.06); if (uu > 0 && uu < 1) L.f.ring(cx, cy, 6 + uu * R, 4 * (1 - uu) + 1, C[i ? 3 : 1], Math.min(1, (1 - uu) * 1.3)); }
      if (k > 0) {
        L.b.ring(cx, gy, 6 + u * R, 3, C[4], k, 0.42);
        const g = smooth(0.02, 0.2, t);
        for (let q = 0; q < TAU; q += 0.08) { const rr = (R * 0.42 + noise(q * 5, 7) * 6) * g; L.f.disc(cx + Math.cos(q) * rr, cy + Math.sin(q) * rr * 0.8, 3.2, HEAT[Math.min(9, 2 + Math.floor(t * 14))], k); }
        L.l.glow(cx, cy, R, C[3], 0.8 * k);
      }
      if (big && t > 0.2) {
        // The mushroom: a stem of smoke climbing, and a cap rolling out over it, lit orange from beneath.
        const m = smooth(0.2, 0.8, t), mk = 1 - smooth(1.1, 1.5, t), top = cy - 10 - m * 42;
        for (let yy = cy; yy > top; yy -= 1.5) L.f.disc(cx + noise(yy * 0.15 + time * 2, 2) * 2, yy, 3 + (cy - yy) * 0.03, SMOKE[yy < top + 10 ? 1 : 2], mk * 0.9);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + time * 0.6, cr = 6 + 6 * m; L.f.disc(cx + Math.cos(a) * cr, top + Math.sin(a) * cr * 0.35, 5 + 2 * m, SMOKE[i % 2 ? 0 : 1], mk); L.f.dot(cx + Math.cos(a) * cr, top + Math.sin(a) * cr * 0.35 + 5, HEAT[5], mk * (1 - m)); }
      }
    });
    for (let i = 0; i < (big ? 18 : 10); i++) { const a = range(0, TAU), d = range(0, R * 0.4); add({ k: "smoke", x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.6, vx: Math.cos(a) * range(10, 30), vy: -range(15, big ? 50 : 30), life: range(0.8, 1.4), size: range(4, big ? 8 : 6), delay: 0.15 + range(0, 0.2) }); }
    for (let i = 0; i < (big ? 24 : 14); i++) { const a = range(0, TAU), sp = range(80, 200); add({ k: "spark", x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.5, life: range(0.3, 0.6), ramp: BLAST }); }
  }
  let kickN = 0;
  Object.assign(SIG, {
    // Protect: the dome snaps up from the body in a ring of light, sparkles round its rim (the dome itself is `shield`).
    protect: { fire({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.3); timed(0.4, (L, t) => { const u = smooth(0, 0.18, t), k = 1 - smooth(0.2, 0.4, t); L.f.ring(x, y, 4 + 13 * u, 2, SHIELDR[u < 0.6 ? 0 : 2], k, 16 / 15); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 3; sparkle(L.f, x + Math.cos(a) * 15 * u, y + Math.sin(a) * 16 * u, 2, SHIELDR[1], SHIELDR[3]); } L.l.glow(x, y, 22, SHIELDR[3], 0.7 * k); }); } },
    // Detect: a glint flashes in its eyes and its outline lights, every sense on edge.
    detect: { fire({ side, x: wx, y: wy }) { timed(0.5, (L, t) => { const [ex, ey] = eyesAt(side, wx, wy), g = t < 0.08 ? outBack(t / 0.08, 2) : 1 - smooth(0.15, 0.4, t); if (g > 0) { sparkle(L.f, ex + 3, ey, 7 * g, STARW[1], STARW[3]); for (const s2 of [-1, 1]) L.f.line(ex + 3 - 5 * g, ey + s2 * 5 * g, ex + 3 + 5 * g, ey - s2 * 5 * g, STARW[2], g); L.l.glow(ex + 3, ey, 14, STARW[2], 0.8 * g); } edgeLit(L, bodies[side], STARW, (1 - smooth(0.1, 0.4, t)) * 0.8, 9); }); } },
    // Double Team: afterimages flicker out to either side before the copies stand (their puffs are render.js's).
    "double-team": { fire({ side }) { const b = bodies[side]; if (!b) return; const [x0, y0] = origin(b), snap = { ...b }; timed(0.45, (L, t) => { const u = smooth(0, 0.3, t), k = 1 - smooth(0.25, 0.45, t), flick = Math.floor(t * 30) % 2; const on = maskAt(snap); for (const s2 of [-1, 1]) for (let i = 1; i <= 2; i++) { const ox = Math.round(x0 + s2 * i * 12 * u), a = (k > 0.6 ? 1 : k / 0.6) * (i === 1 ? 1 : 0.8), C = i === 1 && flick ? DASHR : AIRB; for (let j = 0; j < snap.h; j++) for (let q = 0; q < snap.w; q++) if (on(q, j)) L.b.dot(ox + q, y0 + j, !on(q - 1, j) || !on(q + 1, j) || !on(q, j - 1) ? C[1] : C[3], a); } }); } },
    // Recover: it glows gold from within, rings of light climb it and sparkles rise off it.
    recover: { fire({ side, x: wx, y: wy }) { const [cx, cy] = at(side, wx, wy); for (let i = 0; i < 10; i++) add({ k: "star", x: cx + range(-12, 12), y: cy + range(-14, 10), vy: -range(10, 24), life: range(0.5, 0.8), size: 2, ramp: RECOV, delay: i * 0.05 }); timed(0.8, (L, t) => { const k = smooth(0, 0.1, t) * (1 - smooth(0.55, 0.8, t)), b = bodies[side]; auraOn(L, b, RECOV, k, Math.exp(-(((t - 0.1) / 0.06) ** 2)), 1); if (!b) return; const [bx, , , y0] = centreOf(b), gy = y0 + b.h; for (let i = 0; i < 3; i++) { const u = (t * 1.6 + i / 3) % 1; oval(L.f, bx, gy - u * b.h * 1.1, 11 * (1 - u * 0.3), 3, RECOV[i === 1 ? 0 : 2], k * (1 - u)); } }); } },
    // Withdraw: a shell of blue light closes over it, a glint running round its rim.
    withdraw: { fire({ side }) { timed(0.6, (L, t) => { const b = bodies[side]; if (!b) return; const k = smooth(0, 0.08, t) * (1 - smooth(0.4, 0.6, t)), [cx, , , y0] = centreOf(b), V = RAMP.water, rx = b.w * 0.62, ry = b.h * 0.62, cy2 = y0 + b.h * 0.95; edgeLit(L, b, V, k, 6); for (let q = Math.PI; q <= TAU; q += 0.02) { const px2 = cx + Math.cos(q) * rx, py = cy2 + Math.sin(q) * ry; L.f.dot(px2, py, V[1], k); L.f.dot(px2, py + 1, V[3], k); } const g = ((t * 2) % 1) * Math.PI + Math.PI; sparkle(L.f, cx + Math.cos(g) * rx, cy2 + Math.sin(g) * ry, 3, V[0], V[2]); L.l.glow(cx, cy2 - ry * 0.5, rx * 1.2, V[3], 0.4 * k); }); } },
    // Life Dew: drops of water fall on it out of nowhere, splash in sparkles and ripple round its feet.
    "life-dew": { fire({ side, x: wx, y: wy }) { const [cx, cy] = at(side, wx, wy), gy = toPx(0, wy + 0.42)[1], V = RAMP.water; for (let i = 0; i < 14; i++) add({ k: "drop", x: cx + range(-14, 14), y: cy - range(40, 70), vy: range(60, 110), g: 260, life: 0.9, ramp: V, gy: gy - range(0, 4), delay: i * 0.035 }); for (let i = 0; i < 8; i++) add({ k: "star", x: cx + range(-12, 12), y: cy + range(-10, 8), vy: -range(6, 16), life: 0.6, size: 2, ramp: V, delay: 0.3 + i * 0.04 }); timed(0.9, (L, t) => { const k = smooth(0.25, 0.4, t) * (1 - smooth(0.65, 0.9, t)); auraOn(L, bodies[side], V, k * 0.7, 0, 1); for (let i = 0; i < 2; i++) { const u = (t - 0.3 - i * 0.15) / 0.5; if (u > 0 && u < 1) L.b.ring(cx, gy, 4 + u * 22, 1.5, V[1], 1 - u, 0.35); } }); } },
    // Roost: it settles, white feathers drifting down round it, a soft glow and a ring where it lands.
    roost: { fire({ side, x: wx, y: wy }) { const [cx, cy] = at(side, wx, wy), gy = toPx(0, wy + 0.42)[1]; const fe = Array.from({ length: 10 }, (_, i) => ({ x: cx + range(-18, 18), y: cy - range(18, 40), t0: i * 0.05, ph: range(0, TAU) })); fxs.push(floorRing(cx, gy, FEATHER, 0.6, 20)); timed(1.2, (L, t) => { auraOn(L, bodies[side], FEATHER, smooth(0, 0.15, t) * (1 - smooth(0.5, 0.8, t)) * 0.8, 0, 0.5); for (const f of fe) { const u = t - f.t0; if (u < 0) continue; const y = Math.min(gy - 2, f.y + u * 34), sw = Math.sin(u * 5 + f.ph); if (u < 1.1) leafAt(L, f.x + sw * 5, y, 1.2 + sw * 0.6, 4, FEATHER); } }); } },
    // Quiver Dance: glittering scales of every colour spiral up round it as it dances.
    "quiver-dance": { fire({ side }) { timed(0.9, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, , , y0] = centreOf(b), gy = y0 + b.h, k = smooth(0, 0.1, t) * (1 - smooth(0.6, 0.9, t)), n = RAINBOW.length; for (let i = 0; i < 36; i++) { const u = (i / 36 + t * 0.9) % 1, a = u * TAU * 2.5 + time * 4 + (i & 1) * Math.PI, r = b.w * 0.55 + 3, front = Math.sin(a) > 0, py = gy - u * (b.h + 10) + Math.sin(a) * 3; if (k > bayer(i, 0)) sparkle(front ? L.f : L.b, cx + Math.cos(a) * r, py, i % 3 ? 1 : 2, RAINBOW[i % n], RAINBOW[(i + 3) % n]); } L.l.glow(cx, gy - b.h / 2, b.w, GLEAM[2], 0.35 * k); }); } },
    // Play Rough: a cartoon fight cloud on the foe - pink puffs churning, fists popping out, stars and hearts flung.
    "play-rough": { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.3), R = RAMP.fairy, puffs = Array.from({ length: 8 }, (_, i) => [(i / 8) * TAU, range(8, 13), range(5, 8)]); timed(0.8, (L, t) => { const g = Math.min(1, t / 0.08), k = 1 - smooth(0.5, 0.7, t); for (const [a, d, r] of puffs) { const q = a + time * 5, px2 = x + Math.cos(q) * d * g, py = y + Math.sin(q) * d * 0.6 * g; L.f.disc(px2, py, r * g + 1, R[4], k); L.f.disc(px2, py, r * g, R[2], k); L.f.disc(px2 - 1, py - 1, r * g * 0.5, R[1], k); } for (let i = 0; i < 3; i++) { const a = i * 2.3 + 0.5; powStar(L, x + Math.cos(a) * 18, y + Math.sin(a) * 12, (t - 0.12 - i * 0.12) * 1.6); } }); for (let i = 0; i < 9; i++) { const a = range(0, TAU), sp = range(50, 100); add({ k: i % 3 ? "star" : "heart", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, drag: 2.5, life: range(0.5, 0.8), size: 2, ramp: R, delay: range(0, 0.4) }); } } },
    // Shadow Ball: a black core in a violet rim that boils, shedding shadow; it tears open into shards and smoke.
    "shadow-ball": {
      shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4), r = 7, C = SHADOWB; if (rand() < 0.7) add({ k: "mote", x: x + range(-4, 4), y: y + range(-4, 4), vx: -dx * 40 + range(-10, 10), vy: -dy * 40 - range(5, 15), drag: 2, life: range(0.3, 0.5), ramp: C }); queued.push((L) => { L.f.disc(x, y, r + 2, C[3], 0.6); L.f.disc(x, y, r + 1, C[2]); L.f.disc(x, y, r, C[5]); L.f.disc(x + 0.5, y + 0.5, r * 0.55, C[6]); for (let q = 0; q < TAU; q += 0.15) { const rr = r + 1.5 + noise(q * 3 + time * 14, 5) * 1.6; L.f.dot(x + Math.cos(q) * rr, y + Math.sin(q) * rr, C[noise(q * 2 - time * 10, 9) > 0.2 ? 1 : 3]); } L.f.set(x - 2, y - 2, C[2]); L.l.glow(x, y, r * 3.2, C[3], 0.55); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), C = SHADOWB; fxs.push(blowFx(x, y, C, true)); timed(0.5, (L, t) => { const u = t / 0.5; L.f.ring(x, y, 4 + u * 26, 3 * (1 - u) + 1, C[u < 0.3 ? 1 : 3], 1 - u); L.f.disc(x, y, 7 * (1 - smooth(0, 0.3, t)), C[6], 1); }); for (let i = 0; i < 12; i++) { const a = range(0, TAU), sp = range(40, 110); add({ k: "shard", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.5, life: range(0.35, 0.6), size: range(1.5, 2.5), a, va: range(-8, 8), ramp: C }); } for (let i = 0; i < 6; i++) add({ k: "smoke", x: x + range(-5, 5), y: y + range(-5, 5), vx: range(-15, 15), vy: -range(5, 18), life: range(0.5, 0.8), size: 3, smoke: [C[4], C[5], C[6], C[6]] }); },
    },
    // Energy Ball: a pulsing sphere of green light drawing motes into it; it bursts in a flash, leaves flung.
    "energy-ball": {
      shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), C = ENERGYB, p = 1 + 0.12 * Math.sin(time * 30); queued.push((L) => { orbAt(L, x, y, 7 * p, C); L.f.disc(x, y, 3 * p, C[0]); for (let i = 0; i < 6; i++) { const a = time * 6 + (i * TAU) / 6, d = 14 - ((time * 2 + i / 6) % 1) * 6; L.f.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, C[1]); L.f.dot(x + Math.cos(a) * (d + 1), y + Math.sin(a) * (d + 1), C[3]); } rings(L.f, x, y, 9.5 * p, 9.5 * p, C[2], 0.5); L.l.glow(x, y, 24, C[3], 0.6); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), C = ENERGYB; fxs.push(blowFx(x, y, C, true)); timed(0.45, (L, t) => { const u = t / 0.45; L.f.ring(x, y, 5 + u * 24, 2, C[u < 0.4 ? 0 : 2], 1 - u); L.f.disc(x, y, 9 * (1 - smooth(0, 0.2, t)), C[1], 1); }); for (let i = 0; i < 10; i++) { const a = range(0, TAU), sp = range(40, 100); add({ k: i % 2 ? "leaf" : "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, drag: 2.5, sway: 20, a, va: range(-8, 8), life: range(0.5, 0.8), ramp: C }); } },
    },
    // Moonblast: a moon rises over it and pours pink light into it; a pink orb with a crescent orbiting; stars on the hit.
    moonblast: {
      fire({ side, x: wx, y: wy }) { timed(0.7, (L, t) => { const [cx, , , y0] = at(side, wx, wy), my = Math.max(8, y0 - 30), k = smooth(0, 0.12, t) * (1 - smooth(0.45, 0.7, t)); L.f.disc(cx, my, 8, MOONC[3], k); L.f.disc(cx, my, 7, MOONC[1], k); L.f.disc(cx - 1.5, my - 1.5, 3, MOONC[0], k); for (const [ox, oy, r] of [[2, 2, 1.5], [-3, 3, 1], [3, -3, 1]]) L.f.disc(cx + ox, my + oy, r, MOONC[2], k); L.l.glow(cx, my, 24, MOONP[2], 0.7 * k); for (let i = 0; i < 3; i++) L.f.line(cx + (i - 1) * 4, my + 8, cx + (i - 1) * 2, y0 + 10, MOONP[2], 0.35 * k); auraOn(L, bodies[side], MOONP, k * 0.7, 0, 1); }); },
      shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4), C = MOONP; if (rand() < 0.5) add({ k: "star", x: x + range(-3, 3), y: y + range(-3, 3), vx: -dx * 30, vy: -dy * 30, life: 0.4, size: 1, ramp: C }); queued.push((L) => { orbAt(L, x, y, 6, C); L.f.disc(x, y, 3, C[0]); const a = time * 8; for (let q = -1; q <= 1; q += 0.1) { L.f.dot(x + Math.cos(a + q) * 10, y + Math.sin(a + q) * 10, C[1]); L.f.dot(x + Math.cos(a + q) * 9, y + Math.sin(a + q) * 9, C[2], 1 - Math.abs(q)); } L.l.glow(x, y, 22, C[3], 0.7); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), C = MOONP, st = Array.from({ length: 6 }, (_, i) => [(i / 6) * TAU + range(-0.2, 0.2), range(50, 80)]); fxs.push(blowFx(x, y, C, true)); timed(0.6, (L, t) => { const k = 1 - smooth(0.35, 0.6, t); for (const [a, sp] of st) starAt(L, x + Math.cos(a) * sp * t, y + Math.sin(a) * sp * t, 3 * k + 0.5, t * 6, C, k); L.f.ring(x, y, 4 + t * 50, 2, C[1], k); }); },
    },
    // Sludge Bomb: a wobbling blob of sludge dripping as it flies; it splats, splashes and leaves a bubbling puddle.
    "sludge-bomb": {
      shot({ x: wx, y: wy, dx }) { const [x, y] = toPx(wx, wy - 0.4), C = SLUDGE; if (rand() < 0.6) add({ k: "drop", x: x - dx * 4, y: y + 3, vx: -dx * 20, vy: 10, g: 300, life: 0.4, ramp: C, gy: y + 14 }); queued.push((L) => { blob(L, x, y, 7, C); L.f.disc(x - 2.5, y - 2.5, 1.6, C[0]); L.f.set(x + 3, y + 1, C[1]); L.f.disc(x + 1, y + 7.5, 1.2, C[3]); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), gy = toPx(0, wy + 0.42)[1], C = SLUDGE; for (let i = 0; i < 18; i++) { const a = range(0, TAU), sp = range(40, 120); add({ k: "drop", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, g: 320, life: range(0.4, 0.8), ramp: C, gy }); } for (let i = 0; i < 6; i++) add({ k: "bubble", x: x + range(-10, 10), y: gy - 2, vy: -range(8, 18), sway: 8, life: range(0.6, 1), size: range(1, 2.2), ramp: C, delay: 0.2 + i * 0.08 }); timed(1.2, (L, t) => { const g = Math.max(0.1, Math.min(1, t / 0.15)), k = 1 - smooth(0.8, 1.2, t); for (let py = -4; py <= 4; py++) for (let px2 = -16; px2 <= 16; px2++) { const d = (px2 / (16 * g)) ** 2 + (py / (4 * g)) ** 2 + noise(px2 * 0.4, py + 9) * 0.25; if (d <= 1) L.b.dot(x + px2, gy + py, d > 0.75 ? C[5] : d < 0.2 ? C[2] : C[3], k); } L.f.disc(x, y, 8 * (1 - smooth(0, 0.15, t)), C[2], 1); }); },
    },
    // Ice Beam's hit: frost crystals bloom on the foe (its stream is drawn as it pours: STREAM_RAMP and `stream`).
    "ice-beam": { hit({ x: wx, y: wy }) { if (rand() > 0.5) return; const [x, y] = toPx(wx, wy - 0.4), C = ICEBEAM, fl = Array.from({ length: 3 }, () => [range(-9, 9), range(-9, 7)]); timed(0.4, (L, t) => { const k = 1 - smooth(0.2, 0.4, t), g = Math.min(1, t / 0.1); for (const [ox, oy] of fl) flake(L, x + ox, y + oy, 4 * g, C, k); }); } },
    // Aqua Jet: water spirals round it as it shoots forward, foam at its front and spray in its wake.
    "aqua-jet": {
      fire({ side, dx, dy }) { const V = RAMP.water; timed(0.45, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b), k = 1 - smooth(0.3, 0.45, t), r = Math.max(b.w, b.h) * 0.55 + 2; for (let s2 = 0; s2 < 2; s2++) for (let q = 0; q < TAU * 1.5; q += 0.06) { const a = q * 2 + time * 26 + s2 * Math.PI, along = (q / (TAU * 1.5) - 0.5) * r * 2, rr = r * 0.55, front = Math.sin(a) > 0; (front ? L.f : L.b).disc(cx + dx * along - dy * Math.cos(a) * rr, cy + dy * along + dx * Math.cos(a) * rr + Math.sin(a) * 2, 1, V[front ? (s2 ? 1 : 2) : 4], k); } for (let q = -1.1; q <= 1.1; q += 0.05) { const ax = Math.cos(q) * 5, ay = Math.sin(q) * 12; L.f.dot(cx + dx * r + ax * dx - ay * dy, cy + dy * r + ax * dy + ay * dx, V[q > -0.4 && q < 0.4 ? 0 : 1], k); } L.l.glow(cx, cy, r * 1.5, V[3], 0.5 * k); }, (t) => { if (t > 0.35) return; const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b); for (let i = 0; i < 2; i++) add({ k: "drop", x: cx - dx * 10 + range(-4, 4), y: cy + range(-4, 4), vx: -dx * range(30, 70) + range(-20, 20), vy: -range(20, 60), g: 320, life: range(0.3, 0.6), ramp: V, gy: cy + b.h * 0.5 }); }); },
      hit({ x: wx, y: wy, dx }) { const V = RAMP.water, [x, y] = toPx(wx, wy - 0.35), gy = toPx(0, wy + 0.42)[1]; fxs.push(blowFx(x, y, V, false)); for (let i = 0; i < 14; i++) { const [vx, vy] = spray(dx || 1, 0, 2.6, 50, 130); add({ k: "drop", x, y, vx, vy: vy - 40, g: 320, life: range(0.4, 0.7), ramp: V, gy }); } },
    },
    // Flare Blitz: it charges wrapped in a roaring fireball, flames streaming behind; the blow explodes, the recoil flickers it.
    "flare-blitz": {
      fire({ side, dx, dy }) { timed(0.5, (L, t) => { const b = bodies[side], k = 1 - smooth(0.35, 0.5, t); edgeFlames(L, b, HEAT, k, 0, 1, 2); if (!b) return; const [cx, cy] = centreOf(b), r = Math.max(b.w, b.h) * 0.62; for (let q = 0; q < TAU; q += 0.05) { const tail = Math.max(0, -(Math.cos(q) * dx + Math.sin(q) * dy)), rr = r + noise(q * 4 + time * 18, 2) * 3 + tail * 8; for (let d = r - 3; d < rr; d += 0.8) L.b.dot(cx + Math.cos(q) * d, cy + Math.sin(q) * d, HEAT[Math.min(9, 3 + Math.floor((d - r + 3) / 2.2))], k); } L.l.glow(cx, cy, r * 2.2, HEAT[3], 0.7 * k); }, (t) => { if (t > 0.4) return; const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b); for (let i = 0; i < 2; i++) add({ k: "flame", x: cx - dx * 8 + range(-5, 5), y: cy + range(-6, 6), vx: -dx * 50 + range(-15, 15), vy: -dy * 50 - range(10, 30), drag: 2, life: range(0.25, 0.45), size: range(1, 1.8) }); }); },
      hit({ side, x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, HEAT, true)); for (let i = 0; i < 16; i++) { const a = range(0, TAU), sp = range(40, 120); add({ k: "flame", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, drag: 2.5, life: range(0.3, 0.55), size: range(1.2, 2) }); } timed(0.5, (L, t) => { const u = t / 0.5; L.f.ring(x, y, 5 + u * 30, 3 * (1 - u) + 1, HEAT[u < 0.4 ? 1 : 4], 1 - u); if (t > 0.15 && Math.floor(t * 20) % 2) outline(L, bodies[1 - side], HEAT[5], 1 - smooth(0.3, 0.5, t)); }); },
    },
    // Brave Bird: it dives wrapped in blue fire shaped like a bird, wings swept back; feathers on the blow, the recoil flickers it.
    "brave-bird": {
      fire({ side, dx, dy }) { timed(0.5, (L, t) => { const b = bodies[side], k = 1 - smooth(0.35, 0.5, t), C = BLUEFIRE; edgeFlames(L, b, C, k, 0, 1, 1.6); if (!b) return; const [cx, cy] = centreOf(b), flap = Math.sin(time * 30) * 3; for (const s2 of [-1, 1]) for (let d = 0; d < 26; d += 0.5) { const u = d / 26, px2 = cx + dx * (6 - d * 0.9) - dy * s2 * (4 + d * 0.8), py = cy + dy * (6 - d * 0.9) + dx * s2 * (4 + d * 0.8) + s2 * flap * u; for (let w = 0; w < 4 * (1 - u) + 1; w++) L.f.dot(px2 + dx * w * 0.7, py + dy * w * 0.7 - w * 0.6, C[w < 1 ? 0 : u < 0.5 ? 2 : 3], k * (1 - u * 0.6)); } L.f.disc(cx + dx * 8, cy + dy * 8, 3, C[0], k); L.l.glow(cx, cy, 30, C[3], 0.7 * k); }); },
      hit({ side, x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), C = BLUEFIRE; fxs.push(blowFx(x, y, C, true)); for (let i = 0; i < 10; i++) { const a = range(0, TAU), sp = range(40, 110); add({ k: "leaf", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, drag: 2.5, sway: 25, a, va: range(-6, 6), life: range(0.6, 1), ramp: FEATHER }); } timed(0.5, (L, t) => { const u = t / 0.5; L.f.ring(x, y, 5 + u * 32, 2.5 * (1 - u) + 1, C[u < 0.3 ? 0 : 3], 1 - u); if (t > 0.15 && Math.floor(t * 20) % 2) outline(L, bodies[1 - side], C[4], 1 - smooth(0.3, 0.5, t)); }); },
    },
    // Megahorn: its horn glows into a lance of white-green light as it charges; the blow pierces in a spray of sparks.
    megahorn: {
      fire({ side, dx, dy }) { timed(0.5, (L, t) => { const b = bodies[side], k = 1 - smooth(0.35, 0.5, t), C = MEGAH; auraOn(L, b, C, k * 0.6, 0, 0.5); if (!b) return; const [cx, , , y0] = centreOf(b), hx = cx + dx * b.w * 0.45, hy = y0 + b.h * 0.3 + dy * b.h * 0.3, g = Math.min(1, t / 0.1); for (let d = 0; d < 18 * g; d += 0.5) { const w = 3.5 * (1 - d / 18); for (let o = -w; o <= w; o += 0.5) L.f.dot(hx + dx * d - dy * o, hy + dy * d + dx * o, Math.abs(o) < w * 0.35 ? C[0] : Math.abs(o) < w * 0.75 ? C[2] : C[4], k); } L.l.glow(hx + dx * 10, hy + dy * 10, 18, C[3], 0.7 * k); }); },
      hit({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.35), C = MEGAH; fxs.push(blowFx(x, y, C, true)); timed(0.35, (L, t) => { const k = 1 - t / 0.35; for (let i = -2; i <= 2; i++) { const l = 30 - Math.abs(i) * 6; L.f.line(x - dx * 6 - dy * i * 3, y - dy * 6 + dx * i * 3, x + dx * l - dy * i * 3, y + dy * l + dx * i * 3, C[i ? 2 : 0], k); } }); for (let i = 0; i < 10; i++) { const [vx, vy] = spray(dx || 1, dy, 1.4, 80, 180); add({ k: "spark", x, y, vx, vy, drag: 3, life: range(0.2, 0.35), ramp: C }); } },
    },
    // Cross Chop: two chops cross in an X of light where it lands, a white flash at the crossing.
    "cross-chop": {
      fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.1); timed(0.5, (L, t) => { streaks(L, x, y, Math.PI / 4, t, FIGHTR, 3, 2, 22); streaks(L, x, y, -Math.PI / 4, t - 0.07, FIGHTR, 3, 2, 22); if (t > 0.1 && t < 0.25) { L.f.disc(x, y, 5 * (1 - (t - 0.1) / 0.15), FIGHTR[0]); L.l.glow(x, y, 20, FIGHTR[3], 0.8); } }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, FIGHTR, true)); },
    },
    // Retaliate: it burns red with the fallen's fury, and the blow lands in a POW and red shock rings.
    retaliate: {
      fire({ side }) { timed(0.4, (L, t) => { const k = 1 - smooth(0.25, 0.4, t); auraOn(L, bodies[side], REDAURA, k, Math.exp(-((t / 0.06) ** 2)), 1); edgeLit(L, bodies[side], REDAURA, k * 0.8, 8); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, REDAURA, true)); timed(0.45, (L, t) => { powStar(L, x, y, t); for (let i = 0; i < 2; i++) { const u = (t - i * 0.08) / 0.35; if (u > 0 && u < 1) L.f.ring(x, y, 6 + u * 30, 2, REDAURA[i ? 3 : 1], 1 - u); } }); },
    },
    // Sky Attack: it blazes with a brilliant dawn-coloured aura, rays turning round it; the blow is a sunburst, feathers flung.
    "sky-attack": {
      fire({ side }) { timed(0.5, (L, t) => { const b = bodies[side], k = 1 - smooth(0.35, 0.5, t); edgeFlames(L, b, SKYATK, k, 0, 1, 1.5); auraOn(L, b, SKYATK, k * 0.8, Math.exp(-(((t - 0.05) / 0.05) ** 2)), 1); if (!b) return; const [cx, cy] = centreOf(b); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 2; L.f.line(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, cx + Math.cos(a) * (22 + 6 * k), cy + Math.sin(a) * (22 + 6 * k), SKYATK[i % 2 ? 1 : 3], k); } L.l.glow(cx, cy, 34, SKYATK[2], 0.8 * k); }); },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35), C = SKYATK; fxs.push(blowFx(x, y, C, true)); timed(0.5, (L, t) => { const k = 1 - smooth(0.2, 0.5, t), g = Math.min(1, t / 0.06); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, l = (i % 3 ? 16 : 30) * g; L.f.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, C[i % 3 ? 2 : 0], k); } L.f.disc(x, y, 8 * k, C[0], k); L.l.glow(x, y, 40, C[3], k); }); for (let i = 0; i < 8; i++) { const a = range(0, TAU), sp = range(40, 100); add({ k: "leaf", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, drag: 2.5, sway: 25, a, va: range(-6, 6), life: range(0.6, 1), ramp: FEATHER }); } },
    },
    // Double Kick: a glowing foot and a POW for each kick, the second beside the first.
    "double-kick": { hit({ x: wx, y: wy, dx }) { const [x, y] = toPx(wx, wy - 0.35), n = kickN++ % 2, ox = n ? 5 : -5, oy = n ? 3 : -4, C = FIGHTR; timed(0.4, (L, t) => { const k = 1 - smooth(0.12, 0.3, t), fx2 = x + ox - (dx || 1) * 8 * (1 - Math.min(1, t / 0.05)); if (k > 0) { L.f.disc(fx2, y + oy, 4, C[4], k); L.f.disc(fx2, y + oy, 3, C[2], k); for (const [tx, ty] of [[-2, -4], [0, -5], [2, -4]]) L.f.disc(fx2 + tx, y + oy + ty, 1, C[1], k); } powStar(L, x + ox, y + oy, (t - 0.04) * 1.3); }); } },
    // Stomping Tantrum: it flickers red with rage and stamps; rings heave through the floor, cracks run and rocks fly.
    "stomping-tantrum": {
      fire({ side }) { timed(0.35, (L, t) => { if (Math.floor(t * 24) % 2) auraOn(L, bodies[side], REDAURA, 1 - t / 0.35, 0, 0.5); }); },
      hit({ x: wx, y: wy }) { const [x, gy] = toPx(wx, wy + 0.42), lines = Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * TAU + range(-0.3, 0.3), l = range(14, 24); return [x + Math.cos(a) * l, gy + Math.sin(a) * l * 0.42, i]; }); for (let i = 0; i < 10; i++) add({ k: "chunk", x: x + range(-10, 10), y: gy - 2, vx: range(-60, 60), vy: -range(60, 150), g: 380, life: range(0.5, 0.9), ramp: EARTHC, gy, delay: range(0, 0.25) }); timed(0.8, (L, t) => { for (let i = 0; i < 3; i++) { const u = (t - i * 0.12) / 0.4; if (u > 0 && u < 1) L.b.ring(x, gy, 4 + u * 30, 2.5, EARTHC[i % 2 ? 3 : 0], 1 - u, 0.42); } const run = smooth(0, 0.15, t), k = 1 - smooth(0.5, 0.8, t); for (const [x1, y1, i] of lines) crack(L, x, gy, x + (x1 - x) * run, gy + (y1 - gy) * run, EARTHC, k, i + 3); }); },
    },
    // Tri Attack: three orbs - fire, ice and lightning - turning at the points of a triangle; each bursts on the foe.
    "tri-attack": {
      shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), T3 = [RAMP.fire, RAMP.ice, RAMP.electric]; queued.push((L) => { const pts = [0, 1, 2].map((i) => { const a = time * 7 + (i * TAU) / 3; return [x + Math.cos(a) * 7, y + Math.sin(a) * 7]; }); for (let i = 0; i < 3; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 3]; L.f.line(ax, ay, bx, by, RAMP.normal[1], 0.8); } pts.forEach(([px2, py], i) => orbAt(L, px2, py, 3, T3[i])); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), T3 = [RAMP.fire, RAMP.ice, RAMP.electric]; for (let i = 0; i < 3; i++) { const a = (i * TAU) / 3 - Math.PI / 2; fxs.push(blowFx(x + Math.cos(a) * 7, y + Math.sin(a) * 7, T3[i], false)); } for (let i = 0; i < 4; i++) add({ k: "flame", x, y, vx: range(-50, 50), vy: -range(30, 70), drag: 2, life: 0.4, size: 1.3 }); for (let i = 0; i < 6; i++) { const a = range(0, TAU), sp = range(40, 90); add({ k: i % 2 ? "shard" : "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: 0.35, size: 1.5, a, ramp: i % 2 ? RAMP.ice : RAMP.electric }); } },
    },
    // Aura Sphere: its aura flares blue, and a sphere of it flies with a flickering rim; rings burst from the hit.
    "aura-sphere": {
      fire({ side }) { timed(0.4, (L, t) => auraOn(L, bodies[side], AURAB, 1 - smooth(0.2, 0.4, t), Math.exp(-((t / 0.06) ** 2)), 1)); },
      shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4), C = AURAB, r = 5; if (rand() < 0.7) add({ k: "mote", x: x + range(-3, 3), y: y + range(-3, 3), vx: -dx * 50 + range(-15, 15), vy: -dy * 50 + range(-15, 15), drag: 2, life: 0.3, ramp: C }); queued.push((L) => { for (let q = 0; q < TAU; q += 0.1) { const rr = r + 2 + noise(q * 3 - time * 16, 4) * 2.2; for (let d = r; d < rr; d += 0.7) L.f.dot(x + Math.cos(q) * d, y + Math.sin(q) * d, C[d > rr - 1 ? 4 : 3]); } L.f.disc(x, y, r, C[2]); L.f.disc(x, y, r * 0.55, C[1]); L.f.disc(x - 1, y - 1, 1.5, C[0]); L.l.glow(x, y, 22, C[3], 0.7); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), C = AURAB; fxs.push(blowFx(x, y, C, true)); timed(0.5, (L, t) => { for (let i = 0; i < 3; i++) { const u = (t - i * 0.06) / 0.35; if (u > 0 && u < 1) L.f.ring(x, y, 4 + u * 30, 2, C[i % 2 ? 3 : 0], 1 - u); } }); for (let i = 0; i < 10; i++) { const a = range(0, TAU), sp = range(60, 130); add({ k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: range(0.2, 0.4), ramp: C }); } },
    },
    // Inferno: a great churning fireball; on the foe it becomes a column of fire spiralling up round it.
    inferno: {
      shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 2; i++) add({ k: "flame", x: x - dx * 4 + range(-3, 3), y: y + range(-3, 3), vx: -dx * 40 + range(-10, 10), vy: -dy * 40 - range(10, 25), drag: 2, life: range(0.25, 0.4), size: range(1.2, 1.8) }); queued.push((L) => { const r = 6 + Math.sin(time * 40) * 0.6; for (let q = 0; q < TAU; q += 0.12) { const rr = r + 1.5 + noise(q * 4 + time * 22, 6) * 2; L.f.disc(x + Math.cos(q) * rr * 0.8, y + Math.sin(q) * rr * 0.8, 1.6, HEAT[5]); } L.f.disc(x, y, r, HEAT[4]); L.f.disc(x, y, r * 0.75, HEAT[3]); L.f.disc(x - 0.5, y - 0.5, r * 0.45, HEAT[1]); L.f.disc(x - 1, y - 1, r * 0.2, HEAT[0]); L.l.glow(x, y, 26, HEAT[4], 0.8); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), gy = toPx(0, wy + 0.42)[1]; fxs.push(blowFx(x, y, HEAT, true)); timed(0.9, (L, t) => { const k = smooth(0, 0.1, t) * (1 - smooth(0.6, 0.9, t)); for (let i = 0; i < 40; i++) { const u = i / 40, a = u * TAU * 3 + time * 14, r = 9 + u * 5, front = Math.sin(a) > 0; (front ? L.f : L.b).disc(x + Math.cos(a) * r, gy - u * 36 + Math.sin(a) * r * 0.3, 1.8 - u * 0.6, HEAT[Math.min(9, 1 + Math.floor(u * 6) + (front ? 0 : 2))], k); } L.b.ring(x, gy, 13, 2, HEAT[5], k, 0.35); L.l.glow(x, gy - 16, 30, HEAT[4], 0.8 * k); }, (t) => { if (t < 0.7 && rand() < 0.7) add({ k: rand() < 0.5 ? "ember" : "flame", x: x + range(-10, 10), y: gy - range(0, 20), vx: range(-15, 15), vy: -range(30, 70), drag: 1.5, life: range(0.3, 0.6), size: 1.2 }); }); },
    },
    // Leaf Storm: a whirling storm of leaves flung at the foe; they scatter round it in a spinning ring.
    "leaf-storm": {
      shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4), C3 = [LEAFB, RAMP.grass, ENERGYB]; queued.push((L) => { for (let i = 0; i < 14; i++) { const u = i / 14, a = time * 9 + u * TAU * 2, r = 5 + u * 12, back = u * 14; leafAt(L, x - dx * back + Math.cos(a) * r, y - dy * back + Math.sin(a) * r * 0.7, a + time * 6, 4.5, C3[i % 3]); } L.l.glow(x, y, 20, RAMP.grass[3], 0.4); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 18; i++) { const a = range(0, TAU), sp = range(50, 130); add({ k: "leaf", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, drag: 2, sway: 30, a, va: range(-12, 12), life: range(0.5, 0.9), ramp: i % 2 ? LEAFB : RAMP.grass }); } timed(0.5, (L, t) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 12, r = 6 + t * 30; leafAt(L, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, a + Math.PI / 2, 3.5, LEAFB); } L.l.glow(x, y, 20, LEAFB[3], 0.5 * (1 - t / 0.5)); }); },
    },
    // Shock Wave: a crackling arc of lightning racing ahead, bowed toward the foe; it never misses, and crackles on it.
    "shock-wave": {
      shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4), V = RAMP.electric; queued.push((L) => { const a0 = Math.atan2(dy, dx), bx = x - dx * 4, by = y - dy * 4; let prev = null; for (let q = -1.1; q <= 1.11; q += 0.1) { const j = (rand() - 0.5) * 2.5, px2 = bx + Math.cos(a0 + q) * (12 + j), py = by + Math.sin(a0 + q) * (12 + j); if (prev) { L.f.line(prev[0], prev[1], px2, py, V[0]); L.f.line(prev[0] - dx, prev[1] - dy, px2 - dx, py - dy, V[1]); L.f.line(prev[0] - dx * 2, prev[1] - dy * 2, px2 - dx * 2, py - dy * 2, V[3]); } prev = [px2, py]; } L.f.disc(bx + dx * 8, by + dy * 8, 1.5, V[0]); L.l.glow(x, y, 18, V[2], 0.7); }); return true; },
      hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), V = RAMP.electric; fxs.push(crackleFx(x, y, V, 0.4)); timed(0.4, (L, t) => { const u = t / 0.4; L.f.ring(x, y, 4 + u * 26, 1.5, V[u < 0.4 ? 0 : 2], 1 - u); }); },
    },
    // Sludge Wave: a wall of sludge rolls out over the floor to the pulse's reach, its crest splashing, and sinks away.
    "sludge-wave": { pulse({ x: wx, y: wy, r }) {
      const [cx, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX, C = SLUDGE;
      timed(1.0, (L, t) => {
        const u = smooth(0, 0.6, t), rr = 6 + u * R, k = 1 - smooth(0.6, 1.0, t), h = 6 * (1 - u * 0.5);
        for (let q = 0; q < TAU; q += 0.03) { const ex = cx + Math.cos(q) * rr, ey = gy + Math.sin(q) * rr * 0.42, buf = Math.sin(q) > 0 ? L.f : L.b, hh = h * (0.7 + 0.3 * noise(q * 5 + time * 8, 3)); for (let yy = 0; yy < hh; yy++) buf.dot(ex, ey - yy, yy > hh - 1.5 ? C[1] : yy > hh * 0.5 ? C[3] : C[4], k); }
        for (let py = -Math.ceil(rr * 0.42); py <= rr * 0.42; py++) for (let px2 = -Math.ceil(rr); px2 <= rr; px2++) { const d = (px2 / rr) ** 2 + (py / (rr * 0.42)) ** 2; if (d < 0.92 && (px2 + py * 3) % 2 === 0) L.b.dot(cx + px2, gy + py, C[5], k * 0.6); }
      }, (t) => { if (t > 0.6 || rand() > 0.8) return; const q = range(0, TAU), rr = 6 + smooth(0, 0.6, t) * R; add({ k: "drop", x: cx + Math.cos(q) * rr, y: gy + Math.sin(q) * rr * 0.42 - 5, vx: Math.cos(q) * 40, vy: -range(40, 90), g: 320, life: 0.5, ramp: C, gy: gy + Math.sin(q) * rr * 0.42 }); });
    } },
    // Self-Destruct and Explosion: it flashes white and blows up where it stands - Explosion with a mushroom of smoke.
    "self-destruct": { pulse({ x: wx, y: wy, r }) { blowUp(wx, wy, r, false); } },
    explosion: { pulse({ x: wx, y: wy, r }) { blowUp(wx, wy, r, true); } },
    // Boomburst: a deafening blast - jagged rings of sound racing out past the pulse's reach, sound lines between them.
    boomburst: { pulse({ side, x: wx, y: wy, r }) {
      const [cx, cy] = at(side, wx, wy), R = r * BODY_PX;
      timed(0.9, (L, t) => {
        for (let i = 0; i < 6; i++) { const u = (t - i * 0.07) / 0.45; if (u <= 0 || u >= 1) continue; const rr = 6 + u * R * 1.1; zigRing(L.f, cx, cy, rr, BOOM[i % 2 ? 2 : 0], 1 - u); zigRing(L.f, cx, cy, rr + 1, BOOM[i % 2 ? 3 : 1], 1 - u); zigRing(L.b, cx, cy + 1, rr - 2, BOOM[4], (1 - u) * 0.8); }
        const k = 1 - smooth(0.3, 0.6, t), u = smooth(0, 0.25, t);
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, l0 = 8 + u * R * 0.3, l1 = l0 + 6 + (i % 2) * 6; L.f.line(cx + Math.cos(a) * l0, cy + Math.sin(a) * l0 * 0.75, cx + Math.cos(a) * l1, cy + Math.sin(a) * l1 * 0.75, BOOM[1], k); }
        L.f.disc(cx, cy, 7 * k, BOOM[0], k); L.l.glow(cx, cy, R * 0.7, BOOM[3], 0.6 * (1 - t / 0.9));
      });
    } },
  });
  /* ---------- sweep 2 (2026-10-30, asked for: "do it in bigger sweeps"): every move two kits carry ---------- */
  const R_ = (type) => RAMP[type] ?? RAMP.normal;
  // A shot's orb in `C` with a dithered trail, `deco` drawn over it; its hit a blow and a ring, `boom(x, y, c)` after.
  const orbSig = (C, r = 4.5, deco = null, boom = null) => ({
    shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 1; i < 6; i++) L.f.disc(x - dx * i * 2.4, y - dy * i * 2.4, r * (1 - i / 7), C[i < 3 ? 2 : 4], 1 - i / 6); orbAt(L, x, y, r, C); deco?.(L, x, y, dx, dy); }); return true; },
    hit(c) { const [x, y] = toPx(c.x, c.y - 0.4); fxs.push(blowFx(x, y, C, r > 5)); timed(0.4, (L, t) => L.f.ring(x, y, 4 + t * 60, 2, C[t < 0.15 ? 0 : 2], 1 - t / 0.4)); boom?.(x, y, c); },
  });
  // A blow in `C`: the hit's burst, then `motif(L, x, y, t, c)` drawn for `life`.
  const blowSig = (C, motif = null, heavy = true, life = 0.5) => ({ hit(c) { const [x, y] = toPx(c.x, c.y - 0.35); fxs.push(blowFx(x, y, C, heavy)); if (motif) timed(life, (L, t) => motif(L, x, y, t, c)); } });
  // A move on itself: its aura in `C` flaring once, `motif(L, b, [cx, cy, x0, y0], t, k)` drawn round its body.
  const selfSig = (C, motif = null, life = 0.7, rise = 1) => ({ fire({ side }) { timed(life, (L, t) => { const k = smooth(0, 0.08, t) * (1 - smooth(life * 0.6, life, t)), b = bodies[side]; auraOn(L, b, C, k * 0.8, Math.exp(-(((t - 0.06) / 0.05) ** 2)), rise); if (b && motif) motif(L, b, centreOf(b), t, k); }); } });
  // A pulse of rings in `C` out to its reach (the sound moves, Snarl).
  const ringsOut = (cx, cy, R, C, n = 4, zig = true) => timed(0.7, (L, t) => { for (let i = 0; i < n; i++) { const u = (t - i * 0.08) / 0.45; if (u <= 0 || u >= 1) continue; if (zig) zigRing(L.f, cx, cy, 6 + u * R, C[i % 2 ? 2 : 0], 1 - u); else L.f.ring(cx, cy, 6 + u * R, 2, C[i % 2 ? 2 : 0], 1 - u, 0.75); } });
  // An eighth note: a head, a stem and a flag (Round, Relic Song, Echoed Voice).
  function noteAt(L, x, y, C, k = 1) { L.f.disc(x, y, 1.8, C[3], k); L.f.dot(x - 0.6, y - 0.6, C[1], k); for (let j = 0; j < 7; j++) L.f.dot(x + 1.5, y - j, C[4], k); L.f.dot(x + 2.5, y - 6, C[4], k); L.f.dot(x + 3.2, y - 5, C[4], k); L.f.dot(x + 3.5, y - 4, C[4], k); }
  // An icicle point-down at (x, y), `h` tall (Icicle Crash, Avalanche).
  function icicleAt(L, x, y, h, C, k = 1) { for (let j = 0; j < h; j++) { const w = 2.6 * (1 - j / h); for (let o = -w; o <= w; o += 0.5) L.f.dot(x + o, y - h + j, o < -w * 0.3 ? C[1] : o > w * 0.5 ? C[4] : C[2], k); } L.f.dot(x, y, C[0], k); }
  // A sword at angle `a` from its hilt (Swords Dance): steel blade, gold guard, wooden grip.
  function swordAt(L, x, y, a, len, k) { const c = Math.cos(a), s2 = Math.sin(a); for (let d = 0; d < len; d += 0.5) { L.f.dot(x + c * d, y + s2 * d, STEELW[d < len * 0.7 ? 1 : 0], k); if (d < len - 2) L.f.dot(x + c * d - s2, y + s2 * d + c, STEELW[4], k); } for (let o = -3; o <= 3; o++) L.f.dot(x - s2 * o, y + c * o, GOLD[3], k); for (let d = -4; d < 0; d++) L.f.dot(x + c * d, y + s2 * d, BARK[3], k); }
  // A foot, toes and all (the kicks' shots).
  function footAt(L, x, y, dx, C, k = 1) { const f = dx < 0 ? -1 : 1; L.f.disc(x, y, 4, C[4], k); L.f.disc(x, y, 3, C[2], k); for (const [tx, ty] of [[-2, -4], [0, -5], [2, -4]]) L.f.disc(x + tx + f * 2, y + ty, 1.1, C[1], k); L.l.glow(x, y, 9, C[3], 0.5 * k); }
  // A heart (Draining Kiss), `r` its half-width.
  function heartAt(L, x, y, r, C, k = 1) { for (let py = -r; py <= r * 1.2; py += 0.5) for (let px2 = -r * 1.2; px2 <= r * 1.2; px2 += 0.5) { const u = px2 / r, v = -py / r, q = u * u + v * v - 1; if (q * q * q - u * u * v * v * v <= 0) L.f.dot(x + px2, y + py, py < -r * 0.3 && px2 < 0 ? C[1] : C[3], k); } }
  // Things falling onto (x, gy) from above over `life`: `draw(L, x, y, u)` each, then `land(x, gy)` once.
  function dropOn(x, gy, n, spread, draw, land, life = 0.5) { const it = Array.from({ length: n }, (_, i) => ({ x: x + range(-spread, spread), t0: i * 0.07, done: false })); timed(life + n * 0.07, (L, t) => { for (const d of it) { const u = (t - d.t0) / life; if (u > 0 && u < 1) draw(L, d.x, gy - 60 * (1 - u * u), u); } }, (t) => { for (const d of it) if (!d.done && t > d.t0 + life) { d.done = true; land(d.x, gy); } }); }
  Object.assign(SIG, {
    /* -- the families (render.js FAMILY): a punch, a kick, a throw, a powder, a song, a drain, in the move's type -- */
    _punch: {
      fire({ side, x: wx, y: wy, dx, dy, type }) { const R = R_(type); timed(0.3, (L, t) => { const [fx2, fy2] = fistOf(side, wx, wy, dx, dy), k = 1 - smooth(0.2, 0.3, t); fistGlow(L, fx2, fy2, R, k); for (let i = -1; i <= 1; i++) L.f.line(fx2 - dx * 6 - dy * i * 3, fy2 - dy * 6 + dx * i * 3, fx2 - dx * 16 - dy * i * 3, fy2 - dy * 16 + dx * i * 3, R[1], k * 0.8); }); },
      hit({ x: wx, y: wy, dx, type }) { const R = R_(type), [x, y] = toPx(wx, wy - 0.4); fxs.push(blowFx(x, y, R, true)); timed(0.4, (L, t) => { if (t < 0.25) punchRing(L, x, y, dx, t / 0.25, R, 1 - t / 0.25); powStar(L, x, y, t * 1.2); }); },
    },
    _kick: {
      fire({ x: wx, y: wy, dx, dy, type }) { const R = R_(type), [x, y] = reachOf(wx, wy, dx, dy, 1.0), a = Math.atan2(dy, dx); timed(0.4, (L, t) => crescentCut(L, x, y + 4, a - 0.6, 14, t, R)); },
      shot({ x: wx, y: wy, dx, dy, type }) { const R = R_(type), [x, y] = toPx(wx, wy - 0.35); queued.push((L) => { footAt(L, x, y, dx, R); for (let i = 1; i < 4; i++) L.f.dot(x - dx * i * 3, y - dy * i * 3, R[2], 1 - i / 4); }); return true; },
      hit({ x: wx, y: wy, type }) { const R = R_(type), [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, R, true)); timed(0.4, (L, t) => powStar(L, x, y, t * 1.2)); },
    },
    _throw: { hit({ x: wx, y: wy, type }) {
      const R = R_(type), [x, y] = toPx(wx, wy - 0.4), gy = toPx(0, wy + 0.42)[1];
      timed(0.6, (L, t) => { const k = 1 - smooth(0.35, 0.6, t); for (let q = 0; q < 2.6 * smooth(0, 0.25, t); q += 0.04) { const a = q + t * 6; L.f.dot(x + Math.cos(a) * 14, y + Math.sin(a) * 9, R[q > 2 ? 0 : 2], k); L.f.dot(x + Math.cos(a) * 13, y + Math.sin(a) * 8, R[4], k); } if (t > 0.25) { const u = (t - 0.25) / 0.35; L.b.ring(x, gy, 4 + u * 26, 2.5, DUSTR[1], 1 - u, 0.42); } });
      for (let i = 0; i < 8; i++) add({ k: "dust", x: x + range(-8, 8), y: gy - 1, vx: range(-50, 50), vy: -range(4, 14), drag: 4, life: 0.6, size: 2, front: false, delay: 0.25 });
    } },
    _powder: {
      shot({ x: wx, y: wy, type }) { const R = type === "grass" ? SPORE : R_(type), [x, y] = toPx(wx, wy - 0.4); if (rand() < 0.8) add({ k: "mote", x: x + range(-7, 7), y: y + range(-5, 5), vx: range(-10, 10), vy: range(-4, 12), drag: 2, life: range(0.6, 1), ramp: R }); queued.push((L) => { for (let i = 0; i < 26; i++) { const a = i * 2.4 + time * 1.6, d = 2 + (i % 8) * 1.2; L.f.dot(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, R[i % 3 ? 2 : 1]); } L.l.glow(x, y, 12, R[3], 0.35); }); return true; },
      hit({ x: wx, y: wy, type }) { const R = type === "grass" ? SPORE : R_(type), [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 16; i++) { const a = range(0, TAU), sp = range(15, 45); add({ k: "mote", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, drag: 2, life: range(0.6, 1), ramp: R }); } },
    },
    _sound: {
      shot({ x: wx, y: wy, dx, dy, type }) { const R = type === "normal" ? VOICE : R_(type), [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 3; i++) { const q = (time * 3 + i / 3) % 1; L.f.ring(x - dx * q * 10, y - dy * q * 10, 2 + q * 7, 1, R[2], 1 - q, 1.3); } for (let i = 0; i < 3; i++) { const a = time * 5 + (i * TAU) / 3; noteAt(L, x + Math.cos(a) * 7, y + Math.sin(a) * 5, i ? R : VOICE); } L.l.glow(x, y, 12, R[3], 0.4); }); return true; },
      hit({ x: wx, y: wy, type }) { const R = type === "normal" ? VOICE : R_(type), [x, y] = toPx(wx, wy - 0.4); ringsOut(x, y, 24, R, 3); },
    },
    _drain: { hit({ side, x: wx, y: wy, ux, uy, type }) {
      const R = type === "fairy" ? GLEAM : type === "grass" ? ENERGYB : R_(type), [x, y] = toPx(wx, wy - 0.4);
      fxs.push(blowFx(x, y, R, false));
      timed(0.9, (L, t) => { auraOn(L, bodies[side], R, (1 - smooth(0.3, 0.6, t)) * 0.7, 0, -1); auraOn(L, bodies[1 - side], R, smooth(0.4, 0.6, t) * (1 - smooth(0.7, 0.9, t)), 0, 1); });
      drainBeads(side, 1 - side, { x: wx, y: wy, ux, uy }, R, 0.7);
    } },
  });
  // Assigned apart: the entries below spread the families (`...SIG._punch`) as they are built.
  Object.assign(SIG, {
    /* -- the streams: Flamethrower and Hydro Pump pour in their type's own band (`stream` adds their tongues and foam) -- */
    // Flamethrower: embers gather at its mouth as it opens up.
    flamethrower: { fire({ side, x: wx, y: wy, dx }) { const [ex, ey] = eyesAt(side, wx, wy); for (let i = 0; i < 8; i++) add({ k: "ember", x: ex + dx * 6 + range(-4, 4), y: ey + 4 + range(-3, 3), vx: dx * range(10, 40), vy: -range(10, 30), life: range(0.3, 0.5) }); } },
    // Hydro Pump: water swells into a ball at its mouth.
    "hydro-pump": { fire({ side, x: wx, y: wy, dx }) { timed(0.25, (L, t) => { const [ex, ey] = eyesAt(side, wx, wy); orbAt(L, ex + dx * 8, ey + 4, 2 + t * 18, RAMP.water); }); } },
    // Aurora Beam's hit: a ring of pastel light round the foe.
    "aurora-beam": { hit({ x: wx, y: wy }) { if (rand() > 0.5) return; const [x, y] = toPx(wx, wy - 0.4); timed(0.35, (L, t) => { const u = t / 0.35; L.f.ring(x, y, 4 + u * 16, 1.5, AURORAB[Math.floor(time * 20) % AURORAB.length], 1 - u); }); } },

    /* -- charges -- */
    // Dragon Rush: it charges wrapped in a towering dragon-blue aura, menace streaming off it.
    "dragon-rush": {
      fire({ side }) { timed(0.5, (L, t) => { const b = bodies[side], k = 1 - smooth(0.35, 0.5, t); edgeFlames(L, b, MENACE, k, 0, 1, 2); auraOn(L, b, MENACE, k, Math.exp(-((t / 0.06) ** 2)), 1); }); },
      ...blowSig(MENACE, (L, x, y, t) => { const u = t / 0.5; L.f.ring(x, y, 5 + u * 34, 3 * (1 - u) + 1, MENACE[u < 0.3 ? 0 : 3], 1 - u); }),
    },
    // Drill Run: it spins into a drill of earth, a spiralling cone ahead of it; dirt sprays from the hit.
    "drill-run": {
      fire({ side, dx, dy }) { timed(0.5, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b), k = 1 - smooth(0.35, 0.5, t), C = RAMP.ground; for (let d = 0; d < 22; d += 0.5) { const w = 9 * (1 - d / 22); for (let o = -w; o <= w; o += 0.5) { const stripe = (Math.floor(d * 0.5 - time * 40 + o * 0.6) & 1); L.f.dot(cx + dx * (d + 4) - dy * o, cy + dy * (d + 4) + dx * o, stripe ? C[2] : C[4], k); } } L.l.glow(cx + dx * 12, cy + dy * 12, 16, C[3], 0.4 * k); }, (t) => { if (t > 0.4) return; const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b); add({ k: "chunk", x: cx - dx * 6, y: cy + 6, vx: -dx * range(30, 80) + range(-30, 30), vy: -range(40, 90), g: 380, life: 0.5, ramp: EARTHC, gy: cy + b.h * 0.5 }); }); },
      ...blowSig(RAMP.ground, (L, x, y, t) => { for (let i = 0; i < 3; i++) { const a = t * 18 + (i * TAU) / 3; L.f.disc(x + Math.cos(a) * 8 * (1 - t), y + Math.sin(a) * 8 * (1 - t), 2, EARTHC[2], 1 - t / 0.5); } }),
    },
    // First Impression: a sudden flash in its eyes and it is on the foe; a burst of green.
    "first-impression": {
      fire({ side, x: wx, y: wy }) { timed(0.3, (L, t) => { const [ex, ey] = eyesAt(side, wx, wy), g = t < 0.06 ? outBack(t / 0.06, 2) : 1 - smooth(0.1, 0.3, t); sparkle(L.f, ex, ey, 9 * g, RAMP.bug[0], RAMP.bug[2]); L.l.glow(ex, ey, 16, RAMP.bug[2], g); }); },
      ...blowSig(RAMP.bug, (L, x, y, t) => { powStar(L, x, y, t); streaks(L, x, y, 0.8, t, RAMP.bug, 3, 4, 12); }),
    },
    // Feint: a sidestep - its afterimage left where it was - and a quick white jab.
    feint: {
      fire({ side }) { const b = bodies[side]; if (b) afterimage(b, "dash", 0.35); },
      ...blowSig(RAMP.normal, (L, x, y, t) => streaks(L, x, y, -0.7, t, RAMP.normal, 1, 0, 10), false, 0.35),
    },

    /* -- blows -- */
    // Lunge: it thrusts in with a spear of green light.
    lunge: { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 0.6); timed(0.35, (L, t) => { const g = Math.min(1, t / 0.08), k = 1 - smooth(0.2, 0.35, t); for (let d = 0; d < 20 * g; d += 0.5) { const w = 2.5 * (1 - d / 20); for (let o = -w; o <= w; o += 0.5) L.f.dot(x + dx * d - dy * o, y + dy * d + dx * o, Math.abs(o) < w * 0.4 ? RAMP.bug[0] : RAMP.bug[3], k); } }); }, ...blowSig(RAMP.bug) },
    // Flame Wheel: a wheel of fire rolls round it as it charges.
    "flame-wheel": { fire({ side }) { timed(0.5, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b), k = 1 - smooth(0.35, 0.5, t), r = Math.max(b.w, b.h) * 0.6; for (let q = 0; q < TAU; q += 0.12) { const a = q + time * 22, rr = r + noise(q * 3 + time * 10, 4) * 2; L.f.disc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.8, HEAT[2 + Math.floor((q / TAU) * 6)], k); } L.l.glow(cx, cy, r * 2, HEAT[4], 0.6 * k); }); }, ...blowSig(HEAT) },
    // Icicle Crash: icicles fall out of the sky onto the foe and shatter.
    "icicle-crash": { hit({ x: wx, y: wy }) { const [x] = toPx(wx, wy), gy = toPx(0, wy - 0.1)[1]; dropOn(x, gy, 4, 10, (L, px2, py, u) => icicleAt(L, px2, py, 12, RAMP.ice), (px2, py) => { for (let i = 0; i < 6; i++) add({ k: "shard", x: px2, y: py, vx: range(-60, 60), vy: -range(30, 90), g: 300, life: 0.5, size: 1.5, a: range(0, TAU), va: range(-10, 10), ramp: RAMP.ice, gy: py + 14 }); }, 0.35); } },
    // Force Palm: the open palm glows, and a shockwave of force blasts from it through the foe.
    "force-palm": { ...blowSig(RAMP.fighting, (L, x, y, t, c) => { const g = Math.min(1, t / 0.06), k = 1 - smooth(0.15, 0.4, t); L.f.disc(x - (c.dx || 1) * 6, y, 4 * g, RAMP.fighting[2], k); for (const [fx2, fy2] of [[-2, -6], [0, -7], [2, -6], [4, -4]]) L.f.line(x - (c.dx || 1) * 6 + fx2, y + fy2 + 3, x - (c.dx || 1) * 6 + fx2, y + fy2, RAMP.fighting[1], k); for (let i = 0; i < 3; i++) { const u = (t - i * 0.06) / 0.3; if (u > 0 && u < 1) L.f.ring(x + (c.dx || 1) * u * 10, y, 4 + u * 12, 1.5, RAMP.fighting[i ? 2 : 0], 1 - u, 1.4); } }) },
    // Poison Sting: a volley of purple stingers driven into the foe; poison bubbles off it.
    "poison-sting": { ...blowSig(RAMP.poison, (L, x, y, t, c) => { const k = 1 - smooth(0.2, 0.4, t), dx = c.dx || 1; for (let i = 0; i < 4; i++) { const ox = -dx * (16 - 14 * Math.min(1, t / 0.1)), oy = (i - 1.5) * 4; L.f.line(x + ox, y + oy, x + ox - dx * 6, y + oy, RAMP.poison[1], k); L.f.dot(x + ox, y + oy, RAMP.poison[0], k); } }, false), },
    // Throat Chop: one hard downward chop of dark energy.
    "throat-chop": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.0); timed(0.4, (L, t) => streaks(L, x, y, Math.PI / 2 - 0.2, t, DARKP, 3, 2, 16)); }, ...blowSig(DARKP) },
    // Gunk Shot: a heap of garbage and sludge hurled onto the foe - it splats and leaves a bubbling puddle.
    "gunk-shot": { hit(c) { SIG["sludge-bomb"].hit(c); const [x, y] = toPx(c.x, c.y - 0.4); for (let i = 0; i < 8; i++) add({ k: "chunk", x, y, vx: range(-70, 70), vy: -range(40, 110), g: 380, life: 0.7, ramp: GASR, gy: y + 18 }); fxs.push(blowFx(x, y, SLUDGE, true)); } },
    // Payback: a dark aura wells up and its eyes glint red; the blow lands in a burst that collapses inward.
    payback: {
      fire({ side, x: wx, y: wy }) { timed(0.4, (L, t) => { const k = 1 - smooth(0.25, 0.4, t), [ex, ey] = eyesAt(side, wx, wy); auraOn(L, bodies[side], DARKP, k, 0, -1); L.f.set(ex - 2, ey, REDAURA[2]); L.f.set(ex + 2, ey, REDAURA[2]); L.l.glow(ex, ey, 8, REDAURA[3], 0.7 * k); }); },
      ...blowSig(DARKP, (L, x, y, t) => { const u = t / 0.4; if (u < 1) L.f.ring(x, y, 26 * (1 - u) + 3, 2, DARKP[u < 0.5 ? 2 : 0], 1); }),
    },
    // Facade: it bursts out angry, a red-orange flash and a POW.
    facade: { fire({ side }) { timed(0.35, (L, t) => auraOn(L, bodies[side], RAGE, 1 - smooth(0.2, 0.35, t), 0.5, 1)); }, ...blowSig(RAGE, (L, x, y, t) => powStar(L, x, y, t)) },
    // Fire Lash: a whip of flame cracks across the foe.
    "fire-lash": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 0.4); timed(0.4, (L, t) => { const g = Math.min(1, t / 0.12), k = 1 - smooth(0.25, 0.4, t); for (let d = 0; d < 26 * g; d += 0.5) { const q = d / 26, o = Math.sin(q * Math.PI * 1.5 - t * 8) * 9 * q; L.f.disc(x + dx * d - dy * o, y + dy * d + dx * o, 1.6 - q, HEAT[Math.min(9, 1 + Math.floor(q * 5))], k); } }); }, ...blowSig(HEAT) },
    // Steel Wing: its wings turn to steel, glinting, as it strikes.
    "steel-wing": { fire({ side }) { timed(0.45, (L, t) => { const b = bodies[side], k = smooth(0, 0.06, t) * (1 - smooth(0.3, 0.45, t)); steelBody(L, b, k * 0.8); if (!b) return; const [cx, cy] = centreOf(b); for (const s2 of [-1, 1]) for (let d = 0; d < 16; d += 0.5) { const w = 4 * (1 - d / 16); for (let o = 0; o < w; o += 0.5) L.f.dot(cx + s2 * (4 + d), cy - 4 - d * 0.4 + o, o < 1 ? STEELW[0] : STEELW[3], k); } }); }, ...blowSig(STEELW) },
    // Crabhammer: a huge claw crashes down in a burst of water.
    crabhammer: { ...blowSig(RAMP.water, (L, x, y, t, c) => { crescentCut(L, x, y - 4, Math.PI / 2 + 0.6 * (c.dx || 1), 16, t, RAMP.water); if (t < 0.3) L.f.ring(x, y, 4 + t * 70, 2, RAMP.water[1], 1 - t / 0.3); }), },
    // Strength: a mighty slam - a POW, a ring through the floor and rock thrown up.
    strength: { hit(c) { SIG._slam.hit({ ...c, type: "normal" }); const [x, gy] = toPx(c.x, c.y + 0.42); for (let i = 0; i < 6; i++) add({ k: "chunk", x: x + range(-8, 8), y: gy - 2, vx: range(-50, 50), vy: -range(60, 130), g: 380, life: 0.6, ramp: ROCKC, gy }); } },
    // Fell Stinger: one great stinger stabbed in, light converging on its point.
    "fell-stinger": { ...blowSig(RAMP.bug, (L, x, y, t, c) => { const dx = c.dx || 1, g = Math.min(1, t / 0.1), k = 1 - smooth(0.25, 0.45, t); for (let d = 0; d < 14; d += 0.5) { const w = 3 * (1 - d / 14); for (let o = -w; o <= w; o += 0.5) L.f.dot(x - dx * (24 - 14 * g) + dx * d, y + o, o < 0 ? RAMP.bug[1] : RAMP.bug[3], k); } for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; L.f.line(x + Math.cos(a) * 18 * (1 - g), y + Math.sin(a) * 18 * (1 - g), x + Math.cos(a) * (22 - 14 * g), y + Math.sin(a) * (22 - 14 * g), RAMP.bug[0], k); } }), },
    // Wave Crash: a wave curls up over it as it charges, and breaks on the foe.
    "wave-crash": { fire({ side, dx }) { timed(0.5, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, cy, , y0] = centreOf(b), k = 1 - smooth(0.35, 0.5, t), V = RAMP.water; for (let q = 0; q < Math.PI * 1.3; q += 0.04) { const r = b.h * 0.8, px2 = cx - dx * 6 + Math.cos(Math.PI - q) * r * dx, py = y0 + b.h - Math.sin(q) * r; for (let w = 0; w < 4; w++) L.f.dot(px2 - w * dx * 0.5, py + w, w ? V[2 + (w > 2 ? 1 : 0)] : V[0], k); } }); }, hit(c) { SIG["water-pulse"].hit(c); const [x, y] = toPx(c.x, c.y - 0.35); fxs.push(blowFx(x, y, RAMP.water, true)); } },
    // Avalanche: snow and ice tumble down onto the foe.
    avalanche: { hit({ x: wx, y: wy }) { const [x] = toPx(wx, wy), gy = toPx(0, wy - 0.1)[1]; dropOn(x, gy, 6, 14, (L, px2, py) => { L.f.disc(px2, py, 4, RAMP.ice[3]); L.f.disc(px2 - 1, py - 1, 2.5, RAMP.ice[1]); }, (px2, py) => { for (let i = 0; i < 5; i++) add({ k: "mote", x: px2, y: py, vx: range(-50, 50), vy: -range(20, 60), drag: 2, life: 0.5, ramp: RAMP.ice }); }, 0.3); } },
    // Aqua Cutter: a blade of pressurised water slices across.
    "aqua-cutter": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.0), a = Math.atan2(dy, dx); timed(0.4, (L, t) => { crescentCut(L, x, y, a, 16, t, RAMP.water); crescentCut(L, x, y, a, 12, t - 0.03, ICEBEAM); }); }, ...blowSig(RAMP.water) },
    // Skitter Smack: it skitters round behind the foe in a blur of legs and smacks it.
    "skitter-smack": { fire({ side }) { const b = bodies[side]; if (b) afterimage(b, "bug", 0.4); }, ...blowSig(RAMP.bug, (L, x, y, t) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 10; L.f.line(x + Math.cos(a) * 8, y + Math.sin(a) * 6, x + Math.cos(a) * 12, y + Math.sin(a) * 9, RAMP.bug[2], 1 - t / 0.5); } }) },
    // Waterfall: a column of water surges up round it as it charges.
    waterfall: { fire({ side }) { timed(0.5, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, , x0, y0] = centreOf(b), k = 1 - smooth(0.35, 0.5, t), V = RAMP.water, gy = y0 + b.h, h = (b.h + 18) * smooth(0, 0.15, t); for (let yy = 0; yy < h; yy++) for (let o = -b.w * 0.6; o <= b.w * 0.6; o += 1) { const q = Math.abs(o) / (b.w * 0.6), band2 = (Math.floor(yy * 0.4 + time * 50) & 3) === 0; if (q > 0.6) L.b.dot(cx + o, gy - yy, band2 ? V[0] : q > 0.9 ? V[4] : V[2], k * 0.9); } }); }, hit(c) { SIG["water-pulse"].hit(c); } },
    // Smack Down: a rock flung down out of the air onto the foe.
    "smack-down": { hit({ x: wx, y: wy }) { const [x] = toPx(wx, wy), gy = toPx(0, wy + 0.1)[1]; dropOn(x, gy, 1, 0, (L, px2, py, u) => rockAt(L, px2, py, 6, 3), (px2, py) => { fxs.push(blowFx(px2, py, ROCKC, true)); for (let i = 0; i < 8; i++) add({ k: "chunk", x: px2, y: py, vx: range(-60, 60), vy: -range(40, 100), g: 380, life: 0.6, ramp: ROCKC, gy: py + 12 }); }, 0.25); } },
    // Land's Wrath: the ground under the foe heaves up in spikes of rock.
    "lands-wrath": { hit({ x: wx, y: wy }) { const [x, gy] = toPx(wx, wy + 0.42); timed(0.7, (L, t) => { const g = Math.min(1, t / 0.1), k = 1 - smooth(0.45, 0.7, t); for (let i = -3; i <= 3; i++) { const h = (16 - Math.abs(i) * 3) * g, bx = x + i * 5; for (let yy = 0; yy < h; yy++) { const w = 2.5 * (1 - yy / Math.max(1, h)); for (let o = -w; o <= w; o += 0.5) L.f.dot(bx + o, gy - yy, o < 0 ? EARTHC[1] : EARTHC[3], k); } } }); for (let i = 0; i < 10; i++) add({ k: "chunk", x: x + range(-14, 14), y: gy - 4, vx: range(-60, 60), vy: -range(60, 140), g: 380, life: 0.7, ramp: EARTHC, gy }); } },
    // Grav Apple: an apple drops out of the sky onto the foe's head.
    "grav-apple": { hit({ x: wx, y: wy }) { const [x] = toPx(wx, wy), gy = toPx(0, wy - 0.6)[1]; dropOn(x, gy, 1, 0, (L, px2, py) => { L.f.disc(px2, py, 5, RAGE[4]); L.f.disc(px2 - 1, py - 1, 3, RAGE[2]); L.f.set(px2 - 2, py - 2, RAGE[0]); L.f.line(px2, py - 5, px2 + 1, py - 8, BARK[4]); L.f.disc(px2 + 3, py - 7, 1.5, RAMP.grass[3]); }, (px2, py) => { fxs.push(blowFx(px2, py, RAMP.grass, true)); }, 0.3); } },
    // False Surrender: a bow - then a slash of dark light it never saw coming.
    "false-surrender": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 1.0), a = Math.atan2(dy, dx); timed(0.45, (L, t) => crescentCut(L, x, y, a + 0.4, 15, t - 0.08, DARKP)); }, ...blowSig(DARKP) },
    // Bolt Beak: its beak crackles with electricity as it strikes.
    "bolt-beak": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 0.6); fxs.push(crackleFx(x, y, RAMP.electric, 0.35)); }, ...blowSig(RAMP.electric) },
    // Barb Barrage: a spray of poison barbs.
    "barb-barrage": { ...blowSig(RAMP.poison, (L, x, y, t) => { const k = 1 - smooth(0.2, 0.45, t); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2, d = 4 + t * 50; L.f.line(x + Math.cos(a) * d, y + Math.sin(a) * d, x + Math.cos(a) * (d + 4), y + Math.sin(a) * (d + 4), RAMP.poison[i % 2 ? 1 : 3], k); } }) },
    // Ice Spinner: it spins on ice, a ring of frost whirling round it.
    "ice-spinner": { fire({ side }) { timed(0.45, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, , , y0] = centreOf(b), gy = y0 + b.h, k = 1 - smooth(0.3, 0.45, t); for (let i = 0; i < 2; i++) for (let q = 0; q < TAU; q += 0.08) { const a = q + time * 28 + i * 2, front = Math.sin(a) > 0; (front ? L.f : L.b).dot(cx + Math.cos(a) * (b.w * 0.6 + i * 3), gy - 3 - i * 4 + Math.sin(a) * 3, ICYW[i ? 2 : 0], k); } }); }, ...blowSig(RAMP.ice, (L, x, y, t) => flake(L, x, y, 6 * Math.min(1, t / 0.1), RAMP.ice, 1 - t / 0.5)) },
    // Pay Day: gold coins thrown, clinking off the foe.
    "pay-day": { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 10; i++) { const a = range(0, TAU), sp = range(40, 100); add({ k: "star", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 260, life: 0.6, size: 1, ramp: GOLD, gy: y + 16 }); } fxs.push(blowFx(x, y, GOLD, false)); } },
    // Wrap: coils wind round the foe and squeeze.
    wrap: { hit({ side }) { timed(0.8, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, , , y0] = centreOf(b), k = 1 - smooth(0.6, 0.8, t), sq = 1 - 0.1 * Math.sin(t * 20); for (let i = 0; i < 3; i++) for (let q = 0; q < TAU; q += 0.06) { const front = Math.sin(q) > 0; (front ? L.f : L.b).dot(cx + Math.cos(q) * b.w * 0.55 * sq, y0 + b.h * (0.35 + i * 0.22) + Math.sin(q) * 3, front ? DUSTR[1] : DUSTR[3], k); } }); } },
    // Meteor Mash: its fist becomes a meteor - a punch trailing a comet's tail and stars.
    "meteor-mash": { ...SIG._punch, hit(c) { SIG._punch.hit({ ...c, type: "steel" }); const [x, y] = toPx(c.x, c.y - 0.4); for (let i = 0; i < 6; i++) { const a = range(0, TAU), sp = range(40, 90); add({ k: "star", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2, life: 0.6, size: 2, ramp: STARW }); } } },
    // Drain Punch: a punch, and the foe's strength streams back into its fist.
    "drain-punch": { ...SIG._punch, hit(c) { SIG._punch.hit(c); SIG._drain.hit({ ...c, type: "grass" }); } },
    // Shadow Punch: a fist of shadow swings out of nowhere beside the foe.
    "shadow-punch": { hit({ x: wx, y: wy, dx }) { const [x, y] = toPx(wx, wy - 0.4), C = SHADOWB, ox = -(dx || 1) * 18; timed(0.4, (L, t) => { const u = Math.min(1, t / 0.12), k = 1 - smooth(0.25, 0.4, t); L.f.ring(x + ox, y - 6, 6, 2, C[3], k * (1 - u)); fistGlow(L, x + ox * (1 - u), y - 6 * (1 - u), C, k, 5); }); fxs.push(blowFx(x, y, C, true)); } },
    // Blaze Kick: a foot ablaze, and the kick bursts into flame.
    "blaze-kick": { ...SIG._kick, hit(c) { SIG._kick.hit({ ...c, type: "fire" }); const [x, y] = toPx(c.x, c.y - 0.35); for (let i = 0; i < 10; i++) { const a = range(0, TAU), sp = range(40, 100); add({ k: "flame", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, drag: 2.5, life: 0.4, size: 1.4 }); } } },
    // High Jump Kick: it leaps high and drives down knee-first; the landing shakes the floor.
    "high-jump-kick": { fire({ side }) { const b = bodies[side]; if (b) afterimage(b, "fighting", 0.4); }, hit(c) { SIG._kick.hit({ ...c, type: "fighting" }); const [x, gy] = toPx(c.x, c.y + 0.42); timed(0.5, (L, t) => { const u = t / 0.5; L.b.ring(x, gy, 4 + u * 30, 2.5, RAMP.fighting[2], 1 - u, 0.42); }); } },

    /* -- volleys (each shot drawn) -- */
    "bullet-seed": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.35); queued.push((L) => { for (let i = 1; i < 4; i++) L.f.dot(x - dx * i * 2.5, y - dy * i * 2.5, RAMP.grass[3], 1 - i / 4); L.f.disc(x, y, 2.4, RAMP.grass[5]); L.f.disc(x - 0.5, y - 0.5, 1.6, RAMP.grass[3]); L.f.set(x - 1, y - 1, RAMP.grass[1]); }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); timed(0.25, (L, t) => { L.f.disc(x, y, 5 * (1 - t / 0.25), RAMP.grass[t < 0.06 ? 0 : 2]); L.f.ring(x, y, 3 + t * 40, 1, RAMP.grass[1], 1 - t / 0.25); }); } },
    "gear-grind": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { sawDisc(L, x, y, 6, time * 20, STEELW); L.f.disc(x, y, 1.5, STEELW[5]); }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); fxs.push(blowFx(x, y, STEELW, false)); for (let i = 0; i < 8; i++) { const a = range(0, TAU), sp = range(60, 140); add({ k: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: 0.3, ramp: GOLD }); } } },
    "double-hit": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.35), a = Math.atan2(dy, dx); queued.push((L) => { for (let q = -1.2; q <= 1.2; q += 0.05) L.f.dot(x + Math.cos(a + q) * 6, y + Math.sin(a + q) * 6, Math.abs(q) < 0.5 ? RAMP.normal[0] : RAMP.normal[2]); }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); timed(0.35, (L, t) => powStar(L, x, y, t)); } },
    "pin-missile": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.35); queued.push((L) => { L.f.line(x, y, x - dx * 7, y - dy * 7, RAMP.bug[1]); L.f.dot(x, y, RAMP.normal[0]); for (let i = 2; i < 6; i++) L.f.dot(x - dx * (7 + i * 2) + range(-1, 1), y - dy * (7 + i * 2) + range(-1, 1), DUSTR[1], 1 - i / 6); }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, RAMP.bug, false)); } },
    "dragon-darts": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.35); queued.push((L) => { for (let d = 0; d < 9; d++) { const w = d < 3 ? d * 0.8 : 2.4 * (1 - (d - 3) / 6); for (let o = -w; o <= w; o += 0.5) L.f.dot(x - dx * d - dy * o, y - dy * d + dx * o, d < 2 ? RAMP.dragon[1] : RAMP.dragon[3]); } for (let i = 1; i < 5; i++) L.f.dot(x - dx * (9 + i * 2), y - dy * (9 + i * 2), RAMP.dragon[2], 1 - i / 5); L.l.glow(x, y, 8, RAMP.dragon[3], 0.5); }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.35); fxs.push(blowFx(x, y, RAMP.dragon, false)); } },

    /* -- pulses -- */
    // Echoed Voice: its call rings out and rings out again, echo after echo.
    "echoed-voice": { pulse({ side, x: wx, y: wy, r }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX; for (let e = 0; e < 3; e++) timed(0.25 * e + 0.6, (L, t) => { const u = (t - e * 0.25) / 0.5; if (u > 0 && u < 1) { zigRing(L.f, cx, cy, 6 + u * R, VOICE[e ? 2 : 0], (1 - u) * (1 - e * 0.25)); noteAt(L, cx + Math.cos(e * 2) * (8 + u * R * 0.6), cy - 6 - u * 10, VOICE, 1 - u); } }); } },
    // Struggle Bug: a buzzing swarm of green specks thrown out round it.
    "struggle-bug": { pulse({ side, x: wx, y: wy, r }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX; for (let i = 0; i < 40; i++) { const a = range(0, TAU), sp = range(R * 1.2, R * 2); add({ k: "mote", x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, sway: 60, drag: 1.5, life: range(0.5, 0.8), ramp: RAMP.bug, delay: range(0, 0.2) }); } ringsOut(cx, cy, R, RAMP.bug, 2, false); } },
    // Venom Drench: poison rains down across the reach and puddles on the floor.
    "venom-drench": { pulse({ x: wx, y: wy, r }) { const [cx, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX; for (let i = 0; i < 30; i++) { const a = range(0, TAU), d = R * Math.sqrt(rand()), px2 = cx + Math.cos(a) * d, py = gy + Math.sin(a) * d * 0.42; add({ k: "drop", x: px2, y: py - range(40, 70), vy: range(80, 140), g: 300, life: 0.9, ramp: SLUDGE, gy: py, delay: range(0, 0.3) }); } timed(1.0, (L, t) => { const k = smooth(0.3, 0.45, t) * (1 - smooth(0.7, 1.0, t)); for (let i = 0; i < 6; i++) { const a = i * 1.1, d = R * 0.6 * ((i * 37) % 10) / 10; oval(L.b, cx + Math.cos(a) * d, gy + Math.sin(a) * d * 0.42, 6, 2, SLUDGE[3], k); } }); } },
    // Snarl: a ragged dark roar, its jagged rings shaking out to the reach.
    snarl: { pulse({ side, x: wx, y: wy, r }) { const [cx, cy] = at(side, wx, wy); ringsOut(cx, cy, r * BODY_PX, DARKP, 5); timed(0.35, (L, t) => { const [ex, ey] = eyesAt(side, wx, wy); L.f.set(ex - 2, ey, REDAURA[2]); L.f.set(ex + 2, ey, REDAURA[2]); L.l.glow(ex, ey, 8, REDAURA[3], 1 - t / 0.35); }); } },
    // Powder Snow: a flurry of snowflakes blown out round it.
    "powder-snow": { pulse({ side, x: wx, y: wy, r, fx: fwx, fy: fwy }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX, fl = Array.from({ length: 14 }, () => [range(0, TAU), range(0.3, 1), range(0, 0.15)]); timed(0.8, (L, t) => { for (const [a, d, t0] of fl) { const u = smooth(t0, t0 + 0.5, t), k = 1 - smooth(0.55, 0.8, t); if (u > 0) flake(L, cx + Math.cos(a) * d * R * u, cy + Math.sin(a) * d * R * 0.6 * u, 2.5, RAMP.ice, k); } }); } },
    // Cotton Spore: fluffy cotton puffs drift out and settle.
    "cotton-spore": { pulse({ side, x: wx, y: wy, r }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX, pf = Array.from({ length: 10 }, () => [range(0, TAU), range(0.3, 1)]); timed(1.0, (L, t) => { const u = smooth(0, 0.6, t), k = 1 - smooth(0.7, 1.0, t); for (const [a, d] of pf) { const px2 = cx + Math.cos(a) * d * R * u, py = cy + Math.sin(a) * d * R * 0.6 * u + Math.sin(t * 6 + a) * 2; L.f.disc(px2, py, 3, RAMP.normal[2], k); L.f.disc(px2 - 0.5, py - 0.5, 2, RAMP.normal[0], k); } }); } },
    // Water Spout: water erupts from it in a tall column and rains down all round.
    "water-spout": { pulse({ x: wx, y: wy, r }) { const [cx, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX, V = RAMP.water; timed(0.6, (L, t) => { const h = 70 * smooth(0, 0.2, t), k = 1 - smooth(0.35, 0.6, t); for (let yy = 0; yy < h; yy++) for (let o = -5; o <= 5; o += 0.5) L.f.dot(cx + o + Math.sin(yy * 0.2 + time * 20) * 1.5, gy - 10 - yy, Math.abs(o) < 2 ? V[1] : (Math.floor(yy * 0.3 - time * 40) & 1) ? V[2] : V[3], k); }); for (let i = 0; i < 40; i++) { const a = range(0, TAU), d = R * Math.sqrt(rand()), py = gy + Math.sin(a) * d * 0.42; add({ k: "drop", x: cx + Math.cos(a) * d, y: py - 80, vy: range(80, 140), g: 300, life: 1.0, ramp: V, gy: py, delay: 0.25 + range(0, 0.3) }); } } },
    // Electroweb: a net of electricity flung out over the reach, crackling.
    electroweb: { pulse({ side, x: wx, y: wy, r }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX, V = RAMP.electric; timed(0.7, (L, t) => { const u = smooth(0, 0.25, t), k = 1 - smooth(0.45, 0.7, t), j = Math.floor(time * 20) & 1; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; L.f.line(cx, cy, cx + Math.cos(a) * R * u, cy + Math.sin(a) * R * u * 0.7, V[j ? 1 : 2], k); } for (let q = 1; q <= 3; q++) for (let i = 0; i < 8; i++) { const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU, rr = R * u * q / 3; L.f.line(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr * 0.7, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr * 0.7, V[q === 3 ? 0 : 3], k); } L.l.glow(cx, cy, R * 0.6, V[3], 0.4 * k); }); } },
    // Eruption: a volcano's blast - a column of fire, and lava bombs falling all round.
    eruption: { pulse({ x: wx, y: wy, r }) { const [cx, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX; timed(0.7, (L, t) => { const h = 60 * smooth(0, 0.15, t), k = 1 - smooth(0.4, 0.7, t); for (let yy = 0; yy < h; yy++) { const w = 6 + yy * 0.1; for (let o = -w; o <= w; o += 0.7) L.f.dot(cx + o, gy - 8 - yy, HEAT[Math.min(9, Math.floor((Math.abs(o) / w) * 4 + yy / h * 4))], k); } L.l.glow(cx, gy - 30, 40, HEAT[4], k); }); for (let i = 0; i < 12; i++) { const a = range(0, TAU), d = R * range(0.3, 1), tx = cx + Math.cos(a) * d, ty = gy + Math.sin(a) * d * 0.42, f = range(0.6, 0.9); add({ k: "flame", x: cx, y: gy - 50, vx: (tx - cx) / f, vy: (ty - gy + 50) / f - 120 * f / 2 * 2, g: 240, life: f, size: 2, gy: ty, delay: 0.15 + i * 0.03 }); } } },
    // Breaking Swipe: a huge sweep of its tail, a crescent of dragon light all round it.
    "breaking-swipe": { pulse({ side, x: wx, y: wy, r }) { const [cx, cy] = at(side, wx, wy), R = r * BODY_PX; timed(0.5, (L, t) => { const g = smooth(0, 0.25, t), k = 1 - smooth(0.3, 0.5, t); for (let q = 0; q < TAU * g; q += 0.02) for (let w = 0; w < 4; w++) L.f.dot(cx + Math.cos(q + time) * (R * 0.7 - w), cy + Math.sin(q + time) * (R * 0.7 - w) * 0.6, DPULSE[w ? 2 + (w > 2 ? 1 : 0) : 0], k * (q / (TAU * g))); }); } },
    // Thousand Arrows: arrows of earth rise into the sky and rain down across the reach.
    "thousand-arrows": { pulse({ x: wx, y: wy, r }) { const [cx, gy] = toPx(wx, wy + 0.42), R = r * BODY_PX, ar = Array.from({ length: 14 }, (_, i) => { const a = range(0, TAU), d = R * Math.sqrt(rand()); return [cx + Math.cos(a) * d, gy + Math.sin(a) * d * 0.42, 0.2 + i * 0.03]; }); timed(1.0, (L, t) => { for (const [ax, ay, t0] of ar) { const u = (t - t0) / 0.3; if (u > 0 && u < 1) { const yy = ay - 70 * (1 - u); L.f.line(ax, yy, ax, yy - 8, EARTHC[1]); L.f.dot(ax, yy + 1, EARTHC[0]); } else if (u >= 1 && u < 2) { L.b.line(ax, ay, ax, ay - 5, EARTHC[3], 2 - u); } } }); } },

    /* -- moves on itself -- */
    // Endure: it braces, its outline burning red-orange, every muscle set.
    endure: { ...selfSig(FIGHTR, (L, b, c, t, k) => edgeLit(L, b, FIGHTR, k, 5)) },
    // Charge: electricity gathers into it from all round, bolts converging.
    charge: { ...selfSig(RAMP.electric, (L, b, [cx, cy], t, k) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 3, d = 26 * (1 - ((t * 2 + i / 6) % 1)); boltLine(L, bolt(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cx + Math.cos(a) * (d + 8), cy + Math.sin(a) * (d + 8), 0.4), RAMP.electric[1], k); } }) },
    // Moonlight: a moon over it pours pale light down on it.
    moonlight: { ...selfSig(MOONP, (L, b, [cx, , , y0], t, k) => { const my = Math.max(8, y0 - 30); L.f.disc(cx, my, 7, MOONC[1], k); L.f.disc(cx - 1.5, my - 1.5, 3, MOONC[0], k); for (let i = -2; i <= 2; i++) L.f.line(cx + i * 3, my + 7, cx + i * 5, y0 + b.h, MOONC[1], 0.4 * k); L.l.glow(cx, my, 22, MOONP[2], 0.6 * k); }) },
    // Slack Off: it lazes; a soft glow and a few drowsy bubbles.
    "slack-off": { ...selfSig(HEALR, (L, b, [cx, , , y0], t, k) => { for (let i = 0; i < 3; i++) { const u = (t * 1.2 + i / 3) % 1; L.f.ring(cx + 6 + i * 2, y0 - u * 14, 1.5 + i * 0.7, 1, HEALR[1], k * (1 - u)); } }, 0.8, 0.5) },
    // Bulk Up: its muscles swell - two red flares and shock rings off its shoulders.
    "bulk-up": { ...selfSig(FIGHTR, (L, b, [cx, cy], t, k) => { for (const t0 of [0.05, 0.3]) { const u = (t - t0) / 0.25; if (u > 0 && u < 1) for (const s2 of [-1, 1]) L.f.ring(cx + s2 * b.w * 0.45, cy - b.h * 0.2, 3 + u * 10, 1.5, FIGHTR[1], 1 - u); } }) },
    // Autotomize: it sheds weight - steel flakes fall off it as it lightens.
    autotomize: { fire({ side }) { const b = bodies[side]; if (!b) return; const [x0, y0] = origin(b); for (let i = 0; i < 12; i++) add({ k: "shard", x: x0 + range(0, b.w), y: y0 + range(0, b.h), vx: range(-30, 30), vy: -range(10, 40), g: 300, life: 0.6, size: 1.5, a: range(0, TAU), va: range(-10, 10), ramp: STEELW, gy: y0 + b.h }); timed(0.5, (L, t) => edgeLit(L, bodies[side], STEELW, 1 - t / 0.5, 6)); } },
    // Calm Mind: its eyes close; rings of calm pulse in round its head.
    "calm-mind": { ...selfSig(PSYL, (L, b, c, t, k) => { const [hx, hy] = [c[0], c[3] + b.h * 0.3]; for (let i = 0; i < 3; i++) { const u = 1 - ((t * 1.4 + i / 3) % 1); oval(L.f, hx, hy, 6 + u * 16, 3 + u * 8, PSYL[i === 1 ? 0 : 2], k * (1 - u)); } }, 0.9) },
    // Coil: rings of purple coil round it, tightening.
    coil: { ...selfSig(RAMP.poison, (L, b, [cx, , , y0], t, k) => { for (let i = 0; i < 3; i++) { const r = b.w * (0.75 - smooth(0, 0.5, t) * 0.2); for (let q = 0; q < TAU; q += 0.05) { const front = Math.sin(q) > 0; (front ? L.f : L.b).dot(cx + Math.cos(q + i) * r, y0 + b.h * (0.3 + i * 0.25) + Math.sin(q + i) * 3, RAMP.poison[front ? 2 : 4], k); } } }) },
    // Swords Dance: glowing swords spin in a ring round it.
    "swords-dance": { ...selfSig(STEELW, (L, b, [cx, cy], t, k) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 6, r = b.w * 0.5 + 10; swordAt(L, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.45, -Math.PI / 2, 12, k); } }, 0.9) },
    // Dragon Dance: a mystic dance - dragon flames rise off it in a spiral.
    "dragon-dance": { ...selfSig(RAMP.dragon, (L, b, [cx, , , y0], t, k) => { edgeFlames(L, b, RAGE, k * 0.8, 0, 1, 1.3); for (let i = 0; i < 24; i++) { const u = (i / 24 + t) % 1, a = u * TAU * 2 + time * 5; sparkle(Math.sin(a) > 0 ? L.f : L.b, cx + Math.cos(a) * (b.w * 0.6), y0 + b.h - u * (b.h + 8), 1, RAMP.dragon[1], RAMP.dragon[3]); } }, 0.9) },
    // Acid Armor: it melts into a purple glaze, drips running off it.
    "acid-armor": { fire({ side }) { const b = bodies[side]; if (b) { const [x0, y0] = origin(b); for (let i = 0; i < 8; i++) add({ k: "drop", x: x0 + range(0, b.w), y: y0 + range(b.h * 0.3, b.h * 0.8), vy: 10, g: 200, life: 0.6, ramp: SLUDGE, gy: y0 + b.h }); } timed(0.7, (L, t) => { const k = 1 - smooth(0.45, 0.7, t); outline(L, bodies[side], SLUDGE[2], k); edgeLit(L, bodies[side], SLUDGE, k * 0.6, 4); }); } },
    // Stuff Cheeks: a berry appears - and is gone; it glows, refreshed.
    "stuff-cheeks": { fire({ side, x: wx, y: wy, dx }) { timed(0.7, (L, t) => { const [ex, ey] = eyesAt(side, wx, wy), u = smooth(0, 0.3, t); if (t < 0.32) { const bx = ex + (dx || 1) * 14 * (1 - u), by = ey - 10 * (1 - u) + 4; L.f.disc(bx, by, 3, RAGE[3]); L.f.set(bx - 1, by - 1, RAGE[1]); L.f.line(bx, by - 3, bx + 1, by - 5, RAMP.grass[3]); } else auraOn(L, bodies[side], HEALR, 1 - smooth(0.4, 0.7, t), 0, 1); }); } },
    // Work Up: it psyches itself up - orange chevrons and a flare.
    "work-up": { ...selfSig(RAGE) },
    // Defend Order: a swarm of its subjects forms a shield round it.
    "defend-order": { ...selfSig(SPORE, (L, b, [cx, cy], t, k) => { for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU + time * 2 * (i % 2 ? 1 : -1), r = b.w * 0.6 + 4 + (i % 3) * 2, front = Math.sin(a) > 0; (front ? L.f : L.b).disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 1, i % 4 ? SPORE[3] : SPORE[6], k); } }, 0.9) },
    // Rock Polish: a gleam sweeps across its body, polished smooth.
    "rock-polish": { ...selfSig(RAMP.rock, (L, b, [cx, , x0, y0], t, k) => { const sw = smooth(0.05, 0.5, t) * (b.w + 10) - 5; edgeLit(L, b, RAMP.rock, k, 9); for (let j = 0; j < b.h; j += 1) L.f.dot(x0 + sw + j * 0.4 - b.h * 0.2, y0 + j, RAMP.normal[0], k); sparkle(L.f, x0 + sw, y0 + 2, 3, RAMP.normal[0], RAMP.rock[2]); }) },
    // Spiky Shield: a ring of thorns bursts out round it.
    "spiky-shield": { fire({ side }) { timed(0.45, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b), g = Math.min(1, t / 0.1), k = 1 - smooth(0.3, 0.45, t); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, r0 = 12, r1 = 12 + 8 * g; for (let d = r0; d < r1; d += 0.5) { const w = 2 * (1 - (d - r0) / (r1 - r0 + 0.01)); for (let o = -w; o <= w; o += 0.5) L.f.dot(cx + Math.cos(a) * d - Math.sin(a) * o, cy + Math.sin(a) * d + Math.cos(a) * o, RAMP.grass[o < 0 ? 2 : 4], k); } } }); } },
    // Clangorous Soul: its scales clang - rings of sound and a dragon's aura.
    "clangorous-soul": { fire({ side, x: wx, y: wy }) { SIG["dragon-dance"].fire({ side }); const [cx, cy] = at(side, wx, wy); ringsOut(cx, cy, 30, GOLD, 4); } },
    // Shift Gear: two gears turn beside it, meshing faster and faster.
    "shift-gear": { ...selfSig(STEELW, (L, b, [cx, cy], t, k) => { if (k < 0.2) return; sawDisc(L, cx - b.w * 0.6, cy - 4, 6, time * 18, STEELW); sawDisc(L, cx + b.w * 0.6, cy + 2, 5, -time * 22, GOLD); }) },

    /* -- shots -- */
    // Freeze-Dry: an icy orb that frosts the air it passes; frost blooms on the foe.
    "freeze-dry": { ...orbSig(ICEBEAM, 4.5, (L, x, y) => { for (let i = 0; i < 4; i++) { const a = time * 6 + i * 1.57; L.f.set(x + Math.cos(a) * 7, y + Math.sin(a) * 7, ICEBEAM[0]); } }, (x, y) => timed(0.4, (L, t) => flake(L, x, y, 8 * Math.min(1, t / 0.1), ICEBEAM, 1 - t / 0.4))) },
    // Gust: a small whirlwind blown at the foe.
    gust: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy + 0.1); queued.push((L) => { for (let yy = 0; yy < 18; yy++) { const u = yy / 18, r = 2 + u * 6; for (let q = 0; q < TAU; q += 0.4) { const a = q + time * 16 - yy * 0.35, front = Math.sin(a) > 0; if ((yy + Math.floor(q * 3)) % 3 === 0) (front ? L.f : L.b).dot(x + Math.cos(a) * r, y - yy + Math.sin(a) * r * 0.25, WINDC[front ? 1 : 3], 0.9); } } }); return true; } },
    // Volt Switch: a crackling ball of electricity that zips out and back.
    "volt-switch": { ...orbSig(RAMP.electric, 4, (L, x, y) => { for (let i = 0; i < 3; i++) { const p = bolt(x, y, x + range(-9, 9), y + range(-9, 9), 0.4); boltLine(L, p, RAMP.electric[1]); } }) },
    // Draining Kiss: a pink heart blown to the foe, and its warmth flows back.
    "draining-kiss": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { heartAt(L, x, y + Math.sin(time * 12) * 1.5, 4, GLEAM); L.l.glow(x, y, 10, GLEAM[3], 0.5); }); return true; }, hit(c) { SIG._drain.hit({ ...c, type: "fairy" }); } },
    // Spore: a cloud of golden spores (the powder family's, in mushroom gold).
    spore: { ...SIG._powder },
    // Overheat: a white-hot fireball, everything it has; it is left smoking and spent.
    overheat: { ...orbSig(HEAT, 7, (L, x, y) => { L.f.disc(x, y, 3.5, HEAT[0]); }, (x, y) => { for (let i = 0; i < 16; i++) { const a = range(0, TAU), sp = range(50, 130); add({ k: "flame", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, drag: 2.5, life: 0.45, size: 1.8 }); } }), fire({ side }) { timed(1.0, (L, t) => { const b = bodies[side]; if (t < 0.2) edgeLit(L, b, HEAT, 1 - t / 0.2, 3); else if (b && rand() < 0.3) { const [cx, , , y0] = centreOf(b); add({ k: "smoke", x: cx + range(-6, 6), y: y0, vy: -20, life: 0.6, size: 2 }); } }); } },
    // Thunder: a ball of crackling thunder (the bolt from the sky on the hit is render.js's).
    thunder: { ...orbSig(RAMP.electric, 5, (L, x, y) => { const p = bolt(x, y - 12, x + range(-4, 4), y, 0.4); boltLine(L, p, RAMP.electric[0]); }) },
    // Petal Dance: petals whirl round in a storm on their way to the foe.
    "petal-dance": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 12; i++) { const u = i / 12, a = time * 8 + u * TAU * 2, r = 4 + u * 9; leafAt(L, x - dx * u * 10 + Math.cos(a) * r, y - dy * u * 10 + Math.sin(a) * r * 0.7, a + time * 5, 2.5, PETAL); } }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 16; i++) { const a = range(0, TAU), sp = range(40, 110); add({ k: "leaf", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, drag: 2, sway: 30, a, va: range(-12, 12), life: range(0.5, 0.9), ramp: PETAL }); } } },
    // Ember: a few small flames flicked at the foe.
    ember: { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); if (rand() < 0.6) add({ k: "flame", x: x - dx * 3, y, vx: -dx * 30, vy: -range(10, 30), drag: 2, life: 0.3, size: 1 }); queued.push((L) => { for (let i = 0; i < 3; i++) { const a = time * 9 + (i * TAU) / 3; L.f.disc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.2, HEAT[3]); L.f.disc(x + Math.cos(a) * 3, y + Math.sin(a) * 3 - 0.5, 1.2, HEAT[1]); } L.l.glow(x, y, 10, HEAT[4], 0.5); }); return true; } },
    // Swift: golden stars that never miss, spinning in on the foe.
    swift: { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); if (rand() < 0.5) add({ k: "star", x, y, vx: -dx * 20, vy: -dy * 20, life: 0.35, size: 1, ramp: STARW }); queued.push((L) => { for (let i = 0; i < 3; i++) { const a = time * 5 + (i * TAU) / 3; starAt(L, x + Math.cos(a) * 6, y + Math.sin(a) * 5, 3.5, time * 8 + i, STARW); } L.l.glow(x, y, 14, STARW[3], 0.5); }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); timed(0.4, (L, t) => { for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; starAt(L, x + Math.cos(a) * t * 50, y + Math.sin(a) * t * 50, 3 * (1 - t / 0.4) + 0.5, t * 8, STARW); } }); } },
    // Acid: drops of acid spat at the foe; they hiss where they land.
    acid: { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 3; i++) { const bx = x - dx * i * 4 + Math.sin(time * 20 + i) , by = y - dy * i * 4 + i; L.f.disc(bx, by, 2.2 - i * 0.4, GASR[3]); L.f.set(bx - 0.5, by - 1, GASR[0]); } }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 6; i++) add({ k: "smoke", x: x + range(-5, 5), y, vy: -range(10, 20), life: 0.5, size: 2, smoke: [GASR[0], GASR[1], GASR[2], GASR[2]] }); for (let i = 0; i < 8; i++) add({ k: "drop", x, y, vx: range(-50, 50), vy: -range(20, 60), g: 300, life: 0.5, ramp: GASR, gy: y + 14 }); } },
    // Mega Drain and Absorb: a ball of green light, and the foe's strength streams back.
    "mega-drain": { ...orbSig(ENERGYB, 3.5), hit(c) { SIG._drain.hit({ ...c, type: "grass" }); } },
    absorb: { ...orbSig(ENERGYB, 2.5), hit(c) { SIG._drain.hit({ ...c, type: "grass" }); } },
    // Stored Power: orbs of psychic light, one for every boost it holds, circling as they fly.
    "stored-power": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 5; i++) { const a = time * 7 + (i * TAU) / 5; orbAt(L, x + Math.cos(a) * 6, y + Math.sin(a) * 4, 2, PSYSH); } L.f.disc(x, y, 2, PSYSH[0]); }); return true; } },
    // Leaf Tornado: a whirling green tornado full of leaves.
    "leaf-tornado": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy + 0.2); queued.push((L) => { for (let yy = 0; yy < 24; yy += 2) { const u = yy / 24, r = 3 + u * 8, a = time * 14 - yy * 0.4; leafAt(L, x + Math.cos(a) * r, y - yy + Math.sin(a) * r * 0.25, a, 2.5, yy % 4 ? LEAFB : RAMP.grass); } }); return true; } },
    // Smog: a cloud of filthy gas drifting at the foe; it chokes round it.
    smog: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 6; i++) { const a = i + time * 2; L.f.disc(x + Math.cos(a) * 4, y + Math.sin(a) * 3, 3.5, GASR[i % 2 ? 4 : 5], 0.9); } L.f.disc(x, y, 3, GASR[3]); }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 8; i++) add({ k: "smoke", x: x + range(-8, 8), y: y + range(-6, 6), vx: range(-10, 10), vy: -range(5, 15), life: range(0.6, 1), size: 3.5, smoke: [GASR[3], GASR[4], GASR[5], GASR[5]] }); } },
    // Toxic: a glob of deep purple poison; its venom seeps into the foe.
    toxic: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { blob(L, x, y, 4.5, VENOM); L.f.set(x - 1.5, y - 1.5, VENOM[0]); }); return true; }, hit({ side, x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 8; i++) add({ k: "bubble", x: x + range(-8, 8), y: y + range(-4, 6), vy: -range(10, 22), sway: 8, life: range(0.5, 0.9), size: range(1, 2), ramp: VENOM }); timed(0.5, (L, t) => outline(L, bodies[side], VENOM[2], 1 - t / 0.5)); } },
    // Fairy Wind: a sparkling pink breeze.
    "fairy-wind": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 4; i++) { const off = (i - 1.5) * 3; for (let d = 0; d < 12; d++) L.f.dot(x - dx * d - dy * off, y - dy * d + dx * off + Math.sin(d * 0.6 + time * 20 + i) * 1.5, GLEAM[d < 3 ? 0 : 2], 1 - d / 12); } sparkle(L.f, x, y, 2, GLEAM[0], GLEAM[3]); }); return true; } },
    // Frost Breath: a cold breath of frost, crystals glinting in it.
    "frost-breath": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); if (rand() < 0.7) add({ k: "mote", x: x + range(-4, 4), y: y + range(-4, 4), vx: -dx * 20 + range(-10, 10), vy: range(-10, 10), drag: 2, life: 0.5, ramp: ICYW }); queued.push((L) => { for (let i = 0; i < 8; i++) { const a = i * 0.8 + time * 4, d = 1 + (i % 4) * 1.6; L.f.disc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, ICYW[i % 2 ? 2 : 3], 0.9); } flake(L, x, y, 3, ICYW); }); return true; } },
    // Whirlpool: a spinning vortex of water; it swirls round the foe's feet and holds it.
    whirlpool: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.3); queued.push((L) => { for (let q = 0; q < TAU * 2; q += 0.08) { const r = 1 + q * 1.1, a = q + time * 14; L.f.dot(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5, RAMP.water[q < 3 ? 1 : 3]); } }); return true; }, hit({ side, x: wx, y: wy }) { const [x, gy] = toPx(wx, wy + 0.42); timed(1.0, (L, t) => { const k = smooth(0, 0.1, t) * (1 - smooth(0.7, 1.0, t)); for (let i = 0; i < 2; i++) for (let q = 0; q < TAU * 2; q += 0.05) { const r = 3 + q * 1.6, a = q + time * 12 + i * Math.PI; L.b.dot(x + Math.cos(a) * r, gy + Math.sin(a) * r * 0.4, RAMP.water[i ? 1 : 3], k); } }); } },
    // Mystical Power: an odd blue-violet power ringing out of it.
    "mystical-power": { ...orbSig(PSYB, 4.5, (L, x, y) => rings(L.f, x, y, 8 + Math.sin(time * 15) * 1.5, 8, PSYB[2], 0.7)) },
    // Thunder Shock: a quick jagged bolt.
    "thunder-shock": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { const p = bolt(x - dx * 12, y - dy * 12, x, y, 0.35); boltLine(L, p, RAMP.electric[1]); boltLine(L, p.map(([a, b]) => [a, b + 1]), RAMP.electric[3]); L.l.glow(x, y, 8, RAMP.electric[2], 0.6); }); return true; } },
    // Fiery Dance: it dances in a whirl of flame and flings a ring of fire.
    "fiery-dance": { fire({ side }) { SIG["flame-wheel"].fire({ side }); }, shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let q = 0; q < TAU; q += 0.15) { const a = q + time * 14; L.f.disc(x + Math.cos(a) * 6, y + Math.sin(a) * 6 * 0.7, 1.6, HEAT[2 + Math.floor((q / TAU) * 5)]); } L.l.glow(x, y, 14, HEAT[4], 0.6); }); return true; } },
    // Mystical Fire: a blue-violet flame of mystery.
    "mystical-fire": { ...orbSig(PHANTOM, 4.5, (L, x, y) => { for (let i = 0; i < 4; i++) L.f.dot(x + range(-3, 3), y - 5 - range(0, 4), PHANTOM[2]); }) },
    // Photon Geyser: a pillar of light bursts up from under the foe.
    "photon-geyser": { ...orbSig(STARW, 5), hit({ x: wx, y: wy }) { const [x, gy] = toPx(wx, wy + 0.42); timed(0.7, (L, t) => { const h = 90 * smooth(0, 0.12, t), k = 1 - smooth(0.4, 0.7, t), w = 9 * (1 - smooth(0.3, 0.7, t)) + 2; for (let yy = 0; yy < h; yy++) for (let o = -w; o <= w; o += 0.5) L.f.dot(x + o, gy - yy, Math.abs(o) < w * 0.4 ? STARW[0] : STARW[2], k); L.l.glow(x, gy - 30, 40, STARW[3], k); }); } },
    // Bitter Malice: a chill of spite - a dark, frosty ghost-fire.
    "bitter-malice": { ...orbSig(SHADOWB, 4.5, (L, x, y) => { for (let i = 0; i < 3; i++) L.f.set(x + range(-6, 6), y + range(-6, 6), ICYW[1]); }) },
    // Snore: it snores - sound waves and a drifting Z.
    snore: { ...SIG._sound, shot(c) { SIG._sound.shot({ ...c, type: "normal" }); const [x, y] = toPx(c.x, c.y - 0.4); if (rand() < 0.15) add({ k: "z", x, y: y - 6, vy: -16, sway: 8, life: 0.6, size: 3, ramp: VOICE }); return true; } },
  });
  const INK = ["#ffffff", "#c8c8d8", "#7a7a90", "#4a4a5e", "#2a2a3a", "#141420", "#08080e"].map(hex);
  const STEAMR = ["#ffffff", "#f4f8fc", "#dfe7f0", "#c4cfdc", "#a0acbc", "#7a8698", "#4a5262"].map(hex);
  Object.assign(SIG, {
    // Branch Poke: a sharp branch jabbed into the foe.
    "branch-poke": { fire({ x: wx, y: wy, dx, dy }) { const [x, y] = reachOf(wx, wy, dx, dy, 0.5); timed(0.3, (L, t) => { const g = Math.min(1, t / 0.08), k = 1 - smooth(0.2, 0.3, t); for (let d = 0; d < 18 * g; d += 0.5) { L.f.dot(x + dx * d, y + dy * d, BARK[2], k); L.f.dot(x + dx * d, y + dy * d + 1, BARK[4], k); } L.f.disc(x + dx * 8 - dy * 3, y + dy * 8 + dx * 3 - 1, 1.5, RAMP.grass[3], k); }); }, ...blowSig(BARK, null, false) },
    // Spirit Shackle: shadow arrows pin the foe's shadow, a ring of chains round its feet.
    "spirit-shackle": { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4), gy = toPx(0, wy + 0.42)[1]; fxs.push(blowFx(x, y, SHADOWB, true)); timed(0.9, (L, t) => { const k = 1 - smooth(0.6, 0.9, t); for (let q = 0; q < TAU; q += 0.25) L.b.ring(x + Math.cos(q + time) * 12, gy + Math.sin(q + time) * 5, 1.5, 1, SHADOWB[2], k); for (let i = 0; i < 3; i++) { const ox = (i - 1) * 7; L.f.line(x + ox, gy - 10, x + ox, gy, SHADOWB[1], k); L.f.dot(x + ox, gy - 11, SHADOWB[0], k); } }); } },
    // Flower Trick: a bouquet pops open on the foe - a flower blooms and bursts.
    "flower-trick": { hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); timed(0.5, (L, t) => { const g = t < 0.1 ? outBack(t / 0.1, 2) : 1, k = 1 - smooth(0.3, 0.5, t); for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + t * 3; L.f.disc(x + Math.cos(a) * 5 * g, y + Math.sin(a) * 5 * g, 3.2 * g, PETAL[i % 2 ? 3 : 2], k); } L.f.disc(x, y, 2.5 * g, GOLD[2], k); }); for (let i = 0; i < 10; i++) { const a = range(0, TAU), sp = range(40, 90); add({ k: "leaf", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, drag: 2, sway: 25, a, va: range(-10, 10), life: 0.7, ramp: PETAL, delay: 0.2 }); } } },
    // Octazooka: a ball of ink shot from its mouth; it bursts into a black cloud.
    octazooka: { ...orbSig(INK, 4.5), hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 10; i++) add({ k: "smoke", x: x + range(-6, 6), y: y + range(-6, 6), vx: range(-15, 15), vy: -range(5, 15), life: range(0.6, 1), size: 3.5, smoke: [INK[3], INK[4], INK[5], INK[6]] }); for (let i = 0; i < 8; i++) add({ k: "drop", x, y, vx: range(-60, 60), vy: -range(20, 70), g: 300, life: 0.6, ramp: INK, gy: y + 16 }); } },
    // Mud-Slap: a clod of mud flung in the foe's face; it splatters.
    "mud-slap": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => blob(L, x, y, 3.5, EARTHC)); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 12; i++) add({ k: "drop", x, y, vx: range(-70, 70), vy: -range(20, 70), g: 300, life: 0.6, ramp: EARTHC, gy: y + 16 }); } },
    // Sludge: a gob of sludge (Sludge Bomb's splat, smaller).
    sludge: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { blob(L, x, y, 4.5, SLUDGE); L.f.set(x - 1.5, y - 1.5, SLUDGE[0]); }); return true; }, hit(c) { SIG["sludge-bomb"].hit(c); } },
    // Weather Ball: a ball of the sky itself - a little cloud swirling in an orb of air.
    "weather-ball": { ...orbSig(AIRB, 5, (L, x, y) => { for (let i = 0; i < 4; i++) { const a = time * 4 + i * 1.57; L.f.disc(x + Math.cos(a) * 2, y + Math.sin(a) * 1.5, 1.8, STEAMR[1]); } }) },
    // Vacuum Wave: a spinning ball of vacuum, air whirling round a hollow core.
    "vacuum-wave": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 3; i++) for (let q = 0; q < TAU; q += 0.12) { const a = q + time * (18 + i * 6); if ((Math.floor(q * 3) + i) % 2) L.f.dot(x + Math.cos(a) * (3 + i * 2), y + Math.sin(a) * (3 + i * 2), WINDC[i], 1); } }); return true; } },
    // Flame Burst: a fireball that bursts into a spray of embers.
    "flame-burst": { ...orbSig(HEAT, 5, null, (x, y) => { for (let i = 0; i < 14; i++) { const a = range(0, TAU), sp = range(50, 120); add({ k: "ember", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2, life: range(0.4, 0.7) }); } }) },
    // Clear Smog: a puff of white gas; it clears round the foe.
    "clear-smog": { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 6; i++) { const a = i + time * 2; L.f.disc(x + Math.cos(a) * 4, y + Math.sin(a) * 3, 3.2, STEAMR[i % 2 ? 2 : 3], 0.9); } }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); for (let i = 0; i < 8; i++) add({ k: "smoke", x: x + range(-8, 8), y: y + range(-6, 6), vy: -range(5, 15), life: range(0.6, 1), size: 3.5, smoke: [STEAMR[1], STEAMR[2], STEAMR[3], STEAMR[4]] }); } },
    // Charge Beam: a crackling line of electricity fired straight.
    "charge-beam": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { const p = bolt(x - dx * 22, y - dy * 22, x, y, 0.15); boltLine(L, p, RAMP.electric[0]); boltLine(L, p.map(([a, b]) => [a, b + 1]), RAMP.electric[2]); orbAt(L, x, y, 2.5, RAMP.electric); }); return true; } },
    // Glaciate: a freezing wind full of ice crystals.
    glaciate: { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 4; i++) { const a = time * 5 + i * 1.57; flake(L, x - dx * i * 4 + Math.cos(a) * 3, y - dy * i * 4 + Math.sin(a) * 3, 3 - i * 0.4, ICEBEAM, 1 - i * 0.2); } }); return true; }, hit({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); timed(0.4, (L, t) => flake(L, x, y, 9 * Math.min(1, t / 0.1), ICEBEAM, 1 - t / 0.4)); } },
    // Scald: a ball of boiling water trailing steam.
    scald: { ...orbSig(RAMP.water, 4.5, (L, x, y) => { for (let i = 0; i < 3; i++) L.f.disc(x + Math.sin(time * 9 + i) * 3, y - 6 - i * 3, 1.5, STEAMR[2], 0.7); }, (x, y) => { for (let i = 0; i < 6; i++) add({ k: "smoke", x: x + range(-5, 5), y, vy: -range(10, 25), life: 0.6, size: 2.5, smoke: [STEAMR[1], STEAMR[2], STEAMR[3], STEAMR[4]] }); }) },
    // Snipe Shot: a needle of water fired dead straight, a long trail behind it.
    "snipe-shot": { shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let d = 0; d < 26; d++) { const w = d < 5 ? 1.5 : 0.6; for (let o = -w; o <= w; o += 0.5) L.f.dot(x - dx * d - dy * o, y - dy * d + dx * o, d < 4 ? RAMP.water[0] : RAMP.water[2], 1 - d / 26); } L.l.glow(x, y, 8, RAMP.water[3], 0.6); }); return true; } },
    // Infestation: a swarm of bugs flies at the foe and buzzes round it.
    infestation: { shot({ x: wx, y: wy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { for (let i = 0; i < 12; i++) { const a = time * (8 + i) + i, d = 2 + (i % 4) * 1.5; L.f.dot(x + Math.cos(a) * d, y + Math.sin(a * 1.3) * d, RAMP.bug[i % 3 ? 4 : 2]); } }); return true; }, hit({ side }) { timed(1.0, (L, t) => { const b = bodies[side]; if (!b) return; const [cx, cy] = centreOf(b), k = 1 - smooth(0.7, 1.0, t); for (let i = 0; i < 14; i++) { const a = time * (5 + i * 0.4) + i, r = b.w * 0.5 + 3 + (i % 3) * 2; L.f.dot(cx + Math.cos(a) * r, cy + Math.sin(a * 1.2) * r * 0.7, RAMP.bug[i % 2 ? 4 : 2], k); } }); } },
    // Terrain Pulse: a pulse of the ground's own energy, flecks of every terrain round it.
    "terrain-pulse": { ...orbSig(RAMP.normal, 4.5, (L, x, y) => { for (let i = 0; i < 4; i++) { const a = time * 6 + i * 1.57; L.f.disc(x + Math.cos(a) * 7, y + Math.sin(a) * 5, 1.4, [RAMP.grass, RAMP.electric, PSYL, GLEAM][i][2]); } }) },
    // Esper Wing: wings of psychic light, a feather-blade flung at the foe.
    "esper-wing": { fire({ side }) { timed(0.35, (L, t) => auraOn(L, bodies[side], PSYL, 1 - smooth(0.2, 0.35, t), 0.5, 1)); }, shot({ x: wx, y: wy, dx, dy }) { const [x, y] = toPx(wx, wy - 0.4); queued.push((L) => { leafAt(L, x, y, Math.atan2(dy, dx), 6, PSYL); leafAt(L, x - dx * 5, y - dy * 5 + 3, Math.atan2(dy, dx) + 0.3, 4, PSYL); L.l.glow(x, y, 12, PSYL[3], 0.5); }); return true; } },
  });
  /* A HAZARD ON THE FLOOR (render.js, every frame it lies there): Spikes are steel caltrops, Toxic Spikes
     purple with bubbles, Stealth Rock pointed stones hovering over the spot, Sticky Web a silk web. */
  function hazard(id, kind, wx, wy, fade) {
    const [x, y] = toPx(wx, wy + 0.2), k = Math.max(0, Math.min(1, fade)), S = 1.6;
    queued.push((L) => {
      // The zone it holds, faintly on the floor, so it reads under a body standing in it.
      L.b.ring(x, y, 16, 1, kind === "toxic-spikes" ? VENOM[3] : kind === "sticky-web" ? SILK[3] : STONEB[4], k * 0.5, 0.45);
      if (kind === "sticky-web") {
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; for (let d = 0; d < 18; d += 0.5) L.b.set(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.45, SILK[1]); }
        for (const r of [5, 10, 15]) for (let q = 0; q < TAU; q += 0.03) { const sag = 1 - 0.12 * Math.abs(Math.sin(q * 4)); L.b.set(x + Math.cos(q) * r * sag, y + Math.sin(q) * r * 0.45 * sag, SILK[0]); }
        return;
      }
      if (kind === "stealth-rock") {
        for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + id, sx2 = x + Math.cos(a) * 13, sy2 = y - 12 + Math.sin(a) * 5 + Math.sin(time * 3 + i) * 1.5;
          for (let yy = -7; yy <= 7; yy++) { const w = 4.4 * (1 - Math.abs(yy) / 7.5); for (let xx = -w; xx <= w; xx += 0.5) L.f.dot(sx2 + xx, sy2 + yy, Math.abs(xx) > w - 0.8 ? STONEB[6] : xx < 0 ? STONEB[2] : STONEB[4], k); }
          L.b.dot(sx2, y + 1, SHADE, k * 0.6); L.l.glow(sx2, sy2, 6, STONEB[2], 0.25 * k); }
        return;
      }
      const C = kind === "toxic-spikes" ? VENOM : STEELW;
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + id, r = i % 3 ? 13 : 5, cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r * 0.45;
        for (let yy = 0; yy < 4 * S; yy++) { const w = 1.8 * S * (1 - yy / (4 * S)); for (let xx = -w - 0.5; xx <= w + 0.5; xx += 0.5) L.b.dot(cx + xx, cy - yy, Math.abs(xx) > w ? C[6] : yy >= 4 * S - 1 ? C[0] : xx < 0 ? C[2] : C[4], k); } }
      if (kind === "toxic-spikes" && Math.floor(time * 4 + id) % 3 === 0) add({ k: "bubble", x: x + range(-8, 8), y: y - 2, vy: -14, sway: 8, life: 0.6, size: 1.2, ramp: VENOM });
    });
  }
  // HELD UP BY A MIND MOVE: the body ringed in a blue aura and outline while it is lifted (`h` 0..1).
  function lift(side, h) { queued.push((L) => { auraOn(L, bodies[side], PSYL, h * 0.9, 0, 0.4); outline(L, bodies[side], PSYL[1], h); }); }
  // A THROWN BOULDER, at world (wx, wy): a pixel rock tumbling (its seed turns with `rot`), `size` in tiles.
  function rock(wx, wy, rot, size, alpha = 1) { if (alpha < 0.3 || size <= 0) return; const [x, y] = toPx(wx, wy); queued.push((L) => rockAt(L, x, y, size * BODY_PX * 1.4, Math.floor(rot * 3))); }
  /* EVOLVING, as the games draw it: a pillar of light down onto the body, rings rising up it and motes drawn
     in, brighter as it nears the change (`q` 0..1); a Mega's in a rainbow helix of two strands. */
  function evolve(wx, wy, q, mega) {
    const [x, gy] = toPx(wx, wy + 0.42), w = 6 + 8 * q;
    queued.push((L) => {
      for (let yy = 0; yy < 110; yy++) { const u = yy / 110, ww = w * (1 - u * 0.3) * (0.92 + 0.08 * Math.sin(yy * 0.3 - time * 20)); for (let o = -ww; o <= ww; o += 0.5) { const b = Math.abs(o) / ww; L.b.dot(x + o, gy - yy, b < 0.35 ? RAMP.normal[0] : mega ? RAINBOW[Math.floor(yy / 6 + time * 10) % RAINBOW.length] : RAMP.ice[b < 0.7 ? 1 : 3], (0.55 + 0.45 * q) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1)); } }
      for (let i = 0; i < 3; i++) { const u = (time * 0.9 + i / 3) % 1; L.f.ring(x, gy - u * 70, 8 + q * 6, 1, mega ? RAINBOW[i * 2] : RAMP.ice[0], (1 - u) * (0.5 + 0.5 * q), 0.35); }
      if (mega) for (let i = 0; i < 24; i++) { const h = i / 24, a = time * 3 + h * TAU * 1.5; for (const off of [0, Math.PI]) { const front = Math.sin(a + off) > 0; (front ? L.f : L.b).disc(x + Math.cos(a + off) * 13, gy - 6 - h * 44, 1.4, RAINBOW[i % RAINBOW.length], front ? 1 : 0.5); } }
      L.l.glow(x, gy - 20, 30 + 20 * q, mega ? RAINBOW[Math.floor(time * 8) % RAINBOW.length] : RAMP.ice[2], 0.3 + 0.4 * q);
    });
  }
  // THE MEGA SYMBOL over a new Mega: a rainbow ring and the two strands it carries, swelling in and fading.
  function megaSymbol(wx, wy, grow, fade) {
    const [x, y] = toPx(wx, wy), r = 12 * grow;
    if (r < 1 || fade <= 0) return;
    queued.push((L) => {
      for (let q = 0; q < TAU; q += 0.03) { const c = RAINBOW[Math.floor(((q + time) / TAU) * RAINBOW.length * 2) % RAINBOW.length]; L.f.dot(x + Math.cos(q) * r, y + Math.sin(q) * r, c, fade); L.f.dot(x + Math.cos(q) * (r - 1), y + Math.sin(q) * (r - 1), c, fade); }
      for (const sd of [-1, 1]) for (let u = 0; u <= 1; u += 0.02) { const [px2, py] = bez([x + sd * r * 0.5, y + r * 0.55], [x + sd * r * 0.9, y - r * 0.3], [x, y - r * 0.6], u); L.f.disc(px2, py, 1, RAMP.normal[0], fade); }
      L.f.disc(x, y + r * 0.15, r * 0.16, RAMP.normal[0], fade);
      L.l.glow(x, y, r * 2, RAINBOW[Math.floor(time * 6) % RAINBOW.length], 0.5 * fade);
    });
  }
  // A signature move's moment (`fire`, `hit`, `beam`, `pulse`): true when it drew it, so render.js leaves the generic look out.
  const sig = (slug, when, c) => { const h = SIG[slug]?.[when]; if (!h) return false; return h(c) ?? true; };
  // Whether a signature move draws this moment itself (a shot it draws needs no sprite under it).
  const sigHas = (slug, when) => Boolean(SIG[slug]?.[when]);
  const ultHas = (name) => Boolean(ULT[name]);
  // The cast: `side`, where its user and its foe stand (world tiles), `dx` its facing.
  function ultCast(name, c) { ULT[name]?.cast(c); }
  // A landing: a strike (`x, y, r, follow`) or a cannon's beam (`x, y, dx, dy, len`).
  function ultLand(name, c) { ULT[name]?.land(c); }

  // Effect frames (render.js's `k`, through its hit-stop and slow motion): everything moves by them.
  function step(k) {
    const dt = k / 60;
    frame++;
    time += dt;
    for (let i = fxs.length - 1; i >= 0; i--) { fxs[i].update(dt); if (fxs[i].t > fxs[i].life) fxs.splice(i, 1); }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      if ((p.t += dt) >= p.life) { parts.splice(i, 1); continue; }
      if (p.sway) p.vx += Math.sin(p.t * 6 + p.seed) * p.sway * dt;
      p.vy += p.g * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.a += p.va * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > p.gy && p.vy > 0) { p.y = p.gy; p.vy *= -0.35; p.vx *= 0.6; }
    }
  }
  /* The frame's three buffers, each put to its canvas. Nothing live, nothing
     drawn: a match spends no time here between blows. */
  function paint(light) {
    breakDomes();
    if (!fxs.length && !parts.length && !queued.length) return false;
    L.b.clear(); L.f.clear(); L.l.clear(); L.l.on = light;
    for (const e of fxs) e.draw(L);
    for (const p of parts) if (p.delay <= 0) drawPart(L, p, frame);
    for (const q of queued) q(L);
    queued.length = 0;
    for (const [id, c] of arcs) if (c.seen !== frame) arcs.delete(id);
    canvases[0].getContext("2d").putImageData(L.b.img, 0, 0);
    canvases[1].getContext("2d").putImageData(L.f.img, 0, 0);
    if (light) { L.l.bake(); canvases[2].getContext("2d").putImageData(L.l.img, 0, 0); }
    return true;
  }
  /* Drawn in world space by render.js: `x0, y0` the canvas point of the
     buffer's corner (the court's corner less MARGIN), `scale` one effect
     pixel. The colour layers stay hard pixels; the light is upscaled soft. */
  function blit(ctx, layer, x0, y0, scale) {
    const c = canvases[layer === "back" ? 0 : layer === "front" ? 1 : 2];
    ctx.save();
    if (layer === "light") { ctx.globalCompositeOperation = "lighter"; ctx.imageSmoothingEnabled = true; }
    else ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, x0, y0, bw * scale, bh * scale);
    ctx.restore();
  }
  return { impact, shot, stream, beam, status, setBody, afterimage, speed, shield, shieldHit, heal, boost, strike, pillar, air,
    ultCast, ultLand, ultHas, sig, sigHas, hazard, lift, rock, evolve, megaSymbol, jaws, dizzy, swirl, cloud, step, paint, blit, MARGIN, lite(on) { cap = on ? 180 : 360; } };
}
