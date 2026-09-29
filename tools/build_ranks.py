"""RANK EMBLEMS, from the drawn originals to what the game ships.

The originals are hand-made (the prompts are in docs/ranked.md *Art* and the
README's *Pokedex rank*) and live in art/ranks/{battle,dex}/<id>.png: 1254px
squares, 200-640KB each, with uneven empty margins. Shipped as they were, the
sixteen weighed 6.5MB and the Dex tab alone pulled 782KB of them at boot for
two 24px medals (measured 2026-09-29), and one was misnamed so the game never
found it.

So each is cropped to its drawing (alpha), centred on a square with a thin
even margin - every emblem then fills its medal slot the same way - scaled
down with a proper filter, and palette-quantised. SIZE is the largest place
one is drawn (the rank-up ceremony, 96 CSS px) at a 2x screen; every smaller
place (24px lists, 48px titles) scales it down in the browser.

check.mjs holds the output to the ladders: a file for every rank id in
`RANKS` and `DEX_RANKS`, at SIZE, under a size bound.

Run: npm run ranks
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "ranks"
OUT = ROOT / "public" / "ranks"
SIZE = 192
MARGIN = 0.04   # of the side, each edge


def build(src: Path, dst: Path) -> int:
    im = Image.open(src).convert("RGBA")
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box:
        im = im.crop(box)
    side = round(max(im.size) / (1 - 2 * MARGIN))
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    small = square.resize((SIZE, SIZE), Image.LANCZOS)
    small = small.quantize(colors=255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    dst.parent.mkdir(parents=True, exist_ok=True)
    small.save(dst, optimize=True)
    return dst.stat().st_size


if __name__ == "__main__":
    total = 0
    for src in sorted(SRC.glob("*/*.png")):
        n = build(src, OUT / src.parent.name / src.name)
        total += n
        print(f"{src.parent.name}/{src.name}: {n // 1024}KB")
    print(f"{total // 1024}KB for all")
