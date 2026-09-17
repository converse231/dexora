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

const FOLDER = { shiny: "shiny/", origin: "origin/" };

/* SHOWDOWN IS THE ONE PICTURE THIS GAME DOES NOT SHIP, and that was measured
   rather than chosen.

   It is a real animated GIF - the creature genuinely moves, which no filter
   can do - and PokeAPI has one for about 1,005 of the dex. They average 67KB.
   The whole of `public/sprites` is 8.9MB today; bundling these would make it
   75MB, in the repo and in every deploy. Re-encoding them at 64px makes them
   BIGGER (77KB), because a naive pass loses the frame diffing the originals
   already have and there is no gifsicle here to do it properly.

   So they are fetched from PokeAPI's own CDN. That is a runtime dependency
   this project otherwise does not have, and it is affordable for exactly one
   reason: Showdown is the RAREST tier at 1/700, so a whole playthrough loads
   a handful. `onSpriteError` below is the other half - a blocked or dead CDN
   degrades to the ordinary sprite rather than to a broken-image icon, so the
   worst case is a Pokemon that looks normal instead of one that looks wrong. */
const SHOWDOWN_CDN =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/";

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
  (variant === "showdown"
    ? `${SHOWDOWN_CDN}${id}.gif`
    : new URL(`sprites/${FOLDER[variant] ?? ""}${id}.png`, document.baseURI).href);

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
