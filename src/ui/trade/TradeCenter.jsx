/* THE TRADE CENTER (docs/trading.md). Phase 1: trainers and friends, and your
   own card. Loaded on demand (App imports it lazily), so the game's first load
   does not grow for anybody who never opens it.

   EVERY SERVER ANSWER IS {ok, data}: a failed read shows "try again", never an
   empty list - "nobody here" and "could not ask" must not look alike. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SPECIES } from "../../data/dex.js";
import { speciesById, TIERS } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { LIMITS } from "../../game/trade.js";
import { variantOf } from "../../game/items.js";
import { flushNow } from "../../game/store.js";
import {
  myCard, cardByName, searchTrainers, updateCard, myFriends,
  addFriend, answerFriend, removeFriend, push,
} from "../../net/cloud.js";
import { useDismiss, useModalLock } from "../modal.js";
import Sprite, { TrainerArt } from "../Sprite.jsx";
import Mark from "../Marks.jsx";
import TrainerProfile from "./TrainerProfile.jsx";

const ADD_SAYS = {
  sent: "Request sent.",
  friends: "You are friends now!",
  already: "Already friends, or a request is waiting.",
  self: "That is your own code.",
  unknown: "No trainer has that code.",
  full: `A trainer can have ${LIMITS.FRIENDS} friends at most.`,
};
const link = (name) => `${location.origin}${location.pathname}#/trainer/${encodeURIComponent(name)}`;

/* ONE ROW PER TRAINER, the same everywhere a list names somebody. */
function Row({ card, children, onOpen }) {
  return (
    <li className="tc-row">
      <button type="button" className="tc-who" onClick={() => onOpen(card)}>
        <TrainerArt char={card.char} className="tc-art" />
        <span><b>{card.username}</b><i>{card.dex_count} Pokédex · {card.variants} rare</i></span>
      </button>
      {children}
    </li>
  );
}

/* THE CARD EDITOR: six from your box, twelve wishes. What is saved is box uids
   and species ids; the server reads each Pokemon off your STORED save, which is
   why the save is flushed first. */
function Editor({ box, dexOf, card, onSaved, onCancel }) {
  const [pick, setPick] = useState(() => card.showcase.map((m) => m.uid));
  const [wish, setWish] = useState(() => [...card.seeking]);
  const [find, setFind] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  /* Rarest first, then highest level: the Pokemon a trainer would show off. */
  const choices = useMemo(() => [...box].sort((a, b) => {
    const r = (m) => (variantOf(m) ? TIERS.length - TIERS.indexOf(variantOf(m)) : 0) + (m.alpha ? 20 : 0);
    return r(b) - r(a) || b.level - a.level || a.uid - b.uid;
  }).slice(0, 120), [box]);
  const hits = useMemo(() => {
    const n = find.trim().toLowerCase();
    if (n.length < 2) return [];
    return SPECIES.filter((sp) => dexOf(sp.id) >= 1 && !wish.includes(sp.id)
      && label(sp).toLowerCase().includes(n)).slice(0, 8);
  }, [find, wish, dexOf]);

  const toggle = (uid) => setPick((p) => (p.includes(uid) ? p.filter((u) => u !== uid)
    : p.length < LIMITS.SHOWCASE ? [...p, uid] : p));

  const save = async () => {
    setSaving(true); setErr(null);
    await flushNow(push);                          // the server reads the stored save
    const got = await updateCard(pick, wish);
    setSaving(false);
    if (got.ok) onSaved(got.data); else setErr(got.error);
  };

  return (
    <div className="tc-edit">
      <section className="ev-card">
        <header className="ev-banner"><h4>Showcase</h4><span className="tp-count">{pick.length}/{LIMITS.SHOWCASE}</span></header>
        <p>Pick up to {LIMITS.SHOWCASE}. Rarest first.</p>
        <div className="tc-pick">
          {choices.map((m) => {
            const sp = speciesById(m.species);
            const on = pick.includes(m.uid);
            return (
              <button key={m.uid} type="button" className={`tc-mon${on ? " on" : ""}`}
                aria-pressed={on} aria-label={`${label(sp)}, Lv ${m.level}`} onClick={() => toggle(m.uid)}>
                <Sprite id={m.species} variant={variantOf(m)} />
                {variantOf(m) && <span className="tp-tier"><Mark tier={variantOf(m)} size={10} /></span>}
                {on && <em>{pick.indexOf(m.uid) + 1}</em>}
              </button>
            );
          })}
        </div>
      </section>
      <section className="ev-card">
        <header className="ev-banner"><h4>Looking for</h4><span className="tp-count">{wish.length}/{LIMITS.SEEKING}</span></header>
        <div className="tp-seek">
          {wish.map((id) => (
            <button key={id} type="button" className="tp-chip x" onClick={() => setWish((w) => w.filter((x) => x !== id))}
              aria-label={`Remove ${label(speciesById(id))}`}>
              <Sprite id={id} alt="" />{label(speciesById(id))}<i aria-hidden="true">✕</i>
            </button>
          ))}
        </div>
        {wish.length < LIMITS.SEEKING && (
          <>
            <input className="tc-input" value={find} onChange={(e) => setFind(e.target.value)}
              placeholder="Add a species you have seen…" aria-label="Find a species to add" />
            {hits.length > 0 && (
              <div className="tp-seek">
                {hits.map((sp) => (
                  <button key={sp.id} type="button" className="tp-chip add"
                    onClick={() => { setWish((w) => [...w, sp.id]); setFind(""); }}>
                    <Sprite id={sp.id} alt="" />{label(sp)}<i aria-hidden="true">+</i>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      {err && <p className="tc-err" role="alert">{err}</p>}
      <div className="tp-actions">
        <button type="button" className="ev-go" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save card"}</button>
        <button type="button" className="tp-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function TradeCenter({ signedIn, box = [], dexOf = () => 0, openName = null, onClose }) {
  useModalLock();
  const [tab, setTab] = useState("trainers");
  const [me, setMe] = useState(null);
  const [friends, setFriends] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [fail, setFail] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null);
  const [code, setCode] = useState("");

  const answer = useCallback((got) => {
    if (got.closed) setClosed(true);
    else if (!got.ok) setFail(got.error);
    return got.ok ? got.data : null;
  }, []);

  const load = useCallback(async () => {
    setFail(null);
    const [c, f] = await Promise.all([myCard(), myFriends()]);
    const card = answer(c), list = answer(f);
    if (card) setMe(card);
    if (list) setFriends(list);
  }, [answer]);

  useEffect(() => {
    if (!signedIn) return;
    load();
    if (openName) cardByName(openName).then((got) => {
      const card = answer(got);
      if (card) setViewing(card);
      else if (got.ok) setNote(`No trainer called “${openName}”.`);
    });
  }, [signedIn, openName, load, answer]);

  // Escape backs out of a profile or the editor first, then closes.
  const back = useCallback(() => {
    if (editing) setEditing(false);
    else if (viewing) setViewing(null);
    else onClose();
  }, [editing, viewing, onClose]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); back(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [back]);

  // The address bar names the profile, so a link can be shared from it.
  useEffect(() => {
    const want = viewing ? `#/trainer/${encodeURIComponent(viewing.username)}` : "";
    if (location.hash !== want) history.replaceState(null, "", want || location.pathname + location.search);
  }, [viewing]);

  // Search, a beat after typing stops, and only from two letters.
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setFound(null); return undefined; }
    timer.current = setTimeout(async () => setFound(answer(await searchTrainers(q)) ?? []), 300);
    return () => clearTimeout(timer.current);
  }, [q, answer]);

  const relation = (card) => {
    const f = friends?.find((x) => x.card.user_id === card.user_id);
    if (!f) return null;
    return f.status === "accepted" ? "friends" : f.incoming ? "incoming" : "sent";
  };
  const act = async (run, say) => {
    setBusy(true); setNote(null);
    const got = await run();
    setBusy(false);
    if (answer(got) !== null || got.ok) { setNote(say?.(got.data) ?? null); await load(); }
  };
  const share = async (name) => {
    try { await navigator.clipboard.writeText(link(name)); setNote("Profile link copied."); }
    catch { setNote(link(name)); }
  };

  const incoming = friends?.filter((f) => f.incoming) ?? [];
  const accepted = friends?.filter((f) => f.status === "accepted") ?? [];
  const sent = friends?.filter((f) => f.status === "pending" && !f.incoming) ?? [];

  let body;
  if (!signedIn) {
    body = <p className="tc-gate">Trading needs an account - sign in, and your Pokémon and friends come with you.</p>;
  } else if (closed) {
    body = <p className="tc-gate">Trading isn&rsquo;t open yet. Check back soon!</p>;
  } else if (editing && me) {
    body = <Editor box={box} dexOf={dexOf} card={me}
      onSaved={(c) => { setMe(c); setEditing(false); setNote("Card saved."); }}
      onCancel={() => setEditing(false)} />;
  } else if (viewing) {
    const self = viewing.user_id === me?.user_id;
    body = (
      <>
        <button type="button" className="tc-back" onClick={() => setViewing(null)}>‹ Back</button>
        <TrainerProfile card={self ? me : viewing} self={self} relation={relation(viewing)} busy={busy} dexOf={dexOf}
          onAdd={() => act(() => addFriend(viewing.friend_code), (r) => ADD_SAYS[r])}
          onAccept={() => act(() => answerFriend(viewing.user_id, true), () => "You are friends now!")}
          onRemove={() => act(() => removeFriend(viewing.user_id), () => "Removed.")}
          onEdit={() => setEditing(true)} onShare={() => share(viewing.username)} />
      </>
    );
  } else if (tab === "card") {
    body = me
      ? <TrainerProfile card={me} self dexOf={dexOf} onEdit={() => setEditing(true)} onShare={() => share(me.username)} />
      : <p className="ev-quiet">{fail ? "" : "Loading your card…"}</p>;
  } else {
    body = (
      <div className="tc-list">
        <section className="ev-card">
          <header className="ev-banner"><h4>Find a trainer</h4></header>
          <input className="tc-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Trainer name…" aria-label="Search trainers by name" />
          {found && (found.length
            ? <ul className="tc-rows">{found.map((c) => <Row key={c.user_id} card={c} onOpen={setViewing} />)}</ul>
            : <p className="ev-quiet">No trainer by that name.</p>)}
          <form className="tc-code" onSubmit={(e) => { e.preventDefault(); act(() => addFriend(code), (r) => ADD_SAYS[r]); setCode(""); }}>
            <input className="tc-input" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Friend code" aria-label="Add a friend by code" />
            <button type="submit" className="ev-go" disabled={busy || code.trim().length !== 8}>Add</button>
          </form>
        </section>

        {incoming.length > 0 && (
          <section className="ev-card live">
            <header className="ev-banner"><h4>Friend requests</h4><span className="ev-stamp live">{incoming.length}</span></header>
            <ul className="tc-rows">
              {incoming.map((f) => (
                <Row key={f.card.user_id} card={f.card} onOpen={setViewing}>
                  <button type="button" className="tc-yes" disabled={busy} aria-label={`Accept ${f.card.username}`}
                    onClick={() => act(() => answerFriend(f.card.user_id, true), () => "You are friends now!")}>✓</button>
                  <button type="button" className="tc-no" disabled={busy} aria-label={`Decline ${f.card.username}`}
                    onClick={() => act(() => answerFriend(f.card.user_id, false))}>✕</button>
                </Row>
              ))}
            </ul>
          </section>
        )}

        <section className="ev-card">
          <header className="ev-banner"><h4>Friends</h4><span className="tp-count">{accepted.length}</span></header>
          {friends === null
            ? <p className="ev-quiet">{fail ? "" : "Loading…"}</p>
            : accepted.length
              ? <ul className="tc-rows">{accepted.map((f) => <Row key={f.card.user_id} card={f.card} onOpen={setViewing} />)}</ul>
              : <p className="ev-quiet">No friends yet. Share your code from My card, or add theirs above.</p>}
          {sent.length > 0 && <p className="ev-quiet">Waiting on {sent.map((f) => f.card.username).join(", ")}.</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="helpcard evcard tradecard" role="dialog" aria-modal="true" aria-label="Trade Center"
        onClick={(e) => e.stopPropagation()}>
        <div className="set-top">
          <h3>Trade Center</h3>
          <span className="set-mail">Trainers, friends and your card</span>
          <button className="set-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {signedIn && !closed && !viewing && !editing && (
          <div className="sheet-tabs tc-tabs" role="tablist">
            {[["trainers", "Trainers", incoming.length || null], ["card", "My card", null]].map(([id, name, n]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id}
                className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
                {name}{n ? <em>{n}</em> : null}
              </button>
            ))}
          </div>
        )}
        <div className="hp-body">
          {fail && <p className="tc-err" role="alert">{fail} <button type="button" className="tp-quiet" onClick={load}>Try again</button></p>}
          {note && <p className="tc-note" role="status">{note}</p>}
          {body}
        </div>
      </div>
    </div>
  );
}
