// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openSquad } from '../../src/squad/game';
import type { PvpSession } from '../../src/net/lobby';

const callbacks = vi.hoisted(() => ({
  onMatch: null as null | ((session: PvpSession) => void),
  setArmy: vi.fn(), clearArmy: vi.fn(), dispose: vi.fn(),
}));
vi.mock('../../src/net/lobby', () => ({
  openLobby: ({ onMatch }: { onMatch: (session: PvpSession) => void }) => {
    callbacks.onMatch = onMatch;
    return { close: vi.fn() };
  },
}));
vi.mock('../../src/squad/net', () => ({
  SquadPvp: class {
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
    battle = vi.fn(); unlock = vi.fn(); dispose = vi.fn();
  },
}));

const button = (selector: string) => document.querySelector<HTMLButtonElement>(`.sq-root ${selector}`)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  callbacks.onMatch = null;
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
  const report = vi.fn().mockResolvedValue(undefined);
  callbacks.onMatch!({
    host: true,
    me: { id: 'a', nickname: 'Blue' },
    opponent: { id: 'b', nickname: 'Red' },
    match: { id: 'match' },
    backend: { report },
  } as unknown as PvpSession);
  expect(document.querySelector('#sq-timer')?.textContent).toBe('남은 시간 90초');
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  vi.advanceTimersByTime(89_000);
  expect(document.querySelector('#sq-timer')?.textContent).toBe('남은 시간 1초');
  vi.advanceTimersByTime(1000);
  expect(document.querySelector('.sq-cover h2')?.textContent).toContain('상대 배치를 기다리는 중');
  expect(callbacks.setArmy).toHaveBeenCalledTimes(1);
  expect(callbacks.setArmy.mock.calls[0]?.[0]).toBe(1);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  // Double Escape abandons a waiting match and disposes its timer/channel.
  const leave = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  leave(); leave();
  expect(callbacks.dispose).toHaveBeenCalledTimes(1);
  expect(button('#exit')).toBeTruthy();
  button('#exit').click();
});
