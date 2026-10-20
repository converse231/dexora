import { useCall } from "../api.js";
import { useGame, leagueName } from "../game.js";
import { Card, Page, Heatmap, Bars, Loading, num, pct, day } from "../ui.jsx";
import { Hist } from "../charts.jsx";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONDAY = Date.UTC(2024, 0, 1);   // a Monday, 00:00 UTC

/* The busy hours arrive as hour-of-week in UTC; shown in YOUR time zone, so
   "Friday 8pm" means your Friday evening. */
function localWeek(busy) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const [k, n] of Object.entries(busy)) {
    const t = new Date(MONDAY + Number(k) * 3600e3);
    grid[(t.getDay() + 6) % 7][t.getHours()] += n;
  }
  return grid;
}

function bin(values, size, top, fmt) {
  const bins = [];
  for (let lo = 0; lo < top; lo += size) bins.push({ lo, label: fmt(lo, Math.min(top, lo + size) - 1), n: 0 });
  for (const v of values) bins[Math.min(bins.length - 1, Math.floor(v / size))].n++;
  return bins;
}

export default function Players({ tick }) {
  const state = useCall("admin_players", {}, tick);
  const snap = useCall("admin_daily", { days: 3 }, tick);
  const game = useGame();
  if (!game) return <Loading />;
  const m = snap.data?.at(-1)?.m;
  return (
    <Page state={state}>
      {(p) => {
        const week = localWeek(p.busy);
        const levels = p.xp.map((x) => game.levelFromXp(x));
        const champions = Object.entries(m?.beaten ?? {}).filter(([id]) => game.GYMTUNE[id]?.kind === "champion");
        const champ = (region) => Math.max(0, ...champions.filter(([id]) => game.GYMTUNE[id].region === region).map(([, n]) => n));
        const hard = Object.entries(m?.beaten ?? {}).filter(([id]) => id.endsWith(":hard"));
        const f = p.funnel;
        const steps = [
          ["Signed up", f.accounts], ["Saved a game", f.saved], ["First catch", f.caught1], ["100 caught", f.caught100],
          ["First badge", f.badge1], ["8 badges", f.badge8], ["Kanto Champion", champ("kanto")],
          ["Any hard mode win", hard.length ? Math.max(...hard.map(([, n]) => n)) : 0],
        ];
        const names = Object.fromEntries(game.BIOMES.map((b) => [b.id, b.name]));
        return (
          <div className="grid">
            <Card title="How far trainers get" sub="Each step out of everyone who signed up; the last two from last night's snapshot" span={6}>
              <ul className="funnel">
                {steps.map(([label, n]) => (
                  <li key={label} style={{ "--w": `${f.accounts ? (n / f.accounts) * 100 : 0}%` }}>
                    <span>{label}</span><b>{num(n)}</b><em>{pct(f.accounts ? n / f.accounts : null)}</em>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Retention" sub={p.since ? `Of each week's new trainers, how many came back: the next day, in week 2 (days 7-13), in month 2 (days 30-36). Recorded since ${day(p.since)}.` : "Starts once activity is recorded."} span={6}>
              <Heatmap
                rows={p.retention.map((r) => ({ key: r.week, label: `${day(r.week)} · ${r.size}`, r }))}
                cols={[{ key: "1", label: "D1" }, { key: "7", label: "D7" }, { key: "30", label: "D30" }]}
                value={(row, c) => (row.r[`e${c.key}`] ? row.r[`d${c.key}`] / row.r[`e${c.key}`] : null)}
                label={(row, c) => `Week of ${day(row.key)}, D${c.key}`}
                fmt={(v) => pct(v)} max={1} />
            </Card>
            <Card title="Busy hours" sub="Trainer-hours over the last 4 weeks, in your time zone" span={12}>
              <Heatmap
                rows={DOW.map((d, i) => ({ key: i, label: d }))}
                cols={Array.from({ length: 24 }, (_, h) => ({ key: h, label: h % 3 ? "" : String(h).padStart(2, "0") }))}
                value={(r, c) => week[r.key][c.key] || null}
                label={(r, c) => `${DOW[r.key]} ${String(c.key).padStart(2, "0")}:00`} fmt={() => ""} />
            </Card>
            <Card title="Trainer levels" span={6}>
              <Hist bins={bin(levels, 10, 100, (lo, hi) => `${lo + 1}-${hi + 1}`)} />
            </Card>
            <Card title="Pokédex caught" sub={`Out of ${num(game.DEX_TOTAL)}`} span={6}>
              <Hist bins={bin(p.dex, 100, game.DEX_TOTAL + 1, (lo, hi) => `${lo}-${hi}`)} color="var(--c2)" />
            </Card>
            {m && (
              <>
                <Card title="Champions by region" sub="Trainers who have beaten each region's Champion (snapshot)" span={6}>
                  <Bars items={[...new Set(Object.values(game.GYMTUNE).map((t) => t.region))].map((r) => ({
                    key: r, label: r[0].toUpperCase() + r.slice(1), value: champ(r) }))} />
                </Card>
                <Card title="Where trainers are" sub="The map each trainer last saved on (snapshot)" span={6}>
                  <Bars items={Object.entries(m.areas).sort((a, b) => b[1] - a[1]).slice(0, 16)
                    .map(([id, n]) => ({ key: id, label: names[id] ?? id, value: n }))} />
                </Card>
                {hard.length > 0 && (
                  <Card title="Hard mode" sub="Trainers who beat each hard-mode opponent (snapshot)" span={12}>
                    <Bars items={hard.sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, n]) => ({ key: id, label: leagueName(id), value: n }))} />
                  </Card>
                )}
              </>
            )}
          </div>
        );
      }}
    </Page>
  );
}
