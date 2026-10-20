/* The dashboard's small parts: cards, KPIs, tables, heatmaps, states. */
import { useEffect, useRef, useState } from "react";

export const num = (n) => (n == null || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString());
export const pct = (n, d = 0) => (n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(d)}%`);
export const bytes = (b) => (b == null ? "—" : b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB`
  : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(0)} KB` : `${b} B`);
export const day = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`)
  .toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
export const when = (t) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export function ago(t) {
  if (!t) return "never";
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function Card({ title, sub, span = 12, children, actions, className = "" }) {
  return (
    <section className={`card span-${span} ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div><h2>{title}</h2>{sub && <p className="sub">{sub}</p>}</div>
          {actions && <div className="card-acts">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/* A number, its change against the period before, and a sparkline - an SVG
   polyline, not a chart: eight of them sit on the first screen. */
export function Kpi({ label, value, delta, spark, tip, good = "up" }) {
  /* `undefined`: a number with no history (playing now). `null`: the period
     before had nothing to compare with - tracking had not started - which is
     not "no change" and not "+100%". */
  const dir = delta == null || !Number.isFinite(delta) || Math.abs(delta) < 0.005 ? "flat" : delta > 0 ? "up" : "down";
  const tone = dir === "flat" ? "" : dir === good ? "good" : "bad";
  return (
    <div className="kpi" title={tip}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {delta !== undefined && (
        <span className={`kpi-delta ${tone}`}>
          {delta === null ? "no earlier data"
            : dir === "flat" ? "no change" : `${dir === "up" ? "▲" : "▼"} ${pct(Math.abs(delta), Math.abs(delta) < 0.1 ? 1 : 0)}`}
          {delta !== null && <span className="vs"> vs previous</span>}
        </span>
      )}
      {spark?.length > 1 && <Spark values={spark} />}
    </div>
  );
}

function Spark({ values }) {
  const max = Math.max(1, ...values), w = 100, h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,${h} ${pts} ${w},${h}`} className="spark-fill" />
      <polyline points={pts} className="spark-line" />
    </svg>
  );
}

/* A table that becomes stacked cards on a phone: every cell carries its
   column's name for the narrow layout. */
export function Table({ cols, rows, empty = "Nothing yet.", onRow }) {
  if (!rows?.length) return <p className="empty">{empty}</p>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{cols.map((c) => <th key={c.key} className={c.num ? "n" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? "link" : ""}
              tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => e.key === "Enter" && onRow(r) : undefined}>
              {cols.map((c) => (
                <td key={c.key} data-label={c.label} className={c.num ? "n" : ""}>{c.render ? c.render(r, i) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* A heatmap is a CSS grid, no library: each cell's strength is a mix of the
   accent into the surface. */
export function Heatmap({ rows, cols, value, label, fmt = num, max }) {
  const top = max ?? Math.max(1e-9, ...rows.flatMap((r) => cols.map((c) => value(r, c) ?? 0)));
  return (
    <div className="heat-wrap">
      <div className="heat" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(22px, 1fr))` }}>
        <span />
        {cols.map((c) => <span key={c.key} className="heat-col">{c.label}</span>)}
        {rows.map((r) => [
          <span key={`l${r.key}`} className="heat-row">{r.label}</span>,
          ...cols.map((c) => {
            const v = value(r, c);
            const k = v == null ? 0 : Math.round((v / top) * 100);
            return (
              <span key={`${r.key}:${c.key}`} className={`heat-cell${v == null ? " none" : ""}`}
                style={{ "--k": `${k}%` }} title={`${label(r, c)}: ${v == null ? "—" : fmt(v)}`}>
                {v == null ? "" : fmt(v)}
              </span>
            );
          }),
        ])}
      </div>
    </div>
  );
}

export function Bars({ items, fmt = num, empty = "Nothing yet." }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  const top = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="hbars">
      {items.map((i) => (
        <li key={i.key ?? i.label}>
          <span className="hb-label">{i.label}</span>
          <span className="hb-track"><i style={{ "--w": `${(i.value / top) * 100}%`, "--c": i.color }} /></span>
          <span className="hb-n">{fmt(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export const Loading = () => <div className="state"><span className="spin" aria-hidden="true" /> Loading…</div>;
export const Fail = ({ error }) => <div className="state bad" role="alert">Could not load: {error}</div>;

/* A page's frame: its data's age, and nothing drawn until it has some. */
export function Page({ state, children }) {
  if (state.error && !state.data) return <Fail error={state.error} />;
  if (!state.data) return <Loading />;
  return (
    <>
      {state.error && <Fail error={state.error} />}
      {children(state.data)}
      <p className="stamp">{state.loading ? "Refreshing…" : `Updated ${ago(state.at)} · kept 5 minutes`}</p>
    </>
  );
}

/* A moderation write: a native <dialog> (focus, Escape and the backdrop for
   free) that asks why before it acts - every write is audited with it. */
export function Ask({ open, title, body, confirm, tone = "danger", onDone, onCancel }) {
  const ref = useRef(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setWhy(""); setError(null); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await onDone(why.trim()); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <dialog ref={ref} className="ask" onClose={onCancel} onCancel={onCancel}>
      <form onSubmit={go}>
        <h3>{title}</h3>
        {body && <p>{body}</p>}
        <label>Why <span className="sub">(kept in the audit log)</span>
          <input autoFocus required maxLength={200} value={why} onChange={(e) => setWhy(e.target.value)} />
        </label>
        {error && <p className="bad">{error}</p>}
        <div className="ask-acts">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className={`btn ${tone}`} disabled={busy || !why.trim()}>{busy ? "…" : confirm}</button>
        </div>
      </form>
    </dialog>
  );
}
