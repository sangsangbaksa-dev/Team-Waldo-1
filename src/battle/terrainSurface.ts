import * as THREE from 'three';
import { BATTLEFIELD_FEATURES } from './battlefieldLayout';
import { MAP_HALF_SIZE, type War } from './war';

const noise = (x: number, y: number) => {
  const n = Math.imul(x + 193, 374761393) ^ Math.imul(y + 719, 668265263);
  return ((Math.imul(n ^ (n >>> 13), 1274126177) ^ n) >>> 0) / 4294967295;
};

/** Local, deterministic textures: no downloads, canvas, or per-frame allocations. */
export function createTerrainSurface(parent: THREE.Group, war: War) {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fine = noise(x, y), broad = noise(Math.floor(x / 8), Math.floor(y / 8));
    const value = 224 + broad * 18 + fine * 12 - (fine < .045 ? 28 : 0);
    const index = (y * size + x) * 4;
    pixels.set([value, value, value - 5, 255], index);
  }
  const ground = new THREE.DataTexture(pixels, size, size);
  ground.colorSpace = THREE.SRGBColorSpace;
  ground.wrapS = ground.wrapT = THREE.RepeatWrapping;
  ground.repeat.set(MAP_HALF_SIZE * 2 / 16, MAP_HALF_SIZE * 2 / 16);
  ground.magFilter = THREE.LinearFilter;
  ground.minFilter = THREE.LinearMipmapLinearFilter;
  ground.generateMipmaps = true; ground.anisotropy = 4; ground.needsUpdate = true;

  // A distant, low-cost skyline gives the ground-level camera a sense of scale.
  // The ridge stays beyond the playable map and does not affect navigation.
  const ridge = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),
    new THREE.MeshStandardMaterial({ color: 0x788b81, roughness: 1, flatShading: true }), 48);
  ridge.name = 'Distant mountain skyline';
  const mountain = new THREE.Object3D(), tint = new THREE.Color();
  for (let i = 0; i < 48; i++) {
    const angle = i / 48 * Math.PI * 2, distance = 354 + noise(i, 2) * 58;
    const height = 32 + noise(i, 4) * 55;
    mountain.position.set(Math.sin(angle) * distance, height * .5 - 12, Math.cos(angle) * distance);
    mountain.rotation.y = angle; mountain.scale.set(26 + noise(i, 6) * 28, height, 24 + noise(i, 8) * 30);
    mountain.updateMatrix(); ridge.setMatrixAt(i, mountain.matrix);
    ridge.setColorAt(i, tint.setHSL(.36 + noise(i, 10) * .05, .08, .6 + noise(i, 12) * .12));
  }
  ridge.instanceMatrix.needsUpdate = true;
  if (ridge.instanceColor) ridge.instanceColor.needsUpdate = true;
  parent.add(ridge);

  const shadowSize = 64, shadowPixels = new Uint8Array(shadowSize * shadowSize * 4);
  for (let y = 0; y < shadowSize; y++) for (let x = 0; x < shadowSize; x++) {
    const radius = Math.hypot((x + .5) / shadowSize * 2 - 1, (y + .5) / shadowSize * 2 - 1);
    const alpha = Math.pow(Math.max(0, 1 - radius), 1.6) * 125;
    shadowPixels.set([8, 18, 22, alpha], (y * shadowSize + x) * 4);
  }
  const shadow = new THREE.DataTexture(shadowPixels, shadowSize, shadowSize);
  shadow.magFilter = shadow.minFilter = THREE.LinearFilter; shadow.needsUpdate = true;
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false, toneMapped: false });
  const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const features = BATTLEFIELD_FEATURES.filter(f => f.radius > 0 || f.kind === 'pine');
  const scenery = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, features.length + war.factions.length + war.outposts.length);
  scenery.name = 'Soft contact shadows / scenery'; scenery.frustumCulled = false;
  const dummy = new THREE.Object3D();
  let index = 0;
  const stamp = (x: number, z: number, width: number, length: number) => {
    dummy.position.set(x, .1, z); dummy.scale.set(width, 1, length); dummy.updateMatrix();
    scenery.setMatrixAt(index++, dummy.matrix);
  };
  for (const f of features) stamp(f.x, f.z, Math.max(5, f.radius * 2.9), Math.max(5, f.radius * 2.5));
  for (const f of war.factions) stamp(f.x, f.z, 39, 36);
  for (const p of war.outposts) stamp(p.x, p.z, 19, 19);
  scenery.instanceMatrix.needsUpdate = true; parent.add(scenery);

  const army = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, 1600);
  army.name = 'Soft contact shadows / soldiers'; army.frustumCulled = false;
  army.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parent.add(army);
  const update = () => {
    let count = 0;
    for (const unit of war.units) {
      if (unit.hp <= 0 || !war.factions[unit.owner].alive) continue;
      const radius = unit.kind === 'cavalry' ? 4.5 : unit.kind === 'guardian' ? 3.5 : 2.9;
      dummy.position.set(unit.x, .12, unit.z); dummy.scale.set(radius, 1, radius);
      dummy.updateMatrix(); army.setMatrixAt(count++, dummy.matrix);
    }
    army.count = count; army.instanceMatrix.needsUpdate = true;
  };
  update();
  return { ground, update, dispose: () => { ground.dispose(); shadow.dispose(); } };
}

/** A dusk-to-daylight sky with a soft sun, visible from the on-foot camera. */
export function createBattleSky(): THREE.DataTexture {
  const width = 512, height = 256, pixels = new Uint8Array(width * height * 4);
  const zenith = new THREE.Color('#456f8c'), horizon = new THREE.Color('#bdc5b4');
  const below = new THREE.Color('#566c64'), sunlight = new THREE.Color('#ffe5b8');
  const color = new THREE.Color();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const latitude = 1 - y / (height - 1);
    if (latitude < .5) color.copy(zenith).lerp(horizon, Math.pow(latitude * 2, 1.6));
    else color.copy(horizon).lerp(below, Math.min(1, (latitude - .5) * 3));
    const dx = Math.min(Math.abs(x / width - .34), 1 - Math.abs(x / width - .34));
    const dy = latitude - .32;
    const glow = Math.exp(-(dx * dx + dy * dy) * 110) * .45;
    color.lerp(sunlight, glow).convertLinearToSRGB();
    pixels.set([color.r * 255, color.g * 255, color.b * 255, 255], (y * width + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
