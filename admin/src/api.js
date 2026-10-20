/* THE DASHBOARD'S ONE DOOR TO SUPABASE (docs/admin.md). Every number comes
   from an `admin_*` function, which refuses anyone but a listed admin signed
   in with two-factor - this file guards nothing, the database does.

   One call per page, kept five minutes in memory and in sessionStorage, so
   moving between pages and back costs no request (the free tier's egress);
   Refresh asks again, and signing out forgets it all. */
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(URL && KEY);
export const sb = configured
  ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "dexora-admin" } })
  : null;

const TTL = 5 * 60_000;
const PREFIX = "adm:";
const mem = new Map();
const keyOf = (fn, args) => `${PREFIX}${fn}:${JSON.stringify(args ?? {})}`;
const read = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked: memory still holds it */ } };

export async function call(fn, args = {}, fresh = false) {
  const k = keyOf(fn, args);
  if (!fresh) {
    const hit = mem.get(k) ?? read(k);
    if (hit && Date.now() - hit.at < TTL) return hit;
  }
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  const hit = { at: Date.now(), data };
  mem.set(k, hit);
  write(k, hit);
  return hit;
}

export function forget() {
  mem.clear();
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
  } catch { /* nothing stored */ }
}

// A moderation write: never cached, and it makes every cached read stale.
export async function act(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  forget();
  return data;
}

/* A page's data. `tick` is the page's Refresh: any press after the first asks
   the server again rather than the cache. */
export function useCall(fn, args = {}, tick = 0) {
  const key = JSON.stringify(args);
  const [state, setState] = useState({ data: null, at: 0, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    call(fn, JSON.parse(key), tick > 0)
      .then((hit) => live && setState({ data: hit.data, at: hit.at, error: null, loading: false }))
      .catch((e) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => { live = false; };
  }, [fn, key, tick]);
  return state;
}
