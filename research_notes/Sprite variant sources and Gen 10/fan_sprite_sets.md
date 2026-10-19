# Fan-made Pokemon sprite sets usable as alternate-art variants (as of 2026-10-19)

## PMD Sprite Collab (PMDCollab/SpriteCollab): coverage, format, licence, credit, download

### Takeaway
This is the strongest candidate. It covers the full National Dex (#0000-#1025) under a clear CC BY-NC 4.0 licence and is a live GitHub repo with one folder per species, so it can be fetched programmatically. It has two big caveats. First, about half the base species (492) are Spike Chunsoft's official PMD art, not fan art. Second, the overworld sprites are small top-down sheets (40x56 frames for Pikachu's Idle) and the portraits are 40x40 busts, neither of which matches 64-96px front battle sprites.

### Cited Findings
- Licence: the repo's `LICENSE.md` is the full "Attribution-NonCommercial 4.0 International" text. The README says submissions grant permission to "copy, redistribute, remix, and build upon the material", provided the work is "non-commercial" and "appropriate credit" is given. — [SpriteCollab README](https://github.com/PMDCollab/SpriteCollab); [LICENSE.md](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/LICENSE.md)
- CC BY-NC 4.0 defines NonCommercial as "not primarily intended for or directed towards commercial advantage or monetary compensation". Attribution requires crediting the creator as requested, a copyright notice, a reference to the licence and an indication of changes. — [LICENSE.md](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/LICENSE.md)
- Credit is per contributor. "By default you are credited by discord ID." Every species folder has a `credits.txt` (tab-separated: date, author, ..., animations covered). The repo root has `credit_names.txt` (Name / Discord / Contact) mapping IDs to display names, for example "Audino ... https://github.com/audinowho". — [README](https://github.com/PMDCollab/SpriteCollab); verified by fetching [sprite/0025/credits.txt](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/0025/credits.txt) and [credit_names.txt](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/credit_names.txt)
- Layout, verified via the GitHub API:
  - `sprite/<dex4>/` holds `AnimData.xml` plus `<Anim>-Anim.png`, `-Offsets.png` and `-Shadow.png` for 35 animations (Walk, Idle, Sleep, Attack ...). Form subfolders sit inside, such as `sprite/0025/0000`.
  - `portrait/<dex4>/` holds one PNG per emotion (Normal, Happy, Angry ... 18 for Pikachu).
  - Raw files are reachable at `raw.githubusercontent.com/PMDCollab/SpriteCollab/master/...`.
  - The repo root also has `tracker.json` (~10.5 MB), which records per-species completeness, credits and files.
  - Source: [GitHub contents API, sprite/0025](https://api.github.com/repos/PMDCollab/SpriteCollab/contents/sprite/0025)
- Measured sizes: `portrait/0025/Normal.png` is 40x40. `sprite/0025/Idle-Anim.png` is a 240x448 sheet with 40x56 frames (from AnimData.xml), which is 8 directions by 6 frames. — measured from [Normal.png](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/0025/Normal.png) and [AnimData.xml](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/0025/AnimData.xml)
- Coverage, from my count of `tracker.json` on 2026-10-19 (1,026 entries, #0000-#1025):
  - **Portraits:** every entry has one. 713 are "fully featured" and 313 "exists".
  - **Sprites:** 962 have one (201 full, 761 exists). 64 are missing, mostly Gen 5 and Gen 9, for example #0514, #0516, #1001-1003 and #1025.
  - **Forms:** 2,080 form subgroups across the tracker.
  - Source: [tracker.json](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json)
  - The status key ("⭐ Fully Featured", "✅ Exists", "⚪ Incomplete", "❌ Missing") is from the [README](https://github.com/PMDCollab/SpriteCollab).
- **Not all fan art.** The primary credit is `CHUNSOFT` (the official PMD developer; credit_names links spike-chunsoft.com) for 492 of 962 sprites and 492 of 1,026 portraits. The rest come from 44-48 distinct community artists, averaging 1.4 contributors per sprite and 1.8 per portrait. — my count of [tracker.json](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json); [credit_names.txt](https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/credit_names.txt)
- The repo is actively maintained: the last commit was 2026-10-19T01:57Z. — [GitHub commits API](https://api.github.com/repos/PMDCollab/SpriteCollab/commits?per_page=1)
- Other ways to get the art: the Discord bot (`!sprite`, `!portrait` return zipped sheets) and the website http://sprites.pmdcollab.org/. — [README](https://github.com/PMDCollab/SpriteCollab)
- The repo has a `license_history/` folder, which shows the licence has been tracked over time. I did not read its contents. — [README file listing](https://github.com/PMDCollab/SpriteCollab)

### Inferences
- For Dexora's variant model, the usable asset is the 40x40 portrait (Normal.png), which covers 100% of species. Alternatively, frame 0 of Idle-Anim facing down (40x56) is a walking-style sprite. Both would need nearest-neighbour upscaling (2x to 80px) to sit beside 64-96px sprites. PMD-style idle animation strips (Idle-Anim) map naturally onto the game's existing `.sprite-strip` mechanism.
- The CHUNSOFT half is Spike Chunsoft's official art. It is not "fan" art and it is already Nintendo/TPC-adjacent IP. CC BY-NC is applied by the collab, which may not hold those rights. Treat it like the game's existing official sprites, and credit "Spike Chunsoft / PMD Sprite Collab".
- Credit is practical: generate a per-species credit line from `tracker.json` (`primary` and `secondary` resolved through `credit_names.txt`), the same way `SAGE_CREDIT` works now.

### Gaps
- I did not read `license_history/`, so earlier licence terms and the date of any change are unverified.
- I did not verify whether shiny/recolor sprites (`sprite_recolor_link`) carry the same licence.

## Smogon Sprite Project (Gen 5/BW-style sprites for Gen 6-9, used by Pokemon Showdown)

### Takeaway
These are high-quality 96x96 BW-style sprites for Gen 6+ (Gen 1-5 on Showdown are the official BW sprites). Use is allowed free for non-profit projects with credit, but the terms also forbid redistribution and require a credit page linking the thread. That makes a static site that bundles the files a grey area; asking Layell (the project lead) is the documented route.

### Cited Findings
- From the Gen 8+ thread: "These sprites are also free for use as long as the spriter or the project itself is credited." and "For the sake of transparency, these sprites are free for non-profit use." The project covers BW-styled sprites for Gen 8 and beyond, with separate threads for Gen 6 (XY) and Gen 7 (SM), and spreadsheets track finished Gen 8 and Gen 9 sprites. — [Smogon Sprite Project thread](https://www.smogon.com/forums/threads/smogon-sprite-project.3647722/)
- The X/Y thread adds these rules:
  - "You must make a credit page and link back to this thread."
  - "Any games that charge money will not be accepted as a rule."
  - "Please do not redistribute these sprites as it gives the false impression you created all of them."
  - "These sprites are not open source, because we do not have the rights to the characters depicted."
  - Users should contact Layell about project-wide use.
  - Specs: 96x96, transparent, 15 colours max, front and back.
  - Source: [X/Y Sprite Project thread](https://www.smogon.com/forums/threads/x-y-sprite-project.3486712/)
- Pokemon Showdown's credits list "X/Y and Sun/Moon Sprite Projects led by Ian Clail [Layell]" and "Sun/Moon and Sword/Shield Sprite Projects led by [leparagon]". The page makes no usage statement. — [Pokemon Showdown credits](https://pokemonshowdown.com/credits)
- PokeAPI's sprites repo serves them in `versions/generation-v/black-white`, which states "The sprites with IDs greater than 650 are thus not official". It thanks Smogon "for allowing us to use and serve their custom B&W-style sprites". Its `showdown` folder is "battle animation sprites designed by the Smogon community". The repo is CC0 for its own text, but "All image contents within are Copyright The Pokémon Company." — [PokeAPI/sprites](https://github.com/PokeAPI/sprites); [LICENCE.txt](https://raw.githubusercontent.com/PokeAPI/sprites/master/LICENCE.txt)
- There is a dispute. One artist claimed Showdown/Smogon imported their sprites without permission. This is a single unverified claim surfaced by search. — [smogon.com post](https://www.smogon.com/forums/posts/10836127) (via search summary; not opened directly)

### Inferences
- Per-species files are reachable programmatically through the PokeAPI sprites repo (GitHub raw, numbered by dex id) and Showdown's sprite server. Coverage reaches Gen 9.
- They are BW-style, so they may look too much like the official DS sprites to read as a distinct variant. The animated `showdown` GIFs are likely what the game's existing "Showdown" tier already uses.
- The "do not redistribute" clause plus "credit page linking the thread" means: put a credits page with a link to the thread, contact Layell, and prefer hot-linking or self-hosting with explicit permission, as PokeAPI did.

### Gaps
- No official Smogon licence page exists; the terms live in forum OPs and can change.
- I did not verify per-sprite artist lists. The tracking spreadsheets are linked from the threads but were not opened.

## Pokemon Infinite Fusion custom sprites

### Takeaway
Not a good fit. The sprites are overwhelmingly fusions, I found no published reuse licence, and artists have asked for their work to be removed, which makes any reuse fragile.

### Cited Findings
- The Infinite Dex FAQ gives no permission or licence terms for reuse. Credit is claimed via Discord ("You'll need to go to the discord to claim credit"). Green entries are custom sprites by Discord artists. It describes the game as "non-profit, fan-made". — [Infinite Fusion Dex FAQ](https://infinitefusiondex.com/faq)
- After the late-2024 controversy over AI-written dex entries, many contributing artists asked for removal, and by 25 Dec an automated system deleted sprites on request. — [Twinfinite](https://twinfinite.net/?p=1010168) (search summary)

### Inferences
- Reuse needs per-artist permission obtained through the Discord. The removal-on-request history shows artists actively withdraw consent, so do not use these.

### Gaps
- I could not reach the Discord rules, so any official reuse policy is unverified. I also could not verify whether a complete set of non-fusion "base" custom sprites exists.

## PokeRogue sprites

### Takeaway
The assets are licensed CC-BY-NC-SA-4.0, but much of the art is GameFreak's own sprites plus Smogon Sprite Project work. The Smogon terms (no redistribution) still apply to that part, and ShareAlike would bind Dexora's derived art. This is not a clean distinct-style set.

### Cited Findings
- From the pokerogue-assets README: assets "are licensed under CC-BY-NC-SA-4.0 unless otherwise noted". Exceptions are listed in REUSE.toml files. Code is AGPL-3.0-only. — [pagefaultgames/pokerogue-assets](https://github.com/pagefaultgames/pokerogue-assets)
- CREDITS.md lists "GAMEFREAK (Pokémon Black/White 2)" first under Pokémon Sprites and Animation, then "Smogon Sprite Project (Various Artists)" and named community artists. It points to the PokeRogue wiki for per-sprite credits. — [PokeRogue CREDITS.md](https://raw.githubusercontent.com/pagefaultgames/pokerogue/beta/CREDITS.md)

### Inferences
- The BW-2-style art is official or Smogon-derived, so the style matches the existing sprite pool. The CC-BY-NC-SA licence is arguably not PokeRogue's to grant over GameFreak's or Smogon's art. Low value as a variant set.

### Gaps
- I did not read REUSE.toml for per-folder exceptions, or the wiki's per-sprite credits.

## Essentials "Generation 9 resource pack", Gen 3-style (GBA) fan sprites, the DS-style 64x64 resources and pokeemerald-expansion

### Takeaway
These are mostly compilations of the Smogon projects plus DS/GBA downscales. The GBA-style (64x64, Gen 3 look) Gen 6+ sprites come from PokeCommunity threads that usually ask only for credit to the thread. Several threads returned 403 to my fetches, so their exact terms are unverified.

### Cited Findings
- The Essentials v21.1 Gen 9 pack credits its battler sprites to veekun (Gen 1-5), the Smogon X/Y, Sun/Moon and Sword/Shield sprite projects (Gen 6-8) and the Smogon Sprite Project (PLA). — [PokeCommunity Gen 9 resource pack](https://www.pokecommunity.com/threads/generation-9-resource-pack-v21-1.527398/) (search summary; the page returned 403 to direct fetch)
- pokeemerald-expansion's CREDITS.md lists these resources:
  - "Sugimori Palettes and Sprites"
  - "DS Style Gen VI Sprites" (pokecommunity t=314422)
  - "Gen VII and Beyond Sprites" (pokecommunity t=368703)
  - Mega Evolution overworld sprites by princess-phoenix, larryturbo and kidkatt (DeviantArt)
  - Source: [pokeemerald-expansion CREDITS.md](https://raw.githubusercontent.com/rh-hideout/pokeemerald-expansion/master/CREDITS.md)
- The DS-style 64x64 resource threads ask users to "credit this thread if you do use any of the sprites". A later thread covers Gen VII+ with credits per post. A Gen III-style Hoenn thread says "free to use (credit if you like)". — [PokeCommunity DS-style 64x64 resource](https://www.pokecommunity.com/threads/the-ds-style-64x64-pok%C3%A9mon-sprite-resource-completed.267728/post-7444245) (search summary; the page returned 403); [PokeCommunity thread 436714](https://www.pokecommunity.com/threads/436714) (search summary; 403)
- The Smogon thread also points to a "GBA-sized DS-style project for Gen VII+" on PokeCommunity. — [Smogon Sprite Project thread](https://www.smogon.com/forums/threads/smogon-sprite-project.3647722/)

### Inferences
- Dexora already pins pokeemerald-expansion (for anims and follow). Its `graphics/pokemon/<species>/front.png` files are 64x64 GBA-style art for the whole dex, with Gen 4+ drawn from the threads above, so they are one fetch away at the existing pin. As a "Gen 3-look" variant that set is the most practical. Credit the three PokeCommunity threads, and confirm whether each thread's OP terms allow web-game use.

### Gaps
- I could not read any PokeCommunity OP directly (403), so their exact quoted terms are unverified.
- I did not confirm whether expansion's front sprites are distinct from the game's existing "ordinary" sprites. Check the repo's `graphics/pokemon` against `public/sprites`.

## SageDeoxys (other sets)

### Takeaway
SageDeoxys' DeviantArt terms allow use in a game provided the artist is informed and credited.

### Cited Findings
- On a DeviantArt spritesheet the terms read: use is allowed "so long as you inform me of its use, and credit me as the creator". — [S Meltan Spritesheet mirror](https://art.cleberg.net/post/sagedeoxys/S-Meltan-Spritesheet-765371916)

### Inferences
- Already in use. Make sure SageDeoxys has been informed, since that is a stated condition and not only credit.

### Gaps
- I found no catalogue of SageDeoxys' other complete sets or their coverage. "The Pokémon Sprite Project", as a distinct named project, was not found.

## Cross-cutting risks
- Every set depicts Nintendo/TPC/Game Freak characters. Smogon states plainly "not open source, because we do not have the rights to the characters depicted" ([X/Y thread](https://www.smogon.com/forums/threads/x-y-sprite-project.3486712/)). Fan licences cover only the artist's contribution.
- **Licence drift.** Smogon and PokeCommunity terms are forum text that can change at any time. PMDCollab keeps `license_history/` ([README](https://github.com/PMDCollab/SpriteCollab)). Infinite Fusion artists have withdrawn work ([Twinfinite](https://twinfinite.net/?p=1010168)).
- **Per-sprite attribution.** PMDCollab credits each folder through `credits.txt` and Smogon credits per spriter or the project. A machine-readable list exists only for PMDCollab (`tracker.json`).
- **NC/NC-SA.** Dexora's no ads/payments stance satisfies NC. ShareAlike (PokeRogue) would also bind any modified art Dexora ships.
