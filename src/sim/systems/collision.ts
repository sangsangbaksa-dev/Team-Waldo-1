import { remove } from '../pool';
import type { World } from '../types';

const candidates = new Int32Array(512);

/**
 * 투사체↔적, 적↔플레이어 충돌. 죽은 적은 여기서 지우지 않고 hp <= 0으로 남겨 두며
 * cleanup이 처리한다 (해시의 인덱스가 이번 틱 동안 유효해야 하므로).
 */
export function collision(world: World): void {
  const { enemies: e, projectiles: p, player, hash } = world;
  hash.rebuild(e.x, e.y, e.count);

  for (let i = p.count - 1; i >= 0; i--) {
    const n = hash.query(p.x[i], p.y[i], p.r[i] + world.maxEnemyRadius, candidates);
    for (let k = 0; k < n; k++) {
      const j = candidates[k];
      if (e.hp[j] <= 0 || e.id[j] === p.c[i]) continue;
      const dx = e.x[j] - p.x[i];
      const dy = e.y[j] - p.y[i];
      const rr = e.r[j] + p.r[i];
      if (dx * dx + dy * dy > rr * rr) continue;

      e.hp[j] -= p.a[i];
      world.events.push({ t: 'hit', target: e.id[j], x: e.x[j], y: e.y[j], dmg: p.a[i] });
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
  const n = hash.query(player.x, player.y, pr + world.maxEnemyRadius, candidates);
  let dmg = 0;
  for (let k = 0; k < n; k++) {
    const j = candidates[k];
    if (e.hp[j] <= 0) continue;
    const dx = e.x[j] - player.x;
    const dy = e.y[j] - player.y;
    const rr = e.r[j] + pr;
    if (dx * dx + dy * dy <= rr * rr) dmg = Math.max(dmg, world.data.enemies[e.kind[j]].damage);
  }
  if (dmg > 0) {
    dmg = Math.max(1, dmg - player.stats.armor);
    player.hp -= dmg;
    player.invuln = world.data.balance.player.invulnTime;
    world.stats.damageTaken += dmg;
    world.events.push({ t: 'playerHurt', dmg, hp: Math.max(0, player.hp) });
  }
}
