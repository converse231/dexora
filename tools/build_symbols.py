"""The symbol face: every mark the UI types that Rubik does not draw (a close
cross, a check, the pad's arrows, the fight's stars), subset from Noto Sans
Symbols and Symbols 2 (SIL OFL), merged into one face, public/fonts/symbols.woff2.

Why: Rubik and Chakra Petch are Latin subsets, so every such mark sent the
browser to the system's fonts. On a phone that is a font file read off disk
in the middle of a layout - the League fight's first frame spent 37ms of a
4x-throttled 97ms layout on it - and on Android it can be the emoji font.

Scans src/ for characters Rubik has no glyph for; the colour emoji News
uses as icons (EMOJI) stay the system's on purpose. Run after adding a mark:
    python tools/build_symbols.py
"""
import glob
import os
import re
import sys
import tempfile
import urllib.request

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "public", "fonts")
SOURCES = {
    "1": "https://github.com/google/fonts/raw/main/ofl/notosanssymbols/NotoSansSymbols%5Bwght%5D.ttf",
    "2": "https://github.com/google/fonts/raw/main/ofl/notosanssymbols2/NotoSansSymbols2-Regular.ttf",
}
# Drawn as colour emoji on purpose (News icons): never in the face.
EMOJI = {0x2694, 0x26A1, 0x2728, 0x2B50}


def used():
    rubik = set(TTFont(os.path.join(FONTS, "rubik.woff2")).getBestCmap())
    out = set()
    for f in glob.glob(os.path.join(ROOT, "src", "**", "*.*"), recursive=True):
        if not f.endswith((".js", ".jsx", ".css")) or os.sep + "data" + os.sep in f:
            continue
        t = open(f, encoding="utf-8").read()
        t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
        t = re.sub(r"(?m)^\s*//[^\n]*", "", t)
        out |= {ord(c) for c in t if ord(c) > 127 and ord(c) < 0x1F000}
    return out - rubik - EMOJI - {0xFE0F, 0x200D}


def source(n):
    path = os.path.join(tempfile.gettempdir(), f"noto-symbols-{n}.ttf")
    if not os.path.exists(path):
        urllib.request.urlretrieve(SOURCES[n], path)
    font = TTFont(path)
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": 400})
    return font


def main():
    left = used()
    parts = []
    for n in ("2", "1"):
        font = source(n)
        take = left & set(font.getBestCmap())
        if not take:
            continue
        opts = subset.Options()
        opts.layout_features = []
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=take)
        sub.subset(font)
        part = os.path.join(tempfile.gettempdir(), f"symbols-part-{n}.ttf")
        font.save(part)
        parts.append(part)
        left -= take
    if left:
        sys.exit("no Noto face draws " + " ".join(f"U+{c:04X}" for c in sorted(left)) + " - pick another mark")
    font = Merger().merge(parts)
    font.flavor = "woff2"
    out = os.path.join(FONTS, "symbols.woff2")
    font.save(out)
    print(f"symbols.woff2: {len(font.getBestCmap())} code points, {os.path.getsize(out)} bytes")


if __name__ == "__main__":
    main()
