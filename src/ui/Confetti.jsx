/* CONFETTI CANNONS, one in each bottom corner (asked for: it only fell, and
   looked it). Each piece's arc is fixed here - a cheap hash of its index, so
   every burst is the same shape and nothing rolls at render: how far across
   (--dx), how high (--dy), how much it spins (--r) and when it leaves (--d).
   Odd pieces fire from the left, even from the right, mirrored. Shared by a
   pack opening and an achievement claim; styled by `.cd-confetti`. */
const rnd = (i, k) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
const CONFETTI = Array.from({ length: 36 }, (_, i) => {
  const left = i % 2 === 0;
  return {
    i, left,
    style: {
      // A share of the room beside the card (styles.css' --reach), not of the screen.
      "--dx": (left ? 1 : -1) * (0.25 + rnd(i, 1) * 0.75),
      "--dy": `${48 + rnd(i, 2) * 40}vh`,
      "--r": `${(rnd(i, 3) - 0.5) * 1440}deg`,
      "--d": `${Math.round(rnd(i, 4) * 220)}ms`,
    },
  };
});

export default function Confetti() {
  return (
    <span className="cd-confetti" aria-hidden="true">
      {CONFETTI.map((c) => <i key={c.i} className={c.left ? "l" : "r"} style={c.style} />)}
    </span>
  );
}
