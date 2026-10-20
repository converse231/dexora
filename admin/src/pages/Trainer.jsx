import { useState } from "react";
import { useCall, act } from "../api.js";
import { useGame, leagueName } from "../game.js";
import { Card, Page, Table, Ask, Loading, num, when, ago } from "../ui.jsx";

/* The last 180 days as a calendar, a column a week (Monday first). */
function Calendar({ days }) {
  const on = new Set(days.map((d) => String(d).slice(0, 10)));
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - 179 * 864e5);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const cells = [];
  for (let t = start.getTime(); t <= today.getTime(); t += 864e5) {
    const k = new Date(t).toISOString().slice(0, 10);
    cells.push(<i key={k} className={on.has(k) ? "on" : ""} title={`${k}${on.has(k) ? " · played" : ""}`} />);
  }
  return <div className="cal" aria-label={`${on.size} days played in the last 180`}>{cells}</div>;
}

export default function Trainer({ arg, tick }) {
  const [n, setN] = useState(0);
  const state = useCall("admin_trainer", { who: arg }, tick + n);
  const game = useGame();
  const [ask, setAsk] = useState(null);
  if (!game) return <Loading />;
  const run = async (fn, extra = {}) => { await act(fn, { who: arg, ...extra }); setAsk(null); setN((x) => x + 1); };
  return (
    <Page state={state}>
      {(t) => !t ? <p className="empty">No trainer with that id.</p> : (
        <div className="grid">
          <Card span={12} className="hero">
            <div className="hero-row">
              <div>
                <h2>{t.name} {t.flagged && <span className="tag bad">flagged</span>}</h2>
                <p className="sub">Lv {game.levelFromXp(t.xp)} · joined {when(t.joined)} · last played {ago(t.played)}</p>
                {t.flagged && <p className="bad">Flagged {when(t.flagged)}: {t.flag_reason}</p>}
              </div>
              <div className="card-acts">
                {t.flagged
                  ? <button className="btn" onClick={() => setAsk("unflag")}>Unflag</button>
                  : <button className="btn danger" onClick={() => setAsk("flag")}>Flag</button>}
                {t.ranked && !t.ranked.voided && <button className="btn danger" onClick={() => setAsk("void")}>Void ranked</button>}
              </div>
            </div>
            <dl className="stats">
              <div><dt>Pokédex</dt><dd>{num(t.dex)}</dd></div>
              <div><dt>Caught</dt><dd>{num(t.caught)}</dd></div>
              <div><dt>Steps</dt><dd>{num(t.steps)}</dd></div>
              <div><dt>Rare forms</dt><dd>{num(t.card?.variants)}</dd></div>
              <div><dt>Research stars</dt><dd>{num(t.card?.stars)}</dd></div>
              <div><dt>Badges</dt><dd>{num(t.card?.badges)}</dd></div>
              <div><dt>Trades done</dt><dd>{num(t.trades.done ?? 0)}</dd></div>
              <div><dt>Invited</dt><dd>{num(t.invited)}</dd></div>
              <div><dt>Ranked</dt><dd>{t.ranked ? `${num(t.ranked.rating)} · ${t.ranked.wins}/${t.ranked.games}${t.ranked.voided ? " · voided" : ""}` : "—"}</dd></div>
            </dl>
          </Card>
          <Card span={8} title="Days played" sub="The last 180 days (UTC)"><Calendar days={t.days} /></Card>
          <Card span={4} title="Trades" sub="Every trade this trainer was in, by how it ended">
            <Table rows={Object.entries(t.trades).map(([status, n]) => ({ id: status, status, n }))} empty="No trades."
              cols={[{ key: "status", label: "Status" }, { key: "n", label: "Trades", num: true }]} />
          </Card>
          <Card span={6} title="Reports against" sub={`${t.reports_made} made by this trainer`}>
            <Table rows={t.reported} empty="Never reported." cols={[
              { key: "reason", label: "Reason", render: (r) => game.REPORT_REASONS[r.reason] ?? `#${r.reason}` },
              { key: "by", label: "By" },
              { key: "at", label: "When", render: (r) => when(r.at) },
              { key: "d", label: "", render: (r) => (r.dismissed ? <span className="tag">dismissed</span> : null) },
            ]} />
          </Card>
          <Card span={6} title="Titles and badges">
            <div className="chips">{(t.card?.badge_ids ?? []).map((b) => <span key={b} className="chip">{leagueName(b)}</span>)}</div>
            <div className="chips">{(t.card?.titles ?? []).map((x) => <span key={x} className="chip quiet">{x}</span>)}</div>
          </Card>
          <Card span={12} title="Audit" sub="Every admin action about this trainer">
            <Table rows={t.audit} empty="No admin has acted on this trainer." cols={[
              { key: "action", label: "Action" }, { key: "why", label: "Why", render: (r) => r.detail?.why },
              { key: "by", label: "By" }, { key: "at", label: "When", render: (r) => when(r.at) },
            ]} />
          </Card>
          <Ask open={ask === "flag"} title={`Flag ${t.name}?`} confirm="Flag"
            body="A flagged account keeps its game but leaves trading and every board and count. Nothing in its save changes."
            onCancel={() => setAsk(null)} onDone={(why) => run("admin_flag", { why })} />
          <Ask open={ask === "unflag"} title={`Unflag ${t.name}?`} confirm="Unflag" tone="primary"
            body="Back into trading, the boards and the counts." onCancel={() => setAsk(null)} onDone={(why) => run("admin_unflag", { why })} />
          <Ask open={ask === "void"} title={`Void ${t.name}'s ranked season?`} confirm="Void"
            body="Off this season's ladder and out of matchmaking (ranked.sql's own void)." onCancel={() => setAsk(null)} onDone={(why) => run("admin_void", { why })} />
        </div>
      )}
    </Page>
  );
}
