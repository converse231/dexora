"""Event icons for the HUD's event card: .assets-src/events -> public/events.

The event card is the field-effect card (`.fieldbox`) with an event in it -
an outbreak, a rift - so its icon is drawn at the same 30px, from a 32px file.
Fitting is `build_marks.square`: by the longest SOLID side, so a soft glow
fringe does not shrink the drawing it surrounds.

Run: python tools/build_events.py
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_marks import square  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, ".assets-src", "events")
OUT = os.path.join(ROOT, "public", "events")
SIZE = 32
# The events that ship. research.png and alpha.png in the same folder are Dex
# and Box MARKS and go through build_marks.py with the phase that uses them.
EVENTS = ["outbreak", "rift"]


def main():
    os.makedirs(OUT, exist_ok=True)
    for name in EVENTS:
        im = Image.open(os.path.join(SRC, name + ".png")).convert("RGBA")
        # A generated image with a painted background would fit the BACKGROUND,
        # not the drawing, and arrive as a solid square. Refuse it.
        w, h = im.size
        corners = [im.getpixel(p)[3] for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
        assert max(corners) < 16, f"{name}.png has an opaque background - it needs transparency"
        out = square(im, SIZE)
        out.save(os.path.join(OUT, name + ".png"))
        print(f"  {name}: {w}x{h} -> {SIZE}x{SIZE}")


if __name__ == "__main__":
    main()
