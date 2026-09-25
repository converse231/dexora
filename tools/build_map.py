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
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Outdoor areas are framed by trees; themed ones by their own wall, so an ember
# map is volcanic rock all the way to the edge rather than a patch on a lawn.
AREAS = [
    # Hand-drawn - see tall_grass() at the bottom of this file.
    dict(id="meadow", name="Tall Grass", drawn="tall_grass"),
    # COPIED: Emerald's Route 119, as Monsoon Trail - see monsoon_trail(). The
    # id is the slot's historical handle (this was Deep Woods); renaming it
    # would move every save standing here.
    dict(id="woods", name="Monsoon Trail", drawn="monsoon_trail"),
    # Several lakes, not one: water is solid and only the bank spawns, so a
    # single pond leaves a whole map with a 17-tile shoreline to pace.
    # Hand-drawn - see pond_shore() further down.
    dict(id="pond", name="Pond & Shore", drawn="pond_shore"),
    # No grass patches: there are no transition metatiles between grass and
    # rock, so the two met along hard rectangular edges that read as a bug.
    # COPIED, and the first area with more than one floor - see mt_moon().
    # The id is the slot's historical handle (this was Rock Ridge, composed
    # against the same `cave` tileset); renaming it would move every save
    # standing here and buy nothing but a tidier grep.
    dict(id="ridge", name="Mt. Moon", drawn="mt_moon"),
    # Indoors, so no sand path: a dirt track across a concrete factory floor
    # was the single most obviously wrong thing on these maps. `path=None`
    # leaves the floor uniform, which is exactly what the real Power Plant is.
    # Hand-drawn - see power_plant() further down.
    dict(id="power", name="Power Plant", drawn="power_plant"),
    # Mt Ember has rock faces rather than boulders, so its obstacles are placed
    # in 4x4 outcrops - a single face on its own reads as a floating slab.
    # Hand-drawn - see volcano() further down.
    dict(id="ember", name="Ember Caldera", drawn="volcano"),
    # COPIED, and the second two-level map - Route 112 with Mt Chimney above
    # it, joined by the real cable car. See cinderpeak().
    dict(id="cinder", name="Cinderpeak", drawn="cinderpeak"),
    # Hand-drawn - see frost_hollow() further down.
    dict(id="frost", name="Frost Hollow", drawn="frost_hollow"),
    # COPIED, and the first map with FOUR floors - Cinnabar's burnt-out house,
    # laid out two by two. The first drawn against a `building` primary, too,
    # which is why `FR_PRIMARY` exists. See mansion().
    dict(id="mansion", name="Pokemon Mansion", drawn="mansion"),
    # Transcribed, all seven floors - see haunted_tower() further down.
    dict(id="tower", name="Haunted Tower", drawn="haunted_tower"),
    # COPIED, and the biggest map in the game - six Emerald maps stitched into
    # the rectangle they already form. See safari_zone().
    dict(id="safari", name="Safari Zone", drawn="safari_zone"),
]

SOLID = set("TwRMIPHLFCWXBEVkKdtYGAZJQ")

# A LEDGE IS ONE-WAY, AND WHICH WAY IS THE CHARACTER'S: the value is the step
# that hops it, so `L` is hopped walking south and `J` walking east. This is
# `LEDGE` in src/game/map.js and the two must agree - `walk_steps` below is
# what decides whether a map ships with a terrace nobody can leave, and it
# would be deciding it against a rule the engine does not follow. check.mjs
# pins the pair, the same way it pins SOLID.
LEDGE = {"L": (0, 1), "J": (1, 0)}
# ACRO BIKE RAILS: `-` runs east-west and `|` north-south, which is what the
# minimap and the renderer care about. Ridden on the Bike in ANY direction.
# An axis rule (along the rail only, no turning) was tried first and cut
# Route 119's network to 11 of its 55 rails: Emerald joins them with hops
# between short bars, which a one-axis rule reads as dead ends. The fill below
# counts them as reachable, because a player with the Bike can. Mirrored in
# map.js's RAIL; check.mjs holds the pair together.
RAIL = {"-": (1, 0), "|": (0, 1)}
# What Surf rides - mirrors map.js's SURFABLE; check.mjs holds the pair together.
SURFABLE = set("wWkV")


def h2(x, y, salt=0):
    v = (x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)
    v &= 0xFFFFFFFF
    v ^= v >> 13
    return (v * 2654435761) & 0xFFFFFFFF


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def hiding_ids():
    """Atlas ids whose UPPER LAYER covers the whole tile, out of route.json.

    A cell you cannot be SEEN standing on is not a cell you can stand on. These
    metatiles draw the same art on both halves - the Power Plant's machine
    plinth does it 123 times - so on the real hardware BG1 paints over whoever
    is there and the trainer disappears. The map data calls them passable; the
    renderer makes them uninhabitable, and the second fact is the one a player
    meets.

    Reported from play as standing ON TOP OF the machinery. Our own generated
    Power Plant had made the identical call by hand, for the identical reason
    ("FireRed leaves the plinth walkable; we make it solid"), which is the tell
    that this is the map's grammar rather than a compromise: you walk ALONG the
    front of a bank, never over it."""
    meta = json.load(io.open(os.path.join(ROOT, "public", "tilesets", "route.json"),
                             encoding="utf-8"))
    return set(meta.get("hides", ()))


def seal_hidden(g, tiles, wall):
    """Turn every walkable cell that would hide the player into `wall`.

    The ART is kept - it is still the tile Game Freak drew, and it still draws
    the machine top or the counter it always was. Only the collision changes."""
    hidden = hiding_ids()
    H, W = len(g), len(g[0])
    n = 0
    for y in range(H):
        for x in range(W):
            if g[y][x] not in SOLID and tiles[y][x] in hidden:
                g[y][x] = wall
                n += 1
    return n


def land_ledges(g, wall):
    """Turn every ledge with nowhere to land into `wall`. Returns how many.

    A hop clears exactly two tiles, so a ledge whose far side is solid cannot
    be jumped at all - and in the game it was copied from it simply reads as a
    terrace wall, which is also what its own collision bit says. Route 112 lays
    two east ledges side by side at x=12/13 and is where this was found.

    Rock rather than floor. The first version gave floor, decided when a ledge
    could only face south and floor was the safer of two guesses; it is the
    wrong one, because floor is a terrace wall you can walk straight back up -
    the exact fault `J` exists to fix.
    """
    H, W = len(g), len(g[0])
    n = 0
    moved = True
    while moved:                                  # taking one away can take
        moved = False                             # the landing from the next
        for y in range(H):
            for x in range(W):
                face = LEDGE.get(g[y][x])
                if not face:
                    continue
                lx, ly = x + face[0], y + face[1]
                if not (0 <= lx < W and 0 <= ly < H) or g[ly][lx] in SOLID:
                    g[y][x] = wall
                    moved = True
                    n += 1
    return n


def walk_steps(rows, x, y):
    """Where you can get to from (x, y) in one move. THE FILL IS DIRECTED.

    A ledge is solid to ordinary movement and walking SOUTH into one hops it,
    landing two tiles down - so reachability is not symmetric and an undirected
    flood passes a map that traps the player on a terrace. It also FAILS a map
    that is fine: Route 1's flower meadow is enclosed by a ledge above it and a
    ledge below, which an undirected fill calls an orphan and walls in.

    One definition, used by `check()` and by anything that has to agree with it
    about what a player can reach."""
    H, W = len(rows), len(rows[0])
    out = []
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if not (0 <= nx < W and 0 <= ny < H):
            continue
        face = LEDGE.get(rows[ny][nx])
        if face:
            # Only along its OWN direction, and only if there is ground the
            # far side. Any other approach is a wall.
            lx, ly = nx + dx, ny + dy
            if (face == (dx, dy) and 0 <= lx < W and 0 <= ly < H
                    and rows[ly][lx] not in SOLID):
                out.append((lx, ly))              # hop it, land beyond
            continue
        if rows[ny][nx] in SOLID:
            continue
        out.append((nx, ny))
    return out


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


def check(area, rows, spawn, tiles=None, warps=None):
    W, H = len(rows[0]), len(rows)
    at = lambda x, y: rows[y][x] if 0 <= x < W and 0 <= y < H else ""
    aid = area["id"]

    """A COPIED CELL IS DRAWN BY THE REAL MAP'S OWN METATILE, and most of the
    rules below have nothing to say about one.

    Every shape rule here - two wide on an even column, an odd number of rows,
    a run at least three across - exists because OUR autotiles have nine cases
    and cannot draw the thing otherwise. A cell with a fixed id never reaches
    them: `drawTile` blits the id and returns. So applying these to a
    transcription does not protect it, it DAMAGES it - Frost Hollow turns real
    shelf tiles into plain ice to satisfy the "never stands alone" rule, and
    what it is really satisfying is a limitation of a renderer it does not use.

    Route 1 is what forced the split: its own top border is two rows of conifer
    and its ledges include a two-tile run, both of which Game Freak drew and
    both of which the rules below refuse.

    What is NOT gated is everything about whether the map can be PLAYED - the
    outer ring, reachability, a ledge with somewhere to land, a spawn outside a
    wall. Those are true of a copy exactly as they are of anything else, and
    they are the ones that have ever caught a real bug on a transcribed map."""
    copied = ((lambda x, y: tiles[y * W + x] >= 0) if tiles
              else (lambda x, y: False))
    # Both ends of every ladder, for the fill at the bottom and for the rule
    # that says what a ladder has to look like.
    hop = {}
    for ax, ay, bx, by in (warps or ()):
        hop[(ax, ay)] = (bx, by)
        hop[(bx, by)] = (ax, ay)

    assert all(len(r) == W for r in rows), f"{aid}: ragged rows"
    assert rows[spawn[1]][spawn[0]] not in SOLID, f"{aid}: spawn is inside a wall"

    # Every bridge on every map, not just the ones place_lava happened to test.
    # Ember's causeway is hand-laid and was never asked, which is how it shipped
    # two wide with only its left column landing.
    assert spans_clear([list(r) for r in rows]),         f"{aid}: a bridge does not land across its whole width at both ends"

    for y in range(H):
        for x in range(W):
            if rows[y][x] != "T" or copied(x, y):
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
            if rows[y][x] != "F" or copied(x, y):
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
            face = LEDGE.get(rows[y][x])
            if not face:
                continue
            # EVERY RULE HERE IS ABOUT THE FACE, so each one reads the
            # character's own direction rather than assuming south: the
            # landing is one step along it, the approach one step back,
            # and the run lies ACROSS it - a south ledge runs east-west
            # and an east ledge runs north-south.
            dx, dy = face
            lx, ly = x + dx, y + dy
            assert 0 <= lx < W and 0 <= ly < H and rows[ly][lx] not in SOLID,                 f"{aid}: ledge at ({x},{y}) has nothing to land on"
            # AN APPROACH IS A RULE FOR A LEDGE WE PLACED. A copied one can
            # simply run out under the treeline - four of the Safari Zone's
            # thirty-six do, the last tiles of a run Game Freak drew into a
            # tree mass - and those are decoration, not a trap: you cannot
            # stand above them, so you never hop them, and the rest of the run
            # works. The LANDING below is still asserted for everyone, because
            # a ledge with nothing under it is a hop into a wall.
            assert copied(x, y) or at(x - dx, y - dy) not in SOLID,                 f"{aid}: ledge at ({x},{y}) cannot be reached from above"
            run, ch = 1, rows[y][x]
            ax, ay = -dy, dx                      # across the face
            xx, yy = x - ax, y - ay
            while at(xx, yy) == ch:
                run += 1
                xx, yy = xx - ax, yy - ay
            xx, yy = x + ax, y + ay
            while at(xx, yy) == ch:
                run += 1
                xx, yy = xx + ax, yy + ay
            # The run length is an art rule - cap / mid / cap needs three -
            # while the two assertions above it are about whether the hop can
            # be made at all, so only this one gives way to a copy. Route 1
            # has a two-tile ledge and it draws correctly, because it draws
            # with its own tiles.
            assert copied(x, y) or run >= 3, \
                f"{aid}: ledge run at ({x},{y}) is {run} wide"

    # A machine bank is exactly three rows and at least three wide: two columns
    # are two end caps with no middle between them, and the rows are the plinth,
    # the machine top and its body. Two rows leaves the plinth on the floor,
    # where it reads as a walkable wall top.
    for y in range(H):
        for x in range(W):
            if rows[y][x] not in ("P", "X") or copied(x, y):
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
            if rows[y][x] != "Y" or copied(x, y):
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

    # A barrel stack is one wide and one or two tall.
    #
    # IT DOES NOT HAVE TO HANG OFF A BANK, and asserting that it did deleted
    # most of the Power Plant's contents. The note behind it - "41 of the real
    # map's 54 barrels sit directly under a bank's body" - is true of metatile
    # 53, the drum's TOP, and 53 is 54 tiles. Nobody counted 54, the drum's
    # BODY, which is 117 tiles and sits under a bank 3% of the time: 31 of them
    # stand on plain floor and the rest stand on each other.
    #
    # Together they are 171 tiles in 32 irregular clumps of one to thirteen,
    # 8.7% of the real map, and they are most of what makes it read as a
    # working plant rather than a plan of one. Ours had none, because this
    # assertion refused them, and the map was reported as ugly and empty.
    #
    # So a stack still may not be TALLER than two, and it must still be one
    # wide, and it may now stand where the reference stands them.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "B" or copied(x, y):
                continue
            top = y
            while at(x, top - 1) == "B":
                top -= 1
            bot = y
            while at(x, bot + 1) == "B":
                bot += 1
            assert bot - top + 1 <= 2, \
                f"{aid}: barrels at ({x},{y}) are {bot-top+1} tall; two is the most"
            assert at(x, top - 1) in ("P", "X", "B", "p", "E"), \
                f"{aid}: barrels at ({x},{top}) stand on nothing recognisable"

    # A lone tile of raised shelf has no inside for the autotile to draw, so it
    # comes out as four corners and reads as a lump rather than as ground.
    # Anything thicker is fair game: Seafoam runs the shelf a single tile wide
    # down its corridors, and the 3x3 gives that a top edge and no bottom, which
    # is what the real map's own thin-run pieces are for and is close enough
    # once there is wall above and below it anyway. Boulders count as shelf -
    # one standing on it is a lump in the ice, not a hole in it.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "j" or copied(x, y):
                continue
            assert any(at(x + dx, y + dy) in ("j", "s", "d")
                       for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0))),                 f"{aid}: ice shelf at ({x},{y}) stands alone"

    # A staircase joins the two levels: shelf on one side of it, lower ice on
    # the other. One with the same ground at both ends is a step to nowhere,
    # which is what Seafoam's shelf-edge ramps would have become.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "s" or copied(x, y):
                continue
            near = {at(x, y - 1), at(x, y + 1), at(x - 1, y), at(x + 1, y)}
            assert "j" in near and "i" in near, \
                f"{aid}: stairs at ({x},{y}) do not join the shelf to the lower ice"

    # Water is at least two across - the bank is drawn on both sides of it, so
    # a single column is all bank and no river.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "k" or copied(x, y):
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
            if rows[y][x] != "t" or copied(x, y):
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
            if rows[y][x] != "K" or copied(x, y):
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
            if rows[y][x] != "M" or copied(x, y):
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
            if rows[y][x] != "V" or copied(x, y):
                continue
            for dx, dy, where in ((0, -1, "above"), (-1, 0, "left of"), (1, 0, "right of")):
                c = at(x + dx, y + dy)
                # A LANDING IS EXEMPT, WITHIN ONE TILE OF A RUNG AND NOWHERE
                # ELSE. The rim is drawn on the rock beside a pool, so lava
                # meeting open floor has none - right for a pool we sank, and
                # wrong for a platform somebody has to stand on. Victory Road
                # puts one in its lake and banking it sealed the ladder in. A
                # missing rim on five tiles beats a warp with no way off, and
                # the exemption cannot spread: it reaches exactly one tile.
                if any(abs(x + dx - hx) + abs(y + dy - hy) <= 1 for hx, hy in hop):
                    continue
                assert c in ("V", "M", "n", ""), \
                    f"{aid}: lava at ({x},{y}) has {c!r} {where} it, not rock - no bank"

    # And a pool has to be worth calling one.
    seen = set()
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "V" or (x, y) in seen or copied(x, y):
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
            if rows[y][x] not in ("n", "N") or (x, y) in seen or copied(x, y):
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
            # A COPIED LADDER IS A WARP, NOT A CLIMB. Ember's is a painted
            # column with floor at its head and its foot, which is what this
            # rule is about; Mt Moon's is one tile that puts you on another
            # floor, and asking it for floor above and below is asking it to
            # be the other kind of ladder.
            # A WARP IS A LADDER IN ITS OWN RIGHT, and a different shape of
            # one. Ember's old painted ladder was a COLUMN with floor at its
            # head and its foot, which is what the rest of this rule is about;
            # a warp is a single rung that puts you on another floor, so asking
            # it for a column is asking it to be the other kind.
            if rows[y][x] != "l" or copied(x, y) or (x, y) in hop:
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
            if rows[y][x] != "H" or at(x, y + 1) in ("H", "A", "") or copied(x, y):
                continue
            assert at(x, y - 1) in ("H", "A"),                 f"{aid}: the wall at ({x},{y}) is one tile thin - no lip above it"

    # A grave set into the wall needs wall above it and floor below: anywhere
    # else it draws the wall-set marker with nothing behind it, which reads as a
    # headstone floating in the black.
    for y in range(H):
        for x in range(W):
            if rows[y][x] != "A" or copied(x, y):
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
            if rows[y][x] != "R" or copied(x, y):
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
            if rows[y][x] != "o" or copied(x, y):
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
            if rows[y][x] != "W" or copied(x, y):
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
            if rows[y][x] != "D" or copied(x, y):
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
            if rows[y][x] != "w" or copied(x, y):
                continue
            below = rows[y + 1][x]
            assert below in ("w", "b", "D") or below in SOLID,                 f"{aid}: water at ({x},{y}) sits on {below!r}; the tile under "                 f"water has to be shore, more water, a pier, or rock"

    for ch, name in (("#", "path"), ("w", "pond"), ("D", "pier")):
        for y in range(H):
            for x in range(W):
                if rows[y][x] != ch or copied(x, y):
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

    # A WARP YOU CANNOT STEP OFF IS A TRAP, and the reachability fill cannot
    # see it: crossing a warp makes the destination "reachable" while leaving
    # it may be impossible. Ember shipped one - a rung on a platform the lava
    # bank had turned to rock all round - and whoever took that ladder had no
    # way back at all. One walkable neighbour is the whole requirement.
    for (wx, wy) in hop:
        assert any(at(wx + dx, wy + dy) not in SOLID and at(wx + dx, wy + dy) != ""
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))), \
            f"{aid}: the warp at ({wx},{wy}) has nothing to step off onto"

    # Reachability is directed, because a ledge is one-way: you may only enter it
    # walking south, and doing so lands you on the far side. A map that traps you
    # on a terrace would otherwise sail through this check. `walk_steps` is the
    # one definition of that, shared with the transcribers.
    # A LADDER IS A WAY THROUGH, so the fill takes one. Mt Moon is three
    # floors sharing a grid and joined only by its own warps; without this,
    # every floor but the first reads as an island and five sixths of the map
    # is "cut off" - a true statement about walking and a false one about
    # whether a player can get there.
    seen, stack = set(), [spawn]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        stack += walk_steps(rows, x, y)
        if (x, y) in hop:
            stack.append(hop[(x, y)])
        # AND SURF IS A WAY THROUGH, like a ladder: Monsoon Trail's northwest
        # lake is reached on the water in Emerald, and so here, once Surf is
        # held. Water is crossed, never counted - `got` is still only land.
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and (rows[ny][nx] in SURFABLE or
                    (rows[y][x] in SURFABLE and rows[ny][nx] not in SOLID)):
                stack.append((nx, ny))

    # Every walkable tile spawns now, so the thing to check is that the ground
    # is one connected place: a walled-off pocket is map you can see and never
    # stand on, which reads as a bug rather than as scenery.
    tiles = [(x, y) for y in range(H) for x in range(W) if rows[y][x] not in SOLID]
    got = [t for t in tiles if t in seen]
    # THE OUTER RING IS SOLID, ON EVERY MAP. A walkable tile on the boundary is
    # a wall you can stand in: there is nothing beyond it to stop you, the
    # autotile draws its edge facing out of the world, and the camera clamps
    # against a tile the player is standing on. Frost Hollow had seventeen and
    # nothing said so - every other map was sealed by construction, which is
    # precisely why nobody wrote this down. Reported from play as walkable
    # walls.
    edge = [(x, y) for x in range(W) for y in (0, H - 1)
            if rows[y][x] not in SOLID]
    edge += [(x, y) for y in range(H) for x in (0, W - 1)
             if rows[y][x] not in SOLID]
    assert not edge,         f"{aid}: {len(edge)} walkable tiles on the boundary, e.g. {edge[:4]}"

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
    """One tree: two columns wide, `tall` rows down, on the even-column grid.

    ALL OR NOTHING. `onto_grass` paints per tile, so a clump whose bottom row
    overlaps a path run drew the top two rows and left a tree two tall - which
    the renderer has no pieces for and check() refuses. Taking the whole
    footprint or none of it turns "I put a landmark somewhere it did not fit"
    into a landmark that simply is not there, which is a thing you can see in a
    render rather than a build that stops."""
    H, W = len(g), len(g[0])
    cells = [(x + dx, y + dy) for dx in (0, 1) for dy in range(tall)]
    if any(not (0 <= cx < W and 0 <= cy < H) or g[cy][cx] not in ".,f"
           for cx, cy in cells):
        return False
    onto_grass(g, "T", x, y, x + 1, y + tall - 1)
    return True


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


def ledge_in(g, y, x0, x1, most=14):
    """Lay a ledge in the longest clear run of row `y` between x0 and x1.

    `ledge` paints only over grass, so a run that crosses a path column, a tree
    mass or the corner of a pond comes out in PIECES - and two tiles is a thing
    the cap / mid / cap set cannot draw. Placing them by coordinate meant
    re-deriving, by hand, which spans four layers of painting had left clear;
    that was wrong four times in a row on one map, each time about a different
    obstacle.

    So the run is found. Returns the span used, or None when the row has no
    three tiles of grass in a row to put one on - which is a fact about the map
    worth knowing rather than a build that stops."""
    H, W = len(g), len(g[0])
    if not (0 <= y < H):
        return None
    def usable(x):
        """Grass to lay it on, ground above to walk in from, and somewhere to
        land two below - which is the whole of what a one-way hop needs and all
        three of the things check() asserts about one."""
        if g[y][x] not in ".,":
            return False
        if y - 1 < 0 or g[y - 1][x] in SOLID:
            return False
        return y + 2 < H and g[y + 2][x] not in SOLID

    best, run = None, None
    for x in range(max(0, x0), min(W, x1 + 1) + 1):
        clear = x < min(W, x1 + 1) and usable(x)
        if clear:
            run = x if run is None else run
        elif run is not None:
            if best is None or x - run > best[1] - best[0] + 1:
                best = (run, x - 1)
            run = None
    if best is None or best[1] - best[0] + 1 < 3:
        return None
    # Capped in length: a ledge the width of the map is a wall you hop, and the
    # real ones are short runs hanging off a terrace.
    lo, hi = best
    if hi - lo + 1 > most:
        mid = (lo + hi) // 2
        lo, hi = mid - most // 2, mid - most // 2 + most - 1
    ledge(g, lo, hi, y)
    return (lo, hi)


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
    """Tall Grass: four times the route, up seven terraces instead of four.

    64x80, of which 60x74 is playable - four screens across and about seven
    down. The old one was 32x40, and the three numbers `npm run layout` flagged
    on it are the brief for this one:

      open 0.60   against a real route's 0.22-0.58. A field with nothing in it.
      turns 0.23  against 0.11-0.18. Our tree edges wiggled; Route 1's do not.
      dead 0.01   against 0.00. Route 1 has no dead ends at all.

    So the extra space is not spent on more field. It is spent on TREE MASSES -
    big rectangles with right angles, which is Route 1's whole vocabulary - and
    those fix the first two together: a mass takes floor out of `open` and its
    straight edges take wiggle out of `turns`. The meadow ends up with more in
    it and more shape to it at the same time, which is what "it feels empty"
    actually asks for.

    Painted in layers, structure first: frame, the masses that make the
    terraces, the fields, the path over them, the ledges that terrace it, and
    only then the landmarks and flowers, which fill whatever grass is left."""
    W, H = 64, 80
    g = [["." for _ in range(W)] for _ in range(H)]

    # --- the frame -------------------------------------------------------
    # Three rows deep so a tree composes tip / body / base; two columns wide so
    # the pairs land on the even-column grid the renderer expects.
    rect(g, "T", 0, 0, W - 1, 2)
    rect(g, "T", 0, H - 3, W - 1, H - 1)
    rect(g, "T", 0, 0, 1, H - 1)
    rect(g, "T", W - 2, 0, W - 1, H - 1)

    # --- tall grass: eleven fields, each one beside a run of the path ------
    for x0, y0, x1, y1 in (
            (4, 4, 15, 7),       # north-west, above the top run
            (20, 4, 31, 8),      # north, between the two spurs
            (50, 4, 61, 9),      # north-east strip
            (4, 14, 20, 20),     # the big west field
            (42, 14, 61, 20),    # the big east field
            (6, 20, 21, 24),     # below the west field
            (36, 30, 55, 34),    # east of the middle
            (4, 36, 15, 43),     # west field, mid-map
            (20, 42, 39, 48),    # the south-central field
            (46, 48, 60, 56),    # south-east field
            (16, 58, 31, 66),    # the last field before the entrance
    ):
        rect(g, ",", x0, y0, x1, y1)

    # --- the terrace walls, painted OVER the fields -----------------------
    # Order is the whole of this. Painted before them, every mass was cut to
    # pieces by the field it stood in - and the measurement said so: `open`
    # went UP when eight masses were added, because most of them were not
    # there. A mass beats grass and loses to the path, which is a wood with a
    # route cut through it, and is the order these three are painted in.
    # These are the map's structure rather than decoration. Each one reaches in
    # from a border and stops short of the far side, so the route has to bend
    # round it - which is how a route is paced without a single dead end.
    for x0, y0, x1, y1 in (
            (2, 8, 17, 11),      # north-west spur
            (34, 6, 47, 9),      # north-east spur
            (24, 16, 39, 19),    # the middle wall, splitting the big field
            (2, 26, 13, 30),     # west block
            (46, 24, 61, 28),    # east block
            (18, 34, 33, 38),    # the long wall across the middle
            (44, 40, 61, 44),    # south-east block
            (2, 46, 15, 50),     # south-west block
            (26, 52, 41, 56),    # the last wall before the entrance
            (48, 60, 61, 64),    # south-east corner stand
            (2, 62, 13, 66),     # south-west corner stand
            # A second rank of masses. `turns` counts corners per tile of wall
            # boundary, so a scattered 2x3 clump is eight corners for six tiles
            # while a long rectangle is eight corners for forty - which is why
            # Route 1 measures 0.11-0.18 and a meadow full of dots measures
            # 0.25. Mass takes the floor out of `open`; STRAIGHTNESS takes the
            # wiggle out of `turns`, and only a big rectangle does both.
            (18, 4, 31, 7),      # north, squaring off the top
            (50, 30, 61, 34),    # east, above the mid-map field
            (2, 34, 13, 38),     # west, opposite the long wall
            (36, 44, 47, 48),    # centre-east
            (16, 68, 29, 72),    # south, beside the entrance run
            (48, 68, 61, 72),    # south-east
            (34, 8, 45, 11),     # closing the north-east gap
            (20, 24, 33, 28),    # between the second and third runs
            (46, 4, 61, 7),      # the north-east corner
            (2, 16, 13, 20),     # west, under the north-west spur
            (52, 40, 61, 44),    # east, filling behind the block
            (16, 44, 29, 48),    # centre, between the fourth and fifth runs
    ):
        rect(g, "T", x0, y0, x1, y1)

    # --- two ponds, one at each end of the route --------------------------
    # Water is solid and its own bottom row is the walkable bank, so the shore
    # is where water Pokemon are met. Two of them, far apart, so a rod is worth
    # carrying the length of the map rather than used once by the entrance.
    rect(g, "w", 50, 12, 59, 16)
    rect(g, "b", 50, 17, 59, 17)

    # Clear of the bottom run (y70-73), which is painted after the ponds and
    # would otherwise cut the lake in half and take its bank with it.
    rect(g, "w", 18, 63, 29, 67)
    rect(g, "b", 18, 68, 29, 68)

    # --- the path: switchbacks, four wide, only right angles --------------
    rect(g, "#", 6, 12, 46, 15)      # top run, west to east
    rect(g, "#", 42, 12, 45, 26)     # down the east side
    rect(g, "#", 16, 22, 45, 25)     # second run, east to west
    rect(g, "#", 16, 22, 19, 40)     # down the west side
    rect(g, "#", 16, 30, 34, 33)     # third run, west to east
    rect(g, "#", 34, 30, 37, 52)     # down the middle
    rect(g, "#", 8, 40, 37, 43)      # fourth run, east to west
    rect(g, "#", 8, 40, 11, 58)      # down the far west
    rect(g, "#", 8, 50, 30, 53)      # fifth run, west to east
    rect(g, "#", 42, 46, 45, 70)     # the east descent
    rect(g, "#", 34, 58, 45, 61)     # sixth run, joining the two
    rect(g, "#", 8, 55, 11, 73)      # the west descent
    rect(g, "#", 8, 70, 45, 73)      # bottom run, the length of the map
    rect(g, "#", 32, 73, 35, 76)     # the entrance you start on

    # --- ledges, on the south edge of each terrace ------------------------
    # Short and capped, always hanging off a horizontal run, so a hop south is
    # the shortcut and walking round is the long way.
    # Placed in the spans the terrace walls leave clear. A ledge painted over
    # by a wall comes out two tiles long, and three is the shortest thing the
    # cap/mid/cap set can draw.
    # Each one sits inside a span that is clear of BOTH the terrace walls and
    # the vertical path runs. `ledge` paints only over grass, so a run that
    # crosses either comes out in pieces - and three tiles is the shortest thing
    # the cap / mid / cap set can draw.
    # --- landmarks: tree clumps standing in the open ----------------------
    for x, y in ((20, 12), (30, 22), (52, 22), (6, 32), (26, 44),
                 (56, 36), (14, 52), (50, 58), (24, 34), (40, 20),
                 (58, 44), (4, 56), (36, 66), (54, 68), (22, 56)):
        clump(g, x, y)
    # ...and then wherever the map is emptiest, which is not somewhere an eye
    # is good at finding. Fifteen by hand, the rest by measurement. Scaled with
    # the area, or four times the map is four times as bare.
    # Fewer than the area alone would ask for, because every one of these is a
    # free-standing 2x3 and free-standing things are what `turns` counts. The
    # masses above carry the bulk; these carry the places a mass cannot reach.
    # TALLER, NOT MORE. `turns` wants mass and `tight` wants things near you,
    # and a 2x3 clump is the worst possible trade between them - six tiles of
    # adjacency for eight corners. A 2x5 is ten for the same eight, so the two
    # numbers stop fighting: turns 0.25 -> 0.17 (in band) and tight back up,
    # at the same count.
    fill_the_empty(g, want=46, tall=5)
    make_nooks(g, want=10)           # ...and a few corners with one way in

    # --- ledges, on the south edge of each terrace ------------------------
    # SEARCHED, NOT PLACED - see `ledge_in` - and laid LAST, after every tree
    # is standing. A ledge needs grass to lie on, ground above to walk in from
    # and somewhere to land two below; `fill_the_empty` stands trees wherever
    # the map is emptiest, and "emptiest" is exactly where a ledge had just
    # been given its approach. Placed before the trees, one came out with a
    # trunk sitting on top of it and could not be reached at all.
    for row in (16, 26, 34, 44, 54, 62):
        ledge_in(g, row, 3, W // 2 - 1)
        ledge_in(g, row, W // 2, W - 4)

    # --- flowers, in loose handfuls on the open grass ---------------------
    flowers(g, (2, 4), (3, 6), (2, 8), (4, 3), (3, 10), (5, 5))
    flowers(g, (33, 4), (35, 6), (32, 8), (36, 3), (34, 10))
    flowers(g, (56, 20), (58, 22), (56, 24), (57, 26), (59, 21))
    flowers(g, (2, 20), (3, 22), (2, 24), (4, 21))
    flowers(g, (24, 28), (26, 29), (22, 31), (28, 27))
    flowers(g, (48, 36), (50, 38), (47, 40), (52, 37))
    flowers(g, (2, 42), (3, 44), (2, 46), (4, 43))
    flowers(g, (30, 48), (32, 50), (28, 49), (33, 47))
    flowers(g, (56, 50), (58, 52), (57, 54), (55, 48))
    flowers(g, (14, 68), (16, 70), (13, 66), (15, 72))
    flowers(g, (48, 72), (50, 70), (52, 73), (46, 68))
    flowers(g, (38, 20), (12, 36), (44, 56), (20, 64), (60, 30))

    # A path run that clips the end of a tree wall leaves half a pair behind,
    # and half a pair is a tile the renderer has no piece for. `build()` has
    # always run this for the generated maps; a drawn map that paints paths over
    # masses needs it just as much, and it drops what cannot be drawn rather
    # than forbidding the overlap that makes the walls read as walls.
    repair_trees(g, W, H, ".")

    # Standing on the path at the southern entrance, facing up the route.
    return ["".join(r) for r in g], (33, 75)


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


def pier(g, x0, y0, x1, y1):
    """A stretch of wooden pier. Walkable, and drawn with a rail down each side.

    The deck is a 3x3 autotile like the path, so it only has to be at least
    three wide to get a rail on both sides with deck in between - two would be
    all rail. check() asserts that, and that a run has somewhere to step on and
    off at each end, because a pier you cannot leave is the one way this can be
    laid out wrong and still look right."""
    rect(g, "D", x0, y0, x1, y1)


def pond_shore():
    """Pond & Shore: one great lake, walked around and walked across.

    84x68, of which 80x62 is playable. The old one was 42x34 and had a single
    lake with one island; this has the same subject at four times the size,
    which means the lake can do what a real one does - reach into bays, break
    into islands, and leave a shore that is worth following rather than a rim
    you cross in six steps.

    Everything the small one got right is kept, and it is all about asymmetry:

      * the lake is widest along its north edge and tapers south-west in
        right-angled steps, the way FireRed shapes water. Water carries its rim
        on its top and sides only - the foot of a lake simply meets the grass -
        so every step in the outline has to be a right angle or the rim has
        nothing to turn on.
      * the islands are not centred and the bridges do not line up. You arrive
        from the south beach, cross to the big island, walk its length, and take
        a second span north - a dog-leg, so the crossing is a route rather than
        a line drawn through the middle of the map.
      * going round is always open, so a bridge is a shortcut you choose and
        never a gate.

    The three numbers the layout tool flagged on the small one are the brief for
    this one: loops 76.7 against a real route's 71.0-75.1, tight 0.48 against
    0.50-0.57, and dead 0.00. All three say the same thing - too much open
    ground with nothing near you - so the extra space goes to tree masses and
    fields rather than to more water."""
    W, H = 84, 68
    g = [["." for _ in range(W)] for _ in range(H)]

    # --- the frame -------------------------------------------------------
    rect(g, "T", 0, 0, W - 1, 2)
    rect(g, "T", 0, H - 3, W - 1, H - 1)
    rect(g, "T", 0, 0, 1, H - 1)
    rect(g, "T", W - 2, 0, W - 1, H - 1)

    # --- the lake, in right-angled steps ----------------------------------
    rect(g, "w", 30, 6, 74, 10)
    rect(g, "w", 24, 11, 74, 22)
    rect(g, "w", 20, 23, 68, 32)
    rect(g, "w", 26, 33, 62, 40)
    rect(g, "w", 34, 41, 54, 46)

    # --- what stands in the water -----------------------------------------
    # Carved back out rather than drawn on top, so the lake stays one shape with
    # holes in it and the rim wraps each hole by itself.
    rect(g, ".", 36, 14, 55, 20)        # the big island - bridges only
    rect(g, ".", 30, 27, 39, 31)        # the west island
    # Stopping at 65, not 66: the lake reaches x68 here, so a headland ending
    # at 66 leaves a two-tile channel behind it and water runs three wide at
    # the least - anything narrower has no rim to draw.
    rect(g, ".", 58, 25, 65, 30)        # a headland off the east shore
    rect(g, ".", 66, 6, 74, 9)          # a spur off the north, making a bay
    # NO SHOAL IN THE SOUTHERN REACH. There was one, and it was exactly the 36
    # tiles the reachability count could not get to: an island with no bridge is
    # scenery you can see and never stand on, which is the fault that check
    # exists for. Left as open water.

    # --- the crossings, in spans that do not line up ----------------------
    # BRIDGES, not piers. A pier is a JETTY - it runs out from land and stops,
    # and its outer ring is drawn to meet sand, so laying it across open water
    # fringes the span in beach. Every tile of these has water on both sides and
    # dry ground at each end, which is a bridge, and the planks are baked for
    # exactly that. Two across, never three: Route 12's own bridge is two wide,
    # so the set is a left half and a right half and `bridgeId()` picks by
    # parity - a third column comes out left/right/left and draws a rail down
    # the middle of its own deck.
    bridge(g, 44, 6, 45, 13, over="water")    # big island -> north shore
    bridge(g, 38, 21, 39, 26, over="water")   # big island -> west island
    bridge(g, 32, 32, 33, 40, over="water")   # west island -> south shore
    # NORTH-SOUTH, like every other span here, and that is structural rather
    # than stylistic: water carries its rim on its top and sides only, so the
    # row under a body of water has to be a bank. An east-west bridge puts its
    # own planks there and the lake above it ends on nothing - which is exactly
    # what check() said when one was tried.
    # At x58, not x60: the lake's south-east reach ends at x62, so a span two
    # columns further east leaves a single tile of water behind it.
    bridge(g, 58, 31, 59, 40, over="water")   # east headland -> south shore

    # --- sand, only where you walk ---------------------------------------
    rect(g, "#", 14, 4, 78, 5)           # the north shore
    rect(g, "#", 14, 4, 17, 51)          # down the west bank
    # ONE ROW CLEAR OF THE WATER'S FOOT. A lake carries no rim along its
    # bottom - the tile below it is the walkable bank, and `shore()` makes one
    # out of grass. Sand painted on that row leaves the water ending on beach
    # with no bank at all, which is what check() catches.
    rect(g, "#", 14, 48, 60, 51)         # the southern beach
    rect(g, "#", 75, 6, 78, 46)          # the east bank
    rect(g, "#", 40, 51, 43, 62)         # the lane south, where you come in

    # --- tree masses, which are what the three flags actually asked for ---
    # Rectangles with right angles, like Route 1's own. A mass takes floor out
    # of `open` and its straight edges keep `turns` down, and both of those are
    # what turns a shore into somewhere rather than a margin.
    for x0, y0, x1, y1 in (
            (2, 6, 11, 10), (2, 18, 11, 22), (2, 30, 11, 34),
            (2, 42, 11, 46), (2, 54, 13, 58), (18, 54, 29, 58),
            (46, 54, 57, 58), (62, 52, 73, 56), (20, 6, 27, 9),
            (62, 58, 73, 62), (30, 58, 37, 62), (76, 50, 81, 60),
    ):
        rect(g, "T", x0, y0, x1, y1)

    # --- tall grass, in rectangles of several sizes ----------------------
    for x0, y0, x1, y1 in (
            (2, 12, 11, 16), (2, 24, 11, 28), (2, 36, 11, 40),
            (2, 48, 13, 52), (18, 51, 38, 53), (44, 51, 60, 53),
            (62, 46, 74, 50), (18, 60, 29, 64), (44, 60, 60, 64),
            (66, 12, 74, 18), (70, 26, 78, 34), (38, 16, 53, 19),
            (32, 28, 37, 30), (60, 26, 65, 29), (18, 6, 19, 22),
    ):
        onto_grass(g, ",", x0, y0, x1, y1)

    # --- trees standing in the open --------------------------------------
    for x, y in ((4, 4), (44, 17), (34, 29), (62, 27), (14, 60),
                 (72, 20), (24, 48), (52, 48), (68, 42), (8, 62)):
        clump(g, x, y)
    # ...and then wherever the map is emptiest. Taller than they are wide, for
    # the reason the meadow records: a 2x5 buys the same `turns` as a 2x3 and
    # nearly twice the `tight`.
    # SHORTER AND MORE OF THEM, which is the opposite of the meadow's answer
    # and for the opposite reason. This map came out at turns 0.08 against a
    # real route's 0.11-0.18 - BELOW the band, not above it - and tight 0.38
    # against 0.50: all big rectangles and nothing near you. A lake is already
    # one enormous straight-edged mass, so the trees here have to supply the
    # texture the water cannot.
    fill_the_empty(g, want=80, tall=3)
    make_nooks(g, want=8)

    # --- ledges: the way back down, the gap between them the way up ------
    # Searched rather than placed - see `ledge_in` - and laid after the trees,
    # because `fill_the_empty` stands them wherever the map is emptiest and
    # "emptiest" is exactly where a ledge was given its approach.
    for row in (23, 35, 47, 59):
        ledge_in(g, row, 3, W // 2 - 1)
        ledge_in(g, row, W // 2, W - 4)

    # --- flowers, in loose handfuls on whatever grass is left ------------
    flowers(g, (4, 4), (6, 7), (3, 11), (5, 14))
    flowers(g, (8, 26), (4, 31), (9, 35), (6, 39))
    flowers(g, (40, 18), (46, 17), (50, 19), (43, 16))   # on the big island
    flowers(g, (33, 29), (36, 30), (34, 31))             # on the west island
    flowers(g, (69, 8), (72, 7), (70, 9))                # on the north spur
    flowers(g, (20, 52), (26, 53), (33, 52), (48, 53))
    flowers(g, (66, 48), (70, 47), (73, 49))
    flowers(g, (16, 62), (22, 63), (52, 62), (58, 61))

    repair_trees(g, W, H, ".")
    shore(g)

    # Standing in the south lane, looking up it towards the water.
    return ["".join(r) for r in g], (41, 61)


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


def bridge(g, x0, y0, x1, y1, over="lava"):
    """A plank bridge. The character says what it crosses - `n` lava, `N` water -
    because the planks are baked over that, not layered over it at draw time.

    Two across the way you walk, which is the width Route 12's own bridge is:
    the planks lie crosswise and alternate, so one tile of width is half a
    bridge. Long enough to reach dry ground at both ends - check() asserts it
    actually crosses something."""
    rect(g, "n" if over == "lava" else "N", x0, y0, x1, y1)


def span_blobs(g):
    """Every bridge on the map, as (char, set of cells). Shared by the healer and
    the checker so the two cannot disagree about where a bridge is."""
    H, W = len(g), len(g[0])
    seen, out = set(), []
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
            out.append((ch, blob))
    return out


def spans_clear(g):
    """Has every bridge still got dry ground across its WHOLE width, both ends?

    Same fault as ladders_clear, and found the same way: a pool sunk north of
    the caldera's causeway merged with the lake, drowned the approach, and left
    a span you could walk onto from the south and never leave.

    It used to ask whether the blob had walkable ground somewhere on its north
    edge and somewhere on its south edge, and Ember's causeway passed that while
    being visibly broken - two wide, and only its left column landed. One tile
    of landing is not a bridge, it is a bridge with a shelf attached, and that
    is what "misaligned" looked like on screen. Every column of a vertical span
    has to land, every row of a horizontal one."""
    for ch, blob in span_blobs(g):
        H, W = len(g), len(g[0])
        walk = lambda x, y: (0 <= x < W and 0 <= y < H
                             and g[y][x] != ch and g[y][x] not in SOLID)
        xs = sorted({cx for cx, _ in blob})
        ys = sorted({cy for _, cy in blob})
        vert = (all(walk(cx, min(ys) - 1) for cx in xs)
                and all(walk(cx, max(ys) + 1) for cx in xs))
        horz = (all(walk(min(xs) - 1, cy) for cy in ys)
                and all(walk(max(xs) + 1, cy) for cy in ys))
        if not (vert or horz):
            return False
    return True


# ------------------------------------------------------------- Ember Caldera

"""Ember Caldera is a RE-SKIN, which is a third kind of copy.

Route 1, the Power Plant and the Safari Zone carry the real map's own metatile
ids and draw with them. Mt Moon does too. This one does NOT: it takes Emerald's
Victory Road - three floors, 1F / B1F / B2F, the shape of the place - and draws
every cell with OUR volcano set, the pokeemerald `lavaridge` tileset behind
Magma Hideout. The layout is transcribed; the art is ours.

**WHY IT HAS TO BE A RE-SKIN.** There is no three-floor volcano in any Gen 3
game. Magma Hideout is the only lava interior that exists and it is eight small
rooms, not a cave you descend. The choice was a real volcano that is not a
descent or a real descent that is not a volcano, and the second one is the one
you can fix: a cave's LAYOUT is just walkable and solid, and both tilesets can
draw that. What cannot be borrowed is the grammar, which is why this is the one
transcription whose cells are AUTHORED - `tiles` is -1 everywhere and
`drawTile` runs the same rules it runs for a map we drew.

**AND THE WATER BECOMES LAVA**, which is the whole reason this map is worth
copying: B2F is 256 tiles of it, a lake with a waterfall feeding it, and Ember
is the one place in the game that is largely molten. `SURFABLE` already holds
`V`, so it is ridden exactly as the old caldera's lake was.

**THREE THINGS THE RE-SKIN COSTS, all measured rather than waved at:**

  *Thin rock is carved.* Our rock is a 3x3 autotile and needs a 2x2 to resolve,
  and a real cave is full of one-tile walls - 102 of 3,124 here, 3%. Those
  become floor, which widens 102 spots by a tile. `thicken_walls` is the same
  pass the generated caldera used and the reason it exists.

  *The shore is banked.* `lava_banks` turns the floor above and beside the lava
  into rock, because in this tileset the rim is drawn on the ROCK and not on
  the lava - see the note under `volcano` in route.json, which this file paid
  for once already. The lake's bottom edge stays bare, which is both what Magma
  Hideout does and how you get onto it.

  *The bridges are floor.* Victory Road crosses its chasms on planks; our plank
  set is Route 12's, baked over lava, and a bridge over nothing is not in the
  vocabulary. They read as volcanic floor, and the route across is unchanged.
"""

EMBER_FLOORS = (("VictoryRoad_1F", 46, 45), ("VictoryRoad_B1F", 46, 31),
                ("VictoryRoad_B2F", 46, 31))
EMBER_GUT = 2
# Resolved out of the three map.json warp tables: seven reciprocal pairs, as
# (floor, x, y). The two Ever Grande mouths are not pairs - one of them is the
# way in, and the other leads somewhere this game has no map for.
EMBER_LADDERS = (
    ((0, 21, 32), (1, 20, 21)),
    ((0, 42, 38), (1, 42, 25)),
    ((0,  9, 14), (1,  8,  3)),
    ((1, 30, 25), (2, 30, 25)),
    ((1, 17, 16), (2, 19, 12)),
    ((1, 42,  2), (2, 43,  2)),
    ((1,  5, 26), (2,  5, 26)),
)
EMBER_MOUTH = (0, 15, 40)          # Ever Grande's door, and so the spawn

# pokeemerald behaviours, bits 0-8 of the metatile attribute.
EMB_WATER = frozenset((0x10, 0x11, 0x12, 0x13, 0x14, 0x15))
EMB_LADDER = 0x61
EMB_JUMP_SOUTH = 0x3B


def volcano():
    """Ember Caldera: 94x64, Emerald's Victory Road drawn in lava.

    Laid out the way Mt Moon is - floors as quadrants of one grid, joined by
    the real map's own warps - because that machinery already exists and this
    is the same shape of problem."""
    import numpy as np
    import build_assets as BA

    layouts = json.load(io.open(
        BA.fetch("data/layouts/layouts.json", "em/layouts.json", root=BA.EMERALD),
        encoding="utf-8"))["layouts"]
    ga = np.frombuffer(io.open(BA.fetch(
        "data/tilesets/primary/general/metatile_attributes.bin",
        "em/general/attr.bin", root=BA.EMERALD), "rb").read(), dtype="<u2")
    ca = np.frombuffer(io.open(BA.fetch(
        "data/tilesets/secondary/cave/metatile_attributes.bin",
        "em/cave/attr.bin", root=BA.EMERALD), "rb").read(), dtype="<u2")
    behave = lambda i: int((ga[i] if i < 512 else ca[i - 512]) & 0x1FF)

    w0, h0 = EMBER_FLOORS[0][1], EMBER_FLOORS[0][2]
    h1 = EMBER_FLOORS[1][2]
    origin = [(0, 0), (w0 + EMBER_GUT, 0), (w0 + EMBER_GUT, h1 + EMBER_GUT)]
    W = w0 + EMBER_GUT + EMBER_FLOORS[1][1]
    H = max(h0, h1 + EMBER_GUT + EMBER_FLOORS[2][2])

    g = [["M"] * W for _ in range(H)]
    ladder_cells = {(f, x, y) for pair in EMBER_LADDERS for (f, x, y) in pair}
    for i, (name, fw, fh) in enumerate(EMBER_FLOORS):
        lay = next(q for q in layouts if q["name"] == name + "_Layout")
        assert lay["width"] == fw and lay["height"] == fh, \
            f"ember: {name} is {lay['width']}x{lay['height']}, not the {fw}x{fh} assumed"
        raw = np.frombuffer(io.open(BA.fetch(
            lay["blockdata_filepath"], "em/%s.bin" % name,
            root=BA.EMERALD), "rb").read(), dtype="<u2")[:fw * fh]
        ids = (raw & 0x3FF).reshape(fh, fw)
        col = ((raw >> 10) & 3).reshape(fh, fw)
        ox, oy = origin[i]
        for y in range(fh):
            for x in range(fw):
                b = behave(int(ids[y][x]))
                if b in EMB_WATER:
                    ch = "V"                     # the lake, and the fall into it
                elif (i, x, y) in ladder_cells:
                    ch = "l"
                elif b == EMB_JUMP_SOUTH:
                    # NO LEDGE, BECAUSE THIS TILESET HAS NONE. Victory Road
                    # drops nine one-way hops between its terraces and `L`
                    # draws `ledge` out of route.json - 176/135/177, FireRed's
                    # grass-topped earth bank. On lavaridge that is a strip of
                    # MEADOW across a volcano, which is exactly the wrong-tile
                    # this re-skin exists to avoid; it was visible in the first
                    # render as two green bars. Magma Hideout has no terraces
                    # and so no hop to borrow. They become floor - which is
                    # what a terrace edge is once you can walk over it - and
                    # the route is unchanged, because a ledge was only ever a
                    # shortcut down something you could already walk around.
                    ch = "m"
                elif int(col[y][x]):
                    ch = "M"
                else:
                    ch = "m"
                g[oy + y][ox + x] = ch

    # --- the frame -------------------------------------------------------
    # Three floors in one rectangle, and the rectangle's edge is ours. Each
    # floor's own border is interior to the composition; B1F leaves seven cells
    # open on its edge and they simply meet the gutter's rock.
    rect(g, "M", 0, 0, W - 1, 1)
    rect(g, "M", 0, H - 2, W - 1, H - 1)
    rect(g, "M", 0, 0, 1, H - 1)
    rect(g, "M", W - 2, 0, W - 1, H - 1)

    # --- make it something this tileset can draw --------------------------
    # KEEP THE LADDERS AND THE LEDGES OUT OF BOTH PASSES. `lava_banks` turns
    # anything beside the lake into rock and does not know that a rung or a hop
    # is not floor; losing one to the bank is losing a floor of the map.
    # A LANDING KEEPS ITS FLOOR, and this guard is what that means.
    # `lava_banks` turns everything above and beside the lake into rock, and
    # Victory Road puts a 3x2 LANDING PLATFORM in the middle of its lake -
    # reached by ladder, left by Surf. Banked, that platform went solid and the
    # rung became an island: reported from play as arriving somewhere with
    # nothing walkable in any direction. Ember opens at Lv 12 and Surf is Lv
    # 20, so it was not even a hard exit, it was a dead save.
    #
    # So the rung AND its four neighbours are held back from both passes. Five
    # tiles of lava keep no rim where they meet that floor, which `check()`
    # exempts within one tile of a rung and nowhere else.
    hold = set()
    for _pair in EMBER_LADDERS:
        for _f, _lx, _ly in _pair:
            _gx, _gy = origin[_f][0] + _lx, origin[_f][1] + _ly
            hold.add((_gx, _gy))
            hold.update(((_gx + 1, _gy), (_gx - 1, _gy),
                         (_gx, _gy + 1), (_gx, _gy - 1)))
    # Only the WALKABLE ones. Holding a rock neighbour back as well put a
    # one-tile-thin wall back at (64,16) - `thicken_walls` had carved it for
    # the reason it exists, and the landing has no interest in rock.
    keep = {(x, y): g[y][x] for (x, y) in hold
            if 0 <= x < W and 0 <= y < H and g[y][x] in "ml"}
    thicken_walls(g, "m", "M")
    lava_banks(g)
    thicken_walls(g, "m", "M")
    for (x, y), ch in keep.items():
        g[y][x] = ch

    # --- the ladders, as warp pairs on the shared grid --------------------
    warps = []
    for (fa, xa, ya), (fb, xb, yb) in EMBER_LADDERS:
        ax, ay = origin[fa][0] + xa, origin[fa][1] + ya
        bx, by = origin[fb][0] + xb, origin[fb][1] + yb
        assert g[ay][ax] == "l" and g[by][bx] == "l", \
            f"ember: the ladder at ({ax},{ay})/({bx},{by}) is not on a rung"
        warps.append([ax, ay, bx, by])

    mf, mx, my = EMBER_MOUTH
    spawn = (origin[mf][0] + mx, origin[mf][1] + my)
    assert g[spawn[1]][spawn[0]] not in SOLID, "ember: the mouth is walled up"

    hop = {}
    for ax, ay, bx, by in warps:
        hop[(ax, ay)] = (bx, by)
        hop[(bx, by)] = (ax, ay)
    seen, stack = set(), [spawn]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        stack += walk_steps(g, x, y)
        if (x, y) in hop:
            stack.append(hop[(x, y)])
    for y in range(H):
        for x in range(W):
            if g[y][x] not in SOLID and (x, y) not in seen:
                g[y][x] = "M"

    return ["".join(r) for r in g], spawn, None, None, warps
# THE POKEMON TOWER, ALL SEVEN FLOORS, TRANSCRIBED.
#
# Lavender Town's tower, 1F to 7F, laid out on one grid the way the Mansion
# lays out its four: the ground floor and the three above it along the bottom,
# the top three above them. Every layout is 24x20 and every one is drawn
# against pokefirered's `building` primary plus `pokemon_tower` - both baked
# since the Mansion and the old tower - so it costs no new art at all.
TOWER_FLOORS = ("1F", "2F", "3F", "4F", "5F", "6F", "7F")
TOWER_FW, TOWER_FH = 24, 20
TOWER_GUT = 2
TOWER_SPLIT = 640
# Where each floor sits, in floor cells: the bottom row climbs left to right,
# the top row carries on from there.
TOWER_AT = ((0, 1), (1, 1), (2, 1), (3, 1), (0, 0), (1, 0), (2, 0))
# All seven layouts tile the same 2x2 border block - `pokemon_tower` local 1,
# the black the real oval floats in - so the gutters read as the nothing they
# are, the Mansion's argument exactly.
TOWER_BORDER_MT = 641
# The headstone and the grave set into the wall face. A cell is a GRAVE only
# if it is one of these AND solid, because collision belongs to the map. 649
# is 7F's GOLD headstone - 92 of them, on that floor and no other - and it is
# Game Freak's own tile, not a palette fault; left out, the minimap drew the
# top floor's graveyard as solid wall.
TOWER_GRAVE_MT = {657, 649}
TOWER_WALL_GRAVE_MT = {728, 729}
# 5F's purification ward: 665-667 over 673-675 over 681-683, walkable.
TOWER_WARD_MT = {665 + r * 8 + c for r in range(3) for c in range(3)}

# THE LADDER GRAPH IS READ, NOT INVENTED - each floor's `warp_events`, resolved
# to the pairs that answer each other. Floor index into TOWER_FLOORS. The
# staircases alternate sides going up, as the real building does.
TOWER_STAIRS = (
    ((0, 18, 9), (1, 18, 10)),      # 1F <-> 2F
    ((1, 4, 10), (2, 4, 10)),       # 2F <-> 3F
    ((2, 18, 10), (3, 18, 10)),     # 3F <-> 4F
    ((3, 4, 10), (4, 4, 10)),       # 4F <-> 5F
    ((4, 18, 10), (5, 18, 10)),     # 5F <-> 6F
    ((5, 11, 16), (6, 11, 16)),     # 6F <-> 7F
)
# The front door onto Lavender Town - and the spawn. Its two neighbours on
# row 19 lead outside, where this game has no map, and are solid there anyway.
TOWER_DOOR = (0, 11, 18)


def haunted_tower():
    """The Haunted Tower: Pokemon Tower 1F-7F, 102x42, every cell a copy.

    It was a generated square room for as long as a round one looked
    impossible: "a round room on a square grid spends its whole silhouette on
    stepped diagonals, and every step wants a wall piece". That was a limit of
    OUR autotile, and a transcription never reaches the autotile - the oval is
    Game Freak's own cells, carried as fixed ids, stepped diagonals and all.

    The id stayed `tower` and the name stayed Haunted Tower, for the reason
    Mt Moon kept `ridge`: renaming it moves every save standing there.
    """
    import numpy as np
    import build_assets as BA

    meta = json.load(io.open(os.path.join(ROOT, "public", "tilesets", "route.json"),
                             encoding="utf-8"))
    PB = meta["mansion"]["building"]           # pokefirered's Building, baked whole
    SB = meta["tower"]["floor"] - 2            # pokemon_tower local 2 is the floor
    rebase = lambda i: (PB + i) if i < TOWER_SPLIT else (SB + i - TOWER_SPLIT)

    cols = 1 + max(c for c, _r in TOWER_AT)
    rws = 1 + max(r for _c, r in TOWER_AT)
    W = cols * TOWER_FW + (cols - 1) * TOWER_GUT
    H = rws * TOWER_FH + (rws - 1) * TOWER_GUT
    origin = [(c * (TOWER_FW + TOWER_GUT), r * (TOWER_FH + TOWER_GUT)) for c, r in TOWER_AT]

    g = [["H"] * W for _ in range(H)]
    tiles = [[rebase(TOWER_BORDER_MT)] * W for _ in range(H)]
    doors = {(f, x, y) for pair in TOWER_STAIRS for (f, x, y) in pair}

    for i, fl in enumerate(TOWER_FLOORS):
        name = "PokemonTower_" + fl
        raw = np.frombuffer(io.open(BA.fetch(f"data/layouts/{name}/map.bin",
                                             name + ".bin"), "rb").read(),
                            dtype="<u2")[:TOWER_FW * TOWER_FH]
        ids = (raw & 0x3FF).reshape(TOWER_FH, TOWER_FW)
        col = ((raw >> 10) & 3).reshape(TOWER_FH, TOWER_FW)
        ox, oy = origin[i]
        for y in range(TOWER_FH):
            for x in range(TOWER_FW):
                mid, solid = int(ids[y][x]), bool(col[y][x])
                if (i, x, y) in doors:
                    ch = "l"                          # a staircase
                elif not solid:
                    ch = "y" if mid in TOWER_WARD_MT else "h"
                elif mid in TOWER_GRAVE_MT:
                    ch = "G"
                elif mid in TOWER_WALL_GRAVE_MT:
                    ch = "A"
                else:
                    ch = "H"
                g[oy + y][ox + x] = ch
                tiles[oy + y][ox + x] = rebase(mid)

    for x in range(W):
        for y in (0, H - 1):
            g[y][x] = "H"
    for y in range(H):
        for x in (0, W - 1):
            g[y][x] = "H"

    seal_hidden(g, tiles, "H")

    warps = []
    for (fa, xa, ya), (fb, xb, yb) in TOWER_STAIRS:
        ax, ay = origin[fa][0] + xa, origin[fa][1] + ya
        bx, by = origin[fb][0] + xb, origin[fb][1] + yb
        assert g[ay][ax] == "l" and g[by][bx] == "l", \
            f"tower: the stair at ({ax},{ay})/({bx},{by}) is not on a landing"
        warps.append([ax, ay, bx, by])

    fd, fx, fy = TOWER_DOOR
    spawn = (origin[fd][0] + fx, origin[fd][1] + fy)
    assert g[spawn[1]][spawn[0]] not in SOLID, "tower: the front door is a wall"

    # WHAT THE COLLISION BIT CALLS PASSABLE IS NOT WHAT YOU CAN REACH: 7F's
    # rim carries a few passable fragments no stair leads to. Solid, and still
    # their own art.
    hop = {}
    for ax, ay, bx, by in warps:
        hop[(ax, ay)] = (bx, by)
        hop[(bx, by)] = (ax, ay)
    seen, stack = set(), [spawn]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        stack += walk_steps(g, x, y)
        if (x, y) in hop:
            stack.append(hop[(x, y)])
    culled = 0
    for y in range(H):
        for x in range(W):
            if g[y][x] not in SOLID and (x, y) not in seen:
                g[y][x] = "H"
                culled += 1

    print("   tower  %d walkable reached, %d unreachable culled to wall, %d graves"
          % (len(seen), culled, sum(1 for r in g for c in r if c in "GA")))

    return (["".join(r) for r in g], spawn,
            [i for row in tiles for i in row], PB, warps)


def seafoam_floor(floor="B3F", rungs=()):
    """One Seafoam floor from its own map.bin. (rows, ids, base, ways)

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

    `rungs` IS WHICH LADDERS LEAD SOMEWHERE, and it used to be none of them.
    This took one floor and threw every ladder away under the note *"they lead
    to B4F there and nowhere here"* - true while B4F was not in the game. All
    five floors are laid out now and Seafoam's own warp graph joins them, so a
    rung named here keeps its character AND its metatile: the way down is the
    one Game Freak drew, at the coordinate his map.json gives.

    Anything NOT named still becomes the ground it stood in, which is the old
    behaviour and is what the six one-way falls get - see `FROST_LADDERS`.

    What else changes on the way in:
      * Elevation 0 is three different things in Seafoam - the step, shelf edges
        doing duty as a ramp, and the snow fringe outside the cave - and only
        the first is a staircase.
      * NOTHING IS CROPPED. This used to stop at 22 rows and wall off everything
        below row 20, which was a hand-tuned description of B3F's border fill
        and cut real floor off the other four - B2F and B3F both run content to
        row 23. `frost_hollow` seals whatever its own reachability fill cannot
        get to instead, which is the same fact measured per floor rather than
        guessed once.
    """
    import numpy as np
    import build_assets as BA

    rungs = set(rungs)
    LADDERS = {5, 14, 15, 22, 23, 45, 46, 47, 53, 55}
    HOLES = {6}
    ROCKS = {2, 3, 39, 54, 79}
    ICICLES = {29, 30, 37, 38}
    FALL_PRIM = {295, 303, 311}
    MOUTH = {12}

    binf = BA.fetch("data/layouts/SeafoamIslands_%s/map.bin" % floor,
                    "SeafoamIslands_%s.bin" % floor)
    lay = json.load(io.open(os.path.join(BA.SRC, "layouts.json")))
    L = next(x for x in lay["layouts"]
             if x.get("name") == "SeafoamIslands_%s_Layout" % floor)
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
        if (x, y) in rungs:
            return "s"
        if i in FALL_PRIM or loc in MOUTH:
            return "K"
        if c:
            if loc in ICICLES:
                return "t"
            return "d" if loc in ROCKS else "I"
        if e == 1:
            return "k"
        if loc in LADDERS or loc in HOLES:
            return "j" if e == 4 else "i"     # a rung to nowhere is its ground
        if e == 4:
            return "j"
        if e == 0:
            if loc == 4:
                return "s"
            if loc in (90, 91, 92, 215, 216):
                return "j"
            return "I"
        return "i"

    # WHAT THE REAL MAP SAYS ABOUT EACH NAMED RUNG, because `classify` returns
    # `s` for one by fiat and an assertion downstream on the character it just
    # forced would be checking our own arithmetic. "A LITERAL IN AN ASSERTION IS
    # NOT A RULE", one turn further on: neither is a tautology. Caught by moving
    # a warp onto open water and watching the build pass.
    #
    # Ground is the flat requirement - a warp onto rock is a trap and a warp
    # onto WATER puts a trainer on a ride he never mounted, which is the one
    # thing `surf()` gates. `ways` is the softer half, and it is what makes a
    # pair legible: a real ladder or boulder hole, the tile Game Freak drew as
    # a way through. A hole LANDS on plain ice, so only one end need be one.
    ways = set()
    for rx, ry in rungs:
        c, e = int(col[ry][rx]), int(ele[ry][rx])
        assert c == 0 and e != 1, (
            "seafoam %s: the warp at (%d,%d) is on %s, not on ground"
            % (floor, rx, ry, "a wall" if c else "water"))
        if (int(ids[ry][rx]) - 640) in (LADDERS | HOLES):
            ways.add((rx, ry))

    g, tiles = [], []
    for y in range(h):
        row, trow = [], []
        for x in range(w):
            ch = classify(x, y)
            i = int(ids[y][x])
            keep = ((x, y) in rungs
                    or ((i - 640) not in LADDERS and (i - 640) not in HOLES))
            row.append(ch)
            trow.append((i if i < 640 else base + (i - 640)) if keep else -1)
        g.append(row)
        tiles.append(trow)
    return g, tiles, base, ways


# Seafoam's own five floors and the warp graph joining them, resolved out of
# the five map.json warp tables. THE LADDER GRAPH IS READ, NOT INVENTED - the
# same sentence Mt Moon and Cinderpeak are built on.
#
# SIXTEEN OF THE TWENTY, AND WHICH FOUR ARE DROPPED IS THE INTERESTING PART.
# Twelve are ladder-to-ladder and reciprocal, so they are simply pairs. Six are
# BOULDER HOLES - one-way falls, `loc 6` - and a hole that only works downwards
# is exactly what this repo already made two-way in the Pokemon Mansion, so
# four of them are pairs here too: the hole is visible art at the top and you
# land on the lower floor's own ice.
#
# THE OTHER TWO LAND IN WATER. B3F (6,18) and (9,18) fall onto `loc 140` at
# elevation 1 - B4F's lake - because in the real game what you push down them
# is a BOULDER, to make a stepping stone. Warping a trainer onto water would
# put him on a ride he never mounted, which is the one thing `surf()` gates and
# `tryStep` refuses; "SURFING IS NOT A FLAG, IT IS WHERE YOU ARE STANDING" cuts
# both ways. They become the ground they stood in, and B3F still reaches B4F on
# two real ladders.
#
# The two Route 20 mouths are not pairs either. One of them is the way in, and
# so the spawn; the other leads somewhere this game has no map for.
FROST_FLOORS = ("1F", "B1F", "B2F", "B3F", "B4F")
FROST_GUT = 2
FROST_LADDERS = (
    ((0, 10,  6), (1, 10,  6)),
    ((0, 31,  4), (1, 31,  4)),
    ((0, 28, 19), (1, 28, 19)),
    ((0, 21,  8), (1, 21,  8)),      # hole
    ((0, 30,  8), (1, 29,  8)),      # hole
    ((1,  7,  3), (2,  7,  4)),
    ((1, 17,  9), (2, 17,  9)),
    ((1, 25, 19), (2, 25, 19)),
    ((1, 32, 14), (2, 32, 14)),
    ((1, 23,  8), (2, 22,  7)),      # hole
    ((1, 28,  8), (2, 29,  8)),      # hole
    ((2,  7, 17), (3,  8, 14)),
    ((2, 32,  4), (3, 31,  4)),
    ((2, 31, 17), (3, 31, 16)),
    ((3, 12,  9), (4, 15,  9)),
    ((3, 29,  5), (4, 32,  5)),
)
FROST_MOUTH = (0, 6, 21)             # Route 20's door, and so the spawn


def frost_hollow():
    """Frost Hollow: 78x76, all five floors of Seafoam Islands, tile for tile.

    THE MAP COULD NOT SIMPLY BE SCALED, and that is the whole shape of this
    one. Every other map here grew by drawing more of itself; this one IS
    Seafoam Islands, read out of its own map.bin, and a transcription stretched
    to twice the size is not a transcription any more. So it grew the only way
    a copy honestly can: by copying MORE.

    AND THE JOINS ARE SEAFOAM'S NOW, WHICH IS THE WHOLE OF THIS PASS. It shipped
    as four floors in a square with passages SEARCHED FOR through the rock
    between them, plus a bridge across B3F's river - about two hundred authored
    cells, none of which Game Freak drew, on the one map in the game whose
    entire argument is that it is a copy. The tunnels were there because the
    ladders had been thrown away, and the ladders had been thrown away because
    B4F was not in the game. It is now: five floors, `FROST_LADDERS`, and
    **nothing authored inside a floor at all**. The bridge went with them -
    Surf arrived after it was drawn, and a river you ride is what a river in
    this tileset is for.

    Laid out 2x3 in reading order, which is the order you walk them, so the cave
    reads as a descent - the same quadrant trick Mt Moon and Ember Caldera use,
    and for the same reason: three AREAS would have been three biome rows, three
    level gates and three lines in the travel menu, for one place. The sixth
    slot has no floor to hold and stays rock.

    WHAT IS AUTHORED IS THE FRAME AND NOTHING ELSE. Every floor's own border is
    interior to the composition rather than the edge of it, so the outer ring is
    ours to draw - reported once from play as walkable walls, when seventeen
    shelf tiles sat ON the boundary with nothing beyond them.

    AND THE SEAL IS THE CROP. Each floor carries border fill you can see and
    never reach - the snow outside the cave mouth, the strip down the left edge
    - and the old code cut it with a row number measured on B3F, which walled
    off real floor on the two that run content to row 23. The reachability fill
    is what decides now, per cell: anything the player cannot get to on foot or
    on Surf becomes rock. 2,013 walkable cells in, 1,847 out, and 98.6% of those
    are reachable without the ride.

    Everything we author gets an id of -1 and is drawn by the rules; everything
    copied keeps the real map's own tile."""
    QW, QH, GUT = 38, 24, FROST_GUT

    rungs = [set() for _ in FROST_FLOORS]
    for (fa, xa, ya), (fb, xb, yb) in FROST_LADDERS:
        rungs[fa].add((xa, ya))
        rungs[fb].add((xb, yb))

    floors = [seafoam_floor(f, rungs[i]) for i, f in enumerate(FROST_FLOORS)]
    base = floors[0][2]
    assert all(len(fg[0]) == QW and len(fg) <= QH for fg, _t, _b, _w in floors), \
        "frost: a Seafoam floor is not 38 wide or is taller than 24"

    W, H = QW * 2 + GUT, QH * 3 + GUT * 2
    g = [["I"] * W for _ in range(H)]
    tiles = [[-1] * W for _ in range(H)]
    # B1F is 23 rows where the rest are 24; the short one keeps our rock.
    origin = [(0, 0), (QW + GUT, 0),
              (0, QH + GUT), (QW + GUT, QH + GUT),
              (0, (QH + GUT) * 2)]
    for (ox, oy), (fg, ft, _b, _w) in zip(origin, floors):
        for y in range(len(fg)):
            for x in range(QW):
                g[oy + y][ox + x] = fg[y][x]
                tiles[oy + y][ox + x] = ft[y][x]

    # SEAL THE RING, and the fixed id with it. A cell keeps the real map's
    # metatile unless we authored one, so turning the character to `I` and
    # leaving Seafoam's shelf art behind would draw a floor you cannot walk on -
    # the invisible-wall bug pointing the other way.
    for x in range(W):
        for y in (0, H - 1):
            g[y][x], tiles[y][x] = "I", -1
    for y in range(H):
        for x in (0, W - 1):
            g[y][x], tiles[y][x] = "I", -1

    warps = []
    for (fa, xa, ya), (fb, xb, yb) in FROST_LADDERS:
        assert (xa, ya) in floors[fa][3] or (xb, yb) in floors[fb][3], (
            f"frost: neither end of {FROST_FLOORS[fa]}({xa},{ya}) <-> "
            f"{FROST_FLOORS[fb]}({xb},{yb}) is a ladder or a hole - there is "
            "nothing drawn there for a player to read as a way through")
        ax, ay = origin[fa][0] + xa, origin[fa][1] + ya
        bx, by = origin[fb][0] + xb, origin[fb][1] + yb
        warps.append([ax, ay, bx, by])

    mf, mx, my = FROST_MOUTH
    spawn = (origin[mf][0] + mx, origin[mf][1] + my)
    assert g[spawn[1]][spawn[0]] not in SOLID, "frost: the mouth is walled up"

    # WHAT THE PLAYER CAN GET TO, THROUGH THE LADDERS AND OVER THE WATER.
    # `k` is in `SURFABLE`, and half of B4F is lake - measured, the ride is
    # worth 26 cells that no ladder reaches, which is a floor doing what
    # Seafoam's B4F is for rather than a pocket. Everything else that cannot be
    # got to is border fill and becomes rock.
    hop = {}
    for ax, ay, bx, by in warps:
        hop[(ax, ay)] = (bx, by)
        hop[(bx, by)] = (ax, ay)
    seen, stack = set(), [spawn]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H):
            continue
        if g[y][x] in SOLID and g[y][x] != "k":
            continue
        seen.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
        if (x, y) in hop:
            stack.append(hop[(x, y)])
    for y in range(H):
        for x in range(W):
            if g[y][x] not in SOLID and (x, y) not in seen:
                g[y][x], tiles[y][x] = "I", -1

    return (["".join(r) for r in g], spawn,
            [i for row in tiles for i in row], base, warps)


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


# --------------------------------------------------------------- Power Plant

"""The Power Plant is COPIED, and it is the cheapest transcription there is.

EVERY ONE of its 1,960 tiles is a `power_plant` SECONDARY metatile - not one
primary tile in the whole map - and that tileset has been baked against its own
`building` primary since the day this file learned that pairing matters. So the
ids go in at `base + local` and nothing had to be added to the atlas at all.
Rendered through our own `drawTile` and diffed against a fresh render straight
from pokefirered: **1,960 of 1,960 metatiles identical, zero differences.**

WHAT IT REPLACES, AND WHY THE GENERATOR WENT. The hand-built Power Plant was
the most measured map in this repo - ranks generated from a pitch and a gap,
partitions placed by search and kept only if the hall stayed connected, and
`drum_clumps` growing clutter a tile at a time after masking the real map to
find the 8.7% of itself it was missing. All of that was reverse-engineering the
reference's grammar out of its own map.bin one rule at a time, and it went
well: `stripe` 1.21 against the reference's 1.63, `open` 0.50 against its 0.49,
`turns` 0.25 in band.

Three flags were still open, and the note left on them is the argument for this
change: *"closing it needs the compartments the reference has, which needs the
wall tile that does not exist yet."* The reference HAS the compartments,
because it is the reference. Transcribing closes all three by construction and
deletes four generators with about two hundred lines behind them.

The FINDINGS outlive the code and are kept in docs/decisions.md - that a Building map
is not a General map, that this tileset has no interior wall so its walls are
machinery, that metatile 54 is 117 tiles of drum body nobody had counted. Those
are what taught the repo to read a map instead of drawing one, which is the
whole reason this transcription is three lines of classification.

THE SIZE IS THE TRADE, AND IT IS THE ONLY REAL COST. 49x40 against the
generated map's 80x60, so this becomes the smallest area in the game - 961
walkable tiles where the old one had 2,399. A 1:1 copy cannot be four times the
size and still be a copy. Frost Hollow answered the same wall by laying four
Seafoam floors in a square; there is exactly one Power Plant, so there is
nothing here to square up with, and stamping the same room out four times would
be a bigger lie than a smaller map.
"""

# The room's outer wall, drawn with the void beyond it - `power.edge` in
# route.json is the middle of this set. Everything here is on the boundary ring
# and nowhere else, which is what makes the ring worth its own character.
PP_DRUM = frozenset((53, 54, 88, 89))       # drum top / body, and the crates
PP_CONSOLE = frozenset((57, 58,             # the lit console set into a bank
                        110, 111, 118, 119,  # the free-standing terminal
                        144, 152))          # screens


def power_plant():
    """Power Plant: 49x40, transcribed tile for tile from its own map.bin.

    Nothing is composed and nothing is placed. The map is read, its collision
    bits become our characters, and the eight tiles it cannot reach are taken
    away - which is the whole function.

    **THE RING IS ALREADY SOLID, which no other transcription has managed.**
    Route 1 opens onto two towns and Frost Hollow is four floors laid in a
    square with a frame that was nobody's job; the Power Plant is one sealed
    interior, so its boundary needs no seal from us and NOT ONE CELL IS
    AUTHORED. The whole map is a copy, which is as faithful as this gets.

    **A METATILE'S COLLISION COMES FROM THE MAP, NOT THE TILESET**, and five of
    these (28, 30, 33, 34, 35) are laid both walkable and solid in different
    places. So the character is read off the cell's own collision bit and the id
    only refines what KIND of solid it is - a rule that classified by id alone
    would have put twenty holes in the machinery.

    **AND EIGHT TILES ARE PASSABLE WITHOUT BEING REACHABLE** - six of shelf
    behind the machinery along the north wall and a two-tile pocket of floor -
    the same fact Route 1's tree crowns record and `study_layout.reachable()`
    was written for. They go solid and keep their art."""
    import numpy as np
    import build_assets as BA

    W, H = 49, 40
    raw = np.frombuffer(
        io.open(BA.fetch("data/layouts/PowerPlant/map.bin", "PowerPlant.bin"),
                "rb").read(), dtype="<u2")[:W * H]
    ids = (raw & 0x3FF).reshape(H, W)
    col = ((raw >> 10) & 3).reshape(H, W)

    # The atlas base is read back out of route.json rather than assumed, the
    # same as Frost Hollow's - `npm run art` moves it whenever a tileset is
    # added, and check.mjs asserts the two still agree.
    meta = json.load(io.open(os.path.join(ROOT, "public", "tilesets", "route.json"),
                             encoding="utf-8"))
    base = meta["power"]["floor"] - 31          # power_plant local 31 is the floor

    g = [[None] * W for _ in range(H)]
    tiles = [[-1] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            loc = int(ids[y][x]) - 640
            assert 0 <= loc, \
                f"power plant: metatile {ids[y][x]} at ({x},{y}) is not a secondary"
            tiles[y][x] = base + loc
            if int(col[y][x]) == 0:
                g[y][x] = "p"
            elif x in (0, W - 1) or y in (0, H - 1):
                g[y][x] = "E"                   # the room's own outer wall
            elif loc in PP_DRUM:
                g[y][x] = "B"
            elif loc in PP_CONSOLE:
                g[y][x] = "X"
            else:
                g[y][x] = "P"

    hid = seal_hidden(g, tiles, "P")
    assert hid, "power plant: no covered tiles found - is route.json stale?"

    # The door is the mat in the south-west corner, so the lowest run of floor
    # is where you would come in. Same idiom as every other map here: lowest
    # row that has any, middle of it.
    spawn = None
    for y in range(H - 2, 0, -1):
        xs = [x for x in range(W) if g[y][x] == "p"]
        if xs:
            spawn = (xs[len(xs) // 2], y)
            break
    assert spawn, "power plant: nowhere to stand"

    seen, stack = set(), [spawn]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        stack += walk_steps(g, x, y)
    for y in range(H):
        for x in range(W):
            if g[y][x] not in SOLID and (x, y) not in seen:
                g[y][x] = "P"                   # solid, and still its own tile

    return (["".join(r) for r in g], spawn,
            [i for row in tiles for i in row], base)


# ------------------------------------------------------------------- Mt Moon

"""Mt Moon is THREE FLOORS, and it is the first map here that is more than one.

Every other area is a single grid. A cave with ladders is not, and the honest
question was how to hold that without inventing a floor system: the engine
closes over one `rows` at construction, the camera clamps to it, the minimap
bakes it, and a save stores one `areaId` and one (x, y).

SO THE FLOORS SHARE A GRID AND THE LADDERS ARE WARPS. 1F, B1F and B2F are laid
out as quadrants, exactly as Frost Hollow lays out four Seafoam floors, each
sealed in its own rock - and `AREAS.ridge.warps` pairs the ladder tiles. Nothing
about the camera, the save, the minimap or travel changes; what is new is a
lookup in the step handler. The alternative - three AREAS with three biome rows,
three level gates, three skies and three lines in the travel menu - is three of
everything for one place you are meant to experience as one place.

THE LADDER GRAPH IS REAL DATA. `data/maps/MtMoon_*/map.json` carries every warp
with its destination map and warp id, and resolving those gives seven
reciprocal pairs - the whole of Mt Moon's vertical structure, read rather than
invented. The two mouths onto Route 4 are not pairs: one is where you come in,
and the other leads somewhere this game has no map for.

AND B1F IS OPENED UP, WHICH IS THE ONE DELIBERATE DIVERGENCE. In FireRed its
304 walkable tiles are four rooms with no walking route between them at all -
you enter each by ladder and leave it by ladder. That is a fine shape for a
game with a party and a reason to be somewhere; here it is four boxes you get
dropped into. The rooms are still copied tile for tile; the corridors between
them are ours, carved by `join_islands` and marked -1 so they draw by our rules
and never pretend to be Game Freak's. It costs three of the seven ladders their
monopoly - they become shortcuts rather than the only way through - and that is
the trade, made on purpose and recorded here rather than discovered later.
"""

MOON_FLOORS = (("MtMoon_1F", 48, 40), ("MtMoon_B1F", 49, 40), ("MtMoon_B2F", 48, 40))
MOON_GUT = 2                      # rows and columns of our own rock between them
# Straight out of the decomp's warp_events, as (floor, x, y) pairs.
MOON_LADDERS = (
    ((0, 5, 6),   (1, 3, 3)),
    ((0, 19, 14), (1, 25, 4)),
    ((0, 31, 16), (1, 43, 21)),
    ((1, 22, 18), (2, 25, 21)),
    ((1, 17, 5),  (2, 31, 11)),
    ((1, 26, 36), (2, 17, 31)),
    ((1, 39, 4),  (2, 5, 10)),
)
MOON_MOUTH = (0, 18, 37)          # the way in from Route 4 - and so the spawn


def mt_moon():
    """Mt Moon: 99x82, three floors of the real cave joined by its own ladders.

    All three are 100% `cave` SECONDARY metatiles, and that tileset has been
    baked since Rock Ridge was composed against it - so this needed no new art
    either, which makes three transcriptions in a row that cost none.

    Each floor's outer ring is already solid, so like the Power Plant there is
    no seal to draw. What we author is the rock BETWEEN the quadrants, the
    corridors inside B1F, and nothing else."""
    import numpy as np
    import random as _r
    import build_assets as BA

    meta = json.load(io.open(os.path.join(ROOT, "public", "tilesets", "route.json"),
                             encoding="utf-8"))
    base = meta["cave"]["floor"] - 1            # cave local 1 is the floor

    # 1F top-left, B1F top-right, B2F below 1F - the order you walk them, so
    # the map reads as a descent rather than as three rooms in a row.
    w0, h0 = MOON_FLOORS[0][1], MOON_FLOORS[0][2]
    origin = [(0, 0), (w0 + MOON_GUT, 0), (0, h0 + MOON_GUT)]
    W = w0 + MOON_GUT + MOON_FLOORS[1][1]
    H = h0 + MOON_GUT + MOON_FLOORS[2][2]

    g = [["R"] * W for _ in range(H)]
    tiles = [[-1] * W for _ in range(H)]

    ladder_cells = {(f, x, y) for pair in MOON_LADDERS for (f, x, y) in pair}
    for i, (name, fw, fh) in enumerate(MOON_FLOORS):
        raw = np.frombuffer(
            io.open(BA.fetch(f"data/layouts/{name}/map.bin", name + ".bin"),
                    "rb").read(), dtype="<u2")[:fw * fh]
        ids = (raw & 0x3FF).reshape(fh, fw)
        col = ((raw >> 10) & 3).reshape(fh, fw)
        ox, oy = origin[i]
        for y in range(fh):
            for x in range(fw):
                loc = int(ids[y][x]) - 640
                assert loc >= 0, f"mt moon: {name} ({x},{y}) is not a cave metatile"
                g[oy + y][ox + x] = ("l" if (i, x, y) in ladder_cells
                                     else "r" if int(col[y][x]) == 0 else "R")
                tiles[oy + y][ox + x] = base + loc

    # --- open B1F up ------------------------------------------------------
    # Carved on the QUADRANT ALONE and pasted back, never on the shared grid: a
    # join run over the whole thing would tunnel between FLOORS, which is the
    # one connection a ladder exists to be.
    ox, oy = origin[1]
    fw, fh = MOON_FLOORS[1][1], MOON_FLOORS[1][2]
    quad = [[g[oy + y][ox + x] for x in range(fw)] for y in range(fh)]
    was = [row[:] for row in quad]
    join_islands(quad, "r", _r.Random(20260918), keep=("l",))
    carved = 0
    for y in range(fh):
        for x in range(fw):
            if quad[y][x] != was[y][x]:
                g[oy + y][ox + x] = quad[y][x]
                tiles[oy + y][ox + x] = -1      # ours now, so our own rules draw it
                carved += 1
    assert carved, "mt moon: B1F's rooms were already joined - check the crop"
    seal_hidden(g, tiles, "R")          # nothing on this map, and the rule is the rule

    # --- the ladders, as warp pairs on the shared grid ---------------------
    warps = []
    for (fa, xa, ya), (fb, xb, yb) in MOON_LADDERS:
        ax, ay = origin[fa][0] + xa, origin[fa][1] + ya
        bx, by = origin[fb][0] + xb, origin[fb][1] + yb
        assert g[ay][ax] == "l" and g[by][bx] == "l", \
            f"mt moon: the ladder at ({ax},{ay})/({bx},{by}) is not on a ladder tile"
        warps.append([ax, ay, bx, by])

    mf, mx, my = MOON_MOUTH
    spawn = (origin[mf][0] + mx, origin[mf][1] + my)
    assert g[spawn[1]][spawn[0]] not in SOLID, "mt moon: the mouth is walled up"

    # --- and take away whatever none of that reaches ----------------------
    # THE FILL CROSSES A LADDER, because a ladder is how you get there. Without
    # that, every floor but the first is an island and five sixths of the map
    # reads as cut off - which is the shape of this map rather than a fault in
    # it, and is exactly why `check()` had to learn the same thing.
    hop = {}
    for ax, ay, bx, by in warps:
        hop[(ax, ay)] = (bx, by)
        hop[(bx, by)] = (ax, ay)
    seen, stack = set(), [spawn]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        stack += walk_steps(g, x, y)
        if (x, y) in hop:
            stack.append(hop[(x, y)])
    for y in range(H):
        for x in range(W):
            if g[y][x] not in SOLID and (x, y) not in seen:
                g[y][x] = "R"
                tiles[y][x] = -1

    return (["".join(r) for r in g], spawn,
            [i for row in tiles for i in row], base, warps)



# ---------------------------------------------------------------- Safari Zone

"""The Safari Zone is SIX MAPS STITCHED, and that is not the same trick as
Frost Hollow or Mt Moon.

Those two lay separate FLOORS side by side and join them with something - a
tunnelled seam, a ladder - because in the real game they are not adjacent at
all. Emerald's Safari Zone is six 40x40 maps that ARE adjacent: the game joins
them with map CONNECTIONS, so walking off the east edge of Northwest puts you
on the west edge of North, one tile across. Laying them out 3x2 is therefore
the honest reconstruction rather than a composition, and the seams line up
because they always did - measured, 10 disagreeing cells out of 240 along six
shared edges, all of them border fill.

120x80, which makes it by a distance the biggest map in the game: 9,600 tiles
against Deep Woods' 6,408, and about 4,700 you can walk on.

**IT IS AN EMERALD MAP, AND OUR PRIMARY IS FIRERED'S.** Ids 0-639 in our atlas
are `gTileset_General` from pokefirered. Emerald ships a tileset with the same
name, the same job and completely different art, so both halves of this map
were new: `EM_PRIMARY` bakes Emerald's General whole (512 metatiles) and
`lilycove` joins the secondaries. That is the first time a transcription has
cost any art at all - Route 1, the Power Plant and Mt Moon each needed none.

**AND COLLISION IS NOT THE WHOLE STORY IN EMERALD.** Water here is col=0 -
PASSABLE - because Gen 3 gates surfing on the metatile BEHAVIOUR rather than on
the collision bit. Classify by collision alone and 399 tiles of pond, river and
waterfall become grass you stroll across. The behaviour field is bits 0-8 of
the metatile attribute, and it is also what identifies the tall grass, the sand
and, best of all, the LEDGES: 36 tiles of `MB_JUMP_SOUTH`, which is exactly the
one-way south hop `L` has always been.

The eleven east/west ledges have no `L` to map onto - ours hops south and only
south - so they stay solid. Eleven tiles, and the fill proves nothing is walled
off behind them.
"""

SAFARI_GRID = (("SafariZone_Northwest", "SafariZone_North", "SafariZone_Northeast"),
               ("SafariZone_Southwest", "SafariZone_South", "SafariZone_Southeast"))
SAFARI_W = SAFARI_H = 40

# pokeemerald's metatile behaviours, bits 0-8 of the attribute.
MB_WATER = frozenset((0x10, 0x11, 0x12, 0x13, 0x14, 0x15))   # pond .. ocean, waterfall
MB_GRASS = frozenset((0x02, 0x03, 0x09))                     # tall and long grass
MB_SAND = frozenset((0x06, 0x21))                            # deep sand, sand cave
MB_JUMP_SOUTH = 0x3B
# Read off pokeemerald's metatile_behaviors.h, not recalled: MB_ISOLATED_
# VERTICAL_RAIL 211, _HORIZONTAL 212, MB_VERTICAL_RAIL 213, _HORIZONTAL 214.
# The first version typed these two off by two and turned most of Route 119's
# rails into floor or wall - the render looked right and the map was not.
MB_RAIL_V = frozenset((0xD3, 0xD5))    # isolated / continuing vertical rail
MB_RAIL_H = frozenset((0xD4, 0xD6))    # isolated / continuing horizontal rail
MB_LONG_GRASS = frozenset((0x03, 0x09))    # long grass, and its south edge
MB_BRIDGE = frozenset((0x70,))             # a bridge over ocean water


def safari_zone():
    """Safari Zone: 120x80, six Emerald maps laid out the way they already are.

    Every cell is a copy. What we author is the frame, and even that is drawn
    with the real layout's OWN border block - the 2x2 the game tiles beyond the
    edge - rather than with anything of ours."""
    import numpy as np
    import build_assets as BA

    meta = json.load(io.open(os.path.join(ROOT, "public", "tilesets", "route.json"),
                             encoding="utf-8"))
    S = meta["safari"]
    GB, LB, SPLIT = S["general"], S["lilycove"], S["split"]
    rebase = lambda i: (GB + i) if i < SPLIT else (LB + i - SPLIT)

    layouts = json.load(io.open(
        BA.fetch("data/layouts/layouts.json", "em/layouts.json", root=BA.EMERALD),
        encoding="utf-8"))["layouts"]
    attr = {
        False: np.frombuffer(io.open(BA.fetch(
            "data/tilesets/primary/general/metatile_attributes.bin",
            "em/general/attr.bin", root=BA.EMERALD), "rb").read(), dtype="<u2"),
        True: np.frombuffer(io.open(BA.fetch(
            "data/tilesets/secondary/lilycove/metatile_attributes.bin",
            "em/lilycove/attr.bin", root=BA.EMERALD), "rb").read(), dtype="<u2"),
    }
    behave = lambda i: int(attr[i >= SPLIT][i if i < SPLIT else i - SPLIT] & 0x1FF)

    W = SAFARI_W * len(SAFARI_GRID[0])
    H = SAFARI_H * len(SAFARI_GRID)
    g = [[None] * W for _ in range(H)]
    tiles = [[-1] * W for _ in range(H)]
    border = None

    for r, row in enumerate(SAFARI_GRID):
        for c, name in enumerate(row):
            lay = next(q for q in layouts if q["name"] == name + "_Layout")
            assert lay["width"] == SAFARI_W and lay["height"] == SAFARI_H, \
                f"safari: {name} is {lay['width']}x{lay['height']}, not the 40x40 the grid assumes"
            raw = np.frombuffer(io.open(BA.fetch(
                lay["blockdata_filepath"], "em/%s.bin" % name,
                root=BA.EMERALD), "rb").read(),
                dtype="<u2")[:SAFARI_W * SAFARI_H]
            ids = (raw & 0x3FF).reshape(SAFARI_H, SAFARI_W)
            col = ((raw >> 10) & 3).reshape(SAFARI_H, SAFARI_W)
            if border is None:
                border = [int(v) & 0x3FF for v in np.frombuffer(io.open(BA.fetch(
                    lay["border_filepath"], "em/safari_border.bin",
                    root=BA.EMERALD), "rb").read(), dtype="<u2")]
            ox, oy = c * SAFARI_W, r * SAFARI_H
            for y in range(SAFARI_H):
                for x in range(SAFARI_W):
                    i = int(ids[y][x])
                    b = behave(i)
                    if b in MB_WATER:
                        ch = "w"           # solid on foot, and a rod or Surf reaches it
                    elif b in MB_RAIL_V:
                        ch = "|"           # an Acro Bike rail - was floor or wall
                    elif b in MB_RAIL_H:
                        ch = "-"
                    elif b == MB_JUMP_SOUTH:
                        ch = "L"
                    elif int(col[y][x]):
                        ch = "T"
                    elif b in MB_GRASS:
                        ch = ","
                    elif b in MB_SAND:
                        ch = "#"
                    else:
                        ch = "."
                    g[oy + y][ox + x] = ch
                    tiles[oy + y][ox + x] = rebase(i)

    # --- the frame, drawn with the real layout's own border block ----------
    # The six maps open onto Route 121 and onto each other, and the outer edge
    # of the stitched rectangle opens onto nothing we have. `check()` wants a
    # solid ring on every map, so it gets one - out of the 2x2 the game itself
    # tiles beyond the edge, which is the nearest thing to a right answer that
    # exists. Solid, because out there is not a place.
    assert border and len(border) == 4, "safari: the border block is not 2x2"
    for x in range(W):
        for y in (0, H - 1):
            g[y][x] = "T"
            tiles[y][x] = rebase(border[(y % 2) * 2 + (x % 2)])
    for y in range(H):
        for x in (0, W - 1):
            g[y][x] = "T"
            tiles[y][x] = rebase(border[(y % 2) * 2 + (x % 2)])

    seal_hidden(g, tiles, "T")

    # --- the spawn, and then take away what it cannot reach ---------------
    # SEARCHED IN THE LARGEST PIECE. Six stitched maps have edges that were
    # drawn to meet a neighbour we did not include on three sides, so there are
    # pockets; picking the lowest walkable tile outright can land in one, and
    # then the fill would wall in the rest of the map rather than the pocket.
    seen_any, best = set(), []
    for y in range(H):
        for x in range(W):
            if g[y][x] in SOLID or (x, y) in seen_any:
                continue
            stack, cells = [(x, y)], []
            while stack:
                cx, cy = stack.pop()
                if (not (0 <= cx < W and 0 <= cy < H) or (cx, cy) in seen_any
                        or g[cy][cx] in SOLID):
                    continue
                seen_any.add((cx, cy))
                cells.append((cx, cy))
                stack += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
            if len(cells) > len(best):
                best = cells
    assert best, "safari: nowhere to stand"
    # The entrance is at the south, so come in at the bottom of the main body.
    bottom = max(y for _x, y in best)
    xs = sorted(x for x, y in best if y == bottom)
    spawn = (xs[len(xs) // 2], bottom)

    seen, stack = set(), [spawn]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        stack += walk_steps(g, x, y)
    for y in range(H):
        for x in range(W):
            if g[y][x] not in SOLID and (x, y) not in seen:
                # Solid, and still the tile Emerald drew there.
                g[y][x] = "T"

    return (["".join(r) for r in g], spawn,
            [i for row in tiles for i in row], GB)



# ----------------------------------------------------------- Monsoon Trail

MONSOON_DOOR = (6, 32)      # the Weather Institute - the first door to another map
MONSOON_HOUSE = (33, 109)   # a house with nothing behind it: sealed, art kept


def monsoon_trail():
    """Monsoon Trail is Emerald's Route 119, cell for cell: 40x140 of river
    valley, long grass, two waterfalls and the Weather Institute.

    THE FIRST CONNECTED MAP. The institute's door is a real door now - it opens
    onto the Pokemon Mansion, and the Mansion's front door opens back onto the
    tile below it. Emerald's institute is its own interior; ours is the
    Mansion, which is a deliberate substitution rather than a copy, and the
    pairing lives in `DOOR_PAIRS` so neither map has to know the other.

    It opens onto Route 118 and Fortree City, which we do not have, so the
    outer ring is the layout's own border block, as the Safari Zone's is.
    Rails are Acro Bike rails - see `RAIL`. Long grass is `g`: it hides the
    trainer's feet and rustles, which is the renderer's business."""
    import numpy as np
    import build_assets as BA

    meta = json.load(io.open(os.path.join(ROOT, "public", "tilesets", "route.json"),
                             encoding="utf-8"))
    M = meta["monsoon"]
    GB, FB, SPLIT = M["general"], M["fortree"], M["split"]
    rebase = lambda i: (GB + i) if i < SPLIT else (FB + i - SPLIT)

    layouts = json.load(io.open(
        BA.fetch("data/layouts/layouts.json", "em/layouts.json", root=BA.EMERALD),
        encoding="utf-8"))["layouts"]
    lay = next(q for q in layouts if q["name"] == "Route119_Layout")
    W, H = lay["width"], lay["height"]
    assert (W, H) == (40, 140), f"monsoon: Route 119 is {W}x{H}, not 40x140"
    raw = np.frombuffer(io.open(BA.fetch(
        lay["blockdata_filepath"], "em/Route119.bin", root=BA.EMERALD), "rb").read(),
        dtype="<u2")[:W * H]
    ids = (raw & 0x3FF).reshape(H, W)
    col = ((raw >> 10) & 3).reshape(H, W)
    attr = {
        False: np.frombuffer(io.open(BA.fetch(
            "data/tilesets/primary/general/metatile_attributes.bin",
            "em/general/attr.bin", root=BA.EMERALD), "rb").read(), dtype="<u2"),
        True: np.frombuffer(io.open(BA.fetch(
            "data/tilesets/secondary/fortree/metatile_attributes.bin",
            "em/fortree/attr.bin", root=BA.EMERALD), "rb").read(), dtype="<u2"),
    }
    behave = lambda i: int(attr[i >= SPLIT][i if i < SPLIT else i - SPLIT] & 0x1FF)
    border = [int(v) & 0x3FF for v in np.frombuffer(io.open(BA.fetch(
        lay["border_filepath"], "em/route119_border.bin", root=BA.EMERALD), "rb").read(),
        dtype="<u2")]
    assert len(border) == 4, "monsoon: the border block is not 2x2"

    g = [[None] * W for _ in range(H)]
    tiles = [[-1] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            i = int(ids[y][x])
            b = behave(i)
            if b in MB_WATER:
                ch = "w"
            elif b in MB_RAIL_V:
                ch = "|"
            elif b in MB_RAIL_H:
                ch = "-"
            elif b == MB_JUMP_SOUTH:
                ch = "L"
            elif b in MB_BRIDGE:
                ch = "N"           # walkable planks over the river
            elif int(col[y][x]):
                ch = "T"
            elif b in MB_LONG_GRASS:
                ch = "g"
            elif b in MB_GRASS:
                ch = ","
            elif b in MB_SAND:
                ch = "#"
            else:
                ch = "."
            g[y][x] = ch
            tiles[y][x] = rebase(i)

    dx, dy = MONSOON_DOOR
    assert g[dy][dx] not in SOLID and g[dy + 1][dx] not in SOLID, \
        "monsoon: the Weather Institute door or the tile below it is not walkable"
    g[dy][dx] = "l"                        # the door - see DOOR_PAIRS
    hx, hy = MONSOON_HOUSE
    g[hy][hx] = "T"                        # nothing behind it; keeps its art

    for x in range(W):
        for y in (0, H - 1):
            g[y][x] = "T"
            tiles[y][x] = rebase(border[(y % 2) * 2 + (x % 2)])
    for y in range(H):
        for x in (0, W - 1):
            g[y][x] = "T"
            tiles[y][x] = rebase(border[(y % 2) * 2 + (x % 2)])

    seal_hidden(g, tiles, "T")

    # The way in is from Route 118, at the south - the foot of the largest piece.
    seen_any, best = set(), []
    for y in range(H):
        for x in range(W):
            if g[y][x] in SOLID or (x, y) in seen_any:
                continue
            stack, cells = [(x, y)], []
            while stack:
                cx, cy = stack.pop()
                if (not (0 <= cx < W and 0 <= cy < H) or (cx, cy) in seen_any
                        or g[cy][cx] in SOLID):
                    continue
                seen_any.add((cx, cy))
                cells.append((cx, cy))
                stack += [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]
            if len(cells) > len(best):
                best = cells
    assert best, "monsoon: nowhere to stand"
    bottom = max(y for _x, y in best)
    xs = sorted(x for x, y in best if y == bottom)
    spawn = (xs[len(xs) // 2], bottom)

    # THE CULL AND THE LANDING RULE RUN TO A FIXED POINT, as Cinderpeak's do:
    # a ledge whose landing is solid is a terrace wall (`land_ledges`), and
    # turning one to rock can cut off what was behind it. Both only turn
    # ground into rock, so the pair shrinks and stops.
    while True:
        # WALKING AND RIDING: the northwest lake, its rails and the land round
        # them are reached by Surf in Emerald, and a walk-only fill culled all
        # of it to wall. So water is crossed too - onto it, along it, off it -
        # exactly as Frost Hollow's fill counts its lake.
        seen, stack = set(), [spawn]
        while stack:
            x, y = stack.pop()
            if (x, y) in seen:
                continue
            seen.add((x, y))
            stack += walk_steps(g, x, y)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and (g[ny][nx] == "w" or
                        (g[y][x] == "w" and g[ny][nx] not in SOLID)):
                    stack.append((nx, ny))
        cut = 0
        for y in range(H):
            for x in range(W):
                if g[y][x] not in SOLID and (x, y) not in seen:
                    g[y][x] = "T"      # solid, and still the tile Emerald drew
                    cut += 1
        if not cut and not land_ledges(g, "T"):
            break
    assert g[dy][dx] == "l", "monsoon: the Weather Institute door is cut off"

    rows = ["".join(r) for r in g]
    return (rows, spawn, [i for row in tiles for i in row], GB, None,
            {"door": MONSOON_DOOR, "arrive": (dx, dy + 1)})


# -------------------------------------------------------------- Cinderpeak

"""Cinderpeak is Ruby's Route 112 and Mt Chimney, and the lift between them.

Two levels rather than three, and they are not floors of a cave: one is the
ash-covered mountainside and the other is the summit above it, joined by the
CABLE CAR - a station house at the foot and another at the top. The warp
machinery Mt Moon needed does not care which of those it is carrying, so this
cost nothing new in the engine.

**THE NAME IS OURS.** "Route 112" is a road number in somebody else's region
and says nothing about the place; Cinderpeak names what you can see from the
bottom of it - ash falling on the grass, and the thing dropping the ash.

**IT COST NO NEW ART EITHER.** Both maps are Emerald's General primary plus
`lavaridge`, and both have been baked since the Safari Zone and Ember Caldera
respectively - Route 112's highest secondary local is 440 against the 441
lavaridge ships, which is as close as that has come. So the ids go straight in
and every cell is a copy.

**THE CABLE CAR IS TWO DOORS, NOT FOUR.** The real chain is Route 112 -> its
station -> the car -> Mt Chimney's station -> Mt Chimney, and the two station
interiors are 13x12 rooms whose whole content is a platform and an attendant.
Joining the doors directly is the same simplification Mt Moon's ladders already
are: what the player does is step into one house and come out of the other.

**THE CRATER IS SCENERY, AND THE MAP DATA SAYS SO.** 56 tiles of `lavaridge`
189 - the same metatile Ember Caldera's lake is made of - and every one of them
is collision 1 with no water behaviour anywhere on either map. You cannot enter
Mt Chimney's crater in Ruby and you cannot here. They carry `V` so the minimap
draws the caldera rather than more rock; exactly ONE of the 56 has a walkable
neighbour, so what that costs is a single tile somebody with Surf could ride
onto, measured rather than assumed.

**AND THE LEDGES GO THE WRONG WAY.** Of the 40 one-way hops here, 38 face EAST
and `L` hops south and only south. The Safari Zone made its eleven solid
because that walled nothing off; here it would wall off **137 tiles** - a
third of the route - so they are floor. The principle behind both is the same
and worth stating once: a ledge is a passage in ONE direction, so floor is the
closer approximation and a wall is the further one; solid is only safe when
nothing is behind it. Measured both ways before choosing.

**THE MINIMAP COLOUR IS READ OFF THE TILE.** Fixed ids mean the art is right
whatever character a cell carries, so the character is free to be about the
MAP rather than the renderer - and Route 112 is half forest and half mountain,
which one `M` would have flattened into a single brown slab. A metatile whose
mean green beats its red and blue by 14 is foliage: tree 198 is (98,153,60) and
the volcanic rock beside it is (134,58,42), so the two do not come close to
touching. Measured against the atlas rather than listed, because a list of ids
is a list that falls behind.
"""

CINDER_FLOORS = (("MtChimney", 40, 47), ("Route112", 40, 60))
CINDER_GUT = 2
# Both layouts' border block is the same single metatile, so the frame is one
# tile everywhere rather than a 2x2 to phase.
CINDER_FRAME = 625
CINDER_LAVA = 701                  # lavaridge local 189 - the crater
CINDER_SPLIT = 512                 # NUM_METATILES_IN_PRIMARY, Emerald's
# The cable car, as (floor, x, y) pairs straight out of the two warp tables.
# EMERALD JOINS THESE TWO MAPS THREE WAYS AND WE HAD ONE, which is what was
# reported from play: two screenshots, each circling one end of the SAME
# missing connection. Read out of the decomp's own `warp_events` and resolved
# through the room in the middle, as (floor, x, y) pairs - floor 0 is
# MtChimney, floor 1 is Route112.
#
# Every one of these passes through a map we do not have, and collapsing it is
# the simplification the cable car is already documented under: what the player
# does is step into one door and come out of the other.
#
#   cable car    R112 (28,27)(29,27) -> the two stations -> Chimney (17,36)(18,36)
#   Jagged Pass  R112  (6,46)( 7,46) -> #0/#1 .. #2/#3  -> Chimney (20,41)(21,41)
#   Fiery Path   R112 (11,36) -> #0 .. #1 -> R112 (22,10), both ends on the route
#
# The last two are what "take me to the top" means here. Jagged Pass is how you
# leave the summit on foot - without it Mt Chimney's south corridor is a rung
# with nothing at the end of it - and the Fiery Path cuts from the foot of the
# route to the top of it, which is the only thing that makes Route 112's
# north-east quarter reachable at all.
CINDER_WARPS = (((1, 28, 27), (0, 17, 36)),        # cable car
                ((1, 29, 27), (0, 18, 36)),
                ((1, 6, 46), (0, 20, 41)),         # Jagged Pass
                ((1, 7, 46), (0, 21, 41)),
                ((1, 11, 36), (1, 22, 10)))        # the Fiery Path, through
MB_TALL_GRASS = 0x02
# Emerald's own ledge behaviours, mapped onto our characters. The corner
# (0x3E, south-east) caps an east run on Route 112 and hops with it.
MB_JUMP_CH = {0x38: "J", 0x3B: "L", 0x3E: "J"}


def cinderpeak():
    """Cinderpeak: 40x109, Route 112 under Mt Chimney, joined by the cable car.

    Stacked rather than laid side by side, because one of these really is
    above the other - the minimap then says so, which is the only thing a
    3px-a-tile picture can communicate about a map with two levels."""
    import numpy as np
    from PIL import Image
    import build_assets as BA

    meta = json.load(io.open(os.path.join(ROOT, "public", "tilesets", "route.json"),
                             encoding="utf-8"))
    GB = meta["safari"]["general"]              # Emerald's General, baked whole
    LB = meta["volcano"]["lava"] - 189          # lavaridge, from its own pick
    rebase = lambda i: (GB + i) if i < CINDER_SPLIT else (LB + i - CINDER_SPLIT)

    # FOLIAGE IS MEASURED OFF THE ATLAS, memoised because the map asks per cell
    # and there are only about two hundred distinct metatiles on it.
    sheet = np.asarray(Image.open(os.path.join(ROOT, "public", "tilesets", "route.png"))
                       .convert("RGB"), dtype=int)
    leaf = {}

    def foliage(i):
        if i not in leaf:
            t = rebase(i)
            cell = sheet[(t // 16) * 16:(t // 16) * 16 + 16,
                         (t % 16) * 16:(t % 16) * 16 + 16]
            r, g, b = cell[..., 0].mean(), cell[..., 1].mean(), cell[..., 2].mean()
            leaf[i] = bool(g > r + 14 and g > b + 14)
        return leaf[i]

    layouts = json.load(io.open(
        BA.fetch("data/layouts/layouts.json", "em/layouts.json", root=BA.EMERALD),
        encoding="utf-8"))["layouts"]
    ga = np.frombuffer(io.open(BA.fetch(
        "data/tilesets/primary/general/metatile_attributes.bin",
        "em/general/attr.bin", root=BA.EMERALD), "rb").read(), dtype="<u2")
    la = np.frombuffer(io.open(BA.fetch(
        "data/tilesets/secondary/lavaridge/metatile_attributes.bin",
        "em/lavaridge/attr.bin", root=BA.EMERALD), "rb").read(), dtype="<u2")
    behave = lambda i: int((ga[i] if i < CINDER_SPLIT else la[i - CINDER_SPLIT]) & 0x1FF)

    W = CINDER_FLOORS[0][1]
    origin = [(0, 0), (0, CINDER_FLOORS[0][2] + CINDER_GUT)]
    H = origin[1][1] + CINDER_FLOORS[1][2]

    g = [["M"] * W for _ in range(H)]
    tiles = [[rebase(CINDER_FRAME)] * W for _ in range(H)]
    doors = {(f, x, y) for pair in CINDER_WARPS for (f, x, y) in pair}

    for i, (name, fw, fh) in enumerate(CINDER_FLOORS):
        lay = next(q for q in layouts if q["name"] == name + "_Layout")
        assert lay["width"] == fw and lay["height"] == fh, \
            f"cinderpeak: {name} is {lay['width']}x{lay['height']}, not the {fw}x{fh} assumed"
        raw = np.frombuffer(io.open(BA.fetch(
            lay["blockdata_filepath"], "em/%s.bin" % name,
            root=BA.EMERALD), "rb").read(), dtype="<u2")[:fw * fh]
        ids = (raw & 0x3FF).reshape(fh, fw)
        col = ((raw >> 10) & 3).reshape(fh, fw)
        ox, oy = origin[i]
        for y in range(fh):
            for x in range(fw):
                mid = int(ids[y][x])
                b = behave(mid)
                if (i, x, y) in doors:
                    ch = "l"                     # a door, an arrow tile or a
                                                 # cave mouth - all of them warps
                elif mid == CINDER_LAVA:
                    ch = "V"
                elif b in MB_JUMP_CH:
                    # THE MOUNTAINSIDE IS 38 EAST HOPS AND TWO SOUTH ONES,
                    # which is what `J` exists for: as floor they were a
                    # terrace wall you could walk back up, and as wall they
                    # sealed 137 tiles. West and north have no character and
                    # no map uses one; the single south-east corner takes
                    # the direction of the run it caps.
                    ch = MB_JUMP_CH[b]
                elif b == MB_TALL_GRASS:
                    ch = ","
                elif int(col[y][x]):
                    ch = "T" if foliage(mid) else "M"
                else:
                    ch = "." if foliage(mid) else "m"
                g[oy + y][ox + x] = ch
                tiles[oy + y][ox + x] = rebase(mid)

    # --- the frame -------------------------------------------------------
    # Both maps open onto neighbours we do not have - Route 111, Lavaridge,
    # Jagged Pass, the Fiery Path - and the composed rectangle's edge opens
    # onto nothing. It closes with the layouts' OWN border block, which is one
    # metatile on both, so there is no 2x2 to phase and nothing to invent.
    for x in range(W):
        for y in (0, H - 1):
            g[y][x] = "M"
    for y in range(H):
        for x in (0, W - 1):
            g[y][x] = "M"

    seal_hidden(g, tiles, "M")

    # AND IT RUNS AFTER `seal_hidden`, WHICH CAN TAKE A LANDING AWAY. That
    # pass turns a walkable cell whose upper layer covers the whole tile
    # solid, so run first it left an east hop at (13,92) aimed at ground
    # that was about to become rock. Same shape as `ledge_in` laying last
    # because `fill_the_empty` plants on the approach.
    # --- the three connections, as warp pairs on the shared grid ----------
    warps = []
    for (fa, xa, ya), (fb, xb, yb) in CINDER_WARPS:
        ax, ay = origin[fa][0] + xa, origin[fa][1] + ya
        bx, by = origin[fb][0] + xb, origin[fb][1] + yb
        assert g[ay][ax] == "l" and g[by][bx] == "l", \
            f"cinderpeak: the warp at ({ax},{ay})/({bx},{by}) is not on a door"
        warps.append([ax, ay, bx, by])

    # --- the spawn, and then take away what it cannot reach ---------------
    # SEARCHED, AND SEARCHED WITH THE DIRECTED FILL. The first version took the
    # bottom of the largest UNDIRECTED region, which is right only while every
    # edge is two-way - and 38 of this map's ledges face east, so hopping one
    # is a door that shuts behind you. Undirected it chose the SUMMIT, and
    # culled 130 tiles of Route 112 into rock for the privilege.
    #
    # Every walkable cell is tried and the one that REACHES the most wins, ties
    # going to the lowest - which lands on (8,103), the foot of the mountain,
    # and so is what the original comment wanted anyway. There is no piece big
    # enough to guess from: Route 112 is cut into terraces by its own ledges
    # and into neighbourhoods by four map connections we did not bring.
    hop = {}
    for ax, ay, bx, by in warps:
        hop[(ax, ay)] = (bx, by)
        hop[(bx, by)] = (ax, ay)

    def reach(from_):
        seen, stack = set(), [from_]
        while stack:
            x, y = stack.pop()
            if (x, y) in seen:
                continue
            seen.add((x, y))
            stack += walk_steps(g, x, y)
            if (x, y) in hop:
                stack.append(hop[(x, y)])
        return seen

    # THE CULL AND THE LANDING RULE FEED EACH OTHER, so they run until neither
    # moves. A cell nothing can reach becomes rock, which can take the landing
    # from a ledge aimed at it; that ledge becomes rock too, which can in turn
    # cut off whatever it was the way into. There is no ORDER that works - run
    # the landing rule first and the cull invalidates it, run it last and it
    # invalidates the cull - and both only ever turn ground into rock, so the
    # pair shrinks and terminates.
    while True:
        scored = [(len(reach((x, y))), x, y) for y in range(H) for x in range(W)
                  if g[y][x] not in SOLID]
        assert scored, "cinderpeak: nowhere to stand"
        most = max(n for n, _x, _y in scored)
        low = max(y for n, _x, y in scored if n == most)
        xs = sorted(x for n, x, y in scored if n == most and y == low)
        spawn = (xs[len(xs) // 2], low)         # the middle of the lowest row
        seen = reach(spawn)
        cut = 0
        for y in range(H):
            for x in range(W):
                if g[y][x] not in SOLID and (x, y) not in seen:
                    g[y][x] = "M"               # solid, and still its own tile
                    cut += 1
        if not cut and not land_ledges(g, "M"):
            break

    return (["".join(r) for r in g], spawn,
            [i for row in tiles for i in row], GB, warps)


# --- the Pokemon Mansion ----------------------------------------------------
#
# Cinnabar Island's burnt-out house, four floors of it, laid out two by two on
# one grid exactly as Frost Hollow lays four Seafoam floors and Mt Moon three.
# Upstairs on the top row, the ground floor and the basement beneath it - which
# is the only thing a 3px-a-tile picture can say about which is above which.
MANSION_FLOORS = (("PokemonMansion_2F", 38, 38), ("PokemonMansion_3F", 38, 35),
                  ("PokemonMansion_1F", 38, 35), ("PokemonMansion_B1F", 38, 35))
MANSION_GUT = 2                   # rows and columns of our own wall between them
MANSION_COLS = 2
MANSION_SPLIT = 640               # NUM_METATILES_IN_PRIMARY, FireRed's
MANSION_FLOOR_MT = 644            # METATILE_PokemonMansion_Floor
# THE FRAME IS THE LAYOUT'S OWN BORDER BLOCK, which the Safari Zone already
# argued for and which is unusually easy here: all four floors tile a 2x2 of
# the SAME metatile, and it is the black void the real map already fills its
# own out-of-bounds corners with - 258 cells of 2F and 452 of 3F. So the
# gutters between quadrants draw as the nothing they are. A plain wall tile was
# tried first and read as floor, which is the invisible-wall fault pointing the
# other way.
MANSION_BORDER_MT = 8

# THE LADDER GRAPH IS READ, NOT INVENTED - `warp_events` out of each floor's
# own map.json, resolved to the pairs that answer each other. Floors are
# indexed into MANSION_FLOORS above: 0 is 2F, 1 is 3F, 2 is 1F, 3 is B1F.
#
# Eight reciprocal pairs. Three of the real warps are NOT pairs and are left
# out, the same call Mt Moon's two Route 4 mouths got: 1F (11,13), 3F (20,18)
# and 3F (24,18) are the second tile of a wide staircase and lead to a tile
# whose own warp answers their neighbour instead. And the three doors onto
# Cinnabar Island lead somewhere this game has no map for - except the middle
# one, which is the way in and so the spawn.
MANSION_STAIRS = (
    ((2, 10, 13), (0, 6, 14)),      # 1F <-> 2F, the main staircase
    ((2, 25, 27), (3, 34, 29)),     # 1F <-> B1F
    ((2, 19, 22), (1, 18, 18)),     # 1F <-> 3F, the holes you fall through
    ((2, 20, 22), (1, 19, 18)),
    ((0, 9, 3), (1, 8, 3)),         # 2F <-> 3F
    ((0, 34, 22), (1, 34, 18)),
    ((0, 9, 14), (1, 11, 11)),
    ((0, 27, 17), (1, 23, 18)),
)
MANSION_DOOR = (2, 8, 33)         # the front door onto Cinnabar - and the spawn


def mansion_switch():
    """Every cell the statue switch OPENS, as {floor: {(x, y): metatile}}.

    THE MANSION IS TWO MAPS AND WE CAN ONLY SHIP ONE. Its barriers are worked
    by a statue: `FLAG_POKEMON_MANSION_SWITCH_STATE` chooses between the grid
    in map.bin and the one `PressSwitch_*` stamps over it, and each state opens
    what the other closes. This game has no switch, and a barrier with no
    switch is not a barrier - it is a wall. That is the call the ledges lost in
    Ember and the ladders lost in Frost Hollow, met a third time.

    So the map is the UNION: floor where EITHER state is passable, drawn with
    that state's own metatile. Nothing is invented - every id here is one Game
    Freak wrote for that exact cell, and map.bin is verified to BE the reset
    state first, on all 78 cells the reset script names.

    It is worth 42 cells and it is not a detail: without them the four floors
    are 53.7% reachable and the whole basement is sealed, because the stair
    down to it stands behind a barrier.
    """
    import re
    import build_assets as BA

    labels = {}
    for m in re.finditer(r"#define\s+(METATILE_\w+)\s+(0x[0-9A-Fa-f]+|\d+)",
                         io.open(BA.fetch("include/constants/metatile_labels.h",
                                          "metatile_labels.h"),
                                 encoding="utf-8", errors="replace").read()):
        labels[m.group(1)] = int(m.group(2), 0)

    text = io.open(BA.fetch("data/scripts/pokemon_mansion.inc",
                            "data_scripts_pokemon_mansion.inc"),
                   encoding="utf-8", errors="replace").read()

    def swaps(label):
        i = text.index(label + "::")
        body = text[i:text.index("\n\treturn", i)]
        return [(int(m.group(1)), int(m.group(2)), labels[m.group(3)], int(m.group(4)))
                for m in re.finditer(
                    r"setmetatile\s+(\d+),\s*(\d+),\s*(\w+),\s*(\d+)", body)]

    out = {}
    for i, (name, _fw, _fh) in enumerate(MANSION_FLOORS):
        key = name.split("_")[-1]
        out[i] = ({(x, y): mid for x, y, mid, imp in
                   swaps("PokemonMansion_EventScript_PressSwitch_" + key) if imp == 0},
                  swaps("PokemonMansion_EventScript_ResetSwitch_" + key))
    return out


def mansion():
    """The Pokemon Mansion: 78x75, four floors of Cinnabar's burnt-out house.

    **IT IS THE FIRST MAP DRAWN AGAINST A `building` PRIMARY.** Route 1, the
    Power Plant and Mt Moon are all `general` or pure secondary; 748 of these
    4,973 metatiles are `building` ids, which in our atlas would have been
    grass, trees and sand. `FR_PRIMARY` bakes that primary whole - the same
    thing `EM_PRIMARY` already does for the Safari Zone one decomp over - so
    both halves of the pairing rebase against their own block and every cell is
    still a copy.

    The layout is two by two because four floors in a column is 38x152, and the
    minimap would have to draw that at one pixel a tile to fit the screen.
    """
    import numpy as np
    import build_assets as BA

    meta = json.load(io.open(os.path.join(ROOT, "public", "tilesets", "route.json"),
                             encoding="utf-8"))
    PB = meta["mansion"]["building"]           # pokefirered's Building, baked whole
    SB = meta["mansion"]["mansion"]            # and the mansion's own secondary
    rebase = lambda i: (PB + i) if i < MANSION_SPLIT else (SB + i - MANSION_SPLIT)

    W = MANSION_COLS * 38 + (MANSION_COLS - 1) * MANSION_GUT
    band = [max(MANSION_FLOORS[0][2], MANSION_FLOORS[1][2]),
            max(MANSION_FLOORS[2][2], MANSION_FLOORS[3][2])]
    H = band[0] + MANSION_GUT + band[1]
    origin = [(0, 0), (38 + MANSION_GUT, 0),
              (0, band[0] + MANSION_GUT), (38 + MANSION_GUT, band[0] + MANSION_GUT)]

    g = [["Q"] * W for _ in range(H)]
    tiles = [[rebase(MANSION_BORDER_MT)] * W for _ in range(H)]
    opens = mansion_switch()
    doors = {(f, x, y) for pair in MANSION_STAIRS for (f, x, y) in pair}
    opened = 0

    for i, (name, fw, fh) in enumerate(MANSION_FLOORS):
        raw = np.frombuffer(io.open(BA.fetch(f"data/layouts/{name}/map.bin",
                                             name + ".bin"), "rb").read(),
                            dtype="<u2")[:fw * fh]
        ids = (raw & 0x3FF).reshape(fh, fw)
        col = ((raw >> 10) & 3).reshape(fh, fw)
        press, reset = opens[i]
        # MAP.BIN IS THE RESET STATE, ASSERTED RATHER THAN ASSUMED. If it were
        # not, the union below would be taking one state and half of another.
        for x, y, mid, imp in reset:
            assert int(ids[y][x]) == mid and int(col[y][x]) == imp, \
                f"mansion: {name} ({x},{y}) is not what ResetSwitch lays there"
        ox, oy = origin[i]
        for y in range(fh):
            for x in range(fw):
                mid, solid = int(ids[y][x]), bool(col[y][x])
                if solid and (x, y) in press:
                    mid, solid = press[(x, y)], False     # the switch opens it
                    opened += 1
                if (i, x, y) in doors:
                    ch = "l"          # a staircase or a hole in the floor
                else:
                    ch = "Q" if solid else "q"
                g[oy + y][ox + x] = ch
                tiles[oy + y][ox + x] = rebase(mid)

    # --- the frame --------------------------------------------------------
    # Each floor's own outer ring is already solid, so what this closes is the
    # composition's edge and the gutters between quadrants - which are ours,
    # and are the one thing on this map that is not a copy.
    for x in range(W):
        for y in (0, H - 1):
            g[y][x] = "Q"
    for y in range(H):
        for x in (0, W - 1):
            g[y][x] = "Q"

    seal_hidden(g, tiles, "Q")

    # --- the staircases, as warp pairs on the shared grid ------------------
    warps = []
    for (fa, xa, ya), (fb, xb, yb) in MANSION_STAIRS:
        ax, ay = origin[fa][0] + xa, origin[fa][1] + ya
        bx, by = origin[fb][0] + xb, origin[fb][1] + yb
        assert g[ay][ax] == "l" and g[by][bx] == "l", \
            f"mansion: the stair at ({ax},{ay})/({bx},{by}) is not on a landing"
        warps.append([ax, ay, bx, by])

    # --- you come in at the front door, and lose what it cannot reach -------
    fd, fx, fy = MANSION_DOOR
    spawn = (origin[fd][0] + fx, origin[fd][1] + fy)
    assert g[spawn[1]][spawn[0]] not in SOLID, "mansion: the front door is a wall"

    hop = {}
    for ax, ay, bx, by in warps:
        hop[(ax, ay)] = (bx, by)
        hop[(bx, by)] = (ax, ay)
    seen, stack = set(), [spawn]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        seen.add((x, y))
        stack += walk_steps(g, x, y)
        if (x, y) in hop:
            stack.append(hop[(x, y)])
    for y in range(H):
        for x in range(W):
            if g[y][x] not in SOLID and (x, y) not in seen:
                g[y][x] = "Q"            # solid, and still the tile it was

    print("   mansion  the switch opens %d cells; %d of %d walkable reached"
          % (opened, len(seen),
             sum(1 for r in g for c in r if c not in SOLID) + 0))

    # THE FRONT DOOR LEADS SOMEWHERE NOW - Monsoon Trail, see DOOR_PAIRS.
    # You arrive on the tile inside it, so walking back onto it is leaving.
    arrive = (spawn[0], spawn[1] - 1)
    assert g[arrive[1]][arrive[0]] not in SOLID, "mansion: nothing to stand on inside the door"
    return (["".join(r) for r in g], spawn,
            [i for row in tiles for i in row], PB, warps,
            {"door": spawn, "arrive": arrive})


# DOORS BETWEEN MAPS, as pairs of area ids. Each builder reports its own door
# tile and the tile you arrive on when you come through it; walking onto one
# map's door puts you on the other's arrival tile. One pair today.
DOOR_PAIRS = [("woods", "mansion")]

if __name__ == "__main__":
    out = []
    for spec in AREAS:
        made = globals()[spec["drawn"]]() if spec.get("drawn") else build(spec)
        rows, spawn = made[0], made[1]
        tiles, base = (made[2], made[3]) if len(made) > 2 else (None, None)
        # A map with more than one floor carries the ladders that join them.
        warps = made[4] if len(made) > 4 else None
        spec["door"] = made[5] if len(made) > 5 else None
        spec["w"], spec["h"] = len(rows[0]), len(rows)
        got, total = check(spec, rows, spawn, tiles, warps)
        out.append((spec, rows, spawn, tiles, base, warps))
        print("  %-9s %2dx%-2d  spawn %2d,%-2d  %3d of %3d walkable reachable"
              % (spec["id"], spec["w"], spec["h"], spawn[0], spawn[1], got, total))

    doors = {}
    by = {spec["id"]: spec for spec, *_rest in out}
    for a, b in DOOR_PAIRS:
        da, db = by[a]["door"], by[b]["door"]
        assert da and db, f"door pair {a}/{b}: a map reports no door"
        doors.setdefault(a, []).append([*da["door"], b, *db["arrive"]])
        doors.setdefault(b, []).append([*db["door"], a, *da["arrive"]])
        print("   door    %s %s <-> %s %s" % (a, da["door"], b, db["door"]))

    body = ["/* GENERATED by tools/build_map.py - edit the area specs there. */\n",
            "export const AREAS = {"]
    for spec, rows, spawn, tiles, base, warps in out:
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
        if warps:
            # THE LADDERS, AS PAIRS. Each entry is [x1, y1, x2, y2] and is
            # walked in BOTH directions - a one-way ladder is a trap, and two
            # rows saying the same thing is two places for it to disagree.
            body.append("    warps: [")
            body += ["      [%d, %d, %d, %d]," % tuple(w) for w in warps]
            body.append("    ],")
        if spec["id"] in doors:
            # DOORS TO ANOTHER MAP: [x, y, area, arriveX, arriveY].
            body.append("    doors: [")
            body += ["      [%d, %d, %s, %d, %d]," % (d[0], d[1], json.dumps(d[2]), d[3], d[4])
                     for d in doors[spec["id"]]]
            body.append("    ],")
        body.append("  },")
    body.append("};\n")
    body.append("export const AREA_IDS = %s;\n"
                % json.dumps([s["id"] for s, *_rest in out]))
    io.open(os.path.join(ROOT, "src", "game", "mapdata.js"), "w",
            encoding="utf-8").write("\n".join(body))
    print("   wrote src/game/mapdata.js  (%d areas)" % len(out))
