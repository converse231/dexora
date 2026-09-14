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

import { useEffect } from "react";
import { useModalLock } from "./modal.js";
import { SPECIES } from "../data/species.js";
import { label } from "../game/map.js";
import Sprite, { spriteUrl, VariantFx } from "./Sprite.jsx";
import { foundIn, howOften, speciesById } from "../game/biomes.js";
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

function Where({ id }) {
  const rows = whereToFind(id);
  if (!rows.length) return null;
  return (
    <div className="sheet-where">
      <div className="sw-head">WHERE TO LOOK</div>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <span>{r.where}</span>
            <em>{r.how}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DexSheet({
  id, state, variant = null, held = {}, originLocked = false, onClose,
}) {
  const sp = speciesById(id);
  const caught = state === 2;
  const seen = state >= 1;
  /* Which of the four you actually hold. The ordinary one is simply "caught";
     the rest come from their own dex arrays. */
  const got = (t) => (t === null ? caught : !!held[t]);
  const every = VARIANTS.every(([t]) => got(t));

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
    <div className="sheet" onClick={onClose}>
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
            <Sprite
              id={id}
              variant={caught ? variant : null}
              className={`sheet-art${caught ? "" : " locked"}`}
            />
            {/* The portrait is the biggest the entry ever draws this Pokemon,
                so it is the worst place for the treatment to be missing. */}
            {caught && <VariantFx id={id} variant={variant} />}
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
                {VARIANTS.map(([t, name, blurb]) => (
                  <div key={name} className={`sf-one${got(t) ? " got" : ""}`}>
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
            <Where id={id} />

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
            <Where id={id} />
          </>
        )}

        <button className="sheet-close" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}
