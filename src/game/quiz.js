/* WHO'S THAT POKEMON? (2026-10-14, the shortlist's second phase): one
   silhouette a day, four names to choose from, one answer. The day picks it
   (a hash of `dayKey`, like the quest), so a reload or a second tab cannot
   reroll it. The other three names come from the same generation - the
   silhouette, not the era, is the question. Right pays `QUIZ_PAY` and puts
   the species in your Pokedex as SEEN (never caught: a guess is not a catch).

   Browser-free, so check.mjs can bound it. */
import { SPECIES } from "../data/dex.js";
import { genOf } from "./biomes.js";
import { hash } from "./daily.js";

export const QUIZ_CHOICES = 4;
export const QUIZ_PAY = { candy: 3 };

// Species, never forms: a Mega's silhouette is its base's with spikes.
const POOL = SPECIES.filter((s) => s.id < 10000).map((s) => s.id);

let last = null;
export function quizFor(key) {
  if (last?.key === key) return last;
  const answer = POOL[hash(`${key}:quiz`) % POOL.length];
  const kin = POOL.filter((id) => id !== answer && genOf(id) === genOf(answer));
  const choices = [answer];
  for (let i = 0; choices.length < QUIZ_CHOICES; i++) {
    const id = kin[hash(`${key}:quiz:${i}`) % kin.length];
    if (!choices.includes(id)) choices.push(id);
  }
  // Shuffled by the day too, so the answer is not always first.
  choices.sort((a, b) => hash(`${key}:${a}`) - hash(`${key}:${b}`));
  last = { key, answer, choices };
  return last;
}

// A saved answer: today's key and whether it was right, or none.
export const cleanQuiz = (q) => (q && typeof q === "object" && /^\d{8}$/.test(q.day ?? "")
  && typeof q.ok === "boolean" ? { day: q.day, ok: q.ok } : null);
