"""Merge Geist Pixel's dots into outlines: public/fonts/geist-pixel.woff2, in place.

    python tools/build_font.py        (needs: pip install fonttools brotli skia-pathops)

WHY. Geist Pixel draws every glyph as one CONTOUR PER PIXEL - an "A" is 84
separate 38-unit squares and 2,184 points, a "$" 3,198, the font 10,492
contours. A browser rasterises a face once per size it is used at, so every
new size on screen re-draws thousands of little squares per glyph, on the main
thread, the first time. Measured on a phone-speed CPU (6x throttled Chrome):
the Box's first open blocked 4.6s, the Shop's 2.9s, the YOU panel's 0.9s - and
with this one face swapped out, 1.4s, 0.7s and 0.2s. Reported from an Android
phone as the Settings and Dex tabs "freezing for about six seconds".

WHAT. The squares sit edge to edge on the design grid (every dot is 38x38 at a
multiple of 38; the in-between points are on the straight edges), so the
UNION of a glyph's dots is exactly the same shape as the dots themselves.
Each glyph becomes that union - a few rectilinear outlines - and nothing else
in the font changes: metrics, kerning, cmap, names. The same shape (the check
at the end holds every glyph's area and bounds equal), far fewer points - and
solid strokes where a rasteriser used to leave a seam between two squares.

IDEMPOTENT: merging an already-merged font changes nothing, which is why it
may rewrite its own input. The original is kept once in .assets-src/.

The font is OFL-1.1 with no Reserved Font Name, so a modified copy may keep
its name; README's credit says it is modified.
"""
import io
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "public", "fonts", "geist-pixel.woff2")
KEEP = os.path.join(ROOT, ".assets-src", "fonts", "geist-pixel.original.woff2")


def merge(font):
    """Each simple glyph -> the union of its contours. Returns (before, after) contour totals."""
    import pathops
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    glyf = font["glyf"]
    gs = font.getGlyphSet()
    before = after = 0
    for name in font.getGlyphOrder():
        g = glyf[name]
        if g.isComposite() or g.numberOfContours <= 0:
            continue
        before += g.numberOfContours
        path = pathops.Path()
        gs[name].draw(path.getPen())
        path.simplify(fix_winding=True, clockwise=True)    # TrueType: outer contours clockwise
        pen = TTGlyphPen(gs)
        path.draw(pen)
        new = pen.glyph()
        new.recalcBounds(glyf)
        glyf[name] = new
        after += max(0, new.numberOfContours)
    return before, after


def shape(font, name):
    """A glyph's filled area and bounds - what "the same shape" means here."""
    from fontTools.pens.areaPen import AreaPen
    from fontTools.pens.boundsPen import BoundsPen
    gs = font.getGlyphSet()
    ap, bp = AreaPen(gs), BoundsPen(gs)
    gs[name].draw(ap)
    gs[name].draw(bp)
    return abs(ap.value), bp.bounds


def ttf_bytes(font):
    buf = io.BytesIO()
    flavor = font.flavor
    font.flavor = None
    font.save(buf)
    font.flavor = flavor
    return buf.getvalue()


def main():
    from fontTools.ttLib import TTFont
    if not os.path.exists(KEEP):
        os.makedirs(os.path.dirname(KEEP), exist_ok=True)
        shutil.copyfile(FONT, KEEP)
        print("  kept the original at", os.path.relpath(KEEP, ROOT))
    src = TTFont(KEEP)
    ref = ttf_bytes(src)
    font = TTFont(KEEP)
    before, after = merge(font)
    out = ttf_bytes(font)

    # THE SAME SHAPE, glyph by glyph: the dots only TOUCH, so their union
    # covers exactly their summed area, inside exactly their bounds. Not a
    # pixel comparison - the point of merging is that a rasteriser no longer
    # draws a faint seam wherever two squares met, so the pixels DO change:
    # the strokes render solid instead of as a grid of dots.
    for name in font.getGlyphOrder():
        (a0, b0), (a1, b1) = shape(src, name), shape(font, name)
        assert abs(a0 - a1) < 0.5 and b0 == b1, f"{name}: the merged glyph is a different shape ({a0} {b0} -> {a1} {b1})"

    font.flavor = "woff2"
    font.save(FONT)
    print("  %s: %d contours -> %d, %d KB, every glyph the same shape"
          % (os.path.relpath(FONT, ROOT), before, after, os.path.getsize(FONT) // 1024))


if __name__ == "__main__":
    sys.exit(main())
