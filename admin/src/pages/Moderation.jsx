import { useState } from "react";
import { useCall, act } from "../api.js";
import { useGame } from "../game.js";
import { Card, Page, Table, Ask, Loading, num, when } from "../ui.jsx";
import { Find } from "./Leaders.jsx";

export default function Moderation({ tick }) {
  const [n, setN] = useState(0);
  const state = useCall("admin_moderation", {}, tick + n);
  const game = useGame();
  const [ask, setAsk] = useState(null);   // { kind, row }
  if (!game) return <Loading />;
  const done = () => { setAsk(null); setN((x) => x + 1); };
  const reasons = (items) => [...new Set(items.map((x) => game.REPORT_REASONS[x.reason] ?? `#${x.reason}`))].join(", ");
  return (
    <Page state={state}>
      {(d) => (
        <div className="grid">
          <Card span={12}><Find /></Card>
          <Card span={12} title={`Reports · ${num(d.reports.length)} open`} sub="Grouped by the trainer reported; dismissing keeps the report and says why">
            <Table rows={d.reports} empty="No open reports." cols={[
              { key: "name", label: "Trainer", render: (r) => <><a href={`#/trainer/${r.id}`}>{r.name}</a>{r.flagged && <span className="tag bad">flagged</span>}</> },
              { key: "n", label: "Reports", num: true },
              { key: "why", label: "Reasons", render: (r) => reasons(r.items) },
              { key: "by", label: "From", render: (r) => [...new Set(r.items.map((x) => x.by))].join(", ") },
              { key: "latest", label: "Latest", render: (r) => when(r.latest) },
              { key: "acts", label: "", render: (r) => (
                <span className="row-acts">
                  <button className="btn small" onClick={() => setAsk({ kind: "dismiss", row: r })}>Dismiss</button>
                  {!r.flagged && <button className="btn small danger" onClick={() => setAsk({ kind: "flag", row: r })}>Flag</button>}
                </span>
              ) },
            ]} />
          </Card>
          <Card span={6} title={`Flagged · ${num(d.flagged.length)}`} sub="By the pace check (a save past real time) or by an admin">
            <Table rows={d.flagged} empty="Nobody is flagged." cols={[
              { key: "name", label: "Trainer", render: (r) => <a href={`#/trainer/${r.id}`}>{r.name}</a> },
              { key: "reason", label: "Why" },
              { key: "at", label: "Since", render: (r) => when(r.at) },
              { key: "acts", label: "", render: (r) => <button className="btn small" onClick={() => setAsk({ kind: "unflag", row: r })}>Unflag</button> },
            ]} />
          </Card>
          <Card span={6} title="Audit log" sub="The last 100 admin actions">
            <Table rows={d.audit} empty="No actions yet." cols={[
              { key: "action", label: "Action" },
              { key: "target", label: "Trainer", render: (r) => (r.target_id ? <a href={`#/trainer/${r.target_id}`}>{r.target ?? "deleted"}</a> : "—") },
              { key: "why", label: "Why", render: (r) => r.detail?.why },
              { key: "at", label: "When", render: (r) => when(r.at) },
            ]} />
          </Card>
          <Ask open={ask?.kind === "dismiss"} title={`Dismiss ${ask?.row.n ?? ""} report(s) about ${ask?.row.name ?? ""}?`} confirm="Dismiss" tone="primary"
            onCancel={() => setAsk(null)} onDone={async (why) => { await act("admin_dismiss", { ids: ask.row.items.map((x) => x.id), why }); done(); }} />
          <Ask open={ask?.kind === "flag"} title={`Flag ${ask?.row.name ?? ""}?`} confirm="Flag"
            body="A flagged account keeps its game but leaves trading and every board and count."
            onCancel={() => setAsk(null)} onDone={async (why) => { await act("admin_flag", { who: ask.row.id, why }); done(); }} />
          <Ask open={ask?.kind === "unflag"} title={`Unflag ${ask?.row.name ?? ""}?`} confirm="Unflag" tone="primary"
            onCancel={() => setAsk(null)} onDone={async (why) => { await act("admin_unflag", { who: ask.row.id, why }); done(); }} />
        </div>
      )}
    </Page>
  );
}
