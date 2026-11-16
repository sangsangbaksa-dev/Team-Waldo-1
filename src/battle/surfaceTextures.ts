import * as THREE from 'three';

/** Small, reproducible textures; no network requests or canvas readbacks. */
export function createSurfaceTextures() {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  let seed = 73921;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const grain = random(), fleck = grain > .94 ? -38 : grain * 26;
    // Periodic broad variations meet at tile boundaries.
    const patch = Math.sin(x / size * Math.PI * 6) * Math.cos(y / size * Math.PI * 4) * 10;
    pixels[i] = 190 + fleck + patch;
    pixels[i + 1] = 194 + fleck + patch;
    pixels[i + 2] = 170 + fleck + patch;
    pixels[i + 3] = 255;
  }
  const ground = new THREE.DataTexture(pixels, size, size);
  ground.name = 'Grass, gravel and earth grain';
  ground.colorSpace = THREE.SRGBColorSpace;
  ground.wrapS = ground.wrapT = THREE.RepeatWrapping;
  ground.repeat.set(52, 52);
  ground.magFilter = THREE.LinearFilter;
  ground.minFilter = THREE.LinearMipmapLinearFilter;
  ground.generateMipmaps = true;
  ground.anisotropy = 4;
  ground.needsUpdate = true;
  const relief = ground.clone();
  relief.name = 'Fine terrain relief';
  relief.colorSpace = THREE.NoColorSpace;
  relief.needsUpdate = true;
  const road = ground.clone();
  road.name = 'Worn dirt road'; road.repeat.set(1, 12); road.needsUpdate = true;

  const shadowPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4, r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
    shadowPixels[i] = 23; shadowPixels[i + 1] = 30; shadowPixels[i + 2] = 24;
    shadowPixels[i + 3] = Math.round(Math.pow(Math.max(0, 1 - r), 1.65) * 145);
  }
  const shadow = new THREE.DataTexture(shadowPixels, 64, 64);
  shadow.name = 'Soft ground contact';
  shadow.colorSpace = THREE.SRGBColorSpace;
  shadow.magFilter = THREE.LinearFilter;
  shadow.needsUpdate = true;
  return { ground, relief, road, shadow, dispose() { ground.dispose(); relief.dispose(); road.dispose(); shadow.dispose(); } };
}
