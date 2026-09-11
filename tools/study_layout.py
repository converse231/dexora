"""What a Game Freak map is shaped like.  python tools/study_layout.py

Composition is the one part of this project still done by eye, and it shows: the
Power Plant and Ember Caldera both came out as horizontal bands on their first
pass, twice, and nothing caught it but looking. Taste is hard to assert. Numbers
are not, so this measures the real maps and ours on the same handful of them.

    stripe    mean solid run along rows / along columns. 1.0 is balanced; a map
              of bands runs long east-west and short north-south.
    turns     corners per tile of wall boundary. Straight walls turn rarely.
    dead      fraction of walkable tiles with exactly one walkable neighbour.
    loops     independent cycles in the walkable graph, per 100 walkable tiles -
              how much of the map is a circuit rather than a corridor.
    tight     fraction of walkable tiles within one step of a wall. A map that
              is all corridor scores high; one that is all hall scores low.
    open      walkable share of the map.

None of these is a target on its own - Route 1 is nearly all hall, Rock Tunnel
nearly all corridor, and both are good maps. They are for spotting a map that
sits outside the range every real map of ITS OWN KIND occupies - which is what
this always claimed and, for a while, did not do: `band` pooled every kind, so a
tower could sit outside all six real tower floors and pass because some cave was
wider. Kinds with fewer than three samples are reported but not flagged, since a
band drawn from one or two maps is those maps rather than a range.
"""

import collections
import io
import json
import os
import sys

import numpy as np

import build_assets as B

# Twelve was too few, and worse, too narrow a spread of KINDS: with one forest
# and no indoor tower in it, the band said our Deep Woods and Haunted Tower were
# outliers when the only thing they were outliers from was a sample of caves and
# routes. A band is only as honest as what went into it.
REAL = [
    ("Route1", "route"), ("ViridianForest", "forest"), ("MtMoon_1F", "cave"),
    # Forest had ONE sample, so its "band" was a single point and every real
    # difference in our Deep Woods read as an outlier. Berry Forest is the
    # only other true forest FireRed has; Viridian's own two halves are one
    # map, so this is as wide as this kind gets.
    ("ThreeIsland_BerryForest", "forest"),
    # Indoor had one as well - the Power Plant, which our Power Plant is a copy
    # of, so it was being measured against itself. These are the other big
    # interiors: a mansion floor, a Rocket basement, a Silph floor.
    ("PokemonMansion_1F", "indoor"), ("RocketHideout_B1F", "indoor"),
    ("SilphCo_2F", "indoor"),
    ("PokemonTower_2F", "tower"),
    ("PokemonTower_3F", "tower"), ("PokemonTower_4F", "tower"),
    ("PokemonTower_5F", "tower"), ("PokemonTower_6F", "tower"),
    ("PokemonTower_7F", "tower"), ("Route2", "route"), ("Route3", "route"),
    ("MtMoon_B2F", "cave"), ("RockTunnel_1F", "cave"), ("RockTunnel_B1F", "cave"),
    ("PowerPlant", "indoor"), ("SeafoamIslands_B3F", "cave"),
    ("SeafoamIslands_B2F", "cave"), ("MtEmber_RubyPath_B3F", "cave"),
    ("CeruleanCave_1F", "cave"), ("VictoryRoad_1F", "cave"),
]


# Which kind of real map each of ours should be judged against. Without this the
# tool cannot do per-kind at all - it knows the kind of every REAL map and the
# kind of none of ours.
OURS = {
    "meadow": "route", "woods": "forest", "pond": "route", "ridge": "cave",
    "power": "indoor", "ember": "cave", "frost": "cave", "tower": "tower",
}

# Below this, the spread is the sample rather than the kind.
MIN_SAMPLE = 3


def reachable(mask):
    """The largest connected run of walkable tiles, and nothing else.

    A real map's collision bits say what is passable, not what is REACHABLE: the
    fill outside a cave mouth is passable, and so is every pocket the layout
    seals off. Rock Tunnel 1F is 63% such tiles, Route 2 is 45%, and counting
    them inflated `open`, flattened `dead` and moved every band this tool
    produces. Frost Hollow read as drifting from the map it is copied from
    entirely because of it.

    Ours are asserted 90%+ reachable already, so this changes little for them -
    it is applied to both so that two things being compared are measured the
    same way."""
    import numpy as np
    h, w = mask.shape
    seen = np.zeros_like(mask)
    best = []
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            stack, cells = [(x0, y0)], []
            while stack:
                x, y = stack.pop()
                if not (0 <= x < w and 0 <= y < h) or seen[y, x] or not mask[y, x]:
                    continue
                seen[y, x] = True
                cells.append((x, y))
                stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
            if len(cells) > len(best):
                best = cells
    out = np.zeros_like(mask)
    for x, y in best:
        out[y, x] = True
    return out


def real_walkable(name):
    """The walkable mask of a real FireRed map, from its own collision bits."""
    lay = json.load(io.open(os.path.join(B.SRC, "layouts.json")))
    L = next(x for x in lay["layouts"] if x.get("name") == name + "_Layout")
    w, h = L["width"], L["height"]
    raw = np.frombuffer(io.open(B.fetch(f"data/layouts/{name}/map.bin", name + ".bin"),
                                "rb").read(), dtype="<u2")[: w * h]
    return reachable((((raw >> 10) & 3).reshape(h, w) == 0))

def ours_walkable(area):
    """The same, for one of ours: SOLID is the collision."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import build_map as M
    rows = area["rows"]
    return reachable(np.array([[c not in M.SOLID for c in r] for r in rows]))


def runs(mask, axis):
    """Mean length of a solid run along one axis."""
    out = []
    m = mask if axis == 0 else mask.T
    for line in m:
        n = 0
        for v in line:
            if v:
                if n:
                    out.append(n)
                n = 0
            else:
                n += 1
        if n:
            out.append(n)
    return float(np.mean(out)) if out else 0.0


def measure(walk):
    h, w = walk.shape
    solid = ~walk
    inside = lambda x, y: 0 <= x < w and 0 <= y < h

    # corners of the wall boundary: a solid tile whose walkable neighbours turn
    turns = boundary = 0
    for y in range(h):
        for x in range(w):
            if not solid[y][x]:
                continue
            n = [inside(x + dx, y + dy) and walk[y + dy][x + dx]
                 for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0))]
            if not any(n):
                continue
            boundary += 1
            up, down, left, right = n
            if (up or down) and (left or right):
                turns += 1

    deg = np.zeros_like(walk, dtype=int)
    edges = 0
    for y in range(h):
        for x in range(w):
            if not walk[y][x]:
                continue
            for dx, dy in ((1, 0), (0, 1)):
                if inside(x + dx, y + dy) and walk[y + dy][x + dx]:
                    edges += 1
                    deg[y][x] += 1
                    deg[y + dy][x + dx] += 1
    nodes = int(walk.sum())

    # connected components of the walkable graph
    seen = np.zeros_like(walk, dtype=bool)
    comps = 0
    for y in range(h):
        for x in range(w):
            if walk[y][x] and not seen[y][x]:
                comps += 1
                stack = [(x, y)]
                while stack:
                    cx, cy = stack.pop()
                    if not inside(cx, cy) or seen[cy][cx] or not walk[cy][cx]:
                        continue
                    seen[cy][cx] = True
                    stack += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]

    tight = sum(1 for y in range(h) for x in range(w) if walk[y][x] and
                any(not (inside(x + dx, y + dy) and walk[y + dy][x + dx])
                    for dx in (-1, 0, 1) for dy in (-1, 0, 1)))
    rh, rv = runs(walk, 0), runs(walk, 1)
    return dict(
        stripe=(rh / rv) if rv else 0.0,
        turns=turns / boundary if boundary else 0.0,
        dead=float(((deg == 1) & walk).sum()) / max(nodes, 1),
        loops=100.0 * max(0, edges - nodes + comps) / max(nodes, 1),
        tight=tight / max(nodes, 1),
        open=nodes / float(w * h),
    )


def show(label, m, kind=""):
    print("  %-24s %-7s stripe %5.2f  turns %.2f  dead %.3f  loops %5.1f  "
          "tight %.2f  open %.2f"
          % (label, kind, m["stripe"], m["turns"], m["dead"], m["loops"],
             m["tight"], m["open"]))


def main():
    print("REAL MAPS")
    band = collections.defaultdict(list)
    kinds = collections.defaultdict(lambda: collections.defaultdict(list))
    for name, kind in REAL:
        try:
            m = measure(real_walkable(name))
        except Exception as e:
            print("  %-24s skipped (%s)" % (name, type(e).__name__))
            continue
        show(name, m, kind)
        for k, v in m.items():
            band[k].append(v)
            kinds[kind][k].append(v)
    print()
    print("  range across them:")
    for k in ("stripe", "turns", "dead", "loops", "tight", "open"):
        v = band[k]
        print("    %-7s %.2f .. %.2f   (median %.2f)"
              % (k, min(v), max(v), sorted(v)[len(v) // 2]))

    print("\nOURS")
    import re
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import build_map as M
    txt = io.open(os.path.join(B.ROOT, "src", "game", "mapdata.js"),
                  encoding="utf-8").read()

    got = []
    for blk in re.finditer(r"^  (\w+): \{(.*?)^  \},", txt, re.S | re.M):
        aid, body = blk.group(1), blk.group(2)
        rows = re.findall(r'^      "([^"]*)",', body, re.M)
        if not rows:
            continue
        m = measure(np.array([[c not in M.SOLID for c in r] for r in rows]))
        show(aid, m)
        got.append((aid, m))

    thin = sorted(k for k in kinds if len(kinds[k]["open"]) < MIN_SAMPLE)
    print("\n  outside the range real maps of the same kind occupy:")
    flagged = False
    for aid, m in got:
        kind = OURS.get(aid)
        if kind is None or kind in thin:
            continue
        for k in ("stripe", "turns", "dead", "loops", "tight", "open"):
            lo, hi = min(kinds[kind][k]), max(kinds[kind][k])
            # A band with no width is a value, not a range. Every real route
            # has exactly zero dead ends once the unreachable pockets are
            # dropped, so `dead 0.00 .. 0.00` flagged any map with a single
            # nook in it - which is a thing we add on purpose.
            if hi <= lo:
                continue
            if not (lo <= m[k] <= hi):
                print("    %-9s %-7s %6.2f   real %s run %.2f .. %.2f"
                      % (aid, k, m[k], kind, lo, hi))
                flagged = True
    if not flagged:
        print("    nothing - all of them sit inside their own kind")
    unjudged = [a for a, _ in got if OURS.get(a) is None or OURS.get(a) in thin]
    if unjudged:
        print("  not judged (fewer than %d real maps of the kind): %s"
              % (MIN_SAMPLE, ", ".join(unjudged)))


if __name__ == "__main__":
    main()
