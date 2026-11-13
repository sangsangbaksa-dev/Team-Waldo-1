// 헤드리스 LAST CITY 시뮬레이션: 밸런스·안정성 점검용 (npm run city-sim -- <seed> <difficulty>)
import { World } from '../src/city/world';

const seed = Number(process.argv[2] ?? 1), diff = (process.argv[3] ?? 'd4') as 'd1' | 'd2' | 'd3' | 'd4' | 'd5';
const w = new World({ seed, difficulty: diff, klass: 'warlord', autoPlayer: true });
const t0 = Date.now(); let next = 60;
while (!w.over && w.time < 1500) {
  w.step(1 / 30); w.events.length = 0;
  if (w.time >= next) {
    next += 60;
    const line = w.factions.map(f => f.alive ? `${f.id}:$${Math.round(f.cash)}/c${Math.round(f.crystal)}/a${w.armyOf(f.id).length}/b${w.businesses.filter(b => b.owner === f.id).length}/L${f.level}${w.hq(f.id) ? '' : 'x'}` : `${f.id}:--`).join(' ');
    console.log(`t=${Math.round(w.time)} alive=${w.aliveCount()} actors=${w.actors.length} zone=${Math.round(w.zone.r)} ${line}`);
  }
}
for (const a of w.actors) if (!Number.isFinite(a.x + a.y + a.hp)) throw new Error('NaN actor');
console.log(`over=${w.over} winner=${w.winner} time=${Math.round(w.time)}s wall=${Date.now() - t0}ms places=${w.factions.map(f => f.place).join(',')}`);
