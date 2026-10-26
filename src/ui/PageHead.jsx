/* ONE PAGE HEAD FOR EVERY TAB (2026-10-26, asked for: "take the Arena's
   gamified path so the features don't feel separated"). The Arena's own
   shape - a coloured mark, the name in heavy italic capitals, a line under
   it - in each tab's own colour (`--fc`, the tab bar's), with the wallet at
   its end. `children` go before the wallet: a page's own control (the
   Arena / Classic switch, the cart). */
import Icon from "./Icon.jsx";
import { Wallet } from "./wallet.jsx";

export default function PageHead({ icon, title, sub, back = null, dust = false, children }) {
  return (
    <div className="ph">
      {back}
      <span className="ph-mark" aria-hidden="true"><Icon n={icon} size={22} /></span>
      <div className="ph-text">
        <h3>{title}</h3>
        {sub && <span>{sub}</span>}
      </div>
      <span className="ph-end">
        {children}
        <Wallet dust={dust} className="ph-wallet" />
      </span>
    </div>
  );
}
