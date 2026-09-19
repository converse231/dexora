/* Tile and character drawing.

   The map tiles and the player come from sprite sheets built by
   tools/build_assets.py. When a sheet is missing we fall back to plain coloured
   tiles, so the game always runs and art can be swapped without touching this.

   Tiles are not a flat one-for-one lookup. Trees and paths are composed from
   their neighbours the way the real game does it, which is why the metatile ids
   in route.json are grouped rather than listed flat:

     tree   2 wide x 3 tall - a tip, a body, then a base with the trunk. The
            tip row is what makes a tree read as a tree instead of a stump.
     path   a 3x3 autotile, so a path gets proper corners and edges instead of
            a hard rectangular band. The wooden pier is the same shape, which
            is why one autotile() serves both.
     pond   the rim on a water body's top and sides, plus four inner corners
            for whatever stands in the middle of it. */

export const TILE = 32;

const COLORS = {
  grass: "#79c493", grassDark: "#63b07d",
  tall: "#55a674", tallDark: "#3f8a5c",
  tree: "#2f6b4c", treeLight: "#43906a",
  water: "#6fa8d8", waterLight: "#93c3e8",
  path: "#c39a7e", pathDark: "#aa8168",
};

/* Lowercase is walkable ground, uppercase the solid wall of the same biome. */
const CHAR_KEY = {
  ".": "grass", ",": "tall", f: "flower", T: "tree",
  "~": "water", "#": "path", b: "bank",
  r: "rock", R: "wall", o: "rock", u: "rock", C: "wall", S: "rock",
  W: "water", X: "plantWall", B: "plantWall", E: "plantWall", Y: "plantWall",
  c: "grass", D: "path",
  m: "ember", M: "emberWall", V: "emberWall", l: "ember", n: "path",
  i: "ice", I: "iceWall", j: "ice", s: "ice", k: "water", K: "water", d: "iceWall", t: "iceWall", N: "path",
  p: "plant", P: "plantWall",
  h: "tower", H: "towerWall", G: "towerWall", A: "towerWall", y: "tower",
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

async function loadPair(base) {
  const res = await fetch(`${base}.json`);
  if (!res.ok) throw new Error("no json");
  const meta = await res.json();
  return { ...meta, img: await loadImage(`${base}.png`) };
}

/* Resolves to { atlas, player }, either of which may be null. A missing sheet
   is the normal case, not an error - don't let it reject. */
export async function loadArt() {
  const [atlas, player, top] = await Promise.all([
    loadPair("tilesets/route").catch(() => null),
    loadPair("tilesets/player").catch(() => null),
    /* THE UPPER LAYER, AT THE SAME IDS. A Gen 3 metatile's keyed layer draws
       over sprites; our atlas composites both into one image, so it draws under
       instead. `route_top.png` is that layer on its own, the same size and the
       same ids, so `drawOverlays` needs no lookup. Optional like everything
       else here - without it the game is exactly what it was. */
    loadImage("tilesets/route_top.png").catch(() => null),
  ]);
  if (atlas) atlas.imgTop = top;
  return { atlas, player };
}

// ---------------------------------------------------------------- tiles

// Deterministic per-tile scatter, so ground variety doesn't crawl as you walk.
function hash(x, y) {
  let h = (x * 73856093) ^ (y * 19349663);
  h ^= h >>> 13;
  return h >>> 0;
}

// Metatile id -> source rect in the atlas.
/* Returns the id it drew, so the caller can ask for that tile's upper layer
   back without re-deriving which tile a rule picked - which would be a second
   copy of the tile rules, the one thing this file must not grow. */
function blit(ctx, atlas, id, px, py) {
  const s = atlas.tileSize;
  const cols = atlas.atlasCols ?? 16;
  ctx.drawImage(atlas.img, (id % cols) * s, Math.floor(id / cols) * s, s, s, px, py, TILE, TILE);
  return id;
}

/* A tree is 2 wide and at least 3 tall. Which slice a tile gets depends on how
   far down the trunk it sits, so a clump of any height composes into whole
   trees: tip on top, base at the bottom, alternating body in between. */
function treeId(tree, x, y, at) {
  let depth = 0;
  while (depth < 64 && at(x, y - depth - 1) === "T") depth++;

  const half = x & 1; // trees pair up on the even column grid
  if (depth === 0) return tree.tip[half];
  if (at(x, y + 1) !== "T") return tree.base[half];
  return (depth % 2 ? tree.bodyA : tree.bodyB)[half];
}

/* Water, following SafariZone_Center's pond tile for tile. FireRed puts the
   rocky rim on a body of water's top and sides and never on its bottom - the
   water just meets the grass - so the only questions are which sides have land
   and, for the four inner corners, which diagonal does.

   The inner corners are what let anything sit *inside* the water: an island, or
   a pier crossing it. Without them the rim runs into the intrusion and stops
   dead, which is the shape of a lake that looks torn. 296/297 cap a side rim
   where it begins; 304/305 turn a side rim into a top rim around a corner.

   The fourth side is the catch. Water carries a rim on three sides only, and
   the bottom one is drawn on the *shore* - the land tile below the water, "b".
   Mistake those for plain grass and a lake ends in a hard blue-to-green line
   with no bank, which is exactly how the first draft of Pond & Shore looked. */
/* Underground, where a pond's corners have rock beyond them rather than grass.
   Not a per-map flag: the corner tile draws that square, so the honest test is
   what is actually in it. */
const CAVE_GROUND = "rRouCSW";

export function waterId(pond, x, y, at) {
  const land = (dx, dy) => at(x + dx, y + dy) !== "w";
  const rock = (dx, dy) => {
    const c = at(x + dx, y + dy);
    return c !== "" && CAVE_GROUND.includes(c);
  };

  if (at(x, y) === "b") return pond.bank;   // the water's bottom edge

  if (land(0, -1)) {
    // The diagonal is the square the corner tile actually depicts.
    if (land(-1, 0)) return rock(-1, -1) ? pond.topLeftRock : pond.topLeft;
    if (land(1, 0)) return rock(1, -1) ? pond.topRightRock : pond.topRight;
    return pond.top;
  }
  // A side rim needs a cap on the row where it starts, or it begins mid-stroke.
  if (land(-1, 0)) return land(-1, -1) ? pond.left : pond.capLeft;
  if (land(1, 0)) return land(1, -1) ? pond.right : pond.capRight;
  // Nothing adjacent, but a corner of land cuts the diagonal.
  if (land(-1, -1)) return pond.nookLeft;
  if (land(1, -1)) return pond.nookRight;
  return pond.open;
}

/* The forest canopy, read straight off ViridianForest's own columns:

     8! 16! 24! 16! 24! 32! 35!     a wall that caps itself
     1  25! 17! 25!     33! 36!     a wall you walk behind

   (! is the collision bit.) The shape those give up is that the crown metatile
   is a whole crown in one row, and midA over midB is another whole crown in
   two, so a column is crown + (midA,midB) x n + trunk + shadow. Which is
   always an ODD number of rows - and why the count is taken from the bottom.
   Anchored at the top instead, an even-height mass left a stray midA directly
   above the trunk: half a crown with its lower half missing, which is what a
   canopy sliced off flat actually looks like. From the trunk up, the trunk
   always closes a crown, however tall the mass is. */
export function forestId(forest, x, y, at) {
  const isF = (dx, dy) => at(x + dx, y + dy) === "F";
  const col = ((x % 3) + 3) % 3;

  /* HOW FAR THE MASS GOES DOWN, and the cap has to clear the tallest column
     any map can have. It was 64, which was over twice the tallest canopy that
     existed - and then Deep Woods became 89 rows tall, its border columns went
     with it, and every tile above row 24 of them counted 64 instead of the
     truth. 64 is even, so the whole column paired from the wrong foot: row 1
     came out as a crown's LOWER half with the crown itself above it. Sliced
     crowns down the entire left edge of the map.
     A map is 256 tiles at the outside, and this is a walk up a single column
     over the handful of tiles actually on screen. */
  let below = 0;
  while (below < 256 && isF(0, below + 1)) below++;

  if (below === 0) return forest.shadow[col];
  if (below === 1) return forest.trunk[col];
  // The cap - unless the overhang above is already drawing this crown's top.
  if (!isF(0, -1) && at(x, y - 1) !== "c") return forest.crown[col];
  return (below % 2 ? forest.midA : forest.midB)[col];
}

/* The crater on a cave floor: a 2x2 ring, walkable, and the only landmark
   Mt Moon's floor has - its texture is one tile everywhere else. Two wide on
   the even-column grid like a tree, so the half is read off the x, and the row
   off whether the tile above is part of the same ring. */
function craterId(crater, x, y, at) {
  return crater[at(x, y - 1) === "o" ? 1 : 0][x & 1];
}

/* A cave pool: the same 2x2 shape as the crater, but sunk into a rock face
   rather than lying on the floor, which is where every one of them is in the
   real maps. Solid, so a rod is the only way in. */
function poolId(pool, x, y, at) {
  return pool[at(x, y - 1) === "W" ? 1 : 0][x & 1];
}

/* The cliff below a plateau's near edge. One row, so the only question is
   whether it has more cliff to its left and right - and the stairs set into it
   count as cliff for that, or the two tiles either side of a staircase would
   each cap themselves as the end of a wall. */
function cliffId(cliff, x, y, at) {
  const isC = (dx) => {
    const c = at(x + dx, y);
    return c !== "" && "CS".includes(c);
  };
  return cliff[!isC(-1) ? 0 : !isC(1) ? 2 : 1];
}

/* The Power Plant. A machine bank is three rows: the plinth it stands on, the
   machine's top and its body. Which row a tile takes is how far down the bank it
   sits, and which column is whether it has a bank either side - so the plinth's
   end caps land on the same two columns the machine's do (33 over 17, 34 over
   13, 35 over 18, which is how the real map lays out every one of them).

   Painting the plinth's middle across a whole run left it uncapped, and an
   uncapped grey slab running the length of a bank reads as a wall with a
   walkable top rather than as a machine standing on the floor.

   A console takes both machine rows of one column and never the plinth, so
   `row - 1` indexes it; the map generator asserts it is never an end cap. */
function powerWallId(power, x, y, at) {
  const isW = (dx, dy) => "PX".includes(at(x + dx, y + dy) || "\0");
  let row = 0;
  while (row < 2 && isW(0, -row - 1)) row++;
  if (at(x, y) === "X") return power.console[row - 1];
  const col = !isW(-1, 0) ? 0 : !isW(1, 0) ? 2 : 1;
  return power.wall[row][col];
}

/* The wall a room ends at. Which piece depends on which way the void lies, and
   off the map at() gives "" - so the map edge is the whole test, and a rectangle
   of these resolves into corners and edges without the map saying which is which. */
function roomEdgeId(edge, x, y, at) {
  const out = (dx, dy) => at(x + dx, y + dy) === "";
  return edge[out(0, -1) ? 0 : out(0, 1) ? 2 : 1][out(-1, 0) ? 0 : out(1, 0) ? 2 : 1];
}

/* The floor keeps one tile of shadow under a bank's foot. Above a bank there is
   nothing to add - the plinth is part of the bank now - and the room's own edge
   casts none, being a wall rather than a machine standing on the floor. */
function powerFloorId(power, x, y, at) {
  return "PX".includes(at(x, y - 1) || "\0") ? power.floorFoot : power.floor;
}

/* Frost Hollow, copied tile for tile from Seafoam Islands B3F. Two walkable
   levels - the lower ice and the raised shelf - joined by stairs, with the
   river cutting the cave in two and a plank bridge across it.

   Boulders count as whatever they stand in, so the rock and the shelf tile
   straight through one instead of drawing an edge around it and leaving what
   looks like a hole. */
function icicleId(f, x, y, at) {
  // Count along the run rather than asking whether the neighbour is one too:
  // two stalactites side by side are four tiles of "t" in a row, and "has one
  // to my left" would make the third tile a right half.
  let dx = 0;
  while (dx < 64 && at(x - dx - 1, y) === "t") dx++;
  let dy = 0;
  while (dy < 64 && at(x, y - dy - 1) === "t") dy++;
  return f.icicle[dy % 2][dx % 2];
}

function fallId(f, x, y, at) {
  // The fall pours out of a dark opening, then runs top, body, foot - the same
  // three rows the real map stacks however far it has to drop.
  const isK = (dy) => at(x, y + dy) === "K";
  if (!isK(-1)) return f.mouth;
  if (!isK(-2)) return f.fall[0];
  return isK(1) ? f.fall[1] : f.fall[2];
}

/* Ember Caldera. Rock is a 3x3 autotile, the way the path and the pier are.
   Lava is a single flat tile - everything that makes a pool read as a pool is
   drawn on the rock bank around it, by volcanoWallId below.

   A ladder is one tile, walkable, standing in a rock face. */
function volcanoFloorId(v, x, y, at) {
  // Grit is scatter, not decoration anyone placed: a fixed hash so it does not
  // crawl as the camera moves, and rare enough to read as flecks in the rock.
  const h = hash(x, y);
  return h % 11 === 0 ? v.grit[(h >>> 5) % v.grit.length] : v.floor;
}

/* The Haunted Tower. Two rules, both masked out of the seven real Pokemon
   Tower floors rather than picked by eye.

   THE WALL SHOWS ITS FACE ONLY WHERE THERE IS FLOOR BELOW IT - 672, with the
   white lip 664 above that. Everywhere else it is flat black (641). That is
   not a saving: it is why the real oval is purple across its top and pure
   black down its sides and along its bottom, and it is what lets a square room
   be drawn here with no corner pieces at all.

   THE FLOOR CARRIES THE SHADOW, and the light comes from the upper left: a
   wall above gives 644, a wall to the left 645, both together 658. A wall to
   the RIGHT or BELOW gives plain floor - that is measured on all seven floors,
   not an assumption about which way a lip should face.

   Graves cast no shadow: they are furniture standing on the floor, not part of
   the room. A grave set into the wall (`A`) blocks the wall's shadow instead,
   which is why `shade` counts only `H` where `wall` counts both. */
const wall = (at, x, y) => {
  const c = at(x, y);
  return c === "H" || c === "A" || c === "";   // off the map is wall, not floor
};
const shade = (at, x, y) => {
  const c = at(x, y);
  return c === "H" || c === "";
};

function towerFloorId(t, x, y, at) {
  const n = shade(at, x, y - 1), w = shade(at, x - 1, y);
  return n && w ? t.shadow.UL : n ? t.shadow.U : w ? t.shadow.L : t.floor;
}

function towerWallId(t, x, y, at) {
  if (!wall(at, x, y + 1)) return t.face;
  if (!wall(at, x, y + 2)) return t.faceTop;
  return t.void;
}

/* The ward: 5F's cyan sigil, exactly 3x3 and walkable. Which ninth a tile is
   comes from counting back to the corner, so it cannot drift. */
function wardId(t, x, y, at) {
  let cx = 0, cy = 0;
  while (cx < 2 && at(x - cx - 1, y) === "y") cx++;
  while (cy < 2 && at(x, y - cy - 1) === "y") cy++;
  return t.ward[cy][cx];
}

/* A bridge. Route 12's planks, baked over whatever the bridge crosses - lava
   for `n`, water for `N` - because the planks are the metatile's top layer and
   lift off the water they were drawn on. See build_assets.py.

   Which plank a tile gets comes from the run it sits in: the longer axis is the
   way you walk, and the planks lie across it, alternating every other tile. The
   pier this replaced was a jetty, and its outer ring is drawn to meet sand. */
function bridgeId(set, ch, x, y, at) {
  const is = (dx, dy) => at(x + dx, y + dy) === ch;
  let left = 0, right = 0, up = 0, down = 0;
  while (left < 64 && is(-left - 1, 0)) left++;
  while (right < 64 && is(right + 1, 0)) right++;
  while (up < 64 && is(0, -up - 1)) up++;
  while (down < 64 && is(0, down + 1)) down++;
  return up + down > left + right ? set.vert[left % 2] : set.horz[up % 2];
}

/* The bank around a pool. Magma Hideout draws a pool's edge on the ROCK beside
   it, not on the lava, and that is not a detail: a pool set under a wall needs
   the wall's own tile to be the bank, or the wall draws its plain edge and the
   pool draws another one and the two stack into a double lip. Which piece is
   which comes from the mask of sides the lava is on, read off the real map, so
   the lips face the way the game faces them. */
const LAVA_SIDES = [["U", 0, -1], ["D", 0, 1], ["L", -1, 0], ["R", 1, 0]];

function volcanoWallId(v, x, y, at) {
  let mask = "";
  for (const [k, dx, dy] of LAVA_SIDES) {
    const c = at(x + dx, y + dy);
    if (c === "V" || c === "n") mask += k;
  }
  if (!mask) return autotile(v.wall, "M", x, y, at, true);
  return v.lavaRim[mask] ?? v.lavaRim.many;
}

/* A ledge is a horizontal bar with a capped end at each side - the caps are
   what stop it reading as a fence that happens to stop. One row only, so the
   only question is whether this tile has a neighbour to its left and right. */
function ledgeId(ledge, x, y, at) {
  const isL = (dx) => at(x + dx, y) === "L";
  return ledge[!isL(-1) ? 0 : !isL(1) ? 2 : 1];
}

// 3x3 autotile: outer ring is edges and corners, centre is the fill.
/* `outside` is what a tile off the edge of the map counts as. For a path or a
   pier it is nothing - they end, and want an edge drawn. For a mass of rock it
   is more rock: the world stops there, the rock does not, and treating the
   border as a boundary drew the outer ring of every cave facing outwards. */
function autotile(grid, chars, x, y, at, outside = false) {
  const is = (dx, dy) => {
    const c = at(x + dx, y + dy);
    return c === "" ? outside : chars.includes(c);
  };
  const col = !is(-1, 0) ? 0 : !is(1, 0) ? 2 : 1;
  const row = !is(0, -1) ? 0 : !is(0, 1) ? 2 : 1;
  /* No interior scatter here, and that was measured rather than assumed. A real
     map's wall interior is about half plain fill and half decorative pieces,
     but those sit deep - Mt Moon's masses are eight tiles thick and it packs
     the middle with black void nobody ever sees. Ours are bands two or three
     thick, so every cell is an edge and the only "interiors" are the border
     ring; scattering there produced noise around the rim and changed nothing
     where anyone walks. An 8-neighbour blob autotile was measured too: 34%
     against this rule's 31% on Seafoam's own wall, for 31 extra cases. */
  return grid[row][col];
}

export function drawTile(ctx, atlas, ch, px, py, x, y, at, fixed = -1) {
  if (atlas) {
    /* A map copied from a real one carries that map's own metatile ids, and
       they beat every rule here. Our autotiles are nine cases; Seafoam varies
       its wall among half a dozen interchangeable pieces and no 3x3 can say
       which. `fixed` is -1 wherever we authored something on top - the bridge,
       the staircases - and those fall through to the rules below. */
    if (fixed >= 0) return blit(ctx, atlas, fixed, px, py);
    if (ch === "T" && atlas.tree) return blit(ctx, atlas, treeId(atlas.tree, x, y, at), px, py);
    if (ch === "#" && atlas.path) return blit(ctx, atlas, autotile(atlas.path, "#", x, y, at), px, py);
    if (ch === "D" && atlas.deck) return blit(ctx, atlas, autotile(atlas.deck, "D", x, y, at), px, py);
    // The character says what the bridge crosses, so nothing has to be guessed
    // from the neighbours: `n` is baked over lava, `N` over water.
    if (ch === "n" && atlas.bridge)
      return blit(ctx, atlas, bridgeId(atlas.bridge.lava, "n", x, y, at), px, py);
    if (ch === "N" && atlas.bridge)
      return blit(ctx, atlas, bridgeId(atlas.bridge.ice, "N", x, y, at), px, py);
    if (atlas.cave) {
      if (ch === "R") return blit(ctx, atlas, autotile(atlas.cave.wall, "RW", x, y, at, true), px, py);
      if (ch === "r") return blit(ctx, atlas, atlas.cave.floor, px, py);
      if (ch === "o") return blit(ctx, atlas, craterId(atlas.cave.crater, x, y, at), px, py);
      if (ch === "u") return blit(ctx, atlas, autotile(atlas.cave.plateau, "u", x, y, at), px, py);
      if (ch === "C") return blit(ctx, atlas, cliffId(atlas.cave.cliff, x, y, at), px, py);
      if (ch === "S") return blit(ctx, atlas, atlas.cave.stairs, px, py);
      if (ch === "W") return blit(ctx, atlas, poolId(atlas.cave.pool, x, y, at), px, py);
    }
    if (atlas.frost) {
      const f = atlas.frost;
      if (ch === "i") return blit(ctx, atlas, f.floor, px, py);
      if (ch === "j") return blit(ctx, atlas, autotile(f.shelf, "jsd", x, y, at), px, py);
      if (ch === "I") return blit(ctx, atlas, autotile(f.wall, "Idt", x, y, at, true), px, py);
      if (ch === "t") return blit(ctx, atlas, icicleId(f, x, y, at), px, py);
      if (ch === "d") return blit(ctx, atlas, f.rock[hash(x, y) % f.rock.length], px, py);
      if (ch === "k") return blit(ctx, atlas, autotile(f.water, "kK", x, y, at), px, py);
      if (ch === "K") return blit(ctx, atlas, fallId(f, x, y, at), px, py);
      if (ch === "s") return blit(ctx, atlas, f.stairs, px, py);
    }
    if (atlas.volcano) {
      const v = atlas.volcano;
      if (ch === "M") return blit(ctx, atlas, volcanoWallId(v, x, y, at), px, py);
      if (ch === "V")
        return blit(ctx, atlas, hash(x, y) % 7 ? v.lava : v.lavaBubble, px, py);
      if (ch === "m") return blit(ctx, atlas, volcanoFloorId(v, x, y, at), px, py);
      if (ch === "l") return blit(ctx, atlas, v.ladder, px, py);
    }
    if (atlas.tower) {
      const t = atlas.tower;
      if (ch === "h") return blit(ctx, atlas, towerFloorId(t, x, y, at), px, py);
      if (ch === "H") return blit(ctx, atlas, towerWallId(t, x, y, at), px, py);
      if (ch === "G") return blit(ctx, atlas, t.grave, px, py);
      // 729 opens a run of wall graves and 728 continues it; the real map has
      // no closing piece, so a run only ever caps on its left.
      if (ch === "A")
        return blit(ctx, atlas, t.graveWall[at(x - 1, y) === "A" ? 1 : 0], px, py);
      if (ch === "y") return blit(ctx, atlas, wardId(t, x, y, at), px, py);
    }
    if (atlas.power) {
      if (ch === "P" || ch === "X")
        return blit(ctx, atlas, powerWallId(atlas.power, x, y, at), px, py);
      if (ch === "E") return blit(ctx, atlas, roomEdgeId(atlas.power.edge, x, y, at), px, py);
      // A partition: plain slab all the way down, machine face at the foot.
      if (ch === "Y")
        return blit(ctx, atlas,
                    atlas.power.post["PXYEB".includes(at(x, y + 1) || "\0") ? 0 : 1],
                    px, py);
      if (ch === "p") return blit(ctx, atlas, powerFloorId(atlas.power, x, y, at), px, py);
      if (ch === "B")
        return blit(ctx, atlas, atlas.power.barrel[at(x, y - 1) === "B" ? 1 : 0], px, py);
    }
    if (ch === "L" && atlas.ledge) return blit(ctx, atlas, ledgeId(atlas.ledge, x, y, at), px, py);
    if (ch === "F" && atlas.forest) return blit(ctx, atlas, forestId(atlas.forest, x, y, at), px, py);
    if (ch === "c" && atlas.forest?.fringe) return blit(ctx, atlas, atlas.forest.fringe, px, py);
    if ((ch === "w" || ch === "b") && atlas.pond?.open) {
      return blit(ctx, atlas, waterId(atlas.pond, x, y, at), px, py);
    }

    const variants = atlas.tiles?.[CHAR_KEY[ch]];
    if (variants?.length) {
      return blit(ctx, atlas, variants[hash(x, y) % variants.length], px, py);
    }
  }
  drawTileProcedural(ctx, ch, px, py, x, y);
}

function drawTileProcedural(ctx, ch, px, py, x, y) {
  const h = hash(x, y);

  if (ch === "~") {
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = COLORS.waterLight;
    ctx.fillRect(px + (h % 12) + 2, py + 9, 11, 2);
    ctx.fillRect(px + ((h >> 5) % 14) + 2, py + 21, 8, 2);
    return;
  }

  if (ch === "#") {
    ctx.fillStyle = COLORS.path;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = COLORS.pathDark;
    ctx.fillRect(px + (h % 24) + 3, py + ((h >> 6) % 24) + 3, 4, 3);
    return;
  }

  ctx.fillStyle = ch === "," ? COLORS.tall : COLORS.grass;
  ctx.fillRect(px, py, TILE, TILE);

  if (ch === ",") {
    ctx.fillStyle = COLORS.tallDark;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(px + ((h >> (i * 3)) % 26) + 3, py + ((h >> (i * 4 + 2)) % 20) + 7, 3, 8);
    }
  } else {
    ctx.fillStyle = COLORS.grassDark;
    ctx.fillRect(px + (h % 26) + 3, py + ((h >> 7) % 26) + 3, 5, 2);
  }

  if (ch === "T") {
    ctx.fillStyle = COLORS.tree;
    ctx.beginPath();
    ctx.arc(px + 16, py + 14, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.treeLight;
    ctx.beginPath();
    ctx.arc(px + 10, py + 8, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- player

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

/* The GBA walk cycle is four phases, not two: stride, neutral, opposite stride,
   neutral. Each tile shows a stride for most of the step and settles back to
   neutral before the next one.

   Column 1 is the neutral pose, NOT column 0. Measured, not assumed: in the
   down and up rows the legs of frame 1 mirror themselves exactly (feet
   together) while 0 and 2 are mirror-image strides. Reading the sheet as
   [stand, stride, stride] leaves the trainer permanently mid-step when idle. */
const STRIDE = 0.62; // fraction of a step spent mid-stride
const NEUTRAL = 1;
const STRIDE_COLS = [0, 2];

/* The overhang is the one tile that is not finished when the map pass ends.
   Its leaves belong over sprites, not under them, so they go back on after the
   player: map, player, leaves. Everything within the sprite's reach gets
   repainted, which is any overhang on screen - the trainer is two tiles tall,
   so the row above the one he stands on counts too. */
/* THE UPPER LAYER, PUT BACK OVER THE PLAYER.

   A Gen 3 metatile is two layers and the keyed one draws above sprites - that
   is how a trainer passes behind a tree top, stands behind a counter, or walks
   between the machines in the Power Plant instead of on top of them. 1,359 of
   the metatiles we bake have one. Our atlas composites both halves into a
   single image, which is what keeps `drawTile` to one blit, and the price is
   that every one of those draws UNDER the player.

   Reported from play on the transcribed Power Plant, where 211 walkable tiles
   have an upper layer: the trainer stood on the machinery he should have been
   passing behind.

   `ids` is what `drawTile` actually drew, collected by the caller during the
   tile pass, so nothing here re-derives which tile a rule chose. Only the
   player's own footprint needs repainting - he is the only sprite on the map,
   and everywhere else the composited tile is already right.

   THE CALLER DECIDES WHICH TILES, and there are two rules behind that, both
   paid for: the box is the sprite's own two-tile rect rather than a padded
   square, and it holds only WALKABLE cells. An overhang is something you walk
   behind, so it has to be somewhere you can walk - a solid tile is one you are
   always in front of. Skipping that put the Power Plant's outer wall over the
   trainer's head every time he stood against it. */
export function drawOverlays(ctx, atlas, ids, camX, camY) {
  if (!atlas?.imgTop) return;
  const s = atlas.tileSize;
  const cols = atlas.atlasCols ?? 16;
  for (const [x, y, id] of ids) {
    if (!(id >= 0)) continue;
    ctx.drawImage(atlas.imgTop, (id % cols) * s, Math.floor(id / cols) * s, s, s,
                  Math.round(x * TILE - camX), Math.round(y * TILE - camY), TILE, TILE);
  }
}

export function drawOverhangs(ctx, atlas, x0, y0, w, h, camX, camY, at, fixedAt) {
  const fringe = atlas?.forest?.fringeTop;
  const tip = atlas?.tree?.tipTop;
  if (!fringe && !tip) return;
  for (let y = y0; y <= y0 + h; y++) {
    for (let x = x0; x <= x0 + w; x++) {
      if (at(x, y) !== "c") continue;
      /* WHICH LEAVES GO BACK ON, and it comes from the tile rather than from a
         rule. Our own canopy has exactly one fringe piece, so for a map we drew
         there is nothing to choose. A COPIED map's overhang is whatever the real
         tileset put there, and General's conifer crown is two halves - 14 the
         left, 15 the right. With one piece to reach for, the pass painted
         Viridian Forest's round canopy over every conifer on Route 1 and took
         the top off all thirty-six of them. */
      const raw = fixedAt ? fixedAt(x, y) : -1;
      const id = tip && (raw === 14 || raw === 15) ? tip[raw - 14] : fringe;
      if (!id) continue;
      blit(ctx, atlas, id, Math.round(x * TILE - camX), Math.round(y * TILE - camY));
    }
  }
}

/* The float on the water while a line is out. Drawn with primitives rather
   than as a tile because it is not one: it bobs, and the ripple under it
   widens on the beat of the cast. While you are waiting it is the only thing
   on screen saying so, and when something takes the line both quicken - which
   is the tell, before any words arrive. */
export function drawBobber(ctx, fishing, now, camX, camY) {
  if (!fishing || fishing.phase === "miss") return;
  const cx = fishing.x * TILE - camX + TILE / 2;
  const cy = fishing.y * TILE - camY + TILE / 2;
  const bite = fishing.phase === "bite";

  /* THE CAST. While the rod is winding up the lure is in the air, not in the
     water: it flies from the trainer to the tile he is facing along a low arc.
     Before this it simply existed at the far end from the first frame, ripples
     and all, so the four frames of casting animation played over a line that
     had already landed.

     One tile is not far to throw, so the arc is mostly lift rather than
     distance - `sin(pi t)` peaked at 9px, which is about the height of the
     rod tip. No ripples and no bob until it is down; those are what water
     does to a float, and it is not in the water yet. */
  if (fishing.phase === "cast" && fishing.castMs) {
    const left = Math.max(0, (fishing.until ?? 0) - now);
    const t = Math.min(1, Math.max(0, 1 - left / fishing.castMs));
    const fx = (fishing.fromX ?? fishing.x) * TILE - camX + TILE / 2;
    const fy = (fishing.fromY ?? fishing.y) * TILE - camY + TILE / 2;
    const lx = fx + (cx - fx) * t;
    const ly = fy + (cy - fy) * t - Math.sin(Math.PI * t) * 9;
    ctx.fillStyle = "#2b3f4a";
    ctx.fillRect(lx - 2, ly - 2, 4, 4);
    ctx.fillStyle = "#d8452f";
    ctx.fillRect(lx - 1, ly - 1, 2, 2);
    return;
  }

  const period = bite ? 320 : 900;
  const ring = (now % period) / period;
  ctx.save();
  ctx.globalAlpha = (1 - ring) * 0.6;
  ctx.strokeStyle = "#eaf6ff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const r = 3 + ring * 12;
  ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const bob = Math.sin(now / (bite ? 55 : 260)) * (bite ? 2.5 : 1.2);
  ctx.fillStyle = "#2b3f4a";
  ctx.fillRect(cx - 3, cy - 4 + bob, 6, 5);
  ctx.fillStyle = bite ? "#ffd34d" : "#d8452f";
  ctx.fillRect(cx - 2, cy - 3 + bob, 4, 2);
  ctx.fillStyle = "#f2f7f9";
  ctx.fillRect(cx - 2, cy - 1 + bob, 4, 2);
}

/* Which of the four cast frames to show, read off the rip a frame at a time.
   Each direction runs wind-up to rod-extended - except right, whose frames sit
   in the reverse order on the sheet, so its two indices are swapped. Worth
   writing down rather than deriving: nothing about the image says so. */
const FISH_WINDUP = { down: 1, up: 2, left: 1, right: 2 };
const FISH_HOLD = { down: 3, up: 3, left: 3, right: 0 };
export const fishFrame = (dir, phase) =>
  (phase === "cast" ? FISH_WINDUP : FISH_HOLD)[dir] ?? 0;

/* mode carries which set to draw from, an explicit frame where the animation is
   not the walk cycle, and a lift in pixels for a ledge hop. There is no jump
   anywhere on the sheet: FireRed hops by raising the ordinary walking frame and
   leaving a shadow on the ground, so that is what a lift does here. */
export function drawPlayer(ctx, sheet, px, py, dir, step, moving, progress = 1, mode = {}) {
  if (sheet?.sets) {
    const set = sheet.sets[mode.set] ?? sheet.sets.walk;
    const scale = sheet.scale ?? 2;
    /* WHICH CHARACTER, as a row offset rather than a second sheet. The rip
       carries both playable trainers and `build_player` cuts them into one
       strip - Red's four facings then Leaf's - so choosing one is adding four
       rows, not loading a different image. `?? 0` keeps a player.json built
       before this (or a sheet that failed to load) drawing Red rather than
       drawing nothing. */
    const base = sheet.chars?.[mode.char] ?? 0;
    const row = base + ((sheet.dirs ?? DIR_ROW)[dir] ?? 0);
    const col = (mode.frame != null
      ? mode.frame
      : (!moving || progress >= STRIDE
          ? NEUTRAL
          : STRIDE_COLS[step % STRIDE_COLS.length])) % set.frames;
    // The sheet is authored against 16px tiles while we draw tiles at TILE, so
    // the sprite has to be scaled to match or the trainer comes out half-size.
    // The 32-wide sets keep the figure in their middle 16, so centring on the
    // tile puts the rod's overhang where it belongs with no per-set nudge.
    const w = set.w * scale;
    const h = set.h * scale;
    const lift = mode.lift ?? 0;

    if (lift > 0.5) {
      // The shadow stays on the ground the trainer left, which is the only
      // thing that reads the arc as a jump rather than as a glide.
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#1d2b22";
      ctx.beginPath();
      ctx.ellipse(px + TILE / 2, py + TILE - 4, 8, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.drawImage(
      sheet.img, set.x + col * set.w, set.y + row * set.h, set.w, set.h,
      px + (TILE - w) / 2, py + TILE - h - lift, w, h
    );
    return;
  }
  drawPlayerProcedural(ctx, px, py, dir, step, moving, progress);
}

function drawPlayerProcedural(ctx, px, py, dir, step, moving, progress = 1) {
  const bob = moving && progress < STRIDE && step % 2 ? 1 : 0;

  ctx.fillStyle = "rgba(30,50,38,.18)";
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 29, 9, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2b2b33";
  ctx.fillRect(px + 11, py + 24 - bob, 4, 6);
  ctx.fillRect(px + 17, py + 24 + bob, 4, 6);
  ctx.fillStyle = "#3b5f9e";
  ctx.fillRect(px + 10, py + 15, 12, 10);
  ctx.fillStyle = "#f0c9a0";
  ctx.beginPath();
  ctx.arc(px + 16, py + 11, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.arc(px + 16, py + 10, 7, Math.PI, 0);
  ctx.fill();
  if (dir === "left") ctx.fillRect(px + 4, py + 9, 7, 2);
  if (dir === "right") ctx.fillRect(px + 21, py + 9, 7, 2);
  if (dir === "down") ctx.fillRect(px + 11, py + 10, 10, 2);

  if (dir === "down") {
    ctx.fillStyle = "#2b2b33";
    ctx.fillRect(px + 13, py + 12, 2, 2);
    ctx.fillRect(px + 18, py + 12, 2, 2);
  }
}
