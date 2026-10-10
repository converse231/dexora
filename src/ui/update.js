/* A NEW DEPLOY, NOTICED (reported 2026-10-10: Cadence drawn twice, stacked).
   iOS keeps a backgrounded tab's page alive for days, so a phone went on
   running the OLD code - 8-frame strip CSS - while the art it fetched was the
   NEW 16-frame strips: two creatures in every frame box. The page itself is
   never cached (`must-revalidate`), so a reload always fixes it; the trouble
   is that nothing ever reloaded.

   So the game asks: whenever the tab comes back into view (and every
   `EVERY` while it stays open), it fetches the live page and compares the
   name of its main script, a content hash Vite stamps on every build, with
   the one it is running. A dev server has no hashed script and never asks.
   Offline, the question fails quietly and is asked again later. */
import { useEffect, useState } from "react";

const EVERY = 10 * 60 * 1000;
const SCRIPT = /src="([^"]*assets\/index-[^"]+\.js)"/;

const running = () => document.querySelector('script[type="module"][src*="assets/index-"]')?.getAttribute("src") ?? null;

export function useNewVersion() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const mine = running();
    if (!mine) return undefined;
    let live = true, last = 0;
    const look = async () => {
      // At most once a minute: a phone flicking between apps is not a reason to ask again.
      if (document.hidden || Date.now() - last < 60000) return;
      last = Date.now();
      try {
        const html = await (await fetch(new URL("./", document.baseURI), { cache: "no-store" })).text();
        const now = SCRIPT.exec(html)?.[1];
        if (live && now && now !== mine) setFresh(true);
      } catch { /* offline: ask again later */ }
    };
    const t = setInterval(look, EVERY);
    document.addEventListener("visibilitychange", look);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", look); };
  }, []);
  return fresh;
}
