"""How a Game Freak map is put together.  python tools/study_shape.py

study_layout.py says whether a map is in the right range. This says what the
range is made of - the numbers a generator would need to hit it:

    chambers   local maxima of the distance-to-wall transform, and how wide they
               are. A cave is chambers joined by passages, and this is how big
               its chambers are and how many it has per 1000 tiles.
    width      histogram of passage width (twice the distance to the nearest
               wall). Says how much of a map is 1-2 wide corridor and how much
               is open floor.
    straight   how far a stretch of wall boundary runs before it turns. A map of
               long straight runs reads as a fence; one that never runs straight
               reads as noise. Both are wrong, and the real distribution is
               neither.
    junctions  walkable tiles with 3 or 4 walkable neighbours, per 100 tiles -
               how often the player is offered a choice.

Written because composition was the last thing here still done by eye, and by
eye it produced two maps of horizontal stripes before anyone noticed.
"""

import collections
import io
import json
import os
import sys

import numpy as np

import build_assets as B

CAVES = ["MtMoon_1F", "MtMoon_B1F", "MtMoon_B2F", "RockTunnel_1F", "RockTunnel_B1F",
         "SeafoamIslands_1F", "SeafoamIslands_B2F", "SeafoamIslands_B3F",
         "CeruleanCave_1F", "CeruleanCave_2F", "VictoryRoad_1F", "VictoryRoad_2F",
         "MtEmber_RubyPath_B3F", "DiglettsCave_B1F"]
ROUTES = ["Route1", "Route2", "Route3", "Route4", "Route11", "Route25",
          "ViridianForest"]


def walkable(name):
    """A real map's reachable floor. See study_layout.reachable for why the
    reachability matters: collision bits mark the fill outside a cave and every
    sealed pocket as passable, and on Rock Tunnel 1F that is 63% of the tiles.
    Counting them moved every band these two tools produce."""
    import study_layout as SLY
    lay = json.load(io.open(os.path.join(B.SRC, "layouts.json")))
    L = next(x for x in lay["layouts"] if x.get("name") == name + "_Layout")
    w, h = L["width"], L["height"]
    raw = np.frombuffer(io.open(B.fetch(f"data/layouts/{name}/map.bin", name + ".bin"),
                                "rb").read(), dtype="<u2")[: w * h]
    return SLY.reachable((((raw >> 10) & 3).reshape(h, w) == 0))


def dist_to_wall(walk):
    """Chebyshev distance from each walkable tile to the nearest wall."""
    h, w = walk.shape
    from collections import deque
    d = np.full((h, w), 0, int)
    q = deque()
    for y in range(h):
        for x in range(w):
            if not walk[y][x]:
                q.append((x, y))
    seen = ~walk
    while q:
        x, y = q.popleft()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx]:
                    seen[ny][nx] = True
                    d[ny][nx] = d[y][x] + 1
                    q.append((nx, ny))
    return d


def straight_runs(walk):
    """Lengths of straight stretches of wall boundary."""
    h, w = walk.shape
    out = []
    for axis in (0, 1):
        m = walk if axis == 0 else walk.T
        H, W = m.shape
        for y in range(H - 1):
            run = 0
            for x in range(W):
                edge = m[y][x] != m[y + 1][x]
                if edge:
                    run += 1
                elif run:
                    out.append(run)
                    run = 0
            if run:
                out.append(run)
    return out


def measure(name):
    return measure_mask(name, walkable(name))


def measure_mask(name, walk):
    h, w = walk.shape
    d = dist_to_wall(walk)
    n = int(walk.sum())

    # chambers: local maxima of the distance transform, at least 2 from a wall
    peaks = []
    for y in range(h):
        for x in range(w):
            if not walk[y][x] or d[y][x] < 2:
                continue
            if all(d[y][x] >= d[y + dy][x + dx]
                   for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                   if 0 <= x + dx < w and 0 <= y + dy < h):
                if all(abs(x - px) + abs(y - py) > 3 for px, py, _ in peaks):
                    peaks.append((x, y, int(d[y][x])))

    widths = collections.Counter(min(2 * int(d[y][x]) - 1, 9)
                                 for y in range(h) for x in range(w) if walk[y][x])
    runs = straight_runs(walk)
    junc = sum(1 for y in range(h) for x in range(w) if walk[y][x] and
               sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                   if 0 <= x + dx < w and 0 <= y + dy < h and walk[y + dy][x + dx]) >= 3)
    # Wall masses. The first generator matched every other number here and
    # still looked wrong: its wall came out as scattered clumps where Mt Moon's
    # is a few big slabs. Nothing measured that, so nothing caught it.
    seen = np.zeros_like(walk, dtype=bool)
    masses = []
    for y in range(h):
        for x in range(w):
            if walk[y][x] or seen[y][x]:
                continue
            stack, cells = [(x, y)], []
            while stack:
                cx, cy = stack.pop()
                if not (0 <= cx < w and 0 <= cy < h) or seen[cy][cx] or walk[cy][cx]:
                    continue
                seen[cy][cx] = True
                cells.append((cx, cy))
                stack += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
            if len(cells) >= 2:
                masses.append(cells)
    fills = []
    for cells in masses:
        xs = [p[0] for p in cells]
        ys = [p[1] for p in cells]
        bb = (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)
        fills.append(len(cells) / bb)

    return dict(
        name=name, tiles=n,
        masses=1000.0 * len(masses) / (w * h),
        massfill=float(np.mean(fills)) if fills else 0.0,
        chambers=1000.0 * len(peaks) / max(n, 1),
        radius=float(np.mean([p[2] for p in peaks])) if peaks else 0.0,
        w12=100.0 * (widths[1] + widths[3]) / max(n, 1),
        w9=100.0 * widths[9] / max(n, 1),
        straight=float(np.mean(runs)) if runs else 0.0,
        straight9=float(np.percentile(runs, 90)) if runs else 0.0,
        junc=100.0 * junc / max(n, 1),
    )


def report(label, names):
    print("\n%s" % label)
    rows = []
    for nm in names:
        try:
            rows.append(measure(nm))
        except Exception as e:
            print("  %-22s skipped (%s)" % (nm, type(e).__name__))
    for r in rows:
        print("  %-22s %4d tiles  chambers/1k %5.1f (r~%.1f)  width1-3 %4.0f%%  "
              "straight %.1f (p90 %.0f)  junc %3.0f%%  masses/1k %4.1f fill %.2f"
              % (r["name"], r["tiles"], r["chambers"], r["radius"], r["w12"],
                 r["straight"], r["straight9"], r["junc"], r["masses"], r["massfill"]))
    if not rows:
        return
    print("  --")
    for k in ("chambers", "radius", "w12", "w9", "straight", "straight9",
              "junc", "masses", "massfill"):
        v = sorted(r[k] for r in rows)
        print("     %-10s %6.1f .. %-6.1f  median %.1f"
              % (k, v[0], v[-1], v[len(v) // 2]))


def ours():
    """The same numbers for our own maps, read out of mapdata.js."""
    import re
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import build_map as M
    txt = io.open(os.path.join(B.ROOT, "src", "game", "mapdata.js"),
                  encoding="utf-8").read()
    out = []
    for blk in re.finditer(r"^  (\w+): \{(.*?)^  \},", txt, re.S | re.M):
        aid, body = blk.group(1), blk.group(2)
        rows = re.findall(r'^      "([^"]*)",', body, re.M)
        if not rows:
            continue
        walk = np.array([[c not in M.SOLID for c in r] for r in rows])
        globals()["_WALK"] = walk
        out.append((aid, measure_mask(aid, walk)))
    print("\nOURS")
    for aid, r in out:
        print("  %-22s %4d tiles  chambers/1k %5.1f (r~%.1f)  width1-3 %4.0f%%  "
              "straight %.1f (p90 %.0f)  junc %3.0f%%  masses/1k %4.1f fill %.2f"
              % (aid, r["tiles"], r["chambers"], r["radius"], r["w12"],
                 r["straight"], r["straight9"], r["junc"], r["masses"], r["massfill"]))


if __name__ == "__main__":
    report("CAVES", CAVES)
    report("ROUTES AND FOREST", ROUTES)
    ours()
