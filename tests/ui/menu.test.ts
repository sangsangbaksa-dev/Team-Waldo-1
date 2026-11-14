// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const games = vi.hoisted(() => ({
  openCity: vi.fn<(onExit: () => void) => void>(),
  openRace: vi.fn<(onExit: () => void) => void>(),
}));
vi.mock('../../src/city/game', () => ({ openCity: games.openCity }));
vi.mock('../../src/race/game', () => ({ openRace: games.openRace }));

async function loadMenu(): Promise<void> {
  await import('../../src/main');
  await vi.dynamicImportSettled();
}
const button = (selector: string): HTMLButtonElement => {
  const el = document.querySelector<HTMLButtonElement>(selector);
  if (!el) throw new Error(`Missing: ${selector}`);
  return el;
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="game"></div>';
  localStorage.clear();
});

describe('메인 페이지', () => {
  it('LAST CITY와 SPEED RUSH 두 게임만 보여 준다', async () => {
    await loadMenu();
    const tiles = [...document.querySelectorAll<HTMLButtonElement>('.tile')];
    expect(tiles.map(t => t.dataset.game)).toEqual(['city', 'race']);
    expect(document.body.textContent).not.toMatch(/왕국 전쟁|KINGDOMS|군단전/);
  });

  it('LAST CITY 버튼이 도시 게임을 연다', async () => {
    await loadMenu();
    button('#start-city').click();
    await vi.waitFor(() => expect(games.openCity).toHaveBeenCalledTimes(1));
    expect(games.openRace).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>('#game')!.hidden).toBe(true);
  });

  it('SPEED RUSH 버튼이 레이싱 게임을 연다', async () => {
    await loadMenu();
    button('#start-race').click();
    await vi.waitFor(() => expect(games.openRace).toHaveBeenCalledTimes(1));
    expect(games.openCity).not.toHaveBeenCalled();
  });

  it('게임에서 나오면 메인 페이지가 다시 나타난다', async () => {
    await loadMenu();
    button('#start-race').click();
    await vi.waitFor(() => expect(games.openRace).toHaveBeenCalled());
    games.openRace.mock.calls[0]![0]();
    expect(document.querySelector<HTMLElement>('#game')!.hidden).toBe(false);
    expect(document.querySelectorAll('.tile')).toHaveLength(2);
  });

  it('저장된 기록이 있으면 타일에 표시한다', async () => {
    localStorage.setItem('waldo.race.v1', JSON.stringify({ best: 61.234, bestRace: 200 }));
    localStorage.setItem('waldo.city.v1', JSON.stringify({ matches: 5, wins: 2, best: 0 }));
    await loadMenu();
    expect(button('#start-race').textContent).toContain('1:01.234');
    expect(button('#start-city').textContent).toContain('5판 · 2승');
  });
});
