import { PROJ_ORBIT, spawn } from './pool';
import type { EntityId, World } from './types';

export function spawnEnemy(world: World, kind: number, x: number, y: number, hpScale = 1): EntityId {
  const def = world.data.enemies[kind];
  const id = world.nextId;
  const i = spawn(world.enemies, id, kind, x, y);
  if (i < 0) return 0;
  world.nextId++;
  world.enemies.hp[i] = def.hp * hpScale;
  world.enemies.r[i] = def.radius;
  return id;
}

export function spawnProjectile(
  world: World,
  weapon: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
  damage: number,
  pierce: number,
  life: number,
): void {
  const p = world.projectiles;
  const i = spawn(p, world.nextId, weapon, x, y);
  if (i < 0) return;
  world.nextId++;
  p.vx[i] = vx;
  p.vy[i] = vy;
  p.r[i] = radius;
  p.a[i] = damage;
  p.b[i] = pierce;
  p.timer[i] = life;
}

export function spawnPickup(world: World, x: number, y: number, value: number): void {
  const p = world.pickups;
  if (value <= 0) return;
  const i = spawn(p, world.nextId, 0, x, y);
  if (i < 0) {
    // 풀이 가득 차면 마지막 젬에 값을 합친다
    p.a[p.count - 1] += value;
    return;
  }
  world.nextId++;
  p.r[i] = 3;
  p.a[i] = value;
}


/** 회전형 투사체. 플레이어 주위를 dist 거리에서 돈다. */
export function spawnOrbiter(
  world: World,
  weapon: number,
  angle: number,
  angularSpeed: number,
  dist: number,
  radius: number,
  damage: number,
  life: number,
): void {
  const p = world.projectiles;
  const x = world.player.x + Math.cos(angle) * dist;
  const y = world.player.y + Math.sin(angle) * dist;
  const i = spawn(p, world.nextId, weapon, x, y);
  if (i < 0) return;
  world.nextId++;
  p.hp[i] = PROJ_ORBIT;
  p.vx[i] = angle;
  p.vy[i] = angularSpeed;
  p.c[i] = dist;
  p.r[i] = radius;
  p.a[i] = damage;
  p.timer[i] = life;
}

/** 적 j에게 피해를 주고 (dirX, dirY) 방향으로 살짝 밀어낸다. 죽은 적의 처리는 cleanup이 한다. */
export function damageEnemy(world: World, j: number, dmg: number, dirX: number, dirY: number, knockback: number): void {
  const e = world.enemies;
  e.hp[j] -= dmg;
  world.events.push({ t: 'hit', target: e.id[j], x: e.x[j], y: e.y[j], dmg });
  const k = knockback * (1 - world.data.enemies[e.kind[j]].knockbackResist);
  const len = Math.hypot(dirX, dirY);
  if (k > 0 && len > 1e-6) {
    e.x[j] += (dirX / len) * k;
    e.y[j] += (dirY / len) * k;
  }
}
