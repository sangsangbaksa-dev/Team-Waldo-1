import { describe, expect, it } from 'vitest';
import { aiInput, kmh, newCar, stepCar, PLAYER_PARAMS, type CarInput } from '../../src/race/physics';
import { COUNTDOWN, createRace, currentLap, placeOf, updateRace } from '../../src/race/race';
import { buildTrack, idxDelta, nearest } from '../../src/race/track';

const track = buildTrack(), DT = 1 / 90;
const GAS: CarInput = { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false };

describe('SPEED RUSH track', () => {
  it('is a closed circuit of a sensible length with drivable curves', () => {
    expect(track.length).toBeGreaterThan(2400); expect(track.length).toBeLessThan(4200);
    let minR = Infinity; for (let i = 0; i < track.n; i++) minR = Math.min(minR, 1 / Math.max(1e-6, Math.abs(track.k[i])));
    expect(minR).toBeGreaterThan(40);
    const wrap = Math.hypot(track.x[0] - track.x[track.n - 1], track.z[0] - track.z[track.n - 1]);
    expect(wrap).toBeLessThan(track.ds * 1.5);
  });
  it('never runs two stretches of road into each other', () => {
    let min = Infinity;
    for (let i = 0; i < track.n; i += 3) for (let j = i + 1; j < track.n; j += 3) { const gap = Math.min(j - i, track.n - (j - i)); if (gap > 40) min = Math.min(min, Math.hypot(track.x[i] - track.x[j], track.z[i] - track.z[j])); }
    expect(min).toBeGreaterThan(track.halfWidth * 4);
  });
  it('finds the nearest sample with a signed lateral offset (right is positive)', () => {
    const i = 100, px = track.x[i] - track.tz[i] * 4, pz = track.z[i] + track.tx[i] * 4, r = nearest(track, px, pz, 90);
    expect(r.i).toBe(i); expect(r.lat).toBeCloseTo(4, 1);
    expect(idxDelta(track, track.n - 2, 3)).toBe(5); expect(idxDelta(track, 3, track.n - 2)).toBe(-5);
  });
});

describe('SPEED RUSH car physics', () => {
  it('accelerates hard, caps at top speed and reaches higher speed with boost', () => {
    const c = newCar(track, 0, 0); let t100 = 0, t = 0;
    while (t < 6) { stepCar(c, GAS, DT, track); t += DT; if (!t100 && kmh(c) >= 100) t100 = t; }
    expect(t100).toBeGreaterThan(1); expect(t100).toBeLessThan(3.5);
    const b = newCar(track, 0, 0); b.nitro = 1; let peak = 0;
    for (let k = 0; k < 90 * 5; k++) { stepCar(b, { ...GAS, nitro: true }, DT, track); peak = Math.max(peak, kmh(b)); }
    expect(peak).toBeGreaterThan(PLAYER_PARAMS.top * 3.6); expect(b.nitro).toBeLessThan(1);
  });
  it('steers right when asked and loses less speed than a crash', () => {
    const c = newCar(track, 0, 0); c.vx = Math.cos(c.h) * 40; c.vz = Math.sin(c.h) * 40; c.vf = 40; const h0 = c.h;
    for (let k = 0; k < 45; k++) stepCar(c, { ...GAS, steer: 1 }, DT, track);
    expect((c.h - h0 + Math.PI * 3) % (Math.PI * 2) - Math.PI).toBeGreaterThan(0.05); expect(kmh(c)).toBeGreaterThan(100);
  });
  it('earns a drift boost after a long enough slide', () => {
    const c = newCar(track, 0, 0); c.vx = Math.cos(c.h) * 55; c.vz = Math.sin(c.h) * 55; c.vf = 55; let boost = 0;
    for (let k = 0; k < 90 * 1.6; k++) { const e = stepCar(c, { ...GAS, steer: k < 36 ? 0.5 : k < 90 ? -0.5 : 0.5, drift: true }, DT, track); expect(c.lat).toBeLessThan(track.halfWidth); boost += e.driftBoost; }
    expect(c.drifting).toBe(true);
    for (let k = 0; k < 20; k++) boost += stepCar(c, { ...GAS, steer: 0, drift: false }, DT, track).driftBoost;
    expect(boost).toBeGreaterThan(0.3); expect(c.boostT).toBeGreaterThan(0);
  });
  it('keeps a car that drives into the wall on the road', () => {
    const c = newCar(track, 0, 0); let hits = 0;
    for (let k = 0; k < 90 * 8; k++) { if (stepCar(c, { ...GAS, steer: 1 }, DT, track).hit > 0) hits++; expect(Math.abs(c.lat)).toBeLessThanOrEqual(track.halfWidth); }
    expect(hits).toBeGreaterThan(0);
  });
  it('the AI laps the circuit without touching a wall', () => {
    const c = newCar(track, 0, 0), ai = { lane: 0, top: 68, grip: 35, skill: 1 }; let t = 0, hits = 0;
    while (c.total < track.n && t < 120) { if (stepCar(c, aiInput(c, track, ai), DT, track).hit > 0) hits++; t += DT; }
    expect(c.total).toBeGreaterThanOrEqual(track.n); expect(hits).toBe(0); expect(t).toBeLessThan(75);
  });
});

describe('SPEED RUSH race flow', () => {
  it('counts down, then starts, with a launch bonus for a well-timed throttle', () => {
    const r = createRace(track, 3), ev: string[] = []; let t = 0;
    while (r.phase === 'countdown' && t < COUNTDOWN + 1) { const down = r.clock > -0.3; for (const e of updateRace(r, DT, down ? GAS : { ...GAS, throttle: 0 })) ev.push(e.type); t += DT; }
    expect(ev.filter(e => e === 'count')).toHaveLength(3); expect(ev).toContain('go'); expect(ev).toContain('launch'); expect(r.player.car.boostT).toBeGreaterThan(0);
  });
  it('does not reward holding the throttle through the countdown', () => {
    const r = createRace(track, 3), ev: string[] = [];
    for (let t = 0; t < COUNTDOWN + 0.5; t += DT) for (const e of updateRace(r, DT, GAS)) ev.push(e.type);
    expect(ev).not.toContain('launch');
  });
  it('plays a full race: laps counted once each, order resolved, player finishes', () => {
    const r = createRace(track, 2), laps: number[] = []; let t = 0, finish = 0, safety = 0;
    const drive = { lane: 0, top: 71, grip: 37, skill: 1 };
    while (r.phase !== 'done' && t < 200) {
      for (const e of updateRace(r, DT, aiInput(r.player.car, track, drive))) { if (e.type === 'lap') laps.push(e.lap); if (e.type === 'finish') finish = e.place; }
      t += DT; if (currentLap(r) > r.laps) safety++;
    }
    expect(r.phase).toBe('done'); expect(laps).toEqual([1, 2]); expect(finish).toBeGreaterThanOrEqual(1); expect(finish).toBeLessThanOrEqual(4); expect(placeOf(r)).toBe(finish); expect(safety).toBe(0);
  });
  it('starts the player on the grid behind the line at lap 1', () => {
    const r = createRace(track, 3); expect(r.racers).toHaveLength(4); expect(currentLap(r)).toBe(1); expect(r.player.car.total).toBeLessThan(0);
    expect(new Set(r.racers.map(k => `${Math.round(k.car.x)},${Math.round(k.car.z)}`)).size).toBe(4);
  });
});
