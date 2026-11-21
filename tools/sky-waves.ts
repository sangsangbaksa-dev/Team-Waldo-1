// SKY WAR 웨이브 진행 점검: 플레이어가 적을 즉시 격추한다고 가정하고 웨이브 구성을 출력합니다.
import { SkySim, DIFFS } from '../src/sky/sim';
const sim = new SkySim(DIFFS[1]!); sim.intermission = 0.1; sim.player.hp = sim.player.maxHp = 1e9;
let lastWave = 0;
for (let i = 0; i < 60 * 400 && sim.wave <= 12; i++) {
  sim.step(1 / 60, { pitch: 0, roll: 0.2, throttle: 0.6, fire: false, missile: false, flare: false });
  if (sim.wave !== lastWave) { lastWave = sim.wave; const c: Record<string, number> = {}; for (const e of sim.enemies()) c[e.kind] = (c[e.kind] ?? 0) + 1; console.log('wave', sim.wave, JSON.stringify(c)); }
  if (i % 120 === 0) { const e = sim.enemies()[0]; if (e) sim.damage(e, 999, sim.player.id, e.pos); }
  sim.events.length = 0;
}
console.log('score', sim.score, 'kills', sim.kills, 'combo', sim.bestCombo, 'time', sim.time.toFixed(0));
