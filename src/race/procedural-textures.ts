// SPEED RUSH — cache only CPU-side procedural artwork between scene restarts.
// The WebGL contexts are replaced on restart, so GPU THREE.Textures MUST be
// unique per RaceView and are disposed with their owning scene.
import * as THREE from 'three';
import type { Theme } from './maps';

type Surface = 'ground' | 'asphalt';
type CachedCanvases = Partial<Record<Surface, HTMLCanvasElement>>;
const cachedThemes = new Map<Theme, CachedCanvases>();
const MAX_THEMES = 2;

export function cachedRoadTexture(
  theme: Theme,
  surface: Surface,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  let canvases = cachedThemes.get(theme);
  if (canvases) {
    cachedThemes.delete(theme);
    cachedThemes.set(theme, canvases);
  } else {
    canvases = {};
    cachedThemes.set(theme, canvases);
    if (cachedThemes.size > MAX_THEMES) {
      const oldest = cachedThemes.keys().next().value;
      if (oldest) cachedThemes.delete(oldest);
    }
  }
  let canvas = canvases[surface];
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (context) draw(context);
    canvases[surface] = canvas;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
