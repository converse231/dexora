"""An event poster's sky (npm run drift).

The announcement of a dated event (ui/Season.jsx `SeasonIntro`) draws a sky
over its title, and in it its Pokemon drift by - Haunter and Duskull over The
Haunting, Pikachu and Mew over the Poncho Parade (asked for, 2026-10-29: "use
the pokemon animations from arena"). Each is the Arena's own PMD Walk, cut out
of the shipped atlas (public/arena/pmd, npm run pmd) into one small animated
PNG at native pixels, facing right - the page flips the ones on the right - as
build_arena_intro.py does for the Arena's announcement. The ids are each
event's `drift` (eventforms.js). Re-run after npm run pmd.
"""
import re
from pathlib import Path

from build_arena_intro import bake

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "events" / "drift"
FORMS = ROOT / "src" / "data" / "eventforms.js"

if __name__ == "__main__":
    ids = sorted({int(n) for m in re.finditer(r"drift: \[([\d, ]+)\]", FORMS.read_text(encoding="utf-8"))
                  for n in m.group(1).split(",")})
    for dex in ids:
        bake(str(dex), dex, "Walk", 2, out=OUT, rest=0)
    # A body no event names any more is gone.
    for f in OUT.glob("*.png"):
        if int(f.stem) not in ids:
            f.unlink()
    print(f"{len(ids)} drifting bodies")
