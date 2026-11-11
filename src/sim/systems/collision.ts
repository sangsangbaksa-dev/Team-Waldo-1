import { PROJ_HOSTILE, PROJ_ORBIT, remove } from "../pool";
import { damageEnemy } from "../spawn";
import type { World } from "../types";

const candidates = new Int32Array(512);
const HIT_KNOCKBACK = 3;
const ORBIT_KNOCKBACK = 8;
const ORBIT_REHIT_TIME = 0.4;

/**
 * 투사체↔적, 적↔플레이어 충돌. 죽은 적은 여기서 지우지 않고 hp <= 0으로 남겨 두며
 * cleanup이 처리한다 (해시의 인덱스가 이번 틱 동안 유효해야 하므로).
 */
export function collision(world: World): void {
  const { enemies: e, projectiles: p, player, hash } = world;
  hash.rebuild(e.x, e.y, e.count);

  for (let i = p.count - 1; i >= 0; i--) {
    if (p.hp[i] === PROJ_HOSTILE) {
      const rr = p.r[i] + world.data.balance.player.radius;
      if (Math.hypot(p.x[i] - player.x, p.y[i] - player.y) <= rr) {
        if (player.invuln <= 0) {
          const dmg = Math.max(1, p.a[i] - player.stats.armor);
          player.hp -= dmg;
          player.invuln = world.data.balance.player.invulnTime;
          world.stats.damageTaken += dmg;
          world.events.push({
            t: "playerHurt",
            dmg,
            hp: Math.max(0, player.hp),
          });
        }
        remove(p, i);
      }
      continue;
    }
    const n = hash.query(
      p.x[i],
      p.y[i],
      p.r[i] + world.maxEnemyRadius,
      candidates,
    );
    for (let k = 0; k < n; k++) {
      const j = candidates[k];
      const orbit = p.hp[i] === PROJ_ORBIT;
      if (e.hp[j] <= 0) continue;
      if (orbit ? e.a[j] > 0 : e.id[j] === p.c[i]) continue;
      const dx = e.x[j] - p.x[i];
      const dy = e.y[j] - p.y[i];
      const rr = e.r[j] + p.r[i];
      if (dx * dx + dy * dy > rr * rr) continue;

      if (orbit) {
        // 회전형은 사라지지 않고, 같은 적을 잠깐 동안 다시 때리지 않는다
        damageEnemy(
          world,
          j,
          p.a[i],
          e.x[j] - player.x,
          e.y[j] - player.y,
          ORBIT_KNOCKBACK,
        );
        e.a[j] = ORBIT_REHIT_TIME;
        continue;
      }
      damageEnemy(world, j, p.a[i], p.vx[i], p.vy[i], HIT_KNOCKBACK);
      if (p.b[i] <= 0) {
        remove(p, i);
        break;
      }
      p.b[i]--;
      p.c[i] = e.id[j];
    }
  }

  if (player.invuln > 0) return;
  const pr = world.data.balance.player.radius;
  const n = hash.query(
    player.x,
    player.y,
    pr + world.maxEnemyRadius,
    candidates,
  );
  let dmg = 0;
  for (let k = 0; k < n; k++) {
    const j = candidates[k];
    if (e.hp[j] <= 0) continue;
    const dx = e.x[j] - player.x;
    const dy = e.y[j] - player.y;
    const rr = e.r[j] + pr;
    if (dx * dx + dy * dy <= rr * rr)
      dmg = Math.max(dmg, world.data.enemies[e.kind[j]].damage);
  }
  if (dmg > 0) {
    dmg = Math.max(1, dmg - player.stats.armor);
    player.hp -= dmg;
    player.invuln = world.data.balance.player.invulnTime;
    world.stats.damageTaken += dmg;
    world.events.push({ t: "playerHurt", dmg, hp: Math.max(0, player.hp) });
  }
}
