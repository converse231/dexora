/* Two shelves: balls to catch with, stones to evolve with.

   Nine items each needing a name, a price, a stock count and a way to pick a
   quantity is more than fits in a rail, so only the row you are actually buying
   from opens. Everything else stays a one-line entry you can scan — which is
   what you are doing most of the time anyway, since the question is usually
   "can I afford Ultras yet" rather than "how many".

   Nothing is hidden: locked stock is greyed with its level printed where the
   price goes, because a wall you can read is a goal. */

import { useState } from "react";
import {
  SHOP_BALLS, STONES, CANDY_PRICE, speciesNeedingStone,
} from "../game/items.js";
import { SPECIES } from "../data/species.js";
import { label } from "../game/map.js";
import { pricedAt } from "../game/trainer.js";
import Confirm from "./Confirm.jsx";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function Shop({ money, bag, level, stats, candy, onBuy, onBuyCandy }) {
  const [pending, setPending] = useState(null);
  // The row whose buy controls are showing. Starts on the ball everyone owns,
  // so the shop opens explaining itself rather than as a list of closed doors.
  const [open, setOpen] = useState(SHOP_BALLS[0].id);
  // One quantity per item, so opening another row does not lose what you typed.
  const [qty, setQty] = useState({});

  // Haggle discounts the shelf; the engine charges the same number.
  const priceOf = (item) => pricedAt(item.price, stats);
  // Through the same discount as everything else, or Haggle has two rules.
  const candyPrice = pricedAt(CANDY_PRICE, stats);

  const confirmBuy = (item, n) => {
    const cost = priceOf(item) * n;
    setPending({
      title: `Buy ${n} × ${item.name}?`,
      lines: [
        ["Cost", `¥${cost.toLocaleString()}`],
        ["Money left", `¥${(money - cost).toLocaleString()}`],
        ["You will hold", `${(bag[item.id] ?? 0) + n} × ${item.name}`],
      ],
      confirmLabel: `BUY ${n} · ¥${cost.toLocaleString()}`,
      run: () => {
        onBuy(item.id, n);
        // Spending changes what you can afford, so the field starts over.
        setQty((q) => ({ ...q, [item.id]: 1 }));
      },
    });
  };

  // "×1.8 odds" for a ball; for a stone, the Pokémon it is actually for.
  const blurb = (item) => {
    /* A situational ball is sold on the condition, not on its base: printing
       "×1.0 odds" beside a Net Ball is true, useless, and reads as a worse
       Poké Ball for six times the money. The headline is what it is worth when
       it is right, and the hint is when that is. */
    if (item.boost) return `×${item.boost.toFixed(1)} ${item.hint}`;
    if (item.mult) return item.mult >= 100 ? "never fails" : `×${item.mult.toFixed(1)} odds`;
    return speciesNeedingStone(item.id).map((id) => label(SPECIES[id - 1])).join(" · ");
  };

  const shelf = (items) =>
    items.map((item) => {
      const locked = level < item.level;
      const afford = Math.floor(money / priceOf(item));
      const owned = bag[item.id] ?? 0;
      const isOpen = open === item.id && !locked;
      // Clamped on read: a purchase can drop what you can afford below what the
      // field is still showing.
      const n = clamp(qty[item.id] ?? 1, 1, Math.max(1, afford));
      const set = (v) =>
        setQty((q) => ({ ...q, [item.id]: clamp(v, 1, Math.max(1, afford)) }));

      return (
        <div
          key={item.id}
          className={`shoprow${locked ? " locked" : ""}${isOpen ? " open" : ""}`}
        >
          <button
            type="button"
            className="sh-pick"
            disabled={locked}
            aria-expanded={isOpen}
            onClick={() => setOpen(isOpen ? null : item.id)}
          >
            <img src={`items/${item.id}.png`} alt="" />
            <span className="sh-title">
              <b>{item.name}</b>
              <i title={blurb(item)}>{blurb(item)}</i>
            </span>
            <span className="sh-tail">
              <b>{locked ? `LV ${item.level}` : `¥${priceOf(item).toLocaleString()}`}</b>
              <i>{locked ? "locked" : `you have ${owned}`}</i>
            </span>
          </button>

          {isOpen && (
            <div className="sh-buy">
              <div className="qty">
                <button
                  type="button"
                  aria-label={`One fewer ${item.name}`}
                  disabled={n <= 1}
                  onClick={() => set(n - 1)}
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={Math.max(1, afford)}
                  value={n}
                  aria-label={`How many ${item.name}`}
                  onChange={(e) => set(Math.floor(Number(e.target.value)) || 1)}
                />
                <button
                  type="button"
                  aria-label={`One more ${item.name}`}
                  disabled={n >= afford}
                  onClick={() => set(n + 1)}
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className="sh-max"
                title={`Buy all ${afford} you can afford`}
                disabled={afford < 1 || n === afford}
                onClick={() => set(afford)}
              >
                MAX
              </button>

              <button
                type="button"
                className="sh-go"
                disabled={afford < 1}
                onClick={() => confirmBuy(item, n)}
              >
                {afford < 1
                  ? "TOO DEAR"
                  : `BUY · ¥${(priceOf(item) * n).toLocaleString()}`}
              </button>
            </div>
          )}
        </div>
      );
    });

  return (
    <div className="panel">
      <div className="panel-head">
        <span>SHOP</span>
        <span>¥{money.toLocaleString()}</span>
      </div>

      {/* One scroller for the whole shop, like every other tab has. Two lists
          each scrolling on their own would be worse than one long page. */}
      <div className="shopscroll">
        <div className="shoplist">{shelf(SHOP_BALLS)}</div>

        <p className="shop-note">Better balls raise the odds, not the reward.</p>

        {/* RARE CANDY, and it is priced to lose. ¥120 against the ¥40 a common
            duplicate sells for means three sold to buy one candy, where
            converting that same duplicate gives one outright - so buying is
            always the impatient option and catching is always the efficient
            one. That ordering is the rule; the number is a starting value.

            No purchase cap, and it needs none: cash comes from selling
            duplicates, so cash-bought candy is gated by catching anyway. The
            sink is self-limiting because its input is the same input - and it
            puts candy in competition with Poké Balls for one wallet, which is
            the choice that makes the shop interesting.

            Its own row rather than an entry in the shelf above, because candy
            is a currency and not a bag item: it has no sprite, it is spent per
            level rather than selected and used, and it belongs beside the money
            in the top bar, which is where it is. */}
        <div className="sh-head">
          <span>RARE CANDY</span>
          <span>YOU HAVE {candy}</span>
        </div>

        <div className="candyrow">
          <span className="cr-star">★</span>
          <span className="cr-copy">
            <b>Rare Candy</b>
            <i>1 candy = 1 level</i>
          </span>
          <span className="cr-price">¥{candyPrice.toLocaleString()}</span>
          {[1, 5, 10].map((n) => (
            <button
              key={n}
              type="button"
              className="cr-buy"
              disabled={money < candyPrice * n}
              onClick={() => onBuyCandy(n)}
              title={`¥${(candyPrice * n).toLocaleString()}`}
            >
              +{n}
            </button>
          ))}
        </div>

        <div className="sh-head">
          <span>EVOLUTION STONES</span>
          <span>+ THE LEVEL</span>
        </div>

        <div className="shoplist">{shelf(STONES)}</div>

        <p className="shop-note">
          A stone is used up by the evolution it makes.
        </p>
      </div>

      {pending && (
        <Confirm
          title={pending.title}
          lines={pending.lines}
          confirmLabel={pending.confirmLabel}
          tone="buy"
          onConfirm={() => {
            pending.run();
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
