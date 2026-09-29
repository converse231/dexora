/* THE RANK-UP CEREMONY, for both ladders (the Pokédex rank, README *Pokédex*;
   the battle ranks, docs/ranked.md). A rank is the rarest thing the game says
   about you - eight steps a ladder, some of them months apart - so it gets
   the screen, not a three-second banner.

   One timeline, all CSS (every beat is a keyframe with a delay, so nothing
   here ticks per frame), and it waits for you at the end:

     0.0s  the room goes dark in the new rank's colour
     0.3s  the old medal rises into the light
     1.1s  THE EVOLUTION HOMAGE: old and new flicker as white silhouettes,
           faster and faster, while motes of light fall inward - the game's
           own evolution scene, because a rank is you evolving
     2.5s  the flash: shockwaves, a burst that grows with the rank, rays
     2.6s  the new medal lands, glints, and its name drops in letter by letter
     3.5s  the whole ladder, filling from the old step to the new
     4.6s  Continue

   A tap, Enter or Escape before the end skips to it; after, it closes. The
   top two steps add gold rain and fireworks. Only `transform` and `opacity`
   move, bar the silhouettes' filter during the charge. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useModalLock } from "./modal.js";
import { RankMedal } from "./RankBadge.jsx";

const READY_MS = 4600;   // when Continue arrives: `.ru-go`'s delay in styles.css
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Spread evenly round the circle, jittered, so no two bursts look alike.
function scatter(n, [near, far], jitter = 14) {
  return Array.from({ length: n }, (_, i) => ({
    a: (i / n) * 360 + (Math.random() - 0.5) * jitter,
    d: near + Math.random() * (far - near),
    s: 3 + Math.round(Math.random() * 5),
    t: Math.round(Math.random() * 140),
    c: i % 3,
  }));
}

/* `ranks` is the ladder ([{id, name}], lowest first); `from` the step you
   left (null: your first rank on it), `to` the step you reached. */
export default function RankUp({ set, ranks, from, to, kicker, detail, onDone }) {
  useModalLock();
  const [ready, setReady] = useState(false);
  const [skip, setSkip] = useState(false);
  const go = useRef(null);
  const rank = ranks[to];
  const old = from == null ? null : ranks[from];
  const top = to >= ranks.length - 2;

  const burst = useMemo(() => scatter(18 + to * 5, [26, 46]), [to]);
  const motes = useMemo(() => scatter(14, [30, 44], 20), []);
  const shows = useMemo(() => (top ? [scatter(16, [8, 16], 20), scatter(16, [8, 16], 20)] : []), [top]);
  const rain = useMemo(() => (top ? Array.from({ length: 26 }, () => ({
    x: Math.random() * 100, t: Math.random() * 3.2, s: 3 + Math.round(Math.random() * 4), d: 2.6 + Math.random() * 1.8,
  })) : []), [top]);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), reduced() ? 0 : READY_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (ready) go.current?.focus({ preventScroll: true }); }, [ready]);

  // Before the end a press skips to it; after, it closes.
  const advance = () => {
    if (ready) onDone();
    else { setSkip(true); setReady(true); }
  };
  useEffect(() => {
    const key = (e) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Escape") return;
      e.preventDefault();
      advance();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const fill = (step) => step / (ranks.length - 1);
  // The name in words that never break, each letter numbered for its drop.
  const words = rank.name.split(" ").reduce((out, text) => {
    const at = out.length ? out.at(-1).at + out.at(-1).text.length : 0;
    return [...out, { text, at }];
  }, []);
  return (
    <div className={`ru${skip ? " skip" : ""}${top ? " top" : ""}`} style={{ "--mc": rank.color }}
      role="dialog" aria-modal="true" aria-label={`${kicker}: ${rank.name}`} onClick={advance}>
      {rain.map((r, i) => (
        <i key={`r${i}`} className="ru-rain loop" aria-hidden="true"
          style={{ "--x": `${r.x}%`, "--t": `${r.t}s`, "--s": `${r.s}px`, "--d": `${r.d}s` }} />
      ))}

      <div className="ru-stage" aria-hidden="true">
        <div className="ru-glow" />
        <div className="ru-rays loop" />
        <div className="ru-waves" />
        <div className="ru-beam" />
        {[0, 1, 2].map((k) => <div key={k} className="ru-ring" style={{ "--k": k }} />)}
        {motes.map((m, i) => (
          <i key={`m${i}`} className="ru-mote" style={{ "--a": `${m.a}deg`, "--d": `${m.d}vmin`, "--t": `${m.t * 3}ms` }} />
        ))}
        {burst.map((p, i) => (
          <i key={`b${i}`} className={`ru-spark c${p.c}`}
            style={{ "--a": `${p.a}deg`, "--d": `${p.d}vmin`, "--s": `${p.s}px`, "--t": `${p.t}ms` }} />
        ))}
        {shows.map((show, k) => (
          <div key={`f${k}`} className={`ru-show s${k}`}>
            {show.map((p, i) => (
              <i key={i} className={`ru-spark c${p.c}`}
                style={{ "--a": `${p.a}deg`, "--d": `${p.d}vmin`, "--s": `${p.s}px`, "--t": `${p.t}ms` }} />
            ))}
          </div>
        ))}
        <div className={`ru-medal${old ? "" : " solo"}`}>
          <div className="ru-core">
            {old && <span className="ru-old"><RankMedal set={set} id={old.id} color={old.color} /></span>}
            <span className="ru-new"><RankMedal set={set} id={rank.id} color={rank.color} /></span>
          </div>
          <i className="ru-glint g0 loop" /><i className="ru-glint g1 loop" /><i className="ru-glint g2 loop" />
        </div>
      </div>
      <div className="ru-flash" aria-hidden="true" />

      <div className="ru-text">
        <p className="ru-kicker">{kicker}</p>
        <h2 className="ru-name" aria-hidden="true">
          {words.map((w, k) => (
            <span key={k}>
              {k > 0 && " "}
              <span className="w">{[...w.text].map((ch, i) => <span key={i} style={{ "--i": w.at + i }}>{ch}</span>)}</span>
            </span>
          ))}
        </h2>
        <p className="ru-path">{old ? <>{old.name} <b>→</b> {rank.name}</> : rank.name}</p>
        {detail && <p className="ru-detail">{detail}</p>}
      </div>

      <ol className="ru-ladder" aria-label="The ladder" style={{ "--from": fill(from ?? 0), "--to": fill(to) }}>
        <span className="ru-track" aria-hidden="true"><b /></span>
        {ranks.map((r, i) => (
          <li key={r.id} className={i < to ? "won" : i === to ? "now" : "ahead"} data-tip={r.name}>
            <RankMedal set={set} id={r.id} color={r.color} label={r.name} />
          </li>
        ))}
      </ol>

      <button type="button" ref={go} className="ru-go" tabIndex={ready ? 0 : -1}
        onClick={(e) => { e.stopPropagation(); advance(); }}>Continue</button>
    </div>
  );
}
