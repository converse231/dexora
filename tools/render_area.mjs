/* Render one of our maps to look at it, with no browser and no second copy of
   the tile rules.

   `drawTile` is the shipped renderer, so what this draws is what the game
   draws - which is the whole point, and why this does not reimplement the
   autotiles in Python. `blit` is the only thing that touches the canvas, and
   all it needs from the atlas is `tileSize`, `atlasCols` and an `img` it never
   inspects. So: hand it route.json with a placeholder image and a ctx whose
   `drawImage` records the source rectangle. The atlas id falls straight out of
   that, and PIL paints the ids out of route.png.

   Run: node tools/render_area.mjs power out.json
        python tools/render_area.py out.json out.png
*/
import { readFileSync, writeFileSync } from "node:fs";
import { drawTile, drawOverhangs, TILE } from "../src/game/tileset.js";
import { AREAS } from "../src/game/mapdata.js";

const id = process.argv[2] ?? "power";
const out = process.argv[3] ?? "area.json";

const meta = JSON.parse(readFileSync(new URL("../public/tilesets/route.json", import.meta.url), "utf8"));
const area = AREAS[id];
if (!area) throw new Error(`no area "${id}" - have ${Object.keys(AREAS).join(", ")}`);

const rows = area.rows;
const H = rows.length;
const W = rows[0].length;
const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? rows[y][x] : "");

const s = meta.tileSize;
const cols = meta.atlasCols ?? 16;
const atlas = { ...meta, img: { __stub: true } };

/* Every draw, in order, as (atlas id, destination). Order matters: the
   overhang pass paints over the floor, exactly as it does on screen. */
const draws = [];
const ctx = {
  drawImage(_img, sx, sy, _sw, _sh, dx, dy) {
    draws.push([Math.round(sy / s) * cols + Math.round(sx / s), dx, dy]);
  },
  save() {}, restore() {}, fillRect() {}, beginPath() {}, fill() {},
  arc() {}, moveTo() {}, lineTo() {}, stroke() {}, closePath() {},
  set fillStyle(_v) {}, set strokeStyle(_v) {}, set globalAlpha(_v) {},
  set lineWidth(_v) {},
};

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    /* `tiles` IS ALREADY REBASED - `tileBase` records the base that was added
       when the map was generated, it is not a base to add now. Adding it again
       shifted every id by 896 and drew Frost Hollow in the volcano's tileset,
       orange stripes and all. The engine passes `fixed[i]` straight through
       (see engine.js), and this has to do exactly what the engine does or it
       is a second copy of the tile rules - which is the one thing this harness
       exists not to be. */
    drawTile(ctx, atlas, at(x, y), x * TILE, y * TILE, x, y, at,
             area.tiles ? area.tiles[y * W + x] : -1);
  }
}
/* The top-layer pass - what a trainer walks behind. Without it a canopy edge
   is missing from the picture and the render is not what the game shows. */
try { drawOverhangs(ctx, atlas, 0, 0, W, H, 0, 0, at); } catch { /* not every map has one */ }

writeFileSync(out, JSON.stringify({ id, W, H, tile: TILE, size: s, cols, draws, rows }));
console.log(`${id}: ${W}x${H}, ${draws.length} draws -> ${out}`);
