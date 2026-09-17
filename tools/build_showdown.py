# -*- coding: utf-8 -*-
"""Showdown sprites, brought into the repo as 8-frame strips.

THEY WERE FETCHED FROM POKEAPI'S CDN AT RUNTIME, and it showed twice: they load
visibly late, and they are drawn at whatever size the source happens to be, so
a Showdown Amaura towered over every other sprite in the game and blurred when
the layout scaled it down. Reported as both.

WHY A STRIP AND NOT A GIF, A WEBP OR AN APNG - measured over fifteen species
spread across the dex, normalised the same way, extrapolated to 1025:

    raw GIF from the CDN              78.5 KB each   78.6 MB
    lossless animated WebP, 8 frames  35.9 KB each   35.9 MB
    APNG, 8 frames                    37.0 KB each   37.0 MB
    PNG strip, 8 frames               7.4 KB each     7.5 MB

The strip is five times smaller than either animated format, and the reason is
structural rather than lucky: one PNG is one zlib stream over one palette, and
eight frames of the same creature are almost the same bytes, so the window
catches the redundancy. WebP and APNG compress each frame on its own and
cannot. 7.5 MB against the 8.9 MB `public/sprites` already ships is a repo that
still clones, and it buys the CDN dependency away entirely.

The cost is that a strip does not animate in a bare `<img>`, which is a rule
this codebase holds for a reason - see `Sprite.jsx`, where Showdown now renders
as a wrapper. Every other tier still survives as an `<img>`.

AND THE CANVAS IS RESIZED, NEVER THE CREATURE. `build_origin.py` learned this
the hard way with Sinnoh's 80px art - cropping to the bounding box and scaling
that to fill put a Piplup the size of a Dialga - so the scale factor here is
`min(64/w, 64/h)` over the WHOLE source canvas, and the creature keeps its
relative size. Feet on the floor, because a sprite is drawn standing on the
ground rather than centred in the air.

Run: python tools/build_showdown.py   (about 80 MB of fetches, cached)
"""
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDN = ("https://raw.githubusercontent.com/PokeAPI/sprites/master/"
       "sprites/pokemon/other/showdown/")
CACHE = os.path.join(ROOT, ".assets-src", "showdown")
OUT = os.path.join(ROOT, "public", "sprites", "showdown")

SIZE = 64
FRAMES = 8          # measured: 8 reads as a loop and 16 doubles the repo
COLORS = 64


def species_ids():
    """The ids that ship, read out of the generated dex rather than a range."""
    src = io.open(os.path.join(ROOT, "src", "data", "species.js"),
                  encoding="utf-8").read()
    import re
    return sorted({int(m) for m in re.findall(r'"id"\s*:\s*(\d+)', src)})


def grab(i):
    """One GIF, cached on disk. A miss is a fact about the dex, not an error:
    PokeAPI has no Showdown sprite for every species."""
    path = os.path.join(CACHE, f"{i}.gif")
    miss = os.path.join(CACHE, f"{i}.none")
    if os.path.exists(path):
        return path
    if os.path.exists(miss):
        return None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(CDN + f"{i}.gif", timeout=45) as r:
                data = r.read()
            io.open(path, "wb").write(data)
            return path
        except urllib.error.HTTPError as e:
            if e.code == 404:
                io.open(miss, "w").write("")
                return None
            time.sleep(1 + attempt * 2)
        except Exception:
            time.sleep(1 + attempt * 2)
    return None


def strip(path):
    """Eight frames, each on its own 64px canvas, stacked into one column."""
    im = Image.open(path)
    frames = [f.convert("RGBA") for f in ImageSequence.Iterator(im)]
    if not frames:
        return None
    w, h = im.size
    step = max(1, len(frames) // FRAMES)
    picked = frames[::step][:FRAMES]
    while len(picked) < FRAMES:            # a short loop repeats its last pose
        picked.append(picked[-1])

    scale = min(SIZE / w, SIZE / h)
    out = Image.new("RGBA", (SIZE, SIZE * FRAMES), (0, 0, 0, 0))
    for k, fr in enumerate(picked):
        r = fr.resize((max(1, round(w * scale)), max(1, round(h * scale))),
                      Image.LANCZOS)
        out.alpha_composite(r, ((SIZE - r.width) // 2,
                                SIZE * k + (SIZE - r.height)))
    return out.quantize(colors=COLORS, method=Image.FASTOCTREE)


def main():
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    ids = species_ids()
    made, missing, bytes_out = [], [], 0
    for n, i in enumerate(ids, 1):
        dst = os.path.join(OUT, f"{i}.png")
        if os.path.exists(dst):
            made.append(i)
            bytes_out += os.path.getsize(dst)
            continue
        src = grab(i)
        if not src:
            missing.append(i)
            continue
        sheet = strip(src)
        if sheet is None:
            missing.append(i)
            continue
        sheet.save(dst, "PNG", optimize=True)
        made.append(i)
        bytes_out += os.path.getsize(dst)
        if n % 50 == 0:
            print(f"  {n}/{len(ids)}  {len(made)} made, {len(missing)} missing,"
                  f" {bytes_out/1048576:.1f} MB", flush=True)

    # WHICH SPECIES HAVE ONE IS A FACT ABOUT THE FILES, NOT A GUESS.
    # `hasShowdown` was `!isForm(id)`, which is an assumption about PokeAPI's
    # coverage; this is the list that actually shipped.
    io.open(os.path.join(ROOT, "src", "data", "showdown.js"), "w",
            encoding="utf-8").write(
        "/* GENERATED by tools/build_showdown.py - which species ship an\n"
        "   animated Showdown strip. Derived from the files on disk, because\n"
        "   PokeAPI's coverage is not a rule anyone can state. */\n"
        "export const SHOWDOWN_IDS = new Set(%s);\n"
        % json.dumps(made, separators=(",", ":")))

    print(f"\n{len(made)} strips, {bytes_out/1048576:.1f} MB in public/sprites/showdown")
    print(f"{len(missing)} species have no Showdown sprite")
    assert len(made) > 900, f"only {len(made)} strips - the fetch went wrong"
    assert bytes_out < 16 * 1048576, \
        f"{bytes_out/1048576:.1f} MB is past what this was measured to cost"


if __name__ == "__main__":
    main()
