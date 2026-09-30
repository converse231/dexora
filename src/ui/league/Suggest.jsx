/* THE SUGGEST CONTROL (suggest.js): a style or a famous lineup to pick from,
   and one button that builds the team - the League's team pick and ranked's
   editor both draw it. A native <select>, so it is a keyboard- and
   phone-friendly list with no popover of its own. Picking a style builds at
   once; the button builds again (a changed Box, or the same style twice). */
import { useState } from "react";
import { STYLES, LINEUPS, suggestTeam } from "./suggest.js";

export default function Suggest({ mons, size, kin, foes = null, onPick }) {
  const [style, setStyle] = useState(foes ? "counter" : "balanced");
  const [note, setNote] = useState(null);
  const run = (s) => {
    setStyle(s);
    const { team, missing } = suggestTeam(mons, { size, style: s, foes, kin });
    onPick(team);
    setNote(missing.length ? `Not in your Box: ${missing.join(", ")} - their places went to your best picks.` : null);
  };
  if (!mons.length) return null;
  return (
    <div className="sg">
      <select className="pk-sel" value={style} onChange={(e) => run(e.target.value)} aria-label="Kind of team to suggest">
        <optgroup label="By strength">
          {STYLES.filter(([id]) => id !== "counter" || foes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </optgroup>
        <optgroup label="Famous lineups">
          {LINEUPS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </optgroup>
      </select>
      <button type="button" className="tp-quiet" onClick={() => run(style)}>Suggest a team</button>
      {note && <p className="sg-note" role="status">{note}</p>}
    </div>
  );
}
