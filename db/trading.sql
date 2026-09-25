-- TRADING, PHASE 0 - the server half (docs/trading.md).
--
-- Run AFTER the base schema in SUPABASE.md. Idempotent: running it twice is
-- the same as running it once, so a partial run is fixed by running it again.
--
-- THE RULE EVERYTHING HERE SERVES: a Pokemon that has entered trading has a
-- row the server owns, and only these functions move it - each in ONE
-- transaction with the rows locked, the `save_game` pattern, because a trade
-- that is two statements is a trade that duplicates under a double-click.
--
-- AND THE ONE THAT OUTRANKS IT: nothing here may make a save upload fail.
-- Players' collections come first (CLAUDE.md); the save trigger swallows its
-- own errors and lets the write through.

-- ------------------------------------------------------------------ tables

create table if not exists public.mons (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users on delete cascade,
  -- The owner's box uid for it. NULL while it is on its way to a new owner,
  -- whose client assigns one; the save trigger learns it back.
  local_uid  int,
  species    int  not null check (species between 1 and 20000),
  level      int  not null check (level between 1 and 1000),
  size       int  check (size between 1 and 1000),
  tier       text check (tier in ('showdown','shiny','astral','glitched','holo','origin','noir','vivid')),
  alpha      boolean not null default false,
  ot         uuid,                 -- the trainer who first registered it
  ot_name    text,
  traded     int  not null default 0,
  -- held: in its owner's box.  offered/listed/pooled: locked by a trade.
  -- arriving: moved, not yet in the new owner's saved box.
  -- released: gone from its owner's box (sold, converted, starred) - kept,
  -- and revived if it ever reappears in a save (a restore, an import).
  status     text not null default 'held'
             check (status in ('held','offered','listed','pooled','arriving','released')),
  created_at timestamptz not null default now(),
  moved_at   timestamptz not null default now()
);
create unique index if not exists mons_owner_uid
  on public.mons (owner, local_uid) where local_uid is not null and status <> 'released';
create index if not exists mons_owner on public.mons (owner, status);

create table if not exists public.trades (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('direct','surprise','board')),
  a          uuid not null references auth.users on delete cascade,   -- proposer
  b          uuid references auth.users on delete cascade,            -- the other side
  a_mons     uuid[] not null,
  b_mons     uuid[] not null default '{}',
  msg        int check (msg between 0 and 63),                        -- a PRESETS index
  status     text not null default 'open'
             check (status in ('open','done','declined','cancelled','expired','failed')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index if not exists trades_a on public.trades (a, status);
create index if not exists trades_b on public.trades (b, status);

-- What actually moved, both sides, forever. The day something is wrong, "what
-- moved" is the only question, and a save cannot answer it.
create table if not exists public.trade_log (
  id         bigint generated always as identity primary key,
  trade      uuid not null,
  mon        uuid not null,
  from_user  uuid not null,
  to_user    uuid not null,
  snapshot   jsonb not null,
  at         timestamptz not null default now()
);
create index if not exists trade_log_from on public.trade_log (from_user, at desc);
create index if not exists trade_log_to   on public.trade_log (to_user, at desc);

-- ------------------------------------------------------------------ RLS
-- READ your own; WRITE nothing. Every write goes through a function below.
alter table public.mons      enable row level security;
alter table public.trades    enable row level security;
alter table public.trade_log enable row level security;

drop policy if exists "read own mons" on public.mons;
create policy "read own mons" on public.mons for select using (auth.uid() = owner);
drop policy if exists "read own trades" on public.trades;
create policy "read own trades" on public.trades for select using (auth.uid() in (a, b));
drop policy if exists "read own log" on public.trade_log;
create policy "read own log" on public.trade_log for select
  using (auth.uid() in (from_user, to_user));

-- ------------------------------------------------------------------ limits
-- Mirrors LIMITS in src/game/trade.js; check.mjs holds the two equal.
create or replace function public.trade_limit(name text)
returns int language sql immutable set search_path = '' as $$
  select case name
    when 'TRADES_PER_DAY' then 10
    when 'SURPRISE_PER_DAY' then 5
    when 'OPEN_OFFERS' then 10
    when 'OPEN_LISTINGS' then 5
    when 'LISTING_DAYS' then 7
    when 'MAX_SIDE' then 3
    when 'SHOWCASE' then 6
    when 'SEEKING' then 12
    when 'FRIENDS' then 100
  end
$$;

-- A mon as a trainer is shown it.
create or replace function public.mon_json(m public.mons)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('mid', m.id, 'species', m.species, 'level', m.level,
    'size', m.size, 'tier', m.tier, 'alpha', m.alpha, 'ot', m.ot_name,
    'traded', m.traded, 'status', m.status)
$$;

-- ------------------------------------------------------------------ register
-- A box entry enters trading. Checked against the caller's STORED save: the
-- uid must be there, species and level must match, and the tier, alpha and
-- size are read from the stored entry rather than from the request. Entries
-- not yet uploaded are skipped (the client flushes first and asks again).
-- Returns [{uid, mid}] for everything that has a row.
create or replace function public.register_mons(snaps jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  box jsonb;
  s jsonb;
  e jsonb;
  u int;
  m uuid;
  who text;
  out jsonb := '[]';
begin
  if me is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(snaps) is distinct from 'array' or jsonb_array_length(snaps) > 20 then
    raise exception 'bad request';
  end if;
  select data->'box' into box from public.saves where user_id = me;
  select username into who from public.profiles where user_id = me;
  for s in select * from jsonb_array_elements(snaps) loop
    if coalesce(s->>'uid', '') !~ '^\d{1,9}$' then continue; end if;
    u := (s->>'uid')::int;
    select id into m from public.mons
     where owner = me and local_uid = u and status <> 'released';
    if m is null then
      select x into e from jsonb_array_elements(coalesce(box, '[]')) x
       where x->>'uid' = u::text limit 1;
      if e is null or e ? 'mid'
         or e->>'species' is distinct from s->>'species'
         or e->>'level' is distinct from s->>'level'
         or coalesce(e->>'species', '') !~ '^\d{1,5}$'
         or coalesce(e->>'level', '') !~ '^\d{1,4}$' then
        continue;
      end if;
      insert into public.mons (owner, local_uid, species, level, size, tier, alpha, ot, ot_name)
      values (me, u, (e->>'species')::int, (e->>'level')::int,
        case when coalesce(e->>'size', '') ~ '^\d{1,4}$' then (e->>'size')::int end,
        (select t from unnest(array['showdown','shiny','astral','glitched','holo','origin','noir','vivid']) t
          where e->>t = '1' limit 1),
        coalesce(e->>'alpha' = '1', false), me, who)   -- absent is false, never null
      returning id into m;
    end if;
    out := out || jsonb_build_object('uid', u, 'mid', m);
  end loop;
  return out;
end;
$$;

-- ------------------------------------------------------------------ offers
-- Propose: your side is locked ('offered') until the offer closes.
create or replace function public.propose_trade(target uuid, give uuid[], want uuid[], msg int default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if target is null or target = me then raise exception 'no such trainer'; end if;
  if cardinality(give) not between 1 and public.trade_limit('MAX_SIDE')
     or cardinality(want) not between 1 and public.trade_limit('MAX_SIDE') then
    raise exception 'one to three on each side';
  end if;
  if (select count(*) from public.trades where a = me and status = 'open')
     >= public.trade_limit('OPEN_OFFERS') then
    raise exception 'too many open offers';
  end if;
  -- Lock your side, and check it is all yours and free - in the same statement.
  perform 1 from public.mons where id = any(give) for update;
  if (select count(*) from public.mons where id = any(give) and owner = me and status = 'held')
     <> cardinality(give) then
    raise exception 'offered Pokemon are not free to trade';
  end if;
  if (select count(*) from public.mons where id = any(want) and owner = target and status = 'held')
     <> cardinality(want) then
    raise exception 'asked-for Pokemon are not available';
  end if;
  update public.mons set status = 'offered' where id = any(give);
  insert into public.trades (kind, a, b, a_mons, b_mons, msg)
  values ('direct', me, target, give, want, msg)
  returning id into t;
  return t;
end;
$$;

-- Free the proposer's side of a trade that did not happen.
create or replace function public.trade_release(tr public.trades)
returns void language sql security definer set search_path = '' as $$
  update public.mons set status = 'held'
   where id = any(tr.a_mons) and owner = tr.a and status in ('offered','listed','pooled');
$$;
revoke all on function public.trade_release(public.trades) from public, anon, authenticated;

-- THE SWAP. Both sides re-checked with every row locked, in id order (two
-- accepts that share a Pokemon queue instead of deadlocking); either all of it
-- happens or none. Returns 'done', or why not.
create or replace function public.answer_trade(tid uuid, yes boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  tr public.trades;
  ids uuid[];
  day timestamptz := date_trunc('day', now());
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into tr from public.trades where id = tid for update;
  if not found or tr.b is distinct from me or tr.status <> 'open' then
    return 'gone';
  end if;
  if not yes then
    update public.trades set status = 'declined', closed_at = now() where id = tid;
    perform public.trade_release(tr);
    return 'declined';
  end if;

  ids := tr.a_mons || tr.b_mons;
  perform 1 from public.mons where id = any(ids) order by id for update;
  if (select count(*) from public.mons where id = any(tr.a_mons) and owner = tr.a and status = 'offered')
       <> cardinality(tr.a_mons)
     or (select count(*) from public.mons where id = any(tr.b_mons) and owner = me and status = 'held')
       <> cardinality(tr.b_mons)
     or (select count(*) from public.trades where status = 'done' and closed_at >= day
          and me in (a, b)) >= public.trade_limit('TRADES_PER_DAY')
     or (select count(*) from public.trades where status = 'done' and closed_at >= day
          and tr.a in (a, b)) >= public.trade_limit('TRADES_PER_DAY') then
    update public.trades set status = 'failed', closed_at = now() where id = tid;
    perform public.trade_release(tr);
    return 'failed';
  end if;

  insert into public.trade_log (trade, mon, from_user, to_user, snapshot)
  select tid, m.id, m.owner, case when m.owner = tr.a then me else tr.a end, public.mon_json(m)
    from public.mons m where m.id = any(ids);
  update public.mons
     set owner = case when owner = tr.a then me else tr.a end,
         status = 'arriving', local_uid = null, traded = traded + 1, moved_at = now()
   where id = any(ids);
  update public.trades set status = 'done', closed_at = now() where id = tid;
  -- Both cards count it (the table arrives in phase 1; absent, nothing to count).
  if to_regclass('public.trainer_cards') is not null then
    update public.trainer_cards set trades = trades + 1 where user_id in (tr.a, me);
  end if;
  -- Any other open offer asking for one of these can no longer happen.
  update public.trades set status = 'failed', closed_at = now()
   where status = 'open' and id <> tid and (b_mons && ids or a_mons && ids);
  return 'done';
end;
$$;

create or replace function public.cancel_trade(tid uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  tr public.trades;
begin
  select * into tr from public.trades where id = tid for update;
  if not found or tr.a is distinct from auth.uid() or tr.status <> 'open' then return false; end if;
  update public.trades set status = 'cancelled', closed_at = now() where id = tid;
  perform public.trade_release(tr);
  return true;
end;
$$;

-- ------------------------------------------------------------------ inbox
-- Everything the client needs to reconcile, in one round trip - the argument
-- `reconcileTrades` takes. Expires the caller's stale offers on the way (a
-- lazy sweep: no cron to forget, no job to fail).
create or replace function public.trade_inbox()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  tr public.trades;
begin
  if me is null then raise exception 'not signed in'; end if;
  for tr in select * from public.trades
             where a = me and status = 'open'
               and created_at < now() - make_interval(days => public.trade_limit('LISTING_DAYS'))
             for update loop
    update public.trades set status = 'expired', closed_at = now() where id = tr.id;
    perform public.trade_release(tr);
  end loop;
  return jsonb_build_object(
    'arrived', coalesce((select jsonb_agg(public.mon_json(m)) from public.mons m
                          where m.owner = me and m.status = 'arriving'), '[]'),
    'locks',   coalesce((select jsonb_object_agg(m.id, m.status) from public.mons m
                          where m.owner = me and m.status in ('held','offered','listed','pooled')), '{}'),
    'gone',    coalesce((select jsonb_agg(distinct l.mon) from public.trade_log l
                          where l.from_user = me
                            and not exists (select 1 from public.mons x where x.id = l.mon and x.owner = me)), '[]'),
    'open',    coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'mine', t.a = me,
                          'a', t.a, 'b', t.b, 'msg', t.msg, 'at', t.created_at,
                          'give', (select jsonb_agg(public.mon_json(m)) from public.mons m where m.id = any(t.a_mons)),
                          'want', (select jsonb_agg(public.mon_json(m)) from public.mons m where m.id = any(t.b_mons))))
                          from public.trades t where me in (t.a, t.b) and t.status = 'open'), '[]')
  );
end;
$$;

-- ------------------------------------------------------------------ the save
-- ONE STEP ON EVERY SAVE WRITE, as a trigger so it covers `save_game` and any
-- direct upsert alike:
--   * a box entry whose `mid` another trainer owns is STRIPPED - an old
--     device, an import or a restore cannot bring a traded Pokemon back;
--   * an entry whose `mid` is unknown is KEPT (never strip what we cannot
--     prove is gone);
--   * owned rows learn their uid, level and species from the box, and an
--     'arriving' one becomes 'held' - delivery completes by SAVING it, so a
--     client that crashes mid-merge is simply offered it again;
--   * a 'held' row missing from the box is 'released' (sold, converted,
--     starred) - reversible, it revives if it comes back.
-- A trainer who has never traded touches nothing (the fast path), and any
-- error lets the save through untouched.
create or replace function public.saves_reconcile_trades()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := new.user_id;
  box jsonb := new.data->'box';
begin
  if jsonb_typeof(box) is distinct from 'array' then return new; end if;
  if not exists (select 1 from public.mons where owner = me)
     and not exists (select 1 from public.trade_log where from_user = me) then
    return new;
  end if;

  if exists (select 1 from jsonb_array_elements(box) e
              join public.mons m on m.id::text = e->>'mid'
             where m.owner <> me) then
    box := coalesce((select jsonb_agg(e order by n)
                       from jsonb_array_elements(box) with ordinality x(e, n)
                      where not exists (select 1 from public.mons m
                                         where m.id::text = e->>'mid' and m.owner <> me)), '[]');
    new.data := jsonb_set(new.data, '{box}', box);
  end if;

  update public.mons m
     set local_uid = (e->>'uid')::int,
         level     = least(1000, greatest(1, (e->>'level')::int)),
         species   = (e->>'species')::int,
         status    = case when m.status in ('arriving','released') then 'held' else m.status end
    from jsonb_array_elements(box) e
   where m.owner = me and m.id::text = e->>'mid'
     and coalesce(e->>'uid', '') ~ '^\d{1,9}$'
     and coalesce(e->>'level', '') ~ '^\d{1,4}$'
     and coalesce(e->>'species', '') ~ '^\d{1,5}$';

  update public.mons m set status = 'released'
   where m.owner = me and m.status = 'held'
     and not exists (select 1 from jsonb_array_elements(box) e where e->>'mid' = m.id::text);
  return new;
exception when others then
  -- The collection outranks the trade: never fail the upload.
  return new;
end;
$$;

drop trigger if exists saves_reconcile_trades on public.saves;
create trigger saves_reconcile_trades
  before insert or update on public.saves
  for each row execute function public.saves_reconcile_trades();

-- ------------------------------------------------------------------ grants
revoke all on function public.register_mons(jsonb) from public, anon;
revoke all on function public.propose_trade(uuid, uuid[], uuid[], int) from public, anon;
revoke all on function public.answer_trade(uuid, boolean) from public, anon;
revoke all on function public.cancel_trade(uuid) from public, anon;
revoke all on function public.trade_inbox() from public, anon;
grant execute on function public.register_mons(jsonb) to authenticated;
grant execute on function public.propose_trade(uuid, uuid[], uuid[], int) to authenticated;
grant execute on function public.answer_trade(uuid, boolean) to authenticated;
grant execute on function public.cancel_trade(uuid) to authenticated;
grant execute on function public.trade_inbox() to authenticated;

-- =================================================================== PHASE 1
-- TRAINER CARDS AND FRIENDS (docs/trading.md). A card is the public face of a
-- trainer: readable by every signed-in player, written by nobody directly.
-- Its stats come from the save by trigger (a copy the client cannot bend),
-- its showcase is rebuilt from the STORED save (never from the request), and
-- its friend code is minted here.

create table if not exists public.trainer_cards (
  user_id     uuid primary key references auth.users on delete cascade,
  username    text not null,
  char        text not null default 'red',
  friend_code text not null unique,
  xp          int  not null default 0,        -- the client derives the level
  dex_count   int  not null default 0,
  variants    int  not null default 0,        -- tier marks registered, all tiers
  stars       int  not null default 0,
  trades      int  not null default 0,
  showcase    jsonb not null default '[]',    -- <= SHOWCASE snapshots, from the save
  seeking     int[] not null default '{}',    -- <= SEEKING species ids
  joined_at   timestamptz not null default now(),
  played_at   timestamptz
);
create index if not exists trainer_cards_name on public.trainer_cards (lower(username) text_pattern_ops);

alter table public.trainer_cards enable row level security;
drop policy if exists "cards are public to players" on public.trainer_cards;
create policy "cards are public to players" on public.trainer_cards for select
  to authenticated using (true);

-- Eight characters with nothing to misread aloud: no 0/O, no 1/I/L.
create or replace function public.new_friend_code()
returns text language plpgsql volatile set search_path = '' as $$
declare c text;
begin
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
      into c from generate_series(1, 8);
    exit when not exists (select 1 from public.trainer_cards where friend_code = c);
  end loop;
  return c;
end;
$$;
revoke all on function public.new_friend_code() from public, anon, authenticated;

-- Every profile has a card, and a rename or a new trainer sprite follows.
create or replace function public.profile_to_card()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trainer_cards (user_id, username, char, friend_code)
  values (new.user_id, new.username, new.char, public.new_friend_code())
  on conflict (user_id) do update set username = excluded.username, char = excluded.char;
  return new;
exception when others then
  return new;                    -- a card must never block a profile
end;
$$;
drop trigger if exists profile_to_card on public.profiles;
create trigger profile_to_card after insert or update of username, char on public.profiles
  for each row execute function public.profile_to_card();

-- A card's numbers, and its showcase kept honest, from a save document.
create or replace function public.card_stats(data jsonb, card public.trainer_cards)
returns public.trainer_cards language plpgsql stable set search_path = '' as $$
declare
  box jsonb := case when jsonb_typeof(data->'box') = 'array' then data->'box' else '[]' end;
begin
  card.xp := case when coalesce(data->>'xp', '') ~ '^\d{1,9}$' then (data->>'xp')::int else card.xp end;
  card.dex_count := case when jsonb_typeof(data->'dex') = 'array'
    then (select count(*) from jsonb_array_elements_text(data->'dex') d where d = '2') else card.dex_count end;
  card.variants := (select count(*)
    from unnest(array['showdown','shiny','astral','glitched','holo','origin','noir','vivid']) t,
         jsonb_array_elements_text(case when jsonb_typeof(data->t) = 'array' then data->t else '[]' end) v
   where v = '1');
  card.stars := case when jsonb_typeof(data->'stars') = 'array' then jsonb_array_length(data->'stars') else 0 end;
  -- A showcased Pokemon that left the box leaves the showcase; one that
  -- evolved or levelled shows as it is now.
  card.showcase := coalesce((
    select jsonb_agg(public.box_snapshot(e) order by s.n)
      from jsonb_array_elements(card.showcase) with ordinality s(v, n)
      join jsonb_array_elements(box) e on e->>'uid' = s.v->>'uid'), '[]');
  return card;
end;
$$;

-- A box entry as a card shows it - fields read off the stored save only.
create or replace function public.box_snapshot(e jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'uid', case when coalesce(e->>'uid', '') ~ '^\d{1,9}$' then (e->>'uid')::int end,
    'species', case when coalesce(e->>'species', '') ~ '^\d{1,5}$' then (e->>'species')::int end,
    'level', case when coalesce(e->>'level', '') ~ '^\d{1,4}$' then (e->>'level')::int end,
    'size', case when coalesce(e->>'size', '') ~ '^\d{1,4}$' then (e->>'size')::int end,
    'tier', (select t from unnest(array['showdown','shiny','astral','glitched','holo','origin','noir','vivid']) t
              where e->>t = '1' limit 1),
    'alpha', coalesce(e->>'alpha' = '1', false))
$$;

create or replace function public.saves_to_card()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.trainer_cards;
begin
  select * into c from public.trainer_cards where user_id = new.user_id;
  if not found then return new; end if;
  c := public.card_stats(new.data, c);
  update public.trainer_cards set xp = c.xp, dex_count = c.dex_count, variants = c.variants,
    stars = c.stars, showcase = c.showcase, played_at = now()
   where user_id = new.user_id;
  return new;
exception when others then
  return new;                    -- the collection outranks the card
end;
$$;
drop trigger if exists saves_to_card on public.saves;
create trigger saves_to_card after insert or update on public.saves
  for each row execute function public.saves_to_card();

-- BACKFILL, once and harmlessly again: every existing trainer gets a card.
insert into public.trainer_cards (user_id, username, char, friend_code)
select p.user_id, p.username, p.char, public.new_friend_code()
  from public.profiles p
 where not exists (select 1 from public.trainer_cards c where c.user_id = p.user_id);
update public.trainer_cards c set
  xp = (s.st).xp, dex_count = (s.st).dex_count, variants = (s.st).variants, stars = (s.st).stars
  from (select c2.user_id as uid, public.card_stats(sv.data, c2) as st
          from public.trainer_cards c2 join public.saves sv on sv.user_id = c2.user_id) s
 where s.uid = c.user_id and c.played_at is null;

-- The one thing a trainer writes: which Pokemon to show, which to look for.
-- Showcase entries are box uids; each is looked up in the STORED save and
-- snapshotted from there. Unknown uids are skipped, extras are cut.
create or replace function public.update_card(showcase int[], seeking int[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  box jsonb;
  shown jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  select case when jsonb_typeof(data->'box') = 'array' then data->'box' else '[]' end
    into box from public.saves where user_id = me;
  -- Known, first mention of each, in the order asked - THEN the cap, so an
  -- unknown uid or a repeat never spends a slot.
  select coalesce(jsonb_agg(z.snap order by z.n), '[]') into shown from (
    select public.box_snapshot(e) as snap, u.n
      from (select distinct on (v) v, n from unnest(coalesce(update_card.showcase, '{}')) with ordinality x(v, n) order by v, n) u
      join jsonb_array_elements(coalesce(box, '[]')) e on e->>'uid' = u.v::text
     order by u.n limit public.trade_limit('SHOWCASE')) z;
  update public.trainer_cards set
    showcase = shown,
    seeking = (coalesce((select array_agg(distinct s) from unnest(coalesce(update_card.seeking, '{}')) s
                          where s between 1 and 20000), '{}'))[1:public.trade_limit('SEEKING')]
   where user_id = me;
  return (select to_jsonb(c) from public.trainer_cards c where c.user_id = me);
end;
$$;

-- By name prefix, case-insensitively, on the index; never yourself.
create or replace function public.find_trainers(q text)
returns setof public.trainer_cards language sql stable security definer set search_path = '' as $$
  select * from public.trainer_cards
   where auth.uid() is not null and user_id <> auth.uid()
     and lower(username) like lower(regexp_replace(btrim(coalesce(q, '')), '([%_\\])', '\\\1', 'g')) || '%'
     and length(btrim(coalesce(q, ''))) >= 2
   order by lower(username) limit 20
$$;

-- ------------------------------------------------------------------ friends
create table if not exists public.friends (
  a          uuid not null references auth.users on delete cascade,   -- who asked
  b          uuid not null references auth.users on delete cascade,   -- who was asked
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a <> b)
);
-- One row per PAIR, whichever way round it was asked.
create unique index if not exists friends_pair on public.friends (least(a, b), greatest(a, b));
alter table public.friends enable row level security;
drop policy if exists "read own friends" on public.friends;
create policy "read own friends" on public.friends for select using (auth.uid() in (a, b));

-- Answers: 'sent', 'friends' (they had asked you first), 'already', 'self',
-- 'unknown', 'full'.
create or replace function public.add_friend(code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  them uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select user_id into them from public.trainer_cards where friend_code = upper(btrim(coalesce(code, '')));
  if them is null then return 'unknown'; end if;
  if them = me then return 'self'; end if;
  if exists (select 1 from public.friends where a = them and b = me and status = 'pending') then
    update public.friends set status = 'accepted' where a = them and b = me;
    return 'friends';
  end if;
  if exists (select 1 from public.friends where least(a, b) = least(me, them) and greatest(a, b) = greatest(me, them)) then
    return 'already';
  end if;
  if (select count(*) from public.friends where me in (a, b)) >= public.trade_limit('FRIENDS') then
    return 'full';
  end if;
  insert into public.friends (a, b) values (me, them);
  return 'sent';
end;
$$;

create or replace function public.answer_friend(other uuid, yes boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if yes then
    update public.friends set status = 'accepted' where a = other and b = auth.uid() and status = 'pending';
  else
    delete from public.friends where a = other and b = auth.uid() and status = 'pending';
  end if;
  return found;
end;
$$;

create or replace function public.remove_friend(other uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friends where (a = auth.uid() and b = other) or (a = other and b = auth.uid());
  return found;
end;
$$;

-- Your friends and requests, each with the other trainer's card.
create or replace function public.my_friends()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'status', f.status, 'incoming', f.b = auth.uid() and f.status = 'pending',
           'card', to_jsonb(c)) order by f.status, lower(c.username)), '[]')
    from public.friends f
    join public.trainer_cards c on c.user_id = case when f.a = auth.uid() then f.b else f.a end
   where auth.uid() in (f.a, f.b)
$$;

revoke all on function public.update_card(int[], int[]) from public, anon;
revoke all on function public.find_trainers(text) from public, anon;
revoke all on function public.add_friend(text) from public, anon;
revoke all on function public.answer_friend(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.update_card(int[], int[]) to authenticated;
grant execute on function public.find_trainers(text) to authenticated;
grant execute on function public.add_friend(text) to authenticated;
grant execute on function public.answer_friend(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.my_friends() to authenticated;
