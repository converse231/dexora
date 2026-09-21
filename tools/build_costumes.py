"""The costume Pikachu, at a resolution you can actually look at.

Reported from play as "so pixelated", and a render said exactly why: PokeAPI's
front sprite for these thirteen draws the creature SMALL INSIDE ITS CANVAS.
Plain Pikachu fills its 64px frame corner to corner; Pikachu Libre occupies
about 45px of a 96px one. Both are then scaled up to whatever box the Dex or
the encounter gives them, so the costume is upscaled half again as much as the
Pikachu beside it - it is not a lower-resolution FILE, it is less creature per
file, which looks like the same thing and is fixed differently.

TWO PROBLEMS, AND ONLY ONE OF THEM IS THE SOURCE:

  size    the creature is small in its frame, so it renders small and soft
  detail  there are only ~45 real pixels of Pikachu to enlarge

Re-framing the existing sprite fixes the first and cannot fix the second -
enlarging 45px of art is still 45px of art. So the art comes from
`other/official-artwork`, which is 475x475 and exists for all thirteen, and is
then re-framed onto plain Pikachu's own canvas.

AGAINST PIKACHU, NOT AGAINST THE FRAME, and that is the whole of the sizing
rule. `build_origin` states the general law - RESIZE THE CANVAS, NEVER THE
CREATURE - because cropping to the bounding box and scaling it to fill destroys
relative size, and a Piplup drawn the size of a Dialga was what that cost. The
law is about comparing DIFFERENT species. These thirteen are the same species
as each other and as Pikachu: a Pikachu in a mask is Pikachu-sized, and the
only honest target is the frame Pikachu already occupies. So `reframe` measures
`sprites/25.png`'s own bounding box and puts each costume in it.

LANCZOS, not NEAREST: `build_origin` uses NEAREST because it moves pixel art
between pixel canvases and a smooth filter would leave one soft sprite among
hard ones. This goes 475 -> 64 from a painted source, where NEAREST throws away
six pixels in seven and aliases what is left.

THE TWO WITHOUT SHINY ART KEEP THE SPRITE THEY HAD. `official-artwork/shiny`
covers eleven of the thirteen - Partner Cap and World Cap have none - and the
alternative to leaving those two alone was giving them the ordinary art as
their shiny, which is a tier whose whole tell is that the colours changed. So
their ordinary form is upgraded with the rest and their shiny stays as it was:
visible only on a 1-in-195 roll, on two of thirteen, and honest about which
half is which.
"""
import io
import json
import os
import re
import sys
import urllib.request

from PIL import Image

GH = ("https://raw.githubusercontent.com/PokeAPI/sprites/master/"
      "sprites/pokemon/other/official-artwork")
LIKE = "public/sprites/25.png"          # plain Pikachu: the size a Pikachu is


def grab(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return Image.open(io.BytesIO(r.read())).convert("RGBA")
    except Exception:
        return None


def reframe(art, like):
    """Put `art` in `like`'s canvas, at `like`'s size and centre."""
    box = like.getbbox()
    tw, th = box[2] - box[0], box[3] - box[1]
    cx, cy = (box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0

    cut = art.crop(art.getbbox())
    # Fit inside the target box keeping the aspect - a costume squashed to
    # match Pikachu's exact proportions would be worse than one a little small.
    k = min(tw / float(cut.width), th / float(cut.height))
    cut = cut.resize((max(1, int(round(cut.width * k))),
                      max(1, int(round(cut.height * k)))), Image.LANCZOS)

    out = Image.new("RGBA", like.size, (0, 0, 0, 0))
    out.paste(cut, (int(round(cx - cut.width / 2.0)),
                    int(round(cy - cut.height / 2.0))), cut)
    return out


def costumes():
    """The ids, read out of the generated forms file rather than listed."""
    src = io.open("src/data/forms.js", encoding="utf-8").read()
    rows = json.loads(re.search(r"= (\[.*\]);", src, re.S).group(1))
    return [(f["id"], f["title"]) for f in rows if f.get("form") == "costume"]


def main():
    like = Image.open(LIKE).convert("RGBA")
    done, no_shiny = 0, []
    for dex_id, title in costumes():
        art = grab("%s/%d.png" % (GH, dex_id))
        if art is None:
            print("  no official art for %s (%d) - left as it was" % (title, dex_id))
            continue
        reframe(art, like).save("public/sprites/%d.png" % dex_id)
        done += 1

        shiny = grab("%s/shiny/%d.png" % (GH, dex_id))
        if shiny is None:
            no_shiny.append(title)
            continue
        reframe(shiny, like).save("public/sprites/shiny/%d.png" % dex_id)

    print("re-framed %d costume Pikachu onto Pikachu's own %dx%d canvas"
          % (done, like.size[0], like.size[1]))
    if no_shiny:
        print("  shiny art kept as it was (none published): %s"
              % ", ".join(no_shiny))
    return 0


if __name__ == "__main__":
    sys.exit(main())
