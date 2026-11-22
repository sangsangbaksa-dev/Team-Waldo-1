import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { disposeSceneResources } from './render-cleanup';

describe('scene cleanup across repeated game rounds', () => {
  it('disposes reused mesh geometry and materials exactly once', () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    let releasedGeometry = 0, releasedMaterial = 0;
    geometry.addEventListener('dispose', () => releasedGeometry++);
    material.addEventListener('dispose', () => releasedMaterial++);
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    disposeSceneResources(scene);
    expect(releasedGeometry).toBe(1);
    expect(releasedMaterial).toBe(1);
  });
  it('preserves a cached material while disposing temporary meshes', () => {
    const scene = new THREE.Scene();
    const cached = new THREE.MeshStandardMaterial({ color: 0x554433 });
    const temporary = new THREE.BoxGeometry();
    let matDisposed = 0, geoDisposed = 0;
    cached.addEventListener('dispose', () => matDisposed++);
    temporary.addEventListener('dispose', () => geoDisposed++);
    scene.add(new THREE.Mesh(temporary, cached));
    disposeSceneResources(scene, { keepMaterial: material => material === cached });
    expect(matDisposed).toBe(0);
    expect(geoDisposed).toBe(1);
  });
  it('does not dispose the global Sprite geometry', () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    const geometry = sprite.geometry;
    let geoDisposed = 0, matDisposed = 0;
    geometry.addEventListener('dispose', () => geoDisposed++);
    sprite.material.addEventListener('dispose', () => matDisposed++);
    const scene = new THREE.Scene(); scene.add(sprite);
    disposeSceneResources(scene);
    expect(geoDisposed).toBe(0);
    expect(matDisposed).toBe(1);
  });
  it('disposes line and particle geometry, not only Mesh geometry', () => {
    const scene = new THREE.Scene();
    const points = new THREE.BufferGeometry(), line = new THREE.BufferGeometry();
    let n = 0;
    points.addEventListener('dispose', () => n++);
    line.addEventListener('dispose', () => n++);
    scene.add(new THREE.Points(points, new THREE.PointsMaterial()), new THREE.LineSegments(line, new THREE.LineBasicMaterial()));
    disposeSceneResources(scene);
    expect(n).toBe(2);
  });
  it('disposes material textures and separately tracked atlas only once', () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const shader = new THREE.ShaderMaterial({ uniforms: { atlas: { value: texture } } });
    const object = new THREE.Mesh(new THREE.PlaneGeometry(), shader);
    let disposed = 0; texture.addEventListener('dispose', () => disposed++);
    scene.add(object);
    disposeSceneResources(scene, { extraTextures: [texture] });
    expect(disposed).toBe(1);
  });
});
