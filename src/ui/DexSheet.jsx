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
import Sprite, { spriteUrl } from "./Sprite.jsx";
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

export default function DexSheet({
  id, state, variant = null, held = {}, originLocked = false, onClose,
}) {
  const sp = SPECIES[id - 1];
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
          <Sprite
            id={id}
            variant={caught ? variant : null}
            className={`sheet-art${caught ? "" : " locked"}`}
          />
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
                      <Sprite id={id} variant={t} alt={`${name} ${label(sp)}`} />
                      {/* Holo is the one tier whose tell does not survive as a
                          bare <img> - the sheen is a second layer. This strip
                          is where someone comes to SEE what a variant looks
                          like, so it gets the real thing rather than the
                          filter on its own. */}
                      {t === "holo" && (
                        <span
                          className="holo-foil"
                          style={{ "--art": `url(${spriteUrl(id)})` }}
                          aria-hidden="true"
                        />
                      )}
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
          <p className="sheet-locked">
            {seen
              ? "CATCH ONE TO FILL IN THIS ENTRY"
              : "NOT YET ENCOUNTERED"}
          </p>
        )}

        <button className="sheet-close" onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}
