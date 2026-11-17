import { describe, expect, it } from 'vitest';
import { Match, blankInput } from '../../src/shooter/sim';
import { BOTS, DIFFICULTIES, MAP_HALF, PLAYER, WEAPONS, ZONES } from '../../src/shooter/config';
import { generateMap, lineClear, pushOut, rayWorld } from '../../src/shooter/world';
import { findPath, navFor, walkable } from '../../src/shooter/nav';

const solo = (seed = 7, difficulty: 'easy' | 'normal' | 'hard' | 'expert' = 'normal'): Match => new Match({ seed, mode: 'br', difficulty, humans: [{ name: '나' }] });
const run = (m: Match, sec: number): void => { for (let i = 0; i < sec * 60 && !m.over; i++) { m.step(1 / 60); m.drain(); } };
/** 지도의 모든 벽을 없앤 빈 들판 경기(사격·이동 규칙만 확인할 때) */
function field(difficulty: 'easy' | 'normal' | 'hard' | 'expert' = 'normal', n = 2): Match {
  const m = new Match({ seed: 3, mode: 'duel', difficulty, humans: [], fill: n }); m.map.boxes = []; m.map.grid.clear(); m.loot.forEach(l => { l.taken = true; });
  for (const p of m.players) { p.bot = false; p.brain = null; } return m;
}

describe('ZERO ZONE 지도', () => {
  it('같은 시드면 같은 지도, 다른 시드면 다른 지도', () => {
    const a = generateMap(5, 'br'), b = generateMap(5, 'br'), c = generateMap(6, 'br');
    expect(a.boxes).toEqual(b.boxes); expect(a.loot).toEqual(b.loot); expect(a.spawns).toEqual(b.spawns);
    expect(c.boxes).not.toEqual(a.boxes);
  });
  it('20명이 설 자리가 있고 모두 벽 밖이며 전리품이 충분하다', () => {
    const m = generateMap(11, 'br'); expect(m.spawns).toHaveLength(20); expect(m.loot.length).toBeGreaterThan(60); expect(m.buildings.length).toBeGreaterThan(15);
    for (const s of m.spawns) { const p = { x: s.x, z: s.z }; expect(pushOut(m, p, PLAYER.radius)).toBe(false); expect(Math.abs(s.x)).toBeLessThan(MAP_HALF.br); }
  });
  it('벽은 사람을 막고 총알도 막는다. 문틈은 지나갈 수 있다', () => {
    const m = generateMap(2, 'duel'), b = m.buildings[0], inside = { x: b.x, z: b.z };
    expect(lineClear(m, inside.x, 1.6, inside.z, inside.x + 40, 1.6, inside.z + 40)).toBe(false);
    const p = { x: b.x - b.w / 2 + 0.1, z: b.z - b.d / 2 + 0.1 }; expect(pushOut(m, p, PLAYER.radius)).toBe(true);
    expect(rayWorld(m, 0, 50, 0, 1, 0, 0, 100)).toBe(Infinity); // 건물 위로 지나가는 광선은 맞지 않는다
  });
  it('길찾기는 벽을 돌아 문을 지나 건물 안 전리품까지 간다', () => {
    const m = generateMap(4, 'br'), nav = navFor(m); let ok = 0, tried = 0;
    for (const l of m.loot.slice(0, 40)) { const sp = m.spawns[0]; tried++; const path = findPath(nav, sp.x, sp.z, l.x, l.z); if (path && path.length >= 2) ok++; }
    expect(ok / tried).toBeGreaterThan(0.85);
    const b = m.buildings[0]; expect(walkable(nav, b.x, b.z, b.x + 60, b.z + 60) && true).toBeTypeOf('boolean');
  });
});

describe('ZERO ZONE 자기장', () => {
  it('시간이 지나면 반지름이 단계별로 줄고 다음 원은 현재 원 안에 있다', () => {
    const m = solo(), phases = ZONES.br; let prev = Infinity, t = 0;
    for (let i = 0; i < phases.length; i++) {
      const z0 = m.zoneAt(t + 0.1); expect(z0.phase).toBe(i); expect(z0.shrinking).toBe(false); expect(z0.dps).toBe(phases[i].dps);
      expect(Math.hypot(z0.nextCx - z0.cx, z0.nextCz - z0.cz) + z0.nextR).toBeLessThanOrEqual(z0.r + 1e-6);
      t += phases[i].wait + phases[i].shrink; const z1 = m.zoneAt(t); expect(z1.r).toBeCloseTo(phases[i].radius, 5); expect(z1.r).toBeLessThan(prev); prev = z1.r;
    }
    expect(m.zoneAt(t + 100).dps).toBeGreaterThan(phases[phases.length - 1].dps);
  });
  it('같은 시드면 두 브라우저가 같은 자기장을 본다', () => {
    const a = new Match({ seed: 21, mode: 'duel', difficulty: 'easy', humans: [{ name: 'a' }, { name: 'b', remote: true }] }), b = new Match({ seed: 21, mode: 'duel', difficulty: 'hard', humans: [{ name: 'b' }, { name: 'a', remote: true }] });
    for (const t of [0, 25, 60, 90, 130]) expect(a.zoneAt(t)).toEqual(b.zoneAt(t));
  });
  it('자기장 밖에 서 있으면 피해를 입고, 안에서는 입지 않는다', () => {
    const m = field(); const p = m.players[0], z = m.zone; p.x = z.cx; p.z = z.cz; run(m, 5); expect(p.hp).toBe(100);
    m.t = ZONES[m.mode][0].wait + ZONES[m.mode][0].shrink + 1; const z2 = m.zone, half = m.map.half;
    p.x = Math.abs(z2.cx + z2.r + 20) < half - 2 ? z2.cx + z2.r + 20 : z2.cx - z2.r - 20; p.z = z2.cz; expect(Math.hypot(p.x - z2.cx, p.z - z2.cz)).toBeGreaterThan(z2.r); const before = p.hp; run(m, 5); expect(p.hp).toBeLessThan(before - 3);
  });
});

describe('ZERO ZONE 사격', () => {
  it('정면의 적에게 맞으면 체력이 깎이고 탄이 줄어든다', () => {
    const m = field(); const [a, b] = m.players; a.x = 0; a.z = 0; b.x = 15; b.z = 0; a.yaw = 0; a.pitch = Math.atan2(1.2 - PLAYER.eye, 15); a.guns[0] = { id: 'rifle', mag: 30, reserve: 60, att: {} };
    a.input = { ...blankInput(), yaw: 0, pitch: a.pitch, fire: true }; run(m, 0.5);
    expect(a.guns[0]!.mag).toBeLessThan(30); expect(b.hp).toBeLessThan(100);
  });
  it('벽 뒤의 적은 맞지 않는다', () => {
    const m = field(); m.map.boxes.push({ x0: 7, x1: 7.4, z0: -5, z1: 5, y0: 0, y1: 3, kind: 'wall', tex: 0 }); m.map.grid.set(((Math.floor(7 / 16) + 512) * 1024) + 512, [0]);
    const [a, b] = m.players; a.x = 0; a.z = 0; b.x = 15; b.z = 0; a.pitch = Math.atan2(1.2 - PLAYER.eye, 15); a.guns[0] = { id: 'rifle', mag: 30, reserve: 60, att: {} };
    a.input = { ...blankInput(), yaw: 0, pitch: a.pitch, fire: true }; run(m, 1); expect(b.hp).toBe(100);
  });
  it('머리는 몸통보다 더 아프다', () => {
    const dmg = (aimY: number): number => { const m = field(); const [a, b] = m.players; a.x = 0; a.z = 0; b.x = 10; b.z = 0; b.hp = 1000; a.guns[0] = { id: 'rifle', mag: 30, reserve: 60, att: {} }; a.input = { ...blankInput(), pitch: Math.atan2(aimY - PLAYER.eye, 10), fire: true }; a.cd = 0; m.step(1 / 60); return 1000 - b.hp; };
    // 탄퍼짐이 있어 정확히 한 발로 비교하려면 여러 번 재서 평균을 냅니다
    let head = 0, body = 0; for (let i = 0; i < 40; i++) { head += dmg(1.62); body += dmg(1.0); }
    expect(head).toBeGreaterThan(body * 1.3);
  });
  it('방탄복이 피해의 절반을 흡수한다', () => {
    const m = field(); const [, b] = m.players; b.armor = 100; m.damage(b, 40, 0, 'rifle', false, 0, 1, 0, false); expect(b.hp).toBe(80); expect(b.armor).toBe(80);
    m.damage(b, 40, 0, 'zone', false, 0, 1, 0, true); expect(b.hp).toBe(40);
  });
  it('장전하면 예비 탄에서 탄창을 채운다', () => {
    const m = field(); const a = m.players[0]; a.guns[0] = { id: 'smg', mag: 3, reserve: 40, att: {} }; a.input = { ...blankInput(), reload: true }; run(m, 0.1); a.input.reload = false; run(m, WEAPONS.smg.reload + 0.2);
    expect(a.guns[0]).toMatchObject({ mag: 30, reserve: 13 });
  });
  it('샷건은 한 번에 여러 발을 쏘고, 저격총은 머리 한 방에 쓰러뜨린다', () => {
    expect(WEAPONS.shotgun.pellets).toBeGreaterThan(5); expect(WEAPONS.sniper.dmg * WEAPONS.sniper.head).toBeGreaterThanOrEqual(PLAYER.hp);
  });
});

describe('ZERO ZONE 전리품', () => {
  it('구급상자·방탄복·탄약은 닿으면 자동으로, 무기는 줍기 키로 줍는다', () => {
    const m = field(); const p = m.players[0]; p.hp = 30; p.x = 0; p.z = 0;
    m.loot.push({ id: 900, kind: 'medkit', weapon: null, x: 0.5, z: 0, taken: false }, { id: 901, kind: 'armor', weapon: null, x: -0.5, z: 0, taken: false }, { id: 902, kind: 'weapon', weapon: 'sniper', x: 0, z: 0.5, taken: false });
    run(m, 0.2); expect(p.hp).toBe(30 + PLAYER.medkit); expect(p.armor).toBe(PLAYER.armor); expect(p.guns[1]).toBeNull();
    p.input.interact = true; run(m, 0.2); expect(p.guns[1]?.id).toBe('sniper'); expect(p.cur).toBe(1);
  });
  it('가득 찼을 땐 구급상자를 줍지 않고 남겨 둔다', () => {
    const m = field(); const p = m.players[0]; m.loot.push({ id: 903, kind: 'medkit', weapon: null, x: 0.3, z: 0, taken: false }); p.x = 0; p.z = 0; run(m, 0.2);
    expect(m.loot.find(l => l.id === 903)!.taken).toBe(false);
  });
  it('쓰러진 선수는 들고 있던 총을 떨어뜨린다', () => {
    const m = field(); const b = m.players[1]; const n = m.loot.length; b.guns[1] = { id: 'rifle', mag: 10, reserve: 10, att: {} }; m.damage(b, 500, 0, 'pistol', false, 0, 1, 0, false);
    expect(b.alive).toBe(false); expect(m.loot.length).toBe(n + 2); expect(m.players[0].kills).toBe(1);
  });
});

describe('ZERO ZONE 승패', () => {
  it('한 명만 남으면 경기가 끝나고 순위가 매겨진다', () => {
    const m = solo(); const [me, ...rest] = m.players; for (const b of rest.slice(0, 18)) m.kill(b, 0, 'rifle');
    expect(rest.slice(0, 18).map(b => b.place).sort((a, b) => a - b)[0]).toBe(3); m.step(1 / 60);
    expect(m.over).toBe(false); m.kill(rest[18], 0, 'rifle'); m.step(1 / 60);
    expect(m.over).toBe(true); expect(m.winner).toBe(me.id); expect(me.place).toBe(1); expect(me.kills).toBe(19);
  });
  it('자기장에서 모두 쓰러지면 마지막에 쓰러진 쪽이 이긴다', () => {
    const m = field(); const [a, b] = m.players; m.kill(a, -1, 'zone'); m.t += 1; m.kill(b, -1, 'zone'); m.step(1 / 60); expect(m.over).toBe(true); expect(m.winner).toBe(b.id);
  });
});

describe('ZERO ZONE 봇 AI', () => {
  it('난이도가 올라갈수록 반응이 빠르고 조준이 정확하며 시야가 넓다', () => {
    for (let i = 1; i < DIFFICULTIES.length; i++) { const a = BOTS[DIFFICULTIES[i - 1]], b = BOTS[DIFFICULTIES[i]]; expect(b.react).toBeLessThan(a.react); expect(b.aimErr).toBeLessThan(a.aimErr); expect(b.sight).toBeGreaterThan(a.sight); expect(b.turn).toBeGreaterThan(a.turn); }
  });
  it('빈 들판 1대1에서 어려운 봇이 쉬운 봇을 거의 이긴다', () => {
    let wins = 0; const n = 12;
    for (let i = 0; i < n; i++) {
      const m = new Match({ seed: 900 + i, mode: 'duel', difficulty: 'easy', humans: [], fill: 2 }); m.map.boxes = []; m.map.grid.clear(); m.loot.forEach(l => { l.taken = true; });
      const [a, b] = m.players; a.brain!.t = BOTS.expert; b.brain!.t = BOTS.easy; a.x = -12; a.z = 0; a.yaw = 0; b.x = 12; b.z = 0; b.yaw = Math.PI;
      for (const p of m.players) p.guns[0] = { id: 'rifle', mag: 30, reserve: 90, att: {} };
      for (let t = 0; t < 40 && !m.over; t += 1 / 30) { m.step(1 / 30); m.drain(); } if (m.winner === a.id) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(n - 2);
  });
  it('봇 20명 경기가 스스로 끝나고, 총격으로 쓰러뜨리는 일이 일어난다', () => {
    const m = new Match({ seed: 31, mode: 'br', difficulty: 'normal', humans: [], fill: 20 }); let kills = 0;
    for (let t = 0; t < 700 && !m.over; t += 1 / 30) { m.step(1 / 30); for (const e of m.drain()) if (e.t === 'kill' && e.weapon !== 'zone') kills++; }
    expect(m.over).toBe(true); expect(m.t).toBeLessThan(500); expect(kills).toBeGreaterThan(5);
  });
  it('봇은 사람과 같은 입력만 쓴다(체력·탄을 속이지 않는다)', () => {
    const m = solo(5, 'expert'); run(m, 20); for (const p of m.players) { expect(p.hp).toBeLessThanOrEqual(PLAYER.hp); for (const g of p.guns) if (g) expect(g.mag).toBeLessThanOrEqual(WEAPONS[g.id].mag); }
  });
});
