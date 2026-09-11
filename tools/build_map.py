"""Generate one map per area.  python tools/build_map.py

Writes src/game/mapdata.js — every area's tile grid and spawn point.
Encounter tables stay hand-written in game/biomes.js.

One map per area, not one world. A continuous world needs transition tiles
between biomes (shore to grass, ash to grass); without them every zone is a hard
rectangle butted against grass and the whole thing reads as a row of enclosures.
Separate maps remove the problem rather than paper over it, which is also how the
real games do it — every route is its own layout.

Shapes are organic, not rectangular. The path wanders instead of running
straight, and ground grows in ragged blobs instead of blocks. Both come from a
positional hash, so the result has variety but is identical on every run.

Legend
  T  tree (solid, 2 wide x >=3 tall)   .  grass          ,  tall grass
  f  flowers                           #  sand path      w  pond water (solid)
  b  pond bank (walkable)              r  rocky ground   R  rock wall
  L  ledge (hop south only)            F  forest canopy (3 wide, odd >=3 tall)
  c  canopy overhang (walk behind it)  D  wooden pier (walkable)
  r  cave floor  R  cave wall (3x3, >=2x2)  o  floor crater (2x2, x even)
  u  cave plateau  C  cliff below it (solid)  S  stairs set into the cliff
  W  cave pool (2x2 in a rock face, solid, fishable)
  p  plant floor  P  machine bank (3 rows, >=3 wide)  X  console in a bank
  B  barrels (1 wide, 1-2 tall, hung off a bank foot)
  Y  partition on end (1 wide, >=4 tall, hung from a wall at its top)
  m  volcano floor  M  volcanic rock, and the bank around a lava pool
  V  lava (>=3 wide)  l  ladder set into a rock face
  n  bridge over lava  N  bridge over water  (both >=2 across the way you walk)
  i  lower ice  j  raised ice shelf  I  ice wall  d  ice boulder
  k  water (solid)  K  waterfall  s  stairs between the two ice levels
  t  stalactite (2x2 blocks, in runs of an even width)
  h  tower floor  H  tower wall  G  a grave standing on the floor (1-5 in a row)
  A  a grave set into the wall face  y  the ward (3x3, walkable)

Every walkable tile can spawn a Pokemon, so the characters below are terrain
and nothing else - what they decide is where you can walk, not what you meet.
  m  ember ground · M volcanic rock    i  ice · I ice boulder
  p  plant floor  · P machinery        h  tower floor · H tower wall

Lowercase is walkable ground, uppercase the solid wall of the same biome.
"""

import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Outdoor areas are framed by trees; themed ones by their own wall, so an ember
# map is volcanic rock all the way to the edge rather than a patch on a lawn.
AREAS = [
    # Hand-drawn - see tall_grass() at the bottom of this file.
    dict(id="meadow", name="Tall Grass", drawn="tall_grass"),
    # Hand-drawn - see deep_woods() further down.
    dict(id="woods", name="Deep Woods", drawn="deep_woods"),
    # Several lakes, not one: water is solid and only the bank spawns, so a
    # single pond leaves a whole map with a 17-tile shoreline to pace.
    # Hand-drawn - see pond_shore() further down.
    dict(id="pond", name="Pond & Shore", drawn="pond_shore"),
    # No grass patches: there are no transition metatiles between grass and
    # rock, so the two met along hard rectangular edges that read as a bug.
    # Hand-drawn - see rock_ridge() further down.
    dict(id="ridge", name="Rock Ridge", drawn="rock_ridge"),
    # Indoors, so no sand path: a dirt track across a concrete factory floor
    # was the single most obviously wrong thing on these maps. `path=None`
    # leaves the floor uniform, which is exactly what the real Power Plant is.
    # Hand-drawn - see power_plant() further down.
    dict(id="power", name="Power Plant", drawn="power_plant"),
    # Mt Ember has rock faces rather than boulders, so its obstacles are placed
    # in 4x4 outcrops - a single face on its own reads as a floating slab.
    # Hand-drawn - see volcano() further down.
    dict(id="ember", name="Ember Caldera", drawn="volcano"),
    # Hand-drawn - see frost_hollow() further down.
    dict(id="frost", name="Frost Hollow", drawn="frost_hollow"),
    # Hand-drawn - see haunted_tower() further down.
    dict(id="tower", name="Haunted Tower", drawn="haunted_tower"),
]

SOLID = set("TwRMIPHLFCWXBEVkKdtYGA")


def h2(x, y, salt=0):
    v = (x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)
    v &= 0xFFFFFFFF
    v ^= v >> 13
    return (v * 2654435761) & 0xFFFFFFFF


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def build(spec):
    W, H, base, border = spec["w"], spec["h"], spec["base"], spec["border"]
    g = [[base] * W for _ in range(H)]

    # --- ragged frame ------------------------------------------------------
    # Thickness is decided per COLUMN PAIR, never per column: a tree needs its
    # partner at x^1, so an odd step in thickness would leave half trees.
    for xp in range(0, W, 2):
        top = 3 + h2(xp, 0, 1) % 3
        bot = 3 + h2(xp, 1, 2) % 3
        for x in (xp, xp + 1):
            if x >= W:
                continue
            for y in range(top):
                g[y][x] = border
            for y in range(H - bot, H):
                g[y][x] = border
    for y in range(H):
        left = 2 + h2(0, y // 3, 3) % 2
        right = 2 + h2(1, y // 3, 4) % 2
        for x in range(left * 2):
            g[y][x] = border
        for x in range(W - right * 2, W):
            g[y][x] = border

    # --- a path that wanders instead of running straight -------------------
    # Outdoor areas get the sand track; indoor ones (path=None) keep a uniform
    # floor, so the spawn lands on plain ground instead.
    path = spec.get("path", "#")
    px = W // 2 - 1
    if path:
        for y in range(H - 4, 3, -1):
            px = clamp(px, 6, W - 10)
            for x in range(px, px + 3):
                g[y][x] = path
            if h2(px, y, 5) % 100 < 34:
                px += 1 if h2(px, y, 6) % 2 else -1

    def free(x, y):
        return 0 <= x < W and 0 <= y < H and g[y][x] == base

    def blob(cx, cy, ch, r, salt):
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if d <= r and free(x, y) and h2(x, y, salt) % 100 < 100 - (d / r) * 68:
                    g[y][x] = ch

    # The pond autotile is a stone rim over water, so a lake wants square edges
    # and a walkable bank along its foot - the bank is where water spawns.
    nlakes = spec.get("lakes", 0)
    lcols = max(1, int(nlakes ** 0.5 + 0.5))
    for n in range(nlakes):
        gx, gy = n % lcols, n // lcols
        lw = 9 + h2(n, 5, 30) % 4
        lh = 4 + h2(n, 6, 31) % 2
        # The path wanders across the map, so a fixed footprint usually clashes
        # with it. Try a spread of nearby spots and take the first that fits.
        placed = False
        for t in range(24):
            lx = int(4 + (W - 10 - lw) * (gx + 0.5) / lcols) + (h2(n, t, 32) % 13 - 6)
            ly = int(4 + (H - 12 - lh) * (gy + 0.5) / max(1, -(-nlakes // lcols)))                 + (h2(t, n, 33) % 9 - 4)
            lx, ly = clamp(lx, 4, W - lw - 4), clamp(ly, 4, H - lh - 6)
            if all(free(x, y) for y in range(ly, ly + lh + 1)
                   for x in range(lx, lx + lw)):
                placed = True
                break
        if not placed:
            continue
        for y in range(ly, ly + lh):
            for x in range(lx, lx + lw):
                g[y][x] = "w"
        for x in range(lx, lx + lw):
            g[ly + lh][x] = "b"

    # Seeds go on a jittered grid, not straight from the hash: pure noise clumps
    # them into one corner and leaves half the map bare.
    for key, salt0 in (("blobs", 20), ("patches", 40)):
        if not spec.get(key):
            continue
        ch, count, r = spec[key]
        cols = max(1, int(count ** 0.5 + 0.5))
        rowsn = max(1, -(-count // cols))
        for n in range(count):
            gx, gy = n % cols, n // cols
            cx = int(5 + (W - 10) * (gx + 0.5) / cols) + h2(n, 1, salt0) % 7 - 3
            cy = int(4 + (H - 8) * (gy + 0.5) / rowsn) + h2(n, 2, salt0) % 7 - 3
            blob(clamp(cx, 4, W - 5), clamp(cy, 4, H - 5), ch, r, salt0 + n)

    # Trees last, and only where a whole 2x3 block fits on untouched ground.
    nclumps = spec.get("clumps", 0)
    ccols = max(1, int(nclumps ** 0.5 + 0.5))
    for n in range(nclumps):
        gx, gy = n % ccols, n // ccols
        cx = int(4 + (W - 10) * (gx + 0.5) / ccols) + h2(n, 3, 12) % 5 - 2
        cy = int(4 + (H - 10) * (gy + 0.5) / max(1, -(-nclumps // ccols))) + h2(n, 4, 13) % 5 - 2
        cx = clamp(cx, 4, W - 7) // 2 * 2
        cy = clamp(cy, 4, H - 8)
        if all(free(cx + dx, cy + dy) for dy in range(3) for dx in range(2)):
            for dy in range(3):
                for dx in range(2):
                    g[cy + dy][cx + dx] = "T"

    repair_trees(g, W, H, base)
    # The spawn is picked last, once nothing else can be dropped on top of it.
    # Prefer the path where there is one, otherwise plain ground, working up
    # from the bottom edge and taking the tile nearest the middle of that row.
    spawn = None
    want = path or base
    # A grass area gets landmarks wherever it is emptiest, the same as the
    # meadow does - the Flower Clearing measured 30% of its tiles within a step
    # of anything, where no real map drops below 39%.
    if base == "." and spec.get("fill"):
        fill_the_empty(g, want=spec["fill"])
        make_nooks(g, want=3)

    fill_pockets(g, border)

    for y in range(H - 4, 3, -1):
        xs = [x for x in range(W) if g[y][x] == want]
        if xs:
            spawn = (xs[len(xs) // 2], y)
            break
    if spawn is None:                             # no clear row: settle for any
        spawn = next((x, y) for y in range(H - 4, 3, -1) for x in range(W)
                     if g[y][x] not in SOLID)

    return ["".join(r) for r in g], spawn


def fill_pockets(g, solid, biggest=3):
    """Wall over any scrap of floor a scattered obstacle sealed off.

    The Haunted Tower shipped with two of these back when its gravestones were
    scattered by hash: single tiles of floor with a stone on all four sides,
    walkable and unreachable - 446 of its 448 tiles, which passed the 90% rule
    and was still map you could see and never stand on. A pocket this small was
    never a room; it is a gap the scatter happened to leave, so it becomes wall.
    (The tower is composed now, and the last `scatter` spec went with it; the
    blob passes below can still leave one.)

    Only scraps. A large island is a broken map, not a blemish, and the
    reachability check should fail rather than have it quietly filled in."""
    H, W = len(g), len(g[0])
    seen = set()
    for y in range(H):
        for x in range(W):
            if g[y][x] in SOLID or (x, y) in seen:
                continue
            stack, cells = [(x, y)], []
            while stack:
                cx, cy = stack.pop()
                if (not (0 <= cx < W and 0 <= cy < H) or (cx, cy) in seen
                        or g[cy][cx] in SOLID):
                    continue
                seen.add((cx, cy))
                cells.append((cx, cy))
                stack += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
            if len(cells) <= biggest:
                for cx, cy in cells:
                    g[cy][cx] = solid


def repair_trees(g, W, H, base):
    """The wandering path cuts through the frame and can orphan a tree - half a
    pair, or a run too short to draw a whole trunk. Rather than forbid that (and
    lose the path breaching the frame, which is what makes it read as a route
    entrance), drop whatever cannot be drawn properly. Repeats until stable,
    since removing one tile can shorten a neighbouring run."""
    changed = True
    while changed:
        changed = False
        for y in range(H):
            for x in range(W):
                if g[y][x] != "T":
                    continue
                if g[y][x ^ 1] != "T":
                    g[y][x] = base
                    changed = True
                    continue
                top, bot = y, y
                while top > 0 and g[top - 1][x] == "T":
                    top -= 1
                while bot < H - 1 and g[bot + 1][x] == "T":
                    bot += 1
                if bot - top + 1 < 3:
                    g[y][x] = base
                    changed = True


def check(area, rows, spawn):
    W, H = len(rows[0]), len(rows)
    at = lambda x, y: rows[y][x] if 0 <= x < W and 0 <= y < H else ""
    aid = area["id"]

    assert all(len(r) == W for r in rows), f"{aid}: ragged rows"
    assert rows[spawn[1]][spawn[0]] not in SOLID, f"{aid}: spawn is inside a wall"

    for y in range(H):
        for x in range(W):
            if rows[y][x] != "T":
                continue
            assert at(x ^ 1, y) == "T", f"{aid}: lone tree column at ({x},{y})"
            top, bot = y, y
            while at(x, top - 1) == "T":
                top -= 1
            while at(x, bot + 1) == "T":
                bot += 1
            assert bot - top + 1 >= 3, f"{aid}: tree run at ({x},{y}) is {bot-top+1} tall"

    for y in range(H):
        for x in range(W):
            if rows[y][x] != "F":
                continue
            left = x
            while at(left - 1, y) == "F":
                left -= 1
            right = x
            while at(right + 1, y) == "F":
                right += 1
            wide = right - left + 1
            assert wide % 3 == 0,                 f"{aid}: canopy run at ({x},{y}) is {wide} wide, not a multiple of 3"
            # A crown is keyed to its column across the 3-grid, so a run that
            # starts off the grid draws its left third as somebody's middle.
            assert left % 3 == 0,                 f"{aid}: canopy run at ({x},{y}) starts at x={left}, off the 3-column grid"
            top = y
            while at(x, top - 1) == "F":
                top -= 1
            bot = y
            while at(x, bot + 1) == "F":
                bot += 1
            tall = bot - top + 1
            # crown + (upper,lower) x n + trunk + shadow is always odd. Even
            # leaves a stray upper half stranded above the trunk - half a crown.
            assert tall >= 3 and tall % 2 == 1,                 f"{aid}: canopy column at ({x},{y}) is {tall} tall; needs an odd "                 f"number >= 3, or the row above the trunk is half a crown"
            # And the crown has to be somewhere you can see it.
            assert top == 0 or at(x, top - 1) in (".", ",", "#", "c", "b", "w"),                 f"{aid}: canopy column at ({x},{y}) is capped by "                 f"{at(x, top - 1)!r}, so its crown never draws"

    for y in range(H):
        for x in range(W):
            if rows[y][x] != "L":
                continue
            assert y + 1 < H and rows[y + 1][x] not in SOLID,                 f"{aid}: ledge at ({x},{y}) has nothing to land on"
            assert rows[y - 1][x] not in SOLID,                 f"{aid}: ledge at ({x},{y}) cannot be reached from above"
            run = 1
            xx = x - 1
            while at(xx, y) == "L":
                run += 1
                xx -= 1
            xx = x + 1
            while at(xx, y) == "L":
                run += 1
                xx += 1
            assert run >= 3, f"{aid}: ledge run at ({x},{y}) is {run} wide"

    # A machine bank is exactly three rows and at least three wide: two columns
    # are two end caps with no middle between them, and the rows are the plinth,
    # the machine top and its body. Two rows leaves the plinth on the floor,
    # where it reads as a walkable wall top.
    for y in range(H):
        for x in range(W):
            if rows[y][x] not in ("P", "X"):
                continue
            left = x
            while at(left - 1, y) in ("P", "X"):
                left -= 1
            right = x
            while at(right + 1, y) in ("P", "X"):
                right += 1
            top = y
            while at(x, top - 1) in ("P", "X"):
                top -= 1
            bot = y
            while at(x, bot + 1) in ("P", "X"):
                bot += 1
            assert right - left + 1 >= 3, \
                f"{aid}: bank at ({x},{y}) is {right-left+1} wide; it is all end cap"
            assert bot - top + 1 == 3, \
                f"{aid}: bank at ({x},{y}) is {bot-top+1} rows; a bank is three"
            if rows[y][x] == "X":
                assert y > top, \
                    f"{aid}: console at ({x},{y}) is on the plinth, not the machine"
                assert left < x < right, \
                    f"{aid}: console at ({x},{y}) is one of the bank's end caps"

    # A partition is one wide, at least four tall, and hangs from something.
    # A free-standing one would need a cap at its top, and the tileset has none:
    # every vertical run in the real Power Plant is attached at the top.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "Y":
                continue
            assert at(x - 1, y) != "Y" and at(x + 1, y) != "Y", \
                f"{aid}: partition at ({x},{y}) is two columns wide"
            top = y
            while at(x, top - 1) == "Y":
                top -= 1
            bot = y
            while at(x, bot + 1) == "Y":
                bot += 1
            assert bot - top + 1 >= 4, \
                f"{aid}: partition at ({x},{y}) is {bot-top+1} tall; four is the least"
            assert at(x, top - 1) in ("P", "X", "E", "Y"), \
                f"{aid}: partition at ({x},{top}) hangs from {at(x, top - 1)!r}, not a wall"

    # A barrel stack is one wide, one or two tall, and hangs off the foot of a
    # bank - the real map has no free-standing barrels and neither do we.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "B":
                continue
            top = y
            while at(x, top - 1) == "B":
                top -= 1
            bot = y
            while at(x, bot + 1) == "B":
                bot += 1
            assert bot - top + 1 <= 2, \
                f"{aid}: barrels at ({x},{y}) are {bot-top+1} tall; two is the most"
            assert at(x, top - 1) in ("P", "X"), \
                f"{aid}: barrels at ({x},{top}) stand on open floor, not against a bank"

    # A lone tile of raised shelf has no inside for the autotile to draw, so it
    # comes out as four corners and reads as a lump rather than as ground.
    # Anything thicker is fair game: Seafoam runs the shelf a single tile wide
    # down its corridors, and the 3x3 gives that a top edge and no bottom, which
    # is what the real map's own thin-run pieces are for and is close enough
    # once there is wall above and below it anyway. Boulders count as shelf -
    # one standing on it is a lump in the ice, not a hole in it.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "j":
                continue
            assert any(at(x + dx, y + dy) in ("j", "s", "d")
                       for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0))),                 f"{aid}: ice shelf at ({x},{y}) stands alone"

    # A staircase joins the two levels: shelf on one side of it, lower ice on
    # the other. One with the same ground at both ends is a step to nowhere,
    # which is what Seafoam's shelf-edge ramps would have become.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "s":
                continue
            near = {at(x, y - 1), at(x, y + 1), at(x - 1, y), at(x + 1, y)}
            assert "j" in near and "i" in near, \
                f"{aid}: stairs at ({x},{y}) do not join the shelf to the lower ice"

    # Water is at least two across - the bank is drawn on both sides of it, so
    # a single column is all bank and no river.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "k":
                continue
            wide = at(x - 1, y) in ("k", "K") or at(x + 1, y) in ("k", "K")
            tall = at(x, y - 1) in ("k", "K") or at(x, y + 1) in ("k", "K")
            assert wide or tall, f"{aid}: water at ({x},{y}) is a single tile"

    # A stalactite is 2 wide and 2 tall, and they hang shoulder to shoulder, so
    # a run has to be an even number of columns. An odd one leaves half a
    # stalactite at the end and puts the renderer's count along the run out of
    # phase for every tile after it.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "t":
                continue
            left = x
            while at(left - 1, y) == "t":
                left -= 1
            right = x
            while at(right + 1, y) == "t":
                right += 1
            assert (right - left + 1) % 2 == 0, \
                f"{aid}: stalactites at ({x},{y}) run {right-left+1} wide; that is half of one"
            top = y
            while at(x, top - 1) == "t":
                top -= 1
            bot = y
            while at(x, bot + 1) == "t":
                bot += 1
            assert bot - top + 1 == 2, \
                f"{aid}: stalactite at ({x},{y}) is {bot-top+1} tall; they are two"

    # A waterfall hangs from an opening in the rock and lands in the river.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "K":
                continue
            top = y
            while at(x, top - 1) == "K":
                top -= 1
            bot = y
            while at(x, bot + 1) == "K":
                bot += 1
            assert bot - top + 1 >= 3, \
                f"{aid}: waterfall at ({x},{y}) is {bot-top+1} tall; it needs a " \
                f"mouth, a lip and a foot"
            assert at(x, bot + 1) in ("k", "K"), \
                f"{aid}: the waterfall at ({x},{bot}) falls onto {at(x, bot + 1)!r}, not water"

    # Volcanic rock is a 3x3 autotile, so a mass one tile thin gets a top cap
    # and no bottom - a mass with a side missing. The bank around a lava pool is
    # exempt: it is one tile thick by definition and draws from the rim table
    # rather than the autotile, so the rule that keeps the autotile honest does
    # not apply to it.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "M":
                continue
            if any(at(x + dx, y + dy) == "V"
                   for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0))):
                continue
            ok = any(all(at(x + dx, y + dy) == "M"
                         for dx in (ox, ox + 1) for dy in (oy, oy + 1))
                     for ox in (-1, 0) for oy in (-1, 0))
            assert ok, f"{aid}: rock at ({x},{y}) is one tile thin"

    # A pool is sunk into rock: lava never meets open floor on its top or its
    # sides, only along its bottom edge, which is bare in the real map too.
    # Without that the rim has nowhere to go but the lava, and a pool under a
    # wall ends up with the wall's edge and its own stacked into a double lip.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "V":
                continue
            for dx, dy, where in ((0, -1, "above"), (-1, 0, "left of"), (1, 0, "right of")):
                c = at(x + dx, y + dy)
                assert c in ("V", "M", "n", ""), \
                    f"{aid}: lava at ({x},{y}) has {c!r} {where} it, not rock - no bank"

    # And a pool has to be worth calling one.
    seen = set()
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "V" or (x, y) in seen:
                continue
            # Walk through bridges as well as lava: a bridge floats on the pool
            # rather than dividing it, and counting the halves separately failed
            # a lake that a plank happened to cross.
            blob, walked, stack = set(), set(), [(x, y)]
            while stack:
                cx, cy = stack.pop()
                if (cx, cy) in walked or at(cx, cy) not in ("V", "n"):
                    continue
                walked.add((cx, cy))
                if at(cx, cy) == "V":
                    blob.add((cx, cy))
                stack += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
            seen |= blob
            xs = [q[0] for q in blob]
            ys = [q[1] for q in blob]
            w, h = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            assert w >= 3 and h >= 2, \
                f"{aid}: lava at ({x},{y}) is {w}x{h}; that is a puddle, not a pool"

    # A bridge is at least two across, and it has to actually cross: dry ground
    # on two opposite sides of it. One that only touches a shore at one end is
    # a jetty into a lava lake.
    seen = set()
    for y in range(H):
        for x in range(W):
            if rows[y][x] not in ("n", "N") or (x, y) in seen:
                continue
            ch = rows[y][x]
            blob, stack = set(), [(x, y)]
            while stack:
                cx, cy = stack.pop()
                if (cx, cy) in blob or at(cx, cy) != ch:
                    continue
                blob.add((cx, cy))
                stack += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
            seen |= blob
            xs = [p[0] for p in blob]
            ys = [p[1] for p in blob]
            assert min(max(xs) - min(xs), max(ys) - min(ys)) + 1 >= 2,                 f"{aid}: bridge at ({x},{y}) is one plank wide - no rail either side"
            sides = set()
            for cx, cy in blob:
                for dx, dy, side in ((0, -1, "N"), (0, 1, "S"), (-1, 0, "W"), (1, 0, "E")):
                    c = at(cx + dx, cy + dy)
                    if c and c != ch and c not in SOLID:
                        sides.add(side)
            assert ("N" in sides and "S" in sides) or ("W" in sides and "E" in sides),                 f"{aid}: bridge at ({x},{y}) does not reach dry rock at both ends"

    # A ladder is one column with somewhere to step on at the top and off at
    # the bottom - otherwise it is a painting of a ladder on a wall.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "l":
                continue
            assert at(x - 1, y) != "l" and at(x + 1, y) != "l",                 f"{aid}: ladder at ({x},{y}) is two columns wide"
            top = y
            while at(x, top - 1) == "l":
                top -= 1
            bot = y
            while at(x, bot + 1) == "l":
                bot += 1
            assert at(x, top - 1) not in SOLID and at(x, top - 1) != "",                 f"{aid}: ladder at ({x},{top}) starts in the rock"
            assert at(x, bot + 1) not in SOLID and at(x, bot + 1) != "",                 f"{aid}: ladder at ({x},{bot}) ends in the rock"

    # --- the Haunted Tower ------------------------------------------------
    # The wall shows its face only where there is floor below it, and the white
    # lip is drawn on the tile above that face. So a wall one tile thin over
    # floor has no lip to draw and the black void abuts the purple panel - a
    # room with its top edge missing, which looks like a hole rather than a
    # fault. Two thick everywhere is the whole requirement.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "H" or at(x, y + 1) in ("H", "A", ""):
                continue
            assert at(x, y - 1) in ("H", "A"),                 f"{aid}: the wall at ({x},{y}) is one tile thin - no lip above it"

    # A grave set into the wall needs wall above it and floor below: anywhere
    # else it draws the wall-set marker with nothing behind it, which reads as a
    # headstone floating in the black.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "A":
                continue
            assert at(x, y - 1) in ("H", "A"),                 f"{aid}: the wall grave at ({x},{y}) has no wall above it"
            assert at(x, y + 1) not in SOLID and at(x, y + 1) != "",                 f"{aid}: the wall grave at ({x},{y}) has no floor below it"

    # The ward is one 3x3 block and there is only ever one of it.
    ward = [(x, y) for y in range(H) for x in range(W) if rows[y][x] == "y"]
    if ward:
        xs = [p[0] for p in ward]
        ys = [p[1] for p in ward]
        assert (len(ward) == 9 and max(xs) - min(xs) == 2 and max(ys) - min(ys) == 2),             f"{aid}: the ward is {len(ward)} tiles, not one 3x3 block"

    # Graves are what makes a tower floor tight rather than a swept hall. The
    # real floors run 26-37% of the room; a band this wide is not a tuning knob,
    # it is there to catch the room coming out empty or bricked solid.
    room = sum(1 for r in rows for c in r if c in "hyGA")
    if room:
        graves = sum(1 for r in rows for c in r if c in "GA")
        assert 0.20 <= graves / room <= 0.40,             f"{aid}: graves are {100 * graves / room:.0f}% of the room, not 20-40%"

    # A cave wall is a 3x3 autotile, so a mass one tile thin gets a left cap
    # and no right one - a mass with a side missing. Two across and two down is
    # the least that resolves to a complete edge on every side.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "R":
                continue
            # A pool sunk into a rock face is part of the mass. A tuple, not
            # a string: at() gives "" off the map and "" in "RW" is True,
            # which walks the run off the edge and never comes back.
            rock = ("R", "W")
            left = x
            while at(left - 1, y) in rock:
                left -= 1
            right = x
            while at(right + 1, y) in rock:
                right += 1
            top = y
            while at(x, top - 1) in rock:
                top -= 1
            bot = y
            while at(x, bot + 1) in rock:
                bot += 1
            assert right - left + 1 >= 2, \
                f"{aid}: cave wall at ({x},{y}) is one tile wide; it has no right edge"
            assert bot - top + 1 >= 2, \
                f"{aid}: cave wall at ({x},{y}) is one tile tall; it has no bottom edge"

    # The floor crater is 2x2 on the even-column grid, like a tree.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "o":
                continue
            assert at(x ^ 1, y) == "o", \
                f"{aid}: crater at ({x},{y}) has no other half"
            top = y
            while at(x, top - 1) == "o":
                top -= 1
            bot = y
            while at(x, bot + 1) == "o":
                bot += 1
            assert bot - top + 1 == 2, \
                f"{aid}: crater at ({x},{y}) is {bot-top+1} tall; it is a 2x2 ring"

    # A pool is 2x2 on the even-column grid and belongs in a rock face, which
    # is the only place the real maps ever put one.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "W":
                continue
            assert at(x ^ 1, y) == "W",                 f"{aid}: pool at ({x},{y}) has no other half"
            top = y
            while at(x, top - 1) == "W":
                top -= 1
            bot = y
            while at(x, bot + 1) == "W":
                bot += 1
            assert bot - top + 1 == 2,                 f"{aid}: pool at ({x},{y}) is {bot-top+1} tall; it is a 2x2"
            assert at(x, top - 1) == "R",                 f"{aid}: pool at ({x},{y}) is not set into rock; {at(x, top-1)!r} is above it"

    # The upper level. Each of these is a thing that draws correctly and is
    # still wrong: a cliff belonging to no ledge, a ledge whose near edge drops
    # straight onto the floor with no cliff at all, and a staircase that does
    # not join the two.
    for y in range(H):
        for x in range(W):
            ch = rows[y][x]
            if ch == "C":
                assert at(x, y - 1) in ("u", "C"), \
                    f"{aid}: cliff at ({x},{y}) has no plateau above it"
            elif ch == "u":
                below = at(x, y + 1)
                assert below in ("u", "C", "S"), \
                    f"{aid}: plateau at ({x},{y}) drops onto {below!r}; it needs a cliff"
            elif ch == "S":
                assert at(x, y - 1) == "u", \
                    f"{aid}: stairs at ({x},{y}) lead up to {at(x, y - 1)!r}, not a plateau"
                assert at(x, y + 1) not in SOLID and at(x, y + 1) != "", \
                    f"{aid}: stairs at ({x},{y}) come down onto {at(x, y + 1)!r}"

    # A pier has to be walked on and walked off. Three wide is the minimum that
    # leaves any deck between the two rails, and a span with water at one end is
    # a bridge to nowhere - both look perfectly fine in a screenshot.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "D":
                continue
            top, bot = y, y
            while at(x, top - 1) == "D":
                top -= 1
            while at(x, bot + 1) == "D":
                bot += 1
            assert top > 0 and rows[top - 1][x] not in SOLID,                 f"{aid}: pier at ({x},{y}) has nothing to step on at its north end"
            assert bot + 1 < H and rows[bot + 1][x] not in SOLID,                 f"{aid}: pier at ({x},{y}) has nothing to step off at its south end"

    # The row under water is the shore, and only ground can carry it. Sand or a
    # tree there leaves the lake with no bank along that stretch.
    for y in range(H - 1):
        for x in range(W):
            if rows[y][x] != "w":
                continue
            below = rows[y + 1][x]
            assert below in ("w", "b", "D") or below in SOLID,                 f"{aid}: water at ({x},{y}) sits on {below!r}; the tile under "                 f"water has to be shore, more water, a pier, or rock"

    for ch, name in (("#", "path"), ("w", "pond"), ("D", "pier")):
        for y in range(H):
            for x in range(W):
                if rows[y][x] != ch:
                    continue
                run, xx = 1, x - 1
                while at(xx, y) == ch:
                    run += 1
                    xx -= 1
                xx = x + 1
                while at(xx, y) == ch:
                    run += 1
                    xx += 1
                assert run >= 3, f"{aid}: {name} run at ({x},{y}) is {run} wide"

    # Reachability is directed, because a ledge is one-way: you may only enter it
    # walking south, and doing so lands you on the far side. A map that traps you
    # on a terrace would otherwise sail through this check.
    def steps(x, y):
        out = []
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < W and 0 <= ny < H):
                continue
            if rows[ny][nx] == "L":
                if dy == 1 and 0 <= ny + 1 < H and rows[ny + 1][nx] not in SOLID:
                    out.append((nx, ny + 1))        # hop it, land beyond
                continue
            if rows[ny][nx] in SOLID:
                continue
            out.append((nx, ny))
        return out

    seen, stack = set(), [spawn]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        stack += steps(x, y)

    # Every walkable tile spawns now, so the thing to check is that the ground
    # is one connected place: a walled-off pocket is map you can see and never
    # stand on, which reads as a bug rather than as scenery.
    tiles = [(x, y) for y in range(H) for x in range(W) if rows[y][x] not in SOLID]
    got = [t for t in tiles if t in seen]
    assert len(got) >= 200, f"{aid}: only {len(got)} walkable tiles"
    assert len(got) >= 0.9 * len(tiles),         f"{aid}: {len(tiles) - len(got)} of {len(tiles)} walkable tiles are cut off"
    return len(got), len(tiles)


# ---------------------------------------------------------------- Tall Grass

"""The first map is drawn, not generated.

Everything else here scatters blobs on a jittered grid, which is fine for a
cave but reads as noise on a meadow: Route 1 has no organic shapes anywhere in
it. Its whole vocabulary is rectangles and straight lines -

  * a sand path four tiles wide that switchbacks down the map in a staircase,
    never wandering, always turning at a right angle;
  * tall grass in aligned rectangular fields set beside the path, never blobs;
  * ledges - short capped bars along the south edge of the higher ground, so a
    route reads as a stack of terraces and going down is quicker than coming
    back up;
  * clumps of trees and beds of flowers as landmarks in the open, and a lot of
    plain grass between them so the whole thing breathes.

So this is composed by hand out of those parts. The helpers below are a small
painting vocabulary rather than a generator: every rectangle in `tall_grass()`
is a decision.
"""


def rect(g, ch, x0, y0, x1, y1):
    """Fill an inclusive rectangle. The unit of Route 1's design language."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= y < len(g) and 0 <= x < len(g[0]):
                g[y][x] = ch


def onto_grass(g, ch, x0, y0, x1, y1):
    """Paint, but only over open grass.

    Decoration must never eat structure: a first pass had a tree clump standing
    in the middle of the path and a flower bed painted over half a ledge. The
    path and the ledges are the composition, so everything scattered afterwards
    asks permission."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= y < len(g) and 0 <= x < len(g[0]) and g[y][x] == ".":
                g[y][x] = ch


def flowers(g, *spots):
    """Individual flowers at chosen spots.

    Route 1 never plants a solid block of them - they come in loose handfuls of
    three to six, offset from one another, which is what stops a meadow reading
    as a flower farm. Filling a rectangle looked exactly like a farm."""
    for x, y in spots:
        onto_grass(g, "f", x, y, x, y)


def clump(g, x, y, tall=3):
    """One tree: two columns wide, `tall` rows down, on the even-column grid."""
    onto_grass(g, "T", x, y, x + 1, y + tall - 1)


def fill_the_empty(g, want, tall=3):
    """Stand trees in whatever is emptiest, until the map stops feeling bare.

    Route 1 keeps 52% of its tiles within a step of something solid, and no real
    map of any kind drops below 39%. Our meadow measured 32%: big open expanses
    with nothing near you, which is what "a field with nothing in it" is as a
    number.

    Placed by search rather than by eye, and the search is the point - the tile
    that is furthest from anything is exactly where a landmark is missing. Each
    one is checked before it is kept: it has to land on plain grass, sit on the
    even-column grid a tree pair needs, and leave the map connected."""
    H, W = len(g), len(g[0])

    def far():
        """Chebyshev distance from every grass tile to the nearest solid."""
        from collections import deque
        d = [[-1] * W for _ in range(H)]
        q = deque()
        for y in range(H):
            for x in range(W):
                if g[y][x] in SOLID:
                    d[y][x] = 0
                    q.append((x, y))
        while q:
            x, y = q.popleft()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and d[ny][nx] < 0:
                        d[ny][nx] = d[y][x] + 1
                        q.append((nx, ny))
        return d

    placed = 0
    for _ in range(want * 6):
        if placed >= want:
            break
        d = far()
        spots = sorted(((d[y][x], x, y) for y in range(2, H - tall - 2)
                        for x in range(2, W - 3)
                        if x % 2 == 0 and d[y][x] > 2
                        # Plain grass or tall - a tree standing in a field is
                        # Route 1's own vocabulary. The path and the ledges are
                        # the composition and stay untouched.
                        and all(g[y + dy][x + dx] in (".", ",")
                                for dx in (0, 1) for dy in range(tall))),
                       reverse=True)
        if not spots:
            break
        _, x, y = spots[0]
        was = [[g[y + dy][x + dx] for dx in (0, 1)] for dy in range(tall)]
        for dy in range(tall):
            for dx in (0, 1):
                g[y + dy][x + dx] = "T"
        if all_connected(g):
            placed += 1
        else:
            for dy in range(tall):
                for dx in (0, 1):
                    g[y + dy][x + dx] = was[dy][dx]
    return placed


def count_nooks(g):
    """Walkable tiles with exactly one walkable neighbour."""
    H, W = len(g), len(g[0])
    n = 0
    for y in range(H):
        for x in range(W):
            if g[y][x] in SOLID:
                continue
            if sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                   if 0 <= x + dx < W and 0 <= y + dy < H
                   and g[y + dy][x + dx] not in SOLID) == 1:
                n += 1
    return n


def make_nooks(g, want, tall=3):
    """Stand trees so that a corner of ground is left with one way in.

    Every real map has a few dead ends - the least of fourteen has 0.1% of its
    tiles - and ours had exactly none, which is the signature of a map built out
    of rectangles. It cannot be fixed by carving: every solid thing in a grass
    map is a tree two wide and three tall, or a pond three wide, so there is no
    single tile to take out of a wall.

    It can be fixed by adding. A tree standing three tiles from another leaves a
    nook between them, and that is how a real route gets its dead ends too. So
    try a clump everywhere it will fit and keep the ones that make a nook."""
    H, W = len(g), len(g[0])
    made = 0
    for _ in range(want * 4):
        if made >= want:
            break
        before = count_nooks(g)
        best = None
        for y in range(2, H - tall - 2):
            for x in range(2, W - 3, 2):
                if not all(g[y + dy][x + dx] in (".", ",")
                           for dx in (0, 1) for dy in range(tall)):
                    continue
                was = [[g[y + dy][x + dx] for dx in (0, 1)] for dy in range(tall)]
                for dy in range(tall):
                    for dx in (0, 1):
                        g[y + dy][x + dx] = "T"
                gain = count_nooks(g) - before
                ok = gain > 0 and all_connected(g)
                for dy in range(tall):
                    for dx in (0, 1):
                        g[y + dy][x + dx] = was[dy][dx]
                if ok and (best is None or gain > best[0]):
                    best = (gain, x, y)
        if not best:
            break
        _, x, y = best
        for dy in range(tall):
            for dx in (0, 1):
                g[y + dy][x + dx] = "T"
        made += 1
    return made


def ledge(g, x0, x1, y):
    """A capped bar, laid only across ground you could have walked on.

    Structure comes before decoration everywhere else here, but a ledge is both:
    it is structural, and it goes down last. Without this guard the first draft
    painted one straight through a canopy mass and sliced a tree column in half -
    caught by check(), but only after the fact. The run >= 3 assertion still
    fires if a guard trims one too far."""
    for x in range(x0, x1 + 1):
        if 0 <= y < len(g) and 0 <= x < len(g[0]) and g[y][x] in ".,":
            g[y][x] = "L"


def tall_grass():
    """Tall Grass: a vertical meadow of four terraces, path switchbacking up.

    32x40, of which 28x34 is playable - about two screens across and three and a
    half down, which is Route 1's proportions. Coordinates are absolute; the
    three-tile tree border means the interior runs x 2..29, y 3..36.

    Painted in layers, structure first: frame, then the fields, then the path
    over them, then the ledges that terrace it, and only then the landmarks and
    flowers, which fill whatever open grass is left."""
    W, H = 32, 40
    g = [["." for _ in range(W)] for _ in range(H)]

    # --- the frame -------------------------------------------------------
    # Three rows deep so a tree composes tip / body / base; two columns wide so
    # the pairs land on the even-column grid the renderer expects.
    rect(g, "T", 0, 0, W - 1, 2)
    rect(g, "T", 0, H - 3, W - 1, H - 1)
    rect(g, "T", 0, 0, 1, H - 1)
    rect(g, "T", W - 2, 0, W - 1, H - 1)

    # --- tall grass: five aligned fields, each one beside the path ---------
    rect(g, ",", 4, 4, 12, 8)        # north-west, above the top run
    rect(g, ",", 8, 15, 18, 19)      # the big middle field
    rect(g, ",", 25, 14, 29, 20)     # east strip, path to border
    rect(g, ",", 9, 26, 18, 29)      # south field, inside the last switchback
    rect(g, ",", 21, 27, 27, 33)     # south-east field

    # --- the pond, a landmark in the north-east ---------------------------
    # Water is solid and its own bottom row is the walkable bank, so the shore
    # is where water Pokémon are met.
    rect(g, "w", 22, 4, 27, 7)
    rect(g, "b", 22, 8, 27, 8)

    # --- the path: a double S, four tiles wide, only right angles ---------
    rect(g, "#", 6, 10, 24, 13)      # top run, west to east
    rect(g, "#", 21, 13, 24, 24)     # down the east side
    rect(g, "#", 5, 21, 24, 24)      # middle run, east to west
    rect(g, "#", 5, 24, 8, 33)       # down the west side
    rect(g, "#", 5, 30, 19, 33)      # bottom run, west to east
    rect(g, "#", 16, 33, 19, 36)     # the entrance you start on

    # --- ledges, on the south edge of each terrace ------------------------
    # Short and capped, always hanging off a horizontal run of the path, so a
    # hop south is the shortcut and walking round is the long way.
    ledge(g, 7, 14, 14)
    ledge(g, 9, 17, 25)
    ledge(g, 21, 26, 26)
    ledge(g, 6, 12, 34)

    # --- landmarks: tree clumps standing in the open ----------------------
    clump(g, 16, 4)                  # splits the northern meadow
    clump(g, 14, 7)                  # between the field and the pond
    clump(g, 4, 17)                  # west of the middle field
    clump(g, 2, 26)
    clump(g, 26, 10)                 # south of the pond
    clump(g, 22, 35)
    # ...and then wherever the map is emptiest, which is not somewhere an eye
    # is good at finding. Six by hand, the rest by measurement.
    fill_the_empty(g, want=24)
    make_nooks(g, want=3)            # ...and a few corners with one way in

    # --- flowers, in loose handfuls on the open grass ---------------------
    flowers(g, (2, 4), (3, 5), (2, 7), (4, 3), (3, 9))            # north-west
    flowers(g, (19, 5), (20, 7), (18, 8), (20, 3))                # beside the pond
    flowers(g, (26, 21), (28, 22), (26, 24), (27, 25), (29, 23))  # east bank
    flowers(g, (11, 35), (13, 34), (14, 36), (12, 36), (9, 34))   # by the entrance
    flowers(g, (2, 30), (3, 32), (2, 34), (4, 31))                # west verge
    flowers(g, (23, 9), (25, 21), (17, 20), (6, 20), (14, 9))     # scattered singles

    # Standing on the path at the southern entrance, facing up the route.
    return ["".join(r) for r in g], (17, 35)


def canopy(g, x0, y0, x1, y1):
    """A mass of forest trees.

    Three rules, all read off ViridianForest's own map.bin, all asserted by
    check() because breaking one shows up as a mangled canopy rather than as an
    error:

      3 wide     a crown spans three tiles, and every mass sits on the same
                 3-column grid, so masses that merge share their crowns.
      odd tall   a column is crown + (upper,lower) x n + trunk + shadow. The
                 crown is one whole crown and each pair is another, so the row
                 count is always odd. An even mass leaves half a crown stranded
                 above the trunk - the first draft of this map was even
                 throughout and every mass had one sliced row near its foot.
      >= 3       crown, trunk, shadow is the shortest tree there is.

    Heights are measured on the *merged* run, not on one call, so a mass that
    butts into the border is odd counted from the top of the border."""
    rect(g, "F", x0, y0, x1, y1)


def shore(g):
    """Every tile of open ground under water becomes the shore.

    A water body's rim runs round three of its sides on the water tiles
    themselves, and round the fourth on the land below it. Nothing about the
    map data says so, so this walks the grid at the end and marks that row -
    the same trick as overhang(), for the same reason: it is a fact about how
    the tile set is drawn, not a decision the map should have to remember."""
    for y in range(1, len(g)):
        for x in range(len(g[0])):
            if g[y][x] in ".,f" and g[y - 1][x] == "w":
                g[y][x] = "b"


def overhang(g):
    """Plain grass directly above a canopy becomes the overhang you walk behind.

    Viridian Forest finishes a mass either with a solid crown or with this: one
    walkable row whose canopy is drawn on the layer above the player, so a
    trainer passing along it goes behind the tree top. Run last, over open grass
    only, which is what keeps it honest - a mass butting against another mass,
    a clearing or a field keeps its solid crown instead, and no tile ever ends
    up drawing grass where sand belongs. Walkability is untouched either way:
    every tile this converts was already open ground."""
    for y in range(len(g) - 1):
        for x in range(len(g[0])):
            if g[y][x] == "." and g[y + 1][x] == "F":
                g[y][x] = "c"


def deep_woods():
    """Deep Woods: a maze of canopy, after Viridian Forest.

    The opposite composition to Tall Grass. A route is an open field with a path
    threading through it; a forest is the other way round - the trees are the
    terrain and the walkable part is what is left between them. Counting
    ViridianForest's own map.bin: tall grass is 20% of the whole floor, laid in
    solid rectangles, corridors between masses run two to four tiles wide, and
    sand appears as open clearings rather than as a path.

    36x45, of which 30x35 is playable. The odd height is not arbitrary - see
    canopy(). Every mass below is annotated with the run it actually forms once
    the border is counted in, because that run is what has to come out odd."""
    W, H = 36, 45
    g = [["." for _ in range(W)] for _ in range(H)]

    # --- the frame -------------------------------------------------------
    # Five deep, so an edge with nothing hanging off it still reads as two rows
    # of trees over a trunk: crown, upper, lower, trunk, shadow.
    canopy(g, 0, 0, W - 1, 4)             # runs 0..4   h=5
    canopy(g, 0, H - 5, W - 1, H - 1)     # runs 40..44 h=5
    canopy(g, 0, 0, 2, H - 1)             # runs 0..44  h=45
    canopy(g, W - 3, 0, W - 1, H - 1)     # runs 0..44  h=45

    # --- the maze: 3-wide walls, corridors of three between them ---------
    # Read as a spiral inward from the north-west, which is what keeps a forest
    # feeling like it doubles back on itself rather than like a grid of blocks.
    # The three that start at row 5 hang off the north border and merge with it.
    canopy(g, 6, 5, 8, 14)                # merges to 0..14  h=15
    canopy(g, 12, 5, 14, 12)              # merges to 0..12  h=13
    canopy(g, 24, 5, 26, 12)              # merges to 0..12  h=13

    canopy(g, 18, 9, 20, 21)              # h=13
    canopy(g, 30, 9, 32, 19)              # h=11
    canopy(g, 3, 17, 5, 27)               # h=11
    canopy(g, 9, 17, 14, 23)              # h=7,  six across
    canopy(g, 24, 17, 26, 25)             # h=9
    canopy(g, 18, 25, 20, 33)             # h=9
    canopy(g, 24, 29, 32, 33)             # h=5,  a long east-west wall
    canopy(g, 12, 27, 14, 37)             # h=11
    canopy(g, 6, 30, 8, 39)               # merges to 30..44 h=15
    canopy(g, 27, 36, 29, 39)             # merges to 36..44 h=9

    # --- clearings: open sand, wide enough to read as somewhere ----------
    # Viridian Forest's sand is a clearing, not a path - a broad rectangle you
    # walk out into. Placed in the corridors, never over a mass, because these
    # overwrite whatever is under them.
    rect(g, "#", 21, 5, 23, 10)
    rect(g, "#", 15, 23, 17, 26)
    rect(g, "#", 21, 35, 26, 39)
    rect(g, "#", 21, 33, 23, 34)

    # --- a pool in a clearing --------------------------------------------
    rect(g, "w", 28, 20, 32, 22)
    rect(g, "b", 28, 23, 32, 23)

    # --- tall grass: solid rectangles over whatever floor is left --------
    # A fifth of Viridian Forest's floor is tall grass. Painted with the guard
    # so a field can never eat a clearing or the pond it runs up against.
    onto_grass(g, ",", 9, 5, 11, 14)
    onto_grass(g, ",", 15, 5, 17, 8)
    onto_grass(g, ",", 27, 5, 29, 16)
    onto_grass(g, ",", 21, 11, 23, 16)
    onto_grass(g, ",", 6, 17, 8, 27)
    onto_grass(g, ",", 15, 17, 17, 22)
    onto_grass(g, ",", 21, 18, 23, 24)
    onto_grass(g, ",", 27, 24, 32, 28)
    onto_grass(g, ",", 3, 28, 11, 29)
    onto_grass(g, ",", 9, 33, 11, 39)
    onto_grass(g, ",", 15, 29, 17, 34)
    onto_grass(g, ",", 18, 35, 20, 39)
    onto_grass(g, ",", 30, 35, 32, 39)
    onto_grass(g, ",", 3, 35, 5, 39)

    # --- ledges, where a corridor doubles back ---------------------------
    ledge(g, 21, 23, 17)
    ledge(g, 6, 8, 28)
    ledge(g, 15, 17, 28)

    # --- flowers, in loose handfuls on whatever grass is left ------------
    flowers(g, (4, 7), (5, 9), (3, 11), (4, 14))
    flowers(g, (16, 10), (17, 13), (15, 15))
    flowers(g, (28, 25), (30, 26), (29, 34))
    flowers(g, (4, 36), (3, 38), (5, 33))
    flowers(g, (19, 22), (20, 23), (12, 25), (13, 24))

    shore(g)
    overhang(g)

    # Standing in the southern clearing, facing into the trees.

    make_nooks(g, want=3)            # a few corners with one way in
    return ["".join(r) for r in g], (22, 37)


def pier(g, x0, y0, x1, y1):
    """A stretch of wooden pier. Walkable, and drawn with a rail down each side.

    The deck is a 3x3 autotile like the path, so it only has to be at least
    three wide to get a rail on both sides with deck in between - two would be
    all rail. check() asserts that, and that a run has somewhere to step on and
    off at each end, because a pier you cannot leave is the one way this can be
    laid out wrong and still look right."""
    rect(g, "D", x0, y0, x1, y1)


def pond_shore():
    """Pond & Shore: one lake, walked around and walked across.

    The old version scattered four small lakes over a field, because water is
    solid and only its edge was worth walking - which gave a map with no
    subject. This one has a single subject and everything else serves it.

    The first draft of *this* had the fault at the other extreme: lake centred,
    island centred in the lake, one straight pier through both, sand ringing the
    whole thing at an even width. Every piece was drawn correctly and it read as
    a diagram. Symmetry is as good a way to look unconsidered as randomness is.

    So the composition is deliberately off-balance:

      * the lake is widest along its north edge and tapers to the south-west in
        right-angled steps, the way FireRed shapes water. It sits east of
        centre, which leaves the west a meadow rather than a margin.
      * the island is not in the middle of it, and the two piers do not line up.
        You arrive from the south beach, cross to the island, walk east past the
        tree standing on it, and take the second pier north. A dog-leg, so the
        crossing has three beats instead of one.
      * a headland reaches into the lake from the east shore, which gives the
        far bank a shape of its own and somewhere quiet to put flowers.
      * sand only where you walk: a strip along the north, a path down the west
        bank, the beach the pier lands on, and the lane south to where you
        start. The east shore is left as grass, so the water is not framed.
      * two ledges terrace the south meadow with a gap between them. The gap is
        the way up, the ledges are the way back down.

    Going round is always open, so the pier is a shortcut you choose, not a
    gate - which is the only reason a bridge is worth building on a small map.

    42x34, of which 38x28 is playable."""
    W, H = 42, 34
    g = [["." for _ in range(W)] for _ in range(H)]

    # --- the frame -------------------------------------------------------
    rect(g, "T", 0, 0, W - 1, 2)
    rect(g, "T", 0, H - 3, W - 1, H - 1)
    rect(g, "T", 0, 0, 1, H - 1)
    rect(g, "T", W - 2, 0, W - 1, H - 1)

    # --- the lake, in four steps ------------------------------------------
    # Water carries its rim on its top and sides only - the foot of a lake
    # simply meets the grass, the way FireRed draws it - so every step in the
    # outline has to be a right angle or the rim has nothing to turn on.
    rect(g, "w", 16, 5, 36, 7)
    rect(g, "w", 12, 8, 36, 12)
    rect(g, "w", 15, 13, 33, 15)
    rect(g, "w", 18, 16, 30, 18)

    # --- what stands in the water ----------------------------------------
    # Carved back out rather than drawn on top, so the lake stays one shape with
    # holes in it and the rim wraps each hole by itself.
    rect(g, ".", 20, 9, 29, 12)         # the island - bridges only
    rect(g, ".", 31, 13, 33, 15)        # a headland, off the east shore
    rect(g, ".", 33, 5, 36, 6)          # and a spur off the north, making a bay

    # --- the crossing, in two spans that do not line up ------------------
    # BRIDGES, not piers. These were `pier()` - the `D` deck - and they were
    # the wrong art for what they are: a pier is a JETTY, it runs out from
    # land and stops, and its outer ring is drawn to meet sand, so laying it
    # across open water fringed both spans in beach. Every tile of these two
    # runs has water on both sides and dry ground at each end, which is a
    # bridge, and the bridge planks are baked for exactly that.
    #
    # Two across, not three. Route 12's own bridge is two wide so the plank
    # set is a left half and a right half and nothing else; `bridgeId()` picks
    # by parity, so a third column comes out left/right/left and draws a rail
    # down the middle of its own deck.
    bridge(g, 26, 5, 27, 8, over="water")    # island -> north shore
    bridge(g, 21, 13, 22, 18, over="water")  # south beach -> island

    # --- sand, only where you walk ---------------------------------------
    rect(g, "#", 11, 3, 39, 4)          # the north shore
    rect(g, "#", 8, 3, 11, 22)          # down the west bank
    rect(g, "#", 8, 20, 30, 22)         # the beach the bridge lands on
    rect(g, "#", 19, 23, 22, 30)        # the lane south

    # --- trees standing in the open --------------------------------------
    clump(g, 2, 3)
    clump(g, 4, 12)
    clump(g, 2, 19)
    clump(g, 24, 10)                    # on the island, clear of its shore row
    clump(g, 10, 26)
    clump(g, 6, 28)
    clump(g, 28, 28)
    clump(g, 34, 22)
    clump(g, 34, 27)

    # --- tall grass, in rectangles of several sizes ----------------------
    onto_grass(g, ",", 2, 5, 7, 11)
    onto_grass(g, ",", 2, 14, 7, 18)
    onto_grass(g, ",", 12, 13, 14, 18)
    onto_grass(g, ",", 31, 16, 36, 20)
    onto_grass(g, ",", 37, 8, 39, 15)
    onto_grass(g, ",", 3, 23, 9, 27)
    onto_grass(g, ",", 12, 24, 17, 28)
    onto_grass(g, ",", 24, 23, 30, 27)
    onto_grass(g, ",", 33, 23, 39, 26)

    # --- ledges: the way back down, the gap between them the way up ------
    ledge(g, 12, 17, 23)
    ledge(g, 24, 30, 23)
    ledge(g, 3, 7, 21)

    # --- flowers, in loose handfuls on whatever grass is left ------------
    flowers(g, (3, 4), (5, 6), (2, 9), (4, 10))
    flowers(g, (6, 15), (3, 17), (7, 13))
    flowers(g, (32, 13), (31, 15), (33, 14))
    flowers(g, (12, 6), (13, 7), (14, 14))
    flowers(g, (21, 10), (27, 11), (23, 12), (28, 9))   # on the island
    flowers(g, (34, 5), (35, 6))                        # on the north spur
    flowers(g, (10, 24), (11, 29), (16, 30))
    flowers(g, (32, 29), (36, 24), (35, 30))

    shore(g)

    # Standing in the south lane, looking up it towards the water.

    make_nooks(g, want=3)            # a few corners with one way in
    return ["".join(r) for r in g], (20, 28)


def cave_wall(g, x0, y0, x1, y1):
    """A mass of cave rock.

    A 3x3 autotile like the path, so a mass of any size gets its rounded caps
    for free - but it has to be at least two across and two down, or a side has
    only its left cap and the mass draws with one edge missing. check() asserts
    it. Masses may butt into the border or into each other; the autotile reads
    the merged shape, so that is one bigger mass and not a seam."""
    rect(g, "R", x0, y0, x1, y1)


def crater(g, x, y):
    """A ring on the cave floor: 2x2, walkable, x even.

    Mt Moon's floor is a single tile everywhere - 1663 of its walkable tiles are
    the same id across three storeys - so all of its variety is what stands on
    the floor. Without these the cavern is a flat expanse."""
    rect(g, "o", x, y, x + 1, y + 1)


def pool(g, x, y):
    """A pool sunk into the foot of a rock face: 2x2, x even, solid.

    The top half replaces two tiles of the mass's bottom row and the bottom half
    sits on the floor, which is where every pool in Mt Moon and Victory Road is.
    Solid, like all this game's water - there is no Surf, so the rod is the only
    way into it, and you cast from the floor below."""
    rect(g, "W", x, y, x + 1, y + 1)


def plateau(g, x0, y0, x1, y1, stairs):
    """A ledge you walk on top of, and the way up onto it.

    Three rows of map data, not one: the surface, the cliff face below its near
    edge, and the staircase set into that face. Everything else around it has to
    be solid, because the stairs are the only way on - which is the whole point
    of a second level on a map with no elevation of its own. check() asserts all
    of it: a cliff with no plateau over it, a plateau with no cliff under it, or
    a staircase that does not have the upper level above and the floor below,
    are each a thing that draws perfectly and cannot be used."""
    rect(g, "u", x0, y0, x1, y1)
    rect(g, "C", x0, y1 + 1, x1, y1 + 1)
    for x in stairs:
        g[y1 + 1][x] = "S"

def join_islands(g, floor, rng, keep=()):
    """Carve until every walkable tile is reachable from every other.

    Stamping a set piece onto a generated cave can wall an arm of it off, and a
    map you can see but not stand on is the fault the reachability check exists
    to catch. Rather than hand-place a corridor after the fact, join whatever
    the stamping broke: find the islands, carve the smallest one to the biggest,
    repeat. compose's own path carver does the carving, so the joins jog like
    every other passage rather than arriving as a straight line.

    `keep` is what a passage may not be cut through. Without it the join across
    Ember's lake turned the lava into floor, and the map was whole because the
    lake was gone."""
    import compose as C
    H, W = len(g), len(g[0])
    for _ in range(24):
        seen, islands = set(), []
        for y in range(H):
            for x in range(W):
                if g[y][x] in SOLID or (x, y) in seen:
                    continue
                stack, cells = [(x, y)], []
                while stack:
                    cx, cy = stack.pop()
                    if (not (0 <= cx < W and 0 <= cy < H) or (cx, cy) in seen
                            or g[cy][cx] in SOLID):
                        continue
                    seen.add((cx, cy))
                    cells.append((cx, cy))
                    stack += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
                islands.append(cells)
        if len(islands) < 2:
            return
        islands.sort(key=len, reverse=True)
        main, other = islands[0], islands[1]
        a = min(other, key=lambda p: min(abs(p[0] - q[0]) + abs(p[1] - q[1])
                                        for q in main[::7]))
        b = min(main, key=lambda q: abs(a[0] - q[0]) + abs(a[1] - q[1]))
        mask = [[g[y][x] not in SOLID for x in range(W)] for y in range(H)]
        C._carve_path(mask, a, b, rng)
        for y in range(H):
            for x in range(W):
                if mask[y][x] and g[y][x] in SOLID and g[y][x] not in keep:
                    g[y][x] = floor


def thicken_walls(g, floor, wall):
    """No wall one tile thin: its 3x3 autotile has no inside to draw.

    A seam of wall between two passages was never wall. Carving it is the fix,
    the same as in compose - and doing it here as well means a stamped set piece
    cannot leave one behind."""
    H, W = len(g), len(g[0])
    for _ in range(6):
        bad = []
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if g[y][x] != wall:
                    continue
                # The bank around a lava pool is one tile thick by definition
                # and draws from the rim table, not the autotile - the same
                # exemption check() makes. Carving it away leaves lava meeting
                # open floor, which is what "no bank" means.
                if any(g[y + dy][x + dx] == "V"
                       for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0))):
                    continue
                ok = any(all(g[y + dy][x + dx] == wall
                             for dx in (ox, ox + 1) for dy in (oy, oy + 1))
                         for ox in (-1, 0) for oy in (-1, 0))
                if not ok:
                    bad.append((x, y))
        if not bad:
            return
        for x, y in bad:
            g[y][x] = floor


def rock_ridge():
    """Rock Ridge: a cavern on two levels, after Mt Moon and Victory Road.

    The floor is Mt Moon's: one tile, a thick border, and rock standing in a
    cavern, because 1663 of that map's walkable tiles are the same id and all of
    its variety is what stands on the floor rather than the floor itself.

    The upper level is Victory Road's. Its map.bin keeps the floor at elevation
    3 and its ledges at elevation 4, drawn from a different set - a surface with
    a rock lip along the far edge, a cliff face where the ground falls away, and
    a staircase set into that face.

    Two ledges here, and they are the reason the route works. The north-east
    ledge is a balcony over the whole east half: you can see it from the moment
    you come in, and the stairs onto it are at the far end, so it reads as
    somewhere to get to. The west ledge is smaller and its stairs face the
    entrance, so the first thing you learn is what a staircase looks like.

    Everything BETWEEN those is composed rather than drawn. The hand-drawn
    version measured 75% of its tiles one-to-three wide where fourteen real
    caves average 97%, with wall boundaries running 6.2 tiles straight where a
    real cave turns every 2.7 - which is to say it was halls with walls between
    them, and a cave is the other way round. tools/compose.py generates the
    connective tissue against those measurements and scores every candidate, so
    the passages come out narrow, knotted and turning; the ledges, the pond and
    the spring are then stamped in where they were always meant to go, and
    anything the stamping cut off is joined back on.

    42x32, of which 36x26 is playable."""
    import compose as C
    import random
    W, H = 42, 32

    # The seed is fixed, so the map is the same on every build - but it was
    # chosen by score, not by taste: compose tries 120 of them and keeps the
    # one closest to the middle of every measured band.
    mask, seed, sc, _ = C.best(W, H, tries=120, seed0=1, pitch=6)
    g = [["r" if mask[y][x] else "R" for x in range(W)] for y in range(H)]
    rng = random.Random(seed * 7919)

    # --- the border, three thick so it reads as rock and not as a line ---
    cave_wall(g, 0, 0, W - 1, 2)
    cave_wall(g, 0, H - 3, W - 1, H - 1)
    cave_wall(g, 0, 0, 2, H - 1)
    cave_wall(g, W - 3, 0, W - 1, H - 1)

    # --- the upper level, stamped on top ---------------------------------
    # Both ledges back onto the border, so the rock behind them is the map's
    # own wall and only their near edge needs a cliff of its own.
    cave_wall(g, 19, 0, 21, 10)         # the shoulder the balcony sits against
    plateau(g, 22, 3, 38, 9, [28])

    cave_wall(g, 3, 12, 14, 13)         # the rock the west ledge is cut into
    cave_wall(g, 13, 14, 14, 20)
    plateau(g, 3, 14, 12, 19, [7])

    # --- the pond ---------------------------------------------------------
    # The cave tilesets have no water of their own beyond the little spring, but
    # they do not need any: Seafoam Islands B4F is a cave and its lake is the
    # same primary autotile as the one outdoors, inner corners and all. What it
    # cannot borrow is the shore, because the tile that carries a water body's
    # bottom edge is grass - so the pond backs onto rock and is fished from its
    # north bank, where the rim is drawn on the water itself.
    rect(g, "w", 24, 23, 33, 26)
    cave_wall(g, 24, 27, 33, H - 1)
    rect(g, "r", 24, 22, 33, 22)        # the bank you fish from

    # --- put right whatever the stamping broke ---------------------------
    thicken_walls(g, "r", "R")
    join_islands(g, "r", rng)
    thicken_walls(g, "r", "R")

    # --- the spring, searched for rather than placed ---------------------
    # A pool is 2x2 on an even column and belongs in a rock face - the only
    # place the real maps ever put one - so it needs rock above it and floor
    # below to fish from. With a generated floor a fixed coordinate lands in
    # the open half the time, which is what the pool assertion caught.
    spring = None
    for y in range(5, H - 6):
        for x in range(4, W - 6, 2):
            if (all(g[y - 1][x + dx] == "R" for dx in (0, 1))
                    and all(g[y + dy][x + dx] == "r"
                            for dx in (0, 1) for dy in (0, 1, 2))):
                spring = (x, y)
                break
        if spring:
            break
    assert spring, "rock ridge: nowhere to sink a spring"
    pool(g, *spring)

    # --- craters, wherever the cave left room ----------------------------
    # Searched rather than placed: the floor is generated, so a fixed list of
    # coordinates would land half of them in rock. A crater is 2x2 on an even
    # column, and it needs open floor all round or it reads as a hole in a wall.
    made = 0
    for y in range(4, H - 6):
        for x in range(4, W - 6, 2):
            if made >= 5:
                break
            if all(g[y + dy][x + dx] == "r"
                   for dx in range(-1, 3) for dy in range(-1, 3)):
                crater(g, x, y)
                made += 1
    assert made >= 3, f"rock ridge: only {made} craters fitted"

    # Standing just inside the mouth, at the foot of the west stair.
    spawn = None
    for y in range(H - 5, 3, -1):
        for x in range(3, W - 3):
            if g[y][x] == "r" and g[y - 1][x] == "r":
                spawn = (x, y)
                break
        if spawn:
            break
    assert spawn, "rock ridge: nowhere to stand"
    return ["".join(r) for r in g], spawn


def lava(g, x0, y0, x1, y1):
    """A lava pool. Call lava_banks() once every pool is painted."""
    rect(g, "V", x0, y0, x1, y1)


def lava_banks(g):
    """Rock along the top and both sides of every pool.

    Magma Hideout never lets lava meet open floor except along a pool's bottom
    edge - the pool is sunk into rock, and it is the rock tiles beside it that
    carry the rim. Leave the bank out and the rim has to go on the lava, which
    means a pool under a wall gets the wall's own edge and the pool's edge
    stacked into a double lip. That is what "wonky" looked like.

    The bottom edge stays bare, in the real map and here, exactly as a FireRed
    lake's bottom edge is bare.

    One pass over the whole grid rather than a ring per pool: pools are drawn as
    overlapping rectangles to get a ragged outline, and a per-pool ring would
    paint rock over the next rectangle's lava."""
    H, W = len(g), len(g[0])
    at = lambda x, y: g[y][x] if 0 <= x < W and 0 <= y < H else ""
    bank = [(x, y) for y in range(H) for x in range(W)
            if at(x, y) not in ("V", "M", "n", "N")
            and (at(x, y + 1) == "V" or at(x - 1, y) == "V" or at(x + 1, y) == "V")]
    for x, y in bank:
        g[y][x] = "M"


def ladder(g, x, y0, y1):
    """A ladder up a rock face: one column, floor at the top and at the foot."""
    rect(g, "l", x, y0, x, y1)


def bridge(g, x0, y0, x1, y1, over="lava"):
    """A plank bridge. The character says what it crosses - `n` lava, `N` water -
    because the planks are baked over that, not layered over it at draw time.

    Two across the way you walk, which is the width Route 12's own bridge is:
    the planks lie crosswise and alternate, so one tile of width is half a
    bridge. Long enough to reach dry ground at both ends - check() asserts it
    actually crosses something."""
    rect(g, "n" if over == "lava" else "N", x0, y0, x1, y1)


def boulder(g, x, y):
    """A free-standing rock: a 2x2 of the wall character, which the wall autotile
    resolves into four corners and so into a complete little boulder. No new art
    - the tileset's own loose rocks turned out to be Team Magma's machinery."""
    rect(g, "M", x, y, x + 1, y + 1)


def punch_ladders(g, y0, y1, want, floor="m"):
    """Ladders through a band of rock, wherever there is floor on both sides.

    Searched, not placed: the two levels either side of the band are composed,
    so there is no telling in advance which column has floor above and below.
    Each one is kept only if it actually joins something - a ladder onto ground
    you could already reach is a decoration, not a way through."""
    W = len(g[0])
    made = []
    for x in range(2, W - 2):
        if len(made) >= want:
            break
        if any(abs(x - px) < 11 for px in made):
            continue
        if g[y0 - 1][x] != floor or g[y1 + 1][x] != floor:
            continue
        if any(g[y][x] != "M" for y in range(y0, y1 + 1)):
            continue
        before = all_connected(g)
        for y in range(y0, y1 + 1):
            g[y][x] = "l"
        if all_connected(g) and not before:
            made.append(x)
        elif before:                      # already one map: extra ways are fine
            made.append(x)
        else:
            for y in range(y0, y1 + 1):
                g[y][x] = floor if False else "M"
    return made


def ladders_clear(g):
    """Has every ladder still got somewhere to step on and off?

    A pool's bank is made out of the floor beside it, and that floor can be a
    ladder's landing - so this is checked when a pool is placed, and the pool is
    what gets put back, since the pool is what broke it."""
    H, W = len(g), len(g[0])
    for y in range(H):
        for x in range(W):
            if g[y][x] != "l":
                continue
            top = y
            while top > 0 and g[top - 1][x] == "l":
                top -= 1
            bot = y
            while bot < H - 1 and g[bot + 1][x] == "l":
                bot += 1
            if top == 0 or bot == H - 1:
                return False
            if g[top - 1][x] in SOLID or g[bot + 1][x] in SOLID:
                return False
    return True


def spans_clear(g):
    """Has every bridge still got dry ground at both ends?

    Same fault as ladders_clear, and found the same way: a pool sunk north of
    the caldera's causeway merged with the lake, drowned the approach, and left
    a span you could walk onto from the south and never leave. Nothing was
    disconnected by it - the bridge was still reachable - so only this catches
    it, and the pool is what gets put back."""
    H, W = len(g), len(g[0])
    seen = set()
    for y in range(H):
        for x in range(W):
            if g[y][x] not in ("n", "N") or (x, y) in seen:
                continue
            ch = g[y][x]
            blob, stack = set(), [(x, y)]
            while stack:
                cx, cy = stack.pop()
                if ((cx, cy) in blob or not (0 <= cx < W and 0 <= cy < H)
                        or g[cy][cx] != ch):
                    continue
                blob.add((cx, cy))
                stack += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
            seen |= blob
            sides = set()
            for cx, cy in blob:
                for dx, dy, side in ((0, -1, "N"), (0, 1, "S"),
                                     (-1, 0, "W"), (1, 0, "E")):
                    nx, ny = cx + dx, cy + dy
                    if (0 <= nx < W and 0 <= ny < H
                            and g[ny][nx] != ch and g[ny][nx] not in SOLID):
                        sides.add(side)
            if not (("N" in sides and "S" in sides)
                    or ("W" in sides and "E" in sides)):
                return False
    return True


def span_pool(g, x, y, w, h, floor="m"):
    """Lay a bridge over one pool, from the bank above it to the ground below.

    Returns True if it fitted. A pool in the middle of a warren is banked on
    three sides, and the bank is made out of the passage it was sitting in - so
    sinking one cuts the map in two, and the bridge is what puts it back. That
    is why the two are placed together rather than one after the other: on its
    own the pool fails the connectivity test and never gets placed at all, so
    the bridge never gets a pool to cross."""
    H, W = len(g), len(g[0])
    # Two across, never three. The plank set is baked from Route 12, whose own
    # bridge is two wide, so it holds a left half and a right half and nothing
    # else - a three-wide span alternates them left/right/left and draws a rail
    # down its own middle.
    for wide in (2,):
        for bx in range(x, x + w - wide + 1):
            # Stay off the map's own outer wall at both ends: a bridge that
            # starts in the border leaves a single row of rock above it, which
            # has no 2x2 for the autotile and no business being walked on.
            if y - 1 < 2 or y + h > H - 3:
                continue
            if any(g[y + h][bx + i] in SOLID for i in range(wide)):
                continue                       # nothing to land on below
            if any(g[y - 1][bx + i] not in ("M", floor) for i in range(wide)):
                continue
            # And there has to be ground to step onto at the top as well as the
            # bottom - a bridge that starts on the bank with rock above it is a
            # shelf, which is what check() means by "both ends".
            if any(g[y - 2][bx + i] in SOLID for i in range(wide)):
                continue
            rect(g, "n", bx, y - 1, bx + wide - 1, y + h - 1)
            return True
    return False


def place_lava(g, want, rng, floor="m", minw=5, minh=3, bridged=1):
    """Sink lava pools into whatever open ground will take one.

    A pool needs a rock bank on its top and both sides - Magma Hideout never
    lets lava meet open floor except along its bottom edge - and lava_banks()
    makes that bank out of the floor beside it, which can wall a passage off.
    So each pool is painted, banked and then checked, and put back if the map
    stopped being one place."""
    H, W = len(g), len(g[0])
    spots = []
    for h in range(minh + 2, minh - 1, -1):
        for w in range(minw + 4, minw - 1, -1):
            for y in range(2, H - h - 2):
                for x in range(2, W - w - 2):
                    if not all(g[y + dy][x + dx] == floor
                               for dy in range(h) for dx in range(w)):
                        continue
                    # A pool with floor above AND below can be bridged; one
                    # backed against the border or the band cannot, because a
                    # bridge needs somewhere to land on the far side. Prefer the
                    # ones that leave a crossing possible.
                    open_ns = (all(g[y - 1][x + dx] == floor for dx in range(w))
                               and all(g[y + h][x + dx] == floor for dx in range(w)))
                    spots.append((1 if open_ns else 0, w * h, x, y, w, h))
    spots.sort(reverse=True)

    made = 0
    for _, _area, x, y, w, h in spots:
        if made >= want:
            break
        if any(g[y + dy][x + dx] != floor for dy in range(h) for dx in range(w)):
            continue                      # a previous pool took this ground
        snap = [row[:] for row in g]
        rect(g, "V", x, y, x + w - 1, y + h - 1)
        # Take a bite out of two of the four corners. Magma Hideout has no
        # rectangular lava anywhere - its pools are blobs - and a stamped
        # rectangle beside the hand-carved lake read as a different substance.
        # Corners only, so the bounding box check() measures is untouched.
        for cx, cy in rng.sample([(x, y), (x + w - 1, y),
                                  (x, y + h - 1), (x + w - 1, y + h - 1)], 2):
            g[cy][cx] = floor
        lava_banks(g)
        big = sum(1 for r in g for c in r if c not in SOLID) >= 240
        ok = all_connected(g) and ladders_clear(g) and spans_clear(g) and big
        if not ok and bridged > 0 and big and span_pool(g, x, y, w, h, floor):
            # The pool cut the map and the bridge put it back.
            ok = all_connected(g) and ladders_clear(g) and spans_clear(g)
            if ok:
                bridged -= 1
        if not ok:
            for yy in range(H):
                g[yy] = snap[yy]
            continue
        made += 1
        # And a bridge is worth having even when nothing needs repairing -
        # crossing the lava is the point of the pool. Only the first few, so
        # the map keeps some pools you have to walk around.
        if bridged > 0:
            before = [row[:] for row in g]
            if (span_pool(g, x, y, w, h, floor) and all_connected(g)
                    and ladders_clear(g) and spans_clear(g)):
                bridged -= 1
            else:
                for yy in range(H):
                    g[yy] = before[yy]
    return made


def scatter_boulders(g, want, floor="m"):
    """Free-standing rock, 2x2, wherever there is room for one to stand."""
    H, W = len(g), len(g[0])
    made = 0
    for y in range(3, H - 4):
        for x in range(3, W - 4):
            if made >= want:
                return made
            if not all(g[y + dy][x + dx] == floor
                       for dy in range(-1, 3) for dx in range(-1, 3)):
                continue
            snap = [row[:] for row in g]
            boulder(g, x, y)
            if all_connected(g):
                made += 1
            else:
                for yy in range(H):
                    g[yy] = snap[yy]
    return made


def volcano():
    """Ember Caldera: a warren of rock threaded between lava, after Magma Hideout.

    The first version was four terraces stacked up the map. That reads as a
    diagram of a volcano, and measuring the reference said so plainly: Magma
    Hideout is 23% walkable across its eight floors and ours was 42% - nearly
    twice as open - with wall boundaries running 3.8 tiles straight against its
    2.8. A volcano cave is a warren you thread, not a set of shelves.

    So the ground is composed rather than drawn, against that map's own numbers
    (compose.VOLCANO). Two of them: a gallery across the north and the caldera
    below it, each composed on its own so each is connected by construction,
    with two rows of rock between them for the ladders to go through. That keeps
    the thing the terraces were for - somewhere above you that you have to find
    the way up to - without paying for it in open floor.

    Everything after that is searched for rather than placed, because the ground
    is generated and a fixed coordinate would land in rock: the ladders go where
    there is floor on both sides of the band, the pools where there is room to
    sink one, the causeway in the column that reaches shore on both sides for
    the least rock cut, and each is put back if it stops the map being one
    place. The lake alone is placed rather than found - see below.

    44x32."""
    import compose as C
    import random
    W, H = 44, 32
    BAND = (9, 10)               # the rock the ladders climb through

    top, tseed, _, _ = C.best(W, BAND[1] + 1, tries=90, pitch=6, target=C.VOLCANO)
    low, lseed, _, _ = C.best(W, H - BAND[0], tries=90, pitch=7, target=C.VOLCANO)

    g = [["M"] * W for _ in range(H)]
    for y in range(BAND[0]):
        for x in range(W):
            if top[y][x]:
                g[y][x] = "m"
    for y in range(BAND[1] + 1, H):
        for x in range(W):
            if low[y - BAND[0]][x]:
                g[y][x] = "m"

    rng = random.Random(tseed * 104729 + lseed)
    thicken_walls(g, "m", "M")

    made = punch_ladders(g, BAND[0], BAND[1], want=3)
    assert len(made) >= 2, f"ember: only {len(made)} ladders would fit"

    # --- the great lake, carved rather than found -------------------------
    # A warren has no clearing big enough for a lake, and searching for one only
    # ever turned up ponds - which left the map with no centre and its bridge
    # reduced to a stub at a pond's edge. The lake is the point of a volcano, so
    # it is cut out of the warren on purpose. Everything else is still found.
    # Sized by test, not by eye: wider than this and the warren either side of
    # it is too thin to get round.
    LX0, LY0, LX1, LY1 = 11, 17, 29, 22
    rect(g, "m", LX0 - 1, LY0 - 2, LX1 + 1, LY1 + 2)

    # The shore wanders. Magma Hideout's lake is a blob whose edge steps in and
    # out every tile or two, and a rectangle with a lobe stuck on each side -
    # which is what this was - still reads as a rectangle with a lobe stuck on
    # each side. So each column carries its own top and bottom, moved at most
    # one tile from the column before it, and the last two columns at each end
    # are pulled in so the lake closes rather than ending on a wall.
    up, dn = LY0, LY1
    for x in range(LX0, LX1 + 1):
        up = max(LY0 - 1, min(LY0 + 2, up + rng.choice((-1, 0, 0, 1))))
        dn = min(LY1 + 1, max(LY1 - 2, dn + rng.choice((-1, 0, 0, 1))))
        pull = max(0, 2 - min(x - LX0, LX1 - x))
        for y in range(up + pull, dn - pull + 1):
            g[y][x] = "V"
    lava_banks(g)

    # The causeway is laid before anything is tested, because the lake cuts the
    # warren in more places than one crossing can put back. Cross first, join
    # the rest afterwards - around the lake and never through it, which is what
    # join_islands' `keep` is for.
    #
    # Only the lava gets planks. Bridging the whole way down laid planking over
    # the rock bank as well, which reads as a pier built on dry land, and left
    # check() with no dry ground at either end of the span to find. So the
    # approach is cut as floor through the bank until it meets ground you could
    # already stand on, and the planks span only what is molten.
    # Which column carries it is searched for, not chosen: the shore is composed,
    # so a fixed one lands in a wall - column 19 did, and drove its shaft clean
    # through the south wall of the map looking for ground. Take the crossing
    # that cuts the least rock, and the most central of those.
    CW = 2                            # see span_pool: the plank set is two wide
    best_x, best_n, best_s = None, 0, 0
    for CX in range(LX0 + 1, LX1 - CW):
        n = LY0 - 1
        while n > 2 and all(g[n][CX + i] in SOLID for i in range(CW)):
            n -= 1
        t = LY1 + 1
        while t < H - 3 and all(g[t][CX + i] in SOLID for i in range(CW)):
            t += 1
        if n <= 2 or t >= H - 3:
            continue                      # ran off the map instead of landing
        rank = (t - n, abs(CX + CW / 2 - W / 2))
        if best_x is None or rank < best_rank:
            best_x, best_n, best_s, best_rank = CX, n, t, rank
    assert best_x is not None, "ember: nowhere to bring the causeway ashore"
    # Both columns take the same character on every row. Deciding it per tile
    # put a single plank alongside a bare floor tile wherever the shore was
    # ragged - a bridge one plank wide, which is the fault check() names, and it
    # reads as a broken step. So find the molten stretch across both columns and
    # plank the whole of it, approach included.
    wet = [y for y in range(best_n + 1, best_s)
           if any(g[y][best_x + i] == "V" for i in range(CW))]
    assert wet, "ember: the causeway crosses nothing"
    for y in range(best_n + 1, best_s):
        ch = "n" if wet[0] <= y <= wet[-1] else "m"
        for i in range(CW):
            g[y][best_x + i] = ch

    # Banking can wall off the passage a join just cut, so join and bank until
    # it settles rather than assuming one pass of each is enough.
    for _ in range(4):
        join_islands(g, "m", rng, keep=("V", "n"))
        lava_banks(g)
        if all_connected(g):
            break
    assert all_connected(g), "ember: the caldera would not join up"

    # More pools for texture. There was a pass that hunted for anywhere a bridge
    # would save a walk; it put a second crossing six tiles from the causeway and
    # parallel to it over the same lake, and the middle of the map read as
    # scaffolding, so it is gone. A pool that cuts the warren in two still gets
    # its repair span from place_lava.
    pools = place_lava(g, want=3, rng=rng, bridged=1)
    assert pools >= 1, f"ember: only {pools} more lava pools would fit"
    scatter_boulders(g, want=8)
    thicken_walls(g, "m", "M")

    spawn = None
    for y in range(H - 3, BAND[1], -1):
        for x in range(2, W - 2):
            if g[y][x] == "m" and g[y - 1][x] == "m":
                spawn = (x, y)
                break
        if spawn:
            break
    assert spawn, "ember: nowhere to stand"
    return ["".join(r) for r in g], spawn


def haunted_tower():
    """Haunted Tower: one square floor of Lavender Town's graveyard.

    Pokemon Tower's seven floors are ovals, and the oval is the one thing here
    deliberately not copied. A round room on a square grid spends its whole
    silhouette on stepped diagonals, and every step wants a wall piece the
    tileset only carries for the curve Game Freak actually drew - the first
    attempt at one left white blocks hanging off both top corners. So the room
    is square. Everything inside it is the real thing:

      - graves in rows, 1-5 across and one deep. That is the shape, measured
        rather than eyeballed: of 240 vertical runs of headstone across all
        seven floors, 172 are a single tile, and the commonest plot bounding
        boxes are 1x1, 2x1, 3x1 and 3x2.
      - graves at about 30% of the room, which is the real range (26-37%) and
        is what makes a tower floor tight (0.74-0.94) where a swept hall is not.
      - a few graves set into the wall face itself (`A`), which is what breaks
        the top wall out of being one long identical run - Game Freak's own
        device, not an invention.
      - the ward: 5F's cyan sigil, 3x3 and walkable, so the room has a centre
        to turn about and it costs no floor.

    The wall needs no corner pieces, because of how the tileset is built: a wall
    tile shows its face only where there is floor below it. So a square room
    draws purple across its top and flat black everywhere else - which is
    exactly what the real oval does, and why its lower half has no purple in it.

    Generate-and-test against compose.TOWER, the band measured off 2F-7F
    themselves. 34x28."""
    import random
    import compose as C
    import numpy as np
    import study_layout as SL

    W, H = 34, 28
    RX0, RY0, RX1, RY1 = 4, 5, 29, 21          # the room: 26 x 17
    WX, WY = (RX0 + RX1) // 2 - 1, (RY0 + RY1) // 2 - 1

    def lay(seed):
        rng = random.Random(seed)
        g = [["H"] * W for _ in range(H)]
        for y in range(RY0, RY1 + 1):
            for x in range(RX0, RX1 + 1):
                # The two bottom corners step in. The top ones cannot: that is
                # where the wall shows its face, and a step there is the one
                # shape this tileset has no piece for.
                if min(x - RX0, RX1 - x) + (RY1 - y) < 2:
                    continue
                g[y][x] = "h"

        ward = {(WX + dx, WY + dy) for dx in range(3) for dy in range(3)}
        for x, y in ward:
            g[y][x] = "y"
        # A clear tile of floor all round it, so the sigil reads as a sigil
        # rather than as the gap left between two grave plots.
        clear = {(WX + dx, WY + dy) for dx in range(-1, 4) for dy in range(-1, 4)}

        # One or two clear columns down the room. Rows of graves on their own
        # give a floor that is all lane and no cross-lane - stripe 1.63 against
        # a real ceiling of 1.61 - and a vertical aisle is how 2F answers that:
        # three clear columns run between its two big grave masses.
        lanes = set()
        for _ in range(rng.randint(0, 3)):
            ax = rng.randint(RX0 + 3, RX1 - 3)
            lanes |= {(ax, yy) for yy in range(RY0, RY1 + 1)}

        def plant(cells, keep=()):
            if all(c not in clear and c not in keep and 0 <= c[0] < W
                   and 0 <= c[1] < H and g[c[1]][c[0]] == "h" for c in cells):
                for cx, cy in cells:
                    g[cy][cx] = "G"
                return True
            return False

        # A row of graves, then an aisle. A plot two deep runs into the aisle
        # below it and meets the next row, which is how the big grave masses on
        # 2F and 6F come about - they are not placed, they are what rows do when
        # one of them happens to be deep. The row pitch is jittered because a
        # fixed one leaves every vertical gap the same and the floor measures
        # 1.63 stripe against the real 0.98-1.61: all lane, no cross-lane.
        y = RY0 + 1
        while y < RY1:
            x = RX0 + rng.randint(0, 3)
            while x <= RX1:
                n = rng.choice((1, 2, 2, 3, 3, 3, 4, 5, 5, 7))
                deep = 2 if rng.random() < 0.30 else 1
                plant([(x + i, y + d) for i in range(n) for d in range(deep)], lanes)
                x += n + rng.randint(1, 4)
            y += rng.choice((2, 2, 3))

        # Stubs hung off the rows, one wide and two or three tall. Rows alone
        # give a floor with no pockets in it - dead 0.019 against a real
        # 0.031-0.100 - because you can always walk round a free-standing row.
        # A stub turns two rows into a U, and a U is where a dead end lives.
        for _ in range(rng.randint(8, 16)):
            x = rng.randint(RX0, RX1)
            y = rng.randint(RY0 + 1, RY1 - 3)
            if g[y - 1][x] == "G" or g[y][x] == "G" or y == RY0 + 1:
                plant([(x, y + d) for d in range(rng.randint(2, 3))])

        # Alcoves: one floor tile walled on three sides. That IS a dead end, and
        # rows and stubs together still only made 0.026 of them against a real
        # 0.031-0.100 - whatever those two build, you can walk round it.
        for _ in range(rng.randint(4, 9)):
            x, y = rng.randint(RX0 + 1, RX1 - 1), rng.randint(RY0 + 1, RY1 - 1)
            if (x, y) in clear or g[y][x] != "h":
                continue
            sides = [(x, y - 1), (x, y + 1), (x - 1, y), (x + 1, y)]
            rng.shuffle(sides)
            plant(sides[:3])

        # Graves set into the wall face - the bottom row of the wall, the only
        # row of it you can see.
        x = RX0 + rng.randint(1, 5)
        while x < RX1 - 4:
            n = rng.randint(3, 5)
            for i in range(n):
                g[RY0 - 1][x + i] = "A"
            x += n + rng.randint(4, 9)

        return g

    best, bg, bm = None, None, None
    for seed in range(1, 400):
        g = lay(seed)
        if not all_connected(g):
            continue
        walk = np.array([[c not in SOLID for c in row] for row in g])
        m = SL.measure(walk)
        # Inside the band first, distance second. compose.score() alone prefers
        # sitting 0.02 outside a band to sitting at its edge inside one - 0.03
        # of penalty against the 0.075 its middle-nudge charges - which is fine
        # for a cave with nine wide bands and wrong here, where the tower's six
        # are narrow and being outside one is the whole thing the measurement
        # exists to catch.
        rank = (0 if all(lo <= m[k] <= hi for k, (lo, hi) in C.TOWER.items())
                else 1, C.score(m, C.TOWER))
        if best is None or rank < best:
            best, bg, bm = rank, g, m
    assert bg is not None, "tower: no floor plan held together"
    assert best[0] == 0, "tower: nothing landed inside the band - %s" % (bm,)
    g = bg

    stones = sum(1 for r in g for c in r if c == "G")
    room = sum(1 for r in g for c in r if c in "hyG")
    print("   tower  %d graves of %d room tiles (%.0f%%)  score %.2f"
          % (stones, room, 100.0 * stones / room, best[1]))

    spawn = None
    for y in range(RY1, RY0, -1):
        for x in range(RX0 + 2, RX1 - 1):
            if g[y][x] == "h" and g[y - 1][x] == "h":
                spawn = (x, y)
                break
        if spawn:
            break
    assert spawn, "tower: nowhere to stand"
    return ["".join(r) for r in g], spawn


def seafoam_b3f():
    """Seafoam Islands B3F, read out of its own map.bin. Returns (rows, ids).

    Two channels, because a copy needs both. The characters are ours - they are
    what the engine walks on and spawns in - and they come from the map's own
    collision and elevation bits, never an eye: elevation 3 is the lower ice, 4
    the raised shelf, 1 the water, 0 the striped step.

    The ids are the real map's, and they are why this exists. Put through our
    autotiles the characters alone drew 397 of the 836 cells differently from
    the game: Seafoam varies its wall among half a dozen interchangeable pieces
    that a 3x3 has no way to express, and picks its floor and shelf variants the
    same way. Rules are how you draw a map you invented; a map you copied should
    be copied.

    What changes on the way in:
      * Ladders and boulder holes become the ground they stood in, and lose
        their id with it. They lead to B4F there and nowhere here, and a way
        through that is not one is the fault the cave mouths in Ember Caldera
        had.
      * Elevation 0 is three different things in Seafoam - the step, shelf edges
        doing duty as a ramp, and the snow fringe outside the cave - and only
        the first is a staircase.
      * Below the cave the real map is border fill you can see and never reach,
        so it is wall here, except the river, which still runs off the edge.
    """
    import numpy as np
    import build_assets as BA

    ROWS = 22
    LADDERS = {5, 14, 15, 22, 23, 45, 46, 47, 53, 55}
    HOLES = {6}
    ROCKS = {2, 3, 39, 54, 79}
    ICICLES = {29, 30, 37, 38}
    FALL_PRIM = {295, 303, 311}
    MOUTH = {12}

    binf = BA.fetch("data/layouts/SeafoamIslands_B3F/map.bin", "SeafoamIslands_B3F.bin")
    lay = json.load(io.open(os.path.join(BA.SRC, "layouts.json")))
    L = next(x for x in lay["layouts"] if x.get("name") == "SeafoamIslands_B3F_Layout")
    w, h = L["width"], L["height"]
    raw = np.frombuffer(io.open(binf, "rb").read(), dtype="<u2")[: w * h]
    ids = (raw & 0x3FF).reshape(h, w)
    col = ((raw >> 10) & 3).reshape(h, w)
    ele = ((raw >> 12) & 0xF).reshape(h, w)

    # Our atlas packs seafoam_islands at some base; route.json is the only place
    # that knows where. check.mjs asserts the two still agree, so re-running
    # `npm run art` without `npm run map` fails loudly instead of drawing rubble.
    route = json.load(io.open(os.path.join(ROOT, "public", "tilesets", "route.json")))
    base = route["frost"]["floor"] - 1              # seafoam local 1 is the lower ice

    def classify(x, y):
        i, c, e = int(ids[y][x]), int(col[y][x]), int(ele[y][x])
        loc = i - 640
        if i in FALL_PRIM or loc in MOUTH:
            return "K"
        if c:
            if loc in ICICLES:
                return "t"
            return "d" if loc in ROCKS else "I"
        if e == 1:
            return "k"
        if loc in LADDERS or loc in HOLES:
            return "j" if e == 4 else "i"
        if e == 4:
            return "j"
        if e == 0:
            if loc == 4:
                return "s"
            if loc in (90, 91, 92, 215, 216):
                return "j"
            return "I"
        return "i"

    g, tiles = [], []
    for y in range(ROWS):
        row, trow = [], []
        for x in range(w):
            ch = classify(x, y)
            i = int(ids[y][x])
            keep = (i - 640) not in LADDERS and (i - 640) not in HOLES
            if y >= 20 and ch != "k":
                # Below the cave is border fill. Rock down there is solid in the
                # real map too, so it keeps its own tile and only the character
                # changes; the four cells that are walkable fringe lose both,
                # because scenery you cannot reach must not look like a step.
                ch = "I"
                keep = keep and int(col[y][x]) != 0
            row.append(ch)
            trow.append((i if i < 640 else base + (i - 640)) if keep else -1)
        g.append(row)
        tiles.append(trow)
    return g, tiles, base


def frost_hollow():
    """Frost Hollow: Seafoam Islands B3F, copied tile for tile.

    The one thing added is the bridge. The river runs from the waterfall in the
    north down the middle of the cave and out of the south wall, and in Seafoam
    you cross it by surfing - which this game does not have. Without a crossing
    the whole east side is map you can see and never stand on, so a plank bridge
    goes over the narrowest reach of it.

    Two chambers on the east had a ladder for their only way in, so taking the
    ladders out left them stranded - which the reachability check caught. A
    staircase does on this floor what the ladder did between floors.

    Everything we author gets an id of -1 and is drawn by the rules; everything
    copied keeps the real map's own tile. 38x22."""
    g, tiles, base = seafoam_b3f()

    def author(x0, y0, x1, y1, ch):
        rect(g, ch, x0, y0, x1, y1)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                tiles[y][x] = -1

    author(24, 15, 27, 16, "N")      # the bridge, over the narrowest reach
    author(28, 7, 29, 7, "s")        # a stair into the north-east chamber
    author(31, 17, 32, 17, "s")      # and into the south-east one

    # Standing in the lower hall at the foot of the cave, the river to the east.
    return ["".join(r) for r in g], (4, 19), [i for row in tiles for i in row], base


def bank(g, x0, x1, y, consoles=()):
    """A machine bank: the Power Plant's only wall. Returns the row below it.

    The real map builds every wall out of these, in horizontal runs - which is
    why this map is bars rather than blocks. Three wide is the least that has a
    middle between its two end caps.

    Three rows, not two. The top one is the plinth the machine stands on, and
    the real map caps it at both ends exactly as it caps the machine. Ours drew
    only the middle of that row, uncapped, the length of the whole run - which
    reads as a wall with a walkable grey top, and was reported as one. FireRed
    does leave the plinth walkable, but there a bank is one side of a room;
    here it stands alone in the open, so the plinth is part of the bank.

    `consoles` are x positions whose two machine rows become a lit console.
    They sit under the plinth's middle, so a console is never an end cap.
    check() asserts all of it."""
    rect(g, "P", x0, y, x1, y + 2)
    for x in consoles:
        assert x0 < x < x1, f"console at x={x} would be an end cap of {x0}-{x1}"
        g[y + 1][x] = "X"
        g[y + 2][x] = "X"
    return y + 3


def all_connected(g):
    """Is every walkable tile reachable from every other?"""
    H, W = len(g), len(g[0])
    start = next(((x, y) for y in range(H) for x in range(W)
                  if g[y][x] not in SOLID), None)
    if start is None:
        return False
    seen, stack = set(), [start]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and g[ny][nx] not in SOLID:
                stack.append((nx, ny))
    return len(seen) == sum(1 for y in range(H) for x in range(W)
                            if g[y][x] not in SOLID)


def hang_partitions(g, want, floor="p", longest=13):
    """Hang partitions from the walls, keeping only the ones that cut nothing off.

    Placing these by hand went badly three times running: every position that
    lowered the stripe measurement also sealed a strip against the north wall,
    and each fix moved the pocket somewhere else. So do not place them by hand.
    Try the longest candidates first, keep a partition only if the map is still
    one connected place afterwards, and put it back if it is not - which is the
    same generate-and-test the cave composer uses, on a smaller problem.

    A candidate hangs from a wall, because the tileset has no cap for the top of
    a free-standing column: 48 caps the foot and nothing caps the head."""
    H, W = len(g), len(g[0])
    runs = []
    for x in range(1, W - 1):
        for y in range(1, H - 1):
            if g[y][x] != floor or g[y - 1][x] not in ("P", "X", "E", "Y"):
                continue
            n = 0
            while y + n < H - 1 and g[y + n][x] == floor:
                n += 1
            if n >= 4:
                runs.append((min(n, longest), x, y))
    runs.sort(reverse=True)

    placed = 0
    for n, x, y in runs:
        if placed >= want:
            break
        if any(g[yy][x + dx] == "Y"
               for yy in range(y - 1, y + n + 1) for dx in (-1, 0, 1)
               if 0 <= x + dx < W):
            continue                       # keep them apart
        # Candidates were measured against the untouched grid, so two in one
        # column can overlap - and reverting the second used to wipe part of
        # the first, leaving a one-tile stub the assertion then caught.
        if any(g[yy][x] != floor for yy in range(y, y + n)):
            continue
        for yy in range(y, y + n):
            g[yy][x] = "Y"
        if all_connected(g):
            placed += 1
        else:
            for yy in range(y, y + n):
                g[yy][x] = floor
    return placed


def barrels(g, x, y, n=1, tall=1):
    """n barrel stacks side by side, hanging off the foot of the bank above.

    Never loose on the floor. In the real map 41 of the 54 barrels sit directly
    under a bank's body row and the rest stand on a plinth; free-standing ones
    read as scenery nobody attached to anything, which is how ours shipped."""
    for xx in range(x, x + n):
        assert g[y - 1][xx] in ("P", "X"), \
            f"barrels at ({xx},{y}) hang off nothing - the tile above is a floor"
    rect(g, "B", x, y, x + n - 1, y + tall - 1)


def power_plant():
    """Power Plant: a floor of machine banks, after FireRed's own.

    Counting its map.bin settles the shape of the place. 537 of its floor tiles
    are one id, and its walls are almost entirely horizontal banks - so it has
    no rooms in the ordinary sense. The banks are laid in ranks across the hall
    and the corridors are simply the gaps between them, which is why the plan
    reads as a grid shifted out of true rather than as a maze.

    Five ranks here, each broken in two or three places, no gap lining up with
    the one above it, and the segments themselves nudged a row off their
    neighbours - laid flush they read as five parallel lines and the corridors
    become gaps in a fence rather than anywhere to be. Crossing the hall means
    meeting every rank and walking along it to find where it opens.

    The room ends in its own wall, a separate set from the banks with the void
    drawn beyond it, taken off the real map's four corners.

    Barrels are the only loose thing on this floor and they are not loose: each
    cluster hangs off the foot of the bank above it, as every cluster in the
    reference does. The lit consoles are set into the banks.

    40x30, of which 38x28 is floor."""
    W, H = 40, 30
    g = [["p" for _ in range(W)] for _ in range(H)]

    # --- the room --------------------------------------------------------
    rect(g, "E", 0, 0, W - 1, 0)
    rect(g, "E", 0, H - 1, W - 1, H - 1)
    rect(g, "E", 0, 0, 0, H - 1)
    rect(g, "E", W - 1, 0, W - 1, H - 1)

    # --- five ranks of banks, and their barrels ---------------------------
    # bank() hands back the row under its foot, so a cluster cannot drift off
    # the machine it belongs to however the ranks are moved about.
    #
    # Bank length is the whole argument here. tools/study_layout.py measures a
    # "stripe" - mean solid run along rows over the same along columns - and the
    # real maps run 0.83 to 1.63, the top of that being FireRed's own Power
    # Plant, which is the most banded map Game Freak shipped. Ours came in at
    # 2.51 with banks of 12 to 17, which is what "it reads as stripes" is in a
    # number. Nothing here is longer than 9 now, and the ranks gained a gap each.
    barrels(g, 3, bank(g, 1, 9, 2, consoles=(5,)), 4)
    barrels(g, 13, bank(g, 12, 20, 3, consoles=(16,)), 3)
    barrels(g, 25, bank(g, 23, 29, 2), 3)
    barrels(g, 35, bank(g, 34, 38, 3), 2, tall=2)

    barrels(g, 2, bank(g, 1, 7, 8), 3)
    barrels(g, 18, bank(g, 12, 20, 9, consoles=(16,)), 3)
    barrels(g, 29, bank(g, 28, 36, 8, consoles=(32,)), 2, tall=2)

    barrels(g, 9, bank(g, 3, 11, 14, consoles=(7,)), 3)
    barrels(g, 16, bank(g, 15, 22, 15, consoles=(19,)), 4)
    barrels(g, 27, bank(g, 26, 34, 14, consoles=(30,)), 4)

    barrels(g, 2, bank(g, 1, 9, 20, consoles=(6,)), 3)
    barrels(g, 18, bank(g, 14, 22, 19, consoles=(18,)), 4)
    barrels(g, 31, bank(g, 30, 38, 20), 3)

    barrels(g, 6, bank(g, 5, 13, 25, consoles=(9,)), 4)
    barrels(g, 18, bank(g, 17, 22, 24), 3)
    # This bank used to run to the east wall, which left its neighbour's foot
    # row a one-tile corridor sealed at both ends - five tiles of floor you
    # could see and never stand on. Adding `E` to SOLID is what found it: the
    # room's own edge had been counted as walkable ground all along.
    barrels(g, 25, bank(g, 24, 34, 24, consoles=(28,)), 3)

    # --- partitions, to break the ranks up -------------------------------
    # The Power Plant's walls are horizontal banks, which is why it reads as
    # banded: study_layout measured its solid runs 1.83 times longer along rows
    # than down columns, where no real map exceeds 1.63 - and the real Power
    # Plant, the most banded map Game Freak shipped, still manages 1.63 because
    # it breaks its ranks with 45 vertical runs of four tiles or more.
    #
    # Placed by search, not by hand. Three hand-placed attempts each lowered the
    # stripe and each sealed a strip against a wall; hang_partitions keeps only
    # the ones that leave the hall one connected place. It runs last, after
    # every bank, or a bank lands on top of one.
    made = hang_partitions(g, want=5)
    assert made >= 3, f"power plant: only {made} partitions would fit"

    # Standing at the door end, in the south-west corner of the hall.
    return ["".join(r) for r in g], (2, 28)


if __name__ == "__main__":
    out = []
    for spec in AREAS:
        made = globals()[spec["drawn"]]() if spec.get("drawn") else build(spec)
        rows, spawn = made[0], made[1]
        tiles, base = (made[2], made[3]) if len(made) > 2 else (None, None)
        spec["w"], spec["h"] = len(rows[0]), len(rows)
        got, total = check(spec, rows, spawn)
        out.append((spec, rows, spawn, tiles, base))
        print("  %-9s %2dx%-2d  spawn %2d,%-2d  %3d of %3d walkable reachable"
              % (spec["id"], spec["w"], spec["h"], spawn[0], spawn[1], got, total))

    body = ["/* GENERATED by tools/build_map.py - edit the area specs there. */\n",
            "export const AREAS = {"]
    for spec, rows, spawn, tiles, base in out:
        body.append("  %s: {" % spec["id"])
        body.append("    name: %s," % json.dumps(spec["name"]))
        body.append("    spawn: { x: %d, y: %d }," % spawn)
        body.append("    rows: [")
        body += ['      "%s",' % r for r in rows]
        body.append("    ],")
        if tiles is not None:
            # A copied map carries the real one's own metatile ids. -1 is
            # "we authored this, draw it by the rules". tileBase is the atlas
            # base they were rebased against, which check.mjs re-verifies.
            body.append("    tileBase: %d," % base)
            body.append("    tiles: [")
            for y in range(spec["h"]):
                row = tiles[y * spec["w"]:(y + 1) * spec["w"]]
                body.append("      " + ",".join(str(i) for i in row) + ",")
            body.append("    ],")
        body.append("  },")
    body.append("};\n")
    body.append("export const AREA_IDS = %s;\n"
                % json.dumps([s["id"] for s, *_rest in out]))
    io.open(os.path.join(ROOT, "src", "game", "mapdata.js"), "w",
            encoding="utf-8").write("\n".join(body))
    print("   wrote src/game/mapdata.js  (%d areas)" % len(out))
