# -*- coding: utf-8 -*-
"""Paint what render_area.mjs recorded. See that file for why it is split in two.

Run: python tools/render_area.py area.json area.png [zoom]
"""
import io
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "area.json"
    dst = sys.argv[2] if len(sys.argv) > 2 else "area.png"
    zoom = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0

    d = json.load(io.open(src, encoding="utf-8"))
    atlas = Image.open(os.path.join(ROOT, "public", "tilesets", "route.png")).convert("RGBA")
    s, cols, tile = d["size"], d["cols"], d["tile"]

    out = Image.new("RGBA", (d["W"] * tile, d["H"] * tile), (0, 0, 0, 255))
    for tid, dx, dy in d["draws"]:
        sx, sy = (tid % cols) * s, (tid // cols) * s
        piece = atlas.crop((sx, sy, sx + s, sy + s))
        if piece.size != (tile, tile):
            piece = piece.resize((tile, tile), Image.NEAREST)
        out.alpha_composite(piece, (int(dx), int(dy)))

    if zoom != 1.0:
        out = out.resize((int(out.width * zoom), int(out.height * zoom)), Image.NEAREST)
    out.convert("RGB").save(dst)
    print(f"{d['id']}: {out.width}x{out.height} -> {dst}")


if __name__ == "__main__":
    main()
