// 헤드리스 밸런스 시뮬레이션. 사용법: npm run balance -- --runs 20 --seed 1
// 봇으로 N판을 돌려 결과를 CSV로 출력한다. 시트에 붙여 넣어 분석하면 된다.
import { loadGameData } from '../src/data';
import { TICK_RATE, createWorld, step } from '../src/sim';
import { botCommands } from './bot';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const runs = arg('runs', 10);
const seed0 = arg('seed', 1);
const data = loadGameData();
const maxTicks = TICK_RATE * 60 * 40; // 40분 안전 상한

console.log('seed,victory,time_sec,stage,level,kills,score,damage_taken,weapons,passives');
for (let r = 0; r < runs; r++) {
  const world = createWorld(data, seed0 + r);
  while (!world.over && world.tick < maxTicks) step(world, botCommands(world));
  const s = world.stats;
  const weapons = world.player.weapons.map((w) => `${data.weapons[w.def].id}:${w.level}`).join(' ');
  const passives = world.player.passives.map((p) => `${data.passives[p.def].id}:${p.level}`).join(' ');
  console.log(
    [seed0 + r, s.victory ? 1 : 0, s.time.toFixed(1), world.stage.index + 1, s.level, s.kills, s.score, s.damageTaken, weapons, passives].join(','),
  );
}
