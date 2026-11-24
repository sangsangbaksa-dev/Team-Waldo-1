// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { createComputerView } from '../../src/slack/computer';
import { createSim } from '../../src/slack/sim';
import type { SlackAudio } from '../../src/slack/types';

const audio: SlackAudio = {
  resume() {}, hold() {}, play() {}, ambience() {}, muffle() {}, setMuted() {}, dispose() {},
};
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; });

it('marks the dorm door so the scan swing can open it', () => {
  const sim = createSim('dorm', 2, 1);
  sim.start();
  sim.state.watcher.mode = 'scan';
  const view = createComputerView(sim, audio);
  dispose = () => view.dispose();
  view.frame(0);
  expect(view.el.dataset.mode).toBe('scan');
  expect(view.el.querySelector('.sc-door')).toBeTruthy();
});
