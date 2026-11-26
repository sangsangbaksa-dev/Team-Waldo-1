import { describe, expect, it } from 'vitest';
import { CHUNK, blocked, propsFor, roadDistance } from '../../project-harbor/world/domain';
import {
  modelYaw, playerLook, poseAt, seatedPose, wardrobeFor, type Clip, type Locale,
} from '../../project-harbor/characters/domain';
import {
  Residents, createMotor, driveResidents, residentsForChunk, stepMotor,
} from '../../project-harbor/characters/application';

const idleIntent = { moving: false, sprint: false, jump: false, punch: false, enter: null };

describe('Harbor character looks', () => {
  it('dresses each district and the protagonist', () => {
    expect(playerLook().garment).toBe('leather');
    expect(playerLook().height).toBeGreaterThan(1.8);
    expect(wardrobeFor('rich', 2).garment).toBe('suit');
    expect(wardrobeFor('slum', 4).garment).toBe('hoodie');
    expect(wardrobeFor('base', 1).garment).toBe('fatigues');
    expect(wardrobeFor('forest', 8).garment).toBe('hiker');
    expect(wardrobeFor('desert', 9).garment).toBe('linen');
    expect(wardrobeFor('city', 3).garment).toBe('casual');
    expect(wardrobeFor('city', 3, 'officer').garment).toBe('uniform');
    expect(wardrobeFor('slum', 4)).toEqual(wardrobeFor('slum', 4));
    const skins = new Set(Array.from({ length: 30 }, (_, i) => wardrobeFor('city', i + 1).skin));
    expect(skins.size).toBeGreaterThanOrEqual(3);
  });

  it('poses walk, run, jump, punch, enter, talk and phone as distinct body positions', () => {
    const stand = poseAt('idle', 0);
    const left = poseAt('walk', 0);
    const right = poseAt('walk', 0.5);
    expect(left.lHipX).toBeLessThan(0);
    expect(left.rHipX).toBeGreaterThan(0);
    expect(Math.sign(left.lHipX)).not.toBe(Math.sign(right.lHipX));
    expect(poseAt('run', 0.25).spineX).toBeGreaterThan(poseAt('walk', 0.25).spineX);
    expect(Math.abs(poseAt('walk', 0, 1).lShoulderX)).toBeLessThan(Math.abs(poseAt('walk', 0, 0).lShoulderX));
    expect(poseAt('jump', 0.12).lKnee).toBeGreaterThan(poseAt('jump', 0.32).lKnee);
    expect(poseAt('punch', 0.42).rElbow).toBeLessThan(poseAt('punch', 0.12).rElbow);
    expect(Math.abs(poseAt('punch', 0.42).spineY)).toBeGreaterThan(0.2);
    const ear = poseAt('phone', 0.2, 0);
    expect(ear.rElbow).toBeGreaterThan(ear.lElbow);
    expect(ear.headZ).not.toBe(0);
    expect(ear.prop).toBe('phone');
    expect(poseAt('phone', 0.2, 1).headX).toBeGreaterThan(0.3);
    expect(poseAt('talk', 0.25, 1).rElbow).toBeGreaterThan(stand.rElbow);
    const boarding = poseAt('enter', 0.55);
    expect(boarding.crouch).toBeGreaterThan(0.4);
    expect(boarding.lKnee).toBeGreaterThan(0.6);
    expect(seatedPose().lKnee).toBeGreaterThan(1);
    const clips: Clip[] = ['idle', 'walk', 'run', 'jump', 'punch', 'enter', 'talk', 'phone'];
    for (const clip of clips) {
      for (const phase of [0, 0.12, 0.25, 0.42, 0.5, 0.75]) {
        const pose = poseAt(clip, phase, 0.5);
        for (const value of Object.values(pose)) {
          if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });
});

describe('Harbor character motor', () => {
  it('walks, sprints, jumps and punches without staying airborne', () => {
    expect(stepMotor(createMotor(), { ...idleIntent, moving: true }, 0.3).clip).toBe('walk');
    expect(stepMotor(createMotor(), { ...idleIntent, moving: true, sprint: true }, 0.2).clip).toBe('run');
    let motor = stepMotor(createMotor(), { ...idleIntent, jump: true }, 0.05);
    expect(motor.stage).toBe('crouch');
    expect(motor.clip).toBe('jump');
    for (let i = 0; i < 8; i += 1) motor = stepMotor(motor, idleIntent, 0.05);
    expect(motor.stage).toBe('air');
    expect(motor.lift).toBeGreaterThan(0.3);
    for (let i = 0; i < 40; i += 1) motor = stepMotor(motor, idleIntent, 0.05);
    expect(motor.lift).toBe(0);
    expect(['ground', 'land']).toContain(motor.stage);
    motor = stepMotor(createMotor(), { ...idleIntent, punch: true }, 0.05);
    expect(motor.clip).toBe('punch');
    motor = stepMotor(motor, { ...idleIntent, enter: 0.5 }, 0.05);
    expect(motor.clip).toBe('enter');
    expect(motor.phase).toBeCloseTo(0.5);
    expect(modelYaw(0, 'harbor')).toBeCloseTo(Math.PI);
    expect(modelYaw(Math.PI / 2, 'drive')).toBeCloseTo(Math.PI / 2);
  });
});

function clear(resident: { x: number; z: number }): boolean {
  expect(roadDistance(resident.x, resident.z)).toBeGreaterThan(1);
  const cx = Math.floor(resident.x / CHUNK);
  const cz = Math.floor(resident.z / CHUNK);
  const props = [];
  for (let i = cx - 1; i <= cx + 1; i += 1) {
    for (let j = cz - 1; j <= cz + 1; j += 1) props.push(...propsFor(i, j));
  }
  expect(blocked(resident.x, resident.z, props, 0.4)).toBe(false);
  return true;
}

describe('Harbor residents', () => {
  it('puts suits, hoodies, soldiers and police on open sidewalks', () => {
    const rich = residentsForChunk(20, 4);
    const slum = residentsForChunk(12, 12);
    const base = residentsForChunk(20, 12);
    const forest = residentsForChunk(4, 4);
    const desert = residentsForChunk(4, 12);
    const city = residentsForChunk(12, 4);
    for (const group of [rich, slum, base, forest, desert, city]) {
      expect(group.length).toBeGreaterThan(0);
      for (const resident of group) clear(resident);
    }
    expect(rich.every(resident => resident.wardrobe.garment === 'suit')).toBe(true);
    expect(rich.some(resident => resident.activity === 'talk')).toBe(true);
    expect(slum.every(resident => resident.wardrobe.garment === 'hoodie')).toBe(true);
    expect(slum.some(resident => resident.activity === 'phone' || resident.activity === 'talk')).toBe(true);
    expect(base.every(resident => resident.role === 'soldier' && resident.wardrobe.garment === 'fatigues')).toBe(true);
    expect(forest.every(resident => resident.wardrobe.garment === 'hiker')).toBe(true);
    expect(desert.every(resident => resident.wardrobe.garment === 'linen')).toBe(true);
    expect(desert.some(resident => resident.activity === 'phone')).toBe(true);
    expect(city.some(resident => resident.role === 'officer' && resident.wardrobe.garment === 'uniform')).toBe(true);
    expect(city.some(resident => resident.activity === 'talk' && resident.wardrobe.garment === 'casual')).toBe(true);
    const pair = city.find(resident => resident.partnerId);
    expect(pair).toBeTruthy();
    expect(city.some(resident => resident.id === pair?.partnerId && resident.partnerId === pair.id)).toBe(true);
  });

  it('keeps talkers in place, walks strollers, and remembers them across chunks', () => {
    const crowd = new Residents('harbor');
    crowd.follow(1536, 576);
    expect(crowd.list.length).toBeGreaterThan(4);
    expect(crowd.list.some(resident => resident.activity === 'talk')).toBe(true);
    expect(crowd.list.some(resident => resident.activity === 'stroll')).toBe(true);
    const talker = crowd.list.find(resident => resident.activity === 'talk');
    expect(talker).toBeTruthy();
    const talkX = talker!.x;
    const talkZ = talker!.z;
    const before = crowd.list.filter(resident => resident.activity === 'stroll').map(resident => ({ id: resident.id, x: resident.x, z: resident.z }));
    for (let i = 0; i < 180; i += 1) crowd.step(1 / 60, { x: 10, z: 10 });
    expect(talker!.x).toBeCloseTo(talkX, 1);
    expect(talker!.z).toBeCloseTo(talkZ, 1);
    expect(talker!.clip).toBe('talk');
    const moved = before.some(spot => {
      const resident = crowd.list.find(person => person.id === spot.id);
      return resident != null && Math.hypot(resident.x - spot.x, resident.z - spot.z) > 0.5;
    });
    expect(moved).toBe(true);
    for (const resident of crowd.list) expect(Number.isFinite(resident.x + resident.z + resident.yaw + resident.phase)).toBe(true);
    for (const resident of crowd.list) resident.phase = 0.42;
    const ids = new Set(crowd.list.map(resident => resident.id));
    crowd.follow(1536 + 200, 576);
    const overlap = crowd.list.filter(resident => ids.has(resident.id));
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap.every(resident => resident.phase === 0.42)).toBe(true);
  });

  it('fills the drive map with every regional style and daily routine', () => {
    const locales: Locale[] = ['forest', 'city', 'rich', 'desert', 'slum', 'base'];
    const people = driveResidents({
      roads: [-180, -90, 0, 90, 180],
      limit: 270,
      sidewalk: 10.5,
      localeAt: (x, z) => locales[(z >= 0 ? 3 : 0) + (x < -90 ? 0 : x >= 90 ? 2 : 1)]!,
      avoid: () => true,
      capPerLocale: 3,
    });
    const garments = new Set(people.map(person => person.wardrobe.garment));
    expect(garments).toEqual(new Set(['hiker', 'uniform', 'casual', 'suit', 'linen', 'hoodie', 'fatigues']));
    expect(people.some(person => person.role === 'officer')).toBe(true);
    expect(people.some(person => person.role === 'soldier')).toBe(true);
    expect(people.some(person => person.activity === 'stroll')).toBe(true);
    expect(people.some(person => person.activity === 'talk')).toBe(true);
    expect(people.some(person => person.activity === 'phone')).toBe(true);
    const crowd = new Residents('drive');
    crowd.load(people);
    for (let i = 0; i < 120; i += 1) crowd.step(1 / 60, { x: 0, z: 0 }, () => true);
    expect(crowd.list.every(person => Number.isFinite(person.x + person.z))).toBe(true);
  });
});
