import { describe, expect, it } from 'vitest';
import { newCar, type CarInput } from '../../src/race/physics';
import { COUNTDOWN, createRace, updateRace } from '../../src/race/race';
import { CRATE_RESPAWN, ITEM_KINDS, OIL_STUN, SHIELD_SECONDS, collectCrate, createItems, crateSpots, dropOil, nextRandom, rollItem, tickItems, touchOil } from '../../src/race/items';
import { buildTrack, idxDelta } from '../../src/race/track';

const track = buildTrack(), DT = 1 / 90;
const IDLE: CarInput = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };
const go = (opts = {}) => { const r = createRace(track, 3, Infinity, { items: true, ...opts }); for (let t = 0; t < COUNTDOWN + 0.05; t += DT) updateRace(r, DT, IDLE); return r; };

describe('SPEED RUSH item crates', () => {
  it('places three-wide crate rows away from the start line and the boost pads', () => {
    const spots = crateSpots(track); expect(spots.length).toBe(18);
    for (const s of spots) { expect(Math.abs(s.lat)).toBeLessThan(track.halfWidth); expect(Math.min(s.idx, track.n - s.idx)).toBeGreaterThan(10); for (const p of track.pads) expect(Math.abs(idxDelta(track, s.idx, p))).toBeGreaterThanOrEqual(8); }
  });
  it('rolls the same items for the same seed and favors catch-up items when behind', () => {
    const a = createItems(track, 7), b = createItems(track, 7); for (let i = 0; i < 20; i++) expect(nextRandom(a)).toBe(nextRandom(b));
    const front = createItems(track, 3), back = createItems(track, 3), count = { front: { surge: 0, oil: 0 }, back: { surge: 0, oil: 0 } };
    for (let i = 0; i < 600; i++) { const f = rollItem(front, 1, 4), k = rollItem(back, 4, 4); if (f === 'surge') count.front.surge++; if (f === 'oil') count.front.oil++; if (k === 'surge') count.back.surge++; if (k === 'oil') count.back.oil++; expect(ITEM_KINDS).toContain(f); }
    expect(count.back.surge).toBeGreaterThan(count.front.surge); expect(count.front.oil).toBeGreaterThan(count.back.oil);
  });
  it('lets the car pick up one crate at a time, then respawns it', () => {
    const it = createItems(track, 1), c = it.crates[0], first = collectCrate(it, { x: c.x, z: c.z }, 2, 4);
    expect(first).not.toBeNull(); expect(it.held).toBe(first); expect(c.wait).toBe(CRATE_RESPAWN);
    const next = it.crates[1]; expect(collectCrate(it, { x: next.x, z: next.z }, 2, 4)).toBeNull(); expect(next.wait).toBe(0); // 이미 들고 있으면 상자는 그대로
    tickItems(it, CRATE_RESPAWN + 0.1); expect(c.wait).toBe(0);
  });
  it('makes an oil slick that hits each rival once and fades away', () => {
    const it = createItems(track, 1), car = newCar(track, 100, 0); dropOil(it, car);
    const o = it.oils[0]; expect(touchOil(it, 1, { x: o.x, z: o.z })).toBe(true); expect(touchOil(it, 1, { x: o.x, z: o.z })).toBe(false); expect(touchOil(it, 2, { x: o.x + 50, z: o.z })).toBe(false);
    tickItems(it, 30); expect(it.oils.length).toBe(0);
  });
});

describe('SPEED RUSH items in a solo race', () => {
  it('is off by default and in time attack, so online and ghost runs stay untouched', () => {
    expect(createRace(track, 3, Infinity, {}).items).toBeUndefined(); expect(createRace(track, 3, Infinity, { trial: true, items: true }).items).toBeUndefined();
  });
  it('picks a crate up when driving through it and uses it once per button press', () => {
    const r = go(), it = r.items!, c = it.crates[0]; Object.assign(r.player.car, { x: c.x, z: c.z, y: c.y, vf: 0 });
    const ev = updateRace(r, DT, IDLE); expect(ev.some(e => e.type === 'pickup')).toBe(true); expect(it.held).not.toBeNull();
    it.held = 'cell'; r.player.car.nitro = 0.1; const use = updateRace(r, DT, { ...IDLE, item: true }); expect(use.some(e => e.type === 'item')).toBe(true);
    expect(it.held).toBeNull(); expect(r.player.car.nitro).toBeCloseTo(0.6, 1);
    it.held = 'surge'; const held = updateRace(r, DT, { ...IDLE, item: true }); expect(held.some(e => e.type === 'item')).toBe(false); expect(it.held).toBe('surge'); // 계속 누르고 있어도 한 번만
    updateRace(r, DT, IDLE); updateRace(r, DT, { ...IDLE, item: true }); expect(r.player.car.boostT).toBeGreaterThan(3);
  });
  it('slows a rival that drives over the oil, then lets it recover', () => {
    const r = go(), it = r.items!, rival = r.racers[1]; Object.assign(rival.car, { vx: Math.cos(rival.car.h) * 40, vz: Math.sin(rival.car.h) * 40, vf: 40 });
    it.oils.push({ x: rival.car.x, z: rival.car.z, y: rival.car.y, idx: rival.car.idx, life: 10, hit: [] });
    const ev = updateRace(r, DT, IDLE); expect(ev.some(e => e.type === 'oilHit')).toBe(true); expect(rival.stun).toBeGreaterThan(OIL_STUN - 0.1); expect(rival.car.vf).toBeLessThan(30);
    for (let t = 0; t < OIL_STUN + 0.2; t += DT) updateRace(r, DT, IDLE); expect(rival.stun).toBe(0);
  });
  it('shield keeps the speed and the drift through a bump and a wall hit, and makes the other car stumble', () => {
    const r = go(), it = r.items!, me = r.player.car, rival = r.racers[1];
    it.shield = SHIELD_SECONDS; Object.assign(me, { vx: Math.cos(me.h) * 50, vz: Math.sin(me.h) * 50, vf: 50 });
    Object.assign(rival.car, { x: me.x + Math.cos(me.h) * 1.5, z: me.z + Math.sin(me.h) * 1.5, h: me.h, vx: 0, vz: 0, vf: 0 });
    const ev = updateRace(r, DT, IDLE); expect(ev.some(e => e.type === 'shieldBlock')).toBe(true); expect(me.vf).toBeGreaterThan(45); expect(rival.stun).toBeGreaterThan(0.5);
    expect(ev.some(e => e.type === 'bump')).toBe(false);
  });
  it('scores drift chains, banks them and refunds a little nitro', () => {
    const r = go(), me = r.player.car; me.nitro = 0; Object.assign(me, { vx: Math.cos(me.h) * 55, vz: Math.sin(me.h) * 55, vf: 55 });
    let banked = 0, peak = 0;
    for (let k = 0; k < 90 * 1.6; k++) { updateRace(r, DT, { throttle: 1, brake: 0, steer: k < 36 ? 0.5 : k < 90 ? -0.5 : 0.5, drift: true, nitro: false }); peak = Math.max(peak, r.drift.chain); }
    for (let k = 0; k < 90 * 3; k++) for (const e of updateRace(r, DT, { ...IDLE, throttle: 1 })) if (e.type === 'driftBank') banked += e.points;
    expect(peak).toBeGreaterThan(100); expect(banked).toBeGreaterThan(100); expect(r.drift.total).toBe(banked); expect(me.nitro).toBeGreaterThan(0);
  });
});
