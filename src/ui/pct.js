/* A SHARE AS A WHOLE PERCENT, never rounded up to a finish (2026-10-26,
   reported: 1414 of 1415 read "100%"). Floored, so 100 means every one - and multiplied first: 0.29 * 100 is
   28.999..., which a floor makes 28. */
export const pct = (part, whole) => (whole > 0 ? Math.floor((Math.min(part, whole) * 100) / whole) : 0);
