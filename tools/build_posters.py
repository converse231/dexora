"""An event's drawn sky (npm run posters).

The drawn originals live in art/posters/<event id>.jpg (generated art, any
size, wide), outside art/events/, where npm run eventart would take one for a
costume. Each ships as public/events/poster/<event id>.webp at WIDTH - twice
the announcement's 620px card - and WebP at QUALITY, so a poster is a request
of ~100 KB rather than the original's 600 KB. An event names its own with
`poster`, the printed width / height (it holds the story below the picture);
check.mjs holds the file to it.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "posters"
OUT = ROOT / "public" / "events" / "poster"
WIDTH = 1240
QUALITY = 82

OUT.mkdir(parents=True, exist_ok=True)
for src in sorted(SRC.glob("*.jpg")):
    im = Image.open(src).convert("RGB")
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    dst = OUT / f"{src.stem}.webp"
    im.save(dst, quality=QUALITY, method=6)
    print(f"{dst.name}: {im.width}x{im.height}, {dst.stat().st_size // 1024}KB")
