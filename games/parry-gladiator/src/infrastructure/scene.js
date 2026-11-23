import * as THREE from 'three';
import { attacks } from '../domain/combat.js';
import { createArena } from './render/arena.js';
import { createFighter } from './render/fighter.js';
import { BladeTrail, ImpactRing, Sparks } from './render/effects.js';
import { clamp, mix } from './render/palette.js';

const vec = () => new THREE.Vector3();
const damp = (dt, speed) => 1 - Math.exp(-dt * speed);
function makeContactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  gradient.addColorStop(0, '#160e10bd');
  gradient.addColorStop(0.62, '#160e1064');
  gradient.addColorStop(1, '#160e1000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });
}

const SHOCKS = { hit: 0.16, riposte: 0.28, block: 0.085, parry: 0.26, break: 0.27, clash: 0.19 };

export class Scene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#7c5556');
    this.scene.fog = new THREE.FogExp2('#8a6561', 0.035);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.09, 110);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', '3D combat arena');
    const gl = this.renderer.getContext();
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const adapter = rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : '';
    this.software = /swiftshader|llvmpipe|software raster/i.test(adapter);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.canvas);
    this.look = vec();
    this.cameraBase = vec();
    this.desired = vec();
    this.lookAt = vec();
    this.target = vec();
    this.point = { x: 0, y: 0, visible: false };
    this.isReset = true;
    this.time = 0;
    this.shake = 0;
    this.latched = 0;
    this.lastFrameLength = 1 / 60;
    this.slowFrames = 0;
    this.pixelBudget = 1;

    this.scene.add(new THREE.HemisphereLight('#d3bac0', '#795240', 2.2));
    const sun = this.sun = new THREE.DirectionalLight('#ffcf9d', 3.15);
    sun.position.set(11, 16, -12);
    sun.castShadow = true;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -13;
    sun.shadow.camera.right = sun.shadow.camera.top = 13;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 47;
    sun.shadow.bias = -0.00042;
    sun.shadow.normalBias = 0.027;
    this.scene.add(sun);
    const bounce = new THREE.DirectionalLight('#a8bdc6', 1.5);
    bounce.position.set(-6, 8, 9);
    this.scene.add(bounce);
    this.portraitLight = new THREE.DirectionalLight('#f5d3ad', 0.64);
    this.portraitLight.position.set(7, 5, 6);
    this.scene.add(this.portraitLight);

    this.arena = createArena(this.scene);
    const contactMaterial = makeContactShadow();
    const contactGeometry = new THREE.PlaneGeometry(2.0, 1.65);
    this.fighters = [0, 1].map(i => {
      const contact = new THREE.Mesh(contactGeometry, contactMaterial);
      contact.rotation.x = -Math.PI / 2;
      this.scene.add(contact);
      return {
        ...createFighter(this.scene, i), contact,
        trail: new BladeTrail(this.scene, i ? '#ffad70' : '#d8efea'),
      };
    });
    this.sparks = new Sparks(this.scene);
    this.impactRing = new ImpactRing(this.scene);
    this.setQuality('auto');
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(container);
    this.resize();
  }

  setQuality(quality) {
    if (this.quality === quality) return;
    this.quality = quality;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.low = quality === 'low' || (quality === 'auto' && this.software);
    this.pixelBudget = quality === 'high' ? 1.75 : this.low ? 0.80 : mobile ? 1.15 : 1.4;
    this.renderer.shadowMap.enabled = !this.low;
    const size = quality === 'high' ? 2048 : 1024;
    const shadow = this.sun.shadow;
    if (shadow.map && shadow.mapSize.x !== size) {
      shadow.map.dispose();
      shadow.map = null;
    }
    shadow.mapSize.set(size, size);
    shadow.needsUpdate = true;
    this.slowFrames = 0;
    this.scene.traverse(item => {
      if (!item.isMesh) return;
      for (const material of Array.isArray(item.material) ? item.material : [item.material]) material.needsUpdate = true;
    });
    this.resize();
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1), height = Math.max(this.container.clientHeight, 1);
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < 0.9 ? 64 : 51;
    this.camera.updateProjectionMatrix();
    const pixelLimit = this.quality === 'high' ? 5_000_000 : 2_700_000;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.pixelBudget, Math.sqrt(pixelLimit / (width * height))));
    this.renderer.setSize(width, height, false);
  }

  resetCamera() {
    this.isReset = true;
    this.shake = 0;
    this.latched = 0;
    for (const f of this.fighters) f.trail.reset();
  }

  impact(event, index, reduced) {
    const a = this.fighters[index], b = this.fighters[1 - index];
    if (!a || !b) return;
    const location = event === 'dodge' ? 0 : event === 'hit' || event === 'riposte' || event === 'break' ? 0.73 : 0.52;
    const x = mix(a.root.position.x, b.root.position.x, location);
    const z = mix(a.root.position.z, b.root.position.z, location);
    this.sparks.emit(event, x, z, this.low, reduced);
    if (!reduced && !this.low && ['parry', 'break', 'riposte'].includes(event)) this.impactRing.emit(x, z, event);
    if (!reduced) this.shake = Math.max(this.shake, SHOCKS[event] || 0);
    if (SHOCKS[event]) this.latched = Math.max(this.latched, event === 'parry' ? 0.081 : 0.04);
  }

  updateRig(rig, state, player, i, dt, menu, online, reset, paused, reduced) {
    let x = player.x, z = player.z, heading = player.angle;
    if (menu) {
      x = i ? 0.24 : 3.9;
      z = i ? -3.45 : 2.72;
      heading = i ? 0.94 : 0.4;
    }
    const delta = Math.hypot(rig.root.position.x - x, rig.root.position.z - z);
    const weight = reset || delta > 4 ? 1 : damp(dt, online ? 21 : 29);
    rig.root.position.x = mix(rig.root.position.x, x, weight);
    rig.root.position.z = mix(rig.root.position.z, z, weight);
    const turn = Math.atan2(Math.sin(heading - rig.root.rotation.y), Math.cos(heading - rig.root.rotation.y));
    rig.root.rotation.y += turn * (reset ? 1 : damp(dt, 19));
    rig.contact.position.set(rig.root.position.x, 0.012 + i * 0.001, rig.root.position.z);
    rig.contact.visible = this.low;
    const stuck = (paused && !online) || this.latched > 0 || reduced && menu;
    const roundEnd = state.phase === 'over' || state.phase === 'finished' ? (i === state.winner ? 'win' : 'lose') : '';
    const footstep = rig.update(player, paused && !online ? 0 : dt, menu, stuck, this.low || reduced, roundEnd);
    const attack = attacks[player.attack];
    const draw = attack && player.timer > attack.windup * 0.82 && player.timer < attack.windup + attack.active;
    if (!this.low && !reduced) rig.trail.update(dt, rig, !stuck && !roundEnd && !!draw);
    else rig.trail.reset();
    return footstep && state.phase === 'fight' && !menu && !stuck;
  }

  setupCamera(local, dt, menu, reduced, reset) {
    const me = this.fighters[local].root.position, rival = this.fighters[1 - local].root.position;
    if (menu) {
      const motion = reduced ? 0 : Math.sin(this.time * 0.20) * 0.60;
      this.desired.set(8.2 + motion, 2.95 + motion * 0.3, 7.48 - motion * 0.7);
      this.lookAt.set(-0.92, 1.46, 1.5);
    } else {
      const dx = rival.x - me.x, dz = rival.z - me.z, distance = Math.hypot(dx, dz) || 1;
      const x = dx / distance, z = dz / distance;
      const tight = this.camera.aspect < 0.92;
      const depth = (tight ? 5.6 : 5.15) + Math.min(1.6, distance * 0.16);
      const close = clamp((3.2 - distance) / 1.9, 0, 1);
      const shoulder = tight ? 0.90 + close * 0.65 : 1.6 + close * 1.05;
      const height = 3.75 + distance * 0.085 + close * 0.42;
      this.desired.set(me.x - x * depth - z * shoulder, height, me.z - z * depth + x * shoulder);
      const limit = Math.hypot(this.desired.x, this.desired.z);
      if (limit > 13.4) {
        this.desired.x *= 13.4 / limit;
        this.desired.z *= 13.4 / limit;
      }
      this.lookAt.set(me.x + dx * 0.44, 1.04 + distance * 0.022, me.z + dz * 0.44);
    }
    this.cameraBase.lerp(this.desired, reset ? 1 : damp(dt, menu ? 2.2 : 6.4));
    this.look.lerp(this.lookAt, reset ? 1 : damp(dt, 9.8));
    this.camera.position.copy(this.cameraBase);
    if (this.shake > 0.002 && !reduced) {
      this.camera.position.x += Math.sin(this.time * 94) * this.shake;
      this.camera.position.y += Math.cos(this.time * 124) * this.shake * 0.47;
      this.camera.position.z += Math.cos(this.time * 89) * this.shake * 0.46;
    }
    this.camera.lookAt(this.look);
  }

  render(state, dt, local = 0, { menu = false, online = false, paused = false, reduced = false } = {}) {
    this.time += dt;
    this.shake *= Math.exp(-dt * 15);
    this.latched -= dt;
    this.arena.update(this.time, reduced, this.low);
    this.sparks.update(dt);
    this.impactRing.update(dt);
    const reset = this.isReset || this.wasMenu !== menu || this.lastRound !== state.round;
    this.isReset = false;
    this.wasMenu = menu;
    this.portraitLight.visible = menu;
    this.lastRound = state.round;
    const footsteps = this.fighters.map((rig, i) => this.updateRig(rig, state, state.players[i], i, dt, menu, online, reset, paused, reduced));
    this.setupCamera(local, dt, menu, reduced, reset);
    this.renderer.render(this.scene, this.camera);
    if (!menu && !paused && this.quality === 'auto' && !this.software) {
      this.lastFrameLength = mix(this.lastFrameLength, dt, 0.033);
      this.slowFrames = this.lastFrameLength > 0.029 ? this.slowFrames + 1 : 0;
      if (this.slowFrames > 65 && this.pixelBudget > 0.85) {
        this.pixelBudget = Math.max(0.85, this.pixelBudget - 0.25);
        this.slowFrames = 0;
        this.resize();
      }
    }
    return footsteps;
  }

  targetPoint(index) {
    const root = this.fighters[index].root;
    this.target.copy(root.position);
    this.target.y += 2.43;
    this.target.project(this.camera);
    this.point.x = (this.target.x * 0.5 + 0.5) * this.width;
    this.point.y = (0.5 - this.target.y * 0.5) * this.height;
    this.point.visible = Math.abs(this.target.x) < 0.97 && Math.abs(this.target.y) < 0.97 && this.target.z > 0 && this.target.z < 1;
    return this.point;
  }
}
