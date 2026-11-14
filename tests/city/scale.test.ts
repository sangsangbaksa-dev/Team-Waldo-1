import { describe, expect, it } from 'vitest';
import { ACTORS, type ActorKind } from '../../src/city/defs';
import { AWNING_OUT, CHAR_SCALE, EYE_HEIGHT, HUMAN, PROPS, SIDEWALK } from '../../src/city/scale';

const HUMANOIDS: ActorKind[] = ['boss', 'worker', 'rifle', 'heavy', 'sniper', 'medic', 'civ', 'cop', 'swat', 'guard', 'merc'];

describe('사람 눈금', () => {
  it('보스와 병사는 같은 배율이라 키가 같다', () => {
    expect(CHAR_SCALE).toBe(HUMAN);
    // 모델 키는 모두 약 1.9m 이므로 같은 배율이면 월드 키도 같다.
    expect(Math.round(1.9 * CHAR_SCALE)).toBe(40);
  });
  it('보스의 몸통 충돌 반지름이 소총병과 같다', () => {
    expect(ACTORS.boss.r).toBe(ACTORS.rifle.r);
    for (const k of HUMANOIDS) expect(ACTORS[k].r).toBeLessThanOrEqual(11);
  });
  it('1인칭 눈높이는 머리 꼭대기(1.9m)보다 낮고 키의 90% 이상이다', () => {
    expect(EYE_HEIGHT).toBeLessThan(1.9 * HUMAN);
    expect(EYE_HEIGHT).toBeGreaterThan(1.9 * HUMAN * 0.9);
  });
  it('작은 거리 소품은 사람 눈금을 그대로 쓴다', () => {
    for (const n of ['hydrant', 'bin', 'mailbox', 'bench', 'dumpster', 'cone', 'barrier', 'vending', 'planter', 'bollards', 'phone_booth', 'street_sign', 'lamp', 'tl_red', 'tl_green']) expect(PROPS[n].scale).toBe(HUMAN);
  });
  it('보도에 놓는 큰 구조물도 사람 눈금의 60% 이상이고 보도 폭 안에 들어간다', () => {
    for (const [n, p] of Object.entries(PROPS)) {
      if (n === 'lamp' || n.startsWith('tl_')) continue;
      expect(p.scale, n).toBeGreaterThanOrEqual(HUMAN * 0.6);
      expect(p.depth * p.scale, n).toBeLessThanOrEqual(SIDEWALK - 4 + 8);   // 연석 쪽으로 약간 걸치는 것까지 허용
    }
    expect(AWNING_OUT).toBeLessThan(SIDEWALK);
  });
  it('소품 키는 사람 키와 비교해 현실적이다(m 단위 모델 기준)', () => {
    const human = 1.9 * HUMAN, h = (n: string): number => PROPS[n].height * PROPS[n].scale;
    expect(h('bin') / human).toBeGreaterThan(0.4); expect(h('bench') / human).toBeGreaterThan(0.4);
    expect(h('lamp') / human).toBeGreaterThan(3); expect(h('phone_booth') / human).toBeGreaterThan(1);
  });
});
