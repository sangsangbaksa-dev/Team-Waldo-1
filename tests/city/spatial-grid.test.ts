import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { emptyMap } from '../../src/city/map';
import { updateActors } from '../../src/city/actors';

const make = (): World => new World({ seed: 7, difficulty: 'd4', klass: 'tycoon', tutorial: true });
describe('LAST CITY spatial queries', () => {
  it('refreshes locations after an actor moves across cells', () => {
    const w = make(), a = w.boss(0)!;
    a.x = a.y = 100; w.refreshActorGrid();
    a.x = a.y = 900; w.refreshActorGrid();
    const found: number[] = []; w.forNear(900, 900, 15, b => found.push(b.id));
    expect(found).toContain(a.id);
    const old: number[] = []; w.forNear(100, 100, 15, b => old.push(b.id));
    expect(old).not.toContain(a.id);
  });
  it('excludes indoor and mounted characters even before the next refresh', () => {
    const w = make(), a = w.boss(0)!; w.refreshActorGrid();
    const found = (): number[] => { const ids: number[] = []; w.forNear(a.x,a.y,30,b=>ids.push(b.id)); return ids; };
    expect(found()).toContain(a.id);
    w.inside = { biz: 0, x: 0, y: 0, ang: 0, walk: 0 };
    expect(found()).not.toContain(a.id);
    w.inside = null; a.inVeh = 123;
    expect(found()).not.toContain(a.id);
  });
  it('separates two units spawned at identical coordinates', () => {
    const w = make(); w.map = emptyMap();
    const a = w.spawnActor('rifle', 0, 400, 400), b = w.spawnActor('rifle', 0, 400, 400);
    w.actors = [a,b]; a.thinkT = b.thinkT = 10;
    w.refreshActorGrid(); updateActors(w, 1/30);
    expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeCloseTo(a.r+b.r);
  });
});
