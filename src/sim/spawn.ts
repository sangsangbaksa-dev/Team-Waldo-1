import { spawn } from './pool';
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

