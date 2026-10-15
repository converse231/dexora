/* INVITE A FRIEND (docs/trading.md, Referrals; asked for, 2026-10-15).

   A player shares a link (`?ref=<username>`); a NEW account that signs up
   through it is linked to them on the server (`set_referrer`, db/referrals.sql),
   and once the newcomer has really played - progress the SERVER saw, on
   separate days - both are rewarded. Big on purpose, so it is worth asking.

   THERE IS NO TRUST BOUNDARY (CLAUDE.md), so nothing here is decided in the
   browser. What would be abused is the honest path: one person making alt
   accounts to farm the inviter's reward. Every safeguard lives on the server:
     - only an account under LINK_HOURS old can be linked, once, to an
       account OLDER than itself, never itself, never across a block;
     - progress counts from the save the account had when it was linked (a
       guest game brought in, or a forged first save, starts at zero);
     - it must reach STEPS and CAUGHT and arrive on DAYS different days - the
       pace check (trading.sql) already caps what one save can claim, and the
       days cannot be bought with a single upload;
     - an email that was never confirmed, or a flagged account (either side),
       earns nothing;
     - an inviter is paid for their first CAP friends only.
   The numbers are the SQL's `referral_rule()` (tradedb holds them equal).

   What the server answers (`my_referrals`) is turned into rewards here, and
   the engine pays each id once (`referralsPaid` in the save). */

export const REF_RULE = { steps: 3000, caught: 25, days: 3, cap: 10, linkHours: 72 };

// For the friend who joined, once they have got going.
export const REF_WELCOME = { items: { "ultra-ball": 10 }, candy: 5, packs: 3 };
// For you, for each friend who gets going (your first REF_RULE.cap).
export const REF_EACH = { items: { "ultra-ball": 15 }, candy: 10, packs: 6 };
// And when that many of them have: a booster box, a Master Ball, both.
export const REF_MILESTONES = [
  [3, { packs: 36 }],
  [5, { items: { "master-ball": 1 } }],
  [10, { packs: 36, items: { "master-ball": 1 } }],
];

// The link: the app's own address with your name on it.
export const inviteLink = (base, name) => `${base}?ref=${encodeURIComponent(name)}`;

// A saved list of paid reward ids: well formed, once each.
export const cleanRefPaid = (raw) => (Array.isArray(raw)
  ? [...new Set(raw.filter((s) => typeof s === "string" && /^ref:[\w-]{1,40}$/.test(s)))].slice(0, 64) : []);

/* What the server's answer owes that the save has not been paid: the
   welcome (yours, as the one invited), one per friend the server marks
   `paid`, and each milestone reached. Nothing at all for a flagged account. */
export function referralDue(info, paid = []) {
  if (!info || info.flagged) return [];
  const out = [];
  if (info.me?.qualified) out.push({ id: "ref:welcome", ...REF_WELCOME, why: `Welcome gift - invited by ${info.me.referrer}` });
  const counted = (info.invited ?? []).filter((x) => x.paid);
  for (const x of counted) out.push({ id: `ref:${x.id}`, ...REF_EACH, why: `${x.username} got going` });
  for (const [n, r] of REF_MILESTONES) if (counted.length >= n) out.push({ id: `ref:m${n}`, ...r, why: `${n} friends invited` });
  return out.filter((r) => !paid.includes(r.id));
}

// A reward as words, for the dialog: "15 Ultra Balls · 10 Rare Candy · 6 card packs".
export const rewardWords = (r, name = (id) => id) => [
  ...Object.entries(r.items ?? {}).map(([id, n]) => `${n} ${name(id)}${n > 1 ? "s" : ""}`),
  r.candy && `${r.candy} Rare Candy`,
  r.packs && (r.packs >= 36 ? "a booster box" : `${r.packs} card pack${r.packs > 1 ? "s" : ""}`),
].filter(Boolean).join(" · ");
