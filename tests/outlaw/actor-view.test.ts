import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Sim } from '../../src/outlaw/sim';
import { ActorView } from '../../src/outlaw/actorview';

describe('OUTLAW vehicle view lifecycle', () => {
  it('replaces only a repainted car view while preserving the simulation vehicle', () => {
    const sim = new Sim(7);
    const v = sim.spawnVehicle('sedan', sim.player.x + 4, sim.player.z, 0, { color: 0xaabbcc });
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    camera.position.set(v.x, 2, v.z + 12); camera.updateMatrixWorld(true);
    const view = new ActorView(scene, sim, null, 'low');
    view.update(.016, camera, 14);
    const original = scene.getObjectByName(`vehicle-${v.id}`);
    expect(original).toBeDefined();
    view.update(.016, camera, 14);
    expect(scene.getObjectByName(`vehicle-${v.id}`)).toBe(original);
    v.color = 0x2f80ed;
    view.update(.016, camera, 14);
    const replacement = scene.getObjectByName(`vehicle-${v.id}`);
    expect(replacement).toBeDefined(); expect(replacement).not.toBe(original);
    const paint: number[] = [];
    replacement!.traverse(o => { if (o instanceof THREE.Mesh) {
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if ('color' in mat && mat.color instanceof THREE.Color) paint.push(mat.color.getHex());
      }
    } });
    expect(paint).toContain(v.color);
    expect(original!.parent).toBeNull();
    expect(sim.vehicle(v.id)).toBe(v);
    view.dispose();
  });
});

it('does not create invisible 3D rigs for distant gunshots', () => {
  const sim = new Sim(31);
  const far = sim.spawnPed('gang', sim.player.x + 400, sim.player.z, { keep: true });
  const view = new ActorView(new THREE.Scene(), sim, null, 'low');
  const rigs = (view as unknown as { rigs: Map<number, unknown> }).rigs;
  const start = rigs.size;
  view.handle([{ t: 'shot', id: far.id, weapon: 'rifle',
    ox: far.x, oy: far.y + 1.3, oz: far.z, ex: far.x + 15, ey: far.y + 1.3, ez: far.z }]);
  expect(rigs.has(far.id)).toBe(false);
  expect(rigs.size).toBe(start);
  view.dispose();
});

it('shares the marker beam vertex geometry across visible POIs', () => {
  const sim = new Sim(11), camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene();
  camera.position.set(sim.player.x, sim.player.y + 5, sim.player.z);
  const view = new ActorView(scene, sim, null, 'low');
  const firstPoi = sim.map.pois[0]!;
  sim.mission.markers = [
    { x: firstPoi.x, z: firstPoi.z, r: 2, color: 0xffaa33, label: 'first', blip: true, kind: 'goal' },
    { x: firstPoi.x + 5, z: firstPoi.z + 5, r: 2, color: 0x33ccff, label: 'second', blip: true, kind: 'goal' },
  ];
  view.update(.016, camera, 14);
  const beacons = (view as unknown as {beacons: Array<{beam: THREE.Mesh}>}).beacons;
  expect(beacons.length).toBeGreaterThanOrEqual(2);
  expect(beacons[0].beam.geometry).toBe(beacons[1].beam.geometry);
  view.dispose();
});

it('ignores distant death decals so nearby firefights keep their finite decal budget', () => {
  const sim = new Sim(83);
  const far = sim.spawnPed('gang', sim.player.x + 500, sim.player.z);
  const view = new ActorView(new THREE.Scene(), sim, null, 'low');
  const pool = (view as unknown as { fx: Array<{ kind: string; life: number }> }).fx;
  view.handle([{ t:'death', id:far.id, by:sim.player.id, weapon:'fist' }]);
  expect(pool.some(f=>f.kind==='pool'&&f.life>0)).toBe(false);
  const near = sim.spawnPed('gang', sim.player.x + 4, sim.player.z);
  view.handle([{ t:'death', id:near.id, by:sim.player.id, weapon:'fist' }]);
  expect(pool.some(f=>f.kind==='pool'&&f.life>0)).toBe(true);
  view.dispose();
});
