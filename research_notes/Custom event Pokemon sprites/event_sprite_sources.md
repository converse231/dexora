# Ready-made event-style Pokemon sprite sources for Dexora

Researched 2026-10-19. Repository listings were read directly from blobless git clones of PokeAPI/sprites (HEAD 2026-10-18) and PokeMiners/pogo_assets (HEAD 2026-10-08); counts below come from `git ls-tree` on those heads.

## 1. Official event forms in PokeAPI / Pokemon Showdown sprites

### Takeaway
PokeAPI already ships every official main-series "event" form Dexora could want: cosplay Pikachu (10080-10085), the cap Pikachu (10094-10099, 10148, 10158, 10160) and Spiky-eared Pichu. Dexora's `forms.js` already holds the costume Pikachu and Spiky-eared Pichu (as a look, id 19065), so this pool is used up. PokeAPI has no Pokemon GO costume forms. Nothing new is ready-made in the game's own style.

### Cited Findings
- PokeAPI/sprites has `sprites/pokemon/` (default front, 96px in the repo's convention), `back/`, `shiny/`, `other/{dream-world,home,official-artwork,showdown}` and `versions/generation-i..ix` — [git ls-tree of github.com/PokeAPI/sprites](https://github.com/PokeAPI/sprites)
- `other/home` is 512x512 PNG with female, shiny and shiny-female variants, and `other/showdown` is GIFs: "This folder contains battle animation sprites designed by the Smogon community." — [PokeAPI/sprites README](https://github.com/PokeAPI/sprites)
- Spiky-eared Pichu exists as `172-spiky-eared.png` in default, back, shiny, official-artwork, `versions/generation-iv/heartgold-soulsilver` (static plus animated), `generation-iv/icons`, `generation-v/black-white` and `generation-v/icons` — [PokeAPI/sprites tree](https://github.com/PokeAPI/sprites)
- `other/showdown/` holds animated GIFs for cosplay Pikachu 10080-10085 and cap Pikachu 10094-10099, 10148, 10158 and 10160 (1,283 numbered GIFs in all) — [PokeAPI/sprites tree](https://github.com/PokeAPI/sprites)
- Other families with drawn alternates (Unown 201-*, Burmy 412-*, Cherrim 421-sunshine, Deerling and Sawsbuck seasons 585/586-*, Vivillon 666-*, Flabebe line 669-671-*, Furfrou 676-*) are in the tree, but these are regular forms, not event costumes — [PokeAPI/sprites tree](https://github.com/PokeAPI/sprites)
- The PokeAPI/sprites licence is CC0 1.0 for the repo's own work, but its notice says the images themselves are copyrighted by The Pokemon Company and so are not covered by CC0 — [LICENCE.txt](https://raw.githubusercontent.com/PokeAPI/sprites/master/LICENCE.txt)
- PokeAPI's README thanks "the Smogon community for allowing us to use and serve their custom B&W-style sprites" — [PokeAPI/sprites README](https://github.com/PokeAPI/sprites)
- play.pokemonshowdown.com/sprites/ lists 63 directories, including per-generation sets (gen1 to gen6, gen5ani, ani, ani-shiny), `home`, `dex`, `afd` (+back/shiny), `trainers-custom` and `misc` — [play.pokemonshowdown.com/sprites/](https://play.pokemonshowdown.com/sprites/)
- The Showdown client repo's LICENSE is AGPLv3 and says nothing about sprites or art — [pokemon-showdown-client LICENSE](https://github.com/smogon/pokemon-showdown-client/blob/master/LICENSE)
- Local check: `src/data/forms.js` already contains `pikachu-rock-star` (10080), `pikachu-original-cap` (10094) and `pichu-spiky-eared` (19065, `form: "look"`, of 172) — repo file `src/data/forms.js`

### Inferences
- The official event-form pool in Dexora's art style is exhausted. Anything further means GO art (a different style) or custom art.
- `afd` is most likely Showdown's April Fools' Day joke sprite set. That is inferred from the name only; its contents and authorship were not opened. Even if it is, it is a full-dex joke restyle, not seasonal costumes.

### Gaps
- Showdown's credits page (play.pokemonshowdown.com/credits.php) returned 404, so no Showdown-side statement on reusing its sprites was found.
- The `afd` folder's contents and terms were not verified.

## 2. Pokemon GO costume assets (PokeMiners pogo_assets)

### Takeaway
PokeMiners holds the largest ready-made set of real event costumes: 218 costumed icons over 108 species, plus shiny versions, at 256x256. They are 3D-rendered GO icons, though, not pixel sprites, so they would clash with FireRed/HGSS/BW art. The repo's only terms are "educational use only" and that all content is The Pokemon Company's and Niantic's. Use them as reference for which costumes officially exist, not as shippable art.

### Cited Findings
- README Disclaimer: "This repo is for educational use only." / "All content found within this repo is the property of The Pokemon Company and Niantic." / "Please respect the original source material." No software or art licence is given — [PokeMiners/pogo_assets](https://github.com/PokeMiners/pogo_assets)
- `Images/` has 80+ folders, including `Pokemon - 256x256`, `Pokemon`, `Pokemon HOME`, `Unique Pokemon Icons`, `Halloween 2022`, `Winter 2022`, `GO Fest 2020-2022` and `GO Tour - Kanto/Johto/Hoenn` — [pogo_assets tree](https://github.com/PokeMiners/pogo_assets)
- `Images/Pokemon - 256x256/Addressable Assets` holds 3,836 files. Costumes are coded `pmNNN.c<EVENT>`, for example `pm172.cHOLIDAY_2016`, `pm172.cHALLOWEEN_2017`, `pm25.cGOTOUR_2023_HAT`, `pm25.cFALL_2023_NOEVOLVE` and `pm1.cJAN_2020_NOEVOLVE`, with `.s.` for shiny and `.g2.` for Pikachu's female. Excluding shiny and female there are 218 costume icons over 108 species. Pikachu has 34, Raichu 14 and Pichu 10, and the Eeveelutions about 4-5 each — [pogo_assets tree](https://github.com/PokeMiners/pogo_assets)
- Bulbagarden notes Niantic's "Addressable Assets" carry internal costume names that are "not 100% accurate" (Winter 2018 forms released in 2019), and that GO's 025S is Summer Pikachu while the main games' is the Sinnoh cap — [Bulbagarden Archives, Category talk: Pokemon GO models](https://m.archives.bulbagarden.net/wiki/Category_talk:Pok%C3%A9mon_GO_models)
- Pokepedia hosts GO costume sprites such as Halloween Piplup as Niantic's art — [Pokepedia file page](https://www.pokepedia.fr/Fichier:Sprite_0393_Chenapans_d'Halloween_GO.png)

### Inferences
- The GO icons are 256px shaded 3D renders. Downscaled to 64-96px they would read as a different art style beside BW pixel sprites. For a pixel game they work best as a design brief: a custom spriter can draw "Holiday Delibird" or "Party Hat Pikachu" in BW style from them.
- The 218 event codes (HOLIDAY, HALLOWEEN, FALL, WINTER, SPRING, ANNIVERSARY, GOFEST, GOTOUR) are a ready-made catalogue of officially sanctioned costume ideas per species.

### Gaps
- The exact sizes of the non-256 `Images/Pokemon` folder were not measured.
- No terms beyond the README disclaimer exist to quote.

## 3. Smogon Create-A-Pokemon (CAP)

### Takeaway
No published licence or reuse permission for CAP Pokemon was found. They are new species, not costumes of existing ones, so they do not fit "event variants" anyway. Skip them.

### Cited Findings
- The CAP site has no usage statement. Its footer reads "All guides and strategy information are © 2004 Smogon.com and its contributors. Pokémon is © 1995 Nintendo." — [smogon.com/cap](https://www.smogon.com/cap/)
- CAP Pokemon are made by community polls run by CAP moderators and are playable on Showdown — [Create-A-Pokemon Project](https://www.smogon.com/cap); [CAP Forum Rules](https://www.smogon.com/forums/threads/cap-forum-rules-read-this-first.38287/)
- Pokebase answers treat CAP as fan-made, not official (one explains why Fidgit is not on PokemonDB) — [Meta-PokeBase Q&A](https://pokemondb.net/pokebase/meta/31670/why-isnt-fidgit-on-this-site?show=31707)

### Inferences
- Using CAP would mean asking Smogon CAP staff for permission and adding new species to a dex keyed by position. It is a bad fit for limited-time variants of existing species.

### Gaps
- No explicit CAP art licence was found, and permission is unverified either way.

## 4. Fan pixel artists and community resource packs (free with credit)

### Takeaway
The community norm is "free for non-profit use with credit to the spriter or project". That is how Smogon's BW-style projects word it, and those projects already supplied PokeAPI's Gen 6+ BW-style sprites. No ready-made pack of holiday or costume variants in BW/HGSS style was found on PokeCommunity, itch.io or DeviantArt. Finds are scattered one-offs, mostly icons or a different style, so expect to commission or edit art.

### Cited Findings
- Smogon Sprite Project (BW-style sprites for Gen 8 and beyond): "These sprites are also free for use as long as the spriter or the project itself is credited." and "For the sake of transparency, these sprites are free for non-profit use." — [Smogon Sprite Project](https://www.smogon.com/forums/threads/smogon-sprite-project.3647722/)
- The X/Y Sprite Project gives the same credit and non-profit terms. A search summary also says it asks for notice to the manager before use, which was not confirmed on the page — [X/Y Sprite Project](https://www.smogon.com/forums/threads/x-y-sprite-project.3486712/); [Smogon post](https://www.smogon.com/forums/posts/10836127)
- PokeCommunity packs carry per-pack terms. Earthretha Fakemon Pack: "Everything in this pack is free to use and edit with credits!" ([thread](https://www.pokecommunity.com/threads/earthretha-fakemon-pack.527306/)). Gen 2-style 56x56 resource: "Anyone can use as long as proper credit is given" ([thread](https://www.pokecommunity.com/threads/gen-2-style-56x56-sprite-resource.396947/)). An Ash regional-costume pack (trainer, not Pokemon) asks for credit and "avoid illegal distribution of sprites on other websites" ([thread](https://www.pokecommunity.com/threads/409753)).
- Essentials resource packs are built on the same sources. The Gen 9 pack for v21.1 credits veekun for Gen 1-5 sprites and the Smogon sprite projects for Gen 6-8 and PLA — [Generation 9 resource pack v21.1](https://www.pokecommunity.com/threads/generation-9-resource-pack-v21-1.527398/). A fan game's credits page credits the Smogon Sprite Project and its contributors — [Pokemon Valhalla credits](https://www.mintlify.com/espparki1/PokemonValhalla/resources/credits)
- DeviantArt has scattered holiday pieces, not packs. Ultragriffy's Christmas Plusle and Minun are 50x50 animated icons offered "to use as display pictures or pokemoticons" ("the animation is mine, while the character concept is originally from Pokémon") — [Christmas Minun](https://www.deviantart.com/ultragriffy/art/Christmas-Minun-419733037), [Christmas Plusle](https://www.deviantart.com/ultragriffy/art/Christmas-Plusle-419732909). A 32x32 "Merry Chu Christmas" Pikachu shows no terms — [Pika](https://www.deviantart.com/may78654/art/Pika-137752477)
- The itch.io Pokemon-style packs found are trainers or generic monsters, not costume Pokemon. Examples: Mad Professor (credit required, no redistribution), Retro RPG character pack (CC BY 4.0) and Monster Pack FREE — [Mad Professor](https://ianskelskey.itch.io/mad-professor); [Retro RPG character pack](https://the-pixel-nook.itch.io/retro-rpg-character-pack); [Monster Pack FREE](https://empty-shells.itch.io/monster-pack-free)
- Spriters Resource's FAQ (per a search snippet; the page returned 403 to direct fetch) says its resources "are all copyrighted works and as such, cannot be used in any commercial project without express written consent from their copyright holders" — [Spriters Resource FAQ](https://spriters-resource.com/page/faq)

### Inferences
- Credit is the cost of community art. A credits section naming each spriter and project (as Dexora's README already does for tilesets) meets the norm.
- Cheapest in-house route: edit an existing BW sprite (add a hat or recolour) yourself. The base sprite's Smogon credit still applies if it is a Gen 6+ community sprite.

### Gaps
- Reddit r/PokemonRMXP was not searched directly, and no costume-specific pack was confirmed there.
- The Spriters Resource "Custom/Edited" section's terms were unreadable (403).

## 5. Commission market

### Takeaway
A single static Pokemon-style sprite around 50-64px commonly runs about $10-$50, and a BW-style 128px piece about $30. Animated or multi-view sets (front, back, icon) cost more, with Fiverr budgets reported from $50 up to $200-$400 for small sets. This comes from a handful of listings, not a survey.

### Cited Findings
- Tigerhorse's pixel commissions: 50x50 full-body $12, Pokemon BW-style 128x128 $30 — [tigerhorse-pixel-commissions.carrd.co](https://tigerhorse-pixel-commissions.carrd.co)
- Roseate: animated sprites $20, "price very much depends on complexity" — [roseatecomms.carrd.co](https://roseatecomms.carrd.co/)
- Fiverr: pollorenz offers 64x64 fakemon sprites (reviews list budgets "Up to $50"), lightsabit $20/hour, and yogurcomics reviews range from $50-$100 to $200-$400, one for three fakemon (front, back, icon) — [pollorenz](https://fiverr.com/pollorenz/make-sprite-of-custom-pokemon); [lightsabit](https://www.fiverr.com/lightsabit); [yogurcomics](https://fiverr.com/yogurcomics/create-a-sprite-sheet)
- Apophyll asks for 40% upfront, and finished sheets are non-refundable — [apophyll.carrd.co](https://apophyll.carrd.co/)
- Dogmatical's gig sells a "Commercial Use License" as an extra, which shows licences are often tiered — [Fiverr dogmatical](https://fiverr.com/dogmatical/do-pixel-art-or-sheet-for-video-game)

### Inferences
- A handful of event Pokemon (say 4-6, front only, BW-sized static) would plausibly cost $60-$300 per event. A shiny recolour or a strip animation adds to that.
- When commissioning, get in writing that the artist permits use in a free browser game, lets you ship derived recolours or tier filters, and how they want to be credited.

### Gaps
- No r/HungryArtists price posts surfaced.
- No turnaround times were stated in the sources found.
- How fan games credit commissioned art specifically was not found beyond the general credits-page practice in item 4.

## 6. Licensing reality

### Takeaway
Every route, PokeAPI included, uses designs owned by Nintendo, Game Freak and The Pokemon Company. Community terms ("non-profit, credit") cover only the spriter's own work, never the IP. Nintendo has taken down high-profile fan games, which made fan devs cautious about release and marketing. Dexora's non-commercial stance and crediting are the norm, not a licence.

### Cited Findings
- PokeAPI's CC0 explicitly does not cover the images, which are TPC-copyrighted — [PokeAPI LICENCE.txt](https://raw.githubusercontent.com/PokeAPI/sprites/master/LICENCE.txt)
- PokeMiners: content is "the property of The Pokemon Company and Niantic", "for educational use only" — [pogo_assets](https://github.com/PokeMiners/pogo_assets)
- Pokemon Uranium (2016) got a DMCA from Nintendo, and its download links were removed — [Wikipedia: Pokemon Uranium](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Uranium). Pokemon Prism got a cease-and-desist in December 2016 — [Nintendo Life](https://nintendolife.com/news/2016/12/fan-made_pokemon_prism_game_leaks_online_after_nintendo_shutdown_notice); [Wikipedia: Pokemon Prism](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Prism). The takedowns made fan creators "more cautious about the release and marketing of their own projects" — [Wikipedia: Pokemon Prism](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Prism)
- An itch.io commenter's rule of thumb: "you can't use sprites from the actual games but a lot of fans have made resources for fan games and romhacks" — [itch.io post](https://itch.io/post/1968293)

### Inferences
- The lowest-risk event art is custom-drawn variants of existing species with the spriter credited and permission recorded, kept non-commercial. GO assets carry the most explicit "property of TPC and Niantic" warning of all the sources.

### Gaps
- No official TPC or Nintendo fan-content policy covering fan games was found or quoted.
