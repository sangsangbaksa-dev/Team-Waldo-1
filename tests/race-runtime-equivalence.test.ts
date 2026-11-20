import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/race/maps';
import { buildMapTrack, nearest, type Track } from '../src/race/track';
import { BODY_HALF_LENGTH, BODY_HALF_WIDTH, newCar, separateCars, type CarState } from '../src/race/physics';
import { createRace, placeOf, standings } from '../src/race/race';

function referenceNearest(t: Track, px: number, pz: number, hint: number, win: number) {
  const n = t.n, full = win < 0 || win * 2 + 1 >= n; let best = 0, bd = Infinity;
  for (let o = full ? 0 : -win; o <= (full ? n - 1 : win); o++) {
    const i = full ? o : (hint + o + n * 4) % n, dx = px - t.x[i], dz = pz - t.z[i], d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, lat: (px - t.x[best]) * -t.tz[best] + (pz - t.z[best]) * t.tx[best], dist: Math.sqrt(bd) };
}

function referenceCollision(a: CarState, b: CarState): number {
  const ahx = Math.cos(a.h), ahz = Math.sin(a.h), arx = -ahz, arz = ahx;
  const bhx = Math.cos(b.h), bhz = Math.sin(b.h), brx = -bhz, brz = bhx;
  const dx = b.x - a.x, dz = b.z - a.z; let dist = Math.hypot(dx, dz), nx = ahx, nz = ahz;
  if (dist > 1e-4) { nx = dx / dist; nz = dz / dist; } else dist = 0;
  const span = (hx: number, hz: number, rx: number, rz: number): number => Math.abs(hx * nx + hz * nz) * BODY_HALF_LENGTH + Math.abs(rx * nx + rz * nz) * BODY_HALF_WIDTH;
  const need = span(ahx, ahz, arx, arz) + span(bhx, bhz, brx, brz);
  if (dist >= need) return 0;
  const push = (need - dist) / 2;
  a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
  const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (rel > 0) { const imp = rel * 0.55; a.vx -= nx * imp; a.vz -= nz * imp; b.vx += nx * imp; b.vz += nz * imp; return rel; }
  return 0;
}

describe('SPEED RUSH runtime equivalence', () => {
  it('keeps search order and results on every circuit including the finish seam', () => {
    for (const map of MAPS) {
      const t = buildMapTrack(map);
      for (const hint of [0, 1, 39, t.n - 1, Math.floor(t.n / 2)]) {
        for (const win of [0, 3, 40, -1, t.n]) {
          for (const offset of [-7, 0, 7]) {
            const x = t.x[hint] - t.tz[hint] * offset, z = t.z[hint] + t.tx[hint] * offset;
            expect(nearest(t, x, z, hint, win)).toEqual(referenceNearest(t, x, z, hint, win));
          }
        }
      }
    }
  });
  it('keeps collision impulses and positions for near, far and coincident cars', () => {
    const t = buildMapTrack(MAPS[0]);
    for (const dx of [-20, -7, -4, 0, 2, 4, 7, 20]) {
      for (const dz of [-8, -2, 0, 2, 8]) {
        for (const aHeading of [0, 0.4, 1.7]) {
          for (const bHeading of [0, -0.8, 2.1]) {
            const a = { ...newCar(t, 0, 0), x: 0, z: 0, h: aHeading, vx: 20, vz: 3 };
            const b = { ...newCar(t, 0, 0), x: dx, z: dz, h: bHeading, vx: 2, vz: -1 };
            const refA = { ...a }, refB = { ...b };
            expect(separateCars(a, b)).toBe(referenceCollision(refA, refB));
            expect(a).toEqual(refA); expect(b).toEqual(refB);
          }
        }
      }
    }
  });
  it('preserves stable rank ties and finished-driver ordering', () => {
    const r = createRace(buildMapTrack(MAPS[0]));
    const check = () => { const order = standings(r); for (const racer of r.racers) expect(placeOf(r, racer)).toBe(order.indexOf(racer) + 1); };
    for (const racer of r.racers) racer.car.total = 20;
    check();
    r.racers[1].car.total = 100; r.racers[2].finishTime = 80; r.racers[3].finishTime = 75;
    check();
    r.racers[2].finishTime = 75; check();
  });
});
