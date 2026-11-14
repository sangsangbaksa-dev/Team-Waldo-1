// 개발·테스트 전용 로컬 백엔드(`?pvp=local`). 같은 브라우저의 탭끼리 localStorage/BroadcastChannel 로 매칭·동기화해서
// 네트워크 없이 두 탭으로 대전 흐름을 확인할 수 있습니다. 배포 빌드에는 포함되지 않습니다.
import type { Account, Backend, Channel, GameKind, MatchRow, NetMsg, RankRow, Rating } from './types';

interface Db { users: Record<string, { id: string; email: string; password: string; nickname: string }>; matches: Record<string, MatchRow & { claims: Record<string, string>; claimAt: Record<string, number>; created: number }>; ratings: Record<string, Rating & { user: string; game: GameKind }> }
const KEY = 'waldo.local.pvp', ME = 'waldo.local.pvp.me';
const load = (): Db => { try { return JSON.parse(localStorage.getItem(KEY) ?? '') as Db; } catch { return { users: {}, matches: {}, ratings: {} }; } };
const save = (d: Db): void => localStorage.setItem(KEY, JSON.stringify(d));
const uid = (): string => crypto.randomUUID();

export function createLocalBackend(): Backend {
  const me = (): Account | null => { const id = sessionStorage.getItem(ME), u = id ? load().users[id] : undefined; return u ? { id: u.id, email: u.email, nickname: u.nickname } : null; };
  const need = (): Account => { const a = me(); if (!a) throw new Error('login_required'); return a; };
  const rate = (d: Db, user: string, game: GameKind) => (d.ratings[`${user}:${game}`] ??= { user, game, rating: 1000, wins: 0, losses: 0 });
  function finalize(d: Db, m: Db['matches'][string], winner: string): void {
    const loser = winner === m.host_id ? m.guest_id! : m.host_id, w = rate(d, winner, m.game), l = rate(d, loser, m.game);
    const delta = Math.max(1, Math.round(32 * (1 - 1 / (1 + 10 ** ((l.rating - w.rating) / 400)))));
    w.rating += delta; w.wins++; l.rating = Math.max(100, l.rating - delta); l.losses++;
    m.status = 'finished'; m.winner_id = winner; m.host_delta = winner === m.host_id ? delta : -delta; m.guest_delta = winner === m.guest_id ? delta : -delta;
  }
  const pub = (m: Db['matches'][string]): MatchRow => { const { claims: _c, claimAt: _a, created: _t, ...row } = m; void _c; void _a; void _t; return row; };
  function join(d: Db, m: Db['matches'][string], who: string): MatchRow { m.guest_id = who; m.status = 'playing'; save(d); return pub(m); }
  const room = (game: GameKind, config: Record<string, unknown>, code: string | null): MatchRow => {
    const a = need(), d = load();
    for (const m of Object.values(d.matches)) if (m.status === 'waiting' && m.host_id === a.id) m.status = 'cancelled';
    const m = { id: uid(), game, code, host_id: a.id, guest_id: null, status: 'waiting' as const, config, winner_id: null, host_delta: null, guest_delta: null, claims: {}, claimAt: {}, created: Date.now() };
    d.matches[m.id] = m; save(d); return pub(m);
  };

  return {
    kind: 'local',
    async account() { return me(); },
    async signUp(email, password, nickname) {
      const d = load(); if (Object.values(d.users).some(u => u.email === email)) throw new Error('already registered');
      if (Object.values(d.users).some(u => u.nickname.toLowerCase() === nickname.toLowerCase())) throw new Error('nickname_taken');
      const id = uid(); d.users[id] = { id, email, password, nickname }; save(d); sessionStorage.setItem(ME, id); return { id, email, nickname };
    },
    async signIn(email, password) {
      const u = Object.values(load().users).find(x => x.email === email && x.password === password); if (!u) throw new Error('Invalid login credentials');
      sessionStorage.setItem(ME, u.id); return { id: u.id, email: u.email, nickname: u.nickname };
    },
    async signOut() { sessionStorage.removeItem(ME); },
    async setNickname(nickname) { const a = need(), d = load(); d.users[a.id].nickname = nickname; save(d); return { ...a, nickname }; },
    async quickMatch(game, config) {
      const a = need(), d = load(), open = Object.values(d.matches).find(m => m.status === 'waiting' && !m.code && m.game === game && m.host_id !== a.id && Date.now() - m.created < 120000);
      return open ? join(d, open, a.id) : room(game, config, null);
    },
    async createRoom(game, config) { return room(game, config, Math.random().toString(36).slice(2, 7).toUpperCase()); },
    async joinRoom(code) {
      const a = need(), d = load(), m = Object.values(d.matches).find(x => x.code === code.trim().toUpperCase() && x.status === 'waiting');
      if (!m) throw new Error('room_not_found'); if (m.host_id === a.id) throw new Error('own_room'); return join(d, m, a.id);
    },
    async cancelMatch(id) { const d = load(), m = d.matches[id]; if (m && m.status === 'waiting') { m.status = 'cancelled'; save(d); } },
    async getMatch(id) { const m = load().matches[id]; if (!m) throw new Error('not found'); return pub(m); },
    async report(id, winner) {
      const a = need(), d = load(), m = d.matches[id]; if (!m || m.status !== 'playing') return pub(m);
      m.claims[a.id] = winner; m.claimAt[a.id] = Date.now();
      if (winner !== a.id) finalize(d, m, winner);
      else if (m.claims[m.host_id] && m.guest_id && m.claims[m.guest_id]) { if (m.claims[m.host_id] === m.claims[m.guest_id]) finalize(d, m, winner); else m.status = 'void'; }
      save(d); return pub(m);
    },
    async settle(id) {
      const d = load(), m = d.matches[id], claimers = Object.keys(m.claims);
      if (m.status === 'playing' && claimers.length === 1 && Date.now() - m.claimAt[claimers[0]] > 15000) { finalize(d, m, m.claims[claimers[0]]); save(d); }
      return pub(m);
    },
    async leaderboard(game: GameKind, limit): Promise<RankRow[]> {
      const d = load();
      return Object.values(d.ratings).filter(r => r.game === game && r.wins + r.losses > 0).sort((x, y) => y.rating - x.rating).slice(0, limit)
        .map((r, i) => ({ rank: i + 1, user_id: r.user, nickname: d.users[r.user]?.nickname ?? '?', rating: r.rating, wins: r.wins, losses: r.losses }));
    },
    async rating(game): Promise<Rating | null> { const a = me(); if (!a) return null; const r = load().ratings[`${a.id}:${game}`]; return r ?? { rating: 1000, wins: 0, losses: 0 }; },
    async nickname(userId) { return load().users[userId]?.nickname ?? '상대'; },
    open(matchId, onMessage): Channel {
      const bc = new BroadcastChannel(`waldo-pvp-${matchId}`); bc.onmessage = e => onMessage(e.data as NetMsg);
      return { ready: Promise.resolve(), send: msg => bc.postMessage(msg), close: () => bc.close() };
    },
  };
}
