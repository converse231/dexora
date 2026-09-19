"""Build the game's art from source sheets.  python tools/build_assets.py

Produces, into public/:
  tilesets/route.png   + route.json    the FireRed metatile atlas (640 x 16x16 tiles)
  tilesets/player.png  + player.json   the player walk cycle, background keyed out
  battle/<area>.png                   the floor each area fights on

Sources live in .assets-src/ and are fetched from the pret/pokefirered
decompilation, except the player sheet which you supply. Requires Pillow.

Gen 3 tile format, for anyone reading this later: an 8x8 tile is an index into a
16-colour palette; a 16x16 "metatile" is 8 of those, 4 on a bottom layer and 4 on
a transparent top layer, each entry packing tile id, flip bits and palette id.
We flatten all that once, here, so the game only ever does drawImage.
"""

import io
import json
import os
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, ".assets-src")
PUB = os.path.join(ROOT, "public")
RAW = "https://raw.githubusercontent.com/pret/pokefirered/master"

PLAYER_SHEET = (
    "Game Boy Advance - Pokemon FireRed _ LeafGreen "
    "- Playable Characters - Player Sprites.png"
)


def fetch(rel, dest, root=None):
    """Download a file from a decomp once and cache it in .assets-src/."""
    path = os.path.join(SRC, dest)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        urllib.request.urlretrieve(f"{root or RAW}/{rel}", path)
        print("  fetched", dest)
    return path


def read_pal(path):
    """JASC-PAL -> (n, 3) uint8."""
    nums = [int(x) for x in io.open(path).read().split()[3:]]
    return np.array(nums, dtype=np.uint8).reshape(-1, 3)


def cut_tiles(img):
    """An indexed tile sheet -> (n, 8, 8) of palette indices."""
    a = np.array(img)
    tw = a.shape[1] // 8
    n = (a.shape[0] // 8) * tw
    out = np.zeros((n, 8, 8), np.uint8)
    for t in range(n):
        ty, tx = divmod(t, tw)
        out[t] = a[ty * 8:ty * 8 + 8, tx * 8:tx * 8 + 8]
    return out


def blit(dst, tiles, pals, entry, ox, oy, keyed):
    tid = entry & 0x03FF
    if tid >= len(tiles):
        return
    t = tiles[tid]
    if (entry >> 10) & 1:
        t = t[:, ::-1]
    if (entry >> 11) & 1:
        t = t[::-1, :]
    pal = min((entry >> 12) & 0x0F, len(pals) // 16 - 1)
    rgb = pals[pal * 16 + t]
    px = np.concatenate([rgb, np.full(t.shape + (1,), 255, np.uint8)], axis=2)
    if keyed:                      # index 0 is transparent on overlay layers
        m = t != 0
        dst[oy:oy + 8, ox:ox + 8][m] = px[m]
    else:
        dst[oy:oy + 8, ox:ox + 8] = px


# ------------------------------------------------------- secondary tilesets
# Gen 3 splits a map's art in two: a primary tileset shared by every outdoor map
# (grass, trees, water, paths) and a secondary that gives the place its identity.
# Metatile ids 0-639 come from the primary, 640+ from the secondary; inside a
# metatile, tile ids follow the same split, and the secondary supplies palettes
# 7-15 while the primary keeps 0-6. Decoding them is the same job twice.
NUM_PRIMARY_TILES = 640

# The ones that give a biome an unmistakable identity at a glance, each with the
# primary tileset the real maps pair it with.
#
# This pairing is not decoration. A Gen 3 metatile takes palettes 0-6 and any
# tile id below 640 from the *primary*, so rendering a secondary against the
# wrong one silently recolours it: Power Plant and Pokemon Tower are Building
# maps, and baking them against General washed every crate and barrel in them
# to grey. Checked against layouts.json rather than assumed.
SECONDARY = [("mt_ember", "general"), ("seafoam_islands", "general"),
             ("power_plant", "building"), ("pokemon_tower", "building"),
             ("cave", "general"), ("viridian_forest", "general"),
             ("pokemon_mansion", "building")]

# FireRed PRIMARIES we bake WHOLE, for the same reason `EM_PRIMARY` exists one
# decomp over: ids 0-639 in this atlas are `gTileset_General`, and a map drawn
# against a different primary reaches its metatiles directly. The Pokemon
# Mansion is the first map here that has needed it - **748 of its 4,973
# metatiles are primary** - and left alone every one of them would have drawn
# grass, trees or sand inside a burnt-out house.
FR_PRIMARY = ["building"]

# FireRed has no molten tile anywhere. Mt Ember's Ruby Path is dry rock, and the
# gold that a colour sweep finds in the Sevii set is the Ember Spa's water, not
# lava. So the volcano is built from a second decomp: pokeemerald's Lavaridge,
# which is the tileset behind Magma Hideout - the map Ember Caldera is after.
EMERALD = "https://raw.githubusercontent.com/pret/pokeemerald/master"
EM_SECONDARY = [("lavaridge", "general"), ("lilycove", "general")]

# pokeemerald PRIMARIES we bake WHOLE, because a map drawn against one
# references its metatiles directly and ours are somebody else's. Ids 0-639
# here are FIRERED's General; Emerald ships a tileset with the same name, the
# same job and entirely different art, so it needs its own block. The Safari
# Zone is 140 of its 189 metatiles, which is why this exists.
EM_PRIMARY = ["general"]

# Emerald's own constants, and neither matches FireRed's. Get the tile split
# wrong and every secondary metatile picks tiles 128 slots off; get the palette
# split wrong and the whole sheet comes out in the wrong colours. Both failures
# render as plausible-looking stripes rather than as an error.
EM_PRIMARY_TILES = 512      # NUM_TILES_IN_PRIMARY   (FireRed: 640)
EM_PRIMARY_PALS = 6         # NUM_PALS_IN_PRIMARY    (FireRed: 7)


def load_emerald(name, prim):
    """One pokeemerald secondary, resolved against its own primary."""
    def em(rel, dest):
        return fetch(rel, dest, root=EMERALD)

    def pals_of(rel, pref):
        return np.concatenate([read_pal(em(f"{rel}/palettes/{i:02d}.pal",
                                           f"{pref}/{i:02d}.pal")) for i in range(16)])

    prel, srel = f"data/tilesets/primary/{prim}", f"data/tilesets/secondary/{name}"
    ptiles = cut_tiles(Image.open(em(f"{prel}/tiles.png", f"em/{prim}/tiles.png")))
    stiles = cut_tiles(Image.open(em(f"{srel}/tiles.png", f"em/{name}/tiles.png")))

    tiles = np.zeros((EM_PRIMARY_TILES + len(stiles), 8, 8), np.uint8)
    tiles[:min(EM_PRIMARY_TILES, len(ptiles))] = ptiles[:EM_PRIMARY_TILES]
    tiles[EM_PRIMARY_TILES:] = stiles
    pals = np.concatenate([pals_of(prel, f"em/{prim}/palettes")[: EM_PRIMARY_PALS * 16],
                           pals_of(srel, f"em/{name}/palettes")[EM_PRIMARY_PALS * 16:]])
    mt = np.frombuffer(io.open(em(f"{srel}/metatiles.bin", f"em/{name}/metatiles.bin"),
                               "rb").read(), dtype="<u2").reshape(-1, 8)
    return mt, tiles, pals


def load_emerald_primary(prim):
    """A pokeemerald PRIMARY tileset's own metatiles, tiles and palettes.

    `load_emerald` resolves a SECONDARY against its primary; this is the other
    half. A primary metatile only ever reaches its own tiles and palettes 0-5,
    so there is nothing to stack and nothing to splice."""
    def em(rel, dest):
        return fetch(rel, dest, root=EMERALD)

    prel = f"data/tilesets/primary/{prim}"
    tiles = cut_tiles(Image.open(em(f"{prel}/tiles.png", f"em/{prim}/tiles.png")))
    pals = np.concatenate([read_pal(em(f"{prel}/palettes/{i:02d}.pal",
                                       f"em/{prim}/palettes/{i:02d}.pal"))
                           for i in range(16)])
    mt = np.frombuffer(io.open(em(f"{prel}/metatiles.bin", f"em/{prim}/metatiles.bin"),
                               "rb").read(), dtype="<u2").reshape(-1, 8)
    return mt, tiles, pals


def load_pals(base_rel, cache_prefix):
    return np.concatenate([
        read_pal(fetch(f"{base_rel}/palettes/{i:02d}.pal", f"{cache_prefix}/{i:02d}.pal"))
        for i in range(16)
    ])


def render_metatiles(mt, tiles, pals, cols=16, layers=((0, False), (4, True))):
    """metatiles.bin + tiles + palettes -> an RGBA sheet, `cols` metatiles wide.

    `layers` is what makes the same call serve both atlases: the default is a
    composite of both, and `((4, True),)` alone is the upper layer on its own -
    the half that draws over sprites. See the note in build_tileset()."""
    rows = (len(mt) + cols - 1) // cols
    out = np.zeros((rows * 16, cols * 16, 4), np.uint8)
    for i, m in enumerate(mt):
        my, mx = divmod(i, cols)
        for layer, keyed in layers:
            for q in range(4):
                qy, qx = divmod(q, 2)
                blit(out, tiles, pals, int(m[layer + q]),
                     mx * 16 + qx * 8, my * 16 + qy * 8, keyed)
    return out


TOP_ONLY = ((4, True),)

# Which BG layers a metatile uses. pokefirered packs it in bits 29-30 of a
# 4-byte attribute (METATILE_ATTR_LAYER_MASK 0x60000000); pokeemerald uses a
# 2-byte attribute and bits 12-15. Same three values either way:
#   0 NORMAL   middle + top      - the top half draws ABOVE sprites
#   1 COVERED  bottom + middle   - BOTH halves draw below sprites
#   2 SPLIT    bottom + top      - the top half draws above sprites
LAYER_COVERED = 1


def layer_types(rel, n, cache, root=None, u32=True):
    try:
        b = io.open(fetch(f"{rel}/metatile_attributes.bin", cache, root=root), "rb").read()
    except Exception:
        return None                       # no attributes: treat nothing as covered
    if u32:
        return ((np.frombuffer(b, dtype="<u4")[:n] >> 29) & 3)
    return ((np.frombuffer(b, dtype="<u2")[:n] >> 12) & 0xF)


def overhang_sheet(mt, tiles, pals, cols, lay):
    """The upper layer on its own - but only where it is really an overhang.

    Two gates, and the second one is a guard rather than a rule of the hardware:

      COVERED says so itself. Those metatiles put both halves below the sprite,
      which is how you stand in FRONT of a drum rather than inside it. 44 of the
      Power Plant's 153 are covered, the drums and terminals among them.

      A FULLY OPAQUE UPPER LAYER IS NOT AN OVERHANG. Some metatiles draw the
      same tile on both halves - the Power Plant's floor local 34 does, 123
      times - and painting that back over the trainer does not put him behind
      anything, it deletes him. Whatever the hardware does with those, a layer
      that covers every pixel of its own tile cannot be the half you walk
      behind, so it is dropped. 28 more of the Power Plant's go this way and
      what is left is 52: the generator domes, the machine overhangs, the tops
      of the tall consoles."""
    out = render_metatiles(mt, tiles, pals, cols, TOP_ONLY)
    hides = []
    for i in range(len(mt)):
        my, mx = divmod(i, cols)
        cell = out[my * 16:my * 16 + 16, mx * 16:mx * 16 + 16]
        covered = lay is not None and lay[i] == LAYER_COVERED
        # HIDES = it draws above the sprite AND leaves no pixel of it showing.
        # Both halves matter, and leaving the first one out is what swept up
        # Route 1's flower bed: general metatile 4 also draws the same art
        # twice, but it is COVERED, so both halves are UNDER the trainer and
        # you can stand in the flowers exactly as you would expect to.
        full = bool((cell[:, :, 3] > 0).all())
        if full and not covered:
            hides.append(i)
        if covered or full:
            cell[:] = 0
    return out, hides


def append_rows(arr, block):
    """Stack `block` under `arr`. Both atlases grow through this, in lockstep -
    if one ever gains rows the other does not, every id past that point maps to
    the wrong overlay and nothing says so."""
    out = np.zeros((arr.shape[0] + block.shape[0], arr.shape[1], 4), np.uint8)
    out[:arr.shape[0]] = arr
    out[arr.shape[0]:] = block
    return out


def blank_like(block):
    """An empty overlay for a block of synthetic tiles - boulders, bridge planks
    and the two hand-baked crowns. Nothing composited by hand has an upper
    layer to give back, and a hole in the top atlas is a silent id shift."""
    return np.zeros_like(block)


def load_secondary(name, prim_tiles, prim_pals):
    """Returns (metatile array, tiles, palettes) for one secondary tileset."""
    rel = f"data/tilesets/secondary/{name}"
    png = fetch(f"{rel}/tiles.png", f"sec/{name}/tiles.png")
    binf = fetch(f"{rel}/metatiles.bin", f"sec/{name}/metatiles.bin")
    sec_tiles = cut_tiles(Image.open(png))

    # Tile ids below 640 index the primary sheet, so stack them into one array.
    tiles = np.zeros((NUM_PRIMARY_TILES + len(sec_tiles), 8, 8), np.uint8)
    tiles[:len(prim_tiles)] = prim_tiles[:NUM_PRIMARY_TILES]
    tiles[NUM_PRIMARY_TILES:] = sec_tiles

    sec_pals = load_pals(rel, f"sec/{name}/palettes")
    pals = np.concatenate([prim_pals[: 7 * 16], sec_pals[7 * 16:]])

    mt = np.frombuffer(io.open(binf, "rb").read(), dtype="<u2").reshape(-1, 8)
    return mt, tiles, pals


def load_primary(prim):
    """A pokefirered PRIMARY tileset's own metatiles, tiles and palettes.

    `load_secondary` resolves a secondary AGAINST its primary; this is the
    other half, and it is simpler: a primary metatile only ever reaches its own
    tiles and palettes 0-6, so there is nothing to stack and nothing to splice.
    The pokeemerald twin is `load_emerald_primary`."""
    rel = f"data/tilesets/primary/{prim}"
    tiles = cut_tiles(Image.open(fetch(f"{rel}/tiles.png", f"pri/{prim}/tiles.png")))
    pals = load_pals(rel, f"pri/{prim}/palettes")
    mt = np.frombuffer(io.open(fetch(f"{rel}/metatiles.bin",
                                     f"pri/{prim}/metatiles.bin"), "rb").read(),
                       dtype="<u2").reshape(-1, 8)
    return mt, tiles, pals


# --------------------------------------------------------------- map tileset

def build_tileset():
    base = "data/tilesets/primary/general"
    tiles_png = fetch(f"{base}/tiles.png", "tiles.png")
    meta_bin = fetch(f"{base}/metatiles.bin", "metatiles.bin")
    pal_files = [fetch(f"{base}/palettes/{i:02d}.pal", f"palettes/{i:02d}.pal")
                 for i in range(16)]

    pals = np.concatenate([read_pal(p) for p in pal_files])   # (256, 3)
    tiles = cut_tiles(Image.open(tiles_png))
    mt = np.frombuffer(io.open(meta_bin, "rb").read(), dtype="<u2").reshape(-1, 8)

    cols = 16
    rows = (len(mt) + cols - 1) // cols
    atlas = np.zeros((rows * 16, cols * 16, 4), np.uint8)
    # THE SAME SHEET AGAIN, TOP LAYER ONLY, AT IDENTICAL IDS.
    #
    # A Gen 3 metatile has two layers and the keyed one draws OVER sprites -
    # that is how a trainer walks behind a tree top, and it is not a special
    # case: 1,360 of the metatiles we bake have one. This atlas composites both
    # into one image, which is what makes `drawTile` a single blit, and the
    # cost is that everything with an upper layer draws UNDER the player.
    #
    # Reported from play on the transcribed Power Plant - a trainer standing on
    # top of the machinery he should have been passing behind. 211 of its tiles
    # are walkable with an upper layer (the machine tops, the generator domes,
    # the terminals), and 527 more are solid ones whose upper half his head
    # reaches into.
    #
    # A PARALLEL IMAGE AT THE SAME IDS, rather than an appended block and a
    # lookup table. There is nothing to map: id n in route_top.png is the upper
    # layer of id n in route.png, so the overlay pass needs no rule, no dict and
    # no second copy of anything. It is almost entirely transparent, so it costs
    # little on disk, and it makes `forest.fringeTop` and `tree.tipTop`
    # redundant - both are this, hand-baked for one tile each.
    for i, m in enumerate(mt):
        my, mx = divmod(i, cols)
        for layer, keyed in ((0, False), (4, True)):
            for q in range(4):
                qy, qx = divmod(q, 2)
                blit(atlas, tiles, pals, int(m[layer + q]),
                     mx * 16 + qx * 8, my * 16 + qy * 8, keyed)
    top, hides_here = overhang_sheet(mt, tiles, pals, cols,
                                 layer_types(base, len(mt), "general-attr.bin"))
    hiding_ids = list(hides_here)                      # the primary starts at id 0

    # Community boulders, composited over our own rocky ground and appended as
    # extra atlas rows. Keeping them in the same atlas means one image, one
    # drawImage path and no renderer changes - they are just higher tile ids.
    # Source: Ekat99's "All Cliffs" (non-commercial, credit required).
    boulder_ids = []
    cliffs = os.path.join(SRC, "community", "all_cliffs.png")
    if os.path.exists(cliffs):
        sheet = np.array(Image.open(cliffs).convert("RGBA"))
        ground = atlas[217 // cols * 16:(217 // cols) * 16 + 16,
                       (217 % cols) * 16:(217 % cols) * 16 + 16]
        picks = [(c, r) for r in (8, 9, 10, 11) for c in (0, 1, 2)]
        extra_rows = (len(picks) + cols - 1) // cols
        grown = np.zeros((atlas.shape[0] + extra_rows * 16, atlas.shape[1], 4), np.uint8)
        grown[:atlas.shape[0]] = atlas
        base_id = (atlas.shape[0] // 16) * cols
        for n, (cx, cy) in enumerate(picks):
            tile = sheet[cy * 16:cy * 16 + 16, cx * 16:cx * 16 + 16]
            if tile.shape[:2] != (16, 16) or not (tile[:, :, 3] > 0).any():
                continue
            out = ground.copy()
            a = tile[:, :, 3:4].astype(float) / 255.0
            out[:, :, :3] = (tile[:, :, :3] * a + out[:, :, :3] * (1 - a)).astype(np.uint8)
            out[:, :, 3] = 255
            tid = base_id + len(boulder_ids)
            my, mx = divmod(tid, cols)
            grown[my * 16:my * 16 + 16, mx * 16:mx * 16 + 16] = out
            boulder_ids.append(tid)
        top = append_rows(top, blank_like(grown[atlas.shape[0]:]))
        atlas = grown
        print("  boulders  %d tiles at ids %s (Ekat99)" % (len(boulder_ids), boulder_ids[:4] + ["..."]))

    # Each secondary tileset is appended whole, on a row boundary, so a tile is
    # just base + its local index. One atlas, one drawImage path, no renderer
    # changes - a fire biome is only a different set of tile numbers.
    sets = {}
    primaries = {"general": (tiles, pals)}
    for name, prim in SECONDARY:
        if prim not in primaries:
            primaries[prim] = (
                cut_tiles(Image.open(fetch(
                    f"data/tilesets/primary/{prim}/tiles.png", f"{prim}-tiles.png"))),
                load_pals(f"data/tilesets/primary/{prim}", f"{prim}-palettes"))
        ptiles, ppals = primaries[prim]
        smt, stiles, spals = load_secondary(name, ptiles, ppals)
        sheet = render_metatiles(smt, stiles, spals, cols)
        base = (atlas.shape[0] // 16) * cols
        atlas = append_rows(atlas, sheet)
        sheet_top, hides_here = overhang_sheet(
            smt, stiles, spals, cols,
            layer_types(f"data/tilesets/secondary/{name}", len(smt),
                        f"sec/{name}/attr.bin"))
        top = append_rows(top, sheet_top)
        hiding_ids += [base + i for i in hides_here]
        sets[name] = base
        print("  %-18s %3d metatiles at base %d  (on %s)"
              % (name, len(smt), base, prim))

    for name, prim in EM_SECONDARY:
        smt, stiles, spals = load_emerald(name, prim)
        sheet = render_metatiles(smt, stiles, spals, cols)
        base = (atlas.shape[0] // 16) * cols
        atlas = append_rows(atlas, sheet)
        # pokeemerald's attributes are two bytes wide, not four.
        sheet_top, hides_here = overhang_sheet(
            smt, stiles, spals, cols,
            layer_types(f"data/tilesets/secondary/{name}", len(smt),
                        f"em/{name}/attr.bin", root=EMERALD, u32=False))
        top = append_rows(top, sheet_top)
        hiding_ids += [base + i for i in hides_here]
        sets[name] = base
        print("  %-18s %3d metatiles at base %d  (pokeemerald, on %s)"
              % (name, len(smt), base, prim))

    for prim in FR_PRIMARY:
        pmt, ptiles, ppals = load_primary(prim)
        base = (atlas.shape[0] // 16) * cols
        atlas = append_rows(atlas, render_metatiles(pmt, ptiles, ppals, cols))
        sheet_top, hides_here = overhang_sheet(
            pmt, ptiles, ppals, cols,
            layer_types(f"data/tilesets/primary/{prim}", len(pmt),
                        f"pri/{prim}/attr.bin"))
        top = append_rows(top, sheet_top)
        hiding_ids += [base + i for i in hides_here]
        sets["fr_" + prim] = base
        print("  fr_%-15s %3d metatiles at base %d  (pokefirered primary)"
              % (prim, len(pmt), base))

    for prim in EM_PRIMARY:
        pmt, ptiles, ppals = load_emerald_primary(prim)
        base = (atlas.shape[0] // 16) * cols
        atlas = append_rows(atlas, render_metatiles(pmt, ptiles, ppals, cols))
        sheet_top, hides_here = overhang_sheet(
            pmt, ptiles, ppals, cols,
            layer_types(f"data/tilesets/primary/{prim}", len(pmt),
                        f"em/{prim}/attr.bin", root=EMERALD, u32=False))
        top = append_rows(top, sheet_top)
        hiding_ids += [base + i for i in hides_here]
        sets["em_" + prim] = base
        print("  em_%-15s %3d metatiles at base %d  (pokeemerald primary)"
              % (prim, len(pmt), base))

    # Bridges. We had been using the sea pier for these, which is a jetty, not a
    # bridge - and its outer ring is drawn to meet sand, so it brought a green
    # fringe with it over lava.
    #
    # Route 12's bridge is a real one, and the useful part is that its planks
    # are the metatile's TOP layer - the colour-keyed one that in Gen 3 draws
    # over whatever is beneath it. So they lift straight off the water they were
    # drawn on and can be composited over something else. That is the only
    # honest way to get a bridge over lava: no Gen 3 game has one, so there is
    # no such tile to go and find, and this at least is real FireRed art rather
    # than a plank drawn by us.
    #
    # 755/757 are the two columns of a north-south bridge and 764/772 the two
    # rows of an east-west one. Either way the planks lie across the way you
    # walk, which is what stops a bridge reading as a raft.
    bmt, btiles, bpals = load_secondary("lavender_town", tiles, pals)
    BRIDGE_PARTS = {"vert": (755, 757), "horz": (764, 772)}

    def bake_bridges(over_id):
        """The plank layer over one of our own tiles. Returns {vert:[], horz:[]}."""
        baked, out = [], {}
        oy, ox = (over_id // cols) * 16, (over_id % cols) * 16
        for key, gids in BRIDGE_PARTS.items():
            ids = []
            for gid in gids:
                tile = atlas[oy:oy + 16, ox:ox + 16].copy()
                for q in range(4):
                    qy, qx = divmod(q, 2)
                    blit(tile, btiles, bpals, int(bmt[gid - 640][4 + q]),
                         qx * 8, qy * 8, True)
                ids.append(len(baked))
                baked.append(tile)
            out[key] = ids
        return out, baked

    bridges, bridge_tiles = {}, []
    for name, over in (("lava", sets["lavaridge"] + 189),
                       ("ice", sets["seafoam_islands"] + 141)):
        got, made = bake_bridges(over)
        base = (atlas.shape[0] // 16) * cols + len(bridge_tiles)
        bridges[name] = {k: [base + i for i in v] for k, v in got.items()}
        bridge_tiles += made
    rows_needed = (len(bridge_tiles) + cols - 1) // cols
    grown = np.zeros((atlas.shape[0] + rows_needed * 16, atlas.shape[1], 4), np.uint8)
    grown[:atlas.shape[0]] = atlas
    first = (atlas.shape[0] // 16) * cols
    for i, tile in enumerate(bridge_tiles):
        my, mx = divmod(first + i, cols)
        grown[my * 16:my * 16 + 16, mx * 16:mx * 16 + 16] = tile
    top = append_rows(top, blank_like(grown[atlas.shape[0]:]))
    atlas = grown
    print("  bridges   %d tiles at ids %d.. (Route 12 planks, re-based)"
          % (len(bridge_tiles), first))

    # One synthetic tile to finish the job: the canopy overhang's upper layer
    # on its own. A Gen 3 metatile has two layers and the keyed one draws over
    # sprites, which is exactly how the real game lets a trainer walk behind a
    # tree top. This atlas composites both layers into one image, so the
    # overhang needs its leaves a second time, to paint back over the player
    # once he has been drawn. Appended on a row boundary like everything else.
    fmt, ftiles, fpals = load_secondary("viridian_forest", tiles, pals)  # General
    fringe_top = (atlas.shape[0] // 16) * cols
    grown = np.zeros((atlas.shape[0] + 16, atlas.shape[1], 4), np.uint8)
    grown[:atlas.shape[0]] = atlas
    for q in range(4):
        qy, qx = divmod(q, 2)
        blit(grown, ftiles, fpals, int(fmt[1][4 + q]),
             qx * 8, atlas.shape[0] + qy * 8, True)
    top = append_rows(top, blank_like(grown[atlas.shape[0]:]))
    atlas = grown
    print("  overhang  leaves-only tile at id %d" % fringe_top)

    # THE CONIFER'S CROWN, the same trick again and from the PRIMARY this time.
    # General's metatile 14/15 is the top of the ordinary route tree and its
    # collision bit is ZERO in every FireRed map: you walk behind it, exactly as
    # you walk behind the forest fringe. A transcribed map carries those ids, so
    # it needs their upper layer back or the overhang pass has only one piece to
    # reach for and paints Viridian Forest's round canopy over a conifer - which
    # is how Route 1 first rendered, with every tree in the map decapitated.
    # Two halves rather than one tile: a conifer is two columns wide.
    tip_top = (atlas.shape[0] // 16) * cols
    grown = np.zeros((atlas.shape[0] + 16, atlas.shape[1], 4), np.uint8)
    grown[:atlas.shape[0]] = atlas
    for k, i in enumerate((14, 15)):
        for q in range(4):
            qy, qx = divmod(q, 2)
            blit(grown, tiles, pals, int(mt[i][4 + q]),
                 k * 16 + qx * 8, atlas.shape[0] + qy * 8, True)
    top = append_rows(top, blank_like(grown[atlas.shape[0]:]))
    atlas = grown
    print("  tree top  conifer crowns at ids %d,%d" % (tip_top, tip_top + 1))

    def sec(name, *local):
        return [sets[name] + i for i in local]

    os.makedirs(os.path.join(PUB, "tilesets"), exist_ok=True)
    Image.fromarray(atlas, "RGBA").save(os.path.join(PUB, "tilesets", "route.png"))
    assert top.shape == atlas.shape, \
        f"the overlay atlas is {top.shape} against the atlas's {atlas.shape} - " \
        "every id past the first mismatch would draw the wrong upper layer"
    Image.fromarray(top, "RGBA").save(os.path.join(PUB, "tilesets", "route_top.png"))

    # Metatile ids read off a real FireRed map rather than picked by eye:
    # data/layouts/Route1/map.bin was decoded and its tile usage counted, so
    # these are literally the tiles the game itself lays down.
    #   grass  the six ground variants Route 1 mixes
    #   tall   one uniform tile (13) - the only tall grass the real map uses
    #   tree   2 wide x 3 tall: walkable tip, body, base with the trunk
    #   path   a 3x3 autotile, corners and edges included
    meta = {
        "tileSize": 16,
        "atlasCols": cols,
        # Metatile 4 is the flower clump. It is kept OUT of the random ground
        # pool and placed by hand from the map instead - scattered at one in six
        # tiles it carpets the route, where the real Route 1 uses it at ~3%.
        "tiles": {"grass": [1, 8, 9, 16, 17], "tall": [13],
                  "flower": [4], "water": [299],
                  # Route 4's rocky ground, its cliff face, and the walkable
                  # grass bank that forms a pond's near edge.
                  "rock": [217], "wall": boulder_ids or [179], "bank": [307],
                  # Ground and wall for each themed biome. Every id below was
                  # read off a real map that uses that tileset, rendered big and
                  # checked by eye before being written down - see
                  # tools/study_tiles.py, which draws the actual FireRed map and
                  # a labelled sheet of the ids it uses. Lowercase key =
                  # walkable ground, uppercase = solid.
                  #
                  # The rule these have to obey: a solid id must be a *prop* -
                  # something that looks like an obstacle standing on its own.
                  # The most-used blocked metatile on a real map is usually the
                  # middle of a wall, which tiles into bands, and twice here it
                  # was a plain floor tile, which reads as an invisible wall.
                  "ember": sec("mt_ember", 124, 132, 116),
                  # Red rock faces. They have no standalone boulder, so the
                  # generator places these in 2x2 outcrops - see build_map.py.
                  "emberWall": sec("mt_ember", 68, 71, 70),
                  "ice": sec("seafoam_islands", 1, 89),
                  # 17 was in here and is a plain ice floor: Frost Hollow had
                  # invisible walls. These four are all real ice boulders.
                  "iceWall": sec("seafoam_islands", 25, 2, 3, 39),
                  "plant": sec("power_plant", 31, 31, 31, 34),
                  # 21 was in here and is the striped top edge of a machine
                  # wall, which tiled into the horizontal bands across the
                  # floor. Rubble, a barrel and a console instead.
                  "plantWall": sec("power_plant", 54, 53, 89, 13),
                  # The Tower's floor really is the green diamond carpet; local
                  # 1 is a black void tile, so it is not a lighter alternative.
                  "tower": sec("pokemon_tower", 2, 4, 14),
                  "towerWall": sec("pokemon_tower", 1, 32, 24)},
        # `tipTop` is the crown's upper layer alone, for a copied map that walks
        # behind one - see the bake above. Index it by (real id - 14).
        "tree": {"tip": [14, 15], "bodyA": [30, 31], "bodyB": [22, 23],
                 "base": [36, 37], "tipTop": [tip_top, tip_top + 1]},
        # The Viridian Forest canopy, which is nothing like the primary
        # tileset's conifer: a round crown three tiles wide, and a column of
        # them shares its canopy so only the lowest shows a trunk. Counting
        # ViridianForest's own map.bin is what gives the shape away - the two
        # crown rows are used ~270 times each and the trunk and shadow rows
        # only ~45, because they appear once per column rather than per tree.
        # Reading whole columns out of the map settles the order as well as the
        # ids. Every column is one of two shapes:
        #   8! 16! 24! 16! 24! ... 32! 35!    a wall that caps itself
        #   1  25! 17! 25!     ... 33! 36!    a wall you can walk behind
        # (! is the collision bit). In the second, local 1 is the only canopy
        # metatile in the tileset with no collision: it draws a crown's lit half
        # on the layer *above* the player, so a trainer walking that row passes
        # behind the tree top. Its presence is why the row under it is the
        # shaded half rather than the lit one.
        #   crown   the rounded top of a mass with nothing above it
        #   fringe  the walkable overhang, drawn over whoever stands there
        #   midA    the lit half of a crown
        #   midB    its shaded lower half
        #   trunk   the foot of the lowest tree, where the stem shows
        #   shadow  the dark ground it casts
        "forest": {
            "crown": sec("viridian_forest", 8, 9, 10),
            "fringe": sec("viridian_forest", 1)[0],
            "fringeTop": fringe_top,
            "midA": sec("viridian_forest", 16, 17, 18),
            "midB": sec("viridian_forest", 24, 25, 26),
            "trunk": sec("viridian_forest", 32, 33, 34),
            "shadow": sec("viridian_forest", 35, 36, 37),
        },
        # A ledge: grass on top, a low earth drop below. Route 1 lays these in
        # short bars with a capped end at each side, which is what makes a route
        # read as a series of terraces rather than one flat field.
        # Left cap, middle, right cap.
        "ledge": [176, 135, 177],
        # Water, read straight out of SafariZone_Center's pond, which has an
        # island in it and so uses every piece. FireRed draws the rocky rim on
        # a water body's top and sides and *never* on its bottom - the water
        # simply meets the grass - so there is no bottom edge to look for.
        #
        #   290 291 292    rim: top-left, top, top-right
        #   298 299 300    rim: left, open water, right
        #
        # and four inner corners, for where land pokes into the water. Those are
        # the ones that matter here: a pier crossing a lake, or an island in the
        # middle of one, is exactly that case, and without them the rim stops
        # dead at the intrusion. In the real pond, 296/297 cap a side rim where
        # it begins, and 304/305 turn a side rim into a top rim around a corner.
        #
        #   296  right rim starting      297  left rim starting
        #   304  land diagonally up-right    305  land diagonally up-left
        #
        # 306/307/308 are NOT plain grass, which is the trap here: they are the
        # water's *bottom* edge, drawn on the land tile below it. Every side of
        # a water body has a rim; three of them live on the water tile and the
        # fourth lives on the shore. Read them as grass and a lake ends in a
        # hard blue-to-green line with no bank at all. There are corner variants
        # at 306 and 308, but counting every General-tileset map in the game
        # gives 307 x44 against 306 x1 and 308 x2 - and the two maps that do use
        # them put 307 in the identical neighbourhood elsewhere. They are hand
        # placements, not a rule, so the shore is one tile.
        "pond": {
            "topLeft": 290, "top": 291, "topRight": 292,
            "left": 298, "open": 299, "right": 300,
            "capRight": 296, "capLeft": 297,
            # The two top corners come in a second pair. A corner tile draws the
            # ground *beyond* the rim as well as the rim itself, so 290/292
            # carry a wedge of grass - which put a green notch in the corner of
            # Rock Ridge's pond, a cave. Seafoam Islands B4F is a cave with a
            # lake and it uses 288/289 there instead: the same corners with rock
            # in the wedge. Same rim, same edges, same inner corners - only
            # these two differ.
            "topLeftRock": 288, "topRightRock": 289,
            "nookRight": 304, "nookLeft": 305,
            "bank": 307,
        },
        # The Power Plant, read off its own map.bin. Its walls are machine
        # banks laid in horizontal runs, two rows tall, and the floor tile
        # beside one is not the same as the floor tile anywhere else:
        #
        #   34   floor with a wall directly BELOW it   (116 of 117 cases)
        #   13!  the console top
        #   21!  the bank body
        #   29   floor with a wall directly ABOVE it   (53 of them)
        #   31   plain floor, everywhere else          (537 tiles)
        #
        # so the skirting is a neighbour rule rather than something a map has to
        # remember. 17/25 and 18/26 cap a run left and right - they are subtly
        # different tiles from 13/21, checked pixel by pixel, not a guess.
        #
        # 110 and 111 are consoles that replace a bank's BODY row: the real map
        # pairs both of them under a 13 and never anywhere else.
        # 53 over 54 is a barrel stack, one tile wide and two tall.
        "power": {
            "floor": sec("power_plant", 31)[0],
            "floorFoot": sec("power_plant", 29)[0],
            # A bank is three rows, not two. The top one is the plinth the
            # machine stands on, and it caps at both ends exactly as the machine
            # does - 33 over 17, 34 over 13, 35 over 18, which is how the real
            # map lays every one of them out. Drawing only the middle of that
            # row, across a whole run, is what made a bank read as a long wall
            # with a walkable grey top.
            "wall": [sec("power_plant", 33, 34, 35),
                     sec("power_plant", 17, 13, 18),
                     sec("power_plant", 25, 21, 26)],
            # Set into a bank in place of 13/21, and only ever under the
            # plinth's middle, so a console can never be an end cap. 110/111 is
            # a different object - a free-standing terminal whose lower half is
            # 118/119 - and drawing its top alone is what cut ours in two.
            "console": sec("power_plant", 57, 58),
            # A partition standing on end. Every vertical run of wall in the
            # real map is 24 whichever side the floor is on, capped at the foot
            # by 48, which carries the machine face. 19 and 23 look like the
            # other two thirds of this and are not: they have the void painted
            # down one side, because they belong to the room's outer wall.
            "post": sec("power_plant", 24, 48),
            "barrel": sec("power_plant", 53, 54),
            # The room's outer wall seen from inside, with the void beyond it -
            # lifted off the real map's four corners rather than assembled:
            #
            #    3!  5!  5! ...  5!  7!
            #   19!                 23!
            #   41! 43! 43! ... 43! 45!
            #
            # A 1-thick ring, so the middle of this grid never draws; it repeats
            # the left edge so a stray edge tile inland is still a wall.
            "edge": [sec("power_plant", 3, 5, 7),
                     sec("power_plant", 19, 19, 23),
                     sec("power_plant", 41, 43, 45)],
        },
        # Pokemon Tower, also a Building map. Every pick below is the commonest
        # id for its mask across all seven real floors, the same way the volcano
        # rock was read.
        "tower": {
            "floor": sec("pokemon_tower", 2)[0],                 # 642
            # The room is lit from the upper left, so the wall casts a shadow
            # along the top and left edges of the floor and nowhere else. That
            # is measured, not assumed: floor with a wall to its RIGHT or BELOW
            # comes out plain 642 on every floor. Graves cast nothing - they are
            # furniture standing on the floor, not part of the room.
            "shadow": {"U": sec("pokemon_tower", 4)[0],          # 644
                       "L": sec("pokemon_tower", 5)[0],          # 645
                       "UL": sec("pokemon_tower", 18)[0]},       # 658
            # A wall shows its face only where there is floor below it: 672 is
            # that face and 664 the white lip above it. Everywhere else - behind
            # the face, and down the left, right and bottom of the room - the
            # wall is flat black. That is not a shortcut; it is what the real
            # oval does, which is why its lower half has no purple in it at all.
            "void": sec("pokemon_tower", 1)[0],                  # 641
            "face": sec("pokemon_tower", 32)[0],                 # 672
            "faceTop": sec("pokemon_tower", 24)[0],              # 664
            # Graves set into the wall face rather than standing on the floor.
            # 729 opens a run and 728 continues it; there is no closing piece,
            # which is why this is a pair and not a 3-slice.
            "graveWall": sec("pokemon_tower", 89, 88),           # 729, 728
            "grave": sec("pokemon_tower", 17)[0],                # 657
            # 5F's cyan sigil - 3x3, and walkable, so it costs no floor.
            "ward": [sec("pokemon_tower", 25, 26, 27),           # 665-667
                     sec("pokemon_tower", 33, 34, 35),           # 673-675
                     sec("pokemon_tower", 41, 42, 43)],          # 681-683
        },
        # A wooden pier: planks with a grey railing down each side and posts
        # along the foot. Another 3x3 autotile, laid out like the path, so a
        # deck of any size gets its rails and its end posts for free. Cols 1-3
        # of the same tileset rows whose cols 0 and 4 are the sand-and-rail
        # approach pieces, which is what identifies it as one set.
        # The cave, read off MtMoon 1F/B1F/B2F. Three things and no more,
        # which is what those maps actually contain:
        #
        #   floor    local 1, and only local 1 - 1663 of the walkable tiles
        #            across the three floors are that one id. The cavern takes
        #            its variety from what stands on the floor, not its texture.
        #   wall     a 3x3 autotile, every piece collision-1, laid out in the
        #            tileset's own 8-wide grid the way path and pier are, so a
        #            mass of any size gets its rounded caps for free.
        #   crater   a 2x2 ring, walkable (collision 0) - the round landmark
        #            dotted all over Mt Moon's floor.
        #
        # Deliberately absent: the yellow sand patches. They are edged with
        # stepped diagonals, and counting them over the three floors gives 19 of
        # 63 neighbourhoods mapping to more than one id - the same surroundings
        # drawn two different ways. They are placed by hand, so there is no rule
        # to follow, and any rule invented here would misuse them somewhere.
        "cave": {
            "floor": sec("cave", 1)[0],
            "wall": [sec("cave", 8, 9, 10),
                     sec("cave", 16, 17, 18),
                     sec("cave", 24, 25, 26)],
            "crater": [sec("cave", 85, 86), sec("cave", 93, 94)],
            # The upper level. Victory Road is where the cave tileset shows its
            # second storey: its map.bin carries elevation 3 for the floor and
            # elevation 4 for the ledges above it, and the two are drawn from
            # different sets. The plateau is another 3x3 autotile with an edge
            # on all four sides - a pink rock lip along the top, stippled edges
            # down the sides and across the bottom where the ground falls away.
            #
            #   plateau  the walkable surface up top
            #   cliff    24/25/26, the drop below its near edge. Also the wall
            #            autotile's bottom row, which is the same thing: what
            #            you see when rock is taller than you are.
            #   stairs   local 4, elevation 0 - the "any level" marker - set
            #            into the cliff face. Three of them in Victory Road 2F,
            #            each one the only way onto its ledge.
            "plateau": [sec("cave", 80, 81, 82),
                        sec("cave", 88, 89, 90),
                        sec("cave", 96, 97, 98)],
            "cliff": sec("cave", 24, 25, 26),
            "stairs": sec("cave", 4)[0],
            # A pool, 2x2, set into the foot of a rock face - every one in Mt
            # Moon and Victory Road is placed exactly that way, the top half
            # replacing two tiles of the cliff row and the bottom half sitting
            # on the floor. Solid here, like every other body of water in this
            # game: there is no Surf, so a rod is the only way into it.
            "pool": [sec("cave", 110, 111), sec("cave", 118, 119)],
        },
        # Ember Caldera, out of pokeemerald's Lavaridge - the Magma Hideout set.
        # Local index is the Emerald metatile id minus 512, and every pick below
        # was derived from the Hideout's own map.bin rather than chosen by eye:
        # for each tile, which of its four neighbours are wall (or lava), then
        # the commonest id per mask. That is the autotile, read out of the game.
        "volcano": {
            "floor": sec("lavaridge", 264)[0],                       # 776
            # The same floor with a white crystal on it. Scattered, not placed.
            "grit": sec("lavaridge", 272, 273, 274, 275),            # 784-787
            #   mask DR -> 616   DLR -> 780   DL -> 618
            #   mask UDR-> 624   UDLR-> 625   UDL-> 626
            #   mask UR -> 632   ULR -> 628   UL -> 634
            "wall": [sec("lavaridge", 104, 268, 106),
                     sec("lavaridge", 112, 113, 114),
                     sec("lavaridge", 120, 116, 122)],
            # Lava is one flat tile. Everything that makes a pool read as a pool
            # is on the ROCK around it - which is where Magma Hideout puts it,
            # and where an earlier draft did not. Drawing the rim on the lava
            # instead left the rock beside it still drawing its own plain edge,
            # so any pool sitting under a wall got two dark bands and two grey
            # lips stacked on each other. That is what "wonky" looked like.
            "lava": sec("lavaridge", 189)[0],                        # 701
            "lavaBubble": sec("lavaridge", 307)[0],                  # 819
            # The bank, keyed by which sides of a rock tile the lava is on.
            # Every one of these is the commonest id for that mask across the
            # eight Magma Hideout floors, so the orientations are the game's
            # own rather than a guess about which way a lip should face.
            #
            # "U" is the only odd one: a pool's bottom edge is normally plain
            # floor (931, walkable), so rock directly below lava is rare - 827
            # is what the real map uses for it.
            "lavaRim": {
                "D": sec("lavaridge", 327)[0],   # 839  above the pool
                "L": sec("lavaridge", 137)[0],   # 649  right of it
                "R": sec("lavaridge", 326)[0],   # 838  left of it
                "U": sec("lavaridge", 315)[0],   # 827  below it
                "DL": sec("lavaridge", 27)[0],   # 539  its top-right corner
                "DR": sec("lavaridge", 29)[0],   # 541  its top-left corner
                "UL": sec("lavaridge", 19)[0],   # 531  its bottom-right
                "UR": sec("lavaridge", 21)[0],   # 533  its bottom-left
                "many": sec("lavaridge", 28)[0], # 540  a rock the lava surrounds
            },
            # THE LADDER COMES FROM `cave`, NOT FROM LAVARIDGE, AND THAT IS
            # A DELIBERATE CROSSING. Magma Hideout's own rung (local 175) is
            # Team Magma's industrial ladder - yellow and black hazard stripes
            # - and at 16px it reads as a barrier rather than as a way down.
            # Reported from play as the wrong asset, beside Mt Moon's, which is
            # `cave` local 22 and unmistakably a ladder. Both sets are earth
            # tones, so the two sit together; a rung nobody recognises is worse
            # than a rung from the next tileset over.
            "ladder": sec("cave", 22)[0],
        },
        # Frost Hollow, copied tile for tile from Seafoam Islands B3F. Every
        # autotile below was derived from the five Seafoam floors by masking:
        # classify each tile by its collision and elevation bits - 3 the lower
        # ice, 4 the raised shelf, 1 the water - then for each one record which
        # of its four neighbours are the same class, and take the commonest id
        # per mask. None of it was picked off a sheet.
        "frost": {
            "floor": sec("seafoam_islands", 1)[0],
            # The raised shelf, and a clean 3x3 - the same nine slots the cave's
            # plateau uses. It is the shelf that carries the height: both floors
            # are near enough the same ice, and what says one of them is higher
            # is the white rim this draws around itself.
            "shelf": [sec("seafoam_islands", 80, 81, 82),
                      sec("seafoam_islands", 88, 89, 90),
                      sec("seafoam_islands", 96, 97, 98)],
            # 25 is both the top edge and the bottom one. Ice here is a texture
            # rather than a lit surface, so the mass has no separate near face -
            # measured, not a mistake.
            "wall": [sec("seafoam_islands", 27, 25, 31),
                     sec("seafoam_islands", 18, 17, 16),
                     sec("seafoam_islands", 24, 25, 26)],
            # The river, banked in rust-coloured rock down both sides. No bottom
            # rim, like every other body of water in this project.
            "water": [sec("seafoam_islands", 160, 151, 162),
                      sec("seafoam_islands", 163, 141, 164),
                      sec("seafoam_islands", 163, 141, 164)],
            "stairs": sec("seafoam_islands", 4)[0],
            # The waterfall is primary, not Seafoam: 295 over 303 over 311,
            # below the dark opening (Seafoam 12) it pours out of.
            "fall": [295, 303, 311],
            "mouth": sec("seafoam_islands", 12)[0],
            "rock": sec("seafoam_islands", 2, 3, 79),
            # Stalactites: 2 wide, 2 tall, and they stand shoulder to shoulder
            # in the ceiling either side of the waterfall, so which half a tile
            # is cannot come from "is my neighbour one too" - it is counted
            # along the run instead, the way a tree trunk is counted down.
            "icicle": [sec("seafoam_islands", 29, 30),
                       sec("seafoam_islands", 37, 38)],
        },
        # Route 12's bridge planks, composited over what each bridge crosses.
        # Two columns for a north-south span, two rows for an east-west one.
        "bridge": bridges,
        "deck": [[313, 314, 315], [321, 322, 323], [329, 330, 331]],
        # Rows are top / middle / bottom. 220 is the centre fill - it is the
        # most uniform sand tile in the sheet, and Route 1 repeats the 219-221
        # row down the length of every path, which is what pins the order.
        "path": [[211, 212, 213], [219, 220, 221], [227, 228, 229]],
        # METATILES YOU CANNOT BE SEEN STANDING ON. Their upper layer covers the
        # whole tile - the Power Plant's machine plinth draws the SAME tile on
        # both halves, 123 times - so on the real hardware BG1 hides whoever is
        # there. It is passable in the map data and it is not a place a player
        # can be, which is the same thing said two ways.
        #
        # A transcription reads this and makes those cells solid: our generated
        # Power Plant made exactly that call by hand ("FireRed leaves the plinth
        # walkable; we make it solid"), and the copy reached it from the other
        # side, reported as standing on top of the machinery.
        "hides": sorted(hiding_ids),
        # THE SAFARI ZONE IS AN EMERALD MAP, so both halves of its art are
        # pokeemerald's: metatile ids below 512 come from Emerald's own General
        # primary and the rest from Lilycove. Neither shares an id with
        # anything FireRed draws, which is the whole reason they are separate
        # blocks - `safari_zone()` rebases against these two numbers.
        # Cinderpeak needs no block of its own: Emerald's General is already
        # here for the Safari Zone and `lavaridge` for Ember Caldera, and
        # Route 112 reaches local 440 of the 441 lavaridge ships.
        "cinder": {"floor": sets["lavaridge"] + 113},   # metatile 625
        # THE MANSION NEEDS BOTH HALVES OF ITS PAIRING, because it is the
        # first map here drawn against a pokefirered primary that is not
        # General: 748 of its metatiles are `building` ids and 4,225 are
        # `pokemon_mansion` ones, so a transcription rebases each against its
        # own block. `floor` is METATILE_PokemonMansion_Floor (644) - the tile
        # the switch script itself lays wherever it opens a barrier.
        "mansion": {"building": sets["fr_building"],
                    "mansion": sets["pokemon_mansion"],
                    "floor": sets["pokemon_mansion"] + 4},
        "safari": {"general": sets["em_general"], "lilycove": sets["lilycove"],
                   "split": 512,          # NUM_METATILES_IN_PRIMARY, Emerald's
                   "floor": sets["em_general"] + 1},   # its plain grass
    }
    with io.open(os.path.join(PUB, "tilesets", "route.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  route.png  {atlas.shape[1]}x{atlas.shape[0]}  ({len(mt)} metatiles)")
    lit = int((top[:, :, 3] > 0).reshape(-1, 16, top.shape[1] // 16, 16)
              .any(axis=(1, 3)).sum())
    print(f"  route_top  the same, upper layer only - {lit} metatiles draw over you")
    print(f"  hides      {len(hiding_ids)} metatiles hide whoever stands on them")


# --------------------------------------------------------------- player sheet

def build_player():
    """Cut the trainer's animation sets out of the Spriters Resource rip.

    The sheet is a four-row grid on a 33px vertical pitch from y=42, one row per
    facing: down / up / left / right. Across it sit several sets, each on its own
    horizontal pitch. These were measured off the rip's own orange backing
    rectangles rather than guessed - it draws one per frame, so the cells can be
    read straight out of the image:

      walk  x   8,  25,  42        16x32   3 frames   stand / step / step
      run   x  68,  85, 102        16x32   3 frames   the same cycle, leaning
      bike  x 128, 161, 194        32x32   3 frames   (not used yet)
      fish  x 236, 269, 302, 335   32x32   4 frames   the cast
      surf  x 377, 410             32x32   2 frames   (not used yet)
      surf  x 452, 485             32x32   2 frames   on GREEN  (not used yet)
      jump  x 527                  32x32   1 frame    on GREEN  legs tucked

    Mind the backing colour. The rip paints frames it considers used orange and
    the rest green, and measuring only the orange cells hides three whole sets -
    including the jump, which is why this once claimed the sheet had none. Both
    colours are cells; both get keyed out below.

    The wider sets are 32x32 because the rod and the bike stick out past the
    trainer; the figure still occupies the middle 16, so the renderer centres
    them on the tile and nothing has to be nudged by hand.

    The jump is a single mid-air pose per facing, so the arc and the shadow are
    still the renderer's job - see drawPlayer's lift.

    Emitted as one strip, walk then run then fish, with each set's offset in
    player.json so the renderer never carries these numbers.
    """
    # Kept out of public/ so the 67KB rip is not shipped with the build.
    src = next((p for p in (os.path.join(SRC, PLAYER_SHEET),
                            os.path.join(PUB, "tilesets", PLAYER_SHEET))
                if os.path.exists(p)), None)
    if src is None:
        print("  ! player sheet not found, skipping:", PLAYER_SHEET)
        return

    sheet = np.array(Image.open(src).convert("RGBA"))
    FH, PITCH_Y, ROWS = 32, 33, 4
    #        name     first x  pitch  width  frames
    SETS = [("walk",        8,    17,    16,      3),
            ("run",        68,    17,    16,      3),
            ("fish",      236,    33,    32,      4),
            # THE SURF SET WAS ALWAYS ON THIS SHEET AND WAS NEVER CUT OUT. The
            # rip marks it green - "unused", in its author's opinion - and
            # green is a backdrop here exactly as the orange is, so the frames
            # are real art. Two poses, which is a paddle cycle rather than a
            # walk cycle: the trainer does not stride on water.
            ("surf",      377,    33,    32,      2),
            ("jump",      527,    33,    32,      1)]

    # BOTH PLAYABLE CHARACTERS ARE ON THIS SHEET, and only one was ever cut out
    # of it. The rip is titled "Playable CharacterS" and is 638px tall, where the
    # four rows read here end at 173 - the rest is not padding. Measured off its
    # own backing rectangles, the marker bands sit at y 42-172, 183-288, 309-439,
    # 448-555 and 566-629, and the THIRD is the same 131px four-row grid as the
    # first: Red at 42, Leaf at 309, same pitch, same columns, every set in the
    # same place across.
    #
    # So the only thing that differs between them is the origin row, and both go
    # into ONE strip - Red's four facings, then Leaf's - with the row each starts
    # at recorded in `chars`. One image and one fetch, and the renderer adds an
    # offset instead of choosing a file.
    CHARS = {"red": 42, "leaf": 309}

    width = sum(w * n for _, _, _, w, n in SETS)
    rows_all = ROWS * len(CHARS)
    out = np.zeros((rows_all * FH, width, 4), np.uint8)
    meta, ox, chars = {}, 0, {}
    for name, sx, pitch, fw, n in SETS:
        for ci, (cname, oy) in enumerate(CHARS.items()):
            chars[cname] = ci * ROWS
            for r in range(ROWS):
                for c in range(n):
                    y, x = oy + r * PITCH_Y, sx + c * pitch
                    row = ci * ROWS + r
                    out[row * FH:(row + 1) * FH, ox + c * fw:ox + (c + 1) * fw] = \
                        sheet[y:y + FH, x:x + fw]
        meta[name] = {"x": ox, "y": 0, "w": fw, "h": FH, "frames": n}
        ox += fw * n

    # The rip marks used frames orange and unused ones green; both are backdrop.
    rgb = out[:, :, :3].astype(int)
    for key in ((255, 127, 39), (34, 177, 76)):
        m = (np.abs(rgb - np.array(key)).sum(axis=2) < 30)
        out[m] = 0

    Image.fromarray(out, "RGBA").save(os.path.join(PUB, "tilesets", "player.png"))
    with io.open(os.path.join(PUB, "tilesets", "player.json"), "w") as f:
        json.dump({"scale": 2, "rowH": FH,
                   "dirs": {"down": 0, "up": 1, "left": 2, "right": 3},
                   # Which block of four rows a character starts at; the
                   # renderer adds this to the facing's own row.
                   "chars": chars,
                   "sets": meta}, f, indent=2)
    opaque = int((out[:, :, 3] > 0).sum())
    print(f"  player.png {width}x{rows_all * FH}  ({opaque} opaque px)  "
          + f"chars:{'/'.join(chars)}  "
          + " ".join(f"{k}:{v['frames']}" for k, v in meta.items()))

    build_shoes(out, meta)
    build_surf(out, meta)


def build_surf(strip, meta):
    """The Surf key item's icon, cut from the set it unlocks.

    The same answer the Running Shoes got and for the same reason: there is no
    official icon for this anywhere - HMs are not items in this game and never
    were - so it is real art already in this repository rather than an invented
    picture of a surfboard. It is the trainer on the water, which is what the
    item does."""
    st = meta["surf"]
    # Row 0 is facing DOWN, which reads best small: the trainer faces you.
    art = Image.fromarray(strip[0:st["h"], st["x"]:st["x"] + st["w"]], "RGBA")
    box = art.getbbox()
    assert box, "the surf frame came out empty - the player sheet moved"
    art = art.crop(box)

    size, margin = 30, 2
    scale = (size - margin * 2) / max(art.size)
    small = art.resize((max(1, round(art.width * scale)),
                        max(1, round(art.height * scale))), Image.NEAREST)
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(small, ((size - small.width) // 2, (size - small.height) // 2), small)
    icon.save(os.path.join(PUB, "items", "surf.png"))
    print(f"  surf.png {size}x{size}  (surf frame, {art.width}x{art.height} trimmed)")


def build_shoes(strip, meta):
    """The Running Shoes key item, cropped out of the trainer's own run cycle.

    **There is no official Running Shoes item icon.** Not in PokeAPI, which has
    no such item at all, and not in pokefirered or pokeemerald, whose item icon
    directories were both checked - the games grant the shoes invisibly, which
    is why this file used to say running had to be a level rather than an item.

    Rather than invent one, the icon is the trainer mid-stride: the second run
    frame facing down, which is the pose with a leg actually extended. That is
    Game Freak's own art, already in this repository, and it shows the thing
    the item does. It is the only item icon here not drawn as an object, and
    that is a deliberate trade against drawing a fake shoe.

    Sized to 30x30 to sit in the same slot as the PokeAPI icons, trimmed to the
    figure first so it is not a 16x32 sliver floating in a square.
    """
    r = meta["run"]
    # Frame 1 of the run set, row 0 = facing down. Frame 0 is the stand.
    frame = strip[0:r["h"], r["x"] + r["w"]:r["x"] + r["w"] * 2]
    im = Image.fromarray(frame, "RGBA")
    box = im.getbbox()
    assert box, "the run frame came out empty - the player sheet moved"
    art = im.crop(box)

    size, margin = 30, 2
    scale = (size - margin * 2) / max(art.size)
    small = art.resize((max(1, round(art.width * scale)),
                        max(1, round(art.height * scale))), Image.NEAREST)
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(small, ((size - small.width) // 2, (size - small.height) // 2), small)
    icon.save(os.path.join(PUB, "items", "running-shoes.png"))
    print(f"  running-shoes.png {size}x{size}  (run frame, {art.width}x{art.height} trimmed)")


# ------------------------------------------------------- encounter ground tiles

def build_ground():
    """Single metatiles pulled out of the atlas so CSS can tile them as the
    encounter background. Same art as the map, no extra source needed.

    ONE PER AREA. Every encounter used to happen on grass - you could be deep
    in Ember Caldera, meet something, and fight it standing on a meadow. The
    floor each area actually walks on is already named in route.json, because
    this same script wrote it there, so the ids are read back out rather than
    picked by eye: `cave.floor`, `volcano.floor` and so on are the exact
    metatiles the map draws underfoot.

    The three outdoor maps keep primary metatile 1, the grass they are made
    of. What separates those three from each other is the sky, which is CSS -
    see `--sky` in styles.css - not the ground."""
    atlas = Image.open(os.path.join(PUB, "tilesets", "route.png"))
    with io.open(os.path.join(PUB, "tilesets", "route.json"), encoding="utf-8") as f:
        meta = json.load(f)
    os.makedirs(os.path.join(PUB, "battle"), exist_ok=True)

    grounds = {
        "meadow": 1, "woods": 1, "pond": 1,          # grass, from the primary
        "ridge": meta["cave"]["floor"],
        "power": meta["power"]["floor"],
        "ember": meta["volcano"]["floor"],
        "frost": meta["frost"]["floor"],
        "tower": meta["tower"]["floor"],
        # Emerald's own grass, not FireRed's - the one area drawn against a
        # different decomp's primary, so its floor cannot come from ours.
        "safari": meta["safari"]["floor"],
        # The ash-covered mountain ground, which is also both layouts' own
        # border block - the one tile Route 112 and Mt Chimney agree on.
        "cinder": meta["cinder"]["floor"],
        # The mansion's own parquet, which is also what its switch script
        # lays down wherever it opens a barrier.
        "mansion": meta["mansion"]["floor"],
    }
    # The fallback an area with no tile of its own lands on, and what the CSS
    # default points at.
    grounds["ground"] = 1

    for name, mid in grounds.items():
        assert isinstance(mid, int), (
            "%s's floor is %r - build_ground wants a single metatile id, and a "
            "3x3 autotile has no one tile that IS the floor" % (name, mid))
        my, mx = divmod(mid, meta["atlasCols"])
        atlas.crop((mx * 16, my * 16, mx * 16 + 16, my * 16 + 16)).save(
            os.path.join(PUB, "battle", f"{name}.png"))
    print("  battle grounds: %s  16x16" % " ".join(sorted(grounds)))


if __name__ == "__main__":
    os.makedirs(SRC, exist_ok=True)
    print("building assets...")
    build_tileset()
    build_player()
    build_ground()
    print("done")
