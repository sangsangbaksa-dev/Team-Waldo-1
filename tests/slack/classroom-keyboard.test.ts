// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createClassroomView } from '../../src/slack/classroom';
import { createSim } from '../../src/slack/sim';
import type { SlackAudio } from '../../src/slack/types';

const audio: SlackAudio = {
  resume: vi.fn(), hold: vi.fn(), play: vi.fn(), ambience: vi.fn(),
  muffle: vi.fn(), setMuted: vi.fn(), dispose: vi.fn(),
};

afterEach(() => { document.body.replaceChildren(); vi.clearAllMocks(); });

it('lets a keyboard user command the classroom mini-RTS without a mouse', () => {
  const sim = createSim('class', 3, 1);
  sim.start(); sim.doActivity('game'); sim.setCover(false);
  const view = createClassroomView(sim, audio);
  document.body.append(view.el);
  view.frame(0);
  const canvas = view.el.querySelector<HTMLCanvasElement>('.sl-win.gm canvas')!;
  expect(canvas.tabIndex).toBe(0);
  expect(canvas.getAttribute('aria-label')).toContain('방향키');
  canvas.focus();
  const press = (key: string, repeat = false) => {
    const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true, repeat });
    canvas.dispatchEvent(event);
    return event;
  };
  expect(press('ArrowLeft').defaultPrevented).toBe(true);
  expect(view.el.querySelector('#sl-rts-cursor')?.textContent).toBe('지휘 위치 152, 90');
  expect(press('Enter').defaultPrevented).toBe(true);
  expect(view.el.querySelector('#sl-rts-cursor')?.textContent).toContain('이동합니다');
  expect(audio.play).toHaveBeenCalledWith('click', 0.3);
  const count = vi.mocked(audio.play).mock.calls.length;
  press('Enter', true);
  expect(vi.mocked(audio.play).mock.calls.length).toBe(count);
  view.dispose();
});

it('ignores pointer orders while the in-screen RTS has no measurable canvas size', () => {
  const sim = createSim('class', 5, 1);
  sim.start(); sim.doActivity('game'); sim.setCover(false);
  const view = createClassroomView(sim, audio);
  document.body.append(view.el);
  view.frame(0.1);
  const canvas = view.el.querySelector<HTMLCanvasElement>('.sl-win.gm canvas')!;
  const rect = (width: number, height: number) => Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width, height }),
  });
  const press = (x: number, y: number, type: 'pointerdown' | 'pointermove') => {
    const e = new Event(type, { bubbles: true });
    Object.assign(e, { button: 0, clientX: x, clientY: y });
    canvas.dispatchEvent(e);
  };
  rect(0, 0);
  expect(() => { press(20, 30, 'pointerdown'); press(20, 30, 'pointermove'); }).not.toThrow();
  expect(audio.play).not.toHaveBeenCalledWith('click', 0.3);
  rect(320, 180);
  press(500, 90, 'pointermove');
  press(500, 90, 'pointerdown'); // Out-of-bounds coordinates are clamped.
  expect(audio.play).toHaveBeenCalledWith('click', 0.3);
  view.dispose();
});
