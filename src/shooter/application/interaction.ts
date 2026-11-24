import { BAG_MAX, PLAYER, type WeaponId } from '../config';
import type { Match, Player, Vehicle } from '../sim';

export type Interaction =
  | { kind: 'weapon'; weapon: WeaponId }
  | { kind: 'bag-full' }
  | { kind: 'vehicle'; vehicle: Vehicle['kind'] };

export function findInteraction(match: Pick<Match, 'loot' | 'vehicleNear'>, player: Player): Interaction | null {
  if (!player.alive) return null;
  for (const loot of match.loot) {
    if (loot.taken || (loot.kind !== 'weapon' && loot.kind !== 'attach')) continue;
    if (Math.hypot(loot.x - player.x, loot.z - player.z) >= PLAYER.pickup) continue;
    if (loot.kind === 'weapon' && loot.weapon) return { kind: 'weapon', weapon: loot.weapon };
    if (loot.kind === 'attach' && player.parts.length >= BAG_MAX) return { kind: 'bag-full' };
  }
  if (!player.air && player.veh < 0) {
    const vehicle = match.vehicleNear(player);
    if (vehicle) return { kind: 'vehicle', vehicle: vehicle.kind };
  }
  return null;
}
