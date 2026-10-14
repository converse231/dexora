/* GENDER (2026-10-15, the late-game shortlist's gender-differences phase).
   Every Pokemon is male, female or neither, at its species' real ratio
   (`FEMALE_EIGHTHS`, npm run genders), and 38 species have a FEMALE LOOK -
   her own sprite - to collect. A look, never a strength: nothing in a battle
   or a roll reads it.

   DERIVED FROM THE SIZE, NEVER STORED. A box entry's `size` already rides
   every save and every trade (db/trading.sql keeps it as a column), so a
   gender hashed from species and size survives both with no new field, no
   server change, and an old save has genders the day it loads. Two of one
   species at one size share a gender; nobody can see that.

   ONLY WHERE THE ART MATCHES (your call, 2026-10-15): FireRed (1-386) drew no
   female art and HGSS's beside it was a different pose, so 1-386 carry a mark
   and no look. Browser-free, so check.mjs can bound it. */
import { FEMALE_EIGHTHS, FEMALE_ART, FEMALE_SHINY } from "../data/genders.js";
import { speciesById, sizeOf, SIZE_MIN, SIZE_MAX } from "./biomes.js";
import { hash, mix } from "./daily.js";

// A form and a look answer for their family's base: a Mega is its species.
const baseOf = (id) => {
  const sp = speciesById(id);
  return typeof sp?.of === "number" ? sp.of : id;
};

// Eighths of a species that are female; -1 genderless.
export const eighthsOf = (id) => FEMALE_EIGHTHS[baseOf(id)] ?? 4;

/* WHERE A SIZE SITS IN `rollSize`'s OWN SPREAD, 0-1 (its bucket's middle).
   Sizes bunch in the middle - two rolls averaged - so hashing the size
   itself left a species a few heavy buckets: a half-female one came out 24%
   female (measured over 807 species, 2026-10-15). The size's quantile is
   even by construction; offset per species, so no size is female for all. */
const tri = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t <= 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2);
function quantile(id, size) {
  // An alpha's size is outside the ordinary spread: hashed, it is rare anyway.
  if (size < SIZE_MIN || size > SIZE_MAX) return mix(hash(`${baseOf(id)}:${size}`)) / 2 ** 32;
  const span = SIZE_MAX - SIZE_MIN;
  const at = (tri((size - 0.5 - SIZE_MIN) / span) + tri((size + 0.5 - SIZE_MIN) / span)) / 2;
  return (at + mix(hash(String(baseOf(id)))) / 2 ** 32) % 1;
}

// "f", "m" or null (genderless) for a species at a size.
export function sexAt(id, size) {
  const e = eighthsOf(id);
  if (e < 0) return null;
  if (e === 0) return "m";
  if (e === 8) return "f";
  return quantile(id, size) < e / 8 ? "f" : "m";
}

// A box entry's gender - through `sizeOf`, so an entry with no stored size
// answers by its uid as its size does.
export const sexOf = (mon) => (mon ? sexAt(mon.species, sizeOf(mon)) : null);

// Whether this species has a female look (her own sprite), and whether one
// is HERS: a female of a species that has one.
export const hasLook = (id) => FEMALE_ART.has(id);
export const looksFemale = (id, sex) => sex === "f" && FEMALE_ART.has(id);
// Her art in a tier: the ordinary picture and the tiers drawn over it, and a
// shiny where she has a shiny of her own. Origin and the strips are their own art.
export const femaleArtFor = (id, variant) => FEMALE_ART.has(id)
  && (variant === "shiny" ? FEMALE_SHINY.has(id) : !["origin", "showdown", "cadence"].includes(variant));

// A saved list of the dex ids whose female look you have held: real looks, once each.
export const cleanFemales = (xs) => [...new Set(Array.isArray(xs) ? xs : [])].filter((id) => FEMALE_ART.has(id));

export const SEX_MARK = { f: "♀", m: "♂" };
export const SEX_NAME = { f: "Female", m: "Male" };
