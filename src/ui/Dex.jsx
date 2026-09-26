/* The Pokédex grid.

   151 cells is several screens of scrolling, and the question you arrive with is
   always narrower than that: which am I still missing, where is the one I just
   heard about, which fire-types have I got shiny. So it filters on three axes at
   once — what state, what type, and in what order — and shows its marks on the
   tile so a collector can read progress without opening anything.

   Four columns rather than five. The tile carries a sprite, a number, up to
   three variant marks and a completion badge now, and at 52px those were fighting
   each other; at ~76px they each have a place. */

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SPECIES } from "../data/dex.js";
import { label } from "../game/map.js";
import {
  LEGENDARY, TIERS, dexIndex, genOf, GENERATIONS, tiersFor, isLegendary,
  ROSETTE_NEED,
  GEN_UNLOCK,
} from "../game/biomes.js";
import FilterBar from "./FilterBar.jsx";
import Sprite, { VariantFx } from "./Sprite.jsx";
import Mark from "./Marks.jsx";
import { researchLevel, RESEARCH_MAX } from "../game/research.js";

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

/* ONE TILE, MEMOISED ON WHAT IT SHOWS. A catch changes one or two entries,
   and the whole grid - some 1,300 tiles with their sprites, tier layers and
   marks - was reconciled for them: the spike left in a variant catch once
   the per-phase rebuilds were gone. Every prop is a primitive or a stable
   reference (`sp` from SPECIES, `onSelect` a state setter; marks joined to a
   string), so `memo` compares for real and an untouched tile is skipped. */
const Cell = memo(function Cell({ sp, state, variant, marks, full, studied, onSelect }) {
  const list = marks ? marks.split(",") : [];
  return (
    <button
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
              list.length ? `, ${list.join(" and ")}` : ""
            }${full ? ", every variant caught" : ""}${
              studied ? ", research complete" : ""}`
          : `Unknown Pokémon ${sp.id}`
      }
    >
      {/* An unseen entry draws nothing. It used to draw its real
          sprite at `opacity: 0`, which meant a fresh save fetched a
          screenful of PNGs in order to hide every one of them - and
          put the answer in the DOM for anyone who looked. The row
          height is fixed by `grid-auto-rows`, so the cell keeps its
          shape with no image in it. */}
      {state > 0 && <Sprite id={sp.id} variant={variant} />}

      {/* AND ITS TREATMENT, MOVING. This file used to say a Dex cell
          was one image with nowhere to hang a layer - it is a
          `position: relative` button with `overflow: hidden`, which is
          a container, and the claim was about the SPRITE rather than
          the cell. The grid is where a collection is actually looked
          at, and a wall of stills is the one place a Holo has nothing
          to say for itself.

          `rarest()` only ever names a tier you have REGISTERED, so an
          unearned treatment cannot leak here the way it did in the
          FORMS strip. One layer per cell at most, because the grid
          shows the rarest tier rather than all of them. */}
      {state > 0 && <VariantFx id={sp.id} variant={variant} />}

      {/* One mark per variant held, kindest first, so the row reads as
          progress. `!!` is not needed here because `marks` is already a
          list of strings - but it IS needed anywhere a 0/1 byte is used
          as a condition, since `0 && x` renders the text "0". */}
      {list.length > 0 && (
        <span className="cell-marks">
          {list.map((t) => <Mark key={t} tier={t} size={12} />)}
        </span>
      )}

      {/* OPPOSITE CORNER FROM THE TIER MARKS, deliberately. Those are
          four things you can earn and this is a fact about the species,
          so a legendary badge sitting in that row would read as a fifth
          tier - and it is the same mistake as putting it beside the
          rosette, which is the one mark you cannot simply be given. */}
      {isLegendary(sp.id) && state >= 1 && (
        <Mark tier="legendary" size={13} className="cell-legend" />
      )}

      {full && <Mark tier="complete" size={16} className="cell-full" />}

      {/* The one free corner. Only a FINISHED entry is marked: a level
          number on every caught tile is 1,200 small numbers, and the
          finished ones are the ones that changed something. */}
      {studied && <Mark tier="research" size={12} className="cell-research" />}

      <span className="cell-no">{String(sp.id).padStart(3, "0")}</span>
    </button>
  );
});

/* ONLY THE ROWS ON SCREEN ARE TILES. The grid was 1,300 tiles every time the
   tab opened - on a phone-speed CPU 2.6-4.0s of React and commit, each open,
   and with `content-visibility` on every tile the browser ran an intersection
   check for all 1,300 on every frame the game drew: the frame rate halved
   while the Dex was merely open (36 -> 18fps, 6x throttled). Now the grid
   renders the rows in view plus OVERSCAN either side, and padding stands in
   for the rest, so the scrollbar is the same.

   The geometry is READ off the grid's own CSS (`grid-auto-rows`, `row-gap`,
   the column count), never typed here, so the stylesheet stays the one place
   a tile's size is decided. A hidden panel measures 0 tall and renders a few
   rows; the ResizeObserver catches it being shown again.

   TWO ELEMENTS, BECAUSE PADDING IS HEIGHT. The spacers were padding on the
   scrolling grid itself, and `max-height` cannot squeeze padding - the box
   grew to the whole list (28,574px), nothing scrolled, and "the rows in view"
   was every row. `.dexgrid` scrolls; `.dexgrid-in` is the grid and carries
   the padding. */
const OVERSCAN = 3;
function useRows(ref, count) {
  const [win, setWin] = useState({ first: 0, last: 12, cols: 4, pitch: 91 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const cs = getComputedStyle(el.firstElementChild ?? el);
      const cols = cs.gridTemplateColumns.split(" ").filter(Boolean).length || 4;
      const pitch = (parseFloat(cs.gridAutoRows) || 84) + (parseFloat(cs.rowGap) || 0);
      const first = Math.max(0, Math.floor(el.scrollTop / pitch) - OVERSCAN);
      const last = Math.ceil((el.scrollTop + el.clientHeight) / pitch) + OVERSCAN;
      setWin((w) => (w.first === first && w.last === last && w.cols === cols && w.pitch === pitch
        ? w : { first, last, cols, pitch }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", measure); ro.disconnect(); };
  }, [ref, count]);
  return win;
}

/* MEMOISED, AND EVERY PROP IS ALREADY STABLE WHILE WALKING - which is what
   makes this a two-line fix rather than a refactor. `dex` and `tiers` are
   mutated in PLACE by the engine so their references never change, `caught`
   and `level` are numbers that only move when they should, and `onSelect` is
   a `useState` setter, which React guarantees is stable. The one thing that
   was changing seven times a second was the parent re-rendering, and that is
   exactly what `memo` stops. `colRev` is the signal that this panel's content
   really did move - see engine.js. */
function Dex({ dex, tiers, caught, level = 1, colRev, onSelect }) {
  const [only, setOnly] = useState("all");
  const [type, setType] = useState("any");
  const [sort, setSort] = useState("number");
  /* "kanto" rather than "all" as the default would hide 207 entries behind a
     control nobody has touched yet. A region is a way to stop scrolling, not a
     way to start. */
  const [region, setRegion] = useState("all");
  const [find, setFind] = useState("");

  const at = (id) => dex?.[dexIndex(id)] ?? 0;
  const has = (t, id) => !!tiers?.[t]?.[dexIndex(id)];
  const count = (t) => SPECIES.filter((sp) => has(t, sp.id)).length;
  /* Which art a tile wears: the rarest registered. */
  const rarest = (id) => TIERS.find((t) => has(t, id)) ?? null;
  /* Every variant, plus the ordinary one. The completion badge is the whole
     point of showing the marks at all — it is the only thing on this screen
     that cannot be got by simply playing for long enough. */
  /* THE TIERS THIS SPECIES CAN ACTUALLY WEAR, not all four. A Sinnoh Pokémon
     has no Origin to find - see `hasOrigin` - so asking it for one would make
     the rosette impossible for 107 entries rather than merely hard. */
  const complete = (id) =>
    /* ANY FOUR, not every one. At four tiers "all of them" was 8,905
       encounters for one species - hard and reachable. At eight it is 18,039,
       which is not a harder mark but a deleted one. Four of whatever this
       species can wear is 2,374, inside a single playthrough, and it keeps
       what the mark always meant: go wide rather than get lucky once. */
    at(id) === 2
    && tiersFor(id).filter((t) => has(t, id)).length >= ROSETTE_NEED;
  const completed = SPECIES.filter((sp) => complete(sp.id)).length;

  const seen = SPECIES.filter((sp) => at(sp.id) >= 1).length;

  /* What the progress bar is measuring: the chosen region, or the whole dex.
     One object so the three readings - total, seen, caught - cannot come from
     three different filters, which is exactly how "113 / 358" ended up over a
     grid of 151. */
  const scope = useMemo(() => {
    const mine = region === "all"
      ? SPECIES
      : SPECIES.filter((sp) => genOf(sp.id) === Number(region));
    return {
      total: mine.length,
      seen: mine.filter((sp) => at(sp.id) >= 1).length,
      caught: mine.filter((sp) => at(sp.id) === 2).length,
    };
  }, [region, dex, tiers]);
  const needle = find.trim().toLowerCase();

  const shown = SPECIES.filter((sp) => {
    const state = at(sp.id);
    if (region !== "all" && genOf(sp.id) !== Number(region)) return false;
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

  const grid = useRef(null);
  const win = useRows(grid, shown.length);
  const rows = Math.ceil(shown.length / win.cols);
  const last = Math.min(rows, win.last);
  const first = Math.min(win.first, last);

  return (
    <div className="panel">
      <FilterBar
        find={find}
        onFind={setFind}
        placeholder="Find a name, type or number…"
        onReset={() => {
          setOnly("all"); setType("any"); setSort("number"); setFind("");
          setRegion("all");
        }}
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
          /* ONE REGION AT A TIME. 358 cells is nine screens of scrolling and
             the question you arrive with is almost always about one of them -
             and it only gets worse: Hoenn alone is another 135.

             Built from `GENERATIONS`, which is derived from what actually
             shipped, so a region appears here the day it is fetched and the gap
             where Hoenn is does not show up as an empty tab. The counts are
             what you have CAUGHT in each, because "Johto 12" is a progress bar
             you can read at a glance and "Johto 100" is a fact about Pokemon. */
          {
            id: "region", label: "REGION", value: region, onChange: setRegion,
            /* No counts in this one. `GENERATIONS[].name` is already
               "Gen 1 (Kanto)", and the progress bar above says how far through
               it you are - a count here would be the same number twice, and the
               one in the menu would move under you as you played.

               BUT A REGION THAT HAS NOT ARRIVED SAYS WHEN, and that is the one
               thing this menu was missing. Generations gate on `GEN_UNLOCK`, and
               NOTHING anywhere on screen said so - reported from play as "I am
               level 15 and only meeting Gen 1, is this supposed to happen?",
               which is exactly what a silent gate feels like from the inside.
               The entry still works: you can browse a locked region's dex, you
               just cannot meet one yet, so the label says so rather than the
               option being removed. */
            options: [
              ["all", "All regions", null],
              ...GENERATIONS.map((g) => {
                const at = GEN_UNLOCK[g.gen] ?? 1;
                return [String(g.gen),
                  level >= at ? g.name : `${g.name} — from Lv ${at}`, null];
              }),
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

      {/* THE BAR MEANS WHAT THE REGION SELECT SAYS. It read `caught / 358`
          whatever was chosen, so picking Kanto left "113 / 358" over a grid of
          151 - a progress bar measuring something you are not looking at.

          Scoped to the REGION only, deliberately, and not to the search box or
          the SHOW filter: this is a progression readout, and "2 / 3" because
          you typed "pika" is a result count wearing a progress bar's clothes. */}
      <div className="count">
        <b>{scope.caught}</b> <span>/ {scope.total}</span>
        <em>{Math.round((scope.caught / Math.max(1, scope.total)) * 100)}%</em>
      </div>
      {/* Two fills in one track: everything met, and everything caught. `seen`
          already counts entries at state 1 OR 2, so it is the outer bound and
          the caught fill sits inside it. */}
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={scope.total}
        aria-valuenow={scope.caught}
        aria-label={`${scope.caught} caught and ${scope.seen} seen of ${scope.total}`}
      >
        <b style={{ width: `${(scope.seen / Math.max(1, scope.total)) * 100}%` }} />
        <i style={{ width: `${(scope.caught / Math.max(1, scope.total)) * 100}%` }} />
      </div>

      {!shown.length && <p className="empty">Nothing matches that.</p>}

      <div className="dexgrid" ref={grid}>
        <div className="dexgrid-in"
          style={{ paddingTop: first * win.pitch, paddingBottom: (rows - last) * win.pitch }}>
        {shown.slice(first * win.cols, last * win.cols).map((sp) => {
          const state = at(sp.id);
          return (
            <Cell
              key={sp.id} sp={sp} state={state} onSelect={onSelect}
              variant={state > 0 ? rarest(sp.id) : null}
              marks={MARKS.filter((t) => has(t, sp.id)).join(",")}
              full={complete(sp.id)}
              studied={researchLevel(sp.id, tiers?.research?.[sp.id]) >= RESEARCH_MAX}
            />
          );
        })}
        </div>
      </div>
    </div>
  );
}

export default memo(Dex);
