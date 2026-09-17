/* A Pokémon sprite, in whichever art it should be wearing.

   Two sets of art plus the plain one: the FireRed sprite, its shiny palette,
   and — for an **Origin** —
   the Generation I sprite, the 1996 artwork from before anyone had drawn it a
   second time. One component rather than the same ternary in five files: the
   day a fourth set exists this is the only place that has to learn about it.

   **Astral and Holo have no folder.** Neither is about artwork: Astral changes
   what the creature is made of and Holo changes the finish over it, so both
   wear the ordinary sprite and are told apart by CSS — which is why they fall
   through to `""` here rather than needing an entry. Two tiers out of four now
   depend on that fall-through, so it is behaviour, not an omission.

   `variant` is the single word the engine already decided ("origin", "shiny",
   "holo", "astral" or nothing), so no screen re-derives it and none can
   disagree.

   The Origin sprites are reframed at build time to sit in the same box as the
   ordinary ones — see tools/build_origin.py, and the reason that file exists.

   `loading="lazy"` on all of them: the Dex grid alone is 151 images and only a
   screenful is ever visible. */

import { artOf } from "../game/items.js";

const FOLDER = { shiny: "shiny/", origin: "origin/", showdown: "showdown/" };

/* SHOWDOWN SHIPS NOW, AS AN EIGHT-FRAME STRIP.

   It used to be fetched from PokeAPI's CDN at runtime, and that showed twice:
   it loaded visibly late, and it was drawn at whatever size the source GIF
   happened to be - so a Showdown Amaura towered over every other sprite and
   blurred when the layout scaled it down. Both reported from play.

   `tools/build_showdown.py` carries the measurement that chose the format.
   The short version: the raw GIFs are 78.6 MB over the dex, lossless animated
   WebP is 35.9 MB and APNG 37.0 MB, and one PNG holding all eight frames is
   **7.5 MB** - because a single PNG is one zlib stream over one palette and
   eight frames of the same creature are nearly the same bytes, which per-frame
   formats cannot exploit. Against the 8.9 MB `public/sprites` already ships,
   that is affordable, and it buys the runtime dependency away entirely.

   THE COST IS THAT A STRIP IS NOT AN `<img>`. This file's own rule - a tier's
   look must survive as a bare `<img>` - is about the tiers that are a CSS
   treatment, and it still holds for all seven of them. Showdown is real
   artwork that MOVES, so it renders as a span with the strip as a background
   and `steps()` walking it, which is the same mechanism the ball throw has
   used since it was written. `.sprite-showdown` has to be sized wherever an
   `img` was, which is why two rules in styles.css name it alongside `img`. */
export const onSpriteError = (ev) => {
  const img = ev.currentTarget;
  if (img.dataset.fellBack) return;      // never loop on a second failure
  img.dataset.fellBack = "1";
  img.src = new URL(`sprites/${img.dataset.plain}.png`, document.baseURI).href;
};

/* The same path as a bare string, for the one thing that needs it: an effect
   layer masked to the sprite's own outline. `mask-image: var(--art)` is how the
   Origin reveal gets a silhouette and a gleam that follow the creature's shape
   instead of a rectangle over it — and it has to be the *same* URL the <img>
   uses, or the two are different pictures.

   **It has to be ABSOLUTE, and that is not tidiness.** A relative `url()` inside
   a custom property is resolved against the stylesheet that CONSUMES it, not
   the element that declares it. `--art` is declared inline on a React element
   and consumed by a rule in `styles.css`, so `sprites/54.png` was being fetched
   from wherever that stylesheet happens to live: `/src/sprites/54.png` under
   the dev server and `/assets/sprites/54.png` in a build. Both 404, silently -
   a mask that cannot load simply masks nothing, so the Astral star field and
   the ENTIRE Origin reveal (ghost, gleam and all) had never once drawn in the
   real app. It was only ever seen in a harness whose stylesheet sat beside the
   sprites. Measured by logging the requests, not reasoned about.

   `document.baseURI` rather than a leading slash, because `vite.config.js` sets
   `base: "./"` so a build can be opened from any path. */
export const spriteUrl = (id, variant = null) =>
  new URL(`sprites/${FOLDER[variant] ?? ""}${id}.png`, document.baseURI).href;

/* THE MOVING HALF OF A TIER, as one component.

   THREE of the eight tiers are nothing but artwork - Origin's 1996 sprite,
   Shiny's palette, and Showdown, which is an animated GIF and therefore the
   only tier that moves without a layer at all. Three more are a bare filter
   (Glitched, Vivid, Noir). Only Holo and Astral need something hung beside
   the image: Holo's foil travels, Astral's aura breathes.
   Shiny gets its sparks here too - the palette alone is a few pixels of hue and
   is the one tier people miss.

   These existed ONLY in the encounter, plus a hand-rolled copy of the foil in
   the Dex's FORMS strip. So the Box showed a Holo Nidoqueen as a still picture
   with a filter on it, and the moment an evolution finished the animation
   stopped - which is exactly what it looked like: "it has the filters but the
   animation stops working". One component now, used by every screen that has
   somewhere to hang a layer.

   A Dex GRID cell still gets nothing, and that is deliberate rather than
   forgotten: it is one `<img>` in a four-column grid with no container, which
   is why a tier's identity has to survive `filter` alone in the first place. */
export function VariantFx({ id, variant, art = null }) {
  if (variant === "holo") {
    return (
      <span
        className="holo-foil"
        /* `art` overrides the species sprite, and the only thing that uses it
           is a coloured honey: the foil has to follow the honey JAR's outline
           there, not a Pokemon's. Same layer, same animation, different mask. */
        style={{ "--art": `url(${art ?? spriteUrl(id)})` }}
        aria-hidden="true"
      />
    );
  }
  if (variant === "astral") return <span className="astral-aura" aria-hidden="true" />;
  if (variant === "shiny") {
    return (
      <span className="shiny-spark" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </span>
    );
  }
  return null;
}

/* `fx` wraps the image so the layers have something to be absolute inside.
   Off by default, because the wrapper changes the DOM shape and every existing
   caller is laid out against a bare `<img>`. */
export default function Sprite({
  id, variant = null, className = "", alt = "", fx = false,
}) {
  /* THE ONE TIER THAT IS NOT AN IMAGE. A strip in an `<img>` is eight
     creatures stacked in a column, so this has to be a box with a background
     - and it goes BEFORE the `fx` branch, because `VariantFx` returns null for
     Showdown anyway and wrapping it twice would only nest two boxes. */
  if (variant === "showdown") {
    return (
      <span
        className={`sprite-showdown ${className}`.trim()}
        style={{ "--strip": `url(${spriteUrl(id, "showdown")})` }}
        role="img"
        aria-label={alt}
      />
    );
  }
  if (fx && variant) {
    return (
      <span className={`sprite-fx ${className}`.trim()}>
        <img
          className={variant ? `sprite-${variant}` : ""}
          src={spriteUrl(id, variant)}
          alt={alt}
          loading="lazy"
          data-plain={id}
          onError={onSpriteError}
        />
        <VariantFx id={id} variant={variant} />
      </span>
    );
  }
  return (
    <img
      className={`${variant ? `sprite-${variant} ` : ""}${className}`.trim()}
      src={spriteUrl(id, variant)}
      alt={alt}
      loading="lazy"
      data-plain={id}
      onError={onSpriteError}
    />
  );
}

/* AN ITEM'S ICON, WEARING ITS TIER IF IT HAS ONE.

   Three screens draw one - the shop shelf, the floating rail and the on-screen
   effect readout - and the coloured honeys are the reason this is a component
   rather than an `<img>` in each of them. A Holo Honey has no art of its own
   and is not supposed to: it is the honey jar with the same foil travelling
   over it that a Holo Pokemon wears, which is exactly what the item means and
   costs nothing to draw. `artOf` is what knows they share one picture, so no
   screen has to.

   An item with no `tier` stays a bare `<img>`, because that is what every
   other item is and a wrapper it does not need would change its layout. */
export function ItemIcon({ item, className = "" }) {
  const url = new URL(`items/${artOf(item)}.png`, document.baseURI).href;
  if (!item?.tier) {
    return <img className={className} src={url} alt="" />;
  }
  return (
    <span className={`sprite-fx item-fx ${className}`.trim()}>
      <img className={`sprite-${item.tier}`} src={url} alt="" />
      <VariantFx variant={item.tier} art={url} />
    </span>
  );
}
