import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DIFFS, GUN_RANGE, MISSILE_DMG, SkySim, WORLD_R, terrainY, type Input } from '../../src/sky/sim';

const neutral: Input = { pitch: 0, roll: 0, throttle: 0.5, fire: false, missile: false, flare: false };

describe('SKY WAR 비행 경계와 웨이브', () => {
  it('수평 작전 경계에서 기체 고도가 갑자기 낮아지지 않는다', () => {
    const sim = new SkySim(DIFFS[1]!);
    const p = sim.player;
    p.pos.set(WORLD_R * 1.5, 800, 0);
    sim.flyJet(p, 0, 0, 0.5, 1 / 60);
    expect(Math.hypot(p.pos.x, p.pos.z)).toBeCloseTo(WORLD_R * 1.12, 4);
    expect(p.pos.y).toBeCloseTo(800, 4);
  });

  it('적기가 경계에서 방향을 바꾸더라도 한 프레임에 두 번 이동하지 않는다', () => {
    const sim = new SkySim(DIFFS[1]!);
    const enemy = sim.makeJet('enemy', 'fighter', new THREE.Vector3(WORLD_R * 1.05, 900, 0), 0.8);
    const before = enemy.pos.clone();
    const dt = 0.05;
    sim.step(dt, neutral);
    expect(enemy.pos.distanceTo(before)).toBeCloseTo(enemy.speed * dt, 4);
  });

  it('적기는 낮은 고도에서 지면을 향해 급강하하지 않고 상승한다', () => {
    const sim = new SkySim(DIFFS[1]!);
    const enemy = sim.makeJet('enemy', 'fighter', new THREE.Vector3(0, 50, 100), 0.8);
    sim.step(0.05, neutral);
    expect(enemy.pitch).toBeGreaterThan(0);
    expect(enemy.pos.y).toBeGreaterThan(50);
    expect(enemy.alive).toBe(true);
  });

  it('플레이어가 외곽에 있어도 적 편대는 작전 구역 안의 안전한 고도에서 생성된다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.player.pos.set(0, 1000, WORLD_R * 1.08);
    sim.intermission = 0;
    sim.step(1 / 60, neutral);
    expect(sim.wave).toBe(1);
    const enemies = sim.enemies();
    expect(enemies.length).toBeGreaterThan(0);
    for (const enemy of enemies) {
      expect(Math.hypot(enemy.pos.x, enemy.pos.z)).toBeLessThanOrEqual(WORLD_R * 0.93 + 5); // 스폰 직후 AI가 한 틱 이동한 거리 허용
      expect(enemy.pos.y).toBeGreaterThanOrEqual(terrainY(enemy.pos.x, enemy.pos.z) + 200);
    }
  });
});

describe('SKY WAR 발사체·보급품 회귀 테스트', () => {
  it('미사일은 프레임 이동 중 목표를 가로질렀다면 명중한다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.player.pos.set(0, 900, 0);
    sim.missiles.push({
      id: 999, owner: 999, team: 'enemy', pos: new THREE.Vector3(0, 900, 45),
      vel: new THREE.Vector3(0, 0, -520), target: sim.player.id, life: 4, alive: true,
    });
    sim.step(0.05, neutral);
    expect(sim.player.hp).toBeLessThan(100);
    expect(sim.missiles).toHaveLength(0);
  });

  it('선행 조준점은 이동하는 적과 발사체가 같은 시각에 만나는 지점을 가리킨다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.player.pos.set(0, 900, 0);
    const target = sim.makeJet('enemy', 'fighter', new THREE.Vector3(400, 900, -500), 0.8);
    target.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    target.speed = 180;
    const speed = 700;
    const lead = sim.leadPoint(sim.player, target, speed, new THREE.Vector3());
    const arrival = lead.distanceTo(sim.player.pos) / speed;
    const actual = target.pos.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(target.q), target.speed * arrival);
    expect(lead.distanceTo(actual)).toBeLessThan(0.001);
  });

  it('기관포의 최대 사거리는 기체 속도와 관계없이 일정하다', () => {
    const sim = new SkySim(DIFFS[1]!);
    for (const speed of [80, 150, 250]) {
      sim.player.speed = speed;
      sim.fireGun(sim.player, 0);
      const bullet = sim.bullets.at(-1)!;
      expect(bullet.vel.length() * bullet.life).toBeCloseTo(GUN_RANGE, 5);
    }
  });

  it('잔여 수명이 짧은 탄환은 남은 비행거리까지만 이동한다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.fireGun(sim.player, 0);
    const bullet = sim.bullets[0]!;
    bullet.life = 0.01;
    const origin = bullet.pos.clone(), speed = bullet.vel.length();
    sim.step(0.05, neutral);
    expect(bullet.pos.distanceTo(origin)).toBeCloseTo(speed * 0.01, 4);
    expect(sim.bullets).toHaveLength(0);
  });

  it('수명이 끝난 미사일이 조종석과 겹쳐도 피해를 주지 않는다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.missiles.push({
      id: 999, owner: 999, team: 'enemy', pos: sim.player.pos.clone(),
      vel: new THREE.Vector3(0, 0, -500), target: sim.player.id, life: 0.001, alive: true,
    });
    sim.step(0.05, neutral);
    expect(sim.player.hp).toBe(100);
    expect(sim.missiles).toHaveLength(0);
  });

  it('플레어로 유도 해제된 미사일은 회피 점수나 방어막을 공짜로 주지 않는다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.missiles.push({
      id: 999, owner: 999, team: 'enemy', pos: sim.player.pos.clone().add(new THREE.Vector3(100, 0, 200)),
      vel: new THREE.Vector3(0, 0, 500), target: 0, life: 3, alive: true, nearPlayer: true,
    });
    sim.step(0.05, neutral);
    expect(sim.shield).toBe(0);
    expect(sim.score).toBe(0);
    expect(sim.events.some(e => e.t === 'dodge')).toBe(false);
  });

  it('기관포 탄환은 산을 통과하지 못하고 지형에 닿으면 소멸한다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.fireGun(sim.player, 0);
    const bullet = sim.bullets[0]!;
    const hill = terrainY(1200, 300);
    expect(hill).toBeGreaterThan(50);
    bullet.pos.set(1200, hill - 30, 300);
    bullet.vel.set(0, 0, -600);
    sim.step(0.05, neutral);
    expect(sim.bullets).toHaveLength(0);
  });

  it('지형보다 높은 고도의 기관포 탄환은 정상적으로 진행한다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.fireGun(sim.player, 0);
    const bullet = sim.bullets[0]!;
    bullet.pos.set(1200, 600, 300);
    bullet.vel.set(0, 0, -600);
    sim.step(0.05, neutral);
    expect(sim.bullets).toHaveLength(1);
  });

  it('기한이 지난 보급품은 겹쳐 있어도 획득할 수 없다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.player.hp = 10;
    sim.pickups.push({ id: 888, kind: 'repair', pos: sim.player.pos.clone(), life: 0.01 });
    sim.step(0.05, neutral);
    expect(sim.player.hp).toBe(10);
    expect(sim.pickups).toHaveLength(0);
  });

  it('게임 종료 뒤에는 시간과 기체 위치가 더 진행되지 않는다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.over = true; sim.time = 20;
    const before = sim.player.pos.clone();
    sim.step(0.05, { ...neutral, fire: true, boost: true });
    expect(sim.time).toBe(20);
    expect(sim.player.pos.equals(before)).toBe(true);
    expect(sim.bullets).toHaveLength(0);
  });

  it('리셋 시 적기 식별 번호와 미사일 경보 타이머도 초기화한다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.warnT = 9;
    sim.makeJet('enemy', 'ace', new THREE.Vector3(100, 900, 100), 1);
    sim.reset();
    expect(sim.player.id).toBe(1);
    expect(sim.warnT).toBe(0);
    expect(sim.enemies()).toHaveLength(0);
  });
});

describe('SKY WAR 열추적 해제 후 안전성', () => {
  it('플레어로 락온이 풀린 미사일도 고속으로 기체를 가로지르면 실제 충돌한다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.player.pos.set(0, 900, 0);
    sim.missiles.push({
      id: 901, owner: 77, team: 'enemy',
      pos: new THREE.Vector3(0, 900, 70),
      vel: new THREE.Vector3(0, 0, -4000),
      target: 0, life: 3, alive: true,
    });
    sim.step(0.05, neutral);
    // Unguided missiles share the same damage balance as guided enemy missiles.
    expect(sim.player.hp).toBeCloseTo(100 - MISSILE_DMG * 0.6);
    expect(sim.missiles).toHaveLength(0);
  });

  it('락온 해제된 미사일은 비행 경로가 충분히 떨어진 기체에 맞지 않는다', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.player.pos.set(0, 900, 0);
    sim.missiles.push({
      id: 902, owner: 77, team: 'enemy',
      pos: new THREE.Vector3(100, 900, 70),
      vel: new THREE.Vector3(0, 0, -4000),
      target: 0, life: 3, alive: true,
    });
    sim.step(0.05, neutral);
    expect(sim.player.hp).toBe(100);
    expect(sim.missiles).toHaveLength(1);
  });
});

describe('SKY WAR crash and wave transition', () => {
  it('the aircraft crash on the intermission deadline ends the run without spawning a phantom wave', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.intermission = 0;
    sim.player.pos.set(0, -10, 2200);
    sim.step(1 / 60, neutral);
    expect(sim.player.alive).toBe(false);
    expect(sim.over).toBe(true);
    expect(sim.wave).toBe(0);
    expect(sim.enemies()).toHaveLength(0);
    expect(sim.events.some(event => event.t === 'wave')).toBe(false);
  });
});

describe('SKY WAR missile terrain and collision ordering', () => {
  it('a fast unguided missile cannot pass through an island ridge to hit a jet behind it', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.player.pos.set(1950, 110, 300);
    sim.intermission = 1e9;
    sim.missiles.push({
      id: 1001, owner: 99, team: 'enemy',
      pos: new THREE.Vector3(450, 110, 300),
      vel: new THREE.Vector3(30000, 0, 0),
      target: 0, life: 3, alive: true,
    });
    sim.step(0.05, neutral);
    expect(sim.player.hp).toBe(100);
    expect(sim.missiles).toHaveLength(0);
    const explosion = sim.events.find(e => e.t === 'boom');
    expect(explosion?.t).toBe('boom');
    if (explosion?.t === 'boom') {
      expect(explosion.pos.x).toBeGreaterThan(450);
      expect(explosion.pos.x).toBeLessThan(1600);
    }
  });

  it('a missile hits an aircraft above a hill before the missile strikes the hill', () => {
    const sim = new SkySim(DIFFS[1]!);
    const hill = terrainY(1200, 300);
    sim.player.pos.set(1200, hill + 45, 300);
    sim.missiles.push({
      id: 1002, owner: 99, team: 'enemy',
      pos: new THREE.Vector3(1200, hill + 140, 300),
      vel: new THREE.Vector3(0, -4500, 0),
      target: 0, life: 3, alive: true,
    });
    sim.step(0.05, neutral);
    expect(sim.player.hp).toBeCloseTo(100 - MISSILE_DMG * 0.6);
    expect(sim.missiles).toHaveLength(0);
  });

  it('two jets along an unguided missile path are hit in physical travel order', () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.player.pos.set(0, 900, 0);
    const near = sim.makeJet('enemy', 'fighter', new THREE.Vector3(0, 900, -80), 0.8);
    const far = sim.makeJet('enemy', 'fighter', new THREE.Vector3(0, 900, -150), 0.8);
    // The enemy jets are created near the player's current flight path.
    sim.missiles.push({
      id: 1003, owner: sim.player.id, team: 'player',
      pos: new THREE.Vector3(0, 900, 40),
      vel: new THREE.Vector3(0, 0, -5000),
      target: 0, life: 3, alive: true,
    });
    const nearHp = near.hp, farHp = far.hp;
    sim.step(0.05, neutral);
    expect(near.hp).toBeLessThan(nearHp);
    expect(far.hp).toBe(farHp);
  });
});
