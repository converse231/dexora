/* The Pokédex grid.

   151 cells is several screens of scrolling, and the question you arrive with is
   always narrower than that: which am I still missing, where is the one I just
   heard about, which fire-types have I got shiny. So it filters on three axes at
   once — what state, what type, and in what order — and shows its marks on the
   tile so a collector can read progress without opening anything.

   Four columns rather than five. The tile carries a sprite, a number, up to
   three variant marks and a completion badge now, and at 52px those were fighting
   each other; at ~76px they each have a place. */

import { useState } from "react";
import { SPECIES } from "../data/species.js";
import { label } from "../game/map.js";
import { LEGENDARY, TIERS } from "../game/biomes.js";
import FilterBar from "./FilterBar.jsx";
import Sprite from "./Sprite.jsx";
import Mark from "./Marks.jsx";

const STATE = ["unseen", "seen", "caught"];

/* `TIERS` is rarest first — the order every panel reads tiers in, and the
   order a tile picks its portrait in. MARKS is the order they are *shown* in on
   a tile: kindest first, so the row reads as progress towards the rarest rather
   than away from it. */
const MARKS = [...TIERS].reverse();

const TYPES = [...new Set(SPECIES.flatMap((sp) => sp.types))].sort();
const LEGEND = new Set(LEGENDARY);

/* Sorts. Each is a comparator over species, and every one of them falls back to
   dex number so the order is total — two Pokémon that tie must not shuffle
   between renders. */
const SORTS = {
  number: () => 0,
  name: (a, b) => label(a).localeCompare(label(b)),
  type: (a, b) => a.types[0].localeCompare(b.types[0]),
  rarity: (a, b) => "SABC".indexOf(a.tier) - "SABC".indexOf(b.tier),
};

export default function Dex({ dex, tiers, caught, onSelect }) {
  const [only, setOnly] = useState("all");
  const [type, setType] = useState("any");
  const [sort, setSort] = useState("number");
  const [find, setFind] = useState("");

  const at = (id) => dex?.[id - 1] ?? 0;
  const has = (t, id) => !!tiers?.[t]?.[id - 1];
  const count = (t) => SPECIES.filter((sp) => has(t, sp.id)).length;
  /* Which art a tile wears: the rarest registered. */
  const rarest = (id) => TIERS.find((t) => has(t, id)) ?? null;
  /* Every variant, plus the ordinary one. The completion badge is the whole
     point of showing the marks at all — it is the only thing on this screen
     that cannot be got by simply playing for long enough. */
  const complete = (id) => at(id) === 2 && MARKS.every((t) => has(t, id));
  const completed = SPECIES.filter((sp) => complete(sp.id)).length;

  const seen = SPECIES.filter((sp) => at(sp.id) >= 1).length;
  const needle = find.trim().toLowerCase();

  const shown = SPECIES.filter((sp) => {
    const state = at(sp.id);
    if (only === "caught" && state !== 2) return false;
    if (only === "missing" && state === 2) return false;
    if (only === "seen" && state !== 1) return false;
    if (only === "complete" && !complete(sp.id)) return false;
    /* `TIERS.includes`, not `tiers[only]`. The old line indexed the tier map
       directly, which was safe while that map was built inside this component
       and is not now it is the engine state - `state` is null for the first
       render, and `null["all"]` threw before a single cell was drawn. Asking
       the list whether `only` names a tier does not touch the data at all. */
    if (TIERS.includes(only) && !has(only, sp.id)) return false;

    if (type === "legendary" && !LEGEND.has(sp.id)) return false;
    if (type !== "any" && type !== "legendary" && !sp.types.includes(type)) return false;

    if (!needle) return true;
    /* An unseen entry gives nothing away: matching its name would let you use
       the search box as a spoiler for a species you have never met. Its number
       is on the card already, so that stays searchable. */
    if (String(sp.id).padStart(3, "0").includes(needle)) return true;
    if (state === 0) return false;
    return (
      label(sp).toLowerCase().includes(needle) ||
      sp.types.some((t) => t.includes(needle))
    );
  }).sort((a, b) => SORTS[sort](a, b) || a.id - b.id);

  return (
    <div className="panel">
      <FilterBar
        find={find}
        onFind={setFind}
        placeholder="Find a name, type or number…"
        onReset={() => { setOnly("all"); setType("any"); setSort("number"); setFind(""); }}
        selects={[
          {
            id: "show", label: "SHOW", value: only, onChange: setOnly,
            /* Short labels, because there is no caption over the control any
               more and three of them share one row: a native select cannot
               ellipsize, it CLIPS, so "Seen, not caught 34" would have come
               out as "Seen, not cau". Every one of these is the noun plus its
               count and nothing else. */
            options: [
              ["all", "All", SPECIES.length],
              ["caught", "Caught", caught],
              ["seen", "Seen only", seen - caught],
              ["missing", "Missing", SPECIES.length - caught],
              /* One row per tier, kindest first, so the menu reads in the
                 same direction the marks on a tile do. */
              ...MARKS.map((t) => [t, t[0].toUpperCase() + t.slice(1), count(t)]),
              ["complete", "Complete", completed],
            ],
          },
          {
            id: "sort", label: "SORT", value: sort, onChange: setSort,
            /* "By ..." rather than bare nouns: with the SORT caption gone,
               "Type" on its own beside a filter reads as another filter. */
            options: [
              ["number", "By number"],
              ["name", "By name"],
              ["type", "By type"],
              ["rarity", "By rarity"],
            ],
          },
        ]}
        /* Types keep their colours - the dropdown opens into the palette
           rather than into a list of words, because a type is recognised by
           its colour first. See FilterBar for why it cannot be a <select>. */
        types={{
          label: "TYPE",
          value: type,
          onChange: setType,
          options: [
            ["any", "ALL", "t-any"],
            ["legendary", "LEGEND", "t-legend"],
            ...TYPES.map((t) => [t, t.toUpperCase(), `t-${t}`]),
          ],
        }}
      />

      <div className="count">
        <b>{caught}</b> <span>/ {SPECIES.length}</span>
        <em>{Math.round((caught / SPECIES.length) * 100)}%</em>
      </div>
      {/* Two fills in one track: everything met, and everything caught. `seen`
          already counts entries at state 1 OR 2, so it is the outer bound and
          the caught fill sits inside it. */}
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={SPECIES.length}
        aria-valuenow={caught}
        aria-label={`${caught} caught and ${seen} seen of ${SPECIES.length}`}
      >
        <b style={{ width: `${(seen / SPECIES.length) * 100}%` }} />
        <i style={{ width: `${(caught / SPECIES.length) * 100}%` }} />
      </div>

      {!shown.length && <p className="empty">Nothing matches that.</p>}

      <div className="dexgrid">
        {shown.map((sp) => {
          const state = at(sp.id);
          const marks = MARKS.filter((t) => has(t, sp.id));
          const full = complete(sp.id);
          return (
            <button
              key={sp.id}
              className={`cell ${STATE[state]}${full ? " full" : ""}`}
              onClick={() => onSelect(sp.id)}
              /* The tile is one button, so its label has to carry everything
                 inside it - and the marks are images with their own alt text,
                 which a button label swallows. Naming them here and nowhere
                 else is what stops "Pidgey, entry 16, shiny" being read out as
                 "Pidgey entry 16 Shiny Shiny". */
              aria-label={
                state
                  ? `${label(sp)}, entry ${sp.id}${
                      marks.length ? `, ${marks.join(" and ")}` : ""
                    }${full ? ", every variant caught" : ""}`
                  : `Unknown Pokémon ${sp.id}`
              }
            >
              {/* An unseen entry draws nothing. It used to draw its real
                  sprite at `opacity: 0`, which meant a fresh save fetched a
                  screenful of PNGs in order to hide every one of them - and
                  put the answer in the DOM for anyone who looked. The row
                  height is fixed by `grid-auto-rows`, so the cell keeps its
                  shape with no image in it. */}
              {state > 0 && <Sprite id={sp.id} variant={rarest(sp.id)} />}

              {/* One mark per variant held, kindest first, so the row reads as
                  progress. `!!` is not needed here because `marks` is already a
                  list of strings - but it IS needed anywhere a 0/1 byte is used
                  as a condition, since `0 && x` renders the text "0". */}
              {marks.length > 0 && (
                <span className="cell-marks">
                  {marks.map((t) => <Mark key={t} tier={t} size={12} />)}
                </span>
              )}

              {full && <Mark tier="complete" size={16} className="cell-full" />}

              <span className="cell-no">{String(sp.id).padStart(3, "0")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
