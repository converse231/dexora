# Pokémon Generation 10 and PokeAPI: status and likely arrival (as of 19 October 2026)

## What are the Gen 10 games, when were they announced and released, and how many new species are known?

### Takeaway
Gen 10 is **Pokémon Winds and Pokémon Waves** (Game Freak, Nintendo Switch 2). They were announced on 27 Feb 2026 and are due out in **2027 with no exact date**. As of 19 Oct 2026 only **three new species are officially revealed** (the starters Browt, Pombon and Gecqua), plus two costume Pikachu.

### Cited Findings
- Announced 27 February 2026 at the Pokémon Presents marking the 30th anniversary. The developer is Game Freak, the platform is Nintendo Switch 2, the release is "2027" with no exact date, and the region is a tropical archipelago modelled on Southeast Asia. — [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Winds_and_Waves); [Variety](https://variety.com/2026/gaming/news/pokemon-winds-waves-new-games-starters-release-date-1236674619/)
- Officially "exclusively on Nintendo Switch 2 in a simultaneous worldwide release in 2027". An exact date has not been announced. — [Gematsu game page](https://www.gematsu.com/games/pokemon-winds-waves) (via search summary); [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Winds_and_Waves)
- The new starters are Browt (Grass), Pombon (Fire) and Gecqua (Water). — [GosuGamers](https://www.gosugamers.net/entertainment/news/78050-pokemon-winds-waves-officially-revealed-with-new-starters-browt-pombon-and-gecqua); [Nerdist](https://nerdist.com/article/pokemon-winds-waves-new-starter-pokemon-gen-10-starters/)
- The trailer also showed two dressed-up Pikachu, "Mr. Windychu" and "Ms. Wavychu". They are not new species. — [Nerdist](https://nerdist.com/article/pokemon-winds-waves-new-games-share-trailer-release-dates-and-starters/) (via search summary)
- On 28 Sep 2026 CBR counted **54 Pokémon "officially confirmed"** for the regional dex from official trailer imagery. Apart from the three starters, all of them are **returning** species (e.g. Oddish, Taillow, Eeveelutions). — [CBR, 28 Sep 2026](https://www.cbr.com/pokemon-winds-waves-reveals-54-pokemon-gen-10/)
- **Unverified leaks:** VICE reported on 8 Jul 2026 a leak claiming more than 300 new Pokémon (cited in [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Winds_and_Waves)). Leakers also disagree on the release month: [VICE](https://www.vice.com/en/article/pokemon-winds-and-waves-release-pushed-to-late-2027-according-to-popular-leaker/) reports "late 2027" (Riddler Khu) and [Ground News / Centro Leaks](https://ground.news/article/leak-mentions-release-months-for-pokemon-winds-and-waves-and-new-3d-mario-2027) reports September 2027. A leaked 4chan inventory screen hints at starter evolutions, also unconfirmed. — [CBR](https://www.cbr.com/pokemon-winds-waves-starter-evolutions-revealed/)

### Inferences
- Every past mainline generation launched in Oct–Nov: X/Y in Oct 2013, SwSh on 15 Nov 2019, SV on 18 Nov 2022. With the 2027 window, the most likely launch is **Sep–Nov 2027**. This is an estimate, not a confirmed date.
- The full new-species list will only be known at launch or from datamines at launch. Pre-release reveals usually amount to a dozen or two species.

### Gaps
- I found no official Pokémon Presents or trailer after Feb 2026 that revealed further species. A September 2026 trailer could not be confirmed.
- Nintendo Life's live Pokédex tracker returned HTTP 403, so its current count was not read.

## Is any Gen 10 data already in PokeAPI?

### Takeaway
**No.** As of 19 Oct 2026, pokeapi.co serves 1,025 species (Gen 1–9) and 1,351 Pokémon entries; the extra entries are forms, including the Legends: Z-A and Champions Megas. No issue or PR in PokeAPI/pokeapi or PokeAPI/sprites adds Gen 10. Current work is on Champions, Z-A details and refactors.

### Cited Findings
- `GET /api/v2/pokemon-species` returns `count: 1025`. — [pokeapi.co](https://pokeapi.co/api/v2/pokemon-species?limit=1) (fetched 19 Oct 2026)
- `GET /api/v2/pokemon` returns `count: 1351`. The last entries are new Megas such as golisopod-mega (10316), magearna-mega, zeraora-mega, scovillain-mega, glimmora-mega, the tatsugiri-*-mega forms, baxcalibur-mega, and meowstic-female-mega (10326). — [pokeapi.co](https://pokeapi.co/api/v2/pokemon?offset=1340&limit=100)
- None of the 40 most recently updated issues and PRs in PokeAPI/pokeapi (to 19 Oct 2026) concerns Gen 10. The only Winds/Waves mention is in #1544, about PT-BR becoming an official language in that future game. — [GitHub API, pokeapi issues](https://api.github.com/repos/PokeAPI/pokeapi/issues?state=all&per_page=40&sort=updated)
- Recent activity:
  - #1701 "Add champions sprites, reformat sprite config", merged 2026-10-16.
  - #1700, an issue opened 2026-10-15 about missing Legends Z-A evolution details for Runerigus.
  - #1698 "Add gen 9 sprites to the sprite config", closed 2026-10-13.
  — [GitHub PR 1701](https://api.github.com/repos/PokeAPI/pokeapi/pulls/1701); [issues list](https://api.github.com/repos/PokeAPI/pokeapi/issues?state=all&per_page=40&sort=updated)
- In PokeAPI/sprites, issues and PRs from Oct 2025 to Oct 2026 (the first ~37 read) cover Z-A Megas, badges, renames and Gen 7 animated sprites. None concerns Gen 10. — [GitHub API, sprites search](https://api.github.com/search/issues?q=repo:PokeAPI/sprites+created:2025-10-01..2026-10-19&sort=created&order=asc&per_page=60)

### Inferences
- Nothing about Gen 10 can enter PokeAPI before release: only three species exist, with names and art but no stats.
- Early fan-made entries for pre-release reveals have no precedent in this history. The Gen 9 data PR came 8 days *after* launch (see the next section).

### Gaps
- The second half of the sprites search results (items after #217, Apr–Oct 2026) was truncated and not read. A Gen 10 mention there is unlikely but not ruled out.
- PokeAPI/api-data, the repo whose static JSON pokeapi.co serves, was not checked directly. Its contents follow the pokeapi repo's CSVs.

## Precedent: how fast did PokeAPI and its sprites repo add Gen 9, Gen 8 and Z-A Megas?

### Takeaway
After the data pipeline was reworked (Veekun dependency dropped), PokeAPI became fast:
- **Gen 9:** species, stats and abilities merged **16 days after launch**. Official artwork followed after ~2 months, and front sprites in the third month.
- **Z-A Megas:** in the API **one day after launch**. Sprites and official art took 2–3 months.
- **Gen 8:** the slow outlier, **~14 months** to close. PokeAPI waited on Veekun's CSVs, which never arrived.

### Cited Findings
**Gen 9 (Scarlet/Violet launched 18 Nov 2022):**
- #778 "add partial information from Pokémon Scarlet and Violet" was merged **2022-12-04**. It added all new species (some data missing), all new abilities, and base stats and EVs. — [PR 778](https://api.github.com/repos/PokeAPI/pokeapi/pulls/778)
- Follow-up data PRs:
  - SV moves (#783), merged/closed 2022-12-03.
  - SV Pokémon names, forms and Pokémon (#793), opened 2022-12-09, closed 2023-01-08.
  - Items (#787), closed 2023-01-14.
  - Abilities table (#795), closed 2023-01-14.
  - Fix to wrong Gen 9 Pokémon ids (#821), 2023-01-16.
  - GraphQL missing Paldea (#820), fixed 2023-02-11.
  - Flavor text for Paldea up to #1008 (#889), 2023-06-13.
  - SV DLC1 learnsets (#920), 2023-10-10.
  - Stellar type (#1075), May 2024.
  — [GitHub search, pokeapi "scarlet violet"](https://api.github.com/search/issues?q=repo:PokeAPI/pokeapi+scarlet+violet&sort=created&order=asc&per_page=30)
- PokeAPI/sprites:
  - "Gen 9 artwork" (official artwork, #98) was merged **2023-01-23**, ~2 months after launch.
  - Shiny Gen 9 official artwork (#100) followed on **2023-01-27**.
  - "Add front_default sprites for gen9" (issue #101) was closed **2023-02-05**.
  - "add showdown type sprites" (#105) was merged **2023-04-11**.
  - "Default sprites for Walking Wake and Iron Leaves" (#115, species released Feb 2023) was closed **2023-05-15**.
  — [GitHub search, sprites gen 9](https://api.github.com/search/issues?q=repo:PokeAPI/sprites+gen+9+OR+paldea+OR+scarlet&sort=created&order=asc&per_page=40)
- Gaps were still open years later. Issue #930 "Missing names for SV and DLC" and #1029 "Gen 9 TMs missing" are still open. In Oct 2026, #1698 was still adding gen 9 sprites to the sprite config. — [same search](https://api.github.com/search/issues?q=repo:PokeAPI/pokeapi+scarlet+violet&sort=created&order=asc&per_page=30); [issues list](https://api.github.com/repos/PokeAPI/pokeapi/issues?state=all&per_page=40&sort=updated)

**Gen 8 (Sword/Shield launched 15 Nov 2019):**
- Issue #460 "Sword & Shield Pokemon" (opened 2019-12-11) shows the delay. On 2019-12-11 the maintainers said they were waiting for Veekun's CSVs. On 2020-08-17 they announced a Veekun fork and a Bulbapedia proof-of-concept that added some Gen 8 properties. The issue was closed **2021-01-08** with "Closing since we added gen-8 pokemons". — [issue 460 comments](https://api.github.com/repos/PokeAPI/pokeapi/issues/460/comments?per_page=50)
- PokeAPI/sprites "Sprites Gen 8" (#34) was merged **2020-09-28**, ~10 months after launch. — [sprites search](https://api.github.com/search/issues?q=repo:PokeAPI/sprites+gen+9+OR+paldea+OR+scarlet&sort=created&order=asc&per_page=40)

**Legends: Z-A Megas (launched 16 Oct 2025):**
- Data in PokeAPI/pokeapi:
  - #1317 "add lumiose city pokedex and new megas" was merged **2025-10-17**, one day after launch.
  - Mega Dimension DLC Megas: "add hyperspace pokedex and new megas" (#1350), closed 2025-12-10.
  - English names for the new Megas (#1371), 2026-01-20.
  - The "New Megas Don't Have Moves" issue (#1506) stayed open until 2026-09-07.
  — [PR 1317](https://api.github.com/repos/PokeAPI/pokeapi/pulls/1317); [GitHub search, mega](https://api.github.com/search/issues?q=repo:PokeAPI/pokeapi+mega+created:2025-10-01..2026-06-30&sort=created&order=asc&per_page=40)
- PokeAPI/sprites:
  - "Adding missing sprites for new mega Pokémon" (#187), merged **2025-12-13**.
  - "Add the new showdown sprites" (#189), merged **2025-12-28**.
  - "Add the majority of official assets for mega evolutions" (#192), merged **2026-01-15**.
  - Shiny Mega official art (#193), merged **2026-01-30**.
  - Z-A megastones (#197), merged **2026-02-18**.
  — [sprites search 2025-10..2026-10](https://api.github.com/search/issues?q=repo:PokeAPI/sprites+created:2025-10-01..2026-10-19&sort=created&order=asc&per_page=60)

### Inferences
- Projected onto a Sep–Nov 2027 Winds/Waves launch:
  - **Species, stats and types:** ~1–3 weeks after launch, i.e. by about Dec 2027.
  - **Official artwork:** ~1–3 months after launch.
  - **Default front sprites and Showdown sprites:** ~2–4 months after launch, likely **Q1 2028**.
  - **Flavor text, learnsets and names:** months to years, with long tails.
  This is an estimate from two precedents.
- Gen 10 will likely bring 100+ species. That is a bigger job than the ~40 Z-A Megas, so expect the Gen 9 timeline rather than the Z-A one.
- **Impact on Dexora (estimate):** `npm run assets` reads PokeAPI. A Gen 10 append is practical once both the species/pokemon endpoints and front sprites exist, so plan for **early 2028**. New national dex ids would start at 1026, but forms already occupy 10001+. Under the project's append-only rule, Gen 10 species would append after the existing forms in `SPECIES` order. That follows from CLAUDE.md, not from any source.

### Gaps
- I did not establish when the pokeapi.co deployment (api-data regeneration) followed each merge. Merges are dated, but the live-site dates were not verified.
- #793 (SV Pokémon/forms) shows only a closed date; the GitHub API returned 403 when checked for merge status.

## Where do new-generation sprites appear first?

### Takeaway
I could not date this from primary sources. In the PokeAPI/sprites repo itself, Showdown-style Gen 9 sprites landed ~5 months after launch (Apr 2023), and Showdown Megas for Z-A ~2.5 months after launch (Dec 2025). Smogon's community Sprite Project is the upstream source for Showdown sprites.

### Cited Findings
- Smogon's Sprite Project thread covers Gen 8 onward, including Gen 9. Showdown sprites typically come from it, but the search did not surface dated posts. — [Smogon forum post](https://www.smogon.com/forums/goto/post?id=9221503) (via search summary)
- A PokéBase question from Jan 2025 asked when the "big versions of the gen 9 sprites" would arrive, which suggests high-resolution Gen 9 sprites were still pending then. — [PokemonDB PokéBase](https://pokemondb.net/pokebase/meta/user/H3X/activity) (via search summary; unverified detail)
- PokeAPI/sprites dates: "add showdown type sprites" merged 2023-04-11; "Add the new showdown sprites" merged 2025-12-28. — [sprites search](https://api.github.com/search/issues?q=repo:PokeAPI/sprites+gen+9+OR+paldea+OR+scarlet&sort=created&order=asc&per_page=40); [sprites search 2025-26](https://api.github.com/search/issues?q=repo:PokeAPI/sprites+created:2025-10-01..2026-10-19&sort=created&order=asc&per_page=60)

### Inferences
- Bulbagarden Archives and Serebii typically post official artwork and 3D model renders within days of launch. This comes from general knowledge and was **not verified** this session. They are the earliest art sources, but not in PokeAPI's file layout.

### Gaps
- No primary dates were found for when smogon/sprites or play.pokemonshowdown.com/sprites gained Gen 9 sprites, or for Bulbagarden or Serebii. Checking the commit log of github.com/smogon/sprites would settle it.

## New Pokémon available before Gen 10

### Takeaway
The near-term new content is Megas and forms, not species, and they are **already in PokeAPI**. They come from Legends: Z-A, its Mega Dimension DLC and Pokémon Champions; the API runs to form id 10326 with sprites mostly done. Gen 10 adds no new data until 2027.

### Cited Findings
- New Megas in the live API include golisopod-mega, magearna-mega, zeraora-mega, scovillain-mega, glimmora-mega, three tatsugiri Megas, baxcalibur-mega and meowstic-female-mega (ids 10316–10326). — [pokeapi.co](https://pokeapi.co/api/v2/pokemon?offset=1340&limit=100)
- Champions has been added:
  - "Add Pokemon Champions and New Mega Abilities" (#1480), closed 2026-04-10.
  - Champions v1.0 learnsets (#1532), 2026-06-24.
  - Mega Raichu abilities (#1539), 2026-06-05.
  - Champions 1.1.0 Megas and abilities (#1559), 2026-06-23.
  - "Add new Mega Z abilities coming to Champions" (#1664), 2026-09-02.
  - "Add new mega abilities and Pokemon added Champions 1.2" (#1672), 2026-09-10.
  - Champions sprites (#1701), merged 2026-10-16.
  — [GitHub search, mega](https://api.github.com/search/issues?q=repo:PokeAPI/pokeapi+mega+created:2025-10-01..2026-06-30&sort=created&order=asc&per_page=40); [GitHub search, z-a/mega desc](https://api.github.com/search/issues?q=repo:PokeAPI/pokeapi+%22z-a%22+OR+%22legends+za%22+OR+mega&sort=created&order=desc&per_page=40); [PR 1701](https://api.github.com/repos/PokeAPI/pokeapi/pulls/1701)
- Mega Garchomp Z artwork was merged into sprites on 2026-04-02. — [sprites search 2025-26](https://api.github.com/search/issues?q=repo:PokeAPI/sprites+created:2025-10-01..2026-10-19&sort=created&order=asc&per_page=60)

### Inferences
- For Dexora, the practical "new Pokémon" before 2028 is appending the Z-A and Champions Megas (and any later Champions patches) as forms. They are live in PokeAPI with sprites. Whether the project's form fetchers already pick them up was not checked.

### Gaps
- I did not determine whether Champions or Winds/Waves will add more regional forms before 2027 beyond the Megas listed.
