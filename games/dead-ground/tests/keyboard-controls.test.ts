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

it('clears old session counters without resetting counters on an ordinary pause', () => {
  const document = new EventTarget();
  const window = new EventTarget();
  const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => Promise.resolve() });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, vi.fn());
  const key = (code: string, repeat = false) =>
    document.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code, repeat }));
  controls.enable();
  key('KeyJ');
  key('KeyJ');
  key('KeyR');
  expect(controls.sample(0).fire).toBe(1);
  controls.disable();
  controls.enable();
  key('KeyJ', true);
  expect(controls.sample(0).fire).toBe(1);
  expect(controls.sample(0).reload).toBe(1);
  controls.resetSession();
  controls.enable();
  expect(controls.sample(0)).toMatchObject({ fire: 0, reload: 0, forward: 0 });
});

it('pauses on tab hide and ignores a rejected lock from an older activation', async () => {
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = new EventTarget();
  let rejectOld!: (reason: Error) => void;
  const requestPointerLock = vi.fn()
    .mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOld = reject; }))
    .mockResolvedValue(undefined);
  const canvas = Object.assign(new EventTarget(), { requestPointerLock });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  const pause = vi.fn();
  const controls = new Controls(canvas as unknown as HTMLCanvasElement, pause);
  controls.enable();
  controls.disable();
  controls.enable();
  rejectOld(new Error('old request'));
  await Promise.resolve();
  expect(controls.fallback).toBe(false);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(pause).toHaveBeenCalledTimes(1);
});
