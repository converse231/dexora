/* THE TRADE CENTER (docs/trading.md): trainers and friends, offers, the
   board, Surprise Trade and your own card. A page, loaded on demand (App
   imports it lazily), so the game's first load does not grow for anybody who
   never opens it.

   ONE VIEW AT A TIME, stacked: an offer being written, a friend's box, a card
   section being edited, a profile, then the tabs. Escape and "Back" peel them
   off in that order.

   EVERY SERVER ANSWER IS {ok, data}: a failed read shows "try again", never an
   empty list - "nobody here" and "could not ask" must not look alike. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speciesById, isLegendary } from "../../game/biomes.js";
import { label } from "../../game/map.js";
import { LIMITS, tradeable } from "../../game/trade.js";
import { variantOf, keeper } from "../../game/items.js";
import { flushNow } from "../../game/store.js";
import {
  myCard, cardByName, searchTrainers, updateCard, myFriends,
  addFriend, requestFriend, answerFriend, removeFriend, push,
  blockUser, unblockUser, myBlocks, reportUser,
  surpriseDeposit, surpriseWithdraw, trainerShelf, setShelf,
} from "../../net/cloud.js";
import { Composer, OffersTab } from "./Offers.jsx";
import Picker, { SpeciesFind, keyOf } from "./Picker.jsx";
import Browse from "./Browse.jsx";
import { enterTrading } from "./enter.js";
import BoardTab from "./Board.jsx";
import { useModalLock } from "../modal.js";
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
const byUid = (m) => `u${m.uid}`;

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

/* ONE CARD SECTION AT A TIME - the showcase, the wishes or the shelf - each
   opened by its own Edit (or a "+" in an empty slot). What is saved is box
   uids and species ids; the server reads each Pokemon off your STORED save,
   which is why the save is flushed first. */
const EDITS = {
  showcase: { title: "Showcase", note: `Pick up to ${LIMITS.SHOWCASE} to show off.` },
  seeking: { title: "Looking for", note: "Any species - even ones you have never seen." },
  shelf: { title: "Up for trade", note: "Strangers can only ask for these; friends can ask for any spare. You always keep the last of each species." },
};
function SectionEdit({ kind, box, dexOf, card, shelf, busy, onSave, onCancel }) {
  const [pick, setPick] = useState(() => (kind === "showcase"
    ? card.showcase.map(byUid)
    : (shelf ?? []).map((m) => `u${m.uid}`)));
  const [wish, setWish] = useState(() => [...card.seeking]);
  const onShelf = useMemo(() => new Set((shelf ?? []).map((m) => m.uid)), [shelf]);
  const mons = useMemo(() => (kind === "showcase" ? box
    : box.filter((m) => onShelf.has(m.uid) || tradeable(box, m, true))), [kind, box, onShelf]);
  const max = kind === "showcase" ? LIMITS.SHOWCASE : LIMITS.SHELF;

  return (
    <div className="tc-edit">
      <section className="ev-card">
        <header className="ev-banner">
          <h4>{EDITS[kind].title}</h4>
          <span className="tp-count">{kind === "seeking" ? wish.length : pick.length}/{kind === "seeking" ? LIMITS.SEEKING : max}</span>
        </header>
        <p className="ev-quiet">{EDITS[kind].note}</p>
        {kind === "seeking" ? (
          <>
            <div className="tp-seek">
              {wish.map((id) => (
                <button key={id} type="button" className="tp-chip x" onClick={() => setWish((w) => w.filter((x) => x !== id))}
                  aria-label={`Remove ${label(speciesById(id))}`}>
                  <Sprite id={id} alt="" />{label(speciesById(id))}<i aria-hidden="true">✕</i>
                </button>
              ))}
            </div>
            {wish.length < LIMITS.SEEKING && (
              <SpeciesFind dexOf={dexOf} skip={wish} placeholder="Add a species…"
                onPick={(id) => setWish((w) => [...w, id])} />
            )}
          </>
        ) : (
          <Picker mons={mons} picked={pick} max={max} onChange={setPick} keyFn={byUid}
            prefer={kind === "showcase" ? "high" : "low"} sort={kind === "showcase" ? "rare" : "dex"}
            empty={kind === "showcase" ? "Nothing caught yet." : "Nothing to trade yet - catch a second of something."} />
        )}
      </section>
      <div className="tp-actions tc-dock">
        <button type="button" className="ev-go" disabled={busy}
          onClick={() => onSave(kind === "seeking" ? wish : pick.map((k) => Number(k.slice(1))))}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="tp-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* A Pokemon as the trade scene shows the side you gave. */
const asShown = (m) => ({ species: m.species, level: m.level, tier: variantOf(m), alpha: !!m.alpha });

/* SURPRISE TRADE. Put one in, get one back from a friend. A Pokemon enters
   trading here for the first time, so the flow is: let the local save land and
   upload it (the server checks against the STORED save), register it for a
   server id, then deposit. Anything rare asks twice. */
function Surprise({ engine, box, inbox, sync, onTraded, friends }) {
  const [pick, setPick] = useState([]);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState(null);
  useEffect(() => { sync(); }, [sync]);

  const left = inbox?.surprise_left ?? null;
  const waiting = box.filter((m) => m.lock === "pool");
  const choices = useMemo(() => box.filter((m) => tradeable(box, m)), [box]);
  const chosen = choices.find((m) => keyOf(m) === pick[0]) ?? null;
  const precious = chosen && (keeper(chosen) || isLegendary(chosen.species));

  const deposit = async () => {
    if (precious && !sure) { setSure(true); return; }
    setBusy(true); setSay(null);
    const entered = await enterTrading(engine, [chosen]);
    if (!entered.ok) { setBusy(false); setSay(entered.error); return; }
    const mid = entered.mids[chosen.uid];
    const got = await surpriseDeposit(mid);
    setBusy(false); setPick([]); setSure(false);
    if (!got.ok) { setSay(got.error); return; }
    const r = got.data;
    if (r.status === "matched") {
      onTraded({ id: r.trade, kind: "surprise", partner: r.from, at: new Date().toISOString(),
        gave: [asShown(chosen)], got: [r.got] });
    } else if (r.status === "waiting") {
      engine.reconcileTrades({ locks: { [mid]: "pool" } });
      setSay("In the pool - it trades with the next friend who puts one in.");
    } else {
      setSay(r.status === "capped" ? "That's every Surprise Trade for today." : "That Pokémon can't be traded right now.");
    }
    sync();
  };
  const withdraw = async (m) => {
    setBusy(true);
    const got = await surpriseWithdraw(m.mid);
    setBusy(false);
    if (got.ok && got.data) engine.reconcileTrades({ locks: { [m.mid]: null } });
    sync();
  };

  return (
    <div className="tc-list">
      <section className={`ev-card ev-surprise${waiting.length ? " live" : ""}`}>
        <header className="ev-banner">
          <h4>Surprise Trade</h4>
          {left !== null && <span className={`ev-stamp${left ? " live" : ""}`}>{left} LEFT TODAY</span>}
        </header>
        <p>Put one in, get one back from a friend - no idea what until it arrives.</p>
        {friends === 0 && <p className="ev-quiet">Surprise Trade matches with friends. Add some in Trainers first.</p>}
        {waiting.length > 0 && (
          <ul className="tc-rows">
            {waiting.map((m) => (
              <li key={m.uid} className="tc-row">
                <span className="tc-who still">
                  <Sprite id={m.species} variant={variantOf(m)} fx />
                  <span><b>{label(speciesById(m.species))}</b><i>Waiting for a friend…</i></span>
                </span>
                <button type="button" className="tp-quiet" disabled={busy} onClick={() => withdraw(m)}>Take back</button>
              </li>
            ))}
          </ul>
        )}
        {say && <p className="tc-note" role="status">{say}</p>}
      </section>

      <section className="ev-card">
        <header className="ev-banner"><h4>Choose one to send</h4></header>
        <Picker mons={choices} picked={pick} max={1} onChange={(p) => { setPick(p); setSure(false); }}
          empty="Nothing to send - you keep the last of every species." />
        {chosen && (
          <div className="tc-send tc-dock">
            <Sprite id={chosen.species} variant={variantOf(chosen)} fx />
            <span>
              <b>{label(speciesById(chosen.species))}</b>
              <i>Lv {chosen.level}{variantOf(chosen) ? ` · ${variantOf(chosen)}` : ""}{chosen.alpha ? " · alpha" : ""}</i>
              {sure && <em>This one is rare. Send it anyway?</em>}
            </span>
            <button type="button" className="ev-go" disabled={busy || left === 0} onClick={deposit}>
              {busy ? "Sending…" : sure ? "Yes, send it" : "Send"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function TradeCenter({
  signedIn, engine, sync, onTraded, box = [], dexOf = () => 0, openName = null, openBoard = null,
  offers = 0, inbox = null, onClose,
}) {
  useModalLock();
  const [tab, setTab] = useState(openBoard ? "board" : "trainers");
  const page = useRef(null);
  const [blocked, setBlocked] = useState([]);
  const [me, setMe] = useState(null);
  const [friends, setFriends] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);        // "showcase" | "seeking" | "shelf"
  const [browsing, setBrowsing] = useState(null);      // {card, query}
  const [composing, setComposing] = useState(null);    // {them, want, give, counter}
  const [theirShelf, setTheirShelf] = useState(null);
  const [myShelf, setMyShelf] = useState(null);
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
    const [c, f, b] = await Promise.all([myCard(), myFriends(), myBlocks()]);
    const card = answer(c), list = answer(f), blocks = answer(b);
    if (card) setMe(card);
    if (list) setFriends(list);
    if (blocks) setBlocked(blocks);
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

  // Escape and Back peel one view off at a time, then close.
  const back = useCallback(() => {
    if (composing) setComposing(null);
    else if (browsing) setBrowsing(null);
    else if (editing) setEditing(null);
    else if (viewing) setViewing(null);
    else onClose();
  }, [composing, browsing, editing, viewing, onClose]);

  // Shelves: whoever you are looking at, and your own for the card.
  useEffect(() => {
    setTheirShelf(null);
    if (!viewing) return;
    trainerShelf(viewing.user_id).then((got) => setTheirShelf(got.ok ? got.data : []));
  }, [viewing]);
  useEffect(() => {
    if (me) trainerShelf(me.user_id).then((got) => got.ok && setMyShelf(got.data));
  }, [me]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); back(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [back]);

  /* THE BROWSER'S BACK LEAVES THE PAGE. Opening pushes one history entry
     (`#/trade`) unless a link already put us on one; App closes the page when
     the hash leaves it. The profile names itself in the same entry, so a link
     can be shared from the address bar. */
  useEffect(() => {
    if (!/^#\/(trade|trainer\/)/.test(location.hash)) history.pushState({ tc: 1 }, "", "#/trade");
  }, []);
  useEffect(() => {
    const want = viewing ? `#/trainer/${encodeURIComponent(viewing.username)}` : "#/trade";
    if (location.hash !== want) history.replaceState(history.state, "", want);
  }, [viewing]);
  useEffect(() => { page.current?.scrollTo(0, 0); }, [tab, viewing, editing, composing, browsing]);

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
  // A name anywhere in the center (an offer, a listing) opens that profile.
  const openTrainer = async (name) => {
    const card = answer(await cardByName(name));
    if (card) { setBrowsing(null); setComposing(null); setViewing(card); }
    else setNote(`${name}'s profile isn't available.`);
  };
  const share = async (name) => {
    try { await navigator.clipboard.writeText(link(name)); setNote("Profile link copied."); }
    catch { setNote(link(name)); }
  };
  /* ONE SECTION OF YOUR CARD. The server reads the Pokemon off your STORED
     save, so the engine's local write lands and uploads first. */
  const saveSection = async (kind, value) => {
    setBusy(true); setNote(null);
    await new Promise((r) => setTimeout(r, 500));
    await flushNow(push);
    let got;
    if (kind === "shelf") {
      got = await setShelf(value);
      if (got.ok) {
        engine.reconcileTrades({ assign: Object.fromEntries(got.data.filter((m) => m.uid).map((m) => [m.uid, m.mid])) });
        setMyShelf(got.data);
      }
    } else {
      got = await updateCard(kind === "showcase" ? value : me.showcase.map((m) => m.uid),
        kind === "seeking" ? value : me.seeking);
      if (got.ok) setMe(got.data);
    }
    setBusy(false);
    if (!got.ok) { setNote(got.error); return; }
    setEditing(null);
    setNote(`${EDITS[kind].title} saved.`);
  };
  /* A COUNTER-OFFER is a new offer to the same trainer with the sides swapped
     in; sending it declines the one it answers. */
  const counter = (o) => setComposing({
    them: { user_id: o.a, username: o.partner },
    want: o.give ?? [],
    give: box.filter((m) => (o.want ?? []).some((w) => w.mid === m.mid)),
    counter: o.id,
  });

  const incoming = friends?.filter((f) => f.incoming) ?? [];
  const accepted = friends?.filter((f) => f.status === "accepted") ?? [];
  const sent = friends?.filter((f) => f.status === "pending" && !f.incoming) ?? [];

  let body;
  if (!signedIn) {
    body = <p className="tc-gate">Trading needs an account - sign in, and your Pokémon and friends come with you.</p>;
  } else if (closed) {
    body = <p className="tc-gate">Trading isn&rsquo;t open yet. Check back soon!</p>;
  } else if (composing) {
    body = (
      <>
        <button type="button" className="tc-back" onClick={() => setComposing(null)}>‹ Back</button>
        <Composer them={composing.them} box={box} engine={engine} dexOf={dexOf}
          want={composing.want} give={composing.give} counter={composing.counter}
          onSent={(say) => { setComposing(null); setBrowsing(null); setViewing(null); setTab("offers"); setNote(say); sync(); }}
          onCancel={() => setComposing(null)} />
      </>
    );
  } else if (browsing) {
    body = (
      <>
        <button type="button" className="tc-back" onClick={() => setBrowsing(null)}>‹ Back</button>
        <Browse them={browsing.card} dexOf={dexOf} query={browsing.query}
          onOffer={(want) => setComposing({ them: browsing.card, want, give: [] })} />
      </>
    );
  } else if (editing && me) {
    body = <SectionEdit kind={editing} box={box} dexOf={dexOf} card={me} shelf={myShelf} busy={busy}
      onSave={(v) => saveSection(editing, v)} onCancel={() => setEditing(null)} />;
  } else if (viewing) {
    const self = viewing.user_id === me?.user_id;
    const rel = relation(viewing);
    body = (
      <>
        <button type="button" className="tc-back" onClick={() => setViewing(null)}>‹ Back</button>
        <TrainerProfile card={self ? me : viewing} self={self} relation={rel} busy={busy} dexOf={dexOf}
          shelf={self ? myShelf : theirShelf}
          onPropose={() => setComposing({ them: viewing, want: [], give: [] })}
          onBrowse={rel === "friends" ? () => setBrowsing({ card: viewing, query: "" }) : null}
          onAdd={() => act(() => requestFriend(viewing.user_id),
            (r) => (r === "unknown" ? "That trainer can't be added." : ADD_SAYS[r]))}
          onAccept={() => act(() => answerFriend(viewing.user_id, true), () => "You are friends now!")}
          onRemove={() => act(() => removeFriend(viewing.user_id), () => "Removed.")}
          onEdit={setEditing} onShare={() => share(viewing.username)}
          onBlock={async () => {
            const who = viewing;
            await act(() => blockUser(who.user_id), () => `${who.username} is blocked.`);
            setViewing(null);
            // A search typed before the block still listed them, one tap from a stale card.
            setFound((f) => f?.filter((c) => c.user_id !== who.user_id) ?? f);
            sync();   // the offers it closed unlock their Pokemon
          }}
          onReport={(reason) => act(() => reportUser(viewing.user_id, reason),
            (filed) => (filed ? "Thanks - your report was sent." : "You've already reported this trainer today."))} />
      </>
    );
  } else if (tab === "board") {
    body = <BoardTab box={box} dexOf={dexOf} engine={engine} inbox={inbox} sync={sync} onTraded={onTraded}
      friends={friends === null ? null : accepted.length} initialQ={openBoard} onOpenTrainer={openTrainer}
      onBrowse={(card, query) => setBrowsing({ card, query })} />;
  } else if (tab === "offers") {
    body = <OffersTab inbox={inbox} sync={sync} onTraded={onTraded} onOpenTrainer={openTrainer} onCounter={counter} />;
  } else if (tab === "surprise") {
    body = <Surprise engine={engine} box={box} inbox={inbox} sync={sync} onTraded={onTraded}
      friends={friends === null ? null : accepted.length} />;
  } else if (tab === "card") {
    body = me
      ? <TrainerProfile card={me} self dexOf={dexOf} shelf={myShelf} onEdit={setEditing} onShare={() => share(me.username)} />
      : <p className="ev-quiet">{fail ? "" : "Loading your card…"}</p>;
  } else {
    body = (
      <div className="tc-list">
        <section className="ev-card">
          <header className="ev-banner"><h4>Find a trainer</h4></header>
          <input className="tc-input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Trainer name…" aria-label="Search trainers by name" />
          {found && (found.length
            ? <ul className="tc-rows">{found.map((c) => <Row key={c.user_id} card={c} onOpen={setViewing} />)}</ul>
            : <p className="ev-quiet">No trainer by that name.</p>)}
          <form className="tc-code" onSubmit={(e) => { e.preventDefault(); act(() => addFriend(code), (r) => ADD_SAYS[r]); setCode(""); }}>
            <input className="tc-input" value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Friend code" aria-label="Add a friend by code" autoCapitalize="characters" />
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
              ? (
                <ul className="tc-rows">
                  {accepted.map((f) => (
                    <Row key={f.card.user_id} card={f.card} onOpen={setViewing}>
                      <button type="button" className="tp-quiet tc-browse" aria-label={`Browse ${f.card.username}'s Pokémon`}
                        onClick={() => setBrowsing({ card: f.card, query: "" })}>Pokémon</button>
                    </Row>
                  ))}
                </ul>
              )
              : <p className="ev-quiet">No friends yet. Share your code from My card, or add theirs above.</p>}
          {sent.length > 0 && <p className="ev-quiet">Waiting on {sent.map((f) => f.card.username).join(", ")}.</p>}
        </section>

        {blocked.length > 0 && (
          <section className="ev-card">
            <header className="ev-banner"><h4>Blocked</h4><span className="tp-count">{blocked.length}</span></header>
            <ul className="tc-rows">
              {blocked.map((c) => (
                <li key={c.user_id} className="tc-row">
                  <span className="tc-who still">
                    <TrainerArt char={c.char} className="tc-art" />
                    <span><b>{c.username}</b><i>Can&rsquo;t find you or trade with you</i></span>
                  </span>
                  <button type="button" className="tp-quiet" disabled={busy}
                    onClick={() => act(() => unblockUser(c.user_id), () => `${c.username} is unblocked.`)}>Unblock</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  /* A PAGE, NOT A DIALOG. It was a card over the map with its own scroll, and
     the pickers inside it scrolled too - a scroll inside a scroll, which on a
     phone is a thumb fight. Now it covers the game with ONE scroll (the page),
     the header and tabs pinned. It still takes the modal lock, so the game
     underneath hears no keys; there is no scrim to tap, so it closes by its
     own button, Escape, or the browser's Back (`#/trade`, see App). */
  const stacked = viewing || editing || composing || browsing;
  return (
    <div className="tc-page evcard" role="dialog" aria-modal="true" aria-label="Trade Center" ref={page}>
      <header className="tc-head">
        <div className="tc-bar">
          <button type="button" className="tc-home" onClick={onClose} aria-label="Back to the game">
            <span aria-hidden="true">‹</span> Game
          </button>
          <div className="tc-titles">
            <h3>Trade Center</h3>
            <span>Trainers, offers, the board, Surprise Trade and your card</span>
          </div>
        </div>
        {signedIn && !closed && !stacked && (
          <div className="tc-tabbar"><div className="sheet-tabs tc-tabs" role="tablist">
            {[["trainers", "Trainers", incoming.length || null], ["offers", "Offers", offers || null],
              ["board", "Board", null], ["surprise", "Surprise", null], ["card", "My card", null]].map(([id, name, n]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id}
                className={tab === id ? "on" : ""} onClick={() => { setTab(id); setNote(null); }}>
                {name}{n ? <em>{n}</em> : null}
              </button>
            ))}
          </div></div>
        )}
      </header>
      <main className="hp-body tc-main">
        {fail && <p className="tc-err" role="alert">{fail} <button type="button" className="tp-quiet" onClick={load}>Try again</button></p>}
        {note && <p className="tc-note" role="status">{note}</p>}
        {body}
      </main>
    </div>
  );
}
