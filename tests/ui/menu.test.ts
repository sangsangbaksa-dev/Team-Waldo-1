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

describe('menu navigation and recovery', () => {
  it('offers only grand battles and ignores repeated launch clicks', async () => {
    await loadMenu(); button('#difficulty-hard').click();
    expect(document.querySelector('#start-war')).toBeNull();
    expect(document.querySelector('#legacy')).toBeNull();
    const launch = button('#start-grand');
    launch.click(); launch.click();
    expect(launch.disabled).toBe(true);
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledTimes(1);
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), { forceNew: true, difficulty: 'hard' });
    expect(navigation.disposePreview).toHaveBeenCalledTimes(1);
    navigation.openWar.mock.calls[0][0]();
    await vi.dynamicImportSettled();
    expect(button('#start-grand').disabled).toBe(false);
  });

  it('keeps old small-battle saves until a new grand battle is confirmed', async () => {
    const saved = createWar();
    saveWar(saved);
    await loadMenu();
    expect(document.querySelector('#continue-war')).toBeNull();
    button('#start-grand').click();
    expect(document.querySelector('.dialog-body')?.textContent).toContain('소규모');
    button('.dialog-cancel').click();
    expect(navigation.openWar).not.toHaveBeenCalled();
    expect(loadWar()).toEqual(saved);
    button('#start-grand').click(); button('.dialog-confirm').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ forceNew: true }));
  });

  it('recovers a usable menu when the battle cannot initialize', async () => {
    navigation.openWar.mockImplementationOnce(() => { throw new Error('Startup failed'); });
    await loadMenu(); button('#start-grand').click();
    await vi.dynamicImportSettled();
    expect(button('#start-grand').disabled).toBe(false);
    expect(document.querySelector<HTMLDivElement>('#game')?.hidden).toBe(false);
    expect(document.querySelector('.game-dialog')?.textContent).toContain('불러오지 못했어요');
  });

  it('opens the menu and settings even when saved battle, career, and preferences are corrupt', async () => {
    localStorage.setItem(WAR_SAVE_KEY, '{not valid JSON');
    localStorage.setItem('waldo.career.v1', '{also broken');
    localStorage.setItem('waldo.preferences.v1', 'null');
    await loadMenu();
    expect(document.querySelector('.landing')).not.toBeNull();
    expect(document.querySelector('#continue-war')).toBeNull();
    expect(button('#start-grand').disabled).toBe(false);
    button('#preferences').click();
    expect(document.querySelector('.game-dialog')).not.toBeNull();
    expect(document.querySelector<HTMLSelectElement>('#menu-quality')?.value).toMatch(/^(high|standard)$/);
    button('.dialog-cancel').click();
    expect(button('#start-grand').disabled).toBe(false);
  });

  it('continues a saved hard match at its saved difficulty despite a different new-game selection', async () => {
    const saved = createWar({ difficulty: 'hard', grandBattle: true }); saved.time = 83;
    expect(saveWar(saved)).toBe(true);
    await loadMenu();
    expect(button('#continue-war').textContent).toContain('1분 23초');
    expect(button('#continue-war').textContent).toContain('도전');
    button('#difficulty-easy').click(); button('#continue-war').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledTimes(1);
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), { forceNew: false, difficulty: 'hard' });
    expect(loadWar()).toEqual(saved);
  });
});
