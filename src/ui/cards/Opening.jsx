/* THE PACK OPENING (docs/cards.md, Animation) - the one showpiece, built for
   suspense and payoff (your call, 2026-10-02).

   The pack is already decided AND saved (`engine.openCardPack`) before this
   mounts, so a reload mid-scene loses nothing, and nothing here can change a
   card. Beats: the pack, in one of the set's real wrappers, floats; a tap
   CHARGES it (it shakes, light leaks from the top), it TEARS in a spark
   burst, and the cards are dealt face down. Commons flip fast. A hit's back
   trembles and glows its rarity's colour - a plain rare does not, so the glow
   is the tell - and its tap charges, flashes white, flips, bursts and stamps
   its rarity; an Illustration rare or better dims the room and turns slowly
   under rays, a Special or Mega shakes the screen and rains confetti. Pips
   along the foot fill as you go (the daily first pack lights its hits'
   pips from the start). Skip goes straight to the summary, which is also
   where reduced motion lands.

   Every beat moves on only from the beat it follows: a Skip pressed mid-tear
   was dragged back to the first card by the tear's timers (found in QA).
   Keys: Space/Enter advances, Escape skips (and on the summary, closes). */
import { useEffect, useRef, useState } from "react";
import { RARITY, isHit, rungOf, dustOf } from "../../game/cards.js";
import { useModalLock } from "../modal.js";
import CardFace, { RarityMark, VARIANT_NAME } from "./Card.jsx";
import { cardUrl, backUrl, packUrl, logoUrl } from "./load.js";

const CHARGE = 650, TEAR = 520, DEAL = 620, BUILD = 700;
const BIG = new Set(["illustration", "special", "mega"]);
const LOUD = new Set(["special", "mega"]);
const SPARKS = Array.from({ length: 14 }, (_, i) => i);
const CONFETTI = Array.from({ length: 28 }, (_, i) => i);
// A hit is always holo, so it is named by its rarity; below a hit the foil is the news.
const kindOf = (p) => (isHit(p.rarity) || p.variant === "n" ? RARITY[p.rarity].name : `${RARITY[p.rarity].name} · ${VARIANT_NAME[p.variant]}`);
const TEASE = { double: "Something's here…", ultra: "Something shines…", illustration: "Something special…",
  special: "Something very special…", mega: "Something incredible…" };

export default function Opening({ set, result, wrapper, again, onAgain, onBinder, onDone, onScene }) {
  useModalLock();
  /* THE SCENE OWNS THE SCREEN: the bars step aside (`body.cd-opening`). It
     sits inside the page's layer, under the tab bar's, and on a phone the
     bar covered its Binder and Done (found in QA). */
  useEffect(() => {
    document.body.classList.add("cd-opening");
    return () => document.body.classList.remove("cd-opening");
  }, []);
  const id = set.SET.id;
  const pulls = result.pulls;
  const rowOf = (p) => set.CARDS.find((c) => c[0] === p.localId);
  // "pack" | "charge" | "tear" | "deal" | { k, up, build } | "summary"
  const [stage, setStage] = useState("pack");
  const [ready, setReady] = useState(false);
  const keep = useRef([]);
  const live = useRef(null);
  /* Banners and tips wait while cards are face down (App's `cardScene`). */
  const hidden = stage !== "summary";
  useEffect(() => { onScene?.(hidden); }, [hidden, onScene]);
  useEffect(() => () => onScene?.(false), [onScene]);

  // Every face, the back and the wrapper load before the tear: no blank flip.
  useEffect(() => {
    const urls = [...pulls.map((p) => cardUrl(id, p.localId)), backUrl(), wrapper ? packUrl(id, wrapper) : logoUrl(id)];
    let left = urls.length;
    const done = () => { if (--left <= 0) setReady(true); };
    keep.current = urls.map((u) => { const img = new Image(); img.onload = img.onerror = done; img.src = u; return img; });
    const t = setTimeout(() => setReady(true), 1800);
    return () => clearTimeout(t);
  }, [id, pulls, wrapper]);

  const next = () => {
    if (stage === "pack") {
      if (!ready) return;
      setStage("charge");
      setTimeout(() => setStage((s) => (s === "charge" ? "tear" : s)), CHARGE);
      setTimeout(() => setStage((s) => (s === "tear" ? "deal" : s)), CHARGE + TEAR);
      setTimeout(() => setStage((s) => (s === "deal" ? { k: 0, up: false } : s)), CHARGE + TEAR + DEAL);
      return;
    }
    if (typeof stage !== "object" || stage.build) return;
    const p = pulls[stage.k];
    if (!stage.up) {
      const announce = () => { if (live.current) live.current.textContent = `${p.isNew ? "New! " : ""}${RARITY[p.rarity].name}: ${rowOf(p)?.[1] ?? ""}`; };
      if (isHit(p.rarity) || stage.k === pulls.length - 1) {
        /* A hit charges before it turns - and so does THE LAST CARD, whatever
           it is (your call, 2026-10-02): every pack ends on a reveal. */
        const k = stage.k;
        setStage({ k, up: false, build: true });
        setTimeout(() => { setStage((s) => (s.k === k && s.build ? { k, up: true } : s)); announce(); }, BUILD);
      } else { setStage({ k: stage.k, up: true }); announce(); }
    } else if (stage.k + 1 < pulls.length) setStage({ k: stage.k + 1, up: false });
    else setStage("summary");
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === " " || e.key === "Enter") { if (stage !== "summary") { e.preventDefault(); next(); } }
      else if (e.key === "Escape") { e.preventDefault(); stage === "summary" ? onDone() : setStage("summary"); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const cur = typeof stage === "object" ? pulls[stage.k] : null;
  const curHit = cur && isHit(cur.rarity);
  /* THE LAST CARD keeps its secret: it pulses white, never its rarity's
     colour, until the charge - which is where a hit's colour comes in. */
  const last = cur && stage.k === pulls.length - 1;
  const dramatic = cur && (curHit || last);
  const shownUp = cur && stage.up;
  const tone = shownUp && curHit ? cur.rarity : stage === "summary" && result.god ? "special" : null;
  const big = shownUp && BIG.has(cur.rarity);
  const loud = shownUp && LOUD.has(cur.rarity);
  const dust = pulls.filter((p) => !p.isNew).reduce((n, p) => n + dustOf(p.rarity, p.variant), 0);
  const seenK = typeof stage === "object" ? stage.k + (stage.up ? 1 : 0) : stage === "summary" ? pulls.length : 0;
  const hits = pulls.filter((p) => isHit(p.rarity)).sort((a, b) => rungOf(b.rarity) - rungOf(a.rarity));
  const rest = pulls.filter((p) => !isHit(p.rarity)).sort((a, b) => rungOf(b.rarity) - rungOf(a.rarity));
  const packArt = wrapper ? packUrl(id, wrapper) : logoUrl(id);

  return (
    <div className={`cd-open${big ? " dim" : ""}${loud ? " loud" : ""}${result.god ? " god" : ""}${tone ? ` tone-${tone}` : ""}`}
      role="dialog" aria-modal="true" aria-label={`Opening a ${set.SET.name} pack`}>
      <div className="cd-live" aria-live="polite" ref={live} />
      <span className="cd-room" aria-hidden="true" />
      {stage !== "summary" && <button type="button" className="cd-skip" onClick={() => setStage("summary")}>Skip</button>}
      {result.daily && stage === "pack" && <p className="cd-daily">Daily first pack: its hits glow from the start</p>}

      {["pack", "charge", "tear", "deal"].includes(stage) && (
        <button type="button" className={`cd-bigpack is-${stage}`} onClick={next}
          aria-label="Tear the pack open" disabled={!ready && stage === "pack"}>
          <img src={packArt} alt="" draggable="false" />
          <span className="cd-sheen" aria-hidden="true" />
          <span className="cd-tear" aria-hidden="true" style={{ backgroundImage: `url(${packArt})` }} />
          {stage === "charge" && <span className="cd-leak" aria-hidden="true" />}
          {stage === "tear" && <span className="cd-burst at-top" aria-hidden="true">{SPARKS.map((i) => <i key={i} style={{ "--i": i }} />)}</span>}
          {stage === "pack" && <em>{ready ? "Tap to open" : "…"}</em>}
          {result.god && (stage === "tear" || stage === "deal") && <strong className="cd-godword">GOD PACK!</strong>}
        </button>
      )}
      {stage === "deal" && (
        <div className="cd-fan" aria-hidden="true">
          {pulls.map((p, k) => <i key={k} style={{ "--k": k, backgroundImage: `url(${backUrl()})` }} />)}
        </div>
      )}

      {cur && (
        <div className={`cd-stage${stage.build ? " build" : ""}`} onClick={next}>
          {big && <span className="cd-rays loop" aria-hidden="true" />}
          {!stage.up && dramatic && <p className="cd-tease">{last ? "Last card…" : TEASE[cur.rarity]}</p>}
          <div key={stage.k} className={`cd-flip${stage.up ? " up" : ""}${!stage.up && !stage.build ? (last ? " last" : curHit ? " tell" : "") : ""}${stage.build ? " build" : ""} r-${cur.rarity}`}>
            <span className="cd-back" aria-hidden="true" style={{ backgroundImage: `url(${backUrl()})` }} />
            <span className="cd-side">
              <CardFace setId={id} card={rowOf(cur)} variant={cur.variant} />
            </span>
          </div>
          {shownUp && dramatic && (
            <>
              <span key={`f${stage.k}`} className="cd-flash" aria-hidden="true" />
              <span key={`b${stage.k}`} className="cd-burst" aria-hidden="true">{SPARKS.map((i) => <i key={i} style={{ "--i": i }} />)}</span>
              {curHit && <strong key={`s${stage.k}`} className={`cd-banner r-${cur.rarity}`}>{RARITY[cur.rarity].name}!</strong>}
            </>
          )}
          {loud && <span key={`c${stage.k}`} className="cd-confetti" aria-hidden="true">{CONFETTI.map((i) => <i key={i} style={{ "--i": i }} />)}</span>}
          {shownUp && (
            <div className="cd-caption">
              {cur.isNew && <b className="cd-new">NEW</b>}
              <RarityMark rarity={cur.rarity} /> {kindOf(cur)}
            </div>
          )}
          <div className="cd-pips" aria-hidden="true">
            {pulls.map((p, k) => (
              <i key={k} className={`${k < seenK ? `seen r-${p.rarity}` : ""}${k >= seenK && result.daily && isHit(p.rarity) ? ` tell r-${p.rarity}` : ""}${k === stage.k ? " cur" : ""}`} />
            ))}
          </div>
        </div>
      )}

      {stage === "summary" && (
        <div className="cd-summary">
          {result.god && <span className="cd-confetti" aria-hidden="true">{CONFETTI.map((i) => <i key={i} style={{ "--i": i }} />)}</span>}
          <h3>{result.god ? "God Pack!" : hits.length ? `${hits.length} hit${hits.length === 1 ? "" : "s"}!` : set.SET.name}</h3>
          {hits.length > 0 && (
            <div className="cd-hits">
              {hits.map((p) => <Pull key={p.id} p={p} card={rowOf(p)} id={id} hit />)}
            </div>
          )}
          <div className="cd-row">
            {rest.map((p) => <Pull key={p.id} p={p} card={rowOf(p)} id={id} />)}
          </div>
          <p className="cd-dust">
            {pulls.filter((p) => p.isNew).length} new
            {dust > 0 && <> · spares worth <b>{dust} dust</b></>}
            {pulls[0]?.earned && " · ✦ an earned pack: every card carries its stamp"}
          </p>
          <div className="cd-actions">
            {again && <button type="button" className="lg-go" onClick={onAgain} autoFocus>Open another</button>}
            <button type="button" className="lg-go quiet" onClick={onBinder}>Binder</button>
            <button type="button" className="lg-go quiet" onClick={onDone} autoFocus={!again}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* OPEN ALL (a box's worth at once): no flips, one summary of every hit, the
   rarest first - you asked for speed, so it is the payoff without the beats. */
export function OpenAll({ set, results, waiting = 0, onBinder, onDone }) {
  useModalLock();
  useEffect(() => {
    document.body.classList.add("cd-opening");
    const esc = (e) => { if (e.key === "Escape") { e.preventDefault(); onDone(); } };
    addEventListener("keydown", esc);
    return () => { document.body.classList.remove("cd-opening"); removeEventListener("keydown", esc); };
  }, [onDone]);
  const id = set.SET.id;
  const rowOf = (p) => set.CARDS.find((c) => c[0] === p.localId);
  const all = results.flatMap((r) => r.pulls);
  const hits = all.filter((p) => isHit(p.rarity)).sort((a, b) => rungOf(b.rarity) - rungOf(a.rarity));
  const fresh = all.filter((p) => p.isNew).length;
  const dust = all.filter((p) => !p.isNew).reduce((n, p) => n + dustOf(p.rarity, p.variant), 0);
  const gods = results.filter((r) => r.god).length;
  const best = hits[0];
  if (waiting) {
    return (
      <div className="cd-open" role="dialog" aria-modal="true" aria-label="Opening packs">
        <span className="cd-room" aria-hidden="true" />
        <p className="cd-tease cd-wait">Opening {waiting} packs…</p>
      </div>
    );
  }
  return (
    <div className={`cd-open${best && rungOf(best.rarity) >= rungOf("special") ? " loud tone-" + best.rarity : ""}`} role="dialog" aria-modal="true" aria-label={`Opened ${results.length} packs`}>
      <span className="cd-room" aria-hidden="true" />
      {best && rungOf(best.rarity) >= rungOf("special") && <span className="cd-confetti" aria-hidden="true">{CONFETTI.map((i) => <i key={i} style={{ "--i": i }} />)}</span>}
      <div className="cd-summary">
        <h3>{results.length} packs · {hits.length} hit{hits.length === 1 ? "" : "s"}{gods ? ` · ${gods} God Pack${gods === 1 ? "" : "s"}!` : ""}</h3>
        {hits.length > 0 && (
          <div className="cd-hits">
            {hits.map((p, k) => <Pull key={`${p.id}-${k}`} p={p} card={rowOf(p)} id={id} hit />)}
          </div>
        )}
        <p className="cd-dust">{fresh} new card{fresh === 1 ? "" : "s"}{dust > 0 && <> · spares worth <b>{dust} dust</b></>}</p>
        <div className="cd-actions">
          <button type="button" className="lg-go" onClick={onBinder} autoFocus>Binder</button>
          <button type="button" className="lg-go quiet" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Pull({ p, card, id, hit = false }) {
  return (
    <figure className={`cd-sum${hit ? " hit" : ""}`}>
      <CardFace setId={id} card={card} variant={p.variant} still={!hit} />
      {p.isNew && <b className="cd-new">NEW</b>}
      <figcaption>
        <RarityMark rarity={p.rarity} />
        {p.isNew ? kindOf(p) : <em>Spare · {dustOf(p.rarity, p.variant)} dust</em>}
      </figcaption>
    </figure>
  );
}
