import * as THREE from 'three';
import { color, clamp } from './palette.js';

const particleVertex = `
  attribute float intensity;
  attribute float size;
  varying float vIntensity;
  varying vec3 vColor;
  void main() {
    vIntensity = intensity;
    vColor = color;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(size * 190.0 / -view.z, 1.0, 10.0);
  }
`;
const particleFragment = `
  varying float vIntensity;
  varying vec3 vColor;
  void main() {
    float falloff = 1.0 - smoothstep(0.05, 0.5, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(vColor, vIntensity * falloff);
    #include <colorspace_fragment>
  }
`;

export class Sparks {
  constructor(scene) {
    const count = 136;
    this.particles = Array.from({ length: count }, () => ({ age: 1, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fade: 0 }));
    this.cursor = 0;
    this.geometry = new THREE.BufferGeometry();
    for (const [name, dim] of [['position', 3], ['color', 3], ['intensity', 1], ['size', 1]]) {
      this.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * dim), dim).setUsage(THREE.DynamicDrawUsage));
    }
    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVertex, fragmentShader: particleFragment,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  emit(event, x, z, low, reduced) {
    const counts = { hit: 17, riposte: 30, parry: 45, block: 20, break: 35, clash: 35, dodge: 13, evade: 8 };
    let count = counts[event] || 0;
    if (low) count = Math.floor(count * 0.55);
    if (reduced) count = Math.floor(count * 0.28);
    const dust = event === 'dodge' || event === 'evade';
    const bright = event === 'parry' || event === 'clash';
    const tint = color(dust ? '#d4a179' : bright ? '#ffe6b4' : event === 'hit' ? '#e78561' : '#ffac60');
    const pos = this.geometry.attributes.position;
    const colors = this.geometry.attributes.color;
    const size = this.geometry.attributes.size;
    for (let i = 0; i < count; i++) {
      const index = this.cursor++ % this.particles.length;
      const particle = this.particles[index];
      const angle = Math.random() * Math.PI * 2;
      const velocity = (dust ? 0.58 : 1.9) + Math.random() * (dust ? 1.2 : 6.5);
      const origin = Math.random() * (dust ? 0.48 : 0.12);
      particle.x = x + Math.cos(angle) * origin;
      particle.y = dust ? 0.045 : 1.03 + Math.random() * 0.47;
      particle.z = z + Math.sin(angle) * origin;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = (dust ? 0.03 : 0.55) + Math.random() * (dust ? 0.42 : 4.1);
      particle.vz = Math.sin(angle) * velocity;
      particle.gravity = dust ? 1.0 : 11.4;
      particle.age = 0;
      particle.life = (dust ? 0.25 : 0.14) + Math.random() * 0.32;
      particle.fade = dust ? 0.42 : 0.89;
      pos.setXYZ(index, particle.x, particle.y, particle.z);
      colors.setXYZ(index, tint.r, tint.g, tint.b);
      size.setX(index, dust ? 0.11 : 0.041 + Math.random() * 0.13);
    }
    for (const attribute of [pos, colors, size]) attribute.needsUpdate = true;
    if (count) this.points.visible = true;
  }

  update(dt) {
    if (!this.points.visible) return;
    const { position, intensity } = this.geometry.attributes;
    let live = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        intensity.setX(i, 0);
        continue;
      }
      live = true;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.027, p.y + p.vy * dt);
      p.z += p.vz * dt;
      position.setXYZ(i, p.x, p.y, p.z);
      intensity.setX(i, p.fade * (1 - p.age / p.life) ** 1.7);
    }
    this.points.visible = live;
    position.needsUpdate = intensity.needsUpdate = true;
  }
}

export class BladeTrail {
  constructor(scene, tint) {
    this.limit = 9;
    this.samples = [];
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.limit * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('fade', new THREE.BufferAttribute(new Float32Array(this.limit * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const index = [];
    for (let i = 0; i < this.limit - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.geometry.setIndex(index);
    const material = new THREE.ShaderMaterial({
      uniforms: { tint: { value: color(tint) } },
      vertexShader: `
        attribute float fade;
        varying float vFade;
        void main() {
          vFade = fade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 tint;
        varying float vFade;
        void main() {
          gl_FragColor = vec4(tint, vFade);
          #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  reset() {
    this.samples.length = 0;
    this.mesh.visible = false;
  }

  update(dt, rig, active) {
    for (const sample of this.samples) sample.age += dt;
    while (this.samples[0]?.age > 0.115) this.samples.shift();
    if (active) {
      const sample = this.samples.length === this.limit ? this.samples.shift() : { a: new THREE.Vector3(), b: new THREE.Vector3(), age: 0 };
      rig.bladeBase.getWorldPosition(sample.a);
      rig.bladeTip.getWorldPosition(sample.b);
      sample.age = 0;
      this.samples.push(sample);
    }
    this.mesh.visible = this.samples.length > 1;
    if (!this.mesh.visible) return;
    const { position, fade } = this.geometry.attributes;
    for (let i = 0; i < this.samples.length; i++) {
      const { a, b, age } = this.samples[i];
      const opacity = clamp(1 - age / 0.115, 0, 1) * (0.15 + 0.85 * i / this.limit);
      position.setXYZ(2 * i, a.x, a.y, a.z);
      position.setXYZ(2 * i + 1, b.x, b.y, b.z);
      fade.setX(2 * i, opacity * 0.03);
      fade.setX(2 * i + 1, opacity * 0.61);
    }
    position.needsUpdate = fade.needsUpdate = true;
    this.geometry.setDrawRange(0, (this.samples.length - 1) * 6);
  }
}

export class ImpactRing {
  constructor(scene) {
    const shape = new THREE.RingGeometry(0.93, 1, 36);
    this.material = new THREE.MeshBasicMaterial({
      color: '#ffcb8a', transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(shape, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    this.age = 1;
    scene.add(this.mesh);
  }

  emit(x, z, event) {
    this.mesh.position.set(x, 0.039, z);
    this.material.color.set(event === 'parry' ? '#ffe7b7' : '#ff986a');
    this.age = 0;
  }

  update(dt) {
    this.age += dt;
    const t = this.age / 0.38;
    this.mesh.visible = t < 1;
    if (this.mesh.visible) {
      this.material.opacity = 0.50 * (1 - t) ** 2;
      this.mesh.scale.setScalar(0.38 + 2.16 * (1 - (1 - t) ** 2));
    }
  }
}
