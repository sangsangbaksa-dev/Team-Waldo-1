import type { Command, World } from "../src/sim";

/**
 * 헤드리스 실행용 간단한 봇: 가까운 적들에게서 멀어지되, 위험이 없으면 가장 가까운 젬으로 간다.
 * 레벨업은 항상 첫 번째 선택지를 고른다. 테스트와 밸런스 시뮬레이션이 같이 쓴다.
 */
export function botCommands(world: World): Command[] {
  if (world.pendingChoices) return [{ t: "choose", index: 0 }];
  const { player, enemies: e, pickups: g } = world;
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < e.count; i++) {
    const dx = player.x - e.x[i];
    const dy = player.y - e.y[i];
    const d2 = dx * dx + dy * dy;
    if (d2 < 80 * 80 && d2 > 0) {
      ax += dx / d2;
      ay += dy / d2;
    }
  }
  if (ax === 0 && ay === 0) {
    let best = Infinity;
    for (let i = 0; i < g.count; i++) {
      const dx = g.x[i] - player.x;
      const dy = g.y[i] - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        ax = dx;
        ay = dy;
      }
    }
  }
  // Avoidance forces are tiny; normalize them so the bot actually runs at full speed.
  const length = Math.hypot(ax, ay) || 1;
  return [{ t: "move", x: ax / length, y: ay / length }];
}
