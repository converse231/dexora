/* Storage, and the place the loop closes. A spare is worth two things now and
   you pick: **cash**, or **Rare Candy** that buys levels.

   One row per species and variant, with a count - forty Rattata is a number,
   not forty things to scroll past. But the row's PROGRESS belongs to one
   individual: the highest-level one, which is the one candy has been spent on
   and the one that will evolve. The count is stock; the bar is a Pokemon.

   That is the whole difference from the feed this replaced. The bar used to
   read "9 / 16 caught" and moved when you caught a ninth Rattata; it reads
   "Lv 9 / 16" and moves when you spend candy - on this Rattata, or on any
   other row, because candy is fungible and that is the point of it.

   Selling never blocks you and never surprises you: the sweep takes everything
   past the best of each species and never a variant, and both payouts itemise
   what they are about to take before they take it. */

import { memo, useEffect, useMemo, useState } from "react";
import { SPECIES } from "../data/dex.js";
import {
  sellValue, candyValue, duplicateUids, evolutionsOf, evolveState, itemById,
  variantOf,
} from "../game/items.js";
import { label } from "../game/map.js";
import Types from "./Types.jsx";
import FilterBar from "./FilterBar.jsx";
import { valuedAt } from "../game/trainer.js";
import Confirm from "./Confirm.jsx";
import Note from "./Note.jsx";
import Sprite from "./Sprite.jsx";
import Mark from "./Marks.jsx";

// Rarest first: the order the Box, the Dex and the encounter all read in -
// one array, in biomes.js, beside the odds that define it.
import {
  TIERS as RARE, speciesById, isLegendary, lockedTiers,
} from "../game/biomes.js";

/* The order rows of one species sit in: the ordinary pile, then its variants
   kindest first - the same order the Dex sheet lists its FORMS in, so the two
   screens do not disagree about what comes after what. */
const VARIANT_ORDER = [null, ...[...RARE].reverse()];
const variantRank = (v) => VARIANT_ORDER.indexOf(v);

/* Ready first, then anything with a spare, and dex order underneath. It is
   the Box's default and the one entry in the sort menu that restores it. */
const ACTIONABLE = (a, b) =>
  Number(b.ready) - Number(a.ready) ||
  Number(b.spares.length > 0) - Number(a.spares.length > 0);

/* MEMOISED: see the note on the handlers in App.jsx. Every prop is
   reference-stable while the trainer walks - `box`, `bag`, `dex` and `stats`
   are mutated in place, `colRev` only moves when the collection does, and the
   five handlers are `useCallback`ed over an engine that is set once. */
function Box({
  box, bag, dex, candy, colRev, stats, busy, findSeed, onSeedUsed,
  onSell, onConvert, onLevelUp, onEvolve,
}) {
  const [pending, setPending] = useState(null);
  const [flash, setFlash] = useState(null);
  // Which rows to show, and a name to match. Both are cheap client-side passes.
  const [only, setOnly] = useState("all");
  const [sort, setSort] = useState("ready");
  const [find, setFind] = useState("");

  /* ARRIVING FROM THE DEX. "See in Box" hands over a name, which becomes the
     search - the Box already filters by name, so the jump costs no new
     mechanism and leaves the player somewhere they can type their way out of.

     Consumed once and cleared by the parent, or pressing it twice for the same
     species after clearing the box search would do nothing the second time. */
  useEffect(() => {
    if (!findSeed) return;
    setFind(findSeed);
    setOnly("all");
    onSeedUsed?.();
  }, [findSeed, onSeedUsed]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4500);
    return () => clearTimeout(t);
  }, [flash]);

  // Haggle raises what a duplicate fetches; quote the number that will be paid.
  const worth = (sp) => valuedAt(sellValue(sp), stats);

  const { groups, spareUids, spareValue, spareCandy } = useMemo(() => {
    const spare = new Set(duplicateUids(box));
    const byId = new Map();

    /* KEYED ON SPECIES **AND** VARIANT. One row used to stand for every
       Pidgey you owned, so a Holo sat inside a stack labelled "x12" with an
       evolve button and a sell button over it. Nothing could actually take it
       - `keeper()` has always refused - but a guarantee you cannot see is not
       one a player will trust, and the count was a lie either way.

       Now a variant is its own card, and with the feed gone it is simply
       true rather than arranged: a row's progress belongs to ONE uid, so a
       Holo levels and a Holo evolves. There is no pile to pick a hero out of
       and so no way to pick the wrong one. `duplicateUids` still filters
       keepers, so a variant row has no spares and no SELL button. */
    for (const mon of box) {
      const variant = variantOf(mon);
      const key = `${mon.species}:${variant ?? ""}`;
      const g = byId.get(key) ?? {
        species: mon.species,
        variant,
        count: 0,
        best: 0,
        mons: [],
        spares: [],
      };
      g.count += 1;
      g.best = Math.max(g.best, mon.level);
      g.mons.push(mon);
      if (spare.has(mon.uid)) g.spares.push(mon.uid);
      byId.set(key, g);
    }

    for (const g of byId.values()) {
      /* THE ROW'S HERO: the highest level, tie-broken by uid so it is stable
         across renders. It is the one candy has already been spent on, the one
         the sweep refuses to sell, and the one that evolves - one individual
         doing all three, which is why there is nothing left to choose. */
      g.hero = g.mons.reduce(
        (a, b) => (b.level > a.level || (b.level === a.level && b.uid < a.uid) ? b : a));

      /* One state per branch - Eevee has three, each wanting its own stone, all
         measured against the same individual's level. */
      g.paths = evolutionsOf(g.species).map((row) => ({
        row,
        ...evolveState(g.hero, bag, row),
      }));
      g.ready = g.paths.some((p) => p.ready);
      /* THE NEAREST BRANCH YOU HAVE NOT REACHED YET, not the nearest branch.
         Slowpoke evolves into Slowbro at 37 and into Slowking on a trade, which
         `evoLevel` gives a synthetic 16 - so `min` was 16, and the moment you
         passed it `need` became 0, the RAISE button hid itself (it only shows
         while `need > 0`) and Slowbro was unreachable for the rest of the game.
         Reported as "Slowking is blocking Slowbro", which is exactly what it
         was doing. Every branch you have already reached is dropped from the
         reckoning, so RAISE goes on offering the next one you have not. */
      const far = g.paths.filter((x) => x.need > 0);
      g.at = far.length ? Math.min(...far.map((x) => x.at))
        : (g.paths.length ? Math.max(...g.paths.map((x) => x.at)) : 0);
      g.need = far.length ? Math.min(...far.map((x) => x.need)) : 0;
      // Only a stone stands between you and it: a different sentence entirely.
      g.stoneOnly = g.paths.some((x) => x.need === 0 && !x.hasStone);
    }

    /* Anything you can evolve right now floats to the top. A box of eighty
       species is a scroll, and the one row you came here to press was as likely
       to be at the bottom of it as anywhere - dex order is a fine tiebreak but a
       poor headline. Spares come next, since those are the other actionable
       rows, and everything settled sits below in dex order. */
    const groups = [...byId.values()].sort(
      (a, b) =>
        ACTIONABLE(a, b) ||
        a.species - b.species ||
        variantRank(a.variant) - variantRank(b.variant),
    );
    return {
      groups,
      spareUids: [...spare],
      spareValue: box
        .filter((m) => spare.has(m.uid))
        .reduce((sum, m) => sum + worth(speciesById(m.species)), 0),
      spareCandy: box
        .filter((m) => spare.has(m.uid))
        .reduce((sum, m) => sum + candyValue(speciesById(m.species)), 0),
    };
    // `colRev` is what changes: the engine mutates box, bag and dex in
    // place, so their references alone would keep this memo stale forever.
  }, [box, bag, dex, colRev, stats]);

  /* Distinct SPECIES, not rows. A row is one species-and-variant now, so
     `groups.length` counts a Holo Pidgey separately from the ordinary pile -
     which is right for the list and wrong for a heading that says "species".
     Three Pidgey rows are still one Pidgey. */
  /* Three passes over every group, and none of them depends on the filter or
     the sort - so they were being recomputed on every keystroke in the search
     box as well as on every step. */
  const { speciesCount, readyCount, spareCount } = useMemo(() => ({
    speciesCount: new Set(groups.map((g) => g.species)).size,
    readyCount: groups.filter((g) => g.ready).length,
    spareCount: groups.filter((g) => g.spares.length > 0).length,
  }), [groups]);

  /* The Box never had a sort - it had one fixed order (ready, then spare, then
     dex) baked into the memo. That order is still the default and still the
     right one, but a box of eighty species is a list, and a list you cannot
     reorder is a list you scroll.

     IT HAS TO BE DECLARED ABOVE `shown`, and it was not: `const SORTS` sat six
     lines BELOW the `.sort()` that reads it, which is a temporal dead zone and
     throws "Cannot access 'SORTS' before initialization". It shipped anyway
     and looked fine for weeks, because **`Array.prototype.sort` never calls
     the comparator on an array of 0 or 1 elements** - so an empty Box worked,
     a Box holding one species worked, and the tab went blank white the moment
     anyone caught a second. A crash that needs real save data to appear is
     exactly what a fresh-save smoke test cannot see. */
  /* READY FIRST WAS DEX ORDER, AND THE TIEBREAK IS WHAT DID IT.

     `ready: () => 0` meant "keep the order the memo built" and would have,
     except that `shown` finishes every comparator with `|| a.species - b.species`
     so that no sort is left unstable. `0 || x` is `x`, so the built-in order
     was thrown away and **"Ready first" sorted identically to "By dex"** -
     which is exactly how it was reported: a sort that does not seem to do
     anything. A no-op comparator is only a no-op when nothing follows it.

     So the ordering is written ONCE, above, and both readers use it: the memo
     that builds the default order and the menu entry that restores it. Two
     copies of "ready, then spare" is how they come to disagree, and this pair
     had already disagreed without anyone being able to see which was right.

     IT IS NOT THE SAME THING AS THE FILTER, which is the other half of the
     question asked: "Ready to evolve" HIDES every other row, "Ready first"
     keeps them all and floats the actionable ones. One is for doing a job, the
     other for browsing with the job in reach. */
  const SORTS = {
    ready: ACTIONABLE,
    dex: (a, b) => a.species - b.species,
    name: (a, b) => label(speciesById(a.species)).localeCompare(label(speciesById(b.species))),
    count: (a, b) => b.count - a.count,
    value: (a, b) => worth(speciesById(b.species)) - worth(speciesById(a.species)),
    level: (a, b) => b.best - a.best,
  };

  /* Filters are applied after the grouping, not inside the memo: they change on
     every keystroke and the grouping does not, so recomputing it for a search
     term would be work for nothing. */
  const needle = find.trim().toLowerCase();
  /* MEMOISED ON WHAT IT ACTUALLY READS. The sort is the expensive half - the
     name comparator calls `label(speciesById(id))` on both sides of every
     comparison, which is O(n log n) string builds over the whole box - and it
     was running on every render, including the ones a step caused. */
  const shown = useMemo(() => groups.filter((g) => {
    const sp = speciesById(g.species);
    if (only === "ready" && !g.ready) return false;
    if (only === "spare" && !g.spares.length) return false;
    if (only === "evolves" && !g.paths.length) return false;
    if (!needle) return true;
    return (
      label(sp).toLowerCase().includes(needle) ||
      sp.types.some((t) => t.includes(needle))
    );
  }).sort((a, b) => SORTS[sort](a, b) || a.species - b.species),
  [groups, only, needle, sort]);

  /* Built here rather than in the dialog: it is a pass over the whole box and
     the dialog is rebuilt on every keystroke of the search field. */
  const sellManifest = useMemo(() => {
    const spare = new Set(spareUids);
    const bySpecies = new Map();
    for (const m of box) {
      if (!spare.has(m.uid)) continue;
      const at = bySpecies.get(m.species) ?? [];
      at.push(m);
      bySpecies.set(m.species, at);
    }
    return [...bySpecies.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, mons]) => {
        const levels = mons.map((m) => m.level).sort((a, b) => a - b);
        /* A LEGENDARY ARRIVES UNTICKED. Variants never reach this list at all -
           `duplicateUids` holds every keeper out entirely - but a legendary is
           not a keeper, so a spare Latios sat in the sweep beside the Pidgey.
           Reported with a screenshot of two of them queued for Rare Candy.

           Unticked rather than held out, which is the whole reason this is a
           checkbox and not another `keeper()` clause: `keeper` is enforced in
           the ENGINE for sell and convert both, so making legendaries keepers
           would mean you could never convert a fifth Latios even deliberately,
           from its own row. The default does the protecting; the tick is there
           for when you really did mean it. */
        const rare = isLegendary(id);
        return {
          key: id,
          uids: mons.map((m) => m.uid),
          off: rare,
          why: rare ? "LEGENDARY" : null,
          candy: levels.length * candyValue(speciesById(id)),
          /* No variant: `duplicateUids` holds every keeper out of the spare
             list entirely, so nothing here is ever anything but ordinary. */
          icon: { id },
          label: `${levels.length} × ${label(speciesById(id))}`,
          sub: `Lv ${levels.join(", ")}`,
        };
      });
  }, [box, spareUids, colRev]);

  /* THE ARITHMETIC IS A FUNCTION OF WHAT IS STILL TICKED. It was three strings
     built once when the dialog opened, which is fine for a receipt and wrong
     for a control - untick a row and the header would go on quoting a total
     nobody was about to receive. */
  const sweepCount = (uids, candyPayout) => {
    const picked = new Set(uids);
    const taken = box.filter((m) => picked.has(m.uid));
    const candy = taken.reduce((n, m) => n + candyValue(speciesById(m.species)), 0);
    const cash = taken.reduce((n, m) => n + worth(speciesById(m.species)), 0);
    return {
      lines: [
        ["Pokémon taken", taken.length],
        ["You receive", candyPayout
          ? `${candy} Rare Candy`
          : `¥${cash.toLocaleString()}`],
        ["Kept", `${box.length - taken.length} — everything you did not tick`],
      ],
      confirmLabel: candyPayout
        ? `CONVERT ${taken.length} · +${candy}`
        : `SELL ${taken.length} · +¥${cash.toLocaleString()}`,
      candy, cash, taken: taken.length,
    };
  };

  /* ONE SWEEP, TWO PAYOUTS. Built from the same list and the same manifest,
     because the only thing that differs is which number goes up - and a sweep
     that sometimes pays cash and sometimes pays candy from two separate code
     paths is two chances to disagree about what "spare" means. */
  const confirmSweep = (candyPayout) =>
    setPending({
      title: candyPayout ? "Convert every spare?" : "Sell every spare?",
      /* Counted, not inferred, and now recounted as you tick. It was
         `groups.length` once, which was the row count - fine while a row was a
         species, and an undercount the day a second Holo shared one row with
         the first. */
      lines: sweepCount(spareUids, candyPayout).lines,
      recount: (uids) => sweepCount(uids, candyPayout),
      /* The sweep reaches across the whole box, so this is the one dialog
         where "which ones" cannot be inferred from the row you pressed. One
         line per species with the levels going, so a Lv 30 sitting in a pile
         of Lv 3s is visible before it is gone. */
      manifest: sellManifest,
      note: candyPayout
        ? "1 candy = 1 level. Untick anything you want to keep — legendaries start unticked."
        : "The best of each is kept, no variant is ever taken, and legendaries start unticked.",
      confirmLabel: sweepCount(spareUids, candyPayout).confirmLabel,
      /* `picked` is what survived the ticking, which the dialog owns - so this
         must never fall back to `spareUids`. A sweep that quietly took the
         whole list when the argument was missing is the exact failure the
         checkboxes exist to prevent. */
      run: (picked) => {
        const uids = picked ?? [];
        if (!uids.length) return;
        const got = sweepCount(uids, candyPayout);
        if (candyPayout) {
          onConvert(uids);
          setFlash(`Converted ${uids.length} spare · +${got.candy} candy`);
        } else {
          onSell(uids);
          setFlash(`Sold ${uids.length} spare · +¥${got.cash.toLocaleString()}`);
        }
      },
    });

  /* One row's spares, to cash or to candy.

     The "dig into what an evolution is saving" branch went with the feed: the
     reserve is one now, so a row's spares ARE everything but the best and there
     is nothing held back to dig into. That deleted the `risky` button, its
     warning copy, and `heldUids` with them. */
  const confirmSellOne = (group, candyPayout) => {
    const sp = speciesById(group.species);
    const uids = group.spares;
    const value = uids.length * worth(sp);
    const gain = uids.length * candyValue(sp);

    /* WHICH ONES, not just how many. A sale is the one action in the game with
       no undo, and "8 x Pidgey" asks you to trust that the eight are the eight
       you think they are. Lowest level first - the order they are taken in - so
       anything you have spent candy on is visibly not in the list. */
    const going = group.mons
      .filter((m) => uids.includes(m.uid))
      .sort((a, b) => a.level - b.level || a.uid - b.uid);

    setPending({
      title: candyPayout ? `Convert spare ${label(sp)}?` : `Sell spare ${label(sp)}?`,
      lines: [
        ["Taken", `${uids.length} × ${label(sp)}`],
        ["You receive", candyPayout ? `${gain} Rare Candy` : `¥${value.toLocaleString()}`],
        ["Kept", `${group.count - uids.length} × ${label(sp)} at Lv ${group.best}`],
      ],
      manifest: going.map((m) => ({
        key: m.uid,
        icon: { id: group.species, variant: group.variant ?? null },
        label: `${label(sp)}${group.variant ? ` · ${group.variant.toUpperCase()}` : ""}`,
        sub: `Lv ${m.level}`,
      })),
      confirmLabel: candyPayout
        ? `CONVERT ${uids.length} · +${gain}`
        : `SELL ${uids.length} · +¥${value.toLocaleString()}`,
      run: () => {
        if (candyPayout) {
          onConvert(uids);
          setFlash(`+${gain} candy`);
        } else {
          onSell(uids);
          setFlash(`Sold ${uids.length} × ${label(sp)} · +¥${value.toLocaleString()}`);
        }
      },
    });
  };

  const confirmEvolve = (group, path) => {
    const sp = speciesById(group.species);
    const target = speciesById(path.row.to);
    const stone = path.stone && itemById(path.stone);
    // A tier this target has no art for - see the note below.
    const lost = !!group.variant
      && (lockedTiers(target.id) ?? new Set()).has(group.variant);
    setPending({
      title: `Evolve into ${label(target)}?`,
      tone: lost ? "warn" : null,
      /* No "you receive" row: the title already names what you get, and a
         dialog that repeats itself is just taller. */
      lines: [
        ["Evolves", `${label(sp)} at Lv ${group.hero.level}`],
        ...(stone ? [["Uses", `1 × ${stone.name}`]] : []),
        ["Keeps", `its level, and every Pokémon you hold`],
      ],
      /* Nothing is consumed but the stone, which is worth saying plainly: the
         feed this replaced ate up to twenty duplicates and a player who knew
         that version will assume this one does too. */
      /* AND THE NOTE WAS A PROMISE THE ART CANNOT KEEP.

         It read *"Your origin evolves, and stays origin"* for every tier and
         every target, which is true of most of them and false of exactly the
         case a player would mind: **a Gyarados has an Origin and Mega
         Gyarados has none.** Origin is DEBUT artwork, so a form that Game
         Freak never drew in 1996 has no older picture to wear - and Showdown
         is the same shape, since `hasShowdown` reads the files and 14 species
         plus every form have none.

         The mark survives in the save either way; what does not survive is
         the PICTURE. `spriteUrl` 404s and `onSpriteError` quietly falls back
         to the ordinary sprite, so the failure is silent: you spend a hundred
         candy on the rarest thing you own and it comes out looking plain,
         with a dialog that had just told you it would not.

         `lockedTiers` is the same predicate `tiersFor` and `rollVariant` are
         built on - what a species can WEAR - so this cannot disagree with the
         Dex's FORMS strip about which column exists. Asked of the TARGET,
         because that is the one whose art has to exist. */
      note: lost
        ? `${label(target)} has no ${group.variant} artwork — Game Freak never ` +
          `drew one. Your ${group.variant} mark is kept, but it will be drawn ` +
          `as an ordinary ${label(target)}. This cannot be undone.`
        : group.variant
          ? `Your ${group.variant} evolves, and stays ${group.variant}. No duplicates are spent.`
          : "No duplicates are spent — only the level you have already paid for.",
      confirmLabel: lost ? "EVOLVE ANYWAY" : "EVOLVE",
      run: () => {
        const done = onEvolve(group.hero.uid, path.row.to);
        if (!done) setFlash("Not ready to evolve.");
      },
    });
  };

  /* Candy into levels, as far as this row's nearest evolution or as far as the
     candy goes - whichever comes first.

     One press rather than one per level: clicking a Dratini from 5 to 55 fifty
     times is not a decision, it is a chore, and the clamp is in the engine so
     the button and the charge cannot disagree about how many it could afford. */
  const confirmRaise = (group) => {
    const sp = speciesById(group.species);
    const spend = Math.min(group.need, candy);
    setPending({
      title: `Raise ${label(sp)} to Lv ${group.hero.level + spend}?`,
      lines: [
        ["Costs", `${spend} Rare Candy`],
        ["Level", `${group.hero.level} → ${group.hero.level + spend}`],
        ["Evolves at", `Lv ${group.at}`],
      ],
      note: spend < group.need
        ? `${group.need - spend} more candy to reach it.`
        : undefined,
      confirmLabel: `RAISE · −${spend}`,
      run: () => {
        const got = onLevelUp(group.hero.uid, spend);
        if (got) setFlash(`${label(sp)} is Lv ${group.hero.level + got}`);
      },
    });
  };

  /* What is stopping this branch. Every button carried a second line, and for
     the common case it repeated the progress bar directly above it - "2 more to
     catch" under "2 / 4 to evolve" - which is what made the buttons twice as
     tall as they needed to be. Only a reason the bar cannot show gets a line;
     the rest is on the button's title. */
  const blockedBy = (group, path) => {
    if (busy) return "finish what is on screen";
    if (path.ready) return null;
    if (!path.hasStone && path.need === 0) return `needs a ${itemById(path.stone)?.name}`;
    return null;
  };

  // The full reason, for the tooltip, which has room for it.
  const blockedWhy = (group, path) => {
    if (busy) return "Finish what is on screen first";
    if (path.ready) return `Evolve at Lv ${path.at}`;
    if (path.need > 0) return `${path.need} more candy to reach Lv ${path.at}`;
    return `Needs a ${itemById(path.stone)?.name}`;
  };

  return (
    <div className="panel">
      {box.length > 0 && (
        <FilterBar
          find={find}
          onFind={setFind}
          placeholder="Find a name or type…"
          onReset={() => { setOnly("all"); setSort("ready"); setFind(""); }}
          selects={[
            {
              id: "show", label: "SHOW", value: only, onChange: setOnly,
              options: [
                ["all", "All", groups.length],
                ["ready", "Ready to evolve", readyCount],
                ["spare", "Has spares", spareCount],
                ["evolves", "Can evolve at all",
                  groups.filter((g) => g.paths.length).length],
              ],
            },
            {
              id: "sort", label: "SORT", value: sort, onChange: setSort,
              // "By ..." for the same reason the Dex does it: the SORT
              // caption is gone, so the option has to say it is an order.
              options: [
                ["ready", "Ready first"],
                ["dex", "By number"],
                ["name", "By name"],
                ["count", "By count"],
                ["level", "By level"],
                ["value", "By value"],
              ],
            },
          ]}
        />
      )}

      <div className="panel-head">
        <span>{box.length} STORED</span>
        <span>
          {speciesCount} SPECIES · {spareUids.length} SPARE
          {readyCount > 0 && ` · ${readyCount} READY`}
        </span>
      </div>

      {/* THE CHOICE, and it is the reason candy can never be a dead resource:
          you mint it only when you are about to spend it. Once the dex is done
          you simply take the cash instead, and nothing is left stranded.

          Two buttons rather than one button and a toggle - the payouts are
          different enough that the decision should be visible on the surface
          rather than hidden in a mode you might be in the wrong half of.

          Only worth the space when there is something to take; with an empty
          box this was a large loud control that did nothing. */}
      {spareUids.length ? (
        <div className="bx-sweep">
          <button
            className="bigbtn"
            onClick={() => confirmSweep(false)}
            data-tip="Cash. Keeps the best of each species and every variant."
          >
            SELL {spareUids.length} · +¥{spareValue.toLocaleString()}
          </button>
          <button
            className="bigbtn candy"
            onClick={() => confirmSweep(true)}
            data-tip="Rare Candy. 1 candy = 1 level, on any Pokémon you hold."
          >
            <img src="items/rare-candy.png" alt="" />
            +{spareCandy}
          </button>
        </div>
      ) : (
        <button className="bigbtn quiet" disabled>NOTHING SPARE</button>
      )}

      <Note>{flash}</Note>

      {!box.length && <p className="empty">Nothing caught yet.</p>}
      {box.length > 0 && !shown.length && (
        <p className="empty">Nothing matches that.</p>
      )}

      <div className="boxlist">
        {shown.map((group) => {
          const sp = speciesById(group.species);
          const spare = group.spares.length;
          return (
            <div
              key={`${group.species}:${group.variant ?? ""}`}
              className={`boxrow${group.ready ? " ready" : group.spares.length ? " spare" : ""}`}
            >
              <Sprite id={group.species} variant={group.variant} fx />
              {/* The drawn mark, not a star glyph: the same icon the Dex tile
                  and the encounter badge use, so one tier looks like itself
                  everywhere. */}
              {group.variant && (
                <span className={`bx-rare ${group.variant}`}>
                  <Mark tier={group.variant} size={13} />
                </span>
              )}
              <div className="bx-main">
                <span className="bx-name">
                  {label(sp)}
                  {group.variant && (
                    <span className={`bx-vtag ${group.variant}`}>
                      {group.variant.toUpperCase()}
                    </span>
                  )}
                  <span className={`tier tier-${sp.tier}`}>{sp.tier}</span>
                </span>
                <Types of={sp.types} className="bx-types" />
                <span className="bx-meta">
                  Lv {group.best} best · ¥{worth(sp)} / {candyValue(sp)} candy
                </span>
              </div>

              <span className="bx-count">&times;{group.count}</span>

              {/* ONE POKEMON'S PROGRESS, not the pile's. The bar used to read
                  "9 / 16 caught" and moved when you caught a ninth; it reads
                  "Lv 9 / 16" and moves when you spend candy. Same shape, and
                  it is now about the individual sitting at the top of this
                  row - which is also the one that will evolve. */}
              {group.paths.length > 0 && (
                <span className={`bx-evo${group.ready ? " on" : ""}`}>
                  <i
                    className="bx-bar"
                    style={{ "--f": Math.min(1, group.hero.level / group.at) }}
                  />
                  {group.ready
                    ? "ready to evolve"
                    : group.stoneOnly
                      ? `Lv ${group.hero.level} — needs a stone`
                      : `Lv ${group.hero.level} / ${group.at}`}
                </span>
              )}

              <div className="bx-acts">
                {group.paths.map((path) => {
                  const blocked = blockedBy(group, path);
                  return (
                    <button
                      key={path.row.to}
                      className="evobtn"
                      disabled={!path.ready || busy}
                      onClick={() => confirmEvolve(group, path)}
                      data-tip={blockedWhy(group, path)}
                    >
                      {path.stone && (
                        <img src={`items/${path.stone}.png`} alt="" />
                      )}
                      ▲ {label(speciesById(path.row.to))}
                      {blocked && <em>{blocked}</em>}
                    </button>
                  );
                })}
                {/* RAISE only shows where candy would actually do something:
                    there is a next step, it is not already reached, and a stone
                    is not the only thing missing. Hidden rather than disabled
                    when there is no candy, because a permanently dead button on
                    every row of a long list is noise. */}
                {group.need > 0 && candy > 0 && !busy && (
                  <button className="raisebtn" onClick={() => confirmRaise(group)}>
                    ▲ Lv +{Math.min(group.need, candy)}
                  </button>
                )}
                {spare > 0 && (
                  <>
                    <button onClick={() => confirmSellOne(group, false)}>
                      SELL {spare}
                    </button>
                    <button
                      className="candy"
                      onClick={() => confirmSellOne(group, true)}
                      data-tip={`${spare * candyValue(sp)} Rare Candy`}
                    >
                      <img src="items/rare-candy.png" alt="" />
                      {spare * candyValue(sp)}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pending && (
        <Confirm
          title={pending.title}
          lines={pending.lines}
          manifest={pending.manifest}
          recount={pending.recount}
          note={pending.note}
          confirmLabel={pending.confirmLabel}
          tone={pending.tone ?? "sell"}
          onConfirm={(picked) => {
            pending.run(picked);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

export default memo(Box);
