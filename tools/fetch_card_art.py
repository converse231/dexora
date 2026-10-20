"""The card back and each set's real booster wrappers, from Bulbagarden
Archives (docs/cards.md, Art). Run by `npm run cards` after fetch-cards.mjs.

Writes:
  public/cards/back.webp                 the real Pokémon TCG card back
  public/cards/<set>/pack-<slug>.webp    each wrapper the set was printed in
  src/data/cards/art.js                  which wrappers each set has - read by
                                         the lazy Cards page only

A set prints several wrappers (Mega Evolution: Venusaur, Gardevoir, Lucario,
Kangaskhan); which one a pack opens in is cosmetic and chosen by the page -
it changes no roll. Originals are cached in .assets-src/bulba/."""
import io
import json
import os
import re
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".assets-src", "bulba")
API = "https://archives.bulbagarden.net/w/api.php"
UA = {"User-Agent": "Dexora (non-commercial fan game; build-time asset fetch)"}
BACK = "Cardback.jpg"
WRAPPERS = {
    "me01": ["ME1 Booster Mega Venusaur.png", "ME1 Booster Mega Gardevoir.png",
             "ME1 Booster Mega Lucario.png", "ME1 Booster Mega Kangaskhan.png"],
    "me02": ["ME2 Booster Mega Charizard X.png", "ME2 Booster Mega Gengar.png",
             "ME2 Booster Mega Heracross.png", "ME2 Booster Mega Lopunny.png"],
    "me02.5": ["Ascended Heroes Booster.png"],
    "sv03.5": ["151 Booster.png"],
    "sv08.5": ["Prismatic Evolutions Booster Eevee Sylveon.png", "Prismatic Evolutions Booster Espeon Umbreon.png",
               "Prismatic Evolutions Booster Leafeon Glaceon.png",
               "Prismatic Evolutions Booster Vaporeon Jolteon Flareon.png"],
    "me03": ["ME3 Booster Mega Zygarde.png", "ME3 Booster Mega Clefable.png", "ME3 Booster Mega Starmie.png",
             "ME3 Booster Meowth.png"],
    "me04": ["ME4 Booster Mega Greninja.png", "ME4 Booster Mega Floette.png", "ME4 Booster Mega Dragalge.png",
             "ME4 Booster Mega Pyroar.png"],
    "me05": ["ME5 Booster Mega Darkrai.png", "ME5 Booster Mega Zeraora.png", "ME5 Booster Mega Chandelure.png",
             "ME5 Booster Mega Excadrill.png"],
    "30th": ["30th Celebration Booster.png"],
    "sv08": ["SV8 Booster Pikachu.png", "SV8 Booster Latias.png", "SV8 Booster Archaludon.png",
             "SV8 Booster Alolan Exeggutor.png"],
    "sv09": ["SV9 Booster Hop Zacian.png", "SV9 Booster Lillie Clefairy.png", "SV9 Booster N Zoroark.png",
             "SV9 Booster Iono Bellibolt.png"],
    "sv10": ["SV10 Booster Team Rocket.png", "SV10 Booster Cynthia Garchomp.png",
             "SV10 Booster Giovanni Mewtwo.png", "SV10 Booster Ethan Ho-Oh.png"],
    "sv10.5b": ["SV10.5 BLK Booster EN.png"],
    "sv10.5w": ["SV10.5 WHT Booster EN.png"],
    "sv01": ["SV1 Booster Koraidon.png", "SV1 Booster Miraidon.png", "SV1 Booster Gyarados.png"],
    "sv02": ["SV2 Booster Meowscarada.png", "SV2 Booster Skeledirge.png", "SV2 Booster Quaquaval.png",
             "SV2 Booster Ting-Lu.png", "SV2 Booster Chien-Pao.png"],
    "sv03": ["SV3 Booster Charizard.png", "SV3 Booster Tyranitar.png", "SV3 Booster Dragonite.png",
             "SV3 Booster Revavroom.png"],
    "sv04": ["SV4 Booster Roaring Moon.png", "SV4 Booster Iron Valiant.png", "SV4 Booster Garchomp.png",
             "SV4 Booster Armarouge.png"],
    "sv04.5": ["Paldean Fates Booster Pikachu.png", "Paldean Fates Booster Ceruledge.png",
               "Paldean Fates Booster Tinkaton.png", "Paldean Fates Booster Dondozo.png"],
    "sv05": ["SV5 Booster Walking Wake.png", "SV5 Booster Iron Leaves.png", "SV5 Booster Raging Bolt.png",
             "SV5 Booster Iron Crown.png"],
    "sv06": ["SV6 Booster Ogerpon.png", "SV6 Booster Dragapult.png", "SV6 Booster Ursaluna.png",
             "SV6 Booster Sinistcha.png"],
    "sv06.5": ["Shrouded Fable Booster Pecharunt.png", "Shrouded Fable Booster Okidogi.png",
               "Shrouded Fable Booster Munkidori.png", "Shrouded Fable Booster Fezandipiti.png"],
    "sv07": ["SV7 Booster Terapagos.png", "SV7 Booster Lapras.png", "SV7 Booster Cinderace.png",
             "SV7 Booster Galvantula.png"],
    # The 1999 wrappers (Bulbagarden's "Shadowless" scans: the first print run).
    "base1": ["Base Set Booster Charizard Shadowless.jpg", "Base Set Booster Blastoise Shadowless.jpg",
              "Base Set Booster Venusaur Shadowless.jpg"],
    # Sword & Shield's favourites (2026-10-15): each set's own wrappers, checked live on Bulbagarden.
    "swsh7": ["SWSH7 Booster Umbreon.jpg", "SWSH7 Booster Sylveon.jpg", "SWSH7 Booster Rayquaza.jpg",
              "SWSH7 Booster Gigantamax Duraludon.jpg"],
    "swsh9": ["SWSH9 Booster Charizard.jpg", "SWSH9 Booster Arceus.jpg", "SWSH9 Booster Shaymin.jpg",
              "SWSH9 Booster Whimsicott.jpg"],
    "swsh11": ["SWSH11 Booster Origin Forme Giratina.jpg", "SWSH11 Booster Hisuian Zoroark.jpg",
               "SWSH11 Booster Radiant Gardevoir.jpg", "SWSH11 Booster Enamorus.jpg"],
    "swsh12": ["SWSH12 Booster Lugia.jpg", "SWSH12 Booster Alolan Vulpix.jpg", "SWSH12 Booster Regieleki.jpg",
               "SWSH12 Booster Regidrago.jpg"],
    "swsh12.5": ["Crown Zenith Booster.jpg"],
    # Five more (2026-10-20), each set's own wrappers, listed live on Bulbagarden.
    "swsh3": ["SWSH3 Booster Gigantamax Charizard.jpg", "SWSH3 Booster Eternamax Eternatus.jpg",
              "SWSH3 Booster Gigantamax Grimmsnarl.jpg", "SWSH3 Booster Gigantamax Centiskorch.jpg"],
    "swsh6": ["SWSH6 Booster Ice Rider Calyrex copy.jpg", "SWSH6 Booster Shadow Rider Calyrex copy.jpg",
              "SWSH6 Booster Galarian Articuno copy.jpg", "SWSH6 Booster Galarian Moltres copy.jpg",
              "SWSH6 Booster Galarian Zapdos copy.jpg"],
    "swsh8": ["SWSH8 Booster Gigantamax Gengar.jpg", "SWSH8 Booster Mew.jpg", "SWSH8 Booster Genesect.jpg",
              "SWSH8 Booster Boltund.jpg"],
    "swsh10": ["SWSH10 Booster Origin Dialga.jpg", "SWSH10 Booster Origin Palkia.jpg",
               "SWSH10 Booster Hisuian Decidueye.jpg", "SWSH10 Booster Hisuian Samurott.jpg",
               "SWSH10 Booster Hisuian Typhlosion.jpg"],
    "swsh10.5": ["Pok\u00e9mon GO Booster.jpg"],
}
# A set TCGdex has no logo for gets one from here (fetch-cards leaves it out).
LOGOS = {"30th": "30th Anniversary logo.png", "sv05": "SV5 Logo EN.png"}
LOGO_W = 400
PACK_W = 300          # shown at most ~230px wide, twice that on a dense screen is wasted here
BACK_W = 490
CARD_MAX = 40 * 1024     # check.mjs's ceiling on a card image
CARD_W = 245          # TCGdex's `low` card width, what every other card ships at


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def original(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name.replace(" ", "_"))
    if not os.path.exists(path):
        q = urllib.parse.urlencode({"action": "query", "titles": "File:" + name, "prop": "imageinfo",
                                    "iiprop": "url", "format": "json"})
        page = next(iter(json.loads(get(f"{API}?{q}"))["query"]["pages"].values()))
        if "imageinfo" not in page:
            raise SystemExit(f"Bulbagarden has no {name}")
        open(path, "wb").write(get(page["imageinfo"][0]["url"]))
    return Image.open(path)


def save(img, width, out):
    img = img.convert("RGBA")
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(out, "WEBP", quality=86, method=6)
    return os.path.getsize(out)


def main():
    index = open(os.path.join(ROOT, "src", "data", "cards", "index.js"), encoding="utf-8").read()
    shipped = json.loads(re.search(r"CARD_SETS = (\[.*\]);", index).group(1))
    os.makedirs(os.path.join(ROOT, "public", "cards"), exist_ok=True)
    print("back.webp", save(original(BACK), BACK_W, os.path.join(ROOT, "public", "cards", "back.webp")), "bytes")
    art = {}
    for s in shipped:
        # A card fetch-cards could only get as a png: the webp the rest are, at their size.
        folder = os.path.join(ROOT, "public", "cards", s["id"])
        for f in [f for f in os.listdir(folder) if f.endswith(".png")]:
            png = os.path.join(folder, f)
            print(s["id"], f, "->", save(Image.open(png), CARD_W, png[:-4] + ".webp"), "bytes")
            os.remove(png)
        # A card over check.mjs's 40KB (Black Bolt's Seismitoad, 2026-10-07) is re-encoded smaller.
        for f in [f for f in os.listdir(folder) if re.fullmatch(r"[\w-]+\.webp", f) and not f.startswith(("pack-", "logo"))]:
            path = os.path.join(folder, f)
            if os.path.getsize(path) > CARD_MAX:
                Image.open(path).convert("RGBA").save(path, "WEBP", quality=70, method=6)
                print(s["id"], f, "re-encoded", os.path.getsize(path), "bytes")
        names = WRAPPERS.get(s["id"])
        if not names:
            raise SystemExit(f"{s['id']} has no wrapper art listed - add it to WRAPPERS")
        if s["id"] in LOGOS:
            print(s["id"], "logo.webp", save(original(LOGOS[s["id"]]), LOGO_W, os.path.join(ROOT, "public", "cards", s["id"], "logo.webp")), "bytes")
        art[s["id"]] = []
        for name in names:
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower().rsplit(".", 1)[0].split("booster", 1)[-1]).strip("-") or "pack"
            out = os.path.join(ROOT, "public", "cards", s["id"], f"pack-{slug}.webp")
            print(s["id"], slug, save(original(name), PACK_W, out), "bytes")
            art[s["id"]].append(slug)
    with open(os.path.join(ROOT, "src", "data", "cards", "art.js"), "w", encoding="utf-8", newline="\r\n") as f:
        f.write("/* GENERATED by tools/fetch_card_art.py (npm run cards) - each set's booster\n"
                "   wrappers (public/cards/<set>/pack-<slug>.webp). Cosmetic: no roll reads it. */\n"
                f"export const WRAPPERS = {json.dumps(art)};\n")


if __name__ == "__main__":
    main()
