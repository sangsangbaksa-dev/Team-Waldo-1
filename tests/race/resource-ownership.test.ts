import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene, Texture } from 'three';
import { disposeOwnedTree, markBorrowedTree } from '../../src/race/resource-ownership';

describe('SPEED RUSH WebGL ownership', () => {
  it('does not dispose materials, textures or geometry borrowed from other games', () => {
    const sharedTexture = new Texture();
    const sharedMaterial = new MeshBasicMaterial({ map: sharedTexture });
    const sharedGeometry = new BoxGeometry(1, 1, 1);
    const model = new Group(); model.add(new Mesh(sharedGeometry, sharedMaterial));
    const borrowed = new Set<object>();
    markBorrowedTree(model, borrowed);
    const scene = new Scene(); scene.add(model);

    const gDispose = vi.spyOn(sharedGeometry, 'dispose');
    const mDispose = vi.spyOn(sharedMaterial, 'dispose');
    const tDispose = vi.spyOn(sharedTexture, 'dispose');
    disposeOwnedTree(scene, [], borrowed);
    expect(gDispose).not.toHaveBeenCalled();
    expect(mDispose).not.toHaveBeenCalled();
    expect(tDispose).not.toHaveBeenCalled();
  });

  it('disposes race-only visual materials but preserves shared car geometry', () => {
    const sharedGeometry = new BoxGeometry(1, 1, 1);
    const borrowed = new Set<object>([sharedGeometry]);
    const ownedTexture = new Texture();
    const ownedMaterial = new MeshBasicMaterial({ map: ownedTexture });
    const scene = new Scene(); scene.add(new Mesh(sharedGeometry, ownedMaterial));
    const geoDispose = vi.spyOn(sharedGeometry, 'dispose');
    const matDispose = vi.spyOn(ownedMaterial, 'dispose');
    const texDispose = vi.spyOn(ownedTexture, 'dispose');

    disposeOwnedTree(scene, [ownedMaterial, ownedTexture], borrowed);
    expect(geoDispose).not.toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalledTimes(1);
    expect(texDispose).toHaveBeenCalledTimes(1);
  });

  it('disposes race-owned geometry and shared instance materials only once', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const scene = new Scene();
    scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const geoDispose = vi.spyOn(geometry, 'dispose');
    const matDispose = vi.spyOn(material, 'dispose');
    disposeOwnedTree(scene, [geometry, material], new Set());
    expect(geoDispose).toHaveBeenCalledTimes(1);
    expect(matDispose).toHaveBeenCalledTimes(1);
  });
});
