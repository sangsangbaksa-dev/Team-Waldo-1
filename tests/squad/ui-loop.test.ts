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
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals(); });

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

it('keeps keyboard focus through menu, deployment and pause transitions', () => {
  openSquad(vi.fn());
  expect(document.activeElement).toBe(button('#start'));
  button('#start').click();
  expect(document.activeElement).toBe(button('[data-unit="guard"]'));
  button('[data-unit="archer"]').focus();
  button('[data-unit="archer"]').click();
  expect(document.activeElement).toBe(button('[data-unit="archer"]'));
  button('#auto').focus();
  button('#auto').click();
  expect(document.activeElement).toBe(button('#auto'));
  button('#ready').click();
  expect(document.activeElement).toBe(button('#pause'));
  button('#pause').click();
  expect(document.activeElement).toBe(button('#resume'));
  button('#menu').click();
  expect(document.activeElement).toBe(button('#start'));
  button('#exit').click();
});

it('announces selected units and battle speed to assistive controls', () => {
  openSquad(vi.fn());
  button('#start').click();
  expect(button('[data-unit="guard"]').getAttribute('aria-pressed')).toBe('true');
  button('[data-unit="archer"]').click();
  expect(button('[data-unit="archer"]').getAttribute('aria-pressed')).toBe('true');
  expect(button('[data-unit="guard"]').getAttribute('aria-pressed')).toBe('false');
  button('#auto').click(); button('#ready').click();
  expect(button('#speed1').getAttribute('aria-pressed')).toBe('true');
  button('#speed4').click();
  expect(button('#speed4').getAttribute('aria-pressed')).toBe('true');
  expect(button('#speed1').getAttribute('aria-pressed')).toBe('false');
  button('#pause').click(); button('#menu').click(); button('#exit').click();
});

it('ignores secondary pointers and cancels a deployment when capture is lost', () => {
  openSquad(vi.fn());
  button('#start').click();
  const canvas = document.querySelector<HTMLCanvasElement>('.sq-root canvas')!;
  const prepare = (target: HTMLCanvasElement) => {
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true, value: () => ({ left: 0, top: 0, width: 600, height: 1000 }),
    });
    Object.defineProperty(target, 'setPointerCapture', { configurable: true, value: vi.fn() });
  };
  const event = (target: HTMLCanvasElement, type: string, pointerId: number, x: number, y: number) => {
    const e = new Event(type, { bubbles: true });
    Object.assign(e, { pointerId, button: 0, clientX: x, clientY: y });
    target.dispatchEvent(e);
  };
  prepare(canvas);
  event(canvas, 'pointerdown', 11, 250, 750);
  event(canvas, 'pointerdown', 12, 350, 750);
  event(canvas, 'pointerup', 12, 350, 750);
  expect(document.querySelector('.sq-budget strong')?.textContent).toContain('1000');
  event(canvas, 'pointerup', 11, 250, 750);
  expect(document.querySelector('.sq-budget strong')?.textContent).toContain('900');
  const nextCanvas = document.querySelector<HTMLCanvasElement>('.sq-root canvas')!;
  prepare(nextCanvas);
  event(nextCanvas, 'pointerdown', 13, 300, 750);
  event(nextCanvas, 'lostpointercapture', 13, 300, 750);
  event(nextCanvas, 'pointerup', 13, 300, 750);
  expect(document.querySelector('.sq-budget strong')?.textContent).toContain('900');
  button('#pause').click(); button('#exit').click();
});

it('does not toggle the pause screen when Escape auto-repeats', () => {
  openSquad(vi.fn());
  button('#start').click(); button('#auto').click(); button('#ready').click();
  const press = (repeat: boolean) => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat }));
  press(false);
  expect(button('#resume')).toBeTruthy();
  press(true);
  expect(button('#resume')).toBeTruthy();
  press(false);
  expect(button('#pause')).toBeTruthy();
  button('#pause').click(); button('#exit').click();
});

it('keeps just one toast timer and clears it when leaving the game', () => {
  vi.useFakeTimers();
  openSquad(vi.fn());
  button('#start').click();
  button('#ready').click(); button('#ready').click(); button('#ready').click();
  expect(document.querySelectorAll('.sq-toast')).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(1);
  button('#pause').click(); button('#exit').click();
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the same battlefield canvas when selecting units or changing speed', () => {
  openSquad(vi.fn());
  button('#start').click();
  const deployingCanvas = document.querySelector('.sq-root canvas');
  button('[data-unit="archer"]').click();
  expect(document.querySelector('.sq-root canvas')).toBe(deployingCanvas);
  button('#auto').click(); button('#ready').click();
  const battleCanvas = document.querySelector('.sq-root canvas');
  button('#speed2').click();
  button('#speed4').click();
  expect(document.querySelector('.sq-root canvas')).toBe(battleCanvas);
  expect(button('#speed4').getAttribute('aria-pressed')).toBe('true');
  button('#pause').click(); button('#exit').click();
});

it('supports keyboard-only formation placement with intact focus and budget rules', () => {
  openSquad(vi.fn());
  button('#start').click();
  let canvas = document.querySelector<HTMLCanvasElement>('#sq-field-canvas')!;
  expect(canvas.tabIndex).toBe(0);
  canvas.focus();
  const key = (value: string): void => {
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    canvas = document.querySelector<HTMLCanvasElement>('#sq-field-canvas')!;
  };
  key('ArrowRight'); // Establish keyboard hover in the friendly deployment zone.
  key('Enter');
  expect(document.querySelector('.sq-budget strong')?.textContent).toContain('900');
  expect(document.activeElement).toBe(canvas);
  expect(button('#ready')).toBeTruthy(); // Enter did not confirm the entire formation.
  key('Delete');
  expect(document.querySelector('.sq-budget strong')?.textContent).toContain('1000');
  key(' ');
  expect(document.querySelector('.sq-budget strong')?.textContent).toContain('900');
  key('ArrowUp'); key('Enter');
  expect(document.querySelector('.sq-budget strong')?.textContent).toContain('800');
  expect(document.activeElement).toBe(canvas);
  button('#pause').click();
  button('#exit').click();
});

it('never inserts an illegal enemy-zone unit after hover switches to keyboard input', () => {
  openSquad(vi.fn());
  button('#start').click();
  const canvas = document.querySelector<HTMLCanvasElement>('#sq-field-canvas')!;
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true, value: () => ({ left: 0, top: 0, width: 600, height: 1000 }),
  });
  const mouse = new Event('pointermove');
  Object.assign(mouse, { clientX: 200, clientY: 100 }); // Enemy half of the map
  canvas.dispatchEvent(mouse);
  canvas.focus();
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(document.querySelector('.sq-budget strong')?.textContent).toContain('900');
  expect(() => button('#ready').click()).not.toThrow();
  expect(button('#pause')).toBeTruthy();
  button('#pause').click(); button('#exit').click();
});

it('ignores off-grid pointer hover rather than drawing from invalid cells', async () => {
  const { draw } = await import('../../src/squad/view');
  openSquad(vi.fn());
  button('#start').click();
  const canvas = document.querySelector<HTMLCanvasElement>('#sq-field-canvas')!;
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true, value: () => ({ left: 0, top: 0, width: 600, height: 1000 }),
  });
  const move = (x: number, y: number) => {
    const e = new Event('pointermove');
    Object.assign(e, { clientX: x, clientY: y });
    canvas.dispatchEvent(e);
  };
  move(250, 750);
  const before = vi.mocked(draw).mock.calls.length;
  move(-20, -20); // One final redraw to clear the previous preview.
  expect(vi.mocked(draw).mock.calls.length).toBe(before + 1);
  move(-30, -30);
  expect(vi.mocked(draw).mock.calls.length).toBe(before + 1);
  button('#pause').click(); button('#exit').click();
});
