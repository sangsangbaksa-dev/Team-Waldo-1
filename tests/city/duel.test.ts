import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { TARGET_KILLS, TIME_LIMIT, duelOutcome, parsePose, parseShot } from '../../src/city/duel';

const make = (side: 0 | 1, seed = 11, klass: 'warlord' | 'tycoon' | 'engineer' = 'warlord'): World => new World({ seed, difficulty: 'd4', klass, tutorial: true, duel: { side, name: '상대' } });
const run = (w: World, sec: number): void => { for (let i = 0; i < sec * 60; i++) { w.step(1 / 60); w.events.length = 0; } };

describe('LAST CITY 1대1 결투 세계', () => {
  it('두 조직만 남고 병력·차량·시민 없이 시작한다', () => {
    const w = make(0);
    expect(w.factions.filter(f => f.alive).map(f => f.id)).toEqual([0, 1]);
    expect(w.factions[1].name).toBe('상대');
    expect(w.actors.filter(a => a.alive).map(a => a.kind).sort()).toEqual(['boss', 'boss']);
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

  it('결투에서는 병력·건설·연구가 막혀 있다', () => {
    const w = make(0); w.factions[0].cash = 99999; w.factions[0].crystal = 99999;
    expect(w.train(0, 'rifle')).toMatch(/결투/); expect(w.build(0, 'barracks', 0, 0)).toMatch(/결투/); expect(w.research(0, 'dmg')).toMatch(/결투/);
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
