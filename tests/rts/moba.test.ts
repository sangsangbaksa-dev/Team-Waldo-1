import { describe, expect, it } from 'vitest';
import { TICK } from '../../src/rts/config';
import { MobaAi } from '../../src/rts/moba/ai';
import { CHAMPS, LANES, LANE_PTS, NEXUS, SIZE, WAVE_FIRST, lanePath, turretSpots } from '../../src/rts/moba/config';
import { buildMobaMap } from '../../src/rts/moba/map';
import { MobaSim } from '../../src/rts/moba/sim';
import { Pather } from '../../src/rts/path';

const fresh = (): MobaSim => { const s = new MobaSim(); s.record = false; return s; };
const run = (s: MobaSim, ticks: number): void => { for (let i = 0; i < ticks; i++) s.step(); };
const turrets = (s: MobaSim, team: number, lane: string) => s.ents.filter(e => e.kind === 'turret' && e.team === team && e.lane === lane).sort((a, b) => a.tier - b.tier);

describe('롤식 라인전 맵', () => {
  it('지형은 점대칭이다', () => {
    const m = buildMobaMap(), n = SIZE;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) expect(m.terrain[y * n + x]).toBe(m.terrain[(n - 1 - y) * n + (n - 1 - x)]);
  });
  it('세 길목은 두 넥서스를 막힘 없이 잇고, 포탑 자리도 길 위에 있다', () => {
    const s = fresh(), pf = new Pather(SIZE, s.grid);
    for (const l of LANES) {
      for (const p of LANE_PTS[l]) expect(s.pather.freeAt(p.x, p.y)).toBe(true);
      for (const t of [0, 1]) for (const p of turretSpots(l, t)) expect(s.pather.freeAt(p.x, p.y)).toBe(true);
      const path = pf.find(NEXUS[0].x + 3, NEXUS[0].y - 3, NEXUS[1].x - 3, NEXUS[1].y + 3); expect(path).not.toBeNull();
    }
    expect(lanePath('top', 1)[0]).toEqual(NEXUS[1]);
  });
  it('모든 정글 둥지에 걸어서 닿을 수 있다', () => {
    const s = fresh(), pf = new Pather(SIZE, s.grid);
    for (const c of s.map.camps) { const path = pf.find(15, 85, c.at.x, c.at.y); expect(path, c.id).not.toBeNull(); expect(Math.hypot(path![path!.length - 2] - c.at.x, path![path!.length - 1] - c.at.y), c.id).toBeLessThan(2.5); }
  });
  it('청과 적이 같은 수의 포탑(길마다 3개)으로 시작한다', () => {
    const s = fresh(); expect(s.teams.map(t => t.towers)).toEqual([9, 9]);
    for (const l of LANES) for (const t of [0, 1]) expect(turrets(s, t, l).map(x => x.tier)).toEqual([0, 1, 2]);
  });
});

describe('웨이브와 포탑', () => {
  it('12초에 길마다 미니언이 나오고 길을 따라 전진한다', () => {
    const s = fresh(); run(s, WAVE_FIRST + 5);
    const mins = s.ents.filter(e => e.kind === 'melee' || e.kind === 'caster'); expect(mins.length).toBe(2 * 3 * 5);
    const before = mins.find(m => m.team === 0 && m.lane === 'mid')!, x0 = before.x; run(s, TICK * 6); expect(Math.hypot(before.x - x0, 0)).toBeGreaterThan(0.5);
  });
  it('안쪽 포탑과 넥서스는 바깥 포탑이 무너져야 맞을 수 있다', () => {
    const s = fresh(), [t0, t1, t2] = turrets(s, 1, 'mid'), nx = s.ents.find(e => e.kind === 'nexus' && e.team === 1)!;
    expect(s.vulnerable(t0)).toBe(true); expect(s.vulnerable(t1)).toBe(false); expect(s.vulnerable(t2)).toBe(false); expect(s.vulnerable(nx)).toBe(false);
    s.hurt(null, t1, 9999); expect(t1.hp).toBe(t1.maxhp);
    s.hurt(null, t0, 99999); run(s, 2); expect(s.vulnerable(t1)).toBe(true); expect(s.vulnerable(t2)).toBe(false);
    s.hurt(null, t1, 99999); run(s, 2); expect(s.vulnerable(t2)).toBe(true); expect(s.vulnerable(nx)).toBe(false);
    s.hurt(null, t2, 99999); run(s, 2); expect(s.vulnerable(nx)).toBe(true);
    s.hurt(null, nx, 99999); expect(s.winner).toBe(0);
  });
  it('포탑은 챔피언보다 미니언을 먼저 쏜다', () => {
    const s = fresh(), t = turrets(s, 1, 'mid')[0], hero = s.me(); hero.x = t.x - 5; hero.y = t.y + 5; s.apply(hero.id, { k: 'stop' });
    run(s, WAVE_FIRST + 5); const m = s.ents.find(e => e.team === 0 && e.kind === 'melee')!; m.x = t.x - 4; m.y = t.y + 4; m.spawnAt = 0; hero.hp = hero.maxhp; const hp0 = hero.hp; run(s, 30);
    expect(hero.hp).toBe(hp0); expect(m.hp < m.maxhp || m.hp <= 0).toBe(true);
  });
});

describe('챔피언', () => {
  it('3레벨 전에는 궁극기를 쓸 수 없고, 마나·재사용 대기를 지킨다', () => {
    const s = fresh(), me = s.me(); expect(s.apply(me.id, { k: 'cast', i: 3, x: me.x + 3, y: me.y })).toBe(false);
    expect(s.apply(me.id, { k: 'cast', i: 1, x: me.x, y: me.y })).toBe(true); expect(s.apply(me.id, { k: 'cast', i: 1, x: me.x, y: me.y })).toBe(false); // 재사용 대기
    me.hero!.mp = 0; expect(s.apply(me.id, { k: 'cast', i: 2, x: me.x, y: me.y })).toBe(false);
  });
  it('블레이드 돌진은 목표 쪽으로 이동하며 적을 벤다', () => {
    const s = fresh(), me = s.me(); me.x = 50; me.y = 50; const foe = s.ents.find(e => e.team === 1 && e.hero)!; foe.x = 54; foe.y = 50; const hp = foe.hp;
    expect(s.apply(me.id, { k: 'cast', i: 0, x: 54, y: 50 })).toBe(true); expect(me.x).toBeGreaterThan(52); expect(foe.hp).toBeLessThan(hp);
  });
  it('아르카나 마력탄은 처음 맞은 적만 맞힌다', () => {
    const s = new MobaSim({ player: 'arcana', lane: 'mid', allies: [], foes: [{ champ: 'blade', lane: 'mid' }, { champ: 'blade', lane: 'top' }] }); s.record = false;
    const me = s.me(), [a, b] = s.heroes(1); me.x = 50; me.y = 50; a.x = 56; a.y = 50; b.x = 60; b.y = 50; s.apply(me.id, { k: 'cast', i: 0, x: 60, y: 50 });
    expect(a.hp).toBeLessThan(a.maxhp); expect(b.hp).toBe(b.maxhp);
  });
  it('기지에서만 아이템을 살 수 있고 능력치가 오른다', () => {
    const s = fresh(), me = s.me(), ad = me.dmg; me.hero!.gold = 2000;
    expect(s.apply(me.id, { k: 'buy', item: 'sword' })).toBe(true); expect(me.dmg).toBeGreaterThan(ad); expect(me.hero!.gold).toBe(1650);
    me.x = 50; me.y = 50; expect(s.apply(me.id, { k: 'buy', item: 'sword' })).toBe(false);
  });
  it('귀환은 4초 뒤 기지로 보내고, 맞으면 끊긴다', () => {
    const s = fresh(), me = s.me(); me.x = 50; me.y = 50; s.apply(me.id, { k: 'recall' }); run(s, TICK * 4 + 2); expect(s.inBase(me)).toBe(true);
    me.x = 50; me.y = 50; s.apply(me.id, { k: 'recall' }); run(s, TICK); s.hurt(null, me, 30); run(s, TICK * 4); expect(s.inBase(me)).toBe(false);
  });
  it('죽으면 시간이 지난 뒤 기지에서 부활한다', () => {
    const s = fresh(), me = s.me(); s.hurt(null, me, 99999); expect(me.hero!.dead).toBe(true); expect(s.apply(me.id, { k: 'move', x: 40, y: 40 })).toBe(false);
    run(s, TICK * 12); expect(me.hero!.dead).toBe(false); expect(s.inBase(me)).toBe(true); expect(me.hp).toBe(me.maxhp);
  });
  it('챔피언마다 스킬 네 개가 있고 R 은 3레벨부터다', () => { for (const c of Object.values(CHAMPS)) { expect(c.skills.map(k => k.key)).toEqual(['Q', 'W', 'E', 'R']); expect(c.skills[3].level).toBe(3); } });
});

describe('정글과 보상', () => {
  it('정글 몬스터는 정해진 시간에 나타나고 잡으면 골드와 경험치를 준다', () => {
    const s = fresh(); run(s, TICK * 21); const wolf = s.ents.find(e => e.kind === 'monster' && e.sub === 'wolf')!; expect(wolf).toBeDefined();
    const me = s.me(), g = me.hero!.gold; s.hurt(me, wolf, 99999); run(s, 2); expect(me.hero!.gold).toBeGreaterThan(g + 30); expect(me.hero!.xp + me.hero!.level).toBeGreaterThan(1);
  });
  it('미니언을 처치하면 골드를 얻고 레벨이 오른다', () => {
    const s = fresh(); run(s, WAVE_FIRST + 5); const me = s.me(), m = s.ents.find(e => e.team === 1 && e.kind === 'melee')!; m.x = me.x + 1; m.y = me.y; const g = me.hero!.gold;
    s.hurt(me, m, 9999); expect(me.hero!.gold).toBeGreaterThan(g + 15); for (let i = 0; i < 30; i++) s.addXp(me, 400); expect(me.hero!.level).toBe(15);
  });
});

describe('봇', () => {
  it.each(['easy', 'normal', 'hard'] as const)('%s: 봇끼리 붙여도 판이 끝난다(40분 안)', lvl => {
    const s = fresh(); for (const h of s.heroes()) h.hero!.bot = true; const ais = [new MobaAi(0, lvl), new MobaAi(1, lvl)];
    while (s.winner === -1 && s.tick < 40 * 60 * TICK) { s.step(); for (const a of ais) a.think(s); }
    expect(s.winner).not.toBe(-1); expect(s.teams[0].kills + s.teams[1].kills).toBeGreaterThan(0); expect(s.heroes().every(h => h.hero!.level >= 8)).toBe(true);
  }, 60000);
});
