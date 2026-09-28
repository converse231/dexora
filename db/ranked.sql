-- RANKED (docs/ranked.md): 6a DEFENSE TEAMS, 6b REFEREED BATTLES.
--
-- Run AFTER db/trading.sql, whose functions this reads (box_snapshot,
-- are_friends). Every statement is re-runnable, like trading.sql's: paste the
-- whole file again after any change.
--
-- A defense team is up to six box uids. Like the shelf and the showcase, each
-- uid is checked against the trainer's STORED save - never the request - and
-- read back from it every time it is shown, so a Pokemon sold, traded or
-- evolved since is shown as it now is, or as gone. Species legality (the
-- species clause, which needs the dex's forms) is the rules' in the browser
-- and, from 6b, the battle function's; the database holds what it can check.

-- ------------------------------------------------------------------ limits
-- Equal to src/game/ranked.js's DEFENSE_SLOTS and DEFENSE_MIN, league.js's
-- TEAM_MAX and referee.js's ABANDON_MINUTES (asserted by check.mjs, as
-- trade_limit is against LIMITS).
create or replace function public.ranked_limit(name text)
returns int language sql immutable set search_path = '' as $$
  select case name
    when 'SLOTS' then 3
    when 'TEAM' then 6
    when 'MIN' then 2
    when 'ABANDON_MINUTES' then 10
  end
$$;

-- ------------------------------------------------------------------ table
create table if not exists public.defense_teams (
  owner      uuid not null references auth.users on delete cascade,
  slot       smallint not null check (slot between 1 and 3),
  uids       int[] not null check (cardinality(uids) between 1 and 6),
  updated_at timestamptz not null default now(),
  primary key (owner, slot)
);
-- Read your own; nobody writes but `set_defense_team`. A friend reads one of
-- yours only through `practice_team`, which picks it blind.
alter table public.defense_teams enable row level security;
drop policy if exists "read own defense" on public.defense_teams;
create policy "read own defense" on public.defense_teams for select using (auth.uid() = owner);

-- ------------------------------------------------------------------ reading a team
-- A team as it stands in a save's box: each uid's card snapshot, in the
-- team's order, or `{uid, missing: true}` where the box no longer holds it.
create or replace function public.defense_snapshot(box jsonb, uids int[])
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(case when x.e is null then jsonb_build_object('uid', u.v, 'missing', true)
                                 else public.box_snapshot(x.e) end order by u.n), '[]')
    from unnest(coalesce(uids, '{}')) with ordinality u(v, n)
    left join lateral (
      select e from jsonb_array_elements(case when jsonb_typeof(box) = 'array' then box else '[]' end) e
       where e->>'uid' = u.v::text and coalesce(e->>'species', '') ~ '^\d{1,5}$'
       limit 1) x on true
$$;
revoke all on function public.defense_snapshot(jsonb, int[]) from public, anon, authenticated;

-- Your teams, each read off your STORED save.
create or replace function public.my_defense()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slot', d.slot, 'team', public.defense_snapshot(sv.data->'box', d.uids),
                                               'updated_at', d.updated_at) order by d.slot), '[]')
    from public.defense_teams d
    left join public.saves sv on sv.user_id = d.owner
   where d.owner = auth.uid()
$$;

-- ------------------------------------------------------------------ writing a team
-- One slot, replaced whole: up to six distinct box uids, every one of them in
-- your STORED save (the game flushes before it asks). An empty list clears the
-- slot. REFUSED, not trimmed: a team quietly missing a member is a surprise
-- in a battle, so a uid the server cannot see (an upload still in flight)
-- is an error the game shows ("try again in a moment").
create or replace function public.set_defense_team(slot int, uids int[])
returns jsonb language plpgsql security definer set search_path = '' as $$
-- `slot` and `uids` are both parameters (the RPC's names) and columns: a bare
-- name is the column, and every parameter is written qualified.
#variable_conflict use_column
declare
  me uuid := auth.uid();
  box jsonb;
  asked int[] := coalesce(set_defense_team.uids, '{}');
begin
  if me is null then raise exception 'not signed in'; end if;
  if set_defense_team.slot is null or set_defense_team.slot not between 1 and public.ranked_limit('SLOTS') then
    raise exception 'no such team slot';
  end if;
  if cardinality(asked) = 0 then
    delete from public.defense_teams d where d.owner = me and d.slot = set_defense_team.slot;
    return public.my_defense();
  end if;
  if cardinality(asked) > public.ranked_limit('TEAM') then raise exception 'a team is six at most'; end if;
  if (select count(distinct v) from unnest(asked) v) <> cardinality(asked) or array_position(asked, null) is not null then
    raise exception 'a Pokemon is in the team twice';
  end if;
  select case when jsonb_typeof(sv.data->'box') = 'array' then sv.data->'box' else '[]' end
    into box from public.saves sv where sv.user_id = me;
  if exists (select 1 from jsonb_array_elements(public.defense_snapshot(coalesce(box, '[]'), asked)) m where m ? 'missing') then
    raise exception 'not in your saved box';
  end if;
  insert into public.defense_teams (owner, slot, uids) values (me, set_defense_team.slot, asked)
  on conflict (owner, slot) do update set uids = excluded.uids, updated_at = now();
  return public.my_defense();
end;
$$;

-- ------------------------------------------------------------------ practice
-- A FRIEND'S DEFENSE, BLIND: one of their teams, picked here at random so the
-- game never holds the others, with its members as their STORED save has
-- them now (any gone since are left out). Null for anybody who is not a
-- friend (friends are never blocked - a block ends the friendship), or who
-- has no team with a Pokemon still in it.
create or replace function public.practice_team(who uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t jsonb;
begin
  if me is null or who is null or me = who or not public.are_friends(me, who) then return null; end if;
  select x.team into t from (
    select public.defense_snapshot(sv.data->'box', d.uids) as team
      from public.defense_teams d left join public.saves sv on sv.user_id = d.owner
     where d.owner = who) x
   where exists (select 1 from jsonb_array_elements(x.team) m where not (m ? 'missing'))
   order by random() limit 1;
  if t is null then return null; end if;
  return (select jsonb_agg(m) from jsonb_array_elements(t) m where not (m ? 'missing'));
end;
$$;

revoke all on function public.my_defense() from public, anon;
revoke all on function public.set_defense_team(int, int[]) from public, anon;
revoke all on function public.practice_team(uuid) from public, anon;
grant execute on function public.my_defense() to authenticated;
grant execute on function public.set_defense_team(int, int[]) to authenticated;
grant execute on function public.practice_team(uuid) to authenticated;

-- =================================================================== 6b: THE SERVER REFEREES
-- A ranked battle lives here, played turn by turn by the `ranked-step` Edge
-- Function (supabase/functions/ranked-step), which holds the rules; this file
-- stores. Nobody but the service role reads or writes a battle: the row holds
-- the SEED (every roll comes from it) and the STATE (the defender's whole
-- team), and a challenger who could read either could see the dice or the
-- team they are meant to meet blind. The function sends the challenger a view.

create table if not exists public.ranked_battles (
  id            uuid primary key default gen_random_uuid(),
  challenger    uuid not null references auth.users on delete cascade,
  defender      uuid references auth.users on delete set null,
  defense_slot  smallint,
  teams         jsonb not null,            -- {mine, foe}: the snapshots the battle opened with
  seed          bigint not null,
  state         jsonb not null,            -- referee.js's {b, n, seen}
  n             int not null default 0,    -- steps taken: the compare-and-set a save checks
  status        text not null default 'active' check (status in ('active', 'won', 'lost', 'abandoned')),
  rules_version int not null,
  deadline      timestamptz not null,      -- the current decision's; later plays the AI's
  seen_at       timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
-- One open battle a challenger: a second start resumes the first.
create unique index if not exists ranked_one_active on public.ranked_battles (challenger) where status = 'active';
-- The 24-hour rule reads (challenger, defender, created_at); expiry reads stale open battles.
create index if not exists ranked_recent on public.ranked_battles (challenger, defender, created_at);
create index if not exists ranked_open on public.ranked_battles (seen_at) where status = 'active';
alter table public.ranked_battles enable row level security;
revoke all on public.ranked_battles from anon, authenticated;

-- A battle nobody has asked about for ABANDON_MINUTES is lost. Lazy - run by
-- every start and by the challenger's own next request - so no scheduled job.
create or replace function public.ranked_expire(who uuid default null)
returns int language sql volatile security definer set search_path = '' as $$
  with gone as (
    update public.ranked_battles set status = 'abandoned', finished_at = now()
     where status = 'active' and (who is null or challenger = who)
       and seen_at < now() - make_interval(mins => public.ranked_limit('ABANDON_MINUTES'))
    returning 1)
  select count(*)::int from gone
$$;

-- The challenger's side: box uids read off their STORED save (distinct, one
-- to six, every one there), as defense teams are. The species clause is the
-- function's, which has the dex.
create or replace function public.ranked_team(me uuid, uids int[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  asked int[] := coalesce(uids, '{}');
  snap jsonb;
begin
  if cardinality(asked) = 0 or cardinality(asked) > public.ranked_limit('TEAM') then raise exception 'team size'; end if;
  if (select count(distinct v) from unnest(asked) v) <> cardinality(asked) or array_position(asked, null) is not null then
    raise exception 'a Pokemon is in the team twice';
  end if;
  select public.defense_snapshot(sv.data->'box', asked) into snap from public.saves sv where sv.user_id = me;
  if snap is null or exists (select 1 from jsonb_array_elements(snap) m where m ? 'missing') then
    raise exception 'not in your saved box';
  end if;
  return snap;
end;
$$;

-- WHOM YOU MIGHT MEET (6b, before ratings): up to ten trainers, in random
-- order, each with MIN or more defense teams holding a Pokemon, played in the
-- last 14 days, never you, never across a block, never one you battled in
-- the last 24 hours. Each with its teams as its stored save has them (gone
-- members left out); the function keeps the legal ones and picks.
-- ponytail: random() over every eligible owner - fine for this game's size;
-- 6c narrows to a rating window, which an index serves.
create or replace function public.ranked_candidates(me uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.ranked_expire();
  return coalesce((select jsonb_agg(c) from (
    select jsonb_build_object('user_id', o.owner, 'username', tc.username, 'char', tc.char, 'teams', o.teams) as c
      from (
        select d.owner, jsonb_agg(jsonb_build_object('slot', d.slot, 'team', t.team) order by d.slot) as teams
          from public.defense_teams d
          join public.saves sv on sv.user_id = d.owner
          cross join lateral (
            select coalesce(jsonb_agg(m), '[]') as team
              from jsonb_array_elements(public.defense_snapshot(sv.data->'box', d.uids)) m
             where not (m ? 'missing')) t
         where d.owner <> me and jsonb_array_length(t.team) > 0
         group by d.owner
        having count(*) >= public.ranked_limit('MIN')) o
      join public.trainer_cards tc on tc.user_id = o.owner
     where tc.played_at > now() - interval '14 days'
       and not public.blocked_between(me, o.owner)
       and not exists (select 1 from public.ranked_battles r
                        where r.challenger = me and r.defender = o.owner and r.created_at > now() - interval '24 hours')
     order by random() limit 10) z), '[]');
end;
$$;

-- A battle begins. Refused while you have one open (the unique index says so).
create or replace function public.ranked_create(me uuid, defender uuid, slot int, teams jsonb, seed bigint,
                                                state jsonb, deadline timestamptz, version int)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare made uuid;
begin
  insert into public.ranked_battles (challenger, defender, defense_slot, teams, seed, state, rules_version, deadline)
  values (me, defender, slot, teams, seed, state, version, deadline)
  returning id into made;
  return made;
exception when unique_violation then
  raise exception 'already in a battle';
end;
$$;

-- Your open battle, whole (seed and state: the function's eyes only), with
-- whom it is against. Being asked is being present, so it counts as seen;
-- one gone quiet past the limit is lost first.
create or replace function public.ranked_load(me uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public.ranked_expire(me);
  update public.ranked_battles set seen_at = now() where challenger = me and status = 'active';
  select jsonb_build_object('id', b.id, 'defender', b.defender, 'username', tc.username, 'char', tc.char,
                            'teams', b.teams, 'seed', b.seed, 'state', b.state, 'n', b.n,
                            'deadline', b.deadline, 'rules_version', b.rules_version)
    into r
    from public.ranked_battles b left join public.trainer_cards tc on tc.user_id = b.defender
   where b.challenger = me and b.status = 'active';
  return r;
end;
$$;

-- A step saved, COMPARE-AND-SET on the step counter: two requests for one
-- turn (two tabs, a retry) make one turn; the loser is told and resyncs.
create or replace function public.ranked_save(me uuid, id uuid, expect int, state jsonb, n int,
                                              status text, deadline timestamptz)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.ranked_battles b set
    state = ranked_save.state, n = ranked_save.n, status = ranked_save.status,
    deadline = ranked_save.deadline, seen_at = now(),
    finished_at = case when ranked_save.status = 'active' then null else now() end
   where b.id = ranked_save.id and b.challenger = me and b.status = 'active' and b.n = ranked_save.expect;
  return found;
end;
$$;

revoke all on function public.ranked_expire(uuid) from public, anon, authenticated;
revoke all on function public.ranked_team(uuid, int[]) from public, anon, authenticated;
revoke all on function public.ranked_candidates(uuid) from public, anon, authenticated;
revoke all on function public.ranked_create(uuid, uuid, int, jsonb, bigint, jsonb, timestamptz, int) from public, anon, authenticated;
revoke all on function public.ranked_load(uuid) from public, anon, authenticated;
revoke all on function public.ranked_save(uuid, uuid, int, jsonb, int, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ranked_expire(uuid) to service_role;
grant execute on function public.ranked_team(uuid, int[]) to service_role;
grant execute on function public.ranked_candidates(uuid) to service_role;
grant execute on function public.ranked_create(uuid, uuid, int, jsonb, bigint, jsonb, timestamptz, int) to service_role;
grant execute on function public.ranked_load(uuid) to service_role;
grant execute on function public.ranked_save(uuid, uuid, int, jsonb, int, text, timestamptz) to service_role;
