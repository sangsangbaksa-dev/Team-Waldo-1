import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { ACTORS, DIFFICULTY, DIFFICULTY_ORDER, type Difficulty } from '../../src/city/defs';

const AI_MAX_WORKERS = 9; // ai.ts trains up to Math.min(9, ...) workers, each eating 1 supply

describe('부활 보호 (Fix 1: dashT 초고속 버그)', () => {
  it('부활은 dashT를 켜지 않고 전용 보호 타이머(spawnInvuln)만 켠다', () => {
    const w = new World({ seed: 5, difficulty: 'd4', klass: 'warlord' });
    const f = w.factions[0];
    w.killActor(w.boss(0)!, -1);
    w.respawn(f);
    expect(f.dashT).toBe(0);
    expect(f.spawnInvuln).toBeGreaterThan(0);
  });

  it('부활 직후 보스는 3.3배 질주 속도를 받지 않는다 (진짜 대시만 받음)', () => {
    const base = ACTORS.boss.speed * (8 / 30); // 보스 기본 속도로 8프레임 이동한 거리
    const disp = (realDash: boolean): number => {
      const w = new World({ seed: 5, difficulty: 'd4', klass: 'warlord' });
      const f = w.factions[0];
      w.killActor(w.boss(0)!, -1);
      w.respawn(f);
      const b = w.boss(0)!, sx = b.x, sy = b.y;
      if (realDash) f.dashT = 0.2; // 실제 대시 버스트
      w.input = { mx: 1, my: 0, ax: b.x + 1000, ay: b.y, fire: false, dash: false, brake: false };
      for (let i = 0; i < 8; i++) w.step(1 / 30);
      const nb = w.boss(0)!; return Math.hypot(nb.x - sx, nb.y - sy);
    };
    const respawnMove = disp(false), dashMove = disp(true);
    // 부활 직후 이동은 기본 속도 수준 (버그였다면 ~3.3배)
    expect(respawnMove).toBeLessThan(base * 1.6);
    expect(respawnMove).toBeGreaterThan(base * 0.5);
    // 진짜 대시는 여전히 훨씬 빠르다
    expect(dashMove).toBeGreaterThan(respawnMove * 2);
  });

  it('부활 보호 창 동안 받는 피해가 약 0.3배로 줄어든다', () => {
    const w = new World({ seed: 5, difficulty: 'd4', klass: 'warlord' });
    const f = w.factions[0];
    w.killActor(w.boss(0)!, -1);
    w.respawn(f);
    const b = w.boss(0)!;
    f.spawnInvuln = 2.5; f.armor = 0;
    b.hp = b.maxHp; w.hurtActor(b, 200, 1); const lossProtected = b.maxHp - b.hp;
    f.spawnInvuln = 0; f.dashT = 0; b.hp = b.maxHp; w.hurtActor(b, 200, 1); const lossNormal = b.maxHp - b.hp;
    expect(lossProtected).toBeGreaterThan(0);
    expect(lossProtected).toBeLessThan(lossNormal);
    expect(lossProtected / lossNormal).toBeGreaterThan(0.25);
    expect(lossProtected / lossNormal).toBeLessThan(0.35);
  });
});

describe('AI 습격 (Fix 2: 쉬운 난이도에서도 습격)', () => {
  it('습격 병력 임계값이 라이벌의 실제 가용 병력 보급(cap - 일꾼)으로 도달 가능하다', () => {
    for (const d of DIFFICULTY_ORDER) {
      const diff = DIFFICULTY[d];
      // 일꾼 최대치를 빼고도 임계 병력을 낼 수 있어야 한다
      expect(diff.cap - AI_MAX_WORKERS).toBeGreaterThanOrEqual(diff.attackArmy);
    }
  });

  it('습격 임계 병력은 d1→d5로 갈수록 작아진다 (어려울수록 더 빨리 습격)', () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      expect(DIFFICULTY[DIFFICULTY_ORDER[i]].attackArmy)
        .toBeLessThanOrEqual(DIFFICULTY[DIFFICULTY_ORDER[i - 1]].attackArmy);
    }
  });

  it('모든 난이도에서 라이벌이 합리적 시간 안에 실제 습격(attack) 목표에 도달하고, 어려운 쪽이 더 빨리 도달한다', () => {
    const firstAttack = (d: Difficulty): number => {
      const w = new World({ seed: 7, difficulty: d, klass: 'warlord', autoPlayer: true });
      for (const f of w.factions) f.ai.attackT = 0; // 초기 대기시간 제거: 병력만 모이면 습격
      const thr = DIFFICULTY[d].attackArmy;
      let attackT = -1, reachedThr = false;
      for (let i = 0; i < 220 * 30 && !w.over && attackT < 0; i++) {
        w.step(1 / 30); w.events.length = 0;
        for (const f of w.factions) {
          if (!f.alive || f.id < 1) continue;
          if (w.aliveCount() > 3 && w.armyOf(f.id).length >= thr) reachedThr = true;
          if (f.ai.goal === 'attack') { attackT = Math.round(w.time); break; }
        }
      }
      expect(reachedThr, `${d}: 라이벌이 비(非)최종 국면에 임계 병력에 도달`).toBe(true);
      expect(attackT, `${d}: 라이벌이 습격 목표에 도달`).toBeGreaterThanOrEqual(0);
      return attackT;
    };
    const t1 = firstAttack('d1'), t5 = firstAttack('d5');
    expect(t5).toBeLessThanOrEqual(t1);
  }, 60000);
});

describe('전투 난이도 레버 (Fix 3: 상위 티어가 실제로 더 어렵다)', () => {
  it('라이벌 체력 배수(ehp)와 피해 배수(dmg)가 d1→d5로 단조 증가하고 d1은 중립 근처다', () => {
    const ehp = DIFFICULTY_ORDER.map(d => DIFFICULTY[d].ehp);
    const dmg = DIFFICULTY_ORDER.map(d => DIFFICULTY[d].dmg);
    for (let i = 1; i < ehp.length; i++) {
      expect(ehp[i]).toBeGreaterThan(ehp[i - 1]);
      expect(dmg[i]).toBeGreaterThan(dmg[i - 1]);
    }
    expect(ehp[0]).toBeLessThanOrEqual(1); // d1 near-neutral / slightly frailer
  });

  it('ehp가 라이벌 보스·병력 체력에 실제로 적용된다 (플레이어 체력은 난이도와 무관)', () => {
    const rivalBossHp: number[] = [], rivalRifleHp: number[] = [], playerBossHp: number[] = [], playerRifleHp: number[] = [];
    for (const d of DIFFICULTY_ORDER) {
      const w = new World({ seed: 5, difficulty: d, klass: 'warlord' });
      rivalBossHp.push(w.boss(1)!.maxHp);
      rivalRifleHp.push(w.spawnUnit('rifle', 1, 1000, 1000).maxHp);
      playerBossHp.push(w.boss(0)!.maxHp);
      playerRifleHp.push(w.spawnUnit('rifle', 0, 1200, 1200).maxHp);
    }
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      expect(rivalBossHp[i]).toBeGreaterThan(rivalBossHp[i - 1]);
      expect(rivalRifleHp[i]).toBeGreaterThan(rivalRifleHp[i - 1]);
    }
    // 플레이어 체력은 모든 난이도에서 동일 (라이벌만 강화)
    expect(new Set(playerBossHp).size).toBe(1);
    expect(new Set(playerRifleHp).size).toBe(1);
  });
});

describe('AI 회복 키트 절약 (Fix 4)', () => {
  it('AI 보스는 체력이 낮아도 쿨다운 때문에 키트를 한 번에 쏟지 않는다', () => {
    const w = new World({ seed: 5, difficulty: 'd4', klass: 'warlord' });
    const f = w.factions[1], start = 3;
    f.medkits = start; f.medkitCd = 0;
    const b = w.boss(1)!; b.maxHp = 1000;
    for (let i = 0; i < 60; i++) { const bb = w.boss(1); if (bb) bb.hp = 100; w.step(1 / 30); } // 2초: 쿨다운(4초) 안에 1회만
    expect(f.medkits).toBe(start - 1);
  });
});
