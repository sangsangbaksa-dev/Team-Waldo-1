import { spawn, PROJ_HOSTILE } from "../pool";
import { DT, type World } from "../types";
function shoot(world: World, i: number, angle: number): void {
  const e = world.enemies,
    p = world.projectiles;
  const j = spawn(p, world.nextId, 0, e.x[i], e.y[i]);
  if (j < 0) return;
  world.nextId++;
  p.hp[j] = PROJ_HOSTILE;
  p.vx[j] = Math.cos(angle) * 85;
  p.vy[j] = Math.sin(angle) * 85;
  p.r[j] = 3;
  p.a[j] = world.data.enemies[e.kind[i]].damage;
  p.timer[j] = 5;
}
export function enemyAI(world: World): void {
  const { enemies: e, player, data } = world;
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i] <= 0) continue;
    const def = data.enemies[e.kind[i]];
    if (e.a[i] > 0) e.a[i] -= DT;
    const dx = player.x - e.x[i],
      dy = player.y - e.y[i],
      d = Math.hypot(dx, dy) || 1;
    let speed = def.speed;
    let ux = dx / d,
      uy = dy / d;
    if (def.behavior === "dash") {
      if (e.timer[i] <= 2.2 && e.timer[i] + DT > 2.2) {
        e.b[i] = ux;
        e.c[i] = uy;
      }
      e.timer[i] += DT;
      if (e.timer[i] >= 3) {
        e.timer[i] -= 3;
        if (!world.firstPerson) {
          e.b[i] = ux;
          e.c[i] = uy;
        }
      }
      if (e.timer[i] < 0.45 && Math.hypot(e.b[i], e.c[i]) > 0.5) {
        speed *= 3.2;
        ux = e.b[i];
        uy = e.c[i];
      } else if (e.timer[i] > 2.2) speed = 0;
    } else if (def.behavior === "ranged") {
      if (e.timer[i] <= 2.1) {
        e.b[i] = ux;
        e.c[i] = uy;
      }
      e.timer[i] += DT;
      speed *= d > 140 ? 1 : d < 100 ? -1 : 0;
      if (e.timer[i] > 2.1) speed = 0;
      if (e.timer[i] >= 2.8) {
        e.timer[i] = 0;
        const angle = world.firstPerson
          ? Math.atan2(e.c[i], e.b[i])
          : Math.atan2(dy, dx);
        if (def.base === "boss") {
          for (let k = 0; k < 10; k++)
            shoot(world, i, angle + (k * Math.PI) / 5);
        } else {
          shoot(world, i, angle);
        }
      }
    } else if (def.behavior === "swarm") {
      const a = Math.atan2(dy, dx) + Math.sin(world.time * 3 + e.id[i]) * 0.55;
      ux = Math.cos(a);
      uy = Math.sin(a);
    }
    e.vx[i] = ux * speed;
    e.vy[i] = uy * speed;
  }
}
