import * as THREE from 'three';

type Surface = 'ground' | 'tracks' | 'shadow';

/** Small repeatable surfaces generated locally; no image downloads or model assets. */
export function createSurfaceTexture(surface: Surface): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (surface === 'shadow') {
    const gradient = ctx.createRadialGradient(128, 128, 24, 128, 128, 124);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(.45, '#bbb');
    gradient.addColorStop(1, '#000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  } else {
    let seed = 738139;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    ctx.fillStyle = surface === 'ground' ? '#c5c5c5' : '#b3b3b3';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6500; i++) {
      const shade = 105 + Math.floor(random() * 120);
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${.08 + random() * .22})`;
      const size = .5 + random() * (surface === 'ground' ? 3 : 2);
      ctx.fillRect(random() * 256, random() * 256, size, size * .65);
    }
    if (surface === 'tracks') {
      ctx.fillStyle = '#42424235';
      for (const x of [47, 181]) {
        ctx.fillRect(x, 0, 28, 256);
        for (let z = 0; z < 256; z += 16) {
          ctx.fillStyle = '#32323238';
          ctx.fillRect(x - 3, z, 34, 5);
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = surface === 'shadow' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = surface === 'shadow' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
