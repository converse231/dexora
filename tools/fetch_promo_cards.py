# -*- coding: utf-8 -*-
"""PROMO CARDS: real cards no pack sells, filed into a collection by playing.

Run:  npm run promos      (python tools/fetch_promo_cards.py)

Poncho Parade (eventforms.js, 2026-10-28): the Poncho-wearing Pikachu
promos, Japan's XY-P and SM-P cards. TCGdex carries neither promo set, so
the scans come from Bulbagarden Archives (as fetch_card_art.py's card back
and wrappers do), cached in .assets-src/promo. Writes:

  public/cards/poncho/<localId>.webp          the card, at a pack card's size
  public/cards/poncho/hi/<localId>/high.webp  the large one, for the card view
  public/cards/poncho/logo.webp               the set picker's mark: three of them fanned
  src/data/cards/sets/poncho.js               SET and CARDS, a pack set's shape
  src/data/cards/promos.js                    PROMO_SETS, the list the Cards page reads

A promo set is NOT in CARD_SETS (fetch-cards' index): nothing sells, packs,
crafts or titles it. The engine's `grantPromo` is its only way in."""

import io
import json
import os
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CACHE = os.path.join(ROOT, ".assets-src", "promo")
API = "https://archives.bulbagarden.net/w/api.php"
UA = {"User-Agent": "Dexora (non-commercial fan game; build-time asset fetch)"}
# A pack card's picture (public/cards/<set>/*.webp) and the large one.
SIZE, HI = (245, 337), 600

SET = {"id": "poncho", "name": "Poncho-wearing Pikachu", "released": "2015-12-12", "asset": "cards/poncho/hi/"}
# [localId, archive file, the card's name]. Each is a Pikachu card; the ponchos
# are what eventforms.js's looks name it by (`card: "poncho-<localId>"`).
PONCHO = "Poncho-wearing Pikachu"
CARDS = [
    ("xy203", "PonchoWearingPikachuXYPromo203.jpg", PONCHO),   # Mega Audino, Mega Lucario, Mega Slowbro
    ("xy207", "PonchoWearingPikachuXYPromo207.jpg", PONCHO),   # Mega Charizard X
    ("xy208", "PonchoWearingPikachuXYPromo208.jpg", PONCHO),   # Mega Charizard Y
    ("xy230", "PonchoWearingPikachuXYPromo230.jpg", PONCHO),   # Rayquaza
    ("xy231", "PonchoWearingPikachuXYPromo231.jpg", PONCHO),   # Shiny Rayquaza
    ("xy274", "PonchoWearingPikachuXYPromo274.jpg", PONCHO),   # Mega Gallade, Mega Rayquaza, Mega Ampharos, Mega Mawile
    ("xy275", "PonchoWearingPikachuXYPromo275.jpg", PONCHO),   # Mega Lopunny, Mega Diancie, Mega Gardevoir
    ("sm037", "PonchowearingPikachuSMPromo37.jpg", PONCHO),    # Alolan Vulpix
    ("sm038", "PonchowearingPikachuSMPromo38.jpg", PONCHO),
    # The Hiroshima Special Box (2015): the same series' costumes, named "Pretend" on the card.
    ("xy150", "PretendMagikarpPikachuXYPromo150.jpg", "Pretend Magikarp Pikachu"),   # Magikarp
    ("xy151", "PretendGyaradosPikachuXYPromo151.jpg", "Pretend Gyarados Pikachu"),   # Gyarados (blue)    # Vulpix
]


def fetch(name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        q = urllib.parse.urlencode({"action": "query", "titles": f"File:{name}", "prop": "imageinfo", "iiprop": "url", "format": "json"})
        with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=UA), timeout=60) as r:
            page = next(iter(json.load(r)["query"]["pages"].values()))
        url = page["imageinfo"][0]["url"]
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            data = r.read()
        os.makedirs(CACHE, exist_ok=True)
        open(path, "wb").write(data)
    return Image.open(path).convert("RGB")


def fit(img, size):
    """The scan filled to the card's box: a scan is a card, so only its edge is lost."""
    k = max(size[0] / img.width, size[1] / img.height)
    big = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    x, y = (big.width - size[0]) // 2, (big.height - size[1]) // 2
    return big.crop((x, y, x + size[0], y + size[1]))


def logo(cards):
    """Three cards fanned on a transparent strip - the picker's 76x34 box reads it as a set's mark."""
    w, h = 228, 102
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for k, img in enumerate(cards):
        c = img.resize((70, 96), Image.LANCZOS).convert("RGBA").rotate((k - 1) * -9, expand=True, resample=Image.BICUBIC)
        out.alpha_composite(c, (w // 2 - c.width // 2 + (k - 1) * 58, h - c.height + 4 if k != 1 else 0))
    return out


if __name__ == "__main__":
    dest = os.path.join(ROOT, "public", "cards", SET["id"])
    rows, scans = [], {}
    for lid, name, title in CARDS:
        img = scans[lid] = fetch(name)
        os.makedirs(os.path.join(dest, "hi", lid), exist_ok=True)
        fit(img, SIZE).save(os.path.join(dest, f"{lid}.webp"), "WEBP", quality=82, method=6)
        hi = img.resize((HI, round(img.height * HI / img.width)), Image.LANCZOS)
        hi.save(os.path.join(dest, "hi", lid, "high.webp"), "WEBP", quality=85, method=6)
        # Every one is Kouki Saitou's, as each card prints at its foot.
        rows.append([lid, title, "P", "promo", "h", [25], "Kouki Saitou"])
        print(f"{lid}: {img.width}x{img.height}")
    logo([scans["xy207"], scans["xy230"], scans["sm037"]]).save(os.path.join(dest, "logo.webp"), "WEBP", quality=85, method=6)
    meta = {**SET, "official": len(rows), "total": len(rows)}
    body = ",\r\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows)
    io.open(os.path.join(ROOT, "src", "data", "cards", "sets", f"{SET['id']}.js"), "w", encoding="utf-8", newline="").write(
        "/* GENERATED by tools/fetch_promo_cards.py (npm run promos) from Bulbagarden Archives - never hand-edit.\r\n"
        "   A PROMO set: no pack sells it; the engine's `grantPromo` files a card on a look's first catch.\r\n"
        "   Rows: [localId, name, category, rarity, variants, speciesIds, illustrator]. */\r\n"
        f"export const SET = {json.dumps(meta, separators=(',', ':'))};\r\n"
        f"export const CARDS = [\r\n{body},\r\n];\r\n")
    index = [{k: meta[k] for k in ("id", "name", "released", "total")}]
    io.open(os.path.join(ROOT, "src", "data", "cards", "promos.js"), "w", encoding="utf-8", newline="").write(
        "/* GENERATED by tools/fetch_promo_cards.py (npm run promos) - the promo sets: real cards no\r\n"
        "   pack sells, kept out of CARD_SETS so nothing sells, packs, crafts or titles them. */\r\n"
        f"export const PROMO_SETS = {json.dumps(index, separators=(',', ':'))};\r\n")
    print(f"{len(rows)} promo cards")
