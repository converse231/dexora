/* Search, filters and sort — shared by the Dex and the Box.

   It was a search box and a row of counted chips, and the chips ran out of room
   the moment there was more than one thing to filter on. Seven of them across a
   360px rail were 8.5px tall and unreadable, and there was nowhere to put a
   second axis at all: you could ask for shinies or for missing, never for
   missing fire-types sorted by name.

   Everything here is fighting for room with the list underneath it, which is
   the actual content of the panel - so the bar is two rows: search, then the
   three axes side by side. It was four, with a 9px caption stacked over each
   control, and those captions went because the value below each one already
   said the same thing.

   So the ordinal axes became **dropdowns**, one each, and the counts moved into
   the option labels — which is where they were always most useful, because the
   answer to "is this filter worth applying" is usually the number itself. A
   closed `<select>` is one line tall however many options it holds.

   Native `<select>` for those, deliberately: one element, keyboard- and
   screen-reader-correct for free, and on a phone it opens the platform's own
   picker.

   **Type is the exception, and it is a dropdown that opens into the palette.**
   Two facts were both true and pulling opposite ways: a type is recognised by
   its colour before its name, so a `<select>` listing eighteen words throws
   away what the player already knows by sight — and twenty chips standing open
   took four rows of a rail whose whole job is the list underneath them. So the
   control is one line closed, wearing the chosen type as its own badge, and
   opens into exactly the coloured palette it always was. Nothing is read as
   words that used to be read as colour; it just folds away.

   It cannot be a native `<select>`: `<option>` styling is ignored outright on
   some platforms and unreliable on the rest, and this control is entirely about
   the colour of its options. So it is a listbox, and it pays the cost of being
   one — Escape, click-away, arrow keys and a modal lock, below.

   Both panels take the same component and pass a different list, so they cannot
   drift apart — and the Box got sorting out of it, which it never had. */

import { useEffect, useRef, useState } from "react";
import { useModalLock } from "./modal.js";

/* The open menu, as its own component for one reason: `useModalLock` is a hook,
   so it can only run while something is mounted, and mounting only while open
   is what makes the lock release itself.

   The lock is what stops the arrow keys walking the trainer while the menu is
   up. App.jsx keeps its key handler on `window` and already bails on
   `modalOpen()` for confirm dialogs; this is the same claim on the keyboard,
   made by the same counter, rather than a second mechanism that has to be kept
   in step with the first. */
function TypeMenu({ label, value, options, onChange, onClose, focusOpener }) {
  useModalLock();
  const menu = useRef(null);

  useEffect(() => {
    /* Focus the selected badge, not the first: opening the menu and finding the
       cursor on ALL when you are filtering by WATER loses your place. */
    const items = [...(menu.current?.querySelectorAll("[role=option]") ?? [])];
    (items.find((el) => el.dataset.value === value) ?? items[0])?.focus();
  }, [value]);

  const keys = (ev) => {
    const items = [...(menu.current?.querySelectorAll("[role=option]") ?? [])];
    const i = items.indexOf(document.activeElement);
    const go = (n) => {
      ev.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (ev.key === "Escape") { onClose(); focusOpener(); }
    else if (ev.key === "ArrowDown" || ev.key === "ArrowRight") go(i + 1);
    else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") go(i - 1);
    else if (ev.key === "Home") go(0);
    else if (ev.key === "End") go(items.length - 1);
  };

  return (
    <div
      className="fb-tmenu"
      role="listbox"
      aria-label={label}
      ref={menu}
      onKeyDown={keys}
    >
      {options.map(([v, text, cls]) => (
        <button
          key={v}
          type="button"
          role="option"
          data-value={v}
          aria-selected={v === value}
          className={`type ${cls}${v === value ? " on" : ""}`}
          onClick={() => { onChange(v); onClose(); focusOpener(); }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function TypePicker({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const opener = useRef(null);

  /* Click away closes it. Registered only while open, so a closed picker costs
     no listener at all — and `pointerdown` rather than `click`, because a click
     that starts inside the menu and ends outside it is a drag-select, not a
     dismissal. */
  useEffect(() => {
    if (!open) return;
    const away = (ev) => {
      if (!box.current?.contains(ev.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const current = options.find(([v]) => v === value) ?? options[0];
  const chosen = value !== options[0][0];

  return (
    <div className={`fb-types${chosen ? " on" : ""}`} ref={box}>
      <button
        type="button"
        ref={opener}
        className="fb-topen"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        /* The badge says which type; the button has to say so in words too,
           because a screen reader gets nothing from a background colour. */
        aria-label={`${label}: ${current[1]}`}
      >
        <span className={`type ${current[2]}`}>{current[1]}</span>
        <i aria-hidden="true" />
      </button>
      {open && (
        <TypeMenu
          label={label}
          value={value}
          options={options}
          onChange={onChange}
          onClose={() => setOpen(false)}
          focusOpener={() => opener.current?.focus()}
        />
      )}
    </div>
  );
}

export default function FilterBar({
  find,
  onFind,
  placeholder = "Find a name or type…",
  selects = [],
  types = null,
  onReset,
}) {
  // A filter is "on" when it is not its own first option, which is the
  // everything option by convention.
  const active =
    selects.some((s) => s.value !== s.options[0][0]) ||
    (!!types && types.value !== types.options[0][0]);

  return (
    <div className="filterbar">
      <div className="fb-find">
        <input
          type="search"
          value={find}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => onFind(e.target.value)}
        />
        {/* Only appears once there is something to clear, so it is never a
            button that does nothing. */}
        {(active || find) && (
          <button type="button" className="fb-clear" onClick={onReset}>
            CLEAR
          </button>
        )}
      </div>

      <div className="fb-row">
        {/* No label above the control any more. Three axes each carrying a
            9px caption cost three lines of a rail whose entire job is the grid
            underneath, and every one of those captions was telling you
            something the chosen value already says: "Everything 151" is
            plainly a filter and "By dex number" is plainly a sort. The label
            moves to `aria-label`, where it is still the accessible name, and
            to `title` for a pointer. */}
        {selects.map((s) => (
          <select
            key={s.id}
            className={`fb-sel${s.value !== s.options[0][0] ? " on" : ""}`}
            value={s.value}
            aria-label={s.label}
            title={s.label}
            onChange={(e) => s.onChange(e.target.value)}
          >
            {s.options.map(([value, text, n]) => (
              <option key={value} value={value}>
                {n == null ? text : `${text} ${n}`}
              </option>
            ))}
          </select>
        ))}
        {/* In the same row as the other axes, and shaped like them, because
            they are three answers to one question and stacking one of them
            somewhere else was what made the palette read as a separate tool. */}
        {types && <TypePicker {...types} />}
      </div>
    </div>
  );
}
