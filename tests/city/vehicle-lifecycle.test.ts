import { describe, expect, it } from 'vitest';
import { World } from '../../src/city/world';
import { emptyMap } from '../../src/city/map';
import { CIV } from '../../src/city/defs';
import { updateBullets, updateVehicles } from '../../src/city/actors';

function sandbox(): World {
  const w = new World({ seed: 7, difficulty: 'd4', klass: 'tycoon', tutorial: true });
  w.map = emptyMap(); w.vehicles = []; w.bullets = [];
  return w;
}
describe('LAST CITY vehicle and bullet lifecycle', () => {
  it('does not snap a fleeing citizen back into the car', () => {
    const w = sandbox(), v = w.spawnVehicle('sedan', 400, 400, 0);
    const a = w.spawnActor('civ', CIV, 400, 400);
    v.driver = a.id; a.inVeh = v.id; v.f = CIV; v.ai = 'traffic'; v.idle = 51;
    updateVehicles(w, 1 / 30);
    expect(a.inVeh).toBe(0); expect(v.driver).toBe(0);
    expect(Math.hypot(a.x - v.x, a.y - v.y)).toBeGreaterThan(20);
  });
  it('convoy objective remains drivable after taking damage even when traffic tries to flee', () => {
    const w = sandbox(), v = w.spawnVehicle('truck', 400, 400, 0);
    const driver = w.spawnActor('civ', CIV, 400, 400);
    v.driver = driver.id; driver.inVeh = v.id; v.f = CIV; v.ai = 'traffic';
    // Low health and impact-idle are both reasons for ordinary traffic to abandon a car.
    v.hp = v.maxHp * 0.35; v.idle = 99;
    w.event = {kind:'convoy',x:400,y:400,t:95,total:95,vid:v.id,prog:0,ids:[],stage:0,tx:0,ty:0,pay:0};
    updateVehicles(w,1/30);
    expect(v.alive).toBe(true);
    expect(v.ai).toBe('traffic');
    expect(v.driver).toBe(driver.id);
    expect(driver.inVeh).toBe(v.id);
  });
  it('ordinary traffic still evacuates when badly damaged', () => {
    const w = sandbox(), v = w.spawnVehicle('truck', 400, 400, 0);
    const driver = w.spawnActor('civ', CIV, 400, 400);
    v.driver = driver.id; driver.inVeh = v.id; v.f = CIV; v.ai = 'traffic';
    v.hp = v.maxHp * 0.35;
    updateVehicles(w,1/30);
    expect(v.ai).toBe('');
    expect(v.driver).toBe(0);
    expect(driver.inVeh).toBe(0);
  });
  it('a piercing bullet hits a given vehicle only once across substeps', () => {
    const w = sandbox(), v = w.spawnVehicle('truck', 400, 400, 0);
    w.bullets.push({ x: 360, y: 400, px: 360, py: 400, vx: 1000, vy: 0, life: 1, dmg: 100, f: 0, src: 0, w: 'railgun', boss: true });
    updateBullets(w, 0.08);
    expect(v.hp).toBe(v.maxHp - 150);
    expect(w.bullets[0].hitIds).toEqual([v.id]);
  });
  it('separates coincident vehicles', () => {
    const w = sandbox(), a = w.spawnVehicle('sedan', 400, 400, 0), b = w.spawnVehicle('sedan', 400, 400, 0);
    updateVehicles(w, 1 / 30);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(a.r + b.r);
  });
  it('chooses an accessible vehicle rather than a boss-occupied one', () => {
    const w = sandbox(), b = w.boss(0)!, rival = w.boss(1)!;
    b.x = b.y = 400;
    const occupied = w.spawnVehicle('sedan', 401, 400, 0), free = w.spawnVehicle('sedan', 440, 400, 0);
    occupied.driver = rival.id; rival.inVeh = occupied.id; occupied.f = 1;
    w.toggleVehicle(0);
    expect(b.inVeh).toBe(free.id); expect(occupied.driver).toBe(rival.id);
  });
});
