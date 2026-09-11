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

const FOLDER = { shiny: "shiny/", origin: "origin/" };

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

export default function Sprite({ id, variant = null, className = "", alt = "" }) {
  return (
    <img
      className={`${variant ? `sprite-${variant} ` : ""}${className}`.trim()}
      src={spriteUrl(id, variant)}
      alt={alt}
      loading="lazy"
    />
  );
}
