/* WHO'S THAT POKEMON? (quiz.js): today's silhouette, four names, one
   answer. The answer is judged, paid and SAVED by
   `engine.answerQuiz` before the reveal plays; the picture then fills in
   and the right name lights. The silhouette carries no name anywhere - no
   alt, no tip - or the question would answer itself. */
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Sprite from "./Sprite.jsx";
import { useDismiss, useModalLock } from "./modal.js";
import { label } from "../game/map.js";
import { speciesById } from "../game/biomes.js";
import { QUIZ_PAY } from "../game/quiz.js";

const nameOf = (id) => label(speciesById(id));

export default function Quiz({ quiz, onAnswer, onClose }) {
  useModalLock();
  // What `answerQuiz` said, or today's saved answer when reopened.
  const [got, setGot] = useState(quiz.done ? { ok: quiz.done.ok, answer: quiz.answer } : null);
  const answer = (id) => {
    if (got) return;
    const r = onAnswer(id);
    if (!r) { onClose(); return; }
    setGot({ ...r, picked: id });
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  const cls = (id) => !got ? "" : id === quiz.answer ? " right" : id === got.picked ? " wrong" : " out";

  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className={`ci-card qz-card${got ? " done" : ""}`} role="dialog" aria-modal="true"
        aria-label="Who's that Pokémon?" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="set-x ci-x" aria-label="Close" onClick={onClose}>✕</button>
        <span className="ci-kicker">Daily quiz</span>
        <h2 className="qz-title" aria-live="polite">{got ? `It's ${nameOf(quiz.answer)}!` : "Who's that Pokémon?"}</h2>
        <div className="qz-stage">
          <Sprite id={quiz.answer} alt="" eager className={got ? "qz-mon shown" : "qz-mon"} />
        </div>
        <div className="qz-choices">
          {quiz.choices.map((id) => (
            <button key={id} type="button" className={`qz-choice${cls(id)}`} disabled={!!got} onClick={() => answer(id)}>
              {nameOf(id)}
            </button>
          ))}
        </div>
        {got ? (
          <div className="ci-got" role="status">
            <span className={got.ok ? "" : "qz-miss"}>{got.ok ? "Correct!" : "Not this time"}</span>
            <b>{got.ok ? `+${QUIZ_PAY.candy} Rare Candy` : "A new one tomorrow"}</b>
            {got.seen && <small className="qz-seen">Added to your Pokédex as seen</small>}
            <button type="button" className="ci-go quiet" autoFocus onClick={onClose}>Continue</button>
          </div>
        ) : (
          <p className="ci-foot">One guess a day. Get it right for {QUIZ_PAY.candy} Rare Candy.</p>
        )}
      </div>
    </div>
  );
}
