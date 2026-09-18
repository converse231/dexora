# -*- coding: utf-8 -*-
"""Does Frost Hollow's collision agree with the tiles it is drawn from?

Frost Hollow is Seafoam Islands transcribed, and it carries the REAL map's own
metatile ids (`AREAS.frost.tiles`) while taking its collision from OUR map
character. Those are two independent channels over the same cell, so they can
disagree - and when they do the result is a wall you can walk through, or a
patch of floor you cannot step on, with nothing in any test to say so.

The real map is the arbiter. A metatile's collision is stored per CELL in Gen
3, not in the metatile, so this builds the mapping empirically: across all five
Seafoam floors, what collision does each metatile id actually carry? Ids used
consistently give a clear answer, and those are the ones worth checking.

Run: python tools/study_frost.py
"""
import io
import json
import os
import re
import sys
from collections import Counter, defaultdict

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build_assets as B                                          # noqa: E402

FLOORS = ["SeafoamIslands_1F", "SeafoamIslands_B1F", "SeafoamIslands_B2F",
          "SeafoamIslands_B3F", "SeafoamIslands_B4F"]
# How lopsided a metatile's collision has to be before we call it settled.
SURE = 0.90


def real_cells(name):
    lay = json.load(io.open(os.path.join(B.SRC, "layouts.json")))
    L = next(x for x in lay["layouts"] if x.get("name") == name + "_Layout")
    w, h = L["width"], L["height"]
    raw = np.frombuffer(
        io.open(B.fetch(f"data/layouts/{name}/map.bin", name + ".bin"), "rb").read(),
        dtype="<u2")[: w * h]
    return (raw & 0x3FF), ((raw >> 10) & 3)


def our_frost():
    """rows, tiles and tileBase straight out of the generated mapdata."""
    src = io.open(os.path.join(ROOT, "src", "game", "mapdata.js"),
                  encoding="utf-8").read()
    at = src.index("  frost: {")
    end = src.index("\n  },", at)
    block = src[at:end]
    rows = re.findall(r'^\s+"([a-zA-Z~#,.]+)",$', block, re.M)
    base = int(re.search(r"tileBase:\s*(\d+)", block).group(1))
    nums = re.search(r"tiles:\s*\[(.*?)\]", block, re.S).group(1)
    tiles = [int(v) for v in re.findall(r"-?\d+", nums)]
    return rows, tiles, base


def main():
    # ---- what each Seafoam metatile's collision actually is ---------------
    seen = defaultdict(Counter)
    for f in FLOORS:
        ids, coll = real_cells(f)
        for i, c in zip(ids.tolist(), coll.tolist()):
            seen[i][c] += 1

    settled = {}
    for tid, counts in seen.items():
        total = sum(counts.values())
        walk = counts.get(0, 0)
        if walk / total >= SURE:
            settled[tid] = True            # walkable wherever it appears
        elif (total - walk) / total >= SURE:
            settled[tid] = False           # solid wherever it appears
    print(f"{len(seen)} metatiles used across {len(FLOORS)} Seafoam floors; "
          f"{len(settled)} have a settled collision (>= {SURE:.0%} one way)")

    # ---- and what ours says -----------------------------------------------
    import build_map as M
    rows, tiles, base = our_frost()
    H, W = len(rows), len(rows[0])
    assert len(tiles) == W * H, f"{len(tiles)} ids for a {W}x{H} map"

    wrong = defaultdict(list)
    checked = 0
    for y in range(H):
        for x in range(W):
            tid = tiles[y * W + x]
            if tid < 0:
                continue                    # we authored this cell on purpose
            local = tid - base + 640        # back to the Seafoam local id
            if local not in settled:
                continue
            # WATER IS PASSABLE IN GEN 3'S COLLISION BITS, and that is not a
            # disagreement. What stops you walking onto a lake there is the
            # metatile's BEHAVIOUR byte, in a separate attributes file - you
            # surf over it, so the map marks it walkable. Running this without
            # the exclusion reported 66 "faults", every one of them `k`, and
            # every one of them correct. It is the checker that was wrong.
            if rows[y][x] in "kK":
                continue
            ours_walkable = rows[y][x] not in M.SOLID
            checked += 1
            if ours_walkable != settled[local]:
                wrong[(rows[y][x], local, settled[local])].append((x, y))

    print(f"{checked} cells carry a real id with a settled collision")
    if not wrong:
        print("every one of them agrees with ours - the transcription is faithful")
        return 0

    bad = sum(len(v) for v in wrong.values())
    print(f"\n{bad} cells DISAGREE, in {len(wrong)} kinds:\n")
    print(f"{'ours':>5} {'tile':>6} {'real':>10} {'cells':>6}   where")
    for (ch, local, real_walk), cells in sorted(
            wrong.items(), key=lambda kv: -len(kv[1])):
        where = " ".join(f"{x},{y}" for x, y in cells[:6])
        more = f" +{len(cells) - 6}" if len(cells) > 6 else ""
        print(f"{ch!r:>5} {local:>6} {'walk' if real_walk else 'solid':>10} "
              f"{len(cells):>6}   {where}{more}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
