// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openOutlaw } from '../../src/outlaw/game';
import { OUTLAW_KEY } from '../../src/outlaw/records';
import type { SaveData } from '../../src/outlaw/sim';

const ViewStub = vi.hoisted(() => class {
  setPixelRatio(): void {}
  getPixelRatio(): number { return 1; }
  setSize(): void {}
  dispose(): void {}
  forceContextLoss(): void {}
});

vi.mock('three', async importOriginal => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: ViewStub,
}));
vi.mock('../../src/outlaw/assets', () => ({ loadOutlawAssets: async () => null }));
vi.mock('../../src/outlaw/actorview', () => ({ ActorView: ViewStub }));
vi.mock('../../src/outlaw/cityview', () => ({ CityView: ViewStub }));
vi.mock('../../src/outlaw/minimap', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/outlaw/minimap')>(),
  Minimap: ViewStub,
}));

const previous: SaveData = {
  v: 1, cash: 8765, completed: ['old-mission'], guns: [['pistol', 12, 48]],
  armor: 0, collected: [], clock: 16, kills: 0, playSec: 50,
};

function click(selector: string): void {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing button ${selector}`);
  button.click();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  localStorage.setItem(OUTLAW_KEY, JSON.stringify(previous));
  localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'low' }));
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('keeps the previous game on Back and Escape, then replaces it only after confirming a character', async () => {
  openOutlaw(vi.fn());
  await vi.advanceTimersByTimeAsync(31);
  const openChooser = () => { click('[data-t="new"]'); click('[data-t="new"]'); };

  openChooser();
  click('[data-k="resume"]');
  expect(localStorage.getItem(OUTLAW_KEY)).toBe(JSON.stringify(previous));

  openChooser();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  expect(document.querySelector<HTMLElement>('#ol-modal')?.hidden).toBe(true);
  expect(localStorage.getItem(OUTLAW_KEY)).toBe(JSON.stringify(previous));

  openChooser();
  click('[data-ui="hero"][data-id="h1"]');
  click('[data-ui="start"]');
  const next = JSON.parse(localStorage.getItem(OUTLAW_KEY)!) as SaveData;
  expect(next).toMatchObject({ cash: 400, completed: [], life: { hero: 'h1' } });
});
