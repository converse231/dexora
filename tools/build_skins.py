"""Trainer skins (npm run skins): src/game/cosmetics.js's SKINS, cut from
pokeemerald-expansion's overworld people.

A Gen 3 person is 16x32 frames, nine of them: faces south, north, west, then
two strides each (3-4, 5-6, 7-8); east is west mirrored (`sAnim_GoSouth` and
siblings in object_event_anims.h). public/skins/<id>.png is the walk set in
player.png's own shape - columns stride, stand, stride; rows down, up, left,
right - so `drawPlayer` draws a skin exactly as it draws Red. And
public/skins/surf.png is the Surf blob a skin rides (south, north, west,
east mirrored), since a skin has no surfing frames of its own.

Pinned to build_anims.py's COMMIT, cached with the follower sheets.
"""
import io, json, subprocess, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_follow import fetch   # same pin, same cache

OUT = ROOT / "public" / "skins"
PEOPLE = "graphics/object_events/pics/people/"

# Where each skin's sheet lives upstream. A skin in SKINS without one fails.
SRC = {
    "youngster": "youngster", "lass": "lass", "bug_catcher": "bug_catcher", "hiker": "hiker",
    "picnicker": "picnicker", "camper": "camper", "black_belt": "black_belt", "beauty": "beauty",
    "sailor": "sailor", "gentleman": "gentleman", "hex_maniac": "hex_maniac", "psychic": "psychic_m",
    "expert_m": "expert_m", "expert_f": "expert_f", "fisherman": "fisherman",
    "ace_m": "cooltrainer_m", "ace_f": "cooltrainer_f", "triathlete_m": "running_triathlete_m",
    "triathlete_f": "running_triathlete_f", "scientist": "scientist",
    "rocket_m": "rocket_m", "rocket_f": "rocket_f", "aqua_m": "team_aqua/aqua_member_m",
    "aqua_f": "team_aqua/aqua_member_f", "magma_m": "team_magma/magma_member_m",
    "magma_f": "team_magma/magma_member_f",
    "oak": "prof_oak", "birch": "prof_birch", "bill": "bill", "daisy": "daisy",
    "blue": "blue", "brendan": "brendan/walking", "may": "may/walking", "wally": "wally",
    "anabel": "frontier_brains/anabel", "brandon": "frontier_brains/brandon",
    "greta": "frontier_brains/greta", "lucy": "frontier_brains/lucy",
    "noland": "frontier_brains/noland", "spenser": "frontier_brains/spenser",
    "tucker": "frontier_brains/tucker",
    "giovanni": "giovanni", "archie": "team_aqua/archie", "maxie": "team_magma/maxie",
    "lorelei": "lorelei", "norman": "gym_leaders/norman", "juan": "gym_leaders/juan",
    "steven": "steven", "wallace": "wallace",
}
# stride, stand, stride for each of down, up, left; right mirrors left.
CUT = [(3, 0, 4), (5, 1, 6), (7, 2, 8)]


def rgba(png):
    """An indexed sheet with index 0 clear (from the INDICES, not the palette)."""
    img = Image.open(io.BytesIO(png))
    assert img.mode == "P", "not indexed"
    out = img.convert("RGBA")
    out.putalpha(Image.frombytes("L", img.size, bytes(255 if v else 0 for v in img.tobytes())))
    return out


def skin(png):
    img = rgba(png)
    assert img.height == 32 and img.width >= 9 * 16, f"no walk cycle ({img.size})"
    out = Image.new("RGBA", (48, 128))
    frame = lambda i: img.crop((i * 16, 0, i * 16 + 16, 32))
    for r, cols in enumerate(CUT):
        for c, i in enumerate(cols):
            out.paste(frame(i), (c * 16, r * 32))
    for c, i in enumerate(CUT[2]):
        out.paste(frame(i).transpose(Image.FLIP_LEFT_RIGHT), (c * 16, 3 * 32))
    return out


def save(img, path):
    """Indexed when it fits, which every Gen 3 sheet does (asserted lossless)."""
    cols = {(0, 0, 0, 0): 0}
    clear = lambda p: p if p[3] else (0, 0, 0, 0)
    idx = bytes(cols.setdefault(clear(p), len(cols)) for p in img.getdata())
    assert len(cols) <= 256
    small = Image.frombytes("P", img.size, idx)
    small.putpalette([v for c in cols for v in c[:3]])
    buf = io.BytesIO()
    small.save(buf, "PNG", optimize=True, transparency=0)
    back = Image.open(io.BytesIO(buf.getvalue())).convert("RGBA")
    assert [clear(p) for p in back.getdata()] == [clear(p) for p in img.getdata()], path
    path.write_bytes(buf.getvalue())


def main():
    ids = json.loads(subprocess.run(
        ["node", "--input-type=module", "-e",
         "const {SKINS}=await import('./src/game/cosmetics.js');console.log(JSON.stringify(SKINS.map(s=>s.id)))"],
        cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    missing = [i for i in ids if i not in SRC]
    assert not missing, f"no source for {missing}"
    OUT.mkdir(parents=True, exist_ok=True)
    for id in ids:
        save(skin(fetch(f"{PEOPLE}{SRC[id]}.png")), OUT / f"{id}.png")
    # object_events' copy: field_effects' draws in the player's palette slot,
    # so its own PNG is the wrong colours. Two frames a facing; the first.
    blob = rgba(fetch("graphics/object_events/pics/misc/surf_blob.png"))
    assert blob.size == (192, 32), blob.size
    surf = Image.new("RGBA", (128, 32))
    for c, i in enumerate((0, 2, 4)):
        surf.paste(blob.crop((i * 32, 0, i * 32 + 32, 32)), (c * 32, 0))
    surf.paste(blob.crop((128, 0, 160, 32)).transpose(Image.FLIP_LEFT_RIGHT), (96, 0))
    save(surf, OUT / "surf.png")
    for f in OUT.glob("*.png"):
        if f.stem not in ids and f.stem != "surf":
            f.unlink()
    size = sum(f.stat().st_size for f in OUT.glob("*.png"))
    print(f"{len(ids)} skins and the surf blob ({size // 1024} KB)")


if __name__ == "__main__":
    main()
