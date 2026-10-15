/* BINDER PAGES AND YOUR OWN BINDERS (asked for, 2026-10-13; a real binder
   since 2026-10-15).

   `BinderPages` is the one way a binder is drawn: nine-pocket sleeves in a
   leather binder, two pages and the rings between them where there is room,
   one page on a phone. A page TURNS in 3D (a leaf hinged at the rings, the
   next page on its back) whichever way it was asked - the buttons, a swipe,
   the arrow keys, the slider, a card dragged to an edge - because the
   animation follows the page, not the control. A new set or filter (its
   `bookKey`) and reduced motion land at once.

   `MyBinders` is binders you fill yourself, from any set and in any order
   (cards.js `cleanBinders`; the engine's `newBinder`, `setBinder`,
   `deleteBinder`, `addToBinder`): a shelf of leather covers that open and
   close, cards moved by DRAG AND DROP (a hold first on touch, so a swipe or a
   scroll is never a drag), and a cover you colour and sew patches on
   (`CoverEditor`). A pocket whose card you no longer hold keeps it, drawn
   faded - the layout is never lost to a sale. */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CARD_SETS } from "../../data/cards/index.js";
import {
  CARD_RARITIES, PAGE_POCKETS, BINDER_MAX, BINDER_NAME, BINDER_POCKETS, RARITY, rungOf, coverOf, COVER_CLASSIC, COVER_SMOOTH, PATCH_MAX, PATCH_DUST, setOpen, SET_LEVEL,
} from "../../game/cards.js";
import { badgesWon } from "../../game/league.js";
import CardFace, { RarityMark, VARIANT_NAME, priceOf, usd, Money, PriceInfo } from "./Card.jsx";
import { logoUrl } from "./load.js";
import Confirm from "../Confirm.jsx";
import { useDismiss, useModalLock } from "../modal.js";

// "me01-187:h" -> its set, card number and printing.
export const parseKey = (key) => {
  const [id, v] = key.split(":");
  const cut = id.lastIndexOf("-");
  return { id, v, setId: id.slice(0, cut), localId: id.slice(cut + 1) };
};

const FLIP_MS = 650;       // = --flip-ms in styles.css
const OPEN_MS = 900;       // = --open-ms
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* LEATHER: two layers of SVG noise - a fine pebble and a coarse mottle - over
   the colour, built here because styles.css may name no url(). One string,
   so the browser rasterises it once for every cover. */
const noise = (f, o, m) => `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${f}' numOctaves='${o}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${m}'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;
// The mottle is kept faint: stronger, it read as dirt (2026-10-15).
export const GRAIN = `${noise(0.85, 3, "1.2 0 0 0 -.5")}, ${noise(0.06, 2, ".5 0 0 0 -.2")}`;
const GRAIN_STYLE = { "--grain": GRAIN };
// Smooth leather: a fine grain only, no mottle.
const SMOOTH_STYLE = { "--grain": noise(0.9, 2, ".5 0 0 0 -.25") };
const isSmooth = (color) => COVER_SMOOTH.includes(color);
const leatherStyle = (color) => (isSmooth(color) ? SMOOTH_STYLE : GRAIN_STYLE);

// A set binder's leather is its series'; a finished master set's is gold.
export const leatherOf = (setId) => (setId.startsWith("me") ? "navy" : setId.startsWith("sv") ? "plum" : setId.startsWith("swsh") ? "teal" : "oxblood");

const assetUrl = (path) => new URL(path, document.baseURI).href;
const splitPatch = (id) => [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
const patchName = (id) => {
  const [kind, of] = splitPatch(id);
  return kind === "set" ? CARD_SETS.find((s) => s.id === of)?.name ?? of
    : `${of.replace(/^[a-z]+-/, "").split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}'s badge`;
};

// A sewn-on patch: a set's logo on twill, or a League badge stitched round.
export function Patch({ id, x, y, className = "", ...rest }) {
  const [kind, of] = splitPatch(id);
  return (
    <span className={`lc-patch ${kind} ${className}`} style={x == null ? undefined : { left: `${x}%`, top: `${y}%` }} {...rest}>
      <img src={kind === "set" ? logoUrl(of) : assetUrl(`badges/${of}.png`)} alt="" draggable="false" />
    </span>
  );
}

/* A LEATHER COVER: the colour, stitching, the patches where they were sewn,
   and the name stamped in foil. `logo` debosses a set's logo (a set
   binder's); `state` "done" lifts it out in colour. */
export function Cover({ color, patches = [], title, logo, state = "", className = "", children }) {
  return (
    <span className={`lc leather lc-${color}${isSmooth(color) ? " smooth" : ""}${state ? ` ${state}` : ""} ${className}`} style={leatherStyle(color)}>
      <span className="lc-stitch" aria-hidden="true" />
      {logo && <img className="lc-logo" src={logoUrl(logo)} alt="" draggable="false" />}
      {patches.map((p) => <Patch key={p.id} id={p.id} x={p.x} y={p.y} />)}
      {title && <b className="lc-title">{title}</b>}
      {children}
    </span>
  );
}

const Rings = () => <>{[0, 1, 2].map((k) => <i key={k} className="bk-ring" />)}</>;

export function BinderPages({ count, page, onPage, render, bookKey = "", leather = "navy", flap = null, dragging }) {
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

  /* THE TURN: `shown` is the spread on the table, `flip` the leaf in the
     air. A new target mid-turn starts from the spread still showing. */
  const [shown, setShown] = useState(left);
  const [flip, setFlip] = useState(null);
  const last = useRef({ bookKey, show });
  useEffect(() => {
    const same = last.current.bookKey === bookKey && last.current.show === show;
    last.current = { bookKey, show };
    if (!same || reduced() || shown === left) { setFlip(null); setShown(left); return undefined; }
    setFlip({ from: shown, to: left, n: performance.now() });
    const t = setTimeout(() => { setShown(left); setFlip(null); }, FLIP_MS);
    return () => clearTimeout(t);
  }, [left, bookKey, show]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A SWIPE turns on touch; a hold that became a card drag (`dragging`) does not.
  const onPointerDown = (e) => {
    if (e.pointerType === "mouse") return;
    const x0 = e.clientX, y0 = e.clientY, t0 = performance.now();
    const up = (u) => {
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      const dx = u.clientX - x0, dy = u.clientY - y0;
      if (u.type !== "pointerup" || dragging?.() || Math.abs(dx) < 48 || Math.abs(dx) < 1.6 * Math.abs(dy) || performance.now() - t0 > 700) return;
      turn(dx < 0 ? left + show : left - show);
      // The finger lifted on a pocket: that is not a tap on it.
      const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
      addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => removeEventListener("click", stop, { capture: true }), 400);
    };
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };
  const onKeyDown = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();      // the map's walk keys
    turn(e.key === "ArrowRight" ? left + show : left - show);
  };

  const sheet = (p, side) => (
    <div className={`bk-page ${side}${p >= pages ? " blank" : ""}`}>
      <div className="bp-grid">
        {p < pages && Array.from({ length: PAGE_POCKETS }, (_, j) => {
          const i = p * PAGE_POCKETS + j;
          return i < count ? <Fragment key={i}>{render(i)}</Fragment> : <span key={i} className="bp-void" />;
        })}
      </div>
      <span className="bp-no">{p < pages ? p + 1 : ""}</span>
    </div>
  );
  const two = show === 2, from = flip?.from, to = flip?.to, next = flip && to > from;
  // What lies on the table under a turning leaf, and what the leaf carries.
  const L = two ? (flip ? (next ? from : to) : shown) : null;
  const R = two ? (flip ? (next ? to + 1 : from + 1) : shown + 1) : (flip ? (next ? to : from) : shown);
  const leaf = flip && (two
    ? (next ? { cls: "r", front: from + 1, back: to } : { cls: "l", front: from, back: to + 1 })
    : (next ? { cls: "one-next", front: from } : { cls: "one-prev", front: to }));
  const phase = flap ? (flap.closing ? " closing" : " opening") : "";

  return (
    <div className="bp" ref={ref}>
      <div className="bp-book">
        <button type="button" className="bp-turn" data-turn="prev" disabled={left === 0 || !!flap} onClick={() => turn(left - show)} aria-label="Previous page">‹</button>
        <div className={`bk leather lc-${leather}${isSmooth(leather) ? " smooth" : ""}${two ? " two" : ""}${phase}`} style={leatherStyle(leather)} tabIndex={0}
          aria-label={`Binder, page ${left + 1} of ${pages}. Arrow keys turn the page.`} onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
          <div className="bk-in">
            {two && sheet(L, "l")}
            <span className="bk-spine" aria-hidden="true"><Rings /></span>
            {sheet(R, "r")}
            {leaf && (
              <div key={flip.n} className={`bk-leaf ${leaf.cls}`} aria-hidden="true" inert="">
                <div className="bk-face front">{sheet(leaf.front, "f")}</div>
                {leaf.back != null && <div className="bk-face back">{sheet(leaf.back, "f")}</div>}
              </div>
            )}
            {flap && (
              <div className={`bk-leaf bk-flap ${two ? "r" : "one-next"}`} aria-hidden="true">
                <div className="bk-face front">{flap.node}</div>
                {two && <div className="bk-face back bk-inside leather" />}
              </div>
            )}
          </div>
        </div>
        <button type="button" className="bp-turn" data-turn="next" disabled={left + show >= pages || !!flap} onClick={() => turn(left + show)} aria-label="Next page">›</button>
      </div>
      {pages > 1 && (
        <div className="bp-nav">
          <input type="range" min={1} max={pages} value={left + 1} onChange={(e) => turn(Number(e.target.value) - 1)} aria-label="Jump to page" />
          <span>Page {left + 1}{two && left + 2 <= pages ? `-${left + 2}` : ""} of {pages}</span>
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

// What a binder is worth in real life: one copy a pocket, held ones only, raw.
const binderValue = (b, cards, prices) => b.pockets.reduce((t, k) => {
  if (!k) return t;
  const { id, v, setId, localId } = parseKey(k);
  return t + (cards[id]?.[v] ? priceOf(prices, setId, localId, v) : 0);
}, 0);

const HOLD_MS = 300;       // a touch held this long picks the card up
const EDGE_MS = 600;       // a card held over ‹ or › this long turns the page

export function MyBinders({ binders, sets, cards, engine, onLook, prices, dust = 0, level = 1, beaten }) {
  const [openId, setOpenId] = useState(null);
  const [phase, setPhase] = useState("open");      // "opening" | "open" | "closing"
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState(null);
  const [picker, setPicker] = useState(null);       // { at } fills one pocket, { many: true } adds several
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState(null);           // { from, over, x, y, w }
  const b = binders.find((x) => x.id === openId) ?? null;
  const [draft, setDraft] = useState("");
  useEffect(() => { setDraft(b?.name ?? ""); }, [b?.id, b?.name]);
  // Hold state lives in refs above any early return (window listeners read them).
  const dragRef = useRef(null);
  const ghostRef = useRef(null);
  const droppedAt = useRef(0);

  useEffect(() => {
    if (phase === "open") return undefined;
    const t = setTimeout(() => { if (phase === "closing") setOpenId(null); setPhase("open"); }, OPEN_MS);
    return () => clearTimeout(t);
  }, [phase]);
  const open = (id) => { setOpenId(id); setPage(0); setSel(null); setPhase(reduced() ? "open" : "opening"); };
  const close = () => { setSel(null); if (reduced()) setOpenId(null); else setPhase("closing"); };

  if (!b) {
    return (
      <div className="mb-shelf">
        {binders.map((x) => {
          const n = x.pockets.filter(Boolean).length, value = binderValue(x, cards, prices);
          const c = coverOf(x);
          return (
            <button key={x.id} type="button" className="mb-book" onClick={() => open(x.id)} aria-label={`Open ${x.name}, ${n} card${n === 1 ? "" : "s"}`}>
              <Cover color={c.color} patches={c.patches} title={x.name} />
              <span className="mb-meta">{n} card{n === 1 ? "" : "s"}{value > 0 && <b>{usd(value)}</b>}</span>
            </button>
          );
        })}
        {binders.length < BINDER_MAX && (
          <button type="button" className="mb-book mb-new" onClick={() => { const id = engine.newBinder(); if (id) open(id); }}>
            <span className="lc mb-blank" aria-hidden="true"><b>+</b>New binder</span>
            <span className="mb-meta">Cards from any set</span>
          </button>
        )}
      </div>
    );
  }

  const cover = coverOf(b);
  const filled = b.pockets.filter(Boolean).length;
  // Always one empty pocket after the last card, whole pages, and at least a
  // full spread - a new binder opened on a blank right-hand page.
  const count = Math.min(BINDER_POCKETS, Math.max(2 * PAGE_POCKETS, Math.ceil((b.pockets.length + 1) / PAGE_POCKETS) * PAGE_POCKETS));
  const put = (pockets) => engine.setBinder(b.id, { pockets });
  const swap = (from, to) => {
    if (to < 0 || to >= count || to === from) return;
    const p = [...b.pockets];
    while (p.length <= Math.max(from, to)) p.push(null);
    [p[from], p[to]] = [p[to], p[from]];
    put(p);
  };
  const move = (from, to) => {
    if (to < 0 || to >= count) return;
    swap(from, to);
    setSel(to);
    setPage(Math.floor(to / PAGE_POCKETS));
  };
  const selKey = sel != null ? b.pockets[sel] : null;
  const selCard = selKey && (() => { const { setId, localId, v } = parseKey(selKey); const c = sets[setId]?.CARDS.find((x) => x[0] === localId); return c && { setId, localId, v, c }; })();
  const commitName = () => { if (draft.trim() && draft.trim() !== b.name) engine.setBinder(b.id, { name: draft }); else setDraft(b.name); };

  /* DRAG AND DROP, by pointer events on the window (never pointer capture):
     a mouse picks the card up once it moves, a touch once it is HELD still,
     and from then on the page does not scroll under it. Dropped on another
     pocket the two swap; held over ‹ or › the page turns. */
  const end = (drop) => {
    const d = dragRef.current;
    if (!d) return;
    clearTimeout(d.hold);
    clearTimeout(d.edgeT);
    cancelAnimationFrame(d.raf);
    d.off();
    dragRef.current = null;
    if (!d.on) return;
    droppedAt.current = performance.now();
    if (drop && d.over != null) swap(d.from, d.over);
    setDrag(null);
    const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
    addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", stop, { capture: true }), 300);
  };
  const press = (e, i) => {
    if (e.button > 0 || phase !== "open" || dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const d = { from: i, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false, over: null, edge: null, touch: e.pointerType !== "mouse", w: rect.width };
    /* The page cannot scroll under a held card, and on a short screen (a
       phone held sideways) the book is taller than it: near the top or
       bottom edge the card scrolls what holds the binder. */
    let sc = e.currentTarget.parentElement;
    while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
    const scroller = sc ?? document.scrollingElement;
    const begin = (x, y) => {
      d.on = true;
      setSel(null);
      setDrag({ from: i, over: null, x, y, w: d.w });
      const roll = () => {
        // Under the page's pinned header, not under the screen's top: that edge is covered.
        const top = Math.max(scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top,
          document.querySelector(".tc-head")?.getBoundingClientRect().bottom ?? 0);
        const bottom = scroller === document.scrollingElement ? innerHeight : scroller.getBoundingClientRect().bottom;
        const v = d.y < top + 56 ? -8 : d.y > bottom - 56 ? 8 : 0;
        if (v) { scroller.scrollTop += v; aim(); }
        d.raf = requestAnimationFrame(roll);
      };
      d.raf = requestAnimationFrame(roll);
    };
    const moved = (ev) => {
      const x = ev.clientX, y = ev.clientY;
      if (!d.on) {
        const far = Math.hypot(x - d.x0, y - d.y0);
        if (!d.touch && far > 6) begin(x, y);
        else if (d.touch && far > 10) end(false);     // a scroll or a swipe, not a drag
        return;
      }
      d.x = x;
      d.y = y;
      if (ghostRef.current) ghostRef.current.style.transform = `translate(${x - d.w / 2}px, ${y - d.w * 0.7}px) rotate(-4deg) scale(1.06)`;
      aim();
    };
    // What the held card is over: a pocket to drop on, or a turn button.
    const aim = () => {
      const el = document.elementFromPoint(d.x, d.y);
      const pk = el?.closest?.("[data-pocket]");
      const over = pk ? Number(pk.dataset.pocket) : null;
      if (over !== d.over) { d.over = over; setDrag((s) => s && { ...s, over }); }
      // Held over a turn button, it is pressed - and again while the card stays.
      const edge = el?.closest?.("[data-turn]") ?? null;
      if (edge !== d.edge) {
        d.edge = edge;
        clearTimeout(d.edgeT);
        const dwell = () => { d.edgeT = setTimeout(() => { if (!edge.disabled) edge.click(); dwell(); }, EDGE_MS); };
        if (edge) dwell();
      }
    };
    const upped = () => end(true);
    const cancelled = () => end(false);
    const key = (k) => { if (k.key === "Escape") end(false); };
    const tm = (t) => { if (d.on && t.cancelable) t.preventDefault(); };
    addEventListener("pointermove", moved);
    addEventListener("pointerup", upped);
    addEventListener("pointercancel", cancelled);
    addEventListener("keydown", key);
    addEventListener("touchmove", tm, { passive: false });
    d.off = () => {
      removeEventListener("pointermove", moved);
      removeEventListener("pointerup", upped);
      removeEventListener("pointercancel", cancelled);
      removeEventListener("keydown", key);
      removeEventListener("touchmove", tm);
    };
    if (d.touch) d.hold = setTimeout(() => begin(d.x0, d.y0), HOLD_MS);
    dragRef.current = d;
  };
  const value = binderValue(b, cards, prices);
  const flap = phase !== "open" && { closing: phase === "closing", node: <Cover color={cover.color} patches={cover.patches} title={b.name} /> };

  return (
    <div className="mb-open">
      <div className="mb-bar">
        <button type="button" className="tp-quiet" onClick={close}>‹ Shelf</button>
        <input className="tc-input mb-name" value={draft} maxLength={BINDER_NAME} aria-label="Binder name"
          onChange={(e) => setDraft(e.target.value)} onBlur={commitName}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        {prices && value > 0 && <span className="mb-value"><Money cents={value} /><PriceInfo prices={prices} /></span>}
        <span className="mb-count">{filled} card{filled === 1 ? "" : "s"}</span>
        <span className="mb-actions">
          <button type="button" className="tp-quiet" onClick={() => setEditing(true)}>Cover</button>
          <button type="button" className="tp-quiet" onClick={() => setAsking(true)}>Delete</button>
          <button type="button" className="lg-go" onClick={() => setPicker({ many: true })}>Add cards</button>
        </span>
      </div>
      <p className="mb-hint">
        {!filled ? "An empty binder. Tap a pocket, or Add cards, to fill it from any set you collect."
          : "Drag a card onto another pocket to swap them - hold it over ‹ or › to turn the page. On a phone, hold the card first."}
      </p>
      <BinderPages count={count} page={page} leather={cover.color} bookKey={b.id} flap={flap || null}
        dragging={() => Boolean(dragRef.current?.on) || performance.now() - droppedAt.current < 250}
        onPage={(p) => { setPage(p); setSel(null); }} render={(i) => {
          const k = b.pockets[i];
          const cls = `${drag?.from === i ? " lifting" : ""}${drag && drag.over === i && drag.from !== i ? " drop-here" : ""}`;
          if (!k) {
            return (
              <button type="button" className={`cd-pocket mb-slot${cls}`} data-pocket={i} onClick={() => setPicker({ at: i })}
                aria-label={`Empty pocket ${i + 1}, add a card`}>
                <span aria-hidden="true">+</span>
              </button>
            );
          }
          const { id, v } = parseKey(k);
          const held = !!cards[id]?.[v];
          return (
            <button type="button" className={`cd-pocket got${held ? "" : " ghost"}${sel === i ? " sel" : ""}${cls}`} aria-pressed={sel === i}
              data-pocket={i} onPointerDown={(e) => press(e, i)} onContextMenu={(e) => e.preventDefault()}
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
      {drag && b.pockets[drag.from] && createPortal(
        <div ref={ghostRef} className="mb-ghost" aria-hidden="true"
          style={{ width: drag.w, transform: `translate(${drag.x - drag.w / 2}px, ${drag.y - drag.w * 0.7}px) rotate(-4deg) scale(1.06)` }}>
          <Face sets={sets} cards={cards} k={b.pockets[drag.from]} />
        </div>,
        document.body,
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
      {editing && createPortal(
        <CoverEditor binder={b} engine={engine} dust={dust} level={level} beaten={beaten} onClose={() => setEditing(false)} />,
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

/* THE COVER, MADE YOURS: a leather colour, and patches sewn where you drag
   them. A set's patch costs PATCH_DUST, once; a gym badge you have won is a
   patch for free. Every change saves as it is made - there is no Cancel to
   lose it to. */
// Where a new patch is sewn: spaced so no two overlap, clear of the foil name at the foot.
const SPOTS = [[50, 20], [50, 40], [30, 60], [72, 60], [30, 78], [72, 78]];
function CoverEditor({ binder, engine, dust, level, beaten, onClose }) {
  useModalLock();
  const dismiss = useDismiss(onClose);
  const [tab, setTab] = useState("yours");
  const [moving, setMoving] = useState(null);       // { id, x, y } while a patch is dragged
  const [note, setNote] = useState("");
  const art = useRef(null);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  }, [onClose]);
  const cover = coverOf(binder);
  const sets = engine.state.patches.filter((s) => CARD_SETS.some((m) => m.id === s));
  const won = badgesWon(beaten);
  const owned = [...sets.map((s) => `set:${s}`), ...won.map((g) => `badge:${g}`)];
  const on = new Set(cover.patches.map((p) => p.id));
  const sew = (patches) => engine.setBinder(binder.id, { cover: { color: cover.color, patches } });
  const place = (id) => {
    if (on.has(id)) return sew(cover.patches.filter((p) => p.id !== id));
    if (cover.patches.length >= PATCH_MAX) return setNote(`A cover holds ${PATCH_MAX} patches - take one off first.`);
    const free = SPOTS.find(([x, y]) => !cover.patches.some((p) => Math.abs(p.x - x) < 20 && Math.abs(p.y - y) < 14)) ?? SPOTS[0];
    setNote("");
    return sew([...cover.patches, { id, x: free[0], y: free[1] }]);
  };
  const buy = (sid) => {
    if (!engine.buyPatch(sid)) return setNote("That patch could not be bought.");
    setTab("yours");
    return cover.patches.length < PATCH_MAX ? place(`set:${sid}`) : setNote("Bought - it is in Yours.");
  };
  // Dragging a patch on the cover: drawn from `moving`, saved once on release.
  const grab = (e, p) => {
    const r = art.current.getBoundingClientRect();
    const at = (ev) => ({ id: p.id, x: Math.min(92, Math.max(8, ((ev.clientX - r.left) / r.width) * 100)), y: Math.min(92, Math.max(8, ((ev.clientY - r.top) / r.height) * 100)) });
    let last = { id: p.id, x: p.x, y: p.y };
    const mv = (ev) => { last = at(ev); setMoving(last); };
    const up = () => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      setMoving(null);
      sew(cover.patches.map((q) => (q.id === p.id ? { ...q, x: last.x, y: last.y } : q)));
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };
  const shown = cover.patches.map((p) => (moving?.id === p.id ? moving : p));
  const shop = CARD_SETS.filter((s) => !engine.state.patches.includes(s.id));

  return (
    <div className="sheet" {...dismiss}>
      <div className="confirm ce" role="dialog" aria-modal="true" aria-label={`Cover of ${binder.name}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cd-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="ce-art" ref={art}>
          <Cover color={cover.color} title={binder.name} />
          {shown.map((p) => (
            <Patch key={p.id} id={p.id} x={p.x} y={p.y} className={`ce-patch${moving?.id === p.id ? " moving" : ""}`}
              onPointerDown={(e) => grab(e, p)} role="img" aria-label={patchName(p.id)} />
          ))}
        </div>
        <div className="ce-body">
          <h3>Cover</h3>
          {[["Classic leather", COVER_CLASSIC], ["Smooth leather", COVER_SMOOTH]].map(([title, list]) => (
            <div key={title} className="ce-leather">
              <p className="ce-k">{title}</p>
              <div className="ce-swatches" role="radiogroup" aria-label={title}>
                {list.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={cover.color === c} aria-label={c} data-tip={c[0].toUpperCase() + c.slice(1)}
                    className={`ce-swatch leather lc-${c}${isSmooth(c) ? " smooth" : ""}`} style={leatherStyle(c)}
                    onClick={() => engine.setBinder(binder.id, { cover: { color: c, patches: cover.patches } })} />
                ))}
              </div>
            </div>
          ))}
          <p className="ce-k">Patches <small>{cover.patches.length} of {PATCH_MAX} sewn on · drag one on the cover to move it</small></p>
          <div className="you-seg ce-tabs" role="radiogroup" aria-label="Patches">
            {[["yours", `Yours · ${owned.length}`], ["shop", "Shop"]].map(([k, name]) => (
              <button key={k} type="button" role="radio" aria-checked={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{name}</button>
            ))}
          </div>
          {note && <p className="ce-note" role="status">{note}</p>}
          <div className="ce-scroll">
            {tab === "yours" && (owned.length ? (
              <div className="ce-grid">
                {owned.map((id) => (
                  <button key={id} type="button" className={`ce-tile${on.has(id) ? " on" : ""}`} aria-pressed={on.has(id)} onClick={() => place(id)}>
                    <Patch id={id} />
                    <small>{patchName(id)}</small>
                    <em>{on.has(id) ? "Take off" : "Sew on"}</em>
                  </button>
                ))}
              </div>
            ) : <p className="ev-quiet">No patches yet. Buy a set's patch in Shop, or win gym badges in Battles - each badge is a patch.</p>)}
            {tab === "yours" && <p className="ce-foot">Gym badges won: {won.length}. Every badge you win in Battles joins your patches.</p>}
            {tab === "shop" && (
              <div className="ce-grid">
                {shop.map((s) => {
                  const openNow = setOpen(s.id, level);
                  return (
                    <div key={s.id} className="ce-tile buy">
                      <Patch id={`set:${s.id}`} />
                      <small>{s.name}</small>
                      {openNow ? (
                        <button type="button" className="lg-go quiet" disabled={dust < PATCH_DUST} onClick={() => buy(s.id)}>
                          {PATCH_DUST.toLocaleString()} dust
                        </button>
                      ) : <em className="ce-lock">Opens at Lv {SET_LEVEL[s.id]}</em>}
                    </div>
                  );
                })}
              </div>
            )}
            {tab === "shop" && <p className="ce-foot">You have {dust.toLocaleString()} Card Dust. A patch is a look - it changes nothing else.</p>}
          </div>
          <button type="button" className="lg-go ce-done" onClick={onClose}>Done</button>
        </div>
      </div>
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
  const [rarF, setRarF] = useState("");
  const [chosen, setChosen] = useState([]);
  const [upTo, setUpTo] = useState(PICK_PAGE);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", esc, true);
    return () => removeEventListener("keydown", esc, true);
  }, [onClose]);
  useEffect(() => setUpTo(PICK_PAGE), [q, setF, rarF, sort]);

  const all = useMemo(() => CARD_SETS.flatMap((s) => (sets[s.id]?.CARDS ?? []).flatMap((c, i) => {
    const row = cards[`${s.id}-${c[0]}`];
    return ["h", "r", "n"].filter((v) => row?.[v] && c[4].includes(v)).map((v) => ({ key: `${s.id}-${c[0]}:${v}`, s: s.id, c, v, i }));
  })), [sets, cards]);
  const held = useMemo(() => new Set(all.map((x) => x.s)), [all]);
  // The rarities you hold, in the set picked - a rung you have none of is never offered.
  const rarities = useMemo(() => CARD_RARITIES.filter((r) => all.some((x) => x.c[3] === r && (!setF || x.s === setF))), [all, setF]);
  const n = q.trim().toLowerCase();
  const shown = all.filter((x) => (!setF || x.s === setF) && (!rarF || x.c[3] === rarF)
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
          <select className="pk-sel" value={setF} onChange={(e) => { setSetF(e.target.value); setRarF(""); }} aria-label="Set">
            <option value="">Every set</option>
            {CARD_SETS.filter((s) => held.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="pk-sel" value={rarF} onChange={(e) => setRarF(e.target.value)} aria-label="Rarity">
            <option value="">Every rarity</option>
            {rarities.map((r) => <option key={r} value={r}>{RARITY[r].name}</option>)}
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
