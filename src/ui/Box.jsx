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

import { useEffect, useMemo, useState } from "react";
import { SPECIES } from "../data/species.js";
import {
  sellValue, candyValue, duplicateUids, evolutionsOf, evolveState, itemById,
  variantOf,
} from "../game/items.js";
import { label } from "../game/map.js";
import Types from "./Types.jsx";
import FilterBar from "./FilterBar.jsx";
import { valuedAt } from "../game/trainer.js";
import Confirm from "./Confirm.jsx";
import Sprite from "./Sprite.jsx";
import Mark from "./Marks.jsx";

// Rarest first: the order the Box, the Dex and the encounter all read in -
// one array, in biomes.js, beside the odds that define it.
import { TIERS as RARE } from "../game/biomes.js";

/* The order rows of one species sit in: the ordinary pile, then its variants
   kindest first - the same order the Dex sheet lists its FORMS in, so the two
   screens do not disagree about what comes after what. */
const VARIANT_ORDER = [null, ...[...RARE].reverse()];
const variantRank = (v) => VARIANT_ORDER.indexOf(v);

export default function Box({
  box, bag, dex, candy, rev, stats, busy, onSell, onConvert, onLevelUp, onEvolve,
}) {
  const [pending, setPending] = useState(null);
  const [flash, setFlash] = useState(null);
  // Which rows to show, and a name to match. Both are cheap client-side passes.
  const [only, setOnly] = useState("all");
  const [sort, setSort] = useState("ready");
  const [find, setFind] = useState("");

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
      // The bar tracks the nearest branch, so it always shows real progress.
      g.at = g.paths.length ? Math.min(...g.paths.map((x) => x.at)) : 0;
      g.need = g.paths.length ? Math.min(...g.paths.map((x) => x.need)) : 0;
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
        Number(b.ready) - Number(a.ready) ||
        Number(b.spares.length > 0) - Number(a.spares.length > 0) ||
        a.species - b.species ||
        variantRank(a.variant) - variantRank(b.variant),
    );
    return {
      groups,
      spareUids: [...spare],
      spareValue: box
        .filter((m) => spare.has(m.uid))
        .reduce((sum, m) => sum + worth(SPECIES[m.species - 1]), 0),
      spareCandy: box
        .filter((m) => spare.has(m.uid))
        .reduce((sum, m) => sum + candyValue(SPECIES[m.species - 1]), 0),
    };
    // `rev` is what actually changes: the engine mutates box, bag and dex in
    // place, so their references alone would keep this memo stale forever.
  }, [box, bag, dex, rev, stats]);

  /* Distinct SPECIES, not rows. A row is one species-and-variant now, so
     `groups.length` counts a Holo Pidgey separately from the ordinary pile -
     which is right for the list and wrong for a heading that says "species".
     Three Pidgey rows are still one Pidgey. */
  const speciesCount = new Set(groups.map((g) => g.species)).size;
  const readyCount = groups.filter((g) => g.ready).length;
  const spareCount = groups.filter((g) => g.spares.length > 0).length;

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
  const SORTS = {
    ready: () => 0,                                   // the built-in order
    dex: (a, b) => a.species - b.species,
    name: (a, b) => label(SPECIES[a.species - 1]).localeCompare(label(SPECIES[b.species - 1])),
    count: (a, b) => b.count - a.count,
    value: (a, b) => worth(SPECIES[b.species - 1]) - worth(SPECIES[a.species - 1]),
    level: (a, b) => b.best - a.best,
  };

  /* Filters are applied after the grouping, not inside the memo: they change on
     every keystroke and the grouping does not, so recomputing it for a search
     term would be work for nothing. */
  const needle = find.trim().toLowerCase();
  const shown = groups.filter((g) => {
    const sp = SPECIES[g.species - 1];
    if (only === "ready" && !g.ready) return false;
    if (only === "spare" && !g.spares.length) return false;
    if (only === "evolves" && !g.paths.length) return false;
    if (!needle) return true;
    return (
      label(sp).toLowerCase().includes(needle) ||
      sp.types.some((t) => t.includes(needle))
    );
  }).sort((a, b) => SORTS[sort](a, b) || a.species - b.species);

  /* Built here rather than in the dialog: it is a pass over the whole box and
     the dialog is rebuilt on every keystroke of the search field. */
  const sellManifest = useMemo(() => {
    const spare = new Set(spareUids);
    const bySpecies = new Map();
    for (const m of box) {
      if (!spare.has(m.uid)) continue;
      const at = bySpecies.get(m.species) ?? [];
      at.push(m.level);
      bySpecies.set(m.species, at);
    }
    return [...bySpecies.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, levels]) => ({
        key: id,
        candy: levels.length * candyValue(SPECIES[id - 1]),
        /* No variant: `duplicateUids` holds every keeper out of the spare list
           entirely, so nothing in a sweep is ever anything but ordinary. */
        icon: { id },
        label: `${levels.length} × ${label(SPECIES[id - 1])}`,
        sub: `Lv ${levels.sort((a, b) => a - b).join(", ")}`,
      }));
  }, [box, spareUids, rev]);

  /* ONE SWEEP, TWO PAYOUTS. Built from the same list and the same manifest,
     because the only thing that differs is which number goes up - and a sweep
     that sometimes pays cash and sometimes pays candy from two separate code
     paths is two chances to disagree about what "spare" means. */
  const confirmSweep = (candyPayout) =>
    setPending({
      title: candyPayout ? "Convert every spare?" : "Sell every spare?",
      lines: [
        ["Pokémon taken", spareUids.length],
        ["You receive", candyPayout
          ? `${spareCandy} Rare Candy`
          : `¥${spareValue.toLocaleString()}`],
        /* Counted, not inferred. It was `groups.length`, which was the row
           count - fine while a row was a species, and an undercount now that
           a second Holo shares one row with the first. */
        ["Kept", `${box.length - spareUids.length} — the best of each, and every variant`],
      ],
      /* The sweep reaches across the whole box, so this is the one dialog
         where "which ones" cannot be inferred from the row you pressed. One
         line per species with the levels going, so a Lv 30 sitting in a pile
         of Lv 3s is visible before it is gone. */
      manifest: sellManifest,
      note: candyPayout
        ? "1 candy = 1 level. Rarer Pokémon are worth more of it."
        : "The best of each is kept, and no variant is ever taken.",
      confirmLabel: candyPayout
        ? `CONVERT ${spareUids.length} · +${spareCandy}`
        : `SELL ${spareUids.length} · +¥${spareValue.toLocaleString()}`,
      run: () => {
        if (candyPayout) {
          onConvert(spareUids);
          setFlash(`Converted ${spareUids.length} spare · +${spareCandy} candy`);
        } else {
          onSell(spareUids);
          setFlash(`Sold ${spareUids.length} spare · +¥${spareValue.toLocaleString()}`);
        }
      },
    });

  /* One row's spares, to cash or to candy.

     The "dig into what an evolution is saving" branch went with the feed: the
     reserve is one now, so a row's spares ARE everything but the best and there
     is nothing held back to dig into. That deleted the `risky` button, its
     warning copy, and `heldUids` with them. */
  const confirmSellOne = (group, candyPayout) => {
    const sp = SPECIES[group.species - 1];
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
    const sp = SPECIES[group.species - 1];
    const target = SPECIES[path.row.to - 1];
    const stone = path.stone && itemById(path.stone);
    setPending({
      title: `Evolve into ${label(target)}?`,
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
      note: group.variant
        ? `Your ${group.variant} evolves, and stays ${group.variant}. No duplicates are spent.`
        : "No duplicates are spent — only the level you have already paid for.",
      confirmLabel: "EVOLVE",
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
    const sp = SPECIES[group.species - 1];
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
            title="Cash. Keeps the best of each species and every variant."
          >
            SELL {spareUids.length} · +¥{spareValue.toLocaleString()}
          </button>
          <button
            className="bigbtn candy"
            onClick={() => confirmSweep(true)}
            title="Rare Candy. 1 candy = 1 level, on any Pokémon you hold."
          >
            <img src="items/rare-candy.png" alt="" />
            +{spareCandy}
          </button>
        </div>
      ) : (
        <button className="bigbtn quiet" disabled>NOTHING SPARE</button>
      )}

      {flash && <p className="bx-flash" role="status">{flash}</p>}

      {!box.length && <p className="empty">Nothing caught yet.</p>}
      {box.length > 0 && !shown.length && (
        <p className="empty">Nothing matches that.</p>
      )}

      <div className="boxlist">
        {shown.map((group) => {
          const sp = SPECIES[group.species - 1];
          const spare = group.spares.length;
          return (
            <div
              key={`${group.species}:${group.variant ?? ""}`}
              className={`boxrow${group.ready ? " ready" : group.spares.length ? " spare" : ""}`}
            >
              <Sprite id={group.species} variant={group.variant} />
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
                      title={blockedWhy(group, path)}
                    >
                      {path.stone && (
                        <img src={`items/${path.stone}.png`} alt="" />
                      )}
                      ▲ {label(SPECIES[path.row.to - 1])}
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
                      title={`${spare * candyValue(sp)} Rare Candy`}
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
          note={pending.note}
          confirmLabel={pending.confirmLabel}
          tone="sell"
          onConfirm={() => {
            pending.run();
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
