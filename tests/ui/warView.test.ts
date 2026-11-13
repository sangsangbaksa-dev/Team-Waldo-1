// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerspectiveCamera } from 'three';
import type { War } from '../../src/battle/war';
import { loadWar } from '../../src/battle/save';
import { openWar } from '../../src/battle/view';

/** Exercise the real UI, simulation, persistence, and dialogs; replace only drawing/audio. */
const boundaries = vi.hoisted(() => ({
  renderers: [] as Array<{
    domElement: HTMLCanvasElement;
    render: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  graphics: [] as Array<{
    update: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    setQuality: ReturnType<typeof vi.fn>;
    setReducedMotion: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  class RendererBoundary {
    domElement = document.createElement('canvas');
    shadowMap = { enabled: false, type: 0 };
    outputColorSpace = '';
    toneMapping = 0;
    toneMappingExposure = 1;
    render = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    constructor() { boundaries.renderers.push(this); }
  }
  return { ...actual, WebGLRenderer: RendererBoundary };
});
vi.mock('../../src/battle/graphics', () => ({
  FACTION_COLORS: [0x48ac8c, 0xd96957, 0xddbb63, 0x9d80c9],
  createBattleWorld: () => {
    const graphics = { update: vi.fn(), dispose: vi.fn(), setQuality: vi.fn(), setReducedMotion: vi.fn() };
    boundaries.graphics.push(graphics); return graphics;
  },
}));
vi.mock('../../src/battle/audio', () => ({
  BattleAudio: class {
    unlock = vi.fn();
    setMuted = vi.fn();
    play = vi.fn();
    dispose = vi.fn();
  },
}));

interface GameHandle {
  world: War;
  camera: PerspectiveCamera;
  ui: () => void;
}
function game(): GameHandle {
  const handle = (window as unknown as { __war?: GameHandle }).__war;
  if (!handle) throw new Error('The development battle handle was not created.');
  return handle;
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing user-interface element: ${selector}`);
  return node;
}
const button = (selector: string) => element<HTMLButtonElement>(selector);
const click = (selector: string) => button(selector).click();
const key = (target: HTMLElement, value: string, extra: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra }));

let now = 0;
let nextFrame = 0;
let frames = new Map<number, FrameRequestCallback>();
/** Drive real fixed simulation ticks without wall-clock waits or mocked game rules. */
function advanceFrames(amount: number, milliseconds = 50): void {
  for (let i = 0; i < amount; i++) {
    now += milliseconds;
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(now);
  }
}
function denyStorageWrites(): void {
  const storage = localStorage;
  // A quota failure blocks writes but still permits reading/removing previous snapshots.
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.getItem(key),
    removeItem: (key: string) => storage.removeItem(key),
    clear: () => storage.clear(),
    setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); },
  });
}
function completeVictory(): void {
  // Scenario setup only. The next normal animation frame performs elimination and results.
  for (const faction of game().world.factions.slice(1)) faction.hp = 0;
  advanceFrames(1);
  expect(element('.war-end').hidden).toBe(false);
}

beforeEach(() => {
  document.body.replaceChildren(); localStorage.clear();
  boundaries.renderers.length = 0; boundaries.graphics.length = 0;
  now = 1000; nextFrame = 0; frames = new Map();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextFrame; frames.set(id, callback); return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  // happy-dom has no layout or 2D rasterizer. Camera maths and DOM interaction stay real.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(720);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  // Always dispose through the user's exit path so window listeners cannot leak between tests.
  document.querySelector<HTMLButtonElement>('.dialog-cancel')?.click();
  const exit = document.querySelector<HTMLButtonElement>('#back') ?? document.querySelector<HTMLButtonElement>('#exit') ?? document.querySelector<HTMLButtonElement>('#back-to-menu');
  exit?.click();
  document.querySelector<HTMLButtonElement>('.dialog-confirm')?.click();
  document.querySelector<HTMLButtonElement>('#context-exit')?.click();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  frames.clear(); document.body.replaceChildren(); localStorage.clear();
  delete (window as unknown as { __war?: GameHandle }).__war;
});

describe('battle UI through real player actions', () => {
  it('opens the base command center and constructs a real building in a selected plot',()=>{
    openWar(vi.fn(),true);
    const w=game().world;
    click('#open-base');
    expect(element('.base-manager').hidden).toBe(false);
    expect(element('[data-base-panel="build"]').hidden).toBe(false);
    click('[data-base-kind="mine"]');
    click('[data-base-slot="0"]');
    expect(w.factions[0].mine).toBe(2);
    expect(w.factions[0].gold).toBe(80);
    expect(w.factions[0].food).toBe(80);
    expect(w.base?.structures.some(s=>s.kind==='mine'&&s.slot===0)).toBe(true);
    expect(element('[data-base-slot="0"]').textContent).toContain('금광');
    expect(loadWar()?.base?.structures.some(s=>s.slot===0)).toBe(true);
    click('.base-close');
    expect(element('.base-manager').hidden).toBe(true);
  });

  it('enters a mine interior, upgrades its facilities, returns by Escape and freezes combat time', () => {
    openWar(vi.fn(), true);
    const w = game().world;
    advanceFrames(6);
    click('#open-base');
    const time = w.time;
    click('[data-base-slot="6"]');
    expect(element('.base-interior').hidden).toBe(false);
    expect(element('#interior-title').textContent).toBe('지하 금광');
    expect(element('[data-base-panel="build"]').hidden).toBe(true);
    expect(button('[data-interior-command="upgrade"]').disabled).toBe(false);
    advanceFrames(10);
    expect(w.time).toBe(time);
    const goldBefore = w.factions[0].gold, foodBefore = w.factions[0].food;
    const goldBefore = w.factions[0].gold, foodBefore = w.factions[0].food;
    click('[data-interior-command="upgrade"]');
    expect(w.factions[0].mine).toBe(2);
    expect(w.factions[0].gold).toBeCloseTo(goldBefore - 60);
    expect(w.factions[0].food).toBeCloseTo(foodBefore - 20);
    expect(element('#interior-level').textContent).toBe('Lv.2 / 4');
    expect(loadWar()?.factions[0].mine).toBe(2);
    key(button('[data-interior-back]'), 'Escape');
    expect(element('.base-interior').hidden).toBe(true);
    expect(element('[data-base-panel="build"]').hidden).toBe(false);
    key(button('.base-close'), 'Escape');
    expect(element('.base-manager').hidden).toBe(true);
    advanceFrames(4);
    expect(w.time).toBeGreaterThan(time);
  });

  it('uses the barracks interior to train soldiers and research upgraded weapons', () => {
    openWar(vi.fn(), true);
    const w = game().world;
    w.factions[0].gold = 2000; w.factions[0].food = 2000;
    click('#open-base');
    click('[data-base-slot="16"]');
    expect(element('#interior-title').textContent).toBe('왕립 병영');
    expect(button('.interior-action[data-interior-command="special"]').disabled).toBe(true);
    click('.interior-action[data-interior-command="upgrade"]');
    expect(w.factions[0].barracks).toBe(2);
    click('.interior-action[data-interior-command="special"]');
    expect(w.factions[0].research.weapons).toBe(1);
    click('.interior-action[data-interior-command="service"]');
    expect(w.units.filter(u => u.owner === 0)).toHaveLength(7);
    expect(loadWar()?.stats[0].trained).toBe(3);
    click('[data-interior-back]');
    expect(element('.base-interior').hidden).toBe(true);
    expect(element('[data-base-slot="16"]').textContent).toContain('병영');
  });

  it('recruits a general, assigns a squad and persists the command assignment',()=>{
    openWar(vi.fn(),true);
    const w=game().world;
    w.factions[0].gold=1000;w.factions[0].food=1000;
    click('#tab-army');click('#open-base-generals');
    expect(element('[data-base-panel="generals"]').hidden).toBe(false);
    click('[data-base-recruit="leon"]');
    expect(w.base?.generals.find(g=>g.id==='leon')?.squad).toBeNull();
    const select=element<HTMLSelectElement>('[data-base-assignment="leon"]');
    select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));
    expect(w.base?.generals.find(g=>g.id==='leon')?.squad).toBe(1);
    expect(loadWar()?.base?.generals.find(g=>g.id==='leon')?.squad).toBe(1);
    click('.base-close');
  });

  it('switches to relocation mode without entering the building interior',()=>{
    openWar(vi.fn(),true);
    const w=game().world;
    click('#open-base');
    const oldGold=w.factions[0].gold;
    click('[data-base-relocate]');
    expect(button('[data-base-relocate]').getAttribute('aria-pressed')).toBe('true');
    click('[data-base-slot="6"]');
    expect(element('[data-base-slot="6"]').classList.contains('relocating-from')).toBe(true);
    click('[data-base-slot="0"]');
    expect(w.base?.structures.find(s=>s.kind==='mine')?.slot).toBe(0);
    expect(w.factions[0].gold).toBe(oldGold);
    expect(loadWar()?.base?.structures.some(s=>s.kind==='mine'&&s.slot===0)).toBe(true);
    expect(button('[data-base-relocate]').getAttribute('aria-pressed')).toBe('false');
  });

  it('lets a recruited commander activate and save a timed battlefield ability',()=>{
    openWar(vi.fn(),true);
    const w=game().world;
    w.factions[0].gold=1000;w.factions[0].food=1000;
    click('#open-base');click('[data-base-tab="generals"]');
    const ability=button('[data-general-ability="leon"]');
    expect(ability.disabled).toBe(true);
    click('[data-base-recruit="leon"]');
    expect(ability.disabled).toBe(true);
    const assignment=element<HTMLSelectElement>('[data-base-assignment="leon"]');
    assignment.value='0';assignment.dispatchEvent(new Event('change',{bubbles:true}));
    expect(ability.disabled).toBe(false);
    click('[data-general-ability="leon"]');
    expect(ability.disabled).toBe(true);
    expect(element('[data-general-ability-state="leon"]').textContent).toContain('효과 적용 중');
    expect(loadWar()?.base?.generals[0].activeUntil).toBe(10);
  });

  it('opens the command center with K and dismisses it using Escape',()=>{
    openWar(vi.fn(),true);
    key(document.body,'k');
    expect(element('.base-manager').hidden).toBe(false);
    key(button('.base-close'),'Escape');
    expect(element('.base-manager').hidden).toBe(true);
  });
  it('lets a player split, select, independently order and return a squad with simple buttons', () => {
    openWar(vi.fn(), true);
    click('#tab-orders');
    click('[data-squad-select="1"]');
    expect(button('#squad-assign').disabled).toBe(false);
    click('#squad-assign');
    expect(game().world.units.filter(u => u.owner === 0 && u.squad === 1)).toHaveLength(3);
    click('#outpost-5');
    expect(game().world.squadOrders?.[1]).toEqual({ kind: 'outpost', id: 5 });
    expect(game().world.factions[0].rally).toBeNull();
    click('#quick-home');
    expect(game().world.squadOrders?.[1]).toEqual({ kind: 'home' });
    click('#squad-release');
    expect(game().world.units.filter(u => u.owner === 0 && u.squad === 1)).toHaveLength(0);
    expect(game().world.squadOrders?.[1]).toBeNull();
  });

  it('warns about an incoming HQ assault before damage and leads to the real defend control', () => {
    openWar(vi.fn(), true);
    const world = game().world;
    click('#tab-orders'); click('#outpost-5');
    world.factions[1].target = 0;
    game().ui();
    expect(world.factions[0].hp).toBe(world.factions[0].maxHp);
    expect(element('.mission-card').classList.contains('under-attack')).toBe(true);
    expect(element('#mission-title').textContent).toContain('적 병력');
    expect(element('#toast').textContent).toContain('공세가 감지');
    click('#mission-action');
    expect(button('#tab-orders').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(button('#defend'));
    expect(world.factions[0].rally).toBe(5);
    click('#defend');
    expect(world.factions[0].rally).toBeNull();
    expect(world.factions[0].target).toBeNull();
    world.factions[1].target = null;
    game().ui();
    expect(element('.mission-card').classList.contains('under-attack')).toBe(false);
    expect(element('#mission-title').textContent).toBe('풍요로운 영지의 시작');
  });

  it('trains troops, charges displayed resources, and disables unaffordable or locked training', () => {
    openWar(vi.fn(), true); click('#tab-army');
    expect(button('#train-archer').disabled).toBe(true);
    click('#train-infantry');
    expect(element('#army-count').textContent).toBe('5 / 18');
    expect(element('#gold').textContent).toBe('115');
    expect(element('#food').textContent).toBe('80');
    click('#squad-infantry');
    expect(element('#army-count').textContent).toBe('8 / 18');
    expect(button('#squad-infantry').disabled).toBe(true);
    expect(button('#train-infantry').disabled).toBe(false);
    click('#train-infantry');
    expect(element('#gold').textContent).toBe('15');
    expect(element('#food').textContent).toBe('0');
    expect(button('#train-infantry').disabled).toBe(true);
    click('#train-infantry');
    expect(game().world.units.filter(unit => unit.owner === 0)).toHaveLength(9);
    expect(game().world.stats[0].trained).toBe(5);
  });

  it('unlocks research through the barracks and applies the purchased improvement', () => {
    openWar(vi.fn(), true); click('#tab-research');
    expect(button('#research-weapons').disabled).toBe(true);
    expect(button('#research-weapons').textContent).toContain('병영 Lv.2 필요');
    click('#tab-economy'); click('#build-barracks'); click('#tab-research');
    expect(button('#research-weapons').disabled).toBe(false);
    click('#research-weapons');
    expect(game().world.factions[0].research.weapons).toBe(1);
    expect(game().world.factions[0].gold).toBe(0);
    expect(game().world.factions[0].food).toBe(30);
    expect(element('#research-summary').textContent).toContain('공격 +12%');
    expect(button('#research-weapons').disabled).toBe(true);
    expect(game().world.stats[0].researches).toBe(1);
  });

  it('keeps the same focused control while the live HUD refreshes', () => {
    openWar(vi.fn(), true); click('#tab-army');
    const train = button('#train-infantry'); train.focus();
    advanceFrames(10);
    expect(button('#train-infantry')).toBe(train);
    expect(document.activeElement).toBe(train);
    expect(game().world.time).toBeGreaterThan(0);
  });

  it('uses tab arrow keys to change tabs without moving the battlefield camera', () => {
    openWar(vi.fn(), true);
    const before = game().camera.position.clone();
    button('#tab-economy').focus(); key(button('#tab-economy'), 'ArrowRight');
    expect(document.activeElement).toBe(button('#tab-army'));
    expect(button('#tab-army').getAttribute('aria-selected')).toBe('true');
    expect(element('#pane-army').hidden).toBe(false);
    expect(element('#pane-economy').hidden).toBe(true);
    advanceFrames(12);
    expect(game().camera.position.equals(before)).toBe(true);
  });

  it('saves orders and economy, disposes the old battle, and reopens the exact saved state', () => {
    const onExit = vi.fn(); openWar(onExit, { forceNew: true, difficulty: 'hard' });
    click('#policy-growth'); click('#tab-army'); click('#train-infantry'); click('#reserve-2');
    click('#tab-orders'); click('#outpost-5'); advanceFrames(20); click('#save');
    const saved = loadWar(); expect(saved).not.toBeNull();
    const oldWorld = game().world, oldTime = oldWorld.time;
    click('#exit');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.war-ui')).toBeNull();
    expect(boundaries.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(boundaries.graphics[0].dispose).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    openWar(onExit);
    expect(game().world).toEqual(saved);
    expect(game().world).not.toBe(oldWorld);
    expect(element('#difficulty-badge').textContent).toBe('도전');
    expect(element('#toast').textContent).toContain('저장한 전투를 이어갑니다');
    advanceFrames(4);
    expect(game().world.time).toBeGreaterThan(oldTime);
    expect(oldWorld.time).toBe(oldTime);
  });

  it('freezes both time and economy during pause and resumes after Escape', () => {
    openWar(vi.fn(), true); advanceFrames(10); click('#pause');
    expect(element('.game-dialog').textContent).toContain('전투 일시정지');
    const snapshot = JSON.stringify(game().world);
    key(button('.dialog-cancel'), '1'); advanceFrames(30);
    expect(JSON.stringify(game().world)).toBe(snapshot);
    key(button('.dialog-cancel'), 'Escape');
    expect(document.querySelector('.game-dialog')).toBeNull();
    const time = game().world.time; advanceFrames(4);
    expect(game().world.time).toBeGreaterThan(time);
  });

  it('keeps settings keyboard focus in the dialog and restores the battlefield after Escape', () => {
    openWar(vi.fn(), true); const settings = button('#settings'); settings.focus(); click('#settings');
    expect(element('.war-ui').inert).toBe(true);
    const first = button('.dialog-x'), last = button('.dialog-cancel');
    last.focus(); key(last, 'Tab');
    expect(document.activeElement).toBe(first);
    key(first, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
    key(last, 'Escape');
    expect(document.querySelector('.game-dialog')).toBeNull();
    expect(element('.war-ui').inert).toBe(false);
    expect(document.activeElement).toBe(settings);
    const before = game().world.time; advanceFrames(4);
    expect(game().world.time).toBeGreaterThan(before);
  });

  it('contains result focus between the menu and retry actions while disabling background controls', () => {
    openWar(vi.fn(), true); completeVictory();
    expect(document.activeElement).toBe(element('#result-title'));
    key(element('#result-title'), 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(button('#again'));
    key(button('#again'), 'Tab');
    expect(document.activeElement).toBe(button('#back'));
    key(button('#back'), 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(button('#again'));
    expect(element('.war-top').inert).toBe(true);
    expect(element('.war-panel').inert).toBe(true);
    expect(element('.war-end').inert).toBe(false);
    click('#again');
    expect(element('.war-panel').inert).toBe(false);
    expect(button('#train-infantry').disabled).toBe(false);
  });

  it('replaces a live checkpoint with terminal state so a finished match cannot be resumed', () => {
    const onExit = vi.fn(); openWar(onExit, true); advanceFrames(5); click('#save');
    expect(loadWar()?.over).toBe(false);
    completeVictory();
    expect(loadWar()?.over).toBe(true);
    expect(loadWar()?.winner).toBe(0);
    click('#back'); openWar(onExit);
    expect(game().world.over).toBe(false);
    expect(game().world.time).toBe(0);
    expect(game().world.factions.every(faction => faction.alive)).toBe(true);
    expect(element('#toast').textContent).not.toContain('저장한 전투를 이어갑니다');
  });

  it('invalidates the old live checkpoint if saving terminal state hits storage quota', () => {
    openWar(vi.fn(), true); advanceFrames(5); click('#save');
    expect(loadWar()?.over).toBe(false);
    denyStorageWrites();
    completeVictory();
    const stored = loadWar();
    expect(stored === null || stored.over || !stored.factions[0].alive).toBe(true);
  });

  it('restarts at the same difficulty without exiting to the menu or duplicating loops', () => {
    const onExit = vi.fn(); openWar(onExit, { forceNew: true, difficulty: 'hard' });
    completeVictory(); const oldWorld = game().world, time = oldWorld.time;
    click('#again');
    expect(onExit).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.war-ui')).toHaveLength(1);
    expect(boundaries.renderers).toHaveLength(2);
    expect(boundaries.renderers[0].dispose).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
    expect(game().world.difficulty).toBe('hard');
    expect(game().world.time).toBe(0);
    advanceFrames(4);
    expect(oldWorld.time).toBe(time);
    expect(game().world.time).toBeGreaterThan(0);
    click('#exit');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('freezes after context loss, reports failed saving honestly, and resumes only after restoration', () => {
    openWar(vi.fn(), true); advanceFrames(6);
    denyStorageWrites();
    const renderer = boundaries.renderers[0], before = game().world.time, renders = renderer.render.mock.calls.length;
    const lost = new Event('webglcontextlost', { cancelable: true }); renderer.domElement.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(element('.game-dialog').textContent).toContain('저장 공간도 사용할 수 없습니다');
    expect(element('.game-dialog').textContent).not.toContain('전투 진행을 저장했습니다');
    advanceFrames(20);
    expect(game().world.time).toBe(before);
    expect(renderer.render.mock.calls.length).toBe(renders);
    click('.dialog-cancel'); advanceFrames(20);
    expect(game().world.time).toBe(before);
    renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
    advanceFrames(4);
    expect(game().world.time).toBeGreaterThan(before);
    expect(renderer.render.mock.calls.length).toBeGreaterThan(renders);
  });
});
