/* THE LINK FOR AN ONLINE ARENA MATCH (the Arena plan, phase 3): WebRTC, one
   reliable data channel straight between the two browsers, introduced
   through the invite's room (`arenaRoom`, net/cloud.js - the only file that
   names Supabase). The match on it is game/arena.js's `lockstep`.

   STUN ONLY: there is no relay server on the free tier, so two networks that
   cannot reach each other directly (some mobile carriers, strict offices)
   never connect, and `connect` says so plainly ("blocked") instead of
   hanging. The room is closed the moment the channel opens: the match never
   touches the server. */
import { arenaRoom } from "../../../net/cloud.js";

const ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
export const GUEST_WAIT = 20000;          // the challenger is already in the room
export const HOST_WAIT = 150000;          // a challenge waits two minutes for its answer, then a little

/* Answers {ok: true, link} or {ok: false, why}: "signin", "offline" (the room
   would not open), "timeout" (nobody came, or the handshake never finished),
   "blocked" (the networks cannot reach each other - said ONLY when WebRTC
   says so), "handshake" (an offer or answer would not apply). `cancel()` on
   the returned promise gives up early. */
export function connect({ room, host, wait = host ? HOST_WAIT : GUEST_WAIT }) {
  let stop = () => {};
  const p = new Promise((done) => {
    const me = host ? "h" : "g";
    let finished = false, offered = false, answering = false, remote = false, hello = 0;
    const early = [];
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const sig = arenaRoom(room, (m) => { hear(m).catch(() => finish(null, "handshake")); });
    if (!sig) { pc.close(); done({ ok: false, why: "signin" }); return; }
    const timer = setTimeout(() => finish(null, "timeout"), wait);
    function finish(link, why) {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearInterval(hello); sig.close();
      if (link) done({ ok: true, link });
      else { try { pc.close(); } catch { /* already closed */ } done({ ok: false, why }); }
    }
    stop = () => finish(null, "cancelled");
    pc.onicecandidate = (e) => { if (e.candidate) sig.send({ k: "ice", from: me, c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") finish(null, "blocked"); };
    const wire = (ch) => { ch.onopen = () => finish(linkOf(pc, ch), null); };
    if (host) wire(pc.createDataChannel("arena", { ordered: true }));
    else pc.ondatachannel = (e) => wire(e.channel);
    const desc = () => ({ type: pc.localDescription.type, sdp: pc.localDescription.sdp });
    const addIce = (c) => pc.addIceCandidate(c).catch(() => {});
    async function hear(m) {
      if (finished || !m || m.from === me) return;
      if (m.k === "here") {
        /* The host offers once it knows the guest is listening; the guest says
           it is. Every flag is set BEFORE the first await: a second "here"
           landing while the offer was being made read a null description,
           threw, and was reported as two networks that cannot meet. */
        if (host && !offered) {
          offered = true;
          await pc.setLocalDescription(await pc.createOffer());
          sig.send({ k: "offer", from: me, sdp: desc() });
        } else if (host && !remote && pc.localDescription) sig.send({ k: "offer", from: me, sdp: desc() });   // the first was lost
        else if (!host && !remote) sig.send({ k: "here", from: me });
      } else if (m.k === "offer" && !host && !answering) {
        answering = true;
        await pc.setRemoteDescription(m.sdp);
        remote = true; early.splice(0).forEach(addIce);
        await pc.setLocalDescription(await pc.createAnswer());
        sig.send({ k: "answer", from: me, sdp: desc() });
      } else if (m.k === "offer" && !host && remote && pc.localDescription) {
        sig.send({ k: "answer", from: me, sdp: desc() });                 // our answer was lost
      } else if (m.k === "answer" && host && !answering) {
        answering = true;
        await pc.setRemoteDescription(m.sdp);
        remote = true; early.splice(0).forEach(addIce);
      } else if (m.k === "ice" && m.c) {
        if (remote) addIce(m.c); else early.push(m.c);
      }
    }
    sig.ready.then((ok) => {
      if (!ok) return finish(null, "offline");
      // Said until the other end answers: a broadcast sent before it subscribed is lost.
      const say = () => { if (!remote && (!host || !offered)) sig.send({ k: "here", from: me }); };
      say();
      hello = setInterval(say, 1500);
    });
  });
  p.cancel = () => stop();
  return p;
}

/* The open channel as the match uses it: `send` a message, `listen(fn)` for
   the other end's (what came before anyone listened is kept and handed
   over), an `onclose` hook, `close()`. A connection that fails or closes is
   gone; a "disconnected" one may come back, so the page's stall clock decides. */
function linkOf(pc, ch) {
  let ear = null;
  const backlog = [];
  const link = {
    open: true, onclose: null,
    send(m) { if (link.open && ch.readyState === "open") { try { ch.send(JSON.stringify(m)); } catch { /* closing */ } } },
    listen(fn) { ear = fn; for (const m of backlog.splice(0)) fn(m); },
    close() { if (!link.open) return; link.open = false; try { ch.close(); pc.close(); } catch { /* already closed */ } },
  };
  const gone = () => { if (!link.open) return; link.open = false; link.onclose?.(); };
  ch.onmessage = (e) => { let m = null; try { m = JSON.parse(e.data); } catch { return; } if (ear) ear(m); else backlog.push(m); };
  ch.onclose = gone;
  pc.onconnectionstatechange = () => { if (pc.connectionState === "failed" || pc.connectionState === "closed") gone(); };
  return link;
}
