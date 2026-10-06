/* THE CARD SHOP (asked for, 2026-10-07): the Packs tab as a store. A tile
   a set leads to its PRODUCT page - the packs, the variants (one, five, ten,
   or the set's box or bundle), a quantity, Add to cart, and the set's odds
   and chase below - and a CART that checks out in one go
   (`engine.checkout`: all of it or none). After checkout: open now, or go
   to My Packs, which holds every pack you have, bought or earned.

   The cart is a per-device convenience (localStorage), never the save. */
import { useEffect, useState } from "react";
import Icon from "../Icon.jsx";
import { CARD_SETS } from "../../data/cards/index.js";
import { WRAPPERS } from "../../data/cards/art.js";
import { packUrl, logoUrl } from "./load.js";
import { PACK_PRICE, BOXES, SET_LEVEL, setOpen } from "../../game/cards.js";

const yen = (n) => `¥${n.toLocaleString("en-US")}`;
const art = (id) => (WRAPPERS[id]?.[0] ? packUrl(id, WRAPPERS[id][0]) : logoUrl(id));
const setName = (id) => CARD_SETS.find((s) => s.id === id)?.name ?? id;

/* What a set sells: single packs in three sizes, and its box or bundle at
   its own discount (BOXES). `key` names the variant in the cart. */
export function variantsOf(id) {
  const box = BOXES[id];
  return [
    { key: "1", n: 1, label: "1 pack", price: PACK_PRICE },
    { key: "5", n: 5, label: "5 packs", price: 5 * PACK_PRICE },
    { key: "10", n: 10, label: "10 packs", price: 10 * PACK_PRICE },
    ...(box ? [{ key: "box", n: box.packs, box: true, label: `${box.name} · ${box.packs} packs`, price: box.price,
      off: Math.round((1 - box.price / (box.packs * PACK_PRICE)) * 100) }] : []),
  ];
}
const variant = (line) => variantsOf(line.set).find((v) => v.key === line.key);
export const lineTotal = (line) => (variant(line)?.price ?? 0) * line.qty;
export const linePacks = (line) => (variant(line)?.n ?? 0) * line.qty;

// THE CART, remembered on this device: lines `{ set, key, qty }`, cleaned on read.
const CART_KEY = "dexora-cart";
export function readCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((l) => l && CARD_SETS.some((s) => s.id === l.set)
      && variantsOf(l.set).some((v) => v.key === l.key) && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 20).slice(0, 30) : [];
  } catch { return []; }
}
export function writeCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* a convenience */ }
}

function Stepper({ value, onChange, max = 20 }) {
  return (
    <span className="cs-step" role="group" aria-label="Quantity">
      <button type="button" aria-label="One fewer" disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <b aria-live="polite">{value}</b>
      <button type="button" aria-label="One more" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

// THE STORE FRONT: a tile a set, See more to its product page.
export function ShopGrid({ order, level, held, onSee }) {
  return (
    <div className="cd-setgrid">
      {order.map((s) => {
        const open = setOpen(s.id, level);
        return (
          <article key={s.id} className={`cd-st${open ? "" : " shut"}`}>
            <button type="button" className="cd-st-main" onClick={() => onSee(s.id)} aria-label={`${s.name}: see more`}>
              <img src={art(s.id)} alt="" loading="lazy" draggable="false" />
              <b>{s.name}</b>
              <small>{open ? `From ${yen(PACK_PRICE)}` : `Opens at Lv ${SET_LEVEL[s.id]}`}</small>
              {(held[s.id] ?? 0) > 0 && <em className="cd-st-held" aria-label={`${held[s.id]} in My Packs`}>{held[s.id]}</em>}
            </button>
            <button type="button" className="lg-go quiet cd-st-go" onClick={() => onSee(s.id)}>See more</button>
          </article>
        );
      })}
    </div>
  );
}

// ONE PRODUCT: the packs, the variants, a quantity and Add to cart; the set's details below.
export function Product({ meta, level, money, onAdd, onCart, cartCount, children }) {
  const vs = variantsOf(meta.id);
  const [key, setKey] = useState("1");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(null);
  const open = setOpen(meta.id, level);
  const v = vs.find((x) => x.key === key) ?? vs[0];
  useEffect(() => { if (!added) return undefined; const t = setTimeout(() => setAdded(null), 2600); return () => clearTimeout(t); }, [added]);
  const wraps = WRAPPERS[meta.id] ?? [];
  return (
    <div className="cs-product">
      <section className="cs-buy">
        <div className="cs-art" style={{ "--n": Math.max(1, wraps.length) }}>
          {(wraps.length ? wraps : [null]).map((w, k) => (
            <img key={w ?? k} src={w ? packUrl(meta.id, w) : logoUrl(meta.id)} alt={k === 0 ? `${meta.name} booster pack` : ""} style={{ "--k": k }} />
          ))}
        </div>
        <div className="cs-info">
          <span className="lg-kicker">Booster packs · {meta.total} cards · released {meta.released}</span>
          <h2>{meta.name}</h2>
          {open ? (
            <>
              <div className="cs-variants" role="radiogroup" aria-label="What to buy">
                {vs.map((x) => (
                  <button key={x.key} type="button" role="radio" aria-checked={x.key === key} className={x.key === key ? "on" : ""}
                    onClick={() => setKey(x.key)}>
                    <b>{x.label}</b>
                    <span>{yen(x.price)}{x.off ? <em>−{x.off}%</em> : null}</span>
                  </button>
                ))}
              </div>
              <div className="cs-row">
                <Stepper value={qty} onChange={setQty} />
                <span className="cs-total">{yen(v.price * qty)}<small>{v.n * qty} pack{v.n * qty === 1 ? "" : "s"}</small></span>
              </div>
              <div className="cs-row">
                <button type="button" className="ci-go" onClick={() => { onAdd({ set: meta.id, key: v.key, qty }); setAdded(`${qty} × ${v.label}`); }}>
                  <Icon n="plus" size={18} /> Add to cart
                </button>
              </div>
              {added && (
                <p className="cs-added" role="status">
                  Added {added}. <button type="button" onClick={onCart}>View cart ({cartCount})</button>
                </p>
              )}
              {money < v.price * qty && <p className="cs-short">You have {yen(money)} - add it now, check out when you can.</p>}
            </>
          ) : <p className="cd-lock">Opens at Lv {SET_LEVEL[meta.id]}</p>}
        </div>
      </section>
      {children}
    </div>
  );
}

// THE CART: lines with quantities, the total against your money, and Checkout.
export function Cart({ cart, money, level, onQty, onRemove, onCheckout, onShop }) {
  const total = cart.reduce((a, l) => a + lineTotal(l), 0);
  const packs = cart.reduce((a, l) => a + linePacks(l), 0);
  const shut = cart.filter((l) => !setOpen(l.set, level));
  return (
    <div className="cs-cart">
      <h2 className="cs-h">Your cart</h2>
      {cart.length ? (
        <>
          <ul className="cs-lines">
            {cart.map((l, i) => (
              <li key={`${l.set}:${l.key}`}>
                <img src={art(l.set)} alt="" loading="lazy" />
                <div><b>{setName(l.set)}</b><span>{variant(l)?.label}</span></div>
                <Stepper value={l.qty} onChange={(q) => onQty(i, q)} />
                <span className="cs-line-price">{yen(lineTotal(l))}</span>
                <button type="button" className="cs-x" aria-label={`Remove ${setName(l.set)} ${variant(l)?.label}`} onClick={() => onRemove(i)}>✕</button>
              </li>
            ))}
          </ul>
          <div className="cs-sum">
            <span>{packs} packs</span>
            <b>{yen(total)}</b>
            <small>You have {yen(money)}{money < total ? ` - ${yen(total - money)} short` : ""}</small>
          </div>
          {shut.length > 0 && <p className="cs-short">{setName(shut[0].set)} is not open to you yet - remove it to check out.</p>}
          <button type="button" className="ci-go" disabled={money < total || shut.length > 0} onClick={onCheckout}>
            Checkout · {yen(total)}
          </button>
          <button type="button" className="ci-go quiet" onClick={onShop}>Continue shopping</button>
        </>
      ) : (
        <div className="cs-empty">
          <p>Your cart is empty.</p>
          <button type="button" className="ci-go" onClick={onShop}>Browse the Card Shop</button>
        </div>
      )}
    </div>
  );
}

// AFTER CHECKOUT: what arrived, then open now or go to My Packs.
export function Done({ order, onOpen, onMine, onShop }) {
  const ids = Object.keys(order.packs);
  const n = Object.values(order.packs).reduce((a, b) => a + b, 0);
  return (
    <div className="cs-done" role="status">
      <span className="cs-tick"><Icon n="check" size={30} /></span>
      <h2>Order complete</h2>
      <p>{n} pack{n === 1 ? "" : "s"} for {yen(order.total)}, waiting in My Packs.</p>
      <ul className="cs-got">
        {ids.map((id) => <li key={id}><img src={art(id)} alt="" /><b>{order.packs[id]}×</b><span>{setName(id)}</span></li>)}
      </ul>
      <button type="button" className="ci-go" onClick={() => onOpen(ids[0])}>Open {ids.length > 1 ? `a ${setName(ids[0])} pack` : "one"} now</button>
      <button type="button" className="ci-go quiet" onClick={onMine}>Go to My Packs</button>
      <button type="button" className="cs-link" onClick={onShop}>Back to the shop</button>
    </div>
  );
}

// MY PACKS: every pack you hold, bought or earned, and the ways to open them.
export function MyPacks({ held, earnedOf, ready, onOpen, onOpenAll, onShop }) {
  const ids = CARD_SETS.map((s) => s.id).filter((id) => (held[id] ?? 0) > 0);
  if (!ids.length) {
    return (
      <div className="cs-empty">
        <p>No packs to open. Rewards land here too - a badge, a Champion, the roulette.</p>
        <button type="button" className="ci-go" onClick={onShop}>Visit the Card Shop</button>
      </div>
    );
  }
  return (
    <div className="cd-setgrid">
      {ids.map((id) => {
        const n = held[id];
        const earned = earnedOf(id);
        return (
          <article key={id} className="cd-st">
            <div className="cd-st-main cs-mine">
              <img src={art(id)} alt="" loading="lazy" draggable="false" />
              <b>{setName(id)}</b>
              <small>{earned ? `${earned} earned` : "Bought"}</small>
              <em className="cd-st-held">{n}</em>
            </div>
            <div className="cs-open">
              <button type="button" className="lg-go cd-st-go" disabled={!ready(id)} onClick={() => onOpen(id)}>Open</button>
              {n > 1 && <button type="button" className="lg-go quiet cd-st-go" disabled={!ready(id)} onClick={() => onOpenAll(id)}>Open all {n}</button>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
