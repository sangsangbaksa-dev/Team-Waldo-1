import * as THREE from 'three';
import { clamp, randomSource } from '../domain/math.js';
import { HALF_MAP, TERRAIN_STEP, type Cover, type World } from '../domain/world.js';

export const SUN = new THREE.Vector3(-0.48, 0.27, -0.83).normalize();
export const HAZE = new THREE.Color('#a39d83');

function gritTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  const rng = randomSource(6205);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * Math.PI * 2 / size, v = y * Math.PI * 2 / size;
      const layer = Math.sin(4 * u + 5 * v + Math.sin(3 * v) * 2.3) * 11
        + Math.sin(11 * u - 7 * v) * Math.sin(6 * v + 4 * u) * 14
        + Math.cos(23 * u + 17 * v) * 8;
      const value = clamp(190 + layer + (rng() - 0.5) * 66, 25, 255);
      const pixel = (y * size + x) * 4;
      image.data[pixel] = value;
      image.data[pixel + 1] = value - 3;
      image.data[pixel + 2] = value - 7;
      image.data[pixel + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function terrain(world: World, grit: THREE.Texture): THREE.Mesh {
  const count = HALF_MAP * 2 / TERRAIN_STEP + 1;
  const vertices: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const soil = new THREE.Color('#706148'), burnt = new THREE.Color('#413d2e');
  const dust = new THREE.Color('#9d875e'), stone = new THREE.Color('#777970'), road = new THREE.Color('#85765e');
  const color = new THREE.Color();
  for (let iz = 0; iz < count; iz++) {
    for (let ix = 0; ix < count; ix++) {
      const x = ix * TERRAIN_STEP - HALF_MAP, z = iz * TERRAIN_STEP - HALF_MAP;
      const y = world.heightAt(x, z);
      vertices.push(x, y, z);
      uvs.push(x / 16, z / 16);
      const grain = Math.sin(x * 0.039 + z * 0.026) * 0.23 + Math.sin(z * 0.096 - x * 0.052) * 0.17
        + Math.sin(x * 0.47 + z * 0.33) * 0.08 + 0.49;
      const slope = Math.hypot(world.heightAt(x + 3, z) - world.heightAt(x - 3, z),
        world.heightAt(x, z + 3) - world.heightAt(x, z - 3)) / 6;
      const lane = Math.abs(x - 83 - Math.sin(z * 0.009) * 32);
      color.copy(soil).lerp(dust, clamp(grain, 0, 1)).lerp(burnt, clamp((0.6 - grain) * 0.6 - y * 0.012, 0, 0.63))
        .lerp(stone, clamp((slope - 0.14) * 1.7 + (y - 21) * 0.021, 0, 0.91))
        .lerp(road, Math.exp(-((lane / 5.4) ** 2)) * 0.59);
      colors.push(color.r, color.g, color.b);
      if (ix + 1 < count && iz + 1 < count) {
        const a = iz * count + ix, b = a + 1, c = a + count, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, map: grit, bumpMap: grit, bumpScale: 0.25, roughness: 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

const skyVertex = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFragment = `
uniform vec3 sun;
uniform vec3 haze;
uniform float clock;
varying vec3 vDir;
float hash(vec2 v) {
  return fract(sin(dot(v, vec2(127.1,311.7))) * 43758.5453);
}
float noise(vec2 v) {
  vec2 i = floor(v), f = fract(v);
  vec2 w = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),w.x),mix(hash(i+vec2(0,1)),hash(i+1.0),w.x),w.y);
}
float clouds(vec2 p) {
  float n = 0.0, a = 0.55;
  mat2 rot = mat2(0.82, -0.58, 0.58, 0.82);
  for (int i=0; i<5; i++) {
    n += a * noise(p);
    p = rot * p * 2.03 + 9.0;
    a *= 0.49;
  }
  return n;
}
void main() {
  vec3 d = normalize(vDir);
  float high = max(0.0, d.y);
  float sunAngle = max(0.0, dot(d, sun));
  vec3 sky = mix(haze, vec3(0.165, 0.242, 0.288), smoothstep(0., .83, high));
  sky += vec3(.42,.26,.11) * pow(sunAngle,12.0) * smoothstep(-.08,.24,d.y);
  vec2 plane = d.xz / max(0.09, high+0.13);
  vec2 uv = plane * vec2(1.6,2.3) + vec2(clock * 0.005, 2.);
  float n = clouds(uv);
  float layer = smoothstep(.39,.72,n) * smoothstep(.018,.21,high);
  vec3 shade = mix(vec3(.14,.157,.149),vec3(.55,.48,.36),pow(sunAngle,4.));
  shade += pow(sunAngle,24.) * vec3(.48,.30,.13) * (1.5-layer);
  sky = mix(sky, shade, layer * .9);
  sky += vec3(1.0,.73,.39) * pow(sunAngle,3000.) * (1.0-layer * .91) * 3.1;
  sky = mix(haze, sky, smoothstep(-.08,.035,d.y));
  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const box = new THREE.BoxGeometry(1, 1, 1);
const bag = new THREE.SphereGeometry(0.5, 8, 5);
const trunk = new THREE.CylinderGeometry(0.28, 0.57, 1, 6);
const axle = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const stone = new THREE.IcosahedronGeometry(0.65, 0);
const block = new THREE.BoxGeometry(1, 1, 1);
const chipped = block.attributes.position;
for (let i = 0; i < chipped.count; i++) {
  if (chipped.getY(i) <= 0) continue;
  const noise = Math.sin(chipped.getX(i) * 7 + chipped.getZ(i) * 8);
  chipped.setY(i, 0.48 - noise * 0.065);
}
block.computeVertexNormals();

interface Piece { matrix: THREE.Matrix4; color: THREE.Color }
interface Batch { geometry: THREE.BufferGeometry; pieces: Piece[]; shadows: boolean }

function populate(world: World, grit: THREE.Texture): THREE.Group {
  const result = new THREE.Group();
  const batches = new Map<THREE.BufferGeometry, Batch>();
  const temp = new THREE.Object3D();
  const tint = new THREE.Color();
  const rng = randomSource(15090);
  const up = new THREE.Vector3(0, 1, 0);

  function piece(geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number,
    w: number, h: number, d: number, yaw = 0, pitch = 0, roll = 0, shadows = true): void {
    const batch = batches.get(geometry) ?? { geometry, pieces: [], shadows };
    temp.position.set(x, y, z);
    temp.scale.set(w, h, d);
    temp.rotation.set(pitch, yaw, roll, 'YXZ');
    temp.updateMatrix();
    tint.set(color).multiplyScalar(0.8 + rng() * 0.37);
    batch.pieces.push({ matrix: temp.matrix.clone(), color: tint.clone() });
    batches.set(geometry, batch);
  }

  function branch(x: number, y: number, z: number, to: THREE.Vector3, width: number, color: string): void {
    temp.position.set(x, y, z).addScaledVector(to, 0.5);
    temp.scale.set(width, to.length(), width);
    temp.quaternion.setFromUnitVectors(up, to.clone().normalize());
    temp.updateMatrix();
    const batch = batches.get(trunk) ?? { geometry: trunk, pieces: [], shadows: true };
    batch.pieces.push({ matrix: temp.matrix.clone(), color: new THREE.Color(color).multiplyScalar(0.7 + rng() * 0.35) });
    batches.set(trunk, batch);
  }

  function itemParts(item: Cover): void {
    const { x, y, z, w, h, d, yaw, variant } = item;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const part = (geometry: THREE.BufferGeometry, color: string, ox: number, oy: number, oz: number,
      width: number, height: number, depth: number, tilt = 0, angle = 0, roll = 0) =>
      piece(geometry, color, x + ox * cos + oz * sin, y + oy, z - ox * sin + oz * cos,
        width, height, depth, yaw + angle, tilt, roll);

    switch (item.kind) {
      case 'rock':
        piece(stone, variant > 0.48 ? '#727065' : '#82765e', x, y, z, w * 0.89, h * 0.92, d * 0.86,
          yaw, (variant - 0.5) * 0.4, 0.08);
        break;
      case 'sandbag': {
        const rows = 4;
        const cols = Math.max(3, Math.round(w / 0.83));
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const dx = (col + 0.5 - cols / 2) * w / cols + (row % 2 ? 0.12 : -0.06);
            part(bag, row % 2 ? '#807758' : '#a39169', dx, (row + 0.47 - rows / 2) * h / rows, (row % 2 - 0.5) * 0.13,
              w / cols * 1.14, h / rows * 1.32, d * (1 - row * 0.045), 0, (rng() - 0.5) * 0.12);
          }
        }
        break;
      }
      case 'tree': {
        piece(trunk, '#463d30', x, y, z, w, h, d, yaw, (variant - 0.5) * 0.035, 0);
        for (let j = 0; j < 6; j++) {
          const angle = yaw + j * 2.4, start = y - h / 2 + h * (0.36 + j * 0.092);
          const reach = h * (0.12 + rng() * 0.17) * (1 - j * 0.07);
          const vector = new THREE.Vector3(Math.cos(angle) * reach, reach * (0.42 + rng() * 0.84), Math.sin(angle) * reach);
          branch(x, start, z, vector, w * (0.53 - j * 0.04), '#514737');
          branch(x + vector.x * 0.63, start + vector.y * 0.63, z + vector.z * 0.63,
            new THREE.Vector3(vector.x * 0.28, reach * 0.65, -vector.z * 0.22), w * 0.21, '#584a38');
        }
        break;
      }
      case 'wreck':
        part(box, '#353b34', 0, -h * 0.20, 0, w * 0.91, h * 0.43, d * 0.96);
        part(block, '#6a644b', 0, h * 0.1, d * 0.25, w * 0.84, h * 0.39, d * 0.43, -0.12);
        part(block, '#65533d', 0, h * 0.16, -d * 0.25, w * 0.87, h * 0.54, d * 0.45);
        part(box, '#191e1a', 0, h * 0.37, -d * 0.03, w * 0.75, h * 0.23, 0.055, -0.31);
        part(box, '#393d35', 0, -h * 0.06, d * 0.49, w, 0.19, 0.17, 0, 0.05);
        for (const side of [-1, 1]) {
          for (const wheel of [-0.34, 0.31]) {
            part(axle, '#292823', side * w * 0.42, -h * 0.32, d * wheel, 1.05, 0.55, 1.05, 0, 0, Math.PI / 2);
            part(axle, '#655341', side * w * 0.515, -h * 0.32, d * wheel, 0.48, 0.07, 0.48, 0, 0, Math.PI / 2);
          }
        }
        break;
      case 'plate':
        part(box, '#635b50', 0, 0, 0, w, h, d);
        break;
      default: {
        const brick = item.kind === 'brick';
        const tone = brick ? '#74604e' : '#858070';
        part(block, tone, 0, 0, 0, w, h, d);
        const long = w > d;
        const slots = Math.ceil(Math.max(w, d) / 2.7);
        for (let i = 0; i < slots; i++) {
          const a = ((i + 0.5) / slots - 0.5) * Math.max(w, d);
          const chip = 0.12 + rng() * 0.46;
          part(stone, '#938572', long ? a : (rng() - 0.5) * w * 0.65, h * 0.5 - 0.13, long ? (rng() - 0.5) * d : a,
            chip * 2.4, chip * 1.4, chip, rng() * 0.65, rng(), rng());
          const seam = 0.5 + rng() * 0.21;
          part(box, brick ? '#3f352c' : '#5a5348', long ? a : w * 0.502, h * (seam - 0.5), long ? d * 0.505 : a,
            long ? Math.min(1.6, w / slots * 0.62) : 0.019, brick ? 0.06 : 0.11,
            long ? 0.019 : Math.min(1.6, d / slots * 0.6), 0, 0, (rng() - 0.5) * 0.14);
          for (let j = 0; j < 4; j++) {
            const ox = long ? a + (rng() - 0.5) * 2.1 : (rng() > 0.5 ? 1 : -1) * (w / 2 + rng() * 1.8);
            const oz = long ? (rng() > 0.5 ? 1 : -1) * (d / 2 + rng() * 1.8) : a + (rng() - 0.5) * 2.1;
            const sx = x + ox * cos + oz * sin, sz = z - ox * sin + oz * cos;
            const size = 0.16 + rng() ** 2 * 0.69;
            piece(stone, '#796e5b', sx, world.heightAt(sx, sz) + size * 0.19, sz, size * 1.5, size, size * 1.2,
              rng() * 6.28, rng(), rng());
          }
        }
        break;
      }
    }
  }

  world.cover.forEach(itemParts);

  // Landmarks are visible above the surrounding ridges.
  for (const [x, z, height] of [[-4, -51, 17], [14, -53, 19], [122, -159, 21]]) {
    const y = world.heightAt(x, z);
    for (const radius of [-1, 1]) {
      piece(box, '#49463c', x + radius * 0.7, y + height / 2, z, 0.22, height, 0.22);
      for (let level = 2; level <= height; level += 3) {
        piece(box, '#6e6049', x, y + level, z, 1.6, 0.15, 0.21);
        piece(box, '#524b3e', x, y + level + 0.75, z, 0.10, 1.9, 0.14, 0, 0, radius * 0.8);
      }
    }
    if (x > 100) {
      piece(box, '#827250', x, y + height - 1, z, 6.2, 0.16, 0.21);
      piece(box, '#d19e60', x, y + height, z, 0.28, 0.36, 0.28);
    }
  }

  for (const batch of batches.values()) {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, map: grit });
    const mesh = new THREE.InstancedMesh(batch.geometry, material, batch.pieces.length);
    batch.pieces.forEach((p, i) => { mesh.setMatrixAt(i, p.matrix); mesh.setColorAt(i, p.color); });
    mesh.castShadow = batch.shadows;
    mesh.receiveShadow = true;
    result.add(mesh);
  }
  return result;
}

function scrub(world: World): THREE.Mesh {
  const rng = randomSource(42720);
  const vertices: number[] = [], colors: number[] = [];
  const straw = new THREE.Color('#a18c5c'), stem = new THREE.Color('#514a33');
  for (let tuft = 0; tuft < 4000; tuft++) {
    const range = tuft < 2300 ? 245 : 475;
    const x = (rng() * 2 - 1) * range, z = (rng() * 2 - 1) * range;
    if (Math.abs(x - 83 - Math.sin(z * 0.009) * 32) < 4 || (Math.abs(x - 4) < 27 && Math.abs(z + 40) < 24)) continue;
    const y = world.heightAt(x, z);
    for (let i = 0; i < 5; i++) {
      const angle = rng() * Math.PI * 2;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      const width = 0.025 + rng() * 0.075, height = 0.19 + rng() * 0.58;
      vertices.push(x - dz * width, y - 0.07, z + dx * width, x + dz * width, y - 0.07, z - dx * width,
        x + dx * height * 0.45, y + height, z + dz * height * 0.45);
      colors.push(stem.r, stem.g, stem.b, stem.r, stem.g, stem.b, straw.r, straw.g, straw.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function smokeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const rng = randomSource(287);
  for (let i = 0; i < 37; i++) {
    const size = 8 + rng() * 24, angle = rng() * Math.PI * 2, radius = rng() * 27;
    const x = 64 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, size);
    glow.addColorStop(0, 'rgba(255,247,223,0.22)');
    glow.addColorStop(1, 'rgba(255,247,223,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildLandscape(scene: THREE.Scene, world: World) {
  scene.fog = new THREE.FogExp2(HAZE, 0.00255);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), new THREE.ShaderMaterial({
    uniforms: { sun: { value: SUN }, haze: { value: HAZE }, clock: { value: 0 } },
    vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false,
  }));
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  scene.add(sky);
  const grit = gritTexture();
  scene.add(terrain(world, grit), populate(world, grit), scrub(world));

  const smoke = smokeTexture();
  const plumes: { sprite: THREE.Sprite; x: number; y: number; z: number; i: number }[] = [];
  for (const [x, z] of [[-9, -44], [22, -54], [91, 80], [-170, 25], [67, 40], [144, -134]]) {
    const y = world.heightAt(x, z);
    for (let i = 0; i < 6; i++) {
      const material = new THREE.SpriteMaterial({
        map: smoke, color: i < 3 ? '#796d58' : '#9c8b69', transparent: true, depthWrite: false, opacity: 0.37,
      });
      const sprite = new THREE.Sprite(material);
      scene.add(sprite);
      plumes.push({ sprite, x, y, z, i });
    }
  }

  return (time: number, camera: THREE.Camera) => {
    sky.position.copy(camera.position);
    sky.material.uniforms.clock.value = time;
    for (const { sprite, x, y, z, i } of plumes) {
      const age = ((time * 0.145 + i / 6 + x * 0.07) % 1 + 1) % 1;
      sprite.position.set(x + age * 19, y + 0.7 + age * 12, z + age * 4 + Math.sin(age * 5) * 2);
      sprite.scale.setScalar(3.5 + age * 13);
      sprite.material.opacity = Math.sin(Math.PI * age) * 0.53;
      sprite.material.rotation = age * 1.7 + i * 0.6;
    }
  };
}
