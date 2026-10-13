/* BINDER PAGES AND YOUR OWN BINDERS (asked for, 2026-10-13).

   `BinderPages` is the one way a binder is drawn: nine-pocket pages like a
   real binder, two side by side as a spread where there is room and one on a
   phone, turned with big buttons or the slider. The set binders and your own
   binders both use it.

   `MyBinders` is binders you fill yourself, from any set and in any order
   (cards.js `cleanBinders`; the engine's `newBinder`, `setBinder`,
   `deleteBinder`, `addToBinder`). A pocket whose card you no longer hold
   keeps it, drawn faded - the layout is never lost to a sale. */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CARD_SETS } from "../../data/cards/index.js";
import { PAGE_POCKETS, BINDER_MAX, BINDER_NAME, BINDER_POCKETS, RARITY, rungOf } from "../../game/cards.js";
import CardFace, { RarityMark, VARIANT_NAME } from "./Card.jsx";
import Confirm from "../Confirm.jsx";
import { useDismiss, useModalLock } from "../modal.js";

// "me01-187:h" -> its set, card number and printing.
export const parseKey = (key) => {
  const [id, v] = key.split(":");
  const cut = id.lastIndexOf("-");
  return { id, v, setId: id.slice(0, cut), localId: id.slice(cut + 1) };
};

export function BinderPages({ count, page, onPage, render }) {
  const ref = useRef(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 720));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const show = wide ? 2 : 1;
  const pages = Math.max(1, Math.ceil(count / PAGE_POCKETS));
  // The left page of the spread: a spread always starts on an odd page, like a book.
  const left = Math.floor(Math.min(page, pages - 1) / show) * show;
  const turn = (to) => onPage(Math.max(0, Math.min(pages - 1, to)));
  return (
    <div className="bp" ref={ref}>
      <div className="bp-book">
        <button type="button" className="bp-turn" disabled={left === 0} onClick={() => turn(left - show)} aria-label="Previous page">‹</button>
        <div className={`bp-spread${show === 2 ? " two" : ""}`}>
          {Array.from({ length: show }, (_, k) => left + k).map((p) => (
            <div key={p} className={`bp-page${p >= pages ? " blank" : ""}`}>
              <div className="bp-grid">
                {p < pages && Array.from({ length: PAGE_POCKETS }, (_, j) => {
                  const i = p * PAGE_POCKETS + j;
                  return i < count ? <Fragment key={i}>{render(i)}</Fragment> : <span key={i} className="bp-void" />;
                })}
              </div>
              {p < pages && <span className="bp-no">{p + 1}</span>}
            </div>
          ))}
        </div>
        <button type="button" className="bp-turn" disabled={left + show >= pages} onClick={() => turn(left + show)} aria-label="Next page">›</button>
      </div>
      {pages > 1 && (
        <div className="bp-nav">
          <input type="range" min={1} max={pages} value={left + 1} onChange={(e) => turn(Number(e.target.value) - 1)} aria-label="Jump to page" />
          <span>Page {left + 1}{show === 2 && left + 2 <= pages ? `-${left + 2}` : ""} of {pages}</span>
        </div>
      )}
    </div>
  );
}

// One card face from a key, faded when it is no longer held.
function Face({ sets, cards, k, lazy = false }) {
  const { id, v, setId, localId } = parseKey(k);
  const card = sets[setId]?.CARDS.find((c) => c[0] === localId);
  if (!card) return <span className="cd-empty"><b>{localId}</b>Loading…</span>;
  return <CardFace setId={setId} card={card} variant={v} still lazy={lazy} className={cards[id]?.[v] ? "" : "faded"} />;
}

export function MyBinders({ binders, sets, cards, engine, onLook }) {
  const [openId, setOpenId] = useState(null);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState(null);
  const [picker, setPicker] = useState(null);       // { at } fills one pocket, { many: true } adds several
  const [asking, setAsking] = useState(false);
  const b = binders.find((x) => x.id === openId) ?? null;
  const [draft, setDraft] = useState("");
  useEffect(() => { setDraft(b?.name ?? ""); }, [b?.id, b?.name]);

  const open = (id) => { setOpenId(id); setPage(0); setSel(null); };

  if (!b) {
    return (
      <div className="mb-list">
        {binders.map((x) => {
          const filled = x.pockets.filter(Boolean);
          return (
            <button key={x.id} type="button" className="mb-tile" onClick={() => open(x.id)}>
              <span className="mb-cover">{filled[0] ? <Face sets={sets} cards={cards} k={filled[0]} lazy /> : <i>Empty</i>}</span>
              <b>{x.name}</b>
              <small>{filled.length} card{filled.length === 1 ? "" : "s"}</small>
            </button>
          );
        })}
        {binders.length < BINDER_MAX && (
          <button type="button" className="mb-tile mb-new" onClick={() => { const id = engine.newBinder(); if (id) open(id); }}>
            <span className="mb-cover" aria-hidden="true">+</span>
            <b>New binder</b>
            <small>Cards from any set</small>
          </button>
        )}
      </div>
    );
  }

  const filled = b.pockets.filter(Boolean).length;
  // Always one empty pocket after the last card, whole pages, and at least a
  // full spread - a new binder opened on a blank right-hand page.
  const count = Math.min(BINDER_POCKETS, Math.max(2 * PAGE_POCKETS, Math.ceil((b.pockets.length + 1) / PAGE_POCKETS) * PAGE_POCKETS));
  const put = (pockets) => engine.setBinder(b.id, { pockets });
  const move = (from, to) => {
    if (to < 0 || to >= count) return;
    const p = [...b.pockets];
    while (p.length <= Math.max(from, to)) p.push(null);
    [p[from], p[to]] = [p[to], p[from]];
    put(p);
    setSel(to);
    setPage(Math.floor(to / PAGE_POCKETS));
  };
  const selKey = sel != null ? b.pockets[sel] : null;
  const selCard = selKey && (() => { const { setId, localId, v } = parseKey(selKey); const c = sets[setId]?.CARDS.find((x) => x[0] === localId); return c && { setId, localId, v, c }; })();
  const commitName = () => { if (draft.trim() && draft.trim() !== b.name) engine.setBinder(b.id, { name: draft }); else setDraft(b.name); };

  return (
    <div className="mb-open">
      <div className="mb-bar">
        <button type="button" className="tp-quiet" onClick={() => setOpenId(null)}>‹ My binders</button>
        <input className="tc-input mb-name" value={draft} maxLength={BINDER_NAME} aria-label="Binder name"
          onChange={(e) => setDraft(e.target.value)} onBlur={commitName}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <span className="mb-count">{filled} card{filled === 1 ? "" : "s"}</span>
        <button type="button" className="lg-go" onClick={() => setPicker({ many: true })}>Add cards</button>
        <button type="button" className="tp-quiet" onClick={() => setAsking(true)}>Delete</button>
      </div>
      {!filled && <p className="ev-quiet">An empty binder. Tap a pocket, or Add cards, to fill it from any set you collect.</p>}
      <BinderPages count={count} page={page} onPage={(p) => { setPage(p); setSel(null); }} render={(i) => {
        const k = b.pockets[i];
        if (!k) {
          return (
            <button type="button" className="cd-pocket mb-slot" onClick={() => setPicker({ at: i })} aria-label={`Empty pocket ${i + 1}, add a card`}>
              <span aria-hidden="true">+</span>
            </button>
          );
        }
        const { id, v } = parseKey(k);
        const held = !!cards[id]?.[v];
        return (
          <button type="button" className={`cd-pocket got${held ? "" : " ghost"}${sel === i ? " sel" : ""}`} aria-pressed={sel === i}
            onClick={() => setSel(sel === i ? null : i)} aria-label={`Pocket ${i + 1}${held ? "" : ", no longer held"}`}>
            <Face sets={sets} cards={cards} k={k} />
            {!held && <span className="mb-gone">Not held</span>}
          </button>
        );
      }} />
      {selCard && (
        <div className="mb-tools" role="toolbar" aria-label="Selected card">
          <span><RarityMark rarity={selCard.c[3]} /> {selCard.c[1]} · {VARIANT_NAME[selCard.v]}</span>
          <button type="button" className="tp-quiet" onClick={() => onLook(selCard.setId, selCard.localId)}>View</button>
          <button type="button" className="tp-quiet" disabled={sel === 0} onClick={() => move(sel, sel - 1)} aria-label="Move one pocket back">‹ Move</button>
          <button type="button" className="tp-quiet" disabled={sel >= count - 1} onClick={() => move(sel, sel + 1)} aria-label="Move one pocket on">Move ›</button>
          <button type="button" className="tp-quiet" onClick={() => { const p = [...b.pockets]; p[sel] = null; put(p); setSel(null); }}>Remove</button>
        </div>
      )}
      {/* PORTALLED: the Cards page's main area isolates, so a dialog drawn
          inside it sat under the page's pinned header and tabs. */}
      {picker && createPortal(
        <CardPicker sets={sets} cards={cards} many={!!picker.many} onClose={() => setPicker(null)}
          onPick={(keys) => {
            engine.addToBinder(b.id, keys, picker.many ? null : picker.at);
            setPicker(null);
          }} />,
        document.body,
      )}
      {asking && createPortal(
        <Confirm
          title={`Delete "${b.name}"?`}
          lines={[["Cards in it", filled]]}
          note="Only the binder goes. Every card stays in your collection."
          confirmLabel="DELETE"
          tone="warn"
          onConfirm={() => { engine.deleteBinder(b.id); setAsking(false); setOpenId(null); }}
          onCancel={() => setAsking(false)}
        />,
        document.body,
      )}
    </div>
  );
}

/* EVERY PRINTING YOU HOLD, from every set: one to fill a pocket, or several
   to add at once. A page of tiles at a time, so a big collection opens fast. */
const PICK_PAGE = 60;
const unpad = (s) => s.replace(/^0+(?=\w)/, "");

function CardPicker({ sets, cards, many, onPick, onClose }) {
  useModalLock();
  const dismiss = useDismiss(onClose);
  const [q, setQ] = useState("");
  const [setF, setSetF] = useState("");
  const [sort, setSort] = useState("set");
  const [chosen, setChosen] = useState([]);
  const [upTo, setUpTo] = useState(PICK_PAGE);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  }, [onClose]);
  useEffect(() => setUpTo(PICK_PAGE), [q, setF, sort]);

  const all = useMemo(() => CARD_SETS.flatMap((s) => (sets[s.id]?.CARDS ?? []).flatMap((c, i) => {
    const row = cards[`${s.id}-${c[0]}`];
    return ["h", "r", "n"].filter((v) => row?.[v] && c[4].includes(v)).map((v) => ({ key: `${s.id}-${c[0]}:${v}`, s: s.id, c, v, i }));
  })), [sets, cards]);
  const held = useMemo(() => new Set(all.map((x) => x.s)), [all]);
  const n = q.trim().toLowerCase();
  const shown = all.filter((x) => (!setF || x.s === setF)
    && (!n || x.c[1].toLowerCase().includes(n) || (x.c[6] ?? "").toLowerCase().includes(n) || unpad(x.c[0].toLowerCase()) === unpad(n)))
    .sort((a, b) => (sort === "rare" ? rungOf(b.c[3]) - rungOf(a.c[3]) : 0));
  const toggle = (k) => setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  return (
    <div className="sheet" {...dismiss}>
      <div className="confirm mb-picker" role="dialog" aria-modal="true" aria-label={many ? "Add cards to the binder" : "Choose a card"}
        onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cd-x" onClick={onClose} aria-label="Close">✕</button>
        <h3>{many ? "Add cards" : "Choose a card"}</h3>
        <div className="pk-bar">
          <input className="tc-input pk-q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search a card, number or illustrator" aria-label="Search your cards" />
          <select className="pk-sel" value={setF} onChange={(e) => setSetF(e.target.value)} aria-label="Set">
            <option value="">Every set</option>
            {CARD_SETS.filter((s) => held.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="pk-sel" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="set">Set order</option>
            <option value="rare">Rarest first</option>
          </select>
        </div>
        <div className="mb-pick-scroll">
          {!all.length ? <p className="ev-quiet">No cards yet - open a pack in Cards.</p>
            : !shown.length ? <p className="ev-quiet">No card of yours matches.</p> : (
              <div className="mb-pick-grid">
                {shown.slice(0, upTo).map((x) => {
                  const on = chosen.includes(x.key);
                  return (
                    <button key={x.key} type="button" className="mb-pick" aria-pressed={many ? on : undefined}
                      onClick={() => (many ? toggle(x.key) : onPick([x.key]))}
                      aria-label={`${x.c[1]}, ${RARITY[x.c[3]].name}, ${VARIANT_NAME[x.v]}`}>
                      <CardFace setId={x.s} card={x.c} variant={x.v} still lazy />
                      {/* A reverse holo and a normal copy look alike this small: say which. */}
                      <small>{VARIANT_NAME[x.v]}</small>
                      {many && on && <b aria-hidden="true">{chosen.indexOf(x.key) + 1}</b>}
                    </button>
                  );
                })}
              </div>
            )}
          {shown.length > upTo && (
            <button type="button" className="tp-quiet mb-more" onClick={() => setUpTo((u) => u + PICK_PAGE)}>
              Show more ({shown.length - upTo} left)
            </button>
          )}
        </div>
        {many && (
          <footer>
            <span>{chosen.length} selected</span>
            <button type="button" className="lg-go" disabled={!chosen.length} onClick={() => onPick(chosen)}>
              Add {chosen.length || ""} to the binder
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
