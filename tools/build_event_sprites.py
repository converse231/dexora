"""EVENT SPRITES: the drawn originals in art/events/<event>/<base id>.jpg made
into the front sprites the game draws - `public/sprites/<look id>.png` and its
shiny, `public/sprites/shiny/<look id>.png` - where every other species' are,
so `spriteUrl` needs no branch. The look ids are read off
src/data/eventforms.js. There is no back sprite: a look never battles.

The originals are image-generator output: a 1024px JPEG of pixel art, with the
"transparent" checkerboard PAINTED IN (or plain white), JPEG noise on every
cell, and art pixels ~10-16 real pixels wide on no regular grid. None of that
may reach the game, where a sprite is a small PNG of hard pixels on real
transparency, so each original is:

1. KEYED: the background is flood-filled from the border over light, grey
   pixels (the checker's two greys, or white). The fill stops at the art's dark
   outline, so a pale body inside it (vampire Zubat is nearly white) is kept.
2. REDUCED to `COLOURS` colours (a GBA sprite has 16 per palette), from the
   opaque pixels only, so JPEG noise in a flat area is one colour again.
3. SHRUNK to the base sprite's size, one target pixel per block of source: as
   wide as the base's body (a hat may stand taller), on the base's own canvas
   (64px FireRed, 96px for Mimikyu), feet on the base's row.
4. SHINY by the species' own recolour: the base sprite and its shiny are one
   drawing, so pixel for pixel they say which colour becomes which. A look's
   colour near one of the base's is moved by that colour's shift; a colour
   the base never had (the hat, the cape, the pumpkin) is the costume and
   stays. Measured on the drawing, so nobody types a palette.

    python tools/build_event_sprites.py     (npm run eventart)
"""
import cmath, colorsys, glob, math, os, re, sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art", "events")
SPRITES = os.path.join(ROOT, "public", "sprites")
FORMS = os.path.join(ROOT, "src", "data", "eventforms.js")
# How near a look's colour must be to one of the base's to take its shiny shift.
NEAR = 30
# The outline gap the background fill is sealed against, in the original's pixels (`key`).
SEAL = 3
# The share of a look that must still wear its species' colours for those to
# be what its shiny moves (else the whole look turns by the species' hue).
SHARED = 0.25
# A shiny must look like one: under this share of its pixels visibly changed
# (2026-10-26: grey gargoyles and black reaper robes came out 0-3% changed,
# Sheet Ghost Hoothoot 0%) it is tinted toward the species' own shiny colour.
SEEN = 0.15
# A shiny keeping under this share of its species' colour is the species gone grey (`recolour`):
# Eevee's silver keeps 0.50, Pikachu's 0.94 and Mew's 0.96.
GREY = 0.6
# How far a drawn colour may sit from the species' own and still be its fur, for a roaming grey shiny:
# Gemini's browns land 30-60 off Eevee's palette, so NEAR alone left half the ponchos' faces brown.
FUR = 70
COLOURS = 16
# Of those, up to this many are held back for small strong colours (an eye).
ACCENTS = 3
ACCENT_FAR = 90          # how far from every chosen colour counts as lost
ACCENT_MIN = 60          # source pixels: a 1024px eye is hundreds, JPEG noise is not
SAME = 24                # two chosen colours this close are one
HOLE_MIN = 400           # source pixels: an enclosed pocket smaller is part of the art
HOLE_FIT = 0.85          # the share of a pocket on a checker's squares that makes it one
# HOLLOW DRAWINGS (2026-10-26, reported: Grim Reaper Giratina kept white
# between its wing ribs and inside its scythe's curve). On a plain backdrop the
# fill cannot reach background the art ENCLOSES, and white inside the art is
# usually the art (Hoothoot's sheet, the mummy's bandages, Drifloon's puff) - so
# only a drawing named here has its enclosed near-white pockets taken out, with
# the pale tinted glow round them. No share of white tells the two apart
# (Giratina's trapped background is 11% of it, Wingull's own white body 15%):
# a look is named here by eye.
# Grim Reaper Dusknoir too (2026-10-31, reported: white in its scythe's curve
# and between the scroll and the handle).
# Gargoyle Geodude too (same day: white between its arms and its body).
# Black Cat Meowth too (2026-11-02: white inside its tail's curl).
# Monster Hunter Lucario too (same day: white between its arm and its coat) -
# but only its one big pocket: its eye shine, claws and a chest highlight are
# white pockets too (580-990 pixels against the background's 4,320), and went
# with it. Each look names the least pocket that is background.
HOLLOW = {("haunting", "487"): HOLE_MIN, ("haunting", "477"): HOLE_MIN, ("haunting", "74"): HOLE_MIN,
          ("haunting", "52"): 800, ("haunting", "448"): 2000, ("friends", "493"): HOLE_MIN}  # Meowth's coin shine is 587
# What counts as backdrop, for a drawing whose body is nearly as light as it: Starforged
# Arceus is 231 silver with a pale edge on its head, and the usual fill took the head
# and neck (2026-11-05). On a pure white backdrop (255) the fill can be asked for white.
FLOOR = {("friends", "493"): 245}
# BACKDROP THE OUTLINE SHUT IN (2026-11-05, reported: "be careful with those white bgs"):
# a gap between an arm and a tail, or Charizard's open mouth, which the real sprite leaves
# see-through too, stays white when the border's fill cannot reach it. Named by a cell of
# the finished sprite (row, column), because a white claw or belly is the same colour:
# audit a new drawing on a loud colour beside its base, never on a dark one.
SHUT_IN = {("friends", "6"): [(22, 25), (28, 33), (35, 49), (41, 47), (43, 50)],
           ("friends", "493"): [(40, 56), (39, 55), (38, 72), (34, 67), (22, 42)]}
SHUT_IN_WHITE = 235
# THE SAME, NAMED ON THE ORIGINAL (2026-11-09, reported on the ponchos: white
# between the raised arm and the cape, and between a wing and a tail): one
# point (x, y) of the 1024px drawing inside each backdrop pocket. The pocket
# is the backdrop-white the point floods to, taken out of the mask before the
# grid is read. Chosen by eye beside the drawing, never by size - Slowbro's
# eyes, Mawile's teeth and every white cape are pockets of the same white.
HOLES = {
         ("ponchos", "19940"): [(702, 505), (372, 517), (721, 674)],
         ("ponchos", "19942"): [(709, 635), (330, 639)],
         ("ponchos", "19943"): [(348, 544), (641, 793), (515, 757)],
         ("ponchos", "19944"): [(389, 527), (317, 623)],
         ("ponchos", "19945"): [(346, 552)],
         ("ponchos", "19946"): [(353, 558)],
         ("ponchos", "19948"): [(397, 533)],
         ("ponchos", "19949"): [(393, 537)],
         ("ponchos", "19951"): [(420, 301), (370, 563)],
         ("ponchos", "19953"): [(364, 564)],
         ("ponchos", "19954"): [(364, 563)],
         ("ponchos", "19955"): [(369, 552)],
         ("ponchos", "19956"): [(401, 527)],
         ("ponchos", "19965"): [(391, 528)],
         ("ponchos", "19967"): [(348, 555)],
         ("ponchos", "19968"): [(354, 560)],
         ("ponchos", "19969"): [(370, 565)],
         ("eponchos", "19986"): [(824, 686)],
         ("eponchos", "19994"): [(817, 729)],
}
HOLE_WHITE = 244


def holes_out(a, m, points):
    """`m` without the backdrop pocket at each point; a point on anything but
    backdrop white stops the build - the drawing changed, so look again."""
    mn, mx = a.min(axis=2).astype(int), a.max(axis=2).astype(int)
    white = m & (mn >= HOLE_WHITE) & (mx - mn < 10)
    m = m.copy()
    for x, y in points:
        if not white[y, x]:
            sys.exit(f"({x}, {y}) is no backdrop pocket: look at the drawing again (HOLES)")
        q = deque([(y, x)])
        white[y, x] = False
        while q:
            yy, xx = q.popleft()
            m[yy, xx] = False
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = yy + dy, xx + dx
                if 0 <= ny < a.shape[0] and 0 <= nx < a.shape[1] and white[ny, nx]:
                    white[ny, nx] = False
                    q.append((ny, nx))
    return m


def open_up(out, cells):
    """`out` with the near-white region at each cell made transparent. A cell that
    is not near-white stops the build: the drawing changed, so look again."""
    a = np.asarray(out).copy()
    white = (a[..., 3] > 0) & (a[..., :3].min(axis=2) > SHUT_IN_WHITE)
    for cell in cells:
        if not white[cell] and a[cell][3] > 0:
            sys.exit(f"{cell} is no shut-in white: look at the drawing again (SHUT_IN)")
        q = deque([cell])
        while q:
            y, x = q.popleft()
            if not (0 <= y < a.shape[0] and 0 <= x < a.shape[1]) or not white[y, x]:
                continue
            white[y, x] = False
            a[y, x] = 0
            q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    return Image.fromarray(a, "RGBA")


# More colours, for a drawing whose small accents the sixteen merged away
# (2026-10-31): Gravedigger Diglett's browns took all sixteen and its nose
# went grey; Ghost Story Slowking's quilt; Zapdos Poncho Eevee's orange beak.
COLOURFUL = {("haunting", "50"): (24, 6, 60), ("haunting", "199"): (24, 6, 60),
             ("eponchos", "19995"): (20, 4, 60),
             # The Starforged four: sixteen merged Arceus's silver into its gold and turned
             # Charizard's navy armour and gold star brown and orange (2026-11-05, reported).
             ("friends", "493"): (28, 6, 60), ("friends", "6"): (32, 6, 60),
             ("friends", "150"): (28, 6, 60), ("friends", "25"): (24, 6, 60),
             ("haunting", "487"): (24, 6, 60)}  # Giratina's scythes kept two of their greys (2026-11-02)
# THE DRAWING'S OWN GRID (2026-11-02, reported: Dugtrio's and Kadabra's eyes
# broken, Diglett's lost, the Gargoyles grainy). Every drawing is pixel art on a
# grid of its own - 12.8 or 16 source pixels a drawn pixel, some 20.5 - and
# shrinking it on any other grid split a one-pixel eye between two blocks and
# turned cracks into specks. So it is read cell by cell, one sprite pixel a
# drawn pixel, at a whole scale (`SCALES`) - the one nearest the species' body
# width that fits the canvas. A drawing no whole scale fits falls back to
# `shrink`, filling the canvas. `GRID_MIN`/`GRID_MAX` bound the search.
GRID_MIN, GRID_MAX = 8.0, 24.0
# Every other edge of a grid is a grid too, and it can score a hair higher:
# Golett, Giratina, Mew and the Zubat line were read at 20.5-21.4, half their
# drawn pixels, and came out small and blocky. Half a grid scoring this share
# of it is the real one (a right grid's half scores about 0.5; those, 0.92-0.99).
HALF = 0.85
# A drawing its own grid makes a little too big for the canvas (the Gengar line
# by a row or two) drops whole rows and columns to fit - at no less than this
# scale; past it, `shrink`.
NEAR_FIT = 0.75
# A drawing too big by a fifth loses a row or column in five, and evenly spaced
# they fell through Mawile Poncho Pikachu's left eye (2026-11-10, reported). These
# drop instead the lines most like their neighbour - the inside of a wide flat
# hair, never an eye's dark pixels (`trim`) - and only on the axis that overflows,
# since shrinking both dropped rows through the face too. Opt-in: every other
# sprite was approved as it is.
TRIM = {("ponchos", "19950")}


def trim(art, tw, th):
    """`art` cut to tw x th by dropping, one at a time, the column (then row)
    that differs least from the one beside it."""
    a = art.astype(int)
    for axis, want in ((1, tw), (0, th)):
        while a.shape[axis] > want:
            d = np.abs(np.diff(a, axis=axis)).sum(axis=(0, 2) if axis == 1 else (1, 2))
            a = np.delete(a, int(np.argmin(d)) + 1, axis=axis)
    return a.astype(np.uint8)
# A drawing its own grid leaves narrower than this share of the species' body
# (Zubat and Mimikyu, drawn at 20.5-21.3) is spread over the body by `shrink`:
# its pixels are coarser than the sprite's, so nothing is lost.
UNDER = 0.85
SCALES = (1, 2, 3)
# White a HOLLOW drawing encloses that is ART, named by a point (x, y) in the
# drawing: its pocket is never taken (2026-11-02, reported: the shine down Grim
# Reaper Giratina's right scythe went, 5,001 pixels - as big as the background
# between its wing ribs, so no size tells them apart).
KEEP = {("haunting", "487"): [(904, 733)]}
POCKET_WHITE = 236       # near-white: a pocket's pixels
POCKET_RIM = 4           # source pixels of tinted glow round a pocket that go with it
# A HOLLOW drawing whose glow runs wider than the rim (Grim Reaper Giratina,
# 2026-11-02, reported: a pink haze between its wing ribs stayed as a broken
# white stroke): the glow is followed out from each pocket for as long as it
# stays light and tinted - `GLOW_LIGHT` its darkest channel, `GLOW_TINT` its
# spread (the silver scythes are light but near grey, and went at 12). Not
# Dusknoir, whose cream scroll touches a pocket and would go with it.
GLOW = {("haunting", "487")}
GLOW_LIGHT, GLOW_TINT = 150, 30
# An island smaller than this share of the body is a speck of background.
SPECK = 0.004


def grow(m, r):
    """`m` widened by r pixels every way (a square), by shifts: no scipy here."""
    h, w = m.shape
    p = np.pad(m, r)
    out = np.zeros_like(m)
    for dy in range(2 * r + 1):
        for dx in range(2 * r + 1):
            out |= p[dy:dy + h, dx:dx + w]
    return out


def pockets(a, m, least=HOLE_MIN, keep=()):
    """The near-white regions the kept mask encloses, `least` pixels or more
    and holding none of the `keep` points, as one mask."""
    white = m & (a.min(axis=2).astype(int) > POCKET_WHITE)
    h, w = white.shape
    seen = np.zeros((h, w), bool)
    out = np.zeros((h, w), bool)
    for y0, x0 in zip(*np.nonzero(white)):
        if seen[y0, x0]:
            continue
        q, comp = deque([(y0, x0)]), [(y0, x0)]
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and white[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; q.append((yy, xx)); comp.append((yy, xx))
        if len(comp) >= least and not set(comp) & {(y, x) for x, y in keep}:
            ys, xs = zip(*comp)
            out[list(ys), list(xs)] = True
    return out


def hollow(a, m, glow=False, least=HOLE_MIN, keep=()):
    """A HOLLOW drawing's mask without its enclosed pockets and their glow:
    light, TINTED pixels within POCKET_RIM of one (a silver blade is light but
    grey, and stays) - or, `glow`, all of it that joins one (`GLOW`)."""
    pk = pockets(a, m, least, keep)
    mn, mx = a.min(axis=2).astype(int), a.max(axis=2).astype(int)
    rim = grow(pk, POCKET_RIM) & m & (mn > 200) & (mx - mn >= 12)
    if glow:
        haze = m & (mn > GLOW_LIGHT) & (mx - mn >= GLOW_TINT)
        while True:
            more = grow(rim | pk, 2) & haze & ~rim
            if not more.any():
                break
            rim |= more
    return specks(m & ~pk & ~rim)


def key(a, floor=168):
    """Opaque mask: everything the border flood over light greys cannot reach."""
    h, w, _ = a.shape
    mx, mn = a.max(axis=2).astype(int), a.min(axis=2).astype(int)
    # The checker is two neutral greys (~195 and ~255); white is white. Light
    # AND unsaturated, so the fill never runs into a coloured body.
    bg = (mn > floor) & (mx - mn < 22)
    # SEALED FIRST (2026-10-24): where a pale outline steps diagonally, JPEG blur
    # leaves a light corner between its two pixels, and the fill ran through it
    # and took Drifloon's white puff. The fill runs only where the art is more
    # than SEAL away, then takes back the rim it left - a gap of SEAL*2 is shut,
    # an art pixel (10-16 of the original's) is not. A PLAIN backdrop only: on a
    # painted checker the seal walled squares of it into Darkrai.
    seal = SEAL if grid(mn) is None else 0
    open_ = bg & ~grow(~bg, seal)
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if open_[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if open_[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and open_[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True; q.append((yy, xx))
    seen |= grow(seen, seal) & bg
    holes(bg, seen, mn)
    return specks(~seen)


def grid(mn):
    """The painted checker's own squares, read off the image's top row and
    left column (always background): (size, x offset, y offset, the tone of
    the first square, the tone between its two), or None for a plain backdrop.
    The tones are the image's own: Darkrai's checker is 171 and 230, under
    the 235 a fixed cut took for white."""
    lo, hi = np.percentile(mn[:4, :], [5, 95])
    if hi - lo < 25:
        return None
    mid = (lo + hi) / 2
    def runs(line):
        white = line > mid
        edges = np.nonzero(white[1:] != white[:-1])[0] + 1
        return edges, white[0]
    ex, first = runs(mn[2, :])
    ey, _ = runs(mn[:, 2])
    if len(ex) < 4 or len(ey) < 4:
        return None
    # Measured over the whole run of edges, not one square: a square is a
    # fraction off a whole pixel (Darkrai's ~15.1), and that adds up to a
    # flipped square 600px in.
    step = float(np.median(np.diff(ex)))
    size = (ex[-1] - ex[0]) / max(1, round((ex[-1] - ex[0]) / step))
    return size, ex[0] % size, ey[0] % size, first, mid


def holes(bg, seen, mn):
    """The checker the outline ENCLOSES - Darkrai's arm meets its body and
    walls a pocket of it in (2026-10-20). A pocket is the checker when its
    tones fall on the painted checker's own squares (`grid`): two tones alone
    is not enough, Gengar's white teeth with grey between them are two tones
    and were cut out of his grin."""
    g = grid(mn)
    if g is None:
        return
    size, _, _, _, mid = g
    h, w = bg.shape
    left = bg & ~seen
    for y0, x0 in zip(*np.nonzero(left)):
        if not left[y0, x0]:
            continue
        q, cells = deque([(y0, x0)]), [(y0, x0)]
        left[y0, x0] = False
        while q:
            y, x = q.popleft()
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and left[yy, xx]:
                    left[yy, xx] = False
                    q.append((yy, xx))
                    cells.append((yy, xx))
        if len(cells) < HOLE_MIN:
            continue
        ys, xs = np.array(cells).T
        white = mn[ys, xs] > mid
        # At the checker's square size, at ANY offset: the generator paints a
        # pocket's checker on a grid of its own (Darkrai's sat a third of a
        # square off the border's). Either parity, so the best of fit and 1-fit.
        best = 0
        for ox in range(int(size)):
            for oy in range(int(size)):
                even = ((np.floor((xs - ox) / size) + np.floor((ys - oy) / size)) % 2) == 0
                f = (white == even).mean()
                best = max(best, f, 1 - f)
        if best >= HOLE_FIT:
            seen[ys, xs] = True


def specks(m):
    """The mask less every loose island far smaller than the body: the
    checker's corners ring darker under JPEG and survived the fill as grey
    crosses round Darkrai (2026-10-20). A part of the sprite that floats on
    its own - Haunter's hands - is far bigger than `SPECK` of the body."""
    h, w = m.shape
    label = np.zeros((h, w), np.int32)
    sizes = [0]
    for y0, x0 in zip(*np.nonzero(m)):
        if label[y0, x0]:
            continue
        n = len(sizes)
        label[y0, x0] = n
        q, size = deque([(y0, x0)]), 0
        while q:
            y, x = q.popleft()
            size += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not label[yy, xx]:
                    label[yy, xx] = n
                    q.append((yy, xx))
        sizes.append(size)
    sizes = np.array(sizes)
    keep = sizes >= SPECK * sizes.max()
    keep[0] = False
    return keep[label]


def palette(a, m, colours=COLOURS, accents=ACCENTS, far_=ACCENT_FAR):
    """`COLOURS` colours for the whole sprite, from its opaque pixels only -
    and the ACCENTS it would lose: median cut spends its colours where the
    pixels are, so a small, strong colour (Darkrai's blue eye, 2026-10-20)
    merged into its neighbour. Anything far from every chosen colour, and
    common enough not to be noise, takes one of `ACCENTS` places."""
    px = a[m].reshape(-1, 3).astype(int)
    q = Image.fromarray(px.reshape(1, -1, 3).astype(np.uint8), "RGB").quantize(
        colours - accents, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[:(colours - accents) * 3]).reshape(-1, 3)
    near = lambda p: np.abs(px[:, None, :] - p[None, :, :]).sum(axis=2)
    # Three of Darkrai's thirteen were blacks a step apart: one of each.
    kept = []
    for c in pal:
        if all(np.abs(c - k).sum() > SAME for k in kept):
            kept.append(c)
    pal = np.array(kept)
    # ONE AT A TIME, the commonest lost colour first, into every place left:
    # cutting the lost pixels together blended Darkrai's blue eye with the
    # straw into a grey, and its collar's reds took the places before it.
    while len(pal) < colours:
        far = px[near(pal).min(axis=1) > far_]
        if len(far) < ACCENT_MIN:
            break
        bins, counts = np.unique(far // 24, axis=0, return_counts=True)
        top = bins[counts.argmax()]
        pal = np.vstack([pal, far[(far // 24 == top).all(axis=1)].mean(axis=0).round()])
    idx = np.zeros(a.shape[:2], int)
    idx[m] = near(pal).argmin(axis=1)
    return pal, idx


def edges(a, axis):
    """How much colour changes across each line of the image, summed along it."""
    d = np.abs(np.diff(a.astype(int), axis=axis)).sum(axis=2)
    return d.sum(axis=1 - axis).astype(float)


def comb(e, periods=None):
    """(period, offset, score) of the drawn grid on one axis: the evenly spaced
    cell edges that hold the most colour change - or half of it (`HALF`). The
    score is over the axis's mean change, so two axes compare."""
    n = len(e)

    def fit(periods):
        best = (0.0, 0.0, -1.0)
        for p in periods:
            for ph in np.arange(0, p, 0.5):
                score = e[np.round(np.arange(ph, n - 1, p)).astype(int)].mean()
                if score > best[2]:
                    best = (p, ph, score)
        return best

    if periods is not None:
        p, ph, score = fit(periods)
        return p, ph, score / e.mean()
    p, ph, score = fit(np.arange(GRID_MIN, GRID_MAX, 0.05))
    if p / 2 >= GRID_MIN:
        hp, hph, hscore = fit([p / 2])
        if hscore >= HALF * score:
            p, ph, score = hp, hph, hscore
    return p, ph, score / e.mean()


def native(a, m, base, colours=(), smart=False):
    """The drawing read on its own grid: a cell is opaque when most of it is, and
    its colour is the median of its inner half (JPEG blurs a cell's edges) taken
    to the palette. Scaled whole, placed as `shrink` places - or, when it cannot
    be, why: "big" (no scale fits the canvas) or "small" (`UNDER`)."""
    W, H = base.size
    bx0, by0, bx1, by1 = base.getchannel("A").getbbox()
    pal, _ = palette(a, m, *colours)
    # Drawn pixels are square: the axis that reads clearer names the size for
    # both (Haunter's height read 16 against its width's 12.8, and stretched).
    ex, ey = edges(a, 1), edges(a, 0)
    fx, fy = comb(ex), comb(ey)
    p = fx[0] if fx[2] >= fy[2] else fy[0]
    grid = []
    for axis, e in ((1, ex), (0, ey)):
        _, ph, _ = comb(e, [p])
        starts = np.arange(ph + 1, a.shape[axis], p)
        grid.append((p, np.concatenate([[max(0.0, ph + 1 - p)], starts])))
    (px, xs), (py, ys) = grid
    q = max(1, round(min(px, py) / 4))
    cells = np.zeros((len(ys), len(xs), 4), np.uint8)
    for j, y0 in enumerate(ys):
        ya, yb = int(round(y0)), int(round(y0 + py))
        for i, x0 in enumerate(xs):
            xa, xb = int(round(x0)), int(round(x0 + px))
            cm = m[ya:yb, xa:xb]
            if cm.size == 0 or cm.mean() < 0.5:
                continue
            im = m[ya + q:yb - q, xa + q:xb - q]
            inner = a[ya + q:yb - q, xa + q:xb - q][im] if im.any() else a[ya:yb, xa:xb][cm]
            c = np.median(inner, axis=0)
            cells[j, i, :3] = pal[int(np.abs(pal - c).sum(axis=1).argmin())]
            cells[j, i, 3] = 255
    rs, cs = np.nonzero(cells[..., 3])
    art = cells[rs.min():rs.max() + 1, cs.min():cs.max() + 1]
    th, tw = art.shape[:2]
    fits = [k for k in SCALES if tw * k <= W - 1 and th * k <= H - 1]
    if fits:
        k = min(fits, key=lambda k: abs(tw * k - (bx1 - bx0)))
        if tw * k < UNDER * (bx1 - bx0):
            return "small"
        art = art.repeat(k, axis=0).repeat(k, axis=1)
        th, tw = th * k, tw * k
    else:
        s = min((W - 1) / tw, (H - 1) / th)
        if s < NEAR_FIT:
            return "big"
        # Trimmed, only the axis that overflows narrows: the face keeps every row.
        tw, th = (min(tw, W - 1), min(th, H - 1)) if smart else (int(tw * s), int(th * s))
        art = trim(art, tw, th) if smart else np.asarray(Image.fromarray(np.ascontiguousarray(art), "RGBA").resize((tw, th), Image.NEAREST))
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx = (bx0 + bx1) // 2
    x = min(max(0, cx - tw // 2), W - tw)
    y = min(max(0, by1 - th), H - th)                     # feet on the base's row
    out.alpha_composite(Image.fromarray(np.ascontiguousarray(art), "RGBA"), (x, y))
    return out


def shrink(a, m, base, colours=(), fill=False):
    """The art at the base sprite's size, one target pixel per block of source.

    A block takes its commonest palette colour, except that the darkest colour
    (the outline) wins with a third of the block: a 1px line is a third of a
    block at best, and a plain majority vote erased Gengar's outline."""
    W, H = base.size
    bx0, by0, bx1, by1 = base.getchannel("A").getbbox()
    ys, xs = np.nonzero(m)
    ax0, ax1, ay0, ay1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    # As wide as the base's body; a hat may stand taller, never off the canvas.
    # `fill`: a drawing its own grid overflows, as big as the canvas allows.
    s = min((W - 1 if fill else bx1 - bx0) / (ax1 - ax0), (H - 1) / (ay1 - ay0), (W - 1) / (ax1 - ax0))
    tw, th = max(1, round((ax1 - ax0) * s)), max(1, round((ay1 - ay0) * s))
    pal, idx = palette(a, m, *colours)
    dark = int(np.argmin(pal.sum(axis=1)))
    art = np.zeros((th, tw, 4), np.uint8)
    for j in range(th):
        y0 = ay0 + int(j / s); y1 = max(y0 + 1, ay0 + int((j + 1) / s))
        for i in range(tw):
            x0 = ax0 + int(i / s); x1 = max(x0 + 1, ax0 + int((i + 1) / s))
            bm = m[y0:y1, x0:x1]
            if bm.mean() < 0.5:
                continue
            counts = np.bincount(idx[y0:y1, x0:x1][bm], minlength=len(pal))
            k = dark if counts[dark] >= bm.sum() / 3 else int(np.argmax(counts))
            art[j, i, :3] = pal[k]
            art[j, i, 3] = 255
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx = (bx0 + bx1) // 2
    x = min(max(0, cx - tw // 2), W - tw)
    y = min(max(0, by1 - th), H - th)                     # feet on the base's row
    out.alpha_composite(Image.fromarray(art, "RGBA"), (x, y))
    return out


def thin(img):
    """ONE PIXEL OF OUTLINE, as the games draw it (2026-10-26, reported: Trick-
    or-Treat Drifloon's border "so thick"). The drawings' pixels are coarser
    than the sprite grid, so fitting one to its species' body makes each drawn
    pixel about two, and the outline two thick - 30-97% of a look's edge was
    doubled, 15-32% of the games' own. Where the silhouette's edge is dark,
    the next pixel in is dark too and the one after that is colour, the outer
    one goes. A part that is dark all through (Drifloon's strings, a scythe's
    handle) has no colour behind it and stays."""
    a = np.asarray(img).copy()
    al = a[..., 3] > 0
    dark = al & (a[..., :3].astype(int).sum(-1) < 200)
    H, W = al.shape
    cut = []
    for y, x in zip(*np.nonzero(dark)):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            oy, ox, iy, ix, jy, jx = y + dy, x + dx, y - dy, x - dx, y - 2 * dy, x - 2 * dx
            outside = not (0 <= oy < H and 0 <= ox < W) or not al[oy, ox]
            if outside and 0 <= jy < H and 0 <= jx < W and dark[iy, ix] and al[jy, jx] and not dark[jy, jx]:
                cut.append((y, x))
                break
    for y, x in cut:
        a[y, x, 3] = 0
    return Image.fromarray(a, "RGBA")


# Each look's species, by look id (the canvas it is shrunk to and its shiny's base).
OF = {}
# The looks of a roaming week (`roam: true`): one species in costume, where a grey shiny keeps the costume (`recolour`).
ROAM = set()


def looks():
    """(event, base id) -> look id, read off eventforms.js - and (event, look id)
    -> look id: a week whose looks are all ONE species (Poncho Parade's 26
    Pikachu) names each drawing by its look id, `art/events/ponchos/19940.jpg`."""
    src = open(FORMS, encoding="utf-8").read()
    out = {}
    for ev in re.finditer(r'\n    id: "([a-z0-9-]+)",(.*?)\n  \},', src, re.S):
        for lid, of in re.findall(r"\{ id: (\d+), of: (\d+),", ev.group(2)):
            out[(ev.group(1), of)] = int(lid)
            out[(ev.group(1), lid)] = int(lid)
            OF[int(lid)] = of
            if "\n    roam: true," in ev.group(2):
                ROAM.add(int(lid))
    return out


def greys(base_id):
    """Whether the species' shiny is it gone grey: a turn of the wheel with no colour to turn."""
    n = np.asarray(Image.open(os.path.join(SPRITES, f"{base_id}.png")).convert("RGBA")).astype(int)
    sh = np.asarray(Image.open(os.path.join(SPRITES, "shiny", f"{base_id}.png")).convert("RGBA")).astype(int)
    on = n[..., 3] > 0
    return hue_shift(n[on][:, :3], sh[on][:, :3])[1] < GREY


def shiny(look, base_id, roam=False):
    """The look's shiny: `recolour`, or - when that barely shows - `tint`. A roaming
    week's grey shiny is never tinted: its silver face IS the change, and a tint
    toward a grey's hue is green."""
    out = recolour(look, base_id, roam)
    if roam and greys(base_id):
        return out
    a, b = np.asarray(look).astype(int), np.asarray(out).astype(int)
    on = a[..., 3] > 0
    moved = ((np.abs(a[..., :3] - b[..., :3]).sum(-1) > 30) & on).sum() / max(1, on.sum())
    return out if moved >= SEEN else tint(look, base_id)


def tint(look, base_id):
    """Every mid-tone pixel pulled toward the species' shiny hue: its
    circular mean over the shiny sprite's coloured pixels, weighted by how
    coloured each is. Greys take the hue at a fixed saturation, so a stone
    gargoyle goes gold where Geodude's shiny does, and outlines and
    highlights (the darkest and lightest) stay as drawn."""
    sh = np.asarray(Image.open(os.path.join(SPRITES, "shiny", f"{base_id}.png")).convert("RGBA")).astype(int)
    z = 0j
    for c in sh[sh[..., 3] > 0][:, :3]:
        h, l, s_ = colorsys.rgb_to_hls(*(c / 255))
        if 0.15 < l < 0.85:
            z += s_ * cmath.exp(2j * math.pi * h)
    hue = (cmath.phase(z) / (2 * math.pi)) % 1
    a = np.asarray(look).copy()
    for y, x in zip(*np.nonzero(a[..., 3])):
        h, l, s_ = colorsys.rgb_to_hls(*(a[y, x, :3] / 255))
        if 0.12 < l < 0.9:
            a[y, x, :3] = np.round(np.array(colorsys.hls_to_rgb(hue, l, max(s_, 0.45))) * 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def recolour(look, base_id, roam=False):
    """The look recoloured by its species' own normal -> shiny shift.

    Where the look still wears the species' own colours (the Gastly line,
    Mimikyu), each such colour takes that colour's shift and the costume -
    a colour the base never had - stays. Where the repaint replaced them (the
    vampire bats are pale and blood red, not blue), that would change nothing,
    and a shiny you cannot tell apart is no shiny: the whole look turns by the
    species' own hue shift instead (Zubat blue to green: the wings go blue)."""
    n = np.asarray(Image.open(os.path.join(SPRITES, f"{base_id}.png")).convert("RGBA")).astype(int)
    sh = np.asarray(Image.open(os.path.join(SPRITES, "shiny", f"{base_id}.png")).convert("RGBA")).astype(int)
    on = n[..., 3] > 0
    pairs = {}
    for c, d in zip(n[on][:, :3], sh[on][:, :3]):
        pairs.setdefault(tuple(c), []).append(tuple(d))
    src = np.array(list(pairs))
    dst = np.array([max(set(v), key=v.count) for v in pairs.values()])
    a = np.asarray(look).copy()
    opaque = list(zip(*np.nonzero(a[..., 3])))
    # A roaming week's grey shiny looks for its fur loosely (`FUR`), but only among the
    # species' own hues - so a red or yellow poncho is never taken for Eevee.
    grey = roam and greys(base_id)
    hues = [colorsys.rgb_to_hls(*(c / 255)) for c in src]
    hues = [h for h, l, sat in hues if sat > 0.15]
    lo, hi = (min(hues) - 0.02, max(hues) + 0.02) if hues else (0, 0)
    near = []
    for y, x in opaque:
        d = np.abs(src - a[y, x, :3].astype(int)).sum(axis=1)
        k = int(np.argmin(d))
        h, l, sat = colorsys.rgb_to_hls(*(a[y, x, :3] / 255))
        fur = grey and d[k] <= FUR and (sat <= 0.15 or lo <= h <= hi)
        near.append(k if (d[k] <= NEAR or fur) and (dst[k] != src[k]).any() else None)
    turn, fade = hue_shift(n[on][:, :3], sh[on][:, :3])
    # A ROAMING week's species gone GREY (Eevee's silver) has no turn of the
    # wheel to give: turning the whole look by it painted every poncho Eevee's
    # face green (2026-10-30). Its own colours go silver; the poncho stays as
    # drawn. Only a roaming week's: Pumpkin Mimikyu's shipped shiny is the
    # whole costume gone grey, and this half-greyed it.
    if sum(k is not None for k in near) >= SHARED * len(opaque) or grey:
        for (y, x), k in zip(opaque, near):
            if k is not None:
                a[y, x, :3] = np.clip(a[y, x, :3].astype(int) + dst[k] - src[k], 0, 255)
        return Image.fromarray(a.astype(np.uint8), "RGBA")
    for y, x in opaque:
        h, l, s_ = colorsys.rgb_to_hls(*(a[y, x, :3] / 255))
        if s_ > 0.2 and 0.08 < l < 0.92:
            a[y, x, :3] = np.round(np.array(colorsys.hls_to_rgb((h + turn) % 1, l, s_ * fade)) * 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def hue_shift(normal, shiny_):
    """The species' shiny as one turn of the colour wheel: the circular mean of
    every coloured pixel's hue change, weighted by how coloured it is."""
    z = 0j
    for c, d in zip(normal, shiny_):
        h1, l1, s1 = colorsys.rgb_to_hls(*(c / 255))
        h2, l2, s2 = colorsys.rgb_to_hls(*(d / 255))
        z += min(s1, s2) * cmath.exp(2j * math.pi * (h2 - h1))
    # And how much of its colour it keeps: Mimikyu's shiny is the same rag gone
    # grey, which is no turn at all.
    sat = lambda px: sum(colorsys.rgb_to_hls(*(c / 255))[2] for c in px) or 1
    return (cmath.phase(z) / (2 * math.pi)) % 1, min(1.0, sat(shiny_) / sat(normal))


def build(path, ids):
    event = os.path.basename(os.path.dirname(path))
    stem = os.path.splitext(os.path.basename(path))[0]
    lid = ids.get((event, stem))
    if lid is None:
        sys.exit(f"{path}: no look of {stem} in event {event!r} (eventforms.js)")
    base_id = OF[lid]
    a = np.asarray(Image.open(path).convert("RGB"))
    m = key(a, FLOOR.get((event, base_id), 168))
    if (event, base_id) in HOLLOW:
        m = hollow(a, m, (event, base_id) in GLOW, HOLLOW[(event, base_id)], KEEP.get((event, base_id), ()))
    if (event, stem) in HOLES:
        m = holes_out(a, m, HOLES[(event, stem)])
    base = Image.open(os.path.join(SPRITES, f"{base_id}.png")).convert("RGBA")
    colours = COLOURFUL.get((event, stem), ())
    # Its own grid keeps its own one-pixel outline: `thin` is the shrink's.
    out = native(a, m, base, colours, (event, stem) in TRIM)
    how = "its own grid"
    if isinstance(out, str):
        # Too big for the canvas: as big as it allows. Too small: the body's width.
        how = f"shrunk ({out})"
        out = thin(shrink(a, m, base, colours, fill=out == "big"))
    out = open_up(out.convert("RGBA"), SHUT_IN.get((event, base_id), []))
    out.save(os.path.join(SPRITES, f"{lid}.png"), optimize=True)
    shiny(out, base_id, lid in ROAM).save(os.path.join(SPRITES, "shiny", f"{lid}.png"), optimize=True)
    print(f"{event}/{base_id} -> {lid}: {how}, {out.size[0]}px, {len(out.getcolors(4096)) - 1} colours")
    return lid


if __name__ == "__main__":
    ids = looks()
    files = sorted(glob.glob(os.path.join(ART, "*", "*.jpg")) +
                   glob.glob(os.path.join(ART, "*", "*.png")))
    # A folder no event names yet is art waiting for its event, and `ref` is the references. A typo inside an event's still stops.
    known = {event for event, _ in ids}
    files = [f for f in files if os.path.basename(os.path.dirname(f)) in known]
    made = {build(f, ids) for f in files}
    missing = sorted(set(ids.values()) - made)
    if missing:
        sys.exit(f"no original drawn for look(s) {missing}")
