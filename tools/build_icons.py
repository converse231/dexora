# -*- coding: utf-8 -*-
"""Normalise the drawn tab icons into masks the rail can tint.

Run:  python tools/build_icons.py

Five silhouettes arrive in `.assets-src/icons/` at around 1250px square. They
are not shipped as pictures: a tab is pale with dark text when idle and dark
green with pale text when it is the one you are on, so ANY fixed colour is
invisible in one of those two states. They are emitted as **masks** instead -
alpha only, painted pure white - and `styles.css` fills them with
`currentColor`, so each one is whatever colour its tab's text is. That is the
whole reason the art was asked for as single-colour silhouettes.

Sized like the marks are, and for the same reason: 32px emitted, 16px shown.
Whole halves, so a 2x display gets the mask at 1:1 and a 1x display gets a
clean 2:1 reduction rather than an arbitrary resample.

Each is fitted to its square by its longest SOLID side, ignoring any faint
fringe - see `solid_box`. The five are different shapes (the bag is wide, the
Pokedex is tall) and fitting by the bounding box alone would make the widest
one look bigger than the rest sitting next to it in a row of five.
"""

import os

from PIL import Image

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SRC = ".assets-src/icons"
OUT = "public/icons"
SIZE = 32
MARGIN = 1
# The rail's tab ids. The file is `<id>-icon.png`, which is how they arrived.
TABS = ["dex", "box", "shop", "map", "you"]


def solid_box(im, floor=40):
    """Bounding box of the pixels actually dense enough to see.

    `getbbox()` counts any non-zero alpha, and a soft edge would size an icon
    by its fringe rather than by itself - the same trap build_marks.py hit,
    where a compact ring came out half the size of a long-armed star."""
    alpha = im.split()[3].point(lambda v: 255 if v >= floor else 0)
    return alpha.getbbox() or im.getbbox()


def main():
    if not os.path.isdir(SRC):
        raise SystemExit("put the drawn icons in %s first (<tab>-icon.png)" % SRC)
    os.makedirs(OUT, exist_ok=True)

    spans = {}
    for tab in TABS:
        path = os.path.join(SRC, "%s-icon.png" % tab)
        if not os.path.exists(path):
            raise SystemExit("no icon for %s at %s" % (tab, path))

        im = Image.open(path).convert("RGBA")
        art = im.crop(solid_box(im))

        scale = (SIZE - MARGIN * 2) / float(max(art.size))
        small = art.resize(
            (max(1, int(round(art.width * scale))),
             max(1, int(round(art.height * scale)))),
            Image.LANCZOS,
        )
        # A mask carries no colour. White everywhere, with the drawing's own
        # alpha - so nothing here can fight the tint applied in CSS.
        white = Image.new("RGBA", small.size, (255, 255, 255, 0))
        white.putalpha(small.split()[3])

        out = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
        out.paste(white, ((SIZE - white.width) // 2, (SIZE - white.height) // 2), white)
        out.save(os.path.join(OUT, "%s.png" % tab))

        b = solid_box(out)
        spans[tab] = max(b[2] - b[0], b[3] - b[1])
        print("  %-5s %dx%d  solid %dx%d" % (
            tab, out.width, out.height, b[2] - b[0], b[3] - b[1]))

    # Five of these sit in a row, so they have to look like one set. Fitting by
    # the longest solid side means each should reach within a pixel of its
    # canvas; anything short is art with different padding baked in, and it
    # reads as the odd tab out.
    low, high = min(spans.values()), max(spans.values())
    assert high - low <= 2, "the icons are not a set - solid spans %s" % spans
    assert high >= SIZE - 4, "the icons do not fill their canvas: %s" % spans
    print("wrote %s (%d masks at %dpx, shown at %d)" % (OUT, len(TABS), SIZE, SIZE // 2))


if __name__ == "__main__":
    main()
