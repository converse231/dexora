# -*- coding: utf-8 -*-
"""Slice the throw-animation sheet into one strip per ball the game sells.

Run:  python tools/build_balls.py

Source: "All Pokeball Sprites for throw animation" by Anarlaurendil,
https://www.deviantart.com/anarlaurendil/art/All-Pokeball-Sprites-for-throw-animation-815730891
CC BY 3.0 - free to use in a fan game, attribution required. It is credited in
README.md, which is the whole of the obligation and is not optional.

The sheet is 28 balls across by 32 frames down on a 64px grid. We sell eight of
them, so 20 columns and 1.2MB of PNG are cut here rather than shipped: the
sheet itself lives in `.assets-src/` and never enters `public/`, for the same
reason the ripped tileset references do not - Vite copies all of public into
every build.

COLUMN ORDER IS THE ARTIST'S, taken from the artwork description, not guessed.
That matters more than it sounds: a first pass tried to identify the columns by
matching each one's colours against the PokeAPI icon we already ship, and the
ruler was checked against the four balls nobody could get wrong - Poke, Great,
Ultra, Master. It got two of the four. Two red-and-white balls and four blue
ones is exactly the situation where a confident guess ships a Net Ball that
throws a Dive Ball, so the guess was thrown away and the source consulted.

FRAME LAYOUT, also the artist's:

    f00-f03   4   the throw
    f04-f14  11   aspiration - opens, the burst, the beam, closes
    f15-f19   5   the shakes, centre button lit
    f20-f26   7   the catch failing - bursts open, halves fly apart
    f27-f31   5   the catch landing - the click and its sparkles

`src/styles.css` steps through those ranges by phase. The numbers are repeated
there because CSS keyframes cannot import anything; check.mjs holds the two
copies together.

One thing worth knowing before touching the CSS: **the shake wobble is drawn
into f15-f19**, which swing the ball to x-centre 28 and back out to 36. Every
other frame is centred on 32. So the ball must NOT also be wobbled by CSS
during a shake - that was the old animation's job and the two compound into a
lurch.
"""

import os

from PIL import Image

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SRC = ".assets-src/balls/throw-sheet.png"
OUT = "public/items/throw"
CELL = 64
FRAMES = 32
SHEET_COLS = 28

# The artist's order, as published. Only the eight we sell are sliced.
COLUMN = {
    "poke-ball": 0, "great-ball": 1, "ultra-ball": 2, "master-ball": 3,
    "net-ball": 8, "repeat-ball": 10, "timer-ball": 11, "dusk-ball": 14,
}
# Every ball draws its closed, resting self here: 14x14, centred. Asserted,
# because it is the number `.ball`'s width is derived from - the art fills
# 21.9% of its cell, so the cell has to be drawn about five times the size the
# ball should look.
REST_FRAME = 3
REST_BOX = (25, 25, 39, 39)


def main():
    if not os.path.exists(SRC):
        raise SystemExit("put the sheet at %s first" % SRC)
    sheet = Image.open(SRC).convert("RGBA")

    w, h = sheet.size
    assert w == SHEET_COLS * CELL and h == FRAMES * CELL, (
        "expected a %dx%d sheet, got %dx%d - is this the same artwork?"
        % (SHEET_COLS * CELL, FRAMES * CELL, w, h))

    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name, col in sorted(COLUMN.items(), key=lambda kv: kv[1]):
        strip = sheet.crop((col * CELL, 0, col * CELL + CELL, FRAMES * CELL))

        # Every frame has to carry something. A blank one is a column index off
        # by one, and the animation would simply go invisible for a beat.
        blank = [f for f in range(FRAMES)
                 if strip.crop((0, f * CELL, CELL, f * CELL + CELL)).getbbox() is None]
        assert not blank, "%s: frames %s are empty - wrong column?" % (name, blank)

        rest = strip.crop((0, REST_FRAME * CELL, CELL, REST_FRAME * CELL + CELL))
        assert rest.getbbox() == REST_BOX, (
            "%s: resting ball is %s, expected %s - the sheet's geometry moved "
            "and `.ball`'s size in styles.css is derived from it"
            % (name, rest.getbbox(), REST_BOX))

        path = os.path.join(OUT, "%s.png" % name)
        strip.save(path, optimize=True)
        size = os.path.getsize(path)
        total += size
        print("  %-12s col %2d  %dx%d  %5.1f KB" % (
            name, col, strip.width, strip.height, size / 1024))

    print("wrote %d strips to %s (%.0f KB total, from a %.0f KB sheet)" % (
        len(COLUMN), OUT, total / 1024, os.path.getsize(SRC) / 1024))


if __name__ == "__main__":
    main()
