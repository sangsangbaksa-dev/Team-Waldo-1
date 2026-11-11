import type { WeaponDef, WeaponLevel } from '../../data/schema';
import { damageEnemy } from '../spawn';
import type { PlayerStats, WeaponState, World } from '../types';

/** 오라의 실제 반경. 화면에서 범위를 그릴 때도 이 함수를 쓴다. */
export function auraRadius(lv: WeaponLevel, stats: PlayerStats): number {
  return lv.range * lv.area * stats.area;
}

/** 플레이어 주변 반경 안의 모든 적에게 쿨다운마다 피해를 준다. */
export function fireAura(world: World, _state: WeaponState, _def: WeaponDef, lv: WeaponLevel): boolean {
  const { player, enemies: e } = world;
  const r = auraRadius(lv, player.stats);
  const dmg = lv.damage * player.stats.damage;
  for (let j = 0; j < e.count; j++) {
    if (e.hp[j] <= 0) continue;
    const dx = e.x[j] - player.x;
    const dy = e.y[j] - player.y;
    const rr = r + e.r[j];
    if (dx * dx + dy * dy <= rr * rr) damageEnemy(world, j, dmg, dx, dy, 0);
  }
  return true;
}
