import { expect, it } from 'vitest';
import { blankLife, computePerks } from '../../src/outlaw/life';
import { Sim } from '../../src/outlaw/sim';

it('기존 체육관 훈련 값은 로드할 때 버리고 시민 고유 능력을 유지한다', () => {
  const sim = new Sim(7);
  const save = sim.exportSave();
  const life = { ...blankLife(), hero: 'h4', skills: { stamina: 5, strength: 5, shooting: 5 }, ach: ['trained'] };
  sim.applySave({ ...save, life });
  expect(sim.perk).toEqual(computePerks(blankLife()));
  expect(sim.exportSave().life).not.toHaveProperty('skills');
  expect(sim.life.ach).not.toContain('trained');
});
