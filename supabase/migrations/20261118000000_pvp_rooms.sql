-- 멀티플레이 방: 방 만들기(공개/코드), 방 목록, 준비, 방장 시작. 2인 방은 시작할 때 기존 1대1 매치(pvp_matches, 레이팅 반영)를 만들고,
-- SPEED RUSH 는 3~6인 방도 열 수 있습니다(레이팅 없음, 순위만 표시). 쓰기는 모두 security definer 함수로만 합니다.

create table public.pvp_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game text not null check (game in ('city', 'race', 'rts', 'shooter')),
  host_id uuid not null references public.pvp_profiles (id) on delete cascade,
  max_players int not null default 2 check (max_players between 2 and 6),
  is_public boolean not null default true,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'closed')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and octet_length(config::text) < 2000),
  match_id uuid references public.pvp_matches (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz
);
create index pvp_rooms_open on public.pvp_rooms (game, created_at) where status = 'waiting';

create table public.pvp_room_members (
  room_id uuid not null references public.pvp_rooms (id) on delete cascade,
  user_id uuid not null references public.pvp_profiles (id) on delete cascade,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index pvp_room_members_user on public.pvp_room_members (user_id);
create index pvp_rooms_host on public.pvp_rooms (host_id);
create index pvp_rooms_match on public.pvp_rooms (match_id);

alter table public.pvp_rooms enable row level security;
alter table public.pvp_room_members enable row level security;
-- 방 목록과 참가자(닉네임·준비 여부)는 로그인한 사용자에게 보입니다. 직접 쓰기 정책은 없습니다.
create policy pvp_rooms_read on public.pvp_rooms for select to authenticated using (true);
create policy pvp_room_members_read on public.pvp_room_members for select to authenticated using (true);

create function public.pvp_room_tidy() returns void language sql security definer set search_path = '' as $$
  update public.pvp_rooms set status = 'closed' where status = 'waiting' and created_at < now() - interval '30 minutes';
  update public.pvp_rooms set status = 'closed' where status = 'playing' and started_at < now() - interval '60 minutes';
  update public.pvp_rooms r set status = 'closed' where status = 'waiting' and not exists (select 1 from public.pvp_room_members m where m.room_id = r.id);
$$;

-- 대기 중인 방에서 나옵니다. 방장이 나가면 가장 먼저 들어온 사람이 방장이 되고, 아무도 없으면 방이 닫힙니다.
create function public.pvp_room_exit(p_user uuid, p_room uuid default null) returns void language plpgsql security definer set search_path = '' as $$
declare r record; nxt uuid;
begin
  for r in select rm.* from public.pvp_rooms rm join public.pvp_room_members mb on mb.room_id = rm.id
           where mb.user_id = p_user and rm.status = 'waiting' and (p_room is null or rm.id = p_room) for update of rm loop
    delete from public.pvp_room_members where room_id = r.id and user_id = p_user;
    if r.host_id = p_user then
      select user_id into nxt from public.pvp_room_members where room_id = r.id order by joined_at, user_id limit 1;
      if nxt is null then update public.pvp_rooms set status = 'closed' where id = r.id;
      else update public.pvp_rooms set host_id = nxt where id = r.id; update public.pvp_room_members set ready = true where room_id = r.id and user_id = nxt; end if;
    end if;
  end loop;
end $$;

create function public.pvp_room_create(p_game text, p_max int default 2, p_public boolean default true, p_config jsonb default '{}'::jsonb) returns public.pvp_rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.pvp_rooms; c text; tries int := 0; mx int; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if me is null then raise exception 'login_required'; end if;
  if p_game not in ('city', 'race', 'rts', 'shooter') then raise exception 'bad_game'; end if;
  mx := case when p_game = 'race' then least(greatest(coalesce(p_max, 2), 2), 6) else 2 end;
  perform public.pvp_room_tidy(); perform public.pvp_room_exit(me);
  loop
    c := '';
    for i in 1..5 loop c := c || substr(alphabet, 1 + floor(random() * 32)::int, 1); end loop;
    begin
      insert into public.pvp_rooms (code, game, host_id, max_players, is_public, config) values (c, p_game, me, mx, coalesce(p_public, true), coalesce(p_config, '{}'::jsonb)) returning * into r;
      exit;
    exception when unique_violation then tries := tries + 1; if tries > 6 then raise; end if;
    end;
  end loop;
  insert into public.pvp_room_members (room_id, user_id, ready) values (r.id, me, true);
  return r;
end $$;

create function public.pvp_room_join(p_code text) returns public.pvp_rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.pvp_rooms; n int;
begin
  if me is null then raise exception 'login_required'; end if;
  select * into r from public.pvp_rooms where code = upper(btrim(coalesce(p_code, ''))) and status = 'waiting' for update;
  if not found then raise exception 'room_not_found'; end if;
  if exists (select 1 from public.pvp_room_members where room_id = r.id and user_id = me) then return r; end if;
  select count(*) into n from public.pvp_room_members where room_id = r.id;
  if n >= r.max_players then raise exception 'room_full'; end if;
  perform public.pvp_room_exit(me);
  insert into public.pvp_room_members (room_id, user_id) values (r.id, me);
  return r;
end $$;

create function public.pvp_room_leave(p_id uuid) returns void language sql security definer set search_path = '' as $$
  select public.pvp_room_exit(auth.uid(), p_id);
$$;

create function public.pvp_room_ready(p_id uuid, p_ready boolean) returns void language sql security definer set search_path = '' as $$
  update public.pvp_room_members m set ready = coalesce(p_ready, false)
    where m.room_id = p_id and m.user_id = auth.uid() and exists (select 1 from public.pvp_rooms r where r.id = p_id and r.status = 'waiting' and r.host_id <> auth.uid());
$$;

-- 방장이 시작합니다. 둘 이상이고 모두 준비했을 때만. 2인 방은 레이팅이 반영되는 1대1 매치를 같이 만듭니다.
create function public.pvp_room_start(p_id uuid) returns public.pvp_rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.pvp_rooms; n int; waiting_n int; guest uuid; mid uuid;
begin
  if me is null then raise exception 'login_required'; end if;
  select * into r from public.pvp_rooms where id = p_id for update;
  if not found or r.host_id <> me then raise exception 'not_host'; end if;
  if r.status <> 'waiting' then return r; end if;
  select count(*), count(*) filter (where not ready) into n, waiting_n from public.pvp_room_members where room_id = p_id;
  if n < 2 then raise exception 'need_players'; end if;
  if waiting_n > 0 then raise exception 'not_ready'; end if;
  if n = 2 then
    select user_id into guest from public.pvp_room_members where room_id = p_id and user_id <> r.host_id;
    insert into public.pvp_matches (game, host_id, guest_id, status, started_at, config) values (r.game, r.host_id, guest, 'playing', now(), r.config) returning id into mid;
  end if;
  update public.pvp_rooms set status = 'playing', started_at = now(), match_id = mid where id = p_id returning * into r;
  return r;
end $$;

revoke all on function public.pvp_room_tidy(), public.pvp_room_exit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pvp_room_create(text, int, boolean, jsonb), public.pvp_room_join(text), public.pvp_room_leave(uuid), public.pvp_room_ready(uuid, boolean), public.pvp_room_start(uuid) from public, anon;
grant execute on function public.pvp_room_create(text, int, boolean, jsonb), public.pvp_room_join(text), public.pvp_room_leave(uuid), public.pvp_room_ready(uuid, boolean), public.pvp_room_start(uuid) to authenticated;
