-- 방 접속 확인(하트비트): 브라우저를 그냥 닫거나 연결이 끊긴 사람이 대기방에 유령으로 남지 않게 합니다.
-- 대기방 화면은 5초마다 pvp_room_ping 을 부르고, 45초 넘게 신호가 없는 사람은 자동으로 방에서 빠집니다(방장이면 다음 사람이 방장).
alter table public.pvp_room_members add column if not exists seen_at timestamptz not null default now();

create or replace function public.pvp_room_tidy() returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  update public.pvp_rooms set status = 'closed' where status = 'waiting' and created_at < now() - interval '30 minutes';
  update public.pvp_rooms set status = 'closed' where status = 'playing' and started_at < now() - interval '60 minutes';
  for s in select m.user_id, m.room_id from public.pvp_room_members m join public.pvp_rooms r on r.id = m.room_id
           where r.status = 'waiting' and m.seen_at < now() - interval '45 seconds' loop
    perform public.pvp_room_exit(s.user_id, s.room_id);
  end loop;
  update public.pvp_rooms r set status = 'closed' where status = 'waiting' and not exists (select 1 from public.pvp_room_members m where m.room_id = r.id);
end $$;

create or replace function public.pvp_room_ping(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.pvp_room_members set seen_at = now() where room_id = p_id and user_id = auth.uid();
  perform public.pvp_room_tidy();
end $$;

revoke all on function public.pvp_room_tidy() from public, anon, authenticated;
revoke all on function public.pvp_room_ping(uuid) from public, anon;
grant execute on function public.pvp_room_ping(uuid) to authenticated;
