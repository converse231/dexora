/* WHAT A TRAINER MAY BE CALLED, AND HOW OLD THEY SAY THEY ARE.

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

/* ------------------------------------------------------------------- the age */

/* THIRTEEN, AND IT IS A LEGAL NUMBER RATHER THAN A DESIGN ONE. A game drawn
   from Pokémon with open sign-ups WILL be found by children, and the rules that
   attach to a child's account - COPPA in the US, the GDPR's age of consent in
   Europe, which member states set between 13 and 16 - are triggered by the age,
   not by whether anybody asked. Thirteen is the floor every one of them shares
   and is what the games and platforms this sits beside all use.

   It is asked ONCE, at the gate, and it is asked as a date rather than a
   yes/no, because a birthday is also the only thing that can pay for itself
   later: a bonus on the day is a reason to be glad you answered. What is NOT
   collected is anything else about the person - see the migration in
   SUPABASE.md for why that list is deliberately two fields long.

   This cannot be enforced, and pretending otherwise would be the mistake. A
   self-declared date is a statement, not a check; what it buys is that the
   question was asked and the answer recorded. */
export const MIN_AGE = 13;

/* Whole years between two ISO dates, on the calendar rather than in
   milliseconds: a division by 365.25 is wrong for anybody with a leap-day
   birthday and wrong by a day for a lot of other people, and "are you 13"
   should not have an off-by-one in it. */
export function ageOn(iso, today = new Date()) {
  const born = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  let years = today.getFullYear() - born.getFullYear();
  const month = today.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < born.getDate())) years -= 1;
  return years;
}

/* Returns a line to show, or null when the date is fine. */
export function ageProblem(iso, today = new Date()) {
  if (!iso) return "Enter your date of birth.";
  const years = ageOn(iso, today);
  if (years === null) return "That is not a date.";
  if (years < 0) return "That date is in the future.";
  if (years > 120) return "Check the year.";
  if (years < MIN_AGE) return `You need to be ${MIN_AGE} or over to make an account.`;
  return null;
}
