import type { World } from "../types";

// In first person, auto-aim assists only inside the forward view.
export function nearestTarget(world: World, range = Infinity): number {
  const { player, enemies } = world;
  let nearest = -1;
  let best = range;
  for (let i = 0; i < enemies.count; i++) {
    if (enemies.hp[i] <= 0) continue;
    const dx = enemies.x[i] - player.x;
    const dy = enemies.y[i] - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= best) continue;
    if (
      world.firstPerson &&
      dx * player.faceX + dy * player.faceY < distance * 0.87
    )
      continue;
    nearest = i;
    best = distance;
  }
  return nearest;
}
