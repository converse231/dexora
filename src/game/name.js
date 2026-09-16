/* WHAT A TRAINER MAY BE CALLED.

   A pure rule, so it lives with the other pure rules rather than inside the
   form that happens to be its first caller - the form is a convenience and this
   is the shape. It sits here for two more reasons: `check.mjs` can import a
   `.js` module and cannot import a `.jsx` one, and an edge function deciding
   anything about names one day will want the same function rather than a second
   copy of the regex.

   THE DATABASE HOLDS THE SAME RULE AS A CHECK CONSTRAINT, and that duplication
   is deliberate: a form can be bypassed and a table cannot. check.mjs asserts
   the two agree on the bounds, because two copies of a rule drift.

   Uniqueness is NOT here, because it cannot be: two people typing the same name
   at the same moment both pass every check a browser can do. Only the unique
   index settles that, and it comes back as a 23505 from the insert. */

export const NAME_MIN = 3;
export const NAME_MAX = 16;

/* Letters, digits, space, underscore, hyphen. Deliberately narrow: it is shown
   next to other people's names, so anything that can imitate punctuation,
   pretend to be blank, or run right-to-left through the rest of a list stays
   out. */
const SHAPE = /^[A-Za-z0-9 _-]+$/;

/* Returns a line to show, or null when the name is fine. Trimmed first, and
   what is stored is the trimmed value - or " ab " passes a length check it
   should fail, and two names differing only by padding look identical. */
export function nameProblem(raw) {
  const v = (raw ?? "").trim();
  if (!v) return "Pick a name.";
  if (v.length < NAME_MIN) return `At least ${NAME_MIN} characters.`;
  if (v.length > NAME_MAX) return `At most ${NAME_MAX} characters.`;
  if (!SHAPE.test(v)) return "Letters, numbers, spaces and dashes only.";
  return null;
}
