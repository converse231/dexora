"""The Arena's effect art (npm run fx).

The drawn originals live in art/arena/fx/<name>.png: white and light-grey
pixel art on a transparent ground (generated, any size), so the renderer can
colour each one per type and one sheet serves all eighteen. A sheet of N
frames is N drawings in one row (FRAMES), found by the empty columns between
them - a generator never spaces them exactly evenly, and equal cells cut
the impact's third burst in two - and each is set in one shared box by its
ANCHOR (a burst by its centre, the bolt by its leading edge, so the orb
never wobbles). Every sheet is cropped to the rows any frame uses, shrunk
so a frame is WIDTH wide, its edge alpha snapped so the pixels stay hard, and written as one strip to public/arena/fx/<name>.png, with
src/data/fx.js saying each strip's frames and size and FX_REV the stamp the
urls carry. check.mjs reads every header against fx.js.

A MOVE'S OWN ART (2026-10-23) is art/arena/fx/moves/<move slug>.png: drawn
in its colours (`c` in fx.js: never tinted), its frames in one row - how
many is MOVES below, counted by eye, since a spark between two frames makes
the gaps lie. One frame wide is a stream (a beam's length), one frame square
is a hazard on the ground. Written to public/arena/fx/moves/.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "arena" / "fx"
OUT = ROOT / "public" / "arena" / "fx"
DATA = ROOT / "src" / "data" / "fx.js"

# name: (frames in the original's one row, a frame's width when shipped, hard pixels?, anchor)
FRAMES = {
    "impact": (8, 96, True, "centre"),
    "shockwave": (6, 128, True, "centre"),
    "bolt": (4, 48, True, "right"),       # the orb leads; its tail is what changes
    "rune": (1, 192, True, "centre"),
    "slash": (1, 256, True, "centre"),
    "cutin": (1, 768, False, "centre"),  # a banner of streaks, drawn wide: soft edges read better
}
# ULTI IMPACT FRAMES (2026-10-23), each built only once its original is in
# art/arena/fx/: a manga ink background a type's ULTI flashes behind it
# (`ult-<pattern>`), and a famous Pokemon's own panel (`ult-<dex id>`). The
# renderer draws its own where one is missing.
ULT_PATTERNS = ["bolts", "flames", "waves", "vines", "psychic", "shadow", "fists", "dragon", "frost", "rocks", "stars", "wind", "speed"]
ULT_FAMOUS = [25, 6, 9, 3, 150, 94, 448, 130, 149, 143, 384, 248, 445, 658, 282, 257]
# A famous Pokemon's impact SEQUENCE (2026-10-23): up to four stills in their
# own colours, the subject centred - `ult-<dex id>-1.png` .. `-4.png` - shipped
# 960 wide (a still fills the screen for a third of a second) in 128 colours.
for n in ULT_FAMOUS:
    for k in range(1, 5):
        if (SRC / f"ult-{n}-{k}.png").exists():
            FRAMES[f"ult-{n}-{k}"] = (1, 960, False, "centre")
for n in [*ULT_PATTERNS, *ULT_FAMOUS]:
    if (SRC / f"ult-{n}.png").exists():
        # 1280 wide: a panel fills the screen, and 768 smeared its ink on a desktop.
        FRAMES[f"ult-{n}"] = (1, 1280, False, "centre")
# A move's sheet: its frames, counted by eye (2026-10-23), and the three
# whose frames grow across the row in cells of their own size, cut by their
# widest gaps (`frames_of`).
WIDEST = {"explosion", "psychic", "shadow-claw", "fly"}
MOVES = {
    "aqua-jet": 4, "brick-break": 5, "close-combat": 6, "crunch": 5, "dazzling-gleam": 6, "discharge": 6,
    "dragon-claw": 4, "earthquake": 6, "explosion": 8, "fire-fang": 5, "fire-punch": 5, "flamethrower": 1,
    "flare-blitz": 4, "heat-wave": 6, "hydro-pump": 1, "hyper-beam": 1, "hyper-voice": 6, "ice-beam": 1,
    "ice-fang": 5, "ice-punch": 5, "iron-tail": 4, "leaf-blade": 4, "night-slash": 4, "play-rough": 6,
    "poison-jab": 4, "psychic": 6, "quick-attack": 4, "razor-leaf": 4, "rock-slide": 6, "shadow-ball": 6,
    "shadow-claw": 5, "sludge-wave": 6, "solar-beam": 1, "spikes": 1, "stealth-rock": 1, "sticky-web": 1,
    "surf": 6, "thunder-fang": 5, "thunder-punch": 5, "thunderbolt": 4, "toxic-spikes": 1, "twister": 6,
    "volt-tackle": 4, "x-scissor": 4,
    # Asked for 2026-10-23, built once drawn: the court-wide two, and Fly's and Dig's landings.
    "blizzard": 6, "petal-blizzard": 6, "fly": 6, "dig": 6,
}
SEEN = 24                        # alpha that counts as drawn when looking for the gaps
HARD = 110                       # alpha past which a shrunk pixel is solid, under which it is gone


def frames_of(a, n, how="even"):
    """The column spans of n drawings in a row. Each cut is the empty gap
    nearest where even spacing would put it: a sparse last frame has gaps
    inside it wider than the one between two rings, so "the widest gaps"
    merged the shockwave's third and fourth. A move's sheet looks only NEAR
    there (a spark's gap a cell away is not the frame's edge) and, with no
    gap near, cuts at even spacing. Explosion, Psychic and Shadow Claw grow
    across the row in cells of their own size, so even spacing cut through
    them, and their stray gaps are a pixel or three: they take the n-1
    widest gaps, splitting the widest piece at its emptiest column where
    there are too few (Shadow Claw's smoke runs one frame into the next)."""
    W, H = a.size
    cols = [a.crop((x, 0, x + 1, H)).getextrema()[1] > SEEN for x in range(W)]
    gaps, x = [], 0
    while x < W:
        if not cols[x]:
            x0 = x
            while x < W and not cols[x]:
                x += 1
            if x0 > 0 and x < W:
                gaps.append(((x0 + x) / 2, x - x0))
        else:
            x += 1
    if how == "widest":
        cuts = sorted(round(g) for g, _ in sorted(gaps, key=lambda g: -g[1])[:n - 1])
        while len(cuts) < n - 1:
            edges = [0, *cuts, W]
            x0, x1 = max(zip(edges, edges[1:]), key=lambda e: e[1] - e[0])
            lo, hi = x0 + (x1 - x0) // 5, x1 - (x1 - x0) // 5
            cuts = sorted([*cuts, min(range(lo, hi), key=lambda c: sum(a.crop((c, 0, c + 1, H)).getdata()))])
        cuts = [0, *cuts]
    else:
        cuts = [0]
        for k in range(1, n):
            want = k * W / n
            later = [g for g, _ in gaps if round(g) > cuts[-1] and (how == "even" or abs(g - want) < W / n * 0.3)]
            assert later or how == "near", f"no gap for frame {k + 1} of {n}"
            cuts.append(round(min(later, key=lambda g: abs(g - want))) if later else round(want))
    cuts.append(W)
    spans = []
    for x0, x1 in zip(cuts, cuts[1:]):
        drawn = [x for x in range(x0, x1) if cols[x]]
        assert drawn, f"frame between {x0} and {x1} is empty"
        spans.append([drawn[0], drawn[-1] + 1])
    return spans


def build(name, n, width, hard, anchor):
    im = Image.open(SRC / f"{name}.png").convert("RGBA")
    a = im.getchannel("A")
    box = a.point(lambda v: 255 if v > SEEN else 0).getbbox()
    assert box, f"{name}: the original is empty"
    top, bottom = box[1], box[3]
    runs = frames_of(a, n, "even" if not name.startswith("moves/") else "widest" if name[6:] in WIDEST else "near")
    # One box every frame shares: the widest drawing, a little room round it.
    cell = max(x1 - x0 for x0, x1 in runs) + 8
    scale = width / cell
    fh = max(1, round((bottom - top) * scale))
    strip = Image.new("RGBA", (width * n, fh), (0, 0, 0, 0))
    for k, (x0, x1) in enumerate(runs):
        frame = Image.new("RGBA", (cell, bottom - top), (0, 0, 0, 0))
        art = im.crop((x0, top, x1, bottom))
        at = cell - 4 - (x1 - x0) if anchor == "right" else (cell - (x1 - x0)) // 2
        frame.paste(art, (at, 0))
        f = frame.resize((width, fh), Image.BOX)
        if hard:
            alpha = f.getchannel("A").point(lambda v: 255 if v > HARD else 0)
            f.putalpha(alpha)
        strip.paste(f, (k * width, 0))
    out = OUT / f"{name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    # A move's colour art in 256 colours: pixel art loses nothing to the eye, and the sheets were 5.5 MB in full colour.
    # An ULTI panel is white ink on nothing: 64 colours are plenty, and keep each under check.mjs's 200KB.
    # A famous Pokemon's own panel is ink on white, its dots black or white: 16 greys (its screentone ran past 200KB at 64).
    still = name.startswith("ult-") and name.count("-") == 2
    colours = 128 if still else 16 if name[4:].isdigit() else 64 if name.startswith("ult-") else 256
    (strip.quantize(colours, method=Image.Quantize.FASTOCTREE) if name.startswith(("moves/", "ult-")) else strip).save(out, optimize=True)
    print(f"{name}: {n} frame{'s' if n > 1 else ''} of {width}x{fh}, {out.stat().st_size // 1024} KB")
    return {"n": n, "w": width, "h": fh}


def main():
    meta = {name: build(name, *spec) for name, spec in FRAMES.items()}
    for name in meta:
        if name.startswith("ult-") and name.count("-") == 2:
            meta[name]["c"] = 1                  # a sequence still is drawn in its own colours
    names = list(FRAMES)
    for slug, n in MOVES.items():
        if not (SRC / "moves" / f"{slug}.png").exists():
            continue
        square = n == 1 and Image.open(SRC / "moves" / f"{slug}.png").width < 1.5 * Image.open(SRC / "moves" / f"{slug}.png").height
        width = 160 if square else 640 if n == 1 else 160
        meta[f"moves/{slug}"] = {**build(f"moves/{slug}", n, width, True, "centre"), "c": 1}
        names.append(f"moves/{slug}")
    stray = sorted(f.stem for f in (SRC / "moves").glob("*.png") if f.stem not in MOVES)
    assert not stray, f"move art with no frame count in MOVES: {stray}"
    h = hashlib.sha1()
    for name in names:
        h.update((OUT / f"{name}.png").read_bytes())
    DATA.write_text(
        "// Generated by tools/build_fx.py (npm run fx) - do not edit.\n"
        f"export const FX = {json.dumps(meta)};\n"
        f'export const FX_REV = "{h.hexdigest()[:10]}";\n',
        encoding="utf-8", newline="\r\n")


main()
