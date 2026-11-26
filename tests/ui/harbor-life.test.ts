import { describe, expect, it } from 'vitest';
import { CHUNK, DEPTH, DISTRICTS, WIDTH, districtAt, roadDistance } from '../../project-harbor/world/domain';
import { FreeRoam, IDLE_INPUT } from '../../project-harbor/world/session';
import { makePed, starCount } from '../../project-harbor/world/street';
import { clampSettings, createMixer, perceived, renderMix, spatial, type Ear } from '../../project-harbor/world/civic/audio';
import { detailSignature, detailsFor } from '../../project-harbor/world/civic/dressing';
import { AmbientFleet, driverIntent, type AmbientCar } from '../../project-harbor/world/civic/drivers';
import { seedCrowd, stepCrowd, traitsOf, type Stimulus } from '../../project-harbor/world/civic/life';

const view = { load() {}, unload() {} };
const open = () => false;

function crowd(peds: ReturnType<typeof makePed>[], stimuli: Stimulus[] = [], dt = 0.05, cars: { x: number; z: number; speed: number }[] = []) {
  return stepCrowd(peds, {
    dt, hours: 10, playerX: 0, playerZ: -30, stimuli, blocked: open, cars,
  });
}

describe('Harbor district life', () => {
  it('gives the six regions different dressing and keeps it off the roads', () => {
    const signatures = DISTRICTS.map(district => detailSignature(district.id));
    expect(new Set(signatures).size).toBe(6);
    for (let cx = 0; cx < WIDTH / CHUNK; cx += 2) {
      for (let cz = 0; cz < DEPTH / CHUNK; cz += 2) {
        const details = detailsFor(cx, cz);
        expect(details).toEqual(detailsFor(cx, cz));
        for (const prop of details) {
          expect(prop.detail).toBe(true);
          expect(roadDistance(prop.x, prop.z)).toBeGreaterThanOrEqual(Math.max(prop.w, prop.d) / 2 + 3);
          expect(prop.x - prop.w / 2).toBeGreaterThanOrEqual(cx * CHUNK + 2);
          expect(prop.z - prop.d / 2).toBeGreaterThanOrEqual(cz * CHUNK + 2);
          expect(districtAt(prop.x, prop.z).id).toBe(districtAt(cx * CHUNK + 64, cz * CHUNK + 64).id);
        }
      }
    }
  });

  it('varies pedestrian reactions and keeps one report per crime', () => {
    expect(traitsOf('alfa').courage).not.toBe(traitsOf('bravo').courage);
    const coward = makePed('coward', 0, -6, { band: 2, courage: 0.05, lawful: 0.2, awareness: 0.95, activity: 'stroll' });
    const witness = makePed('witness', 20, 0, { band: 2, courage: 0.7, lawful: 0.95, awareness: 0.9, activity: 'bench', phase: 20 });
    const distant = makePed('distant', 40, -20, { band: 2, courage: 0.9, lawful: 0.2, awareness: 0.1, activity: 'stroll' });
    const gun: Stimulus = { kind: 'gun', x: 0, z: 0, radius: 48, seen: true, victim: 'nobody', crime: 4 };
    crowd([coward, witness, distant], [gun]);
    expect(coward.mood).toBe('panic');
    expect(witness.mood).toBe('calling');
    expect(distant.mood).toBe('calm');
    const filed = crowd([witness], [gun], 4);
    expect(filed.reports.map(report => report.crime)).toEqual([4]);

    const mark = makePed('mark', 0, 0, { band: 2, activity: 'stroll' });
    const bystander = makePed('bystander', 4, 0, { band: 2, courage: 0.6, lawful: 0.9, awareness: 0.9, activity: 'stroll' });
    const quiet = crowd([mark, bystander], [{ kind: 'pocket', x: 0, z: 0, radius: 10, seen: false, victim: 'mark', crime: 0 }]);
    expect(mark.mood).toBe('panic');
    expect(bystander.mood).toBe('calm');
    expect(quiet.reports).toEqual([]);
    const spotted = crowd([bystander], [{ kind: 'pocket', x: 0, z: 0, radius: 10, seen: true, victim: 'other', crime: 9 }], 4);
    expect(spotted.reports).toEqual([{ pedId: 'bystander', crime: 9 }]);

    const runner = makePed('runner', 2, 0, { band: 2, mood: 'panic', state: 'flee', courage: 0.1 });
    const neighbor = makePed('neighbor', 5, 0, { band: 2, courage: 0.2, lawful: 0.8, awareness: 0.9, activity: 'stroll' });
    const fear = crowd([runner, neighbor]);
    expect(neighbor.crime).toBe(0);
    expect(fear.reports).toEqual([]);
  });

  it('walks daily routes without leaving the bench, the crossing, or the shop', () => {
    const bench = makePed('sitter', 100, 100, {
      band: 2, activity: 'bench', phase: 12, homeX: 100, homeZ: 100, goalX: 100, goalZ: 100,
    });
    for (let i = 0; i < 20; i++) crowd([bench]);
    expect(Math.hypot(bench.x - 100, bench.z - 100)).toBeLessThan(1.2);
    expect(bench.activity).toBe('bench');

    const cross = makePed('crosser', 1344 + 9, 400, { band: 2, activity: 'cross', phase: 0, pace: 1.4 });
    for (let i = 0; i < 500 && cross.x > 1344; i++) crowd([cross], [], 0.05);
    expect(cross.x).toBeLessThan(1344);

    const shopper = makePed('shopper', 80, 80, { band: 2, activity: 'shop', goalX: 80, goalZ: 80, pace: 1.2 });
    crowd([shopper]);
    expect(shopper.hidden).toBe(true);
    crowd([shopper], [], 5);
    expect(shopper.hidden).toBe(false);
    expect(shopper.activity).toBe('stroll');
  });

  it('makes drivers brake and keeps a short local fleet finite', () => {
    const car: AmbientCar = {
      id: 'c', x: 0, z: 0, travel: 'x', dir: 1, road: 0, lateral: 0, offset: 0,
      speed: 10, mode: 'cruise', horn: 0, yaw: 0, color: 0x527c99,
    };
    const calm = driverIntent(car, [], false, false);
    const blocked = driverIntent(car, [{ x: 10, z: 0 }], false, false);
    expect(blocked.target).toBeLessThan(calm.target);
    expect(blocked.horn).toBe(true);
    expect(blocked.mode === 'brake' || blocked.mode === 'stop').toBe(true);
    const fleet = new AmbientFleet();
    const roll = () => 0.37;
    fleet.ensure(1536, 576, 10, roll);
    expect(fleet.cars.length).toBeGreaterThan(0);
    expect(fleet.cars.length).toBeLessThanOrEqual(6);
    for (let i = 0; i < 80; i++) fleet.step(0.05, 1536, 576, [], () => false, false, () => false);
    expect(fleet.cars.every(item => Number.isFinite(item.x + item.z + item.speed))).toBe(true);
  });

  it('mixes spatial audio without letting mute change the hearing rules', () => {
    expect(perceived(0.5)).toBeCloseTo(0.25);
    expect(clampSettings({ master: 4, footsteps: -1 }).master).toBe(1);
    expect(clampSettings({ footsteps: -1 }).footsteps).toBe(0);
    const here = spatial({ x: 0, z: 0, yaw: 0, hours: 10 }, 2, 0, 40).gain;
    const there = spatial({ x: 0, z: 0, yaw: 0, hours: 10 }, 30, 0, 40).gain;
    expect(there).toBeLessThan(here);
    const mixer = createMixer('city');
    const settings = clampSettings({});
    const ears: Ear[] = Array.from({ length: 12 }, (_, index) => ({
      kind: 'scream', x: index, z: 0, gain: 1, pitch: 1,
    }));
    const loud = renderMix(mixer, {
      ears, listen: { x: 0, z: 0, yaw: 0, hours: 12 }, district: 'city', siren: null, engines: [],
    }, settings, 0.2);
    expect(loud.voices.length).toBeLessThanOrEqual(8);
    expect(loud.ambient[0]?.color).toBe('traffic');
    const edge = renderMix(mixer, {
      ears: [], listen: { x: 0, z: 0, yaw: 0, hours: 12 }, district: 'forest', siren: null, engines: [],
    }, settings, 0.2);
    expect(edge.ambient.length).toBe(2);
    const silent = renderMix(mixer, {
      ears, listen: { x: 0, z: 0, yaw: 0, hours: 12 }, district: 'forest', siren: { x: 0, z: 0, urgent: true }, engines: [{ x: 4, z: 0, rate: 1 }],
    }, clampSettings({ muted: true }), 0.2);
    expect(silent.voices).toEqual([]);
    expect(silent.siren.gain).toBe(0);
    expect(silent.engines).toEqual([]);
    expect(silent.ambient.every(layer => layer.gain === 0)).toBe(true);
  });

  it('ties a witnessed shot to the wanted clock without adding a second star', () => {
    const roam = new FreeRoam(view);
    for (const ped of roam.peds) ped.health = 0;
    const coward = roam.placePed(roam.x, roam.z - 8, {
      id: 'life-coward', health: 90, band: 2, courage: 0.05, lawful: 0.2, awareness: 0.95, activity: 'stroll',
    });
    const witness = roam.placePed(roam.x + 20, roam.z, {
      id: 'life-witness', health: 90, band: 2, courage: 0.7, lawful: 0.95, awareness: 0.95, activity: 'bench', phase: 30,
    });
    roam.vitals.weapon = 'pistol';
    roam.vitals.magazine = 6;
    roam.vitals.cooldown = 0;
    roam.tick({ ...IDLE_INPUT, fire: true }, 0.05);
    expect(coward.mood).toBe('panic');
    expect(witness.mood).toBe('calling');
    expect(starCount(roam.vitals.wanted)).toBe(1);
    for (let i = 0; i < 90; i++) roam.tick(IDLE_INPUT, 0.05);
    expect(starCount(roam.vitals.wanted)).toBe(1);
    expect(roam.vitals.health).toBe(100);
    expect(roam.activePedCount).toBeLessThanOrEqual(48);
    const seeded = makePed('walker', 200, 200);
    seedCrowd([seeded], 10);
    expect(seeded.band).toBeGreaterThanOrEqual(0);
  });
});
