import { useCall } from "../api.js";
import { useGame } from "../game.js";
import { Card, Kpi, Page, Bars, Loading, num, day, when } from "../ui.jsx";
import { Trend } from "../charts.jsx";

/* What only the saves know, from the nightly snapshot (admin.daily). */
export function NoSnapshot() {
  return <p className="note">No snapshot yet. It runs nightly at 04:00 UTC, or now from Health → Run now.</p>;
}

export default function Collection({ days, tick }) {
  const state = useCall("admin_daily", { days }, tick);
  const game = useGame();
  if (!game) return <Loading />;
  return (
    <Page state={state}>
      {(rows) => {
        if (!rows.length) return <NoSnapshot />;
        const { m, made } = rows.at(-1);
        const series = rows.map((r) => ({
          day: String(r.day).slice(0, 10), money: r.m.money?.p50, money90: r.m.money?.p90,
          box: r.m.box?.p50, research: r.m.research?.p50, players: r.m.players,
        }));
        const tiers = game.TIERS.map((t) => ({ key: t, label: game.tierName(t), value: m.tiers?.[t]?.held ?? 0 }));
        const holders = game.TIERS.map((t) => ({ key: t, label: game.tierName(t), value: m.tiers?.[t]?.players ?? 0 }));
        return (
          <div className="grid">
            <p className="note span-12">From the snapshot of {when(made)}. Flagged accounts are left out; a save's numbers are what it claims.</p>
            <div className="kpis span-12">
              <Kpi label="Saves counted" value={num(m.players)} />
              <Kpi label="Pokémon held (median)" value={num(m.box?.p50)} tip={`Top 10%: ${num(m.box?.p90)}, the most ${num(m.box?.max)}`} />
              <Kpi label="Money (median)" value={`¥${num(m.money?.p50)}`} tip={`Top 10%: ¥${num(m.money?.p90)}`} />
              <Kpi label="Rare Candy (median)" value={num(m.candy?.p50)} tip={`Top 10%: ${num(m.candy?.p90)}`} />
              <Kpi label="Species researched" value={num(m.research?.p50)} tip="Median species with any research" />
              <Kpi label="Card collectors" value={num(m.cards?.players)} tip={`Median ${num(m.cards?.p50)} different cards`} />
              <Kpi label="Week-long streaks" value={num(m.streak?.week)} tip={`Best check-in streak, median ${num(m.streak?.p50)}`} />
            </div>
            <Card title="Rare forms registered" sub="Species registered in each tier across every save, rarest first" span={6}>
              <Bars items={tiers} />
            </Card>
            <Card title="Trainers holding each tier" sub="Saves with at least one" span={6}>
              <Bars items={holders} />
            </Card>
            <Card title="Money" sub="Median and top 10% by night" span={6}>
              <Trend data={series} xFmt={day} kind="line" yFmt={(v) => (v == null ? "—" : `¥${num(v)}`)}
                series={[{ key: "money", name: "Median" }, { key: "money90", name: "Top 10%" }]} />
            </Card>
            <Card title="Collections" sub="Median Pokémon held and species researched" span={6}>
              <Trend data={series} xFmt={day} kind="line" series={[{ key: "box", name: "Pokémon held" }, { key: "research", name: "Researched" }]} />
            </Card>
            <Card title="Medals" sub="Trainers holding each medal or title" span={12}>
              <Bars items={Object.entries(m.medals ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id, n]) => ({ key: id, label: id, value: n }))} />
            </Card>
          </div>
        );
      }}
    </Page>
  );
}
