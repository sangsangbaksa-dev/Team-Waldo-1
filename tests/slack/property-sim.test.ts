import { describe, expect, it } from 'vitest';
import { createSim } from '../../src/slack/sim';
import type { ActivityId, Level, StageId } from '../../src/slack/types';

// Use a separate deterministic input stream so randomized player actions
// never affect the simulation's own seeded patrol generator.
const choices: Record<StageId, (ActivityId | null)[]> = {
  class: [null, 'video', 'game'],
  dorm: [null, 'game', 'video', 'chat', 'webtoon', 'shop', 'music'],
};
function playScenario(stage: StageId, level: Level, seed: number) {
  const sim = createSim(stage, seed * 7919 + level, level);
  let inputSeed = (seed * 2654435761 + level) >>> 0;
  const next = (): number => {
    inputSeed = (Math.imul(inputSeed, 1664525) + 1013904223) >>> 0;
    return inputSeed / 4294967296;
  };
  sim.start();
  const eventCounts: Record<string, number> = {};
  for (let step = 0; step < 2200 && sim.state.phase === 'play'; step++) {
    if (step % 11 === 0) sim.doActivity(choices[stage][Math.floor(next() * choices[stage].length)]!);
    if (step % 7 === 0) sim.setCover(next() < 0.52);
    if (step % 83 === 0) sim.bribe();
    sim.update(0.05 + next() * 0.15);
    for (const event of sim.drain()) eventCounts[event.t] = (eventCounts[event.t] ?? 0) + 1;
    const state = sim.state;
    const numeric = [state.time, state.limit, state.fun, state.goal, state.sus, state.sleepy,
      state.study, state.strikes, state.combo, state.score, state.friend, state.battery,
      state.watcher.t, state.watcher.prog, state.watcher.near];
    if (numeric.some(value => !Number.isFinite(value))) {
      throw new Error(`Nonfinite SLACK OFF state, stage=${stage}, level=${level}, seed=${seed}, tick=${step}`);
    }
    if (state.time < 0 || state.time > state.limit + 1e-7 ||
        state.fun < 0 || state.fun > 100 || state.sus < 0 || state.sus > 100 ||
        state.study < 0 || state.study > 100 || state.friend < 0 || state.friend > 100 ||
        state.battery < 0 || state.battery > 100 || state.strikes < 0 || state.strikes > 3 ||
        state.combo < 1 || state.combo > 5 || state.watcher.near < -1e-6 ||
        state.watcher.near > 1 + 1e-6 ||
        (state.activity !== null && !choices[stage].includes(state.activity))) {
      throw new Error(`Invalid SLACK OFF state, stage=${stage}, level=${level}, seed=${seed}, tick=${step}`);
    }
  }
  const final = JSON.parse(JSON.stringify(sim.state));
  sim.update(1e6);
  expect(sim.state).toEqual(final);
  return { final, eventCounts };
}

describe('SLACK OFF seeded randomized state transitions', () => {
  it('remains bounded and finishes across stages, difficulties and 30 action schedules', () => {
    for (const stage of ['class', 'dorm'] as StageId[])
      for (const level of [1, 2, 3] as Level[])
        for (let seed = 1; seed <= 30; seed++) {
          const { final } = playScenario(stage, level, seed);
          expect(['done', 'caught']).toContain(final.phase);
          if (final.phase === 'caught') expect(final.strikes).toBe(3);
          if (final.phase === 'done') expect(final.time).toBe(150);
        }
  });
  it('replays the same mixed touch, activity, and bribe stream deterministically', () => {
    for (const stage of ['class', 'dorm'] as StageId[])
      for (const level of [1, 2, 3] as Level[])
        for (const seed of [3, 13, 37]) {
          expect(playScenario(stage, level, seed)).toEqual(playScenario(stage, level, seed));
        }
  });
});
