// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const games = vi.hoisted(() => ({
  openCity: vi.fn<(onExit: () => void) => void>(),
  openRace: vi.fn<(onExit: () => void) => void>(),
  openRts: vi.fn<(onExit: () => void) => void>(),
  openShooter: vi.fn<(onExit: () => void) => void>(),
  openOutlaw: vi.fn<(onExit: () => void) => void>(),
  openTycoon: vi.fn<(onExit: () => void) => void>(),
  openSky: vi.fn<(onExit: () => void) => void>(),
}));
vi.mock('../../src/city/game', () => ({ openCity: games.openCity }));
vi.mock('../../src/race/game', () => ({ openRace: games.openRace }));
vi.mock('../../src/rts/game', () => ({ openRts: games.openRts }));
vi.mock('../../src/shooter/game', () => ({ openShooter: games.openShooter }));
vi.mock('../../src/outlaw/game', () => ({ openOutlaw: games.openOutlaw }));
vi.mock('../../src/tycoon/game', () => ({ openTycoon: games.openTycoon }));
vi.mock('../../src/sky/game', () => ({ openSky: games.openSky }));

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
  history.replaceState(null, '', '/'); // 이전 테스트가 남긴 #/게임 주소로 자동 실행되지 않게
});

describe('메인 페이지', () => {
  it('10개 게임 타일을 보여 준다', async () => {
    await loadMenu();
    const tiles = [...document.querySelectorAll<HTMLButtonElement>('.tile')];
    expect(tiles.map(t => t.dataset.game)).toEqual(['slack', 'squad', 'city', 'race', 'rts', 'shooter', 'outlaw', 'tycoon', 'sky', 'room-tone']);
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

  it('FRONTLINE 버튼이 실시간 전략 게임을 연다', async () => {
    await loadMenu();
    button('#start-rts').click();
    await vi.waitFor(() => expect(games.openRts).toHaveBeenCalledTimes(1));
    expect(games.openCity).not.toHaveBeenCalled(); expect(games.openRace).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>('#game')!.hidden).toBe(true);
  });

  it('ZERO ZONE 버튼이 슈팅 게임을 연다', async () => {
    await loadMenu();
    button('#start-shooter').click();
    await vi.waitFor(() => expect(games.openShooter).toHaveBeenCalledTimes(1));
    expect(games.openCity).not.toHaveBeenCalled();
    expect(games.openRace).not.toHaveBeenCalled();
  });

  it('OUTLAW CITY를 실행하고 나오면 10개 게임이 다시 나타난다', async () => {
    await loadMenu();
    button('#start-outlaw').click();
    await vi.waitFor(() => expect(games.openOutlaw).toHaveBeenCalledTimes(1));
    expect(document.querySelector<HTMLElement>('#game')!.hidden).toBe(true);
    games.openOutlaw.mock.calls[0]![0]();
    expect(document.querySelector<HTMLElement>('#game')!.hidden).toBe(false);
    expect(document.querySelectorAll('.tile')).toHaveLength(10);
  });

  it('HUSTLE을 실행하고 나오면 10개 게임이 다시 나타난다', async () => {
    await loadMenu();
    button('#start-tycoon').click();
    await vi.waitFor(() => expect(games.openTycoon).toHaveBeenCalledTimes(1));
    expect(document.querySelector<HTMLElement>('#game')!.hidden).toBe(true);
    games.openTycoon.mock.calls[0]![0]();
    expect(document.querySelector<HTMLElement>('#game')!.hidden).toBe(false);
    expect(document.querySelectorAll('.tile')).toHaveLength(10);
  });

  it('저장된 기록이 있으면 타일에 표시한다', async () => {
    localStorage.setItem('waldo.race.v1', JSON.stringify({ best: 61.234, bestRace: 200 }));
    localStorage.setItem('waldo.city.v1', JSON.stringify({ matches: 5, wins: 2, best: 0 }));
    localStorage.setItem('waldo.shooter.v1', JSON.stringify({ matches: 3, wins: 1, bestKills: 7, level: 'hard' }));
    await loadMenu();
    expect(button('#start-race').textContent).toContain('선셋 서킷 최고 랩 1:01.234');
    expect(button('#start-city').textContent).toContain('5판 · 2승');
    localStorage.setItem('waldo.rts.v1', JSON.stringify({ difficulty: 'hard', matches: 4, wins: 1, bestWin: {} }));
    vi.resetModules(); document.body.innerHTML = '<div id="game"></div>'; await loadMenu();
    expect(button('#start-rts').textContent).toContain('4판 · 1승');
    expect(button('#start-shooter').textContent).toContain('3판 · 1승');
  });

  it('소리 토글이 설정을 저장하고 다시 켤 수 있다', async () => {
    await loadMenu();
    expect(button('#sound-toggle').getAttribute('aria-pressed')).toBe('true');
    button('#sound-toggle').click();
    expect(button('#sound-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(button('#sound-toggle').textContent).toContain('꺼짐');
    expect(JSON.parse(localStorage.getItem('waldo.preferences.v1')!).sound).toBe(false);
    button('#sound-toggle').click();
    expect(JSON.parse(localStorage.getItem('waldo.preferences.v1')!).sound).toBe(true);
  });

  it('저장된 꺼짐 상태로 시작하고 다른 설정은 유지한다', async () => {
    localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'low' }));
    await loadMenu();
    expect(button('#sound-toggle').getAttribute('aria-pressed')).toBe('false');
    button('#sound-toggle').click();
    expect(JSON.parse(localStorage.getItem('waldo.preferences.v1')!)).toMatchObject({ sound: true, quality: 'low' });
  });
});

describe('게임 주소·뒤로가기', () => {
  it('게임을 열면 #/게임 주소가 붙고, 목록으로 돌아오면 지워진다', async () => {
    await loadMenu();
    button('#start-rts').click();
    await vi.waitFor(() => expect(games.openRts).toHaveBeenCalledTimes(1));
    expect(location.hash).toBe('#/rts');
    expect(document.title).toContain('FRONTLINE');
    games.openRts.mock.calls[0]![0]();
    expect(location.hash).toBe('');
    expect(document.title).toContain('10편');
  });
  it('주소에 #/게임이 있으면 그 게임 화면을 바로 연다', async () => {
    history.replaceState(null, '', '/#/sky');
    await loadMenu();
    await vi.waitFor(() => expect(games.openSky).toHaveBeenCalledTimes(1));
  });
});
