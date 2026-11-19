// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend, MatchRow, RoomInfo, RoomRow } from '../../src/net/types';

const row = (o: Partial<MatchRow>): MatchRow => ({ id: 'm1', game: 'city', code: null, host_id: 'u1', guest_id: null, status: 'waiting', config: {}, winner_id: null, host_delta: null, guest_delta: null, ...o });
const be = vi.hoisted(() => ({ backend: {} as Record<string, ReturnType<typeof vi.fn>> }));
vi.mock('../../src/net/backend', () => ({
  getBackend: async () => be.backend as unknown as Backend,
  currentAccount: async () => ({ id: 'u1', email: 'a@x.dev', nickname: 'Alpha' }),
  setAccount: vi.fn(),
  onAccount: () => () => undefined,
}));

const room: RoomRow = { id: 'r1', code: 'ABC23', game: 'city', host_id: 'u1', max_players: 2, is_public: true, status: 'waiting', config: {}, match_id: null };
let info: RoomInfo;
beforeEach(() => {
  vi.useFakeTimers(); document.body.innerHTML = '';
  info = { room, members: [{ user_id: 'u1', nickname: 'Alpha', ready: true }] };
  be.backend = {
    rating: vi.fn(async () => null), leaderboard: vi.fn(async () => []), cancelMatch: vi.fn(async () => undefined),
    quickMatch: vi.fn(async () => row({ id: 'm2' })), getMatch: vi.fn(async () => row({ id: 'm2' })), nickname: vi.fn(async () => '상대'),
    roomList: vi.fn(async () => []), roomCreate: vi.fn(async () => room), roomState: vi.fn(async () => info), roomStart: vi.fn(async () => ({ ...room, status: 'playing' as const })),
    roomLeave: vi.fn(async () => undefined), roomReady: vi.fn(async () => undefined), roomJoin: vi.fn(async () => room),
    chatHistory: vi.fn(async () => []), chatWatch: vi.fn(() => ({ ready: Promise.resolve(), close: vi.fn() })), chatSend: vi.fn(), chatReport: vi.fn(),
  };
});
afterEach(() => { vi.useRealTimers(); });

async function open(): Promise<void> {
  const { openLobby } = await import('../../src/net/lobby');
  openLobby({ game: 'city', onClose: () => undefined });
  await vi.advanceTimersByTimeAsync(10);
}
const click = (act: string): void => document.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)!.click();

describe('무작위 매칭 대기 화면', () => {
  it('찾는 중 문구와 남은 시간, 취소 버튼을 보여 주고 취소하면 매치를 닫는다', async () => {
    await open(); click('quick'); await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toMatch(/비슷한 상대를 찾는 중/); expect(document.body.textContent).toMatch(/2:00/);
    click('cancel'); await vi.advanceTimersByTimeAsync(10);
    expect(be.backend.cancelMatch).toHaveBeenCalledWith('m2');
    expect(document.querySelector('[data-act="quick"]')).not.toBeNull();
  });

  it('시간이 다 되면 대기를 취소하고 처음 화면으로 돌아온다', async () => {
    await open(); click('quick'); await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(121_000);
    expect(be.backend.cancelMatch).toHaveBeenCalledWith('m2');
    expect(document.body.textContent).toMatch(/상대가 나타나지 않아/);
    expect(document.querySelector('[data-act="newroom"]')).not.toBeNull();
  });
});

describe('방 화면', () => {
  it('방 코드와 참가자, 빈 자리를 보여 주고 상대가 준비하기 전에는 시작할 수 없다', async () => {
    await open(); click('newroom'); document.querySelector<HTMLFormElement>('form[data-form="create"]')!.requestSubmit(); await vi.advanceTimersByTimeAsync(1100);
    expect(document.querySelector('#pvp-code')?.textContent).toBe('ABC23');
    expect(document.querySelectorAll('.pvp-members li').length).toBe(2); expect(document.querySelector('.pvp-members li.empty')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>('[data-act="start"]')!.disabled).toBe(true);
    info = { room, members: [{ user_id: 'u1', nickname: 'Alpha', ready: true }, { user_id: 'u2', nickname: 'Beta', ready: true }] };
    await vi.advanceTimersByTimeAsync(1100);
    const start = document.querySelector<HTMLButtonElement>('[data-act="start"]')!; expect(start.disabled).toBe(false);
    start.click(); await vi.advanceTimersByTimeAsync(10);
    expect(be.backend.roomStart).toHaveBeenCalledWith('r1');
  });

  it('나가기를 누르면 방을 떠나고 처음 화면으로 돌아온다', async () => {
    await open(); click('newroom'); document.querySelector<HTMLFormElement>('form[data-form="create"]')!.requestSubmit(); await vi.advanceTimersByTimeAsync(1100);
    click('leave'); await vi.advanceTimersByTimeAsync(10);
    expect(be.backend.roomLeave).toHaveBeenCalledWith('r1'); expect(document.querySelector('[data-act="newroom"]')).not.toBeNull();
  });
});

describe('로비 채팅', () => {
  beforeEach(() => { vi.resetModules(); });
  it('게임 로비 → 방 → 게임 시작 → 채널을 닫으면 채팅도 닫힌다', async () => {
    const { openLobby } = await import('../../src/net/lobby');
    const dock = await import('../../src/net/chat-dock');
    let session: { open(h: () => void): { close(): void } } | null = null;
    be.backend.open = vi.fn(() => ({ ready: Promise.resolve(), send: vi.fn(), close: vi.fn() }));
    openLobby({ game: 'city', maxPlayers: 4, onRoom: s => { session = s; }, onClose: () => undefined });
    await vi.advanceTimersByTimeAsync(10);
    expect(dock.chatLayerForTest()?.tabs.map(t => t.key)).toEqual(['g:city', 'lobby']);
    click('newroom'); document.querySelector<HTMLFormElement>('form[data-form="create"]')!.requestSubmit(); await vi.advanceTimersByTimeAsync(1100);
    expect(dock.chatLayerForTest()?.tabs.map(t => t.key)).toEqual(['r:r1', 'g:city', 'lobby']);
    info = { room: { ...room, max_players: 4 }, members: [{ user_id: 'u1', nickname: 'Alpha', ready: true }, { user_id: 'u2', nickname: 'Beta', ready: true }, { user_id: 'u3', nickname: 'Gamma', ready: true }] };
    await vi.advanceTimersByTimeAsync(1100);
    info = { ...info, room: { ...info.room, status: 'playing' } };
    await vi.advanceTimersByTimeAsync(1100);
    expect(session).not.toBeNull(); expect(dock.chatLayerForTest()).toBeNull();
    const ch = session!.open(() => undefined);
    expect(dock.chatLayerForTest()).toMatchObject({ mode: 'game', tabs: [{ key: 'r:r1' }] });
    ch.close(); expect(dock.chatLayerForTest()).toBeNull();
  });
});

describe('자체 게임 채팅이 있는 게임', () => {
  beforeEach(() => { vi.resetModules(); });
  it('inGameChat: false 이면 게임 중 공통 채팅 창을 띄우지 않는다', async () => {
    const { openLobby } = await import('../../src/net/lobby');
    const dock = await import('../../src/net/chat-dock');
    let session: { open(h: () => void): { close(): void } } | null = null;
    be.backend.open = vi.fn(() => ({ ready: Promise.resolve(), send: vi.fn(), close: vi.fn() }));
    openLobby({ game: 'shooter', maxPlayers: 4, inGameChat: false, onRoom: s => { session = s; }, onClose: () => undefined });
    await vi.advanceTimersByTimeAsync(10);
    click('newroom'); document.querySelector<HTMLFormElement>('form[data-form="create"]')!.requestSubmit(); await vi.advanceTimersByTimeAsync(1100);
    expect(dock.chatLayerForTest()?.tabs[0]?.key).toBe('r:r1');
    info = { room: { ...room, max_players: 4, status: 'playing' }, members: [{ user_id: 'u1', nickname: 'Alpha', ready: true }, { user_id: 'u2', nickname: 'Beta', ready: true }, { user_id: 'u3', nickname: 'Gamma', ready: true }] };
    await vi.advanceTimersByTimeAsync(1100);
    session!.open(() => undefined);
    expect(dock.chatLayerForTest()).toBeNull();
  });
});
