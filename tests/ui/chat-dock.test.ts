// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../src/net/chat';
import type { ChatTab } from '../../src/net/chat-dock';
import type { Account, Backend } from '../../src/net/types';

const be = vi.hoisted(() => ({ backend: {} as Record<string, ReturnType<typeof vi.fn>>, me: null as Account | null, live: new Map<string, (m: ChatMessage) => void>() }));
vi.mock('../../src/net/backend', () => ({
  getBackend: async () => be.backend as unknown as Backend,
  currentAccount: async () => be.me,
  onAccount: () => () => undefined,
  setAccount: vi.fn(),
}));

let nextId = 10;
const msg = (o: Partial<ChatMessage>): ChatMessage => ({ id: ++nextId, channel: 'lobby', user_id: 'u2', nickname: 'Beta', body: '안녕', created_at: new Date().toISOString(), ...o });
beforeEach(() => {
  vi.resetModules(); document.body.innerHTML = ''; localStorage.clear(); be.live.clear();
  be.me = { id: 'u1', email: 'a@x.dev', nickname: 'Alpha' };
  be.backend = {
    chatHistory: vi.fn(async (k: string) => (k === 'lobby' ? [msg({ id: 1, body: '먼저 온 글' })] : [])),
    chatWatch: vi.fn((k: string, fn: (m: ChatMessage) => void) => { be.live.set(k, fn); return { ready: Promise.resolve(), close: vi.fn(() => be.live.delete(k)) }; }),
    chatSend: vi.fn(async (k: string, body: string) => msg({ channel: k, user_id: 'u1', nickname: 'Alpha', body })),
    chatReport: vi.fn(async () => undefined),
  };
});
afterEach(() => { document.body.innerHTML = ''; });

const settle = () => new Promise(r => setTimeout(r, 0));
const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
async function dock(mode: 'hub' | 'lobby' | 'game' = 'hub', tabs: ChatTab[] = [{ key: 'lobby', label: '전체' }]) {
  const mod = await import('../../src/net/chat-dock');
  const h = mod.openChat({ mode, tabs }); await settle(); await settle();
  return { ...h, mod };
}

describe('채팅 창', () => {
  it('접힌 버튼을 누르면 기록을 보여 주고, 보내면 목록에 붙는다', async () => {
    await dock();
    expect($('.chat-toggle')).not.toBeNull(); expect($('.chat-panel')).toBeNull();
    $<HTMLButtonElement>('.chat-toggle')!.click();
    expect($('.chat-list')?.textContent).toContain('먼저 온 글');
    const input = $<HTMLInputElement>('input[name="chat"]')!; input.value = '반가워요'; input.dispatchEvent(new Event('input', { bubbles: true }));
    $<HTMLFormElement>('.chat-form')!.requestSubmit(); await settle();
    expect(be.backend.chatSend).toHaveBeenCalledWith('lobby', '반가워요');
    expect($('.chat-list')?.textContent).toContain('반가워요');
    expect($<HTMLInputElement>('input[name="chat"]')!.value).toBe('');
  });

  it('빠른 채팅 버튼으로 바로 보낸다', async () => {
    await dock(); $<HTMLButtonElement>('.chat-toggle')!.click();
    $<HTMLButtonElement>('[data-chat="quick|GG"]')!.click(); await settle();
    expect(be.backend.chatSend).toHaveBeenCalledWith('lobby', 'GG');
  });

  it('로그인하지 않았으면 읽기만 하고 로그인 버튼을 보여 준다', async () => {
    be.me = null; await dock(); $<HTMLButtonElement>('.chat-toggle')!.click();
    expect($('.chat-list')?.textContent).toContain('먼저 온 글');
    expect($('input[name="chat"]')).toBeNull(); expect($('[data-chat="login"]')).not.toBeNull();
  });

  it('서버가 막으면 이유를 알려 준다', async () => {
    be.backend.chatSend = vi.fn(async () => { throw new Error('chat_slow'); });
    await dock(); $<HTMLButtonElement>('.chat-toggle')!.click();
    $<HTMLButtonElement>('[data-chat="quick|GG"]')!.click(); await settle();
    expect($('.chat-note')?.textContent).toMatch(/천천히/);
  });

  it('접혀 있을 때 새 글이 오면 잠깐 보여 주고 안 읽은 수를 단다', async () => {
    await dock();
    be.live.get('lobby')!(msg({ body: '새 소식' }));
    expect($('.chat-feed')?.textContent).toContain('새 소식');
    expect($('.chat-toggle .chat-badge')?.textContent).toBe('1');
    $<HTMLButtonElement>('.chat-toggle')!.click();
    expect($('.chat-toggle .chat-badge')).toBeNull();
  });

  it('차단하면 그 사람 글을 숨기고, 차단 목록에서 풀 수 있다', async () => {
    await dock(); $<HTMLButtonElement>('.chat-toggle')!.click();
    $<HTMLButtonElement>('.chat-who')!.click();
    $<HTMLButtonElement>('[data-chat^="block|"]')!.click();
    expect($('.chat-list')?.textContent).not.toContain('먼저 온 글');
    be.live.get('lobby')!(msg({ body: '차단된 사람의 새 글' }));
    expect(document.body.textContent).not.toContain('차단된 사람의 새 글');
    $<HTMLButtonElement>('[data-chat="blocked"]')!.click();
    $<HTMLButtonElement>('[data-chat="unblock|u2"]')!.click();
    expect($('.chat-list')?.textContent).toContain('먼저 온 글');
  });

  it('신고 버튼은 서버에 신고한다', async () => {
    await dock(); $<HTMLButtonElement>('.chat-toggle')!.click();
    $<HTMLButtonElement>('.chat-who')!.click(); $<HTMLButtonElement>('[data-chat^="report|"]')!.click(); await settle();
    expect(be.backend.chatReport).toHaveBeenCalledWith(1); expect($('.chat-note')?.textContent).toMatch(/신고했습니다/);
  });

  it('겹쳐 띄우면 마지막 것이 보이고, 치우면 앞의 것으로 돌아간다', async () => {
    const hub = await dock();
    const game = hub.mod.openChat({ mode: 'game', tabs: [{ key: 'r:0b6f7c3e-1d2a-4c5b-9e8f-112233445566', label: '방' }] }); await settle();
    expect($<HTMLElement>('.chat-dock')!.dataset.mode).toBe('game');
    expect(be.live.has('lobby')).toBe(false); expect(be.live.has('r:0b6f7c3e-1d2a-4c5b-9e8f-112233445566')).toBe(true);
    game.close(); expect($<HTMLElement>('.chat-dock')!.dataset.mode).toBe('hub'); expect(be.live.has('lobby')).toBe(true);
    hub.close(); expect($('.chat-dock')).toBeNull();
  });
});

describe('게임 중 채팅', () => {
  it('Enter 로 입력창을 열고, 입력하는 키는 게임으로 가지 않고, Esc 로 닫는다', async () => {
    const gameKeys: string[] = []; const onKey = (e: KeyboardEvent) => gameKeys.push(e.key); window.addEventListener('keydown', onKey);
    const blur = vi.fn(); window.addEventListener('blur', blur);
    try {
      await dock('game', [{ key: 'm:0b6f7c3e-1d2a-4c5b-9e8f-112233445566', label: 'Beta 님과 대화' }]);
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const input = $<HTMLInputElement>('input[name="chat"]')!; expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input); expect(blur).toHaveBeenCalled();
      expect(gameKeys).toEqual([]);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
      expect(gameKeys).toEqual([]);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect($('.chat-panel')).toBeNull();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
      expect(gameKeys).toEqual(['w']);
    } finally { window.removeEventListener('keydown', onKey); window.removeEventListener('blur', blur); }
  });

  it('보내고 나면 창을 접어 게임으로 돌아간다', async () => {
    await dock('game', [{ key: 'm:0b6f7c3e-1d2a-4c5b-9e8f-112233445566', label: '대화' }]);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const input = $<HTMLInputElement>('input[name="chat"]')!; input.value = 'gg'; input.dispatchEvent(new Event('input', { bubbles: true }));
    $<HTMLFormElement>('.chat-form')!.requestSubmit(); await settle();
    expect(be.backend.chatSend).toHaveBeenCalledWith('m:0b6f7c3e-1d2a-4c5b-9e8f-112233445566', 'gg');
    expect($('.chat-panel')).toBeNull(); expect($('.chat-feed')?.textContent).toContain('gg');
  });

  it('허브·로비에서는 Enter 를 가로채지 않는다', async () => {
    await dock('hub');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect($('.chat-panel')).toBeNull();
  });
});
