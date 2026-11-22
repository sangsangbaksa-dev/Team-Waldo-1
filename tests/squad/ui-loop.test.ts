// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openSquad } from '../../src/squad/game';

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

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const button = (selector: string) => document.querySelector<HTMLButtonElement>(`.sq-root ${selector}`)!;

beforeEach(() => {
  nextFrame = 0; frames.clear(); document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextFrame; frames.set(id, callback); return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  localStorage.clear();
});
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

it('schedules animation only during active battles, not menu or deployment', () => {
  const exit = vi.fn();
  openSquad(exit);
  expect(frames.size).toBe(0);
  button('#start').click();
  expect(button('#auto')).toBeTruthy();
  expect(frames.size).toBe(0);
  button('#auto').click();
  expect(frames.size).toBe(0);
  button('#ready').click();
  expect(frames.size).toBe(1);
  // A redraw or speed change must not schedule a second frame.
  button('#speed2').click();
  expect(frames.size).toBe(1);
  const [id, frame] = [...frames.entries()][0]!;
  frames.delete(id);
  frame(100);
  expect(frames.size).toBe(1);
  button('#pause').click();
  expect(frames.size).toBe(0);
  button('#resume').click();
  expect(frames.size).toBe(1);
  button('#pause').click();
  button('#menu').click();
  expect(frames.size).toBe(0);
  button('#exit').click();
  expect(exit).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);
});

it('stops scheduling frames after a battle completes', () => {
  openSquad(vi.fn());
  button('#start').click(); button('#auto').click(); button('#ready').click();
  expect(frames.size).toBe(1);
  button('#skip').click();
  expect(document.querySelector('.sq-result')).toBeTruthy();
  expect(frames.size).toBe(0);
  button('#menu').click();
  expect(frames.size).toBe(0);
  button('#exit').click();
});
