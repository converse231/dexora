# The world: connected maps

Asked for on 2026-10-16: spread the Pokémon more evenly with more maps, finish
the buildings that lead nowhere, and join the maps into one world that makes
sense - caves inside mountains, buildings inside routes - without anyone
getting lost or any save breaking. Change a decision here first.

## Decisions (your calls, 2026-10-16)

| | Decision |
|---|---|
| Shape | **The mainland is Hoenn**, joined by real roads; **Kanto is islands by ferry** (Lavender, Cinnabar, the Sevii stops), each the doorstep of its dungeon. Walking all of Kanto would need ~15 more maps. |
| The Mansion | **Stays behind Monsoon Trail's door** (the Weather Institute's) - no Cinnabar move. |
| Towns | **Streets and doors to dungeons only** - no Pokémon Center or Mart interiors. |
| The ferry *(2026-10-17)* | **Leaves from Lilycove City** (Emerald's own port). **A map with no town at its door is a stop itself, docked at its way in** - Mt. Moon, Frost Hollow, Tanoby Ruins and Tall Grass - so no new encounter map: Route 4 would have meant a new spawn table and a League re-solve, and Route 20 and Tanoby's route are open sea. |

## Rules

- **Area ids never change** (saves store them). New maps get new ids; a map
  replaced under its id (the Power Plant as New Mauville, later) keeps it, and
  `createEngine` already moves a save standing on rock to the spawn.
- **A road is doors on the edge.** `ROADS` in build_map.py names two maps'
  shared edge (the games' own `connections` and offsets); `open_roads` opens
  each cell walkable on both sides and pairs them as doors - stepping off one
  map's edge lands you on the first cell inside the other's, facing the same
  way. A door on a map's outer ring IS a road (`exitsOf` in map.js).
- **Levels still decide what opens.** A road or door to a map your level has
  not opened stays shut and says when it opens (`enterDoor`), and the
  signpost says so before you get there. Levels are never reordered to fit
  geography - that re-solves the League and can send players home.
- **Nobody gets lost:** the signpost on the area card names the exit you are
  near (`exitNear`), the Map tab's world map draws every road and door from
  the door data itself, and Travel still goes anywhere you have opened.
- **tools/play rides every door and road cell both ways** on every map,
  landing on its paired tile and back where it started.

## Phases

| | Phase | State |
|---|---|---|
| 1 | Roads, signposts, the world map; join what already touches | **done** (2026-10-16): Cinderpeak ↔ Mirage Desert (Route 112 / 111, 10 road cells), Seaside Road's New Mauville door ↔ the Power Plant |
| 2 | Buildings and caves | **done** (2026-10-16): Jagged Pass and the Fiery Path are Cinderpeak's floors 3 and 4 (no new art - Lavaridge), the real warps between them, and Jagged Pass's hideout door ↔ Ember Caldera's way in; the Weather Institute, both floors, behind its own door (Lab + Emerald's Building, 176 metatiles), and the Mansion moved to Monsoon Trail's house door. **Left as they are:** the Power Plant keeps FireRed's art behind New Mauville's door (redrawing it as New Mauville was never asked for and costs two tilesets), and Trainer Hill stays shut - its lobby is ~800 metatiles of art and the game has no counter to talk to. |
| 3 | Hub towns and the roads between them | **done** (2026-10-16): three TOWNS (Mauville City, Fortree City, Fallarbor Town - streets and doors, no encounters, no biome, always open) and five ROUTES (117 Lv 7 Fairy/Grass/Bug, 118 Lv 10 Water/Flying, 113 Lv 22 Steel/Normal/Ground, 121 Lv 27 Ghost/Grass, 114 Lv 28 Rock/Dragon), all through `em_route`; 12 roads and two new doors (Route 114 ↔ Meteor Falls, Route 121 ↔ the Safari Zone, its lobby collapsed); four houses as rooms (the Day Care, the Glass Workshop, the Fossil Maniac's, Lanette's). 18 maps form ONE walkable world (check.mjs: every one to and from Mauville). Only Fallarbor's and the Day Care's art was new. Route 118 was meant to be Electric's second home and is not: it split Electric with the Power Plant and the Rotom forms fell to 1 in 28,000. Route 113 meets Route 112 only in Emerald's data - both edges are mountain, so no road. |
| 4 | New routes for the thin types, and lighter crowded maps - then `npm run gyms` | **done** (2026-10-16): Route 123 (Lv 14, Poison/Fighting/Grass, a road off Route 118's east end; the Berry Master's House a room) and Route 115 (Lv 32, Fighting/Flying/Normal), a SECOND door off Meteor Falls - its south mouth, as on the GBA, because Route 115 meets Route 114 only along a cliff (`em_rooms` `exits`; a map's other doors are named by where they lead, `doors`). 20 maps in one world. Tall Grass lost Fairy (Route 117 homes it): 264 species to 230. **Not done:** Route 122 is open sea with 18 cells of land, so no map - Route 123 was reached from 118 alone and its east half (down ledges from Mt. Pyre's side) culled, until 2026-10-17: the top of its Mt. Pyre path is a ferry stop now (`edge_ferry`, reported), and all 784 cells are walkable; Tall Grass keeps Bug (taking it put 197 species on Monsoon Trail and broke its Gen 9 share); the Safari keeps its types (the best cut was 203 to 194, the rest broke Monsoon Trail too); Electric keeps one home (phase 3). What crowds Tall Grass is Normal: every Normal-primary species ties on it and the tie goes to the earlier map - the tiebreak in README's Deferred list is the lever left. |
| 5 | The Kanto ferry and its island stops | **done** (2026-10-17): three TOWNS - Lilycove City (a road off Route 121's east end; its harbor is the ferry), Lavender Town (FireRed's, at the Haunted Tower's front door; no harbor, so its road west is the ferry) and Four Island (FireRed's, at Icefall Cave's mouth; its harbor is the ferry). Eight ferry stops: those three and Mt. Moon, Frost Hollow, Tanoby Ruins and Tall Grass, each docked at its way in, and (2026-10-17) Route 123 at the top of its path down from Mt. Pyre (Tall Grass at the foot of its path, since its spawn stands in the open). A ferry cell is walked into like a door and offers every stop (`Ferry.jsx`; `sail`, `leaveFerry`, `boarding` VOLATILE); a stop your level has not opened is listed shut. All 29 maps are one world now (check.mjs, through the ferry). New art: Lavender's and the Sevii 4-5 sets. No spawn table moved, so no League re-solve. |
