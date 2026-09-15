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
everyone remembers. Crystal before Gold for Johto, for the same reason.

AND SINNOH IS NOT HERE, which is the whole of what this table now says. It was
here, pointing at Diamond/Pearl, and the result was reported from play as "the
Gen 4 Origins look the same as the normal ones" - which was exactly right. Our
ordinary Sinnoh sprite is HeartGold/SoulSilver and its debut is Diamond/Pearl:
both Gen IV, both the same era, and one of the three fallbacks was literally
the base sprite. Measured over every sprite in the build, a Kanto or Johto
Origin drops from a median of 13 colours to 4 - the Game Boy and Game Boy Color
palette, which IS the thing that reads as ancient - while Sinnoh gave 13
against 14. Not older, and not even fewer.

So a generation belongs here only when its debut art is genuinely older than
the art we draw it in ordinarily. `hasOrigin` in biomes.js is the same rule on
the game side, and check.mjs holds the two together. THE PALETTE DROP IS
ASSERTED BELOW rather than trusted, because a set that turns out to be modern
is exactly this bug happening again with a different generation."""
DEBUT = [
    (1, 151, ["generation-i/yellow/transparent", "generation-i/red-blue/transparent"]),
    (152, 251, ["generation-ii/crystal/transparent", "generation-ii/gold/transparent",
                "generation-ii/silver/transparent"]),
]

# The most colours a debut sprite may use and still read as an older drawing.
# A BOUND WITH ITS REASON, not a snapshot: Game Boy art is four shades and Game
# Boy Color art a handful, and 7 is the worst case measured across all 251 that
# qualify. Sinnoh's Diamond/Pearl art STARTS at 8 and medians at 14, so the two
# sets do not overlap anywhere - which is what makes this a boundary rather
# than a threshold somebody picked.
PALETTE_MAX = 7
OUT = "public/sprites/origin"

IDS = sorted(int(n[:-4]) for n in os.listdir("public/sprites") if n.endswith(".png"))
COUNT = len(IDS)


def sources_for(dex_id):
    for lo, hi, where in DEBUT:
        if lo <= dex_id <= hi:
            return where
    return None       # no older drawing exists - see DEBUT


def palette(img):
    """How many colours the visible pixels use. The tell of an old sprite."""
    return len({px[:3] for px in img.convert("RGBA").getdata() if px[3] > 40})


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

    RESIZE THE CANVAS, NEVER THE CREATURE, and that distinction is the whole
    function. The first version cropped to the art's bounding box and scaled
    THAT to fill 64 - which does put every sprite on the right canvas, and
    destroys relative size while doing it. Measured across the build: Gen 1 and
    Gen 2 art fills a median 0.73 of its canvas (a Caterpie is small, a Snorlax
    is not), and every Sinnoh sprite came out at 1.00. Reported from play as a
    Piplup drawn the size of a Dialga, which is exactly what it was.

    The raw art already carries the scale - Piplup fills 0.44 of its 80px
    canvas and Dialga fills 0.99 - so the only thing to do is take the canvas
    from 80 to 64 and leave everything inside it alone.

    Rewritten in place, and idempotent: a sprite already on the canvas is
    returned untouched, so running this twice cannot shrink anything twice."""
    path = "public/sprites/%d.png" % dex_id
    art = Image.open(path).convert("RGBA")
    if art.size == (CANVAS, CANVAS):
        return art
    for where in ("", "shiny/"):
        src = "public/sprites/%s%d.png" % (where, dex_id)
        one = Image.open(src).convert("RGBA")
        # The whole canvas, uniformly. NEAREST because these are pixel art and
        # a smooth filter would leave a soft sprite beside 251 hard ones;
        # 80 -> 64 is 4:5, so it drops one row in five rather than blurring.
        one = one.resize((CANVAS, CANVAS), Image.NEAREST)
        one.save(src)
        if where == "":
            art = one
    return art


def main():
    os.makedirs(OUT, exist_ok=True)
    fits, heights, palettes = [], [], []
    skipped = []
    for n, dex_id in enumerate(IDS, 1):
        ours = normalise(dex_id)
        if sources_for(dex_id) is None:
            # A generation with no older drawing gets no Origin file, and any
            # left over from when it did is deleted - 107 duplicate pictures
            # rode along in every build.
            stale = os.path.join(OUT, "%d.png" % dex_id)
            if os.path.exists(stale):
                os.remove(stale)
            skipped.append(dex_id)
            continue
        made = reframe(fetch(dex_id), ours)
        assert made.size == ours.size, "#%d came out %s" % (dex_id, made.size)
        made.save(os.path.join(OUT, "%d.png" % dex_id))
        palettes.append((palette(made), palette(ours), dex_id))
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
    if skipped:
        print("skipped %d with no older drawing (#%d-#%d) - see DEBUT"
              % (len(skipped), skipped[0], skipped[-1]))

    # THE TIER IS THE OLD PALETTE, AND IT IS ASSERTED PER SPRITE.
    #
    # A median was the first version of this check and it proved nothing:
    # putting the Gen 4 set back left the median at 4, because 251 four-colour
    # sprites outvote 107 fourteen-colour ones. The thing that was wrong was
    # wrong about a THIRD of the dex, and a statistic over all of it hid that
    # completely. Two assertions now, and each catches a different half of the
    # failure: the relational one (fewer colours than this creature's own
    # ordinary art) catches 92 of the 107, and the bound catches the rest.
    mo = sorted(x[0] for x in palettes)[len(palettes) // 2]
    mb = sorted(x[1] for x in palettes)[len(palettes) // 2]
    print("palette: origin median %d colours against %d ordinary, worst %d"
          % (mo, mb, max(x[0] for x in palettes)))

    # RELATIVE SIZE IS THE POINT OF A SPRITE SET, and nothing measured it.
    fills = []
    for dex_id in IDS:
        im = Image.open("public/sprites/%d.png" % dex_id).convert("RGBA")
        box = im.getbbox()
        if box:
            fills.append(((box[3] - box[1]) / float(im.size[1]), dex_id))
    med = sorted(f for f, _ in fills)[len(fills) // 2]
    full = [i for f, i in fills if f > 0.995]
    print("canvas fill: median %.2f, %d of %d fill it completely"
          % (med, len(full), len(fills)))
    assert med < 0.9, (
        "the median sprite fills %.2f of its canvas - art that has been scaled "
        "to fill has lost its size, and a Piplup comes out as big as a Dialga"
        % med)
    assert len(full) < len(fills) * 0.2, (
        "%d of %d sprites fill their canvas completely; only the genuinely huge "
        "ones should" % (len(full), len(fills)))

    same = [i for o, b, i in palettes if o >= b]
    assert not same, (
        "%d origin sprites use no fewer colours than their own ordinary art "
        "(first #%d) - nothing about them will read as older" % (len(same), same[0]))

    rich = [(i, o) for o, b, i in palettes if o > PALETTE_MAX]
    assert not rich, (
        "%d origin sprites use more than %d colours (worst #%d at %d) - that is "
        "not an older drawing, it is the same era from a different cartridge"
        % (len(rich), PALETTE_MAX, rich[0][0], max(r[1] for r in rich)))

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
