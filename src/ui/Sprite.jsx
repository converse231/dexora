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

const FOLDER = { shiny: "shiny/", origin: "origin/", showdown: "showdown/", cadence: "cadence/" };
/* THE TIERS THAT ARE A STRIP RATHER THAN A PICTURE. They share one class,
   `.sprite-strip`, because every container that draws a Pokemon has to SIZE
   them (a span has no intrinsic size and renders zero wide) - and that was
   24 rules naming `.sprite-showdown` by the time there were two of them.
   One hook means a third strip tier costs no CSS at all. */
export const STRIP_TIERS = new Set(["showdown", "cadence"]);

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

/* A POKEMON FROM BEHIND, for your side of a League battle - the one place a
   back path is derived (docs/battles.md, *Data model*). Shiny has back art of
   its own; every tier drawn as a filter wears the ordinary back under the same
   `sprite-<tier>` class. Origin (the 1996 art) and Showdown (a strip) have no
   back, so this answers null and the caller draws the front, flipped. */
const NO_BACK = new Set(["origin", "showdown", "cadence"]);
export const backUrl = (id, variant = null) => (NO_BACK.has(variant) ? null
  : new URL(`sprites/back/${variant === "shiny" ? "shiny/" : ""}${id}.png`, document.baseURI).href);

/* WARM THE CACHE WITH WHAT THIS MAP CAN THROW AT YOU. An encounter's sprite
   was fetched only when the battle mounted it - on a phone, the Pokemon's
   slot sat empty for most of a second, and a quick throw could catch it
   before it was ever drawn. A map's table is a few hundred plain sprites of
   about 1KB each, fetched in idle time a handful at a time so a walk never
   waits on it, and each URL once per page. Variants are not guessed (twelve
   tiers, rolled at 1 in 150+); the battle asks for those eagerly.
   The Images are KEPT: the host answers `no-cache` (Vite and Vercel both
   revalidate), and a dropped one left the battle's <img> waiting on a round
   trip anyway - measured, 1 in 8 drawn at 150ms. A live Image holds the
   page's copy, which the next <img> of that URL takes without asking. */
const warmed = new Map();
export function preloadSprites(ids) {
  const queue = ids.filter((id) => !warmed.has(id));
  if (!queue.length) return () => {};
  const idle = window.requestIdleCallback ?? ((f) => setTimeout(f, 200));
  const stop = window.cancelIdleCallback ?? clearTimeout;
  let handle = 0;
  const batch = () => {
    for (const id of queue.splice(0, 12)) {
      const img = new Image();
      img.src = spriteUrl(id);
      warmed.set(id, img);
    }
    if (queue.length) handle = idle(batch);
  };
  handle = idle(batch);
  return () => stop(handle);
}

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
  /* GLITCHED IS FOUR LAYERS, and it used to be none.

     The tier was written as one animated `filter` on the sprite, and the
     filter half of it never ran: `.sprite-glitched` sets `filter` with
     `!important` (it has to - see styles.css) and an important declaration
     outranks an animation, so every channel-split keyframe was discarded and
     only the `transform` jitter survived. Reported as "it just shakes", which
     is exactly what is left of a glitch when you delete its colour.

     So the split is two SILHOUETTES behind the sprite, offset in opposite
     directions during the burst - which is what `drop-shadow` was drawing
     anyway, and it cannot be outranked because nothing else on the element
     wants those properties. The tears and the noise blocks are the other two
     and were simply never ported.

     All four are masked to `--art`, the sprite's own PNG: unmasked they are
     rectangles of static over the grass rather than damage to the creature. */
  if (variant === "glitched") {
    const url = `url(${art ?? spriteUrl(id)})`;
    return (
      <>
        <span className="glitch-ghost red" style={{ "--art": url }} aria-hidden="true" />
        <span className="glitch-ghost cyan" style={{ "--art": url }} aria-hidden="true" />
        <span className="glitch-tear" style={{ "--art": url }} aria-hidden="true" />
        <span className="glitch-blocks" style={{ "--art": url }} aria-hidden="true" />
      </>
    );
  }
  if (variant === "astral") return <span className="astral-aura" aria-hidden="true" />;
  /* THE FOUR THAT JOINED TOGETHER (Gold, Shadow, Chaotic, Projection), each a
     filter that carries the tier on a bare `<img>` plus the layers here, which
     are the MOTION. Designed in the Variant Lab and cut down for the Dex grid,
     where forty of them can be on screen: a handful of elements each, moving
     transform and opacity only, and nothing that animates the sprite itself
     (`.mon`'s appear and absorb own its animation). `--art` is the jar for a
     coloured honey, as with the foil. */
  /* THE TREASURE SET: one layer each, where Gold needs two. The filter is
     already carrying the colour, so each of these only has to carry the one
     idea of motion that tells it from its neighbours. Masked to `--art` like
     the rest, or they are rectangles of light over the grass. */
  if (variant === "platinum" || variant === "diamond" || variant === "emerald") {
    const url = `url(${art ?? spriteUrl(id)})`;
    if (variant === "platinum") {
      return <span className="plat-sweep" style={{ "--art": url }} aria-hidden="true"><i /></span>;
    }
    if (variant === "emerald") {
      /* Two layers, and the second is the point: `em-rad` is UNMASKED and sits
         behind the creature, so the light leaves the stone instead of being
         clipped to it. Masked, it would be a highlight. */
      return (
        <>
          <span className="em-rad" aria-hidden="true"><i /></span>
          <span className="em-depth" style={{ "--art": url }} aria-hidden="true"><i /></span>
          <span className="em-glint" aria-hidden="true"><i /><i /><i /><i /></span>
        </>
      );
    }
    // Diamond's prism split is in the filter; these are the glints.
    return <span className="dia-fire" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>;
  }
  if (variant === "gold" || variant === "chaotic" || variant === "projection" || variant === "shadow") {
    const url = `url(${art ?? spriteUrl(id)})`;
    if (variant === "gold") {
      return (
        <>
          <span className="gold-shine" style={{ "--art": url }} aria-hidden="true"><i /></span>
          <span className="gold-glint" aria-hidden="true"><i /><i /><i /></span>
        </>
      );
    }
    if (variant === "shadow") {
      return (
        <>
          <span className="shadow-aura" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="shadow-aura front" aria-hidden="true"><i /><i /></span>
        </>
      );
    }
    if (variant === "chaotic") {
      /* A red-and-black aura pulsing out of it, and the black-and-yellow
         negative is the glitch: a difference layer masked to the creature,
         and one slice of it torn sideways for a frame. The aura replaced a
         spinning vortex and four orbiting stones, which read as something
         circling the Pokemon rather than energy coming out of it. */
      return (
        <>
          <span className="chaos-aura" style={{ "--art": url }} aria-hidden="true"><i /><i /><i /></span>
          <span className="chaos-neg" style={{ "--art": url }} aria-hidden="true" />
          <span className="chaos-cut" style={{ "--art": url }} aria-hidden="true" />
        </>
      );
    }
    return (
      <>
        <span className="proj-beam" aria-hidden="true" />
        <span className="proj-base" aria-hidden="true" />
        <span className="proj-lines" style={{ "--art": url }} aria-hidden="true"><i /></span>
      </>
    );
  }
  if (variant === "shiny") {
    return (
      <span className="shiny-spark" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </span>
    );
  }
  /* CADENCE'S BREATH. The waking is the entrance and a Dex tile has no
     entrance, so without this the tier is "a sprite that moves" in exactly
     the place Showdown already is. One masked bloom low on the body, on the
     breath's own clock - opacity and transform only, because forty of these
     animate at once on a Dex sheet. */
  if (variant === "cadence") {
    return (
      <span
        className="cad-breath"
        style={{ "--art": `url(${art ?? spriteUrl(id)})` }}
        aria-hidden="true"
      />
    );
  }
  return null;
}

/* THE ENTRANCE, WHICH IS A DIFFERENT JOB FROM THE IDLE.

   `VariantFx` is the layer a tier WEARS - the foil travelling, the aura
   breathing - and it runs forever, which is exactly why it cannot also be the
   thing that says "this one is special". A treatment you have been looking at
   for four seconds is scenery. Origin had a real entrance (`origin-fx`: the
   creature restoring itself out of its own silhouette) and the other seven had
   none at all, so a Glitched Pikachu arrived exactly like an ordinary one and
   you found out by reading the chip on the nameplate.

   ONE MECHANISM, FOUR MOTIONS, A COLOUR EACH - not eight bespoke animations.
   The motion says what KIND of rare it is, which is the distinction the whole
   ladder is built on:

     burst    something added   - Vivid's palette, Shiny's sparks
     implode  something drawn in - Astral's starlight, Noir's colour draining
     scan     something passing over - Holo's foil, Showdown's signal
     tear     something broken  - Glitched, and only Glitched

   Origin keeps `origin-fx` and gets nothing here: it already has the best
   entrance in the game and two would fight.

   It plays ONCE. The element is keyed on the encounter, so React mounts it
   fresh per Pokemon and never restarts it on the re-render every step causes -
   the same reason `e.ate` counts instead of flagging, from the other side. */
const REVEAL = {
  vivid: "burst", shiny: "burst",
  astral: "implode", noir: "implode",
  holo: "scan", showdown: "scan",
  /* Cadence gets NONE, for Origin's reason: its entrance is already the thing
     it is for - it arrives frozen like every ordinary sprite and then wakes -
     and a reveal firing over that would step on the one beat that sells it. */
  glitched: "tear",
  gold: "burst", shadow: "implode", chaotic: "tear", projection: "scan",
};

/* THE TIERS THE BATTLE DRAWS THROUGH `VariantFx`. The older four (Shiny,
   Holo, Astral, Origin) are hand-rolled in Encounter.jsx and predate the
   component; everything since goes through it, so a battle and a Box row can
   never draw one tier two ways. */
export const SCENE_FX = new Set(["glitched", "gold", "shadow", "chaotic", "projection", "cadence",
  "platinum", "diamond", "emerald"]);

export function TierReveal({ id, variant }) {
  const motion = REVEAL[variant];
  if (!motion) return null;
  return (
    <span
      className={`tv tv-${motion} tv-${variant}`}
      style={{ "--art": `url(${spriteUrl(id, variant)})` }}
      aria-hidden="true"
    >
      <b className="tv-flash" />
      <b className="tv-ring" />
      <i /><i /><i /><i /><i /><i />
    </span>
  );
}

/* `fx` wraps the image so the layers have something to be absolute inside.
   Off by default, because the wrapper changes the DOM shape and every existing
   caller is laid out against a bare `<img>`. */
export default function Sprite({
  id, variant = null, className = "", alt = "", fx = false, eager = false,
}) {
  /* Lazy is right for a Box of hundreds; the battle's one Pokemon is the
     point of the screen and must not wait for layout to be asked for. */
  const load = eager ? { loading: "eager", fetchpriority: "high" } : { loading: "lazy" };
  /* THE TIERS THAT ARE NOT IMAGES. A strip in an `<img>` is eight creatures
     stacked in a column, so these have to be a box with a background - and it
     goes BEFORE the `fx` branch, because `VariantFx` returns null for a strip
     tier anyway and wrapping it twice would only nest two boxes.

     CADENCE WEARS ITS OWN LAYER ON TOP (the breath), so it is the one strip
     tier that still wants `sprite-fx` around it when a caller asks for fx. */
  if (STRIP_TIERS.has(variant)) {
    /* A strip tier that has a layer of its own (`SCENE_FX`) takes the `fx`
       wrapper, so the layer has something to be absolute inside; one without
       stays a bare span. Read off the SET rather than typed twice as
       `variant === "cadence"`, which is the thing `STRIP_TIERS` exists to
       avoid - a second such tier would otherwise need two more edits. */
    const wrap = fx && SCENE_FX.has(variant);
    const strip = (
      <span
        className={`sprite-strip sprite-${variant} ${wrap ? "" : className}`.trim()}
        style={{ "--strip": `url(${spriteUrl(id, variant)})` }}
        role="img"
        aria-label={alt}
      />
    );
    if (!wrap) return strip;
    return (
      <span className={`sprite-fx ${className}`.trim()}>
        {strip}
        <VariantFx id={id} variant={variant} />
      </span>
    );
  }
  if (fx && variant) {
    return (
      <span className={`sprite-fx ${className}`.trim()}>
        <img
          className={variant ? `sprite-${variant}` : ""}
          src={spriteUrl(id, variant)}
          alt={alt}
          {...load}
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
      {...load}
      data-plain={id}
      onError={onSpriteError}
    />
  );
}

/* THE TRAINER, OUT OF THE ONE STRIP - and a component because the URL has to
   be built in JS.

   It was `background-image: url("tilesets/player.png")` in styles.css, and
   that never loaded in either place: a relative url() in a stylesheet resolves
   against the STYLESHEET, so it asked the dev server for
   `/src/tilesets/player.png` (which answers index.html as text/html) and a
   build for `dist/assets/tilesets/player.png` (which does not exist). Reported
   as the boy and girl not showing on onboarding, and invisible until then
   because a background that 404s simply draws nothing and the span is
   `aria-hidden`.

   Exactly the trap `spriteUrl` above documents, and the one the `--ground`
   comment warns about by name thirteen hundred lines earlier in the same
   stylesheet. `public/` is copied verbatim and is never resolved by Vite, so
   the only correct form is absolute against `document.baseURI` - built here,
   because the CSS cannot build it and three call sites each doing it is how
   this repo lost an Astral evolution to a duplicated constant.

   The class stays on the element: `--z` is set by whoever is hosting it
   (`.set-face .gate-art` runs at 2, the pickers at 3) and the row offset is
   the character's own, so both belong to the stylesheet. Only the URL comes
   from here. */
export function TrainerArt({ char, className = "" }) {
  return (
    <span
      className={`gate-art ch-${char} ${className}`.trim()}
      style={{ "--trainer": `url(${new URL("tilesets/player.png", document.baseURI).href})` }}
      aria-hidden="true"
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
/* A world event's icon (`tools/build_events.py`), built against the page for
   the reason every asset here is - see `spriteUrl`. */
export const eventIcon = (id) => new URL(`events/${id}.png`, document.baseURI).href;

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
