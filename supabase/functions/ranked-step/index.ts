// THE RANKED-STEP EDGE FUNCTION (docs/ranked.md, 6b; deploy: SUPABASE.md §3f).
// The shell only: CORS, who is asking, and the service-role client that calls
// db/ranked.sql. Everything else is handler.js, which the tests run in Node.
//
// WHO IS ASKING is Supabase Auth's answer to the request's token, so the
// function is deployed with --no-verify-jwt (SUPABASE.md §3f) and
// works whichever JWT signing keys the project uses.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle } from "./handler.js";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method" });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data } = token ? await admin.auth.getUser(token) : { data: null };
  let body = null;
  try { body = await req.json(); } catch { /* an empty or broken body is answered below */ }
  const { status, body: answer } = await handle({ user: data?.user?.id ?? null, body, rpc });
  return json(status, answer);
});
