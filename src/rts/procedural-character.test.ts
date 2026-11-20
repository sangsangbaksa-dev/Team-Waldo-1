import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeProceduralMilitary, type MilitaryLook } from '../shared/character/procedural';
import { makeBuilding, makeCrystals, makeUnit, releaseModelGeometry } from './models';

const look = { height: 1, width: 1, team: 0x345a84, skin: 0xba947a };
describe('shared military character fallback', () => {
  for (const kind of ['rifle','heavy','medic','worker','swat','guard','merc'] as MilitaryLook[]) {
    it(`builds an animated ${kind} without downloaded assets`, () => {
      const ch = makeProceduralMilitary(kind, look);
      const idle = new THREE.Box3().setFromObject(ch.root);
      expect(idle.isEmpty()).toBe(false);
      expect(idle.max.y).toBeGreaterThan(1.5);
      ch.state.speed = 3.2; ch.state.walk = 1; ch.state.aim = 1;
      ch.update(1 / 60);
      const moving = new THREE.Box3().setFromObject(ch.root);
      expect(moving.min.toArray().every(Number.isFinite)).toBe(true);
      expect(moving.max.toArray().every(Number.isFinite)).toBe(true);
    });
  }
  it('retains FRONTLINE soldier scale when the shared pose updates', () => {
    const rig = makeUnit('marine', 0);
    expect(rig.ch).toBeDefined();
    const ch = rig.ch!;
    ch.state.speed = 3; ch.state.walk = 1;
    ch.update(1 / 60);
    expect(ch.root.scale.x).toBeCloseTo(0.5);
    expect(ch.root.scale.y).toBeCloseTo(0.5);
  });
  it('shares baked geometry but keeps individual skeletons', () => {
    const a = makeProceduralMilitary('guard', look), b = makeProceduralMilitary('guard', look);
    const meshes = (root: THREE.Object3D): THREE.Mesh[] => {
      const result: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh) result.push(o); }); return result;
    };
    expect(a.root).not.toBe(b.root);
    expect(meshes(a.root)[0].geometry).toBe(meshes(b.root)[0].geometry);
    a.state.dead = 1; a.update(1 / 60); b.update(1 / 60);
    expect(a.root.rotation.z).not.toBe(b.root.rotation.z);
  });
  it('disposes a removed vehicle model but retains shared infantry geometry', () => {
    const rig = makeUnit('marine', 0), tank = makeUnit('tank', 0);
    let shared = 0, owned = 0;
    rig.ch!.root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => shared++); });
    tank.root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => owned++); });
    releaseModelGeometry(tank.root); releaseModelGeometry(rig.root);
    expect(owned).toBeGreaterThan(0);
    expect(shared).toBe(0);
  });
  it('releases all building and mineral model geometry without releasing shared materials', () => {
    const root = new THREE.Group(); root.add(makeBuilding('hq', 0).root, makeCrystals(3));
    let geometry = 0, material = 0, meshes = 0;
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return; meshes++;
      o.geometry.addEventListener('dispose', () => geometry++);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.addEventListener('dispose', () => material++);
    });
    releaseModelGeometry(root);
    expect(geometry).toBe(meshes);
    expect(material).toBe(0);
  });
});
