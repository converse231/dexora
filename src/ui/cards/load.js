/* WHERE CARD DATA AND ART COME FROM, in one place (docs/cards.md).

   The set files load lazily, one chunk each, so nothing here puts card data
   in the main bundle - the Cards page and the Dex sheet's Cards card both
   ask through `loadSet`. The only module that names the set files (asserted). */
const LOADERS = import.meta.glob("../../data/cards/sets/*.js");
const cache = new Map();
export const loadSet = (id) => {
  if (!cache.has(id)) cache.set(id, LOADERS[`../../data/cards/sets/${id}.js`]?.() ?? Promise.resolve(null));
  return cache.get(id);
};

const at = (path) => new URL(path, document.baseURI).href;
export const cardUrl = (setId, localId) => at(`cards/${setId}/${localId}.webp`);
export const logoUrl = (setId) => at(`cards/${setId}/logo.webp`);
export const packUrl = (setId, slug) => at(`cards/${setId}/pack-${slug}.webp`);
export const backUrl = () => at("cards/back.webp");
// The large image is TCGdex's own, loaded only when a card is inspected.
export const hiUrl = (set, localId) => `${set.SET.asset}${localId}/high.webp`;
