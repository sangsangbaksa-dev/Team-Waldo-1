import { afterEach, expect, it, vi } from 'vitest';
import { Controls } from '../src/ui/controls.js';

afterEach(() => vi.unstubAllGlobals());

it('fires once per J press and combines K with mouse scope', () => {
  const document = new EventTarget();
  const window = new EventTarget();
  const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => Promise.resolve() });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, vi.fn());
  controls.enable();

  const key = (type: string, code: string, repeat = false) =>
    document.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat }));
  key('keydown', 'KeyJ');
  key('keydown', 'KeyJ', true);
  expect(controls.sample(0).fire).toBe(1);
  key('keyup', 'KeyJ');
  key('keydown', 'KeyJ');
  expect(controls.sample(0).fire).toBe(2);

  key('keydown', 'KeyK');
  canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 2 }));
  key('keyup', 'KeyK');
  expect(controls.sample(0).aim).toBe(true);
  key('keydown', 'KeyK');
  window.dispatchEvent(Object.assign(new Event('mouseup'), { button: 2 }));
  expect(controls.sample(0).aim).toBe(true);
  controls.disable();
  expect(controls.sample(0).aim).toBe(false);
});

it('keeps a held move key across pause and clears it when released', () => {
  const document = new EventTarget();
  const window = new EventTarget();
  const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => Promise.resolve() });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, vi.fn());
  const key = (type: string, code: string) =>
    document.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat: false }));
  controls.enable();
  key('keydown', 'KeyW');
  expect(controls.sample(0).forward).toBe(1);
  controls.disable();
  expect(controls.sample(0).forward).toBe(0);
  key('keyup', 'KeyW');
  controls.enable();
  expect(controls.sample(0).forward).toBe(0);
  key('keydown', 'KeyW');
  controls.disable();
  controls.enable();
  expect(controls.sample(0).forward).toBe(1);
});
