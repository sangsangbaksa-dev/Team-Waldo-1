import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CityView } from '../../src/tycoon/scene/city';

describe('HUSTLE Three.js resource cleanup', () => {
  it('disposes unmounted cached shop signs and each shared GPU resource once', () => {
    // Skip DOM/canvas initialization: this test exercises teardown exclusively.
    const city = Object.create(CityView.prototype) as CityView;
    const internal = city as unknown as Record<string, unknown>;
    const group = new THREE.Group();
    const texture = new THREE.Texture(), orphanSignTexture = new THREE.Texture(), constructionTexture = new THREE.Texture(), geo = new THREE.BoxGeometry();
    const meshMat = new THREE.MeshStandardMaterial({ map: texture });
    const orphanSign = new THREE.MeshBasicMaterial({ map: orphanSignTexture });
    const constructionSign = new THREE.MeshBasicMaterial({ map: constructionTexture });
    const mats = { slum: meshMat, shop: meshMat, office: meshMat, glass: meshMat };
    let textureCount = 0, orphanCount = 0, constructionCount = 0, geoCount = 0, materialCount = 0;
    texture.addEventListener('dispose', () => { textureCount++; });
    orphanSignTexture.addEventListener('dispose', () => { orphanCount++; });
    constructionTexture.addEventListener('dispose', () => { constructionCount++; });
    geo.addEventListener('dispose', () => { geoCount++; });
    meshMat.addEventListener('dispose', () => { materialCount++; });
    group.add(new THREE.Mesh(geo, meshMat), new THREE.Mesh(geo, meshMat));

    Object.assign(internal, {
      disposed: false, street: { dispose() {} }, group, views: new Map([['block', { disposables: [geo], ownedMaterials: [meshMat] }]]),
      signMats: new Map([['retired sign', orphanSign]]), constructionSign,
      facade: mats, roofMat: meshMat, detailMat: meshMat, glowMat: meshMat,
      walkMat: meshMat, dirtMat: meshMat, grassMat: meshMat, roadMat: meshMat,
      ringTex: texture, beacons: new Map(), construction: new Set(),
      spotViews: new Map(), blockLookup: new Map(), orderedBlocks: [],
    });

    city.dispose();
    expect([textureCount, orphanCount, constructionCount, geoCount, materialCount]).toEqual([1, 1, 1, 1, 1]);
    expect(group.children).toHaveLength(0);
    expect((internal.signMats as Map<string, unknown>).size).toBe(0);
    city.dispose();
    expect([textureCount, orphanCount, constructionCount, geoCount, materialCount]).toEqual([1, 1, 1, 1, 1]);
  });
  it('releases unique crane materials at block rebuild without disposing shared terrain', () => {
    const city = Object.create(CityView.prototype) as CityView;
    const internal = city as unknown as Record<string, unknown>;
    const owned = new THREE.MeshStandardMaterial({ color: 0xc3ab88 });
    const retiredGeometry = new THREE.BoxGeometry();
    const view = {
      group: new THREE.Group(),
      bld: new THREE.Group(),
      disposables: [retiredGeometry],
      ownedMaterials: [owned],
      crane: new THREE.Group(),
    };
    let disposeCount = 0;
    owned.addEventListener('dispose', () => { disposeCount++; });
    internal.beacons = new Map();
    internal.construction = new Set([view]);
    const clear = Reflect.get(city, 'clearBlock') as (v: typeof view) => void;
    clear.call(city, view);
    expect(disposeCount).toBe(1);
    expect(view.disposables).toEqual([]);
    expect(view.ownedMaterials).toEqual([]);
    expect(view.group.children).toHaveLength(0);
    expect((internal.construction as Set<unknown>).has(view)).toBe(false);
  });

});
