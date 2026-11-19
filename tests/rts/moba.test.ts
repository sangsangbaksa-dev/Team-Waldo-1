import { describe, expect, it } from 'vitest';
import { TICK } from '../../src/rts/config';
import { MobaAi } from '../../src/rts/moba/ai';
import { BUSHES, CHAMPS, CHAMP_IDS, ITEMS, ITEM_IDS, LANES, LANE_PTS, NEXUS, SIZE, SPELLS, WAVE_FIRST, inhibSpot, lanePath, turretSpots } from '../../src/rts/moba/config';
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
  it('억제기도 길 위에 있고 길마다 하나씩 있다', () => {
    const s = fresh(); for (const l of LANES) for (const t of [0, 1]) { const p = inhibSpot(l, t); expect(s.pather.freeAt(p.x, p.y), `${l}${t}`).toBe(true); expect(s.ents.filter(e => e.kind === 'inhib' && e.team === t && e.lane === l)).toHaveLength(1); }
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
    const ib = s.ents.find(e => e.kind === 'inhib' && e.team === 1 && e.lane === 'mid')!; expect(s.vulnerable(ib)).toBe(false); expect(s.vulnerable(nx)).toBe(false);
    s.hurt(null, t2, 99999); run(s, 2); expect(s.vulnerable(ib)).toBe(true); expect(s.vulnerable(nx)).toBe(false); s.hurt(null, ib, 99999); run(s, 2); expect(s.vulnerable(nx)).toBe(true);
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
    expect(s.apply(me.id, { k: 'cast', i: 1, x: me.x, y: me.y })).toBe(false); // 아직 배우지 않음
    me.hero!.points = 2; expect(s.apply(me.id, { k: 'learn', i: 1 })).toBe(true); expect(s.apply(me.id, { k: 'learn', i: 2 })).toBe(true);
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

describe('스킬 포인트', () => {
  it('레벨업마다 1점, 궁극기는 3·6·9레벨에, 단계는 레벨의 절반을 넘지 못한다', () => {
    const s = fresh(), me = s.me(), h = me.hero!; expect(h.rank).toEqual([1, 0, 0, 0]); expect(h.points).toBe(0);
    expect(s.apply(me.id, { k: 'learn', i: 0 })).toBe(false); // 포인트 없음
    h.points = 9; h.level = 3; expect(s.apply(me.id, { k: 'learn', i: 0 })).toBe(true); expect(s.apply(me.id, { k: 'learn', i: 0 })).toBe(false); // 3레벨 → 최대 2단계
    h.level = 2; expect(s.apply(me.id, { k: 'learn', i: 3 })).toBe(false); h.level = 3; expect(s.apply(me.id, { k: 'learn', i: 3 })).toBe(true); expect(s.apply(me.id, { k: 'learn', i: 3 })).toBe(false); h.level = 6; expect(s.apply(me.id, { k: 'learn', i: 3 })).toBe(true);
  });
});

describe('봇', () => {
  it.each(['easy', 'normal', 'hard'] as const)('%s: 봇끼리 붙여도 판이 끝난다(40분 안)', lvl => {
    const s = fresh(); for (const h of s.heroes()) h.hero!.bot = true; const ais = [new MobaAi(0, lvl), new MobaAi(1, lvl)];
    while (s.winner === -1 && s.tick < 40 * 60 * TICK) { s.step(); for (const a of ais) a.think(s); }
    expect(s.winner).not.toBe(-1); expect(s.teams[0].kills + s.teams[1].kills).toBeGreaterThan(0); expect(s.heroes().every(h => h.hero!.level >= 8)).toBe(true);
  }, 60000);
});

describe('억제기와 슈퍼 미니언', () => {
  const open = (s: MobaSim, lane: string): void => { for (const t of turrets(s, 1, lane)) s.hurt(null, t, 99999); run(s, 2); };
  it('억제기를 부수면 그 길로 슈퍼 미니언이 나오고, 5분 뒤 되살아난다', () => {
    const s = fresh(); open(s, 'top'); const ib = s.ents.find(e => e.kind === 'inhib' && e.team === 1 && e.lane === 'top')!; s.hurt(null, ib, 99999); expect(ib.hp).toBe(0);
    const respawnTick = s.tick + 5 * 60 * TICK;
    run(s, WAVE_FIRST + 5); expect(s.ents.filter(e => e.kind === 'super' && e.team === 0 && e.lane === 'top')).toHaveLength(1); expect(s.ents.filter(e => e.kind === 'super' && e.lane === 'mid')).toHaveLength(0);
    const nexus = s.ents.find(e => e.kind === 'nexus' && e.team === 1)!;
    expect(s.vulnerable(nexus)).toBe(true);
    s.tick = respawnTick - 2;
    s.step();
    expect(ib.hp).toBe(0);
    s.step();
    expect(ib.hp).toBe(ib.maxhp);
    expect(s.vulnerable(nexus)).toBe(false);
  });
});

describe('새 챔피언·아이템·룬·소환사 주문', () => {
  it('챔피언 9종, 아이템 17종이 모두 정의돼 있다', () => { expect(CHAMP_IDS).toHaveLength(9); expect(ITEM_IDS).toHaveLength(17); expect(Object.keys(SPELLS)).toHaveLength(5); for (const c of CHAMP_IDS) { expect(CHAMPS[c].skills.map(k => k.key)).toEqual(['Q', 'W', 'E', 'R']); } expect(ITEMS.tome.cdr).toBeGreaterThan(0); });
  it('모든 챔피언이 모든 스킬을 오류 없이 쓸 수 있다', () => {
    for (const id of CHAMP_IDS) {
      const s = new MobaSim({ player: id, lane: 'mid', allies: [], foes: [{ champ: 'blade', lane: 'mid' }] }); s.record = false; const me = s.me(), foe = s.heroes(1)[0]; me.x = 50; me.y = 50; foe.x = 54; foe.y = 50; me.hero!.level = 9; me.hero!.points = 20; me.hero!.mp = me.hero!.maxmp = 9999;
      for (let i = 0; i < 4; i++) s.learn(me, i);
      for (let i = 0; i < 4; i++) { me.x = 50; me.y = 50; expect(s.apply(me.id, { k: 'cast', i, x: 54, y: 50 }), `${id}${i}`).toBe(true); }
      expect(foe.hp, id).toBeLessThan(foe.maxhp);
    }
  });
  it('랜서의 창 찌르기는 일직선의 적을 모두 꿰뚫고, 세이어의 구슬은 기절시킨다', () => {
    const s = new MobaSim({ player: 'lancer', lane: 'mid', allies: [], foes: [{ champ: 'blade', lane: 'mid' }, { champ: 'blade', lane: 'top' }] }); s.record = false;
    const me = s.me(), [a, b] = s.heroes(1); me.x = 50; me.y = 50; a.x = 53; a.y = 50; b.x = 55; b.y = 50; s.apply(me.id, { k: 'cast', i: 0, x: 60, y: 50 }); expect(a.hp).toBeLessThan(a.maxhp); expect(b.hp).toBeLessThan(b.maxhp);
    const t = new MobaSim({ player: 'seer', lane: 'mid', allies: [], foes: [{ champ: 'blade', lane: 'mid' }] }); t.record = false; const m2 = t.me(), f2 = t.heroes(1)[0]; m2.x = 50; m2.y = 50; f2.x = 55; f2.y = 50; t.apply(m2.id, { k: 'learn', i: 0 }); t.apply(m2.id, { k: 'cast', i: 0, x: 55, y: 50 });
    expect(f2.hero!.stunUntil).toBeGreaterThan(t.tick);
  });
  it('점멸은 앞으로 이동하고, 회복은 체력을 채우며, 재사용 대기를 지킨다', () => {
    const s = new MobaSim({ player: 'blade', lane: 'mid', allies: [], foes: [{ champ: 'blade', lane: 'mid' }], kit: { spells: ['flash', 'heal'], rune: 'swift' } }); s.record = false; const me = s.me(); me.x = 50; me.y = 50;
    expect(s.apply(me.id, { k: 'spell', i: 0, x: 60, y: 50 })).toBe(true); expect(me.x).toBeGreaterThan(53); expect(s.apply(me.id, { k: 'spell', i: 0, x: 60, y: 50 })).toBe(false);
    me.hp = 100; expect(s.apply(me.id, { k: 'spell', i: 1, x: 0, y: 0 })).toBe(true); expect(me.hp).toBeGreaterThan(180);
  });
  it('룬은 능력치를 바꾸고, 감전은 같은 챔피언을 세 번 맞히면 터진다', () => {
    const a = new MobaSim({ player: 'blade', lane: 'mid', allies: [], foes: [{ champ: 'blade', lane: 'mid' }], kit: { rune: 'fortitude' } }), b = new MobaSim({ player: 'blade', lane: 'mid', allies: [], foes: [{ champ: 'blade', lane: 'mid' }], kit: { rune: 'electro' } });
    expect(a.me().maxhp).toBeGreaterThan(b.me().maxhp + 150);
    b.record = false; const me = b.me(), foe = b.heroes(1)[0]; foe.def = 0; const base = foe.hp; b.hurt(me, foe, 10); b.hurt(me, foe, 10); const two = base - foe.hp; b.hurt(me, foe, 10); expect(base - foe.hp - two).toBeGreaterThan(40);
  });
});

describe('와드와 시야', () => {
  it('멀리 있는 적은 보이지 않고, 와드를 놓으면 보인다. 와드는 90초 뒤 사라진다', () => {
    const s = fresh(), me = s.me(), foe = s.heroes(1)[0]; me.x = 50; me.y = 50; foe.x = 58; foe.y = 50; run(s, 4); expect(s.canSee(0, foe)).toBe(true); foe.x = 66; foe.y = 50; run(s, 4); expect(s.canSee(0, foe)).toBe(false);
    expect(s.apply(me.id, { k: 'attack', target: foe.id })).toBe(false); expect(s.apply(me.id, { k: 'ward', x: 70, y: 50 })).toBe(true); run(s, 4); expect(s.canSee(0, foe)).toBe(true);
    expect(s.canSee(1, me)).toBe(false); expect(s.wards).toHaveLength(1); run(s, TICK * 91); expect(s.wards).toHaveLength(0);
  });
  it('와드는 두 개까지만 들고 있으며, 시간이 지나면 채워진다', () => {
    const s = fresh(), me = s.me(); me.x = 50; me.y = 50; expect(s.apply(me.id, { k: 'ward', x: 52, y: 50 })).toBe(true); expect(s.apply(me.id, { k: 'ward', x: 54, y: 50 })).toBe(true); expect(s.apply(me.id, { k: 'ward', x: 56, y: 50 })).toBe(false);
    run(s, TICK * 40); expect(me.hero!.wards).toBeGreaterThan(0);
  });
  it('핑은 팀에게 기록된다', () => { const s = fresh(); expect(s.apply(s.me().id, { k: 'ping', x: 40, y: 40, kind: 'assist' })).toBe(true); expect(s.pings).toHaveLength(1); expect(s.apply(s.me().id, { k: 'ping', x: NaN, y: 0, kind: 'assist' })).toBe(false); });
});

describe('정글러와 버프', () => {
  it('골렘을 잡으면 파랑 버프, 늑대 무리를 정리하면 빨강 버프를 받는다', () => {
    const s = fresh(); run(s, TICK * 31); const me = s.me(); for (const m of s.ents.filter(e => e.kind === 'monster' && e.sub === 'golem').slice(0, 1)) s.hurt(me, m, 99999); run(s, 2); expect(me.hero!.blueUntil).toBeGreaterThan(s.tick);
    const camp = s.ents.filter(e => e.kind === 'monster' && e.sub === 'wolf' && e.camp === 'wolves-a'); for (const w of camp) s.hurt(me, w, 99999); run(s, 2); expect(me.hero!.redUntil).toBeGreaterThan(s.tick);
  });
  it('봇 정글러가 정글 몬스터를 사냥한다(4 대 4)', () => {
    const roles = ['top', 'mid', 'bot', 'jungle'] as const; const s = new MobaSim({ player: 'blade', lane: 'jungle', allies: roles.slice(0, 3).map((l, i) => ({ champ: CHAMP_IDS[i + 1], lane: l })), foes: roles.map((l, i) => ({ champ: CHAMP_IDS[i + 4], lane: l })) }); s.record = false;
    for (const h of s.heroes()) h.hero!.bot = true; const ais = [new MobaAi(0, 'normal'), new MobaAi(1, 'normal')]; let cs = 0;
    for (let i = 0; i < TICK * 150; i++) { s.step(); for (const a of ais) a.think(s); } for (const h of s.heroes()) if (h.hero!.lane === 'jungle') cs += h.hero!.cs; expect(cs).toBeGreaterThan(3);
  }, 60000);
  it('새 챔피언·4 대 4 봇 전투도 판이 끝난다', () => {
    const roles = ['top', 'mid', 'bot', 'jungle'] as const; const s = new MobaSim({ player: 'titan', lane: 'top', allies: roles.slice(1).map((l, i) => ({ champ: (['ember', 'lancer', 'seer'] as const)[i], lane: l })), foes: roles.map((l, i) => ({ champ: CHAMP_IDS[i], lane: l })) }); s.record = false;
    for (const h of s.heroes()) h.hero!.bot = true; const ais = [new MobaAi(0, 'hard'), new MobaAi(1, 'hard')];
    while (s.winner === -1 && s.tick < 40 * 60 * TICK) { s.step(); for (const a of ais) a.think(s); } expect(s.winner).not.toBe(-1);
  }, 90000);
});

describe('수풀·와드 제거·새 정글 몬스터', () => {
  it('모든 수풀 중심은 걸어갈 수 있고 점대칭이다', () => {
    const s = fresh(); expect(BUSHES.length % 2).toBe(0);
    for (const b of BUSHES) { expect(s.pather.freeAt(b.x, b.y), `${b.x},${b.y}`).toBe(true); expect(BUSHES.some(o => Math.abs(o.x - (SIZE - b.x)) < 1e-6 && Math.abs(o.y - (SIZE - b.y)) < 1e-6)).toBe(true); }
  });
  it('수풀 안 적은 가까이 있어도 안 보이고, 같은 수풀에 들어가거나 공격하면 드러난다', () => {
    const s = fresh(), me = s.me(), foe = s.ents.find(e => e.hero && e.team === 1)!, b = BUSHES[0];
    me.x = b.x + 6; me.y = b.y; foe.x = b.x; foe.y = b.y; s.step(); s.step(); s.step(); s.step();
    for (const e of s.ents) if (e !== me && e !== foe && e.hero) { e.x = 50; e.y = 50; }
    for (let i = 0; i < 4; i++) s.step(); expect(s.canSee(0, foe)).toBe(false);
    me.x = b.x + 1; me.y = b.y; for (let i = 0; i < 4; i++) s.step(); expect(s.canSee(0, foe)).toBe(true);
    me.x = b.x + 6; me.y = b.y; for (let i = 0; i < 4; i++) s.step(); expect(s.canSee(0, foe)).toBe(false);
    s.hurt(foe, me, 1); expect(s.canSee(0, foe)).toBe(true);
  });
  it('보이는 적 와드를 가까이에서 부수면 골드를 얻고 멀면 실패한다', () => {
    const s = fresh(), me = s.me(), foe = s.ents.find(e => e.hero && e.team === 1)!; foe.hero!.wards = 2; foe.x = 40; foe.y = 40; me.x = 41; me.y = 41;
    expect(s.apply(foe.id, { k: 'ward', x: 40, y: 40 })).toBe(true); const w = s.wards[s.wards.length - 1]; for (let i = 0; i < 4; i++) s.step();
    const g = me.hero!.gold; me.x = w.x + 9; me.y = w.y; expect(s.apply(me.id, { k: 'unward', id: w.id })).toBe(false);
    me.x = w.x + 2; me.y = w.y; expect(s.apply(me.id, { k: 'unward', id: w.id })).toBe(true); expect(s.wards.includes(w)).toBe(false); expect(me.hero!.gold).toBe(g + 30);
    expect(s.apply(me.id, { k: 'unward', id: w.id })).toBe(false);
  });
  it('칼날 부리·돌거북·강 게가 나오고, 강 게를 잡으면 이동 속도와 시야를 얻는다', () => {
    const s = fresh(); run(s, TICK * 31);
    for (const k of ['raptor', 'krug', 'crab']) expect(s.ents.some(e => e.kind === 'monster' && e.sub === k), k).toBe(true);
    const me = s.me(), crab = s.ents.find(e => e.sub === 'crab')!, g = me.hero!.gold; s.hurt(me, crab, 99999); run(s, 2);
    expect(me.hero!.gold).toBeGreaterThanOrEqual(g + 70); expect(me.hero!.speedUntil).toBeGreaterThan(s.tick); expect(s.wards.some(w => w.team === 0 && w.owner === 0)).toBe(true);
  });
});

describe('사람끼리 팀 대전(방)', () => {
  const pvp = (): MobaSim => { const s = new MobaSim({ player: 'blade', lane: 'top', allies: [{ champ: 'arcana', lane: 'mid', human: true }, { champ: 'ranger', lane: 'bot' }, { champ: 'blade', lane: 'jungle' }], foes: [{ champ: 'arcana', lane: 'top', human: true }, { champ: 'ranger', lane: 'mid' }, { champ: 'blade', lane: 'bot' }, { champ: 'arcana', lane: 'jungle' }] }); s.record = false; return s; };
  it('적 팀 사람 영웅은 봇이 아니고 AI 가 조종하지 않는다', () => {
    const s = pvp(), ais = [new MobaAi(0, 'normal'), new MobaAi(1, 'normal')], foe = s.get(s.heroIds[4])!;
    expect(foe.team).toBe(1); expect(foe.hero!.bot).toBe(false); expect(s.get(s.heroIds[1])!.hero!.bot).toBe(false);
    for (let i = 0; i < 60; i++) { s.step(); for (const a of ais) a.think(s); } // 겹쳐 태어난 영웅이 밀려나 자리를 잡을 시간
    const x = foe.x, y = foe.y; for (let i = 0; i < 160; i++) { s.step(); for (const a of ais) a.think(s); }
    expect(Math.hypot(foe.x - x, foe.y - y)).toBeLessThan(0.01);
  });
  it('적 팀 사람의 명령이 적용되고 myTeam 이 따라간다', () => {
    const s = pvp(), id = s.heroIds[4]; s.meId = id; expect(s.myTeam).toBe(1);
    expect(s.apply(id, { k: 'move', x: s.get(id)!.x - 6, y: s.get(id)!.y + 6 })).toBe(true); const x0 = s.get(id)!.x; run(s, 60);
    expect(s.get(id)!.x).toBeLessThan(x0 - 1);
  });
});
