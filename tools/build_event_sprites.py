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
# The share of a look that must still wear its species' colours for those to
# be what its shiny moves (else the whole look turns by the species' hue).
SHARED = 0.25
COLOURS = 16
# Of those, up to this many are held back for small strong colours (an eye).
ACCENTS = 3
ACCENT_FAR = 90          # how far from every chosen colour counts as lost
ACCENT_MIN = 60          # source pixels: a 1024px eye is hundreds, JPEG noise is not
SAME = 24                # two chosen colours this close are one
HOLE_MIN = 400           # source pixels: an enclosed pocket smaller is part of the art
HOLE_FIT = 0.85          # the share of a pocket on a checker's squares that makes it one
# An island smaller than this share of the body is a speck of background.
SPECK = 0.004


def key(a):
    """Opaque mask: everything the border flood over light greys cannot reach."""
    h, w, _ = a.shape
    mx, mn = a.max(axis=2).astype(int), a.min(axis=2).astype(int)
    # The checker is two neutral greys (~195 and ~255); white is white. Light
    # AND unsaturated, so the fill never runs into a coloured body.
    bg = (mn > 168) & (mx - mn < 22)
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and bg[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True; q.append((yy, xx))
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


def palette(a, m):
    """`COLOURS` colours for the whole sprite, from its opaque pixels only -
    and the ACCENTS it would lose: median cut spends its colours where the
    pixels are, so a small, strong colour (Darkrai's blue eye, 2026-10-20)
    merged into its neighbour. Anything far from every chosen colour, and
    common enough not to be noise, takes one of `ACCENTS` places."""
    px = a[m].reshape(-1, 3).astype(int)
    q = Image.fromarray(px.reshape(1, -1, 3).astype(np.uint8), "RGB").quantize(
        COLOURS - ACCENTS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[:(COLOURS - ACCENTS) * 3]).reshape(-1, 3)
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
    while len(pal) < COLOURS:
        far = px[near(pal).min(axis=1) > ACCENT_FAR]
        if len(far) < ACCENT_MIN:
            break
        bins, counts = np.unique(far // 24, axis=0, return_counts=True)
        top = bins[counts.argmax()]
        pal = np.vstack([pal, far[(far // 24 == top).all(axis=1)].mean(axis=0).round()])
    idx = np.zeros(a.shape[:2], int)
    idx[m] = near(pal).argmin(axis=1)
    return pal, idx


def shrink(a, m, base):
    """The art at the base sprite's size, one target pixel per block of source.

    A block takes its commonest palette colour, except that the darkest colour
    (the outline) wins with a third of the block: a 1px line is a third of a
    block at best, and a plain majority vote erased Gengar's outline."""
    W, H = base.size
    bx0, by0, bx1, by1 = base.getchannel("A").getbbox()
    ys, xs = np.nonzero(m)
    ax0, ax1, ay0, ay1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    # As wide as the base's body; a hat may stand taller, never off the canvas.
    s = min((bx1 - bx0) / (ax1 - ax0), (H - 1) / (ay1 - ay0), (W - 1) / (ax1 - ax0))
    tw, th = max(1, round((ax1 - ax0) * s)), max(1, round((ay1 - ay0) * s))
    pal, idx = palette(a, m)
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


def looks():
    """(event, base id) -> look id, read off eventforms.js."""
    src = open(FORMS, encoding="utf-8").read()
    out = {}
    for ev in re.finditer(r'\n    id: "([a-z0-9-]+)",(.*?)\n  \},', src, re.S):
        for lid, of in re.findall(r"\{ id: (\d+), of: (\d+),", ev.group(2)):
            out[(ev.group(1), of)] = int(lid)
    return out


def shiny(look, base_id):
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
    near = []
    for y, x in opaque:
        d = np.abs(src - a[y, x, :3].astype(int)).sum(axis=1)
        k = int(np.argmin(d))
        near.append(k if d[k] <= NEAR and (dst[k] != src[k]).any() else None)
    if sum(k is not None for k in near) >= SHARED * len(opaque):
        for (y, x), k in zip(opaque, near):
            if k is not None:
                a[y, x, :3] = np.clip(a[y, x, :3].astype(int) + dst[k] - src[k], 0, 255)
        return Image.fromarray(a.astype(np.uint8), "RGBA")
    turn, fade = hue_shift(n[on][:, :3], sh[on][:, :3])
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
    base_id = os.path.splitext(os.path.basename(path))[0]
    lid = ids.get((event, base_id))
    if lid is None:
        sys.exit(f"{path}: no look of {base_id} in event {event!r} (eventforms.js)")
    a = np.asarray(Image.open(path).convert("RGB"))
    m = key(a)
    base = Image.open(os.path.join(SPRITES, f"{base_id}.png")).convert("RGBA")
    out = shrink(a, m, base)
    out.save(os.path.join(SPRITES, f"{lid}.png"), optimize=True)
    shiny(out, base_id).save(os.path.join(SPRITES, "shiny", f"{lid}.png"), optimize=True)
    print(f"{event}/{base_id} -> {lid}: {out.size[0]}px, {len(out.getcolors(4096)) - 1} colours")
    return lid


if __name__ == "__main__":
    ids = looks()
    files = sorted(glob.glob(os.path.join(ART, "*", "*.jpg")) +
                   glob.glob(os.path.join(ART, "*", "*.png")))
    files = [f for f in files if os.path.basename(os.path.dirname(f)) != "ref"]
    made = {build(f, ids) for f in files}
    missing = sorted(set(ids.values()) - made)
    if missing:
        sys.exit(f"no original drawn for look(s) {missing}")
