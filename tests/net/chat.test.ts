// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CHAT_BANNED, CHAT_KEY_RE, CHAT_MAX, CHAT_REPORT, CHAT_RULES, cleanChat, isChatKey, judgeChat, maskChat, mergeChat, normalizeChat, readBlocked, setBlocked, type ChatMessage } from '../../src/net/chat';
import { createLocalBackend } from '../../src/net/local';
import { errText } from '../../src/net/types';

const SQL = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261119000000_pvp_chat.sql'), 'utf8');

describe('채팅 글 정리', () => {
  it('공백·제어 문자를 정리하고 길이를 자른다', () => {
    expect(normalizeChat('  안녕\t\n  하세요  ')).toBe('안녕 하세요');
    expect(normalizeChat('a​b\u0007c')).toBe('a b c');
    expect(normalizeChat('   ')).toBe('');
    expect([...normalizeChat('가'.repeat(5) + '나다'.repeat(200))].length).toBe(CHAT_MAX);
    expect(normalizeChat('ㅋ'.repeat(30))).toBe('ㅋ'.repeat(8));
    expect(normalizeChat('😀'.repeat(20))).toBe('😀'.repeat(8));
  });

  it('욕설을 가리고, 글자 사이에 끼운 기호·숫자도 잡는다', () => {
    expect(maskChat('씨발 뭐야')).toBe('*** 뭐야');
    expect(maskChat('씨 1 발')).toBe('***');
    expect(maskChat('F.U.C.K you')).toBe('*** you');
    expect(maskChat('ShIt')).toBe('***');
    expect(cleanChat('  병신  같은  ')).toBe('*** 같은');
  });

  it('평범한 낱말 안의 비슷한 글자는 그대로 둔다', () => {
    for (const ok of ['시발점에서 출발', '새끼 고양이', '미친 플레이였다', 'class assignment', 'Shiitake 버섯']) expect(maskChat(ok)).toBe(ok);
  });
});

describe('도배 판정', () => {
  const at = (s: number) => ({ body: `m${s}`, at: s * 1000 });
  it('빈 글·제한 중·너무 빠름·반복·15초 한도', () => {
    expect(judgeChat('', [], 0)).toBe('chat_empty');
    expect(judgeChat('안녕', [], 1000, 5000)).toBe('chat_muted');
    expect(judgeChat('안녕', [{ body: 'x', at: 1000 }], 1500)).toBe('chat_slow');
    expect(judgeChat('같은 말', [{ body: '같은 말', at: 0 }], 5000)).toBe('chat_repeat');
    expect(judgeChat('같은 말', [{ body: '같은 말', at: 0 }], CHAT_RULES.repeatMs + 1)).toBeNull();
    expect(judgeChat('새 말', [1, 2, 3, 4, 5, 6].map(at), 7000)).toBe('mute');
    expect(judgeChat('새 말', [1, 2, 3, 4, 5].map(at), 7000)).toBeNull();
    expect(judgeChat('새 말', [1, 2, 3, 4, 5, 6].map(at), 6000 + CHAT_RULES.windowMs)).toBeNull();
  });
});

describe('서버(마이그레이션)와 같은 규칙', () => {
  it('가릴 말 목록이 같다', () => {
    const arr = /unnest\(array\[([\s\S]*?)\]\)/.exec(SQL)?.[1] ?? '';
    expect([...arr.matchAll(/'([^']+)'/g)].map(m => m[1])).toEqual([...CHAT_BANNED]);
  });
  it('대화방 이름 규칙과 숫자들이 같다', () => {
    expect(SQL).toContain(`channel ~ '${CHAT_KEY_RE.source}'`);
    expect(SQL).toContain(`p_channel !~ '${CHAT_KEY_RE.source}'`);
    expect(SQL).toContain(`char_length(body) between 1 and ${CHAT_MAX}`);
    expect(SQL).toContain(`interval '${CHAT_RULES.gapMs} milliseconds'`);
    expect(SQL).toContain(`interval '${CHAT_RULES.windowMs / 1000} seconds'`);
    expect(SQL).toContain(`if recent >= ${CHAT_RULES.windowMax} then`);
    expect(SQL).toContain(`now() + interval '${CHAT_RULES.muteMs / 1000} seconds'`);
    expect(SQL).toContain(`now() - x.at < interval '${CHAT_RULES.repeatMs / 1000} seconds'`);
    expect(SQL).toContain(`if n >= ${CHAT_REPORT.reporters} then`);
    expect(SQL).toContain(`interval '${CHAT_REPORT.windowMin} minutes'`);
    expect(SQL).toContain(`now() + interval '${CHAT_REPORT.muteMin} minutes'`);
    expect(SQL).toContain(`'(.)\\1{8,}'`);
  });
  it('직접 쓰기 정책이 없고 Realtime 에 등록한다', () => {
    expect(SQL).not.toMatch(/for (insert|update|delete|all)/i);
    expect(SQL).toMatch(/alter publication supabase_realtime add table public\.pvp_chat_messages/);
  });
  it('대화방 이름', () => {
    expect(isChatKey('lobby')).toBe(true); expect(isChatKey('g:race')).toBe(true); expect(isChatKey('g:kingdoms')).toBe(false);
    expect(isChatKey('r:0b6f7c3e-1d2a-4c5b-9e8f-112233445566')).toBe(true); expect(isChatKey('r:abc')).toBe(false); expect(isChatKey("lobby' or 1=1")).toBe(false);
  });
});

describe('차단 목록과 글 합치기', () => {
  beforeEach(() => localStorage.clear());
  it('이 기기에 저장하고 풀 수 있다', () => {
    setBlocked('u2', 'Beta'); expect(readBlocked()).toEqual({ u2: 'Beta' });
    setBlocked('u2', null); expect(readBlocked()).toEqual({});
    localStorage.setItem('waldo.chat.blocked', '[1,2'); expect(readBlocked()).toEqual({});
  });
  it('id 순으로 겹치지 않게 합친다', () => {
    const m = (id: number): ChatMessage => ({ id, channel: 'lobby', user_id: 'u', nickname: 'n', body: `${id}`, created_at: '' });
    expect(mergeChat([m(1), m(3)], [m(2), m(3), m(4)]).map(x => x.id)).toEqual([1, 2, 3, 4]);
    expect(mergeChat([], [m(1), m(2), m(3)], 2).map(x => x.id)).toEqual([2, 3]);
  });
});

/** 탭 두 개처럼 쓰려고 sessionStorage 를 백엔드마다 따로 둡니다(local-backend.test.ts 와 같은 방법). */
function tab() {
  const backend = createLocalBackend(), me: { v: string | null } = { v: null };
  return { backend, async as<T>(fn: () => Promise<T>): Promise<T> { if (me.v) sessionStorage.setItem('waldo.local.pvp.me', me.v); else sessionStorage.removeItem('waldo.local.pvp.me'); try { return await fn(); } finally { me.v = sessionStorage.getItem('waldo.local.pvp.me'); } } };
}

describe('로컬 백엔드 채팅', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('전체 채팅: 정리된 글을 저장하고 기록을 돌려준다, 로그인 없이는 보낼 수 없다', async () => {
    const a = tab(), guest = tab();
    await a.as(() => a.backend.signUp('a@x.dev', 'secret1', 'Alpha'));
    const m = await a.as(() => a.backend.chatSend('lobby', '  안녕   씨발  '));
    expect(m).toMatchObject({ channel: 'lobby', nickname: 'Alpha', body: '안녕 ***' });
    expect((await guest.as(() => guest.backend.chatHistory('lobby', 50))).map(x => x.body)).toEqual(['안녕 ***']);
    await expect(guest.as(() => guest.backend.chatSend('lobby', 'hi'))).rejects.toThrow(/login_required/);
    await expect(a.as(() => a.backend.chatSend('lobby', '   '))).rejects.toThrow(/chat_empty/);
    await expect(a.as(() => a.backend.chatSend('lobby', '두 번째'))).rejects.toThrow(/chat_slow/);
    expect(errText(new Error('chat_slow'))).toMatch(/천천히/);
  });

  it('방 대화는 그 방 사람만 읽고 쓴다', async () => {
    const a = tab(), b = tab();
    await a.as(() => a.backend.signUp('a@x.dev', 'secret1', 'Alpha')); await b.as(() => b.backend.signUp('b@x.dev', 'secret1', 'Beta'));
    const room = await a.as(() => a.backend.roomCreate('race', 4, true, {}));
    const key = `r:${room.id}` as const;
    await a.as(() => a.backend.chatSend(key, '방 대화'));
    expect(await b.as(() => b.backend.chatHistory(key, 50))).toEqual([]);
    await expect(b.as(() => b.backend.chatSend(key, '몰래'))).rejects.toThrow(/chat_denied/);
    await b.as(() => b.backend.roomJoin(room.code));
    expect((await b.as(() => b.backend.chatHistory(key, 50))).map(x => x.body)).toEqual(['방 대화']);
  });

  it('15초에 6개를 넘기면 1분 동안 막힌다', async () => {
    const a = tab(); await a.as(() => a.backend.signUp('a@x.dev', 'secret1', 'Alpha'));
    const t0 = Date.now(); let t = t0; const real = Date.now; Date.now = () => t;
    try {
      for (let i = 0; i < CHAT_RULES.windowMax; i++) { t += 1000; await a.as(() => a.backend.chatSend('lobby', `글 ${i}`)); }
      t += 1000; await expect(a.as(() => a.backend.chatSend('lobby', '하나 더'))).rejects.toThrow(/chat_muted/);
      t += 30000; await expect(a.as(() => a.backend.chatSend('lobby', '아직'))).rejects.toThrow(/chat_muted/);
      t += 31000; await expect(a.as(() => a.backend.chatSend('lobby', '이제 됨'))).resolves.toMatchObject({ body: '이제 됨' });
    } finally { Date.now = real; }
  });

  it('서로 다른 3명이 신고하면 10분 동안 막힌다, 내 글은 신고할 수 없다', async () => {
    const [a, b, c, d] = [tab(), tab(), tab(), tab()];
    for (const [t, n] of [[a, 'Alpha'], [b, 'Beta'], [c, 'Gamma'], [d, 'Delta']] as const) await t.as(() => t.backend.signUp(`${n}@x.dev`, 'secret1', n));
    const m = await a.as(() => a.backend.chatSend('lobby', '나쁜 말'));
    await expect(a.as(() => a.backend.chatReport(m.id))).rejects.toThrow(/chat_own/);
    await b.as(() => b.backend.chatReport(m.id)); await b.as(() => b.backend.chatReport(m.id)); await c.as(() => c.backend.chatReport(m.id));
    const real = Date.now; Date.now = () => real() + 5000;
    try {
      await expect(a.as(() => a.backend.chatSend('lobby', '두 명 신고는 아직 괜찮음'))).resolves.toBeTruthy();
      await d.as(() => d.backend.chatReport(m.id));
      Date.now = () => real() + 9000;
      await expect(a.as(() => a.backend.chatSend('lobby', '세 명이면 막힘'))).rejects.toThrow(/chat_muted/);
    } finally { Date.now = real; }
  });

  it('새 글을 실시간으로 받는다', async () => {
    const a = tab(), got: string[] = [];
    await a.as(() => a.backend.signUp('a@x.dev', 'secret1', 'Alpha'));
    const w = a.backend.chatWatch('g:city', m => got.push(m.body)), other = a.backend.chatWatch('lobby', m => got.push(`lobby:${m.body}`));
    await w.ready; await a.as(() => a.backend.chatSend('g:city', '도시 로비'));
    await new Promise(r => setTimeout(r, 30));
    expect(got).toEqual(['도시 로비']); w.close(); other.close();
  });
});
