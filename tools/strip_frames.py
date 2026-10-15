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
the square, so the creature keeps its relative size, feet on the floor.

SCALE2X FOR SHOWDOWN (`up`, 2026-10-16, reported as "a little blurry"): its
sources are 16-colour pixel art as small as 45px, drawn at ~150px. Chrome
keeps a background's pixels hard; a browser that smooths a background image
(`image-rendering` is a hint) smeared every one of them. Doubled by Scale2x -
the emulators' edge rule, exact on a 16-colour palette - while the side stays
under `up`, a strip is near the size it is drawn at, so either way it is
crisp, and its diagonals are smooth instead of stair-stepped. ~1.5x the bytes."""
import numpy as np
from PIL import Image, ImageSequence

FRAMES = 16         # styles.css steps the strip by this (`steps(16)`, `1600%`); check.mjs holds both
CAP = 192           # a frame's side at most: 16 of them is 3,072px, under a phone's 4,096 texture limit
COLORS = 256


def scale2x(fr):
    """One RGBA frame doubled by Scale2x (AdvMAME2x): each pixel becomes four,
    and a corner takes its neighbour's colour where two edges meet there."""
    a = np.asarray(fr, dtype=np.uint8).copy()
    a[a[..., 3] == 0] = 0                       # one transparent colour, not many
    c = a.view(np.uint32)[..., 0]
    p = np.pad(c, 1, mode="edge")
    B, D, E, F, H = p[:-2, 1:-1], p[1:-1, :-2], p[1:-1, 1:-1], p[1:-1, 2:], p[2:, 1:-1]
    k = (B != H) & (D != F)
    out = np.empty((c.shape[0] * 2, c.shape[1] * 2), np.uint32)
    out[0::2, 0::2] = np.where(k & (D == B), D, E)
    out[0::2, 1::2] = np.where(k & (B == F), F, E)
    out[1::2, 0::2] = np.where(k & (D == H), D, E)
    out[1::2, 1::2] = np.where(k & (H == F), F, E)
    return Image.fromarray(out.view(np.uint8).reshape(out.shape + (4,)), "RGBA")


def strip(path, up=0):
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
    while up and max(w, h) * 2 <= up:
        picked = [scale2x(fr) for fr in picked]
        w, h = w * 2, h * 2
    side = max(w, h)
    size = min(side, max(CAP, up))     # a doubled frame is never resampled back down
    scale = size / side
    out = Image.new("RGBA", (size, size * FRAMES), (0, 0, 0, 0))
    for k, fr in enumerate(picked):
        if scale != 1:
            fr = fr.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BOX)
        out.alpha_composite(fr, ((size - fr.width) // 2, size * k + (size - fr.height)))
    return out.quantize(colors=COLORS, method=Image.FASTOCTREE)
