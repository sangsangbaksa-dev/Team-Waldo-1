import { describe, expect, it } from 'vitest';
import { MAPS } from '../../src/race/maps';
import { buildMapTrack, cachedMapTrack } from '../../src/race/track';
import { createRace, updateRace } from '../../src/race/race';

const idle = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };

describe('SPEED RUSH immutable circuit cache', () => {
  it('reuses a road only for the same static map definition', () => {
    const dusk = cachedMapTrack(MAPS.find(m => m.id === 'dusk')!);
    expect(cachedMapTrack(MAPS.find(m => m.id === 'dusk')!)).toBe(dusk);
    expect(cachedMapTrack(MAPS.find(m => m.id === 'storm')!)).not.toBe(dusk);
    expect(buildMapTrack(MAPS.find(m => m.id === 'dusk')!)).not.toBe(dusk);
  });

  it('does not reuse mutable car or clock state from a previous run', () => {
    const t = cachedMapTrack(MAPS[0]);
    const a = createRace(t, 2);
    const b = createRace(cachedMapTrack(MAPS[0]), 2);
    expect(a.track).toBe(b.track);
    expect(a.player.car).not.toBe(b.player.car);
    expect(a.racers).not.toBe(b.racers);
    const x = t.x[0], pad = t.pads[0];
    for (let k = 0; k < 200; k++) updateRace(a, 1 / 90, idle);
    expect(a.clock).toBeGreaterThan(b.clock);
    expect(b.clock).toBe(-3);
    expect(t.x[0]).toBe(x);
    expect(t.pads[0]).toBe(pad);
  });
});
