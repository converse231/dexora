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
    when 'MAX_SIDE' then 6
    when 'SHOWCASE' then 6
    when 'SEEKING' then 12
    when 'FRIENDS' then 100
    when 'SHELF' then 12
  end
$$;

-- A mon as a trainer is shown it.
create or replace function public.mon_json(m public.mons)
returns jsonb language sql stable set search_path = '' as $$
  -- `uid` is the owner's box slot (null in transit): how a client that just
  -- had rows registered for it (set_shelf) learns which entry got which id.
  select jsonb_build_object('mid', m.id, 'uid', m.local_uid, 'species', m.species, 'level', m.level,
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
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  return public.register_for(auth.uid(), snaps);
end;
$$;

-- THE BODY, for any owner: yourself (`register_mons`), or a FRIEND whose box
-- entry you ask for (`propose_trade`'s `want_uids`) - the server reads their
-- stored save exactly as it reads yours. Not callable from outside.
create or replace function public.register_for(me uuid, snaps jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
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
revoke all on function public.register_for(uuid, jsonb) from public, anon, authenticated;

-- YOU KEEP THE LAST OF EACH SPECIES, counted over a WHOLE move: does `who`'s
-- STORED box still hold one of every species after `species` (a list, one
-- entry per Pokemon moving) leaves? Checked per Pokemon, three Meowth each
-- looked spare and an offer of all three left none (phase 6).
create or replace function public.leaves_one(who uuid, species int[])
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from (select s, count(*) k from unnest(coalesce(species, '{}')) s group by s) w
     where w.k >= (select count(*) from public.saves sv,
                     jsonb_array_elements(case when jsonb_typeof(sv.data->'box') = 'array' then sv.data->'box' else '[]' end) e
                    where sv.user_id = who and e->>'species' = w.s::text))
$$;
revoke all on function public.leaves_one(uuid, int[]) from public, anon, authenticated;

-- ------------------------------------------------------------------ offers
-- PROPOSE. Your side stays 'held': one Pokemon may sit in SEVERAL open offers
-- (DelugeRPG's way, decided in docs/trading.md) - the first to be accepted
-- takes it and `perform_swap` fails the rest. The client still locks it
-- against selling while any offer holds it (the inbox reports 'offered').
--
-- WHAT YOU MAY ASK FOR: anything on the other trainer's SHELF; and from a
-- FRIEND, any spare in their box - by server id if it has one (`want`) or by
-- box uid (`want_uids`), read off their STORED save and registered for them
-- here. Never the last of a species, never one their game has locked.
drop function if exists public.propose_trade(uuid, uuid[], uuid[], int);
create or replace function public.propose_trade(target uuid, give uuid[], want uuid[],
                                                msg int default null, want_uids int[] default '{}')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t uuid;
  friend boolean;
  box jsonb;
  snaps jsonb;
  extra uuid[] := '{}';
  wanted uuid[];
  uids int[] := array(select distinct u from unnest(coalesce(want_uids, '{}')) u);
begin
  if me is null then raise exception 'not signed in'; end if;
  if target is null or target = me or public.blocked_between(me, target) then raise exception 'no such trainer'; end if;
  give := array(select distinct g from unnest(coalesce(give, '{}')) g);
  want := array(select distinct w from unnest(coalesce(want, '{}')) w);
  friend := public.are_friends(me, target);
  if cardinality(uids) > 0 and not friend then
    raise exception 'only a friend''s box can be asked for';
  end if;
  if cardinality(give) not between 1 and public.trade_limit('MAX_SIDE')
     or cardinality(want) + cardinality(uids) not between 1 and public.trade_limit('MAX_SIDE') then
    raise exception 'one to six on each side';
  end if;
  if (select count(*) from public.trades where a = me and status = 'open')
     >= public.trade_limit('OPEN_OFFERS') then
    raise exception 'too many open offers';
  end if;
  if (select count(*) from public.mons where id = any(give) and owner = me and status = 'held')
     <> cardinality(give) then
    raise exception 'offered Pokemon are not free to trade';
  end if;
  if not public.leaves_one(me, array(select species from public.mons where id = any(give))) then
    raise exception 'you keep the last of each species';
  end if;
  if (select count(*) from public.mons where id = any(want) and owner = target and status = 'held'
                                         and (shelf or friend)) <> cardinality(want) then
    raise exception 'asked-for Pokemon are not available';
  end if;
  if cardinality(uids) > 0 then
    select case when jsonb_typeof(data->'box') = 'array' then data->'box' else '[]' end
      into box from public.saves where user_id = target;
    select coalesce(jsonb_agg(jsonb_build_object('uid', (z.e->>'uid')::int, 'species', (z.e->>'species')::int,
                                                 'level', (z.e->>'level')::int)), '[]')
      into snaps
      from (select e, count(*) over (partition by e->>'species') n
              from jsonb_array_elements(coalesce(box, '[]')) e
             where coalesce(e->>'uid', '') ~ '^\d{1,9}$' and coalesce(e->>'species', '') ~ '^\d{1,5}$'
               and coalesce(e->>'level', '') ~ '^\d{1,4}$') z
     where (z.e->>'uid')::int = any(uids) and z.n > 1 and not (z.e ? 'lock');
    if jsonb_array_length(snaps) <> cardinality(uids) then
      raise exception 'asked-for Pokemon are not available';
    end if;
    perform public.register_for(target, snaps);
    extra := array(select m.id from public.mons m
                    where m.owner = target and m.status = 'held' and m.local_uid = any(uids));
    if cardinality(extra) <> cardinality(uids) then
      raise exception 'asked-for Pokemon are not available';
    end if;
  end if;
  wanted := array(select distinct x from unnest(want || extra) x);
  if cardinality(wanted) > public.trade_limit('MAX_SIDE') then
    raise exception 'one to six on each side';
  end if;
  if not public.leaves_one(target, array(select species from public.mons where id = any(wanted))) then
    raise exception 'they keep the last of each species';
  end if;
  insert into public.trades (kind, a, b, a_mons, b_mons, msg)
  values ('direct', me, target, give, wanted, msg)
  returning id into t;
  return t;
end;
$$;

-- Free the proposer's side of a trade that did not happen. Only 'offered',
-- which offers no longer set (phase 6) but older rows may carry: a Pokemon in
-- an offer can since have been LISTED or POOLED, and closing the offer must
-- not pull it off the board or out of the pool.
create or replace function public.trade_release(tr public.trades)
returns void language sql security definer set search_path = '' as $$
  update public.mons set status = 'held'
   where id = any(tr.a_mons) and owner = tr.a and status = 'offered';
$$;
revoke all on function public.trade_release(public.trades) from public, anon, authenticated;

-- THE MOVE ITSELF, shared by every kind of trade: log both sides, swap the
-- owners, close this trade, count it on both cards - and fail every other
-- open offer that named one of these Pokemon, FREEING what its proposer had
-- locked (phase 0 failed them and left the proposer's side 'offered' for good).
-- Callers hold the row locks; this does no checking of its own.
create or replace function public.perform_swap(tr public.trades, taker uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[] := tr.a_mons || tr.b_mons;
  other public.trades;
begin
  insert into public.trade_log (trade, mon, from_user, to_user, snapshot)
  select tr.id, m.id, m.owner, case when m.owner = tr.a then taker else tr.a end, public.mon_json(m)
    from public.mons m where m.id = any(ids);
  update public.mons
     set owner = case when owner = tr.a then taker else tr.a end,
         status = 'arriving', local_uid = null, traded = traded + 1, moved_at = now(),
         shelf = false
   where id = any(ids);
  update public.trades set b = taker, status = 'done', closed_at = now() where id = tr.id;
  if to_regclass('public.trainer_cards') is not null then
    update public.trainer_cards set trades = trades + 1 where user_id in (tr.a, taker);
  end if;
  for other in select * from public.trades
                where status = 'open' and id <> tr.id and (b_mons && ids or a_mons && ids)
                for update loop
    update public.trades set status = 'failed', closed_at = now() where id = other.id;
    perform public.trade_release(other);
  end loop;
end;
$$;
revoke all on function public.perform_swap(public.trades, uuid) from public, anon, authenticated;

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

  -- YOUR SAVE MUST KNOW WHAT IT IS GIVING. A friend's ask registers your box
  -- entry here, on the server; until your game has written that id onto the
  -- entry and uploaded it, a swap would leave the old copy in your box with
  -- nothing to strip it by. 'sync' tells the client to reconcile, flush and
  -- ask again - nothing is closed.
  if exists (select 1 from unnest(tr.b_mons) bm
              where not exists (select 1 from public.saves sv,
                                  jsonb_array_elements(case when jsonb_typeof(sv.data->'box') = 'array'
                                                            then sv.data->'box' else '[]' end) e
                                 where sv.user_id = me and e->>'mid' = bm::text)) then
    return 'sync';
  end if;

  ids := tr.a_mons || tr.b_mons;
  perform 1 from public.mons where id = any(ids) order by id for update;
  if (select count(*) from public.mons where id = any(tr.a_mons) and owner = tr.a and status in ('held', 'offered'))
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

  perform public.perform_swap(tr, me);
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
-- Everything the client needs, in one round trip: `arrived`, `locks` and
-- `gone` are exactly what `reconcileTrades` takes (via `inboxToReconcile`);
-- `recent` is the last trades with what each side gave, for the trade scene;
-- `pool` and `surprise_left` feed the Surprise tab. Expires the caller's stale
-- offers and pool deposits on the way (a lazy sweep: no cron to forget).
create or replace function public.trade_inbox()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  tr public.trades;
  day timestamptz := date_trunc('day', now());
  stale interval := make_interval(days => public.trade_limit('LISTING_DAYS'));
begin
  if me is null then raise exception 'not signed in'; end if;
  for tr in select * from public.trades
             where a = me and status = 'open' and created_at < now() - stale
             for update loop
    update public.trades set status = 'expired', closed_at = now() where id = tr.id;
    perform public.trade_release(tr);
  end loop;
  if to_regclass('public.listings') is not null then
    update public.mons set status = 'held'
     where id in (select unnest(mon || bundle) from public.listings
                   where owner = me and status = 'open' and created_at < now() - stale)
       and owner = me and status = 'listed';
    update public.listings set status = 'expired', closed_at = now()
     where owner = me and status = 'open' and created_at < now() - stale;
  end if;
  if to_regclass('public.surprise_pool') is not null then
    update public.mons set status = 'held'
     where id in (select mon from public.surprise_pool where owner = me and deposited_at < now() - stale)
       and owner = me and status = 'pooled';
    delete from public.surprise_pool where owner = me and deposited_at < now() - stale;
  end if;
  return jsonb_build_object(
    'arrived', coalesce((select jsonb_agg(public.mon_json(m)) from public.mons m
                          where m.owner = me and m.status = 'arriving'), '[]'),
    -- A 'held' Pokemon in one of your open offers reads 'offered': the game
    -- keeps it from being sold while any offer holds it.
    'locks',   coalesce((select jsonb_object_agg(m.id, case when m.status = 'held' and exists (
                            select 1 from public.trades t where t.a = me and t.status = 'open' and m.id = any(t.a_mons))
                          then 'offered' else m.status end) from public.mons m
                          where m.owner = me and m.status in ('held','offered','listed','pooled')), '{}'),
    -- Which box entry each of your rows is: how your game learns the id of a
    -- Pokemon a FRIEND asked for, which the server registered, not you.
    'assign',  coalesce((select jsonb_object_agg(m.local_uid, m.id) from public.mons m
                          where m.owner = me and m.local_uid is not null and m.status <> 'released'), '{}'),
    'gone',    coalesce((select jsonb_agg(distinct l.mon) from public.trade_log l
                          where l.from_user = me
                            and not exists (select 1 from public.mons x where x.id = l.mon and x.owner = me)), '[]'),
    'open',    coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'mine', t.a = me,
                          'a', t.a, 'b', t.b, 'msg', t.msg, 'at', t.created_at,
                          'partner', (select c.username from public.trainer_cards c
                                       where c.user_id = case when t.a = me then t.b else t.a end),
                          'give', (select jsonb_agg(public.mon_json(m)) from public.mons m where m.id = any(t.a_mons)),
                          'want', (select jsonb_agg(public.mon_json(m)) from public.mons m where m.id = any(t.b_mons))))
                          from public.trades t where me in (t.a, t.b) and t.status = 'open'), '[]'),
    'recent',  coalesce((select jsonb_agg(r order by r->>'at' desc) from (
                          select jsonb_build_object('id', t.id, 'kind', t.kind, 'at', t.closed_at,
                            'partner', (select c.username from public.trainer_cards c
                                         where c.user_id = case when t.a = me then t.b else t.a end),
                            'gave', (select coalesce(jsonb_agg(l.snapshot), '[]') from public.trade_log l
                                      where l.trade = t.id and l.from_user = me),
                            'got',  (select coalesce(jsonb_agg(l.snapshot), '[]') from public.trade_log l
                                      where l.trade = t.id and l.to_user = me)) r
                            from public.trades t
                           where me in (t.a, t.b) and t.status = 'done'
                           order by t.closed_at desc limit 10) x), '[]'),
    'pool',    case when to_regclass('public.surprise_pool') is null then '[]'::jsonb else
                 coalesce((select jsonb_agg(jsonb_build_object('mid', p.mon, 'at', p.deposited_at))
                             from public.surprise_pool p where p.owner = me), '[]') end,
    'listings', case when to_regclass('public.listings') is null then '[]'::jsonb else
                 coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.created_at,
                            'want_species', l.want_species, 'want_tier', l.want_tier,
                            'mon', (select public.mon_json(m) from public.mons m where m.id = l.mon),
                            'mons', (select jsonb_agg(public.mon_json(m) order by array_position(l.mon || l.bundle, m.id))
                                       from public.mons m where m.id = any(l.mon || l.bundle))) order by l.created_at desc)
                             from public.listings l where l.owner = me and l.status = 'open'), '[]') end,
    'friend_requests', (select count(*)::int from public.friends where b = me and status = 'pending'),
    'surprise_left', case when to_regclass('public.surprise_log') is null then 0 else
                 greatest(0, public.trade_limit('SURPRISE_PER_DAY')
                   - (select count(*)::int from public.surprise_log where owner = me and at >= day)) end
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

  -- GONE BY ID, OR BY WHAT IT WAS. An entry carrying an id someone else owns
  -- is a stale copy. So is one with NO id whose box uid and species match
  -- something this trainer traded away (the log's snapshot holds both) - a
  -- device that never learned the id must not keep the Pokemon. Uids are
  -- never reused in a save, and the species check makes a mix-up impossible.
  if exists (select 1 from jsonb_array_elements(box) e
              where exists (select 1 from public.mons m where m.id::text = e->>'mid' and m.owner <> me)
                 or (not (e ? 'mid') and exists (
                       select 1 from public.trade_log l join public.mons m on m.id = l.mon
                        where l.from_user = me and m.owner <> me
                          and l.snapshot->>'uid' = e->>'uid' and l.snapshot->>'species' = e->>'species'))) then
    box := coalesce((select jsonb_agg(e order by n)
                       from jsonb_array_elements(box) with ordinality x(e, n)
                      where not exists (select 1 from public.mons m
                                         where m.id::text = e->>'mid' and m.owner <> me)
                        and not (not (e ? 'mid') and exists (
                              select 1 from public.trade_log l join public.mons m on m.id = l.mon
                               where l.from_user = me and m.owner <> me
                                 and l.snapshot->>'uid' = e->>'uid' and l.snapshot->>'species' = e->>'species'))), '[]');
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

  -- Still in the box by its id - or, for an entry whose game has not learned
  -- the id yet (a friend asked for it, so the SERVER registered it), by its
  -- box uid and species. Without the second half every upload before that
  -- game synced released the Pokemon, and the offer could never be accepted.
  update public.mons m set status = 'released'
   where m.owner = me and m.status = 'held'
     and not exists (select 1 from jsonb_array_elements(box) e
                      where e->>'mid' = m.id::text
                         or (not (e ? 'mid') and e->>'uid' = m.local_uid::text
                             and e->>'species' = m.species::text));
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
revoke all on function public.propose_trade(uuid, uuid[], uuid[], int, int[]) from public, anon;
revoke all on function public.answer_trade(uuid, boolean) from public, anon;
revoke all on function public.cancel_trade(uuid) from public, anon;
revoke all on function public.trade_inbox() from public, anon;
grant execute on function public.register_mons(jsonb) to authenticated;
grant execute on function public.propose_trade(uuid, uuid[], uuid[], int, int[]) to authenticated;
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
-- ...but not the friend code (phase 5: every code was readable, so anybody
-- could collect them and spam requests). RLS picks rows, not columns, so the
-- code is withheld by column grant; yours comes from `my_card()`. A new
-- column is unreadable until it is added here.
revoke select on public.trainer_cards from anon, authenticated;
grant select (user_id, username, char, xp, dex_count, variants, stars, trades,
              showcase, seeking, joined_at, played_at)
  on public.trainer_cards to authenticated;

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

-- BLOCKS (phase 5) are defined here because every read below skips them, and
-- a SQL function is checked against what exists when it is created. A block
-- works both ways and says nothing.
create table if not exists public.blocks (
  blocker    uuid not null references auth.users on delete cascade,
  blocked    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked on public.blocks (blocked);
alter table public.blocks enable row level security;
drop policy if exists "read own blocks" on public.blocks;
create policy "read own blocks" on public.blocks for select using (auth.uid() = blocker);

create or replace function public.blocked_between(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks
                  where (blocker = x and blocked = y) or (blocker = y and blocked = x))
$$;
revoke all on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- A card as another player sees it: everything but the friend code, which is
-- yours to hand out (phase 5: codes were readable by everybody, so anyone could
-- collect them and spam requests).
create or replace function public.public_card(c public.trainer_cards)
returns jsonb language sql stable set search_path = '' as $$
  select to_jsonb(c) - 'friend_code'
$$;

-- By name prefix, case-insensitively, on the index; never yourself, never
-- anybody on either side of a block.
drop function if exists public.find_trainers(text);
create or replace function public.find_trainers(q text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.public_card(c) order by lower(c.username)), '[]') from (
    select * from public.trainer_cards
     where auth.uid() is not null and user_id <> auth.uid()
       and lower(username) like lower(regexp_replace(btrim(coalesce(q, '')), '([%_\\])', '\\\1', 'g')) || '%'
       and length(btrim(coalesce(q, ''))) >= 2
       and not public.blocked_between(auth.uid(), user_id)
     order by lower(username) limit 20) c
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
-- The asked side: the inbox counts pending requests on every poll (phase 5).
create index if not exists friends_b on public.friends (b, status);
alter table public.friends enable row level security;
drop policy if exists "read own friends" on public.friends;
create policy "read own friends" on public.friends for select using (auth.uid() in (a, b));

-- Answers: 'sent', 'friends' (they had asked you first), 'already', 'self',
-- 'unknown', 'full'. By code (typed in) or by trainer (a profile's button);
-- one body. A block on either side reads as 'unknown' - it says nothing.
create or replace function public.add_friend(code text)
returns text language plpgsql security definer set search_path = '' as $$
declare them uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select user_id into them from public.trainer_cards where friend_code = upper(btrim(coalesce(code, '')));
  return public.befriend(them);
end;
$$;

create or replace function public.request_friend(other uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  return public.befriend(other);
end;
$$;

create or replace function public.befriend(them uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if them is null or not exists (select 1 from public.trainer_cards where user_id = them)
     or public.blocked_between(me, them) then
    return 'unknown';
  end if;
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
revoke all on function public.befriend(uuid) from public, anon, authenticated;

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
           'card', public.public_card(c)) order by f.status, lower(c.username)), '[]')
    from public.friends f
    join public.trainer_cards c on c.user_id = case when f.a = auth.uid() then f.b else f.a end
   where auth.uid() in (f.a, f.b)
$$;

-- Your own card, code and all - the only way a code leaves the server.
create or replace function public.my_card()
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) from public.trainer_cards c where c.user_id = auth.uid()
$$;

-- A card by name, as a player sees it (a shared link) - not across a block.
create or replace function public.card_by_name(name text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.public_card(c) from public.trainer_cards c
   where auth.uid() is not null and lower(c.username) = lower(btrim(coalesce(name, '')))
     and not public.blocked_between(auth.uid(), c.user_id)
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

-- =================================================================== PHASE 2
-- SURPRISE TRADE (docs/trading.md): put one in, get one back, no idea what -
-- and only from a FRIEND (the trust decision). A deposit matches the oldest
-- waiting friend's at once, or waits up to LISTING_DAYS and then comes home.

create table if not exists public.surprise_pool (
  mon          uuid primary key references public.mons on delete cascade,
  owner        uuid not null references auth.users on delete cascade,
  deposited_at timestamptz not null default now()
);
create index if not exists surprise_pool_at on public.surprise_pool (deposited_at);
create index if not exists surprise_pool_owner on public.surprise_pool (owner);
alter table public.surprise_pool enable row level security;
drop policy if exists "read own pool" on public.surprise_pool;
create policy "read own pool" on public.surprise_pool for select using (auth.uid() = owner);

-- One row per deposit: what the daily cap counts. Nobody reads it but here.
create table if not exists public.surprise_log (
  owner uuid not null references auth.users on delete cascade,
  at    timestamptz not null default now()
);
create index if not exists surprise_log_owner on public.surprise_log (owner, at);
alter table public.surprise_log enable row level security;

-- Answers {status: 'matched', trade, got, from} | {status: 'waiting'} |
-- {status: 'unavailable' | 'capped'}.
create or replace function public.surprise_deposit(mid uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  day timestamptz := date_trunc('day', now());
  pick record;
  tr public.trades;
begin
  if me is null then raise exception 'not signed in'; end if;
  perform 1 from public.mons where id = mid for update;
  if not exists (select 1 from public.mons where id = mid and owner = me and status = 'held') then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if (select count(*) from public.surprise_log where owner = me and at >= day)
       >= public.trade_limit('SURPRISE_PER_DAY')
     or (select count(*) from public.trades where status = 'done' and closed_at >= day and me in (a, b))
       >= public.trade_limit('TRADES_PER_DAY') then
    return jsonb_build_object('status', 'capped');
  end if;
  insert into public.surprise_log (owner) values (me);

  -- The oldest waiting deposit from a friend who can still trade today. SKIP
  -- LOCKED: two friends depositing at once each take a different one, never
  -- the same one twice.
  select sp.mon, sp.owner into pick
    from public.surprise_pool sp
    join public.friends f on f.status = 'accepted'
     and ((f.a = me and f.b = sp.owner) or (f.b = me and f.a = sp.owner))
   where sp.owner <> me
     and (select count(*) from public.trades t
           where t.status = 'done' and t.closed_at >= day and sp.owner in (t.a, t.b))
         < public.trade_limit('TRADES_PER_DAY')
   order by sp.deposited_at
   limit 1
   for update of sp skip locked;

  if pick.mon is not null then
    perform 1 from public.mons where id in (pick.mon, mid) order by id for update;
    if exists (select 1 from public.mons where id = pick.mon and owner = pick.owner and status = 'pooled') then
      delete from public.surprise_pool where mon = pick.mon;
      insert into public.trades (kind, a, b, a_mons, b_mons, status)
      values ('surprise', pick.owner, me, array[pick.mon], array[mid], 'open')
      returning * into tr;
      perform public.perform_swap(tr, me);
      return jsonb_build_object('status', 'matched', 'trade', tr.id,
        'got', (select public.mon_json(x) from public.mons x where x.id = pick.mon),
        'from', (select c.username from public.trainer_cards c where c.user_id = pick.owner));
    end if;
    delete from public.surprise_pool where mon = pick.mon;       -- a stale row: drop it
  end if;

  update public.mons set status = 'pooled' where id = mid;
  insert into public.surprise_pool (mon, owner) values (mid, me);
  return jsonb_build_object('status', 'waiting');
end;
$$;

create or replace function public.surprise_withdraw(mid uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.surprise_pool where mon = mid and owner = auth.uid();
  if not found then return false; end if;
  update public.mons set status = 'held' where id = mid and owner = auth.uid() and status = 'pooled';
  return true;
end;
$$;

revoke all on function public.surprise_deposit(uuid) from public, anon;
revoke all on function public.surprise_withdraw(uuid) from public, anon;
grant execute on function public.surprise_deposit(uuid) to authenticated;
grant execute on function public.surprise_withdraw(uuid) to authenticated;

-- =================================================================== PHASE 3
-- DIRECT OFFERS (docs/trading.md). Proposing, answering and cancelling were
-- built and tested in phase 0; what phase 3 adds is the SHELF - the Pokemon a
-- trainer puts up for trade, shown on their profile. An offer can only ask for
-- what is on it, so nobody is badgered for a Pokemon they never offered.

alter table public.mons add column if not exists shelf boolean not null default false;
create index if not exists mons_shelf on public.mons (owner) where shelf;

-- Your shelf, replaced whole: box uids, each read off your STORED save and
-- registered if it is not yet (the phase 0 rules: the uid must be there, the
-- entry must not already carry an id). Unknown uids are skipped, the cap cuts.
-- Returns the shelf as it now stands.
create or replace function public.set_shelf(uids int[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  box jsonb;
  snaps jsonb;
  kept uuid[];
begin
  if me is null then raise exception 'not signed in'; end if;
  select case when jsonb_typeof(data->'box') = 'array' then data->'box' else '[]' end
    into box from public.saves where user_id = me;
  -- The first SHELF distinct uids that the stored box really holds.
  select coalesce(jsonb_agg(jsonb_build_object('uid', z.u, 'species', (z.e->>'species')::int,
                                               'level', (z.e->>'level')::int) order by z.n), '[]')
    into snaps
    from (select u.v as u, u.n, e
            from (select distinct on (v) v, n from unnest(coalesce(uids, '{}')) with ordinality x(v, n) order by v, n) u
            join jsonb_array_elements(box) e on e->>'uid' = u.v::text
           where coalesce(e->>'species', '') ~ '^\d{1,5}$' and coalesce(e->>'level', '') ~ '^\d{1,4}$'
           order by u.n limit public.trade_limit('SHELF')) z;
  -- Entries already carrying an id are registered rows of ours: find them by uid.
  perform public.register_mons(snaps);
  select coalesce(array_agg(m.id), '{}') into kept
    from public.mons m
   where m.owner = me and m.status <> 'released'
     and m.local_uid in (select (x->>'uid')::int from jsonb_array_elements(snaps) x);
  update public.mons set shelf = (id = any(kept)) where owner = me and (shelf or id = any(kept));
  return coalesce((select jsonb_agg(public.mon_json(m)) from public.mons m
                    where m.owner = me and m.shelf), '[]');
end;
$$;

-- Anybody's shelf, as a player sees it: only what is up for trade and free.
create or replace function public.trainer_shelf(who uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then '[]'::jsonb else
    coalesce((select jsonb_agg(public.mon_json(m) order by m.species, m.level desc)
                from public.mons m
               where m.owner = who and m.shelf and m.status = 'held'
                 and not public.blocked_between(auth.uid(), who)), '[]') end
$$;

revoke all on function public.set_shelf(int[]) from public, anon;
revoke all on function public.trainer_shelf(uuid) from public, anon;
grant execute on function public.set_shelf(int[]) to authenticated;
grant execute on function public.trainer_shelf(uuid) to authenticated;

-- =================================================================== PHASE 4
-- THE TRADE BOARD (docs/trading.md): "offering this, looking for that",
-- between FRIENDS (the trust decision). A listing is one Pokemon and what its
-- owner wants for it - a species, and optionally one tier. Anybody whose box
-- fits completes it in one step; there is nothing to negotiate.

create table if not exists public.listings (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users on delete cascade,
  mon          uuid not null references public.mons on delete cascade,
  want_species int  not null check (want_species between 1 and 20000),
  -- null: any form of that species. Otherwise exactly this tier.
  want_tier    text check (want_tier in ('showdown','shiny','astral','glitched','holo','origin','noir','vivid')),
  status       text not null default 'open' check (status in ('open','done','withdrawn','expired')),
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index if not exists listings_open on public.listings (status, created_at desc);
create index if not exists listings_owner on public.listings (owner, status);
-- One open listing per Pokemon, whatever the client sends.
create unique index if not exists listings_one_open on public.listings (mon) where status = 'open';
alter table public.listings enable row level security;
drop policy if exists "read own listings" on public.listings;
create policy "read own listings" on public.listings for select using (auth.uid() = owner);

create or replace function public.are_friends(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friends
                  where status = 'accepted' and ((a = x and b = y) or (a = y and b = x)))
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- A LISTING IS A BUNDLE (phase 6): up to MAX_SIDE of yours for one Pokemon
-- you want. `mon` is the first, `bundle` the rest; everything that frees or
-- moves a listing reads `mon || bundle`.
alter table public.listings add column if not exists bundle uuid[] not null default '{}';

-- Answers the new listing's id; raises with a reason a player can read.
drop function if exists public.post_listing(uuid, int, text);
create or replace function public.post_listing(mids uuid[], want_species int, want_tier text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  -- Each once, in the order picked: the first leads the listing.
  ids uuid[] := array(select x from unnest(coalesce(mids, '{}')) with ordinality u(x, n)
                       group by x order by min(n));
begin
  if me is null then raise exception 'not signed in'; end if;
  if want_species is null or want_species not between 1 and 20000 then raise exception 'pick what you want for it'; end if;
  if cardinality(ids) not between 1 and public.trade_limit('MAX_SIDE') then raise exception 'one to six Pokemon'; end if;
  if (select count(*) from public.listings where owner = me and status = 'open')
     >= public.trade_limit('OPEN_LISTINGS') then
    raise exception 'too many listings - take one down first';
  end if;
  perform 1 from public.mons where id = any(ids) order by id for update;
  if (select count(*) from public.mons where id = any(ids) and owner = me and status = 'held') <> cardinality(ids) then
    raise exception 'that Pokemon is not free to list';
  end if;
  if not public.leaves_one(me, array(select species from public.mons where id = any(ids))) then
    raise exception 'you keep the last of each species';
  end if;
  update public.mons set status = 'listed', shelf = false where id = any(ids);
  insert into public.listings (owner, mon, bundle, want_species, want_tier)
  values (me, ids[1], ids[2:], post_listing.want_species, nullif(post_listing.want_tier, ''))
  returning listings.id into new_id;
  return new_id;
end;
$$;

create or replace function public.withdraw_listing(lid uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.listings;
begin
  select * into l from public.listings where id = lid for update;
  if not found or l.owner is distinct from auth.uid() or l.status <> 'open' then return false; end if;
  update public.listings set status = 'withdrawn', closed_at = now() where id = lid;
  update public.mons set status = 'held' where id = any(l.mon || l.bundle) and owner = l.owner and status = 'listed';
  return true;
end;
$$;

-- What your friends (and you) have up, newest first; `q` narrows it to a
-- species, whether offered or wanted.
create or replace function public.trade_board(q int default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then '[]'::jsonb else
    coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('id', l.id, 'at', l.created_at, 'mine', l.owner = auth.uid(),
               'owner', c.username, 'want_species', l.want_species, 'want_tier', l.want_tier,
               'mon', public.mon_json(m),
               'mons', (select jsonb_agg(public.mon_json(x) order by array_position(l.mon || l.bundle, x.id))
                          from public.mons x where x.id = any(l.mon || l.bundle))) x
        from public.listings l
        join public.mons m on m.id = l.mon and m.status = 'listed' and m.owner = l.owner
        join public.trainer_cards c on c.user_id = l.owner
       where l.status = 'open'
         and (l.owner = auth.uid() or public.are_friends(auth.uid(), l.owner))
         and (q is null or l.want_species = q
              or exists (select 1 from public.mons x where x.id = any(l.mon || l.bundle) and x.species = q))
       order by l.created_at desc
       limit 60) z), '[]') end
$$;

-- COMPLETE A LISTING with one of yours that fits. Everything re-checked with
-- the rows locked; a second taker finds it gone. Answers
-- {status: 'done', trade, got, from} or {status: 'gone' | 'unfit' | 'capped'}.
create or replace function public.fulfil_listing(lid uuid, mid uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  l public.listings;
  mine public.mons;
  tr public.trades;
  day timestamptz := date_trunc('day', now());
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into l from public.listings where id = lid for update;
  if not found or l.status <> 'open' or l.owner = me or not public.are_friends(me, l.owner) then
    return jsonb_build_object('status', 'gone');
  end if;
  perform 1 from public.mons where id = any(l.mon || l.bundle || mid) order by id for update;
  if (select count(*) from public.mons where id = any(l.mon || l.bundle) and owner = l.owner and status = 'listed')
     <> cardinality(l.mon || l.bundle) then
    return jsonb_build_object('status', 'gone');
  end if;
  select * into mine from public.mons where id = mid;
  if not found or mine.owner <> me or mine.status <> 'held' or mine.species <> l.want_species
     or (l.want_tier is not null and mine.tier is distinct from l.want_tier) then
    return jsonb_build_object('status', 'unfit');
  end if;
  if (select count(*) from public.trades where status = 'done' and closed_at >= day and me in (a, b))
       >= public.trade_limit('TRADES_PER_DAY')
     or (select count(*) from public.trades where status = 'done' and closed_at >= day and l.owner in (a, b))
       >= public.trade_limit('TRADES_PER_DAY') then
    return jsonb_build_object('status', 'capped');
  end if;
  update public.listings set status = 'done', closed_at = now() where id = lid;
  insert into public.trades (kind, a, b, a_mons, b_mons, status)
  values ('board', l.owner, me, l.mon || l.bundle, array[mid], 'open')
  returning * into tr;
  perform public.perform_swap(tr, me);
  return jsonb_build_object('status', 'done', 'trade', tr.id,
    'got', (select public.mon_json(x) from public.mons x where x.id = l.mon),
    'gots', (select jsonb_agg(public.mon_json(x) order by array_position(l.mon || l.bundle, x.id))
               from public.mons x where x.id = any(l.mon || l.bundle)),
    'from', (select c.username from public.trainer_cards c where c.user_id = l.owner));
end;
$$;

revoke all on function public.post_listing(uuid[], int, text) from public, anon;
revoke all on function public.withdraw_listing(uuid) from public, anon;
revoke all on function public.trade_board(int) from public, anon;
revoke all on function public.fulfil_listing(uuid, uuid) from public, anon;
grant execute on function public.post_listing(uuid[], int, text) to authenticated;
grant execute on function public.withdraw_listing(uuid) to authenticated;
grant execute on function public.trade_board(int) to authenticated;
grant execute on function public.fulfil_listing(uuid, uuid) to authenticated;

-- =================================================================== PHASE 5
-- BLOCK AND REPORT (docs/trading.md). The `blocks` table sits in phase 1,
-- which reads it. Neither side of a block finds, befriends, offers to or opens
-- the profile of the other. Blocking ends a friendship and closes the open
-- offers between the two, freeing what was locked; since `befriend` refuses
-- across a block, being friends implies no block, which is what keeps the
-- friends-only Board and Surprise Trade covered. A report is a row for the
-- project's owner to read - no free text, a reason from a fixed list, once per
-- pair per day.

create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  reporter   uuid not null references auth.users on delete cascade,
  reported   uuid not null references auth.users on delete cascade,
  reason     int  not null check (reason between 0 and 15),     -- a REPORT_REASONS index
  created_at timestamptz not null default now()
);
create index if not exists reports_pair on public.reports (reporter, reported, created_at);
-- No policies: nobody reads reports through the API. The dashboard does.
alter table public.reports enable row level security;

create or replace function public.block_user(other uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  tr public.trades;
begin
  if me is null then raise exception 'not signed in'; end if;
  if other is null or other = me then return false; end if;
  insert into public.blocks (blocker, blocked) values (me, other) on conflict do nothing;
  delete from public.friends where (a = me and b = other) or (a = other and b = me);
  for tr in select * from public.trades
             where status = 'open' and ((a = me and b = other) or (a = other and b = me))
             for update loop
    update public.trades set status = 'cancelled', closed_at = now() where id = tr.id;
    perform public.trade_release(tr);
  end loop;
  return true;
end;
$$;

create or replace function public.unblock_user(other uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.blocks where blocker = auth.uid() and blocked = other;
  return found;
end;
$$;

-- The trainers you have blocked, as cards (to undo it).
create or replace function public.my_blocks()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.public_card(c) order by lower(c.username)), '[]')
    from public.blocks b join public.trainer_cards c on c.user_id = b.blocked
   where b.blocker = auth.uid()
$$;

-- True if filed; false if this pair was already reported today.
create or replace function public.report_user(other uuid, reason int)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if other is null or other = me or reason is null or reason not between 0 and 15 then return false; end if;
  if exists (select 1 from public.reports where reporter = me and reported = other
              and created_at >= date_trunc('day', now())) then
    return false;
  end if;
  insert into public.reports (reporter, reported, reason) values (me, other, report_user.reason);
  return true;
end;
$$;

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.my_blocks() from public, anon;
revoke all on function public.report_user(uuid, int) from public, anon;
revoke all on function public.request_friend(uuid) from public, anon;
revoke all on function public.my_card() from public, anon;
revoke all on function public.card_by_name(text) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.my_blocks() to authenticated;
grant execute on function public.report_user(uuid, int) to authenticated;
grant execute on function public.request_friend(uuid) to authenticated;
grant execute on function public.my_card() to authenticated;
grant execute on function public.card_by_name(text) to authenticated;

-- =================================================================== PHASE 6
-- EXPLORE AND SEARCH (docs/trading.md). A FRIEND's box can be browsed and
-- asked from (propose_trade's `want_uids`); anybody's shelf can be searched by
-- species, and so can what your friends have spare. All read the STORED save:
-- nothing here trusts a client.

create index if not exists mons_shelf_species on public.mons (species) where shelf;

-- A friend's Pokedex and their SPARES: every box entry but the last of its
-- species and anything their game has locked, as the card shows a Pokemon.
-- Null for anybody who is not a friend.
create or replace function public.friend_box(who uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  d jsonb;
begin
  if me is null or who is null or not public.are_friends(me, who) then return null; end if;
  select data into d from public.saves where user_id = who;
  return jsonb_build_object(
    'dex', case when jsonb_typeof(d->'dex') = 'array' then d->'dex' else '[]' end,
    'box', coalesce((select jsonb_agg(public.box_snapshot(z.e) order by z.sp, z.lv desc) from (
              select e, (e->>'species')::int sp, (e->>'level')::int lv,
                     count(*) over (partition by e->>'species') n
                from jsonb_array_elements(case when jsonb_typeof(d->'box') = 'array' then d->'box' else '[]' end) e
               where coalesce(e->>'uid', '') ~ '^\d{1,9}$' and coalesce(e->>'species', '') ~ '^\d{1,5}$'
                 and coalesce(e->>'level', '') ~ '^\d{1,4}$') z
             where z.n > 1 and not (z.e ? 'lock')), '[]'));
end;
$$;

-- WHO HAS ONE: friends with a spare of species `q` (how many), and anybody's
-- shelf holding one - never yourself, never across a block.
create or replace function public.trade_search(q int)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null or q is null then null else jsonb_build_object(
    'friends', coalesce((select jsonb_agg(x order by (x->>'spare')::int desc) from (
        -- Spare = one less than they hold, and never more than are free (a
        -- listed or pooled one is in their box but not to be had).
        select jsonb_build_object('user_id', c.user_id, 'username', c.username, 'char', c.char,
                                  'spare', least(s.n - 1, s.free)) x
          from public.friends f
          join public.trainer_cards c on c.user_id = case when f.a = auth.uid() then f.b else f.a end
          cross join lateral (
            select count(*) n, count(*) filter (where not (e ? 'lock')) free from public.saves sv,
                   jsonb_array_elements(case when jsonb_typeof(sv.data->'box') = 'array' then sv.data->'box' else '[]' end) e
             where sv.user_id = c.user_id and e->>'species' = q::text) s
         where f.status = 'accepted' and auth.uid() in (f.a, f.b) and least(s.n - 1, s.free) > 0
         limit 30) z), '[]'),
    'shelves', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('user_id', c.user_id, 'username', c.username, 'char', c.char,
                                  'mons', jsonb_agg(public.mon_json(m) order by m.level desc)) x
          from public.mons m join public.trainer_cards c on c.user_id = m.owner
         where m.species = q and m.shelf and m.status = 'held' and m.owner <> auth.uid()
           and not public.blocked_between(auth.uid(), m.owner)
         group by c.user_id, c.username, c.char
         limit 30) z), '[]')) end
$$;

revoke all on function public.friend_box(uuid) from public, anon;
revoke all on function public.trade_search(int) from public, anon;
grant execute on function public.friend_box(uuid) to authenticated;
grant execute on function public.trade_search(int) to authenticated;
