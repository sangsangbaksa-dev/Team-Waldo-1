import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { TARGET_KILLS, TIME_LIMIT, duelOutcome, parsePose, parseShot } from '../../src/city/duel';
import { DuelArmy, parseArmy } from '../../src/city/duelarmy';

const make = (side: 0 | 1, seed = 11, klass: 'warlord' | 'tycoon' | 'engineer' = 'warlord'): World => new World({ seed, difficulty: 'd4', klass, tutorial: true, duel: { side, name: '상대' } });
const run = (w: World, sec: number): void => { for (let i = 0; i < sec * 60; i++) { w.step(1 / 60); w.events.length = 0; } };

describe('LAST CITY 1대1 결투 세계', () => {
  it('두 조직만 남고 내 일꾼·시작 병력만 있고 차량·시민은 없이 시작한다', () => {
    const w = make(0);
    expect(w.factions.filter(f => f.alive).map(f => f.id)).toEqual([0, 1]);
    expect(w.factions[1].name).toBe('상대');
    expect(w.actors.filter(a => a.alive).map(a => `${a.f}${a.kind}`).sort()).toEqual(['0boss', '0rifle', '0rifle', '0worker', '0worker', '0worker', '0worker', '1boss']);
    expect(w.vehicles).toHaveLength(0);
    expect(w.structures.filter(s => s.alive).every(s => s.f < 2)).toBe(true);
  });

  it('호스트와 게스트가 서로의 본부 위치에서 만난다(내 자리와 상대 자리가 맞교환)', () => {
    const host = make(0), guest = make(1);
    const me = (w: World, f: number): [number, number] => { const b = w.boss(f)!; return [b.x, b.y]; };
    expect(me(host, 0)).toEqual(me(guest, 1)); expect(me(host, 1)).toEqual(me(guest, 0));
    expect(me(host, 0)).not.toEqual(me(host, 1));
    // 같은 시드면 도시와 전리품이 같다(내 직업이 달라도)
    const other = make(1, 11, 'engineer');
    expect(other.loot.map(l => [l.x, l.y, l.type])).toEqual(host.loot.map(l => [l.x, l.y, l.type]));
  });

  it('상대 보스는 AI 로 움직이지 않고, 내 총알로는 체력이 깎이지 않는다', () => {
    const w = make(0), b = w.boss(1)!, hp = b.hp; run(w, 5);
    expect(w.boss(1)!.x).toBe(b.x);
    w.hurtActor(b, 500, 0); expect(b.hp).toBe(hp); expect(w.over).toBe(false);
    w.puppet(b.x + 50, b.y, 1, 77, 300, 'rifle'); expect(b).toMatchObject({ hp: 77, maxHp: 300, weapon: 'rifle' });
  });

  it('상대가 쏜 탄은 내 보스에게 맞아 내 체력을 깎고, 내가 쏜 탄은 알림으로 나간다', () => {
    const w = make(0), me = w.boss(0)!, foe = w.boss(1)!, sent: number[] = [];
    w.onShot = (_x, _y, _a, _w, mul) => sent.push(mul);
    foe.x = me.x - 140; foe.y = me.y; w.puppet(foe.x, foe.y, 0, 100, 100, 'pistol');
    const before = me.hp; w.remoteShot(me.x - 120, me.y, 0, 'pistol', 1);
    for (let i = 0; i < 30; i++) { w.step(1 / 60); w.events.length = 0; }
    expect(me.hp).toBeLessThan(before); expect(sent).toEqual([]);
    w.shoot(me.x, me.y, Math.PI, 'pistol', 0, me.id, 1.5, true); expect(sent).toEqual([1.5]);
    w.shoot(me.x, me.y, Math.PI, 'pistol', 1, foe.id, 1, true); expect(sent).toEqual([1.5]);
  });

  it('내 보스가 쓰러지면 3초 안에 본부에서 부활하고 경기는 끝나지 않는다', () => {
    const w = make(0), me = w.boss(0)!; w.hurtActor(me, 1e6, 1);
    expect(w.boss(0)).toBeNull(); expect(w.factions[0].deaths).toBe(1);
    run(w, 4); expect(w.boss(0)).not.toBeNull(); expect(w.over).toBe(false);
  });

  it('결투에서도 병력 생산·건설·연구를 쓸 수 있다', () => {
    const w = make(0); const f = w.factions[0]; f.cash = 99999; f.crystal = 99999;
    expect(w.train(0, 'worker')).toBe(''); expect(w.build(0, 'barracks', f.ai.tx + 150, f.ai.ty)).toBe('');
    run(w, 30); expect(w.structures.some(s => s.f === 0 && s.kind === 'barracks' && s.built >= 1)).toBe(true);
    expect(w.train(0, 'rifle')).toBe(''); expect(w.build(0, 'lab', f.ai.tx - 150, f.ai.ty)).toBe(''); run(w, 20); expect(w.research(0, 'dmg')).toBe('');
  });

  it('내 일꾼이 크리스탈을 캐 와서 병력을 계속 뽑을 수 있다', () => {
    for (const arena of [0, 1]) {
      const w = new World({ seed: 11, difficulty: 'd4', klass: 'warlord', tutorial: true, duel: { side: 0, name: '상대', arena } }), f = w.factions[0], c0 = f.crystal;
      run(w, 60); expect(f.crystal, `arena ${arena}`).toBeGreaterThan(c0);
    }
  });

  it('상대 병력·건물은 내 총알로 피해를 입지 않는다', () => {
    const w = make(0), a = new DuelArmy(), foe = w.boss(1)!;
    a.receive(w, { u: [[7, 'rifle', foe.x + 40, foe.y, 0, 50, 70]], s: [[9, 'barracks', foe.x + 100, foe.y + 100, 400, 1, 0]], sh: [] });
    const u = w.actors.find(q => q.f === 1 && q.kind === 'rifle')!, st = w.structures.find(q => q.f === 1 && q.kind === 'barracks')!;
    w.hurtActor(u, 999, 0); w.hurtStruct(st, 999, 0); expect(u.alive).toBe(true); expect(u.hp).toBe(50); expect(st.alive).toBe(true); expect(st.hp).toBe(400);
  });
});

describe('결투 병력·건설 동기화', () => {
  const sync = (from: World, to: World, ad: DuelArmy, ar: DuelArmy, t: number): void => {
    const m = ad.snapshot(from, t); if (m) { const army = parseArmy(m); expect(army).not.toBeNull(); ar.receive(to, army!); }
  };
  it('내 병력과 건물이 상대 세계에 꼭두각시로 나타나고 사라진다', () => {
    const A = make(0), B = make(1), a = new DuelArmy(), b = new DuelArmy(); const f = A.factions[0]; f.cash = 99999; f.crystal = 99999;
    expect(A.build(0, 'barracks', f.ai.tx + 150, f.ai.ty)).toBe(''); run(A, 20); expect(A.train(0, 'rifle')).toBe(''); run(A, 12);
    sync(A, B, a, b, 1000);
    const mine = A.actors.filter(q => q.f === 0 && q.kind !== 'boss'), theirs = B.actors.filter(q => q.f === 1 && q.kind !== 'boss');
    expect(theirs.map(q => q.kind).sort()).toEqual(mine.map(q => q.kind).sort());
    const barracksA = A.structures.find(s => s.f === 0 && s.kind === 'barracks')!, barracksB = B.structures.find(s => s.f === 1 && s.kind === 'barracks')!;
    expect(barracksB).toMatchObject({ x: barracksA.x, y: barracksA.y, built: 1 }); expect(B.structures.filter(s => s.f === 1 && s.kind === 'barracks')).toHaveLength(1);
    sync(A, B, a, b, 3000); expect(B.structures.filter(s => s.f === 1 && s.kind === 'barracks')).toHaveLength(1); // 두 번 받아도 늘어나지 않는다
    // 상대 건물은 상대 쪽에서만 돌아간다: B 가 시간을 보내도 꼭두각시 건물의 건설·체력이 제멋대로 변하지 않는다
    const hp = barracksB.hp; run(B, 10); expect(barracksB.hp).toBe(hp);
    // 내 병력이 죽으면 상대 세계에서도 사라진다
    const victim = mine[0]; A.hurtActor(victim, 1e6, 1); sync(A, B, a, b, 5000); sync(A, B, a, b, 5300);
    expect(B.actors.filter(q => q.f === 1 && q.kind !== 'boss' && q.alive)).toHaveLength(mine.length - 1);
  });

  it('내 병력·포탑이 쏜 탄은 상대 세계로 가서 상대의 병력·보스에게 맞는다', () => {
    const A = make(0), B = make(1), a = new DuelArmy(), b = new DuelArmy(), me = A.boss(0)!, foeB = B.boss(0)!;
    const u = A.spawnUnit('rifle', 0, me.x + 80, me.y); A.shoot(u.x, u.y, Math.PI, 'u_rifle', 0, u.id, 1, false);
    expect(A.armyShots).toHaveLength(1); A.armyShots.length = 0;
    foeB.x = 1000; foeB.y = 1000; const hp = foeB.hp;
    B.remoteArmyShot(1060, 1000, Math.PI, 'u_rifle', 1.5); for (let i = 0; i < 30; i++) { B.step(1 / 60); B.events.length = 0; }
    expect(foeB.hp).toBeLessThan(hp);
    A.shoot(u.x, u.y, 0, 'u_rifle', 0, u.id, 1, false); const m = a.snapshot(A, 1000)!; expect(parseArmy(m)!.sh).toHaveLength(1); expect(A.armyShots).toHaveLength(0);
    void b;
  });

  it('잘못된 병력·건물·사격 메시지는 걸러 낸다', () => {
    expect(parseArmy({ t: 'a', u: 'x', sh: [] })).toBeNull();
    const m = parseArmy({ t: 'a', u: [[1, 'boss', 0, 0, 0, 10, 10], [2, 'rifle', 0, 0, 0, 10, 10], [3, 'rifle', NaN, 0, 0, 10, 10], [4, 'zzz', 0, 0, 0, 10, 10]], s: [[1, 'nope', 0, 0, 1, 1, 0], [2, 'depot', 5, 5, 600, 1, 0]], sh: [[0, 0, 0, 'pistol', 1], [0, 0, 0, 'laser', 1]] });
    expect(m!.u.map(r => r[0])).toEqual([2]); expect(m!.s!.map(r => r[0])).toEqual([2]); expect(m!.sh).toHaveLength(1);
    expect(parseArmy({ t: 'a', u: [], sh: [] })!.s).toBeNull();
  });
});

describe('결투 승패 규칙', () => {
  it('먼저 목표 킬에 도달하면 승리, 시간이 끝나면 킬이 많은 쪽, 같으면 계속', () => {
    expect(duelOutcome(2, TARGET_KILLS, 60)).toBe('win'); expect(duelOutcome(TARGET_KILLS, 1, 60)).toBe('lose');
    expect(duelOutcome(TARGET_KILLS, TARGET_KILLS, 60)).toBeNull();
    expect(duelOutcome(1, 2, TIME_LIMIT)).toBe('win'); expect(duelOutcome(3, 2, TIME_LIMIT)).toBe('lose'); expect(duelOutcome(2, 2, TIME_LIMIT)).toBeNull();
    expect(duelOutcome(2, 2, 100)).toBeNull();
  });
  it('받은 메시지는 형식이 맞을 때만 쓴다', () => {
    expect(parsePose({ t: 'p', x: 1, y: 2, a: 0.5, hp: 50, mh: 100, w: 'pistol' })).toMatchObject({ hp: 50 });
    expect(parsePose({ t: 'p', x: 1, y: 2, a: 0.5, hp: 50, mh: 100, w: 'nuke' })).toBeNull();
    expect(parsePose({ t: 'p', x: NaN, y: 2, a: 0, hp: 1, mh: 1, w: 'pistol' })).toBeNull();
    expect(parseShot({ t: 'sh', x: 1, y: 1, a: 1, w: 'rifle', m: 99 })).toBeNull();
    expect(parseShot({ t: 'sh', x: 1, y: 1, a: 1, w: 'rifle', m: 1.4 })).toMatchObject({ m: 1.4 });
  });
});
