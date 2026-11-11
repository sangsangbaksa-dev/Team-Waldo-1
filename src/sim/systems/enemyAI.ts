import { DT, type World } from '../types';

const DASH_PERIOD = 3;
const DASH_TIME = 0.5;
const DASH_MULT = 3;

/** 적의 속도를 정한다. 실제 이동은 movement가 한다. */
export function enemyAI(world: World): void {
  const { enemies: e, player, data } = world;
  for (let i = 0; i < e.count; i++) {
    const def = data.enemies[e.kind[i]];
    if (e.a[i] > 0) e.a[i] -= DT;
    const dx = player.x - e.x[i];
    const dy = player.y - e.y[i];
    const d = Math.hypot(dx, dy) || 1;
    let speed = def.speed;

    switch (def.behavior) {
      case 'dash':
        // 주기적으로 잠깐 빠르게 돌진
        e.timer[i] += DT;
        if (e.timer[i] >= DASH_PERIOD) e.timer[i] -= DASH_PERIOD;
        if (e.timer[i] < DASH_TIME) speed *= DASH_MULT;
        break;
      case 'ranged': // TODO(적/진행 담당): 거리를 유지하며 탄 발사
      case 'swarm': // TODO(적/진행 담당): 무리 이동
      case 'tank':
      case 'chase':
        break;
    }
    e.vx[i] = (dx / d) * speed;
    e.vy[i] = (dy / d) * speed;
  }
}
