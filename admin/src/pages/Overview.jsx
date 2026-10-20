import { useCall } from "../api.js";
import { Card, Kpi, Page, num, pct, day } from "../ui.jsx";
import { Trend } from "../charts.jsx";

const sum = (a, k) => a.reduce((n, d) => n + (d[k] ?? 0), 0);
// Nothing before to compare with is null, never +100% (ui.jsx `Kpi`).
const change = (now, was) => (now == null || !was ? null : (now - was) / was);

export default function Overview({ days, tick }) {
  const state = useCall("admin_overview", { days }, tick);
  return (
    <Page state={state}>
      {(o) => {
        const half = o.series.length / 2;
        const prev = o.series.slice(0, half), cur = o.series.slice(half);
        const last = cur.at(-1) ?? {};
        const avg = (a, k) => (a.length ? sum(a, k) / a.length : 0);
        const stick = (a) => { const m = avg(a, "mau"); return m ? avg(a, "dau") / m : null; };
        const hours = (a) => { const d = sum(a, "dau"); return d ? sum(a, "hours") / d : null; };
        const joined = sum(cur, "joined"), joinedBefore = sum(prev, "joined");
        return (
          <div className="grid">
            {o.tracked_since && o.tracked_since > cur[0]?.day && (
              <p className="note span-12">Activity has been recorded since {day(o.tracked_since)}, so days before it read zero. Sign-ups have their whole history.</p>
            )}
            <div className="kpis span-12">
              <Kpi label="Trainers" value={num(o.total)} delta={change(joined, joinedBefore)} spark={cur.map((d) => d.joined)}
                tip={`Accounts, flagged ones left out (${num(o.flagged)} flagged). The change is in new trainers.`} />
              <Kpi label="Playing now" value={num(o.now)} tip="Saved in the last 2 minutes." />
              <Kpi label="Active today" value={num(last.dau)} delta={change(avg(cur, "dau"), avg(prev, "dau"))} spark={cur.map((d) => d.dau)}
                tip={`Daily active trainers today. The change compares the ${days}-day average with the ${days} days before.`} />
              <Kpi label="Weekly active" value={num(last.wau)} delta={change(last.wau, prev.at(-1)?.wau)} spark={cur.map((d) => d.wau)} />
              <Kpi label="Monthly active" value={num(last.mau)} delta={change(last.mau, prev.at(-1)?.mau)} spark={cur.map((d) => d.mau)} />
              <Kpi label={`New in ${days}d`} value={num(joined)} delta={change(joined, joinedBefore)} spark={cur.map((d) => d.joined)} />
              <Kpi label="Stickiness" value={pct(stick(cur))} delta={change(stick(cur), stick(prev))}
                tip="Average daily actives over monthly actives: how many of this month's trainers come back on a given day." />
              <Kpi label="Hours / player-day" value={hours(cur)?.toFixed(1) ?? "—"} delta={change(hours(cur), hours(prev))}
                tip="Hours in which a trainer saved, per active trainer per day." />
            </div>
            <Card title="Active trainers" sub="Daily, and the distinct trainers of the last 7 and 30 days" span={8}>
              <Trend data={cur} xFmt={day} series={[{ key: "mau", name: "Monthly" }, { key: "wau", name: "Weekly" }, { key: "dau", name: "Daily" }]} />
            </Card>
            <Card title="New trainers" sub="Accounts made, by day (UTC)" span={4}>
              <Trend data={cur} xFmt={day} kind="bar" series={[{ key: "joined", name: "New", color: "var(--c2)" }]} />
            </Card>
            <Card title="Time played" sub="Trainer-hours a day: each hour in which a trainer saved" span={12}>
              <Trend data={cur} xFmt={day} kind="bar" height={180} series={[{ key: "hours", name: "Trainer-hours", color: "var(--c3)" }]} />
            </Card>
          </div>
        );
      }}
    </Page>
  );
}
