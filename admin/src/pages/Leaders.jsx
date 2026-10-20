import { useState } from "react";
import { useCall, call } from "../api.js";
import { useGame } from "../game.js";
import { Card, Page, Table, Loading, num, ago } from "../ui.jsx";

const BOARDS = [
  ["dex", "Pokédex"], ["level", "Level"], ["caught", "Caught"], ["steps", "Steps"], ["variants", "Rare forms"],
  ["stars", "Research stars"], ["badges", "Badges"], ["trades", "Trades"], ["ranked", "Ranked"],
];
const open = (id) => { location.hash = `#/trainer/${id}`; };

/* Find anyone by the start of their name - for a report, a support message,
   or a name on a board. */
export function Find() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  const [error, setError] = useState(null);
  const go = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setError(null);
    try { setHits((await call("admin_find", { name: q.trim() }, true)).data); } catch (err) { setError(err.message); }
  };
  return (
    <form className="find" onSubmit={go} role="search">
      <input placeholder="Find a trainer by name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Trainer name" />
      <button className="btn">Find</button>
      {error && <p className="bad">{error}</p>}
      {hits && (hits.length ? (
        <ul className="hits">{hits.map((h) => <li key={h.id}><a href={`#/trainer/${h.id}`}>{h.name}</a>{h.flagged && <span className="tag bad">flagged</span>}</li>)}</ul>
      ) : <p className="empty">No trainer starts with that.</p>)}
    </form>
  );
}

export default function Leaders({ tick }) {
  const [board, setBoard] = useState("dex");
  const [flagged, setFlagged] = useState(false);
  const state = useCall("admin_leaders", { board, n: 50, flagged }, tick);
  const game = useGame();
  if (!game) return <Loading />;
  const value = (r) => {
    if (board === "level") return `Lv ${game.levelFromXp(r.value)}`;
    if (board === "ranked") return `${num(r.value)}`;
    return num(r.value);
  };
  return (
    <div className="grid">
      <Card span={12}><Find /></Card>
      <Card span={12} title="Top 50" sub="Flagged accounts are left out unless shown - their numbers may be forged."
        actions={<label className="check"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Show flagged</label>}>
        <div className="chips" role="tablist">
          {BOARDS.map(([id, name]) => (
            <button key={id} role="tab" aria-selected={board === id} className={`chip${board === id ? " on" : ""}`} onClick={() => setBoard(id)}>{name}</button>
          ))}
        </div>
        <Page state={state}>
          {(rows) => (
            <Table rows={rows} onRow={(r) => open(r.id)} empty="Nobody on this board yet." cols={[
              { key: "rank", label: "#", num: true, render: (_, i) => i + 1 },
              { key: "name", label: "Trainer", render: (r) => <>{r.name}{r.flagged && <span className="tag bad">flagged</span>}</> },
              { key: "value", label: BOARDS.find(([id]) => id === board)[1], num: true, render: value },
              { key: "lv", label: "Level", num: true, render: (r) => game.levelFromXp(r.xp) },
              { key: "played", label: "Last played", render: (r) => ago(r.played_at) },
            ]} />
          )}
        </Page>
      </Card>
    </div>
  );
}
