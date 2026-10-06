"""Follower sheets: the Pokemon that walks behind you (npm run follow).

pokeemerald-expansion draws an overworld sprite for nearly every species and
form: graphics/pokemon/<name>[/<form>]/overworld.png, 192x32, six 32x32
frames - two facing down, two up, two west (east is west mirrored;
`sAnim_GoSouth2F` and its siblings in object_event_anims.h) - indexed, with
palette index 0 the background, and a normal and a shiny .pal beside it.

Each species we ship gets public/follow/<id>.png: those six frames twice,
the normal palette over the shiny one (192x64 RGBA), so a shiny follower is
a row offset, never a second request. A form without its own drawing walks
as its species (`SAME`), and src/data/follow.js says which file each id
reads. The engine loads one sheet: the follower's.

Pinned to build_anims.py's COMMIT and cached in .assets-src/follow/.
"""
import io, json, subprocess, sys, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_anims import REPO, COMMIT   # one pin for everything read from the expansion

CACHE = ROOT / ".assets-src" / "follow" / COMMIT[:10]
OUT = ROOT / "public" / "follow"
JS = ROOT / "src" / "data" / "follow.js"


def fetch(path):
    """One upstream file at COMMIT, or None when it is not there."""
    f = CACHE / path
    miss = f.with_suffix(f.suffix + ".none")
    if miss.exists():
        return None
    if not f.exists():
        url = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/{path}"
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = r.read()
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            miss.parent.mkdir(parents=True, exist_ok=True)
            miss.write_bytes(b"")
            return None
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)
    return f.read_bytes()


def tree():
    """Every overworld.png at COMMIT, from one API call (cached)."""
    f = CACHE / "tree.json"
    if not f.exists():
        url = f"https://api.github.com/repos/{REPO}/git/trees/{COMMIT}?recursive=1"
        with urllib.request.urlopen(url, timeout=120) as r:
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(r.read())
    return {e["path"] for e in json.loads(f.read_text())["tree"]}


def palette(dirs, name):
    """A JASC .pal, from the sheet's own folder or the nearest parent (Unown's
    letters share Unown's)."""
    for d in dirs:
        raw = fetch(f"{d}{name}")
        if raw:
            lines = raw.decode().split()
            n = int(lines[2])
            return [tuple(int(v) for v in lines[3 + 3 * i:6 + 3 * i]) for i in range(n)]
    return None


def species():
    out = subprocess.run(
        ["node", "--input-type=module", "-e",
         "const {SPECIES}=await import('./src/data/dex.js');"
         "console.log(JSON.stringify(SPECIES.map(s=>[s.id,s.name,s.from,s.form])))"],
        cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def folders(name, base, form):
    """Where a species' drawing might live, most specific first. A slug's
    trailing words are dropped one at a time (deoxys-normal -> deoxys); a
    form tries <base>/<suffix> before its base's folder, which `SAME` then
    names instead."""
    slug = lambda s: s.replace("-", "_")
    out = []
    if form and base and name.startswith(base + "-"):
        out.append(f"{slug(base)}/{slug(name[len(base) + 1:])}")
        return out
    parts = name.split("-")
    for k in range(len(parts), 0, -1):
        out.append(slug("-".join(parts[:k])))
    return out


def sheet(png, normal, shiny):
    """Eight frames a row - down, down, up, up, west, west, east, east - the
    normal palette over the shiny. A six-frame sheet's east is its west
    mirrored, baked here so the engine never flips; an eight-frame one
    (`_Asym`, Absol's blade) draws its own. Frames are square: 32px, or 64
    for the big ones (Lugia, Wailord), drawn at that size as on the GBA."""
    img = Image.open(io.BytesIO(png))
    s = img.height
    if img.mode != "P" or s not in (32, 64) or img.width not in (6 * s, 8 * s):
        return None
    out = Image.new("RGBA", (8 * s, 2 * s))
    for row, pal in enumerate((normal, shiny or normal)):
        flat = []
        for c in pal[:256]:
            flat += list(c)
        p = img.copy()
        p.putpalette(flat + [0] * (768 - len(flat)))
        rgba = p.convert("RGBA")
        # From the INDICES: `point` on a P image maps its palette, not its pixels.
        mask = Image.frombytes("L", img.size, bytes(255 if v else 0 for v in img.tobytes()))
        rgba.putalpha(mask)
        out.paste(rgba, (0, row * s))
        if img.width == 6 * s:
            for f in (4, 5):
                west = rgba.crop((f * s, 0, (f + 1) * s, s)).transpose(Image.FLIP_LEFT_RIGHT)
                out.paste(west, ((f + 2) * s, row * s))
    return out


def main():
    paths = tree()
    OUT.mkdir(parents=True, exist_ok=True)
    # Every file this run reads, fetched in parallel once (a cold cache is ~3,800).
    want = []
    for p in paths:
        if p.endswith("/overworld.png"):
            d = p[:-len("overworld.png")]
            want += [p, d + "overworld_normal.pal", d + "overworld_shiny.pal"]
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(16) as pool:
        list(pool.map(fetch, want))
    rows = species()
    byname = {name: id for id, name, _, _ in rows}
    own, same, none = {}, {}, []
    for id, name, base, form in rows:
        found = None
        for d in folders(name, base, form):
            if f"graphics/pokemon/{d}/overworld.png" in paths:
                found = d
                break
        if not found:
            if form and base in byname:
                same[id] = byname[base]   # resolved below, once the base is known
            else:
                none.append(id)
            continue
        d = f"graphics/pokemon/{found}/"
        parents = [d] + [d.rsplit("/", 2)[0] + "/"] if found.count("/") else [d]
        img = sheet(fetch(f"{d}overworld.png"), palette(parents, "overworld_normal.pal"),
                    palette(parents, "overworld_shiny.pal"))
        if img is None:
            none.append(id)
            continue
        own[id] = found
        # Two 16-colour palettes and the clear: an indexed PNG holds it
        # exactly, at a quarter of the RGBA file. Asserted lossless.
        cols = {(0, 0, 0, 0): 0}
        idx = bytes(cols.setdefault(px if px[3] else (0, 0, 0, 0), len(cols)) for px in img.getdata())
        small = Image.frombytes("P", img.size, idx)
        small.putpalette([v for c in cols for v in c[:3]])
        buf = io.BytesIO()
        small.save(buf, "PNG", optimize=True, transparency=0)
        clear = lambda im: bytes(b for px in im.getdata() for b in (px if px[3] else (0, 0, 0, 0)))
        back = Image.open(io.BytesIO(buf.getvalue())).convert("RGBA")
        assert clear(back) == clear(img), f"{name}: quantize lost colour"
        (OUT / f"{id}.png").write_bytes(buf.getvalue())
    # A form walks as its base when the base has a sheet; otherwise not at all.
    for id, b in list(same.items()):
        if b not in own:
            del same[id]
            none.append(id)
    for f in OUT.glob("*.png"):
        if int(f.stem) not in own:
            f.unlink()
    JS.write_text(
        "// Generated by tools/build_follow.py (npm run follow) - never edit by hand.\n"
        "// Which follower sheet an id walks with: public/follow/<id>.png for its own,\n"
        "// SAME for a form that walks as its species, NONE for one with no drawing.\n"
        f"export const SAME = {json.dumps({str(k): v for k, v in sorted(same.items())}, separators=(',', ':'))};\n"
        f"export const NONE = {json.dumps(sorted(none), separators=(',', ':'))};\n",
        encoding="utf-8", newline="\r\n")
    size = sum(f.stat().st_size for f in OUT.glob("*.png"))
    print(f"{len(own)} sheets ({size // 1024} KB), {len(same)} forms walk as their species, "
          f"{len(none)} without: {[n for i, n, _, _ in rows if i in set(none)][:40]}")


if __name__ == "__main__":
    main()
