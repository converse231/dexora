"""Look at how FireRed actually uses a tileset.  python tools/study_tiles.py

Picking biome tiles by eye produced maps that read as repeating slabs, because
these are cave and interior tilesets: their ground is drawn *with edges*, and the
single most-used blocked metatile is usually the middle of a wall, not something
you can scatter.

So render the real thing. For each of our biomes this dumps, into .study/:

  <name>_map.png     the actual FireRed map, drawn from its own map.bin
  <name>_top.png     its most-used metatiles, labelled with id and count

Then choosing a ground tile is reading a number off a picture instead of
guessing, which is the same method that settled the meadow's grass and trees.

Not part of the build - it writes nothing the game loads.
"""

import io
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_assets as B  # noqa: E402

OUT = os.path.join(B.ROOT, ".study")

# our biome, its map.bin, the secondary tileset that map uses, and its size
MAPS = [
    ("ember", "MtEmber_RubyPath_B4F.bin", "mt_ember", None),
    ("frost", "SeafoamIslands_1F.bin", "seafoam_islands", None),
    # Building map - see SECONDARY in build_assets for why that matters.
    ("power", "PowerPlant.bin", "power_plant", None),
    ("tower", "PokemonTower_2F.bin", "pokemon_tower", None),
    ("ridge", "MtMoon_1F.bin", "cave", None),
    ("woods", "ViridianForest.bin", "viridian_forest", None),
]


def layout_size(stem):
    """Width and height for a map.bin, from the cached layouts.json."""
    import json
    data = json.load(io.open(os.path.join(B.SRC, "layouts.json")))
    want = stem.replace(".bin", "") + "_Layout"
    for L in data["layouts"]:
        if L.get("name") == want:
            return L["width"], L["height"]
    return None


def read_map(path, w, h):
    """map.bin -> (h, w) of metatile ids. Bits 0-9 are the id; 10-11 are the
    collision flag and 12-15 the elevation, which we do not need here."""
    raw = np.frombuffer(io.open(path, "rb").read(), dtype="<u2")
    return (raw[: w * h] & 0x03FF).reshape(h, w)


def label(img, text, x, y):
    d = ImageDraw.Draw(img)
    d.rectangle([x, y, x + 46, y + 9], fill=(0, 0, 0))
    d.text((x + 1, y), text, fill=(255, 255, 120))


def main():
    os.makedirs(OUT, exist_ok=True)
    prim_tiles = B.cut_tiles(Image.open(B.fetch(
        "data/tilesets/primary/general/tiles.png", "tiles.png")))
    prim_pals = B.load_pals("data/tilesets/primary/general", "palettes")

    for name, binfile, secname, _ in MAPS:
        src = os.path.join(B.SRC, binfile)
        if not os.path.exists(src):
            print("  missing", binfile)
            continue
        size = layout_size(binfile)
        if not size:
            print("  no layout for", binfile)
            continue
        w, h = size

        smt, stiles, spals = B.load_secondary(secname, prim_tiles, prim_pals)
        prim_mt = np.frombuffer(io.open(os.path.join(B.SRC, "metatiles.bin"),
                                        "rb").read(), dtype="<u2").reshape(-1, 8)

        grid = read_map(src, w, h)

        # Draw the map itself: primary ids come from the shared sheet, 640+ from
        # this map's secondary, exactly as the game does it.
        out = np.zeros((h * 16, w * 16, 4), np.uint8)
        for y in range(h):
            for x in range(w):
                mid = int(grid[y, x])
                m = prim_mt[mid] if mid < 640 else smt[mid - 640]
                for layer, keyed in ((0, False), (4, True)):
                    for q in range(4):
                        qy, qx = divmod(q, 2)
                        B.blit(out, stiles, spals, int(m[layer + q]),
                               x * 16 + qx * 8, y * 16 + qy * 8, keyed)
        Image.fromarray(out, "RGBA").save(os.path.join(OUT, f"{name}_map.png"))

        # The most-used metatiles, biggest first, each labelled with its id.
        ids, counts = np.unique(grid, return_counts=True)
        order = np.argsort(-counts)[:40]
        cols = 10
        rows = (len(order) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 52, rows * 62), (24, 24, 28))
        for i, oi in enumerate(order):
            mid, n = int(ids[oi]), int(counts[oi])
            m = prim_mt[mid] if mid < 640 else smt[mid - 640]
            cell = np.zeros((16, 16, 4), np.uint8)
            for layer, keyed in ((0, False), (4, True)):
                for q in range(4):
                    qy, qx = divmod(q, 2)
                    B.blit(cell, stiles, spals, int(m[layer + q]),
                           qx * 8, qy * 8, keyed)
            tile = Image.fromarray(cell, "RGBA").resize((48, 48), Image.NEAREST)
            cy, cx = divmod(i, cols)
            sheet.paste(tile, (cx * 52 + 2, cy * 62 + 2), tile)
            # id above the count, so a glance gives both
            label(sheet, f"{mid} x{n}", cx * 52 + 2, cy * 62 + 51)
        sheet.save(os.path.join(OUT, f"{name}_top.png"))

        local = [int(i) - 640 for i in ids[order][:12] if i >= 640]
        print(f"  {name:9s} {w}x{h}  {len(ids)} distinct  "
              f"top secondary-local ids: {local[:8]}")

    print("->", OUT)


if __name__ == "__main__":
    main()


def show(name, secname, ids, scale=5):
    """Render specific secondary-local ids big and labelled, to confirm a pick
    before it goes into build_assets.py. python -c is enough to call it."""
    prim_tiles = B.cut_tiles(Image.open(B.fetch(
        "data/tilesets/primary/general/tiles.png", "tiles.png")))
    prim_pals = B.load_pals("data/tilesets/primary/general", "palettes")
    smt, stiles, spals = B.load_secondary(secname, prim_tiles, prim_pals)
    s = 16 * scale
    sheet = Image.new("RGB", (len(ids) * (s + 4), s + 14), (24, 24, 28))
    for i, lid in enumerate(ids):
        cell = np.zeros((16, 16, 4), np.uint8)
        for layer, keyed in ((0, False), (4, True)):
            for q in range(4):
                qy, qx = divmod(q, 2)
                B.blit(cell, stiles, spals, int(smt[lid][layer + q]),
                       qx * 8, qy * 8, keyed)
        t = Image.fromarray(cell, "RGBA").resize((s, s), Image.NEAREST)
        sheet.paste(t, (i * (s + 4) + 2, 2), t)
        label(sheet, str(lid), i * (s + 4) + 2, s + 3)
    os.makedirs(OUT, exist_ok=True)
    sheet.save(os.path.join(OUT, f"pick_{name}.png"))
    print("  ->", f".study/pick_{name}.png")


if __name__ == "__main__":
    main()
