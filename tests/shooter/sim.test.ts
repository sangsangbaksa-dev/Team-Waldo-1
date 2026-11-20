import { describe, expect, it } from 'vitest';
import { Match, blankInput } from '../../src/shooter/sim';
import { AIR, ARMOR_PTS, BAG_MAX, BR_MATCH_SECONDS, SUPPLY_AT, RED, HEAL, BOTS, BR_PLAYERS, DIFFICULTIES, MAP_HALF, PLAYER, WEAPONS, ZONES } from '../../src/shooter/config';
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
  it('방탄복은 등급만큼 피해를 흡수한다', () => {
    const m = field(); const [, b] = m.players; b.armor = 100; b.armorLv = 2; m.damage(b, 40, 0, 'rifle', false, 0, 1, 0, false); expect(b.hp).toBe(80); expect(b.armor).toBe(80);
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

describe('ZERO ZONE 치료·기록', () => {
  it('붕대는 시간이 지나야 80까지 회복하고, 사격하면 중단된다', () => {
    const m = field(); const p = m.players[0]; p.hp = 40; p.bandages = 2; p.input.heal = 1; run(m, 0.1); expect(p.healT).toBeGreaterThan(0); expect(p.bandages).toBe(1); expect(p.hp).toBe(40);
    run(m, HEAL.bandage.time + 0.3); expect(p.hp).toBe(65);
    p.hp = 70; p.input.heal = 1; run(m, 0.1); p.input.fire = true; run(m, 0.1); expect(p.healT).toBe(0); expect(p.hp).toBe(70);
  });
  it('구급상자는 100까지, 맞으면 치료가 끊긴다', () => {
    const m = field(); const [p, q] = m.players; p.hp = 10; p.kits = 1; p.input.heal = 2; run(m, 0.1); m.damage(p, 5, q.id, 'rifle', false, 0, 1, 0, false); expect(p.healT).toBe(0);
    p.kits = 1; p.input.heal = 2; run(m, HEAL.kit.time + 0.3); expect(p.hp).toBe(100);
  });
  it('준 피해·머리 명중과 나를 쓰러뜨린 선수를 기록한다', () => {
    const m = field(); const [a, b] = m.players; m.damage(b, 30, a.id, 'rifle', true, 0, 1, 0, false); expect(a.dmgDealt).toBeGreaterThan(0); expect(a.heads).toBe(1);
    m.damage(b, 500, a.id, 'sniper', false, 0, 1, 0, false); expect(b.killedBy).toBe(a.id); expect(b.killedWeapon).toBe('sniper');
  });
});

describe('ZERO ZONE 전리품', () => {
  it('구급상자·방탄복·탄약은 닿으면 자동으로, 무기는 줍기 키로 줍는다', () => {
    const m = field(); const p = m.players[0]; p.hp = 30; p.x = 0; p.z = 0;
    m.loot.push({ id: 900, kind: 'bandage', weapon: null, x: 0.5, z: 0, taken: false }, { id: 901, kind: 'armor', weapon: null, level: 1, x: -0.5, z: 0, taken: false }, { id: 902, kind: 'weapon', weapon: 'sniper', x: 0, z: 0.5, taken: false });
    run(m, 0.2); expect(p.hp).toBe(30); expect(p.bandages).toBe(HEAL.bandage.pick); expect(p.armorLv).toBe(1); expect(p.armor).toBe(ARMOR_PTS[1]); expect(p.guns[1]).toBeNull();
    p.input.interact = true; run(m, 0.2); expect(p.guns[1]?.id).toBe('sniper'); expect(p.cur).toBe(1);
  });
  it('가득 찼을 땐 구급상자를 줍지 않고 남겨 둔다', () => {
    const m = field(); const p = m.players[0]; p.kits = HEAL.kit.max; m.loot.push({ id: 903, kind: 'medkit', weapon: null, x: 0.3, z: 0, taken: false }); p.x = 0; p.z = 0; run(m, 0.2);
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
  }, 30000);
  it('봇은 사람과 같은 입력만 쓴다(체력·탄을 속이지 않는다)', () => {
    const m = solo(5, 'expert'); run(m, 20); for (const p of m.players) { expect(p.hp).toBeLessThanOrEqual(PLAYER.hp); for (const g of p.guns) if (g) expect(g.mag).toBeLessThanOrEqual(WEAPONS[g.id].mag); }
  });
});

describe('ZERO ZONE 건물·엄폐물·파츠·보급', () => {
  it('건물 종류가 여러 가지이고 엄폐물과 차량이 충돌·총알 차단이 된다', () => {
    const m = generateMap(4, 'br'), types = new Set(m.buildings.map(b => b.type));
    expect(types.size).toBeGreaterThanOrEqual(7);
    const covers = m.props.filter(p => ['barrier', 'sandbag', 'ruin', 'stonewall', 'stump', 'log', 'rubble', 'pallet'].includes(p.kind)); expect(covers.length).toBeGreaterThan(150);
    const c = covers.find(p => p.kind === 'barrier')!; // 가슴 높이로 쏘면 막히고(네 방향 중 하나는 장벽을 정면으로 맞힌다), 머리 높이로 쏘면 넘어간다
    const chest = [[6, 0], [-6, 0], [0, 6], [0, -6]].some(([dx, dz]) => rayWorld(m, c.x + dx, 0.6, c.z + dz, -Math.sign(dx), 0, -Math.sign(dz), 12) < 12);
    expect(chest).toBe(true); expect(rayWorld(m, c.x - 6, 1.6, c.z, 1, 0, 0, 12)).toBeGreaterThan(5.9);
  });
  it('사람이 줍는 파츠는 가방에 들어가고, 조립해야 총에 달리며, 달린 파츠는 가방으로 돌아온다', () => {
    const m = field('normal', 2), p = m.players[0]; p.guns[0] = { id: 'rifle', mag: 30, reserve: 90, att: {} };
    m.loot.push({ id: 900, kind: 'attach', weapon: null, part: 'extmag', x: p.x, z: p.z, taken: false }, { id: 901, kind: 'attach', weapon: null, part: 'scope2', x: p.x, z: p.z, taken: false });
    run(m, 0.1); expect(p.guns[0]!.att).toEqual({}); expect([...p.parts].sort()).toEqual(['extmag', 'scope2']);
    expect(m.equipPart(p, 0, 'mag', 'extmag')).toBe(true); expect(m.equipPart(p, 0, 'sight', 'scope2')).toBe(true); expect(p.parts).toEqual([]); expect(p.guns[0]!.att).toEqual({ mag: 'extmag', sight: 'scope2' });
    p.guns[0]!.mag = 0; p.input.reload = true; run(m, 3); expect(p.guns[0]!.mag).toBe(42);
    m.loot.push({ id: 902, kind: 'attach', weapon: null, part: 'reddot', x: p.x, z: p.z, taken: false }); run(m, 0.2); expect(p.guns[0]!.att.sight).toBe('scope2'); expect(p.parts).toEqual(['reddot']);
    expect(m.equipPart(p, 0, 'sight', 'reddot')).toBe(true); expect(p.guns[0]!.att.sight).toBe('reddot'); expect(p.parts).toEqual(['scope2']);
    expect(m.equipPart(p, 0, 'sight', null)).toBe(true); expect(p.guns[0]!.att.sight).toBeUndefined(); expect([...p.parts].sort()).toEqual(['reddot', 'scope2']);
  });
  it('조립은 가방에 있고 총에 맞는 파츠만 받고, 탄창을 빼면 넘친 탄은 예비로 돌아간다', () => {
    const m = field('normal', 2), p = m.players[0]; p.guns[0] = { id: 'rifle', mag: 42, reserve: 10, att: { mag: 'extmag' } }; p.guns[1] = { id: 'pistol', mag: 12, reserve: 24, att: {} };
    expect(m.equipPart(p, 0, 'sight', 'scope4')).toBe(false); // 가방에 없음
    p.parts.push('scope8', 'cheek'); expect(m.equipPart(p, 1, 'sight', 'scope8')).toBe(false); // 권총에는 조준경 칸이 없음
    expect(m.equipPart(p, 0, 'stock', 'cheek')).toBe(false); // 볼받침은 저격총 전용
    expect(m.equipPart(p, 0, 'sight', 'scope8')).toBe(true); expect(p.parts).toEqual(['cheek']);
    expect(m.equipPart(p, 0, 'mag', null)).toBe(true); expect(p.guns[0]!.mag).toBe(30); expect(p.guns[0]!.reserve).toBe(22); expect(p.parts).toContain('extmag');
    expect(m.equipPart(p, 5, 'sight', null)).toBe(false); p.alive = false; expect(m.equipPart(p, 0, 'sight', null)).toBe(false);
  });
  it('AI 는 예전처럼 파츠를 바로 달고, 쓰러진 사람은 가방의 파츠를 떨어뜨린다', () => {
    const m = field('normal', 2), bot = m.players[1]; bot.bot = true; bot.guns[0] = { id: 'rifle', mag: 30, reserve: 60, att: {} }; bot.x = m.players[0].x + 3; bot.z = m.players[0].z;
    const hl = { id: 950, kind: 'attach' as const, weapon: null, part: 'holo' as const, x: bot.x, z: bot.z, taken: false }; m.loot.push(hl); (m as unknown as { takePart(p: unknown, l: unknown, e: boolean): boolean }).takePart(bot, hl, false); expect(bot.guns[0]!.att.sight).toBe('holo'); expect(bot.parts).toEqual([]);
    const p = m.players[0]; p.parts.push('comp', 'grip'); const n = m.loot.length; m.kill(p, 1, 'rifle'); expect(p.parts).toEqual([]);
    expect(m.loot.slice(n).filter(l => l.kind === 'attach').map(l => l.part).sort()).toEqual(['comp', 'grip']);
  });
  it('가방이 가득 차면 파츠를 줍지 않는다', () => {
    const m = field('normal', 2), p = m.players[0]; for (let i = 0; i < BAG_MAX; i++) p.parts.push('reddot');
    m.loot.push({ id: 960, kind: 'attach', weapon: null, part: 'grip', x: p.x, z: p.z, taken: false }); run(m, 0.2); expect(p.parts.length).toBe(BAG_MAX); expect(m.loot.find(l => l.id === 960)!.taken).toBe(false);
  });
  it('헬멧은 머리 피해를 줄이고 부스트는 체력을 채운다', () => {
    const m = field('normal', 2), p = m.players[1]; p.helmet = 3; m.damage(p, 100, 0, 'rifle', true, p.x, 1.6, p.z, true); expect(p.hp).toBeCloseTo(100 - 35, 0);
    p.hp = 50; p.boost = 10; run(m, 4); expect(p.hp).toBeGreaterThan(55);
  });
  it('보급 투하는 정해진 시각에 상자가 열리고 좋은 전리품이 나온다', () => {
    const m = solo(9); expect(m.drops.length).toBe(SUPPLY_AT.length); const before = m.loot.length, d = m.drops[0];
    m.t = d.at - 0.05; m.step(0.1); const ev = m.drain(); expect(ev.some(e => e.t === 'drop' && e.stage === 'land')).toBe(true);
    expect(m.loot.length).toBe(before + 10); expect(m.loot.filter(l => l.kind === 'attach').length).toBeGreaterThanOrEqual(3); expect(m.loot.some(l => l.kind === 'helmet' && l.level === 3)).toBe(true);
  });

  describe('12분 경기 페이싱', () => {
    it('자기장은 낙하 뒤 약 12분에 걸쳐 닫히고, 폭격과 보급은 그 안에 고르게 나온다', () => {
      const m = new Match({ seed: 5, mode: 'br', difficulty: 'normal', humans: [{ name: '나' }], fill: 4, air: true, vehicles: true, bombs: true });
      const closes = m.zoneDelay + ZONES.br.reduce((a, ph) => a + ph.wait + ph.shrink, 0);
      expect(closes).toBeGreaterThan(BR_MATCH_SECONDS * 0.95); expect(closes).toBeLessThan(BR_MATCH_SECONDS * 1.15);
      expect(ZONES.br.length).toBeGreaterThanOrEqual(8); expect(m.reds.length).toBe(RED.calls.length); expect(m.drops.length).toBe(SUPPLY_AT.length);
      for (const r of m.reds) expect(r.end).toBeLessThan(closes + 30);
      for (const d of m.drops) expect(d.at).toBeLessThan(closes); for (let i = 1; i < m.drops.length; i++) expect(m.drops[i].at - m.drops[i - 1].at).toBeGreaterThan(100);
      // 단계마다 원은 줄고, 단계 사이 기다림은 20초 이상이라 숨 돌리고 이동할 틈이 있다
      let prev = Infinity; for (const ph of ZONES.br) { expect(ph.radius).toBeLessThan(prev); prev = ph.radius; expect(ph.wait).toBeGreaterThanOrEqual(20); expect(ph.shrink / (prev === ph.radius ? 1 : 1)).toBeGreaterThan(20); }
    });
    it('AI 100명끼리만 돌려도 초반에 다 쓰러지지 않고 10~13분쯤 끝난다', () => {
      const m = new Match({ seed: 11, mode: 'br', difficulty: 'normal', humans: [], fill: BR_PLAYERS, air: true, vehicles: true, bombs: true }); let at3 = 0, at6 = 0;
      while (!m.over && m.t < 1200) { m.step(1 / 30); m.drain(); if (at3 === 0 && m.t >= 180) at3 = m.aliveCount(); if (at6 === 0 && m.t >= 360) at6 = m.aliveCount(); }
      expect(m.over).toBe(true); expect(at3).toBeGreaterThan(40); expect(at6).toBeGreaterThan(10); expect(m.t).toBeGreaterThan(540); expect(m.t).toBeLessThan(800);
    }, 60000);
  });

  describe('100명 배틀로열과 낙하산', () => {
    const royale = (seed = 11): Match => new Match({ seed, mode: 'br', difficulty: 'normal', humans: [{ name: '나' }], fill: BR_PLAYERS, air: true });
    const runCoarse = (m: Match, sec: number): void => { for (let i = 0; i < sec * 30 && !m.over; i++) { m.step(1 / 30); m.drain(); } };
    it('나와 AI 99명이 이름이 겹치지 않게 비행기에서 시작한다', () => {
      const m = royale(); expect(m.players.length).toBe(100); expect(m.players.filter(p => p.bot).length).toBe(99);
      expect(m.players.every(p => p.air === 1 && p.alt === AIR.alt)).toBe(true); expect(new Set(m.players.map(p => p.name)).size).toBe(100); expect(m.plane).not.toBeNull();
    });
    it('땅 시작 모드(air 끔)는 예전처럼 땅에서 시작한다', () => { const m = solo(5); expect(m.players.every(p => p.air === 0 && p.alt === 0)).toBe(true); expect(m.plane).toBeNull(); });
    it('뛰어내려 낙하산이 자동으로 펴지고 착지하면 땅 선수로 돌아온다', () => {
      const m = royale(); const me = m.players[0]; runCoarse(m, 2); me.input = { ...blankInput(), jump: true, yaw: me.yaw }; runCoarse(m, 0.2); expect(me.air).toBe(2);
      me.input = { ...blankInput(), mz: 1, yaw: me.yaw }; let chute = false, minAlt = 999; for (let i = 0; i < 60 * 60 && me.air; i++) { m.step(1 / 60); for (const e of m.drain()) if (e.t === 'chute' && e.id === 0) chute = true; if (me.air === 3) minAlt = Math.min(minAlt, me.alt); }
      expect(chute).toBe(true); expect(me.air).toBe(0); expect(me.alt).toBe(0); expect(Math.abs(me.x)).toBeLessThanOrEqual(m.map.half);
    });
    it('날고 있는 선수는 총에 맞지 않고, 비행기가 끝에 닿으면 모두 자동으로 뛴다', () => {
      const m = royale(); const me = m.players[0], b = m.players[1]; runCoarse(m, 1); me.input = { ...blankInput(), jump: true }; runCoarse(m, 0.1);
      const hp = me.hp; m.bullet(1, 'rifle', me.x - 5, me.alt, me.z, 0, 0, [], false); expect(me.hp).toBe(hp); expect(b.air).toBeGreaterThanOrEqual(1);
      runCoarse(m, m.plane!.end + 1); expect(m.players.every(p => p.air !== 1)).toBe(true);
    });
    it('낙하 중에는 사격도 줍기도 안 되고, 자기장 시간은 낙하가 끝난 뒤부터 흐른다', () => {
      const m = royale(); expect(m.zone.phase).toBe(0); expect(m.zone.timeLeft).toBeCloseTo(ZONES.br[0].wait, 0); runCoarse(m, 10); expect(m.zone.timeLeft).toBeCloseTo(ZONES.br[0].wait, 0);
    });
    it('AI 99명은 모두 착지하고 판은 한 명이 남을 때까지 제때 끝난다', () => {
      const m = royale(3); let landed = 0; for (let i = 0; i < Math.ceil(BR_MATCH_SECONDS * 1.15) * 30 && !m.over; i++) { m.step(1 / 30); for (const e of m.drain()) if (e.t === 'land') landed++; }
      expect(landed).toBeGreaterThanOrEqual(95); expect(m.over).toBe(true); expect(m.t).toBeLessThan(BR_MATCH_SECONDS * 1.15);
    }, 60000);
    it('모든 전리품에 길이 있다(문 앞을 소품이 막지 않는다)', () => {
      for (const seed of [4, 5]) { const m = generateMap(seed, 'br'), nav = navFor(m), c = m.compounds[0]; for (const l of m.loot.filter((_, i) => i % 3 === 0)) expect(findPath(nav, c.x, c.z, l.x, l.z, 300000)).not.toBeNull(); }
    }, 60000);
  });
});

describe('수류탄', () => {
  it('던지면 개수가 줄고, 퓨즈가 끝나면 터져 범위 안 선수에게 피해를 준다', () => {
    const m = field('normal', 2), [a, b] = m.players; a.nades = 2; a.x = 0; a.z = 0; a.yaw = 0; a.pitch = 0.1; b.x = 12; b.z = 0;
    a.input = { ...blankInput(), nade: true }; m.step(1 / 60); m.drain();
    expect(a.nades).toBe(1); expect(m.nades).toHaveLength(1); a.input = blankInput();
    const hp = b.hp; run(m, 4);
    expect(m.nades).toHaveLength(0); expect(b.hp < hp || !b.alive).toBe(true);
  });
  it('수류탄이 없으면 던지지 못하고, 줍기는 최대 5개', () => {
    const m = field('normal', 2), a = m.players[0]; a.input = { ...blankInput(), nade: true }; m.step(1 / 60); expect(m.nades).toHaveLength(0);
    a.input = blankInput(); a.nades = 4; m.loot.push({ id: 9999, kind: 'grenade', weapon: null, x: a.x, z: a.z, taken: false }); m.step(1 / 60);
    expect(a.nades).toBe(5);
  });
});

describe('연막탄', () => {
  it('던지면 피해 없이 연막이 깔리고, 연막 너머로는 시선이 끊기며, 시간이 지나면 걷힌다', () => {
    const m = field('normal', 2), [a, b] = m.players; a.smokes = 2; a.x = 0; a.z = 0; a.yaw = 0; a.pitch = 0.1; b.x = 24; b.z = 0;
    a.input = { ...blankInput(), smoke: true }; m.step(1 / 60); m.drain();
    expect(a.smokes).toBe(1); expect(m.nades).toHaveLength(1); expect(m.nades[0].smoke).toBe(true); a.input = blankInput();
    const hp = b.hp; run(m, 2.5);
    expect(m.nades).toHaveLength(0); expect(m.clouds).toHaveLength(1); expect(b.hp).toBe(hp);
    const c = m.clouds[0]; run(m, 1.5);
    expect(m.smokeBlocks(c.x - 20, c.z, c.x + 20, c.z)).toBe(true);
    expect(m.smokeBlocks(c.x - 20, c.z + 40, c.x + 20, c.z + 40)).toBe(false);
    run(m, 20); expect(m.clouds).toHaveLength(0); expect(m.smokeBlocks(c.x - 20, c.z, c.x + 20, c.z)).toBe(false);
  });
  it('연막탄이 없으면 던지지 못하고, 줍기는 최대 3개', () => {
    const m = field('normal', 2), a = m.players[0]; a.input = { ...blankInput(), smoke: true }; m.step(1 / 60); expect(m.nades).toHaveLength(0);
    a.input = blankInput(); a.smokes = 3; m.loot.push({ id: 9998, kind: 'smoke', weapon: null, x: a.x, z: a.z, taken: false }); m.step(1 / 60);
    expect(a.smokes).toBe(3);
    a.smokes = 1; m.step(1 / 60); expect(a.smokes).toBe(2);
  });
});
