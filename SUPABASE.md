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
```

</details>

Check it took: **Table Editor → saves** should show the table with a green
**RLS enabled** badge. If that badge says *Unrestricted*, stop and re-run the
`alter table` line — an unrestricted table with a public key is every save in
the project readable by anyone.

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
