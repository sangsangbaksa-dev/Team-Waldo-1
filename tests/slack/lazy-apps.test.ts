// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createComputerView } from '../../src/slack/computer';
import { createSim } from '../../src/slack/sim';
import type { SlackAudio } from '../../src/slack/types';

const audio: SlackAudio = {
  resume: vi.fn(), hold: vi.fn(), play: vi.fn(), ambience: vi.fn(),
  muffle: vi.fn(), setMuted: vi.fn(), dispose: vi.fn(),
};
let view: ReturnType<typeof createComputerView>;

beforeEach(() => {
  document.body.innerHTML = '';
  const sim = createSim('dorm', 7, 2);
  sim.start();
  view = createComputerView(sim, audio);
  document.body.append(view.el);
});
afterEach(() => { view.dispose(); view.el.remove(); });

describe('SLACK OFF dorm lazy apps', () => {
  it('does not construct all six hidden app windows on game startup', () => {
    expect(view.el.querySelectorAll('.sc-app-window')).toHaveLength(0);
    expect(view.el.querySelectorAll('[data-app]')).toHaveLength(6);
  });

  it('builds only apps actually opened and keeps their state on switching', () => {
    const clickApp = (id: string) =>
      view.el.querySelector<HTMLButtonElement>(`[data-app="${id}"]`)!.click();
    clickApp('game');
    // The click switches the simulation, which the view applies in its next frame.
    view.frame(0.1);
    expect(view.el.querySelectorAll('.sc-app-window')).toHaveLength(1);
    const game = view.el.querySelector('.sc-app-game');
    expect(game).not.toBeNull();
    clickApp('video'); view.frame(0.1);
    expect(view.el.querySelectorAll('.sc-app-window')).toHaveLength(2);
    clickApp('game'); view.frame(0.1);
    expect(view.el.querySelector('.sc-app-game')).toBe(game);
    expect(view.el.querySelectorAll('.sc-app-window')).toHaveLength(2);
  });

  it('preserves hidden timers and announcements without eagerly constructing their apps', () => {
    for (let i = 0; i < 50; i++) view.frame(1);
    // Shop and webtoon update in the background; neither requires a visible window.
    expect(view.el.querySelectorAll('.sc-app-window')).toHaveLength(0);
    view.el.querySelector<HTMLButtonElement>('[data-app="shop"]')!.click();
    view.frame(0);
    const timer = view.el.querySelector('[data-timer]')?.textContent;
    expect(timer).toBe('01:10');
    expect(view.el.querySelectorAll('.sc-app-window')).toHaveLength(1);
    view.el.querySelector<HTMLButtonElement>('[data-app="webtoon"]')!.click();
    view.frame(0);
    const latestEpisode = view.el.querySelector<HTMLElement>('[data-ep="3"]');
    expect(latestEpisode?.hidden).toBe(false);
  });
  it('enables the headphone soundscape only while playing music', () => {
    vi.mocked(audio.muffle).mockClear();
    const click = (id: string) =>
      view.el.querySelector<HTMLButtonElement>(`[data-app="${id}"]`)!.click();
    click('music'); view.frame(0.1);
    expect(audio.muffle).toHaveBeenLastCalledWith(true);
    click('chat'); view.frame(0.1);
    expect(audio.muffle).toHaveBeenLastCalledWith(false);
    click('music'); view.frame(0.1);
    expect(audio.muffle).toHaveBeenLastCalledWith(true);
    const toggle = view.el.querySelector<HTMLButtonElement>('[data-m="play"]')!;
    toggle.click();
    expect(audio.muffle).toHaveBeenLastCalledWith(false);
    toggle.click();
    expect(audio.muffle).toHaveBeenLastCalledWith(true);
    view.dispose();
    expect(audio.muffle).toHaveBeenLastCalledWith(false);
  });

});
