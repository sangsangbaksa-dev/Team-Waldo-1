// RTS 시뮬레이션 점검: 두 AI 를 맞붙여 진행 상황을 출력합니다. `npm run rts-sim -- hard easy`
import { RtsAi } from '../src/rts/ai';
import { LEVELS, TICK, isDifficulty, type Difficulty } from '../src/rts/config';
import { RtsSim } from '../src/rts/sim';

const arg = (i: number, d: Difficulty): Difficulty => { const v = process.argv[i]; return isDifficulty(v) ? v : d; };
const a = arg(2, 'hard'), b = arg(3, 'easy'), sim = new RtsSim({ income: [LEVELS[a].income, LEVELS[b].income] }); sim.record = false;
const ais = [new RtsAi(0, a), new RtsAi(1, b)], limit = Number(process.argv[4] ?? 20) * 60 * TICK;
const t0 = performance.now();
while (sim.winner === -1 && sim.tick < limit) {
  sim.step();
  for (const ai of ais) if (sim.tick % ai.interval === (ai.me * 3) % ai.interval) ai.think(sim);
  if (sim.tick % (60 * TICK) === 0) {
    const f = (p: number): string => { const pl = sim.players[p]; return `광물 ${pl.minerals} 채취 ${pl.mined} 유닛 ${sim.units.filter(u => u.owner === p).length} 건물 ${sim.buildings.filter(x => x.owner === p).length} 처치 ${pl.kills}`; };
    console.log(`${sim.tick / TICK / 60}분  [${a}] ${f(0)}  |  [${b}] ${f(1)}`);
  }
}
console.log(`결과: 승자=${sim.winner} ${(sim.tick / TICK / 60).toFixed(1)}분  (계산 ${(performance.now() - t0).toFixed(0)}ms)`);
