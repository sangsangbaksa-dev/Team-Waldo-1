import { describe, expect, it } from 'vitest';
import { Match, blankInput, type Vehicle } from '../../src/shooter/sim';
import { DRIVE, RED, VEHICLES } from '../../src/shooter/config';

const mk = (seed = 7, extra: { fill?: number } = {}): Match => new Match({ seed, mode: 'br', difficulty: 'normal', humans: [{ name: '나' }], vehicles: true, bombs: true, ...extra });
const run = (m: Match, sec: number): void => { for (let i = 0; i < sec * 60 && !m.over; i++) { m.step(1 / 60); m.drain(); } };
/** 사람 한 명뿐인 땅 위 경기에서, 빈 들판 가운데로 차 한 대를 옮겨 놓습니다 */
function lot(): { m: Match; v: Vehicle } {
  const m = mk(7, { fill: 1 }); const v = m.vehicles.find(x => !x.wreck)!; m.map.boxes.forEach((b, i) => { if (i !== v.box) { b.y0 = 999; b.y1 = 1000; } });
  v.x = 0; v.z = 0; v.yaw = 0; const p = m.players[0]; p.x = v.x - 3; p.z = v.z + 3; p.yaw = 0; return { m, v };
}

describe('ZERO ZONE 차량', () => {
  it('솔로 판에는 운전할 수 있는 차량이 충분히 있고, 꺼 두면 없다', () => {
    for (const seed of [3, 7, 11, 19]) { const m = mk(seed); expect(m.vehicles.length).toBeGreaterThanOrEqual(12); for (const v of m.vehicles) { expect(VEHICLES[v.kind]).toBeTruthy(); expect(m.map.boxes[v.box].kind).toBe('vehicle'); } }
    expect(new Match({ seed: 7, mode: 'br', difficulty: 'normal', humans: [{ name: '나' }] }).vehicles).toHaveLength(0);
  });
  it('가까운 빈 차에 E 로 타고, 다시 E 로 내린다. 타는 동안에는 길을 막던 상자가 꺼진다', () => {
    const { m, v } = lot(); const p = m.players[0];
    p.input = { ...blankInput(), interact: true }; m.step(1 / 60); expect(p.veh).toBe(v.id); expect(v.driver).toBe(0); expect(m.map.boxes[v.box].y0).toBeGreaterThan(100);
    p.input.interact = false; run(m, 0.2); p.input.interact = true; m.step(1 / 60); expect(p.veh).toBe(-1); expect(v.driver).toBe(-1);
  });
  it('엑셀을 밟으면 가속하고 최고 속도를 넘지 않으며, 놓으면 멈춰 서서 다시 상자가 된다', () => {
    const { m, v } = lot(); const p = m.players[0]; p.input = { ...blankInput(), interact: true }; m.step(1 / 60); p.input.interact = false;
    p.input.mz = 1; run(m, 2); expect(v.speed).toBeGreaterThan(8); expect(v.x).toBeGreaterThan(5);
    run(m, 5); expect(v.speed).toBeLessThanOrEqual(VEHICLES[v.kind].top + 0.01);
    p.input.mz = 0; p.input.jump = true; run(m, 6); expect(Math.abs(v.speed)).toBeLessThan(0.2);
  });
  it('핸들을 꺾으면 방향이 바뀌고, 서 있을 때는 돌지 않는다', () => {
    const { m, v } = lot(); const p = m.players[0]; p.input = { ...blankInput(), interact: true }; m.step(1 / 60); p.input.interact = false;
    p.input.mx = 1; run(m, 1); expect(v.yaw).toBeCloseTo(0, 5);
    p.input.mz = 1; run(m, 2); p.input.mx = 1; run(m, 1.5); expect(v.yaw).toBeGreaterThan(0.5);
  });
  it('차에 치이면 속도에 비례한 피해를 입는다', () => {
    const m = mk(7, { fill: 2 }); const v = m.vehicles.find(x => !x.wreck)!; m.map.boxes.forEach((b, i) => { if (i !== v.box) { b.y0 = 999; b.y1 = 1000; } });
    const [a, b] = m.players; for (const q of m.players) { q.bot = false; q.brain = null; }
    v.x = 0; v.z = 0; v.yaw = 0; a.x = -3; a.z = 3; b.x = 14; b.z = 0; a.input = { ...blankInput(), interact: true }; m.step(1 / 60); a.input.interact = false; a.input.mz = 1;
    run(m, 4); expect(b.hp).toBeLessThan(60); expect(a.hp).toBe(100);
  });
  it('차를 쏘면 내구도가 줄고 폭발하면 차는 잔해가 되어 길을 막는다', () => {
    const { m, v } = lot(); const hp0 = v.hp; m.hurtVehicle(v, 50, 0); expect(v.hp).toBe(hp0 - 50);
    m.hurtVehicle(v, 9999, 0); expect(v.wreck).toBe(true); expect(m.map.boxes[v.box].y0).toBe(0);
    const ev = m.drain(); expect(ev.some(e => e.t === 'veh' && e.stage === 'boom')).toBe(true);
  });
  it('운전 중 폭발하면 운전자는 크게 다치고 차에서 튕겨 나온다', () => {
    const { m, v } = lot(); const p = m.players[0]; p.input = { ...blankInput(), interact: true }; m.step(1 / 60); p.input.interact = false;
    m.hurtVehicle(v, 9999, -1); expect(p.veh).toBe(-1); expect(p.hp).toBeLessThan(100); expect(DRIVE.boomDmg).toBeGreaterThan(50);
  });
});

describe('ZERO ZONE 폭격', () => {
  it('폭격 구역은 안전지대 시간표대로 경고되고 포탄이 떨어져 안에 선 사람이 다친다', () => {
    const m = mk(5, { fill: 1 }); expect(m.reds.length).toBe(RED.calls.length); const r = m.reds[0], p = m.players[0];
    p.air = 0; p.alt = 0; p.x = r.x; p.z = r.z; p.input = blankInput(); m.t = r.call - 0.1; run(m, 0.3);
    expect(r.called).toBe(true); m.map.boxes = []; m.map.grid.clear(); expect(m.redAt(r.x, r.z)).toBe(r);
    p.hp = 100; run(m, RED.warn + RED.dur + 3); expect(p.alive ? p.hp : 0).toBeLessThan(100); expect(m.shells.length).toBe(0);
  });
  it('봇은 폭격 구역 밖으로 빠져나간다', () => {
    const m = mk(5, { fill: 2 }); const r = m.reds[0], bot = m.players[1]; expect(bot.bot).toBe(true);
    m.map.boxes = []; m.map.grid.clear(); bot.air = 0; bot.alt = 0; bot.x = r.x + 5; bot.z = r.z; m.players[0].x = 270; m.players[0].z = 270; m.t = r.call; bot.hp = 100000;
    run(m, 12); expect(Math.hypot(bot.x - r.x, bot.z - r.z)).toBeGreaterThan(r.r * 0.8);
  });
  it('끄면 폭격이 없다', () => { expect(new Match({ seed: 5, mode: 'br', difficulty: 'normal', humans: [{ name: '나' }] }).reds).toHaveLength(0); });
});

import { PERK_MAX, buyPerk, emptyWallet, sanitizeWallet } from '../../src/shared/perks';
import { PERK_IDS, perkMul, rewardCoins, type PerkId } from '../../src/shooter/perks';
import { makeVehicleMesh } from '../../src/shared/vehicle';

describe('ZERO ZONE 병사 강화(공용 강화 규칙)', () => {
  it('코인이 모자라면 못 사고, 단계는 최대에서 멈추며, 깨진 저장값은 복구된다', () => {
    let w = emptyWallet(PERK_IDS); expect(buyPerk<PerkId>(w, 'speed')).toBeNull(); w = { ...w, coins: 5000 };
    for (let i = 0; i < PERK_MAX; i++) w = buyPerk<PerkId>(w, 'speed')!; expect(w.levels.speed).toBe(PERK_MAX); expect(buyPerk<PerkId>(w, 'speed')).toBeNull(); expect(w.coins).toBe(5000 - 150 - 320 - 560);
    expect(sanitizeWallet({ coins: -4, levels: { speed: 99, reload: 'x' } }, PERK_IDS)).toEqual({ coins: 0, levels: { speed: PERK_MAX, reload: 0, steady: 0, tough: 0 } });
  });
  it('강화한 병사는 빠르고 재장전이 짧고 덜 다친다. 봇은 영향받지 않는다', () => {
    const mk = (perks?: { speed: number; reload: number; steady: number; tough: number }): Match => new Match({ seed: 3, mode: 'duel', difficulty: 'normal', humans: [{ name: '나' }], fill: 2, perks });
    const a = mk({ speed: 3, reload: 3, steady: 3, tough: 3 }), p = a.players[0]; expect(perkMul.speed(p.perks)).toBeCloseTo(1.09); expect(perkMul.reload(p.perks)).toBeCloseTo(0.76);
    expect(a.players[1].perks.speed).toBe(0); const hp = p.hp; a.damage(p, 20, 1, 'rifle', false, 0, 1, 0, true); expect(hp - p.hp).toBeCloseTo(20 * 0.91, 5);
    expect(rewardCoins(1, 100, 5, true)).toBeGreaterThan(rewardCoins(60, 100, 0, false));
  });
});
describe('공용 차량 모델', () => { it('종류마다 메시를 만들고 부서진 모양도 만든다', () => { for (const kind of ['car', 'jeep', 'truck', 'van', 'bus']) { const g = makeVehicleMesh({ kind, w: 4.4, d: 1.9, h: 1.5, c: 0xb83a32, v: 0, wreck: false }); expect(g.children.length).toBeGreaterThan(2); } }); });
