import { describe, expect, it } from 'vitest';
import { makeProceduralMilitary } from '../shared/character/procedural';
import { updateSoldierPose, type SoldierPoseHistory } from './soldier-pose';

const create = () => ({
  ch: makeProceduralMilitary('rifle', { team: 0x556633, skin: 0xaa8866, height: 1, width: 1 }),
  history: { air: -1, alive: true, dead: -1 } as SoldierPoseHistory,
});

describe('ZERO ZONE distant corpse pose stability', () => {
  for (const distance of [0, 46, 91, 170]) {
    it(`never resets a corpse upright at distance ${distance}`, () => {
      const { ch, history } = create();
      const frame = { air: 0, alive: false, distance, dt: 1 / 60 };
      let previous = 0;
      for (let i = 0; i <= 30; i++) {
        ch.state.dead = Math.min(1, i / 25);
        updateSoldierPose(ch, history, frame);
        expect(ch.root.rotation.z).toBeGreaterThanOrEqual(previous);
        previous = ch.root.rotation.z;
      }
      expect(previous).toBeCloseTo(1.5);
      for (const d of [44, 46, 89, 91, 175, 0]) {
        updateSoldierPose(ch, history, { ...frame, distance: d });
        expect(ch.root.rotation.z).toBeCloseTo(1.5);
      }
    });
  }
  it('updates immediately after leaving freefall at far LOD', () => {
    const { ch, history } = create();
    updateSoldierPose(ch, history, { air: 2, alive: true, distance: 150, dt: 1/60 });
    expect(ch.root.rotation.z).toBeCloseTo(-1.25);
    updateSoldierPose(ch, history, { air: 0, alive: true, distance: 150, dt: 1/60 });
    expect(ch.root.rotation.z).toBeCloseTo(0);
  });
  it('updates a revived soldier rather than keeping the corpse pose', () => {
    const { ch, history } = create();
    ch.state.dead = 1;
    updateSoldierPose(ch, history, { air: 0, alive: false, distance: 150, dt: 1/60 });
    ch.state.dead = 0;
    updateSoldierPose(ch, history, { air: 0, alive: true, distance: 150, dt: 1/60 });
    expect(ch.root.rotation.z).toBeCloseTo(0);
  });
});
