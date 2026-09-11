"""Download community tilesets.  python tools/fetch_tilesets.py

Pulls the full-resolution PNG behind a DeviantArt art page into
.assets-src/community/. Those pages embed a signed download URL in their HTML;
we read it out rather than scraping the displayed (cropped, downscaled) preview.

Everything here is published for non-commercial fan-game use. Most of it
requires crediting the artist — the CREDIT column below is copied from the
source directory, and every ☆ entry must be listed in the README before it
ships. Check the artist's own page too: some add their own conditions.
"""

import io
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, ".assets-src", "community")

UA = {"User-Agent": "Mozilla/5.0 (compatible; tileset-fetch/1.0)"}

# name, page url, artist, credit required?
WANTED = [
    ("helidor_ground", "https://www.deviantart.com/thedeadheroalistair/art/Project-Helidor-Ground-Megaset-903477198",
     "TheDeadHeroAlistair", True),
    ("rock_v01", "https://www.deviantart.com/j-treecko252/art/Rock-Tiles-Ver-01-884759152",
     "J-Treecko252", True),
    ("rock_v05", "https://www.deviantart.com/j-treecko252/art/Rock-Tiles-Ver-05-884759178",
     "J-Treecko252", True),
    ("water_anim", "https://www.deviantart.com/magiscarf/art/Water-Animation-689684144",
     "Magiscarf", False),
    ("water_anim_next", "https://www.deviantart.com/magiscarf/art/Next-Animated-Water-Tiles-830567034",
     "Magiscarf", False),
    ("tree_v01", "https://www.deviantart.com/j-treecko252/art/Tree-Tiles-Ver-01-884751004",
     "J-Treecko252", True),
    ("tree_v10", "https://www.deviantart.com/j-treecko252/art/Tree-Tiles-Ver-10-884751060",
     "J-Treecko252", True),
    ("all_cliffs", "https://www.deviantart.com/ekat99/art/All-Cliffs-887616852",
     "Ekat99", True),
    ("pond_bridge", "https://www.deviantart.com/ekat99/art/Pond-And-Bridge-875478552",
     "Ekat99", True),
]


def full_res_url(page_html):
    """The download URL is the wixmp link with no /v1/ transform in its path."""
    for url in re.findall(r'https://images-wixmp[^"\\\s]+', page_html):
        if "/v1/" not in url:
            return url.replace("&amp;", "&")
    return None


# Animated water is published as a GIF, not a sheet. Accept both and keep the
# real extension so it stays obvious which ones need frames pulling out.
MAGIC = ((b"\x89PNG", "png"), (b"GIF8", "gif"))


def kind(data):
    for magic, ext in MAGIC:
        if data.startswith(magic):
            return ext
    return None


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


if __name__ == "__main__":
    os.makedirs(DEST, exist_ok=True)
    for name, page, artist, credit in WANTED:
        if any(os.path.exists(os.path.join(DEST, name + "." + e))
               for _m, e in MAGIC):
            print("  have    %s" % name)
            continue
        try:
            html = get(page).decode("utf-8", "replace")
            url = full_res_url(html)
            if not url:
                print("  NO URL  %s (page layout changed?)" % name)
                continue
            data = get(url)
            ext = kind(data)
            if not ext:
                print("  UNKNOWN %-16s not an image (%r)" % (name, data[:8]))
                continue
            io.open(os.path.join(DEST, name + "." + ext), "wb").write(data)
            print("  saved   %-16s %6d bytes  .%-3s %s%s"
                  % (name, len(data), ext, artist,
                     "  [CREDIT REQUIRED]" if credit else ""))
        except Exception as exc:
            print("  FAILED  %-16s %s" % (name, exc))
    print("\n-> .assets-src/community/  (not shipped; source art only)")
