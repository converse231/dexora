"""Arena sprites: the PMD Sprite Repository's animations (npm run pmd).

PMDCollab/SpriteCollab draws nearly every species in Pokemon Mystery Dungeon's
style - eight directions and some thirty animations each (sprite/<dex>[/<form>]/
<Anim>-Anim.png, frame sizes and timings in AnimData.xml). The ARENA ALONE
uses them (your call, 2026-10-22: no portraits, nothing on the map), and only
the nine it plays: walking, standing, a blow, a shot, a charge, a hit, sleep,
a hop and a stamp.

Each Pokemon we ship gets ONE atlas, public/arena/pmd/<id>.png - every frame
cropped to the union of its animation's pixels (PMD's frame boxes are
generous: Pikachu's blow is 80x80 around a 30px body), packed on shelves no
wider than WIDTH, indexed (asserted lossless) - and a sidecar <id>.json with
each animation's place, frame size, timings, hit frame and where its feet
are. A SHINY is the same pixels in other colours, so it ships as a palette
swap in the sidecar (`s`), never a second image; a sheet whose shiny is not
a clean swap ships no shiny, and a shiny of it walks in its old art.

A form is matched to its PMD subgroup BY NAME (charizard-mega-x <-> Mega_X);
one that does not match keeps the follower art, as does any species PMD has
not drawn. src/data/pmd.js lists the ids that have an atlas; credits.json
names every sheet's artists (CC BY-NC 4.0 asks for it, and the Arena's help
shows it).

Pinned to COMMIT and cached in .assets-src/pmd/.
"""
import hashlib, io, json, os, re, subprocess, sys, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REPO = "PMDCollab/SpriteCollab"
COMMIT = "8609c03fe46623daf6dee524a9c573d1e9fc1c2f"   # master, 2026-10-21
CACHE = ROOT / ".assets-src" / "pmd" / COMMIT[:10]
OUT = ROOT / "public" / "arena" / "pmd"
JS = ROOT / "src" / "data" / "pmd.js"
# What the Arena plays (render.js's POSE). Walk, Idle, Attack and Hurt are the
# floor: a sheet without one of them is not shipped.
ANIMS = ["Walk", "Idle", "Attack", "Shoot", "Charge", "Hurt", "Sleep", "Hop", "Double"]
MUST = {"Walk", "Idle", "Attack", "Hurt"}
WIDTH = 1024          # an atlas's widest row; mobile GPUs take 4096 a side
ONLY = {int(a) for a in sys.argv[1:] if a.isdigit()}   # `npm run pmd -- 25 6`: a sample
# A sample bakes beside the cache, never into the shipped folder: it would
# change files the stamp (PMD_REV) does not cover, and a day-cached old atlas
# would be read beside its new sidecar.
if ONLY:
    OUT = ROOT / ".assets-src" / "pmd-sample"


def fetch(path):
    """One upstream file at COMMIT, or None when it is not there."""
    f = CACHE / path
    miss = f.with_suffix(f.suffix + ".none")
    if miss.exists():
        return None
    if not f.exists():
        # jsDelivr's mirror of the pinned commit first (a CDN: a cold bake is
        # ~32,000 files), GitHub's raw files when it fails.
        mirrors = [f"https://cdn.jsdelivr.net/gh/{REPO}@{COMMIT}/{path}", f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/{path}"]
        for attempt in range(4):
            url = mirrors[min(attempt, 1)]
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    data = r.read()
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    miss.parent.mkdir(parents=True, exist_ok=True)
                    miss.write_bytes(b"")
                    return None
                if attempt == 3:
                    raise
            except (urllib.error.URLError, TimeoutError):
                if attempt == 3:
                    raise
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)
    return f.read_bytes()


def species():
    out = subprocess.run(
        ["node", "--input-type=module", "-e",
         "const {SPECIES}=await import('./src/data/dex.js');"
         "console.log(JSON.stringify(SPECIES.map(s=>[s.id,s.name,s.from,s.form,s.of??null])))"],
        cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


norm = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def node_for(tracker, dex, suffix):
    """The tracker node and its path for a species (suffix None) or one of its
    forms, matched by name; None when PMD has no drawing of it."""
    key = f"{dex:04d}"
    root = tracker.get(key)
    if not root:
        return None
    if suffix is None:
        return (root, key) if root.get("sprite_complete", 0) > 0 else None
    for f, sub in (root.get("subgroups") or {}).items():
        if f != "0000" and norm(sub.get("name", "")) == norm(suffix) and sub.get("sprite_complete", 0) > 0:
            return sub, f"{key}/{f}"
    return None


def shiny_path(node, path):
    """Where its shiny lives: <form>/0001, or <dex>/0000/0001 for a species."""
    subs = node.get("subgroups") or {}
    if "0001" in subs and subs["0001"].get("sprite_complete", 0) > 0 and "/" in path:
        return f"{path}/0001"
    plain = subs.get("0000", {}).get("subgroups", {}).get("0001")
    if plain and plain.get("sprite_complete", 0) > 0:
        return f"{path}/0000/0001"
    return None


def anim_data(path):
    raw = fetch(f"sprite/{path}/AnimData.xml")
    if not raw:
        return None
    out = {}
    for a in ET.fromstring(raw).iter("Anim"):
        name = a.findtext("Name")
        copy = a.findtext("CopyOf")
        out[name] = {
            "copy": copy,
            "w": int(a.findtext("FrameWidth") or 0), "h": int(a.findtext("FrameHeight") or 0),
            "dur": [int(d.text) for d in a.iter("Duration")],
            "hit": int(a.findtext("HitFrame")) if a.findtext("HitFrame") else None,
        }
    # A CopyOf plays another animation's sheet with its sizes and timings.
    for name, a in out.items():
        src, seen = name, set()
        while out[src]["copy"] in out and src not in seen:
            seen.add(src)
            src = out[src]["copy"]
        a.update({k: out[src][k] for k in ("w", "h", "dur", "hit")}, file=src)
    return out


def credit(node, names):
    c = node.get("sprite_credit") or {}
    ids = [c.get("primary")] + list(c.get("secondary") or [])
    return [names.get(i, i) for i in ids if i]


def build(id, path, spath, names, node):
    """One Pokemon's atlas and sidecar, or None. Every frame is cut to its own
    pixels and packed once: a frame repeated (an idle's held pose) is stored
    once, and a left-facing row that is exactly its right-facing row mirrored
    (PMD draws most that way) is not stored at all - it is drawn flipped. Uncut,
    Rayquaza's atlas decoded to 30 MB; PMD's frame boxes are mostly air."""
    data = anim_data(path)
    if not data or not MUST <= set(data):
        return None
    pieces, seen, anims, swaps, cuts = [], {}, {}, [], []
    for name in ANIMS:
        a = data.get(name)
        if not a or not a["w"]:
            continue
        raw = fetch(f"sprite/{path}/{a['file']}-Anim.png")
        if not raw:
            continue
        img = Image.open(io.BytesIO(raw)).convert("RGBA")
        fw, fh = a["w"], a["h"]
        n, rows = img.width // fw, img.height // fh
        if n < 1 or rows < 1 or n != len(a["dur"]):
            continue
        cell = lambda r, k: img.crop((k * fw, r * fh, (k + 1) * fw, (r + 1) * fh))
        # Rows run down, down-right, right, up-right, up, up-left, left, down-left.
        mirror = {}
        if rows == 8:
            for left, right in ((5, 3), (6, 2), (7, 1)):
                if all(cell(left, k).tobytes() == cell(right, k).transpose(Image.FLIP_LEFT_RIGHT).tobytes() for k in range(n)):
                    mirror[left] = right
        table = []
        for r in range(rows):
            if r in mirror:
                table.append(-1 - mirror[r])          # -1-k: row k, flipped
                continue
            row = []
            for k in range(n):
                c = cell(r, k)
                b = c.getbbox()
                if not b:
                    row.append(-1)                    # an empty frame (a blink of nothing)
                    continue
                piece = c.crop(b)
                # Where the piece sits against the frame's centre, PMD's anchor.
                key = (piece.size, piece.tobytes(), b[0] - fw / 2, b[1] - fh / 2)
                if key not in seen:
                    seen[key] = len(pieces)
                    pieces.append((piece, b[0] - fw / 2, b[1] - fh / 2))
                    cuts.append((len(swaps) if spath else None, (k * fw + b[0], r * fh + b[1], k * fw + b[2], r * fh + b[3])))
                row.append(seen[key])
            table.append(row)
        anims[name] = {"r": table, "d": a["dur"], "h": a["hit"]}
        if spath:
            sraw = fetch(f"sprite/{spath}/{a['file']}-Anim.png")
            simg = Image.open(io.BytesIO(sraw)).convert("RGBA") if sraw else None
            swaps.append((img, simg) if simg and simg.size == img.size else None)
    if not MUST <= set(anims):
        return None
    # Where its feet are: the shadow's middle, from the walk's first frame (PMD
    # draws the shadow under the frame's centre, at the body's ground).
    feet = 0
    sh = fetch(f"sprite/{path}/{data['Walk']['file']}-Shadow.png")
    if sh:
        w = data["Walk"]
        s = Image.open(io.BytesIO(sh)).convert("RGBA").crop((0, 0, w["w"], w["h"]))
        ys = [y for y in range(s.height) for x in range(s.width) if s.getpixel((x, y))[3]]
        if ys:
            feet = round(sum(ys) / len(ys) - w["h"] / 2, 1)
    # The shiny swap, consistent across every animation or none at all.
    pairs, clean = {}, bool(spath) and bool(swaps) and all(swaps)
    whole = clean                           # every animation has a same-shaped shiny
    for pair in swaps if clean else []:
        a, s = pair
        for p, q in zip(a.get_flattened_data(), s.get_flattened_data()):
            if p[3] and pairs.setdefault(p[:3], q[:3]) != q[:3]:
                clean = False
                break
        if not clean:
            break
    # Shelves, tallest first, about square.
    area = sum(p.width * p.height for p, _, _ in pieces)
    width = max(max(p.width for p, _, _ in pieces), min(WIDTH, int((area * 1.15) ** 0.5) + 1))
    order = sorted(range(len(pieces)), key=lambda i: (-pieces[i][0].height, -pieces[i][0].width))
    at, x, y, shelf = {}, 0, 0, 0
    for i in order:
        p = pieces[i][0]
        if x + p.width > width:
            x, y, shelf = 0, y + shelf, 0
        at[i] = (x, y)
        x += p.width
        shelf = max(shelf, p.height)
    atlas = Image.new("RGBA", (max(at[i][0] + pieces[i][0].width for i in at), y + shelf))
    for i, (px, py) in at.items():
        atlas.paste(pieces[i][0], (px, py))
    # Indexed and lossless (asserted), as the follower sheets.
    flat = [p if p[3] else (0, 0, 0, 0) for p in atlas.get_flattened_data()]
    cols = {(0, 0, 0, 0): 0}
    for p in flat:
        cols.setdefault(p, len(cols))
    buf = io.BytesIO()
    if len(cols) <= 256:
        small = Image.frombytes("P", atlas.size, bytes(cols[p] for p in flat))
        small.putpalette([v for c in cols for v in c[:3]])
        small.save(buf, "PNG", optimize=True, transparency=bytes(c[3] for c in cols))
    else:
        atlas.save(buf, "PNG", optimize=True)
    back = Image.open(io.BytesIO(buf.getvalue())).convert("RGBA")
    assert [p if p[3] else (0, 0, 0, 0) for p in back.get_flattened_data()] == flat, f"#{id}: the atlas lost colour"
    hexc = lambda c: "%02x%02x%02x" % c
    meta = {
        # Every piece: x, y, w, h in the atlas, then its offset from the frame's centre.
        "q": [v for i in range(len(pieces)) for v in (*at[i], *pieces[i][0].size, pieces[i][1], pieces[i][2])],
        # Each animation: its rows of piece indices (-1 empty; a row of -1-k is row k
        # flipped), each frame's duration in 60ths, and the frame a blow lands on.
        "a": anims,
        "f": feet,
    }
    shiny = None
    if clean and any(k != v for k, v in pairs.items()):
        meta["s"] = [hexc(k) + hexc(v) for k, v in sorted(pairs.items()) if k != v]
    elif whole:
        # One normal colour that is two shiny ones (Charizard's): no swap can say
        # it, so the shiny is its own atlas on the same layout - fetched only
        # when a shiny is in the match.
        sat = Image.new("RGBA", atlas.size)
        for i, (sw, box) in enumerate(cuts):
            sat.paste(swaps[sw][1].crop(box), at[i])
        sbuf = io.BytesIO()
        scols = {(0, 0, 0, 0): 0}
        sflat = [p if p[3] else (0, 0, 0, 0) for p in sat.get_flattened_data()]
        for p in sflat:
            scols.setdefault(p, len(scols))
        if len(scols) <= 256:
            sm = Image.frombytes("P", sat.size, bytes(scols[p] for p in sflat))
            sm.putpalette([v for c in scols for v in c[:3]])
            sm.save(sbuf, "PNG", optimize=True, transparency=bytes(c[3] for c in scols))
        else:
            sat.save(sbuf, "PNG", optimize=True)
        shiny = sbuf.getvalue()
        meta["S"] = 1
    return buf.getvalue(), meta, credit(node, names), atlas.size, shiny


def one(job):
    (id, path, spath, node), names = job
    try:
        return id, build(id, path, spath, names, node)
    except Exception as e:                          # one bad sheet must not stop the bake
        print(f"  #{id} {path}: {e}")
        return id, None


def main():
    tracker = json.loads(fetch("tracker.json"))
    names = {}
    for line in (fetch("credit_names.txt") or b"").decode("utf-8", "replace").splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) >= 2:
            names[parts[1].strip()] = parts[0].strip()
    rows = species()
    byname = {name: id for id, name, *_ in rows}
    targets = []
    for id, name, base, form, of in rows:
        if ONLY and id not in ONLY:
            continue
        if form == "event":
            continue                    # a costume never battles
        if form:
            if not of or not base or not name.startswith(base + "-"):
                continue
            hit = node_for(tracker, of, name[len(base) + 1:])
        else:
            hit = node_for(tracker, id, None)
        if hit:
            node, path = hit
            targets.append((id, path, shiny_path(node, path), node))
    # Every file this run reads, fetched in parallel once.
    want = []
    for id, path, spath, node in targets:
        want.append(f"sprite/{path}/AnimData.xml")
        want += [f"sprite/{path}/{a}-Anim.png" for a in ANIMS] + [f"sprite/{path}/Walk-Shadow.png"]
        if spath:
            want += [f"sprite/{spath}/{a}-Anim.png" for a in ANIMS]
    with ThreadPoolExecutor(24) as pool:
        list(pool.map(fetch, want))
    OUT.mkdir(parents=True, exist_ok=True)
    shipped, credits, skipped, shiny, biggest, with_s = [], {}, [], 0, (0, None), set()
    # Processes, not threads: building is pixel work under Python's lock, and
    # threads ran it on one core (~40 minutes for the whole dex).
    with ProcessPoolExecutor(max(1, (os.cpu_count() or 2) - 1)) as pool:
        done = list(pool.map(one, [(t, names) for t in targets], chunksize=8))
    for id, got in done:
        if not got:
            skipped.append(id)
            continue
        png, meta, who, size, spng = got
        (OUT / f"{id}.png").write_bytes(png)
        if spng:
            (OUT / f"{id}-s.png").write_bytes(spng)
            with_s.add(id)
        (OUT / f"{id}.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
        shipped.append(id)
        credits[id] = who
        shiny += "s" in meta or "S" in meta
        biggest = max(biggest, (size[0] * size[1], id))
    if not ONLY:
        keep = set(shipped)
        for f in OUT.glob("*.*"):
            base, _, tail = f.stem.partition("-")
            # Gone, or a shiny atlas its sidecar no longer names.
            if base.isdigit() and (int(base) not in keep or (tail == "s" and int(base) not in with_s)):
                f.unlink()
        (OUT / "credits.json").write_text(json.dumps({str(k): v for k, v in sorted(credits.items())},
                                                     separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        # THE STAMP: a hash of every file, carried by every url (render.js), so a
        # re-bake never meets a day-cached old atlas beside its new sidecar -
        # the map's tiles drew garbage exactly so (ATLAS_REV, 2026-10-07).
        h = hashlib.sha1()
        for f in sorted(OUT.iterdir()):
            h.update(f.name.encode())
            h.update(f.read_bytes())
        JS.write_text(
            "// Generated by tools/build_pmd.py (npm run pmd) - never edit by hand.\n"
            "// The ids with an Arena atlas (public/arena/pmd/<id>.png and .json), as\n"
            "// hex, comma-separated; anything else fights in its follower art. PMD_REV\n"
            "// stamps every url, so a re-bake is never read beside a cached old file.\n"
            f"export const PMD_IDS = {json.dumps(','.join(format(i, 'x') for i in sorted(shipped)))};\n"
            f"export const PMD_REV = {json.dumps(h.hexdigest()[:10])};\n",
            encoding="utf-8", newline="\r\n")
    size = sum(f.stat().st_size for f in OUT.glob("*.png"))
    meta = sum(f.stat().st_size for f in OUT.glob("*.json"))
    print(f"{len(shipped)} atlases ({size // 1024} KB, sidecars {meta // 1024} KB), {shiny} with a shiny swap, "
          f"{len(skipped)} skipped; largest #{biggest[1]} at {biggest[0] * 4 // 1024} KB decoded")


if __name__ == "__main__":
    main()
