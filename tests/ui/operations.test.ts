// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationsPanel, operationsMarkup } from '../../src/battle/operationsUI';
import { createWar, type War } from '../../src/battle/war';
import { loadWar, saveWar } from '../../src/battle/save';
import { getOperationsState } from '../../src/battle/operations';
import type { SquadId } from '../../src/battle/squads';

/** Real DOM and game state. No simulation or support functions are mocked. */
function mount(war: War = createWar()) {
  const root = document.createElement('section');
  root.innerHTML = `<span id="operations-badge" hidden></span>${operationsMarkup}`;
  document.body.append(root);
  let selected: SquadId = 0, allowed = true;
  const focus = vi.fn(), changed = vi.fn(() => { saveWar(war); });
  const selectSquad = vi.fn((squad: SquadId) => { selected = squad; });
  const panel = createOperationsPanel(root, war, {
    selectedSquad: () => selected, selectSquad, focus, available: () => allowed, changed,
  });
  panel.refresh();
  const el = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`Missing operations control: ${selector}`);
    return node;
  };
  return { war, root, panel, el, focus, changed, selectSquad,
    available(value: boolean) { allowed = value; },
    click(selector: string) { el<HTMLButtonElement>(selector).click(); } };
}

afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('expedition command panel through real player controls', () => {
  it('presents real progress and targets the correct existing management screen', () => {
    const ui = mount();
    expect(ui.root.querySelectorAll('[role="progressbar"]')).toHaveLength(9);
    expect(ui.root.querySelectorAll('[data-support]')).toHaveLength(3);
    expect(ui.el('#contract-count').textContent).toBe('0 / 9 완료');
    expect(ui.el('#operations-badge').hidden).toBe(true);
    for (const [contract, focus] of [['foundation', 'economy'], ['recruits', 'army'], ['research', 'research'], ['commanders', 'base'], ['first-banner', 'orders']]) {
      ui.click(`[data-claim-contract="${contract}"]`);
      expect(ui.focus).toHaveBeenLastCalledWith(focus);
    }
    expect(ui.changed).not.toHaveBeenCalled();
    expect(getOperationsState(ui.war).claimed).toEqual([]);
  });

  it('claims an eligible reward once, announces it, and persists it without stealing focus', () => {
    const ui = mount(createWar({ grandBattle: true }));
    const button = ui.el<HTMLButtonElement>('[data-claim-contract="foundation"]');
    expect(button.textContent).toBe('보상 받기');
    expect(ui.el('#contract-foundation').classList.contains('contract-ready')).toBe(true);
    const gold = ui.war.factions[0].gold;
    button.focus(); button.click();
    expect(ui.war.factions[0].gold).toBe(gold + 165);
    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('수령 완료');
    expect(ui.el('#contract-count').textContent).toBe('1 / 9 완료');
    expect(ui.el('#contract-foundation [role="progressbar"]').getAttribute('aria-valuenow')).toBe('100');
    expect(ui.changed).toHaveBeenCalledTimes(1);
    expect(loadWar()?.operations?.claimed).toContain('foundation');
    button.click(); ui.panel.refresh();
    expect(ui.changed).toHaveBeenCalledTimes(1);
    expect(ui.war.factions[0].gold).toBe(gold + 165);
  });

  it('refreshes progress from simulation changes while preserving keyboard focus and node identity', () => {
    const ui = mount();
    const button = ui.el<HTMLButtonElement>('[data-claim-contract="first-banner"]');
    button.focus();
    ui.war.outposts[0].owner = 0;
    ui.panel.refresh();
    expect(ui.el('[data-claim-contract="first-banner"]')).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.textContent).toBe('보상 받기');
    expect(ui.el('#operations-badge').hidden).toBe(false);
    expect(ui.el('#operations-badge').textContent).toBe('1');
    ui.war.outposts[0].owner = 1;
    ui.panel.refresh();
    expect(button.textContent).toContain('목표 보기');
    expect(ui.el('#operations-badge').hidden).toBe(true);
    expect(ui.el('#contract-first-banner [role="progressbar"]').getAttribute('aria-valuenow')).toBe('0');
  });

  it('changes the shared squad selection and heals only injured members of that squad', () => {
    const ui = mount(), first = ui.war.units[0], second = ui.war.units[1];
    first.squad = 1; first.hp = 10;
    second.squad = 0; second.hp = 12;
    ui.click('[data-support-squad="1"]');
    expect(ui.selectSquad).toHaveBeenCalledWith(1);
    expect(ui.el('#support-squad-name').textContent).toBe('기동대');
    expect(ui.el('[data-support-squad="1"]').getAttribute('aria-pressed')).toBe('true');
    expect(ui.el('[data-support-squad="0"]').getAttribute('aria-pressed')).toBe('false');
    expect(ui.el('[data-support="medical"] [data-support-status]').textContent).toBe('1명에게 적용');
    ui.click('#support-medical');
    expect(first.hp).toBeCloseTo(28.2);
    expect(second.hp).toBe(12);
    expect(ui.changed).toHaveBeenCalledTimes(1);
    expect(ui.el<HTMLButtonElement>('#support-medical').disabled).toBe(true);
    expect(ui.el('[data-support="medical"] [data-support-label]').textContent).toBe('45초 후');
    expect(loadWar()?.operations?.supportUses).toBe(1);
  });

  it('shows active and cooling support states using simulation time', () => {
    const ui = mount();
    ui.click('#support-march');
    expect(ui.el('[data-support="march"]').classList.contains('support-active')).toBe(true);
    expect(ui.el('[data-support="march"] [data-support-label]').textContent).toBe('효과 14초');
    ui.war.time = 15; ui.panel.refresh();
    expect(ui.el('[data-support="march"]').classList.contains('support-active')).toBe(false);
    expect(ui.el('[data-support="march"] [data-support-label]').textContent).toBe('35초 후');
    ui.war.time = 50; ui.panel.refresh();
    expect(ui.el<HTMLButtonElement>('#support-march').disabled).toBe(false);
    expect(ui.el('[data-support="march"] [data-support-label]').textContent).toBe('지원 요청');
    expect(ui.el('[data-support="march"] [data-support-cost]').textContent).toBe('금 45 · 식량 35');
  });

  it('revalidates a pause or modal lock before executing a previously enabled action', () => {
    const ui = mount(createWar({ grandBattle: true }));
    const before = { gold: ui.war.factions[0].gold, food: ui.war.factions[0].food };
    expect(ui.el<HTMLButtonElement>('#support-march').disabled).toBe(false);
    ui.available(false);
    ui.click('#support-march'); ui.click('[data-claim-contract="foundation"]');
    expect(ui.changed).not.toHaveBeenCalled();
    expect(ui.war.factions[0]).toMatchObject(before);
    expect(getOperationsState(ui.war).supportUses).toBe(0);
    expect(getOperationsState(ui.war).claimed).toEqual([]);
    ui.panel.refresh();
    expect(ui.el<HTMLButtonElement>('#support-march').disabled).toBe(true);
    expect(ui.el<HTMLButtonElement>('[data-claim-contract="foundation"]').disabled).toBe(true);
    ui.available(true); ui.panel.refresh();
    expect(ui.el<HTMLButtonElement>('#support-march').disabled).toBe(false);
  });

  it('disables empty squads and unaffordable support with a useful reason', () => {
    const ui = mount();
    ui.click('[data-support-squad="2"]');
    expect(ui.el<HTMLButtonElement>('#support-shield').disabled).toBe(true);
    expect(ui.el('[data-support="shield"] [data-support-status]').textContent).toContain('생존 병력');
    ui.click('[data-support-squad="0"]');
    ui.war.factions[0].food = 0; ui.panel.refresh();
    expect(ui.el<HTMLButtonElement>('#support-shield').disabled).toBe(true);
    expect(ui.el('[data-support="shield"] [data-support-status]').textContent).toBe('자원이 부족합니다');
  });
});
