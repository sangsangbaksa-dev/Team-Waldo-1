// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atlasMarkup, bindAtlas } from '../../src/battle/atlas';
import { MAP_IDS, MAPS, type MapId } from '../../src/battle/maps';
import { createWar } from '../../src/battle/war';
import { assignSquad, type SquadId } from '../../src/battle/squads';
import { showDialog } from '../../src/ui/dialog';

function mount(mapId: MapId = 'classic') {
  const war = createWar({ mapId });
  const opener = document.createElement('button'); opener.textContent = '전체 작전 지도';
  document.body.append(opener); opener.focus();
  const dismissed = vi.fn();
  const close = showDialog({ title: '전체 작전 지도', body: atlasMarkup(war), onClose: dismissed });
  const root = document.querySelector<HTMLElement>('.game-dialog')!;
  let selected: SquadId = 0;
  const selectSquad = vi.fn((squad: SquadId) => { selected = squad; });
  const orderAt = vi.fn(), viewAt = vi.fn();
  bindAtlas(root, war, { squad: () => selected, selectSquad, orderAt, viewAt, viewport: () => [] });
  const el = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const value = root.querySelector<T>(selector);
    if (!value) throw new Error(`Missing atlas control: ${selector}`);
    return value;
  };
  return { war, root, opener, close, dismissed, selectSquad, orderAt, viewAt, el,
    click(selector: string) { el<HTMLButtonElement>(selector).click(); } };
}

beforeEach(() => {
  // happy-dom has no rasterizer; map coordinates, actual DOM events and dialogs stay real.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  document.querySelector<HTMLButtonElement>('.dialog-cancel')?.click();
  document.body.replaceChildren(); vi.restoreAllMocks();
});

describe('reviewed atlas orders', () => {
  for (const mapId of MAP_IDS) {
    it(`uses the full ${mapId} map and its actual named objectives`, () => {
      const ui = mount(mapId), map = MAPS[mapId];
      expect(ui.root.classList.contains('atlas-dialog')).toBe(true);
      expect(ui.root.textContent).toContain(`${map.halfSize * 2} × ${map.halfSize * 2}`);
      expect(ui.root.querySelectorAll('[data-atlas-post]')).toHaveLength(map.outposts.length);
      expect(ui.el('#atlas-selection-text').textContent).toContain('내 본부');
      const post = map.outposts.at(-1)!;
      ui.click(`[data-atlas-post="${map.outposts.length - 1}"]`);
      expect(ui.el('#atlas-selection-text').textContent).toContain(post.name);
      expect(ui.el('#atlas-selection-text').textContent).toContain(`금 +${post.gold}/초`);
      expect(ui.orderAt).not.toHaveBeenCalled();
      expect(ui.war.squadOrders).toEqual([null, null, null]);
      ui.click('#atlas-order');
      expect(ui.orderAt).toHaveBeenCalledExactlyOnceWith(post.x, post.z);
    });
  }

  it('keeps empty squads uncommandable and sends the chosen group only after confirmation', () => {
    const ui = mount('continental');
    ui.click('[data-atlas-squad="1"]');
    expect(ui.selectSquad).toHaveBeenCalledWith(1);
    expect(ui.el('[data-atlas-squad="1"]').getAttribute('aria-pressed')).toBe('true');
    expect(ui.el<HTMLButtonElement>('#atlas-order').disabled).toBe(true);
    ui.click('#atlas-order');
    expect(ui.orderAt).not.toHaveBeenCalled();
    assignSquad(ui.war, 1, 3);
    ui.click('[data-atlas-post="16"]');
    expect(ui.el<HTMLButtonElement>('#atlas-order').disabled).toBe(false);
    expect(ui.el('#atlas-order').textContent).toContain('기동대');
    expect(ui.orderAt).not.toHaveBeenCalled();
    ui.click('#atlas-order');
    expect(ui.orderAt).toHaveBeenCalledExactlyOnceWith(-140, 345);
  });

  it('maps pointer positions to expanded-world coordinates instead of the classic extent', () => {
    const ui = mount('continental'), canvas = ui.el<HTMLCanvasElement>('#atlas-map');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ x: 20, y: 30, left: 20, top: 30, right: 580, bottom: 590, width: 560, height: 560, toJSON: () => ({}) });
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 580, clientY: 30, bubbles: true }));
    expect(ui.orderAt).not.toHaveBeenCalled();
    expect(ui.el('#atlas-selection-text').textContent).toContain('515, -515');
    ui.click('#atlas-center');
    expect(ui.viewAt).toHaveBeenCalledExactlyOnceWith(515, -515);
    expect(ui.orderAt).not.toHaveBeenCalled();
    expect(canvas.getAttribute('aria-label')).toContain('515, -515');
  });

  it('supports keyboard selection, accelerates with Shift, and clamps to the selected map', () => {
    const ui = mount('frontier'), canvas = ui.el<HTMLCanvasElement>('#atlas-map');
    const press = (key: string, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
      canvas.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    };
    canvas.focus(); press('ArrowRight');
    ui.click('#atlas-center');
    expect(ui.viewAt).toHaveBeenLastCalledWith(-190.5, -210);
    press('ArrowDown', true); ui.click('#atlas-center');
    expect(ui.viewAt).toHaveBeenLastCalledWith(-190.5, -132);
    for (let i = 0; i < 20; i++) press('ArrowRight', true);
    ui.click('#atlas-center');
    expect(ui.viewAt).toHaveBeenLastCalledWith(385, -132);
    expect(ui.orderAt).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(canvas);
  });

  it('closes with Escape without issuing an order and restores the opener and outside interaction', () => {
    const ui = mount('frontier');
    expect(ui.opener.inert).toBe(true);
    ui.click('[data-atlas-post="12"]');
    ui.el('#atlas-map').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('.atlas-dialog')).toBeNull();
    expect(ui.orderAt).not.toHaveBeenCalled();
    expect(ui.viewAt).not.toHaveBeenCalled();
    expect(ui.war.squadOrders).toEqual([null, null, null]);
    expect(ui.dismissed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(ui.opener);
    expect(ui.opener.inert).toBe(false);
    ui.close();
    expect(ui.dismissed).toHaveBeenCalledTimes(1);
  });

  it('never enables an order for a defeated player while retaining a readable map', () => {
    const ui = mount();
    ui.war.factions[0].alive = false;
    ui.click('[data-atlas-post="4"]');
    expect(ui.el('[data-atlas-post="4"]').textContent).toContain('중앙 요새');
    expect(ui.el('#atlas-selection-text').textContent).toContain('0, 0');
    expect(ui.el<HTMLButtonElement>('#atlas-order').disabled).toBe(true);
    ui.click('#atlas-order');
    expect(ui.orderAt).not.toHaveBeenCalled();
  });
});
