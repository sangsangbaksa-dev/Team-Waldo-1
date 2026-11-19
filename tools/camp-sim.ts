// 캠페인 점검: 사람 대신 AI(또는 간단한 스크립트)가 플레이어 자리를 맡아 미션이 끝까지 가는지 봅니다. `npm run camp-sim -- 2`
import { RtsAi } from '../src/rts/ai';
import { Campaign, MISSIONS } from '../src/rts/campaign';
import { TICK } from '../src/rts/config';
import { RtsSim } from '../src/rts/sim';

const id = Number(process.argv[2] ?? 1), limit = Number(process.argv[3] ?? 20) * 60 * TICK;
const def = MISSIONS.find(m => m.id === id)!, sim = new RtsSim({ scripted: true }); sim.record = false;
const c = new Campaign(def, sim), bot = new RtsAi(0, 'normal');
const army = () => sim.units.filter(u => u.owner === 0 && u.kind !== 'worker' && !c.isVip(u.id) && u.hp > 0);
while (!c.result && sim.tick < limit) {
  sim.step(); c.tick();
  if (sim.tick % bot.interval === 0) {
    if (id !== 3) bot.think(sim);
    // 미션 목표를 아는 봇: AI 의 공격 명령 위에 목표 지점으로 병력을 보냅니다.
    if (id === 1 || id === 5) { const p = c.points.find(x => x.owner !== 0); if (p) { const ids = army().filter(u => u.o.t === 'idle' || u.o.t === 'amove').map(u => u.id); if (ids.length) sim.apply(0, { k: 'amove', ids, x: p.x, y: p.y }); } }
    if (id === 3) { const v = c.vipUnit(); if (v) { const ids = army().filter(u => u.o.t === 'idle' || u.o.t === 'amove').map(u => u.id), nx = [{ x: 24, y: 54 }, { x: 20, y: 38 }, { x: 28, y: 24 }, { x: 46, y: 16 }][Math.min(3, c.flag.leg)]; if (ids.length) sim.apply(0, { k: 'amove', ids, x: (v.x * 2 + nx.x) / 3, y: (v.y * 2 + nx.y) / 3 }); } }
    if (id === 4) { const t = sim.buildings.find(b => b.owner === 1 && b.kind === 'barracks' && b.x < 60 || false); void t; }
  }
  if (sim.tick % (30 * TICK) === 0) console.log(`${(sim.tick / TICK).toFixed(0)}s`, c.objectives.map(o => `${o.done ? '✓' : '·'}${o.text.slice(0, 14)} ${o.note}`).join(' | '), `army ${army().length} lost ${sim.players[0].lost}`);
}
console.log(`결과 ${c.result} (${c.reason}) ${(sim.tick / TICK).toFixed(0)}초 별 ${c.stars()}`);
