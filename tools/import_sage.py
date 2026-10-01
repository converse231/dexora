# -*- coding: utf-8 -*-
"""SageDeoxys' sprites in, as Origin art for species that have none.

Run:  python tools/import_sage.py <folder>      (then python tools/build_origin.py)

The folder is SageDeoxys' set as downloaded: one directory per species, named
for it ("Absol", "Mr.Mime", "Flabébé"), each holding front.gif, frontshiny.gif,
back.png and backshiny.png - or, for a species with forms, one directory per
form holding those. They are Game Boy Color-style drawings (four colours, the
Crystal look) of Pokémon that debuted after Johto, which is exactly what the
Origin tier is: an older-looking drawing than the one the game shows.

Only the FIRST FRAME of front.gif is kept, written to art/sage/<dex id>.png.
That is the source build_origin.py reads, so the game never depends on a
Downloads folder, and a PNG per species is ~1KB where the GIFs are 10MB. A
still, not the animation: Origin is a still tier everywhere (the Dex draws
forty tiles at once), and Showdown is the one that moves.

Only species with NO older drawing take one: Kanto and Johto keep their 1996
and Crystal debut art (`DEBUT` in build_origin.py), so a Sage Arbok is skipped.
Forms are skipped too - a form never wears Origin (`hasOrigin`) - and a
species drawn only in form folders takes its default form's (`DEFAULT`).

Credit: "Sprites by SageDeoxys", shown with every one (`SAGE_CREDIT`)."""

import json
import os
import re
import subprocess
import sys
import unicodedata

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "art", "sage")
LAST_DEBUT = 251          # build_origin.py's DEBUT ends here: older art exists

# The folder that IS the species' ordinary look, when it is drawn only by form.
DEFAULT = ["Normal", "Regular", "Shield", "Plant", "Male", "Teal", "Overcast",
           "Disguised", "IceFace", "TwoSegment", "Meteor", "NoDrive", "Original",
           "Baile", "Midday", "Solo", "Hero", "Ordinary", "Aria", "Incarnate",
           "Altered", "Land", "Average", "Single", "Full", "Amped", "Family"]
# Species whose ordinary look has its own folder name. Basculin (only White-
# Striped drawn) and Gimmighoul (only Roaming) are left without one on purpose:
# neither folder is the look the game shows for them.
DEFAULT_FOR = {"Alcremie": "StrawberryVanillaCream", "Darmanitan": "Unova",
               "Darumaka": "Unova", "Flabébé": "Red", "Floette": "Red",
               "Rotom": "Bulb", "Tatsugiri": "Curly", "Zygarde": "50%"}


def key(name):
    """A name reduced to letters and digits, accents dropped: "Mr.Mime" and
    "Mr. Mime", "Flabébé" and "Flabebe", "Chi-Yu" and "Chi-Yu" all meet."""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("♀", "f").replace("♂", "m"))


def species():
    """{key(label): id} for every National Dex species, read through the
    game's own `label()` so a name here is the name the game prints."""
    js = ("import('./src/data/dex.js').then(async ({SPECIES}) => {"
          "const {label} = await import('./src/game/map.js');"
          "console.log(JSON.stringify(SPECIES.filter((s) => s.id <= 1025)"
          ".map((s) => [s.id, label(s)])));})")
    out = subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True,
                         encoding="utf-8", check=True).stdout
    return {key(name): i for i, name in json.loads(out)}


def front(folder):
    """The front.gif that draws this species' ordinary look, or None."""
    here = os.path.join(folder, "front.gif")
    if os.path.exists(here):
        return here
    forms = {d: os.path.join(folder, d, "front.gif") for d in os.listdir(folder)
             if os.path.exists(os.path.join(folder, d, "front.gif"))}
    own = DEFAULT_FOR.get(unicodedata.normalize("NFC", os.path.basename(folder)))
    if own in forms:
        return forms[own]
    for d in DEFAULT:
        if d in forms:
            return forms[d]
    return None


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    ids = species()
    os.makedirs(OUT, exist_ok=True)
    wrote, old, unknown, formless = [], [], [], []
    for name in sorted(os.listdir(src)):
        folder = os.path.join(src, name)
        if not os.path.isdir(folder):
            continue
        dex = ids.get(key(name))
        if dex is None:
            unknown.append(name)
            continue
        if dex <= LAST_DEBUT:
            old.append(name)
            continue
        gif = front(folder)
        if gif is None:
            formless.append(name)
            continue
        im = Image.open(gif)
        im.seek(0)
        im.convert("RGBA").save(os.path.join(OUT, "%d.png" % dex), optimize=True)
        wrote.append(dex)
    print("art/sage: %d species" % len(wrote))
    print("kept their own debut art (Kanto/Johto): %d" % len(old))
    if unknown:
        print("no species of that name: %s" % ", ".join(unknown))
    if formless:
        print("drawn only by form, no default chosen: %s" % ", ".join(formless))


if __name__ == "__main__":
    main()
