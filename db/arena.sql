-- ONLINE ARENA BATTLES (the Arena plan, phase 3): a challenge between FRIENDS
-- and the secret room their two games meet in. Applied AFTER db/trading.sql
-- (it reads friends, blocked_between and public_card), re-runnable; it
-- redefines no function of another file.
--
-- THE SERVER NEVER SEES THE MATCH. The two browsers play it peer to peer
-- (WebRTC), and find each other through a Supabase Realtime broadcast named
-- after the invite's room: 64 random hex characters that only these
-- functions hand out, and only to the two trainers - the whole of its
-- privacy, and enough for a match that is unranked, pays nothing and is
-- read by nobody else. The table itself is unreadable to every client (RLS
-- on, no policy), like ranked_battles.

create table if not exists public.arena_invites (
  id         uuid primary key default gen_random_uuid(),
  a          uuid not null references auth.users on delete cascade,   -- who challenged
  b          uuid not null references auth.users on delete cascade,   -- who was challenged
  room       text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  seed       int  not null default (1 + floor(random() * 2147483646))::int,
  arena      text not null check (length(arena) between 1 and 16),
  status     text not null default 'open' check (status in ('open', 'accepted', 'declined', 'gone')),
  created_at timestamptz not null default now(),
  check (a <> b)
);
create index if not exists arena_invites_b on public.arena_invites (b, status);
create index if not exists arena_invites_a on public.arena_invites (a, status);
alter table public.arena_invites enable row level security;
revoke all on public.arena_invites from anon, authenticated;

-- How long a challenge waits for its answer (the page counts the same).
create or replace function public.arena_ttl()
returns interval language sql immutable set search_path = '' as $$ select interval '2 minutes' $$;

-- Challenge a friend: answers the invite ({id, room, seed, arena}), or null
-- when the two are not friends (a block ends a friendship, so it is covered).
-- One open challenge a trainer: a new one replaces the last. A day-old row
-- is cleared on the way, so the table never grows past a day of challenges.
create or replace function public.arena_challenge(other uuid, ground text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  got public.arena_invites;
begin
  if me is null then raise exception 'not signed in'; end if;
  if other is null or not exists (
       select 1 from public.friends f
        where f.status = 'accepted' and least(f.a, f.b) = least(me, other) and greatest(f.a, f.b) = greatest(me, other))
     or public.blocked_between(me, other) then
    return null;
  end if;
  delete from public.arena_invites where created_at < now() - interval '1 day';
  update public.arena_invites set status = 'gone' where a = me and status = 'open';
  insert into public.arena_invites (a, b, arena) values (me, other, left(coalesce(nullif(btrim(ground), ''), 'indigo'), 16))
  returning * into got;
  return jsonb_build_object('id', got.id, 'room', got.room, 'seed', got.seed, 'arena', got.arena);
end;
$$;

-- The challenges waiting for you and the one you sent, under arena_ttl() old,
-- each with the other trainer's card. Yours shows how it was answered; one to
-- you carries no room until you accept it.
create or replace function public.arena_invites_mine()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'mine', i.a = auth.uid(), 'status', i.status, 'arena', i.arena,
           'room', case when i.a = auth.uid() then i.room end,
           'seed', case when i.a = auth.uid() then i.seed end,
           'left', greatest(0, extract(epoch from (i.created_at + public.arena_ttl() - now())))::int,
           'card', public.public_card(c)) order by i.created_at desc), '[]')
    from public.arena_invites i
    join public.trainer_cards c on c.user_id = case when i.a = auth.uid() then i.b else i.a end
   where auth.uid() in (i.a, i.b)
     -- An ACCEPTED one stays a minute longer for its challenger: accepted in
     -- its last seconds, the handshake outlived the TTL and read as expired.
     and (i.created_at > now() - public.arena_ttl()
          or (i.a = auth.uid() and i.status = 'accepted' and i.created_at > now() - public.arena_ttl() - interval '1 minute'))
     and (i.status = 'open' or (i.a = auth.uid() and i.status in ('accepted', 'declined')))
     and not public.blocked_between(i.a, i.b)
$$;

-- Answer one: yes hands you the room ({id, room, seed, arena}); no, or a
-- challenge gone, taken back or expired, answers null.
create or replace function public.arena_answer(invite uuid, yes boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare got public.arena_invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- Aliased: inside the friends check a bare `a` would be the friends row's own.
  update public.arena_invites i set status = case when yes then 'accepted' else 'declined' end
   where i.id = invite and i.b = auth.uid() and i.status = 'open' and i.created_at > now() - public.arena_ttl()
     and not public.blocked_between(i.a, i.b)
     and exists (select 1 from public.friends f
                  where f.status = 'accepted' and least(f.a, f.b) = least(i.a, i.b) and greatest(f.a, f.b) = greatest(i.a, i.b))
  returning i.* into got;
  if got.id is null or not yes then return null; end if;
  return jsonb_build_object('id', got.id, 'room', got.room, 'seed', got.seed, 'arena', got.arena);
end;
$$;

-- Take your challenge back.
create or replace function public.arena_cancel(invite uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.arena_invites set status = 'gone' where id = invite and a = auth.uid() and status = 'open';
  return found;
end;
$$;

revoke all on function public.arena_ttl() from public, anon;
revoke all on function public.arena_challenge(uuid, text) from public, anon;
revoke all on function public.arena_invites_mine() from public, anon;
revoke all on function public.arena_answer(uuid, boolean) from public, anon;
revoke all on function public.arena_cancel(uuid) from public, anon;
grant execute on function public.arena_ttl() to authenticated;
grant execute on function public.arena_challenge(uuid, text) to authenticated;
grant execute on function public.arena_invites_mine() to authenticated;
grant execute on function public.arena_answer(uuid, boolean) to authenticated;
grant execute on function public.arena_cancel(uuid) to authenticated;
