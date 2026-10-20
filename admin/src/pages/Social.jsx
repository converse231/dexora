import { useCall } from "../api.js";
import { Card, Kpi, Page, Bars, num, pct, day } from "../ui.jsx";
import { Trend } from "../charts.jsx";

const KINDS = [["direct", "Direct"], ["surprise", "Surprise"], ["board", "Board"]];

// Every day in the window, so a quiet day is a zero and not a gap.
function days(n) {
  const out = [], t = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(new Date(t - i * 864e5).toISOString().slice(0, 10));
  return out;
}

export default function Social({ days: n, tick }) {
  const state = useCall("admin_social", { days: n }, tick);
  return (
    <Page state={state}>
      {(s) => {
        const byDay = Object.fromEntries(days(n).map((d) => [d, { day: d, direct: 0, surprise: 0, board: 0, friends: 0 }]));
        const outcome = {};
        for (const r of s.trades) {
          const d = String(r.day).slice(0, 10);
          if (r.status === "done" && byDay[d]) byDay[d][r.kind] += r.n;
          outcome[r.status] = (outcome[r.status] ?? 0) + r.n;
        }
        for (const r of s.friends_by_day) { const d = String(r.day).slice(0, 10); if (byDay[d]) byDay[d].friends = r.n; }
        const series = Object.values(byDay);
        const done = outcome.done ?? 0, all = Object.values(outcome).reduce((a, b) => a + b, 0);
        return (
          <div className="grid">
            <div className="kpis span-12">
              <Kpi label={`Trades in ${n}d`} value={num(done)} tip="Completed trades of every kind." />
              <Kpi label="Trades completed" value={pct(all ? done / all : null)} tip="Out of every trade opened in the window." />
              <Kpi label="Open listings" value={num(s.listings.open)} />
              <Kpi label="Friend links" value={num(s.friends.accepted)} tip={`${num(s.friends.pending)} requests waiting`} />
              <Kpi label="Invites qualified" value={num(s.referrals.qualified)} tip={`${num(s.referrals.linked)} linked in all, ${num(s.referrals.qualified_recent)} qualified in the window`} />
              <Kpi label="Blocks" value={num(s.blocks)} />
            </div>
            <Card title="Trades by kind" sub="Completed trades a day" span={8}>
              <Trend data={series} xFmt={day} kind="bar" stack series={KINDS.map(([key, name]) => ({ key, name }))} />
            </Card>
            <Card title="How trades end" sub={`Every trade opened in the last ${n} days`} span={4}>
              <Bars items={Object.entries(outcome).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, value: v }))} />
            </Card>
            <Card title="New friendships" sub="Requests made a day" span={8}>
              <Trend data={series} xFmt={day} series={[{ key: "friends", name: "Requests", color: "var(--c4)" }]} height={200} />
            </Card>
            <Card title="Board and invites" span={4}>
              <Bars items={[
                { label: "Listings made", value: s.listings.made }, { label: "Listings completed", value: s.listings.done },
                { label: "Invites linked", value: s.referrals.linked_recent }, { label: "Invites qualified", value: s.referrals.qualified_recent },
              ]} />
            </Card>
          </div>
        );
      }}
    </Page>
  );
}
