/* node tools/fetch-leagues.mjs — every region's League, from Bulbapedia.

   Writes src/data/leagues.js: per region, its gyms in the game's order (the
   gym's own trainers, then its leader) and its League run (Elite Four and
   Champion, or Galar's Champion Cup), each a party of [dex id, level].
   docs/battles.md is the design; this is its *Sources* row.

   WHY BULBAPEDIA. It is the one source that covers all nine regions in one
   structured shape: a leader is a `{{Party}}` block carrying its game, and
   each Pokémon a `{{Pokémon}}` block carrying its dex number and level; a
   gym's own trainers are `{{Trainerentry}}` rows. pret's decompilations cover
   three regions and PokéAPI has no trainers. Dex numbers come straight off
   the page, so no species is matched by name except a regional form.

   ONE GAME PER REGION, AND THE FIRST-NAMED VERSION WINS where the two differ
   (Black 2's Drayden over White 2's Iris, Sword's Bea over Shield's Allister).
   `codes` lists what a Party's `game =` may say for that game, most specific
   last, and never names the second version - so the rule cannot be applied
   inconsistently, and a re-fetch applies it again.

   FIRST BATTLES ONLY: a leader's first party for the game, never one under a
   Rematch heading; a League member's first party at the League's venue.

   Pages are cached in .assets-src/bulbapedia/, so a re-run asks the wiki
   nothing. Requests are paced and carry a User-Agent that says who we are. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { SPECIES } from "../src/data/dex.js";

const ROOT = new URL("../", import.meta.url);
const CACHE = new URL(".assets-src/bulbapedia/", ROOT);
mkdirSync(CACHE, { recursive: true });
const UA = "Dexora/0.2 (non-commercial fan game; builds its trainer rosters once and caches them)";

/* THE REGIONS, in unlock order. `marker` finds the game's own section on a
   page that covers several games; `venue` is the page listing the League run
   in order; `champion` is where that run stops (Alola's is a class-less
   "Pokémon Trainer", so a class cannot say it). */
const REGIONS = [
  { id: "kanto", name: "Kanto", game: "FireRed", codes: ["FRLG", "FR"], gen: 3, marker: /FireRed/,
    gyms: ["Pewter Gym", "Cerulean Gym", "Vermilion Gym", "Celadon Gym", "Fuchsia Gym",
      "Saffron Gym", "Cinnabar Gym", "Viridian Gym"],
    venue: "Indigo Plateau", champion: "Blue" },
  { id: "johto", name: "Johto", game: "HeartGold", codes: ["HGSS", "HG"], gen: 4, marker: /HeartGold/,
    gyms: ["Violet Gym", "Azalea Gym", "Goldenrod Gym", "Ecruteak Gym", "Cianwood Gym",
      "Olivine Gym", "Mahogany Gym", "Blackthorn Gym"],
    venue: "Indigo Plateau", champion: "Lance" },
  { id: "hoenn", name: "Hoenn", game: "Emerald", codes: ["E"], gen: 3, marker: /Emerald/,
    gyms: ["Rustboro Gym", "Dewford Gym", "Mauville Gym", "Lavaridge Gym", "Petalburg Gym",
      "Fortree Gym", "Mossdeep Gym", "Sootopolis Gym"],
    venue: "Pokémon League (Hoenn)", champion: "Wallace" },
  { id: "sinnoh", name: "Sinnoh", game: "Platinum", codes: ["Pt"], gen: 4, marker: /Platinum/,
    gyms: ["Oreburgh Gym", "Eterna Gym", "Hearthome Gym", "Veilstone Gym", "Pastoria Gym",
      "Canalave Gym", "Snowpoint Gym", "Sunyshore Gym"],
    venue: "Pokémon League (Sinnoh)", champion: "Cynthia" },
  { id: "unova", name: "Unova", game: "Black 2", codes: ["B2W2", "B2"], gen: 5, marker: /Black 2/,
    gyms: ["Aspertia Gym", "Virbank Gym", "Castelia Gym", "Nimbasa Gym", "Driftveil Gym",
      "Mistralton Gym", "Opelucid Gym", "Humilau Gym"],
    venue: "Pokémon League (Unova)", champion: "Iris" },
  { id: "kalos", name: "Kalos", game: "X", codes: ["XY"], gen: 6, marker: /\bX and Y\b/,
    gyms: ["Santalune Gym", "Cyllage Gym", "Shalour Gym", "Coumarine Gym", "Lumiose Gym",
      "Laverre Gym", "Anistar Gym", "Snowbelle Gym"],
    venue: "Pokémon League (Kalos)", champion: "Diantha" },
  /* Alola has no gyms: its leaders are the four Kahunas' grand trials, read
     off each Kahuna's own page (the first party whose class is a Kahuna's),
     and its badges are their Z-Crystals. The grand trials have no trainers. */
  { id: "alola", name: "Alola", game: "Ultra Sun", codes: ["USUM", "US"], gen: 7, marker: /Ultra Sun/,
    kahunas: [["Hala", "Fightinium Z"], ["Olivia", "Rockium Z"], ["Nanu", "Darkinium Z"],
      ["Hapu", "Groundium Z"]],
    venue: "Pokémon League (Alola)", champion: "Hau" },
  { id: "galar", name: "Galar", game: "Sword", codes: ["SwSh", "Sw"], gen: 8, marker: /Sword/,
    gyms: ["Turffield Stadium", "Hulbury Stadium", "Motostoke Stadium", "Stow-on-Side Stadium",
      "Ballonlea Stadium", "Circhester Stadium", "Spikemuth", "Hammerlocke Stadium"],
    venue: "Wyndon Stadium", champion: "Leon" },
  /* Paldea's gyms can be taken in any order in the game; this is its level
     order, which is the order the caps climb in. */
  { id: "paldea", name: "Paldea", game: "Scarlet", codes: ["SV", "S"], gen: 9, marker: /Scarlet/,
    gyms: ["Cortondo Gym", "Artazon Gym", "Levincia Gym", "Cascarrafa Gym", "Medali Gym",
      "Montenevera Gym", "Alfornada Gym", "Glaseado Gym"],
    venue: "Pokémon League (Paldea)", champion: "Geeta" },
];

// ------------------------------------------------------------------ the wiki

let lastAsk = 0;
async function page(title) {
  const file = new URL(title.replace(/[^\w]/g, "_") + ".json", CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const wait = lastAsk + 400 - Date.now();
  if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
  lastAsk = Date.now();
  const url = "https://bulbapedia.bulbagarden.net/w/api.php?action=parse&prop=wikitext&format=json"
    + "&redirects=1&page=" + encodeURIComponent(title);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.parse) throw new Error(`${title}: no such page (${json.error?.info ?? "?"})`);
  const text = json.parse.wikitext["*"];
  writeFileSync(file, JSON.stringify(text));
  return text;
}

// ------------------------------------------------------------------ wikitext

/* A template's parameters, split on top-level pipes only: `{{!}}`, nested
   templates and [[links|with pipes]] stay inside the parameter they are in. */
function params(body) {
  const out = [];
  let depth = 0, cur = "";
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; cur += two; i++; continue; }
    if (two === "}}" || two === "]]") { depth--; cur += two; i++; continue; }
    if (body[i] === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += body[i];
  }
  out.push(cur);
  return out.map((p) => p.trim());
}

/* Every `{{Name ...}}` in the text, with its offset, matched by brace depth. */
function templates(text, name) {
  const out = [];
  const re = new RegExp(`\\{\\{${name}\\s*[|\\n]`, "gi");
  for (const m of text.matchAll(re)) {
    let depth = 0, i = m.index;
    for (; i < text.length; i++) {
      if (text.startsWith("{{", i)) { depth++; i++; }
      else if (text.startsWith("}}", i)) { depth--; i++; if (depth === 0) break; }
    }
    out.push({ at: m.index, end: i + 1, body: text.slice(m.index + 2 + name.length, i - 1) });
  }
  return out;
}

const named = (ps) => Object.fromEntries(ps.filter((p) => /^[\w ]+=/.test(p))
  .map((p) => [p.slice(0, p.indexOf("=")).trim().toLowerCase(), p.slice(p.indexOf("=") + 1).trim()]));

/* Plain text out of a wiki value: links to their label, templates to their
   last argument ({{color2|000|Brock}} -> Brock), markup dropped. */
const plain = (s = "") => s
  .replace(/\{\{[^{}|]*\|(?:[^{}|]*\|)*([^{}|]*)\}\}/g, "$1")
  .replace(/\{\{[^{}]*\}\}/g, "")
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
  .replace(/<[^>]+>/g, "").replace(/'''?/g, "").trim();

/* The page's headings, and the spans under the ones that are rematches - a
   first battle is never one of those. */
function headings(text) {
  return [...text.matchAll(/^(={2,6})\s*(.*?)\s*\1\s*$/gm)]
    .map((m) => ({ at: m.index, level: m[1].length, title: m[2] }));
}
function spanOf(text, hs, h) {
  const next = hs.find((x) => x.at > h.at && x.level <= h.level);
  return [h.at, next ? next.at : text.length];
}
/* Rematches, and Black 2's Challenge Mode (the same trainers at other
   levels): the Normal Mode section is the game as it ships. */
const NOT_FIRST = /rematch|challenge mode/i;
function rematchSpans(text) {
  const hs = headings(text);
  return hs.filter((h) => NOT_FIRST.test(h.title)).map((h) => spanOf(text, hs, h));
}
/* A heading that names this region's game, by title ("FireRed and
   LeafGreen") or by the code template newer pages use (`{{B2W2}}`). */
const namesGame = (region, title) => region.marker.test(title)
  || region.codes.some((c) => title.includes(`{{${c}}}`));
const inside = (at, spans) => spans.some(([a, b]) => at >= a && at < b);

/* The core-series part of a page: animation, manga and the TCG come after. */
function core(text) {
  const cut = text.search(/^==\s*(In (the )?(animation|anime|manga|TCG|spin-off|other)|Trivia|Gallery)/mi);
  return cut < 0 ? text : text.slice(0, cut);
}

// ------------------------------------------------------------------ species

const BY_ID = new Map(SPECIES.map((sp) => [sp.id, sp]));
const BY_NAME = new Map(SPECIES.map((sp) => [sp.name, sp]));
let formFallbacks = [];

/* A dex number, plus a regional form where the page names one
   (`form = -Alola`): `persian` + `-alola` is `persian-alola`, a form we ship. */
/* A trainer row writes a form as a letter on the dex number instead:
   `026A` is Alolan Raichu, `550B` a blue-striped Basculin. */
const LETTER = { A: "-Alola", G: "-Galar", H: "-Hisui", P: "-Paldea" };

function speciesOf(ndex, form, where) {
  // ...or as a suffix: `0876-Female`, which reads like a Party's `form =`.
  const [, num, tail] = String(ndex).trim().match(/^(\d+)(.*)$/) ?? [];
  const base = BY_ID.get(Number(num));
  if (!base) throw new Error(`${where}: dex number ${ndex} is not in the game`);
  if (!form && tail) {
    form = tail.startsWith("-") ? tail : LETTER[tail.toUpperCase()];
    if (!form) { formFallbacks.push(`${base.name} (${ndex})`); return base.id; }
  }
  if (!form) return base.id;
  const want = `${base.name}${form.toLowerCase().replace(/\s+/g, "-")}`;
  // Exactly, or the one form that name is the start of, its ordinary stance
  // first: Galarian Darmanitan ships as `-galar-standard` and `-galar-zen`.
  const longer = SPECIES.filter((sp) => sp.name.startsWith(`${want}-`));
  const f = BY_NAME.get(want) ?? (longer.length === 1 ? longer[0]
    : longer.find((sp) => sp.name.endsWith("-standard")) ?? null);
  if (!f) { formFallbacks.push(`${base.name}${form}`); return base.id; }
  return f.id;
}

/* A move as PokéAPI names it: "King's Shield" is `kings-shield`, "U-turn"
   `u-turn`. The few Bulbapedia spells differently are aliased; fetch-moves
   fails on any name PokéAPI does not know, so a new one cannot slip by. */
const MOVE_ALIAS = { "hi-jump-kick": "high-jump-kick", "faint-attack": "feint-attack",
  "smellingsalt": "smelling-salts", "vicegrip": "vise-grip", "sonicboom": "sonic-boom",
  // Gen 3's one-word spellings, which the FireRed and Emerald sections keep.
  ancientpower: "ancient-power", bubblebeam: "bubble-beam", doubleslap: "double-slap",
  dragonbreath: "dragon-breath", extremespeed: "extreme-speed", featherdance: "feather-dance",
  poisonpowder: "poison-powder", selfdestruct: "self-destruct", solarbeam: "solar-beam",
  thunderpunch: "thunder-punch", firepunch: "fire-punch", icepunch: "ice-punch",
  dynamicpunch: "dynamic-punch", thundershock: "thunder-shock", sandattack: "sand-attack" };
function moveSlug(name) {
  if (!name || /^[-—]$/.test(name)) return null;
  const s = name.replace(/&nbsp;|&#160;/g, " ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’.:]/g, "").replace(/\s+/g, "-");
  return MOVE_ALIAS[s] ?? s;
}

/* The first number in a level field: it can be wrapped in a tooltip
   (`{{tt|71|72 in version 1.0.0}}`) or carry a footnote. */
const levelOf = (s = "") => Number(s.match(/\d+/)?.[0] ?? 0);

// A {{Party}} block and the {{Pokémon}} rows up to its {{Party/end}}.
function partyAt(text, block, where) {
  const head = named(params(block.body));
  const stop = text.indexOf("{{Party/end}}", block.end);
  const rows = templates(text.slice(block.end, stop < 0 ? undefined : stop), "Pokémon")
    .map((t) => named(params(t.body)));
  /* ITS OWN FOUR MOVES, as the game gave them: a leader's set carries the
     coverage its type lacks (the rules' level-up moves left Clemont's all-
     Electric team helpless against any Ground-type), so a party row keeps
     them, as PokéAPI's move names. */
  const party = rows.map((r) => {
    const lv = levelOf(r.level);
    if (!lv) throw new Error(`${where}: ${r.pokemon} has no level`);
    const moves = [1, 2, 3, 4].map((k) => moveSlug(plain(r[`move${k}`]))).filter(Boolean);
    return moves.length ? [speciesOf(r.ndex, r.form, where), lv, moves] : [speciesOf(r.ndex, r.form, where), lv];
  });
  if (!party.length) throw new Error(`${where}: an empty party`);
  return {
    game: head.game, cls: plain(head.class), name: plain(head.name),
    location: plain(head.location), type: (head.background ?? "").match(/\{\{(\w+) color/)?.[1],
    party,
  };
}

function partiesIn(text, where) {
  return templates(text, "Party").map((b) => ({ at: b.at, ...partyAt(text, b, where) }));
}

const accept = (region, game) => region.codes.includes(game);
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/♂/g, "m").replace(/♀/g, "f").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* `{{Trainerentry|sprite|game=N|Class|Name|prize|count|` then five fields a
   Pokémon (dex, species, gender, level, item), then named extras. */
function trainerRow(t, where) {
  const ps = params(t.body).slice(1);          // [0] is the template name's tail
  const pos = ps.filter((p) => !/^\w+=/.test(p));
  const [sprite, cls, name, , count] = pos;
  const n = parseInt(count, 10);
  if (!n) throw new Error(`${where}: a trainer row with no Pokémon count`);
  const party = [];
  for (let i = 0; i < n; i++) {
    const [ndex, , , level] = pos.slice(5 + i * 5, 10 + i * 5);
    const lv = levelOf(level);
    if (!lv) throw new Error(`${where}: ${plain(cls)} ${plain(name)} Pokémon ${i + 1} has no level`);
    party.push([speciesOf(ndex, null, where), lv]);
  }
  const c = plain(cls);
  /* Female where the class says so (`Jr. Trainer♀`) or the sprite does
     (`VSAce Trainer F PE.png`): a class like Ace Trainer has a portrait each. */
  const female = /♀/.test(cls) || /\sF(?=[\s.{])/.test(sprite);
  return { cls: c, name: plain(name) || c, ...(female ? { f: 1 } : {}), party };
}

// ------------------------------------------------------------------ one gym

async function gym(region, title, n) {
  const text = core(await page(title));
  const where = `${region.name} ${title}`;
  const info = named(params(templates(text, "GymInfobox")[0]?.body ?? ""));
  const rematch = rematchSpans(text);
  const leader = partiesIn(text, where).find((p) => accept(region, p.game) && !inside(p.at, rematch));
  if (!leader) throw new Error(`${where}: no ${region.game} leader party`);

  /* The gym's trainers in this game. A page covering several games has a
     heading per game, and only this game's section counts; a page for one
     game has no such heading, and all of its rows are this game's (their
     generation says so, or the page is not what we think it is). */
  const hs = headings(text);
  const mine = hs.filter((h) => namesGame(region, h.title) && !NOT_FIRST.test(h.title));
  let rows = templates(text, "Trainerentry").filter((t) => !inside(t.at, rematch));
  if (mine.length) {
    const spans = mine.map((h) => spanOf(text, hs, h));
    rows = rows.filter((t) => inside(t.at, spans));
  } else {
    for (const t of rows) {
      const g = parseInt(named(params(t.body)).game, 10);
      if (g && g !== region.gen) {
        throw new Error(`${where}: a trainer row from generation ${g} on a page with no ` +
          `${region.game} heading - the page covers other games; give the region a marker that finds it`);
      }
    }
  }
  const trainers = rows.map((t) => trainerRow(t, where));
  const id = `${region.id}-${slug(leader.name)}`;
  const seen = new Map();
  /* THE LEADER'S OWN PARTY SAYS ITS TYPE, NOT THE INFOBOX. A gym whose leader
     differs by version has one infobox, written for the other version:
     Stow-on-Side's says Ghost (Shield's Allister) and Circhester's Ice
     (Melony), where Sword fields Bea (Fighting) and Gordie (Rock). The Party
     block's colour is per party. Galar's badges are named for the type, so
     they follow it; check.mjs holds the type to the party it heads. */
  const type = (leader.type || info.type || "").toLowerCase();
  const badge = region.id === "galar"
    ? `${type[0].toUpperCase()}${type.slice(1)} Badge` : plain(info.badge);
  return {
    id, order: n, name: leader.name, cls: leader.cls, type,
    badge, page: title, game: leader.game,
    party: leader.party,
    trainers: trainers.map((t) => {
      const base = `${id}-${slug(t.cls)}-${slug(t.name)}`;
      const k = (seen.get(base) ?? 0) + 1;
      seen.set(base, k);
      return { id: k > 1 ? `${base}-${k}` : base, ...t };
    }),
  };
}

async function kahuna(region, [name, badge], n) {
  const text = core(await page(name));
  const rematch = rematchSpans(text);
  const p = partiesIn(text, `${region.name} ${name}`)
    .find((x) => accept(region, x.game) && /kahuna/i.test(x.cls) && !inside(x.at, rematch));
  if (!p) throw new Error(`${region.name} ${name}: no ${region.game} Kahuna party`);
  // The type the party shares most: a Kahuna page has no gym infobox.
  const count = new Map();
  for (const [id] of p.party) for (const t of BY_ID.get(id).types) count.set(t, (count.get(t) ?? 0) + 1);
  const type = [...count].sort((a, b) => b[1] - a[1])[0][0];
  return {
    id: `${region.id}-${slug(p.name)}`, order: n, name: p.name, cls: p.cls, type, badge,
    page: name, game: p.game, party: p.party, trainers: [],
  };
}

/* The League run, in the venue page's order: each member's first party for
   this game (a starter variant or a rematch is a repeat of a name), up to and
   including the Champion. */
const ROMAN = [, "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

async function league(region) {
  let venue = region.venue;
  let text = core(await page(venue));
  /* A venue shared by several generations moves the older ones to subpages
     (`{{main|Indigo Plateau/Generation III}}`), and that subpage is where
     this region's run is - the main page can still carry a stray party for
     the same game (HeartGold's rival, on the way in). */
  const sub = [...text.matchAll(/\{\{main\|([^}|]+)\}\}/g)].map((m) => m[1].trim())
    .find((t) => t.endsWith(`/Generation ${ROMAN[region.gen]}`));
  if (sub) { venue = sub; text = core(await page(sub)); }
  const rematch = rematchSpans(text);
  const run = [];
  for (const p of partiesIn(text, `${region.name} ${venue}`)) {
    if (!accept(region, p.game) || inside(p.at, rematch)) continue;
    if (run.some((r) => r.name === p.name)) continue;
    run.push(p);
    if (p.name === region.champion) break;
  }
  if (run.at(-1)?.name !== region.champion) {
    throw new Error(`${region.name}: the League run on "${venue}" never reaches ` +
      `${region.champion} (found ${run.map((r) => r.name).join(", ") || "nobody"})`);
  }
  return run.map((p) => ({
    id: `${region.id}-league-${slug(p.name)}`, name: p.name, cls: p.cls,
    champion: p.name === region.champion, page: venue, game: p.game, party: p.party,
  }));
}

// ------------------------------------------------------------------ hard mode

/* HARD MODE'S TEAMS (docs/battles.md, phase 8): the strongest singles party
   the core series gives each leader, League member and Champion - the most
   Pokémon, then the highest levels - among every `{{Party}}` under their name
   on the page their first battle was read from and on their own page:
   rematches, the Pokémon World Tournament, the Champion Cup, the remakes.
   The Stadium games are not the core series. A first-battle roster is often
   two or three Pokémon, and at Lv 100 no training makes two Pokémon brutal. */
const CORE_GAME = /^(RGB|RB|Y|GSC|GS|C|RS|E|FRLG|FR|LG|DP|Pt|HGSS|HG|SS|BW|Bl|W|B2W2|B2|W2|XY|ORAS|SM|USUM|US|UM|PE|LGP|LGE|SwSh|Sw|Sh|BDSP|SV|S|V)$/;
const who = (s) => plain(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// A trainer's own page: its name, or the "(game)" page where the name is ambiguous.
async function ownPage(name) {
  for (const title of [name, `${name} (game)`, name.replace(/ & /g, " and ")]) {
    try {
      const text = core(await page(title));
      if (templates(text, "Party").some((b) => who(named(params(b.body)).name) === who(name))) return { title, text };
    } catch { /* no such page: the next spelling */ }
  }
  return null;
}

function strongest(o, sources, where) {
  let best = null;
  for (const { title, text } of sources) {
    const hs = headings(text);
    for (const b of templates(text, "Party")) {
      const head = named(params(b.body));
      if (who(head.name) !== who(o.name) || !CORE_GAME.test(String(head.game ?? "").trim())) continue;
      let p;
      try { p = partyAt(text, b, `${where} (${title})`); } catch { continue; }
      const sum = p.party.reduce((n, [, lv]) => n + lv, 0);
      const heading = [...hs].reverse().find((h) => h.at < b.at)?.title ?? "";
      const cand = { party: p.party, n: p.party.length, sum, from: `${head.game} · ${plain(heading)}` };
      if (!best || cand.n > best.n || (cand.n === best.n && cand.sum > best.sum)) best = cand;
    }
  }
  return best;
}

async function hardTeams(regions) {
  const small = [];
  for (const r of regions) {
    for (const o of [...r.gyms, ...r.league]) {
      const where = `${r.name} ${o.name}`;
      const sources = [{ title: o.page, text: core(await page(o.page)) }];
      const own = o.page === o.name ? null : await ownPage(o.name);
      if (own) sources.push(own);
      const best = strongest(o, sources, where);
      // Never weaker than the first battle: that party is always a candidate.
      const first = { party: o.party, n: o.party.length, sum: o.party.reduce((n, [, lv]) => n + lv, 0), from: "first battle" };
      const pick = !best || first.n > best.n || (first.n === best.n && first.sum > best.sum) ? first : best;
      o.hard = pick.party;
      o.hardFrom = pick.from;
      if (pick.n < 6) small.push(`${where} (${pick.n})`);
    }
  }
  return small;
}

// ------------------------------------------------------------------ pret

/* TWO COPIES OF ONE FACT, CHECKED AGAINST EACH OTHER. FireRed's and Emerald's
   leaders and Elite Four are also in pret's decompilations, which is the
   games' own data. A mismatch means the parser or the page is wrong, and the
   fetch stops rather than shipping it. */
const PRET = {
  kanto: { repo: "pokefirered", parties: {
    "kanto-brock": "LeaderBrock", "kanto-misty": "LeaderMisty", "kanto-lt-surge": "LeaderLtSurge",
    "kanto-erika": "LeaderErika", "kanto-koga": "LeaderKoga", "kanto-sabrina": "LeaderSabrina",
    "kanto-blaine": "LeaderBlaine", "kanto-giovanni": "LeaderGiovanni",
    "kanto-league-lorelei": "EliteFourLorelei", "kanto-league-bruno": "EliteFourBruno",
    "kanto-league-agatha": "EliteFourAgatha", "kanto-league-lance": "EliteFourLance" } },
  hoenn: { repo: "pokeemerald", parties: {
    "hoenn-roxanne": "Roxanne1", "hoenn-brawly": "Brawly1", "hoenn-wattson": "Wattson1",
    "hoenn-flannery": "Flannery1", "hoenn-norman": "Norman1", "hoenn-winona": "Winona1",
    "hoenn-tate-liza": "TateAndLiza1", "hoenn-juan": "Juan1",
    "hoenn-league-sidney": "Sidney", "hoenn-league-phoebe": "Phoebe",
    "hoenn-league-glacia": "Glacia", "hoenn-league-drake": "Drake", "hoenn-league-wallace": "Wallace" } },
};

async function pretParties(repo) {
  const file = new URL(`${repo}-trainer_parties.h`, CACHE);
  if (!existsSync(file)) {
    const res = await fetch(`https://raw.githubusercontent.com/pret/${repo}/master/src/data/trainer_parties.h`);
    if (!res.ok) throw new Error(`pret ${repo}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  const src = readFileSync(file, "utf8");
  const out = {};
  for (const m of src.matchAll(/sParty_(\w+)\[\] = \{([\s\S]*?)\n\};/g)) {
    out[m[1]] = [...m[2].matchAll(/\.lvl = (\d+),\s*\.species = SPECIES_(\w+)/g)]
      .map(([, lv, sp]) => [sp.toLowerCase().replace(/_/g, "-"), Number(lv)]);
  }
  return out;
}

async function crossCheck(regions) {
  let checked = 0;
  for (const [rid, { repo, parties }] of Object.entries(PRET)) {
    const pret = await pretParties(repo);
    const r = regions.find((x) => x.id === rid);
    const all = [...r.gyms, ...r.league];
    for (const [id, key] of Object.entries(parties)) {
      const ours = all.find((o) => o.id === id);
      if (!ours) throw new Error(`pret cross-check: no ${id} in ${rid} (ids: ${all.map((o) => o.id).join(", ")})`);
      const theirs = pret[key];
      if (!theirs?.length) throw new Error(`pret cross-check: ${repo} has no sParty_${key}`);
      const a = ours.party.map(([sp, lv]) => `${BY_ID.get(sp).name.replace(/-(alola|galar|hisui|paldea)$/, "")}@${lv}`).sort();
      const b = theirs.map(([sp, lv]) => `${sp}@${lv}`).sort();
      if (a.join() !== b.join()) {
        throw new Error(`pret cross-check: ${id} is [${a}] on Bulbapedia and [${b}] in ${repo}'s sParty_${key}`);
      }
      checked++;
    }
  }
  return checked;
}

// ------------------------------------------------------------------ portraits

/* EVERY OPPONENT'S PORTRAIT IS A SHOWDOWN TRAINER SPRITE, resolved here so
   leagues.js has one writer and the art script only downloads `pic`s.
   Showdown is one pixel style across all nine regions (docs/battles.md,
   *Sources*). Its unsuffixed sprite is that style and wins; a name it only
   has in era variants (`lorelei-gen3`) takes the one for the region's game,
   else the newest. Classes it names differently are aliased. */
const SHOWDOWN = "https://play.pokemonshowdown.com/sprites/trainers/";
const ALIAS = {
  cooltrainer: "acetrainer", gymtrainer: "acetrainer", newschoolboy: "schoolkid",
  furisodegirl: "furisodegirl-pink", wake: "crasherwake", tateliza: "tateandliza",
};
async function showdownIndex() {
  const file = new URL("../showdown/trainers.txt", CACHE);
  if (!existsSync(file)) {
    mkdirSync(new URL("../showdown/", CACHE), { recursive: true });
    const html = await (await fetch(SHOWDOWN, { headers: { "User-Agent": UA } })).text();
    writeFileSync(file, [...html.matchAll(/href="([^"]+)\.png"/g)].map((m) => m[1]).join("\n"));
  }
  return new Set(readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean));
}
function resolvePic(have, who, female, gen) {
  const key = who.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[♂♀]/g, "").replace(/[^a-z0-9]/g, "");
  const base = ALIAS[key] ?? key;
  for (const c of female ? [`${base}f`, base] : [base]) {
    if (have.has(c)) return c;
    if (have.has(`${c}-gen${gen}`)) return `${c}-gen${gen}`;
    const eras = [...have].filter((h) => new RegExp(`^${c}-gen(\\d)$`).test(h)).sort();
    if (eras.length) return eras.at(-1);
  }
  return null;
}

// ------------------------------------------------------------------ run

const out = [];
for (const region of REGIONS) {
  const gyms = region.kahunas
    ? await Promise.all(region.kahunas.map((k, i) => kahuna(region, k, i + 1)))
    : [];
  if (!region.kahunas) for (const [i, title] of region.gyms.entries()) gyms.push(await gym(region, title, i + 1));
  const run = await league(region);
  out.push({ id: region.id, name: region.name, game: region.game, gyms, league: run });
  console.log(`  ${region.name.padEnd(7)} ${gyms.map((g) => `${g.name}(${g.trainers.length})`).join(" ")} | ` +
    run.map((p) => p.name).join(", "));
}

const have = await showdownIndex();
const unresolved = [];
for (const [r, region] of out.map((r, i) => [r, REGIONS[i]])) {
  const give = (o, female) => {
    o.pic = resolvePic(have, o.cls && !o.party ? o.cls : o.name, female, region.gen);
    if (!o.pic) unresolved.push(`${region.name} ${o.name}`);
  };
  for (const g of r.gyms) {
    give(g, false);
    // A gym trainer's portrait is its class, not its name.
    for (const t of g.trainers) {
      t.pic = resolvePic(have, t.cls, !!t.f, region.gen);
      if (!t.pic) unresolved.push(`${region.name} ${t.cls}`);
    }
  }
  for (const p of r.league) give(p, false);
}
if (unresolved.length) {
  throw new Error(`no Showdown portrait for: ${[...new Set(unresolved)].join(", ")} - add an ALIAS`);
}

const small = await hardTeams(out);
console.log(`  hard teams: ${small.length} of them field fewer than six: ${small.join(", ")}`);
const checked = await crossCheck(out);
console.log(`  pret agrees on all ${checked} FireRed and Emerald leaders and League members`);
if (formFallbacks.length) {
  console.log(`  ${formFallbacks.length} forms the game does not ship (gender and cosmetic ` +
    "variants, drawn as the species itself): " +
    [...new Set(formFallbacks)].join(", "));
}

/* SHIPPED IDS NEVER DISAPPEAR. Saves key `beaten` on these ids, so a re-fetch
   that would drop one (a page renamed, a parser change) stops here instead. */
const target = new URL("src/data/leagues.js", ROOT);
if (existsSync(target)) {
  const old = readFileSync(target, "utf8");
  const ids = new Set();
  for (const r of out) for (const g of r.gyms) { ids.add(g.id); for (const t of g.trainers) ids.add(t.id); }
  for (const r of out) for (const p of r.league) ids.add(p.id);
  const lost = [...old.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1])
    .filter((id) => !ids.has(id) && !out.some((r) => r.id === id));
  if (lost.length) throw new Error(`these shipped ids would disappear: ${lost.join(", ")}`);
}

const body = out.map((r) => JSON.stringify(r)).join(",\n");
writeFileSync(target,
  "// Generated by tools/fetch-leagues.mjs from Bulbapedia - do not edit by hand.\n" +
  "// Each party is [dex id, level] as the game fields it; docs/battles.md says how it is used.\n" +
  `export const LEAGUES = [\n${body}\n];\n`);
const people = out.reduce((n, r) => n + r.gyms.length + r.league.length +
  r.gyms.reduce((m, g) => m + g.trainers.length, 0), 0);
console.log(`  wrote src/data/leagues.js: ${out.length} regions, ${people} opponents`);
