# Cosmetics

Followers and trainer skins (asked for 2026-10-06). **A look, never a
strength.** No rule module imports `game/cosmetics.js` or `data/follow.js`
(check.mjs asserts it), and nothing here changes a roll, a price elsewhere or a
battle.

## Followers

- **The walking party (2026-10-07): up to three.** `state.party` holds up to
  `PARTY_MAX` Box uids, added from the Dex sheet (its best Box entry: rarest tier, alpha, highest level) or the
  strip's + and edit buttons, which open `PartyPick` (`setParty`);
  `state.buddy` is the one walking, always one of them. The strip on the map
  (`Party.jsx`, beside the quest) switches with a tap - tapping the one
  walking puts it in its ball - and Q cycles. A switch is `stepped()` (a big
  Box must not rebuild mid-walk) and grows the next out of a white flash on
  the same tile. All three sheets are loaded with the party, so a switch
  never waits. A save from the one-follower days gets `party = [buddy]`.

- **One Pokémon walks behind you.** `state.buddy` is a Box uid. You choose it
  with **Walk with me** in the Box preview, and send it back from the same
  button or from the Wardrobe. `setBuddy` is the only writer, and it refuses a
  uid that is not in the Box or a species with no drawing. A save naming a uid
  that has left the Box loads as `null`.
- **It takes the tile you just left** (`trail`, called from `tryStep` and
  `surf`). That puts it one step behind on your exact path: ledges (one hop,
  a step later), bends, and doubling back, where the two of you swap.
- **Its position is session state** and is never saved. A load, a warp, a
  ladder or travel stands it on your tile (`snapBuddy`), where it is not
  drawn, and it steps out behind you with your first step.
- **It is in its ball while you ride:** on water, on a rail or on a bike road.
  It comes out once you are back on foot, as in HGSS.
- **It is drawn only when** its sheet has loaded, it is off your tile, it is
  within a step of you, and it is in your room. It is drawn in front of you
  when it is lower on the screen and behind you otherwise. Grass rustles are
  drawn between the two of you, and its sprite box joins yours for the upper
  layer.
- **The art is pokeemerald-expansion's overworld sprites,** pinned to
  `build_anims.py`'s commit (`npm run follow`, `tools/build_follow.py`). Each
  species ships as `public/follow/<id>.png`: eight square frames per row
  (down, up, west, east, two of each), with the normal palette above the
  shiny one.
  - A six-frame source has its east baked in as the mirror of its west.
  - A big Pokémon (Lugia, Wailord) uses 64px frames and covers four tiles, as
    on the GBA.
  - Files are indexed PNGs, and the conversion is asserted lossless.
  - A form without its own drawing walks as its species (`SAME`).
  - 1,413 of 1,415 species can follow you; only Alcremie's two forms have no
    drawing.
- **Only the follower's own sheet loads,** on first use (about 2KB). A shiny
  follower uses the shiny row. Other tiers walk in the normal palette, because
  a canvas filter per frame costs too much on a phone and Safari has no
  `ctx.filter`.
- **Not built, on purpose:** friendship, items it finds, mood lines and
  ribbons. They would turn a companion into a source of income.

## Trainer skins

- **`state.skins` lists the skins bought; `state.skin` is the one worn**
  (`null` is your own Red or Leaf). `buySkin` is the only writer of `skins`,
  and buying a skin wears it. `wearSkin` refuses a skin you have not bought.
- **A skin id from a newer build is kept** in `skins`, so a purchase is never
  lost, and it draws as your own trainer.
- **Prices are by tier** (`SKIN_TIERS`), as a money sink for the late game:

  | Tier | Price |
  |---|---|
  | Trainer classes | ¥30,000 |
  | Villainous teams | ¥75,000 |
  | Professors and friends | ¥120,000 |
  | Rivals | ¥150,000 |
  | Frontier Brains | ¥200,000 |
  | Team bosses | ¥300,000 |
  | Leaders and Champions | ¥400,000 |

  All 49 come to about ¥6.4M.
- **A skin has only its walk:** `public/skins/<id>.png`, in player.json's walk
  shape (48×128), cut by `npm run skins` from Gen 3 overworld people. Every
  other pose is drawn from that walk (`drawPlayer`):
  - **Running, a hop and the rod** use the walk frames.
  - **Water** is the skin's stand frame on the Surf blob (`skins/surf.png`).
- **There is no bike pose for anyone** (2026-10-06): rails are ridden in the
  walk or the run, so every skin works everywhere. The bike set is gone from
  `player.png`.
- **The skin shows on the map only.** The trainer card and the gate keep Red
  or Leaf.
- Ids are saved, so never rename one. **A new skin** is one row in `SKINS`
  and one `SRC` line in `tools/build_skins.py`.
- **Standing-only sheets were left out:** Brock, Misty and most leaders and
  the Elite Four have no walk cycle in Gen 3. Lance and the Hoenn Elite Four
  are 3-frame sheets.
