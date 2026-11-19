-- 게임 공통 채팅: 전체(lobby), 게임 로비(g:<게임>), 멀티플레이 방(r:<방 id>), 무작위 1대1(m:<매치 id>).
-- 글은 pvp_chat_send 로만 쓰고(정리·욕설 가리기·도배 제한·참여 확인을 서버에서), 받는 쪽은 Realtime(postgres_changes)으로 받습니다.
-- 전체·게임 로비는 로그인하지 않아도 읽을 수 있고, 방·매치 대화는 그 방 사람만 읽고 씁니다.
-- 규칙과 단어 목록은 src/net/chat.ts 와 같습니다(tests/net/chat.test.ts 가 확인).

create table public.pvp_chat_messages (
  id bigint generated always as identity primary key,
  channel text not null check (channel ~ '^(lobby|g:(city|race|rts|shooter|outlaw)|[rm]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  user_id uuid not null references public.pvp_profiles (id) on delete cascade,
  nickname text not null,
  body text not null check (char_length(body) between 1 and 140),
  created_at timestamptz not null default now()
);
create index pvp_chat_messages_channel on public.pvp_chat_messages (channel, id desc);
create index pvp_chat_messages_user on public.pvp_chat_messages (user_id, id desc);
create index pvp_chat_messages_created on public.pvp_chat_messages (created_at);

-- 도배·신고로 잠시 채팅이 막힌 사람
create table public.pvp_chat_mutes (
  user_id uuid primary key references public.pvp_profiles (id) on delete cascade,
  until timestamptz not null,
  reason text not null
);
create table public.pvp_chat_reports (
  message_id bigint not null references public.pvp_chat_messages (id) on delete cascade,
  reporter uuid not null references public.pvp_profiles (id) on delete cascade,
  target uuid not null references public.pvp_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, reporter)
);
create index pvp_chat_reports_target on public.pvp_chat_reports (target, created_at);
create index pvp_chat_reports_reporter on public.pvp_chat_reports (reporter);

alter table public.pvp_chat_messages enable row level security;
alter table public.pvp_chat_mutes enable row level security;
alter table public.pvp_chat_reports enable row level security;

-- 방·매치 대화를 읽을 수 있는지(그 방 참가자 또는 매치의 두 사람)
create function public.pvp_chat_can_read(p_channel text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); target uuid;
begin
  if p_channel = 'lobby' or p_channel like 'g:%' then return true; end if;
  if me is null or p_channel !~ '^[rm]:[0-9a-f-]{36}$' then return false; end if;
  target := substr(p_channel, 3)::uuid;
  if left(p_channel, 1) = 'r' then
    return exists (select 1 from public.pvp_room_members where room_id = target and user_id = me);
  end if;
  return exists (select 1 from public.pvp_matches where id = target and (host_id = me or guest_id = me));
end $$;
revoke all on function public.pvp_chat_can_read(text) from public;
grant execute on function public.pvp_chat_can_read(text) to anon, authenticated;

create policy pvp_chat_read_public on public.pvp_chat_messages for select to anon, authenticated using (channel = 'lobby' or channel like 'g:%');
create policy pvp_chat_read_room on public.pvp_chat_messages for select to authenticated using (channel ~ '^[rm]:' and public.pvp_chat_can_read(channel));
-- 직접 쓰기 정책은 없습니다(pvp_chat_send 만).

-- 가릴 말(src/net/chat.ts 의 CHAT_BANNED 와 같은 순서·내용). 글자 사이의 공백·숫자·기호도 잡습니다.
create function public.pvp_chat_mask(p_body text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(p_body, (
    select string_agg(array_to_string(regexp_split_to_array(w, ''), '[[:space:]0-9._*~!@#$%^&+=/|\\-]*'), '|')
    from unnest(array[
      '씨발', '씨바', '씨팔', 'ㅆㅂ', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '존나', 'ㅈㄴ', '개새끼', '개새', '지랄', 'ㅈㄹ', '미친놈', '미친년', '엠창', '느금마', '니애미', '니미럴',
      'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'nigger', 'nigga', 'faggot'
    ]) as w
  ), '***', 'gi')
$$;

-- 공백·제어 문자 정리, 같은 글자 8번 넘게 반복 줄이기, 140자 자르기, 욕설 가리기
create function public.pvp_chat_clean(p_body text) returns text language sql immutable set search_path = '' as $$
  select public.pvp_chat_mask(left(
    regexp_replace(btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]​-‏ -‮⁠-⁯﻿]', ' ', 'g'), '[[:space:]]+', ' ', 'g')),
      '(.)\1{8,}', '\1\1\1\1\1\1\1\1', 'g'), 140))
$$;

create function public.pvp_chat_send(p_channel text, p_body text) returns public.pvp_chat_messages language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); nick text; body text; muted timestamptz; last_at timestamptz; recent int; r public.pvp_chat_messages;
begin
  if me is null then raise exception 'login_required'; end if;
  if p_channel is null or p_channel !~ '^(lobby|g:(city|race|rts|shooter|outlaw)|[rm]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' then raise exception 'chat_denied'; end if;
  if not public.pvp_chat_can_read(p_channel) then raise exception 'chat_denied'; end if;
  body := public.pvp_chat_clean(p_body);
  if body = '' then raise exception 'chat_empty'; end if;
  select nickname into nick from public.pvp_profiles where id = me;
  if nick is null then raise exception 'login_required'; end if;
  -- 한 사람의 전송은 차례로 처리합니다(동시에 여러 개를 보내 도배 제한을 피하지 못하게).
  perform pg_advisory_xact_lock(hashtext('pvp_chat:' || me::text));

  select until into muted from public.pvp_chat_mutes where user_id = me;
  if muted is not null and muted > now() then raise exception 'chat_muted'; end if;
  select max(created_at) into last_at from public.pvp_chat_messages where user_id = me;
  if last_at is not null and now() - last_at < interval '700 milliseconds' then raise exception 'chat_slow'; end if;
  if exists (select 1 from (select m.body as b, m.created_at as at from public.pvp_chat_messages m where m.user_id = me order by m.id desc limit 3) x
             where x.b = body and now() - x.at < interval '30 seconds') then raise exception 'chat_repeat'; end if;
  select count(*) into recent from public.pvp_chat_messages where user_id = me and created_at > now() - interval '15 seconds';
  if recent >= 6 then
    insert into public.pvp_chat_mutes (user_id, until, reason) values (me, now() + interval '60 seconds', 'flood')
      on conflict (user_id) do update set until = excluded.until, reason = excluded.reason;
    return null;  -- 예외를 던지면 제한 기록도 취소되므로 null 을 돌려주고, 클라이언트가 이를 'chat_muted' 로 보여 줍니다.
  end if;

  insert into public.pvp_chat_messages (channel, user_id, nickname, body) values (p_channel, me, nick, body) returning * into r;
  -- 사흘 지난 글은 가끔 정리합니다.
  if random() < 0.02 then delete from public.pvp_chat_messages where created_at < now() - interval '3 days'; end if;
  return r;
end $$;
revoke all on function public.pvp_chat_send(text, text) from public, anon;
grant execute on function public.pvp_chat_send(text, text) to authenticated;

-- 신고: 같은 사람을 30분 안에 서로 다른 3명이 신고하면 10분 동안 채팅을 막습니다. 자기 글은 신고할 수 없습니다.
create function public.pvp_chat_report(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); m public.pvp_chat_messages; n int;
begin
  if me is null then raise exception 'login_required'; end if;
  select * into m from public.pvp_chat_messages where id = p_id;
  if m.id is null or not public.pvp_chat_can_read(m.channel) then raise exception 'chat_denied'; end if;
  if m.user_id = me then raise exception 'chat_own'; end if;
  insert into public.pvp_chat_reports (message_id, reporter, target) values (m.id, me, m.user_id) on conflict do nothing;
  select count(distinct reporter) into n from public.pvp_chat_reports where target = m.user_id and created_at > now() - interval '30 minutes';
  if n >= 3 then
    insert into public.pvp_chat_mutes (user_id, until, reason) values (m.user_id, now() + interval '10 minutes', 'reports')
      on conflict (user_id) do update set until = greatest(public.pvp_chat_mutes.until, excluded.until), reason = excluded.reason;
  end if;
end $$;
revoke all on function public.pvp_chat_report(bigint) from public, anon;
grant execute on function public.pvp_chat_report(bigint) to authenticated;

revoke all on function public.pvp_chat_mask(text) from public, anon, authenticated;
revoke all on function public.pvp_chat_clean(text) from public, anon, authenticated;

-- 새 글을 Realtime 으로 받습니다(읽기 정책을 통과한 사람에게만 전달됩니다).
alter publication supabase_realtime add table public.pvp_chat_messages;
