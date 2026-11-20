-- FRONTLINE(rts) 와 ZERO ZONE(shooter) 을 1대1 대전 게임 목록에 추가합니다.
-- 체크 제약과 매칭 함수의 허용 목록만 넓히고, 나머지 규칙(레이팅·보고·정리)은 그대로 둡니다.

alter table public.pvp_ratings drop constraint if exists pvp_ratings_game_check;
alter table public.pvp_ratings add constraint pvp_ratings_game_check check (game in ('city', 'race', 'rts', 'shooter'));
alter table public.pvp_matches drop constraint if exists pvp_matches_game_check;
alter table public.pvp_matches add constraint pvp_matches_game_check check (game in ('city', 'race', 'rts', 'shooter'));

create or replace function public.pvp_quick_match(p_game text, p_config jsonb default '{}'::jsonb) returns public.pvp_matches language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); m public.pvp_matches;
begin
  if me is null then raise exception 'login_required'; end if;
  if p_game not in ('city', 'race', 'rts', 'shooter') then raise exception 'bad_game'; end if;
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

create or replace function public.pvp_create_room(p_game text, p_config jsonb default '{}'::jsonb) returns public.pvp_matches language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); m public.pvp_matches; c text; tries int := 0; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if me is null then raise exception 'login_required'; end if;
  if p_game not in ('city', 'race', 'rts', 'shooter') then raise exception 'bad_game'; end if;
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
