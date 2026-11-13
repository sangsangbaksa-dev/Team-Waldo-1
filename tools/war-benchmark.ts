/**
 * Reproduce absolute simulation CPU measurements on the current source.
 * Run: node --import tsx tools/war-benchmark.ts > war-benchmark-results.json
 * Browser rendering, WebGL, asset loading and real-device FPS are not measured.
 */
import { performance } from 'node:perf_hooks';
import { createWar, stepWar, trainSquad, type War } from '../src/battle/war';

type Scenario = 'staging' | 'contested';
const ticks = 40, dt = .05, warmups = 3, repetitions = 7;

function createFixture(army: 600 | 1600, scenario: Scenario): War {
  const war = createWar({ mapId: 'continental', grandBattle: true });
  if (army === 1600) for (const faction of war.factions) {
    faction.gold = 1e6; faction.food = 1e6;
    let count = war.units.filter(unit => unit.owner === faction.id).length;
    while (count < 400) {
      const batch = Math.min(50, 400 - count);
      if (!trainSquad(war, faction.id, 'infantry', batch)) throw new Error('Benchmark fixture recruitment failed');
      count += batch;
    }
  }
  for (const faction of war.factions) {
    faction.aiTimer = 10000; faction.reserve = 0; faction.turretCooldown = 10;
  }
  const serial = [0, 0, 0, 0];
  for (const unit of war.units) {
    // Keep populations equal between samples while exercising hostile queries.
    unit.cooldown = 10;
    if (scenario === 'contested') {
      const index = serial[unit.owner]++;
      unit.x = (index % 20 - 9.5) * 1.4 + (unit.owner % 2) * .5;
      unit.z = (Math.floor(index / 20) - 9.5) * 1.4 + Math.floor(unit.owner / 2) * .5;
    }
  }
  return war;
}

function measure(source: War): number {
  // Cloning, recruitment and fixture construction are outside the timed interval.
  const war = structuredClone(source), start = performance.now();
  for (let tick = 0; tick < ticks; tick++) stepWar(war, dt);
  return (performance.now() - start) / ticks;
}
const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const results = [];
for (const army of [600, 1600] as const) for (const scenario of ['staging', 'contested'] as const) {
  const source = createFixture(army, scenario);
  for (let run = 0; run < warmups; run++) measure(source);
  const samples = Array.from({ length: repetitions }, () => measure(source));
  const result = { army, scenario, medianMsPerTick: median(samples),
    minimumMsPerTick: Math.min(...samples), maximumMsPerTick: Math.max(...samples), samples };
  results.push(result);
  process.stderr.write(`${army} ${scenario}: ${result.medianMsPerTick.toFixed(3)} ms/tick\n`);
}
process.stdout.write(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version,
  scope: 'Current-source simulation CPU only; excludes rendering and is not an FPS guarantee.',
  map: 'continental', ticks, simulatedSecondsPerTick: dt, warmups, repetitions,
  conditions: 'AI decisions delayed; attacks begin on a 10-second cooldown. Staging uses separate HQ deployment; contested mixes all factions near the center. Fixture construction and cloning are outside the timer.',
  results }, null, 2) + '\n');
