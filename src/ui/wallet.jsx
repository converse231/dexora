/* ONE WALLET, ONE MART (2026-10-26, asked for: "the separation of cards,
   catch and battles while using the same currency is confusing" - the Arena
   raised a team with Rare Candy it could not buy, and on a phone the candy
   was five taps away, through Catch and Rotom's Shop).

   App provides the wallet once (`WalletProvider`): what you hold, the engine,
   and `openMart(shelf)`, the one shop every tab reaches. A page draws
   `<Wallet />` in its head and never threads money through its props.
   `useRaise` is the one way a page spends candy on a level: short of candy,
   it offers to buy the rest in the same press (asked first - it spends). */
import { createContext, useContext, useState } from "react";
import { CANDY_PRICE } from "../game/items.js";
import { pricedAt } from "../game/trainer.js";
import Confirm from "./Confirm.jsx";
import Icon from "./Icon.jsx";

const Ctx = createContext(null);
export const WalletProvider = Ctx.Provider;
export const useWallet = () => useContext(Ctx) ?? { money: 0, candy: 0, dust: 0, stats: null, engine: null, openMart: () => {} };

/* What you hold, as chips: money opens the Mart, candy opens it at Training
   (a "+" says it can be bought), dust only where it is spent (Cards). Shown
   on a touch screen, where a page covers the top bar's numbers; a desktop's
   top bar carries the same two chips over every page. */
export function Wallet({ dust = false, className = "" }) {
  const w = useWallet();
  return (
    <span className={`wallet ${className}`}>
      <button type="button" className="wl-chip cash" onClick={() => w.openMart("catching")} aria-label={`¥${w.money.toLocaleString()} - open the Poké Mart`}>
        <Icon n="yen" size={14} /><b>{w.money.toLocaleString()}</b>
      </button>
      <button type="button" className="wl-chip candy" onClick={() => w.openMart("training")} aria-label={`${w.candy} Rare Candy - buy more`}>
        <img src={new URL("items/rare-candy.png", document.baseURI).href} alt="" /><b>{w.candy.toLocaleString()}</b><i aria-hidden="true">+</i>
      </button>
      {dust && (
        <span className="wl-chip dust" data-tip="Dust - from spare cards"><Icon n="forms" size={14} /><b>{w.dust.toLocaleString()}</b></span>
      )}
    </span>
  );
}

/* RAISE A POKEMON n LEVELS, buying the candy it lacks. `ask(mon, n, extra)`
   raises at once when the candy is there (it was the press itself), and asks
   when money is spent - the price, what it buys and what is left. `can(mon)`
   is whether a raise could happen at all: candy on hand or money for one. */
export function useRaise() {
  const { engine, candy, money, stats } = useWallet();
  const [pending, setPending] = useState(null);
  const price = pricedAt(CANDY_PRICE, stats);
  const room = (mon) => Math.max(0, 100 - (mon?.level ?? 100));
  const can = (mon) => !!mon && !mon.lock && !mon.rental && room(mon) > 0 && (candy > 0 || money >= price);
  const ask = (mon, n, { name = "it", lines = [], done } = {}) => {
    if (!can(mon)) return;
    const want = Math.min(n, room(mon));
    const buy = Math.min(Math.max(0, want - candy), Math.floor(money / price));
    const go = Math.min(want, candy + buy);
    if (go < 1) return;
    const run = () => {
      if (buy && !engine.buyCandy(buy)) return;
      const got = engine.levelUp(mon.uid, go);
      done?.(got);
    };
    if (!buy) { run(); return; }
    setPending({
      title: `Raise ${name} to Lv ${mon.level + go}?`,
      lines: [
        ["Rare Candy", `${go} (${Math.min(go, candy)} held + ${buy} bought)`],
        ["Costs", `¥${(buy * price).toLocaleString()}`],
        ["Money left", `¥${(money - buy * price).toLocaleString()}`],
        ...lines,
      ],
      note: go < want ? `Money for ${go} of the ${want} levels.` : undefined,
      confirmLabel: `BUY & RAISE · ¥${(buy * price).toLocaleString()}`,
      run,
    });
  };
  const dialog = pending && (
    <Confirm title={pending.title} lines={pending.lines} note={pending.note} confirmLabel={pending.confirmLabel} tone="buy"
      onConfirm={() => { pending.run(); setPending(null); }} onCancel={() => setPending(null)} />
  );
  return { ask, can, price, dialog };
}
