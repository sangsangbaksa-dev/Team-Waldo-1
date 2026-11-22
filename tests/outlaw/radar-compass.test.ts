import { describe, expect, it } from 'vitest';
import { mapGridCount, radarNorthDirection, districtName, trackedMissionEntity } from '../../src/outlaw/minimap';
import { Sim } from '../../src/outlaw/sim';
import { generateCity } from '../../src/outlaw/world';

describe('OUTLAW rotating mini-radar compass', () => {
  it('puts north at the top for a north-up map', () => {
    const [x, y] = radarNorthDirection(0);
    expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(-1);
  });
  it('rotates north around the rim in sync with the actual rendered map', () => {
    for (const angle of [Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI * 2]) {
      const [x,y] = radarNorthDirection(angle);
      expect(x).toBeCloseTo(Math.sin(angle));
      expect(y).toBeCloseTo(-Math.cos(angle));
      expect(x*x + y*y).toBeCloseTo(1);
    }
  });
});

describe('OUTLAW radar district labels match the actual generated world', () => {
  const labels: Record<string, string> = { downtown:'다운타운', commercial:'상업 지구',
    residential:'주거 지구', industrial:'공업 지구' };
  it('labels the same district as each real building instead of the obsolete smaller grid', () => {
    for (const seed of [1, 7, 19]) {
      const map = generateCity(seed);
      for (const b of map.buildings) {
        expect(districtName(b.x, b.z, map), `seed=${seed}, building=${b.id}`).toBe(labels[b.district]);
      }
      for (const p of map.parks) expect(districtName(p.x, p.z, map)).toBe('공원 지구');
    }
  });
});

describe('OUTLAW full city overview grid', () => {
  it('shows the entire actual generated 16×16 grid rather than the old 12×12 range', () => {
    const map = generateCity(23);
    expect(mapGridCount(map)).toBe(16);
    expect(mapGridCount({ half: 600, pitch: 100 })).toBe(12);
    expect(mapGridCount({ half: 0, pitch: 0 })).toBe(1);
  });
});

describe('OUTLAW mission radar indexed target lifecycle', () => {
  it('tracks living NPCs and vehicles and stops showing removed/dead targets', () => {
    const sim = new Sim(199), {player} = sim;
    const guard = sim.spawnPed('gang',player.x+10,player.z);
    const car = sim.spawnVehicle('sedan',player.x+20,player.z,0);
    expect(trackedMissionEntity(sim, guard.id)).toBe(guard);
    expect(trackedMissionEntity(sim, car.id)).toBe(car);
    expect(trackedMissionEntity(sim, 987654321)).toBeNull();
    guard.alive = false;
    expect(trackedMissionEntity(sim, guard.id)).toBeNull();
    sim.removeVehicle(car);
    expect(trackedMissionEntity(sim, car.id)).toBeNull();
  });
});
