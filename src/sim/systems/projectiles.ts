import { remove } from '../pool';
import { DT, type World } from '../types';

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
    p.x[i] += p.vx[i] * DT;
    p.y[i] += p.vy[i] * DT;
  }
}
