-- OUTLAW CITY('outlaw')를 대전 게임 목록에 추가하고, 모든 게임이 방을 최대 6인까지 열 수 있게 합니다(몇 명까지 쓸지는 각 게임이 openLobby 의 maxPlayers 로 정합니다).
alter table public.pvp_ratings drop constraint if exists pvp_ratings_game_check;
alter table public.pvp_ratings add constraint pvp_ratings_game_check check (game in ('city', 'race', 'rts', 'shooter', 'outlaw'));
alter table public.pvp_matches drop constraint if exists pvp_matches_game_check;
alter table public.pvp_matches add constraint pvp_matches_game_check check (game in ('city', 'race', 'rts', 'shooter', 'outlaw'));
alter table public.pvp_rooms drop constraint if exists pvp_rooms_game_check;
alter table public.pvp_rooms add constraint pvp_rooms_game_check check (game in ('city', 'race', 'rts', 'shooter', 'outlaw'));

create or replace function public.pvp_quick_match(p_game text, p_config jsonb default '{}'::jsonb) returns public.pvp_matches language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); m public.pvp_matches;
begin
  if me is null then raise exception 'login_required'; end if;
  if p_game not in ('city', 'race', 'rts', 'shooter', 'outlaw') then raise exception 'bad_game'; end if;
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

create or replace function public.pvp_room_create(p_game text, p_max int default 2, p_public boolean default true, p_config jsonb default '{}'::jsonb) returns public.pvp_rooms language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.pvp_rooms; c text; tries int := 0; mx int; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if me is null then raise exception 'login_required'; end if;
  if p_game not in ('city', 'race', 'rts', 'shooter', 'outlaw') then raise exception 'bad_game'; end if;
  mx := least(greatest(coalesce(p_max, 2), 2), 6);
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
