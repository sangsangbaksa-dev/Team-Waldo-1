import { describe, expect, it } from 'vitest';
import { aiInput, newCar, type AiProfile } from '../../src/race/physics';
import { buildMapTrack } from '../../src/race/track';
import { MAPS } from '../../src/race/maps';

describe('SPEED RUSH AI temporary band without per-tick allocations', () => {
  it('matches the former scaled-profile controller across maps, speeds and boosts', () => {
    const profile: AiProfile = { lane: -3, top: 73, grip: 35, skill: 1, line: 0.4, nitro: 0.2 };
    for (const map of [MAPS[0], MAPS[2], MAPS[5]]) {
      const t = buildMapTrack(map);
      for (const idx of [0, 30, 100, 270]) {
        for (const speed of [0, 16, 38, 70, 95]) {
          for (const band of [0.8, 1, 1.05, 1.17, 1.4]) {
            const c = newCar(t, idx, 2);
            c.vf = speed; c.nitro = 0.6;
            c.boostT = speed > 65 ? 0.5 : 0;
            const legacy = aiInput(c, t, { ...profile, top: profile.top * band, grip: profile.grip * band * band });
            expect(aiInput(c, t, profile, band)).toEqual(legacy);
          }
        }
      }
    }
  });

  it('uses band 1 if the caller does not request catch-up scaling', () => {
    const t = buildMapTrack(MAPS[0]), c = newCar(t, 70, 0);
    const ai: AiProfile = { lane: 0, top: 70, grip: 40, skill: 1 };
    expect(aiInput(c, t, ai)).toEqual(aiInput(c, t, ai, 1));
  });
});
