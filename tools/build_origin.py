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
      "sprites/pokemon/versions")

"""ORIGIN IS THE SPECIES' DEBUT ARTWORK, which is what it always meant.

It was written as "the Generation I sprite" because Gen 1 was all that shipped,
and the tier's identity - the 1996 drawing, the one from before anyone had drawn
it a second time - generalises without changing a word: a Johto species debuted
in Gold/Silver and a Sinnoh species in Diamond/Pearl. Reading it as "Gen 1 art"
instead would have meant no Origin at all for 207 of the 358, which would have
made the rarest-but-one tier a Kanto-only curiosity.

Yellow before Red/Blue for Kanto: it is the redrawn set, closer to the art
everyone remembers. Crystal before Gold for Johto, for the same reason."""
DEBUT = [
    (1, 151, ["generation-i/yellow/transparent", "generation-i/red-blue/transparent"]),
    (152, 251, ["generation-ii/crystal/transparent", "generation-ii/gold/transparent",
                "generation-ii/silver/transparent"]),
    (387, 493, ["generation-iv/diamond-pearl", "generation-iv/platinum",
                "generation-iv/heartgold-soulsilver"]),
]
OUT = "public/sprites/origin"

IDS = sorted(int(n[:-4]) for n in os.listdir("public/sprites") if n.endswith(".png"))
COUNT = len(IDS)


def sources_for(dex_id):
    for lo, hi, where in DEBUT:
        if lo <= dex_id <= hi:
            return where
    raise SystemExit("#%d belongs to no shipped generation" % dex_id)


def fetch(dex_id):
    last = None
    for where in sources_for(dex_id):
        try:
            url = "%s/%s/%d.png" % (GH, where, dex_id)
            with urllib.request.urlopen(url, timeout=30) as r:
                return Image.open(io.BytesIO(r.read())).convert("RGBA")
        except Exception as exc:            # 404 on one set is normal
            last = exc
    raise SystemExit("no debut sprite for #%d: %s" % (dex_id, last))


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


CANVAS = 64


def normalise(dex_id):
    """The ordinary sprite, on the one canvas the game draws.

    FireRed drew 1-386 at 64x64 and those are already right. Sinnoh has no
    FireRed art to borrow, so those come from HeartGold/SoulSilver at 80x80 -
    and an 80px sprite in a 64px slot is not merely large, it is a DIFFERENT
    SIZE from everything beside it in a Box row or a Dex cell, which reads as a
    rendering fault rather than as a big Pokemon.

    Rewritten in place, and idempotent: a sprite already on the canvas is
    returned untouched, so running this twice cannot shrink anything twice."""
    path = "public/sprites/%d.png" % dex_id
    art = Image.open(path).convert("RGBA")
    if art.size == (CANVAS, CANVAS):
        return art
    for where in ("", "shiny/"):
        src = "public/sprites/%s%d.png" % (where, dex_id)
        one = Image.open(src).convert("RGBA")
        box = one.getbbox()
        if box is None:
            one = one.resize((CANVAS, CANVAS), Image.NEAREST)
        else:
            crop = one.crop(box)
            fit = min(CANVAS / float(crop.width), CANVAS / float(crop.height))
            crop = crop.resize((max(1, int(round(crop.width * fit))),
                                max(1, int(round(crop.height * fit)))), Image.NEAREST)
            out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
            out.paste(crop, ((CANVAS - crop.width) // 2,
                             (CANVAS - crop.height) // 2), crop)
            one = out
        one.save(src)
        if where == "":
            art = one
    return art


def main():
    os.makedirs(OUT, exist_ok=True)
    fits, heights = [], []
    for n, dex_id in enumerate(IDS, 1):
        ours = normalise(dex_id)
        made = reframe(fetch(dex_id), ours)
        assert made.size == ours.size, "#%d came out %s" % (dex_id, made.size)
        made.save(os.path.join(OUT, "%d.png" % dex_id))
        b, o = made.getbbox(), ours.getbbox()
        hr = (b[3] - b[1]) / float(o[3] - o[1])
        wr = (b[2] - b[0]) / float(o[2] - o[0])
        heights.append(hr)
        fits.append(max(hr, wr))
        sys.stdout.write("\rorigin %d/%d" % (n, COUNT))
        sys.stdout.flush()

    med = sorted(heights)[len(heights) // 2]
    print("\nwrote %s (%d sprites, median height %.2f of the ordinary art)"
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
