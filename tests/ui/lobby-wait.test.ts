// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend, MatchRow } from '../../src/net/types';

const row = (o: Partial<MatchRow>): MatchRow => ({ id: 'm1', game: 'city', code: null, host_id: 'u1', guest_id: null, status: 'waiting', config: {}, winner_id: null, host_delta: null, guest_delta: null, ...o });
const be = vi.hoisted(() => ({ backend: {} as Record<string, ReturnType<typeof vi.fn>> }));
vi.mock('../../src/net/backend', () => ({
  getBackend: async () => be.backend as unknown as Backend,
  currentAccount: async () => ({ id: 'u1', email: 'a@x.dev', nickname: 'Alpha' }),
  setAccount: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers(); document.body.innerHTML = '';
  be.backend = {
    rating: vi.fn(async () => null), leaderboard: vi.fn(async () => []), cancelMatch: vi.fn(async () => undefined),
    createRoom: vi.fn(async () => row({ code: 'ABC23' })), quickMatch: vi.fn(async () => row({ id: 'm2' })),
    getMatch: vi.fn(async () => row({ code: 'ABC23' })), nickname: vi.fn(async () => '상대'),
  };
});
afterEach(() => { vi.useRealTimers(); });

async function open(): Promise<void> {
  const { openLobby } = await import('../../src/net/lobby');
  openLobby({ game: 'city', onClose: () => undefined });
  await vi.advanceTimersByTimeAsync(10);
}
const click = (act: string): void => document.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)!.click();

describe('대기 화면', () => {
  it('방 코드와 입장 방법, 남은 시간, 취소·빠른 매칭 전환을 보여 준다', async () => {
    await open(); click('room'); await vi.advanceTimersByTimeAsync(10);
    const t = document.body.textContent ?? '';
    expect(document.querySelector('#pvp-code')?.textContent).toBe('ABC23');
    expect(t).toMatch(/코드로 입장/); expect(t).toMatch(/10:00/);
    expect(document.querySelector('[data-act="cancel"]')).not.toBeNull();
    expect(document.querySelector('[data-act="switch-quick"]')).not.toBeNull();
  });

  it('빠른 매칭으로 바꾸면 방을 취소하고 빠른 매칭을 시작한다', async () => {
    await open(); click('room'); await vi.advanceTimersByTimeAsync(10);
    click('switch-quick'); await vi.advanceTimersByTimeAsync(10);
    expect(be.backend.cancelMatch).toHaveBeenCalledWith('m1');
    expect(be.backend.quickMatch).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toMatch(/비슷한 상대를 찾는 중/);
  });

  it('시간이 다 되면 대기를 취소하고 처음 화면으로 돌아온다', async () => {
    await open(); click('room'); await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(601_000);
    expect(be.backend.cancelMatch).toHaveBeenCalledWith('m1');
    expect(document.querySelector('#pvp-code')).toBeNull();
    expect(document.body.textContent).toMatch(/상대가 나타나지 않아/);
    expect(document.querySelector('[data-act="room"]')).not.toBeNull();
  });
});
