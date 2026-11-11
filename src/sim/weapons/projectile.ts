import type { WeaponDef, WeaponLevel } from '../../data/schema';
import { nearestTarget } from "./target";
import { next } from '../rng';
import { spawnProjectile } from '../spawn';
import type { WeaponState, World } from '../types';

const BASE_RADIUS = 4;
const SPREAD = 0.18; // 여러 발일 때 발 사이 각도(라디안)

/** 직선으로 날아가는 투사체. targeting에 따라 조준 방향만 다르다. */
export function fireProjectile(world: World, state: WeaponState, def: WeaponDef, lv: WeaponLevel): boolean {
  const { player, enemies } = world;
  let angle: number;

  if (def.targeting === 'facing' || (world.firstPerson && def.targeting === 'random')) {
    angle = Math.atan2(player.faceY, player.faceX);
  } else if (def.targeting === 'random') {
    angle = next(world.rng) * Math.PI * 2;
  } else {
    const best = nearestTarget(world, world.firstPerson ? lv.speed * lv.life : Infinity);
    if (best < 0) return false;
    angle = Math.atan2(enemies.y[best] - player.y, enemies.x[best] - player.x);
  }

  const start = angle - (SPREAD * (lv.count - 1)) / 2;
  for (let k = 0; k < lv.count; k++) {
    const a = start + SPREAD * k;
    spawnProjectile(
      world,
      state.def,
      player.x,
      player.y,
      Math.cos(a) * lv.speed,
      Math.sin(a) * lv.speed,
      BASE_RADIUS * lv.area * player.stats.area,
      lv.damage * player.stats.damage,
      lv.pierce,
      lv.life,
    );
  }
  return true;
}
