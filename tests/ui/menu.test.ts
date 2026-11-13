// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWar } from '../../src/battle/war';
import { loadWar, saveWar, WAR_SAVE_KEY } from '../../src/battle/save';
import { MAPS, type MapId } from '../../src/battle/maps';

const navigation = vi.hoisted(() => ({
  openWar: vi.fn<(onExit: () => void, options: { forceNew: boolean; difficulty: string; mapId?: string; grandBattle?: boolean }) => void>(),
  startLegacy: vi.fn<(parent: HTMLElement, onExit: () => void) => void>(),
  preview: vi.fn<(mount: HTMLElement, mapId?: MapId) => () => void>(),
  disposePreview: vi.fn(),
}));
vi.mock('../../src/battle/view', () => ({ openWar: navigation.openWar }));
vi.mock('../../src/legacy', () => ({ startLegacy: navigation.startLegacy }));
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
  it('starts only one classic engine when classic and strategy controls are clicked rapidly', async () => {
    await loadMenu();
    const classic = button('#legacy'), strategy = button('#start-war');
    classic.click(); classic.click(); strategy.click();
    expect(classic.disabled).toBe(true);
    expect(strategy.disabled).toBe(true);
    await vi.dynamicImportSettled();
    expect(navigation.startLegacy).toHaveBeenCalledTimes(1);
    expect(navigation.openWar).not.toHaveBeenCalled();
    expect(navigation.disposePreview).toHaveBeenCalledTimes(1);

    // An ordinary return from the engine creates a fresh, usable menu generation.
    navigation.startLegacy.mock.calls[0][1]();
    await vi.dynamicImportSettled();
    expect(button('#start-war').disabled).toBe(false);
    button('#start-war').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledTimes(1);
    expect(navigation.startLegacy).toHaveBeenCalledTimes(1);
  });

  it('starts only one strategy engine when start and classic are clicked rapidly', async () => {
    await loadMenu(); button('#difficulty-hard').click();
    const strategy = button('#start-war'), classic = button('#legacy');
    strategy.click(); strategy.click(); classic.click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledTimes(1);
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), { forceNew: true, difficulty: 'hard' });
    expect(navigation.startLegacy).not.toHaveBeenCalled();
  });

  it('opens the menu and settings even when saved battle, career, and preferences are corrupt', async () => {
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

  it('continues a saved hard match at its saved difficulty despite a different new-game selection', async () => {
    const saved = createWar({ difficulty: 'hard' }); saved.time = 83;
    expect(saveWar(saved)).toBe(true);
    await loadMenu();
    expect(button('#continue-war').textContent).toContain('1분 23초');
    expect(button('#continue-war').textContent).toContain('도전');
    button('#difficulty-easy').click(); button('#continue-war').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledTimes(1);
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), { forceNew: false, difficulty: 'hard' });
    expect(loadWar()).toEqual(saved);
    expect(navigation.startLegacy).not.toHaveBeenCalled();
  });

  it('launches the selected expanded battlefield and explains its actual size and territory count', async () => {
    await loadMenu();
    const continental = button('[data-map="continental"]');
    expect(continental.getAttribute('aria-label')).toContain(String(MAPS.continental.halfSize * 2));
    expect(continental.getAttribute('aria-label')).toContain(`${MAPS.continental.outposts.length}개 거점`);
    continental.click();
    expect(continental.getAttribute('aria-pressed')).toBe('true');
    expect(button('[data-map="classic"]').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('#map-description')?.textContent).toContain(MAPS.continental.description);
    button('#difficulty-easy').click();
    expect(document.querySelector('#launch-map-name')?.textContent).toContain('서리 대륙 · 입문');
    button('#start-war').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), {
      forceNew: true, difficulty: 'easy', mapId: 'continental',
    });
  });

  it('combines the selected large map with grand-battle mode', async () => {
    await loadMenu();
    button('[data-map="frontier"]').click();
    button('#start-grand').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), {
      forceNew: true, difficulty: 'normal', grandBattle: true, mapId: 'frontier',
    });
  });

  it('keeps a saved expanded map when continuing after choosing another new-game map', async () => {
    const saved = createWar({ difficulty: 'hard', mapId: 'frontier' });
    saved.time = 91;
    expect(saveWar(saved)).toBe(true);
    await loadMenu();
    expect(button('#continue-war').textContent).toContain(MAPS.frontier.name);
    button('[data-map="continental"]').click();
    button('#difficulty-easy').click();
    button('#continue-war').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledWith(expect.any(Function), {
      forceNew: false, difficulty: 'hard',
    });
    expect(loadWar()?.mapId).toBe('frontier');
    expect(loadWar()?.outposts).toHaveLength(MAPS.frontier.outposts.length);
  });

  it('leaves the previous campaign intact when a new expanded-map launch is cancelled', async () => {
    const saved = createWar({ mapId: 'classic' });
    expect(saveWar(saved)).toBe(true);
    await loadMenu();
    button('[data-map="continental"]').click();
    button('#start-war').click();
    expect(document.querySelector('.dialog-body')?.textContent).toContain(MAPS.continental.name);
    button('.dialog-cancel').click();
    expect(navigation.openWar).not.toHaveBeenCalled();
    expect(loadWar()).toEqual(saved);
    expect(button('#start-war').disabled).toBe(false);
  });

  it('only mounts the latest map preview and cannot mount a late preview over a launched battle', async () => {
    await loadMenu();
    expect(navigation.preview).toHaveBeenCalledTimes(1);
    button('[data-map="frontier"]').click();
    button('[data-map="continental"]').click();
    await vi.dynamicImportSettled();
    expect(navigation.preview).toHaveBeenCalledTimes(2);
    expect(navigation.preview).toHaveBeenLastCalledWith(expect.any(HTMLElement), 'continental');
    button('[data-map="frontier"]').click();
    button('#start-war').click();
    await vi.dynamicImportSettled();
    expect(navigation.preview).toHaveBeenCalledTimes(2);
    expect(navigation.openWar).toHaveBeenCalledTimes(1);
  });
});
