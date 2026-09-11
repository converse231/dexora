"""Compose a cave the shape Game Freak composes one.  imported by build_map.py

Composition was the last thing here done by eye, and by eye it produced two maps
of horizontal stripes. tools/study_shape.py measured fourteen real caves to find
out what one is actually made of, and the answer is not what we had been drawing:

    a real cave is 97% one-to-three tiles wide      ours was 75%
    its wall turns every 2.7 tiles (p90 6)          ours ran 6.2 (p90 10)
    it has ~46 chambers per 1000 tiles, radius 2.3
    88% of its tiles offer three ways or more

So a cave is a dense net of narrow passages knotting together at small chambers -
not halls with walls between them. That is what this builds:

  1. chamber sites on a jittered grid, pitch 5-7. The grid is what keeps two
     parallel passages at least two tiles apart, which the tile rules need: a
     wall one tile thin has no 2x2 for its autotile to resolve against.
  2. carve each site into a small chamber, 3-5 across, sometimes bitten into.
  3. join them - a spanning tree first, so everything is reachable by
     construction, then extra edges until the loop density matches.
  4. every join is a STEPPED path, jogging every 1-3 tiles. This is the whole
     trick: it is what makes a wall turn every three tiles instead of running
     straight for ten.
  5. nibble the edges, but only where the wall left behind still has its 2x2.
  6. score it against the measured bands and try again. A map that would read as
     stripes cannot get out of the generator.

Nothing here invents a number. Every target below came off a real map.
"""

import random

# Measured in tools/study_shape.py and tools/study_layout.py over fourteen real
# caves. lo/hi are the range those maps occupy; a score of 0 is inside it.
CAVE = {
    "w12": (73.0, 100.0),        # % of tiles 1-3 wide
    "straight": (2.0, 4.8),      # mean straight run of wall boundary
    "straight9": (4.0, 13.0),    # its 90th percentile
    "chambers": (30.0, 72.0),    # local maxima per 1000 walkable tiles
    "junc": (70.0, 97.0),        # % of tiles with 3+ ways out
    "loops": (24.0, 81.0),       # independent cycles per 100 tiles
    "stripe": (0.83, 1.63),      # row runs / column runs
    "open": (0.20, 0.63),        # walkable share
    "dead": (0.0, 0.07),         # one-way-out tiles
    # A cave's wall is a few big slabs, not a spray of clumps. The first
    # generator matched everything else here and still looked wrong, because
    # nothing measured this.
    "masses": (1.0, 10.0),       # wall masses per 1000 tiles
    "massfill": (0.55, 0.85),    # how much of its bounding box a mass fills
}


# Ember Caldera's reference is Magma Hideout, not caves in general, and the two
# are not the same shape. Measured over its eight floors:
#
#     open      0.09 .. 0.30   ours was 0.42 - nearly twice as walkable
#     tight     0.67 .. 0.99   ours 0.74
#     straight  1.9  .. 3.5    ours 3.8
#     w12       95   .. 100    ours 96
#
# A volcano is a warren threaded between lava, not a set of terraces. The bands
# below are that map's, so the generator aims at it rather than at Mt Moon.
VOLCANO = dict(CAVE)
VOLCANO.update({
    "open": (0.22, 0.42),        # the lava eats into this afterwards
    "tight": (0.67, 0.99),
    "straight": (1.9, 3.5),
    "straight9": (4.0, 8.0),
    "w12": (94.0, 100.0),
    "junc": (55.0, 89.0),
    "chambers": (30.0, 55.0),
    "stripe": (0.94, 1.80),
    "turns": (0.14, 0.30),
    "loops": (35.0, 65.0),
    "dead": (0.01, 0.10),
})


# Pokemon Tower 2F-7F, measured. Only the layout half - the tower is not a
# warren of passages, so compose()'s carver is no use to it and there is nothing
# for the shape metrics to say. `score()` skips whatever a band leaves out.
#
# What this band is really recording is the graves: a floor that is 26-37%
# headstone is tight (0.74-0.94) and has real dead ends (0.03-0.10), where the
# same room swept clear is neither.
TOWER = {
    "stripe": (0.98, 1.61), "turns": (0.26, 0.49), "dead": (0.031, 0.100),
    "loops": (38.3, 53.4), "tight": (0.74, 0.94), "open": (0.17, 0.34),
}


def _sites(w, h, rng, pitch):
    """Chamber centres on a jittered grid.

    The grid is not decoration: it guarantees two passages are never adjacent,
    so no wall comes out one tile thin. Jitter is what stops it reading as one.
    """
    out = []
    for gy in range(2, h - 2, pitch):
        for gx in range(2, w - 2, pitch):
            x = min(w - 3, max(2, gx + rng.randint(-1, 1)))
            y = min(h - 3, max(2, gy + rng.randint(-1, 1)))
            out.append((x, y))
    return out


def _carve_chamber(g, x, y, rng):
    """A chamber 3-5 across, sometimes with a bite out of one corner."""
    rw, rh = rng.randint(1, 3), rng.randint(1, 2)
    for yy in range(y - rh, y + rh + 1):
        for xx in range(x - rw, x + rw + 1):
            if 1 <= xx < len(g[0]) - 1 and 1 <= yy < len(g) - 1:
                g[yy][xx] = True
    if rng.random() < 0.5:                      # bite a corner off
        bx = x + rng.choice((-rw, rw))
        by = y + rng.choice((-rh, rh))
        if 1 <= bx < len(g[0]) - 1 and 1 <= by < len(g) - 1:
            g[by][bx] = False


def _carve_path(g, a, b, rng):
    """A stepped path from a to b - the reason a wall turns every few tiles.

    A straight L gives two long runs. Jogging every 1-3 tiles gives the corner
    every 2.7 tiles that the real maps have.
    """
    (x, y), (bx, by) = a, b
    h, w = len(g), len(g[0])
    wide = rng.random() < 0.35                  # some passages are two across
    guard = 0
    while (x, y) != (bx, by) and guard < 400:
        guard += 1
        horiz = (x != bx) and (y == by or rng.random() < 0.5)
        # Jog length is the dial between a fence and a spray. Real cave walls
        # turn every 2.4-4.8 tiles, so a step of 2-5 rather than 1-3: the first
        # pass turned every other tile and read as noise.
        step = rng.randint(2, 5)
        for _ in range(step):
            if horiz and x != bx:
                x += 1 if bx > x else -1
            elif not horiz and y != by:
                y += 1 if by > y else -1
            else:
                break
            if 1 <= x < w - 1 and 1 <= y < h - 1:
                g[y][x] = True
                if wide:
                    ny, nx = (y + 1, x) if horiz else (y, x + 1)
                    if 1 <= nx < w - 1 and 1 <= ny < h - 1:
                        g[ny][nx] = True


def _thin_ok(g, x, y):
    """Would the wall at (x,y) still sit in some all-wall 2x2?"""
    h, w = len(g), len(g[0])
    for ox in (-1, 0):
        for oy in (-1, 0):
            if all(0 <= x + dx < w and 0 <= y + dy < h and not g[y + dy][x + dx]
                   for dx in (ox, ox + 1) for dy in (oy, oy + 1)):
                return True
    return False


def _repair_thin(g):
    """Every wall tile has to keep a 2x2, or its autotile has no inside.

    Carving is what breaks this, so the fix is to carve the offender too: a wall
    one tile thin between two passages was never wall, it was a seam.
    """
    h, w = len(g), len(g[0])
    for _ in range(6):
        bad = [(x, y) for y in range(1, h - 1) for x in range(1, w - 1)
               if not g[y][x] and not _thin_ok(g, x, y)]
        if not bad:
            break
        for x, y in bad:
            g[y][x] = True
    # the border is always wall, and always two thick
    for y in range(h):
        for x in range(w):
            if x < 2 or y < 2 or x >= w - 2 or y >= h - 2:
                g[y][x] = False


def _nibble(g, rng, rate):
    """Break up whatever straight runs are left, without thinning a wall."""
    h, w = len(g), len(g[0])
    cells = [(x, y) for y in range(2, h - 2) for x in range(2, w - 2) if not g[y][x]]
    rng.shuffle(cells)
    for x, y in cells:
        if rng.random() > rate:
            continue
        touching = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                       if g[y + dy][x + dx])
        if touching not in (1, 2):
            continue
        g[y][x] = True
        if not all(_thin_ok(g, xx, yy)
                   for yy in range(y - 1, y + 2) for xx in range(x - 1, x + 2)
                   if not g[yy][xx]):
            g[y][x] = False


def _connect(g, sites, rng, extra):
    """Spanning tree first - reachability by construction - then extra edges."""
    if not sites:
        return
    left = list(sites)
    joined = [left.pop(rng.randrange(len(left)))]
    while left:
        best = min(((i, j) for i in range(len(left)) for j in range(len(joined))),
                   key=lambda ij: abs(left[ij[0]][0] - joined[ij[1]][0])
                   + abs(left[ij[0]][1] - joined[ij[1]][1]))
        a = left.pop(best[0])
        _carve_path(g, a, joined[best[1]], rng)
        joined.append(a)
    for _ in range(extra):
        a, b = rng.sample(joined, 2)
        if abs(a[0] - b[0]) + abs(a[1] - b[1]) <= 12:
            _carve_path(g, a, b, rng)


def compose(w, h, seed, pitch=6, extra=None, nibble=0.10):
    """One candidate cave: a boolean grid, True where you can walk."""
    rng = random.Random(seed)
    g = [[False] * w for _ in range(h)]
    sites = _sites(w, h, rng, pitch)
    for x, y in sites:
        _carve_chamber(g, x, y, rng)
    _connect(g, sites, rng, len(sites) // 2 if extra is None else extra)
    _nibble(g, rng, nibble)
    _repair_thin(g)
    return g


def score(metrics, target=CAVE):
    """Distance outside the measured bands, plus a nudge towards their middle.

    Inside the band is the requirement; the middle is the preference. Scoring
    only the band lets the generator sit on an edge of every one of them at
    once, which is a map that is technically a cave and looks like none."""
    total = 0.0
    for k, (lo, hi) in target.items():
        v = metrics.get(k)
        if v is None:
            continue
        span = (hi - lo) or 1.0
        if v < lo:
            total += (lo - v) / span
        elif v > hi:
            total += (v - hi) / span
        else:
            total += 0.15 * abs(v - (lo + hi) / 2.0) / span
    return total


def best(w, h, tries=60, seed0=1, target=CAVE, **kw):
    """Generate and test. Returns (grid, seed, score, metrics)."""
    import numpy as np
    import study_shape as S
    import study_layout as L

    got = None
    for s in range(seed0, seed0 + tries):
        g = compose(w, h, s, **kw)
        mask = np.array(g)
        if not mask.any():
            continue
        m = S.measure_mask("candidate", mask)
        m.update(L.measure(mask))
        sc = score(m, target)
        if got is None or sc < got[2]:
            got = (g, s, sc, m)
        if sc == 0:
            break
    return got
