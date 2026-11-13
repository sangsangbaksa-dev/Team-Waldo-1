// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWar } from '../../src/battle/war';
import { loadWar, saveWar, WAR_SAVE_KEY } from '../../src/battle/save';

const navigation = vi.hoisted(() => ({
  openWar: vi.fn<(onExit: () => void, options: { forceNew: boolean; difficulty: string }) => void>(),
  preview: vi.fn<(mount: HTMLElement) => () => void>(),
  disposePreview: vi.fn(),
}));
vi.mock('../../src/battle/view', () => ({ openWar: navigation.openWar }));
vi.mock('../../src/battle/preview', () => ({ createLandingPreview: navigation.preview }));

function button(selector: string): HTMLButtonElement {
  const value = document.querySelector<HTMLButtonElement>(selector);
  if (!value) throw new Error(`Missing menu button: ${selector}`);
  return value;
}
async function loadMenu(): Promise<void> {
  await import('../../src/main');
  await vi.dynamicImportSettled();
}
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  document.body.innerHTML = '<div id="game"></div>';
  localStorage.clear(); navigation.preview.mockReturnValue(navigation.disposePreview);
});
afterEach(async () => {
  await vi.dynamicImportSettled();
  document.querySelector<HTMLButtonElement>('.dialog-cancel')?.click();
  document.body.replaceChildren(); localStorage.clear();
});

describe('grand-battle-only navigation', () => {
  it('exposes a single 100 vs 500 start action and ignores repeat clicks', async () => {
    await loadMenu(); button('#difficulty-hard').click();
    expect(document.querySelector('#legacy')).toBeNull();
    expect(document.querySelector('#start-grand')).toBeNull();
    expect(button('#start-war').getAttribute('aria-label')).toContain('100명');
    const start = button('#start-war');
    start.click(); start.click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledTimes(1);
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), {
      forceNew: true, difficulty: 'hard',
    });
    expect(navigation.disposePreview).toHaveBeenCalledTimes(1);
  });

  it('opens settings despite corrupt save, career and preferences', async () => {
    localStorage.setItem(WAR_SAVE_KEY, '{not valid JSON');
    localStorage.setItem('waldo.career.v1', '{also broken');
    localStorage.setItem('waldo.preferences.v1', 'null');
    await loadMenu();
    expect(document.querySelector('.landing')).not.toBeNull();
    expect(document.querySelector('#continue-war')).toBeNull();
    expect(button('#start-war').disabled).toBe(false);
    button('#preferences').click();
    expect(document.querySelector('.game-dialog')).not.toBeNull();
    expect(document.querySelector<HTMLSelectElement>('#menu-quality')?.value).toMatch(/^(high|standard)$/);
    button('.dialog-cancel').click();
    expect(button('#start-war').disabled).toBe(false);
  });

  it('continues a large saved hard match at its original difficulty', async () => {
    const saved = createWar({ grandBattle: true, difficulty: 'hard' }); saved.time = 83;
    expect(saveWar(saved)).toBe(true);
    await loadMenu();
    expect(button('#continue-war').textContent).toContain('1분 23초');
    expect(button('#continue-war').textContent).toContain('도전');
    button('#difficulty-easy').click(); button('#continue-war').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), {
      forceNew: false, difficulty: 'hard',
    });
    expect(loadWar()).toEqual(saved);
  });

  it('never resumes a deprecated small skirmish, even when the old save exists', async () => {
    const skirmish = createWar({ difficulty: 'easy' });
    expect(saveWar(skirmish)).toBe(true);
    await loadMenu();
    expect(document.querySelector('#continue-war')).toBeNull();
    button('#start-war').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), {
      forceNew: true, difficulty: 'normal',
    });
  });
});
