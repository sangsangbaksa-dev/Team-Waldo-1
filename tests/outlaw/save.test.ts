import { Sim } from '../../src/outlaw/sim';
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openOutlaw } from '../../src/outlaw/game';
import { OUTLAW_KEY } from '../../src/outlaw/records';
import type { SaveData } from '../../src/outlaw/sim';

const ViewStub = vi.hoisted(() => class {
  setPixelRatio(): void {}
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

it('starts with the fixed hero after confirming a new game', async () => {
  openOutlaw(vi.fn());
  await vi.advanceTimersByTimeAsync(31);
  click('[data-t="new"]');
  expect(localStorage.getItem(OUTLAW_KEY)).toBe(JSON.stringify(previous));
  click('[data-t="new"]');
  const next = JSON.parse(localStorage.getItem(OUTLAW_KEY)!) as SaveData;
  expect(next).toMatchObject({ cash: 400, completed: [], life: { hero: 'h0' } });
});

it('coerces an unknown saved hero to the fixed hero', () => {
  const sim = new Sim(7);
  const save = sim.exportSave();
  sim.applySave({ ...save, life: { ...save.life!, hero: 'unknown' } });
  expect(sim.life.hero).toBe('h0');
});
