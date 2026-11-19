import { describe, expect, it } from 'vitest';
import { aiInput, kmh, newCar, separateCars, stayOnTrack, stepCar, BODY_HALF_WIDTH, NITRO_SECONDS, PLAYER_PARAMS, WALL_HEADING_RATE, wrapAngle, type CarInput } from '../../src/race/physics';
import { COUNTDOWN, createRace, currentLap, placeOf, rivalBand, updateRace } from '../../src/race/race';
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
    for (let k = 0; k < 90 * 5; k++) stepCar(b, GAS, DT, track); b.boostT = 0; b.nitro = 1; // 최고속 근처에서 니트로를 켭니다
    for (let k = 0; k < 90 * 3; k++) { stepCar(b, { ...GAS, nitro: true }, DT, track); peak = Math.max(peak, kmh(b)); }
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
  it('slides along a wall without dumping speed or snapping its nose', () => {
    const hold = (steer: number) => {
      const c = newCar(track, 40, 0), h = Math.atan2(track.tz[40], track.tx[40]);
      c.h = h; c.vx = Math.cos(h) * 78; c.vz = Math.sin(h) * 78; c.vf = 78; c.nitro = 1; c.boostT = 3;
      let min = kmh(c);
      for (let k = 0; k < 90 * 2; k++) { stepCar(c, { ...GAS, steer, nitro: true }, DT, track); min = Math.min(min, kmh(c)); expect(Math.abs(c.lat)).toBeLessThanOrEqual(track.halfWidth); }
      return { kmh: kmh(c), min, lat: c.lat };
    };
    const left = hold(-1), right = hold(1);
    expect(left.min).toBeGreaterThan(240); expect(right.min).toBeGreaterThan(240);
    expect(left.lat).toBeLessThan(-10); expect(right.lat).toBeGreaterThan(10);
    expect(Math.abs(left.kmh - right.kmh)).toBeLessThan(40);
    const c = newCar(track, 40, 0), i = 40, limit = track.halfWidth - BODY_HALF_WIDTH - 0.28, trackH = Math.atan2(track.tz[i], track.tx[i]);
    c.idx = i; c.x = track.x[i] - track.tz[i] * (limit + 1.5); c.z = track.z[i] + track.tx[i] * (limit + 1.5);
    c.h = trackH - 1; c.vx = Math.cos(trackH) * 40; c.vz = Math.sin(trackH) * 40; c.vf = 40;
    const h0 = c.h, sp0 = Math.hypot(c.vx, c.vz);
    stayOnTrack(c, track, DT, true);
    const dh = Math.abs(wrapAngle(c.h - h0));
    expect(dh).toBeGreaterThan(WALL_HEADING_RATE * DT * 0.5);
    expect(dh).toBeLessThan(0.03);
    expect(Math.hypot(c.vx, c.vz)).toBeGreaterThan(sp0 * 0.85);
  });
  it('keeps a car that drives into the wall on the road', () => {
    const c = newCar(track, 0, 0); let hits = 0;
    for (let k = 0; k < 90 * 8; k++) { if (stepCar(c, { ...GAS, steer: 1 }, DT, track).hit > 0) hits++; expect(Math.abs(c.lat)).toBeLessThanOrEqual(track.halfWidth); }
    expect(hits).toBeGreaterThan(0);
  });
  it('empties a nitro tank in one continuous boost instead of sipping it', () => {
    const c = newCar(track, 0, 0); c.nitro = 1; let emptyAt = 0, gaps = 0;
    for (let k = 0; k < 90 * (NITRO_SECONDS + 2); k++) {
      const before = c.nitro;
      stepCar(c, { ...GAS, nitro: true }, DT, track);
      if (before > 0 && c.boostT <= 0) gaps++;
      if (!emptyAt && c.nitro <= 0) emptyAt = (k + 1) * DT;
    }
    expect(emptyAt).toBeGreaterThan(NITRO_SECONDS * 0.9);
    expect(emptyAt).toBeLessThan(NITRO_SECONDS * 1.15);
    expect(gaps).toBe(0);
  });
  it('does not turn a held nitro button into endless boost once the tank is empty', () => {
    const c = newCar(track, 0, 0), flat = { ...track, pads: [] }; c.nitro = 1; let boostFrames = 0, total = 0;
    for (let k = 0; k < 90 * 30; k++) { stepCar(c, { ...GAS, nitro: true }, DT, flat); if (k >= 90 * (NITRO_SECONDS + 2)) { total++; if (c.boostT > 0) boostFrames++; } }
    expect(boostFrames).toBe(0); expect(total).toBeGreaterThan(0);
    // 버튼을 떼면 다시 천천히 차오릅니다.
    for (let k = 0; k < 90 * 10; k++) stepCar(c, GAS, DT, flat);
    expect(c.nitro).toBeGreaterThan(0.1);
  });
  it('separates cars by their body, not by a circle that is too wide and too short', () => {
    const a = newCar(track, 0, 0), b = newCar(track, 0, 0);
    const rx = -Math.sin(a.h), rz = Math.cos(a.h);
    b.x = a.x + rx * 0.4; b.z = a.z + rz * 0.4; b.h = a.h;
    expect(separateCars(a, b)).toBe(0);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThanOrEqual(BODY_HALF_WIDTH * 2 - 0.02);
    const nose = newCar(track, 0, 0), tail = newCar(track, 0, 0);
    tail.x = nose.x - Math.cos(nose.h) * 1.2; tail.z = nose.z - Math.sin(nose.h) * 1.2; tail.h = nose.h;
    separateCars(nose, tail);
    expect(Math.hypot(nose.x - tail.x, nose.z - tail.z)).toBeGreaterThan(4);
    const far = newCar(track, 0, 0), other = newCar(track, 0, 0);
    other.x += Math.cos(far.h) * 30; other.z += Math.sin(far.h) * 30;
    const x0 = other.x; expect(separateCars(far, other)).toBe(0); expect(other.x).toBe(x0);
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
  it('does not slow a rival who is already ahead of the player', () => {
    const level = createRace(track, 3).level;
    expect(rivalBand(level, 400)).toBe(1);
    expect(rivalBand(level, -400)).toBeGreaterThan(1);
    expect(rivalBand(level, -4000)).toBe(level.bandHi);
    const race = createRace(track, 3, Infinity, { level: 1, car: 'arc' });
    race.phase = 'racing'; race.clock = 0;
    const rival = race.racers[1], base = rival.ai.top;
    rival.car.total = race.player.car.total + 500 / track.ds;
    for (let k = 0; k < 90; k++) updateRace(race, DT, GAS);
    expect(rival.ai.top).toBeCloseTo(base, 6);
    expect(rivalBand(race.level, (rival.car.total - race.player.car.total) * track.ds)).toBe(1);
  });
  it('freezes the clock after the finish', () => {
    const r = createRace(track, 1); r.phase = 'done'; r.clock = 42; r.player.finishTime = 42;
    updateRace(r, DT, GAS);
    expect(r.clock).toBe(42);
  });
  it('starts the player on the grid behind the line at lap 1', () => {
    const r = createRace(track, 3); expect(r.racers).toHaveLength(4); expect(currentLap(r)).toBe(1); expect(r.player.car.total).toBeLessThan(0);
    expect(new Set(r.racers.map(k => `${Math.round(k.car.x)},${Math.round(k.car.z)}`)).size).toBe(4);
  });
});
