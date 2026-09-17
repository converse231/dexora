/* One Pokédex entry, opened by clicking a slot in the grid.

   How much it shows depends on how far you've got with that species: an unseen
   one is a silhouette and nothing else, a seen one gives you its name and types,
   and only a caught one opens up the rest. Holding detail back is the point —
   the gaps are what make you want to go and fill them.

   ORDER IS THE ARGUMENT. It used to be a flat stack of five equal blocks -
   header, flavour, facts, forms, stats - which said everything mattered the
   same amount. It does not: FORMS is why this dialog gets opened. The marks on
   a Dex tile tell you that you hold a Holo of something; only this says what
   that Holo looks like and which three you are still missing, and in a game
   about collecting variants that is the content. So it sits directly under the
   name, and the dex text and the measurements follow as the reference material
   they are.

   The six base-stat bars are gone. Nothing in this game reads `stats` - there
   is no battling - so they were six rows of precise numbers that could not
   affect a single decision, and they were the largest block on the card. */

import { useEffect, useState } from "react";
import { useModalLock, useDismiss } from "./modal.js";
import { SPECIES } from "../data/dex.js";
import { label } from "../game/map.js";
import Sprite, { spriteUrl, VariantFx } from "./Sprite.jsx";
import {
  foundIn, howOften, speciesById, hasOrigin, areaOpen, BIOMES,
} from "../game/biomes.js";
import { EVOLUTIONS } from "../data/evolutions.js";
import Mark from "./Marks.jsx";

/* Kindest first, so the row reads as progress toward the rarest. Origin and
   Holo share odds; Origin sits first because its tell is the drawing itself,
   which is the easier of the two to recognise cold. */
const VARIANTS = [
  [null, "Ordinary", "the sprite everyone meets"],
  ["origin", "Origin", "the 1996 artwork"],
  ["holo", "Holo", "pressed in foil"],
  ["shiny", "Shiny", "the alternate palette"],
  ["astral", "Astral", "made of starlight"],
];

/* Where this one turns up, in a sentence a player can act on.

   Ordered by what is actually useful: a wild table beats a rod beats an
   evolution, because "go to Rock Ridge" is a thing you can do now and "evolve
   a Machoke" is a thing you can do once you already have one.

   The evolution fallback matters more than it looks: 51 of the 151 are in no
   table at all - every second-stage and third-stage Pokemon - and for those
   the old sheet said nothing whatsoever, on exactly the entries a player is
   most likely to open wondering where it is. */
function whereToFind(id) {
  const { legendary, areas, rods } = foundIn(id);
  if (legendary) {
    return [{ key: "legend", where: "Anywhere", how: "vanishingly rare" }];
  }

  /* `from` is the level an evolved form starts turning up at. Printed, because
     a sheet that says "Deep Woods · rare" for a Venusaur to a Lv 3 trainer is
     sending them somewhere nothing will happen. */
  const out = areas.map((a) => ({
    key: a.id,
    // The biome id, which is what makes a row a PLACE rather than a sentence -
    // a rod row and an "evolve X" row are neither, and must not offer to go.
    area: a.id,
    where: a.name,
    how: a.from ? `${howOften(a.share)} · Lv ${a.from}+` : howOften(a.share),
  }));
  for (const rod of rods) out.push({ key: rod, where: "Any water", how: rod });

  if (!out.length) {
    const from = EVOLUTIONS.filter((r) => r.to === id);
    for (const row of from) {
      out.push({
        key: `evo-${row.from}`,
        where: `Evolve ${label(speciesById(row.from))}`,
        how: row.kind === "level" ? `at Lv ${row.level}`
          : row.kind === "stone" ? "with a stone" : "by trade",
      });
    }
  }
  return out;
}

/* AND IT TAKES YOU THERE. This panel answered "where do I find one" and then
   made you close it, open MAP, and find the same name in a second list - which
   is the whole journey the answer was supposed to save you.

   `areaOpen` is the single answer to whether a map is reachable and it is asked
   here for the same reason the Travel panel asks it: an offer the engine will
   refuse is worse than no offer. A locked row prints the level it opens at
   instead, and stays a plain row rather than a dead button.

   Rows that are not places - a rod, an "evolve Bulbasaur" - never become
   buttons at all: `area` is what says a row IS somewhere. */
function Where({ id, level = 1, busy = false, here = null, onTravel = null }) {
  const rows = whereToFind(id);
  if (!rows.length) return null;
  return (
    <div className="sheet-where">
      <div className="sw-head">WHERE TO LOOK</div>
      <ul>
        {rows.map((r) => {
          const open = r.area ? areaOpen(r.area, level) : false;
          const go = r.area && onTravel && open && r.area !== here && !busy;
          const shut = r.area && !open;
          return (
            <li key={r.key} className={go ? "sw-go" : ""}>
              {go ? (
                <button type="button" onClick={() => onTravel(r.area)}>
                  {r.where}
                  <i aria-hidden="true">›</i>
                </button>
              ) : (
                <span>{r.where}</span>
              )}
              <em>
                {r.area === here ? "you are here"
                  : shut ? `opens at Lv ${BIOMES.find((b) => b.id === r.area)?.level}`
                    : r.how}
              </em>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function DexSheet({
  id, state, variant = null, held = {}, originLocked = false, owned = 0,
  level = 1, here = null, busy = false,
  onClose, onFindInBox, onTravel,
}) {
  const sp = speciesById(id);
  const caught = state === 2;
  const seen = state >= 1;
  /* Which of the four you actually hold. The ordinary one is simply "caught";
     the rest come from their own dex arrays. */
  const got = (t) => (t === null ? caught : !!held[t]);
  /* Only the forms this species can have. A Sinnoh entry drops the Origin
     column entirely rather than showing a silhouette nobody can ever fill:
     a slot that cannot be earned reads as a bug in the collection. */
  const forms = VARIANTS.filter(([t]) => t === null || t !== "origin" || hasOrigin(id));
  const every = forms.every(([t]) => got(t));

  /* WHICH FORM THE PORTRAIT IS SHOWING. It was fixed at the rarest one held,
     which is the right thing to OPEN on and the wrong thing to be stuck with:
     the strip below is where you go to see what a variant looks like, and the
     portrait is the biggest this entry ever draws the creature - so picking a
     form there and having the big picture ignore you is the whole strip's
     point missed. Held forms only; a silhouette is not something to promote.

     Keyed on `id` so opening a different entry starts from its own rarest
     again rather than remembering a tier the new one may not even have. */
  const [picked, setPicked] = useState(variant);
  useEffect(() => { setPicked(variant); }, [id, variant]);
  const shown = got(picked) ? picked : variant;

  useModalLock();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div
        className="sheet-card"
        role="dialog"
        aria-modal="true"
        aria-label={seen ? label(sp) : `Unknown Pokémon number ${id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-top">
          {/* The rarest one you have registered claims the entry's portrait:
              the dex should show you the one you actually own. */}
          <span className={`sheet-portrait${caught ? "" : " locked"}`}>
            {/* `shown` rather than `variant`: the strip below can change it.

                THE IMAGE IS NOT KEYED AND THE LAYER IS, and they must not share
                a key. Both carried `key={shown}` at first - two SIBLINGS with
                the same key, which is a duplicate in React's implicit child
                array, and it stopped reconciling them: swapping the form left
                the old `<img>` mounted next to the new one, two 108px pictures
                stacked in a 108px box, the second spilling out over the FORMS
                strip below. Reported as the preview not changing, which is what
                it looks like when the stale one is on top.

                Only the LAYER needs remounting - a CSS animation does not
                restart on a prop change, so a foil carrying on mid-sweep reads
                as the picture not having changed. An `<img>` needs nothing: a
                new `src` is the whole update. */}
            <Sprite
              id={id}
              variant={caught ? shown : null}
              className={`sheet-art${caught ? "" : " locked"}`}
            />
            {/* The portrait is the biggest the entry ever draws this Pokemon,
                so it is the worst place for the treatment to be missing. */}
            {caught && <VariantFx key={`fx-${shown ?? "plain"}`} id={id} variant={shown} />}
          </span>
          <div>
            <div className="sheet-no">#{String(id).padStart(3, "0")}</div>
            <h3 className="sheet-name">{seen ? label(sp) : "???"}</h3>
            {seen ? (
              <>
                <div className="sheet-genus">{caught ? sp.genus : "Seen, not caught"}</div>
                <div className="sheet-types">
                  {sp.types.map((t) => (
                    <span key={t} className={`type t-${t}`}>{t.toUpperCase()}</span>
                  ))}
                </div>
              </>
            ) : (
              <div className="sheet-genus">No data recorded</div>
            )}
          </div>
        </div>

        {caught ? (
          <>
            {/* Every form this species comes in, and which you have. It is the
                question the tile's marks raise and could not answer: a mark
                says "you have a shiny", this says what a shiny of THIS one
                actually looks like - and shows the three you have not got as
                silhouettes, so it doubles as the thing to go hunting for. */}
            <div className="sheet-forms">
              <div className="sf-head">
                <span>FORMS</span>
                {every && (
                  <span className="sf-all">
                    <Mark tier="complete" size={16} /> COMPLETE
                  </span>
                )}
              </div>
              <div className="sf-row">
                {forms.map(([t, name, blurb]) => (
                  /* A held form is a BUTTON - it promotes itself to the
                     portrait. One you have not got stays a plain div: there is
                     nothing to show, and a control that does nothing is worse
                     than no control. */
                  <div
                    key={name}
                    className={`sf-one${got(t) ? " got" : ""}${
                      got(t) && t === shown ? " picked" : ""}`}
                    {...(got(t) ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-pressed": t === shown,
                      "aria-label": `Show the ${name} ${label(sp)}`,
                      onClick: () => setPicked(t),
                      onKeyDown: (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setPicked(t);
                        }
                      },
                    } : {})}
                  >
                    <div className="sf-art">
                      {/* This strip is where someone comes to SEE what a
                          variant looks like, so every tier gets its real
                          treatment rather than the filter on its own. It was a
                          hand-rolled copy of the foil for Holo only - the same
                          duplicated-constant shape that lost Astral its art in
                          the evolution scene. `VariantFx` is the one list. */}
                      <Sprite id={id} variant={t} alt={`${name} ${label(sp)}`} />
                      <VariantFx id={id} variant={t} />
                      {t && <Mark tier={t} size={12} className="sf-badge" />}
                    </div>
                    <span className="sf-name">{name}</span>
                    {/* A locked Origin is not "not yet" - it is not out there
                        at all, and telling someone to keep hunting for one is
                        telling them to waste an afternoon. */}
                    <span className="sf-note">
                      {got(t) ? blurb
                        : t === "origin" && originLocked ? "finish the dex"
                          : "not yet"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Shown whether or not it is caught - see the `seen` branch
                below, which shows it too. An entry you have never filled in is
                exactly the one that needs to say where to go. */}
            <Where
              id={id}
              level={level}
              here={here}
              busy={busy}
              onTravel={onTravel}
            />

            <p className="sheet-flavor">{sp.flavor}</p>

            <dl className="sheet-facts">
              <div className="fact">
                <dt>HEIGHT</dt>
                <dd>{(sp.height / 10).toFixed(1)} m</dd>
              </div>
              <div className="fact">
                <dt>WEIGHT</dt>
                <dd>{(sp.weight / 10).toFixed(1)} kg</dd>
              </div>
              <div className="fact">
                <dt>CATCH RATE</dt>
                <dd>{sp.rate}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <p className="sheet-locked">
              {seen
                ? "CATCH ONE TO FILL IN THIS ENTRY"
                : "NOT YET ENCOUNTERED"}
            </p>
            {/* The whole point. A silhouette with no information is a locked
                door; a silhouette that tells you which map to walk is a lead. */}
            <Where
              id={id}
              level={level}
              here={here}
              busy={busy}
              onTravel={onTravel}
            />
          </>
        )}

        <div className="sheet-actions">
          {/* Only when you actually hold one. A button that jumps to an empty
              search is worse than no button: it answers "where is mine" with a
              blank list, which reads as a broken filter rather than as "you do
              not have one". The entry already says whether it is caught. */}
          {owned > 0 && onFindInBox && (
            <button
              className="sheet-inbox"
              onClick={() => onFindInBox(id)}
              data-tip={`Find your ${owned > 1 ? `${owned} ` : ""}${label(sp)} in the Box`}
            >
              SEE IN BOX{owned > 1 ? ` · ${owned}` : ""}
            </button>
          )}
          <button className="sheet-close" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}
