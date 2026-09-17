# -*- coding: utf-8 -*-
"""Turn the drawn rarity badges into game-ready icons.

Run:  python tools/build_marks.py

The art arrives as large PNGs in `.assets-src/marks/` — around 1250px square,
and `complete.png` is a **contact sheet** of four icons in a row rather than the
rosette on its own. Neither is what a 12px mark on a Dex tile needs, so this is
the step between.

**Holo arrived after the contact sheet was drawn**, so it is read from
`holo.png` alone and the sheet still means exactly what it meant before — four
icons, in the order it was drawn in. Redrawing the sheet to five would silently
re-map every column. Until that file exists, a placeholder is generated and
said so, loudly: a missing icon is a broken image on a Dex tile, and a broken
image is worse than a plain one.

Two things it has to get right:

  * **There is no native pixel grid to recover.** The obvious move with pixel art
    this size is to find the upscale factor and divide it out. These were
    resampled rather than nearest-upscaled — run-length analysis gives a gcd of 1
    — so there is no integer to find, and pretending otherwise would quantise to
    the wrong grid. They are downsampled with a box filter instead, which is the
    honest answer for art that was never on a grid.
  * **Every icon has to land on the same canvas.** Three marks sitting in a row
    have to share a baseline, and they are different shapes at different aspects,
    so each is fitted into the same square by its longest side and centred.

Output is 24px, displayed at 12. Even multiples so `image-rendering: pixelated`
has whole pixels to work with, which is the difference between crisp and mush.
"""

import io
import os
import sys

from PIL import Image

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SRC = ".assets-src/marks"
OUT = "public/marks"
SIZE = 24
# The contact sheet's icons, left to right. The first three duplicate the
# single files; only the rosette is unique to it. This is a fact about the
# drawing on disk, so it does NOT grow when a tier is added.
SHEET_ORDER = ["origin", "shiny", "astral", "complete"]
# Everything the game asks for. `src/ui/Marks.jsx` names the same set.
ICONS = ["origin", "shiny", "holo", "astral", "glitched", "vivid", "noir",
         "showdown", "complete", "legendary"]

# THE SHAPE HAS TO CARRY IT, NOT THE COLOUR. Eight of these sit in a row on a
# 76px Dex tile at 9px, and a row of coloured dots is unreadable to anybody who
# cannot separate the colours - so every mark has to be tellable from every
# other in greyscale. The four already drawn are a ring, a four-point star, a
# hexagon and a diamond; these four take a bolt, a burst, a half-disc and a
# play triangle, which share no silhouette with those or with each other.
STAND_IN = {
    "glitched": ((255, 60, 140), [(58, 8), (18, 56), (44, 56), (36, 92),
                                  (78, 40), (50, 40)]),
    "vivid":    ((255, 168, 40), [(50, 6), (60, 38), (94, 38), (66, 58),
                                  (78, 92), (50, 71), (22, 92), (34, 58),
                                  (6, 38), (40, 38)]),
    "noir":     ((225, 228, 236), None),          # a half-disc, drawn below
    "showdown": ((120, 210, 255), [(24, 12), (88, 50), (24, 88)]),
}


def placeholder_shape(name, size=256):
    """A flat geometric stand-in, deliberately not in the house style.

    It should be obvious in the game that these four have not been drawn yet -
    a plausible-looking placeholder is one nobody ever replaces. Everything is
    laid out on a 100-unit grid and scaled, so the shapes stay right whatever
    `size` is."""
    from PIL import ImageDraw

    colour, pts = STAND_IN[name]
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = size / 100.0

    if pts is None:
        # Noir: a disc with its right half cut away, which reads as "no colour"
        # and shares no outline with the ring the Origin mark uses.
        pad = size // 10
        d.ellipse([pad, pad, size - pad, size - pad], fill=colour + (255,))
        d.rectangle([size // 2, 0, size, size], fill=(0, 0, 0, 0))
        d.ellipse([pad, pad, size - pad, size - pad], outline=colour + (255,),
                  width=max(2, size // 22))
        return im

    d.polygon([(x * k, y * k) for (x, y) in pts], fill=colour + (255,))
    return im


def columns(im, gap=4):
    """Split an image on runs of fully transparent columns."""
    alpha = im.split()[3]
    w, h = im.size
    empty = [max(alpha.crop((x, 0, x + 1, h)).getextrema()) == 0 for x in range(w)]
    spans, start = [], None
    for x in range(w + 1):
        solid = x < w and not empty[x]
        if solid and start is None:
            start = x
        elif not solid and start is not None:
            if x - start > gap:
                spans.append((start, x))
            start = None
    return spans


def solid_box(im, floor=40):
    """The bounding box of pixels that are actually opaque enough to see.

    `getbbox()` measures ANY non-zero alpha, and these drawings carry a soft
    glow fringe around them - so fitting to it sized each icon by its glow
    rather than by itself, and a compact ring came out half the size of a
    long-armed star that was nominally the same. Everything below `floor` is
    fringe and is not what the eye measures."""
    alpha = im.split()[3].point(lambda v: 255 if v >= floor else 0)
    return alpha.getbbox() or im.getbbox()


def square(im, size=SIZE, margin=1):
    """Fit to `size` by the longest SOLID side, centred, on a clear canvas."""
    art = im.crop(solid_box(im))
    span = float(max(art.size))
    scale = (size - margin * 2) / span
    small = art.resize(
        (max(1, int(round(art.width * scale))), max(1, int(round(art.height * scale)))),
        Image.BOX,
    )
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(small, ((size - small.width) // 2, (size - small.height) // 2), small)
    return out


def placeholder_legendary(size=256):
    """A stand-in until the drawn one lands in .assets-src/marks/legendary.png.

    An eight-point star with a bright core - the one shape in this set that is
    not about a finish or a palette, because legendary is about the SPECIES.
    Deliberately plain: a placeholder that looks finished is a placeholder that
    never gets replaced."""
    import math
    from PIL import ImageDraw

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c, r = size / 2.0, size * 0.46
    pts = []
    for i in range(16):
        a = math.pi * i / 8.0 - math.pi / 2
        rad = r if i % 2 == 0 else r * 0.40
        pts.append((c + math.cos(a) * rad, c + math.sin(a) * rad))
    d.polygon(pts, fill=(247, 196, 62, 255), outline=(120, 82, 8, 255))
    d.ellipse([c - r * 0.20, c - r * 0.20, c + r * 0.20, c + r * 0.20],
              fill=(255, 245, 205, 255))
    return img


def placeholder_holo(size=256):
    """A stand-in foil chip, for use until the drawn Holo badge exists.

    Deliberately geometric rather than an attempt at the house style: it should
    be obvious in the game that this one has not been drawn yet. A hexagon,
    because the other three are a ring, a star and a diamond and a fourth mark
    has to be tellable from them in greyscale at 12px."""
    from PIL import ImageDraw

    # A diagonal rainbow field, then a hexagon cut out of it.
    band = [(255, 92, 160), (255, 214, 92), (120, 255, 205),
            (112, 176, 255), (196, 128, 255)]
    grad = Image.new("RGBA", (size, size))
    px = grad.load()
    last = len(band) - 1
    for y in range(size):
        for x in range(size):
            t = (x + y) / float(2 * size - 2) * last
            i = min(int(t), last - 1)
            f = t - i
            a, b = band[i], band[i + 1]
            px[x, y] = (int(a[0] + (b[0] - a[0]) * f),
                        int(a[1] + (b[1] - a[1]) * f),
                        int(a[2] + (b[2] - a[2]) * f), 255)

    m = size // 2
    r = m - size // 16
    hexagon = [(m - r // 2, m - r), (m + r // 2, m - r), (m + r, m),
               (m + r // 2, m + r), (m - r // 2, m + r), (m - r, m)]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).polygon(hexagon, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(out)
    # A gloss stripe across it, so it reads as a shiny surface and not a badge.
    d.polygon([(m - r, m - r // 3), (m + r, m - r), (m + r, m - r // 2),
               (m - r, m + r // 6)], fill=(255, 255, 255, 90))
    d.line(hexagon + [hexagon[0]], fill=(60, 28, 96, 255), width=max(2, size // 42))
    return out


def main():
    if not os.path.isdir(SRC):
        raise SystemExit(
            "put the drawn badges in %s first (origin/shiny/astral/complete .png)" % SRC)
    os.makedirs(OUT, exist_ok=True)

    made = {}
    # The rosette only exists inside the sheet, so the sheet is read first and
    # anything it yields is a fallback for a missing single file.
    sheet_path = os.path.join(SRC, "complete.png")
    if os.path.exists(sheet_path):
        sheet = Image.open(sheet_path).convert("RGBA")
        spans = columns(sheet)
        if len(spans) != len(SHEET_ORDER):
            raise SystemExit(
                "complete.png splits into %d icons, expected %d - is it still a "
                "row of %s?" % (len(spans), len(SHEET_ORDER), "/".join(SHEET_ORDER)))
        for name, (x0, x1) in zip(SHEET_ORDER, spans):
            made[name] = sheet.crop((x0, 0, x1, sheet.height))

    # A single file, where one exists, wins over the sheet: it is the larger and
    # cleaner drawing of the same icon. `complete` has no single file - it only
    # ever existed inside the sheet - so it is never looked for.
    for name in ICONS:
        one = os.path.join(SRC, "%s.png" % name)
        if name != "complete" and os.path.exists(one):
            made[name] = Image.open(one).convert("RGBA")

    stood_in = []
    if "holo" not in made:
        made["holo"] = placeholder_holo()
        stood_in.append("holo")
    for name in STAND_IN:
        if name not in made:
            made[name] = placeholder_shape(name)
            stood_in.append(name)
    if "legendary" not in made:
        made["legendary"] = placeholder_legendary()
        stood_in.append("legendary")

    missing = [n for n in ICONS if n not in made]
    if missing:
        raise SystemExit("no art for: %s" % ", ".join(missing))

    spans = {}
    for name in ICONS:
        icon = square(made[name])
        icon.save(os.path.join(OUT, "%s.png" % name))
        b = solid_box(icon)
        spans[name] = max(b[2] - b[0], b[3] - b[1])
        print("  %-9s %dx%d  solid %dx%d" % (
            name, icon.width, icon.height, b[2] - b[0], b[3] - b[1]))

    # Up to four of these sit in a row on one tile, so they have to look like a
    # set.
    # Fitting by the longest solid side means each should now reach within a
    # pixel of the canvas; anything that does not is art with a different amount
    # of padding baked in, and it will read as the odd one out.
    low, high = min(spans.values()), max(spans.values())
    assert high - low <= 2, (
        "the icons are not a set - solid spans %s; they share a tile" % spans)
    assert high >= SIZE - 4, "the icons do not fill their canvas: %s" % spans
    print("wrote %s (%d icons at %dpx)" % (OUT, len(made), SIZE))
    if stood_in:
        print("\n  !! PLACEHOLDER ART: %s" % ", ".join(stood_in))
        print("     drop the drawn badge at %s/<name>.png and re-run; a single"
              % SRC)
        print("     file always wins over anything generated here.")


if __name__ == "__main__":
    main()
