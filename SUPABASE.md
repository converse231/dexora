# Setting up the account backend

Everything here is done once, in the Supabase dashboard. The game runs without
it — with no credentials configured it saves to the browser exactly as it always
did — so nothing below is needed to develop or to play locally.

## 1. Make the project

1. <https://supabase.com> → **New project**. Any name; pick the region closest
   to you, because every save round-trip crosses it.
2. Wait for it to finish provisioning (a minute or two).

## 2. Copy the two keys

**Project Settings → API**, then copy:

| Dashboard field | Goes in `.env` as |
|---|---|
| Project URL | `VITE_SUPABASE_URL` |
| Project API keys → `anon` `public` | `VITE_SUPABASE_ANON_KEY` |

Create a file called `.env` beside `package.json`:

```
VITE_SUPABASE_URL=https://YOURPROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

`.env` is gitignored and must stay that way. **The `anon` key is the only one
that belongs here** — it is designed to be public and is safe in a browser
bundle. The `service_role` key is not: it bypasses every rule below, so it never
goes in `.env`, in the repo, or in anything shipped to a browser.

## 3. Make the table — **already done on this project**

Run this only when setting up a *new* project. On the current one the table,
row-level security and all three policies are in place and were verified: a
player can read and write their own row, a second player reading the first
player's row gets nothing back, writing to it is refused, and an anonymous
caller sees zero rows.

<details>
<summary>The SQL, for a fresh project</summary>

**SQL Editor → New query**, paste all of this, **Run**:

```sql
-- One row per player. The save is one JSON object and always has been, so it
-- stays one: nothing queries INTO it, the whole row is read at login and
-- written on change.
create table if not exists public.saves (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ROW LEVEL SECURITY IS THE WHOLE SECURITY MODEL HERE. Without it the anon key
-- can read every row in the table, and the anon key is public by design.
alter table public.saves enable row level security;

-- Each policy says the same thing: you only ever touch your own row.
create policy "read own save"   on public.saves for select
  using (auth.uid() = user_id);
create policy "insert own save" on public.saves for insert
  with check (auth.uid() = user_id);
create policy "update own save" on public.saves for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- WHO THE PLAYER IS, in its own table rather than inside the save blob. A name
-- has to be unique across players, and uniqueness is an index, not something a
-- JSON blob can promise. It is also the row a leaderboard would join against,
-- and it survives the save being reset.
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users on delete cascade,
  username   text not null,
  char       text not null default 'red',
  created_at timestamptz not null default now(),
  -- The form checks the same rules first, but the form is a convenience and
  -- this is the rule. check.mjs asserts the two agree.
  constraint username_shape check (username ~ '^[A-Za-z0-9 _-]{3,16}$'),
  constraint char_known     check (char in ('red','leaf'))
);

-- CASE-INSENSITIVELY UNIQUE. "Ash" and "ash" being two players is a problem the
-- day anything lists them side by side, and renaming people later is worse.
create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "read own profile"   on public.profiles for select
  using (auth.uid() = user_id);
create policy "insert own profile" on public.profiles for insert
  with check (auth.uid() = user_id);
create policy "update own profile" on public.profiles for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- DELETING YOUR OWN ACCOUNT NEEDS RIGHTS THE BROWSER MUST NOT HAVE. Removing a
-- row from auth.users is an admin action and the only key a browser may carry
-- is the public one, so the privilege lives in one function rather than in a
-- key. It takes no argument - there is nothing to point at somebody else - and
-- the body can only reach auth.uid(). The profile and the save follow on the
-- foreign key cascade.
create or replace function public.delete_own_account()
returns void
language sql
security definer
-- NOT OPTIONAL on a security definer function: without it a caller can put
-- their own schema in front and have this run against their table instead.
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;

-- SUMMARY COLUMNS, DERIVED BY THE DATABASE. The save stays one jsonb document
-- because nothing queries INTO it - but a leaderboard or a friends list needs
-- four numbers, and reading those out of everybody's whole save is exactly the
-- thing to avoid. A trigger keeps them in step, so they cannot drift the way a
-- second copy written by the client would.
alter table public.profiles
  add column if not exists dex_count int not null default 0,
  add column if not exists caught    int not null default 0,
  add column if not exists steps     int not null default 0,
  add column if not exists xp        int not null default 0,
  add column if not exists played_at timestamptz;

create or replace function public.sync_profile_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p set
    -- 2 is "caught", 1 is "seen".
    dex_count = coalesce((
      select count(*) from jsonb_array_elements_text(new.data->'dex') d
       where d = '2'), 0),
    caught    = coalesce((new.data->>'caught')::int, 0),
    steps     = coalesce((new.data->>'steps')::int, 0),
    xp        = coalesce((new.data->>'xp')::int, 0),
    played_at = new.updated_at
  where p.user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists saves_sync_summary on public.saves;
create trigger saves_sync_summary
  after insert or update on public.saves
  for each row execute function public.sync_profile_summary();

-- ONE SESSION OWNS THE SAVE, AND THE NEWEST ONE TAKES IT. Two tabs, or a phone
-- and a laptop, each ran their own engine and each uploaded the whole save
-- every few seconds: last writer won, continuously, and an afternoon could be
-- erased by a tab somebody forgot was open. Two divergent collections cannot be
-- merged, so the rule is that one session is the writer and the others are told.
alter table public.saves add column if not exists session text;

-- THE INSERT AND THE CLAIM CHECK HAVE TO BE ONE STATEMENT. Read-then-write from
-- a browser races with itself: two devices can both read "nobody owns this" and
-- both go ahead. ON CONFLICT ... WHERE makes the guard part of the write, so the
-- loser gets zero rows and no error, and finds out from the `false`.
-- SECURITY INVOKER deliberately: RLS applies exactly as it does to a direct
-- upsert. This buys atomicity, not privilege.
create or replace function public.save_game(payload jsonb, sess text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare n int;
begin
  insert into public.saves as s (user_id, data, session)
       values (auth.uid(), payload, sess)
  on conflict (user_id) do update
        set data = excluded.data
      where s.session is null or s.session = excluded.session;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.save_game(jsonb, text) from public, anon;
grant execute on function public.save_game(jsonb, text) to authenticated;

-- THE SERVER STAMPS THE TIME. `updated_at` used to be sent by the browser, so a
-- device with a wrong clock wrote a wrong time and a determined one could write
-- any time at all - and `played_at` on the profile is a copy of it.
create or replace function public.stamp_saved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists saves_stamp on public.saves;
create trigger saves_stamp before insert or update on public.saves
  for each row execute function public.stamp_saved_at();

-- A NAME IS WHAT IT LOOKS LIKE. The unique index is on lower(username) and the
-- shape check allows spaces, so " Ash" and "Ash" are two rows that draw
-- identically. The form trims; anyone can post around the form with the public
-- key, so the table has to be the rule.
alter table public.profiles drop constraint if exists username_trimmed;
alter table public.profiles add constraint username_trimmed
  check (username = btrim(username));

-- WHO THE PLAYER IS, kept to the two fields that are hard to add later.
-- `birthdate` is the age gate: a game drawn from Pokémon with open sign-ups
-- will be found by children, and the rules that attach to a child's account are
-- triggered by the age whether or not anybody asked. It pays for itself as a
-- birthday bonus. `terms_at` answers "did they agree, and when".
-- Deliberately NOT here: a real name, a gender, a phone number, a separate
-- display name - each is a thing to store, protect and eventually delete, and
-- none of them changes what the game can do.
alter table public.profiles
  add column if not exists birthdate date,
  add column if not exists terms_at  timestamptz;

-- Immutable bounds only. `current_date` in a CHECK is evaluated at write time,
-- so the constraint would mean something different every day and a restore
-- could fail on rows that were always valid. The age itself is checked by the
-- form; see MIN_AGE in src/game/name.js.
alter table public.profiles drop constraint if exists birthdate_sane;
alter table public.profiles add constraint birthdate_sane
  check (birthdate is null or birthdate between date '1900-01-01' and date '2200-01-01');
```

</details>

Check it took: **Table Editor → saves** should show the table with a green
**RLS enabled** badge. If that badge says *Unrestricted*, stop and re-run the
`alter table` line — an unrestricted table with a public key is every save in
the project readable by anyone.

## 3c. Hardening — **run this once** (added 2026-09, the save audit)

Three things the browser could do to the server that it should not, all found
reading the SQL above rather than in play. Safe to run on a live project: it
adds rules and changes no row, and every statement is re-runnable.

```sql
-- 1. A SAVE HAS A CEILING, because one player can otherwise fill the database
--    for everybody. `data` took any jsonb the browser sent, and a free project
--    is 500MB: one account uploading 100MB blobs puts the project over quota,
--    and an over-quota project goes READ-ONLY - which is every other player's
--    upload failing at once. A real save is ~40KB at 600 caught; 5MB is over a
--    hundred times that, so no honest collection reaches it. The shape half is
--    what `saveProblem` already demands of a file in the browser.
alter table public.saves drop constraint if exists save_shape;
alter table public.saves add constraint save_shape check (
  jsonb_typeof(data) = 'object'
  and jsonb_typeof(data->'dex') = 'array'
  and octet_length(data::text) <= 5242880
);

-- 2. THE SUMMARY TRIGGER MUST NOT BE ABLE TO FAIL THE UPLOAD. It cast with
--    `::int`, and it runs AFTER the save in the same statement - so a save
--    whose `caught` was not an integer (a hand-edited file, or any future
--    field that becomes fractional) made the trigger throw, the throw rolled
--    back the upload, and that account could never sync again: every retry
--    failed identically, reported only as "not synced". A summary is a
--    convenience; the save is the record. Anything unreadable counts as 0.
create or replace function public.summary_int(v jsonb)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(v) = 'number'
    then greatest(0, least((v #>> '{}')::numeric, 2147483647))::int
    else 0 end
$$;

create or replace function public.sync_profile_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p set
    -- 2 is "caught", 1 is "seen".
    dex_count = case when jsonb_typeof(new.data->'dex') = 'array' then (
      select count(*) from jsonb_array_elements_text(new.data->'dex') d
       where d = '2') else 0 end,
    caught    = public.summary_int(new.data->'caught'),
    steps     = public.summary_int(new.data->'steps'),
    xp        = public.summary_int(new.data->'xp'),
    played_at = new.updated_at
  where p.user_id = new.user_id;
  return new;
end;
$$;

-- 3. A PROFILE'S DERIVED COLUMNS ARE THE DATABASE'S, NOT THE PLAYER'S.
--    "update own profile" is a ROW rule - it says whose row, not which
--    columns - so a player could write their own dex_count, steps, xp,
--    played_at and created_at straight from the console. Nothing reads them
--    today, which is exactly when to close it: the day a leaderboard or a
--    friends list reads them, the numbers are already forgeable. The trigger
--    above is `security definer`, so it still writes them.
revoke update on public.profiles from anon, authenticated;
grant  update (username, char, birthdate) on public.profiles to authenticated;
revoke insert on public.profiles from anon, authenticated;
grant  insert (user_id, username, char, birthdate, terms_at)
  on public.profiles to authenticated;
```

**Check it took:** this should list exactly `username`, `char` and `birthdate`
for UPDATE, and changing your trainer in Settings must still work:

```sql
select privilege_type, column_name from information_schema.column_privileges
 where table_name = 'profiles' and grantee = 'authenticated' order by 1, 2;
```
The game needs nothing redeployed for any of this — every column it writes is
still granted.

## 4. Turn off email confirmation — **you have to do this one**

It is the only step that cannot be done from here: the setting lives in GoTrue's
config rather than in the database, so it needs the dashboard (or a Management
API token).

**Authentication → Sign In / Providers → Email → turn OFF "Confirm email" →
Save.**

**This is not only about convenience.** With confirmation on, every sign-up
sends an email, and the built-in mail service allows a *handful per hour* across
the whole project — verified here, the third test sign-up came back
`over_email_send_rate_limit`. Real players would hit that within minutes of
launch and simply be unable to register. So either:

- **turn confirmation off** (what this project is set up for), or
- **keep it on and configure your own SMTP** under *Authentication → Emails →
  SMTP Settings*, because the built-in sender is explicitly not for production.

While you are in there, **Authentication → URL Configuration → Site URL** should
be wherever the game is actually hosted.

## 4b. Password reset — **you have to do this one too**

Until this is configured, **a forgotten password is an account nobody can ever
get back into**, and the dex with it. The game has the whole flow built; what it
needs from you is a way to send mail.

**Why the built-in sender will not do.** Supabase's own mailer is capped at
**2 messages per hour for the whole project**, cannot be raised without custom
SMTP, and carries no delivery guarantee at all — it is the same cap that blocked
sign-ups in step 4. Two players forgetting a password in the same hour is the
whole budget, and what does go out lands in spam often enough to read as broken.

**It is not nothing, though, and that matters for sequencing.** Recovery mail
does send through it, so the flow works from the day it ships; it works
*badly*. You can distribute before this step is done and turn it on the day the
domain lands. What you cannot do is rely on it.

**1. Get an SMTP sender — this project uses [Resend](https://resend.com).**
Free tier, and password resets will never come close to its limits.

**You need a domain you control, and `dexora-self.vercel.app` is not one.**
Vercel owns `vercel.app`, so you cannot add DNS records under it, and no mail
provider will let you send as a domain you cannot prove you own. A domain is
about £10 a year — [Cloudflare Registrar](https://domains.cloudflare.com) sells
at cost, [Porkbun](https://porkbun.com) and [Namecheap](https://namecheap.com)
are the usual alternatives. Point the game at it while you are there; a custom
domain in Vercel is two minutes and one CNAME.

**Then: Resend → Domains → Add Domain.** Pick the region nearest your players -
it is baked into the records it generates, and changing it later means
re-verifying. Resend gives you three records to add at your registrar:

| record | on | what it does |
|---|---|---|
| MX | `send.yourdomain.com` | where bounces and complaints come back to |
| TXT (SPF) | `send.yourdomain.com` | says which servers may send as you |
| TXT (DKIM) | `resend._domainkey.yourdomain.com` | signs each message so the recipient can check it was really you |

SPF and DKIM together are what stop the mail going to spam; the MX record is
what stops a bounce disappearing. **Copy the values verbatim from Resend's own
screen** — they are per-domain and per-region, so any value written down here
would be wrong for you. Three things go wrong at this step and all three are
silent:

- **The name field.** Some registrars want `send`, some want the whole
  `send.yourdomain.com`. Enter the full name at one that auto-appends and you
  get `send.yourdomain.com.yourdomain.com`.
- **Cloudflare proxying.** If your DNS is at Cloudflare, the DKIM record must
  be **DNS only** (grey cloud), not proxied. A proxied TXT record is not
  resolvable as itself.
- **The DKIM value is long.** Paste it whole; some registrar forms truncate it
  without saying so.

Hit **Verify**. It is usually minutes; DNS can take an hour.

**Worth adding while you are in there:** a DMARC record - TXT on
`_dmarc.yourdomain.com`, value `v=DMARC1; p=none;`. Not required at this volume
and it changes nothing about delivery on its own, but Gmail and Yahoo both now
expect one from anybody sending in bulk, and `p=none` commits you to nothing.

**Last, an API key.** *Resend → API Keys → Create*. Copy it once - it is shown
once - because **the API key is the SMTP password**.

**2. Put it in Supabase.** *Authentication → Emails → SMTP Settings* → **Enable
Custom SMTP**:

| field | value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` — the literal word, not your email |
| Password | the `re_…` API key |
| Sender email | something at the domain you just verified, e.g. `noreply@yourdomain.com` |
| Sender name | `Dexora` |

Two of those are the usual mistakes. The username really is the string
`resend`. And **the sender address must be at the verified domain** — sending
as a Gmail address you do not own is the single commonest reason reset mail
silently disappears.

**3. Allow the game's address back.** *Authentication → URL Configuration*:

- **Site URL** — the production origin, e.g. `https://dexora-self.vercel.app`.
  This is where a link goes when nothing else matches, so a Site URL still
  pointing at `localhost` sends every real player's reset link to their own
  machine, where nothing is running.
- **Redirect URLs** — add the production origin *and* `http://localhost:5199`
  for development. The game asks to come back to `window.location.origin`, and
  an origin that is not on this list is ignored in favour of the Site URL.

**4. Check the template.** *Authentication → Emails → Reset Password*. The
default is fine; the link expires in an hour and works once.

**Once custom SMTP is on, the cap starts at 30/hour**, not unlimited — Supabase
imposes its own until you raise it under *Authentication → Rate Limits*. Worth
doing at the same time, or the first busy day looks exactly like a broken
mailer.

**5. Test it.** Log out, **I have forgotten my password**, enter your address.
You should get mail within a minute; the link opens the game on *Choose a new
password* and drops you straight into your save.

Two things worth knowing about how this is wired:

- **The link works in any browser**, including a phone's mail app on a different
  device from the one that asked. That is why the client uses GoTrue's implicit
  flow rather than PKCE — PKCE keeps a verifier in the localStorage of the
  browser that made the request, and opening the link anywhere else fails with
  nothing useful to say.
- **The form always says "check your email"**, whether or not that address has
  an account. Answering honestly would turn it into a way to ask which
  addresses are registered here.

**Changing an email address is deliberately not built.** It is a two-message
confirmation — the old address approves, the new one verifies — and half-built
it leaves accounts pointing at inboxes nobody owns. The email is also the only
handle on an account if the password goes.

## 5. Run it

```
npm run dev
```

You should get the login screen instead of the game. Make an account, pick a
trainer, and you are in. To check the save is really landing: play for a few
seconds, then **Table Editor → saves** — there should be one row, with
`updated_at` moving as you walk.

---

## What is actually protected, and what is not

Worth being plain about, because it decides what can safely be built next.

**Protected.** Nobody can read or write anyone else's save. That is RLS, and it
is enforced by the database rather than by the game — tested directly against
this project by impersonating one player and trying to reach another's row.

**Also checked:** the built bundle contains the project URL and the publishable
key, and does *not* contain `DATABASE_PASSWORD`. Vite only inlines variables
prefixed `VITE_`, so the database password in `.env` stays on your machine —
but it is a real credential, so `.env` must never be committed. It is gitignored.

### Why the save is one JSONB column and not thirty tables

Worth setting out, because "put it all in Postgres" sounds more integrated than
it is.

**Nothing queries into a save.** The whole document is read once at login and
written on change. A box of 500 Pokémon normalised into rows is 500 upserts
every few seconds instead of one; a dex is 1,145 small integers per player.
Splitting them would make the game measurably slower and buy nothing, because
no query ever asks "which Pokémon are in this box" across players.

**What does belong in its own table is anything the database can do that a blob
cannot** - and there are three such things, two of which are already here:

| | why it is a table |
|---|---|
| `profiles.username` | uniqueness is an index; a blob cannot promise it |
| summary columns | a leaderboard reads four numbers, not 200 saves |
| box entries *(not yet)* | trading needs server-owned rows so nothing duplicates |

The third is deliberately absent: trading is deferred, and box rows are only
worth their cost when something other than the owner has to move them.

**Also bounded** (§3c): a save is capped at 5MB and must be an object with a
dex, so one account cannot fill the project for everybody; the summary trigger
cannot fail an upload; and a profile's derived columns are written only by the
database.

**Not protected.** Every number in the save is computed in the browser and
uploaded — the catch roll, the money, the dex. Someone determined can edit their
own save. For a save that follows one person between devices that is fine, and
it is why **there is no leaderboard**: a score nobody can trust is worse than no
score.

The day one is wanted, the fix is already set up rather than a rewrite. Ten of
the thirteen modules in `src/game` are browser-free — `check.mjs` asserts it — so
deciding a catch moves into an edge function that imports the same rules, and
the client starts sending the throw rather than the outcome.

## If something goes wrong

| What you see | What it is |
|---|---|
| `over_email_send_rate_limit` on sign-up | Confirmation is still on and the built-in mailer is capped at a few per hour — see step 4 |
| `email_address_invalid` on sign-up | Supabase rejects obviously fake domains, `example.com` among them |
| Login screen never appears, game loads straight in | `.env` is missing or misnamed, or the dev server was not restarted after creating it — Vite reads `.env` at startup only |
| "Cannot reach the server" | URL typo, or the project is paused (free projects pause after inactivity — open the dashboard to wake it) |
| Sign-up works, login says "email not confirmed" | Confirmation is on and the email has not been clicked — see step 4 |
| Logged in, but the save does not appear in the table | RLS policies missing; re-run step 3 |
| `violates foreign key constraint "profiles_user_id_fkey"` | The browser is holding a token for a user row that has been deleted — emptying `auth.users` while somebody is logged in does this. Fixed at the root: `restore()` validates the session with `getUser()` at boot and signs out when the server says the user is gone, so this can only be seen on a build older than that |
| `NOT SAVING` in the top bar | The local write failed (full or blocked storage). The cloud sync is separate and fails quietly |
