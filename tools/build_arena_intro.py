"""The Arena's announcement bodies (npm run intro).

The takeover that announces the Arena (ui/ArenaIntro.jsx) shows two of its
fighters mid-blow. They are the Arena's own PMD animations, cut out of the
shipped atlases (public/arena/pmd, npm run pmd) into one small animated PNG
each at native pixels - the page scales them up crisp - so the announcement
loads two files of a few KB instead of an atlas and the renderer. Re-run after
npm run pmd.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "arena" / "pmd"
OUT = ROOT / "public" / "arena" / "intro"
REST = 500                 # ms held on the last frame, a beat between blows

# (file name, dex id, animation, PMD direction row: 2 faces right, 6 left)
BODIES = [("garchomp", 445, "Attack", 2), ("lucario", 448, "Attack", 6)]


def bake(name, dex, anim, row, out=OUT, rest=REST):
    meta = json.loads((SRC / f"{dex}.json").read_text())
    sheet = Image.open(SRC / f"{dex}.png").convert("RGBA")
    a = meta["a"][anim]
    r, flip = a["r"][row], False
    if isinstance(r, int):            # a stored mirror: -n is row n-1 flipped
        r, flip = a["r"][-r - 1], True
    q = meta["q"]
    pieces = []
    for p in r:
        x, y, w, h, ox, oy = q[p * 6:p * 6 + 6]
        img = sheet.crop((x, y, x + w, y + h))
        if flip:
            img, ox = img.transpose(Image.FLIP_LEFT_RIGHT), -ox - w
        pieces.append((img, int(ox), int(oy)))
    x0 = min(ox for _, ox, _ in pieces)
    y0 = min(oy for _, _, oy in pieces)
    x1 = max(ox + i.width for i, ox, _ in pieces)
    y1 = max(oy + i.height for i, _, oy in pieces)
    frames = []
    for img, ox, oy in pieces:
        c = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
        c.paste(img, (ox - x0, oy - y0), img)
        frames.append(c)
    # PMD's timings are 60ths of a second; a frame under 20 ms is clamped by browsers.
    dur = [max(20, round(a["d"][k % len(a["d"])] * 1000 / 60)) for k in range(len(frames))]
    dur[-1] += rest
    out.mkdir(parents=True, exist_ok=True)
    frames[0].save(out / f"{name}.png", save_all=True, append_images=frames[1:], duration=dur,
                   loop=0, disposal=1, blend=0)
    print(f"{name}: {frames[0].size[0]}x{frames[0].size[1]}, {len(frames)} frames")


if __name__ == "__main__":
    for body in BODIES:
        bake(*body)
