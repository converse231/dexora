/* RANKED (docs/ranked.md): your DEFENSE TEAMS and PRACTICE against a
   friend's (6a), and RANKED BATTLES refereed by the server (6b) - unrated
   until the ladder opens (6c). The teams set here are the ones challengers
   meet, and the one you battle with.

   The server holds the teams (db/ranked.sql) and reads every member off your
   STORED save, so the game flushes before it saves a team, and a team shows
   each Pokemon as the server last saw it - a gone one as gone. Practice asks
   the server for ONE of a friend's teams, picked there at random, so the page
   never holds the others: blind, as a ranked challenger will be. Nothing
   about a practice battle is saved, paid or rated. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { speciesById } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { variantOf } from "../../game/items.js";
import { flushNow } from "../../game/store.js";
import { TEAM_MAX } from "../../game/league.js";
import { baseOf, teamProblem, CHAR_PIC, DEFENSE_SLOTS, DEFENSE_MIN, RANKED_LEVEL } from "../../game/ranked.js";
import { push, myDefense, setDefenseTeam, practiceTeam, myFriends, rankedStep } from "../../net/cloud.js";
import Sprite from "../Sprite.jsx";
import Picker, { keyOf } from "../trade/Picker.jsx";

const asset = (path) => new URL(path, document.baseURI).href;
const NAME = ["A", "B", "C"];
const present = (team) => (team ?? []).filter((m) => !m.missing);
// The server's refusals, in the game's words (db/ranked.sql).
const say = (error) => (/not in your saved box/.test(error ?? "")
  ? "Your save is still uploading - try again in a moment."
  : /twice/.test(error ?? "") ? "A Pokémon is in the team twice."
    : error || "Could not reach the server. Try again.");
// The referee's answers (handler.js, cloud.js `rankedStep`), in words.
const RANKED_SAYS = {
  nobody: "Nobody to battle right now - ranked needs other trainers with two defense teams. Try again later.",
  uploading: "Your save is still uploading - try again in a moment.",
  twice: "A Pokémon is in that team twice.",
  clause: "That team has two of one species - a form counts as its species.",
  size: "A team is one to six Pokémon.",
  version: "A new version of Dexora is out - reload the page to battle.",
  closed: "Ranked battles aren't open yet.",
  signin: "Sign in to battle.",
  offline: "Could not reach the server. Try again.",
  server: "Something went wrong on the server. Try again.",
};

/* THE RULES, as chips: what the format does to every Pokemon. */
function Rules() {
  return (
    <ul className="lg-rules">
      <li>Everyone at <b>Lv {RANKED_LEVEL}</b></li>
      <li><b>One</b> of each species</li>
      <li>Same IVs for all</li>
      <li>No items</li>
    </ul>
  );
}

function Members({ team }) {
  return (
    <ul className="lg-party" aria-label="Team">
      {team.map((m) => (
        <li key={m.uid} className={m.missing ? "rk-gone" : ""}>
          {m.missing
            ? <span className="rk-gone-mark" aria-label="No longer in your Box">?</span>
            : <Sprite id={m.species} variant={m.tier} alt={label(speciesById(m.species))} />}
          <i>{m.missing ? "Gone" : `Lv ${RANKED_LEVEL}`}</i>
        </li>
      ))}
    </ul>
  );
}

/* ONE TEAM'S EDITOR: the League's picker, six at most, one of each species
   (a form counts as its species), and one button that saves it. */
function Editor({ slot, team, box, onSaved }) {
  const mons = useMemo(() => box.map((m) => ({ ...m, tier: variantOf(m) })), [box]);
  /* By uid, then keyed as the Picker keys it: a Pokemon registered for trading
     is keyed by its server id, not its uid (`keyOf`). */
  const byUid = useMemo(() => new Map(mons.map((m) => [m.uid, m])), [mons]);
  const [picked, setPicked] = useState(() => present(team).map((m) => byUid.get(m.uid)).filter(Boolean).map(keyOf));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const byKey = useMemo(() => new Map(mons.map((m) => [keyOf(m), m])), [mons]);
  const chosen = picked.map((k) => byKey.get(k)).filter(Boolean);

  const save = async (uids) => {
    setBusy(true); setError(null);
    await new Promise((r) => setTimeout(r, 500));     // the engine's 400ms local write
    await flushNow(push);                             // ...and the server's copy of it
    const got = await setDefenseTeam(slot, uids);
    setBusy(false);
    if (!got.ok) { setError(say(got.error)); return; }
    onSaved(got.data);
  };

  return (
    <div className="lg-pick">
      <section className="rk-edit-head">
        <span className="lg-kicker">Defense team {NAME[slot - 1]}</span>
        <h4>Choose up to {TEAM_MAX}</h4>
        <Rules />
      </section>
      <Picker
        mons={mons}
        picked={picked}
        max={TEAM_MAX}
        onChange={setPicked}
        prefer="high"
        limit={() => 1}
        kin={baseOf}
        empty="Your Box is empty - catch some Pokémon first."
      />
      {error && <p className="lg-refused" role="alert">{error}</p>}
      <div className="lg-dock">
        <span className="lg-dock-team" aria-label="Your team">
          {Array.from({ length: TEAM_MAX }, (_, k) => (
            <i key={k} className={chosen[k] ? "on" : ""}>
              {chosen[k] && <Sprite id={chosen[k].species} variant={chosen[k].tier} alt="" />}
            </i>
          ))}
        </span>
        <button type="button" className="lg-go big" disabled={busy || !chosen.length}
          onClick={() => save(chosen.map((m) => m.uid))}>
          {busy ? "Saving…" : "Save team"}
        </button>
      </div>
    </div>
  );
}

export default function Ranked({ box, signedIn, editing, setEditing, onPractice, onRanked }) {
  const [teams, setTeams] = useState(null);       // [{slot, team}] as the server has them
  const [friends, setFriends] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [use, setUse] = useState(null);           // your slot for practice
  const [busy, setBusy] = useState(null);         // the friend being asked
  const [live, setLive] = useState(null);         // a ranked battle of yours still open on the server
  const [finding, setFinding] = useState(false);
  const [rkNote, setRkNote] = useState(null);

  const load = useCallback(async () => {
    const [d, f, r] = await Promise.all([myDefense(), myFriends(), rankedStep({ op: "resume" })]);
    if (!d.ok) { setError(say(d.error)); return; }
    setError(null);
    setTeams(d.data ?? []);
    setFriends(f.ok ? (f.data ?? []).filter((x) => x.status === "accepted").map((x) => x.card) : []);
    setLive(r.ok && !r.data?.none ? r.data : null);
    if (!r.ok && r.error !== "offline") setRkNote(RANKED_SAYS[r.error] ?? null);
  }, []);
  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);

  const bySlot = useMemo(() => new Map((teams ?? []).map((t) => [t.slot, t.team])), [teams]);
  const usable = [...bySlot].filter(([, t]) => present(t).length).map(([s]) => s);
  const mine = usable.includes(use) ? use : usable[0] ?? null;
  const mineLegal = mine !== null && !teamProblem(present(bySlot.get(mine)).map((m) => m.species));

  /* A RANKED BATTLE: the server picks whom you meet and which of their teams,
     and referees every turn (6b). It reads your team off your STORED save, so
     the local write lands and uploads first. A battle already open resumes. */
  const find = async () => {
    setRkNote(null); setFinding(true);
    await new Promise((r) => setTimeout(r, 500));
    await flushNow(push);
    const got = await rankedStep({ op: "start", uids: present(bySlot.get(mine)).map((m) => m.uid) });
    setFinding(false);
    if (!got.ok) { setRkNote(RANKED_SAYS[got.error] ?? RANKED_SAYS.offline); return; }
    setLive(null);
    onRanked(got.data, find);
  };
  const resume = () => { const d = live; setLive(null); onRanked(d, find); };

  const clear = async (slot) => {
    const got = await setDefenseTeam(slot, []);
    if (got.ok) setTeams(got.data); else setError(say(got.error));
  };

  /* PRACTICE: one of their teams, blind, against one of yours - played in the
     browser with the ranked rules and the CPU at its hardest, and nothing
     kept. Again draws a fresh blind team. */
  const practise = async (friend) => {
    setNote(null); setBusy(friend.user_id);
    const got = await practiceTeam(friend.user_id);
    setBusy(null);
    if (!got.ok) { setNote(say(got.error)); return; }
    if (!got.data?.length) { setNote(`${friend.username} has no defense team yet.`); return; }
    onPractice({
      o: { id: `practice:${friend.user_id}`, name: friend.username, pic: CHAR_PIC[friend.char] ?? CHAR_PIC.red },
      mons: present(bySlot.get(mine)),
      foe: got.data,
      again: () => practise(friend),
    });
  };

  if (!signedIn) {
    return (
      <section className="lg-hero area-power rk-hero">
        <div className="lg-hero-text">
          <span className="lg-kicker">Ranked</span>
          <h2>Defense teams</h2>
          <p>Sign in to set up the teams other trainers will battle, and to practice against your friends&rsquo;.</p>
        </div>
      </section>
    );
  }

  if (editing) {
    return <Editor slot={editing} team={bySlot.get(editing)} box={box}
      onSaved={(d) => { setTeams(d); setEditing(null); }} />;
  }

  return (
    <>
      <section className="lg-hero area-power rk-hero">
        <div className="lg-hero-text">
          <span className="lg-kicker">Ranked · coming next</span>
          <h2>Defense teams</h2>
          <p>Set up to {DEFENSE_SLOTS} teams. A challenger meets one of them without knowing which, and the CPU
            plays it for you. Ranked needs at least {DEFENSE_MIN}.</p>
        </div>
        <Rules />
      </section>

      {error && <p className="lg-refused" role="alert">{error}</p>}

      {/* THE BATTLE, first: what the tab is for once a team is set. */}
      <section className="lg-card rk-battle">
        <div className="rk-slot-head">
          <span className="lg-kicker">Ranked battle · preview</span>
          <b>{live ? `In progress against ${live.opponent.username}` : "Battle another trainer's defense"}</b>
        </div>
        <p className="lg-why">
          {live ? "Your battle is waiting where you left it. Ten minutes without a move and it counts as a loss."
            : "The server picks who you meet and which of their teams, and referees every turn. You get 60 seconds a turn. Unrated until the ladder opens."}
        </p>
        {!live && usable.length > 1 && (
          <div className="rk-use" role="group" aria-label="Your team">
            <span>Your team</span>
            {usable.map((s) => (
              <button key={s} type="button" className={`tp-chip add${s === mine ? " have" : ""}`} aria-pressed={s === mine}
                onClick={() => setUse(s)}>Team {NAME[s - 1]}</button>
            ))}
          </div>
        )}
        {rkNote && <p className="lg-refused" role="status">{rkNote}</p>}
        {!live && mine !== null && !mineLegal && <p className="lg-refused">{RANKED_SAYS.clause}</p>}
        <div className="lg-card-go">
          {live ? (
            <button type="button" className="lg-go" onClick={resume}>Resume battle</button>
          ) : (
            <button type="button" className="lg-go" disabled={finding || !mineLegal} onClick={find}>
              {finding ? "Finding…" : "Find a battle"}
            </button>
          )}
          {!live && mine === null && <span className="lg-why">Set up a team below first.</span>}
        </div>
      </section>

      <h3 className="lg-section">Your teams</h3>
      {teams === null && !error ? <p className="ev-quiet">Loading your teams…</p> : (
        <div className="lg-list rk-slots">
          {Array.from({ length: DEFENSE_SLOTS }, (_, k) => {
            const slot = k + 1, team = bySlot.get(slot) ?? [];
            const gone = team.filter((m) => m.missing).length;
            return (
              <article key={slot} className={`lg-card rk-slot${team.length ? "" : " empty"}`}>
                <div className="rk-slot-head">
                  <span className="lg-kicker">Team {NAME[k]}</span>
                  <b>{team.length ? `${present(team).length} of ${TEAM_MAX}` : "Empty"}</b>
                  {gone > 0 && <em className="rk-warn">{gone} no longer in your Box</em>}
                </div>
                {team.length ? <Members team={team} /> : <p className="lg-why">No team here yet.</p>}
                <div className="lg-card-go">
                  <button type="button" className="lg-go" onClick={() => setEditing(slot)}>
                    {team.length ? "Edit" : "Set up"}
                  </button>
                  {team.length > 0 && (
                    <button type="button" className="lg-more" onClick={() => clear(slot)}>Clear</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <h3 className="lg-section">Practice with friends</h3>
      <p className="ev-quiet rk-note">
        Battle one of a friend&rsquo;s defense teams - you won&rsquo;t know which until it&rsquo;s sent out.
        Nothing is saved or rated.
      </p>
      {usable.length > 1 && <p className="lg-why">Practice uses the team chosen above: Team {NAME[(mine ?? 1) - 1]}.</p>}
      {note && <p className="lg-refused" role="status">{note}</p>}
      {friends === null ? <p className="ev-quiet">Loading friends…</p>
        : !friends.length ? <p className="ev-quiet">Add friends in the Trade Center to practice against their teams.</p>
          : (
            <ul className="rk-friends">
              {friends.map((f) => (
                <li key={f.user_id}>
                  <img className="lg-tpic" src={asset(`trainers/${CHAR_PIC[f.char] ?? CHAR_PIC.red}.png`)} alt="" loading="lazy" />
                  <span className="lg-tname"><i>Friend</i><b>{f.username}</b></span>
                  <button type="button" className="lg-go small" disabled={mine === null || busy !== null}
                    onClick={() => practise(f)}>
                    {busy === f.user_id ? "…" : "Practice"}
                  </button>
                </li>
              ))}
            </ul>
          )}
      {friends?.length > 0 && mine === null && (
        <p className="lg-why">Set up a team above to practice.</p>
      )}
    </>
  );
}
