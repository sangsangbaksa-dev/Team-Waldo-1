// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showRecordsDialog } from '../../src/battle/recordsUI';
import { EXPEDITION_RECORDS_KEY, recordExpedition } from '../../src/battle/records';
import { createWar } from '../../src/battle/war';

const navigation = vi.hoisted(() => ({ openWar: vi.fn() }));
vi.mock('../../src/battle/preview', () => ({ createLandingPreview: () => () => undefined }));
vi.mock('../../src/battle/view', () => ({ openWar: navigation.openWar }));

const el = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing record-room element: ${selector}`);
  return element;
};

function recordVictory(): void {
  const w = createWar({ mapId: 'continental', difficulty: 'hard', grandBattle: true });
  w.time = 306; w.over = true; w.winner = 0;
  for (const faction of w.factions.slice(1)) { faction.hp = 0; faction.alive = false; }
  w.units = w.units.filter(unit => unit.owner === 0);
  w.stats[0].kills = 217; w.stats[0].captures = 6;
  w.operations!.supportUses = 3;
  expect(recordExpedition(w)).toBe(true);
}

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  document.body.innerHTML = '<button id="records-opener">원정 기록실</button>';
  el('#records-opener').focus();
});
afterEach(async () => {
  await vi.dynamicImportSettled();
  document.querySelector<HTMLButtonElement>('.dialog-cancel')?.click();
  document.body.replaceChildren(); localStorage.clear();
});

describe('expedition record room', () => {
  it('opens a useful empty archive without interpreting older career stats as earned badges', () => {
    localStorage.setItem('waldo.career.v1', JSON.stringify({ matches: 99, wins: 90, bestKills: 900 }));
    showRecordsDialog();
    expect(el('.records-empty').textContent).toContain('첫 기록');
    expect(document.querySelectorAll('[data-expedition-record]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-achievement]')).toHaveLength(8);
    expect(document.querySelectorAll('.achievement-unlocked')).toHaveLength(0);
    expect(el('#records-history').hidden).toBe(false);
    expect(el('#records-achievements').hidden).toBe(true);
    expect(document.activeElement).toBe(el('#dialog-title'));
    expect(el('.records-dialog').scrollTop).toBe(0);
  });

  it('shows a completed game with truthful map, mode, result and tracked statistics', () => {
    recordVictory(); showRecordsDialog();
    const entry = el('[data-expedition-record]');
    expect(entry.classList.contains('record-victory')).toBe(true);
    expect(entry.textContent).toContain('서리 대륙');
    expect(entry.textContent).toContain('도전 · 100 대 500 군단전');
    expect(entry.textContent).toContain('5분 6초');
    expect(entry.textContent).toContain('217');
    expect(entry.textContent).toContain('3회');
    expect(entry.textContent).toContain('생산·계약 보상 금');
    expect(el('.records-storage-note').textContent).toContain('시설 내부 교환');
    expect(el('[data-record-map="continental"]').textContent).toContain('1승');
    expect(el('[data-record-map="frontier"]').textContent).toContain('0승');
    el<HTMLButtonElement>('#records-tab-achievements').click();
    expect(el('#records-history').hidden).toBe(true);
    expect(el('#records-achievements').hidden).toBe(false);
    expect(el('[data-achievement="grand-victory"]').classList.contains('achievement-unlocked')).toBe(true);
    expect(el('[data-achievement="three-frontiers"]').classList.contains('achievement-unlocked')).toBe(false);
  });

  it('supports roving keyboard tabs and preserves normal Escape focus restoration', () => {
    showRecordsDialog();
    const history = el<HTMLButtonElement>('#records-tab-history'), achievements = el<HTMLButtonElement>('#records-tab-achievements');
    history.focus();
    history.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(achievements);
    expect(achievements.tabIndex).toBe(0);
    expect(history.tabIndex).toBe(-1);
    expect(achievements.getAttribute('aria-selected')).toBe('true');
    achievements.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(history);
    history.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('.records-dialog')).toBeNull();
    expect(document.activeElement).toBe(el('#records-opener'));
    expect(el('#records-opener').inert).toBe(false);
  });

  it('uses an empty recovery state for malformed local data instead of injecting it into the dialog', () => {
    localStorage.setItem(EXPEDITION_RECORDS_KEY, JSON.stringify({ version: 1, records: [{ id: '<img src=x onerror=alert(1)>' }] }));
    showRecordsDialog();
    expect(document.querySelector('.records-empty')).not.toBeNull();
    expect(document.querySelector('.records-dialog img')).toBeNull();
    expect(el('.records-dialog').textContent).not.toContain('onerror');
  });

  it('opens exactly one archive through the actual menu record button', async () => {
    document.body.innerHTML = '<div id="game"></div>';
    await import('../../src/main'); await vi.dynamicImportSettled();
    const button = el<HTMLButtonElement>('#records'); button.focus();
    button.click(); button.click();
    await vi.dynamicImportSettled();
    expect(document.querySelectorAll('.records-dialog')).toHaveLength(1);
    expect(el('.records-dialog').textContent).toContain('원정 기록실');
    expect(navigation.openWar).not.toHaveBeenCalled();
    el<HTMLButtonElement>('.dialog-cancel').click();
    expect(document.activeElement).toBe(button);
  });

  it('cannot display a late-loading archive over a newly launched battle', async () => {
    document.body.innerHTML = '<div id="game"></div>';
    await import('../../src/main'); await vi.dynamicImportSettled();
    el<HTMLButtonElement>('#records').click();
    el<HTMLButtonElement>('#start-war').click();
    await vi.dynamicImportSettled();
    expect(navigation.openWar).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.records-dialog')).toBeNull();
  });
});
