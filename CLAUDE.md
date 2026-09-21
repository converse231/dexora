# Dexora

A personal, non-commercial browser game: catch, collect and evolve **1,145
Pokémon** across eleven hand-made areas — the whole National Dex from Kanto to
Paldea, plus every Mega, Primal and Gigantamax form. Inspired by DelugeRPG's
loop — walk, meet, throw, bank the duplicates, evolve.

**`SPECIES` IS TWO GENERATED FILES MERGED IN `src/data/dex.js`** — the 1,025
National Dex from `fetch-species`, then 120 forms from `fetch-forms`, appended.
Import from `dex.js`, never from `species.js`: the latter is the National Dex
alone and is what the fetchers themselves read.

**The dex is contiguous to 1025 and then jumps to 10033.** The Hoenn-shaped hole
used to be the test that stopped a dex id being used as an array index; the
forms are that test now, and a harsher one — `SPECIES[id - 1]` for a Mega is
nine thousand entries off the end. `speciesById(id)` for the species,
`dexIndex(id)` for its POSITION. See *A DEX ID IS NOT AN ARRAY INDEX* below.

**A FORM IS A SPECIES, NOT A FIFTH TIER**, and it has to be: `mon.species` is a
dex id, `evolve(uid, targetId)` mutates it in place, and every table, medal and
dex row keys on it. A tier would have put them in `TIERS`, which is the roll's
precedence and the save's byte arrays — and they are neither. A tier HAPPENS to
a Pokémon you meet; a form is a hundred levels of Rare Candy spent on purpose.
`isForm(id)` (id >= 10000) is the single predicate, and four systems ask it:

| | why |
|---|---|
| `encounterTable` | **never wild.** The overlay walks the evolution graph, so without this you could CATCH a Mega Charizard — the thing they exist to make you work for |
| `genOf` | reads a form through to what it evolves from, or every Mega files under Paldea and gates on Paldea's arrival level |
| `genComplete` | forms do not count. Origin unlocks on catching every ORDINARY Pokémon of a generation; 33 Kanto forms × 100 levels is not a harder gate, it is a deleted one |
| `hasOrigin` | never. There is no 1996 drawing of a Mega Charizard |

**They needed no new evolution machinery**, which is the whole argument for
doing it this way: `evoLevel` already honours a row's own `level` and
`evolveState` already gates on the Pokémon's, so a form is simply the dearest
row in the game. Six species offer a real choice and it is permanent — Charizard
becomes Mega X, Mega Y or Gigantamax, never two — which the Box's branch UI
already handled because Slowpoke taught it to.

Evolution is paid for in **Rare Candy**, one candy per level, on a single
Pokémon named by `uid`. If you find a doc anywhere describing a *feed* that
spends a pile of duplicates, it is describing a system that was deleted — see
"EVOLUTION IS CANDY AND A LEVEL" below.

**Standing constraint: this stays non-commercial.** No ads, no payments, no
store listing. It uses Nintendo's characters and Game Freak's art, and community
tilesets marked ☆ in the README require crediting the artist.

**It is no longer personal-only, and that changed the security model.** There
are accounts now, saves live on a server, and other people are meant to play it.
Two consequences worth having in front of you before touching anything below:

- **The IP position got sharper, not softer.** A fan game on one machine and a
  fan game with public sign-ups are different things to a rights holder, and
  everything in `src/data` and `public/sprites` is Nintendo's and Game Freak's.
  That is a decision the owner has made; it is recorded here because the risk
  belongs with distribution rather than with the code.
- **THERE IS STILL NO TRUST BOUNDARY.** Every roll, price and dex write happens
  in the browser and the server stores the result. Row-level security means
  nobody can touch anyone else's save; it does not mean a save is honest. **So
  there is no leaderboard, and adding one on today's architecture would be
  publishing numbers that cannot be trusted.** The ten browser-free modules in
  `src/game` are what makes the fix affordable when it is wanted - see
  *THE RULES RUN WITHOUT A BROWSER* in check.mjs.

`README.md` is the design document — economy, trainer stats, evolution pricing,
UI rationale, per-screen decisions. Read it before changing behaviour. This file
is how to work in the codebase: the invariants, the traps, and the method.

**`README.md` also carries a "Deferred on purpose" section**, and it is the first
place to look before designing anything that sounds like it has been thought
about before — band budgets for rarity dilution, pity for the rare tiers, the
hybrid data model, and a watch-list of things decided one way that may want
revisiting. Each carries the TRIGGER that should bring it back. Adding something
there beats opening a ticket, because a ticket loses the reason.

## The account, and what runs before the game

**`Boot.jsx` asks three questions and mounts `App` once, at the end.** Is there
a session, is there a trainer, and has the save been brought down. The game
knows about none of it, and that is structural rather than tidy: the engine
closes over the map rows at construction, so a save arriving later cannot be
applied to a running engine. Boot exists to make sure it never arrives later -
which is why picking a trainer writes straight into the save rather than calling
`setChar`, and why `App` is keyed, so replacing the save underneath remounts it.

**`net/cloud.js` is the only file that may import the Supabase client**, and
check.mjs asserts it. With no credentials `CLOUD` is false and every function in
it answers "no account" instead of throwing - the game is then exactly what it
was before any of this, which keeps it playable offline, keeps a dropped
connection from being a dead screen, and lets the suite drive every path with no
network. **Local mode is not a fallback, it is the game.**

**LOCAL FIRST, CLOUD AFTER, never the other way round.** `write` stays
synchronous and local because the game writes on every step and the network must
never sit in the middle of the walk cycle. `mirror` trails it. It is COALESCED
every few seconds rather than debounced, and the difference is the point: a
debounce that resets on every write never fires while somebody is walking, which
is exactly when there is most to lose.

**WHICHEVER HAS WALKED FURTHER WINS.** Two devices, one account, and no way to
ask which save the player meant. `steps` is the only counter in the game that
cannot go down, so more steps is strictly more play and taking the larger can
only discard the shorter session. A timestamp would be wrong: a slow clock, or a
tab left open overnight, both beat a real afternoon. Ties go to remote, because a
tie is the same save and the remote copy is the account's record.

**BUT THAT IS A RULE FOR LOGGING IN, NOT FOR PLAYING**, and for a while it was
the only rule there was. `newer` runs once, in `settle`. Two sessions LIVE at
the same time - two tabs, or a phone and a laptop - each ran their own engine
and each upserted the whole save every few seconds, so last writer won
continuously and an afternoon could be erased by a tab somebody forgot was
open. There is no merge to write: two divergent collections cannot be
reconciled, and guessing is worse than choosing.

**SO ONE SESSION OWNS THE SAVE, AND THE NEWEST ONE TAKES IT.** `saves.session`
is a random id per tab; `claim()` stamps it at boot, and `save_game(payload,
sess)` folds the check into the write's own `ON CONFLICT ... WHERE`. That has to
be one statement - read-then-write from a browser races with itself, and two
devices can both read "nobody owns this" and both proceed. The loser gets
`false`, App raises a dialog, and **the engine stops writing to localStorage as
well**: two tabs share one key, so an abandoned tab that keeps writing
overwrites the copy the live tab is keeping and `newer` can hand the
resurrected loser back at the next boot. Syncing off but writing on would be a
worse bug than the one it fixes.

**AND NEVER OVERWRITE A SAVE YOU FAILED TO READ.** This file already records,
twice, that a save which fails to LOAD must survive the session that could not
read it - and the cloud path was written without the lesson. `pull` returned
null for "this account has no save" and null for "the request failed", so a
reachable-but-broken backend read as a brand new player. It does not take a bug:
**a free Supabase project pauses after a week idle**, and a paused project
answers every select with an error. New phone, failed read, fresh save, four
seconds later uploaded over a finished dex.

Both reads answer three things now - `{ ok: true, raw }`, `{ ok: true, raw:
null }`, `{ ok: false }` - and `push` is latched shut until one has come back
ok. `getProfile` is the same shape for the same reason: conflating there put an
existing player on the WHO ARE YOU screen after a hiccup, and the insert that
followed collided with their own primary key and reported it as a name somebody
else had taken. **The latches are reset when the USER changes and not on a
token refresh**, which is why exactly one function assigns `session` - five call
sites used to, and a sixth would simply not have reset anything.

**THE SERVER STAMPS `updated_at`.** It was sent by the browser, so a device with
a wrong clock wrote a wrong time and a determined one could write any time at
all - and `profiles.played_at` is a copy of it. Nothing reads either today,
which is exactly what makes it the sort of column something sorts by later.

**THE CADENCE IS 15s, AND IT WAS MEASURED.** At 4s a player walking steadily
produced 900 uploads an hour, and the save is a jsonb document that TOASTs past
8KB (39KB at 600 caught), so each one rewrites the row and its out-of-line
chunks, leaves a dead tuple, and fires a trigger that expands a 1,145-element
array. The local write is still every 400ms and is what the next frame reads,
so the cadence only decides how much play is missing if the DEVICE is lost -
and `flushNow` now runs on `visibilitychange` and `pagehide`, which is how a
session ordinarily ends. `flushNow` REPORTS, which it did not: it runs on the
two paths where a session ends, so it was the one write in the module that
could fail in silence.

**`char` IS NULL UNTIL ASKED, not "red".** A default indistinguishable from an
answer means the question can never be asked once - so null is what puts the
trainer screen up, and the renderer falls back to Red for the frames in between.
The question lives in the gate and NOT on the YOU panel: the handhelds ask it
before you have a save, and asked in a menu it is a costume change.

**AN ASSERTION THAT PINS A NUMBER CAN LOCK THE BUG IN.** `.gate-art` draws the
trainer for the account gate and the settings picker by scaling the whole
`player.png` strip and windowing one frame out of it, so `background-size` has
to be the strip's real size. check.mjs asserted it was `256px * var(--z)`,
under a note reading *"the sheet is square and the one number the rule may not
get wrong is 256"* - and the day the surf set was cut from the rip the strip
became **320x256**. The assertion went on passing, because it was checking that
the CSS SAYS 256 rather than that 256 is right.

A background scaled to 256 draws the strip at 0.8x, so the 16px window showed a
squashed stand plus four pixels of the next walk frame. Reported as clipped
sprites, and nothing in the suite could have said so. It is asserted against the
PNG's own header now - two copies of one number checked against each other, the
same shape as `tileBase` against `route.json`. **A literal in an assertion is
not a rule, and this is the version of that lesson where the literal was right
when it was written.**

**AND NOTHING ASKED WHETHER THE PICTURE COULD LOAD, WHICH IS THE SAME LESSON
ONE TURN FURTHER ON.** Every NUMBER in `.gate-art` was checked - the offsets
against `player.json`, the background-size against the PNG's own header - and
the `background-image` beside them read `url("tilesets/player.png")`, which
resolved in neither place. **A relative url() in a stylesheet resolves against
the STYLESHEET**: `/src/tilesets/player.png` under the dev server, which Vite
answers with index.html as `text/html`, and `dist/assets/tilesets/player.png`
in a build, which does not exist. The trainer had never drawn on the onboarding
screen, and the span is `aria-hidden`, so there was not even an alt to go
missing. Reported from play as the boy and girl not showing.

It is the trap `spriteUrl()` already documents, and there is a comment beside
`--ground` **thirteen hundred lines above this rule in the same file** warning
about it by name. **Vite says so every build** - *"didn't resolve at build
time, it will remain unchanged to be resolved at runtime"* - and it had been
scrolling past. `TrainerArt` in `Sprite.jsx` builds it against
`document.baseURI` and hands it in as `--trainer`, one component for all three
call sites.

**THE ASSERTION IS THE CLASS, NOT THE ASSET.** `public/` is copied verbatim and
is never resolved by Vite, so **no `url()` in styles.css may name a path** -
every image arrives as a custom property built in JS, which is what
`spriteUrl`, `--icon`, `--ground` and `--strip` all already did. An empty
`url()` is the one allowed form, because that is the `--ground` placeholder.

The window itself is correct and was never the problem: 16x19 at an offset of
-13 rows, because the stand frame's content is measurably rows 13..32 of its
32-row cell. Frame 0 of the walk set IS the idle pose - the set is
stand / step / step - so the picker already draws a standing trainer rather
than a walk frame held still.

**AND `overflow: hidden` PLUS A NUDGE IS HOW A SPRITE GETS CLIPPED.** The new
header avatar had both for one commit - a `-4px` margin inside a clipping box -
which is the same class of fault wearing different clothes. The box is sized to
hold the art; there is nothing to hide and nothing to pull.

**SETTINGS IS A DIALOG OFF THE TOP BAR, NOT A PANEL.** Name, trainer, date of
birth, password and delete-account were on the YOU panel, and that was the wrong
room twice: YOU is what a trainer has EARNED - points, ranks, key items - and it
is a column in a rail that scrolls, so "delete my account forever" sat one flick
below "spend a point". One writer for the profile row (`updateProfile(patch)`),
because a function per column is three copies of the same error mapping and the
third is where it stops matching. **The email is shown and not editable**:
changing it is a two-message confirmation and half-built it leaves accounts
pointing at inboxes nobody owns.

**THE TOP BAR CARRIES THE PLAYER'S NAME, NOT THE GAME'S.** It said "Dexora" with
the trainer name in a chip beside it, which is the wrong way round - the title is
identical on every screen for every player and is already on the tab, the login
card and the loading screen, while the name is the one thing up there that says
whose game this is. Local mode has no account and keeps the title.

**TWO FIELDS AT SIGN-UP AND NO MORE.** `birthdate` is the age gate - `MIN_AGE`
is 13 in `name.js`, with the reasoning - and it pays for itself as a birthday
bonus. `terms_at` is stamped by the insert, because the gate shows what starting
means directly above the button and that IS the moment. Deliberately absent: a
real name, a gender, a phone number, a separate display name. Each is a thing to
store, protect and eventually delete, and none changes what the game can do.
`ageOn` counts on the calendar rather than dividing milliseconds by 365.25,
which is wrong for a leap-day birthday and a day out for plenty of others.

**A FORGOTTEN PASSWORD WAS AN UNRECOVERABLE ACCOUNT** until `requestReset`, and
there is a setup cost the code cannot pay: real SMTP, because Supabase's own
mailer is capped per project per hour. See SUPABASE.md §4b. Two things about the
wiring: `detectSessionInUrl` is **true** (a reset link is a token in the URL -
this file's comment used to say there would never be one), and the flow is
**implicit rather than PKCE**, because PKCE keeps its verifier in the
localStorage of the browser that asked, and people open mail on their phone.

**LOG OUT REPLACED RESET.** Reset wiped the save, which was the only way out
when the save WAS the account. With one it is a button that destroys a synced
collection and calls it a preference. Reset survives only in local mode, where
there is nothing to log out of.

**AND THE DIALOG SAYS WHOSE ACCOUNT IT IS.** The header was the word "Settings"
beside an email address - true, and it could have been anyone's. The trainer is
the subject of every row below it and the game already has a picture of them,
so it opens on the sprite, the name, and the address underneath in grey. It
also gives the trainer picker somewhere for its result to land.

Three more things went with it, all of them the app's own vocabulary rather
than shapes invented for this one screen. **Fields are the paper colour**: they
were filled with `--surface-2`, the same pale green as the panels behind them,
so a row of inputs read as tinted blocks rather than as somewhere to type.
**Buttons have the lip** - the `0 2px 0` and a press that drops by exactly that
much, which is what makes the shoreline prompts and the save panel read as
pressable. **The trainer tiles are pickable tiles**: the old note said "no
caption: at this size the red cap and the white hat are the label", which was
an argument about the size, and the size was the problem. Whole sprite at 3x,
the word underneath, and a selected state that rings rather than only tints.

**THE PASSWORD ROW IS A GRID, NOT A WRAP.** Three boxes and a button in a
wrapping flex row came out as "Current | New" then "Repeat | CHANGE" - a ragged
two-and-two that made the third field look like it belonged to the button. Two
columns with the button full width beneath them, so the three fields read as
one set. Below 360px the label column collapses and the card is 300px wide with
no horizontal overflow; measured at 400 and 340 rather than assumed, because
`width: min(430px, 100%)` being obviously correct is not the same as checking.

**THE CORNER HELD THREE BUTTONS AND FITS ONE.** Settings, log out and how-to-play
were separate keys in the top right; on a phone the row wrapped and the gear
landed underneath LOG OUT. None of the three is pressed while playing, which is
the argument: they are the menu, and the menu is one button. **One menu at every
width** rather than a burger below a breakpoint - the alternative was rendering
the controls twice and letting CSS choose, and two copies of a thing drift.
**The quest stays out of it**: that is checked and claimed during play and
carries a dot when it is ready, and behind a burger it would be the YOU tab
again, which is where it was when nobody could find it.

**THE HEADER WAS FOUR ROWS ON A PHONE AND IS TWO.** Identity, then the quest on
a line of its own, then five stat tiles, then whatever button was left over -
a third of the shortest screen in the game, above a map sharing what was left
with a d-pad. The menu took one row and the quest moved up onto the identity
row, where it always fitted: it is a chip, and it only had a line of its own
because a flex bar with `wrap` has no idea which children belong together. It
is a GRID with named rows now. Below 380px the two figures that are progress
rather than a decision (`caught`, `steps`) stand down; both are on the YOU
panel.

**AND THE CONTROLS CAPTION IS A DIALOG.** "ARROW KEYS OR WASD TO WALK · ANYWHERE
CAN SPAWN · RUN SHIFT" was three kinds of sentence wearing one style, pinned
permanently under the map to be read once and looked past forever - and on a
phone it sat in the gap between the map and the d-pad explaining a keyboard
nobody there has. The controls are `Help.jsx`, off the menu; the rule about the
world was already the first contextual hint. **A reference nobody needs twice
should be reachable, not resident.**

**A TIP IS A DIALOG, NOT A BAR.** The hints started in the flow, on the theory
that a tip should never cover what it describes - and a tip somebody scrolls
past is a tip nobody read. It takes the modal lock, which is what makes it
unmissable: `App` bails on `modalOpen()`, so the arrow keys stop walking the
trainer while it is up. `SUPABASE.md` is the setup, including the RLS policies,
which are the entire server-side security model.

## Commands

```
npm run dev        vite dev server           npm run check   check.mjs (32) + play.mjs
npm run build      vite build                npm run art     python tools/build_assets.py
npm run preview    serve dist/               npm run map     python tools/build_map.py
npm run play       drive the engine in Node
                                             npm run layout  composition metrics
                                             npm run shape   structural metrics
                                             npm run assets  PokéAPI species/items/evolutions
                                             npm run tilesets fetch pret tilesets
```

`npm run check` after any logic change; `npx vite build` before calling it done.

## Architecture

**The game loop lives outside React.** `createEngine(canvas, onChange)` in
[src/game/engine.js](src/game/engine.js) owns mutable state, runs its own
`requestAnimationFrame`, and draws to the canvas. React re-renders only on
discrete events (`useReducer` force via `onChange`). Do not move the loop into
React state — 60fps through a reducer is what this design avoids.

**Because state is mutated in place, `changed()` bumps `state.rev`.** Memoised
panels key off it. Without it a `state.box.push()` keeps the same array
reference and `useMemo([box, ...])` never recomputes — the BOX tab silently
stopped updating after a catch, while selling worked because `sell()` replaces
the array. Any new memo over engine state must include `rev`.

**Generated files. Never hand-edit:**

| File | Made by | From |
|---|---|---|
| `src/game/mapdata.js` | `npm run map` | hand-drawn + procedural area functions |
| `public/tilesets/route.{png,json}` | `npm run art` | pret/pokefirered tilesets |
| `src/data/species.js`, `evolutions.js` | `npm run assets` | PokéAPI |
| `.assets-src/` | fetch-on-demand cache | pret raw + PokéAPI (gitignored) |

Change the generator, re-run it, commit the output.

## Method: read it out of the real game data

Every tile rule here was decoded from a real FireRed map, not chosen by eye.
When something looks wrong, **measure — do not reason about it**:

1. `python tools/study_tiles.py` renders real maps and labelled tile-usage
   sheets into `.study/` (not part of the build).
2. Decode the map yourself: `.assets-src/layouts.json` gives every layout's
   size and `blockdata_filepath`; `map.bin` is `<u2` per tile, bits 0-9 the
   metatile id, 10-11 collision, 12-15 elevation.
3. Print the 2D id grid for the feature you care about, then reproduce it.
4. Turn the finding into an assertion, and **verify the assertion by
   reintroducing the bug**.

This found: Viridian Forest's canopy grammar, Route 1's rectangles-and-right-
angles vocabulary, the wooden pier autotile, and the water shore. It also
corrected two confident wrong readings that had already shipped.

Useful maps: `ViridianForest` (canopy), `Route1` (route vocabulary),
`SafariZone_Center` (the one pond with an island — uses every water piece),
`Route12`/`Route24` (bridges), `CeruleanCity`/`Route25` (decks).

**A ripped compilation sheet is not a source.** `.assets-src/reference/` holds
two Spriters-Resource sheets of Emerald's tilesets. They are **not** in
`public/`: Vite copies everything under public into the build, and these two
rode along in every dist for nothing. They are flat PNGs: no metatile
boundaries, no palettes, no collision, and nothing saying which tileset a block
came from — so naming a tile off one is exactly the eyeballing this file exists
to prevent. `python tools/identify_tiles.py <sheet> <General|Building>` matches
every cell against pokeemerald's own rendered metatiles and writes
`.study/identify/<sheet>.{tsv,png}`: a per-cell table of *tileset + metatile id*,
and the sheet with each block outlined and named. **98% of the exterior sheet's
real art resolves across 15 tilesets; 99% of the interior's across 53.** Use it
to find a thing, then pull that tileset properly through `load_emerald()` and
derive its placement from a real map by masking.

`--game=firered` reads pokefirered instead (640 tiles and 7 palettes per
primary, not Emerald's 512 and 6). The FireRed outdoors sheet is the most useful
of the three, because it is **8 metatiles per row - the tileset editor's own
grid**, so a match reads straight off as a local index. Its blocks, by sheet
row: `general` 0-76, `pallet_town` 77-88, `viridian_city` 89-100, `pewter_city`
101-109, `cerulean_city` 110-127, `lavender_town` 128-155 (the bridge),
`vermilion_city` 156-176, `celadon_city` 177-206, `fuchsia_city` 207-230,
`cinnabar_island` 231-238, `indigo_plateau` 239-260, `saffron_city` 261-285,
`cave` 286-308, `viridian_forest` 347-353, `rock_tunnel` 354-372,
`digletts_cave` 373-392, `seafoam_islands` 393-423, `cerulean_cave` 424-440,
`mt_ember` 441-469, `berry_forest` 470-475, `navel_rock` 476-504,
`island_harbor` 589-598. 80% of its real art resolves; the gaps are animation
frames and door tiles.

Name the primary the sheet is drawn against; widen to `all` only if it mixes
them, as the interior sheet does (Building, General and SecretBase all appear in
it). Widening costs attribution — the more tilesets indexed, the more ways a
shared tile can be explained, and the exterior sheet starts crediting interior
tilesets for its grass.

Two traps that tool hit, both worth knowing:
- **The rip and the decomp differ by 1 on every channel.** GBA colour is 5 bits,
  and expanding it as `v << 3` or `v << 3 | v >> 2` gives two identical-looking
  pictures that hash differently. Compare at 5 bits (`>> 3`).
- **A metatile below the primary split belongs to the primary**, which every
  secondary shares, so it is no evidence of any one of them. Crediting the first
  tileset that happened to contain it put 804 of 805 matches in the wrong place.
- **Not every secondary is a directory.** The six secret bases are variants of
  one metatile set: `secondary/secret_base/metatiles.bin` is shared and each
  variant is a subdirectory with its own tiles and palettes. All six 404'd, and
  they turned out to be 1680 of the interior sheet's 1909 unmatched cells - the
  block it repeats six times in six palettes, which the ripper had annotated
  "these look like there repeating but they're actually not". Resolving them
  took the interior from 83% to 99%.

## Four times the map: what scaling one actually breaks

Every area is four times the area it was - 10,068 tiles to 40,740, which is
4.05x - and almost nothing about that was a matter of changing W and H. What it
was, over and over, was **a rule that held for one of a thing and not for four**.
Worth reading before growing anything else here.

**PLACE NOTHING ON GENERATED GROUND.** Three separate faults, all the same one:
staircases hard-coded onto composed cave floor came down into rock; ledges
placed by coordinate were cut to two tiles by a path column, a tree wall, a pond
corner and a tree `fill_the_empty` had stood on the approach - four different
obstacles on one map; and spawns typed in by hand landed inside a trunk.
`stair_cols`, `ledge_in` and the spawn searches all answer the same way the
spring and the craters already did. **If the ground under a thing is derived,
the thing has to be searched for.**

**AND LAY IT LAST.** `ledge_in` runs after every tree is standing, because
`fill_the_empty` puts trees where the map is emptiest and "emptiest" is exactly
where a ledge was just given its approach.

**ORDER IS A DESIGN DECISION, NOT A TIDINESS ONE.** Eight tree masses were added
to the meadow and `open` went UP, because they were painted before the fields
and the fields cut them to pieces. A mass beats grass and loses to the path - a
wood with a route through it - and that is the order the three are painted in.

**`turns` AND `tight` PULL APART, AND THE CLUMP SIZE IS THE LEVER.** A 2x3 clump
is six tiles of adjacency for eight corners; a 2x5 is ten for the same eight. The
meadow wanted mass (turns 0.25 -> 0.14) and got `tight` back at the same count by
going taller. Pond & Shore wanted the opposite - it came out at turns 0.08, BELOW
the band, because a lake is already one enormous straight-edged mass - and took
eighty short clumps instead of thirty-eight tall ones.

**A COMB IS ONE CORRIDOR, AND THAT IS WHY DEEP WOODS IS NOT ONE ANY MORE.**
It was a comb of canopy teeth, and two separate findings killed it. First: seven
cross walls - each a correct odd run - cut off 2,746 of 3,061 tiles between them,
because a wall across a lane is not a wall in a maze, it is the end of the maze.
Second, and fatal: a comb is ONE serpentine corridor, so getting back to where
you came in means walking the whole map in reverse. Reported from play as not
being able to go back at all.

**A through-corridor cannot be patched into it.** Three attempts, all reverted:
each either sealed a few hundred tiles into pockets you could see and never
reach, or measured `open 0.67` against a real forest's 0.32-0.43. The comb was
load-bearing for the canopy parity AND for connectivity at once, so cutting it
meant rebuilding both.

**So the canopy is GENERATED AND TESTED, over masses rather than corridors** -
the same shape `haunted_tower` takes, and for the same reason: `compose()` carves
free-form passages and a canopy column must be three wide, on the 3-column grid,
and an ODD number of rows measured on the MERGED run. `forest_masses` throws
rectangles at the map in random order and keeps what fits, tallest variant first;
`best_forest` ranks 200 seeds against `FOREST`, measured off ViridianForest and
ThreeIsland_BerryForest.

**Every mass keeps 3 clear of every other mass AND of the frame**, which buys
three things at once: no two masses merge, so each one's own height is the run
height and the parity is decided where it is written; every corridor is at least
three wide, which the autotile needs; and **the floor is connected by
construction** - the walkable part is the complement of disjoint rectangles
inside a frame, which cannot be disconnected. That last one is the property the
hand patches kept losing.

| | comb | generated | Viridian | Berry |
|---|---|---|---|---|
| stripe | 0.32 | **0.96** | 0.822 | 1.025 |
| turns | 0.03 | **0.09** | 0.077 | 0.168 |
| tight | 0.44 | **0.47** | 0.426 | 0.653 |
| open | 0.54 | **0.46** | 0.429 | 0.321 |

`stripe 0.32` is what "reads as vertical banding" looks like as a number, and a
comb is exactly that. Five of the six now sit inside the real range.

**A LATTICE THAT MATCHES EVERY BAND STILL READS AS AN ORCHARD.** The first
generated version placed masses on a jittered grid and scored *better* than what
shipped - and rendered as rows of identical blocks, because nothing in the bands
measures REGULARITY. The same lesson `compose.py` records about wall masses.
Widening the jitter made it worse (collisions thinned the canopy from 21 masses
to 14); removing the lattice entirely fixed it. **Look at the render.**

And the clearings and ponds are **searched for, in a shuffled order**. A
top-left scan put all five clearings in the first gaps it met - a row along the
top edge, with no room left for the ponds at all - which reads as typed-in
precisely because it is the most orderly placement available.

**A CONNECTIVITY TEST THAT ASKS A BOOLEAN CANNOT COUNT.** `punch_ladders` kept a
ladder only if the map went from broken to whole, which is right for two levels
and wrong for three - no single ladder can finish the job while another band is
solid, so every one looked useless and was reverted. `islands()` counts, and a
ladder earns its place by lowering that count.

**`join_islands` CARVES THROUGH WHATEVER IS STAMPED**, so `keep` is not optional
once there is more than one set piece: a cliff became floor and the plateau above
it dropped onto open ground. And **anything it carves on a transcribed map stops
being a copy** - a tile turned from wall into floor is not the tile Game Freak
put there, and left with its own id it draws a wall you can walk through.

**A COPY CANNOT BE STRETCHED.** Frost Hollow IS Seafoam Islands B3F. It grew the
only way a copy honestly can: by copying more of Seafoam - four floors, in a
square, joined by passages that tunnel to the nearest ice because every Seafoam
floor is drawn with a solid border and nothing is ever adjacent to a seam.

**AND A GENERATOR CAP IS A MAP SIZE IN DISGUISE.** `forestId` walked down at most
64 tiles to find where its mass ended, which was twice the tallest canopy that
had ever existed - and then a map was 89 rows tall and every border tile above
row 24 paired from the wrong foot. Sliced crowns down both edges. **Grep for
bounded loops before growing a map.**

## Composition: the part that was still done by eye

Tiles are measured; layout was not, and it showed - the Power Plant and Ember
Caldera both shipped as horizontal bands on their first pass, twice, and nothing
caught it but looking at a render. `npm run layout` measures the real maps and
ours on the same six numbers and flags anything outside the range real maps of
that kind occupy:

| | what it is | real range |
|---|---|---|
| stripe | mean solid run along rows / along columns | 0.83 - 1.63 |
| turns | corners per tile of wall boundary | 0.08 - 0.36 |
| dead | walkable tiles with one walkable neighbour | 0.00 - 0.07 |
| loops | independent cycles per 100 walkable tiles | 24 - 81 |
| tight | walkable tiles within a step of a wall | 0.39 - 0.99 |
| open | walkable share of the map | 0.20 - 0.63 |

**No single number is a target.** Route 1 is nearly all hall and Rock Tunnel
nearly all corridor; both are good maps. The band is the point.

What it found on its first run, which is the case for keeping it:

- **`power` stripe 2.51**, against a real ceiling of 1.63 - and that ceiling *is*
  FireRed's own Power Plant, the most banded map Game Freak shipped. That is
  "it reads as stripes" expressed as a number. Banks were 12-17 long; nothing is
  over 9 now and it measures **1.18**.

**AND THE CLUTTER WAS 8.7% OF THE REFERENCE, FORBIDDEN BY A HALF-READ RULE.**
The map was reported as ugly and empty, and it was: masking FireRed's own Power
Plant, metatile **53** (the drum's top) is 54 tiles of which 41 sit under a
bank's body - which is the fact this file recorded as "barrels never stand on
open floor" - but nobody counted **54**, the drum's BODY, which is **117 tiles
and only 3% bank-attached**. Together they are **171 tiles in 32 irregular
clumps of one to thirteen**, and `check()` asserted them out of existence.
`drum_clumps` grows them a tile at a time and keeps only what leaves the floor
in one piece. It took `open` 0.72 -> 0.50 against the real map's own 0.49,
`tight` 0.83 -> 0.77 against its 0.77, and `turns` 0.16 -> 0.25 into band - two
of the three flags this file has carried since the map was written.

**THE POWER PLANT HAS NO INTERIOR WALL TILESET, AND THAT IS WHY IT IS NOT
ROOMS.** Building it as rooms was tried and reverted, and the measurement is
the reason to keep: of the real map's solid tiles whose FACE you can see -
floor directly below them - 85 are the machine bank's body (local 21), 77 are
drums (53/54), 32 are barrels (89) and 22 are the bank's end caps. **Its walls
are machinery.** The `edge` set is a one-tile outer rim whose middle piece is
local 19, the wall's dark body, so a free-standing rectangle of it renders as a
black barcode - which is exactly how thirty rooms of it rendered. Anything that
wants real rooms here needs an interior wall baked first; the vocabulary does
not have one.

**`tools/render_area.mjs` + `render_area.py` is how any of that was seen.** It
drives the shipped `drawTile` with a stub ctx that records the source rect, so
what it paints is what the game paints - no browser, and no second copy of the
tile rules to drift. The barcode was invisible in every measurement and obvious
in one render: `stripe` 1.13, `turns` 0.27 and `open` 0.67 all said the layout
was fine, because none of them looks at which tile is drawn. **Look at the
render.**

`loops` 49.4 against a real 57-71 is the one flag left, and it is the honest
one: ranks of banks give few ways round. Closing it needs the compartments the
reference has, which needs the wall tile that does not exist yet.

**AND THAT SENTENCE IS WHY THE GENERATOR IS GONE.** The reference *has* the
compartments, because it is the reference — so the Power Plant is **transcribed
now**, and everything above is history rather than description. It is kept, all
of it, because the findings outlived the code: that a Building map is not a
General map, that this tileset has no interior wall so its walls are machinery,
that metatile 54 is 117 tiles of drum body nobody had counted, and that a render
sees what no measurement did. Those are what taught this repo to read a map
instead of drawing one, and they are the reason the transcription that replaced
four generators is three lines of classification. `bank`, `hang_partitions`,
`barrels` and `drum_clumps` went with it — about two hundred lines — and `Y`,
the partition character, now has no producer and is reported as unused by the
minimap suite rather than deleted across four files.
- **`dead` = 0.000 on five maps.** Ours had none, because they are composed of
  rectangles, so nooks were added. **Half of that reading was an artefact** - see
  *the ruler was bent* below. Measured honestly, real routes have essentially no
  dead ends either (0.0000, 0.0017, 0.0023), so Route 1 never needed a nook;
  real towers (0.03-0.08) and caves (0.00-0.07) genuinely do. The nooks stay - 1%
  of tiles, and an empty field reads better with them - but they were justified
  by a measurement, and the measurement was wrong.
- `meadow` and `clearing` are too open, too loopy and not tight enough - fields
  with almost no wall in them.

### Composing one: tools/compose.py

`study_shape.py` went further than the bands and measured what a cave is *made
of*, over fourteen real ones. The answer is not what we had been drawing:

|  | real caves | hand-drawn Rock Ridge |
|---|---|---|
| tiles 1-3 wide | **97%** | 75% |
| wall runs straight for | 2.7 (p90 6) | 6.2 (p90 10) |
| chambers per 1000 tiles | ~46, radius 2.3 | 39, radius 2.9 |
| tiles offering 3+ ways | 88% | 96% |

**A cave is a dense net of narrow passages knotting at small chambers - not
halls with walls between them.** We had it inside out. `compose.py` builds that:
chamber sites on a jittered grid (the grid is what keeps two passages two apart,
which the autotile needs), stepped paths between them jogging every 2-5 tiles
(this is what makes a wall turn every three tiles instead of running ten), a
spanning tree first so reachability is structural, then extra edges to hit the
loop density - and then it **scores the candidate against every measured band
and tries another seed**. A map that would read as stripes cannot get out.

Rock Ridge is composed this way, and it went 75% -> 84% narrow, straight
6.2 -> 3.6, turns 0.09 -> 0.18, dead 0.000 -> 0.014. Its ledges, pond and
spring are still stamped by hand where they were always meant to go, because
those carry the map's intent; the generator supplies the connective tissue and
`join_islands` puts back anything the stamping cut off.

**Two things the generator taught us the hard way.** Both are the same lesson -
a metric you have not written cannot catch anything:

- The first version matched *every* band and still looked wrong: its wall came
  out as scattered clumps where Mt Moon's is a few big slabs. Nothing measured
  wall masses. `masses` and `massfill` exist because of that.
- Scoring "inside the band" let it sit on an edge of all nine at once, which is
  a map that is technically a cave and looks like none. `score()` now adds a
  nudge towards the middle of each band.

**Not every map is a warren, and the composer only builds warrens.** The Haunted
Tower has no passages to carve — it is one square room, and what shapes it is
the graves standing in it. So it generate-and-tests too, but over grave plots
rather than corridors, against `compose.TOWER` (measured off 2F-7F alone, and
layout metrics only, since there is nothing for the shape ones to say). Three
passes, each added because a measurement said the last one was not enough:
rows, then **stubs** hung off them (rows alone give `dead` 0.019 against a real
0.031-0.100 — you can walk round anything a free-standing row builds), then
**alcoves**, one floor tile walled on three sides, because stubs still only
reached 0.026. A dead end has to be built on purpose.

**One caveat on `score()` at narrow bands.** Being 0.02 outside a band costs
0.03; sitting at a band's edge *inside* costs 0.075, because of the middle
nudge. For a cave's nine wide bands that trade is right. For the tower's six
narrow ones it is not — it preferred a plan with `stripe` outside the band — so
`haunted_tower()` ranks **inside-the-band first, distance second**, and asserts
that something landed inside.

**The ruler was bent, twice.** Both faults were in the measuring, and both are
worth more than anything they were used to measure.

**A real map's collision bits are not its reachable floor.** `real_walkable`
called every passable tile walkable - including the fill outside a cave mouth and
every pocket the layout seals off. That is **63% of Rock Tunnel 1F**, 45% of
Route 2, 36% of Seafoam B2F, so every band these tools ever produced was part
measured on ground no player can stand on. It surfaced as Frost Hollow appearing
to *drift* from the Seafoam B3F it is copied from tile for tile - ours `open
0.40` against the real map's `0.47`. Restricted to what you can reach the real
one is `open 0.40, dead 0.00`, exactly ours: the copy was faithful and the ruler
was bent. `reachable()` keeps the largest connected run and both readers go
through it, so two things being compared are measured the same way. Two flags
vanished with it - ridge and frost `stripe` - which is the point. **If a
transcription looks like it drifted, suspect the ruler first.**

**And the flag was coarser than its own wording.** It claimed "the range every
real map of *its kind* occupies" while `band[k]` pooled every kind, so a tower
could sit outside all six real tower floors and pass because a cave was wider.
It judges per kind now, against `OURS`, and it knows when it cannot: a kind with
fewer than `MIN_SAMPLE` (3) real maps is reported and **not** flagged, because a
band from one map is that map. Berry Forest took forest to 2, still short, so
**Deep Woods is honestly unjudged**; three more interiors took indoor from 1 to 4
so the Power Plant stopped being measured against itself. A band of zero width is
a value, not a range, and does not flag either.

`compose.CAVE`, `VOLCANO` and `TOWER` were derived before the reachability fix
and are therefore slightly stale. **The maps are not** - ridge, ember and tower
all pass the corrected per-kind bands with no flags - so re-deriving the
constants would churn three approved maps for no measured gain. Left deliberately.

Nine flags survive, and each says one thing: `meadow` turns 0.23 (v 0.11-0.18)
and open 0.60 (v 0.22-0.58) - its tree edges wiggle where Route 1 is rectangles;
`pond` loops 77 (v 71-75) and tight 0.47 (v 0.50-0.57) - a shade too open;
`power` turns 0.16 (v 0.20-0.26), loops 49 (v 57-71), tight 0.83 (v 0.64-0.77) -
more maze than building, which is the **vertical bank segments** already named
above. All measured, named, and not regenerated on a QA pass.

## The tile system

Gen 3 metatiles: 8 entries — 4 bottom-layer opaque, 4 top-layer colour-keyed.
**The top layer draws over sprites.** That is how a trainer walks behind a tree
top. Our atlas composites both layers into one image, so anything that must
draw over the player needs a second, top-layer-only tile baked separately
(`forest.fringeTop`, id 1648, painted after `drawPlayer` by `drawOverhangs`).

Ids < 640 are primary (`gTileset_General`, shared by every outdoor map);
≥ 640 secondary. Our atlas bases: mt_ember 656, seafoam_islands 896,
power_plant 1152, pokemon_tower 1312, cave 1424, viridian_forest 1600,
pokemon_mansion 1648, lavaridge 1920, lilycove 2368, **fr_building 2720**,
em_general 3360. Bases move whenever a set is added — read them out of
`route.json`, never hard-code one.

**AND TWO OF THOSE ARE WHOLE PRIMARIES.** `EM_PRIMARY` bakes pokeemerald's
General because the Safari Zone is drawn against it and ours is FireRed's;
`FR_PRIMARY` bakes pokefirered's **Building** because the Pokemon Mansion
references 748 of its metatiles directly. A map drawn against a primary that is
not the one at ids 0-639 needs its own block, or every primary id it uses draws
somebody else's art - grass and trees inside a house, in the Mansion's case.

**A second decomp, for lava only.** FireRed has no molten tile anywhere: Mt
Ember's Ruby Path is dry rock, and the gold a colour sweep finds in
`sevii_islands_123` is the Ember Spa's water. Ember Caldera is therefore built
from **pokeemerald**'s `lavaridge` — the tileset behind Magma Hideout.
`load_emerald()` handles it, and Emerald's constants are **not** FireRed's:
`NUM_TILES_IN_PRIMARY` is **512** (not 640) and `NUM_PALS_IN_PRIMARY` is **6**
(not 7). Get either wrong and the sheet renders as plausible green-and-white
stripes rather than as an error.

**A secondary is only correct against its own primary.** A Gen 3 metatile takes
palettes 0-6 and any tile id below 640 from the *primary*, so pairing is not a
detail: `power_plant` and `pokemon_tower` are **Building** maps, and we baked
both against General for months, which washed every crate and barrel in them to
grey. `SECONDARY` in `build_assets.py` now carries the primary with each name;
`layouts.json` is where to check, never assume.

**The autotile ceiling, and why it is not worth raising.** Our masses use a 3x3
- four neighbours, nine cases - and a real tileset carries far more pieces than
that. Both obvious fixes were measured against Seafoam's own wall and both were
rejected:

- An **8-neighbour blob autotile** (the standard 47-case reduction) scored
  **34%** where ours scores **31%**, for 31 extra cases. Adding depth into the
  mass as a fourth key added nothing. The id simply is not a function of the
  neighbourhood: Game Freak hand-places directional crystal pieces through a
  mass, and authored decoration is not derivable.
- **Scattering the interior** from the measured mix (about half of every
  enclosed wall cell in a real map is a decorative piece, not the plain fill)
  produced noise, because our walls are bands two or three thick where every
  cell is an *edge*. The only "interiors" we have are the out-of-bounds border
  ring, so it decorated where nobody walks. Mt Moon can do it because its masses
  are eight tiles thick - and what it packs the middle with is **black void**
  (`cave` local 114, 42% of its enclosed cells), which nobody ever sees.

So the ceiling is real and it does not matter at our wall thickness. What did
matter, and is fixed: the **map edge** (see `autotile`'s `outside`) and, for a
copied map, **carrying the real ids** (see `AREAS.frost.tiles`).

**Two grids, do not confuse them.** `route.png` is 16 metatiles per row
(`atlasCols`). FireRed's tileset editor is **8 per row**, and that is the space
autotiles are laid out in — a 3×3 autotile is three consecutive rows of ids
`n, n+8, n+16` at three consecutive columns. Read picks in the 8-wide grid or
they look arbitrary.

**Primary metatiles using palettes 7-15 render blank unless a secondary tileset
is loaded** (its palettes fill those slots). A tile that comes out pale and
featureless is usually this, not a bad pick.

### The sets in `route.json`

- **path** `[[211,212,213],[219,220,221],[227,228,229]]` — 3×3 autotile.
- **deck** `[[313,314,315],[321,322,323],[329,330,331]]` — the wooden pier;
  same 3×3 shape, so one `autotile()` serves both. Cols 0 and 4 of those rows
  (312/316…) are the sand-and-rail approach pieces.
- **pond** — rim on the water's **top and sides only**; the bottom edge lives on
  the **land tile below** (`bank` 307, char `b`). Read 306/307/308 as grass and
  a lake ends in a hard blue-to-green line with no bank. Four inner corners
  (`capLeft/capRight` 297/296, `nookLeft/nookRight` 305/304) are what let an
  island or a pier sit *inside* water without the rim stopping dead.
- **tree** tip 14/15, bodyA 30/31, bodyB 22/23, base 36/37 — 2 wide on **even
  columns**, ≥3 tall.
- **forest** (viridian_forest locals) crown 8/9/10, fringe 1, midA 16/17/18,
  midB 24/25/26, trunk 32/33/34, shadow 35/36/37. A column is
  `crown + (midA,midB)×n + trunk + shadow` — **always an odd number of rows**.
  Even leaves half a crown stranded. `fringe` is the only canopy metatile with
  no collision: the walkable overhang you pass behind.
- **ledge** `[176,135,177]` left cap / mid / right cap.
- **frost** (`seafoam_islands` locals) — Frost Hollow is **Seafoam Islands B3F,
  transcribed tile for tile** from its own map.bin, and it carries **the real
  map's own metatile ids** as well as our characters (see below). The classification is the
  map's collision and **elevation** bits, never an eye: elevation 3 is the lower
  ice, 4 the raised shelf, 1 the water, 0 the striped step. Three autotiles,
  each derived by masking all five Seafoam floors:
  shelf `80/81/82 · 88/89/90 · 96/97/98` (a clean 3×3, the same nine slots the
  cave's plateau uses), wall `27/25/31 · 18/17/16 · 24/25/26`, and the river
  `160/151/162 · 163/141/164` with the third row repeating the second — rust-
  coloured banks down the sides, no bottom rim, like every other water here.
  **25 is both the wall's top and bottom edge**: ice is a texture rather than a
  lit surface, so the mass has no separate near face. That is measured, so do
  not "fix" it into two tiles. The waterfall is **primary** — 295 over 303 over
  311 — under Seafoam's own dark opening (12). Stalactites 29/30 over 37/38 are
  2×2 and hang shoulder to shoulder, so which half a tile is has to be
  **counted along the run**, not read off "is my neighbour one too".
  **Elevation 0 covers three different things in Seafoam** — the step (4), shelf
  edges doing duty as a ramp, and the snow fringe outside the cave — and only
  the first is a staircase. Ladders and boulder holes were replaced by the
  ground they stood in: they lead to another floor there and nowhere here.
- **volcano** (pokeemerald `lavaridge`; local index is the Emerald id minus
  512). Every pick was derived from Magma Hideout's own map.bin by masking —
  for each tile, which of its four neighbours are wall (or lava), then the
  commonest id per mask. Rock is a 3×3 autotile,
  `616/780/618 · 624/625/626 · 632/628/634`.
  **Lava is one flat tile (701).** Everything that makes a pool read as a pool
  is drawn on the rock **bank** around it, keyed by which sides the lava lies
  on: `D` 839 above the pool, `R` 838 left of it, `L` 649 right of it, `U` 827
  below it, corners `DR` 541 / `DL` 539 / `UL` 531 / `UR` 533, and 540 for a
  rock the lava surrounds. **Do not put the rim on the lava.** That shipped
  once: the rock beside a pool went on drawing its own plain edge, so any pool
  under a wall came out with two dark bands and two grey lips stacked, which is
  what it looks like when the orientations are wrong. `lava_banks()` in
  `build_map.py` paints the bank after the bridges, and check() asserts lava
  never meets open floor except along its **bottom** edge — bare in Magma
  Hideout exactly as a FireRed lake's bottom edge is bare.
  Bubbling lava 819 scatters over the body; 687 is the ladder; 784-787 the
  floor with a crystal in it. **110/111-style traps here too:** the 2×2 "rock
  hump" a blob search finds is Team Magma's machinery, and 598/606 — which
  looks like a tunnel mouth — is scenery you cannot walk into, so it was cut. A
  free-standing boulder is just a 2×2 of our own wall character.
- **power** (power_plant locals, a **Building** map) floor 31. A machine bank
  is **three** rows of left/middle/right, and every row caps on the same two
  columns: `33/34/35` plinth over `17/13/18` machine top over `25/21/26` body.
  The plinth is the slab the machine stands on — drawing only its middle across
  a run leaves it uncapped, and an uncapped grey slab the length of a bank reads
  as a wall with a walkable top. FireRed leaves the plinth walkable; **we make
  it solid**, because there a bank is one side of a room and here it stands
  alone in the open. Below the foot, 29 across the whole width — that one has no
  caps (28/30 belong to the outer-wall bank 19/20/21/22/24, a different set).
  Consoles are `57/58`, replacing 13/21 in one column under the plinth's middle,
  both solid. **110/111 is a different object** — a free-standing terminal whose
  lower half is 118/119 — and drawing its top alone is what once cut ours in
  two. Barrels are 53 over 54, 1 or 2 tall, and never free-standing: 41 of the
  real map's 54 hang directly off a bank's foot and the rest stand on a plinth.
  The room's own outer wall is a separate 3×3 with the void drawn beyond it —
  corners 3/7/41/45, sides 5/19/23/43 — lifted off the real map's four corners.
- **tower** (pokemon_tower locals, also a **Building** map). Masked out of all
  seven real Pokémon Tower floors. Two rules carry the whole room:

  **A wall shows its face only where there is floor below it** — 672, with the
  white lip 664 on the tile above it. Everywhere else the wall is flat black
  (641). That is not a shortcut: it is why the real oval is purple across its
  top and pure black down its sides and along its bottom, and it is what lets a
  **square** room be drawn with no corner pieces at all. There are none to
  draw with — 648/656/652/653 exist only for the arc's diagonal steps, and a
  first attempt at a chamfered corner hung a white block off each top corner.

  **The floor carries the shadow, and the light comes from the upper left**:
  wall above → 644, wall to the left → 645, both → 658. A wall to the **right**
  or **below** gives plain 642, measured across all seven floors. Graves cast
  nothing — they are furniture standing on the floor, not part of the room — and
  a grave set into the wall (`A`, 729 opening a run and 728 continuing it, with
  no closing piece) blocks the wall's own shadow, which is why the renderer's
  `shade()` counts only `H` where `wall()` counts `H` and `A` both.

  The headstone is **657**, one tile, solid. Graves lie in rows: of 240 vertical
  runs across the seven floors **172 are a single tile**, and the commonest plot
  bounding boxes are 1×1, 2×1, 3×1 and 3×2. The ward is 5F's cyan sigil,
  665-667 over 673-675 over 681-683 — three consecutive rows of the 8-wide
  editor grid — 3×3 and **walkable**, so it costs no floor.

  **No staircases.** 2F and 5F each carry two 3×3 stair blocks, and they are the
  strongest furniture in the tileset, but they lead to another floor there and
  nowhere here — the same reason Frost Hollow's ladders were replaced by the
  ground they stood in.

### The trainer sheet

`.assets-src/…Player Sprites.png` is a Spriters Resource rip. It draws a
**backing rectangle behind every frame**, so the grid can be measured out of the
image rather than guessed — that is how these offsets were found, and how to
find any others.

**But it uses two colours: orange for frames it considers used, green for the
rest — and both are cells.** Measuring only the orange ones hides three whole
sets, including the jump, which is why this file once said the sheet had none.

Four rows on a 33px pitch from y=42: down / up / left / right. Across:

| set | first x | pitch | size | frames | |
|---|---|---|---|---|---|
| walk | 8 | 17 | 16×32 | 3 | stand / step / step |
| run | 68 | 17 | 16×32 | 3 | same cycle, leaning |
| bike | 128 | 33 | 32×32 | 3 | **unused** |
| fish | 236 | 33 | 32×32 | 4 | the cast |
| surf | 377 | 33 | 32×32 | 2 | the paddle — **used now** |
| surf | 452 | 33 | 32×32 | 2 | on green, **unused** |
| jump | 527 | 33 | 32×32 | 1 | on green — legs tucked, one pose per facing |

The 32-wide sets keep the figure in their middle 16, so centring on the tile
puts the rod's overhang where it belongs with no per-set nudge.

**The jump is one mid-air pose per facing, not a cycle**, so the arc and the
shadow on the ground are the renderer's job — `drawPlayer`'s `lift`.

**GETTING ON AND OFF IS A HOP, and the ORDER of the sprite sets is what makes
it draw.** Mounting was an instant slide onto the water - reported as wanting
the jump before and after rather than a teleport. `move.hop` is the LEDGE hop
and moves two tiles, so the mount and the dismount get `move.leap`: one tile,
purely how it looks. Both draw the mid-air pose on an arc.

The trap is that during a mount the player's coordinates are ALREADY the water
tile - that is what `surfing()` reads - so with the ride first in the ternary
the jump never drew at all. **Airborne first, then the ride.**

**SURFING IS NOT A FLAG, IT IS WHERE YOU ARE STANDING.** The obvious shape is
`state.surfing`, saved and toggled, and it is the wrong one: a boolean and a
position can disagree, and every way they can is a bug with nothing under it —
a save written mid-ride that loses the flag strands you on water you cannot
leave, one that keeps a stale flag walks you onto land still riding. A liquid
tile is impassable on foot, which is what `SOLID` has always meant, so BEING on
one is proof you rode there and is the only proof needed. **No save field,
nothing to migrate, and a save from before Surf loads correctly by construction
because its player is standing on ground.**

`SURFABLE` is `wWkV` — the three waters a rod already reaches plus lava, which
no Pokémon game has ever let you ride and which Ember Caldera is largely made
of. `K` is out for the same reason fishing excludes it: that is the waterfall,
and it is falling.

**OFF THE RIDE IS ALWAYS ALLOWED, ONTO IT NEVER IS.** `tryStep` asks where you
ARE, not what you hold — the permission was checked when you mounted and cannot
have changed since — so stepping ashore can never be refused. Getting on is
`surf()` alone, which is what `canSurf(level, bag)` gates, the same two-part
shape as `canRun`: a level alone is a gate nobody was told about, an item alone
can be held by a save that never earned it.

**AND NOBODY IS LEFT AFLOAT.** Deriving from the tile means a save standing on
water without the item would be stuck, so `ashore()` puts it back on the nearest
bank at engine start — the same shape as `loadState` sending a save home from a
map it has not earned. A save that is somewhere impossible is moved, never
refused.

**WHAT LIVES IN WHAT YOU ARE RIDING NEEDED NO NEW TABLE.** On water it is the
rod's pool, which is what water in this game has always meant and is already
balanced; on lava it is the map's own table, because the only lava here is Ember
and every resident of Ember is a Fire type — a separate lava list would be that
list written twice.

**`grantKeys` REPLACED THE ONE-ITEM MIGRATION.** Running was a level check
before it was an item, so a save past Lv 15 with an empty shoe slot silently
lost the ability to run; Surf is the same story one ladder later. It is written
once now — anything in `KEY_ITEMS` whose level you are past and whose slot is
empty — so a third costs nothing. It found its own test, too: a Lv 20 save hands
itself the item, so "without it" cannot be tested through the bag. **Below the
level is the real gate.**

**Fishing frame order is not uniform.** Each facing runs wind-up → rod-extended,
except `right`, whose frames sit in reverse order on the rip. `fishFrame()`
carries both indices per direction because nothing about the image says so.

Running is gated on the **Running Shoes key item** at Lv 15, not on the level
alone - `canRun(level, bag)` checks both, and `loadState` grants the shoes to
any save past that level that predates them.

There is still **no official Running Shoes icon anywhere**: not in PokeAPI,
which has no such item, and not in pokefirered or pokeemerald, whose item-icon
directories were both checked (Gen 3 grants the shoes invisibly). So the icon
is the trainer mid-stride, cropped from the run set above by `build_shoes()` -
real art already in this repository rather than an invented shoe. It is the one
item icon that is not a picture of an object; that is the trade, and it is why
this note used to say running could not be an item at all.

### Map characters

Legend lives in [src/game/map.js](src/game/map.js). Lowercase walkable,
uppercase solid. `SOLID = "T~wRMIPHLFCWXBEVkKdt"` — it is in [src/game/map.js](src/game/map.js)
and [tools/build_map.py](tools/build_map.py), and the two must agree: `E` was
missing from the generator's copy for a whole area, so check() flooded straight
through the Power Plant's outer wall and counted it as walkable ground.

`.` grass · `,` tall grass · `f` flowers · `#` sand · `w` water · `b` shore ·
`T` tree · `L` ledge · `J` one you hop EAST · `F` canopy · `c` canopy overhang ·
`D` pier

Pokemon Mansion: `q` floor · `Q` its wall

Cave (Rock Ridge only): `r` floor · `R` wall · `o` floor crater (2×2, x even) ·
`u` plateau · `C` cliff below it · `S` stairs · `W` spring (2×2 in a rock face)

Power Plant: `p` floor · `P` machine bank (3 rows, ≥3 wide) · `X` console in a
bank · `B` barrels (1 wide, 1–2 tall, hung off a bank's foot) · `E` room edge

The shapes in brackets are the **generator's** rules and the map is transcribed
now, so none of them is enforced on it — see *A copied cell is exempt from the
art rules*. What the characters still decide is collision and the minimap, which
is why the copy keeps four of them rather than collapsing to walkable/solid:
`E` is the room's own outer wall, `B` the drums and crates, `X` the lit
consoles, `P` everything else that is machinery.

Ember Caldera: `m` floor · `M` volcanic rock (≥2×2, or one tile of bank beside
lava) · `V` lava · `l` ladder · `n` bridge over lava

Frost Hollow: `i` lower ice · `j` raised ice shelf · `I` ice wall · `d` ice
boulder · `t` stalactite (2×2) · `k` water · `K` waterfall · `s` stairs

Rare tiers ride on the box entry and the dex, not on a character: a mon carries
one of `TIERS` and never two, and `state[tier]` is one byte per species for each
of them. Those arrays are BUILT from `TIERS` in both `freshState` and
`loadState`, so a save that predates a tier simply has no key for it and
`normalise(undefined)` gives a fresh row of zeroes - adding a tier is a non-event
for saves. The one hand-written exception is the migration that must run AFTER
that spread or it is overwritten: a save written before Origin existed filed its
Gen 1 sprites under `astral`, so those move across - same Pokemon, same artwork,
only the word changed.

Haunted Tower: `h` floor · `H` wall (≥2 thick over floor) · `G` a grave standing
on the floor (rows 1–5 across, one deep) · `A` a grave set into the wall face ·
`y` the ward (one 3×3, walkable)

**Bridges** are `n` over lava and `N` over water, and both are **Route 12's
bridge planks** (`lavender_town` 755/757 north-south, 764/772 east-west). The
useful fact: those planks are the metatile's **top layer** — the colour-keyed
one — so they lift off the water they were drawn on and `build_assets.py`
composites them over lava or over ice instead, the same trick the canopy
overhang and Ekat99's boulders use. That is the only honest way to get a bridge
over lava: **no Gen 3 game has one**, so there is no tile to go and find.

The character says what a bridge crosses, so nothing is guessed at draw time.
Planks lie **across** the way you walk and alternate every other tile, and which
axis that is comes from the run's own extents — so a bridge must be **≥2 across**
or it is half a bridge. The sea pier (`deck`) is a **jetty**, not a bridge: its
outer ring is drawn to meet sand and brought a green fringe with it over lava.
**And it was wrong for Pond & Shore too, which is the only place that used
it.** Those two spans cross the lake - water on both sides, dry ground at each
end - so they are bridges, and the jetty's sand-meeting outer ring fringed them
in beach. They are `N` now, two across as Route 12's own bridge is. `D` and
`pier()` are kept and currently have NO caller: the deck is real, correct art
for a jetty that runs out from land and stops, and this map simply never had
one. Do not reach for it to cross anything.

Biomes: `m/M` ember · `i/I` ice · `p/P` plant · `h/H` tower

Cinderpeak: `m/M` and `V` from ember, `.`/`,`/`T`/`L` from the routes, and `l`
for the two cable-car doors — the warp character, which on that map is a door
rather than a rung. Nothing new: a re-used character on a transcription costs
nothing, because the ART comes from the fixed id and the character only has to
be right about collision and about what the minimap should paint.

`Z` was Route 1's: solid scenery a copied map brought with it, the white fence
and the signpost. It has **no shape rule and needs none**, which is the whole
reason a transcription can afford a character per *obstacle class* rather than
per *object* — and with that map gone it is one of the nine the minimap suite
reports as unused every run.

**A copied map carries the real map's ids.** Characters alone are not enough for
a transcription: put through our autotiles, Frost Hollow drew **397 of its 836
cells** differently from Seafoam B3F. Two reasons, and the second is general:

1. Seafoam varies its wall among half a dozen interchangeable pieces, and its
   floor and shelf the same way. A 3×3 is nine cases and has no way to say
   which — no rule was going to fix this.
2. `autotile()` treated **off the edge of the map** as "not the mass", so the
   outer ring of every cave drew edges facing out of the world. That was 176 of
   the 397. It now takes an `outside` flag: false for a path or a pier, which
   really do end, and **true for a mass of rock**, which does not.

So `frost_hollow()` returns a third channel: `AREAS.frost.tiles`, one id per
cell, `-1` where we authored something (the bridge, the two staircases) and the
rules draw it instead. `drawTile`'s `fixed` argument beats every rule in this
file. That took the difference to **18 cells, every one of them a change we
chose**. Rules are for maps you invent; a map you copied should be copied.

The ids are rebased against wherever the atlas packs `seafoam_islands`, so
`AREAS.frost.tileBase` records the base used and check.mjs asserts it still
matches `route.json`. Run `npm run art` without `npm run map` and that fails
loudly rather than drawing rubble at the right coordinates.

**AND `tileBase` IS PER MAP, WHICH ROUTE 1 CORRECTED.** That assertion compared
every copied map against seafoam's base, because for a while Frost Hollow was
the only copy there was. A map built entirely out of **primary** metatiles needs
no rebasing at all and records **0** — a real answer rather than a missing one.
Its companion bound was `forest.fringeTop`, "the last tile baked", and baking
the conifer crowns after it made that wrong by two: **a ceiling that quietly
stops being the top passes everything.** It is the max id in `route.json` now.

### Transcribing a whole map: Route 1

**ROUTE 1 IS NOT IN THE GAME ANY MORE.** It was the proving ground for the
transcription path and it did that job: everything below was found on it, and
every copy since - the Power Plant, Mt Moon, the Safari Zone, Cinderpeak -
rests on it. It was never a place anyone was going to play, so it went. The
section stays, because the lessons are what it was for. `Z`, its one character,
now has no producer and joins `D ~ o u C S W Y n` on the list the minimap suite
prints every run.


**THE SOURCE IS THE MAP FILE, NEVER A PICTURE OF IT.** A render — vgmaps, a
screenshot, a ripped sheet — carries the art and nothing else. Where you can
walk is the **collision** bit and which of two overlapping surfaces you are on
is the **elevation** bit, and neither is in the pixels. `Route1/map.bin` is the
source, exactly as Seafoam's is.

**IT COST NO NEW ART, AND THAT IS STRUCTURAL.** 49 of the 50 metatiles Route 1
uses are **primary** `gTileset_General`, which our atlas already carries at
identity, so the ids go straight in. The 50th is the gate post at the Pallet
Town exit, and that exit is sealed, so it does not survive either. **Any FireRed
map drawn against a tileset already in `SECONDARY` is nearly this cheap** — Mt
Ember's Ruby Path and the Icefall Cave floors need nothing baked at all.

**SEAL BY CONTINUING THE BORDER, NOT BY INVENTING.** Route 1 opens onto Route 2
at the top and Pallet Town at the bottom, and this game has no map connections.
Both gaps close with ids **lifted from two columns over** — the top takes the
two rows of conifer its neighbours already carry, the bottom takes the fence
rail and the tree band. So every cell is still a copy and **nothing is
authored**, which matters beyond tidiness: an authored cell is drawn by our
rules, and our rules cannot draw this map. 938 of its 960 metatiles are
pixel-identical to the original and the 22 that differ are exactly the seals.

**WHAT THE COLLISION BIT CALLS PASSABLE IS NOT WHAT YOU CAN REACH.** Route 1's
bottom border is twenty conifer crowns with collision 0 — walkable art, fenced
above and trunked below, unreachable in the real game too. Left alone they are
twenty tiles of ground you can see and never stand on. They go **solid and keep
their art**. This is the same fact `study_layout.reachable()` records about
every real map it measures, met from the other side.

**AND THE FILL HAS TO BE DIRECTED, OR IT WALLS IN A TERRACE.** The flower
meadow at rows 6–9 is enclosed by a ledge above and a ledge below: you hop in
going south and hop out going south. An undirected flood calls its 24 tiles
orphans. `walk_steps()` is the one definition of a step now — `check()` and the
transcribers share it, because two answers to "what can the player reach" is
how a map ships with a pocket in it.

### And then the Power Plant, which cost nothing at all

**EVERY ONE of its 1,960 tiles is a `power_plant` SECONDARY metatile** — not one
primary tile in the whole map — and that tileset has been baked against its own
`building` primary since the day this file learned that pairing matters. So the
ids go in at `base + local`, **nothing was added to the atlas**, and there was
no seal to draw either: the Power Plant is one closed interior, so its outer
ring was already solid and **not a single cell is authored**. Rendered through
our own `drawTile` and diffed against a fresh render from pokefirered:
**1,960 of 1,960 metatiles identical.** Route 1 needed 22 seal tiles; this
needed none.

**IT IS THE SMALLEST MAP IN THE GAME NOW, AND THAT IS THE ONLY REAL COST.**
49×40 against the generated map's 80×60 — 961 walkable tiles where the old one
had 2,399. **A 1:1 copy cannot be four times the size and still be a copy.**
Frost Hollow answered that wall by laying four Seafoam floors in a square;
there is exactly one Power Plant, and stamping the same room out four times
would be a bigger lie than a smaller map.

**A METATILE'S COLLISION COMES FROM THE MAP, NOT THE TILESET.** Five of these
(28, 30, 33, 34, 35) are laid both walkable and solid in different places, so
the character is read off the cell's own collision bit and the id only refines
what KIND of solid it is. Classifying by id alone would have put twenty holes in
the machinery. It also hands back a detail the generated map deliberately got
wrong: FireRed leaves a bank's **plinth walkable** and we made it solid, because
there a bank is one side of a room and ours stood alone in the open. A copy has
no such problem and takes the real collision.

**AND EIGHT TILES ARE PASSABLE WITHOUT BEING REACHABLE** — six of shelf behind
the north machinery and a two-tile pocket of floor — the same fact Route 1's
tree crowns record. Solid, and still their own art.

### Mt. Moon: the first area with more than one floor

**THE FLOORS SHARE A GRID AND THE LADDERS ARE WARPS.** Every other area is a
single grid, and a cave with ladders is not. The engine closes over one `rows`
at construction, the camera clamps to it, the minimap bakes it, and a save
stores one `areaId` and one `(x, y)` — so 1F, B1F and B2F are laid out as
quadrants exactly as Frost Hollow lays out four Seafoam floors, each sealed in
its own rock, and `AREAS.ridge.warps` pairs the ladder tiles. **Nothing about
the camera, the save, the minimap or travel changes**; what is new is a `Map`
lookup in `onArrive`. Three AREAS would have been three biome rows, three level
gates, three skies and three lines in the travel menu, for one place you are
meant to experience as one place.

**THE LADDER GRAPH IS READ, NOT INVENTED.** `data/maps/MtMoon_*/map.json`
carries every warp with its destination map and warp id; resolving those gives
**seven reciprocal pairs**, which is the whole of Mt Moon's vertical structure.
The two mouths onto Route 4 are not pairs — one is where you come in (and so is
the spawn), the other leads somewhere this game has no map for.

**A WARP IS TAKEN IN `onArrive`, NOT IN `tryStep`.** The walk has to finish and
the tile has to actually be arrived at, or the trainer slides to a place he
never reached. `move.fromX/fromY` are dragged along with him so the next frame
interpolates from the new tile instead of gliding across the map.

**AND EVERY FILL THAT MEASURES REACHABILITY HAD TO LEARN IT.** Three of them:
`mt_moon`'s own, `check()`'s, and check.mjs's. Without the hop, five sixths of
the map reads as cut off — a true statement about walking and a false one about
whether a player can get there. tools/play rides all seven pairs **in both
directions**, because a ladder that only works downwards is a hole, and with
seven of them the one that is wrong is the one nobody tries.

**B1F IS OPENED UP, AND IT IS THE ONE DELIBERATE DIVERGENCE.** In FireRed its
304 walkable tiles are four rooms with **no walking route between them at all**
— you enter each by ladder and leave it by ladder. That is a fine shape for a
game with a party and a reason to be somewhere; here it is four boxes you get
dropped into. The rooms are still copied tile for tile and the 46 tiles of
corridor between them are ours, carved by `join_islands` **on the quadrant
alone** (run over the shared grid it would tunnel between FLOORS, which is the
one connection a ladder exists to be) and marked `-1` so they draw by our rules
and never pretend to be Game Freak's. It costs three of the seven ladders their
monopoly — they become shortcuts rather than the only way through.

**THE ID STAYED `ridge`.** This slot was Rock Ridge, composed against the same
`cave` tileset; renaming it would move every save standing there and buy a
tidier grep. Its encounter table needed nothing either, which is the tell that
the substitution was always the right one: Zubat, Geodude, Clefairy and Onix
were already the cast of the place it was standing in for. `rock_ridge()` and
its five helpers went with it.

### Ember Caldera: a RE-SKIN, which is a third kind of copy

**THE LAYOUT IS TRANSCRIBED AND THE ART IS OURS.** Route 1, the Power Plant,
Mt Moon and the Safari Zone all carry the real map's own metatile ids. This one
does not: it takes **Emerald's Victory Road** - 1F / B1F / B2F, 46×45 and two
46×31 - and draws every cell with the pokeemerald `lavaridge` set behind Magma
Hideout. `tiles` is `-1` everywhere and `drawTile` runs the same rules it runs
for a map we drew.

**WHY IT HAS TO BE.** There is no three-floor volcano in any Gen 3 game. Magma
Hideout is the only lava interior that exists and it is eight small rooms, not a
cave you descend. The choice was a real volcano that is not a descent or a real
descent that is not a volcano, and the second is the one you can fix: a cave's
LAYOUT is only walkable and solid, and both tilesets draw that. **The water
becomes lava** - 256 tiles of it on B2F, a lake with a fall feeding it - and
`SURFABLE` already holds `V`, so it is ridden exactly as the old caldera's was.

**SEVEN RECIPROCAL PAIRS AGAIN**, resolved out of the three `map.json` warp
tables, and the Mt Moon machinery took them unchanged. The two Ever Grande
mouths are not pairs: one is the way in and so the spawn, the other leads
somewhere this game has no map for.

**FOUR THINGS THE RE-SKIN COSTS, all measured rather than waved at:**

- **Thin rock is carved.** Our rock is a 3×3 autotile and needs a 2×2 to
  resolve; a real cave is full of one-tile walls - **102 of 3,124 here, 3%** -
  and `thicken_walls` turns those into floor, widening 102 spots by a tile.
- **The shore is banked.** `lava_banks` turns the floor above and beside the
  lake into rock, because in this tileset the rim is drawn on the ROCK and not
  on the lava. The bottom edge stays bare, which is both what Magma Hideout
  does and how you get onto the lake.
- **The bridges are floor.** Victory Road crosses its chasms on planks; our
  plank set is Route 12's, baked over lava, and a bridge over nothing is not in
  the vocabulary.
- **AND THE LEDGES ARE GONE, WHICH THE FIRST RENDER CAUGHT.** `L` draws
  `ledge` out of route.json - 176/135/177, FireRed's **grass-topped** earth
  bank - so nine one-way hops came out as green bars of meadow across a
  volcano. Magma Hideout has no terraces and so no hop to borrow. They are
  floor now, and the route is unchanged because a ledge was only ever a
  shortcut down something you could already walk around. **Look at the render**
  - this was invisible in every number and obvious in one picture, again.

**A WARP YOU CANNOT STEP OFF IS A TRAP, AND THE REACHABILITY FILL CANNOT SEE
IT.** Crossing a warp makes the destination *reachable*; leaving it may be
impossible, and the fill never asks. Ember shipped one: Victory Road puts a 3×2
**landing platform** in the middle of its lake — reached by ladder, left by
Surf — and `lava_banks` turned all five floor tiles to rock because they touch
lava, sealing the rung into an island. Ember opens at Lv 12 and Surf is Lv 20,
so it was not even a hard exit, it was a dead save. Reported from play as
arriving somewhere with nothing walkable in any direction.

The rung and its four neighbours are held back from both repair passes — **the
walkable ones only**, because holding a rock neighbour back too put a one-tile
wall straight back where `thicken_walls` had just carved it. `check()` exempts
the lava rule within **one tile of a rung and nowhere else**: a missing rim on
five tiles beats a warp with no way off, and the exemption cannot spread.

And the rule that would have caught it is in `check()` now, for every map with
warps — one walkable neighbour is the whole requirement. **Verified by
reintroducing the bug**, which is the only thing that makes an assertion worth
having.

**THE LADDER CAME FROM `cave`, NOT FROM LAVARIDGE.** Magma Hideout's own rung
(local 175) is Team Magma's industrial ladder — yellow and black hazard stripes
— and at 16px it reads as a barrier rather than as a way down. Reported from
play as the wrong asset, beside Mt Moon's, which is `cave` local 22 and
unmistakably a ladder. Both sets are earth tones so the two sit together, and
**a rung nobody recognises is worse than a rung from the next tileset over.**
That is the same call the ledges lost and for the opposite reason: there the
borrowed tile was green grass in a volcano, here it is the only one that reads.

**IT IS SMALLER: 1,560 walkable against the generated caldera's 2,175**, the
same trade the Power Plant made. `volcano()` kept its name and its biome row;
ten helpers went with the generator it replaced - `place_lava`,
`scatter_boulders`, `punch_ladders`, `span_pool`, `ladders_clear`, `islands`,
`boulder`, `heal_spans`, `lava` and `ladder`.

### Cinderpeak: two levels and a cable car

**THE NAME IS OURS, AND THAT WAS ASKED FOR.** The map is Ruby's **Route 112**
with **Mt Chimney** above it. "Route 112" is a road number in somebody else's
region and says nothing about the place; Cinderpeak names what you can see from
the bottom of it - ash falling on the grass, and the thing dropping the ash.

**IT COST NO NEW ART, WHICH IS NOW THE THIRD TIME.** Both maps are Emerald's
General primary plus `lavaridge`, and both blocks have been baked since the
Safari Zone and Ember Caldera respectively. Route 112's highest secondary local
is **440 against the 441 `lavaridge` ships**, which is as close as that has
come. Every cell is a copy.

**THE LIFT IS TWO DOORS, NOT FOUR.** The real chain is Route 112 -> its station
-> the car -> Mt Chimney's station -> Mt Chimney, and the two station interiors
are 13x12 rooms whose whole content is a platform and an attendant. Joining the
doors directly is the same simplification Mt Moon's ladders already are: what
the player does is step into one house and come out of the other. **Stacked
rather than laid side by side**, because one of these really is above the
other, and the minimap is the only thing that can say so.

**AND THERE ARE THREE OF THOSE, WHICH IS WHAT WAS MISSING.** Reported from play
as two screenshots, each circling a spot the player expected to climb - and
they were the two ENDS OF THE SAME CONNECTION. Emerald joins these maps three
ways and we had shipped one:

| | resolved through | what it is |
|---|---|---|
| cable car | the two stations | R112 (28,27)(29,27) <-> Chimney (17,36)(18,36) |
| **Jagged Pass** | JaggedPass #0/#1 .. #2/#3 | R112 (6,46)(7,46) <-> Chimney (20,41)(21,41) |
| **Fiery Path** | FieryPath #0 .. #1 | R112 (11,36) <-> R112 (22,10), both ends on the route |

Collapsing each is the cable car's own rule applied twice more. Jagged Pass is
how you leave the summit on foot - without it Mt Chimney's south corridor is a
staircase with nothing at the end of it, which is what the second screenshot
was - and the Fiery Path cuts from the foot of the route to the top of it,
which is the only thing that makes Route 112's north-east quarter reachable at
all. **The map went 744 walkable to 831**, and it is now more than it was
before the ledges became one-way rather than less.

**BOTH ENDS WERE IN THE MAP DATA AND NEITHER WAS A GUESS.** `MB_NON_ANIMATED_DOOR`
(0x60) and `MB_SOUTH_ARROW_WARP` (0x65) are what the circled tiles carry, and
`map.json`'s `warp_events` says where each goes. THE LADDER GRAPH IS READ, NOT
INVENTED - the sentence was already in this file, under Mt Moon, and this map
had only followed it as far as the cable car.

**THE CRATER IS SCENERY, AND THE MAP DATA SAYS SO.** 56 tiles of `lavaridge`
189 - the same metatile Ember's lake is made of - every one collision 1, with
no water behaviour anywhere on either map. You cannot enter Mt Chimney's crater
in Ruby and you cannot here. They carry `V` so the minimap draws the caldera
rather than more rock, and exactly **one** of the 56 has a walkable neighbour,
so what that costs is a single tile somebody with Surf could ride onto -
measured rather than waved at.

**AND THE LEDGES GO THE WRONG WAY, WHICH SETTLED A RULE.** Of the 40 one-way
hops here, **38 face EAST** and `L` hops south and only south. The Safari Zone
made its eleven SOLID because that walled nothing off; here solid would wall
off **137 tiles**, a third of the route, so they are floor. Both are the same
principle and it is worth stating once: **a ledge is a passage in ONE
direction, so floor is the closer approximation and a wall is the further one**
- solid is only safe when nothing is behind it. Measured both ways before
choosing, which is the only reason the two maps differ.

**THE MINIMAP COLOUR IS READ OFF THE TILE.** Fixed ids mean the art is right
whatever character a cell carries, so the character is free to be about the MAP
rather than the renderer - and Route 112 is half forest and half mountain,
which one `M` would have flattened into a single brown slab. A metatile whose
mean green beats its red and blue by 14 is foliage: tree 198 is (98,153,60) and
the volcanic rock beside it is (134,58,42), so the two do not come close to
touching. Measured against the atlas rather than listed, because a list of ids
is a list that falls behind.

**AND THE MINIMAP SIZED ITSELF TO THE MAP, WITH NOTHING BOUNDING IT.** Three
pixels a tile and no cap means the box grows with whatever is drawn.
Cinderpeak is 40x109 - a tall narrow mountain - and came out **120x327 against
a 480x352 viewport: 93% of the screen height**, floor to ceiling down the left
edge. Every other map sits at 76% or less, which is exactly why nothing had
ever said so. `miniScale` drops the pixels-a-tile for a map that will not fit
(only Cinderpeak moves, to 2px and 80x218) because the minimap's whole job is
to show the WHOLE map at once - clipping or scrolling it would be answering a
different question.

**The assertion measures the SCREEN, not the cap**, and the first one did not:
comparing the scaled size to `MINI_MAX_*` is nearly a tautology, since
`miniScale` derives the scale from those - raise the cap to 999 and every map
passes while the box grows off the viewport. Verified by doing exactly that.

**AND THE WARP TEST NAMED ONE MAP.** tools/play rode `AREAS.ridge` because Mt
Moon was the only map with warps when it was written - so Ember's seven pairs
and Cinderpeak's two were never driven. It loops over every area that has them
now: **16 pairs across three areas, each ridden both ways.** A test that names
one map is a test that goes quiet the day a second one arrives.

### The Pokemon Mansion: four floors, and the first `building` primary

Cinnabar's burnt-out house, all four floors, laid out **two by two on one grid**
- upstairs on the top row, the ground floor and the basement beneath. 78x75 and
**2,633 walkable**, which puts it third behind the Safari Zone and Deep Woods.
Four in a column would have been 38x152 and the minimap could only have drawn
that at one pixel a tile.

**5,434 OF 5,434 INTERIOR CELLS CARRY THE REAL MAP'S OWN METATILE ID.** Not one
differs. The only authored cells are the 416 of frame and gutter, and those are
drawn out of the layouts' own border block - all four tile a 2x2 of the SAME
metatile, and it is the black void the real map already fills its own
out-of-bounds corners with (258 cells of 2F, 452 of 3F), so a gutter reads as
the nothing it is. A plain interior wall was tried first and rendered as
*floor*, which is the invisible-wall fault pointing the other way.

**IT IS THE FIRST MAP DRAWN AGAINST A `building` PRIMARY, and that is what
`FR_PRIMARY` is for.** Route 1 and Mt Moon are General; the Power Plant and the
Tower are pure secondary against Building, so the pairing mattered but the
primary itself was never referenced. **748 of the Mansion's 4,973 metatiles are
`building` ids** - and ids 0-639 in our atlas are `gTileset_General`, which is
grass, trees and sand. Left alone, three quarters of a thousand tiles of a
burnt-out house would have drawn as outdoor scenery. `EM_PRIMARY` already bakes
pokeemerald's General whole for the Safari Zone; this is the same thing one
decomp over, and `load_primary` is `load_secondary` with the splicing removed.

**THE MANSION IS TWO MAPS AND WE CAN ONLY SHIP ONE.** Its barriers are worked by
a statue switch: `FLAG_POKEMON_MANSION_SWITCH_STATE` chooses between the grid in
map.bin and the one `data/scripts/pokemon_mansion.inc` stamps over it with 156
`setmetatile` calls, and **each state opens what the other closes**. This game
has no switch, and a barrier with no switch is not a barrier, it is a wall -
which is the call the ledges lost in Ember and the ladders lost in Frost Hollow,
met a third time.

So the map is the **UNION**: floor where EITHER state is passable, drawn with
that state's own metatile. Nothing is invented - every id is one Game Freak
wrote for that exact cell - and map.bin is **asserted to BE the reset state**
first, on all 78 cells the reset script names, or the union would be taking one
state and half of another. It is worth 42 cells and it is not a detail:
**without them the four floors are 53.7% reachable and the whole basement is
sealed**, because the stair down to it stands behind a barrier.

**EIGHT RECIPROCAL PAIRS OUT OF ELEVEN WARPS.** Three of the real ones are not
pairs and are dropped, the same call Mt Moon's two Route 4 mouths got: 1F
(11,13), 3F (20,18) and 3F (24,18) are the second tile of a wide staircase and
answer their neighbour's destination rather than their own. Three doors lead
onto Cinnabar Island, which this game has no map for - except the middle one,
which is the way in and so the spawn. **Two of the eight are the holes in 3F's
floor**, which fall to 1F in the real game and are two-way here for the reason
Mt Moon's ladders are: a ladder that only works downwards is a hole.

**A TABLE OF EIGHT KANTO SPECIES PUT GEN 1 AT 63% AGAINST A FAIR 25%**, six
times any other map's skew, and the weights were not the cause. A sweep proved
it: pushing them about took 152% off-fair down to 106% and no further.

`balance` pins each rarity band to the share the hand-written rows freeze, and
**every hand-written row in this game is Kanto** - so a band those rows dominate
is a band Kanto owns outright. Measured at Lv 24: the Mansion's B band was 58%
of the table with five Kanto species in it against four from everywhere else,
and Kanto held **99%** of it. The Power Plant gets away with a B band of 64%
because only 34% of it is Kanto.

**So the lever is a resident that is NOT Kanto, in that band**, and one is worth
more than any reweighting: **Slugma alone took it 152% -> 12%.** With Gulpin and
Torkoal beside it the map measures **4% off fair**, level with the Power Plant
and Tall Grass. All three are fire or poison, all three belong in a burnt-out
house, and all three open (Lv 10 and 15) before the Mansion does at 19, so they
are there for every level it can be walked. **This is the first table in the
game with a resident from outside Kanto**, and the next narrow-typed map will
need the same thing - the fault is not this roster, it is that a band nothing
else lives in belongs to whoever does.

**AND THE PSYCHIC IS IN THE ROSTER, NOT IN `types`.** Asked for directly - a
laboratory with no psychic in it - and the obvious lever was measured first and
is the wrong one. Adding "psychic" to the type list takes the map to **38%
psychic**, more than the poison that IS its identity, because `derivedHomes`
then sends every unhomed psychic species in the dex here; it hands Mewtwo a
second home besides, on the strength of a story rather than a roster.

Three named specimens do what was asked at a share chosen rather than derived:
**Solosis** and **Elgyem** carry it (Gen 5, so the generation fit lets them
through - see below) and **Porygon** earns its place twice, being the only
Pokemon in the dex that was MADE by scientists. The map measures **6.1% psychic
against 33.6% poison** - a lab with specimens in it rather than a psychic biome.
The Tower keeps Mewtwo.

**AND ABRA IS DECORATION, WHICH IS THE LESSON UNDER IT.** It was the obvious
psychic to reach for and it spawns at **0.07%** on a written weight of 6, because
it is Gen 1 and this map's Kanto is already heavy. See *A WRITTEN WEIGHT IS A
RANK WITHIN ITS OWN CELL* below - the vehicle for a type you want FELT has to be
a generation the fit is not already suppressing.

### The Safari Zone: six maps stitched, and the first copy that cost art

**STITCHED, NOT COMPOSED, AND THE DIFFERENCE IS THE POINT.** Frost Hollow and
Mt Moon lay separate FLOORS side by side and join them with something we
invented - a tunnelled seam, a warp - because in the real game those floors are
not adjacent at all. Emerald's Safari Zone is **six 40×40 maps that ARE
adjacent**: the game joins them with map CONNECTIONS, so walking off the east
edge of Northwest puts you one tile onto North. Laying them out 3×2 is
reconstruction rather than composition, and the seams line up because they
always did - measured, **10 disagreeing cells out of 240** along six shared
edges, all of them border fill.

**120×80 and 4,161 walkable**, against Deep Woods' 2,961 - the biggest area in
the game by 40%, which is what makes a roster this mixed honest rather than a
contradiction.

**IT IS AN EMERALD MAP AND OUR PRIMARY IS FIRERED'S.** Ids 0-639 here are
`gTileset_General` from pokefirered; Emerald ships a tileset with the same name,
the same job and completely different art. So both halves were new: `EM_PRIMARY`
bakes Emerald's General **whole** (512 metatiles, via `load_emerald_primary` -
the other half of `load_emerald`, which only ever resolved secondaries) and
`lilycove` joins the secondary list. **This is the first transcription that cost
any art at all** - Route 1, the Power Plant and Mt Moon each needed none.

**AND COLLISION IS NOT THE WHOLE STORY IN EMERALD.** Water here is **col=0,
passable**, because Gen 3 gates surfing on the metatile BEHAVIOUR rather than on
the collision bit. Classify by collision alone and 389 tiles of pond, river and
waterfall become grass you stroll across. The behaviour field - bits 0-8 of the
attribute - is also what identifies the tall grass, the sand, and best of all
the ledges: **36 tiles of `MB_JUMP_SOUTH`, which is exactly the one-way south
hop `L` has always been.** The eleven east/west ledges have no `L` to map onto,
so they stay solid; the fill proves nothing is walled off behind them.

**THE FRAME IS THE LAYOUT'S OWN BORDER BLOCK.** The six maps open onto Route 121
and onto each other, and the stitched rectangle's outer edge opens onto nothing
we have. `border_filepath` is the 2×2 the game itself tiles beyond the edge, so
the ring is drawn out of that - the nearest thing to a right answer that exists -
and made solid, because out there is not a place. **9,358 of 9,600 interior
metatiles are pixel-identical to pokeemerald and the only 242 that differ are
that frame.**

**AN APPROACH IS A RULE FOR A LEDGE WE PLACED.** Four of the thirty-six run out
under the treeline - the tail of a run Emerald drew into a tree mass - and that
is decoration rather than a trap: nobody can stand above them, so nobody hops
them, and the rest of the run works. Gated on copied cells in both fills. The
LANDING below stays unconditional, because a ledge with nothing under it is a
hop into a wall.

**SEVEN TYPES AND NOT EIGHTEEN.** The ask was a zone that hosts everything, and
`types` is the wrong lever for it: `legendsFor` reads that list to decide whose
HOME a map is, so a map claiming every type would be every legendary's home and
would flatten `legendTier` - "hunt where it lives" - into nothing. Seven is what
the real reserve holds, it is wider than anywhere else in the game, and the
breadth lives in a 36-row table instead. The Tower keeps its ghosts.

**A COPIED CELL IS EXEMPT FROM THE ART RULES, AND ONLY FROM THOSE.** Every
shape rule in `check()` — two wide on an even column, an odd number of rows, a
run at least three across — exists because **our** autotiles have nine cases.
A cell with a fixed id never reaches them. So applying those to a transcription
does not protect it, it **damages** it: Frost Hollow turns real shelf tiles into
plain ice to satisfy "never stands alone", and what it is really satisfying is a
limitation of a renderer it does not use. Route 1 forced the split — its own top
border is **two rows** of conifer and one of its ledges is **two tiles**, both
drawn by Game Freak and both refused by us. What is *not* gated is everything
about whether the map can be played: the outer ring, reachability, a ledge with
somewhere to land, a spawn outside a wall.

**GATE THEM ALL AT ONCE OR DO IT TWICE.** Route 1 needed three of these rules
relaxed, so three were, and the Power Plant walked straight into a fourth — *"a
bank is three rows"*, refusing FireRed's own banks. All twenty per-character art
rules are gated now. The guard is one clause on the loop's own `continue`, it is
inert for every map that passes no `tiles`, and **a skip can never turn a passing
map into a failing one** — which is what makes doing the whole family cheaper
than meeting them one map at a time.

**`tree.tipTop` IS THE SECOND OVERHANG, AND IT SHIPPED DECAPITATED FIRST.**
General's metatile 14/15 is the conifer's crown and its collision bit is **zero**
in every FireRed map — you walk behind it, the same two-layer trick
`forest.fringe` uses, so it maps onto `c`. But `drawOverhangs` had exactly one
piece to reach for, so it painted **Viridian Forest's round canopy over every
conifer on the map** and took the top off all thirty-six. The crown's upper
layer is baked a second time now, two halves because a conifer is two columns,
and the pass picks by the **real id** rather than by a rule. Caught by diffing
the render against the original — invisible in the CSS, invisible in every
metric, and obvious in one picture. **Look at the render.**

**A TWO-SPECIES TABLE DOES NOT SURVIVE THE BAND BUDGETS.** FireRed's Route 1
holds Pidgey and Rattata and nothing else, and that is what its `RESIDENTS` row
was written as. `BAND_SHAPE` freezes a map's rarity mix **from its own table**,
and a table of two commons has no mix to freeze: its rare share is 0% by
construction, so the evolution overlay and the per-generation homing — forty-odd
derived rows against two hand-written ones — become the entire map. check.mjs
said so exactly: *the rare share goes 0.0% → 3.8%, the overlay is meant to
enrich a map, not re-rank it*. The two headliners carry three quarters of the
weight and the tail is thin, early-Kanto and in type. **Our maps are four times
the size of the ones they are named after and hold a whole game's worth of
encounters where the original held a few minutes of one** — that is the trade
every map here already makes, and a transcription does not escape it.

**A LEDGE IS ONE-WAY, AND WHICH WAY IS THE CHARACTER'S.** Solid to ordinary
movement; walking into one ALONG ITS OWN DIRECTION hops it and lands two tiles
on. Any reachability check must therefore be a **directed** flood fill - an
undirected one passes maps that trap the player on a terrace.

`LEDGE` is the one table - `{ L: [0,1], J: [1,0] }` - and it is in `map.js` and
`build_map.py` exactly as `SOLID` is, with check.mjs holding the pair together.
`L` was the only direction there was for a year, and the reason is that every
map we DREW put its terraces above the path. **Route 112 is a mountainside**:
38 of its 41 ledges face EAST, drawn as vertical strips down the slope. With
one direction available they had to be laid as floor, which is a terrace wall
you can simply walk back up - reported from play, with the four vertical runs
circled.

**THREE FILLS HAD TO LEARN IT**, which is the same sentence Mt Moon's warps
already earned: `walk_steps`, `tryStep` and check.mjs's own. The third said
*"59 of 744 reachable"* the moment a ledge faced east, on a map that was fine.

**AND A LEDGE WITH NO LANDING IS A WALL, NOT A FLOOR.** A hop clears exactly
two tiles, so a ledge whose far side is solid cannot be jumped at all - Route
112 lays two east ledges side by side at x=12/13, and from x=11 you would land
ON x=13. Emerald refuses that jump and the pair reads as a two-thick terrace
wall, which is also what its own collision bit says. `land_ledges` turns them
to rock. The first version gave FLOOR, decided when a ledge could only face
south and floor was the safer of two guesses; it is the wrong one, because
floor is precisely the fault `J` exists to fix.

**THE CULL AND THAT RULE FEED EACH OTHER, so they run to a fixed point.** A
cell nothing can reach becomes rock, which can take the landing from a ledge
aimed at it; that ledge becomes rock too, which can cut off whatever it was the
way into. There is no ORDER that works - run the landing rule first and the
cull invalidates it, run it last and it invalidates the cull - and both only
ever turn ground into rock, so the pair shrinks and terminates.

**AND THE SPAWN BECAME A CHOICE.** "The bottom of the largest UNDIRECTED
region" is right only while every edge is two-way. Hop east off a terrace and
the door shuts behind you, so where you start decides how much of the mountain
you ever see: undirected, it picked the SUMMIT and culled 130 tiles of Route
112 into rock. Every walkable cell is tried now and the one that REACHES the
most wins, ties to the lowest - which lands on the foot of the mountain, what
the original comment wanted anyway.

**tools/play RIDES ONE, because nothing else can see `tryStep` reading the face
backwards.** The tables would agree, the maps would satisfy them, and the game
would hop the wrong axis. It finds a ledge of each kind on each map rather than
naming a coordinate, presses into it and asserts it moves two, then presses
back and asserts it does not move at all.

**Every walkable tile spawns Pokémon.** There are no special encounter tiles.

## Invariants the build asserts

`check()` in [tools/build_map.py](tools/build_map.py) refuses to emit a map that
breaks these. They exist because each one shipped as a bug that looked fine in a
screenshot:

- trees 2 wide on even columns, ≥3 tall
- canopy 3 wide, on the 3-column grid, **odd** ≥3 tall, crown visible
- water and path runs ≥3 wide; every tile under water is shore/water/pier
- piers ≥3 wide with somewhere to step on *and* off at each end
- ledges ≥3 long, reachable from above, with a landing tile
- machine banks exactly 3 rows and ≥3 wide; a console never on the plinth and
  never an end cap; barrels ≤2 tall and never standing on open floor
- an ice shelf tile never standing alone; stairs joining the shelf to the lower
  ice, never the same ground at both ends; water never a single tile;
  stalactite runs an even number of columns and exactly 2 tall; a waterfall
  ≥3 tall and landing in water
- volcanic rock never one tile thin, except the one-tile bank beside lava;
  lava never meeting open floor above or beside it, only below; pools ≥3×2;
  bridges ≥2 across and reaching dry rock on two opposite sides; ladders one
  column with somewhere to step on and off
- tower wall never one tile thin over floor (it would have no lip to draw, and
  the black void would abut the purple panel); a wall grave with wall above and
  floor below; the ward exactly one 3×3 block; graves 20–40% of the room

**A BRIDGE LANDS ACROSS ITS WHOLE WIDTH, and `lava_banks()` runs after it.**
The bank is made out of the floor beside a pool, and in the caldera it runs four
more times after the causeway is laid - so a crossing placed onto floor at both
ends had a landing tile turned to rock afterwards, and shipped two wide with
only its left column landing. `spans_clear()` asked whether the blob had ground
SOMEWHERE on each side, which one tile of landing satisfies; it checks every
column of a vertical span now, and runs in `check()` for every map rather than
only where `place_lava` calls it. `heal_spans()` is the repair, and it EXTENDS
rather than moves, because the bank is the shore and a bridge crosses its shore.
The whole width moves together - a version that only extended when every end
cell was rock refused to touch a span with one column on floor and one on rock,
which is precisely the broken case.

**Draw a bridge exactly 2 across.** The plank set is baked from Route 12, whose
own bridge is two wide, so `bridge` in `route.json` holds a left half and a
right half and nothing else. `bridgeId()` picks by the parity of the distance
to the near end, so three across comes out left/right/left and draws a rail
down the middle of its own deck. And a bridge can be broken by something placed
*after* it: a pool sunk beside Ember's causeway merged with the lake and drowned
the approach, leaving a span you could walk onto and never leave — nothing was
disconnected by it, so `spans_clear()` is what catches that, alongside
`ladders_clear()`, whenever a pool is placed.
- spawn not inside a wall; ≥200 walkable tiles; ≥90% reachable (directed)
- **the outer ring is solid, on every map**

**AND THAT LAST ONE IS NEW, BECAUSE FROST HOLLOW HAD SEVENTEEN.** A walkable
tile on the boundary is a wall you can stand in: nothing beyond it stops you,
the autotile draws its edge facing out of the world, and the camera clamps
against a tile the player is on. Reported from play as walkable walls.

Every other map was sealed BY CONSTRUCTION - a border ring is the first thing
each generator draws - which is exactly why nobody wrote the rule down. Frost
Hollow is the one map that is COMPOSED: four Seafoam floors laid in a square,
each with its own solid border that is interior to the composition rather than
the edge of it. The frame was nobody's job.

Sealing it had to clear the fixed id as well. A frost cell keeps the real map's
metatile unless we authored it, so turning the character to `I` and leaving
Seafoam's shelf art behind would have drawn a floor you cannot walk on - the
same bug pointing the other way. And sealing orphaned one tile, so the fill
runs a flood from the spawn afterwards and closes anything it cut off: a pocket
you can see and never reach is the thing this file complains about three times
over Deep Woods.

[tools/check.mjs](tools/check.mjs) adds thirty-two suites — catch rules, phase
machine, balls, master balls, economy, evolution, evolution scene, trainer
stats, casting, tileset, player, map ladder, medals, origin gate, variant rows,
steps, minimap, battle scene, band budgets, pity, daily, field items, berries,
origin art, senses, spawn ladder, clock, habitat, save migration, confirm,
areas. The count in the command table above is the same number;
both are printed by the run, so a new suite means editing both.
The tileset suite lays out Safari Zone's **real** pond through our own
`waterId` and asserts 102 tiles match FireRed exactly, and asserts every canopy
crown is whole. Biome ground and solid lists must be disjoint (an "invisible
wall" shipped once because a wall list contained a floor tile).

It also asserts **every species is gettable** — in a biome table, on a rod, or
evolved from something that is, closed under evolution. That is the check a
deleted map runs into: removing the Flower Clearing orphaned eight species, five
of them (Tauros, Ditto, Farfetch'd, Lickitung, Porygon) with nowhere else at all,
and this is the only thing that said so. Add a map, add its residents; remove a
map, rehome them.

## Design data: what not to break in `biomes.js` and `trainer.js`

`README.md` carries the reasoning. These four are the ones that go wrong quietly.

**`LEVEL_XP`'s first thirty rows are frozen.** A save holds raw XP, not a level,
so editing any of them silently re-levels every trainer who already exists. The
table was extended from 30 entries to 50 by appending only — each new increment
about 7.5% larger than the last, which is what the old tail was already doing.

**Doubling `MAX_RANK` means halving every coefficient in `trainer.js`.** Ranks
went 10 → 20 and all five coefficients halved with them, so rank 20 is worth
exactly what rank 10 used to be: `catchMult` .06→.03, `rarityPower` .04→.02
(twice — the live one and `rareShareAt`'s copy), `stepScale` .04→.02,
`sellScale` .04→.02, `priceScale` .02→.01, `xpScale` .08→.04, and the five
`effect()` strings that quote them. Miss one and the ceiling moves without
anything failing — the numbers stay monotone, which is all the suite checks.
The design number is **49 points against 100 ranks**, asserted directly.

**EVOLUTION IS CANDY AND A LEVEL, and there is no feed any more.** `evolve`
takes ONE `uid`, checks `evolveState(mon, bag, row)`, and mutates that entry in
place - the uid survives, which is what makes it a Pokemon rather than a slot.
1 candy = 1 level, `evoLevel(row)` is the real PokeAPI number, and nothing is
consumed but the stone. Do not reintroduce a pile: `feedable`/`feedSelection`/
`ANY_HERO` existed only to answer "which of these six is the hero", and a uid
cannot be asked that wrong.

**`candyValue` reads through to the BASE FORM, and that is load-bearing.**
Caterpie evolves at Lv 7 and a wild one can be caught at 7 - it evolves for free
into a Metapod a tier above it, so "evolve then convert" beat "convert" on every
line whose tier climbs. Reading through makes evolving unable to raise the yield
at all, which closes the class rather than out-tuning one case. `sellValue`
deliberately does NOT read through: cash tracks the species in hand, candy is a
wage for catching. The two measuring different things is the design, and
check.mjs pins both directions.

**INCOME HAS TO BE RENEWABLE, AND TWO THIRDS OF THE EARLY GAME'S WAS NOT.**
Reported from play at Lv 45 as money being hard to earn. Measured per
encounter, averaged over each map's whole table, at the Haggle rank a trainer
that far in would hold:

| | sell | bounty | dex | balls | NET |
|---|---|---|---|---|---|
| Lv 5 Tall Grass, Poke | ¥61 | — | ¥103 | -¥38 | **+¥126** |
| Lv 45 last map, Poke | ¥84 | — | ¥0 | -¥53 | **+¥31** |
| Lv 45 last map, Ultra | ¥142 | — | ¥1 | -¥317 | **-¥146** |

**THE GAP IS ENTIRELY THE DEX BONUS**, and that is the whole finding. Nothing
was wrong with the late game that was not wrong with the early game's honesty
about where its money came from: a flat ¥100 a species is two thirds of early
income and it MUST end. When it does, the floor drops out.

**AND MAKING IT BIGGER CANNOT FIX IT**, which cost a wrong first fix. `DEX_CLIMB`
takes the payment from ¥100 to ¥1,000 as the dex fills - and measured it is
still worth ¥0 an encounter at Lv 45, because the problem is the RATE and not
the size. What is left to find late is the rarest fifth of every table and you
almost never meet it. The first model missed this by treating the unmet share
as a flat fraction of everything caught; **sorting the table by weight and
leaving the commons out is what showed it.** The climb stays, on its own merit
- the scarce find that got harder now pays ¥820 - but it is not the income.

**SO THE INCOME IS `catchBounty`, AND THE OBVIOUS SHAPE FOR IT WAS DEAD CODE.**
A multiplier inside `sellValue` is the first thing anyone writes and it pays
exactly nothing: `keeper()` is enforced in the ENGINE on `sell` and `convert`
both, so **a variant can never be sold at all**. It is cash at the moment of
capture, on EVERY variant catch and not only the first of a kind - `newVariant`
gates the banner, deliberately, because a second Holo Pikachu is not an
occasion, and gating the money on it too would have made this one-off exactly
like the bonus it replaces. About 1 in 18 encounters, for as long as you play.

Derived from `TIER_ODDS` and the species' own band, never a table, so a ninth
tier prices itself: x9 (Vivid) to x18 (Showdown) on `SELL[band]`. `VARIANT_PAY`
18 is what flattens the curve - Lv 5 **+¥168**, Lv 25 **+¥126**, Lv 45
**+¥129** - and each step of it is worth about ¥3 an encounter.

**AND THE S BAND HAS A CEILING THE EVOLUTION DATA SETS.** `SELL.S` went ¥600 ->
¥2,800 and check.mjs refused it: `happiny -> chansey` evolves at 16, so nine
candy of commons buys a head that sells for the S band, and above **¥1,410**
the sale buys back more candy than the evolution spent. Solved for over every
evolution row rather than guessed at - `(spent + 2) * CANDY_PRICE + SELL.B`.
Raising it again means raising `CANDY_PRICE` or reading `sellValue` through to
the base form, and the second is deliberately not done.

**THE BOUNTY MUST NOT BECOME THE ECONOMY**, and that is the assertion rather
than the number: summed over a real table at the odds each tier rolls, it is
**38%** of what an encounter pays, bounded at half. Past that, catching for
money means waiting for a colour rather than playing. Verified by setting
`VARIANT_PAY` to 40, which reads 58% and fails.

**AND TWO FIGURES IN THE TEXTBOX IS A LAYOUT BUG.** Itemised, the Gotcha line
is `+¥25200 showdown  +¥1000 new entry` - **78 characters on the longest name
in the dex against the 59 the textbox was measured at**, and `.ballwrap.fighting`
stops at `var(--tb-h)`, so a message that wraps past the `min-height` puts the
ball rail back on top of itself. One total instead, which is **51** - shorter
than what shipped. Nothing is lost: the nameplate carries the tier chip, a new
variant raises its own banner, and the top bar floats the delta.

**tools/play DRIVES THE PAYMENT, because nothing else can see it.**
`catchBounty` is pure and check.mjs pins its shape, so the feature can be
entirely correct and entirely disconnected - the symptom is a number that never
moves. The same shape as the size roll: computed in one place, copied in
another, silent if the copy is dropped. A real throw with the tier forced onto
the encounter, both directions, verified by commenting out the one line that
adds it.

**AND EVERY ONE OF THOSE STREAMS IS PAID PER CATCH, WHICH IS THE HOLE UNDER
ALL OF THEM.** Reported next as running out of money entirely - *"spamming
pokeballs to legendaries and you lost it all"*, *"having no pokeballs at all
because you have no money to buy it is very possible"*. Both true, and neither
is answered by the pass above: sell, bounty and dex bonus all require a
CATCH, so on the run of bad luck that empties you they pay nothing, together,
by construction. Measured, a rate-3 legendary is **4.4 Ultra Balls an
encounter and lands 15.4%** - about ¥7,200 to own one, spent in ¥1,111
instalments with nothing to show for the failures.

**SO WALKING PAYS CASH, and it is the only income here that needs no catch.**
It is not a new mechanism: `stepReward` already pays balls every
`STEP_PARCEL` steps, already runs in `onArrive`, already has a banner on the
haul, and is already the one pure function both payers call. It returns
`money` as well.

**DERIVED FROM THE BALL LADDER, never a curve.** `stepWage(level)` is
`STEP_WAGE` throws of the dearest ball you can currently buy **that can still
fail** - so the wage is denominated in the thing you are running out of, and
it re-prices itself if the shelf is ever retuned. ¥50 a parcel at Lv 1, ¥500
from Lv 12, x`STEP_WAGE_HAUL` on the tenth. The Master Ball is excluded by the
same predicate `defaultBall` uses and for a sharper reason: at ¥50,000 it is
what you are saving FOR, and a wage denominated in it would pay ¥200,000 a
parcel from Lv 30.

**THE BROKE CASE IS NOW ONE PARCEL.** 250 steps is ¥500 and three balls at
Lv 45 - so ¥0 and an empty bag is a walk to the next parcel, not a dead save.
It was never quite a dead end (walking always paid balls) but it was a long
way back.

The curve, per encounter, with the Haggle rank a trainer would hold:

| | sell | bounty | wage | dex | balls | NET |
|---|---|---|---|---|---|---|
| Lv 5 Tall Grass, Poke | ¥61 | ¥42 | ¥3 | ¥103 | -¥38 | **+¥171** |
| Lv 25 mid, Great | ¥161 | ¥88 | ¥29 | ¥7 | -¥129 | **+¥155** |
| Lv 45 last, Poke | ¥118 | ¥52 | ¥29 | ¥0 | -¥42 | **+¥157** |
| Lv 45 last, Ultra | ¥172 | ¥75 | ¥29 | ¥1 | -¥254 | **+¥22** |

The Ultra row is thin on purpose and always was: *"commons print money, rares
burn it"* is the first sentence of `items.js`, and an Ultra Ball is for
getting the Pokemon rather than for farming.

**AND TWO BOUNDS WERE PRICING THE GAME AGAINST AN INCOME THAT HAD STOPPED
BEING THE WHOLE ANSWER.** The Master Ball's ceiling read *"27% of a
playthrough's income"* and knew about neither the wage nor the bounty - it
measured `sell - ball cost` alone, understating the real figure by 2.4x, and
understating income makes the rarest item look DEARER than it is, which is
precisely what a ceiling exists to catch. It is ¥553,002 now (¥433,002 played,
¥120,000 walked) and the ball is **9.0%**. The same fault this file already
records about `ENCOUNTER_RATE` having a second copy in the suite.

**A NEW INCOME STREAM NEEDS A FLOOR, NOT ONLY A CEILING**, and there was none
- the only thing balancing the Master Ball is its price, and a price is only a
price against what you earn. `share > 0.05`, swept rather than picked:
`STEP_WAGE` reads 9.0% at 2, 7.4% at 4, 5.5% at 8 and **fails at 10**. The
first version of that comment claimed doubling would fail it; doubling does
not, and measuring is what said so.

**THE WAGE IS PRICED IN THE STEPS BUDGET, AND THAT IS NOT A CONTRADICTION.**
*"What walking pays is a count, never a price"* is about the MASTER BALL,
which has no honest price to fold in. Cash has exactly one. So it is budgeted,
relationally: walking must never out-earn the encounters the walking is for
(¥120,000 against ¥433,002). And it cannot be farmed apart from them either -
every step carries the 7% encounter roll, so there is no way to collect the
wage without playing.

**AND THE READOUT THIS FILE DESCRIBES HAD GONE.** *"The engine grants the balls
in `onArrive`; the top bar calls the same function on the same step count to
float the `+N`"* - true when it was written, and `App.jsx` had stopped calling
it. The import was still there, `TopBar` still took a `parcel` prop and still
rendered `parcelLabel` from it, and **nothing ever passed one**: a prop that is
always `undefined` renders as nothing at all, so walking paid in silence with no
error anywhere. Found by grepping the import, not by anything failing.

**AN IMPORT IS NOT A CALL**, and that is the assertion: `/\bstepReward\s*\(/`
over `App.jsx` and `engine.js` with comments stripped, because the obvious
`src.includes("stepReward")` - which is the shape the ball-order rule three
suites up uses - would have passed the whole time. Verified by deleting the
call.

**ONE REWARD, TWO COUNTERS, EACH ANNOUNCING ITS OWN KIND.** The parcel's balls
float over STEPS and the wage floats over CASH - and the cash half needed no
code, because the money delta already watches `state.money`. A parcel reads
`+3 balls` and `+¥500`; the haul reads `+9 balls` and `+¥1500` and keeps its
banner.

**THE TIMER IS A REF AND THE EFFECT RETURNS NO CLEANUP.** Not a slip - it is
the bug recorded two paragraphs above under the money delta, met from the
other side. `return () => clearTimeout(t)` would cancel the parcel's own
removal on the very next STEP, and a step always follows a parcel
immediately, so the label would stick on the counter for the rest of the
session. The money delta needs its cleanup because it holds a LIST; this holds
one value and replaces it.

**tools/play SETS THE STEPS RATHER THAN WALKING THEM.** Crossing a parcel
boundary by walking 250 tiles is a coin toss with a near-certain loss - the
7% roll stops the leg - so `state.steps` goes one short and ONE real step is
taken. The parcel boundary is the subject; the walking is not. Verified by
commenting out the one line that adds the money.

**The candy yield must never be flat.** Flat makes one map strictly best to
grind and the other ten scenery. `CANDY` is tiered 1/2/4/8 and must stay
FLATTER than `SELL` - if candy tracked cash, a common catch would be worthless
in both currencies, and commons are what the economy runs on. Measured over the
eleven maps: **1.50 to 3.08 candy an encounter**, against **¥79 to ¥175** of cash
over the same tables - so candy is x1.9 across the game where cash is x2.2, and
the rule that it stays flatter than `SELL` holds by measurement rather than by
the tier table alone. **Yield does NOT track the level gate and must not be
made to**: Cinderpeak opens at Lv 16 and pays 1.85, below the Power Plant's
2.62 at Lv 12, because it is a ROUTE and a route is mostly commons. The
Mansion opens at 19 and pays 2.47, between the Safari Zone and the Tower. What a map
pays follows its own band mix, which is the design; the ladder decides where
you may go, not what you earn there.

**A synthetic evolution level is derived, never tabled.** A stone or trade row
has no level in PokeAPI; `evoLevel` gives it the parent's plus `SYNTH_STEP`,
floored at `SYNTH_MIN`. A table of per-method levels grows every generation and
this does not. check.mjs asserts a chain always climbs, because that is the only
thing making the derivation sound.

**Evolved forms are appended to every biome table by rule too, and for the
same reason.** 41 of the 151 were in no table and on no rod - every third stage
but Dragonite's - and the fix is `encounterTable(biome, level)`, which walks the
evolution graph out from whatever the map already spawns. **Never hand-write an
evolved form into a table to "fix" one species**: a species listed once and
derived once has two weights in the same map, and nothing fails when they
disagree. A hand-written row keeps its own weight and gets no derived one (the
`weight.has(to)` guard) but still seeds the next step, so **depth is measured
from what the map already spawns** - Ember lists Charmeleon, so Charizard is one
step away there and Venusaur is two from Deep Woods' Bulbasaur.

`EVO_FLOOR` is the load-bearing number, not `EVO_SHARE`. Proportional weight
compounds, so a weight-1 line's third stage lands at 0.04 - a rounding error,
not a chance. The floor is what makes the rarest lines reachable, and it is why
the "an evolution is never commoner than what it evolves from" assertion has to
exempt rows sitting ON the floor.

The engine calls `tableFor`, which caches one (biome, level) pair - it is asked
on every step that spawns. And **anything that grows a table dilutes the
legendaries**, whose weights are fixed: check.mjs asserts their share can only
fall as the level rises, because a floor applied carelessly could raise it and
nothing else would say so.

**MAPS ARE ON A LEVEL LADDER, and this file used to assert the opposite.**
`BIOMES[i].level` gates travel: Tall Grass at 1, the Haunted Tower at `MAP_LAST`
(20). The old design paced you with the price of balls and check.mjs asserted no
area carried a `level` at all - a good argument that lost to a better one, since
a new player cannot act on "all eleven are open but ten will waste your balls"
until after they have wasted them. **`areaOpen()` is the single answer**, used by
the engine's refusal, the Travel panel's padlock AND the Dex sheet's WHERE TO
LOOK - which is a way to GO to the map rather than only the name of it, so it
is a third screen offering travel and check.mjs asserts all three ask. A menu
that offers a map the engine will not travel to is worse than no menu, and the
failure is silent: the button is there, it is pressed, and nothing happens. `loadState` sends a save home if
it is standing somewhere it has not earned, or a pre-ladder save is stranded.
The suite asserts the SHAPE - starts at `MAP_FIRST`, ends at `MAP_LAST`,
non-decreasing, and `MAP_LAST < MAX_LEVEL` so the ladder always finishes with
levelling left.

**`PLAIN_MULT` is what a plain throw is worth, and the four situational balls
share it.** An unboosted Net Ball IS a Poke Ball - and every `bonus()` used to
return a typed-in `1.0` for its unboosted case, so dropping the plain throw to
0.8 silently made an out-of-water Net Ball strictly better than the cheap ball at
six times the price. check.mjs's `min(bonus) === ball.mult` caught it. Never type
the unboosted value into a `bonus()`.

**Catching got harder and fleeing got kinder, deliberately in opposite
directions.** Both in one pass: `PLAIN_MULT` 1.0 -> 0.8 and `fleeChance`
`0.2 + .4x` -> `0.12 + .3x`. Two nerfs pointing the same way would have made
encounters shorter AND less winnable; pointing them apart makes an encounter
last longer so a failed throw is a setback rather than the end of it. If either
is retuned alone, check that the pair still points apart.

**DIFFICULTY IS CHARGED ONCE, ON THE THROW.** Reported from play as Beldum
seeming uncatchable, and it was within a rounding error of it. Its PokeAPI
capture rate is 3 - Mewtwo's rate, correct data and not ours to edit - so
`catchChance` at a plain throw puts it exactly ON `NEVER_HOPELESS`. **This file
claimed "no species in the dex sits on it"; three do** - beldum, metang,
metagross, one evolution line - and everything else down there is legendary.

Measured at Lv 50 with an Ultra Ball and a Nanab: Beldum was 0.052% of Mt
Moon's table and **1,914 encounters to own, against Mewtwo's 1,318**. A species
with no legendary mark, no `legendTier` homing and no "hunt where it lives" was
harder to get than the hardest legendary in the game, because the difficulty
was charged twice - once on the throw and again on the spawn.

`bandFor` drops such a species one band, which took it to 0.326% and **306
encounters**. Derived from the catch math, never a list of dex numbers, so a
tenth generation's pseudo-legendary is handled on the day it ships - the exact
failure `LEGENDARY` itself had once as 34 hand-written numbers that missed
sixty.

**AND `bandFor` IS THE ONE ANSWER, BECAUSE THREE PLACES WERE ASKING.** The
first version changed `bandOf` alone; `derivedHomes` went on reading `sp.tier`
straight and Beldum's share did not move a thousandth of a percent. Caught by
measuring rather than by the suite. **`PLAIN_MULT` moved to `catch.js`** to make
that possible: `biomes.js` cannot import `items.js` (which already imports
`ENCOUNTER_RATE` from IT), and the floor binds at a PLAIN throw - at mult 1
Beldum is 1.18% and clears it, so the first predicate was false for every
species in the dex and the rule silently did nothing.

**A LEGENDARY'S HOME IS ITS PRIMARY TYPE.** Matching on ANY type gave half of
them no home at all: Articuno is Ice/Flying and the starting map is
Normal/Flying, so it was exactly as likely in Tall Grass as in Frost Hollow -
the opposite of what "hunt where it lives" means. Three tiers now, off the type
ORDER, which is already in the data: `LEGEND_HOME` for the primary,
`LEGEND_HAUNT` for a later one, `LEGEND_STRAY` everywhere else.

**And `legendTier` is exported because the RULE is the only thing worth
asserting.** A legendary's share of a finished table is confounded twice - by
how big that map's table is (Deep Woods has the smallest in the game, so every
legendary looks commoner there) and by how many others call the same map home
(the Tower is home to Mewtwo AND Mew, which dilutes Celebi's slice). Both
measures said Celebi belonged in Deep Woods while it was weighted correctly the
whole time.

**ONE FIELD EFFECT AT A TIME, whatever family it is in.** The families still
stop two of the same KIND colliding, but a repel and a honey running together
is a contradiction a player can buy: one says "meet nothing" and the other says
"what you meet is rarer". Starting anything cancels everything.

**A REPEL IS TOTAL, and its tiers are DURATION.** It used to scale the encounter
rate to 0.55/0.35/0.20 - a repel that mostly works, and "mostly" is the one
thing it must not be, since the whole reason to carry one is crossing farmed
ground without being stopped.

**A BRANCH YOU HAVE REACHED MUST LEAVE THE RECKONING.** The Box's RAISE button
showed while `need > 0`, and `need` was the minimum over ALL branches. Slowpoke
evolves into Slowbro at 37 and into Slowking on a trade, which `evoLevel` gives
a synthetic 16 - so past 16 the minimum was 0, RAISE hid itself, and Slowbro was
unreachable for the rest of the game. Reported as "Slowking is blocking
Slowbro", which is exactly what it was doing. **Any panel that reduces over
branches has to drop the ones already satisfied.**

**Legendaries are appended to every biome table by rule, never listed in one.**
`LEGENDARY` holds the dex ids; `legendsFor()` adds each to every table at
`LEGEND_MATCHED` (0.5) where the biome shares one of its types and
`LEGEND_STRAY` (0.08) everywhere else. Hand-writing one into a table as well
gives it two different sets of odds in the same place — caught, as a species
listed twice. A new generation's legendary needs one dex number here and nothing
else. Both weights are deliberately sub-1, which is also what gives **Fortune**
its teeth: `w ** 0.6` more than doubles 0.08 while a weight-22 Pidgey falls to a
quarter of itself.

**The Master Ball divisor is derived from the level cap, not chosen.**
`level % 15` in `levelReward` exists to make "three in a whole game" true at
`MAX_LEVEL` 50; it was `% 10` at 30. Move the cap and this moves with it, or the
rarest item in the game quietly quintuples — which is exactly what the economy
suite caught when the cap went up.

**Eight rare tiers, and each is a different KIND of rare** - which is what lets
them stand together instead of being eight strengths of the same idea:

| | odds | its tell |
|---|---|---|
| **Vivid** | 1/105 | the **palette**, turned up |
| **Noir** | 1/115 | **no colour at all**, in a game entirely about colour |
| **Origin** | 1/122 | the **artwork** - its debut sprite, the 1996 drawing |
| **Holo** | 1/122 | the **finish** - the ordinary art, with foil travelling over it |
| **Glitched** | 1/150 | **corrupted data** - the only tier that stutters |
| **Astral** | 1/180 | the **substance** - a starlight duotone, no new art |
| **Shiny** | 1/195 | the **alternate palette** - a second file |
| **Showdown** | 1/210 | it **moves** - a real animated GIF |

**AND THEN FLATTENED TO 2.0x, BECAUSE EIGHT KINDS ARE NOT EIGHT STRENGTHS.**
The spread was 3.81x, and the argument against it is three rows above the
table: these are eight different KINDS of rare, which is the whole reason they
can stand together. A ladder that long quietly restates them as eight strengths
of one idea, and it charges for it at the far end, where the tells are best -
Showdown MOVES and Shiny is a second set of real art.

**WHERE IT BIT WAS A LEGENDARY IN A TIER, because those are two independent
rolls multiplied.** Measured in Tall Grass at Lv 50: a legendary in Showdown
was **1 in 16,000 encounters** - 228,000 steps, four playthroughs - and a NAMED
one in the map it calls home was **1 in 317,000**. Reported as wanting it
kinder.

Every rung above Noir came down (Glitched 190 -> 150, Astral 300 -> 180, Shiny
360 -> 195, Showdown 400 -> 210) and **Vivid holds at 105**, because check.mjs
requires the kindest tier stay rarer than 1 in 100 and that bound is the only
thing stopping "kinder" becoming "commonplace" - so the ladder compresses UP
into it rather than sliding underneath, which is this file's own lever: move
the RATIO, not the base. Any variant goes 1 in 21 -> **1 in 18**, any legendary
in a named tier roughly **twice** as often, and the rosette **4,450 -> 2,887**
median encounters, which puts it inside a single playthrough. The ordering
survives; it is simply no longer four times the wait.

**THE LADDER WAS COMPRESSED AGAIN, NOT SCALED**, which is the lever this file
already names: move the RATIO, not the base. The spread went 6.36x -> 3.81x and
every tier came down with it, so a variant arrives every **1 in 20.9**
encounters against 1 in 24.9, and a rosette measures **4,450** encounters
against 5,948 on the same table. The rare end moved most because that is where
the misery was: Showdown 700 -> 400, Shiny 600 -> 360, Astral 480 -> 300.
Vivid is at 105 because check.mjs requires the kindest tier stay rarer than
1-in-100, and that bound is what stops "kinder" turning into "commonplace".

**AND EQUALISING THE GENERATIONS WORKS AGAINST THE ROSETTE**, which is worth
knowing before either is retuned again. A rosette is four variants of ONE
species, so it depends on that species' own share of the table - and spreading
the table evenly over nine generations makes every individual species rarer.
The anchor species in Tall Grass went from about 5.4% of the table to 3.2%.
The ladder compression offsets part of that and does not erase it: **the two
requests pull in opposite directions**, and the levers if it needs to move again
are `ROSETTE_NEED` and the spread, in that order.

**THE LADDER OPENED AT THE BOTTOM, NOT THE TOP.** Adding tiers to a fixed
spread makes collecting HARDER, because the rosette waits on the rarest of them
and a longer list can only raise that maximum - measured, 4,000 runs on the
starting map's anchor species: four tiers wanting all four is 8,905 encounters,
eight wanting all eight is 18,039. So Holo and Origin came DOWN (160 -> 140),
three cheap ones went underneath, and the whole variant rate went 1 in 53 to
**1 in 25**. Astral is untouched at 480 because it is what the others are
measured against; Shiny and Showdown went above it, because they are the two
with real artwork behind them and so the two worth being trophies.

**AND THE ROSETTE IS ANY FOUR** (`ROSETTE_NEED`), not all of them. Kinder odds
alone do not fix it - that was measured too. Any four of whatever a species can
wear is **2,374** encounters, inside a single playthrough, and it keeps what the
mark always meant: go wide rather than get lucky once. The Dex grid and the
sheet's COMPLETE label both read the constant, or one shows the badge and the
other does not.

**THE ORIGIN GATE IS GONE.** It used to be locked until every ordinary Pokémon
of its generation was CAUGHT - `genComplete`, `originReady`, a whole mechanism -
which made the kindest-looking tier the hardest thing in the game and the one
tier nobody could hunt: you could not go looking for an Origin, you could only
finish a generation and be handed them. Deleted with both functions.
`lockedTiers(speciesId)` survives and takes **no dex**, which is the deletion
stated in the signature; it is an ART check and nothing else, and `tiersFor`
is derived from it so the two cannot disagree about what a species can hold.

**SHOWDOWN SHIPS NOW, AS AN EIGHT-FRAME STRIP, and the conclusion that it could
not was measured against ONE option.** This used to read "the one picture this
game does not ship": the GIFs average 78.5KB, bundling them is 78.6MB, and a
naive re-encode came out BIGGER. All true, and none of it is the question.
Measured properly over fifteen species spread across the dex, every one
normalised onto the same 64px canvas:

| | each | over 1025 |
|---|---|---|
| raw GIF from the CDN | 78.5 KB | 78.6 MB |
| lossless animated WebP | 35.9 KB | 35.9 MB |
| APNG | 37.0 KB | 37.0 MB |
| **one PNG holding 8 frames** | **7.4 KB** | **7.5 MB** |

The strip is five times smaller than either animated format for a structural
reason rather than a lucky one: a single PNG is ONE zlib stream over ONE
palette, and eight frames of the same creature are nearly the same bytes, so the
window catches the redundancy. WebP and APNG compress each frame separately and
cannot. 7.5MB against the 8.9MB `public/sprites` already ships is affordable,
and it removes the only runtime network dependency the game had.
`tools/build_showdown.py` carries the measurement.

**AND IT FIXED THE SCALE, WHICH WAS THE OTHER HALF OF THE REPORT.** A Showdown
GIF is whatever size PokeAPI has it at - 156x127 for Suicune against a 64px
Rattata - so one towered over every sprite beside it and blurred when the layout
scaled it down. Every frame is normalised by `min(64/w, 64/h)` over the WHOLE
source canvas, so the creature keeps its relative size: the rule
`build_origin.py` paid for with a Piplup drawn the size of a Dialga.

**THE COST IS THAT A STRIP IS NOT AN `<img>`.** This file's rule - a tier's look
must survive as a bare `<img>` - is about the tiers that are a CSS treatment,
and it still holds for the seven that are. Showdown is real artwork that MOVES,
so it renders as a span with the strip as a background and
`steps(8, jump-none)` walking it, the same mechanism the ball throw uses.
`jump-none` because with `background-size: 100% 800%` frame i sits at `100i/7`%
- eight values inclusive of both ends - where plain `steps(8)` lands on 0, 12.5,
25 ... which is not where the frames are.

**`hasShowdown` READS THE FILES, NOT A RULE.** It was `!isForm(id)`, an
assumption about PokeAPI's coverage; 14 species genuinely have no Showdown
sprite, and any one of them could have rolled a tier whose picture does not
exist. `src/data/showdown.js` is generated from what landed on disk.

**The SPREAD matters more than the rate, and that is not obvious.** These were
1 : 2 : 8 and the completion rosette - caught plus all four variants of ONE
species - was unreachable: 0.7% chance that any of the 151 completed over a
10,000-encounter run, because a product is governed by its smallest term.
Scaling the whole ladder cannot fix that (the base has to reach ~1/64 before it
works, which is a rare every 25 encounters); COMPRESSING it can. The ratio is
1 : 1.5 : 3 now. **If completion ever needs to move again, move the ratio, not
the base.** Retune one tier alone and the ladder re-sorts itself quietly.

Origin and Holo are the *kindest* on purpose: their tells are the artwork and the
finish, and both are worth meeting often enough to recognise. Astral is the
rarest because its tell is only a treatment.

**`TIERS` in `biomes.js` is the single ordered list**, rarest first, and it is
the roll's precedence, the Box's choice of sprite, the Dex's mark order, the
encounter badge, the save's byte arrays and `keeper()`. It replaced five
hand-written copies of `["astral", "shiny", "origin"]` in five files - which is
exactly how a fourth tier ends up protected from the sell sweep and not from the
feed. **Adding one is one row in `TIER_ODDS` and one drawn icon**; if a change needs
more than that, the list has been bypassed somewhere - and it HAS been, twice.
`DexSheet.jsx` kept its own hand-written `VARIANTS` array and an
`origin`-by-name filter, so the Forms strip would have shipped missing four
tiers; it derives from `tiersFor` now. And two assertions in check.mjs were
typed-out lists of the four tier names, which failed the day the ladder grew -
the day they had nothing to say. Both are rules now: the marks row and the
Forms strip must take their order from `TIERS`, and every `TIER_ODDS` row must
quote its named constant rather than a bare number.

**AND THE CATCH BANNER KNEW FOUR TIERS OF EIGHT.** `Cheer.jsx` kept its own
`KIND` table, written when there were four, so Vivid, Noir, Glitched and
Showdown all fell through to its `?? "POKÉDEX"` — meeting a 1-in-400 Showdown
raised a banner headed with the words for "you filled a dex slot". Nothing
failed, because a missing key in a lookup table is a sentence nobody notices is
absent. `TIER_TELL` in `biomes.js` is the one table now, shared with the Dex
sheet's FORMS strip, so a ninth tier arrives in both for free and the two cannot
describe one differently. It names the TELL and never the odds, for the reason
already recorded here: two of those strings used to quote a number and both were
wrong the day the ladder was divided by 4/3.

**AND THERE IS A PAGE THAT SAYS WHAT THEY ARE.** The game's whole second half
is hunting these and nothing anywhere explained them: you met a Glitched
Pikachu, read a four-word chip on the catch banner, and that was the entire
explanation available. The Dex sheet's FORMS strip does draw all eight, but
only for a species you have already opened and only as silhouettes you have not
earned - so you could play for hours without learning that Noir exists.
`Variants.jsx` is every tier at once, drawn in its real treatment, with its
odds beside it, in the menu next to How to play.

**IT IS THE THIRD SCREEN THAT DRAWS A ROW OF TIERS, and both rules that police
those had to learn it.** The other two are why the rules exist - the FORMS
strip kept its own list and shipped missing four tiers, the catch banner kept
its own text table and headed a 1-in-210 Showdown with the word POKEDEX - so a
rule that names the files it watches is a rule the third copy escapes. Order
from `TIERS`, prose from `TIER_TELL`, and both asserted here by name.

**THE ODDS ARE COMPUTED, AND THAT NEEDED A RULE OF ITS OWN.** `TIER_TELL` is
forbidden from quoting a number because two of its strings used to and both
were wrong the day the ladder was divided by 4/3. This screen prints a rarity
for **every** tier, which is the same hazard with four times the surface, so
check.mjs greps it for a bare three-digit number that matches any tier's
current odds. Verified by typing `105` into the Vivid cell.

**A PICKER, BECAUSE HALF OF WHAT A TREATMENT DOES DEPENDS ON THE PALETTE UNDER
IT.** Pikachu, Snorlax, Gengar, Charizard and Gyarados, asked for by name and
all Gen 1 - which is not incidental, since `tiersFor` drops Origin from
anything whose ordinary art is no older than its debut, and a Sinnoh sample
would quietly advertise seven columns where this one shows eight. The grid
intersects `tiersFor` anyway, so swapping one stays honest rather than becoming
a lie nobody notices.

**And the picker earns itself in the render.** On Pikachu, Vivid is nearly
invisible - `.sprite-noir`'s own comment already records why ("Pikachu, which
is nearly all high luminance") - while on Gengar every one of the eight reads
at a glance. Looked at on both before believing either. Holo and Glitched look
plain in a still and are not: their layers are animated, which is the harness
freezing at `from`, and this file already records that trap twice.

**THE GRID IS TOLD ITS COLUMNS, NOT GIVEN `auto-fit`.** Four, dropping to two
below 470px. `auto-fit` is recorded on the FORMS strip as the wrong answer -
it fits whatever it fits, so eight cells came out as a ragged seven and one -
and four is a deliberate 4x2 for today's eight, where a ninth leaves the last
row short instead of scattering.

**AND IT SAYS THE THREE THINGS THAT MAKE IT A HUNT RATHER THAN A WAIT**, two of
which the game had never said anywhere. That the tiers are eight KINDS and not
eight strengths - the rarest is about twice the wait of the kindest, so chase
the one you like. That **pity exists**: `state.dry` has counted encounters
since the last variant since the ladder was written and no screen has ever
mentioned that the odds climb, which is a mercy doing no work. And that any
`ROSETTE_NEED` of them completes a species, which is the reason to go wide.

**TWO LAYOUTS WERE SIZED FOR FOUR TIERS.** `.cell-marks` was a no-wrap flex
row: eight marks at 12px with 2px gaps is 110px on a 76px Dex tile, so the row
ran off the side and out from under the entry number. It wraps at 9px now, two
rows of four inside the tile. And `.sf-row` was `repeat(5, 1fr)` - a literal
for four tiers plus the ordinary one - which put nine columns in five tracks.
**Anything laid out per tier has to be counted, not typed.**

**AND `auto-fit` WAS THE WRONG COUNT TOO.** It was the first fix for that, and
it fitted SEVEN 54px cells across the rail, so nine came out as a ragged 7 + 2
of squares with 8.5px type in them - smaller and messier than the four-tier
strip it replaced. It is `repeat(3, 1fr)`: **nine is 3x3**, which is what a
Kanto species wears (eight tiers plus ordinary), and seven or eight simply
leave the last row short instead of scattering. Three columns is also what
bought the size back - art 38 -> 46, label 8 -> 9, blurb 8.5 -> 10. A grid
that decides its own column count cannot be composed; one that is told the
count can.

**Two tiers wear the ordinary sprite.** Origin and Shiny have folders; Holo and
Astral do not, because neither is about artwork - they fall through to `""` in
`Sprite.jsx`'s `FOLDER`, and CSS does the rest. That fall-through is now
behaviour rather than an omission.

**A READOUT CAN OUTLIVE ITS SYSTEM TWICE.** The encounter's evolution card was
built for the feed, where catching one more of a species moved its bar - the
throw was what the number was about. Under candy a catch is fungible progress
toward anything, so the card implied a relationship that no longer existed, and
it put the level of a Pokemon you OWN a hand's width from the level of the one
you are looking at. It was relabelled `Lv 5/16` first, which fixed the wording
and kept the false implication; it is deleted now. **When a system goes, audit
what READ it, not just what called it** - and a panel that no longer has a
question to answer should go rather than be reworded.

**A READOUT OUTLIVES THE SYSTEM THAT WROTE IT.** The encounter's evolution card
said `5/16`, which under the feed meant five duplicates of sixteen and now means
level five of sixteen - same shape, same corner, different meaning, and it was
read from play as the merge system still being there. It says `Lv 5/16`. When a
number changes what it COUNTS, change how it reads, or the old meaning is what
people will see.

**`VariantFx` is the moving half of a tier, and there is one of it.** Holo's
travelling foil, Astral's breathing aura and Shiny's sparks existed ONLY in the
encounter, plus a hand-rolled copy of the foil in the Dex FORMS strip - so a
Holo in the Box was a still picture with a filter on it. `Sprite fx` wraps the
image so the layers have something to be absolute inside; the Box row, the FORMS
strip and the evolution REVEAL all use it. Not during the evolution cycle: that
phase is a white silhouette and a foil band over a white shape is a rainbow with
no creature in it. A Dex GRID cell still gets none, deliberately - see the next
note, which is the reason it can afford to.

**GLITCHED WAS ONE THIRD OF ITS RECIPE AND THAT THIRD COULD NOT RUN.**
Reported from play as "it just shakes". The tier was one animated `filter` on
the sprite, whose keyframes carried a channel split at 46% and 51% and a blown
flash at 78% — **and not one of them ever drew**, because `.sprite-glitched`
sets `filter` with `!important` and an important author declaration outranks an
animation. That is the same cascade fact the tier DEPENDS on read from the other
side: it is what protects the filter from `mon-appear`, and it is what killed
the tier's own keyframes. What was left was the `transform` jitter alone, which
is precisely a glitch with its colour deleted.

**A TIER MAY NOT ANIMATE A PROPERTY IT ALSO DECLARES `!important`**, and
check.mjs asserts that for every tier, not for this one — the trap is the
`!important` all of them need. Nothing fails at runtime: the CSS is valid, the
animation runs, the property is simply never the animation's to set.

So the split is **two silhouettes BEHIND the sprite**, one red one cyan, offset
in opposite directions during the burst — which is what `drop-shadow` was
drawing anyway, and nothing else on the element wants those properties. Behind
is what makes it a fringe: the same fill masked to the outline and laid on top
floods the whole creature. The scanline tears and the difference-blended noise
blocks are two more masked layers and were simply never ported. All four live in
`VariantFx`, so the Dex grid, the sheet, the FORMS strip, the Box, the encounter
and the evolution reveal all draw the same four, and all four mask to `--art`
or they are rectangles of static over the grass instead of damage to the
creature.

**THE UPPER LAYER IS PUT BACK OVER THE PLAYER, AND `route_top.png` IS HOW.**
A Gen 3 metatile is two layers and the keyed one draws above sprites - that is
how a trainer passes behind a tree top or walks between the Power Plant's
machines instead of on top of them. Our atlas composites both halves into one
image, which is what keeps `drawTile` to a single blit, and the price is that
every one of those drew UNDER the player. Reported from play on the transcribed
Power Plant, where **211 walkable tiles** have an upper layer.

**A PARALLEL IMAGE AT THE SAME IDS, not an appended block and a lookup table.**
Id *n* in `route_top.png` is the upper layer of id *n* in `route.png`, so the
overlay pass needs no rule, no dict and no second copy of anything. It is almost
entirely transparent - 23KB - and it makes `forest.fringeTop` and
`tree.tipTop` redundant, both being this hand-baked for one tile each. check.mjs
pins the two images to the same dimensions, read out of the PNG headers: let one
gain a row the other does not and every id past that point paints somebody
else's leaves over the player.

**THREE GATES DECIDE WHAT GOES IN IT, and finding the first cost the most.**
`METATILE_ATTR_LAYER_MASK` is bits 29-30 of a **4-byte** attribute in
pokefirered (read as 2-byte it is pure noise, which is where this started), and
`COVERED` means both halves draw BELOW the sprite - 44 of the Power Plant's 153
metatiles, the drums and terminals among them. **A fully opaque upper layer is
not an overhang**: some metatiles draw the same tile on both halves - that map's
floor does, 123 times - and painting it back does not put the trainer behind
anything, it deletes him. And **the cell has to be WALKABLE**, which is read at
draw time rather than baked, because collision belongs to the map and five of
that tileset's metatiles are laid both ways. That last one is the fix for the
second bug: an overhang is something you walk BEHIND, so it has to be somewhere
you can walk - a solid tile is one you are always in FRONT of, and skipping the
check put the Power Plant's outer wall across the trainer's head. 1,359 upper
layers, 274 after the first two gates, 33 left on that map after the third: the
generator domes, and nothing else.

**AND THE BOX IS THE SPRITE'S OWN RECT.** `drawPlayer` draws two tiles tall, so
the trainer occupies his feet tile and the one above it. The first version
padded a row below him as well, which can only ever repaint ground he is
standing in front of.

**A CELL YOU CANNOT BE SEEN STANDING ON IS NOT A CELL YOU CAN STAND ON.** Some
metatiles draw the SAME art on both halves, so the upper one lands on BG1 and
covers the tile completely - the Power Plant's machine plinth does it 123 times,
and 100 of those sit directly on top of a machine. The map calls them passable;
the renderer makes them uninhabitable, and the second fact is the one a player
meets. Reported from play as **standing on top of the machinery**, which is
exactly what it was.

`build_assets` records them in `route.json` as `hides` and every transcription
runs `seal_hidden()`: solid, and still the tile Game Freak drew. Our own
generated Power Plant had made the identical call by hand for the identical
reason - *"FireRed leaves the plinth walkable; we make it solid"* - which is the
tell that this is the map's grammar rather than a compromise. You walk ALONG the
front of a bank, never over it.

**BOTH HALVES OF THAT TEST MATTER.** The first version asked only "is the upper
layer opaque" and swept up Route 1's twenty-five flower beds: general metatile 4
also draws its art twice, but it is `COVERED`, so both halves are UNDER the
trainer and you stand in the flowers exactly as you would expect to. Opaque AND
not covered, or the rule eats the scenery it was meant to leave alone.

**A TIER'S AMBIENT LAYER CANNOT ALSO BE ITS ANNOUNCEMENT.** `VariantFx` runs
forever - the foil travelling, the aura breathing - so by the time you are
deciding what to throw it is scenery. Origin had a real entrance (`origin-fx`,
the creature restoring itself out of its own silhouette) and **the other seven
had none**, so a Glitched Pikachu arrived exactly like an ordinary one and you
found out by reading the chip. `TierReveal` is the fix: one component, played
ONCE, keyed on the encounter so the re-render every step causes cannot restart
it.

**FOUR MOTIONS AND A COLOUR EACH, not eight bespoke animations** - and which
motion a tier gets says what KIND of rare it is, which is the distinction the
whole ladder is built on: `burst` adds (Vivid, Shiny), `implode` draws in
(Astral, Noir), `scan` passes over (Holo, Showdown), `tear` breaks (Glitched,
and only Glitched). Origin is deliberately absent; two entrances would fight.

**THE FLOOD IS THE ANNOUNCEMENT AND THE MOTION IS ONLY CHARACTER**, which
`scan` had backwards on its first pass: a travelling band and nothing else,
and rendered across nine frames of its own second it was very nearly invisible
where burst and implode both hit you with a colour. So Holo and Showdown would
have stayed the two tiers you could meet without noticing - the exact thing the
component exists to fix. It floods too now. **Found by rendering all seven
frozen across their cycle; invisible in the CSS.**

**A tier's look must survive as a bare `<img>`** - still the rule, and still
why Holo's rim is three drop-shadows and NOT a `hue-rotate`: a 52px sprite with
nothing animating has to be identifiable from `filter` alone, and any screen may
end up drawing one that way.

**But "the Dex cell has nowhere to hang a layer" was wrong, and this file said
it for months.** `.cell` is a `position: relative` button with `overflow:
hidden` - a container. The claim was true of the SPRITE and got written down
about the cell, and it is what kept the grid a wall of stills: reported from
play as "the animations don't run in the dex tab", which was exactly right.
Every screen that draws a variant now draws its layer - grid cell, sheet
portrait, FORMS strip, Box row, encounter, evolution reveal.

`inset: 6%` on the grid cell's foil is not a nudge: the sprite is drawn at 88%
of the cell and centred, so a layer at `inset: 0` masks itself to a silhouette
14% bigger than the sprite it is sheening. And `.cell-marks` / `.cell-no` /
`.cell-full` needed a `z-index` - the foil is 3 and they had none, so a Holo
tile had a rainbow travelling over its own entry number.

**The lever was pulled.** `content-visibility: auto` on `.cell`, with
`contain-intrinsic-size`. This note used to say it was safe to add and had not
been, "because a realistic save holds a few dozen variants rather than 151" -
the grid is **1,145** cells now, so the condition it was waiting for arrived.
`grid-auto-rows` fixing the row height is what makes it safe.

**A TIER IS TWO THINGS, and a second copy of `FOLDER` only ever gets one.**
Shiny and Origin have their own artwork; **Holo and Astral have no folder** and
are the ordinary sprite plus a CSS filter. `Evolve.jsx` kept its own
`const FOLDER` and picked the sprite from it - right for the two with folders,
a no-op for the two without - so an Astral evolution played out in entirely
ordinary art: you watched a normal Pokemon become a normal Pokemon and found an
Astral in the box afterwards. The exact failure this file already recorded for
shiny, reintroduced by a duplicated constant that was only fixed in one copy.
**Never re-derive a sprite path**: `spriteUrl(id, variant)` is the one that
knows, and anything drawing a tier needs `sprite-${variant}` as well as the
path. check.mjs asserts both, against the source, because neither half fails
loudly - a missing folder is the right picture and a missing class is a picture
that is merely the wrong colour.

**And the evo scene's whiten needs `!important` back.** The tier filters carry
it (an animation outranks a plain declaration), so the moment those classes
reached `.evo-mon` the duotone won there too and an Astral stayed blue through a
transformation whose whole point is a white silhouette. Two classes beat one
inside the `!important` tier, so `.evo-whiten .evo-mon` wins - but only because
it also says `!important`.

**`Sprite.jsx` takes the one word the engine decided** (`"origin"`, `"shiny"`,
`"holo"`, `"astral"` or nothing) and picks the folder; no screen re-derives it,
so none can disagree, and `spriteUrl()` exports the same path for the things
that need it - the Origin reveal's silhouette and gleam, the Astral star field
and the Holo foil are all `mask-image: var(--art)`, the sprite's own PNG, so
they follow the creature's outline instead of being rectangles over it.

**`spriteUrl()` returns an ABSOLUTE url, and that is load-bearing.** A relative
`url()` inside a custom property is resolved against the stylesheet that
CONSUMES it, not the element that declares it. `--art` is set inline on a React
element and read by a rule in `styles.css`, so `sprites/54.png` was fetched from
`/src/sprites/54.png` under the dev server and `/assets/sprites/54.png` in a
build - both 404, silently, because a mask that cannot load just masks nothing.
The Astral star field and the **entire Origin reveal** had therefore never drawn
in the real app; they worked only in the render harness, whose stylesheet sits
beside the sprites. Built against `document.baseURI`, not a leading slash,
because `vite.config.js` sets `base: "./"`. **If a masked layer is invisible,
log the request before touching the CSS.** That filter is a **duotone, not a hue shift** - rotating hue makes a
green Charizard and a wrong colour reads as a rendering fault, while a duotone
throws the palette away and rebuilds it on one ramp, so the creature is still
recognised by its shape. It also has to work where nothing is animating: a 52px
Dex cell has no aura to explain it.

`tools/build_origin.py` reframes all 151 Gen 1 sprites at build time - Gen 1 art
fills 0.34-0.58 of a 96px canvas where ours fills 0.53-1.00 of 64px, so a raw
`src` swap draws every Origin visibly smaller. Its assertion has to measure
**apparent size, not pose**: comparing widths flagged Metapod at 0.49, and that
is two different drawings (Gen 1 head-on and narrow, FireRed angled and wide),
both 25px tall. The right test is that the `min()` fit touches one axis.

**Pity is a MULTIPLIER on the whole ladder, and capped.** `pityBoost(dry)` is
1 until `PITY_AFTER` and then ramps to `PITY_CAP`; `state.dry` counts encounters
since the last variant of ANY tier and resets on the ROLL, not the catch - the
misery is not meeting one. Boosting a single tier would re-sort `TIER_ODDS`,
which is walked rarest-first, for the same reason the ratio moves as a unit.
Uncapped it stops being a mercy and becomes a farm: park at 3,000 dry
encounters and every throw is a variant. `rollVariant`'s `boost` defaults to 1
so the 400k-roll rate test still measures the unaided odds.

**`rollVariant` still takes a `locked` Set, and it is now only about ART.**
`lockedTiers(speciesId)` supplies it: a species with no older drawing cannot
roll Origin, and a form with no Showdown animation cannot roll Showdown,
because the file is not there. Passed IN rather than checked inside the roll,
so the roll stays pure and check.mjs can drive it 200k times on a seeded clock.
The four possible answers are memoised Sets - this is asked once per encounter
and allocating one per wild Pidgey to say "nothing missing" adds up.

check.mjs asserts the gate's ABSENCE (`genComplete` and `originReady` must not
reappear, and `lockedTiers` must still take one argument), that Origin actually
rolls at its own rate ungated, and that locking one tier costs no other.

**Tab icons are MASKS, not pictures.** A tab is pale-on-dark when idle and
dark-on-pale when active, so a fixed-colour icon disappears in one of the two.
`public/icons/<tab>.png` is alpha only and `.tab-glyph` fills it with
`currentColor`. `tools/build_icons.py` normalises them; the `--icon` url is
built ABSOLUTE in Rail.jsx for the reason documented under `spriteUrl`.

**The variant roll lives in one function.** `rollVariant()` walks `TIER_ODDS`
**rarest first** and returns one word. They are mutually exclusive because there
is no shiny Gen 1 sprite - a Pokemon that was two of them would have no picture
to draw - and rolling commonest-first would mean the rarest tier never happens at
all. Splitting this into four `Math.random()` calls at the call site is how both
invariants get lost.

**Origin and Holo share odds on purpose, so the ladder test cannot be strict.**
check.mjs asserts `TIER_ODDS` is non-decreasing rather than strictly ordered, and
only compares MEASURED counts for pairs whose odds actually differ - asserting an
order between two equal tiers is a test that fails on a new seed. It also pins
each tier's count to within 40% of what its odds predict over 400k rolls, because
"every tier is reachable" is not the same claim as "every tier arrives at its own
rate".

**A seeded RNG in a test has to be a good one.** The roll test used the textbook
LCG `seed * 1103515245 + 12345 & 0x7fffffff`, which overflows 2^53 in JS before
the mask lands; the degenerate sequence never returned a value below 1/4096, so
**Astral came up zero times in 400,000 rolls** - and the two-tier version of that
test had been passing on luck. `mulberry32` uses `Math.imul` throughout and
loses nothing to float precision.

**Master Balls come from THREE places now, and all three are pinned.**
`levelReward` pays one every `MASTER_EVERY` levels and `stepReward` pays one
every fifth haul, gated at `TREASURE_LEVEL`. The third is the shop.

**AND THE PRICE IS THE ONLY THING BALANCING IT.** It never fails, so it cannot
be balanced by odds; it used to be balanced by being unbuyable at all, on the
grounds that "a price is only ever a delay - grind long enough and you could
hold twenty". That is still the risk, and it is now bounded by two MEASURED
numbers rather than by refusing to have the conversation:

- **Floor.** The cheapest honest route to a rate-3 legendary measures ~¥1,500
  (Timer Balls at their best case). The Master Ball must cost a large multiple
  of that or it IS the cheap way to catch a legendary and the whole ball ladder
  inverts. At ¥50,000 it is 34x.
- **Ceiling.** It must stay reachable. The best map nets ~¥42 a head and a
  50,000-step playthrough is ~3,500 encounters, so it is 34% of everything a
  whole game earns. **A ball nobody can afford is the unbuyable one again,
  wearing a number.**

Both are computed in check.mjs from the live tables, not typed in, because they
move whenever the economy is retuned. Retune `SELL`, the ball prices, the
encounter rate or `fleeChance` and re-read what it prints.

**The step reward is still counted, never priced.** `worth` in the steps suite
sums the three priced balls by hand and leaves the Master Ball out, which was
right when it had no price and is still right now that it has one: what walking
pays is a count, and folding a ¥50,000 item into that total would make a step
budget approve anything.

**A variant is its own row in the Box, and its own hero.** Rows key on
species AND variant. That is a UI change with a logic tail: `feedable(box,
row, want)` takes which variant is evolving - `ANY_HERO` (the old "rarest
present", still the default), `null` for the ordinary pile, or a tier name -
and `evolveState`/`feedSelection` thread the same `want`, or a row says READY
over a feed it cannot assemble. The FEED is untouched and must stay so: it is
`!keeper`, so no variant is ever eaten no matter who is evolving. `ANY_HERO`
is the string `"*"` rather than `undefined`, because the other two answers are
a tier name and `null`, and `undefined`-means-any next to `null`-means-ordinary
is one typo from evolving the wrong Pokemon.

**A MANIFEST THAT CANNOT BE EDITED IS A RECEIPT, NOT A CONTROL.** The sweep
dialog listed exactly what it was about to take, which is right up to the moment
the list contains something you would never give up. Reported with a screenshot
of **two Latios queued for Rare Candy**: the dialog was doing precisely what it
said, and what it said was the problem. `keeper()` holds every variant out of
`duplicateUids` entirely - so no tier ever reaches the list - but **a legendary
is not a keeper**, and at 1 in 3,760 encounters it is rarer than any tier.

**THE FIX IS A CHECKBOX AND NOT ANOTHER `keeper()` CLAUSE**, and the reason is
where `keeper` is enforced: in the ENGINE, on `sell` and `convert` both. Making
legendaries keepers would mean you could never convert a fifth Latios even
deliberately, from its own row - protection that turns into permanent clutter.
So a legendary arrives **unticked**: the default does the protecting and the
tick is there for when you really did mean it, with a `LEGENDARY` chip on the
row saying why it came that way. (A default whose reason lives only in the note
underneath reads as the dialog having lost your place.)

**AND THE ARITHMETIC IS A FUNCTION OF WHAT IS STILL TICKED.** `lines` and
`confirmLabel` were strings built once when the dialog opened, which is fine for
a receipt and wrong for a control - untick a row and the header goes on quoting
a total nobody is about to receive. `recount(keptUids)` rebuilds both, `Confirm`
owns the dropped set (it is thrown away when the dialog closes, and nothing
outside has a use for a half-made decision), and `run(picked)` **must never fall
back to the full list** - a sweep that quietly took everything when the argument
was missing is the exact failure the checkboxes exist to prevent.

**A `<label>` IS NOT AN `<li>`, AND ONLY AN `<li>` MAY BE A CHILD OF A `<ul>`.**
The row became a label wrapping a real checkbox - which is what makes the whole
row the hit target, gives it its accessible name for free and puts it in the tab
order with no `aria-label` to keep in step - and swapping it for the `li` broke
both the markup and every `.cf-manifest li` rule with it. The `li` is the list
item; `.cf-row` is the thing you click.

**Counts that said "species" now count rows.** Three Pidgey rows are still one
Pidgey - `speciesCount` is a Set over `g.species`, and the sell-all dialog
counts what is kept as `box.length - spares` rather than the row count.

**No rare tier is ever taken by a bulk action.** `duplicateUids` (sell spares) holds
shinies out of the spare list *entirely* rather than sorting them to the front —
sorting only ever protects the first `keep` of them - and `feedable()` excludes
them from the feed while preferring one as the **hero**, which is the one that
survives and comes out the far side still shiny, or still Astral. Both are
one-button actions with no undo, and at these odds there is no farming another.
**`keeper()` is the single predicate** for it, and check.mjs runs every one of
these cases over a `TIERS` list rather than naming two of them: two answers to
"which ones are precious" is exactly how a third tier ships protected from the
sweep and not the feed. Adding a fourth means adding it to `keeper()` and to
that list, and nowhere else.
`evolveState` and `feedSelection` both count through `feedable()` for the same
reason: two counts of the same pool is how a panel comes to say READY over a
feed that cannot be assembled. **A test for this needs TWO shinies** — both of
these tests passed with the protection deleted when written with one, because a
lone shiny is kept by the reserve anyway and a lone shiny is always the hero.

**Walking pays, and `stepReward()` is pure so both sides can call it.** The
engine grants the balls in `onArrive`; the top bar calls the same function on the
same step count to float the `+N`. One function, not a number passed around, so
the two cannot disagree. Only every tenth parcel raises a banner - a 3.2s overlay
every half minute of walking is an interruption. It is also the easiest reward in
the game to make accidentally infinite, so check.mjs pins the cadence, the
scaling, that ordinary parcels never pay Ultras, and the 50,000-step total.

**A PRESS THAT CANNOT BE TAKEN BACK ASKS FIRST, AND THE GATE IS IN THE
ENGINE.** Two of them, both reported from play: a Master Ball thrown by
accident, and a legendary run from by reflex. The ball is ¥50,000 or 12,500
steps of walking and throwing one ENDS the encounter; a legendary is 1 in
3,760 encounters and RUN sits under the thumb that throws.

**EIGHT CALL SITES IS WHY IT IS NOT AT THE CALL SITES.** Five throws - the key
handler, the bag sheet, the rail, the pad's A - and three flees, spread over
`App.jsx`, `Pad.jsx` and `Encounter.jsx`. This file already records what
guarding each one costs (*"a rule enforced in one of two places is not a
rule"*, the shiny protected from one bulk action and not its sibling), and
`keeper()` lives in the engine for exactly that reason. Gated in `throwBall`
and `flee`, **`Pad.jsx` needed no change at all** and a sixth call site is
covered on the day it is written.

**`state.ask` IS THE PRESS, NOT THE DECISION.** It carries the function to
re-run, so confirming re-enters `throwBall`/`flee` from the top rather than
reaching into their middle - every guard runs again, and an encounter that
ended under an open dialog is a no-op rather than a special case. Never saved,
for the reason `worn` is not. The question is cleared when the encounter is,
and `App` renders the dialog on `st.ask && st.encounter` so a stranded one
cannot draw.

**THE PREDICATES ARE THE ONES ALREADY IN USE.** The ball is gated on
`mult >= GUARANTEED` - what `defaultBall` refuses a bare throw with, so a
second ball that cannot fail is covered the day it ships - and AFTER the bag
check, because confirming a ball you do not hold is a dialog about nothing.
The flee is gated on `isLegendary(e.speciesId)`, which is exactly what
`Encounter.jsx` draws the mark from, on a `speciesId` frozen at spawn: the
dialog and the badge cannot disagree, and a second `legendary` field on the
encounter would be a copy with nothing to gain.

tools/play drives all four answers through a live engine - asking does not
spend, NO costs nothing, YES spends, and an ordinary ball and an ordinary
species are not gated at all, because a confirmation you cannot decline is a
click tax. Verified by removing each gate.

**AND `tone="warn"` HAD NO RULE.** Three dialogs passed it - log out, the
session taken away, and both of these - and `.cf-yes.warn` did not exist, so
all three rendered as the ordinary confirm. CSS is especially good at hiding
this: an unknown word in a template string is a class nobody styled, and the
button falls back to looking *correct*. Found by grepping for the selector,
not by looking at it, because "it looks like a confirm button" is what the
right and the wrong answer both look like.

**"READY FIRST" WAS DEX ORDER, AND THE TIEBREAK IS WHAT DID IT.** Reported as
a sort that does not seem to do anything, and it did not: `SORTS.ready` was
`() => 0`, meaning "keep the order the memo built", and `shown` finishes every
comparator with `|| a.species - b.species` so that no sort is left unstable.
`0 || x` is `x`, so the built-in order was discarded and the option sorted
**identically to "By dex"**. **A no-op comparator is only a no-op when nothing
follows it.**

The ordering is written once now (`ACTIONABLE`) and both readers use it - the
memo that builds the default order and the menu entry that restores it. Two
copies of "ready, then spare" is how they come to disagree, and this pair had
already disagreed with nothing able to say which was right.

**AND IT IS NOT THE SAME THING AS THE FILTER**, which was the question asked:
"Ready to evolve" HIDES every other row, "Ready first" keeps them all and
floats the actionable ones. One is for doing a job, the other for browsing
with the job in reach.

**Medals are derived, never listed.** `medals.js` builds all 80 from the
evolution graph, the type lists and the biome tables, so a new species or a new
map grows the set with nothing edited by hand. `medalsFor()` is indexed by
species — registering a Rattata looks at the four medals that mention Rattata,
never at all eighty. `state.medals` banks the ids so nothing can pay twice, and
check.mjs walks a whole dex asserting every medal fires **exactly once** and
prints the total payout, because a reward table is exactly the sort of thing
that grows a zero by accident.

**A SAVE THAT FAILS TO LOAD MUST SURVIVE THE SESSION THAT COULD NOT READ IT.**
`loadState` catches everything and falls back to `freshState()`, which is right
— a save you cannot read should not stop you playing. What was wrong is what
happened NEXT: the first step called `save()` and wrote the fresh state straight
over the file that had failed. One bad parse and a real collection was gone,
with nothing anywhere to recover from and no message saying so. It has now cost
two.

Three keys, and the other two exist because of that. **BROKEN** is the raw text
of anything that failed, kept verbatim by `stash()` on EVERY failure path and
never parsed — the one thing you want from a file you cannot read is the file.
**BACKUP** is the last save that loaded cleanly, written at LOAD time and not at
save time, so it is always a whole previous session rather than a copy of
whatever went wrong a moment ago. `recoverable()` is what the Trainer panel
reads, so the offer only appears when there is something behind it, and
`restore()` validates through `saveProblem` and reloads — the same path
`importSave` takes, for the same reason.

It does not take a bug in this file to trigger it: a dev server hot-reloads a
source edit the moment it is typed, so a half-applied change to the save shape
is live in an open tab before it is finished. tools/play drives a real session
over a truncated save and asserts the overwrite HAPPENED (or the test proves
nothing) and that the original survived it anyway.

**One validator for a save, wherever it came from.** `saveProblem()` is used by
both `loadState` (localStorage) and `importSave` (a chosen file). It is
deliberately shallow — anything merely odd is repaired by `loadState`, because a
save that is strange should still open; what it rejects is a file that was never
a save. `importSave` writes and reloads rather than swapping state in place: the
engine closes over the map rows and their dimensions, and a reload is the one
path that is certainly consistent.

**`normalise` IS FOR ONE-BIT ROWS; THE DEX IS THREE-VALUED.** `padDex` for the
dex, `normalise` for the tier rows. They are the same function one value apart,
and using the wrong one demotes every CAUGHT species in every save to SEEN - it
shipped to a dev server for twenty minutes and cost a real collection.
`repairDex` puts back what a save can still prove: anything in the BOX was
caught, and any registered VARIANT was caught (tier rows are one-bit, so they
could not be damaged). It only ever raises a 1 to a 2. **A source edit reaches a
running dev server immediately - a save-format change is live the moment it is
typed, not when it is committed.**

**A DEX ID IS NOT AN ARRAY INDEX.** `speciesById(id)` for the species,
`dexIndex(id)` for its POSITION - which is what `dex` and every per-tier byte
row are keyed on. `SPECIES[id - 1]` and `dex[id - 1]` are correct only for a
contiguous 1..N dex, and Gen 3 does not ship: ids run 1-251 then 387-493 across
358 entries, so every Sinnoh catch was writing off the end. Both lookups are
Maps, built once, because the Dex grid asks per cell per render. **Gen 3's
absence is deliberate** - a contiguous dex hides this entire class, so the hole
is the test.

**A GENERATION INSERTED IN THE MIDDLE MOVES EVERY POSITION AFTER IT.** A save's
`dex` and every per-tier row are keyed on POSITION in `SPECIES`, which is
correct, compact, and survives exactly as long as nothing is inserted before the
end. Hoenn is inserted before the end: position 251 was Turtwig and is now a
Hoenn species, so a save loaded by position shows every Sinnoh Pokemon somebody
ever caught as a different one — silently, with no error anywhere.

**Padding is right for a generation APPENDED and wrong for one INSERTED.**
`LAYOUTS` records every shape `SPECIES` has shipped in, `layoutIds(len)` returns
the ids that shape was keyed on, and `remap()` rebuilds the row BY ID. Add a
generation anywhere but the end and add its old layout there, or the next hole
is silent.

**And `repairDex` takes the REBUILT rows, not the save.** It recovers caught
status from the box and from registered variants, and reading `s[tier]` meant
reading OLD positions into a NEW dex: a shiny Turtwig at old position 251 marked
whatever now sits there as caught, which after Hoenn is Treecko. The box loop is
safe either way because a box entry carries its species id; the tier rows are
not. tools/play loads a real pre-Hoenn save through `loadState` to prove it.

**Kanto is the first 151 positions of `SPECIES`, and saves depend on it.** A
save written before Johto keyed its bytes by `id - 1`; padding it works only
because position and `id - 1` agree for Kanto. check.mjs asserts that alignment
- insert a generation BEFORE Kanto and it is the only thing that will notice.
`loadState` pads a short dex rather than rejecting it (rejecting deleted every
existing collection) and uses `padDex`, NOT `normalise`: the dex is three-valued
and `normalise` coerces `? 1 : 0`, which demotes every caught species to seen.

**NO GENERATION IS COMMONER THAN ANY OTHER, AND THAT TOOK TWO FIXES.**

Reported from play as Gen 1 feeling far commoner than everything else, and it
was. Measured at Lv 50 with all nine generations open, against a fair 11.1%:
Gen 1 took **23.3%** of Tall Grass, **41.8%** of the Haunted Tower, **57.8%** of
the Power Plant and **63.6%** of Frost Hollow - and Gen 6 took **0.0%** of the
Power Plant. Two independent causes, and neither fix reaches the other:

- **The weights.** `DERIVED_WEIGHT` is 8/5/3/1 against Gen 1 commons hand-tuned
  at 22, under a comment saying they sit below them on purpose. That argument
  was about ordering INSIDE a map and it cost a five-fold skew to get it.
- **The homing.** `derivedHomes` sends a species to its one best type match,
  which is what makes a map feel like somewhere - and starves the narrow ones.
  A generation with nothing living in a map cannot be given a share of it by
  any weight at all, so the zeroes were structural.

**A FILLER MUST SHARE A TYPE WITH THE MAP, and leaving that out put the starters
in the volcano.** Reported from play: Ember was spawning Turtwig, Grotle and
Piplup. The pick sorted by type overlap alone, so every species with NO overlap
tied at zero and a stable sort left them in dex order - which for un-evolved
Pokemon begins each generation with its three starters. Ember took Treecko and
Mudkip, Turtwig and Piplup, Chespin and Froakie, Grookey and Sobble, Sprigatito
and Quaxly. **Every single wrong resident was a starter**, which is the tell
rather than a coincidence. Overlap is a FILTER now and not a sort key: a
generation with one plausible candidate gets one, and `fitShares` gives it its
share through whatever does live there. Presence is what the assertion wants; a
count was never the point.

**A SINGLE-TYPE MAP STARVES ITSELF, AND EMBER WAS THE ONLY ONE.** It passed
the generation bound at exactly **25%** - the one map with no headroom at all,
so any unrelated change tipped it, and an audit pass that touches rosters
elsewhere is exactly such a change. `derivedHomes` filters candidates on a
SHARED TYPE, so a one-type list is the narrowest pool in the game: the fewest
generations can reach it, and the ones that do concentrate. This file already
recorded the symptom without the cause - *"the two that moved most are the maps
with the narrowest type lists"*.

**A resident was tried first and is the wrong lever.** Camerupt is Gen 3 and
band B, exactly the hole, and it took the spread 25% -> 2% - and pushed the BAND
budget to **2.7pp against a 2.5 bound**, because the band budget compares
residents at Lv 1 against Lv 50 and a non-Kanto row is absent at one end. Pairing
it with an A-band partner to match the Kanto A:B ratio did not close it either.
The two constraints conflict when the fix is a single row.

Widening the list to `["fire", "ground"]` satisfies both - **25% -> 17% with the
band drift unmoved at 2.15pp** - because it feeds the map through the mechanism
that was starving it rather than around it. Ground is the honest second type for
a volcano rather than a lever picked to pass: Camerupt, Numel and Magcargo are
what a caldera holds, Groudon is the legendary that belongs in one, and the map
still measures **68% fire**.

**`GEN_HOME_MIN` (4) is the ceiling on that fill, and four is measured.** Sweeping 1 to 8,
generation evenness sits at ~5.5% off fair at every value - presence is all it
needs - but the BAND mix only converges from four upward (0.10pp at four against
8.9pp at three). Four costs 60 extra homes where eight costs 223 for the same
result, and every one of those is a species standing somewhere it does not
belong. **A filled slot must not bring a band the map does not already have**,
or `balance` gives it `BAND_FLOOR` and the new band dilutes the mix the map was
tuned around - that put Ember's A band 2.7 points out against a 2.5 bound whose
own note says "if this ever needs 4, the homing is what to look at, not this
number".

**`fitShares` FITS TWO MARGINALS, because neither may give way.** The band mix
per map is the design and so is an even spread of generations, and no single
rescale satisfies both - fixing the bands moves the generations and fixing the
generations moves the bands. Alternating the two converges on the closest table
honouring both. Measured across all eleven maps at every level: every generation
within **25%** of fair (worst is Ember's Gen 2 at Lv 20, the narrowest map with
only four generations open) and every band within **0.10pp**. **It always lands
on the band step**: running out of rounds leaves whichever ran last in force,
and the band mix is asserted where the generation spread is a target.

**THE GENERATION TRAVELS THE CHAIN, exactly as the band does.** The first
version scaled each row by its own `genOf`, reasoning that a species and its
evolution are one line and so one generation. They are not - Gloom is Gen 1 and
Bellossom is Gen 2, Golbat and Crobat likewise, and every Eeveelution - so the
two got different scale factors and the evolution came out COMMONER than what it
evolves from (0.440 against 0.375 in Deep Woods). check.mjs caught it
immediately. Slot 4 carries the line's generation the way slot 3 carries its
band, so `parent x EVO_SHARE` survives exactly.

**A MAP'S RARITY MIX IS FROZEN FROM ITS OWN TABLE.** `BAND_SHAPE` is computed
per biome from `RESIDENTS` - the hand-written rows - and `balance()` rescales
each rarity band back to it. Per map and not globally, because one global mix
would flatten Tall Grass (78/13/5) and the Haunted Tower (18/51/30) into the
same map and that difference IS the design. Measured before it existed: adding
Johto and Sinnoh TRIPLED Tall Grass's rare band, 5.1% -> 15.4%, because
newcomers arrive on a flat tier weight while the Gen 1 commons are hand-tuned
at 22.

**A derived evolution is banded with its PARENT, and the band travels the whole
chain.** Slot 3 of a row is the band it competes in. Banding by its own tier
splits Tangela (B) from Tangrowth (A) and rescaling then makes the evolution
commoner than the thing it evolves from; carrying it only one step fixes that
pair and leaves Mareep -> Flaaffy -> Ampharos broken. Inside one band the scale
is uniform, so `parent x EVO_SHARE` survives exactly. `BAND_FLOOR` is what stops
a band with no Gen 1 members (Rock Ridge has no S-tier) from giving a newcomer a
zero weight and making it unreachable.

**A WRITTEN WEIGHT IS A RANK WITHIN ITS OWN CELL, NOT A SHARE OF THE MAP**, and
anyone tuning a table needs it in front of them. `balance` rescales per BAND and
`fitShares` rescales per GENERATION, alternately, so what survives is a row's
standing against the others in its own (band, generation) cell - and the two
rescalings compound. Measured at Lv 50: the Mansion's Rattata is written at 8.4%
of its table and spawns at **0.13%, a 64x crush**, while Koffing one band over
loses only 3.5x. Untouched Tall Grass does the same thing - Venonat, 40x.

Nothing is wrong: every map holds its band mix inside 2.5pp and every generation
inside 17% of fair, which is the design doing exactly what it says. What is
misleading is the authoring interface, and the consequence is practical - **put
a species you want FELT in a generation the fit is not already suppressing.**
The Mansion's psychic works because Solosis and Elgyem are Gen 5 (2.8% and 2.0%)
and does not because Abra is Gen 1 (0.07%), on comparable written weights. Do not
"fix" this by reaching for `balance` or `fitShares`: they are the two marginals
the whole economy is fitted to, and the crush is the price of fitting both.

**The guarantee is about RESIDENTS, not the whole table.** The evolved-form
overlay is supposed to enrich a map as you level, so check.mjs measures the mix
with depth-tagged rows filtered out - counting them would assert that the
feature does not work. Residents hold to half a point; the overlay moves meadow
to 69.8/18.2/9.6 and that is progression.

**THREE FIELD FAMILIES, THREE LEVERS, AND NO TWO ON THE SAME ONE.** `repel`
scales how OFTEN an encounter happens, `rarity` (the White Flute) moves WHICH
SPECIES through Fortune's own exponent, `variant` (the honeys) moves WHICH TIER
through the variant roll. That separation is the whole answer to "three things
reshaping one table need one rule, not three" - nothing here invents a
mechanism, each borrows one the game already had. check.mjs asserts every item
declares exactly ONE of `rate`/`tilt`/`lift`, that a family never mixes two, and
that no two families share one; two families on one lever are one family with
two names. **A new field item belongs to a family or it needs a new lever.**

**A COLOURED JAR IS BAIT, SO IT DAMPS WHAT IT IS NOT BAITING.** Reported from
play: a Glitched Honey run turned up a Holo, a Vivid and one glitched. Measured
over 40,000 runs, that was not bad luck - a coloured jar handed you 3.05 of its
own tier and 1.96 of everything else, so **only 61% of what you met was the
thing you paid for**, which reads as a general boost with a colour on it.
`favour` lifted its tier and left the rest at full odds, and the rest is SEVEN
tiers: their combined odds beat any single one, so the jar could never be more
than a plurality. `FAVOUR_DAMP` (0.25) takes it to **86%**. The same lever
pointed the other way rather than a new mechanism - a multiplier on odds inside
`rollVariant`, where every reshaping of the ladder already happens. The plain
Honey damps nothing: lifting the whole ladder IS its identity.

check.mjs asserts the SHARE now. The old assertion said a honey must "leave the
others where they were", which is what let this ship - it forbade the one thing
that would have fixed it. What survives is the half worth keeping: no other
tier may go UP.

**`state.field` IS KEYED ON THE FAMILY, NOT THE ITEM ID.** That is what makes
"one of each kind at a time" structural rather than a rule somebody enforces: a
Max Repel replaces a Repel by being written to the same slot. Keyed on the id,
two honeys could run at once and "what are the odds" would have two answers.

**ONE EXPONENT DECIDES HOW RARE THE WORLD IS, and `tilt` is a NUMBER.**
`rarityPower(stats, tilt)` is the only thing in the game that reshapes an
encounter table by rarity: Fortune is a permanent investment in it and a White
Flute is four hundred steps of one. They are the same number rather than two
transforms stacked on one table, and the pile-up being guarded against is a
second `w ** q` pass ANYWHERE. **Never add one.** The test has no literal in it:
if the flute IS Fortune's exponent then what it is worth cannot depend on your
Fortune rank, so check.mjs asserts the delta is the same at every rank. A
second transform would compound and fail it.

`RARITY_FLOOR` is insurance against a future retune, not a description of this
one: maxed Fortune plus a flute is 0.45 against a floor of 0.4, so the clamp
never fires today. Its assertion is therefore written against the CONSTANT -
`22 ** RARITY_FLOOR > 2` - because what it exists to catch is somebody moving
the coefficients above it. At exponent 0 every row in the table is worth the
same and rarity stops existing.

**REPEL IS ON ITS OWN AXIS AND MUST STAY THERE.** check.mjs asserts the word
`repel` appears in the CODE of neither `trainer.js` nor `biomes.js` - comments
stripped first, because the prose should absolutely name it and the first
version of that assertion failed on the comment explaining the rule. Crude, and
exactly right: the failure it guards is somebody giving it "a small table
effect too".

**A JAR FOR EVERY TIER, AND EVERY NUMBER ON ONE IS DERIVED.** There were three,
written when there were four tiers, so five of the eight had none - reported as
missing honeys for the new variants. The shelf answers the bloat argument by
itself: `onShelf` shows what you can buy plus the next thing to open.

**THE LIFT IS COMPUTED, AND IT HAS NOW DRIFTED TWICE IN OPPOSITE DIRECTIONS.** A
Shiny Honey quietly fell to 43% when Shiny went 1/240 to 1/600; when the ladder
was compressed the other way they drifted UP, to 82-91%, against a design that
says three-in-four. Both times a jar changed value because a number in another
file moved. `honeyLift(odds)` solves for it, so every jar is equally good at its
own tier BY CONSTRUCTION, which is what the design always claimed.

**AND IT SOLVES FOR A COUNT NOW, NOT A CHANCE.** It solved
`P(at least one) = HONEY_LANDS`, three-in-four over the run - and the trouble
is the other quarter: a jar paid for up front that one time in four does
nothing at all. That is a lottery ticket rather than an item, and it is why the
honeys read as not worth buying. `HONEY_MEETS` is a COUNT, so
`lift = MEETS / (met x odds)`, and **three** is the number because three is what
makes the purchase obvious - you buy a Shiny Honey and you meet shinies, plural,
with nothing to be unlucky about. Measured: every jar lands within a rounding
step of 3.0 whatever its tier's odds, so the price still says which tier you
want rather than which jar works.

**THE PRICES WENT UP WITH THE VALUE, ON PURPOSE.** ¥2,400 + ¥300/rank became
¥6,000 + ¥900/rank (plain Honey ¥1,400 -> ¥3,500): two and a half times the
price for about four times the item, because a jar left at the old band would
quietly have become the best purchase in the shop. A Showdown Honey is ¥12,300
against a playthrough's ~¥147,000 - a real decision, and an obvious one. **With
one running, any legendary in that tier goes from 1 in 16,000 encounters to
1 in 560**, and a named one at home from 1 in 317,000 to 1 in 11,100.

**AND THEN THEY COST MORE THAN THE PLAY THEY COVERED.** Reported as too
expensive, and it was measurably that rather than a feeling. A honey runs 600
steps, which is **42 encounters**, and 42 encounters gross about ¥3,800 on the
starting map and ¥7,300 on the richest. At `6000 + 900 * rank` a Showdown Honey
was ¥12,300: **168% of the best map's take over its own run and 324% of the
starting map's**, with six of the nine jars over 100%. An item you can only fund
by NOT using it is a price with no product.

Every other assertion here passed the whole time, because none of them had any
idea what a run is worth - and the price was two typed numbers with no
relationship to the economy, which is exactly how it drifted. **A jar must cost
less than the play it covers earns** is the rule that was missing, and it is
computed from the live tables now, the same way the Master Ball's floor and
ceiling are. Two anchors, each where it means something: the DEAREST against the
richest map, because that is where a late jar is spent and it is the test the old
price failed; the CHEAPEST against the starting map, because that is the first
one a player meets. Anchored both to the start, the dearest read 99% and passed
on a margin too thin to mean anything.

`HONEY_BASE` 2000 and `HONEY_RANK` 250 puts the dearest at ¥3,750 - **51% of the
richest map's run** - so a jar pays for itself and the decision is which tier you
want rather than whether you can absorb the cost. **It is still a real spend**:
a whole playthrough's ¥128,000 spent on jars covers about half its runs and
roughly DOUBLES the variants it meets (134 bought against 167 that arrive on
their own), for every yen - so no balls and no candy. At the old band the same
total bought 42, a quarter uplift for all your money, which is why they read as
not worth buying. Verified by putting `6000 + 900` back: *"a Showdown Honey
costs ¥12300 and the 600 steps it runs for gross ¥7331 on the richest map"*.

**`LIFT_CEILING` IS WHAT STOPS THIS RUNNING AWAY**, and check.mjs now asserts
the two do not meet. It caps any tier at 1 in 5 however many multipliers stack,
so three meets a jar cannot become a tier you are simply handed and pity on top
of a honey is still bounded. Raise `HONEY_MEETS` far enough and the CLAMP
rather than `honeyLift` decides what a jar is worth - and then the jars stop
being equally good at their own tiers silently, because the rarest clamp first
and nothing else would say so.

**PRICE AND LEVEL COME FROM THE RANK, NOT THE LIFT**, and the suite is what said
so: the lift is an integer ceiling, so Vivid and Noir both round to x4 and
priced identically - and Origin and Holo share odds EXACTLY, so no function of
odds could ever separate them. Effectiveness tracks the odds because that is
what makes a jar work; price tracks ladder position because that is what makes
it a ladder.

**`ENCOUNTER_RATE` LIVES IN `biomes.js` NOW.** It was in engine.js, which is the
wrong file twice over: how often the world stops you is a property of the world,
and `items.js` needs it to price a honey and cannot import the engine - the rule
modules are browser-free and the engine is not.

**AND check.mjs KEPT ITS OWN COPY, UNDER A COMMENT SAYING IT WAS THE ONLY ONE.**
`const ENCOUNTER_RATE = 0.07; // engine.js; the only copy that matters` - true
the day it was written, false from the day the constant moved here and was
exported. A second copy of the number that decides how often the world stops
you, in the file whose entire job is catching second copies, and the one the
Master Ball's ceiling was priced against. It is imported now. **This file says
four times that a second copy drifts; the fifth was in the suite.**

**A COLOURED HONEY IS THE JAR PLUS THE TIER'S OWN TREATMENT.** `art: "honey"`
points all four at one picture and `tier` is what makes a Holo Honey look like
a Holo - the same foil, the same layer, masked to the jar instead of a
creature. So `ItemIcon` is the one thing that draws an item (shop shelf,
floating rail, effect readout) and `artOf(item)` is what knows they share art:
the sprite assertion goes through it, or three correct items fail for missing
files that should not exist. Adding a fifth tier adds its honey for free.
**There is deliberately no Origin honey** - Origin is gated on catching every
ordinary Pokemon of a generation, and an item that shortcuts a gate is the gate
deleted. check.mjs asserts that absence, so it reads as a decision.

**BOUGHT IS NO LONGER USED, and the reversal is the note.** These were
buy-and-start in one click with no inventory, which was right while there were
two of them and wrong the moment there were eight: you cannot carry a Max Repel
for the cave you are about to enter if buying it starts it in the field you are
standing in. They are ordinary bag items now - same shelf as the balls, same
`buy()` - and `useField(id)` spends one out of `state.bag` and charges nothing.
It ASSIGNS the step count; `+=` would make the price of a long effect the price
of a short one typed twice. Steps, not seconds, so an effect is not burned by
walking away from the keyboard. The readout sits opposite the minimap, because
an effect paid for in steps belongs where the steps happen.

**RESIZE THE CANVAS, NEVER THE CREATURE.** `normalise()` in build_origin.py
puts Sinnoh's 80x80 HGSS art on the 64px canvas everything else uses, and its
first version cropped to the art's bounding box and scaled THAT to fill - which
does put every sprite on the right canvas and destroys relative size doing it.
Measured: Gen 1 and Gen 2 fill a median 0.73 of their canvas (a Caterpie is
small, a Snorlax is not) and every Sinnoh sprite came out at 1.00. Reported from
play as a Piplup drawn the size of a Dialga, which is exactly what it was. The
raw art already carries the scale - Piplup fills 0.44 of its 80px canvas and
Dialga 0.99 - so the only correct operation is a uniform canvas resize.
build_origin.py asserts the median fill and the completely-full count now,
because nothing measured relative size and the numbers all looked fine.

**A BERRY MOVES ONE ROLL, AND THE THREE MOVE THREE DIFFERENT ONES** - the same
test the four situational balls had to pass. `effect` names which (`catch`,
`flee`, `xp`) and `per` is what one of them is worth, so two berries moving one
number are one berry with two prices and check.mjs can say so directly.

**FEEDING THE SAME BERRY AGAIN DEEPENS IT; A DIFFERENT ONE REPLACES.** The
encounter holds `{ id, stage }`, not an id. The first version replaced in both
cases, so a second Razz was worth exactly nothing - and the long encounter that
needs help is precisely where doubling down should be possible. **A berry at its
cap is REFUSED, not eaten**: "cannot stack" should cost a click, not a berry,
and `berryRoom()` is the single answer that both the tile greys on and
`useBerry` refuses on, so the two cannot disagree about a wasted berry.

**A NANAB IS A LOCK, NOT A DISCOUNT.** `per: 1, stages: 1` takes the flee
multiplier to zero: a Pokemon that has eaten one does not run, full stop. It is
the strongest single thing any item does here and is priced at the top of the
berry band because of it - the thing it is for is the legendary that keeps
getting away, where the alternative is losing the encounter outright. Asserted
as an absolute (`berryCalm === 0`, and 2,000 real `resolveThrow` rolls) rather
than as "lower", because "lower" is what it used to be.

**AND SO DOES SOMETHING RUNNING OUT.** A field effect ending is the one event
in the game with no tell at all: the card in the corner stops being there, which
is exactly what nothing happening also looks like, and the next four hundred
steps quietly cost what they always did. `state.worn` is a queue the step
handler pushes to and `App` renders as a grey card in the same `.hud-right`
stack the live one was in — the effect it names has just left that column, so
anywhere else would make the player look somewhere new to be told something
about here. It fades itself out; there is nothing to decide, so there is nothing
to dismiss.

**IT IS NOT A CHEER**, and check.mjs asserts it never queues as one: a cheer
holds the screen for 3.2s with sparks on it, and an effect ending is news rather
than an occasion. **AND CANCELLING IS NOT EXPIRING** — starting a repel clears
any honey under it, so the announcement lives in the same three lines as the
countdown rather than in a panel noticing the slot is empty. Telling somebody
their honey wore off when they replaced it themselves is worse than saying
nothing.

**USING SOMETHING HAS TO LOOK LIKE USING SOMETHING.** A field item's only
feedback was a chip in the far corner of the screen and a berry's was a line of
text in the same box every other message uses - so on a fast click neither read
as "that worked", and the honest failure is feeding a second one because you are
not sure the first landed. The rail tile pops and the berry itself tosses into
the encounter. Both are keyed on a COUNTER, not a flag: `e.ate` is bumped on
every feed, because remounting is the only way to restart a CSS animation and a
flag that is already true cannot say "again". The pop only plays when the engine
actually spent one - an animation that fires when nothing happened is worse than
none, because it is a lie about state.

**THE WORLD'S CLOCK RUNS ON STEPS, NOT ON `new Date()`.** A real clock means a
player who plays at lunch never sees night, never meets the one condition the
Dusk Ball exists for, and is told about a feature they cannot reach - which is
the complaint Gold and Silver actually got. Steps are a counter the game already
keeps and already saves, so everybody sees the whole cycle in the order it was
designed. `clock.js` is pure for the same reason `daily.js` is: check.mjs walks
a whole day without waiting for one.

**THE PHASE IS FROZEN ONTO THE ENCOUNTER**, exactly like `known` and `areaId`
and for exactly the same reason - a ball that read the clock at throw time would
change value because you took a step mid-animation. `items.js` reads `enc.night`
and must NEVER import the clock; check.mjs asserts both halves, because a live
read is invisible from the outside.

**A CAVE IS DARK ROUND THE CLOCK.** The Dusk Ball is boosted at night OR in an
`ENCLOSED` area, and those must not collapse into one condition: drop the cave
case and "night and caves" is only "night", which costs the ball half of what
makes it different from the other three. The phase tints skip the enclosed areas
for the same reason - what is overhead there never changes.

**`data-phase` GOES ON THE SAME ELEMENT AS `data-area`.** The phase overrides
the area's `--sky`, and a custom property only inherits downwards: `.battle-sky`
is a SIBLING of the field, so a phase set one level lower would never reach it.
That is the exact mistake the area colours made once.

**TODAY'S QUEST LIVES IN THE TOP BAR.** It was on the YOU tab behind a `!` on
the tab badge, which is a fine place to read it and a bad place to discover it -
reported as "I am not sure where to see the missions", which is the whole
verdict on a feature one tab deep behind a dot. The top bar is the only thing on
screen in every state of the game. There is ONE card: `Missions` in TopBar.jsx
renders `Daily.jsx`, the same component the rail used to, rather than a second
smaller copy that would drift - and the claim moved to App.jsx with it, because
two places to claim from would be two sources for one number.

**THE LEGENDARY MARK IS NOT A TIER**, and it is kept out of the row of tier
marks for that reason: those are four things you can earn and this is a fact
about the species, so sitting among them it would read as a fifth tier. It goes
beside the name on the nameplate and in the opposite corner of a Dex tile - and
only on an entry you have at least SEEN, because spoiling which silhouettes are
the legendaries hands over the most interesting thing the grid has left to say.
`build_marks.py` generates a placeholder and says so loudly until the drawn one
lands at `.assets-src/marks/legendary.png`.

**A RAZZ BERRY GOES THROUGH `liveMult`, NOT THROUGH `resolveThrow`.** (At every
depth - check.mjs sweeps the full stack against every catch rate in the dex.) That is
the load-bearing half: `liveMult` is the single answer to "what is this ball
worth against this Pokemon", the engine rolls with it and the rail prints it,
so a berry applied anywhere else would make the rail advertise 3.0 over a throw
that quietly used 4.5. Going through the ball also means going through
`catchChance`'s own ceiling, so no berry can push anything to certainty and the
ball ladder cannot invert - check.mjs sweeps every catch rate in the dex for
both. The Master Ball is exempt: it is already past certain.

**`fleeChance`'s `calm` is a MULTIPLIER, not a subtraction.** Subtracting
flattens the slope this function exists to have and takes the commonest species
below zero. A multiplier reaches 0 cleanly, which is what lets a Nanab be a
lock, and it is worth most exactly where a berry gets spent.

**A DAILY QUEST MUST BE FINISHABLE IN THE MAP YOU ARE STANDING IN.**
`QUEST_TYPES` is derived from the STARTING map by weight share (>= `QUEST_SHARE`
of Tall Grass), not from a biome's `types` list - the first version used the
list and asked for four Dragon-types, of which the entire game holds two. Six
types qualify. Everything in `daily.js` is pure and takes the day key as an
argument, which is the only way to test something keyed on the date without
waiting a day, and is why it is written that way: `dailyFor(key)` hashes the
key, so a quest cannot be rerolled by reloading. The streak caps at
`STREAK_CAP`; uncapped, day sixty is worth more than the first fifty together
and missing one leaves nothing to come back for.

**AND `LEGENDARY` IS DERIVED, NOT LISTED.** It was 34 hand-written dex numbers
under a comment promising "a Gen 2 Suicune needs one dex number added here and
nothing else" - which was true, and is exactly why it failed: five generations
arrived at once and none of their sixty legendaries were added, so every Unova
and Paldea legendary spawned at an ordinary S-tier weight. `fetch-species`
records the flag PokeAPI already knows; mythicals count, because this game draws
no distinction and a Mew that is not rare is not a Mew. **A list that needs one
edit per generation gets that edit skipped eventually.**

That took 34 legendaries to **94**, which is where the per-head share earns its
keep: 94 x `LEGEND_EACH` is 2.82%, it saturates at `LEGEND_CEIL` 2.5%, and a
NAMED legendary is **1 in 3,760** encounters against 1 in 3,333 at 34. Under the
old fixed 1% pooled share it would have been 1 in 9,400.

**Legendaries are a SHARE of the table, never a fixed weight** - added by
`encounterTable` after the residents and the evolved overlay, so it cannot be
in `BIOMES[i].table`, and `foundIn`/check.mjs read the assembled table instead.
Fixed weights survive exactly one dex size: 5 legendaries became 24 and the
tables tripled, which would have multiplied the rate by five.

**BUT A FIXED TOTAL SHARE FAILS THE OTHER WAY, and that took an audit to see.**
One percent split among all of them means each one's odds fall linearly as the
roster grows: measured in Tall Grass at Lv 50, a named legendary is 1 in 3,400
encounters at 34 of them and would be **1 in 9,000** at the ~90 a full National
Dex carries - 128,000 steps at `ENCOUNTER_RATE`, against a 50,000-step
playthrough. "Hunt where it lives", which is the entire point of `legendTier`,
stops being possible.

So the share follows the roster: **`LEGEND_EACH` (0.0003) is what ONE legendary
is worth** and `LEGEND_CEIL` (2.5%) is where it saturates. Under the ceiling a
named legendary's odds cannot move when an unrelated generation ships; over it
everything scales down together, because 90 legendaries at a flat per-head share
is one encounter in 37 and a world that full has none in it. `LEGEND_SHARE` is
kept as what it comes to TODAY - read it, never set it.

**The assertion is the equation, and it carries both halves**: share ==
`min(CEIL, EACH x open)` at every level in every map, which pins independence
from the TABLE's size (the original claim) and proportionality to the ROSTER at
once. And the monotonicity check is now **per head** - it compared the pool's
share at Lv 1 against Lv 50, which was right while every legendary was open from
the start and wrong once they arrive on `GEN_UNLOCK`: the pool climbs 0.15% ->
1.02% purely because there are more of them. Levelling must buy you more
legendaries to hunt, never a cheaper hunt for the one you are after.

**A generation ARRIVES, and `GEN_UNLOCK` IS DERIVED FROM `GEN_LAST`.** Gen 1
from the first minute, then one every `GEN_STEP` (5) levels from `GEN_FIRST`
(10): Johto 10, Hoenn 15, Sinnoh 20, and the five that have not shipped already
paced through Paldea at 45. Filtered inside `encounterTable` by the level it
already took, so it is a filter and not a mechanism.

**Derived, because the default is the dangerous one.** `genOpen` treats a
generation with no entry as open from the FIRST minute - right for a hole in the
dex, and exactly wrong for a generation somebody forgot to add a gate for. A
table would have to be remembered on the day Unova ships; this cannot be.
check.mjs asserts one gate per entry in `GEN_LAST`, that they climb, and that
the last lands under `MAX_LEVEL` - the same shape as `MAP_LAST < MAX_LEVEL`,
and what pins `GEN_STEP`: at 8 the ladder runs to Lv 66 and the last three
generations ship unreachable.

**THE LEVELS CAME DOWN FROM 22/28/35, AND HALF THE ARGUMENT FOR THEM WAS STALE.**
They were justified by "every weight in `RESIDENTS` would be quietly halved",
measured back when adding Johto and Sinnoh tripled Tall Grass's rare band
(5.1% -> 15.4%). That was before `BAND_SHAPE` and `balance()`. Measured now,
Lv 1 to Lv 50 in Tall Grass: the C band moves **78.2% -> 71.8%** and the S band
**3.2% -> 3.3%**. The mix those levels were defending is already defended, by
the thing whose job it is.

**AND A SILENT GATE IS INDISTINGUISHABLE FROM A BUG.** Nothing on screen said
generations arrive on a level, so a player at Lv 15 meeting only Kanto asked
whether the game was broken - which is the whole verdict on an invisible rule.
The Dex's REGION filter says it now (`Gen 2 (Johto) — from Lv 10`), because that
menu already lists every region; the option still WORKS, since browsing a locked
region's dex is fine and only meeting one is gated. check.mjs asserts it against
the source, as nothing fails at runtime when a label quietly stops saying it.

**What a generation actually dilutes is one species' FINDABILITY**, and that is
the number to watch when this moves - and it moved a long way further when the
generations were levelled, because that is precisely what levelling them does.
Pidgey went 12.4% of encounters at Lv 1 to 5.4% at Lv 50 under the old skew;
the commonest species in Tall Grass is 3.2% now. A daily quest
and a specific hunt both feel that, and nothing else measures it. It is why the
ladder is spread rather than front-loaded.

**Origin is DEBUT artwork, not Gen 1 artwork.** `DEBUT` in build_origin.py maps
each range to its own source set - Yellow/Red-Blue for Kanto, Crystal/Gold for
Johto. Reading the tier as "the Gen 1 sprite" would have left 207 of 358
without one. Every sprite - ordinary, shiny, Origin - is normalised to a 64x64
canvas; Sinnoh's HGSS art is 80x80 and is reframed, or it is simply a different
SIZE from everything beside it in a row.

**BUT DEBUT ARTWORK IS ONLY A TELL WHILE IT IS OLDER, and for a third of the
dex it is not.** Sinnoh shipped with Diamond/Pearl as its Origin and that was
wrong: our ordinary Sinnoh sprite is HeartGold/SoulSilver, both are Gen IV, and
one of the three fallbacks was literally the base sprite. Reported from play as
"the Gen 4 Origins look the same as the normal ones", which was exactly right.

Measured, per sprite: **a Kanto or Johto Origin uses a median of 4 colours
against the ordinary art's 13** - that is the Game Boy and Game Boy Color
palette, and it IS what reads as ancient. Sinnoh gave 13 against **14**. Not
older, and not even fewer.

So `hasOrigin(id)` is `genOf(id) < baseArtGen(id)` - **a species can wear Origin
only if it debuted in an older generation than the one its ordinary art comes
from.** Derived, not listed, which also settles Hoenn before it ships:
Ruby/Sapphire and FireRed/LeafGreen are both Gen III, so a Hoenn species gets
no Origin either, and nothing has to be edited on the day. `ART_GEN` is the one
place saying where base art comes from and check.mjs asserts it against
`artFor()` in fetch-species.mjs, because two copies would drift the day a base
set changes and the symptom would be Origins that are the same picture.

**THE UNHELD TREATMENT IS ONE RULE, BECAUSE A LIST OF TIERS HAS DRIFTED
TWICE.** An unheld cell in the FORMS strip is a flat silhouette - the shape is
the hint and the colour is the reward - and that was written first as
`.sf-one:not(.got) .holo-foil`, which missed the aura and the sparks when
`VariantFx` grew to three layers, and then as `.sf-one:not(.got)
.sprite-astral, .sprite-holo`, which missed Vivid, Noir and Glitched when the
ladder went to eight. The second one was worse than it looks: **every tier's
filter carries `!important`**, so those three beat the plain base rule and
rendered in FULL COLOUR on species nobody had caught. Reported from play.

It is `.sf-one:not(.got) .sf-art img:not(.mark)` - four classes and
`!important`, so it outranks any tier - plus `.sf-one:not(.got) .sf-art > span`
for the layers, because `VariantFx` returns a span and `Mark` an img, so "every
span in the art box" is the whole set whatever a future tier calls its own.
`animation: none` with the filter, or a Glitched silhouette stutters in a cell
nobody has earned. check.mjs asserts the SHAPE - no selector under
`.sf-one:not(.got)` may name a tier or a layer, and the layer names are read
out of `Sprite.jsx` so the check cannot fall behind the component either.

**AND A SILHOUETTE MUST NOT COST A ROUND TRIP.** The strip is the only screen
in the game that draws a tier nobody owns, and exactly one tier is not in this
repo - so opening ANY entry fetched a 67KB GIF from PokeAPI purely to paint it
black, which makes the "a whole playthrough loads a handful" argument for that
CDN false on a dex of 1,145. An unheld Showdown draws the ordinary sprite: the
silhouette is a flat fill of the outline either way, and it also stops the odd
one out in a grid whose point is one creature nine ways, since a Showdown GIF
is not framed on the 64px canvas everything else is normalised to and drew
visibly larger than its eight neighbours. Measured with
`performance.getEntriesByType("resource")`: 0 requests unheld, 1 held.

**`tiersFor(id)` is what both the Dex grid and the sheet count through**, and
it exists because the completion rosette would otherwise have become
IMPOSSIBLE for 107 species rather than merely hard - the one mark in the game
that is supposed to be earnable by playing long enough. A Sinnoh entry drops
the Origin column from FORMS entirely rather than showing a silhouette nobody
can fill: a slot that cannot be earned reads as a bug in the collection.

**A MEDIAN OVER THE WHOLE DEX HID A FAULT IN A THIRD OF IT.** The first palette
assertion in build_origin.py compared medians, and putting the Gen 4 set back
left the median at 4 - 251 four-colour sprites outvote 107 fourteen-colour
ones. It is **per sprite** now, and two assertions catch different halves: the
relational one (fewer colours than this creature's own ordinary art) catches 92
of the 107, and `PALETTE_MAX` catches the rest. That bound is measured, not
picked: Kanto's worst is 7 and Sinnoh's best is 8, so the two sets do not
overlap anywhere.

**A SECOND COPY OF THE RANGES DRIFTED, AND HOENN SHIPPED WITH NO EVOLUTIONS AT
ALL.** `fetch-evolutions.mjs` held its own `RANGES` literal under a comment
explaining the duplication - "run independently, a missing import would fail at
the wrong moment" - and it still read `[[1,151],[152,251],[387,493]]` long after
Phase 6. So 135 Hoenn species had **zero** evolution rows: Treecko could not
become Grovyle, for two phases, and nothing failed. The gettable-check is
satisfied by a species being in a biome table and every Hoenn species is homed
by type, so it never noticed. It reads the shipped `species.js` now; 177 rows
became 483. **A second copy of anything in this codebase drifts - this file says
so four times and it happened anyway.**

**AND A STONE ROW IS ONLY A STONE IF THE SHOP SELLS THE STONE.** The classifier
emitted `kind: "stone"` for any held-item trigger, which was safe while the only
ones that existed were the eight on the shelf. The rest of the dex brings twelve
more - `black-augurite`, `tart-apple`, `malicious-armor`, a `cracked-pot` - and
each would have been an evolution gated on an item that is not in the game,
which check.mjs correctly calls impossible. It reads `STONES` now, so the shop
decides, and adding a stone to the shelf is what promotes its evolutions out of
`bond`.

**Every non-level evolution method is `bond`.** Happiness, time of day, a held
item on a trade, a move, a place: a game with no clock, no moves and no map
transitions cannot express any of them, and a per-method table grows every
generation. `evoLevel` gives the row a synthetic level from its parent, so a
third of Johto needed no new code. **But a `stone` row needs its stone ON THE
SHELF** - check.mjs asserts `STONES` against `EVOLUTIONS` both ways, because an
unbuyable stone is not a hard evolution, it is an impossible one.

**BEFORE THE REST OF THE NATIONAL DEX SHIPS, `ART_GEN` NEEDS A ROW PER
GENERATION.** Its last row is `[Infinity, 4]` - everything past Hoenn is
declared to be drawn in Generation IV art, which is true of the four that ship
and is a claim about all nine. `fetch-species.mjs`'s `artFor` is the other half
(`id <= 386 ? FRLG : HGSS`) and the two are asserted against each other, so both
move together. Ship Unova against them and every Unova species is recorded as
wearing Gen IV art while its sprite comes from a Gen V set; the thing that reads
this is `hasOrigin`, so the symptom is an Origin tier silently wrong for a whole
region - the exact fault that shipped for Sinnoh once already.

check.mjs asserts the catch-all never covers more than ONE generation, so the
day a second one falls into it the build says so. It does not demand the rows
exist today; it demands nobody adds a generation without looking. Two older
guards happen to catch the same class earlier (the generation census, and
"hasOrigin says yes but there is no art"), so this is the third net rather than
the first - it is the one that still fires when a generation arrives WITH
correct art and no row.

**A generation is derived from the dex id.** `GEN_LAST` in `biomes.js` holds the
last national dex number of each generation and `genOf()` reads it; nothing is
stored per species, because it already is a fact about the id and 151 copies of
"1" is not data. The chip goes on the encounter nameplate now, while Gen 1 is all
that ships and it therefore says nothing — that is the point. A badge that
arrives the same day as the thing it distinguishes reads as a label; one that was
always there reads as information.

## The engine itself: tools/play.mjs

**Twenty-five suites tested every function the engine calls and nothing tested
the engine.** It owns mutable state behind a `requestAnimationFrame` loop and
draws to a canvas, so `check.mjs` could only ever reach the pure functions
around it - and a catch that froze mid-animation got through all of them,
because every function it called was individually correct.

`npm run play` stubs the six DOM things `createEngine` touches (canvas,
`localStorage`, `performance.now`, `requestAnimationFrame`, `document`,
`Image`) and drives the frame clock BY HAND. That fake clock is the whole
trick: `tick(ms)` advances `performance.now()` and runs exactly the callbacks
that were registered, so a 3.2-second catch animation resolves in a few dozen
synchronous frames, the run takes milliseconds, and **if the loop ever stops
asking for a frame, `tick` runs out of callbacks and says so** rather than
hanging. It walks a real map with held keys, throws real balls, feeds real
berries and starts real field items - never `startEncounter()` directly, since
that skips the code an encounter bug lives in.

It runs as part of `npm run check`. Add to it whenever a change touches the
loop, `settle`, the phase machine or the step handler.

**DO NOT WALK TO TRIGGER A SAVE - OR ANYTHING ELSE THAT IS NOT THE ENCOUNTER.**
Every step carries a 7% chance of starting one, an encounter stops movement, and
a leg that never moves never reaches `onArrive` - so a test that walks in order
to make some OTHER thing happen is a coin toss. The save-warning test walked 60
frames to provoke a write and failed 6 times in 12; `buyCandy` saves
unconditionally and it is 0 in 15. Walk when the walking is the subject; call
the engine directly when it is not.

**Do not try to do this in the browser.** `chrome-headless-shell` throttles rAF
while `--virtual-time-budget` fires timers instantly, so a seeded iframe
harness releases held keys before the engine has run one frame and the trainer
never moves - which reads exactly like "the keys are not registering". The
headless shell is for looking at the DOM and at pixels; the engine is for Node.

**AN IMPORT CAN BE SHADOWED BY A LOCAL, SILENTLY, AND IT FROZE EVERY CATCH.**
`engine.js` imports `advance` from `daily.js` (quest progress) and
`createEngine` declares its own `function advance(now)` for the phase machine.
Because the local one is inside the closure it SHADOWS the import instead of
colliding with it - no syntax error, no warning, and `noteDaily` called the
phase machine instead of the quest counter. That re-entered `settle`, which
called `noteDaily`, which called `advance`: a catch died of a stack overflow
the instant the ball stopped shaking, and what a player saw was the animation
freezing before the Gotcha. It is `advance as advanceGoal` now. **Alias
anything imported into a file whose name a local function might reuse** - the
existing `reward as dailyReward` on the same line is the pattern, and it was
aliased only because `reward` obviously clashed.

## QA findings worth keeping

Four defects a pass over the whole app turned up. All fixed, and all the sort a
screenshot cannot show you.

**Window key listeners play the game while you type.** The Dex and Box both have
a search field and the handlers are on `window`: typing "pidgey" walked the
trainer, `f` cast a rod into the grass, and shift for a
capital broke into a run - encounters started while you were looking something
up. `typing(ev)` in `App.jsx` bails on INPUT/TEXTAREA/SELECT/contentEditable.
**Key releases are deliberately NOT gated**: releasing a key that was never
pressed is a no-op, but missing a release because focus moved mid-stride leaves
the trainer walking on his own.

**A rule enforced in one of two places is not a rule.** `duplicateUids` refused
to put a shiny in the sell-spares list, and then the Box computed a second list
of its own - `held`, for "sell what an evolution is saving" - which sorted by
level and took all but the highest. So a shiny at Lv 2 behind an ordinary one at
Lv 30 was the single thing that row offered to sell, labelled "1 x Rattata". One
click, no undo. It is `heldUids()` in `items.js` now, beside its sibling, where
check.mjs holds both to `keeper()`.

**An effect cleanup can cancel the thing it was meant to finish.** The floating
money delta set a timer to remove itself and returned `clearTimeout` as cleanup,
so the next change to money cancelled the *previous* delta's removal: every one
but the last stayed on screen for the rest of the session, stacked on one spot,
and the array grew with it. Pruning by age on insert makes it self-healing and
the timer only has to clear the last one.

**THE MEASUREMENTS ARE ON THE NAMEPLATE, AND AN EMPTY CORNER IS WHAT SAID SO.**
`.sheet-top` is a 108px portrait beside a name block holding about 150px of
content in a 290px track, so the top right of every dex entry was a tall empty
rectangle - reported as "a big white space". HEIGHT, WEIGHT and CATCH RATE went
into it: they are IDENTITY, exactly like the genus and the types they now sit
beside, and they had been at the very bottom behind a rule of their own, the
furthest point on the card from the name they describe. It costs nothing
vertically - the row is 108px tall whatever is in it - and takes a block plus
its border off the bottom, so the card gets **shorter**, which is what matters
on a phone where it is capped at 88vh.

**WHERE TO LOOK was the other candidate and is the wrong one**, which is the
part worth keeping: it is variable height (one to three rows, so it would either
overflow a fixed header or leave it ragged) and it is the one thing on the card
you can ACT on, with buttons that travel. A header of pure identity is not where
a control belongs.

**Flex, not grid, because the third child is optional** - a `seen` but uncaught
entry has no measurements, and a grid's third track leaves a phantom column and
its gap behind. Below 430px the facts take a line of their own and go back to
being a row; that number is measured, not picked - portrait 108 + gap 16 + facts
72 + gap 16 is 212, and "Caterpie" at 27px is 135, so the header stops fitting
at about 347px of card content.

**A margin that belonged to the row was on one button.** `.sheet-close` carried
`margin-top: 18px` from when it was the only control on the dex sheet. Put in a
flex row beside SEE IN BOX, that margin pushed CLOSE down while its
`align-items: stretch` sibling grew to the full line height - so SEE IN BOX came
out as a tall square next to a short wide bar, with its label wrapped over two
lines for good measure. The margin is the ROW's now, the label is `nowrap`, and
both buttons measure 45px high on the same baseline. **When two things in a flex
row are different heights, look for a margin that predates the row.**

**Unseen dex cells fetched a sprite in order to hide it.** Every cell rendered an
`<img>` and `.cell.unseen img { opacity: 0 }` hid it - a screenful of requests on
a fresh save, for pictures nobody sees, with the answer in the DOM. `grid-auto-rows`
fixes the row height, so a cell keeps its shape with no image in it at all.

## The rail's panels

**One control for search, filters and sort.** `FilterBar` is a search box plus a
list of `<select>`s, and both the Dex and the Box pass it a different list - so
they cannot drift apart, which is what a shared control is for. It was a row of
counted chips, and chips ran out of room at the second axis: seven of them across
a 360px rail were 8.5px tall, and there was nowhere to put "fire-types" or "by
name" at all. A closed select is one line however many options it holds, so an
axis now costs nothing on screen, and the counts moved into the option labels
where they were always most useful.

Native `<select>` deliberately: one element, keyboard- and screen-reader-correct
for free, and the platform's own picker on a phone. The whole row sits in a
`<details>` that says what is filtered while closed, so collapsing it hides
nothing.

**The Dex grid is four columns, not auto-fill.** A tile carries a sprite, a
number, up to three variant marks and a completion badge; at the ~52px auto-fill
produced they fought for the same corner. Four fixed columns give ~76px.

**THE ENCOUNTER'S CAUGHT BADGE IS ABOUT THE FORM, NOT THE SPECIES.** `known`
was answering the wrong question: an ordinary Pikachu was caught and every Holo,
Shiny and Astral Pikachu afterwards wore a Poké Ball saying it was already in
the dex. It was not — a tier is its own row in the collection and its own square
in the FORMS strip. `knownForm` is the badge's fact; `known` is untouched and
still means the SPECIES, because that is what the **Repeat Ball** was priced
against and making it per-form would quietly halve a ball nobody asked to
retune. Two questions, two fields, both frozen on the encounter for the reason
`known` always was.

**THE RAIL LIES DOWN, ALONG THE BOTTOM RIGHT.** It was a column down the left
edge, chosen because that strip is empty both while walking and mid-battle. It
still is; it is also **the axis the viewport has least of** - the map is 15:11 -
so the rail was the one panel that could run out of room, which is the entire
history in the note below. And it sat directly over the minimap's corner, so
the left edge carried both permanent overlays while the bottom right carried
none. Horizontal along the bottom right fixes both, the balls read as a hand of
tiles rather than a list, and the three overlays are now one per corner:
minimap bottom left, clock and effects top right, inventory bottom right.

**THE CAP TURNS WITH IT** - `max-width`, with the same four-tile floor the
vertical one had four rows of - and so does the scroller. Three things only the
render caught: **`grid-template-columns: 0fr` collapses the FIRST track**, and
the kit is in the implicit second one, so shut the rail showed its tab and then
three berries floating beside it (the kit collapses on its own `max-width` now,
because `0fr -> auto` is not interpolable and the pair would snap where the
balls glide); the Master Ball's plain `kbd` fell outside the rounded box
entirely, having no tile treatment; and centring the two lists floated the
berries half a key-chip high so the icons stopped sharing a line.

**AND THE BOTTOM RIGHT IS WHERE THE TEXTBOX IS.** `.ballwrap` is `inset: 0`
of the viewport, so once the rail moved down there its bottom was the bottom of
the BATTLE — which is the textbox — and it sat on top of "A WILD PUMPKABOO
APPEARED". Reported with a screenshot, one commit after the move.

**`--tb-h` IS DECLARED ONCE ON `.viewport` AND READ TWICE**: the textbox sizes
its own `min-height` from it and `.ballwrap.fighting` stops its box there. On
`.viewport` because that is the common ancestor — **`.ballwrap` is a SIBLING of
`.battle`**, so a value set on the battle would never reach it, which is the
mistake `--sky` made once. The WRAP moves rather than the rail, so
`.ballrail`'s own `bottom: 3%` goes on meaning "3% up from the space I am
allowed" in both states instead of two rules to keep in step. `pinned` is the
flag, because it already means "an encounter is up".

A shared number rather than an offset typed twice, and this file records what
the other shape costs: `.fieldbox ~ .worldclock { top: 40px }` was a typed
offset for a card that was 31px tall when it was written. check.mjs asserts
both sides read `var(--tb-h)`.

**MEASURED BEFORE IT WAS BELIEVED**, because the whole approach rests on the
textbox not growing past its minimum: at 960 / 620 / 460 / 380 / 340 wide, and
with the longest message the box prints, it holds at **16.2–16.4%** of the
viewport every time — so `min-height` is always what decides and the content
never pushes past. Clearance 23 / 15 / 11 / 8 / 7px. **On a real phone there is
no overlap to fix**: the rail is `display: none` on a coarse pointer and
`Bag.jsx` is the touch inventory, so what this protects is a NARROW DESKTOP
WINDOW — the case a width query would have got wrong in both directions.

**AND A DISTANCE IS NOT A RULE.** tools/play asserted the touch gate by slicing
**900 characters** after `.ballwrap {` and looking for the media query inside
them. Adding one sibling rule with a comment on it pushed the gate past the
window and the suite failed on a change that could not have broken it — the
gate was there and correct the whole time. It reads every coarse-pointer block
and asks whether any of them hides the rail now, which is the thing that was
always meant. Same family as the literals under *Editing*: a magic number in an
assertion fails on a change it does not care about.

**THE BALL RAIL NEVER HONOURED ITS OWN `max-height`, AND TWO FIXES MISSED IT.**
Reported twice as a scrollbar with arrows on it around one berry. This file
recorded the first diagnosis — "a cap with no floor is a box that can be
squeezed to nothing" — and added `max(170px, …)`. **A cap that is not being
honoured is not honoured harder for being bigger**, so that changed nothing; the
second attempt turned the kit's own `overflow` off, which only moved the
overflow outside the rail, and set a `flex: none` beside it that did literally
nothing because `.br-wrap` is a GRID. Both shipped under comments claiming to be
the thing that made the layout work.

What it actually was: `.br-wrap` is a flex item of a capped flex column and a
flex item's `min-height` is `auto`, so **the rail grew straight past its cap** —
measured in a render at 960x300 with `.ballrail` outlined, the content finished
about 200px below the box. Both `.br-list`s then carried `overflow-y: auto`, so
whichever one the broken layout squeezed drew the scrollbar, and the short one
is the one that loses.

**THE SCROLLER IS THE RAIL, AND IT IS ONE.** `.br-wrap` takes `flex: none` and
its natural height; `.ballrail` scrolls. Putting the scroller on `.br-wrap`
instead does NOT work and was rendered before being believed: a grid lays its
rows out inside its own box, so constraining it collapses the `1fr` row to
nothing and leaves no overflow to scroll — on a 300px encounter that showed
three berries and no balls. The balls are first in the flow and so are the part
you always see, which is the right priority in front of a Pokemon. **Every step
of this was diagnosed from a render; none of it was visible in the CSS.**

**AND THE SAVE PANEL SAID THE SAVE WAS SOMEWHERE IT IS NOT.** "KEPT IN THIS
BROWSER" and "stored in this browser only" were written when that was the whole
truth and went on saying it after accounts arrived — a readout outliving its
system, on the one panel whose job is to say where the dex lives. It reads the
`account` prop now, which `Rail` was already passing and `Trainer` was not
destructuring. **The panel itself stays**, and the reason is worth keeping
because "is this still needed?" is a fair question: EXPORT is a copy the player
holds themselves, which an account is not — it is the answer to a deleted
account or a service that goes away — and the recovery offer reads
`localStorage`, where a save that failed to parse is stashed, which has nothing
to do with the server. Only import-to-move-machines was made redundant.

**The marks are shapes, not just colours.** Origin is a ring, shiny a four-point
star, Holo a hexagon, Astral a diamond - a row of coloured dots is unreadable to
anyone who cannot separate the colours. They are drawn art now, normalised by
`tools/build_marks.py`. The completion rosette is `.cell-full`, and it is the
only mark in the game that cannot be had by playing long enough: it needs the
ordinary catch **and** `ROSETTE_NEED` of whatever that species can wear.

**BUT "AND THESE STAY DISTINCT IN GREYSCALE" WAS TRUE OF THE CSS SHAPES AND IS
NOT TRUE OF THE DRAWN ONES.** That sentence sat here as an invariant and quietly
stopped holding the day the art changed, which is the most expensive kind of
note to leave standing. Four of the eight are FILLED SOLIDS whose identity is
their colour - Holo's rainbow hexagon, Astral's blue crystal, Glitched's purple
bolt, Showdown's blue cone - and `grayscale(1)` leaves four featureless grey
blobs. The four that survive are the ones whose identity is a SILHOUETTE: the
ring, the four-point star, Vivid's eight-point star, and Noir, which is
achromatic to begin with.

It surfaced as a bug report - *"holo glitched astral and showdown icons are
broken image"* - and they were not broken: the FORMS strip drew all nine marks
and desaturated the ones you did not hold (`opacity: .35; filter: grayscale(1)`),
and a soft grey blob is what a failed image load looks like. **An unheld cell
draws no mark at all now.** Not a darker grey, which only postpones it to the
next tier that is a coloured solid: the cell already names its tier underneath
in pixel type, so the badge was decoration that had to be suppressed until it
read as a fault. It also makes the badge MEAN something - on every cell it said
nothing; on held cells only it says you own this one. check.mjs asserts both
ends, because either alone can be undone.

**The first metric for this was the wrong one, which is worth more than the
fix.** Compositing each badge over `--paper` and measuring its darkest pixel
said all eight "read" at 35-70 levels of contrast, and all eight passed. Ink is
not legibility: a big soft grey blob has plenty of the first and none of the
second. Looking at the render at 14x answered it in one glance. **Measure the
thing you actually care about, and when a number disagrees with a bug report,
suspect the number.**

**`build_marks.py`'s contact sheet is a fact about a drawing, not a list of
tiers.** `complete.png` splits into the four icons it was drawn with, in that
order; `SHEET_ORDER` therefore does NOT grow when a tier is added, or every
column silently re-maps. A new tier arrives as its own single file, and a single
file always beats the sheet. Missing art generates a placeholder and says so
loudly - a 404 on a Dex tile is worse than a plain icon.

**A WILD LEVEL IS A PRICE, NOT ONLY A FLAVOUR.** Evolving costs
`evoLevel - level` in candy, so `wildBand` sets what an evolution bought with
what you catch there COSTS. That is why `WILD_STEP` is 0.5 and not 1: at a full
level of band per level of map gate the ladder ran 2-7 to 21-26 and the late
maps handed out free evolutions 45-50% of the time, which is the flat-candy
failure seen from the other side - one map becomes strictly best and the other
seven are scenery. Measured across every biome table before choosing. check.mjs
pins a 15% ceiling on the free share in any map, because every number stays
monotone while this goes wrong and nothing else would say so. **Retuning the
band or the map ladder means re-measuring that share.**

`bornLevel` is still the floor and still wins: a wild Venusaur is a Lv 32
Venusaur wherever you meet it, and the band can only lift a Pokemon above its
own floor. The `+ 2` on that floor is why an evolved form is not pinned to
exactly its own threshold.

**A SIZE IS STORED, AND OLD SAVES HASH THEIR UID.** `species.js` has carried
`height` and `weight` since the first fetch and nothing read them; `measured()`
does, scaled by this individual's own roll, so two Rattata are 0.22m and 0.38m.
The roll happens ON THE ENCOUNTER and is copied to the box entry - both halves
are needed, and the failure if the copy is dropped is silent in the worst way:
the enormous Rattata you threw six balls at is an ordinary one in the Box,
because `sizeOf` falls back to the uid hash when nothing was stored. tools/play
asserts it survives a real catch for exactly that reason.

That fallback is what stops a pre-size save being a box of identical creatures,
and it has to be stable, in range and SPREAD - a fallback returning one number
is the thing it exists to avoid. Stored as a small integer, because it goes in
every box entry. **Weight scales with the CUBE of the size**, because that is
what volume does; halving it to make the number look tamer would be printing a
measurement that is wrong.

## The touch pad is a GBA, and it is context rather than more buttons

**Directions LEFT, actions RIGHT, nothing in the middle.** That is the whole
ergonomic idea and it is why the strip is `space-between` across the full width:
it puts each cluster under a thumb that is already holding the device. The pad
it replaced was four arrows CENTRED under the map - the one place neither thumb
reaches - and it could walk and do nothing else, so every other action on a
phone meant reaching up into the rail with the hand holding the phone.

**A sits HIGH and right of B**, and this file said "low" for a year. Look at a
GBA: the two face buttons are on a diagonal that RISES towards the right hand,
so A - the one pressed most - is the upper one and the thumb falls back onto B.
Inverted, it put the primary action at the bottom of the reach instead of the
top. Corrected against a photograph of the hardware, which is the only source
for a question like this. The offset itself is not styling either way: it is
what stops a thumb rolling off one button onto the other.

**A AND B ARE CONTEXTUAL, so the pad stays four face buttons instead of growing
a row per situation** - in front of a Pokemon A is THROW (drawn as the ball it
will actually throw, cheapest held, exactly what Space does) and B is RUN; out
on the map A is FISH and B is DASH, **held** rather than toggled because it is
Shift and because a toggle leaves the trainer sprinting after the thumb has
gone. Mid-animation both are SKIP, which is what the keyboard already does with
any key at all.

**WHICH BALL EACH NUMBER KEY THROWS IS THE PLAYER'S.** The keys were
`BALLS.indexOf(ball) + 1` — the shipped order, the same for everybody, so a
Timer Ball you throw all afternoon sat on 6 because that is where it happens to
be declared. Asked for as reassignable hotkeys on a desktop and as choosing
which ball the A button throws on a phone; **those are one question, because
slot 1 is both**.

`ballOrder(saved)` is the one answer and `saved` is a PREFERENCE rather than a
ranking: a list of ids, most-favoured first, and anything it does not name keeps
its shipped order behind the ones it does. So `promoteBall` moves one ball and
nothing else, which is what lets repeated presses reach any arrangement — a chip
that resorted the rest would be a shuffle, not a control. Unknown and duplicate
ids are dropped rather than trusted, because this comes out of `localStorage`
and a bad entry there would silently take a key away from a real ball.

**THE KEY CHIP IS THE CONTROL, and it is a SIBLING of the row** rather than
inside it: the row is already a button that throws, and a button nested in a
button is neither valid nor reachable. On touch there is no room for a chip per
tile and no keyboard for a number on one to mean anything, so **choosing from
the bag sheet is what assigns** — the ball you last reached past A for becomes
the ball A throws, and the A button's own icon changing is the feedback.

**AND A BALL THAT CANNOT FAIL IS NEVER WHAT A BARE THROW PICKS UP.**
`defaultBall` refuses `mult >= GUARANTEED`. Not `forSale`, which is what the
first version said and which does nothing because **the shop sells Master
Balls** — check.mjs caught it. What makes that ball different is not that it is
unbuyable, it is that throwing one ENDS the encounter, so a press that reaches
it by accident cannot be taken back. It is still throwable on its own key or by
choosing it, and the fallback still finds it when the bag holds nothing else.

**TAP THROWS, HOLD CHOOSES**, which is how A grew the one action the keyboard
has and the pad did not: keys 1-9 pick a ball, and with the rail gone from
touch there was no way to throw anything but the cheapest. A fifth button was
the alternative, on a pad that has four.

**AND THE HOLD FLAG LIVES IN A REF.** The engine calls `changed()` freely - a
step lands, an animation ticks - so `Pad` re-renders between the pointer going
down and coming up. Closing over two locals meant the release read a fresh
`taken === false` and threw a ball behind the picker it had just opened: two
actions from one press, on the one control in the game that spends an item.
`useRef` is declared ABOVE the `if (!engine) return null`, because a hook after
an early return is a hook that sometimes does not run.

**THE BICYCLE IS GONE.** It was a second answer to "go faster" - a toggle where
the shoes are held, so two mental models for one idea - it silently won whenever
both were on, and it cost a face button. `Running Shoes` is the whole speed
story now. A save that still carries `bicycle` in its bag keeps a key nothing
reads, which is cheaper than a migration; check.mjs asserts the word appears in
no CODE (comments stripped, the repel rule's trick), because this repo explains
its deletions.

**IT ADDS NO ACTION THE KEYBOARD DOES NOT HAVE**, and that is what keeps the two
from drifting - every button re-dials a call `App.jsx`'s key handler already
makes. The BAG button is the same `BallRail` the map already has, toggled, not
a second inventory: the rail already knows to show field items on the map and
berries in an encounter.

**NO `setPointerCapture`.** Capturing would keep a thumb that slid off the
button still steering, which sounds like an improvement and is not: while a
pointer is captured the spec routes boundary events at the capturing element, so
whether `pointerleave` fires is exactly what varies between engines - and the
failure is a trainer who never stops walking. The three plain handlers
(`up`/`leave`/`cancel`) are unambiguous and are what the old pad did correctly.

**Gated on `(hover: none) and (pointer: coarse)`, never on width.** A width query
puts a d-pad on a narrow desktop window, where it is useless, and hides it on a
landscape tablet, where it is the only control there is.

**CHECK `KEYS` BEFORE CLAIMING A LETTER.** Surf shipped on **S** for exactly
one commit, and S is WASD's DOWN. The surf handler runs before the `KEYS`
lookup in the same function, so it ate the key and walking south stopped
working - reported immediately. The table is eight lines above the handler. It
is **C** now. This is the cheapest possible class of bug and the most
embarrassing: nothing measured it, nothing could, and the answer was on screen.

**And tools/play asserts every `engine.x()` the pad calls exists**, against a
LIVE engine. Nothing else can see it: the pad renders only on a coarse pointer,
so a mistyped method is invisible on every machine this is developed on and is a
dead button on the one device it ships to.

**ONE BAG PER POINTER, AND THEY ARE OPPOSITES.** The rail down the left edge is
the desktop inventory; `Bag.jsx` - a sheet off the bottom edge, summoned by the
BAG key or by holding A - is the touch one. On a phone the rail was permanently
in front of the map, over the third of it a Pokemon stands in, with tiles sized
for a mouse: the most screen in the game spent on the thing you look at least.
Both gated on the POINTER and never on width, the rule `.pad` already followed.
Both on at once is two bags disagreeing; neither is a phone with no way to reach
a berry, so check.mjs asserts the two gates.

**And they ask `carriedBalls` and `usefulItems`**, which is why those live in
`items.js`. Which balls hide until owned and which items are worth showing right
now are one-liners, and a one-liner copied into a second screen is how this repo
shipped a shiny protected from one bulk action and not its sibling.

**A SCRIM THAT APPEARS UNDER A LIVE POINTER INHERITS THE REST OF THAT
GESTURE**, and `onClick={onClose}` on a backdrop is not "click away to
dismiss". The BAG key fires on `pointerdown`, the sheet mounts under a thumb
that is still down, and the `touchEnd` hit-tests to the scrim that has just
appeared there: driven over CDP with real touch input it read `view = all`
then `view = null, closes = 1` - the bag opening and shutting on one tap.
Holding A did the same one beat later. This file already recorded the sibling
(a tip opening mid-stride, its scrim swallowing the `pointerup` the d-pad was
waiting for) and the general rule is the same.

`useDismiss` in `modal.js` is the one answer, and every dialog uses it: a
backdrop closes on a click that ALSO STARTED on the backdrop, so a gesture it
did not see begin is not one to close on. It fixes a second bug nobody had
reported - a drag that starts INSIDE the card and ends outside fires its click
on the nearest common ancestor, which is the scrim, so swiping the ball strip
and drifting off shut the bag and selecting text in Settings threw away what
had been typed. **Do not write a bare `onClick` on a scrim.**

**AN ENCOUNTER PINS THE RAIL OPEN AND MUST NOT OPEN THE SHEET.** The rail lives
down one edge and can afford to; the sheet covers the bottom third, which is
where the Pokemon is.

**`.pad button` IS A CLASS AND A TYPE, AND `.pad-a` WAS ONE CLASS.** So the base
rule out-specified it and the A button wore the DISABLED fill from the day the
pad was written - the primary action on the screen, drawn as the one that does
nothing. Nothing failed, no rule was missing, and no screenshot at 390px made it
obvious; it took reading the computed background off a real render. It is
`.pad button.pad-a` now and check.mjs asserts the extra type. **When a rule
that plainly exists is not applying, measure the computed value before editing
the declaration.**

## One tooltip, and it is an attribute

**A PROMPT IS A BUTTON, AND IT SHOULD LOOK LIKE THIS APP'S BUTTONS.** The two
shoreline prompts - cast a rod, ride out - were pale pink pills with a `--path`
border, no depth, no focus ring and no icon. Nothing else in the game looks
like that, and side by side the two were indistinguishable at a glance: both
said a few words in the same colour. They are built out of `.ts-btn` and the
top bar now - the pixel face, the 2px border, the `0 2px 0` lip everything here
has, hover that FILLS rather than brightens, gold focus ring, and a press that
drops by exactly the lip. The ICON is what tells them apart, because "Super
Rod" and "Surf" are both just words until you have read them. Lava tints to
`--path`: same object, one token different.

**`data-tip="..."`, never `title="..."`.** `Tip.jsx` renders ONE element at the
app root and a single set of listeners fills it from whatever is hovered or
focused. Every tip in the game is therefore the same object, which is the whole
point: the native `title` takes about a second to appear, cannot be styled at
all, and is most often explaining text that has been CLIPPED - which is how the
shop shipped descriptions cut off with the rest behind a tooltip nobody waits
for.

**A wrapper component was the other option and it loses on the case that
matters.** The shop and the ball rail are inside `overflow: hidden` scrollers,
so a bubble rendered beside its trigger is clipped by the trigger's own
container. The singleton is `position: fixed`, so nothing can clip it, and
converting a call site is one word with no layout consequence.

Three things to know when adding one:

- **Anything labelled ONLY by its title needs an `aria-label`.** A native title
  is an accessible name for free and `data-tip` is not. Controls with visible
  text or an `alt` already have theirs; an icon-only button does not, which is
  why the rail's kit tiles carry one.
- **A `title:` KEY IN A SPREAD is not a `title=` attribute**, and the sweep that
  converted all twenty-five call sites missed exactly one for that reason - the
  ball rail's tab builds its props in an object literal. Grep for both.
- `pointer-events: none` on `.tip` is load-bearing: a bubble under the pointer
  eats its own hover and flickers forever.

**The shop's description slot fits 27 characters**, measured off a rendered row
at the tightest it ever gets (169px, next to "you have 12") rather than
estimated - the same mistake the 21-character ball hint made, for the same
reason: the count's digits share the line. `BLURB_FITS` in check.mjs pins it.
A stone's blurb is a list of species names and overruns by design; that is what
the tooltip is for, and it is why the bound applies to blurbs we WRITE.

## The shop opens as you level

**It used to show everything, always** - greyed, with the level printed where
the price goes, on the argument that "nothing is hidden, because a wall you can
read is a goal". That was right when the shop was nine items. It is
twenty-seven now, and at level one twenty-four of them are grey: the wall
stopped being a goal and became the shop.

`onShelf(items, level)` returns everything you can buy plus the NEXT thing to
open, and a count of the rest, printed once under the shelf. The original
argument survives intact - one wall you can read, instead of a row of them.

**Order is preserved rather than sorted**, and that is not cosmetic: `FIELD` is
grouped by family (three repels, then the flute, then four honeys) and is
deliberately NOT in level order, so appending the next unlock at the end would
move an item out of the family it belongs to. The next goal is found by level
and then shown where it already sits.

## Balls

**`liveMult(ball, enc)` is the single answer to "what is this ball worth".** The
engine rolls with it and the rail draws with it, so the number on screen is the
number that was used - the alternative is a rail advertising 3.5 over a roll
that quietly used 1.0, which is unfalsifiable from the outside. It takes the
WHOLE ENCOUNTER, not a hand-built context: every field a condition needs is
already on it, and a second shape to keep in step is a second thing to forget.
No encounter means no condition can hold.

**Everything a throw depends on is frozen when the Pokemon appears.** `known`,
`areaId` and `types` are copied onto the encounter, never read off `state` at
throw time - settling a catch registers the species, so a live read would make a
Repeat Ball change value halfway through its own throw.

**`boost` is a headline and `bonus()` is the truth**, and check.mjs holds them
together: no `bonus()` may exceed its `boost`, and each must actually reach it
over a sampled set of encounters. A headline the ball cannot deliver is the
worst bug available here, because nothing about it looks wrong.

**Price a ramp by simulating it, never by its cap.** The Timer Ball at 140
looked fine beside its 4x cap and measured out at 606 a head - the most
expensive ball in the game - because every throw on the way up is paid for at
full price and most are worth about 1x. `perCatch()` in check.mjs walks the
throws; the flat `ballsPerCatch()` is only correct for a ball with one
multiplier.

**The plain ladder and the situational balls need different assertions.** Poke /
Great / Ultra must climb in mult, price AND level. A situational ball is
deliberately CHEAPER than the Ultra it beats, so including it in that loop
asserts the opposite of the design. `PLAIN_BALLS` exists for exactly this.

**No new ball may out-earn grinding with Poke Balls.** Rares are already mildly
profitable with the cheapest ball and always were - that is the grind, paid for
in time. The invariant is relative, not absolute, and is measured at each ball's
best case.

**Four conditions must key off four different systems**, asserted by comparing
the pattern of answers each ball gives over every sampled encounter - two balls
boosting on exactly the same encounters are one ball with two prices. The Nest
Ball and the Dive Ball were rejected on this: every wild level here is 2-7, so
Nest is a flat ~3.5 everywhere, and everything on a rod is Water, so Dive is the
Net Ball again.

**A ball hint is 16 characters.** The shop prints "x3.5 " plus the hint opposite
"YOU HAVE N" on one line and clips it. The first limit written here was 21,
measured off a hint that fitted - next to "YOU HAVE 5". The same 21 characters
clipped next to "YOU HAVE 14", because the COUNT'S DIGITS share the line. 16
leaves room for a three-digit stack.

**`tools/fetch-items.mjs` holds a second list of ball ids** and the two drift
silently, so check.mjs asserts every item in `ALL_ITEMS` has a
`public/items/<id>.png`. That script also used to throw on the first 404 and
`running-shoes` - which is not an item in this game and has no PokeAPI sprite -
sat in the middle of its list, so it died there every run and the three rods
below it were never fetched. Misses are collected and reported together now.

**The throw animation is a 32-frame strip per ball**, sliced by
`tools/build_balls.py` from Anarlaurendil's sheet (CC BY 3.0, credited in
README - that credit is the licence, not a courtesy). Four facts about it that
are not visible in the CSS:

- **The column order is the artist's, taken from the artwork description.** A
  pass that tried to identify the 28 columns by matching colours against our
  PokeAPI icons was checked against the four nobody can get wrong - Poke,
  Great, Ultra, Master - and got two. Two red-and-white balls and four blue
  ones is where a guess ships a Net Ball that throws a Dive Ball.
- **Percentage `background-position` is not "scroll by p%".** It aligns the p%
  point of the image with the p% point of the box, so with 32 frames stacked
  at `background-size: 100% 3200%`, frame i sits at `i/31`, not `i/32`. A range
  a..b animates `from` a `to` b+1 with `steps(b-a+1)`, because `steps()` shows
  the start value first and never reaches the end.
- **The shake wobble is drawn into f15-f19** - they swing to x-centre 28 and
  36 where every other frame is 32 - so the element must NOT also be wobbled
  by CSS. The two compound into a lurch.
- **A duplicate `@keyframes` name fails silently, and the LATER one wins.** The
  new frame-stepping `ball-click` was added above the old transform-based one,
  so the old one overrode it and the catch played a scale-pop over frame 27.
  Deleting a replaced animation is not tidying, it is the fix.

**The thrown ball draws in front.** `.ball-slot` is `z-index: 4`, clearing the
sprite (1), the captured sprite (2) and the effect layers (3). It had none at
all, which only became a bug when `.mon-slot .mon` was given `z-index: 1` for
the Astral aura - and then every throw in the game arced behind the Pokemon.

## The minimap

**The engine draws it, React only hosts the canvas.** The camera rectangle on it
has to BE the camera; a second copy of `render()`'s clamp, computed a frame
later in a component, lags by a frame and drifts at the map edges - which is
where the clamp bites and where a player is actually looking at it.

**Terrain is baked once per area**, in `bakeMini()`, which is called at engine
start and from `travel()` and nowhere else. `rows` changing without a re-bake is
the one way this goes wrong: the map would be of the area you just left. Per
frame it is one `drawImage`, one stroked rect and two arcs.

**The palette is `MINI` in `map.js`, beside `SOLID`, because it is the legend.**
A second list of map characters anywhere else is a list that falls behind.
check.mjs asserts every character any of the eleven maps uses has a colour, that
each parses as a hex colour (a typo does not crash - canvas silently reuses the
previous `fillStyle`, so one bad entry paints its tiles as whatever was drawn
before), and that **Rock Ridge's plateau and Frost Hollow's shelf are far from
their own floors**: those two levels connect only at a staircase, so painting
them alike draws a route that does not exist.

**Hidden, never unmounted.** The engine is handed the canvas once, at
`createEngine`. Unmount it for an encounter and everything after the first
encounter draws to a detached element - a dead grey box, with no error.

**The marker is a red dot under a white ring**, and the ring is the point: red
alone vanishes on lava, white alone on ice. A marker that relies on the colour
it happens to be standing on is a marker that disappears exactly where the map
is hardest to read.

## Traps

**A flex `basis` is the wrap threshold, not the final width.** The filter row
is two selects and a type swatch; at a 118px basis they summed to exactly the
rail's 330px, and the widest badge (FIGHTING) wrapped the swatch onto its own
line - which is the row the compaction existed to remove. Size a basis so the
row FITS, and let `flex-grow` do the filling. And test it against the longest
content the game can produce: a native `<select>` clips, it does not ellipsize.

**A flex item with no content shrinks first.** `.rail > .panel` is a column
flex container on a wide screen, so every child of a panel is a flex item -
and the dex progress bar, having no content, was squashed to whatever was left
after the grid took what it wanted. It was never the 9px its rule asked for.
Anything in a panel whose height IS its design - a bar, a rule, a spacer -
needs `flex: none`.

**`steps(n)` and `forwards` disagree about the end of a sprite range.** Running
`to` one frame past the end and stepping n times is right while an animation
plays and wrong when it holds: `forwards` holds the END value, which is the
frame past the range. The catch held frame 32 of a 32-frame strip and went
invisible; the break-out held frame 27, the catch's own flash. Use
`steps(n, jump-none)` and end the range on the real last frame. A looping
animation still wants plain `steps()` - a loop needs equal frames that wrap.

**Sample an animation ACROSS ITS WHOLE CYCLE before judging it.** A negative
`animation-delay` plus `animation-play-state: paused` freezes an animation at a
chosen time, so N copies of the real markup lay the whole sequence out as a
strip. Both frame bugs above were invisible in the code and obvious in one
screenshot.

**One frame is not a sample, and that cost a whole detour.** `holo-sweep` runs
`background-position: 220% -> -80%`, so a freeze at -1.1s of 3.6s catches the
band already off the element and the foil looks entirely absent. It looked like
`mix-blend-mode: color-dodge` failing on a light background - it showed on dark,
after all - and three blend modes and an `isolation: isolate` went by before an
UNMASKED layer at 0.6 opacity was still invisible, which is impossible and is
what finally indicted the harness. The glow on the dark background was Holo's
rim (three drop-shadows), not the foil. Sampled across the full 3.6s it is
plainly there. Same story for `spark`, which holds `opacity: 0` for most of its
cycle.

**`Array.prototype.sort` never calls the comparator on 0 or 1 elements**, and
that hid a crash for weeks. Box.jsx declared `const SORTS` six lines BELOW the
`.sort()` that reads it - a temporal dead zone - and the BOX tab went blank
white with "Cannot access 'SORTS' before initialization" the moment anyone held
a second species. An empty box worked. One species worked. **A smoke test on a
fresh save cannot see this class of bug**; seed a save with real content.


**One listbox, and only one.** Every other control in the rail is a native
`<select>`, deliberately. The type filter cannot be: `<option>` styling is
ignored outright on some platforms and unreliable on the rest, and that control
is entirely about the colour of its options. So it is hand-rolled, and it has to
carry what the platform was giving away free - Escape, click-away, arrow keys,
focus returned to the opener, a worded `aria-label` (a screen reader gets
nothing from a background colour), and **the modal lock**. `useModalLock()` is
the same counter `Confirm` uses and App.jsx already bails on `modalOpen()`;
without it the arrow keys walk the trainer while the menu is open. Reach for a
`<select>` for anything else.

**An effect layer is not a child of the sprite.** Every tier's extras - the
Holo foil, the Astral sky and aura and orbit, the shiny sparks, the Origin
seal - are SIBLINGS of `.mon`, so `mon-absorb` shrinking the sprite into the
ball does nothing to them. They were all gated on `!monGone`, which is only
true once something has FLED, so from the moment the ball opened they went on
playing over an empty patch of grass. Gate on `monHere` (`!monCaptured &&
!monGone`). Anything new that decorates the Pokemon has to be gated the same
way; Holo is just the one people notice, because a moving rainbow is.

**A STALL IS A STALL, WHATEVER CAUSED IT - measure it in the frame loop.**
Every deadline is an absolute `performance.now()` stamp, so time that passes
while rAF is not running has to be paid back. This was a `visibilitychange`
listener, which covers a hidden TAB and nothing else: it does not fire when you
alt-tab to another window or when the window is occluded, and Chrome throttles
or stops rAF in both - so the engine came back past every deadline with no
compensation and the phase machine fired one step per frame until it caught up.
`frame()` compares `now` against the last frame and pushes `move.startedAt`,
`encounter.until` and `fishing.until` forward by any gap over `STALL` (400ms),
drops held keys and calls `changed()`. No event to miss, and a debugger pause
and a sleeping laptop are handled by the same three lines. Keep that deadline
list complete if a fourth timer is ever added.

**A hidden tab freezes and then fast-forwards.** `requestAnimationFrame` stops
while the page is hidden - fine - but every deadline in the engine is an
absolute `performance.now()` stamp, so the first frame back finds `now` far
past all of them and the phase machine fires one step per frame: a throw left
mid-air resolves in six frames. `visibilitychange` measures the gap and pushes
the three live deadlines forward by it (`move.startedAt`, `encounter.until`,
`fishing.until`) - keep that list complete if a fourth timer is ever added. It
also drops held keys, because switching TABS does not always fire `blur` the
way switching windows does, and calls `changed()` on return so the rail is not
showing RUN over a trainer who is walking.

**A flat cap or floor flattens the ball ladder.** `catchChance` clamped to
0.95 and 0.03, and `(rate/255) * mult` reaches 0.95 at rate 255/mult - so a
Poke Ball was already capped against the fifteen commonest species in the dex
and a Great Ball bought nothing at all on a Pidgey, while at rate 3 the floor
made Poke and Great identical on every legendary. The ceiling belongs to the
BALL now (`1 - NEVER_CERTAIN / mult`, so a better ball misses less often) and
the floor is low enough (`NEVER_HOPELESS` 0.01) that no species in the dex sits
on it. Everything between the two is untouched, which is why the rare economy
did not move. check.mjs sweeps every catch rate the dex actually contains and
fails if a better ball is ever worth nothing.

**CSS**
- **An animation beats a plain declaration.** `.mon` runs `mon-appear`, whose
  keyframes set `filter: none` with `animation-fill-mode: both` - so
  `.sprite-astral { filter: <duotone> }` applied in the Dex, where the sprite has
  no animation, and silently vanished the instant an Astral landed in an
  encounter. `!important` is the only author declaration that outranks an
  animation, and that is why the duotone carries one.
- **Naming an `animation` replaces the whole list.** `.sprite-origin.mon` sets
  its own reveal and therefore dropped `mon-idle` as well - Origins formed and
  then stood perfectly still while everything else breathed. If you override
  `animation` on a `.mon`, re-list what you still want.
- **AND THE STATE THAT ENDS AN ENCOUNTER OUTRANKS ANY TIER'S IDLE.** The same
  note, paid for a third time and fixed generally this time. **An Origin would
  not go into the ball** - reported from play, and measured: the computed
  `animation-name` on a captured Origin was `origin-form, mon-idle`.
  `.sprite-origin.mon` is TWO classes, exactly like `.mon.captured`, so the
  cascade fell through to source order and the tier rule is further down the
  file; `mon-absorb` never ran. The same tie broke fleeing. So `.mon.captured`
  and `.mon.gone` carry `!important`, because specificity cannot promise it - a
  tier only has to TIE. A tier's **`filter`** must be `!important` (an
  animation outranks a plain declaration) and its **`animation`** must not be:
  Glitched took one and beat absorb, flee and the evolution reveal at once.
  tools/play asserts both halves across every tier.
- **`<details open={...}>` in React is a trap.** It is a controlled prop with no
  change event wired up, so React re-asserts it on every render: the filter panel
  slammed shut under the user the moment they typed one letter into the search
  box. Own the state and mirror it back with `onToggle`.
- Media queries add **no specificity** — layout overrides must come last in
  `styles.css`. The responsive block is at the end on purpose.
- `align-items: stretch` equalises grid columns to the **taller** one; keep an
  item out of row sizing with `height: 0; min-height: 100%`.
- `aspect-ratio` cannot size grid rows when columns are `1fr`.
- An ancestor with a live `transform` becomes the containing block for
  `position: fixed` descendants.
- Container queries (`cqw`) with `container-type: inline-size` on `.battle`,
  `.evo`.
- Never `animation-fill-mode: both` on a fade-in — it holds the invisible start
  state if the animation does not run.

**The encounter scene is two different kinds of thing, and they live apart.**
The FLOOR is the area's own metatile, cut by `build_ground()` out of the atlas
with the id read back out of `route.json` (`cave.floor`, `volcano.floor`, ...) -
so it cannot disagree with what the map draws underfoot. The SKY and the light
are CSS custom properties per `[data-area]`, because a cave's problem is not its
floor tile, it is that there is no sky. **They go on `.battle`**: `.battle-sky`
and `.battle-ground` are SIBLINGS of `.battle-field`, and a custom property only
inherits downwards - set one level too low and every area silently drew the
default daylight. check.mjs asserts both halves exist for every area in `AREAS`,
because neither fails loudly on its own, and `--ground` is built against
`document.baseURI` for the same reason `spriteUrl()` is.

**`tiles` IS ALREADY REBASED, and `render_area.mjs` added the base again.**
`tileBase` records the base that WAS added when the map was generated; it is
not a base to add when drawing. Adding it shifted every id by 896 and drew
Frost Hollow in the volcano's tileset - orange and green stripes, unmistakably
wrong, and for a few minutes it read as the map being broken rather than the
harness. The engine passes `fixed[i]` straight through; anything claiming to
draw what the game draws has to do exactly that. **A harness that differs from
the engine by one line is a second copy of the tile rules.**

**Rendering a map to look at it** — no browser needed, and no temporary
viewport edits to forget to revert. Drive the real `drawTile()` from Node with a
stub `ctx` whose `drawImage` records the source rect, which gives the atlas id
every cell resolved to; paint those out of `route.png` with PIL. Because it runs
the shipped tile rules rather than a second copy, what it draws is what the game
draws. Render the real FireRed map beside it the same way (`map.bin` id `r` is
`r` when `r < 640`, else our base + `r - 640`) and the differences are obvious —
that is how the plinth caps, the 57/58 console and the barrel rule were found.
Overlay `SOLID` in red to see what is walkable.

**Headless rendering** (for UI, where the DOM is the point)
- Use the dev server, not `vite preview` — preview locks `dist/` and a
  concurrent build fails with `emptyDir`, leaving a partial build and 404s.
- `chrome-headless-shell` (in `~/.cache/puppeteer`) is more reliable here than
  `chrome --headless`. Kill stale shells between runs or the next one hangs.
- rAF is throttled and CSS animations freeze at their `from` state;
  `--virtual-time-budget` fires timers. A frozen panel is usually the harness,
  not a bug — confirm before chasing it.

**Editing**
- Patch by **matching block text with assertions**, never line arithmetic. A
  line-offset edit once deleted `setEngine(e)` and the whole rail rendered from
  undefined state while the map kept drawing.
- **Never replace a span between two `index()` anchors.** Rewriting
  `rock_ridge()` as `s[:s.index("def rock_ridge")] + NEW + s[s.index("def bank"):]`
  silently deleted the eight functions that happened to live between them -
  `volcano`, `frost_hollow`, `seafoam_b3f` and the lava and bridge helpers. It
  was recoverable only because the patch scripts were still on disk and
  `mapdata.js` held the last good output to diff against, which is what proved
  the restoration: every map but the intended one came back byte-identical.
  Replace the function, not the gap between two of them.
- **A LITERAL IN AN ASSERTION IS NOT A RULE.** Three broke in one pass and all
  three for the same reason: `fleeChance(255) === 0.2` meant "a common waits
  around", `liveMult(timer, {throws: 0}) === 1` meant "nothing extra on the first
  throw", and `mb <= 3` meant "walking must not out-give levelling". Every one
  failed on a retune that did not touch what it cared about. Write the
  relationship (`fleeChance(3) > fleeChance(30)`, `=== timer.mult`,
  `walked <= fromLevels`); keep a number only as a BOUND with its reason
  attached.
- `assert s != o` is **not enough** when a script makes several replacements —
  one can silently no-op while the others succeed. Assert each replacement
  landed. Two canopy assertions were dead for a whole session this way.
- Write patch scripts with the **Write tool**, not a shell heredoc. Even
  `<<'EOF'` came back a backslash short here, so `"\0"` in a matched block
  arrived as a NUL and the match silently failed.
- Temporary hooks (whole-map viewport, seeded save harness) must be reverted
  before finishing: `VIEW_W/VIEW_H` back to 15/11, `.viewport max-width` back to
  the `calc(...)`, and `__t.html` deleted.

## Working style

- Read the task as a checklist and satisfy each sentence. For details it leaves
  open, follow the nearest existing code rather than inventing.
- Match the surrounding comment density. Comments here explain **why**, and
  usually name the bug that motivated the rule. Keep that.
- Prefer deleting to adding. No abstraction with one caller, no config for a
  value that never changes.
- Batch independent tool calls into one message; background long commands and
  wait once rather than polling. Do not re-run a check that passed until the
  code changed.
- Report faithfully: if a test fails, show the output; if a step was skipped,
  say so. When a reading turns out to be wrong, correct it plainly and move on.


**THE TOP-RIGHT OVERLAYS ARE ONE STACK.** The clock and the running-effect cards
were both `position: absolute; right: 10px; top: 10px`, and what kept them apart
was `.fieldbox ~ .worldclock { top: 40px }` - a typed offset for a card that was
31px tall when it was written. The card grew, the offset did not, and they
printed on top of each other. `.hud-right` is a flex column, so nothing needs to
know how tall anything else is. The effect cards are deliberately the louder of
the two: the time of day is ambient, a step count is something you paid for and
are burning through.

**AND `.fieldbox span` HAD TO BECOME `.fieldbox > span`.** `ItemIcon` wraps a
tiered item in its own span so the treatment has something to sit in, and the
descendant selector styled that wrapper as a second card - so a Holo Honey sat
inside a little rounded box of its own. The White Flute has no tier, renders a
bare `<img>` and looked fine, which is what made it read as an icon problem
rather than a selector one.

**A NARROW WINDOW IS NOT A PHONE, and it cost a wrong diagnosis here.** Every
mobile rule in this project is gated on `(hover: none) and (pointer: coarse)`
and never on width, deliberately. A CDP harness that only sets device metrics
therefore measures the DESKTOP layout in a small box: the effect cards appeared
to run side by side under the biome tag at 400px and looked like a real
collision. With `--blink-settings=primaryPointerType=2,primaryHoverType=1` they
stack and nothing overlaps. **Emulate the pointer, not just the size.**
