/* Storage, and the place the loop actually closes: duplicates are the only
   meaningful income, so selling them is what this panel is for - and now also
   the only way to evolve, so every pile is a decision rather than just stock.

   One row per species with a count, not one card per Pokémon - forty Rattata
   is a number, not forty things to scroll past.

   The evolution bill is the real level from the games: Charmander evolves at 16,
   so it takes 16. That is a big number to hold in your head, so the row shows it
   as a bar and never makes you count anything yourself.

   Selling never blocks you, but it never surprises you either. The bulk button
   only takes what is genuinely surplus: past the best of each species, and past
   anything an unregistered evolution is waiting on. Those held-back ones can
   still be sold from their own row - the confirm dialog just tells you first
   what it costs you in progress. */

import { useEffect, useMemo, useState } from "react";
import { SPECIES } from "../data/species.js";
import {
  sellValue, duplicateUids, heldUids, evolutionsOf, evolveState, itemById,
} from "../game/items.js";
import { label } from "../game/map.js";
import Types from "./Types.jsx";
import FilterBar from "./FilterBar.jsx";
import { valuedAt } from "../game/trainer.js";
import Confirm from "./Confirm.jsx";
import Sprite from "./Sprite.jsx";

// Rarest first: the order the Box, the Dex and the encounter all read in -
// one array, in biomes.js, beside the odds that define it.
import { TIERS as RARE } from "../game/biomes.js";

export default function Box({ box, bag, dex, rev, stats, busy, onSell, onEvolve }) {
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

  const { groups, spareUids, spareValue } = useMemo(() => {
    const spare = new Set(duplicateUids(box, dex));
    const byId = new Map();

    for (const mon of box) {
      const g = byId.get(mon.species) ?? {
        species: mon.species,
        count: 0,
        best: 0,
        mons: [],
        spares: [],
      };
      g.count += 1;
      g.best = Math.max(g.best, mon.level);
      // A group draws one sprite, so the rarest thing in it claims the sprite -
      // that is what you are scanning the panel for.
      for (const t of RARE) if (mon[t]) g[t] = (g[t] ?? 0) + 1;
      g.mons.push(mon);
      if (spare.has(mon.uid)) g.spares.push(mon.uid);
      byId.set(mon.species, g);
    }

    for (const g of byId.values()) {
      // The rarest one in the group claims the sprite - that is what you are
      // scanning the panel for - and the star counts all of them.
      g.rarest = RARE.find((t) => g[t]) ?? null;
      g.rares = RARE.reduce((n, t) => n + (g[t] ?? 0), 0);
      /* One state per branch — Eevee has three, each wanting a different stone
         but all counting the same pile. */
      g.paths = evolutionsOf(g.species).map((row) => ({
        row,
        ...evolveState(box, bag, row),
      }));
      g.ready = g.paths.some((p) => p.ready);
      // The bar tracks the nearest branch, so it always shows real progress.
      g.cost = g.paths.length ? Math.min(...g.paths.map((p) => p.cost)) : 0;
      g.have = g.paths.length ? g.paths[0].have : g.count;
      // Short of the count, or short of the stone? They read very differently.
      g.shortOnFeed = g.paths.length > 0 && g.have < g.cost;

      // See heldUids: the rule is in items.js so check.mjs can hold it to the
      // same promise the sweep makes.
      g.held = heldUids(g.mons, g.spares);
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
        a.species - b.species,
    );
    return {
      groups,
      spareUids: [...spare],
      spareValue: box
        .filter((m) => spare.has(m.uid))
        .reduce((sum, m) => sum + worth(SPECIES[m.species - 1]), 0),
    };
    // `rev` is what actually changes: the engine mutates box, bag and dex in
    // place, so their references alone would keep this memo stale forever.
  }, [box, bag, dex, rev, stats]);

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

  const confirmSellAll = () =>
    setPending({
      title: "Sell every spare?",
      lines: [
        ["Pokémon sold", spareUids.length],
        ["You receive", `¥${spareValue.toLocaleString()}`],
        ["Kept", `${groups.length} — the best of each species`],
      ],
      note: "Anything an unregistered evolution still needs is held back.",
      confirmLabel: `SELL ${spareUids.length} · +¥${spareValue.toLocaleString()}`,
      run: () => {
        onSell(spareUids);
        setFlash(`Sold ${spareUids.length} spare · +¥${spareValue.toLocaleString()}`);
      },
    });

  /* Sells surplus if there is any, and only otherwise offers to dig into what
     an evolution is holding — with the cost of doing that spelled out. */
  const confirmSellOne = (group) => {
    const sp = SPECIES[group.species - 1];
    const digging = group.spares.length === 0;
    const uids = digging ? group.held : group.spares;
    const value = uids.length * worth(sp);
    const left = group.count - uids.length;

    setPending({
      title: digging ? `Sell ${label(sp)} you are saving?` : `Sell spare ${label(sp)}?`,
      lines: [
        ["Sold", `${uids.length} × ${label(sp)}`],
        ["You receive", `¥${value.toLocaleString()}`],
        ["Kept", `${left} × ${label(sp)} at Lv ${group.best}`],
      ],
      note:
        digging && group.paths.length
          ? `These are evolution material — it would leave you ${
              group.cost - (group.have - uids.length)
            } short of ${group.paths.map((p) => label(SPECIES[p.row.to - 1])).join(" / ")}.`
          : undefined,
      confirmLabel: `SELL ${uids.length} · +¥${value.toLocaleString()}`,
      run: () => {
        onSell(uids);
        setFlash(`Sold ${uids.length} × ${label(sp)} · +¥${value.toLocaleString()}`);
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
        ["Costs", `${path.cost} × ${label(sp)}`],
        ...(stone ? [["Uses", `1 × ${stone.name}`]] : []),
        ["Left holding", `${group.have - path.cost} from the line`],
      ],
      note: "Your best does the evolving, and keeps its level.",
      confirmLabel: "EVOLVE",
      run: () => {
        const done = onEvolve(group.species, path.row.to);
        if (!done) setFlash("Not enough to evolve.");
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
    if (!path.hasStone && path.have >= path.cost) {
      return `needs a ${itemById(path.stone)?.name}`;
    }
    return null;
  };

  // The full reason, for the tooltip, which has room for it.
  const blockedWhy = (group, path) => {
    if (busy) return "Finish what is on screen first";
    if (path.ready) return `Feed ${path.cost} × ${label(SPECIES[group.species - 1])}`;
    if (path.have < path.cost) return `${path.cost - path.have} more to catch`;
    if (!path.hasStone) return `Needs a ${itemById(path.stone)?.name}`;
    return `Needs 1 × ${label(SPECIES[group.species - 1])}`;
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
          {groups.length} SPECIES · {spareUids.length} SPARE
          {readyCount > 0 && ` · ${readyCount} READY`}
        </span>
      </div>

      {/* Only worth a full-width button when it has something to sell; with an
          empty box it was a large loud control that did nothing. */}
      <button
        className={`bigbtn${spareUids.length ? "" : " quiet"}`}
        disabled={!spareUids.length}
        onClick={confirmSellAll}
        title="Keeps the best of each species, and whatever an evolution still needs"
      >
        {spareUids.length
          ? `SELL ${spareUids.length} SPARE · +¥${spareValue.toLocaleString()}`
          : "NOTHING SPARE"}
      </button>

      {flash && <p className="bx-flash" role="status">{flash}</p>}

      {!box.length && <p className="empty">Nothing caught yet.</p>}
      {box.length > 0 && !shown.length && (
        <p className="empty">Nothing matches that.</p>
      )}

      <div className="boxlist">
        {shown.map((group) => {
          const sp = SPECIES[group.species - 1];
          const sellable = group.spares.length || group.held.length;
          return (
            <div
              key={group.species}
              className={`boxrow${group.ready ? " ready" : group.spares.length ? " spare" : ""}`}
            >
              <Sprite id={group.species} variant={group.rarest} />
              {group.rarest && (
                <span
                  className={`bx-rare ${group.rarest}`}
                  title={RARE
                    .filter((t) => group[t])
                    .map((t) => `${group[t]} ${t}`)
                    .join(" \u00b7 ")}
                >
                  ✦{group.rares > 1 ? group.rares : ""}
                </span>
              )}
              <div className="bx-main">
                <span className="bx-name">
                  {label(sp)}
                  <span className={`tier tier-${sp.tier}`}>{sp.tier}</span>
                </span>
                <Types of={sp.types} className="bx-types" />
                <span className="bx-meta">
                  Lv {group.best} best · ¥{worth(sp)} each
                </span>
              </div>

              <span className="bx-count">&times;{group.count}</span>

              {/* The whole point of this panel: you should never have to count
                  your own Rattata to know how close you are. */}
              {group.paths.length > 0 && (
                <span className={`bx-evo${group.ready ? " on" : ""}`}>
                  <i
                    className="bx-bar"
                    style={{ "--f": Math.min(1, group.have / group.cost) }}
                  />
                  {group.ready
                    ? `ready — feeds ${group.cost}`
                    : `${group.have} / ${group.cost} to evolve`}
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
                {sellable > 0 && (
                  <button
                    className={group.spares.length ? "" : "risky"}
                    onClick={() => confirmSellOne(group)}
                  >
                    SELL {sellable}
                  </button>
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
