import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, MeshStandardMaterial, Vector3 } from 'three';
import { MotorcycleParts, wheelAdvance } from '../../project-harbor/world/motorcycle';
import { reflectionSky } from '../../project-harbor/world/reflections';
import { makeVehicle } from '../../project-harbor/vehicles/domain.js';
import type { Ride } from '../../project-harbor/world/traffic';

describe('Harbor vehicle detail', () => {
  it('ships all three Blender sports car variants', () => {
    const file=readFileSync(new URL('../../public/assets/models/race.glb',import.meta.url));
    expect(file.toString('ascii',0,4)).toBe('glTF');
    const json=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12))) as {nodes:{name?:string}[]};
    expect(json.nodes.map(n=>n.name)).toEqual(expect.arrayContaining(['gt','wide','long']));
  });
  it('rotates wheels in both directions and bounds long frame advances', () => {
    expect(wheelAdvance(0,3.4,.1)).toBeCloseTo(1);
    expect(wheelAdvance(0,-3.4,.1)).toBeCloseTo(-1);
    expect(wheelAdvance(0,3.4,1)).toBeCloseTo(1);
  });
  it('builds a motorcycle with grounded wheels and independent steering', () => {
    const parts=new MotorcycleParts(),paint=new MeshStandardMaterial();
    const bike=parts.create(paint);
    const bounds=new Box3().setFromObject(bike.root);
    expect(bounds.min.y).toBeCloseTo(0,2);
    const size=bounds.getSize(new Vector3());
    expect(size.z).toBeGreaterThan(2);
    expect(size.z).toBeLessThan(2.4);
    expect(bike.wheels).toHaveLength(2);
    const ride=makeVehicle(1,'bike',0,0,0) as Ride;
    ride.vz=5;ride.steer=.8;
    parts.update(bike,ride,.05);
    expect(bike.wheels[0]!.rotation.x).toBeGreaterThan(0);
    expect(bike.steering.rotation.y).toBeGreaterThan(0);
    bike.brake.dispose();paint.dispose();parts.dispose();
  });
  it('builds a compact opaque reflection panorama', () => {
    const texture=reflectionSky(), image=texture.image;
    expect(image.width).toBe(128);expect(image.height).toBe(64);
    expect(image.data).not.toBeNull();
    expect(image.data?.length).toBe(128*64*4);expect(image.data?.[3]).toBe(255);
    texture.dispose();
  });
});
