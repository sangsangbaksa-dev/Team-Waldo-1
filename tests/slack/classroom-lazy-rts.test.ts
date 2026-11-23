// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createClassroomView } from '../../src/slack/classroom';
import { createBattle } from '../../src/slack/lapgame';
import { createSim } from '../../src/slack/sim';
import type { SlackAudio } from '../../src/slack/types';

vi.mock('../../src/slack/lapgame', async importOriginal => {
  const source = await importOriginal<typeof import('../../src/slack/lapgame')>();
  return { ...source, createBattle: vi.fn(source.createBattle) };
});

const audio: SlackAudio = {
  resume: vi.fn(), hold: vi.fn(), play: vi.fn(), ambience: vi.fn(),
  muffle: vi.fn(), setMuted: vi.fn(), dispose: vi.fn(),
};

beforeEach(() => { vi.mocked(createBattle).mockClear(); document.body.innerHTML = ''; });
afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

it('does not create costly video and RTS worlds while the classroom shows study notes', () => {
  const sim = createSim('class', 11, 2);
  sim.start();
  const view = createClassroomView(sim, audio);
  document.body.append(view.el);
  view.frame(0.3);
  expect(createBattle).not.toHaveBeenCalled();
  view.dispose();
});

it('creates each mini RTS only once and keeps the playable world alive under study cover', () => {
  const sim = createSim('class', 21, 1);
  sim.start();
  const view = createClassroomView(sim, audio);
  document.body.append(view.el);
  sim.doActivity('video'); sim.setCover(false); view.frame(0.1);
  expect(createBattle).toHaveBeenCalledTimes(1);
  expect(createBattle).toHaveBeenCalledWith(false);
  sim.doActivity('game'); view.frame(0.1);
  expect(createBattle).toHaveBeenCalledTimes(2);
  const game = vi.mocked(createBattle).mock.results[1]?.value;
  expect(game).toBeTruthy();
  expect(game!.time).toBeCloseTo(0.1);
  const before = game!.time;
  sim.setCover(true); view.frame(0.1);
  expect(game!.time).toBeGreaterThan(before);
  sim.setCover(false); view.frame(0.1);
  sim.doActivity('video'); view.frame(0.1);
  expect(createBattle).toHaveBeenCalledTimes(2);
  view.dispose();
});

it('keeps the game-over panel visible and offers retry by button or keyboard', () => {
  const sim = createSim('class', 17, 1); sim.start();
  const view = createClassroomView(sim, audio);
  document.body.append(view.el);
  sim.doActivity('game'); sim.setCover(false); view.frame(0.1);
  const game = vi.mocked(createBattle).mock.results[0]?.value;
  expect(game).toBeTruthy();
  game!.over = 1; view.frame(0.1);
  expect(view.el.querySelector('.sl-end.on [data-rts-outcome]')?.textContent).toContain('패배');
  const canvas = view.el.querySelector<HTMLCanvasElement>('.sl-win.gm canvas')!;
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true, value: () => ({ left: 0, top: 0, width: 320, height: 180 }),
  });
  const movePointer = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(movePointer, { button: 0, clientX: 75, clientY: 45 });
  canvas.dispatchEvent(movePointer);
  expect(view.el.querySelector('#sl-rts-cursor')?.textContent).toContain('75, 45');
  view.el.querySelector<HTMLButtonElement>('[data-rts-retry]')!.click();
  expect(game!.over).toBeNull();
  expect(view.el.querySelector('#sl-rts-cursor')?.textContent).toContain('지휘 위치 중앙');
  view.frame(0.1);
  expect(view.el.querySelector('.sl-end.on')).toBeNull();

  game!.over = 0; view.frame(0.1);
  canvas.focus();
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }));
  expect(game!.over).toBeNull();
  expect(view.el.querySelector('#sl-rts-cursor')?.textContent).toContain('새 전투');
  view.dispose();
});
