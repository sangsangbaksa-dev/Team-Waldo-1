import type * as Three from "three";
export interface HidingSpotKit {
  geometry: Three.BoxGeometry;
  dark: Three.MeshStandardMaterial;
  mid: Three.MeshStandardMaterial;
  cloth: Three.MeshStandardMaterial;
}
export function createHidingSpotKit(THREE: typeof Three): HidingSpotKit;
export function buildHidingSpot(THREE: typeof Three, root: Three.Group, kind: number, kit: HidingSpotKit): void;
export function buildEnvironment(THREE: typeof Three, scene: Three.Scene, map: string[], tile: number, chapter: number): Three.Group;
