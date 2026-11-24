import { describe, expect, it } from 'vitest';
import { PlayerPrediction } from '../src/application/prediction.js';
import { neutralInput } from '../src/domain/combat.js';
import { Match } from '../src/domain/match.js';
import { vec } from '../src/domain/math.js';
import type { World } from '../src/domain/world.js';

const world: World = { heightAt: () => 0, canStand: () => true, trace: () => Infinity,
  cover: [], spawns: [vec(), vec(0, 0, -50)] };

function scenario() {
  const match = new Match(world);
  match.addPlayer('a', 'A'); match.addPlayer('b', 'B'); match.start();
  const snapshot = match.snapshot();
  const player = snapshot.players.find(p => p.id === 'a')!;
  return { snapshot, player };
}

describe('client prediction', () => {
  it('predicts motion without mutating authoritative player or input', () => {
    const { snapshot, player } = scenario(), prediction = new PlayerPrediction();
    const input = { ...neutralInput(), forward: 1 }, before = { ...player.position };
    const shown = prediction.predict(world, player, input, snapshot, 1 / 60, 50);
    expect(shown.position.z).toBeLessThan(before.z);
    expect(player.position).toEqual(before);
    expect(input.forward).toBe(1);
  });
  it('resets prediction after generation changes or explicit reset', () => {
    const { snapshot, player } = scenario(), prediction = new PlayerPrediction();
    const input = { ...neutralInput(), forward: 1 };
    prediction.predict(world, player, input, snapshot, 0.1, 50);
    const spawned = { ...player, generation: player.generation + 1, position: vec(50, 0, 50) };
    const shown = prediction.predict(world, spawned, neutralInput(), snapshot, 0, 0);
    expect(shown.position).toEqual(spawned.position);
    prediction.reset();
    expect(prediction.predict(world, player, neutralInput(), snapshot, 0, 0).position).toEqual(player.position);
  });
});
