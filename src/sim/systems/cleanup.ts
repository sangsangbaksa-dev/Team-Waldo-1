import { remove } from "../pool";
import { spawnPickup } from "../spawn";
import type { World } from "../types";

function endRun(world: World, victory: boolean): void {
  if (world.over) return;
  const { score } = world.data.balance;
  world.over = true;
  world.stats.victory = victory;
  world.stats.time = world.time;
  world.stats.level = world.player.level;
  world.stats.score +=
    Math.floor(world.time * score.perSecond) + (victory ? score.bossBonus : 0);
  world.events.push({ t: "runEnd", victory, stats: { ...world.stats } });
}

/** 죽은 적을 반납하고 젬을 떨어뜨린다. 판이 끝났는지도 여기서 판정한다. */
export function cleanup(world: World): void {
  const e = world.enemies;
  let bossKilled = false;
  for (let i = e.count - 1; i >= 0; i--) {
    if (e.hp[i] > 0) continue;
    const def = world.data.enemies[e.kind[i]];
    world.stats.kills++;
    world.stats.score += def.xp * world.data.balance.score.perKillXp;
    world.events.push({
      t: "kill",
      target: e.id[i],
      kind: e.kind[i],
      x: e.x[i],
      y: e.y[i],
    });
    spawnPickup(world, e.x[i], e.y[i], def.xp);
    if (def.id === "slime_king")
      world.player.hp = Math.min(
        world.player.stats.maxHp,
        world.player.hp + world.player.stats.maxHp * 0.25,
      );
    if (world.stage.bossSpawned && e.id[i] === world.stage.bossId)
      bossKilled = true;
    remove(e, i);
  }
  world.stats.level = world.player.level;
  world.stats.time = world.time;

  if (world.player.hp <= 0) endRun(world, false);
  else if (bossKilled) endRun(world, true);
}
