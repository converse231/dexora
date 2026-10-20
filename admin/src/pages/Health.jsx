import { useState } from "react";
import { useCall, act } from "../api.js";
import { Card, Kpi, Page, Table, num, bytes, when, ago } from "../ui.jsx";

// The free tier's database cap (docs/admin.md, "Performance and the free tiers").
const DB_CAP = 500e6;

export default function Health({ tick }) {
  const [n, setN] = useState(0);
  const state = useCall("admin_health", {}, tick + n);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const run = async () => {
    setRunning(true); setError(null);
    try { await act("admin_snapshot", {}); setN((x) => x + 1); } catch (e) { setError(e.message); } finally { setRunning(false); }
  };
  return (
    <Page state={state}>
      {(h) => {
        const share = h.db_bytes / DB_CAP;
        const last = h.cron?.[0];
        return (
          <div className="grid">
            <div className="kpis span-12">
              <Kpi label="Database" value={bytes(h.db_bytes)} tip="Supabase free tier: 500 MB" />
              <Kpi label="Of the free tier" value={`${(share * 100).toFixed(1)}%`} />
              <Kpi label="Last snapshot" value={h.snapshot ? ago(h.snapshot.made) : "never"} tip={h.snapshot ? when(h.snapshot.made) : "Run it below"} />
              <Kpi label="Nightly job" value={h.cron == null ? "no pg_cron" : last ? last.status : "not run yet"} tip={last ? `${when(last.at)} ${last.message ?? ""}` : "04:00 UTC"} />
            </div>
            <Card span={12} title="Free tier" sub="Supabase free: 500 MB database. Saves are most of it.">
              <div className={`gauge${share > 0.8 ? " bad" : share > 0.6 ? " warn" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={Math.round(share * 100)} aria-label="Database used">
                <i style={{ "--w": `${Math.min(100, share * 100)}%` }} />
              </div>
              <p className="sub">{bytes(h.db_bytes)} of 500 MB. Activity is recorded since {h.tracked_since ? when(h.tracked_since) : "—"}; hours are kept 90 days, days 400.</p>
            </Card>
            <Card span={6} title="Snapshot" sub="One pass over every save. Running it again today replaces today's row."
              actions={<button className="btn primary" onClick={run} disabled={running}>{running ? "Running…" : "Run now"}</button>}>
              {error && <p className="bad">{error}</p>}
              <Table rows={h.cron ?? []} empty={h.cron == null ? "pg_cron is not on this project - run it by hand." : "The nightly job has not run yet."} cols={[
                { key: "at", label: "Nightly run", render: (r) => when(r.at) }, { key: "status", label: "Status" },
                { key: "message", label: "Said" }]} />
            </Card>
            <Card span={6} title="Biggest saves" sub="Each save is one row; the game caps one at 5 MB">
              <Table rows={h.saves} cols={[
                { key: "name", label: "Trainer", render: (r) => <a href={`#/trainer/${r.id}`}>{r.name}</a> },
                { key: "bytes", label: "Size", num: true, render: (r) => bytes(r.bytes) }]} />
            </Card>
            <Card span={12} title="Tables" sub="Rows are Postgres's estimate">
              <Table rows={h.tables.map((t) => ({ ...t, id: t.name }))} cols={[
                { key: "name", label: "Table" }, { key: "rows", label: "Rows", num: true, render: (r) => num(r.rows) },
                { key: "bytes", label: "Size", num: true, render: (r) => bytes(r.bytes) }]} />
            </Card>
          </div>
        );
      }}
    </Page>
  );
}
