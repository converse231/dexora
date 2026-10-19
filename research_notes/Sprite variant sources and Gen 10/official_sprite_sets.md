# Official Pokémon sprite sets usable as alternate-art variants

Method note: PokeAPI/sprites folder coverage below was MEASURED on 2026-10-19 by walking the repo's git trees through the GitHub API (counting unique National Dex ids below 10000, plus form ids >= 10000) and reading PNG/GIF headers and palettes of sample files from raw.githubusercontent.com. Showdown's directories were counted from their live directory listings the same day. Bulbapedia, Bulbagarden Archives and The Spriters Resource all answered 403 or a Cloudflare "Just a moment..." challenge to both WebFetch and curl, so claims about them rest on search-result summaries and are flagged.

## 1. Japanese Red/Green vs Blue (JP) / international Red-Blue vs Yellow, and where to get Red/Green

### Takeaway
Yes, the attached sheet is the same idea as Dexora's Origin tier, one generation earlier: Red/Green is the very first drawing of each Kanto species. Japanese Blue redrew every front sprite, and international Red/Blue shipped Blue's art. **PokeAPI/sprites already hosts the full Red/Green set** (`versions/generation-i/red-green-japan`, 151 species, Super Game Boy coloured, plus `back/` and `gray/`). Showdown hosts it too (`/sprites/gen1rg/`).

### Cited Findings
- Japanese Blue gave every Pokémon new front sprites. Its back sprites, trainer sprites and the Pokémon Tower ghosts were kept from Red and Green, and international Red and Blue reused Blue's sprites — [Bulbapedia, Pokémon Blue (Japanese)](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Blue_(Japanese)) (from a search summary; the page itself returned 403).
- TCRF also says Japanese Blue changed the front sprites, and that international Red/Blue kept Blue's graphics but used Red/Green's encounters and trades — [TCRF, Red and Blue/Version Differences](https://tcrf.net/Pok%C3%A9mon_Red_and_Blue/Version_Differences) (search summary).
- PokeAPI's README lists `red-green-japan` (PNGs with `back` and `gray`), `red-blue` (`gray`, `transparent`) and `yellow` (`gbc`, `gray`, `transparent`) — [PokeAPI/sprites README](https://github.com/PokeAPI/sprites).
- Measured: `red-green-japan` has 151 files for ids 1-151 and subfolders `back` and `gray`. `red-blue` has 151 (`back`, `gray`, `transparent`); `yellow` has 151 (`back`, `gbc`, `gray`, `transparent`). URL pattern: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/red-green-japan/{id}.png` — [PokeAPI/sprites tree](https://github.com/PokeAPI/sprites/tree/master/sprites/pokemon/versions/generation-i).
- Measured palettes for Charizard (#6), all 56x56 indexed PNGs ([raw file](https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/red-green-japan/6.png)):
  - `red-green-japan/6.png`: `181010`, `d65231`, `ffa552`, `f7ffef`. These are Super Game Boy-style colours, the same look as the user's sheet.
  - `red-blue/6.png`: `ffffff`, `ffa552`, `191010`, `d65231`, the same SGB-style palette.
  - `yellow/6.png`: `ffffff`, `d64a31`, `ffc55a`, `313131`.
  - `yellow/gbc/6.png`: `ff0000`, `ffffff`, `191919`, `ff8c00`, the saturated Game Boy Color palette.
  - `red-green-japan/gray/6.png` has no PLTE chunk, so it is a 4-shade greyscale image.
- Measured canvas: `red-green-japan/1.png` is 56x56, while `red-blue/1.png` and `yellow/gbc/1.png` are 40x40. Canvases vary per species (Gen 1 sprites are 40, 48 or 56 px) — [PokeAPI/sprites](https://github.com/PokeAPI/sprites).
- Pokémon Showdown serves `gen1rg/` (151 files), `gen1rb/` (151) and `gen1/` (158) by species name. Measured: `gen1rg/charizard.png` is 96x96 with palette `120b0b d14728 ff9c47 f6ffed` (SGB-like), and `gen1/charizard.png` is 96x96 with `ff0000 ff8c00 ffffff` (GBC-like) — [play.pokemonshowdown.com/sprites/gen1rg/](https://play.pokemonshowdown.com/sprites/gen1rg/).
- Bulbagarden Archives names files `Spr 1g NNN.png` (Red/Green), `Spr 1b` (Red/Blue) and `Spr 1y` (Yellow). Its API (`archives.bulbagarden.net/w/api.php`) answered a Cloudflare managed challenge to curl on 2026-10-19, so it is not a usable programmatic source — measured; the naming comes from the assignment brief and was not verified live.
- A forum post claims Japanese Green used different SGB palettes from Blue for some UI and towns — [Bulbagarden forums](https://bulbagarden.net/threads/gen-1-game-corner-discovery.173666/) (forum observation, unverified).

### Inferences
- Red/Green is the strongest new candidate. It is official, complete for Kanto, already on PokeAPI (Dexora's existing fetch host and folder pattern), and visibly different from Yellow (Dexora's current Kanto Origin) and from FireRed (the base). Many RG fronts are famously odd and off-model, which is exactly what a "debut" collectible wants.
- The SGB-coloured `red-green-japan/{id}.png` matches the user's sheet. The `gray/` version gives a second, monochrome look if the game ever wants one.
- If Red/Green became the Kanto Origin, Yellow could become its own tier, or Red/Blue could. Red/Blue and Yellow share much art, though, so verify the visual difference per species before making both tiers.
- Back sprites are identical across RG and Blue (Bulbapedia), so the `back/` folders add nothing for variants.

### Gaps
- Exact per-species list of which Red/Blue fronts Yellow redrew: not fetched (Bulbapedia 403).
- Which SGB palette PokeAPI's RG colours were taken from (the Green cartridge's SGB table or a generic one) is undocumented in the README. The PokeAPI commit history could not be read (GitHub API rate limit, 429).
- Whether a pret disassembly of Japanese Red/Green exists as a clean source of the SGB palette tables: not verified.

## 2. SGB/GBC colouring, and Gold/Silver vs Crystal vs the Space World 1997 beta

### Takeaway
Coloured Gen 1 sets already exist ready to use: SGB colours (PokeAPI `red-green-japan` and `red-blue` default, Showdown `gen1rg`/`gen1rb`) and GBC colours (PokeAPI `yellow/gbc`, Showdown `gen1`). Gen 2 has three separate official drawings per species: Gold, Silver and Crystal. Crystal's are animated in-game. The Space World '97 beta sprites are leaked material subject to takedowns, so they are not a responsible source.

### Cited Findings
- Measured: `generation-ii/gold`, `silver` and `crystal` each have 277 files covering ids 1-251; the extra files are Unown letters. Gold and Silver have `back`, `shiny` and `transparent`; Crystal has `animated`, `back`, `shiny` and `transparent` — [PokeAPI/sprites](https://github.com/PokeAPI/sprites/tree/master/sprites/pokemon/versions/generation-ii).
- Measured: `gold/6.png` is 56x56 with palette `ffffff ff7300 395a7b 000000`; `crystal/1.png` is 40x40; `crystal/animated/1.gif` is a 56x56 GIF with about 13 frames (~2 KB). Crystal's animated folder covers all 251 — [PokeAPI/sprites](https://github.com/PokeAPI/sprites).
- Showdown has `gen2g/` (276), `gen2s/` (276) and `gen2/` (278). Measured: `gen2g/charizard.png` is 80x80 — [play.pokemonshowdown.com/sprites](https://play.pokemonshowdown.com/sprites/gen2g/).
- The Space World '97 demo was shown November 21-23, 1997. Many Gen 1 Pokémon in it still used Blue's sprites as placeholders, and 100 new Pokémon had been designed by then — [Bulbapedia, Spaceworld '97 demo](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Gold_and_Silver_Spaceworld_'97_demo) (search summary).
- The 2020 leak of the 1997/1999 demo files included sprites of scrapped and early Pokémon. PokeCommunity reports that sprites were removed from the source dump after takedown pressure related to Nintendo — [PokeCommunity Daily](https://daily.pokecommunity.com/2020/04/25/major-discoveries-revealed-from-pokemon-gold-and-silver-demo).
- TCRF documents the GS unused graphics and the Space World 1999 demo's graphic differences — [TCRF GS Unused Graphics](https://tcrf.net/Pok%C3%A9mon_Gold_and_Silver/Unused_Graphics), [TCRF SW99 Graphic Differences](https://new.tcrf.net/Proto:Pok%C3%A9mon_Gold_and_Silver/Spaceworld_1999_Demo/Graphic_Differences).

### Inferences
- Gold or Silver (static) differs from Crystal, Dexora's current Johto Origin, for many species, so either could be a second Johto "debut" tier. Check the difference per species: some sprites were reused unchanged.
- Space World beta art comes from leaked source code, not a released game, and leaked material has been targeted by takedowns. It conflicts with the README's "Non-commercial... art belongs to Nintendo" stance, which rests on released-game art. Avoid it.

### Gaps
- Per-species count of how many Gold, Silver and Crystal fronts are actually distinct was not measured.
- No verified complete public set of Space World '97 Pokémon sprites (deliberately not pursued).

## 3. Every PokeAPI/sprites folder: coverage, size, animation, and how distinct each looks from Dexora's base art

### Takeaway
Besides Gen 1-2, the sets that look clearly different from FRLG/HGSS/BW are Ruby/Sapphire and Emerald (Gen 3: mostly the same art as FRLG, so weak), Diamond/Pearl and Platinum (some Gen 4 redraws), the Gen 6-7 3D renders (x-y, ORAS, USUM: a different medium), Gen 8-9 HOME-style renders, Dream World SVG (Sugimori-style vector art, 936 species), and official artwork (1025 species). Of these, the 3D-render sets and Dream World read most clearly as another drawing on a 56px Box row.

### Cited Findings (measured 2026-10-19; "ids" = unique National Dex ids < 10000; "forms" = files numbered >= 10000)
| Folder | ids covered (max) | forms | Format / size | Subfolders |
|---|---|---|---|---|
| versions/generation-i/red-green-japan | 151 (151) | 0 | PNG, 40-56 px, SGB colour | back, gray |
| versions/generation-i/red-blue | 151 | 0 | PNG, SGB colour | back, gray, transparent |
| versions/generation-i/yellow | 151 | 0 | PNG | back, gbc, gray, transparent |
| versions/generation-ii/gold, silver | 251 (+Unown, 277 files) | 0 | PNG | back, shiny, transparent |
| versions/generation-ii/crystal | 251 | 0 | PNG; animated GIF 56x56 | animated, back, shiny, transparent |
| versions/generation-iii/ruby-sapphire | 386 | 3 | PNG 64x64 | back, shiny |
| versions/generation-iii/emerald | 386 | 4 | PNG 64x64 | animated, back, shiny |
| versions/generation-iii/firered-leafgreen | 386 | 5 | PNG 64x64 | back, shiny |
| versions/generation-iv/diamond-pearl | 493 | 8 | PNG 80x80 | animated, back, female, shiny |
| versions/generation-iv/platinum | 493 | 15 | PNG 80x80 | animated (493 ids), back, female, shiny |
| versions/generation-iv/heartgold-soulsilver | 493 | 15 | PNG 80x80 | animated, back, female, shiny |
| versions/generation-v/black-white | 1025 (1219 files) | 317 | PNG 96x96 | animated (868 ids), back, female, shiny |
| versions/generation-vi/x-y | 721 | 63 | PNG, varying size (Bulbasaur 43x48) | back, female, shiny |
| versions/generation-vi/omega-ruby-alpha-sapphire | 721 | 90 | PNG 120x120 | back, female, shiny |
| versions/generation-vii/ultra-sun-ultra-moon | 802 | 158 | animated GIF (Bulbasaur 45x49, ~41 frames, 86 KB) | back, female, shiny |
| versions/generation-vii/lets-go-pikachu-lets-go-eevee | 151 + Meltan line (max 809) | 35 | GIF | back, female, icons, shiny |
| versions/generation-viii/sword-shield | ~755 files, max 898 | 118 | WebP 512x512 | back, female, icons, shiny |
| versions/generation-viii/brilliant-diamond-shining-pearl | 493 | 15 | WebP 512x512 | back, female, icons, shiny |
| versions/generation-viii/legends-arceus | 290 files, max 905 | 39 | WebP 512x512 | back, female, icons, shiny |
| versions/generation-ix/scarlet-violet | ~859 files, max 1025 | 136 | WebP 512x512 | back, female, icons, shiny |
| versions/generation-ix/legends-za | ~411 files, max 1000 | 148 | WebP 512x512 | back, female, icons, shiny |
| versions/generation-ix/champions | ~328 files, max 1019 | 124 | animated WebP | back, female, icons, shiny |
| versions/generation-iii/-iv/-v/-vi/-vii icons | 386 / 493 / 649 / 721 / 809 | — | PNG 32x32 (Gen 3-5), 40x30 (Gen 6-7); Gen 5 animated | — |
| other/dream-world | 936 | 76 | SVG | female |
| other/home | 1025 (+id 0) | 310 | PNG 512x512 | female, shiny |
| other/official-artwork | 1025 | 326 | PNG 475x475 | shiny, versions |
| other/showdown | 1011 | 272 | GIF (animated) | back, female, shiny |
— source for all rows: [PokeAPI/sprites](https://github.com/PokeAPI/sprites) (README sizes plus measured trees). The Gen 8/9 rows give file counts, not unique ids; a few ids may repeat.

- README provenance caveats: Gen V black-white sprites above #650 are custom and Smogon-based, **not official**. The Gen IX front sprites are credited to KingOfThe-X-Roads, and back sprites and Z-A Megas to kyledovey. Sprites from Let's Go onward were "rendered by FallenDeity from original game assets". The official-artwork shinies are custom (DevMike123, JoseBaGra, Pokétwo) — [PokeAPI/sprites README](https://github.com/PokeAPI/sprites).
- Licence: "All image contents within are Copyright The Pokémon Company. This repository is distributed under CC0 1.0 Universal". The CC0 covers the repository's own work, not the art — [LICENCE.txt](https://raw.githubusercontent.com/PokeAPI/sprites/master/LICENCE.txt).
- Showdown's live directories (file counts): `gen3` 423, `gen3rs` 386, `gen4` 683, `gen4dp` 619, `gen5` 1673, `gen5ani` 1255, `ani` 1686, `dex` 1458 (measured: `dex/charizard.png` is 120x120 RGBA), `home` 1514 — [play.pokemonshowdown.com/sprites](https://play.pokemonshowdown.com/sprites/).

### Inferences
- Weak variants, because they look too much like Dexora's bases: `firered-leafgreen` (it is the base), `ruby-sapphire` and `emerald` (Gen 3 fronts were largely shared with FRLG for 152-386), `heartgold-soulsilver` (the base), and `black-white` (the base). `diamond-pearl` vs `platinum` vs HGSS: Platinum redrew a subset only.
- Strong, clearly different looks:
  - The Gen 6-7 3D model renders (`x-y`, `omega-ruby-alpha-sapphire` PNG; `ultra-sun-ultra-moon` animated GIF, but heavy at ~86 KB each).
  - Gen 8-9 WebP renders. These are partial per game and need a fallback.
  - `dream-world` SVG, which is vector Sugimori-style art: official, but stops partway, 936 ids.
  - `home`, which looks very like the PokeAPI default renders Dexora uses from Gen 6 on, so it is weak for those generations.
- `official-artwork` is Sugimori/Creatures key art, not a sprite. It is distinct, but at 475px it reads as a painting. It would clash with pixel art unless the tier is meant to look like that.
- A "Debut" logic per generation is cheap with PokeAPI: RG (Gen 1), Gold/Silver (Gen 2), RS (Gen 3), DP (Gen 4). Dexora already does this with Yellow/Crystal, and per CLAUDE.md its Origin logic already compares `genOf` against `baseArtGen`.

### Gaps
- Visual-diff statistics (how many species' RS fronts differ from FRLG, DP from Platinum, and so on) were not computed. They could be measured by hashing the PNGs from PokeAPI.
- The `other/official-artwork/versions` subfolder was not enumerated (rate-limited).

## 4. Other official sets: Ranger, Mystery Dungeon, Stadium, Pinball, Picross, Café, Dream World, GO, HOME, Shuffle/Masters, Sleep

### Takeaway
Only a few are fully ripped AND hosted in a scriptable repo:
- Dream World and HOME (PokeAPI).
- Mystery Dungeon portraits through PMDCollab SpriteCollab. Its official Chunsoft art is mixed with fan-made art in the same style, and it is CC BY-NC.
- Pokémon GO through PokeMiners `pogo_assets`. It is "educational use only".

Picross covers about 256-304 entries (Gens 1-6). For Ranger, Stadium, Pinball, Café, Shuffle, Masters and Sleep, no complete scriptable source was verified.

### Cited Findings
- PMDCollab/SpriteCollab holds overworld sprites and 40x40 portraits (within 15 colours). Its existing Chunsoft (official) portraits may not be overwritten except shinies, and submitters' work is shared non-commercially with credit under CC BY-NC 4.0. Credit is per contributor, through the bot's `!register` — [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab).
- SpriteCollab mixes official PMD portraits with custom portraits in the same style, aiming to cover every Pokémon of every generation — [SkyTemple wiki, Pokémon Portrait](https://wiki.skytemple.org/index.php/Pok%C3%A9mon_Portrait) (search summary). Veekun also lists a Mystery Dungeon portraits index — [veekun media](https://veekun.com/dex/media/pokemon/mystery-dungeon/portraits/).
- PokeMiners/pogo_assets holds mined Pokémon GO 2D images sorted by category (Pokemon, Items, Backgrounds…) plus 3D. It names no licence; its disclaimer reads "This repo is for educational use only… All content found within this repo is the property of The Pokemon Company and Niantic" — [PokeMiners/pogo_assets](https://github.com/PokeMiners/pogo_assets).
- Project Pokémon's sprite index has per-generation GO sprite pages sourced from PokeMiners and ZeChrales/PogoAssets — [Project Pokémon PGO Gen 1](https://projectpokemon.org/home/docs/spriteindex_148/pgo-generation-1-pok%C3%A9mon-r102/).
- Pokémon Picross: Bulbapedia counts 256 Pokémon, while WikiDex counts 304 including Megas and alternate forms, covering Gens 1-6 — [Bulbapedia list](https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_in_Pok%C3%A9mon_Picross), [WikiDex list](https://www.wikidex.net/wiki/Lista_de_Pok%C3%A9mon_de_Pok%C3%A9mon_Picross) (search summaries).
- Pokémon Shuffle has a 64x64 Pokémon icon set in its game data, and TCRF documents unused icons. WikiDex's category holds about 267 Shuffle files, but the listing is partial — [TCRF Pokémon Shuffle](https://tcrf.net/Pok%C3%A9mon_Shuffle), [WikiDex Categoría:Pokémon Shuffle](https://www.wikidex.net/wiki/Categor%C3%ADa:Pok%C3%A9mon_Shuffle).
- Café ReMix icons exist on WikiDex at 512x512, per app version — [WikiDex](https://www.wikidex.net/wiki/Categor%C3%ADa:Car%C3%A1tulas_de_los_videojuegos) (search summary). Coverage is limited to the game's roster.
- Dream World SVG (936 ids) and HOME 512px (1025) are on PokeAPI (section 3) — [PokeAPI/sprites](https://github.com/PokeAPI/sprites).
- Veekun offers downloadable icon and Trozei sprite packs — [veekun downloads](https://veekun.com/dex/downloads) (search summary).

### Inferences
- Of the spin-offs, PMD portraits are the most charming "different drawing" and the best covered. But only the Chunsoft subset is official, so a tier built on it would mix official and fan art. That matches Dexora's existing Sage precedent (fan art with `SAGE_CREDIT`), and it would need per-artist credit from SpriteCollab's credit data. The NC licence suits a non-commercial game.
- Pokémon GO models cover nearly the whole dex and look distinct (soft 3D). The repo says "educational use only", which is a stricter stance than PokeAPI's.
- Picross, Shuffle and Café cover only part of the dex, so as tiers they would be "Origin-like" gates where `lockedTiers` already handles missing art (the ART_GATES list).

### Gaps
- Pokémon Ranger (1-3), Stadium 1/2, Pinball (GB, R&S), Masters EX and Sleep: no verified complete rip or scriptable host was found in this pass. Stadium and Masters are 3D games, so a "sprite" set would have to be rendered. Unverified whether The Spriters Resource has complete sheets for any of them, because the site returned 403.
- Exact SpriteCollab coverage counts (how many species have an official versus a custom portrait) were not read; the status table did not render.

## 5. Licensing reality and crediting practice

### Takeaway
Every set is Nintendo / Creatures / Game Freak (and Niantic or Chunsoft) IP. The hosts make no grant over the art: PokeAPI's CC0 covers only its own work, PokeMiners says educational only, and Bulbagarden forbids hotlinking and relies on fair use for its own wiki. Fan-made layers carry their own terms: SpriteCollab is CC BY-NC 4.0, and Smogon's custom sprites are served with Smogon's permission. Credit rippers and fan artists by name, the way Dexora already credits SageDeoxys.

### Cited Findings
- PokeAPI: "All image contents within are Copyright The Pokémon Company", with the repo itself under CC0 — [LICENCE.txt](https://raw.githubusercontent.com/PokeAPI/sprites/master/LICENCE.txt). The README thanks Smogon for permission to use and serve its custom B&W-style sprites — [README](https://github.com/PokeAPI/sprites).
- Bulbagarden Archives: "not an image hosting service"; images "should not be direct-linked from other sites" and should be used on a Bulbagarden project; images are generally copyrighted works used under fair use — [Archives:Policy](https://archives.bulbagarden.net/wiki/Archives:Policy) (search summary; the page itself is behind a Cloudflare challenge). Measured: its API answers bots with a challenge page, so it is not scriptable anyway.
- SpriteCollab: CC BY-NC 4.0, non-commercial with appropriate credit, contributors credited per Discord ID or registered name — [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab).
- PokeMiners: "educational use only… property of The Pokemon Company and Niantic" — [PokeMiners/pogo_assets](https://github.com/PokeMiners/pogo_assets).
- PokeAPI per-set credits that a fan game should carry: FallenDeity (Let's Go and later renders), KingOfThe-X-Roads (Gen IX fronts), kyledovey (Gen IX backs, Z-A Megas), DevMike123, JoseBaGra and Pokétwo (official-artwork shinies), and the Smogon community (BW-style sprites above #650 and the Showdown set) — [README](https://github.com/PokeAPI/sprites).

### Inferences
- In practice, Dexora should fetch from PokeAPI and Showdown (both openly scriptable) and self-host the files, which it already does. It should not hotlink Bulbagarden.
- For any set containing community renders or fan art, add a credit line the way `SAGE_CREDIT` does.

### Gaps
- The Spriters Resource's terms and its ripper-credit convention could not be read (403 to fetches). Its FAQ should be checked by hand before relying on any sheet from there.
- Bulbagarden's separate fair-use statement page was not retrieved.
