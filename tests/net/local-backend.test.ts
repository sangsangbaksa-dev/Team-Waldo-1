// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalBackend } from '../../src/net/local';
import { errText } from '../../src/net/types';

/** 탭 두 개처럼 쓰려고 sessionStorage 를 백엔드마다 따로 둡니다. */
function tab() {
  const backend = createLocalBackend(), me: { v: string | null } = { v: null };
  return { backend, async as<T>(fn: () => Promise<T>): Promise<T> { if (me.v) sessionStorage.setItem('waldo.local.pvp.me', me.v); else sessionStorage.removeItem('waldo.local.pvp.me'); const r = await fn(); me.v = sessionStorage.getItem('waldo.local.pvp.me'); return r; } };
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('로컬 백엔드(두 탭 확인용)', () => {
  it('가입·로그인·중복 닉네임', async () => {
    const a = tab(), b = tab();
    const acc = await a.as(() => a.backend.signUp('a@x.dev', 'secret1', 'Alpha'));
    expect(acc).toMatchObject({ nickname: 'Alpha' });
    await expect(b.as(() => b.backend.signUp('b@x.dev', 'secret1', 'alpha'))).rejects.toThrow(/nickname_taken/);
    await expect(b.as(() => b.backend.signIn('a@x.dev', 'wrong'))).rejects.toThrow(/Invalid login/);
    expect(errText(new Error('Invalid login credentials'))).toMatch(/비밀번호/);
  });

  it('무작위 매칭 → 결과 보고 → 레이팅과 랭킹', async () => {
    const a = tab(), b = tab();
    const A = await a.as(() => a.backend.signUp('a@x.dev', 'secret1', 'Alpha')) as { id: string }, B = await b.as(() => b.backend.signUp('b@x.dev', 'secret1', 'Beta')) as { id: string };
    const wait = await a.as(() => a.backend.quickMatch('race', { map: 'sunset' }));
    expect(wait.status).toBe('waiting');
    const m = await b.as(() => b.backend.quickMatch('race', {}));
    expect(m).toMatchObject({ id: wait.id, status: 'playing', guest_id: B.id });
    // 승자가 먼저 보고하면 대기, 패자가 인정하면 확정
    expect((await a.as(() => a.backend.report(m.id, A.id))).status).toBe('playing');
    const done = await b.as(() => b.backend.report(m.id, A.id));
    expect(done).toMatchObject({ status: 'finished', winner_id: A.id, host_delta: 16, guest_delta: -16 });
    expect(await a.as(() => a.backend.rating('race'))).toMatchObject({ rating: 1016, wins: 1, losses: 0 });
    const board = await a.as(() => a.backend.leaderboard('race', 10));
    expect(board.map(r => [r.nickname, r.rating])).toEqual([['Alpha', 1016], ['Beta', 984]]);
    expect(await a.as(() => a.backend.leaderboard('city', 10))).toEqual([]);
  });

  it('방 코드로 입장하고, 보고가 서로 다르면 무효 처리한다', async () => {
    const a = tab(), b = tab();
    const A = await a.as(() => a.backend.signUp('a@x.dev', 'secret1', 'Alpha')) as { id: string }, B = await b.as(() => b.backend.signUp('b@x.dev', 'secret1', 'Beta')) as { id: string };
    const room = await a.as(() => a.backend.createRoom('city', {}));
    await expect(a.as(() => a.backend.joinRoom(room.code!))).rejects.toThrow(/own_room/);
    await expect(b.as(() => b.backend.joinRoom('ZZZZZ'))).rejects.toThrow(/room_not_found/);
    const m = await b.as(() => b.backend.joinRoom(room.code!.toLowerCase()));
    expect(m.status).toBe('playing');
    await a.as(() => a.backend.report(m.id, A.id));
    expect((await b.as(() => b.backend.report(m.id, B.id))).status).toBe('void');
    expect(await a.as(() => a.backend.rating('city'))).toMatchObject({ rating: 1000, wins: 0 });
  });

  it('같은 매치의 두 탭이 채널로 메시지를 주고받는다', async () => {
    const a = tab(), got: unknown[] = [];
    const ch1 = a.backend.open('m1', () => undefined), ch2 = a.backend.open('m1', m => got.push(m));
    await ch1.ready; ch1.send({ t: 'hello', car: 'arc' });
    await new Promise(r => setTimeout(r, 30));
    expect(got).toEqual([{ t: 'hello', car: 'arc' }]); ch1.close(); ch2.close();
  });
});
