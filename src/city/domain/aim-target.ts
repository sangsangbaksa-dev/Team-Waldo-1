import { WEAPONS } from '../defs';
import type { Actor, Structure, World } from '../world';

export type AimTarget =
  | { kind: 'actor'; entity: Actor; hostile: boolean }
  | { kind: 'structure'; entity: Structure; hostile: boolean };

type TargetWorld = Pick<World, 'boss' | 'inside' | 'factions' | 'actors' | 'structures' | 'canSee' | 'hostile'>;

/** Select the existing crosshair target without depending on a camera or HUD. */
export function selectAimTarget(world: TargetWorld, yaw: number): AimTarget | null {
  const boss = world.boss(0);
  if (!boss || world.inside) return null;
  const faction = world.factions[0];
  let best = WEAPONS[faction.slots[faction.cur].id].range;
  const dx = Math.cos(yaw), dy = Math.sin(yaw);
  let target: AimTarget | null = null;
  for (const actor of world.actors) {
    if (!actor.alive || actor === boss || actor.inVeh) continue;
    const rx = actor.x - boss.x, ry = actor.y - boss.y;
    const distance = rx * dx + ry * dy;
    if (distance < 0 || distance > best || Math.abs(rx * dy - ry * dx) > actor.r + 7) continue;
    if (!world.canSee(boss.x, boss.y, actor.x, actor.y)) continue;
    best = distance;
    target = { kind: 'actor', entity: actor, hostile: world.hostile(0, actor.f) };
  }
  for (const structure of world.structures) {
    if (!structure.alive) continue;
    const x = structure.x + structure.w / 2 - boss.x, y = structure.y + structure.h / 2 - boss.y;
    const distance = x * dx + y * dy;
    if (distance < 0 || distance > best + 60 || Math.abs(x * dy - y * dx) > Math.max(structure.w, structure.h) / 2) continue;
    best = distance;
    target = { kind: 'structure', entity: structure, hostile: structure.f !== 0 };
  }
  return target;
}
