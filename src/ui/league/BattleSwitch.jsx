/* BATTLES IS TWO PAGES (asked for, 2026-10-23: "put the Arena inside the
   Battles tab, two sections we can switch - Classic and Arena"): this switch
   heads both, and App's `goTab` opens the one last chosen, the Arena first. */
export default function BattleSwitch({ on, onPick }) {
  return (
    <div className="bt-switch" role="tablist" aria-label="Battles">
      {[["arena", "Arena"], ["league", "Classic"]].map(([id, name]) => (
        <button key={id} type="button" role="tab" aria-selected={on === id} onClick={() => on !== id && onPick(id)}>{name}</button>
      ))}
    </div>
  );
}
