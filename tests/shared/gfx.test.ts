import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { standardize } from '../../src/shared/gfx';

describe('standardize', () => {
  it('Lambert 를 Standard 로 바꾸고 색·정점색·발광을 유지하며 같은 원본은 한 재질로 모읍니다', () => {
    const lam = new THREE.MeshLambertMaterial({ color: 0x336699, vertexColors: true, emissive: 0x112233 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(), lam), b = new THREE.Mesh(new THREE.BoxGeometry(), lam), root = new THREE.Group(); root.add(a, b);
    standardize(root, { roughness: 0.5 });
    const m = a.material as unknown as THREE.MeshStandardMaterial;
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.color.getHex()).toBe(0x336699); expect(m.vertexColors).toBe(true); expect(m.emissive.getHex()).toBe(0x112233); expect(m.roughness).toBe(0.5);
    expect(b.material).toBe(a.material);
  });
  it('이미 Standard·Basic 인 재질은 그대로 둡니다', () => {
    const std = new THREE.MeshStandardMaterial(), basic = new THREE.MeshBasicMaterial();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), std), b = new THREE.Mesh(new THREE.BoxGeometry(), basic), root = new THREE.Group(); root.add(a, b);
    standardize(root); expect(a.material).toBe(std); expect(b.material).toBe(basic);
  });
});
