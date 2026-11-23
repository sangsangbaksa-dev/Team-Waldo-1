import * as THREE from 'three';
import { color, instances, mesh, randomFrom, standard } from './palette.js';

const TAU = Math.PI * 2;
const stoneTints = ['#9d8675', '#786759', '#887266', '#af9580', '#8d7364'].map(color);

function stoneTexture() {
  const size = 512, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = randomFrom(72);
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 148 + (random() - 0.5) * 32;
      v += 9 * Math.sin(x * 0.057 + Math.cos(y * 0.023) * 3.2);
      v += 15 * Math.sin((x - y) * 0.018) + 9 * Math.cos(y * 0.067 - x * 0.011);
      const i = (y * size + x) * 4;
      image.data[i] = v + 16;
      image.data[i + 1] = v + 5;
      image.data[i + 2] = v - 8;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < 750; i++) {
    ctx.fillStyle = random() < 0.65 ? '#31251b22' : '#f7d8b122';
    ctx.fillRect(random() * size, random() * size, random() * 5 + 1, random() * 4 + 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function arenaSurface() {
  const size = 1024, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = randomFrom(192);
  const source = stoneTexture();
  ctx.fillStyle = ctx.createPattern(source.image, 'repeat');
  ctx.fillRect(0, 0, size, size);
  source.dispose();
  const center = size / 2;
  for (let r = 0; r < 15; r++) {
    const row = r * 73 - 34;
    for (let n = 0; n < 13; n++) {
      const x = n * 91 + (r % 2 ? 45 : 0) - 40;
      const brightness = 45 + Math.floor(random() * 36);
      ctx.fillStyle = `rgba(${brightness + 38},${brightness + 15},${brightness},${random() * 0.23})`;
      ctx.fillRect(x + 1, row + 1, 89, 71);
      ctx.strokeStyle = '#271b1660';
      ctx.beginPath();
      ctx.moveTo(x, row + 73);
      ctx.lineTo(x + 1, row + 44);
      ctx.lineTo(x - 1, row);
      ctx.lineTo(x + 91, row + random() * 2);
      ctx.stroke();
      ctx.strokeStyle = '#efcd9d21';
      ctx.strokeRect(x + 2, row + 2, 89, 70);
    }
  }
  const ring = (radius, stroke, width) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, TAU);
    ctx.stroke();
  };
  ring(104, '#39241e97', 10);
  ring(113, '#d3a16c83', 3);
  ring(147, '#733e2a58', 3);
  ring(310, '#45291f8c', 4);
  ring(321, '#cfaa7387', 4);
  ring(434, '#6c3b2a9e', 10);
  ring(444, '#d8a876', 3);
  ring(460, '#3a271dba', 9);
  for (let i = 0; i < 32; i++) {
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(i / 32 * TAU);
    ctx.fillStyle = i % 4 === 0 ? '#713d2ca8' : '#e1b8888c';
    ctx.beginPath();
    ctx.moveTo(0, -439);
    ctx.lineTo(8, -420);
    ctx.lineTo(0, -408);
    ctx.lineTo(-8, -420);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#583126ad';
  for (let i = 0; i < 2; i++) {
    ctx.fillRect(-6, -67, 12, 106);
    ctx.fillRect(-30, 24, 60, 9);
    ctx.beginPath();
    ctx.moveTo(0, -82);
    ctx.lineTo(6, -66);
    ctx.lineTo(-6, -66);
    ctx.fill();
    ctx.rotate(Math.PI / 2);
  }
  ctx.restore();
  const vignette = ctx.createRadialGradient(center, center, 290, center, center, 535);
  vignette.addColorStop(0, '#24151b00');
  vignette.addColorStop(1, '#29181163');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function sky(scene) {
  const glow = color('#d1a07f');
  const top = color('#383443');
  const horizon = color('#aa796c');
  const sun = new THREE.Vector3(0.36, 0.20, -0.91).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: top }, horizon: { value: horizon }, glow: { value: glow }, sun: { value: sun } },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 glow;
      uniform vec3 sun;
      varying vec3 vDirection;
      void main() {
        vec3 dir = normalize(vDirection);
        float height = max(0.0, dir.y);
        vec3 base = mix(horizon, top, smoothstep(0.0, 0.72, height));
        float d = max(0.0, dot(dir, sun));
        base += glow * (pow(d, 12.0) * 0.55 + pow(d, 1400.0) * 2.5);
        gl_FragColor = vec4(base, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = mesh(scene, new THREE.SphereGeometry(80, 32, 16), mat, 0, 0, 0, false);
  dome.renderOrder = -3;
}

function blockRing(scene, geometry, material, { radius, y, height, depth, count, gap = 0.035 }, random) {
  const parts = [];
  const width = Math.PI * 2 * radius / count - gap;
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU;
    parts.push({
      x: Math.sin(a) * radius, y: y + (random() - 0.5) * gap, z: Math.cos(a) * radius,
      ry: a, sx: width, sy: height, sz: depth, color: stoneTints[i % stoneTints.length],
    });
  }
  instances(scene, geometry, material, parts);
}

function architecture(scene, random) {
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const texture = stoneTexture();
  const stone = standard('#c3ab90', 0.03, 0.93, { map: texture, bumpMap: texture, bumpScale: 0.05 });
  const darkStone = standard('#755a54', 0.02, 0.95, { map: texture });
  const foundation = mesh(scene, new THREE.CylinderGeometry(11.25, 11.7, 0.66, 96), darkStone, 0, -0.34, 0, false);
  foundation.receiveShadow = true;
  blockRing(scene, cube, stone, { radius: 10.13, y: 0.10, height: 0.27, depth: 0.54, count: 80 }, random);
  blockRing(scene, cube, darkStone, { radius: 11.06, y: 0.33, height: 0.65, depth: 1.1, count: 72 }, random);
  for (let i = 0; i < 5; i++) {
    blockRing(scene, cube, i % 2 ? darkStone : stone, {
      radius: 11.75 + i * 0.82, y: 0.2 + i * 0.39,
      height: 1.08, depth: 1.08, count: 62,
    }, random);
  }
  blockRing(scene, cube, stone, { radius: 15.5, y: 2.23, height: 0.23, depth: 0.70, count: 60 }, random);

  const posts = [], bases = [], crowns = [], arch = [], panels = [];
  for (let bay = 0; bay < 18; bay++) {
    const a = bay / 18 * TAU;
    const radial = (x, y, z, sx, sy, sz, rz = 0) => ({
      x: x * Math.cos(a) + z * Math.sin(a), y, z: z * Math.cos(a) - x * Math.sin(a),
      ry: a, rz, sx, sy, sz, color: stoneTints[bay % stoneTints.length],
    });
    const radius = 16.4;
    const ruined = bay % 7 === 5;
    const height = ruined ? 1.6 : 3.08;
    posts.push(radial(0, 2.19 + height / 2, radius, 0.68, height, 1.16));
    bases.push(radial(0, 2.22, radius, 1.0, 0.34, 1.38));
    crowns.push(radial(0, 2.19 + height, radius, 1.05, 0.29, 1.44));
    for (let j = 0; j < (ruined ? 2 : 10); j++) {
      const angle = 0.064 + j * 0.335;
      arch.push(radial(2.72 + Math.cos(angle) * 2.42, 5.15 + Math.sin(angle) * 1.62, radius - 0.42, 0.88, 0.49, 0.83, angle + Math.PI / 2));
    }
    if (bay % 3 === 0) panels.push(radial(0, 4.03, radius - 0.70, 1.04, 2.5, 0.12));
  }
  instances(scene, cube, stone, posts, true);
  instances(scene, cube, darkStone, bases);
  instances(scene, cube, stone, crowns, true);
  instances(scene, cube, stone, arch, true);
  instances(scene, new THREE.BoxGeometry(1, 1, 1), standard('#773e3d', 0.08, 0.89), panels);
  instances(scene, new THREE.BoxGeometry(1, 1, 1), standard('#ca945c', 0.37, 0.70), panels.map(item => ({ ...item, y: item.y + 0.29, sy: 0.82, sx: 0.075, sz: 0.17 })));

  const ruins = [];
  for (let i = 0; i < 46; i++) {
    const a = i / 46 * TAU;
    const distance = 29 + random() * 15;
    const h = 3 + random() * 10;
    ruins.push({ x: Math.sin(a) * distance, y: h * 0.21, z: Math.cos(a) * distance,
      ry: a + random(), rz: (random() - 0.5) * 0.24, sx: 1.3 + random() * 2, sy: h, sz: 2 + random() * 3,
      color: stoneTints[i % stoneTints.length] });
  }
  instances(scene, cube, darkStone, ruins);

  const rubble = [];
  for (let i = 0; i < 175; i++) {
    const a = random() * TAU, r = 9.54 + random() * 2.6, size = 0.04 + random() * 0.27;
    rubble.push({ x: Math.cos(a) * r, y: r > 10.8 ? 0.78 : 0.09, z: Math.sin(a) * r,
      ry: a, rx: a * 0.42, sx: size * 1.6, sy: size, sz: size * 0.78, color: stoneTints[i % stoneTints.length] });
  }
  instances(scene, new THREE.DodecahedronGeometry(1, 0), stone, rubble);
}

function flameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 18, 0, 120);
  gradient.addColorStop(0, '#b23a1000');
  gradient.addColorStop(0.27, '#e46721b0');
  gradient.addColorStop(0.73, '#ffc075f2');
  gradient.addColorStop(0.93, '#f2aa6ad9');
  gradient.addColorStop(1, '#c6452833');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.bezierCurveTo(41, 34, 18, 40, 43, 71);
  ctx.bezierCurveTo(52, 84, 55, 104, 39, 116);
  ctx.bezierCurveTo(23, 127, 8, 108, 12, 89);
  ctx.bezierCurveTo(16, 67, 32, 53, 29, 36);
  ctx.bezierCurveTo(27, 23, 34, 17, 32, 8);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function braziers(scene) {
  const flames = [];
  const iron = standard('#433132', 0.64, 0.67);
  const bronze = standard('#b88d62', 0.55, 0.45);
  const texture = flameTexture();
  const sprite = (parent, y, tint, opacity) => {
    const material = new THREE.SpriteMaterial({ map: texture, color: tint, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const item = new THREE.Sprite(material);
    item.position.set(0, y, 0);
    parent.add(item);
    return item;
  };
  const stem = new THREE.CylinderGeometry(0.10, 0.25, 1.1, 8);
  const bowl = new THREE.CylinderGeometry(0.49, 0.19, 0.25, 9);
  const trim = new THREE.TorusGeometry(0.47, 0.036, 6, 16);
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * TAU;
    const group = new THREE.Group();
    group.position.set(Math.sin(a) * 10.55, 0.30, Math.cos(a) * 10.55);
    scene.add(group);
    mesh(group, stem, iron, 0, 0.55, 0, false);
    mesh(group, bowl, iron, 0, 1.09, 0, false);
    mesh(group, trim, bronze, 0, 1.22, 0, false).rotation.x = Math.PI / 2;
    const outer = sprite(group, 1.72, '#f09263', 0.81);
    const inner = sprite(group, 1.61, '#fff2d1', 0.82);
    outer.scale.set(0.95, 1.24, 1);
    inner.scale.set(0.51, 0.89, 1);
    flames.push({ outer, inner, phase: i * 1.52 });
  }
  return flames;
}

function ash(scene, random) {
  const count = 360;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = random() * TAU, r = 0.5 + random() * 19;
    positions.set([Math.cos(a) * r, random() * 11, Math.sin(a) * r], i * 3);
    const warm = random();
    colors.set([0.45 + warm * 0.55, 0.26 + warm * 0.34, 0.18 + warm * 0.23], i * 3);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.034, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.49, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(geometry, material);
  scene.add(dust);
  return dust;
}

export function createArena(scene) {
  const random = randomFrom(584192);
  sky(scene);
  const floor = mesh(scene, new THREE.CircleGeometry(10.15, 100), standard('#ddc4a9', 0.04, 0.87, { map: arenaSurface() }), 0, 0.005, 0, false);
  floor.rotation.x = -Math.PI / 2;
  architecture(scene, random);
  const flames = braziers(scene);
  const dust = ash(scene, random);
  return {
    update(time, reduced, low) {
      const clock = reduced ? 0 : time;
      dust.visible = !low;
      dust.rotation.y = clock * 0.015;
      dust.position.y = Math.sin(clock * 0.23) * 0.4;
      for (const { outer, inner, phase } of flames) {
        const flicker = 1 + Math.sin(clock * 13 - phase) * 0.16 + Math.sin(clock * 7.5 + phase) * 0.12;
        outer.scale.set(0.95 / flicker, 1.24 * flicker, 1);
        outer.material.rotation = Math.sin(clock * 4.2 + phase) * 0.18;
        inner.material.rotation = Math.sin(clock * 5.9 + phase) * 0.14;
        inner.position.y = 1.54 + flicker * 0.08;
      }
    },
  };
}
