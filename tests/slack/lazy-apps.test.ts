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

it('silences the dorm headphone music bed while the study cover is held', () => {
  vi.mocked(audio.muffle).mockClear();
  view.el.querySelector<HTMLButtonElement>('[data-app="music"]')!.click();
  view.frame(0.1);
  expect(audio.muffle).toHaveBeenLastCalledWith(true);
  const key = (type: 'keydown' | 'keyup') => {
    view.el.focus();
    view.el.dispatchEvent(new KeyboardEvent(type, { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
  };
  key('keydown');
  expect(audio.muffle).toHaveBeenLastCalledWith(false);
  key('keyup');
  expect(audio.muffle).toHaveBeenLastCalledWith(true);
});

it('locks cart prices to the add action when the midnight flash deal rotates', () => {
  view.el.querySelector<HTMLButtonElement>('[data-app="shop"]')!.click();
  view.frame(0);
  const status = view.el.querySelector<HTMLElement>('[data-total]')!;
  expect(status.getAttribute('role')).toBe('status');
  expect(status.getAttribute('aria-live')).toBe('polite');
  const total = () => status.textContent;
  // Product #1 is initially the flash deal, but its ordinary button
  // must retain the displayed 35% discount (not the 50% flash rate).
  view.el.querySelector<HTMLButtonElement>('[data-add="1"]')!.click();
  expect(total()).toBe('합계 8,385원');
  view.el.querySelector<HTMLButtonElement>('[data-add="deal"]')!.click();
  expect(total()).toBe('합계 14,835원');
  expect(view.el.querySelector('[data-cart]')?.textContent).toBe('2');
  expect(view.el.querySelector<HTMLButtonElement>('[data-add="1"]')?.textContent).toBe('담김 ×2');
  expect(view.el.querySelector<HTMLButtonElement>('[data-add="1"]')?.getAttribute('aria-label')).toContain('별빛 무드등 · 장바구니 2개');

  // A new deal applies only to future cart additions.
  view.frame(121);
  expect(view.el.querySelector('[data-deal-name]')?.textContent).toBe('말랑 젤리 세트');
  expect(view.el.querySelector('[data-add="deal"]')?.getAttribute('aria-label')).toContain('말랑 젤리 세트 심야 특가 2,250원');
  expect(total()).toBe('합계 14,835원');
  view.el.querySelector<HTMLButtonElement>('[data-add="deal"]')!.click();
  expect(total()).toBe('합계 17,085원');
  expect(view.el.querySelector<HTMLButtonElement>('[data-add="2"]')?.textContent).toBe('담김 ×1');
});

it('keeps the star and timer ring clear of narrow screen edges', () => {
  view.el.querySelector<HTMLButtonElement>('[data-app="game"]')!.click();
  view.frame(0.1);
  view.frame(0.6);
  const star = view.el.querySelector<HTMLButtonElement>('.sc-target')!;
  expect(star.classList.contains('on')).toBe(true);
  const scene = view.el.querySelector<HTMLElement>('.sc-game-scene')!;
  const x = Number.parseFloat(scene.style.getPropertyValue('--star-x'));
  const y = Number.parseFloat(scene.style.getPropertyValue('--star-y'));
  expect(x).toBeGreaterThanOrEqual(8);
  expect(x).toBeLessThanOrEqual(82);
  expect(y).toBeGreaterThanOrEqual(16);
  expect(y).toBeLessThanOrEqual(58);
  const ringDuration = star.style.getPropertyValue('--life');
  expect(ringDuration).toMatch(/s$/);
});

it('advances multiple shop promotions without losing elapsed remainder or stale accessible names', () => {
  view.el.querySelector<HTMLButtonElement>('[data-app="shop"]')!.click();
  view.frame(0);
  expect(view.el.querySelector('[data-deal-name]')?.textContent).toBe('별빛 무드등');
  view.frame(361); // Three complete 120-second deal windows plus one second.
  expect(view.el.querySelector('[data-deal-name]')?.textContent).toBe('무선 이어폰');
  expect(view.el.querySelector('[data-timer]')?.textContent).toBe('01:59');
  expect(view.el.querySelector('[data-add="deal"]')?.getAttribute('aria-label')).toContain('무선 이어폰 심야 특가 7,950원');
});

it('keeps the dorm messenger responsive after many quick replies and app switches', () => {
  const open = (id: string) => {
    view.el.querySelector<HTMLButtonElement>(`[data-app="${id}"]`)!.click();
    view.frame(0.1);
  };
  open('chat');
  const chip = view.el.querySelector<HTMLButtonElement>('[data-chip]')!;
  for (let i = 0; i < 90; i++) chip.click();
  const messages = view.el.querySelector('.sc-messages')!;
  expect(messages.childElementCount).toBe(30);
  open('video'); open('chat');
  expect(view.el.querySelector('.sc-messages')!.childElementCount).toBe(30);
  expect(view.el.querySelectorAll('.sc-app-window')).toHaveLength(2);
});

it('labels music and video play controls for keyboard and screen-reader players', () => {
  const open = (id: string) => {
    view.el.querySelector<HTMLButtonElement>(`[data-app="${id}"]`)!.click();
    view.frame(0.1);
  };
  open('music');
  const play = view.el.querySelector<HTMLButtonElement>('[data-m="play"]')!;
  expect(play.getAttribute('aria-label')).toBe('일시정지');
  expect(view.el.querySelector('[data-m-title]')?.getAttribute('aria-live')).toBe('polite');
  play.click(); expect(play.getAttribute('aria-label')).toBe('재생');
  play.click(); expect(play.getAttribute('aria-label')).toBe('일시정지');
  open('video');
  const video = view.el.querySelector<HTMLButtonElement>('[data-vplay]')!;
  expect(video.getAttribute('aria-label')).toBe('일시정지');
  video.click(); expect(video.getAttribute('aria-label')).toBe('재생');
  video.click(); expect(video.getAttribute('aria-label')).toBe('일시정지');
});

it('processes delayed messenger replies in chronological order without ghost typing indicators', () => {
  view.el.querySelector<HTMLButtonElement>('[data-app="chat"]')!.click();
  view.frame(0.1);
  const chip = view.el.querySelector<HTMLButtonElement>('[data-chip]')!;
  for (let i = 0; i < 90; i++) chip.click();
  view.frame(5); // Several start/end callbacks become due in a single stalled frame.
  const pane = view.el.querySelector('.sc-messages')!;
  expect(pane.querySelectorAll('p:not(.mine)')).toHaveLength(4);
  expect(pane.childElementCount).toBeLessThanOrEqual(30);
  expect(view.el.querySelector('.sc-typing')?.classList.contains('on')).toBe(false);
  expect(view.el.querySelector<HTMLButtonElement>('[data-room="0"] [data-last]')?.textContent).not.toBe('입력 중...');
});

it('still hides the computer when the study cover cannot capture a touch pointer', () => {
  const cover = view.el.querySelector<HTMLButtonElement>('.sc-cover-button')!;
  Object.defineProperty(cover, 'setPointerCapture', {
    configurable: true, value: () => { throw new Error('capture unavailable'); },
  });
  const pointer = (type: string) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { button: 0, pointerId: 17 });
    cover.dispatchEvent(e);
  };
  expect(() => pointer('pointerdown')).not.toThrow();
  expect(cover.getAttribute('aria-pressed')).toBe('true');
  pointer('pointerup');
  expect(cover.getAttribute('aria-pressed')).toBe('false');
});

it('visually marks powerless apps and offers a useful fallback without locking the dorm', () => {
  const sim = createSim('dorm', 13, 1);
  sim.start(); sim.state.battery = 0;
  const off = createComputerView(sim, audio);
  document.body.append(off.el);
  off.frame(0);
  const music = off.el.querySelector<HTMLButtonElement>('[data-app="music"]')!;
  expect(music.getAttribute('aria-disabled')).toBe('true');
  music.click();
  expect(sim.state.activity).toBeNull();
  expect(off.el.querySelector('.sc-toast')?.textContent).toContain('배터리가 없어요');
  off.el.querySelector<HTMLButtonElement>('[data-app="webtoon"]')!.click();
  expect(sim.state.activity).toBe('webtoon');
  expect(off.el.querySelector<HTMLButtonElement>('[data-app="game"]')?.getAttribute('aria-disabled')).toBe('true');
  off.dispose();
  off.el.remove();
});

it('lets keyboard and screen-reader users select each dorm music track', () => {
  view.el.querySelector<HTMLButtonElement>('[data-app="music"]')!.click();
  view.frame(0.1);
  const tracks = Array.from(view.el.querySelectorAll<HTMLButtonElement>('[data-track]'));
  expect(tracks).toHaveLength(4);
  expect(tracks[0]?.tagName).toBe('BUTTON');
  expect(tracks[0]?.getAttribute('aria-pressed')).toBe('true');
  tracks[2]!.focus();
  tracks[2]!.click();
  expect(tracks[2]?.getAttribute('aria-pressed')).toBe('true');
  expect(tracks[0]?.getAttribute('aria-pressed')).toBe('false');
  expect(view.el.querySelector('[data-m-title]')?.textContent).toContain('느린 걸음');
});

it('releases a dorm study-cover touch when pointer capture is denied outside the control', () => {
  const sim = createSim('dorm', 7, 1); sim.start();
  const isolated = createComputerView(sim, audio);
  document.body.append(isolated.el);
  sim.doActivity('video'); sim.setCover(false); isolated.frame(0.1);
  const cover = isolated.el.querySelector<HTMLButtonElement>('.sc-cover-button')!;
  Object.defineProperty(cover, 'setPointerCapture', {
    configurable: true, value: () => { throw new Error('capture denied'); },
  });
  const touch = (target: EventTarget, type: string) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 23, button: 0 });
    target.dispatchEvent(event);
  };
  touch(cover, 'pointerdown');
  expect(sim.state.cover).toBe(true);
  touch(window, 'pointerup');
  expect(sim.state.cover).toBe(false);
  isolated.dispose();
  isolated.el.remove();
});
