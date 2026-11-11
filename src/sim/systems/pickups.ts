import { remove } from '../pool';
import { DT, type World } from '../types';

const PULL_SPEED = 260;
const COLLECT_DIST = 8;

/** 흡수 반경 안의 젬을 끌어당기고, 닿으면 경험치로 바꾼다. */
export function pickups(world: World): void {
  const { pickups: g, player } = world;
  const range = player.stats.pickupRange;
  for (let i = g.count - 1; i >= 0; i--) {
    g.px[i] = g.x[i];
    g.py[i] = g.y[i];
    const dx = player.x - g.x[i];
    const dy = player.y - g.y[i];
    const d = Math.hypot(dx, dy);
    if (d <= COLLECT_DIST) {
      const value = g.a[i] * player.stats.xpGain;
      player.xp += value;
      world.events.push({ t: 'pickup', value });
      remove(g, i);
    } else if (d <= range) {
      const step = Math.min(d, PULL_SPEED * DT);
      g.x[i] += (dx / d) * step;
      g.y[i] += (dy / d) * step;
    }
  }
}
