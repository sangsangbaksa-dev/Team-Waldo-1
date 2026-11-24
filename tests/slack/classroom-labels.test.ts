// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { createClassroomView } from '../../src/slack/classroom';
import { createSim } from '../../src/slack/sim';
import type { SlackAudio } from '../../src/slack/types';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; });

it('opens the classroom door and steps the teacher in when the scan starts', () => {
  const audio: SlackAudio = {
    resume() {}, hold() {}, play() {}, ambience() {}, muffle() {}, setMuted() {}, dispose() {},
  };
  const sim = createSim('class', 4, 1);
  sim.start();
  const view = createClassroomView(sim, audio);
  dispose = () => view.dispose();
  const room = view.el.querySelector('.sl-room')!;
  view.onEvent({ t: 'door', open: true });
  sim.state.watcher.mode = 'scan';
  view.frame(0);
  expect(room.classList.contains('is-door')).toBe(true);
  expect(room.getAttribute('data-scan')).toBe('true');
  view.onEvent({ t: 'leave' });
  expect(room.classList.contains('is-door')).toBe(false);
});

it('labels the embedded classroom RTS as a Slack Off activity', () => {
  const audio: SlackAudio = {
    resume() {}, hold() {}, play() {}, ambience() {}, muffle() {}, setMuted() {}, dispose() {},
  };
  const view = createClassroomView(createSim('class', 1, 2), audio);
  dispose = () => view.dispose();
  const text = view.el.textContent ?? '';
  expect(text).toContain('전술 영상 · 다리 점령전 하이라이트');
  expect(text).toContain('다리 점령전 · 지휘 모드');
  expect(text).not.toContain('FRONTLINE');
});

it('releases study mode when pointer capture fails and the player lifts outside the button', () => {
  const audio: SlackAudio = {
    resume() {}, hold() {}, play() {}, ambience() {}, muffle() {}, setMuted() {}, dispose() {},
  };
  const sim = createSim('class', 3, 1);
  sim.start(); sim.doActivity('video'); sim.setCover(false);
  const view = createClassroomView(sim, audio);
  dispose = () => view.dispose();
  const cover = view.el.querySelector<HTMLButtonElement>('.sl-cover')!;
  Object.defineProperty(cover, 'setPointerCapture', {
    configurable: true, value: () => { throw new Error('capture denied'); },
  });
  const pointer = (target: EventTarget, type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 44, button: 0 });
    target.dispatchEvent(event);
  };

  pointer(cover, 'pointerdown');
  expect(sim.state.cover).toBe(true);
  pointer(window, 'pointerup');
  expect(sim.state.cover).toBe(false);
});
