import { describe, expect, it } from 'vitest';
import { GeoBuilder } from '../../src/tycoon/scene/geo';
import { addFacadeDetails, type FacadeDetailSpec } from '../../src/tycoon/scene/architecture';

const base: FacadeDetailSpec = { x: 0, z: 0, w: 9, d: 9, height: 9.6, nx: 0, nz: 1, depth: 9, along: 9, style: 'shop', accent: 0x35c48a, landmark: true, awning: true, industrial: false, setback: false, quality: 'high' };
function build(patch: Partial<FacadeDetailSpec>) {
  const trim = new GeoBuilder(), glass = new GeoBuilder(), lights = new GeoBuilder();
  addFacadeDetails(trim, glass, lights, { ...base, ...patch });
  return [trim.build(), glass.build(), lights.build()];
}
describe('Hustle architectural details', () => {
  it('builds solid geometry for trim, windows and lighting on every facing', () => {
    for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      for (const g of build({ nx, nz })) {
        expect(g).not.toBeNull();
        expect(Array.from(g!.attributes.position.array).every(Number.isFinite)).toBe(true);
        expect(g!.index!.count).toBeLessThan(2000);
        g!.dispose();
      }
    }
  });
  it('uses shutter panels instead of glass for factories; skips distant-grade details on low', () => {
    const [trim, glass, light] = build({ industrial: true, awning: false });
    expect(trim).not.toBeNull(); expect(glass).toBeNull(); expect(light).not.toBeNull();
    trim?.dispose(); light?.dispose();
    expect(build({ quality: 'low', landmark: false })).toEqual([null, null, null]);
  });
});
