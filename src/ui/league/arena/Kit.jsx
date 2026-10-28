/* A POKEMON'S FIXED KIT on screen (docs/arena-kits.md): its four slots, each
   with its job and key, its class and its combo - the team card's and the
   fighter select's one drawing, so both say the same thing. */
import { fixedKit, kitClass, SLOT_NAMES, shapeOf, arenaMove, cooldownOf, TPS, payoffSlot, COMBO_WIN, COMBO_DMG } from "../../../game/arena.js";
import { MOVES } from "../../../data/moves.js";

const KEYS = ["RMB", "Q", "E", "R"];
const waitOf = (m) => Math.round(cooldownOf(m) / TPS * 10) / 10;
const nameOf = (i) => MOVES[i].n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
// The rotation the kit teaches: its Control, then its Power where that hits (a Tank's or Support's is a shield or heal), else its Main.
export function comboOf(id) {
  const kit = fixedKit(id), control = kit[2], payoff = kit[payoffSlot(kit)];
  return control >= 0 && payoff >= 0 ? `${nameOf(control)}, then ${nameOf(payoff)}` : "";
}

export default function KitList({ id, className }) {
  const kit = fixedKit(id);
  const combo = comboOf(id);
  return (
    <>
      <ul className={`${className} kit-list`} aria-label={`${kitClass(id) ?? ""} kit`}>
        {kit.map((i, k) => (i < 0 || !shapeOf(arenaMove(i)) ? null : (
          <li key={k} className={`t-${MOVES[i].t ?? "normal"}`} data-tip={`${SLOT_NAMES[k]} · ${waitOf(arenaMove(i))} s cooldown`}>
            <i className="kit-key">{KEYS[k]}</i>{nameOf(i)}
          </li>
        )))}
      </ul>
      {(kitClass(id) || combo) && (
        <p className="kit-combo">{kitClass(id) && <em>{kitClass(id)}</em>}{combo && <span data-tip={`Land them within ${COMBO_WIN / TPS} s: ${COMBO_DMG}x damage and a stun`}>Combo: {combo}</span>}</p>
      )}
    </>
  );
}
