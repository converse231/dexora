"""The Arena's floors (npm run arenas).

The drawn originals live in art/arena/<id>.png (generated art, any size, at
the court's own 26:16 shape). Each ships as public/arena/<id>.webp at
SIZE - twice the court's tiles at 16 px, which a phone's canvas never draws
larger - and WebP at QUALITY, so a floor is a request of ~100 KB rather than
the original's 2 MB. game/arena.js's ARENAS names them; check.mjs holds one
file per id, at SIZE.

The cover blocks (art/arena/cover/<material>.png, drawn with a transparent
ground) ship as public/arena/cover/<material>.webp at COVER px square: cropped
to their SOLID pixels (alpha over HALO - a drawing's faint fringe made the
statue's box the whole canvas), centred, shrunk, the fringe dropped.
"""
import re
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "arena"
OUT = ROOT / "public" / "arena"
SIZE = (832, 512)          # 26 x 16 tiles at 32 px
QUALITY = 86
COVER = 128
HALO = 40


def ids():
    js = (ROOT / "src" / "game" / "arena.js").read_text(encoding="utf-8")
    block = js[js.index("export const ARENAS"):]
    block = block[:block.index("];")]
    return re.findall(r'id: "([a-z]+)"', block)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    missing = []
    for aid in ids():
        src = SRC / f"{aid}.png"
        if not src.exists():
            missing.append(aid)
            continue
        im = Image.open(src).convert("RGB")
        ratio = im.width / im.height
        if abs(ratio - SIZE[0] / SIZE[1]) > 0.03:
            sys.exit(f"{src.name} is {im.width}x{im.height} - the court is 26:16, so it would stretch")
        im = im.resize(SIZE, Image.LANCZOS)
        out = OUT / f"{aid}.webp"
        im.save(out, "WEBP", quality=QUALITY, method=6)
        print(f"  {aid}: {out.stat().st_size // 1024} KB")
    covers = re.findall(r'cover: "([a-z]+)"', (ROOT / "src" / "game" / "arena.js").read_text(encoding="utf-8"))
    (OUT / "cover").mkdir(exist_ok=True)
    for name in covers:
        src = SRC / "cover" / f"{name}.png"
        if not src.exists():
            missing.append(f"cover/{name}")
            continue
        im = Image.open(src).convert("RGBA")
        alpha = im.getchannel("A").point(lambda a: 255 if a > HALO else 0)
        im.putalpha(alpha)
        im = im.crop(alpha.getbbox())
        side = max(im.size)
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        sq = sq.resize((COVER, COVER), Image.LANCZOS)
        sq.putalpha(sq.getchannel("A").point(lambda a: 255 if a > 128 else 0))
        out = OUT / "cover" / f"{name}.webp"
        sq.save(out, "WEBP", quality=QUALITY, method=6)
        print(f"  cover {name}: {out.stat().st_size // 1024} KB")
    if missing:
        sys.exit(f"no drawing in art/arena/ for: {', '.join(missing)}")


if __name__ == "__main__":
    main()
