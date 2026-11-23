import { describe, expect, it } from 'vitest';
import { DIFFS, SkySim, WORLD_R, terrainY, type Input } from '../../src/sky/sim';

const idle: Input = { pitch: 0, roll: 0, throttle: 0.5, fire: false, missile: false, flare: false };
const finite = (...nums: number[]): boolean => nums.every(Number.isFinite);

describe('SKY WAR 장시간 전투 안정성', () => {
  it('50초 동안 기관포 발사·AI 추격 중 물리값과 발사체 수가 정상 범위다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.player.hp = sim.player.maxHp = 100000;
    for (let i = 0; i < 1500; i++) {
      sim.step(1 / 30, { ...idle, fire: true, boost: i % 120 < 30, roll: Math.sin(i / 70) * 0.22 });
      for (const jet of sim.jets) {
        expect(finite(jet.pos.x, jet.pos.y, jet.pos.z, jet.pitch, jet.roll, jet.yaw, jet.speed, jet.hp,
          jet.q.x, jet.q.y, jet.q.z, jet.q.w)).toBe(true);
      }
      for (const m of sim.missiles) expect(finite(m.pos.x, m.pos.y, m.pos.z, m.vel.x, m.vel.y, m.vel.z, m.life)).toBe(true);
      for (const b of sim.bullets) expect(finite(b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z, b.life)).toBe(true);
      expect(sim.bullets.length).toBeLessThanOrEqual(400);
      expect(sim.missiles.length).toBeLessThanOrEqual(80);
      sim.events.length = 0;
    }
    expect(sim.time).toBeCloseTo(50, 5);
    expect(sim.player.alive).toBe(true);
    expect(sim.shots).toBeGreaterThan(50);
  }, 15000);

  it('400개 탄환 풀이 해제와 재사용을 반복해도 메모리를 무한히 늘리지 않는다', () => {
    const sim = new SkySim(DIFFS[1]!);
    for (let i = 0; i < 600; i++) sim.fireGun(sim.player, 0);
    expect(sim.bullets).toHaveLength(400);
    expect(sim.shots).toBe(400);
    const first = sim.bullets[0]!;
    sim.step(1.5, idle);
    expect(sim.bullets).toHaveLength(0);
    for (let i = 0; i < 600; i++) sim.fireGun(sim.player, 0);
    expect(sim.bullets).toHaveLength(400);
    expect(sim.shots).toBe(800);
    expect(sim.bullets).toContain(first);
  });

  it('10번 웨이브 생성에서 보스 편대와 적기 위치 및 생존 수를 유지한다', () => {
    const sim = new SkySim(DIFFS[2]!);
    sim.player.hp = sim.player.maxHp = 100000;
    const bossWaves: number[] = [];
    for (let wave = 1; wave <= 10; wave++) {
      sim.intermission = 0;
      sim.step(1 / 60, idle);
      expect(sim.wave).toBe(wave);
      const live = sim.enemies();
      expect(live.length).toBeGreaterThan(0);
      expect(live.length).toBeLessThanOrEqual(11);
      const bosses = live.filter(e => e.kind === 'boss');
      if (bosses.length) bossWaves.push(wave);
      for (const enemy of live) {
        expect(Math.hypot(enemy.pos.x, enemy.pos.z)).toBeLessThanOrEqual(WORLD_R * 0.93 + 5);
        expect(enemy.pos.y).toBeGreaterThanOrEqual(terrainY(enemy.pos.x, enemy.pos.z) + 199);
        sim.kill(enemy, 0);
      }
      sim.events.length = 0;
    }
    expect(bossWaves).toEqual([5, 10]);
  });
});
