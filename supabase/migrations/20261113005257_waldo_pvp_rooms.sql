create schema if not exists waldo_private;
revoke all on schema waldo_private from public, anon;
grant usage on schema waldo_private to authenticated;
create table public.waldo_rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 host_id uuid not null references auth.users(id) on delete cascade,
 phase text not null default 'waiting' check(phase in ('waiting','playing','finished')),
 snapshot text check(octet_length(snapshot)<=450000),
 sequence bigint not null default 0 check(sequence>=0),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '6 hours'
);
create index waldo_rooms_host_idx on public.waldo_rooms(host_id,expires_at);
create table public.waldo_players (
 room_id uuid not null references public.waldo_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 faction integer not null check(faction between 0 and 3),
 name text not null check(char_length(name) between 1 and 24),
 primary key(room_id,user_id),unique(room_id,faction)
);
create index waldo_players_user_idx on public.waldo_players(user_id,room_id);
create table public.waldo_commands (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.waldo_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 command jsonb not null check(jsonb_typeof(command)='object' and octet_length(command::text)<2000),
 created_at timestamptz not null default now()
);
create index waldo_commands_room_id_idx on public.waldo_commands(room_id,id);
create index waldo_commands_rate_idx on public.waldo_commands(user_id,created_at);
alter table public.waldo_rooms enable row level security;
alter table public.waldo_players enable row level security;
alter table public.waldo_commands enable row level security;

create function waldo_private.member(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.waldo_players p join public.waldo_rooms r on r.id=p.room_id where p.room_id=rid and p.user_id=auth.uid() and r.expires_at>now());
$$;
create function waldo_private.host(rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.waldo_rooms r where r.id=rid and r.host_id=auth.uid() and r.expires_at>now());
$$;
create policy rooms_read on public.waldo_rooms for select to authenticated using(waldo_private.member(id));
create policy rooms_host_update on public.waldo_rooms for update to authenticated using(waldo_private.host(id)) with check(host_id=(select auth.uid()));
create policy players_read on public.waldo_players for select to authenticated using(waldo_private.member(room_id));
create policy commands_read on public.waldo_commands for select to authenticated using(waldo_private.host(room_id) or (user_id=(select auth.uid()) and waldo_private.member(room_id)));
create policy commands_insert on public.waldo_commands for insert to authenticated with check(user_id=(select auth.uid()) and waldo_private.member(room_id) and exists(select 1 from public.waldo_rooms r where r.id=room_id and r.phase='playing'));
revoke all on public.waldo_rooms,public.waldo_players,public.waldo_commands from anon,authenticated;
grant select on public.waldo_rooms,public.waldo_players,public.waldo_commands to authenticated;
grant update(phase,snapshot,sequence,updated_at) on public.waldo_rooms to authenticated;
grant insert(room_id,user_id,command) on public.waldo_commands to authenticated;
grant usage on sequence public.waldo_commands_id_seq to authenticated;

-- Room creation and joining must allocate seats atomically. Only these narrow,
-- authenticated functions bypass table RLS; no client receives privileged keys.
create function waldo_private.enter_room(room_code text, player_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare rid uuid; uid uuid:=auth.uid(); seat integer;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if char_length(trim(player_name)) not between 1 and 24 then raise exception 'Name must contain 1–24 characters'; end if;
 if room_code is null then
  if (select count(*) from public.waldo_rooms where host_id=uid and expires_at>now())>=3 then raise exception 'Maximum three active rooms'; end if;
  insert into public.waldo_rooms(host_id) values(uid) returning id into rid;
  seat:=0;
 else
  select id into rid from public.waldo_rooms where code=upper(trim(room_code)) and expires_at>now() for update;
  if rid is null then raise exception 'Room not found or expired'; end if;
  if exists(select 1 from public.waldo_players where room_id=rid and user_id=uid) then return rid; end if;
  if exists(select 1 from public.waldo_rooms where id=rid and phase<>'waiting') then raise exception 'Match already started'; end if;
  select s into seat from generate_series(0,3) s where not exists(select 1 from public.waldo_players where room_id=rid and faction=s) order by s limit 1;
  if seat is null then raise exception 'Room is full'; end if;
 end if;
 insert into public.waldo_players(room_id,user_id,faction,name) values(rid,uid,seat,trim(player_name));
 return rid;
end $$;
create function public.waldo_enter_room(room_code text default null,player_name text default '지휘관') returns uuid
language sql security invoker set search_path='' as $$select waldo_private.enter_room(room_code,player_name)$$;

create function waldo_private.command_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare seat integer;
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Identity mismatch'; end if;
 if (select count(*) from public.waldo_commands where user_id=new.user_id and created_at>clock_timestamp()-interval '1 second')>=12 then raise exception 'Too many commands'; end if;
 select faction into seat from public.waldo_players where room_id=new.room_id and user_id=new.user_id;
 if seat is null or not exists(select 1 from public.waldo_rooms where id=new.room_id and phase='playing' and expires_at>now()) then raise exception 'Match unavailable'; end if;
 if new.command->>'type' not in ('train','upgrade','research','capture','attack','policy','reserve','build','export','contract','deliver','develop','worker','interior') then raise exception 'Unknown command'; end if;
 -- Realtime Postgres Changes emits the committed command with its authenticated user_id.
 return new;
end $$;
create trigger waldo_command_trigger before insert on public.waldo_commands for each row execute function waldo_private.command_guard();
revoke all on all functions in schema waldo_private from public,anon,authenticated;
grant execute on function waldo_private.member(uuid),waldo_private.host(uuid),waldo_private.enter_room(text,text) to authenticated;
revoke all on function public.waldo_enter_room(text,text) from public,anon;
grant execute on function public.waldo_enter_room(text,text) to authenticated;

alter publication supabase_realtime add table public.waldo_rooms, public.waldo_players, public.waldo_commands;
