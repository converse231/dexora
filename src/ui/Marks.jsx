/* The rarity badges - eight of them now - and the rosette, which wants any
   FOUR of whatever a species can wear rather than every one. See
   `ROSETTE_NEED`: at eight tiers "all of them" stopped being a hard mark and
   became an unreachable one.

   Drawn art rather than CSS shapes. They started as a ring, a star and a diamond
   built from `clip-path` and borders, which was defensible at 8px and stopped
   being so the moment the Dex tile grew — and the drawn set says things CSS
   cannot, like the ribbon on the rosette.

   `tools/build_marks.py` normalises them: every icon is 24px and fits its canvas
   by its longest SOLID side, so four of them in a row look like a set. They are
   shown at 12 or 24 — whole divisions, so `image-rendering: pixelated` has whole
   pixels to work with.

   One component so the alt text is written once. These are informative, not
   decorative: "shiny" is the whole reason a row exists, and a screen reader that
   reads out the number and not that is reading out the wrong half. */

const TIER_ART = {
  origin: { src: "marks/origin.png", name: "Origin" },
  shiny: { src: "marks/shiny.png", name: "Shiny" },
  holo: { src: "marks/holo.png", name: "Holo" },
  astral: { src: "marks/astral.png", name: "Astral" },
  glitched: { src: "marks/glitched.png", name: "Glitched" },
  vivid: { src: "marks/vivid.png", name: "Vivid" },
  noir: { src: "marks/noir.png", name: "Noir" },
  showdown: { src: "marks/showdown.png", name: "Showdown" },
  complete: { src: "marks/complete.png", name: "Every variant" },
  /* NOT A TIER, and it sits here anyway because it is the same object: a small
     drawn badge on a sprite, in the same set, at the same size. Legendary is a
     fact about the SPECIES rather than about the one in front of you - every
     other mark here is something you earned - so it never appears in a row of
     tier marks, only on its own. */
  legendary: { src: "marks/legendary.png", name: "Legendary" },
  // Not a tier either: a species whose research is finished. See research.js.
  research: { src: "marks/research.png", name: "Research complete" },
  // And not a tier: one oversized individual. See `rollAlpha`.
  alpha: { src: "marks/alpha.png", name: "Alpha" },
};

export default function Mark({ tier, size = 12, className = "", title }) {
  const art = TIER_ART[tier];
  if (!art) return null;
  return (
    <img
      className={`mark mark-${tier} ${className}`.trim()}
      src={art.src}
      /* Inline, not an attribute and not a class. A mark is dropped inside
         panels that already style their own images by descendant - `.cell img`
         is 88%, `.sf-art img` is 100% - and both of those beat an HTML width
         attribute, so the completion rosette rendered at the full size of the
         Dex tile it was meant to sit in the corner of. An inline style is the
         one thing a stylesheet rule cannot outrank. */
      style={{ width: size, height: size }}
      alt={art.name}
      data-tip={title ?? art.name}
    />
  );
}
