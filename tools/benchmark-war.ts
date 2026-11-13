import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { captureOrder, createWar, stepWar } from '../src/battle/war';

// Run separately from browser tests/builds; elapsed time is diagnostic, not a CI gate.
const ticks = 2400, samples = 5, dt = .025;
for (const grandBattle of [false, true]) {
  const times: number[] = [];
  let checksum = '', finalUnits = 0;
  for (let run = 0; run <= samples; run++) {
    const war = createWar({ grandBattle });
    for (const faction of war.factions) captureOrder(war, faction.id, 4);
    const start = performance.now();
    for (let tick = 0; tick < ticks; tick++) stepWar(war, dt);
    const elapsed = performance.now() - start;
    const current = createHash('sha256').update(JSON.stringify(war)).digest('hex');
    if (checksum && checksum !== current) throw new Error('Battle replay diverged between samples');
    checksum = current; finalUnits = war.units.length;
    if (run > 0) times.push(elapsed); // Warm up the JIT before collecting samples.
  }
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({
    scenario: grandBattle ? 'grand-600' : 'skirmish-16', ticks, dt, samples,
    medianMs: Number(times[Math.floor(samples / 2)].toFixed(2)),
    samplesMs: times.map(time => Number(time.toFixed(2))), finalUnits, checksum,
  }));
}
