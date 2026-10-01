/* SURF OR FISH? - asked when C or the pad's A is pressed facing water you can
   do both on (asked for, 2026-10-02). With one of them on offer the key just
   does it; this is only the shoreline where it could mean either. C again
   surfs, F fishes, Escape or a tap away puts the question down. */
import { useEffect } from "react";
import { useModalLock, useDismiss } from "./modal.js";

export default function WaterAsk({ rod, ride, onSurf, onFish, onClose }) {
  useModalLock();
  useEffect(() => {
    const onKey = (ev) => {
      const k = ev.key.toLowerCase();
      if (k === "c") { ev.preventDefault(); onSurf(); }
      else if (k === "f") { ev.preventDefault(); onFish(); }
      else if (k === "escape") { ev.preventDefault(); onClose(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onSurf, onFish, onClose]);
  const what = ride === "V" ? "lava" : "water";
  return (
    <div className="sheet" {...useDismiss(onClose)}>
      <div className="confirm water-ask" role="dialog" aria-modal="true" aria-label={`The ${what}`}
        onClick={(e) => e.stopPropagation()}>
        <h3 className="cf-title">Surf or fish?</h3>
        <div className="cf-actions">
          <button type="button" className="cf-yes buy" autoFocus onClick={onSurf}>
            <img src="items/surf.png" alt="" /> Surf <kbd>C</kbd>
          </button>
          <button type="button" className="cf-yes buy" onClick={onFish}>
            <img src={`items/${rod.id}.png`} alt="" /> {rod.name} <kbd>F</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
