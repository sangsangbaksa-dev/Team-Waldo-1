import type { WeaponDef, WeaponLevel } from '../../data/schema';
import { spawnOrbiter } from '../spawn';
import type { WeaponState, World } from '../types';

const BASE_RADIUS = 5;

/**
 * 플레이어 주위를 도는 구슬. 쿨다운마다 count개가 나타나 life초 동안 돌다가 사라진다.
 * 레벨 표에서 speed는 각속도(라디안/초), range는 플레이어로부터의 거리.
 */
export function fireOrbit(world: World, state: WeaponState, _def: WeaponDef, lv: WeaponLevel): boolean {
  const { stats } = world.player;
  for (let k = 0; k < lv.count; k++) {
    spawnOrbiter(
      world,
      state.def,
      (k / lv.count) * Math.PI * 2,
      lv.speed,
      lv.range * stats.area,
      BASE_RADIUS * lv.area * stats.area,
      lv.damage * stats.damage,
      lv.life,
    );
  }
  return true;
}
