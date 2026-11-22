import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ActorBatches } from '../../src/outlaw/actorbatch';

describe('actor render batches', () => {
  it('preserves transforms and colors across growth and drops stale instances', () => {
    const parent = new THREE.Group(), batches = new ActorBatches(parent);
    const g = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
    for (let i = 0; i < 12; i++) batches.add(g, material, new THREE.Matrix4().makeTranslation(i, 0, 0), true, new THREE.Color(i / 16, 0, 0));
    batches.end();
    const mesh = parent.children[0] as THREE.InstancedMesh;
    expect(parent.children).toHaveLength(1);
    expect(mesh.count).toBe(12);
    const transform = new THREE.Matrix4(), tint = new THREE.Color();
    mesh.getMatrixAt(7, transform);
    mesh.getColorAt(7, tint);
    expect(transform.elements[12]).toBe(7);
    expect(tint.r).toBe(7 / 16);
    batches.begin();
    batches.end();
    expect(mesh.visible).toBe(false);
    batches.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it('keeps moving wheels separate up close and bakes their local offset at distance', () => {
    const root = new THREE.Group(), body = new THREE.Group(), batches = new ActorBatches(root);
    root.position.x = 50;
    root.add(body);
    const g = new THREE.BoxGeometry(), m = new THREE.MeshStandardMaterial();
    const shell = new THREE.Mesh(g, m), wheel = new THREE.Mesh(g, m);
    wheel.position.x = 2;
    body.add(shell, wheel);
    const near = batches.carParts('test/near', body, [wheel]);
    const far = batches.carParts('test/far', body, []);
    expect(near.sources).toEqual([shell]);
    expect(far.parts).toHaveLength(1);
    far.parts[0].geometry.computeBoundingBox();
    expect(far.parts[0].geometry.boundingBox!.max.x).toBe(2.5);
    expect(batches.carParts('test/far', body, []).parts[0].geometry).toBe(far.parts[0].geometry);
    batches.dispose();
  });
});
