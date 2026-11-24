// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSim } from '../../src/slack/sim';
import { createSlackAudio } from '../../src/slack/audio';
import { openSlack } from '../../src/slack/game';

vi.mock('../../src/slack/sim', async importOriginal => {
  const sim = await importOriginal<typeof import('../../src/slack/sim')>();
  return { ...sim, createSim: vi.fn(sim.createSim) };
});

vi.mock('../../src/slack/audio', () => ({
  createSlackAudio: vi.fn(() => ({
    resume: vi.fn(), hold: vi.fn(), play: vi.fn(), ambience: vi.fn(), muffle: vi.fn(), setMuted: vi.fn(), dispose: vi.fn(),
  })),
}));

const button = (selector: string) => document.querySelector<HTMLButtonElement>(`.sl-root ${selector}`)!;
const key = (value: string, code = value) => document.activeElement?.dispatchEvent(new KeyboardEvent(
  'keydown', { key: value, code, bubbles: true, cancelable: true },
));
const frames = new Map<number, FrameRequestCallback>();
let now = 0, nextFrame = 0;
const advance = (ms: number) => {
  now += ms;
  const pending = [...frames.values()]; frames.clear();
  pending.forEach(frame => frame(now));
};

beforeEach(() => {
  vi.clearAllMocks();
  frames.clear(); now = 0; nextFrame = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.set(++nextFrame, frame); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  localStorage.clear();
});

afterEach(() => {
  key('Escape');
  button('[data-paused]:not([hidden]) [data-exit], [data-result]:not([hidden]) [data-exit], [data-title]:not([hidden]) [data-exit]')?.click();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

it('clamps a stalled frame so a hitch cannot skip the watch window', async () => {
  openSlack(vi.fn());
  button('[data-start]').click();
  await vi.dynamicImportSettled();
  const sim = vi.mocked(createSim).mock.results[0].value;
  advance(2000);
  expect(sim.state.time).toBeCloseTo(0.25);
});

it('starts once, advances by elapsed play time, and cancels the frame on exit', async () => {
  const exit = vi.fn();
  openSlack(exit);
  expect(document.activeElement).toBe(button('[data-start]'));
  button('[data-stage="dorm"]').click();
  button('[data-start]').click();
  button('[data-start]').click();
  await vi.dynamicImportSettled();
  expect(createSim).toHaveBeenCalledTimes(1);
  const sim = vi.mocked(createSim).mock.results[0].value;
  const audio = vi.mocked(createSlackAudio).mock.results[0].value;
  key('1'); advance(250);
  expect(sim.state.activity).toBe('game');
  expect(sim.state.time).toBeCloseTo(0.25);
  key(' ', 'Space');
  expect(sim.state.cover).toBe(true);
  key('p');
  expect(document.activeElement).toBe(button('[data-resume]'));
  expect(sim.state.cover).toBe(false);
  key('2'); advance(5000);
  expect(sim.state.activity).toBe('game');
  expect(sim.state.time).toBeCloseTo(0.25);
  expect(frames.size).toBe(0);
  button('[data-resume]').click(); advance(100);
  expect(sim.state.time).toBeCloseTo(0.35);
  key('p'); button('[data-paused] [data-exit]').click();
  expect(frames.size).toBe(0);
  expect(audio.dispose).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledTimes(1);
});

it('focuses results, stays quiet on a missed goal, and switches stage once', async () => {
  openSlack(vi.fn());
  button('[data-stage="dorm"]').click(); button('[data-start]').click();
  await vi.dynamicImportSettled();
  const sim = vi.mocked(createSim).mock.results[0].value;
  const audio = vi.mocked(createSlackAudio).mock.results[0].value;
  sim.state.time = sim.state.limit - 0.05;
  advance(100);
  expect(document.activeElement).toBe(button('[data-retry]'));
  expect(audio.play).not.toHaveBeenCalledWith('win');
  expect(JSON.parse(localStorage.getItem('waldo.slack.v1')!).best.dorm.grade).toBe('D'); // 목표를 못 채운 판도 기록에 남는다
  expect(frames.size).toBe(0);
  button('[data-next]').click(); button('[data-next]').click();
  await vi.dynamicImportSettled();
  expect(vi.mocked(createSim).mock.calls.map(([stage]) => stage)).toEqual(['dorm', 'class']);
  expect(audio.dispose).toHaveBeenCalledTimes(1);
  expect(createSlackAudio).toHaveBeenCalledTimes(2);
});

it('keeps an active dorm game target when switching away and back', async () => {
  openSlack(vi.fn());
  button('[data-stage="dorm"]').click(); button('[data-start]').click();
  await vi.dynamicImportSettled();
  key('1'); advance(200); advance(200); advance(200);
  expect(button('.sc-target').classList.contains('on')).toBe(true);
  key('2'); advance(100);
  expect(button('.sc-app-game').inert).toBe(true);
  key('1'); advance(100);
  expect(button('.sc-app-game').inert).toBe(false);
  expect(button('.sc-target').classList.contains('on')).toBe(true);
});
