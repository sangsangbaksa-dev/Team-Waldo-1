import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { pruneUnusedSignMaterials } from '../../src/tycoon/scene/city';

describe('HUSTLE dynamic storefront sign resource lifecycle', () => {
  it('reclaims obsolete sign canvas textures without disposing reused materials', () => {
    const usedTex = new THREE.Texture(), oldTex = new THREE.Texture();
    const used = new THREE.MeshBasicMaterial({ map: usedTex }), old = new THREE.MeshBasicMaterial({ map: oldTex });
    const cache = new Map([['used', used], ['old', old]]);
    const root = new THREE.Group(), geo = new THREE.BoxGeometry();
    root.add(new THREE.Mesh(geo, used));
    const unusedDispose = vi.spyOn(old, 'dispose'), unusedTexDispose = vi.spyOn(oldTex, 'dispose');
    const activeDispose = vi.spyOn(used, 'dispose'), activeTexDispose = vi.spyOn(usedTex, 'dispose');
    expect(pruneUnusedSignMaterials(cache, root)).toBe(1);
    expect(cache.has('used')).toBe(true); expect(cache.has('old')).toBe(false);
    expect(unusedDispose).toHaveBeenCalledTimes(1); expect(unusedTexDispose).toHaveBeenCalledTimes(1);
    expect(activeDispose).not.toHaveBeenCalled(); expect(activeTexDispose).not.toHaveBeenCalled();
    expect(pruneUnusedSignMaterials(cache, root)).toBe(0);
    root.clear();
    expect(pruneUnusedSignMaterials(cache, root)).toBe(1);
    expect(activeDispose).toHaveBeenCalledTimes(1); expect(activeTexDispose).toHaveBeenCalledTimes(1);
    geo.dispose();
  });
  it('handles multiple blocks sharing the same sign material', () => {
    const mat = new THREE.MeshBasicMaterial(), cache = new Map([['a', mat]]);
    const root = new THREE.Group(), geo = new THREE.PlaneGeometry();
    const block1 = new THREE.Group(), block2 = new THREE.Group();
    block1.add(new THREE.Mesh(geo, mat)); block2.add(new THREE.Mesh(geo, mat)); root.add(block1, block2);
    block1.clear(); expect(pruneUnusedSignMaterials(cache, root)).toBe(0);
    block2.clear(); expect(pruneUnusedSignMaterials(cache, root)).toBe(1);
    geo.dispose();
  });
});
