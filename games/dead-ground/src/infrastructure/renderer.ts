import * as THREE from 'three';
import { aimSway, eye, RIFLE, type Player } from '../domain/combat.js';
import type { MatchEvent, Snapshot } from '../domain/match.js';
import { angleDelta, lerp } from '../domain/math.js';
import type { World } from '../domain/world.js';
import { OperatorView, ViewRifle } from './actors.js';
import { buildLandscape, SUN } from './landscape.js';

const HIP_FOV = 66;
const scopedFov = (zoom: number) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(HIP_FOV / 2)) / zoom));
const DISPLAY_DELAY = 0.075;

interface Incoming { snapshot: Snapshot; received: number }

export class FieldRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(HIP_FOV, 1, 0.065, 1120);
  private readonly rifleScene = new THREE.Scene();
  private readonly rifleCamera = new THREE.PerspectiveCamera(59, 1, 0.045, 8);
  private readonly viewRifle = new ViewRifle();
  private readonly sun: THREE.DirectionalLight;
  private readonly tracks = new Map<string, OperatorView>();
  private readonly tracerGeometry = new THREE.BufferGeometry();
  private readonly tracerPositions = new Float32Array(3 * 2 * 48);
  private readonly impacts: { mesh: THREE.Mesh; until: number }[] = [];
  private readonly impactGeometry = new THREE.IcosahedronGeometry(0.13);
  private readonly landscape: ReturnType<typeof buildLandscape>;
  private readonly incoming: Incoming[] = [];
  private shadowPosition = new THREE.Vector3(Infinity, 0, 0);
  private renderTime = 0;
  private aim = 0;
  private lastFrame = 0;
  private lowDetail = false;
  private slowFrames = 0;
  private sharpness = 1;
  private kick = 0;
  private hurtRoll = 0;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.19;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.autoClear = false;

    this.sun = new THREE.DirectionalLight('#ffe0a6', 2.23);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const shadow = this.sun.shadow.camera;
    shadow.left = shadow.bottom = -72;
    shadow.right = shadow.top = 72;
    shadow.near = 1;
    shadow.far = 195;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.13;
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight('#d0d8c9', '#72624b', 2.02));
    this.landscape = buildLandscape(this.scene, world);

    const key = new THREE.DirectionalLight('#ffe1b2', 2.3);
    key.position.set(-3, 5, -5);
    this.rifleScene.add(key, new THREE.HemisphereLight('#c4d0c3', '#665445', 2.5), this.viewRifle.root);
    this.tracerGeometry.setAttribute('position', new THREE.BufferAttribute(this.tracerPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const tracer = new THREE.LineSegments(this.tracerGeometry, new THREE.LineBasicMaterial({
      color: '#ffd58f', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    tracer.frustumCulled = false;
    this.scene.add(tracer);
    this.camera.rotation.order = 'YXZ';

    const resize = () => {
      const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.lowDetail ? 1 : 1.65) * this.sharpness);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = this.rifleCamera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.rifleCamera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas);
    resize();
  }

  get aimFraction(): number { return this.aim; }

  get rangeLine(): { from: THREE.Vector3; to: THREE.Vector3 } {
    return { from: this.camera.position, to: this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(600).add(this.camera.position) };
  }

  reset(): void {
    this.incoming.length = 0;
    this.aim = 0;
    this.kick = this.hurtRoll = 0;
    for (const view of this.tracks.values()) { this.scene.remove(view.root); view.dispose(); }
    this.tracks.clear();
    for (const { mesh } of this.impacts) { this.scene.remove(mesh); (mesh.material as THREE.Material).dispose(); }
    this.impacts.length = 0;
  }

  setQuality(low: boolean): void {
    this.lowDetail = low;
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.65) * this.sharpness);
  }

  event(event: MatchEvent, self: string): void {
    if (event.type === 'shot' && event.player === self) this.kick = 1;
    if (event.type === 'hit' && event.target === self) this.hurtRoll = 1;
    if (event.type !== 'impact' && event.type !== 'hit') return;
    const material = new THREE.MeshBasicMaterial({
      color: event.type === 'hit' ? (event.headshot ? '#f3e6c4' : '#dfac69') : '#ad9c7f',
      transparent: true, opacity: 0.85, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.impactGeometry, material);
    const p = event.position;
    mesh.position.set(p.x, p.y, p.z);
    if (event.player === self) mesh.scale.setScalar(1.4);
    this.scene.add(mesh);
    this.impacts.push({ mesh, until: this.renderTime + 0.29 });
  }

  draw(snapshot: Snapshot, player: Player, zoom: number, dt: number, now: number, online: boolean): void {
    if (dt > 0.029 && this.lastFrame && !this.lowDetail) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 70 && this.sharpness > 0.77) {
      this.sharpness *= 0.85;
      this.setQuality(this.lowDetail);
      this.slowFrames = 0;
    }
    this.lastFrame = now;
    if (this.incoming.at(-1)?.snapshot.time !== snapshot.time) {
      this.incoming.push({ snapshot, received: now });
      if (this.incoming.length > 6) this.incoming.shift();
    }
    const newest = this.incoming.at(-1)!;
    const elapsed = Math.min(0.12, (now - newest.received) / 1000);
    const time = snapshot.time + (online && snapshot.phase === 'active' ? elapsed : 0);
    this.renderTime += dt;
    this.aim = lerp(this.aim, player.aiming && player.alive ? 1 : 0, 1 - Math.exp(-dt * 20));
    const fov = lerp(HIP_FOV, scopedFov(zoom), this.aim ** 0.68);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const p = eye(player);
    const bob = player.moving ? Math.sin(time * (player.sprinting ? 14 : 9)) * 0.033 * (1 - this.aim) : 0;
    this.camera.position.set(p.x, p.y + bob - (player.alive ? 0 : 0.85), p.z);
    this.kick = Math.max(0, this.kick - dt * 4.5);
    this.hurtRoll = Math.max(0, this.hurtRoll - dt * 3.2);
    const sway = aimSway(player, time);
    this.camera.rotation.set(
      player.pitch + sway.pitch + this.kick * this.kick * 0.03,
      player.yaw + sway.yaw,
      Math.sin(this.renderTime * 46) * this.hurtRoll * 0.012,
      'YXZ',
    );
    this.landscape(this.renderTime, this.camera);

    if (this.renderer.shadowMap.enabled && (this.shadowPosition.distanceTo(this.camera.position) > 3 || this.renderTime % 0.24 < dt)) {
      this.shadowPosition.copy(this.camera.position);
      this.sun.target.position.copy(this.camera.position);
      this.sun.position.copy(this.camera.position).addScaledVector(SUN, 105);
      this.renderer.shadowMap.needsUpdate = true;
    }

    const displayTime = online ? time - DISPLAY_DELAY : time;
    this.updateOperators(snapshot, player, displayTime, dt);
    this.updateTracers(snapshot, time - snapshot.time);
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const effect = this.impacts[i];
      const life = (effect.until - this.renderTime) / 0.29;
      if (life <= 0) {
        this.scene.remove(effect.mesh);
        (effect.mesh.material as THREE.Material).dispose();
        this.impacts.splice(i, 1);
      } else {
        (effect.mesh.material as THREE.MeshBasicMaterial).opacity = life * 0.65;
        effect.mesh.scale.addScalar(dt * 2.7);
      }
    }
    this.viewRifle.update(player, time, this.aim, player.steady);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.viewRifle.root.visible) {
      this.renderer.clearDepth();
      this.renderer.render(this.rifleScene, this.rifleCamera);
    }
  }

  private updateOperators(snapshot: Snapshot, player: Player, displayTime: number, dt: number): void {
    const afterIndex = this.incoming.findIndex(frame => frame.snapshot.time >= displayTime);
    const after = this.incoming[afterIndex < 0 ? this.incoming.length - 1 : afterIndex].snapshot;
    const before = this.incoming[Math.max(0, (afterIndex < 0 ? this.incoming.length - 1 : afterIndex) - 1)].snapshot;
    const blend = THREE.MathUtils.clamp((displayTime - before.time) / Math.max(0.001, after.time - before.time), 0, 1);
    const ids = new Set<string>();
    for (const other of snapshot.players) {
      if (other.id === player.id) continue;
      ids.add(other.id);
      const prev = before.players.find(value => value.id === other.id);
      const next = after.players.find(value => value.id === other.id);
      let shown = { ...other, position: { ...other.position } };
      if (prev && next && prev.generation === other.generation && next.generation === other.generation) {
        shown = { ...other, position: {
          x: lerp(prev.position.x, next.position.x, blend), y: lerp(prev.position.y, next.position.y, blend),
          z: lerp(prev.position.z, next.position.z, blend),
        }, yaw: prev.yaw + angleDelta(prev.yaw, next.yaw) * blend, pitch: lerp(prev.pitch, next.pitch, blend) };
      }
      let view = this.tracks.get(other.id);
      if (!view) {
        view = new OperatorView();
        this.tracks.set(other.id, view);
        this.scene.add(view.root);
      }
      view.update(shown, this.camera.position, dt, displayTime);
    }
    for (const [id, view] of this.tracks) {
      if (ids.has(id)) continue;
      this.scene.remove(view.root);
      view.dispose();
      this.tracks.delete(id);
    }
  }

  private updateTracers(snapshot: Snapshot, delay: number): void {
    let count = 0;
    for (const bullet of snapshot.bullets) {
      const { position: p, velocity: v } = bullet;
      const progressed = Math.min(delay, 0.062);
      const back = snapshot.time + delay < bullet.expires - RIFLE.lifetime + 0.065 ? 0.004 : 0.019;
      this.tracerPositions.set([
        p.x + v.x * (progressed - back), p.y + v.y * (progressed - back), p.z + v.z * (progressed - back),
        p.x + v.x * progressed, p.y + v.y * progressed, p.z + v.z * progressed,
      ], count * 6);
      if (++count === 48) break;
    }
    this.tracerGeometry.setDrawRange(0, count * 2);
    this.tracerGeometry.attributes.position.needsUpdate = true;
  }
}
