import { DT, type World } from '../types';

export function movement(world: World): void {
  const p = world.player;
  p.px = p.x;
  p.py = p.y;
  p.x += p.moveX * p.stats.moveSpeed * DT;
  p.y += p.moveY * p.stats.moveSpeed * DT;
  if (p.invuln > 0) p.invuln -= DT;

  const e = world.enemies;
  for (let i = 0; i < e.count; i++) {
    e.px[i] = e.x[i];
    e.py[i] = e.y[i];
    e.x[i] += e.vx[i] * DT;
    e.y[i] += e.vy[i] * DT;
  }
}
