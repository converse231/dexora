"""python tools/build_battle_art.py - the League's pictures (docs/battles.md, *Sources*).

Reads src/data/leagues.js (npm run leagues writes it) and fills:

  public/trainers/<pic>.png      every opponent's portrait: Pokemon Showdown's
                                 trainer sprites, one pixel style for all nine
                                 regions. `pic` was resolved by fetch-leagues.
  public/badges/<gym id>.png     a badge per leader, 32x32, from Bulbagarden
                                 Archives' own set (the *Badge* article's renders)
  public/sprites/back/<id>.png   back sprites, and back/shiny/, from PokeAPI's
                                 sprite repository - the same one the fronts
                                 come from. A species with no back art is left
                                 out: the battle draws its front, flipped.

Downloads are cached in .assets-src/ so a re-run fetches only what is new.
"""

import io
import json
import os
import re
import time
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".assets-src")
UA = "Dexora/0.2 (non-commercial fan game; fetches its League art once and caches it)"
SHOWDOWN = "https://play.pokemonshowdown.com/sprites/trainers/"
ARCHIVES = "https://archives.bulbagarden.net/w/api.php"
POKEAPI = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"
BADGE = 32
_last = [0.0]


def fetch(url, polite=False):
    if polite:                           # the wikis: one request at a time, paced
        wait = _last[0] + 0.4 - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def cached(name, url, polite=False):
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        with open(path, "rb") as f:
            data = f.read()
        return data or None              # an empty file records a 404
    data = fetch(url, polite)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data or b"")
    return data


def leagues():
    src = open(os.path.join(ROOT, "src", "data", "leagues.js"), encoding="utf-8").read()
    body = src[src.index("= [") + 2:src.rindex("]") + 1]    # the header comment has brackets too
    return json.loads(body)


def write_png(img, *parts):
    path = os.path.join(ROOT, "public", *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


# ---------------------------------------------------------------- portraits

# The two playable trainers (engine.js CHARS), as a friend is drawn in a
# practice battle (docs/ranked.md): FireRed and LeafGreen's own art, the game
# the overworld sprites are from. src/ui/league/Ranked.jsx maps a char to one.
PLAYER_PICS = ["red-gen3", "leaf-gen3"]


def portraits(regions):
    pics = sorted({o["pic"] for r in regions for g in r["gyms"] for o in [g, *g["trainers"]]}
                  | {p["pic"] for r in regions for p in r["league"]} | set(PLAYER_PICS))
    sizes = set()
    for pic in pics:
        data = cached(f"showdown/{pic}.png", SHOWDOWN + pic + ".png")
        if not data:
            raise SystemExit(f"Showdown has no {pic}.png - fetch-leagues resolved a name that is gone")
        img = Image.open(io.BytesIO(data)).convert("RGBA")
        sizes.add(img.size)
        write_png(img, "trainers", pic + ".png")
    print(f"  {len(pics)} portraits, sizes {sorted(sizes)}")


# ---------------------------------------------------------------- badges

def archive_url(title):
    q = urllib.parse.urlencode({"action": "query", "titles": "File:" + title,
                                "prop": "imageinfo", "iiprop": "url", "format": "json"})
    data = cached("bulbagarden/info-" + re.sub(r"[^\w]", "_", title) + ".json",
                  ARCHIVES + "?" + q, polite=True)
    page = next(iter(json.loads(data)["query"]["pages"].values()))
    info = page.get("imageinfo")
    return info[0]["url"] if info else None


def badge_titles(region, gym):
    """The files that could be this badge, most specific first. Paldea's are
    named by type, Alola's are the Kahunas' Z-Crystals, and a badge two regions
    share a name for (Kalos's and Galar's Fairy Badge) is prefixed by region."""
    t = gym["type"].capitalize()
    if region["id"] == "paldea":
        return [f"SVbadge_VictoryRoad_{t}.png"]
    if region["id"] == "alola":
        return [f"Dream {gym['badge']} Sprite.png"]
    name = gym["badge"].replace(" ", "_")
    return [f"{region['name']}{name}.png", f"{name}.png"]


def badges(regions):
    n = 0
    for r in regions:
        for g in r["gyms"]:
            url = next((u for u in (archive_url(t) for t in badge_titles(r, g)) if u), None)
            if not url:
                raise SystemExit(f"no badge art for {g['name']} ({g['badge']}): tried {badge_titles(r, g)}")
            data = cached("bulbagarden/" + url.rsplit("/", 1)[1], url, polite=True)
            img = Image.open(io.BytesIO(data)).convert("RGBA")
            img = img.crop(img.getbbox())            # the renders carry margins of their own
            img.thumbnail((BADGE, BADGE), Image.LANCZOS)
            canvas = Image.new("RGBA", (BADGE, BADGE))
            canvas.paste(img, ((BADGE - img.width) // 2, (BADGE - img.height) // 2))
            write_png(canvas, "badges", g["id"] + ".png")
            n += 1
    print(f"  {n} badges, {BADGE}x{BADGE}")


# ---------------------------------------------------------------- backs

def backs():
    fronts = sorted(int(f[:-4]) for f in os.listdir(os.path.join(ROOT, "public", "sprites"))
                    if re.fullmatch(r"\d+\.png", f))
    got = {"back": 0, "back/shiny": 0}
    for i, sid in enumerate(fronts):
        for kind in got:
            data = cached(f"pokeapi-backs/{kind.replace('/', '-')}-{sid}.png", f"{POKEAPI}{kind}/{sid}.png")
            if data:
                write_png(Image.open(io.BytesIO(data)), "sprites", *kind.split("/"), f"{sid}.png")
                got[kind] += 1
        if (i + 1) % 100 == 0:
            print(f"\r  backs {i + 1}/{len(fronts)}", end="", flush=True)
    print(f"\r  {got['back']} back sprites and {got['back/shiny']} shiny backs of {len(fronts)} species; "
          f"the rest draw their front, flipped")


if __name__ == "__main__":
    regions = leagues()
    portraits(regions)
    badges(regions)
    backs()
