// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openSquad } from '../../src/squad/game';
import { openLobby, type PvpSession } from '../../src/net/lobby';

const callbacks = vi.hoisted(() => ({
  onMatch: null as null | ((session: PvpSession) => void),
  onGone: null as null | ((reason: 'bye' | 'silent' | 'never') => void),
  setArmy: vi.fn(), clearArmy: vi.fn(), dispose: vi.fn(),
}));
vi.mock('../../src/net/lobby', () => ({
  openLobby: vi.fn(({ onMatch }: { onMatch: (session: PvpSession) => void }) => {
    callbacks.onMatch = onMatch;
    return { close: vi.fn() };
  }),
}));
vi.mock('../../src/squad/net', () => ({
  SquadPvp: class {
    constructor(_session: unknown, hooks: { onGone(reason: 'bye' | 'silent' | 'never'): void }) {
      callbacks.onGone = hooks.onGone;
    }
    heard = true;
    setArmy = callbacks.setArmy; clearArmy = callbacks.clearArmy; dispose = callbacks.dispose;
  },
}));
vi.mock('../../src/squad/view', () => ({ draw: vi.fn() }));
vi.mock('../../src/squad/sprites', () => ({
  spriteUrl: () => 'data:image/png;base64,AA==',
  sprite: () => document.createElement('canvas'),
}));
vi.mock('../../src/squad/audio', () => ({
  SquadAudio: class {
    enabled = true;
    place = vi.fn(); remove = vi.fn(); deny = vi.fn(); click = vi.fn();
    ready = vi.fn(); start = vi.fn(); win = vi.fn(); lose = vi.fn();
    battle = vi.fn(); unlock = vi.fn(); setPaused = vi.fn(); dispose = vi.fn();
  },
}));

const button = (selector: string) => document.querySelector<HTMLButtonElement>(`.sq-root ${selector}`)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  callbacks.onMatch = null; callbacks.onGone = null;
  vi.mocked(openLobby).mockClear();
  callbacks.setArmy.mockClear(); callbacks.clearArmy.mockClear(); callbacks.dispose.mockClear();
  localStorage.clear(); document.body.innerHTML = '';
});
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals(); });

it('keeps an online deployment deadline without running an idle animation loop', async () => {
  openSquad(vi.fn());
  button('[data-mode="online"]').click();
  button('#start').click();
  await vi.dynamicImportSettled();
  expect(callbacks.onMatch).toBeTruthy();
  // Esc in the login/matchmaking overlay must not close the underlying game.
  const overlay = document.createElement('div');
  overlay.className = 'pvp-root'; overlay.innerHTML = '<input aria-label="Nickname">';
  document.body.append(overlay);
  overlay.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.sq-root')).toBeTruthy();
  overlay.remove();
  const report = vi.fn().mockResolvedValue(undefined);
  callbacks.onMatch!({
    host: true,
    me: { id: 'a', nickname: 'Blue' },
    opponent: { id: 'b', nickname: 'Red' },
    match: { id: 'match' },
    backend: { report },
  } as unknown as PvpSession);
  expect(document.querySelector('#sq-timer')?.textContent).toBe('남은 시간 90초');
  expect(vi.getTimerCount()).toBe(1);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  vi.advanceTimersByTime(89_000);
  expect(document.querySelector('#sq-timer')?.textContent).toBe('남은 시간 1초');
  vi.advanceTimersByTime(1000);
  expect(document.querySelector('.sq-cover h2')?.textContent).toContain('상대 배치를 기다리는 중');
  expect(callbacks.setArmy).toHaveBeenCalledTimes(1);
  expect(callbacks.setArmy.mock.calls[0]?.[0]).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  // Double Escape abandons a waiting match and disposes its timer/channel.
  const leave = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  leave(); leave();
  expect(callbacks.dispose).toHaveBeenCalledTimes(1);
  expect(button('#exit')).toBeTruthy();
  button('#exit').click();
});

it('clears the online formation timer when the opponent forfeits during deployment', async () => {
  openSquad(vi.fn());
  button('[data-mode="online"]').click();
  button('#start').click();
  await vi.dynamicImportSettled();
  callbacks.onMatch!({
    host: true,
    me: { id: 'blue', nickname: 'Blue' },
    opponent: { id: 'red', nickname: 'Red' },
    match: { id: 'match' },
    backend: { report: vi.fn().mockResolvedValue({ status: 'finished', host_delta: 0, guest_delta: 0 }) },
  } as unknown as PvpSession);
  expect(vi.getTimerCount()).toBe(1);
  callbacks.onGone?.('bye');
  expect(document.querySelector('.sq-result h2')?.textContent).toContain('최종 승리');
  expect(vi.getTimerCount()).toBe(0);
  button('#next').click();
  expect(callbacks.dispose).toHaveBeenCalledTimes(1);
  button('#exit').click();
});

it('cancels pending rating-settlement retries on exit from an online forfeit', async () => {
  openSquad(vi.fn());
  button('[data-mode="online"]').click();
  button('#start').click();
  await vi.dynamicImportSettled();
  const settle = vi.fn().mockResolvedValue({ status: 'playing', host_delta: null, guest_delta: null });
  const report = vi.fn().mockResolvedValue({ status: 'playing', host_delta: null, guest_delta: null });
  callbacks.onMatch!({
    host: true,
    me: { id: 'blue', nickname: 'Blue' },
    opponent: { id: 'red', nickname: 'Red' },
    match: { id: 'match' },
    backend: { report, settle },
  } as unknown as PvpSession);
  callbacks.onGone?.('bye');
  await Promise.resolve();
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(1); // One 3-second settlement poll.
  button('#next').click(); // Return to the main menu and dispose networking.
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(5_000);
  await Promise.resolve();
  expect(settle).not.toHaveBeenCalled();
  button('#exit').click();
});

it('can launch matchmaking again after completing the previous online battle', async () => {
  openSquad(vi.fn());
  button('[data-mode="online"]').click();
  button('#start').click();
  await vi.dynamicImportSettled();
  expect(openLobby).toHaveBeenCalledTimes(1);
  callbacks.onMatch!({
    host: true,
    me: { id: 'blue', nickname: 'Blue' },
    opponent: { id: 'red', nickname: 'Red' },
    match: { id: 'match' },
    backend: { report: vi.fn().mockResolvedValue({ status: 'finished', host_delta: 0, guest_delta: 0 }) },
  } as unknown as PvpSession);
  callbacks.onGone?.('bye');
  button('#next').click();
  expect(button('#start')).toBeTruthy();
  button('#start').click();
  await vi.dynamicImportSettled();
  expect(openLobby).toHaveBeenCalledTimes(2);
  button('#exit').click();
});

it('ignores a stale lobby opening when the player switches to local AI play', async () => {
  openSquad(vi.fn());
  button('[data-mode="online"]').click();
  button('#start').click(); // The lobby module import remains pending until the microtask.
  button('[data-mode="ai"]').click();
  button('#start').click();
  await vi.dynamicImportSettled();
  expect(openLobby).not.toHaveBeenCalled();
  expect(button('#ready')).toBeTruthy();
  button('#pause').click(); button('#exit').click();
});

it('ignores a delayed matchmaking completion after the player exits the game', async () => {
  const exit = vi.fn();
  openSquad(exit);
  button('[data-mode="online"]').click();
  button('#start').click();
  await vi.dynamicImportSettled();
  expect(openLobby).toHaveBeenCalledTimes(1);
  button('#exit').click();
  expect(exit).toHaveBeenCalledTimes(1);
  callbacks.onMatch!({
    host: true,
    me: { id: 'blue', nickname: 'Blue' },
    opponent: { id: 'red', nickname: 'Red' },
    match: { id: 'match' },
    backend: { report: vi.fn() },
  } as unknown as PvpSession);
  expect(callbacks.onGone).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
