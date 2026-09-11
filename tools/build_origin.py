# -*- coding: utf-8 -*-
"""Origin sprites: the original 1996 artwork, framed like ours.

Run:  python tools/build_origin.py     (or `npm run assets`, which chains it)

An Origin Pokemon wears its Generation I sprite - the art from Red/Blue/Yellow,
before anyone had drawn it a second time. That is the whole tell, and it needs
no filter: a 1996 sprite beside a 2004 one is unmistakable at a glance, where
`saturate()` is invisible and `hue-rotate()` just makes a green Charizard.

The catch, and the reason this file exists: **the two sets are framed
differently.** Gen 1 sprites are art of ~36px sitting in a 96px canvas, ours is
art of ~45px in a 64px canvas - so swapping the src alone draws every Origin
noticeably SMALLER than the ordinary one, which reads as a rendering bug rather
than as a rare variant. Measured across the dex, the art fills 0.34-0.58 of the
Gen 1 canvas against 0.53-1.00 of ours.

So each one is trimmed to its own art, scaled to the box the FireRed sprite of
that same species occupies, and re-centred on that sprite's centre. Per-species
rather than one global factor, because the ratio is not constant. The scale
lands near 1.0 for most of the dex, so there is very little resampling - and
what there is uses NEAREST, because this is pixel art and smoothing it would
lose the thing being collected.
"""

import io
import os
import sys
import urllib.request

from PIL import Image

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

GH = ("https://raw.githubusercontent.com/PokeAPI/sprites/master/"
      "sprites/pokemon/versions/generation-i")
# Yellow first: it is the redrawn Gen 1 set, closer to the art everyone
# remembers, and it is what the reference screenshot shows. Red/Blue is the
# fallback for anything Yellow is missing.
SOURCES = ["yellow/transparent", "red-blue/transparent"]
OUT = "public/sprites/origin"
COUNT = len([n for n in os.listdir("public/sprites") if n.endswith(".png")])


def fetch(dex_id):
    last = None
    for where in SOURCES:
        try:
            url = "%s/%s/%d.png" % (GH, where, dex_id)
            with urllib.request.urlopen(url, timeout=30) as r:
                return Image.open(io.BytesIO(r.read())).convert("RGBA")
        except Exception as exc:            # 404 on one set is normal
            last = exc
    raise SystemExit("no Gen 1 sprite for #%d: %s" % (dex_id, last))


def reframe(art, like):
    """Put `art` in `like`'s canvas, at `like`'s size and centre."""
    box = like.getbbox()
    if box is None:
        raise SystemExit("a FireRed sprite is entirely transparent")
    tw, th = box[2] - box[0], box[3] - box[1]
    cx, cy = (box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0

    cut = art.crop(art.getbbox())
    # Fit inside the target box, keeping the aspect: an Origin that is squashed
    # to match a taller FireRed pose would be worse than one a little small.
    scale = min(tw / cut.width, th / cut.height)
    size = (max(1, int(round(cut.width * scale))),
            max(1, int(round(cut.height * scale))))
    cut = cut.resize(size, Image.NEAREST)

    out = Image.new("RGBA", like.size, (0, 0, 0, 0))
    out.paste(cut, (int(round(cx - size[0] / 2.0)), int(round(cy - size[1] / 2.0))), cut)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    fits, heights = [], []
    for dex_id in range(1, COUNT + 1):
        ours = Image.open("public/sprites/%d.png" % dex_id).convert("RGBA")
        made = reframe(fetch(dex_id), ours)
        assert made.size == ours.size, "#%d came out %s" % (dex_id, made.size)
        made.save(os.path.join(OUT, "%d.png" % dex_id))
        b, o = made.getbbox(), ours.getbbox()
        hr = (b[3] - b[1]) / float(o[3] - o[1])
        wr = (b[2] - b[0]) / float(o[2] - o[0])
        heights.append(hr)
        fits.append(max(hr, wr))
        sys.stdout.write("\rorigin %d/%d" % (dex_id, COUNT))
        sys.stdout.flush()

    med = sorted(heights)[len(heights) // 2]
    print("\nwrote %s (%d sprites, median height %.2f of the FireRed art)"
          % (OUT, len(fits), med))

    # What matters is APPARENT SIZE, and the honest test of it is that the fit
    # touches: `min()` scaling means one dimension should land on the FireRed
    # art's own. Comparing widths alone flagged Metapod at 0.49 - and that is
    # not a fault, it is two different drawings. Gen 1 draws it head-on and
    # narrow, FireRed at an angle and wide; both are 25 pixels tall.
    worst = min(fits)
    assert worst >= 0.95, \
        "an Origin fits its ordinary sprite on neither axis (worst %.2f)" % worst


if __name__ == "__main__":
    main()
