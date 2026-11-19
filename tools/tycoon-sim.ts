// 타이쿤 밸런스 시뮬: 봇이 빈털터리에서 세계 정복까지 가는 날짜를 시드별로 찍는다.
// npm run tycoon-sim -- [시드 수] [걷기 초]
import { createCore } from '../src/tycoon/core';
import { runBot } from '../src/tycoon/core/bot';

const runs = Number(process.argv[2] ?? 3);
const walk = Number(process.argv[3] ?? 6);
for (let i = 0; i < runs; i++) {
  const core = createCore({ seed: 1000 + i });
  const t0 = Date.now();
  if (process.env.TRACE) core.onEvent(e => { if (e.type === 'day' && e.report.day % 5 === 0) console.log(`  d${e.report.day} ${core.state.stage} cash ${core.state.cash} nw ${core.state.netWorth} shops ${core.state.owned.length} profit ${e.report.profit}`); });
  const r = runBot(core, { walkSec: walk, maxDays: 90, until: 'win' });
  const s = core.state;
  const stages = Object.entries(r.reached).map(([k, v]) => `${k}:${(v as number).toFixed(1)}`).join(' ');
  console.log(`seed ${1000 + i} | ${stages} | day ${r.days} | real ${(r.realSeconds / 60).toFixed(0)}min | cash ${s.cash} nw ${s.netWorth} shops ${s.owned.length} | ${Date.now() - t0}ms`);
  if (s.lastReport) console.log('  last day', JSON.stringify(s.lastReport));
}
