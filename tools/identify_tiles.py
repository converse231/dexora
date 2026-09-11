"""Identify every tile in a ripped tileset compilation.  python tools/identify_tiles.py

A Spriters-Resource compilation is a flat PNG: no metatile boundaries, no
palettes, no collision, and nothing that says which tileset a block came from.
Naming its tiles by eye is exactly what this project does not do.

So it does not guess. Every metatile of every pokeemerald tileset is rendered and
hashed, the sheet is sliced on the 16px grid, and each cell is looked up. What
comes out is not an opinion: it is "this tile is gTileset_Petalburg metatile
712", which is a handle we can then pull properly - with its real palette, its
two layers and its collision - and whose *use* can be derived from a real map by
masking, the way every other tile rule here was.

Writes into .study/identify/:
    <sheet>.tsv      one row per matched cell: col, row, tileset, metatile id
    <sheet>.png      the sheet with each block outlined and labelled

Name the primary the sheet is drawn against, and only widen to "all" if it mixes
them. Widening costs attribution: the more tilesets in the index, the more ways
a shared tile can be explained, and the exterior sheet starts crediting interior
tilesets for its grass. Exterior against General resolves 98% of its real art
across 15 tilesets; the interior sheet genuinely mixes three primaries and needs
"all", where it resolves 99% across 53.

The sheets live in `.assets-src/reference/`, not `public/` - anything under
public is copied into every build, and 1.6MB of source art nobody loads was
riding along in dist.

`--game=firered` reads pokefirered instead, whose primary split is 640 tiles and
7 palettes rather than Emerald's 512 and 6.

Usage:
    python tools/identify_tiles.py ".assets-src/reference/...Exterior Tileset.png" General
    python tools/identify_tiles.py ".assets-src/reference/...Interior Tilesets (1).png" all
    python tools/identify_tiles.py ".assets-src/reference/...ozotwo....png" all --game=firered
"""

import collections
import hashlib
import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

import build_assets as B

EMERALD = "https://raw.githubusercontent.com/pret/pokeemerald/master"
OUT = os.path.join(B.ROOT, ".study", "identify")

# Which decomp, and its own two constants. Getting either wrong renders every
# secondary metatile against the wrong tiles and the wrong palettes, and the
# result looks like plausible stripes rather than like an error.
GAMES = {
    "emerald": dict(raw=EMERALD, tiles=512, pals=6, cache="em"),
    "firered": dict(raw=B.RAW, tiles=640, pals=7, cache="fr"),
}
GAME = GAMES["emerald"]         # set by main()
EM_PRIMARY_TILES = GAME["tiles"]
EM_PRIMARY_PALS = GAME["pals"]


def snake(name):
    """gTileset_BattleFrontierOutsideEast -> battle_frontier_outside_east."""
    out = []
    for i, c in enumerate(name):
        if c.isupper() and i and not name[i - 1].isupper():
            out.append("_")
        out.append(c.lower())
    return "".join(out)


def em(rel, dest):
    return B.fetch(rel, dest, root=GAME["raw"])


def cached(*parts):
    return "/".join((GAME["cache"],) + parts)


def pals_of(rel, pref):
    return np.concatenate([B.read_pal(em(f"{rel}/palettes/{i:02d}.pal", f"{pref}/{i:02d}.pal"))
                           for i in range(16)])


def load_primary(name):
    rel = f"data/tilesets/primary/{name}"
    tiles = B.cut_tiles(Image.open(em(f"{rel}/tiles.png", cached(name, "tiles.png"))))
    pals = pals_of(rel, cached(name, "palettes"))
    mt = np.frombuffer(io.open(em(f"{rel}/metatiles.bin", cached(name, "metatiles.bin")),
                               "rb").read(), dtype="<u2").reshape(-1, 8)
    return mt, tiles, pals


def secondary_paths(sec):
    """Where a secondary's tiles, palettes and metatiles actually live.

    Usually all three sit in `secondary/<name>/`. Six do not: the secret bases
    are variants of one metatile set, so pokeemerald keeps `metatiles.bin` in
    `secondary/secret_base/` and gives each variant a subdirectory with its own
    tiles and palettes. All six were 404ing, and they are precisely the block
    the interior sheet repeats six times in six palettes - 1680 of its 1909
    unmatched cells."""
    base = f"data/tilesets/secondary/{sec}"
    parts = sec.split("_")
    for k in range(len(parts) - 1, 0, -1):
        parent, child = "_".join(parts[:k]), "_".join(parts[k:])
        try:
            em(f"data/tilesets/secondary/{parent}/{child}/tiles.png",
               cached(parent, child, "tiles.png"))
        except Exception:
            continue
        return (f"data/tilesets/secondary/{parent}/{child}",
                f"data/tilesets/secondary/{parent}", cached(parent, child))
    return base, base, cached(sec)


def load_pair(prim, sec):
    """One secondary resolved against its primary, as the game resolves it."""
    pmt, ptiles, ppals = load_primary(prim)
    rel, mt_rel, cache = secondary_paths(sec)
    stiles = B.cut_tiles(Image.open(em(f"{rel}/tiles.png", f"{cache}/tiles.png")))
    spals = pals_of(rel, f"{cache}/palettes")
    smt = np.frombuffer(io.open(em(f"{mt_rel}/metatiles.bin", f"{cache}/metatiles.bin"),
                                "rb").read(), dtype="<u2").reshape(-1, 8)

    tiles = np.zeros((EM_PRIMARY_TILES + len(stiles), 8, 8), np.uint8)
    tiles[:min(EM_PRIMARY_TILES, len(ptiles))] = ptiles[:EM_PRIMARY_TILES]
    tiles[EM_PRIMARY_TILES:] = stiles
    pals = np.concatenate([ppals[: EM_PRIMARY_PALS * 16], spals[EM_PRIMARY_PALS * 16:]])

    allmt = np.zeros((EM_PRIMARY_TILES + len(smt), 8), dtype="<u2")
    allmt[:min(EM_PRIMARY_TILES, len(pmt))] = pmt[:EM_PRIMARY_TILES]
    allmt[EM_PRIMARY_TILES:] = smt
    return allmt, tiles, pals


def digest(a):
    """Hash a 16x16 tile at GBA colour depth.

    The rip and the decomp disagree by exactly 1 on every channel: GBA colour is
    5 bits, and expanding it to 8 as `v << 3` or as `v << 3 | v >> 2` gives two
    pictures that look identical and hash differently. Every cell in the sheet
    came out 1.00 mean-absolute-difference from its true match until this threw
    the bottom three bits away."""
    return hashlib.blake2b(np.ascontiguousarray(a[:, :, :3] >> 3).tobytes(),
                           digest_size=12).digest()


def build_index(prim):
    """hash -> [(tileset, metatile id)], over every secondary paired with `prim`.

    `prim` may be "all", because a sheet does not have to keep to one: the
    interior compilation mixes tilesets paired with Building, with General
    (Inside Ship, the Contest hall, the Battle Frontier) and with SecretBase,
    and indexing one primary left 28% of its real art unmatched."""
    layouts = json.load(io.open(em("data/layouts/layouts.json",
                                   cached("layouts.json"))))
    pairs = sorted({((l.get("primary_tileset") or "").replace("gTileset_", ""),
                     (l.get("secondary_tileset") or "").replace("gTileset_", ""))
                    for l in layouts["layouts"]
                    if l.get("primary_tileset") and l.get("secondary_tileset")})
    if prim != "all":
        pairs = [pq for pq in pairs if pq[0] == prim]
    index, seen = {}, 0
    for prim, sec in pairs:
        name = snake(sec)
        if not name or name == "0":
            continue
        try:
            mt, tiles, pals = load_pair(snake(prim), name)
        except Exception as e:                      # a tileset the decomp lays out differently
            print("  %-32s skipped (%s)" % (name, type(e).__name__))
            continue
        sheet = B.render_metatiles(mt, tiles, pals, cols=16)
        for i in range(len(mt)):
            y, x = (i // 16) * 16, (i % 16) * 16
            # Every secondary carries the same primary metatiles, so a hash
            # can belong to several tilesets. Keep them all and let the block
            # each cell sits in break the tie later - taking the first one
            # alphabetically put 804 of 805 matches in one wrong tileset.
            # Below the split the metatile belongs to the PRIMARY, which every
            # secondary shares - so it is not evidence of any one of them. Name
            # it for what it is instead of crediting whichever tileset was
            # loaded when we happened to render it.
            who = snake(prim) if i < EM_PRIMARY_TILES else name
            index.setdefault(digest(sheet[y:y + 16, x:x + 16]), []).append((who, i))
            seen += 1
        print("  %-32s %4d metatiles" % (name, len(mt)))
    print("  indexed %d metatiles, %d distinct images" % (seen, len(index)))
    return index


def best_offset(px, index, w, h):
    """The sheet's 16px grid need not start at (0,0). Find where it does."""
    best, at = -1, (0, 0)
    for dy in range(16):
        for dx in range(16):
            hits = 0
            for ty in range(dy, h - 15, 16 * 4):        # sample, do not scan it all
                for tx in range(dx, w - 15, 16 * 4):
                    if digest(px[ty:ty + 16, tx:tx + 16]) in index:
                        hits += 1
            if hits > best:
                best, at = hits, (dx, dy)
    return at, best


def main():
    global GAME, EM_PRIMARY_TILES, EM_PRIMARY_PALS
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for a in sys.argv[1:]:
        if a.startswith("--game="):
            GAME = GAMES[a.split("=", 1)[1]]
    EM_PRIMARY_TILES, EM_PRIMARY_PALS = GAME["tiles"], GAME["pals"]
    sheet_path, prim = args[0], (args[1] if len(args) > 1 else "General")
    os.makedirs(OUT, exist_ok=True)
    print("indexing %s tilesets paired with %s ..."
          % ("pokefirered" if GAME["cache"] == "fr" else "pokeemerald", prim))
    index = build_index(prim)

    img = Image.open(sheet_path).convert("RGBA")
    px = np.array(img)
    w, h = img.width, img.height
    (dx, dy), _ = best_offset(px, index, w, h)
    print("grid offset (%d,%d)" % (dx, dy))

    # Pass one: the cells only one tileset could have produced.
    cand = {}
    for ty in range(dy, h - 15, 16):
        for tx in range(dx, w - 15, 16):
            got = index.get(digest(px[ty:ty + 16, tx:tx + 16]))
            if got:
                cand[(tx, ty)] = got
    cand = {k: sorted({t for t in v}) for k, v in cand.items()}
    found = {k: v[0] for k, v in cand.items() if len({n for n, _ in v}) == 1}

    # Pass two: an ambiguous cell belongs to whichever of its candidates is
    # already winning nearby. Blocks in these sheets are one tileset each, so
    # the neighbourhood is the evidence.
    for _ in range(4):
        moved = 0
        for pos, opts in cand.items():
            if pos in found:
                continue
            tx, ty = pos
            near = collections.Counter()
            for ox in range(-4, 5):
                for oy in range(-4, 5):
                    n = found.get((tx + ox * 16, ty + oy * 16))
                    if n:
                        near[n[0]] += 1
            pick = max(((n, i) for n, i in opts), key=lambda o: near[o[0]], default=None)
            if pick and near[pick[0]]:
                found[pos] = pick
                moved += 1
        if not moved:
            break
    for pos, opts in cand.items():          # still nothing nearby: take the first
        found.setdefault(pos, opts[0])

    rows, hits = [], collections.Counter()
    for (tx, ty), (name, i) in sorted(found.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        rows.append((tx // 16, ty // 16, name, i))
        hits[name] += 1

    stem = os.path.splitext(os.path.basename(sheet_path))[0]
    with io.open(os.path.join(OUT, stem + ".tsv"), "w", encoding="utf-8") as f:
        f.write("col\trow\ttileset\tmetatile\n")
        for r in rows:
            f.write("%d\t%d\t%s\t%d\n" % r)

    total = ((h - dy) // 16) * ((w - dx) // 16)
    print("\nmatched %d of %d cells (%.0f%%)" % (len(rows), total, 100.0 * len(rows) / max(total, 1)))
    for name, n in hits.most_common():
        print("  %-32s %4d tiles" % (name, n))

    # Label each contiguous block with the tileset that dominates it.
    out = img.copy()
    d = ImageDraw.Draw(out)
    for (tx, ty), (name, _) in found.items():
        if (found.get((tx - 16, ty), (None,))[0] != name
                or found.get((tx, ty - 16), (None,))[0] != name):
            d.rectangle([tx, ty, tx + 15, ty + 15], outline=(255, 0, 128, 255))
    # Label every contiguous block, not just the first one per tileset: the
    # sheet repeats several tilesets in separate places and a single label
    # leaves most of the picture unnamed, which is the whole point of it.
    todo, region = set(found), []
    while todo:
        start = min(todo, key=lambda k: (k[1], k[0]))
        name = found[start][0]
        blob, stack = set(), [start]
        while stack:
            pos = stack.pop()
            if pos in blob or pos not in todo or found[pos][0] != name:
                continue
            blob.add(pos)
            tx, ty = pos
            stack += [(tx + 16, ty), (tx - 16, ty), (tx, ty + 16), (tx, ty - 16)]
        todo -= blob
        if len(blob) >= 6:
            region.append((min(blob, key=lambda k: (k[1], k[0])), name, len(blob)))
    for (tx, ty), name, n in region:
        w_lbl = 6 * len(name) + 4
        d.rectangle([tx, max(0, ty - 10), tx + w_lbl, max(10, ty)], fill=(0, 0, 0, 225))
        d.text((tx + 2, max(0, ty - 10)), name, fill=(255, 235, 140))
    print("labelled %d blocks" % len(region))

    out.save(os.path.join(OUT, stem + ".png"))
    print("wrote %s/%s.{tsv,png}" % (OUT, stem))


if __name__ == "__main__":
    main()
