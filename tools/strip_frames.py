# -*- coding: utf-8 -*-
"""One animated GIF as a vertical strip of FRAMES frames - shared by
build_showdown.py and build_cadence.py, which carried two copies of this and
drifted (one filtered LANCZOS, the other BOX; one skipped existing output).

NATIVE PIXELS (2026-10-10, reported as "still blurry"). Every frame used to be
resampled onto a 64px canvas and cut to 64 colours. The sources are 27-217px,
so a big one lost two thirds of its pixels to a smoothing filter, and even a
median 67px one came out coarser than the ordinary 96px sprites it stands in
for - then the layout scaled 64px up to 150. Now a frame keeps the source's
own pixels on a square canvas the size of its larger side; only a source past
CAP is scaled, by area (BOX), and the palette is the full 256.

FRAMES ARE PICKED BY TIME, not by index: a GIF's frames run for different
lengths, and every-Nth-frame over-sampled the quick ones. Sixteen, from
eight, for a smoother loop.

THE CANVAS IS RESIZED, NEVER THE CREATURE: the whole source canvas maps onto
the square, so the creature keeps its relative size, feet on the floor."""
from PIL import Image, ImageSequence

FRAMES = 16         # styles.css steps the strip by this (`steps(16)`, `1600%`); check.mjs holds both
CAP = 192           # a frame's side at most: 16 of them is 3,072px, under a phone's 4,096 texture limit
COLORS = 256


def strip(path):
    im = Image.open(path)
    w, h = im.size
    frames, starts, t = [], [], 0
    for fr in ImageSequence.Iterator(im):
        frames.append(fr.convert("RGBA"))
        starts.append(t)
        t += max(20, fr.info.get("duration") or 100)   # 0ms frames exist; browsers play them at ~100
    if not frames:
        return None
    picked = []
    for k in range(FRAMES):
        at = t * k / FRAMES
        i = max(j for j, s in enumerate(starts) if s <= at)
        picked.append(frames[i])
    side = max(w, h)
    size = min(side, CAP)
    scale = size / side
    out = Image.new("RGBA", (size, size * FRAMES), (0, 0, 0, 0))
    for k, fr in enumerate(picked):
        if scale != 1:
            fr = fr.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BOX)
        out.alpha_composite(fr, ((size - fr.width) // 2, size * k + (size - fr.height)))
    return out.quantize(colors=COLORS, method=Image.FASTOCTREE)
