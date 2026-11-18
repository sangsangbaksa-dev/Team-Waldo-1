-- LAST CITY / SPEED RUSH 1대1 PvP: 프로필, 게임별 레이팅, 매치. 쓰기는 모두 security definer 함수로만 합니다.
-- (같은 프로젝트의 waldo_* 테이블은 건드리지 않습니다.)

create table public.pvp_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 16),
  created_at timestamptz not null default now()
);
create unique index pvp_profiles_nickname_key on public.pvp_profiles (lower(nickname));

create table public.pvp_ratings (
  user_id uuid not null references public.pvp_profiles (id) on delete cascade,
  game text not null check (game in ('city', 'race')),
  rating int not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);
create index pvp_ratings_rank on public.pvp_ratings (game, rating desc);

create table public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('city', 'race')),
  code text unique,
  host_id uuid not null references public.pvp_profiles (id) on delete cascade,
  guest_id uuid references public.pvp_profiles (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished', 'cancelled', 'void')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and octet_length(config::text) < 2000),
  host_claim uuid, guest_claim uuid, host_claim_at timestamptz, guest_claim_at timestamptz,
  winner_id uuid, host_delta int, guest_delta int,
  created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
  check (guest_id is null or guest_id <> host_id)
);
create index pvp_matches_open on public.pvp_matches (game, created_at) where status = 'waiting' and code is null;
create index pvp_matches_host on public.pvp_matches (host_id);
create index pvp_matches_guest on public.pvp_matches (guest_id);

alter table public.pvp_profiles enable row level security;
alter table public.pvp_ratings enable row level security;
alter table public.pvp_matches enable row level security;

-- 닉네임·레이팅은 랭킹에 쓰이므로 누구나 읽을 수 있습니다. 매치는 참가자만 읽습니다. 직접 쓰기 정책은 없습니다.
create policy pvp_profiles_read on public.pvp_profiles for select to anon, authenticated using (true);
create policy pvp_ratings_read on public.pvp_ratings for select to anon, authenticated using (true);
create policy pvp_matches_read on public.pvp_matches for select to authenticated using ((select auth.uid()) in (host_id, guest_id));

-- 가입 시 프로필을 만듭니다. 닉네임은 가입 폼의 user_metadata 에서 받고, 겹치면 숫자를 붙입니다.
create function public.pvp_handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare nick text := left(btrim(coalesce(new.raw_user_meta_data ->> 'nickname', '')), 16); try int := 0;
begin
  if char_length(nick) < 2 then nick := 'player' || floor(random() * 9000 + 1000)::int; end if;
  loop
    begin
      insert into public.pvp_profiles (id, nickname) values (new.id, nick);
      return new;
    exception when unique_violation then
      try := try + 1; if try > 8 then raise; end if;
      nick := left(nick, 11) || floor(random() * 90000 + 10000)::int;
    end;
  end loop;
end $$;
create trigger pvp_on_auth_user_created after insert on auth.users for each row execute function public.pvp_handle_new_user();
-- 이미 가입된 계정에도 프로필을 만들어 둡니다.
insert into public.pvp_profiles (id, nickname)
  select u.id, 'player' || (1000 + (row_number() over (order by u.created_at))::int) from auth.users u on conflict do nothing;

create function public.pvp_set_nickname(p_nickname text) returns public.pvp_profiles language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_nickname, '')); r public.pvp_profiles;
begin
  if me is null then raise exception 'login_required'; end if;
  if char_length(n) < 2 or char_length(n) > 16 then raise exception 'bad_nickname'; end if;
  begin update public.pvp_profiles set nickname = n where id = me returning * into r;
  exception when unique_violation then raise exception 'nickname_taken'; end;
  return r;
end $$;

create function public.pvp_ensure_rating(p_user uuid, p_game text) returns void language sql security definer set search_path = '' as $$
  insert into public.pvp_ratings (user_id, game) values (p_user, p_game) on conflict do nothing;
$$;

-- 오래된 대기 방을 정리하고, 내가 만든 대기 방을 닫습니다.
create function public.pvp_tidy(p_user uuid) returns void language sql security definer set search_path = '' as $$
  update public.pvp_matches set status = 'cancelled', finished_at = now()
    where status = 'waiting' and (host_id = p_user or created_at < now() - interval '10 minutes');
  update public.pvp_matches set status = 'void', finished_at = now()
    where status = 'playing' and started_at < now() - interval '40 minutes';
$$;

create function public.pvp_quick_match(p_game text, p_config jsonb default '{}'::jsonb) returns public.pvp_matches language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); m public.pvp_matches;
begin
  if me is null then raise exception 'login_required'; end if;
  if p_game not in ('city', 'race') then raise exception 'bad_game'; end if;
  perform public.pvp_tidy(me);
  select * into m from public.pvp_matches
    where status = 'waiting' and code is null and game = p_game and host_id <> me and created_at > now() - interval '2 minutes'
    order by created_at limit 1 for update skip locked;
  if found then
    update public.pvp_matches set guest_id = me, status = 'playing', started_at = now() where id = m.id returning * into m;
    return m;
  end if;
  insert into public.pvp_matches (game, host_id, config) values (p_game, me, coalesce(p_config, '{}'::jsonb)) returning * into m;
  return m;
end $$;

create function public.pvp_create_room(p_game text, p_config jsonb default '{}'::jsonb) returns public.pvp_matches language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); m public.pvp_matches; c text; tries int := 0; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if me is null then raise exception 'login_required'; end if;
  if p_game not in ('city', 'race') then raise exception 'bad_game'; end if;
  perform public.pvp_tidy(me);
  loop
    c := '';
    for i in 1..5 loop c := c || substr(alphabet, 1 + floor(random() * 32)::int, 1); end loop;
    begin
      insert into public.pvp_matches (game, code, host_id, config) values (p_game, c, me, coalesce(p_config, '{}'::jsonb)) returning * into m;
      return m;
    exception when unique_violation then tries := tries + 1; if tries > 6 then raise; end if;
    end;
  end loop;
end $$;

create function public.pvp_join_room(p_code text) returns public.pvp_matches language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); m public.pvp_matches;
begin
  if me is null then raise exception 'login_required'; end if;
  select * into m from public.pvp_matches where code = upper(btrim(coalesce(p_code, ''))) and status = 'waiting' for update;
  if not found then raise exception 'room_not_found'; end if;
  if m.host_id = me then raise exception 'own_room'; end if;
  update public.pvp_matches set guest_id = me, status = 'playing', started_at = now() where id = m.id returning * into m;
  return m;
end $$;

create function public.pvp_cancel_match(p_id uuid) returns void language sql security definer set search_path = '' as $$
  update public.pvp_matches set status = 'cancelled', finished_at = now() where id = p_id and host_id = auth.uid() and status = 'waiting';
$$;

-- 결과 확정: 승자 기준으로 Elo(K=32) 를 반영합니다.
create function public.pvp_finalize(p_id uuid, p_winner uuid) returns public.pvp_matches language plpgsql security definer set search_path = '' as $$
declare m public.pvp_matches; loser uuid; rw int; rl int; e numeric; d int;
begin
  select * into m from public.pvp_matches where id = p_id for update;
  if m.status <> 'playing' then return m; end if;
  loser := case when p_winner = m.host_id then m.guest_id else m.host_id end;
  perform public.pvp_ensure_rating(m.host_id, m.game); perform public.pvp_ensure_rating(m.guest_id, m.game);
  select rating into rw from public.pvp_ratings where user_id = p_winner and game = m.game for update;
  select rating into rl from public.pvp_ratings where user_id = loser and game = m.game for update;
  e := 1 / (1 + power(10, (rl - rw) / 400.0)); d := greatest(1, round(32 * (1 - e))::int);
  update public.pvp_ratings set rating = rating + d, wins = wins + 1, updated_at = now() where user_id = p_winner and game = m.game;
  update public.pvp_ratings set rating = greatest(100, rating - d), losses = losses + 1, updated_at = now() where user_id = loser and game = m.game;
  update public.pvp_matches set status = 'finished', winner_id = p_winner, finished_at = now(),
    host_delta = case when p_winner = host_id then d else -d end, guest_delta = case when p_winner = guest_id then d else -d end
    where id = p_id returning * into m;
  return m;
end $$;

-- 결과 보고. 스스로 패배를 인정하면 바로 확정, 승리를 주장하면 상대가 같은 결과를 보고하거나 15초 안에 이의가 없을 때 확정(pvp_settle).
-- 두 보고가 다르면 무효 처리하고 레이팅을 바꾸지 않습니다. (게임 시뮬레이션은 클라이언트에서 돌기 때문에 부정행위를 완전히 막을 수는 없습니다.)
create function public.pvp_report_result(p_id uuid, p_winner uuid) returns public.pvp_matches language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); m public.pvp_matches;
begin
  if me is null then raise exception 'login_required'; end if;
  select * into m from public.pvp_matches where id = p_id for update;
  if not found or me not in (m.host_id, m.guest_id) then raise exception 'not_a_player'; end if;
  if p_winner not in (m.host_id, m.guest_id) then raise exception 'bad_winner'; end if;
  if m.status <> 'playing' then return m; end if;
  if me = m.host_id then update public.pvp_matches set host_claim = p_winner, host_claim_at = now() where id = p_id returning * into m;
  else update public.pvp_matches set guest_claim = p_winner, guest_claim_at = now() where id = p_id returning * into m; end if;
  if p_winner <> me then return public.pvp_finalize(p_id, p_winner); end if;
  if m.host_claim is not null and m.guest_claim is not null then
    if m.host_claim = m.guest_claim then return public.pvp_finalize(p_id, m.host_claim); end if;
    update public.pvp_matches set status = 'void', finished_at = now() where id = p_id returning * into m;
  end if;
  return m;
end $$;

create function public.pvp_settle(p_id uuid) returns public.pvp_matches language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); m public.pvp_matches; w uuid; at timestamptz;
begin
  select * into m from public.pvp_matches where id = p_id for update;
  if not found or me is null or me not in (m.host_id, m.guest_id) then raise exception 'not_a_player'; end if;
  if m.status <> 'playing' then return m; end if;
  if m.host_claim is not null and m.guest_claim is null then w := m.host_claim; at := m.host_claim_at;
  elsif m.guest_claim is not null and m.host_claim is null then w := m.guest_claim; at := m.guest_claim_at; end if;
  if w is not null and at < now() - interval '15 seconds' then return public.pvp_finalize(p_id, w); end if;
  return m;
end $$;

create function public.pvp_leaderboard(p_game text, p_limit int default 20)
returns table (rank bigint, user_id uuid, nickname text, rating int, wins int, losses int) language sql stable security invoker set search_path = '' as $$
  select row_number() over (order by r.rating desc, r.wins desc, p.created_at), r.user_id, p.nickname, r.rating, r.wins, r.losses
  from public.pvp_ratings r join public.pvp_profiles p on p.id = r.user_id
  where r.game = p_game and r.wins + r.losses > 0 order by 1 limit least(greatest(p_limit, 1), 100);
$$;

-- 내부 함수는 직접 부르지 못하게 하고, 공개 함수만 로그인한 사용자에게 엽니다.
revoke all on function public.pvp_handle_new_user(), public.pvp_ensure_rating(uuid, text), public.pvp_tidy(uuid), public.pvp_finalize(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pvp_set_nickname(text), public.pvp_quick_match(text, jsonb), public.pvp_create_room(text, jsonb), public.pvp_join_room(text),
  public.pvp_cancel_match(uuid), public.pvp_report_result(uuid, uuid), public.pvp_settle(uuid) from public, anon;
grant execute on function public.pvp_set_nickname(text), public.pvp_quick_match(text, jsonb), public.pvp_create_room(text, jsonb), public.pvp_join_room(text),
  public.pvp_cancel_match(uuid), public.pvp_report_result(uuid, uuid), public.pvp_settle(uuid) to authenticated;
revoke all on function public.pvp_leaderboard(text, int) from public;
grant execute on function public.pvp_leaderboard(text, int) to anon, authenticated;
