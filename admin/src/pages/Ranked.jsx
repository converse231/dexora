import { useState } from "react";
import { useCall } from "../api.js";
import { useGame } from "../game.js";
import { Card, Kpi, Page, Bars, Loading, num, pct, day } from "../ui.jsx";
import { Trend, Hist } from "../charts.jsx";

const STEP = 25;

export default function Ranked({ tick }) {
  const [season, setSeason] = useState(null);
  const state = useCall("admin_ranked", season ? { season } : {}, tick);
  const game = useGame();
  if (!game) return <Loading />;
  return (
    <Page state={state}>
      {(r) => {
        const byDay = {};
        for (const b of r.battles) {
          const d = String(b.day).slice(0, 10);
          byDay[d] ??= { day: d, won: 0, lost: 0, abandoned: 0, active: 0 };
          byDay[d][b.status] += b.n;
        }
        const series = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
        const tot = (k) => series.reduce((n, d) => n + d[k], 0);
        const games = tot("won") + tot("lost") + tot("abandoned");
        const ratings = r.ratings.map(([rating]) => rating);
        const lo = Math.floor(Math.min(1000, ...ratings) / STEP) * STEP, hi = Math.max(1450, ...ratings);
        const bins = [];
        for (let x = lo; x <= hi; x += STEP) bins.push({ label: x, n: ratings.filter((v) => v >= x && v < x + STEP).length });
        const ranks = {};
        for (const [rating, g] of r.ratings) { const k = game.rankOf(rating, g); ranks[k.name] = (ranks[k.name] ?? 0) + 1; }
        const order = ["Beginner", ...game.RANKS.map((x) => x.name)];
        return (
          <div className="grid">
            <Card span={12} title={`Season ${r.season}`} actions={r.seasons.length > 1 && (
              <select value={r.season} onChange={(e) => setSeason(e.target.value)} aria-label="Season">
                {r.seasons.map((s) => <option key={s}>{s}</option>)}
              </select>
            )}>
              <div className="kpis">
                <Kpi label="Battles" value={num(games)} />
                <Kpi label="Challengers win" value={pct(games ? tot("won") / games : null)} tip="Won by the challenger; abandoned counts as lost." />
                <Kpi label="Abandoned" value={pct(games ? tot("abandoned") / games : null)} />
                <Kpi label="On the ladder" value={num(r.ratings.length)} tip={`${num(r.voided)} voided this season`} />
              </div>
            </Card>
            <Card title="Battles a day" span={8}>
              <Trend data={series} xFmt={day} kind="bar" stack series={[
                { key: "won", name: "Challenger won", color: "var(--good)" }, { key: "lost", name: "Defender won", color: "var(--c1)" },
                { key: "abandoned", name: "Abandoned", color: "var(--ink-faint)" }]} />
            </Card>
            <Card title="Players per rank" span={4}>
              <Bars items={order.filter((k) => ranks[k]).map((k) => ({
                key: k, label: k, value: ranks[k], color: game.RANKS.find((x) => x.name === k)?.color })).reverse()} />
            </Card>
            <Card title="Rating spread" sub="Each rank's floor dashed - the SQL's own floors" span={12}>
              <Hist bins={bins} refs={game.RANKS.filter((x) => Number.isFinite(x.from)).map((x) => ({
                x: Math.floor(x.from / STEP) * STEP, label: x.name, color: x.color }))} />
            </Card>
          </div>
        );
      }}
    </Page>
  );
}
