import { PROJ_BOOMERANG, PROJ_ORBIT, remove } from "../pool";
import { DT, type World } from "../types";

export function projectiles(world: World): void {
  const p = world.projectiles;
  for (let i = p.count - 1; i >= 0; i--) {
    p.timer[i] -= DT;
    if (p.timer[i] <= 0) {
      remove(p, i);
      continue;
    }
    p.px[i] = p.x[i];
    p.py[i] = p.y[i];
    if (p.hp[i] === PROJ_ORBIT) {
      p.vx[i] += p.vy[i] * DT;
      p.x[i] = world.player.x + Math.cos(p.vx[i]) * p.c[i];
      p.y[i] = world.player.y + Math.sin(p.vx[i]) * p.c[i];
    } else {
      if (p.hp[i] === PROJ_BOOMERANG && p.timer[i] < 0.9) {
        const dx = world.player.x - p.x[i],
          dy = world.player.y - p.y[i],
          d = Math.hypot(dx, dy) || 1;
        if (d < 6) {
          remove(p, i);
          continue;
        }
        p.vx[i] = (dx / d) * 230;
        p.vy[i] = (dy / d) * 230;
      }
      p.x[i] += p.vx[i] * DT;
      p.y[i] += p.vy[i] * DT;
    }
  }
}
