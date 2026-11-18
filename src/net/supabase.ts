// Supabase 백엔드: 계정(Auth), 매칭·전적(RPC), 실시간 동기화(Realtime Broadcast).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';
import type { Account, Backend, Channel, GameKind, MatchRow, NetMsg, RankRow, Rating, RoomInfo, RoomListItem, RoomRow } from './types';

/** 확인 메일의 링크가 돌아올 주소: 지금 접속한 사이트의 이 페이지(배포 주소마다 달라서 고정하지 않습니다). Supabase 의 Redirect URLs 에 등록된 주소여야 합니다. */
const homeUrl = (): string => location.origin + location.pathname.replace(/index\.html$/, '');

export function createSupabaseBackend(): Backend {
  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'waldo.pvp.auth' },
    realtime: { params: { eventsPerSecond: 30 } },
  });
  const ok = <T>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T; };

  async function accountOf(id: string, email: string): Promise<Account> {
    const { data } = await sb.from('pvp_profiles').select('nickname').eq('id', id).maybeSingle();
    return { id, email, nickname: (data as { nickname: string } | null)?.nickname ?? '플레이어' };
  }
  const rpc = async <T>(fn: string, args: Record<string, unknown> = {}): Promise<T> => ok(await sb.rpc(fn, args)) as T;

  return {
    kind: 'supabase',
    async account() {
      const { data } = await sb.auth.getSession(); const u = data.session?.user;
      return u ? accountOf(u.id, u.email ?? '') : null;
    },
    async signUp(email, password, nickname) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nickname }, emailRedirectTo: homeUrl() } });
      if (error) throw error;
      if (!data.session || !data.user) return 'confirm';
      return accountOf(data.user.id, email);
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return accountOf(data.user.id, data.user.email ?? email);
    },
    async resendConfirmation(email) { const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: homeUrl() } }); if (error) throw error; },
    async signOut() { await sb.auth.signOut(); },
    async setNickname(nickname) {
      await rpc('pvp_set_nickname', { p_nickname: nickname });
      const a = await this.account(); if (!a) throw new Error('login_required'); return a;
    },
    quickMatch: (game, config) => rpc<MatchRow>('pvp_quick_match', { p_game: game, p_config: config }),
    createRoom: (game, config) => rpc<MatchRow>('pvp_create_room', { p_game: game, p_config: config }),
    joinRoom: code => rpc<MatchRow>('pvp_join_room', { p_code: code }),
    async cancelMatch(id) { await rpc('pvp_cancel_match', { p_id: id }); },
    async getMatch(id) { return ok(await sb.from('pvp_matches').select('*').eq('id', id).single()) as MatchRow; },
    report: (id, winner) => rpc<MatchRow>('pvp_report_result', { p_id: id, p_winner: winner }),
    settle: id => rpc<MatchRow>('pvp_settle', { p_id: id }),
    async leaderboard(game: GameKind, limit) { return await rpc<RankRow[]>('pvp_leaderboard', { p_game: game, p_limit: limit }); },
    async rating(game: GameKind): Promise<Rating | null> {
      const { data: s } = await sb.auth.getSession(); const id = s.session?.user.id; if (!id) return null;
      const { data } = await sb.from('pvp_ratings').select('rating,wins,losses').eq('user_id', id).eq('game', game).maybeSingle();
      return (data as Rating | null) ?? { rating: 1000, wins: 0, losses: 0 };
    },
    async nickname(userId) { const { data } = await sb.from('pvp_profiles').select('nickname').eq('id', userId).maybeSingle(); return (data as { nickname: string } | null)?.nickname ?? '상대'; },
    roomCreate: (game, max, isPublic, config) => rpc<RoomRow>('pvp_room_create', { p_game: game, p_max: max, p_public: isPublic, p_config: config }),
    roomJoin: code => rpc<RoomRow>('pvp_room_join', { p_code: code }),
    async roomLeave(id) { await rpc('pvp_room_leave', { p_id: id }); },
    async roomReady(id, ready) { await rpc('pvp_room_ready', { p_id: id, p_ready: ready }); },
    async roomPing(id) { await rpc('pvp_room_ping', { p_id: id }); },
    roomStart: id => rpc<RoomRow>('pvp_room_start', { p_id: id }),
    async roomState(id): Promise<RoomInfo> {
      const room = ok(await sb.from('pvp_rooms').select('*').eq('id', id).single()) as RoomRow;
      const rows = ok(await sb.from('pvp_room_members').select('user_id,ready,joined_at,pvp_profiles(nickname)').eq('room_id', id).order('joined_at').order('user_id')) as unknown as Array<{ user_id: string; ready: boolean; pvp_profiles: { nickname: string } | null }>;
      return { room, members: rows.map(r => ({ user_id: r.user_id, ready: r.ready, nickname: r.pvp_profiles?.nickname ?? '플레이어' })) };
    },
    async roomList(game): Promise<RoomListItem[]> {
      const rows = ok(await sb.from('pvp_rooms').select('*,pvp_room_members(user_id),pvp_profiles(nickname)').eq('game', game).eq('status', 'waiting').eq('is_public', true).order('created_at', { ascending: false }).limit(20)) as unknown as Array<RoomRow & { pvp_room_members: unknown[]; pvp_profiles: { nickname: string } | null }>;
      return rows.map(({ pvp_room_members, pvp_profiles, ...room }) => ({ room, host: pvp_profiles?.nickname ?? '플레이어', count: pvp_room_members.length }));
    },
    open(matchId, onMessage): Channel {
      const ch = sb.channel(`pvp:${matchId}`, { config: { broadcast: { self: false, ack: false } } });
      const ready = new Promise<void>((resolve, reject) => {
        ch.on('broadcast', { event: 'm' }, ({ payload }: { payload: unknown }) => { if (payload && typeof payload === 'object') onMessage(payload as NetMsg); })
          .subscribe((status: string) => { if (status === 'SUBSCRIBED') resolve(); else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('network')); });
      });
      ready.catch(() => { /* 호출한 쪽에서 처리합니다. */ });
      return { ready, send: msg => { void ch.send({ type: 'broadcast', event: 'm', payload: msg }); }, close: () => { void sb.removeChannel(ch); } };
    },
  };
}
