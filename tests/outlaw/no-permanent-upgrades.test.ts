import { expect, it } from 'vitest';
import { blankLife, computePerks } from '../../src/outlaw/life';
import { Sim } from '../../src/outlaw/sim';

it('기존 체육관 훈련 값은 로드할 때 버리고 시민 고유 능력을 유지한다', () => {
  const sim = new Sim(7);
  const save = sim.exportSave();
  const life = { ...blankLife(), hero: 'h4', skills: { stamina: 5, strength: 5, shooting: 5 }, ach: ['trained'] };
  sim.applySave({ ...save, life });
  expect(sim.perk).toEqual(computePerks({ ...blankLife(), hero: 'h4' }));
  expect(sim.exportSave().life).not.toHaveProperty('skills');
  expect(sim.life.ach).not.toContain('trained');
});

it('손상된 저장을 읽어도 유효한 게임 상태와 탄약 수치를 유지한다', () => {
  const sim = new Sim(7);
  sim.applySave({ v: 1, cash: null, completed: null, collected: [1, 1, -1], guns: [['constructor', 1, 1], ['pistol', 999, -1]], life: { props: null, cars: [{ kind: 'constructor' }], counters: null, ach: null } });
  expect(sim.cash).toBe(400);
  expect(sim.player.guns[1]).toMatchObject({ mag: 12, reserve: 0 });
  expect([...sim.collected]).toEqual([1]);
  expect(sim.life.props).toEqual([]);
  expect(sim.life.cars).toEqual([]);
});
