// SKY WAR 헤드리스 시뮬: 단순 봇이 웨이브를 돌며 예외/밸런스를 확인합니다.
import { SkySim, DIFFS, forward } from '../src/sky/sim';
import * as THREE from 'three';
for (const d of DIFFS) {
  const sim = new SkySim(d); sim.intermission = 0.1; const kinds = new Set<string>(); let ev = 0;
  for (let i = 0; i < 60 * 600 && !sim.over; i++) {
    const p = sim.player; const t = sim.bestTarget(p, -1, 5000) ?? sim.enemies()[0];
    let pitch = 0, roll = 0;
    if (t) { const l = t.pos.clone().sub(p.pos).normalize().applyQuaternion(p.q.clone().invert()); roll = THREE.MathUtils.clamp(l.x * 3, -1, 1); pitch = THREE.MathUtils.clamp(l.y * 3, -1, 1); }
    if (p.pos.y < 250) pitch = 1;
    const aimed = !!sim.bestTarget(p, Math.cos(0.1), 650); const fwd = forward(p);
    sim.step(1 / 60, { pitch, roll, throttle: 0.6, fire: aimed, missile: p.lockT >= 0.9, flare: sim.missiles.some(m => m.target === p.id), boost: false });
    for (const j of sim.jets) kinds.add(j.kind); ev += sim.events.length; sim.events.length = 0; void fwd;
  }
  console.log(d.id, 'time', sim.time.toFixed(0), 'wave', sim.wave, 'kills', sim.kills, 'score', sim.score, 'over', sim.over, 'kinds', [...kinds].join(','), 'ev', ev);
}
