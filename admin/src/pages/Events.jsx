import { useCall } from "../api.js";
import { useGame } from "../game.js";
import { Card, Kpi, Page, Bars, Loading, num, day } from "../ui.jsx";
import { Trend } from "../charts.jsx";
import { NoSnapshot } from "./Collection.jsx";

const iso = (k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;

/* Each event in eventforms.js, read from the snapshots: its costumes caught
   (a look's Pokedex position is its `event_slots()` key), the hunt, claims. */
export default function Events({ days, tick }) {
  const state = useCall("admin_daily", { days: Math.max(days, 30) }, tick);
  const game = useGame();
  if (!game) return <Loading />;
  return (
    <Page state={state}>
      {(rows) => {
        if (!rows.length) return <NoSnapshot />;
        const m = rows.at(-1).m;
        const today = new Date().toISOString().slice(0, 10);
        return (
          <div className="grid">
            {game.EVENTS.map((ev) => {
              const slot = (id) => String(game.dexIndex(id) + 1);
              const looks = [...ev.looks, ev.hunt].filter(Boolean);
              const caught = looks.map((l) => ({ key: l.id, label: l.title, value: m.events?.[slot(l.id)] ?? 0 }));
              const series = rows.map((r) => ({
                day: String(r.day).slice(0, 10),
                ...Object.fromEntries(ev.looks.map((l) => [l.id, r.m.events?.[slot(l.id)] ?? 0])),
              }));
              const status = today < iso(ev.start) ? "upcoming" : today > iso(ev.end) ? "ended" : "live";
              const hunters = ev.hunt ? m.medals?.[`event:${ev.hunt.medal}`] ?? 0 : 0;
              return [
                <Card key={`${ev.id}-k`} span={12} title={ev.name}
                  sub={`${day(iso(ev.start))} – ${day(iso(ev.end))} · ${status}`}>
                  <div className="kpis">
                    <Kpi label="Caught a costume" value={num(Math.max(0, ...caught.slice(0, ev.looks.length).map((c) => c.value)))}
                      tip="Trainers holding the most-caught look - at least this many took part" />
                    <Kpi label="Claimed the event" value={num(m.medals?.[`event:${ev.id}`] ?? 0)} tip={`Every look in the Pokédex: the "${ev.title}" title`} />
                    {ev.hunt && <Kpi label={`${ev.hunt.name}s`} value={num(hunters)} tip={`Caught ${ev.hunt.title}`} />}
                    {ev.hunt && <Kpi label="Dreaming" value={num(m.dreams?.[ev.id]?.players ?? 0)} tip={`Trainers with Bad Dreams; median ${num(m.dreams?.[ev.id]?.p50)} of ${ev.hunt.again}`} />}
                  </div>
                </Card>,
                <Card key={`${ev.id}-b`} span={5} title="Each look" sub="Trainers who have caught it"><Bars items={caught} /></Card>,
                <Card key={`${ev.id}-t`} span={7} title="Over time" sub="Trainers holding each look, by night">
                  <Trend data={series} xFmt={day} kind="line" series={ev.looks.map((l) => ({ key: String(l.id), name: l.title }))} />
                </Card>,
              ];
            })}
          </div>
        );
      }}
    </Page>
  );
}
