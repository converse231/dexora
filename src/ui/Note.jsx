/* ONE ALERT, USED EVERYWHERE.

   The Box grew a `.bx-flash` and the Trainer a `.ts-note`, and they looked
   nothing alike: a pink slab with a border against a line of small green pixel
   text. Two components saying "that worked" in two visual languages is the same
   fault as two lists of what counts as a spare - the second one is written by
   somebody who did not know the first existed, and neither is wrong on its own.

   `tone` is the only axis: "ok" for something that happened, "warn" for
   something that did not. Anything more and this becomes a design system for
   four call sites. */
export default function Note({ children, tone = "ok" }) {
  if (!children) return null;
  return (
    <p className={`note note-${tone}`} role="status">
      {children}
    </p>
  );
}
