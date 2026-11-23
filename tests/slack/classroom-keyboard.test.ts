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

it('supports hold-to-cover on classroom touch controls without pointer capture', () => {
  const sim = createSim('class', 6, 1); sim.start();
  const view = createClassroomView(sim, audio);
  document.body.append(view.el);
  const cover = view.el.querySelector<HTMLButtonElement>('.sl-cover')!;
  Object.defineProperty(cover, 'setPointerCapture', {
    configurable: true, value: () => { throw new Error('capture denied'); },
  });
  const pointer = (type: string) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { button: 0, pointerId: 7 });
    cover.dispatchEvent(e);
  };
  expect(() => pointer('pointerdown')).not.toThrow();
  expect(sim.state.cover).toBe(true);
  pointer('pointercancel');
  expect(sim.state.cover).toBe(true); // no selected activity: the study cover stays visible
  sim.doActivity('game');
  sim.setCover(false);
  pointer('pointerdown');
  expect(sim.state.cover).toBe(true);
  pointer('pointercancel');
  expect(sim.state.cover).toBe(false);
  view.dispose();
});

it('keeps tactical map keyboard focus after clicking with a mouse or trackpad', () => {
  const sim = createSim('class', 3, 1); sim.start();
  const view = createClassroomView(sim, audio);
  document.body.append(view.el);
  sim.doActivity('game'); sim.setCover(false); view.frame(0.1);
  const canvas = view.el.querySelector<HTMLCanvasElement>('.sl-win.gm canvas')!;
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true, value: () => ({ left: 0, top: 0, width: 320, height: 180 }),
  });
  const e = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(e, { button: 0, clientX: 100, clientY: 90 });
  canvas.dispatchEvent(e);
  expect(document.activeElement).toBe(canvas);
  expect(view.el.querySelector('#sl-rts-cursor')?.textContent).toContain('지휘 위치 100, 90 · 이동 지시');
  const arrow = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' });
  canvas.dispatchEvent(arrow);
  expect(arrow.defaultPrevented).toBe(true);
  expect(view.el.querySelector('#sl-rts-cursor')?.textContent).toBe('지휘 위치 108, 90');
  view.dispose();
});

it('releases the classroom study cover on window pointerup if capture fails outside the button', () => {
  const sim = createSim('class', 3, 1); sim.start(); sim.doActivity('video');
  const view = createClassroomView(sim, audio);
  document.body.append(view.el);
  const cover = view.el.querySelector<HTMLButtonElement>('.sl-cover')!;
  Object.defineProperty(cover, 'setPointerCapture', {
    configurable: true, value: () => { throw new Error('capture denied'); },
  });
  const touch = (target: EventTarget, type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 44, button: 0 });
    target.dispatchEvent(event);
  };
  sim.setCover(false);
  touch(cover, 'pointerdown');
  expect(sim.state.cover).toBe(true);
  touch(window, 'pointerup');
  expect(sim.state.cover).toBe(false);
  view.dispose();
});
