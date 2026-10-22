/* THE ARENA IS OPEN (asked for, 2026-10-22: "just like halloween ... making
   sure players won't miss it" - variant C of the three drawn): the whole
   screen, once a device, on the map. Two of the Arena's own fighters mid-blow
   (public/arena/intro, npm run intro) over two of its floors, the three
   things that make it play, and one press into it. After it, until the Arena
   is opened, a chip on the map keeps the way in (App, ARENA_NEWS_KEY).

   A page over everything rather than a card: it has no scrim to tap away,
   so Skip, Later and Escape are its ways out. Lazy: only its one showing
   loads it. */
import { useEffect, useRef } from "react";
import { useModalLock } from "./modal.js";

const asset = (p) => new URL(p, document.baseURI).href;

export default function ArenaIntro({ onFight, onClose }) {
  useModalLock();
  // Focus without scrolling: autoFocus scrolled a phone to the card's foot (Season.jsx).
  const go = useRef(null);
  useEffect(() => { go.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="ai-page" role="dialog" aria-modal="true" aria-labelledby="ai-title"
      style={{ "--left": `url(${asset("arena/caldera.webp")})`, "--right": `url(${asset("arena/rink.webp")})` }}>
      <i className="ai-floor l" aria-hidden="true" />
      <i className="ai-floor r" aria-hidden="true" />
      <i className="ai-shade" aria-hidden="true" />
      <svg className="ai-slash" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M60 4 L40 72" pathLength="1" />
      </svg>
      <div className="ai-fight" aria-hidden="true">
        <img className="ai-mon a" src={asset("arena/intro/garchomp.png")} alt="" />
        <img className="ai-mon b" src={asset("arena/intro/lucario.png")} alt="" />
      </div>

      <span className="ai-kicker">New in Dexora · The Arena is open</span>
      <button type="button" className="ai-skip" onClick={onClose}>Skip</button>

      <div className="ai-copy">
        <h2 id="ai-title">Live<br />battles</h2>
        <p>Your team, in real time. Move, aim, dodge - and when the moment comes, Surge.</p>
      </div>

      <div className="ai-side">
        <div className="ai-how">
          <ol>
            <li><b>1</b>Move and aim every attack yourself</li>
            <li><b>2</b>Dodge at the last moment to fill Surge</li>
            <li><b>3</b>Unleash it and turn the fight around</li>
          </ol>
          <div className="ai-surge" aria-hidden="true"><span>Surge</span><i><u /></i></div>
        </div>
        <div className="ai-go">
          <button type="button" ref={go} className="ci-go" onClick={onFight}>Fight now</button>
          <button type="button" className="ci-go quiet" onClick={onClose}>Later</button>
        </div>
      </div>
    </div>
  );
}
