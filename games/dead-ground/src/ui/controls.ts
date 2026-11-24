import { neutralInput, type Input } from '../domain/combat.js';
import { clamp } from '../domain/math.js';

const ZOOMS = [4, 8, 16];
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyJ', 'KeyK',
  'ControlLeft', 'Space', 'KeyR', 'KeyZ', 'KeyM', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Controls {
  active = false;
  fallback = false;
  score = false;
  map = false;
  sensitivity = 1;
  zoom = 16;
  yaw = 0;
  pitch = 0;
  private keys = new Set<string>();
  private fire = 0;
  private reload = 0;
  private mouseAiming = false;
  private lockAttempt = 0;

  private get aiming(): boolean {
    return this.mouseAiming || this.keys.has('KeyK');
  }

  constructor(readonly canvas: HTMLCanvasElement, private readonly pause: () => void) {
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas || this.fallback || !this.active) return;
      this.pause();
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.active && document.pointerLockElement !== this.canvas) this.fallback = true;
    });
    window.addEventListener('blur', () => {
      if (this.active) this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.active) this.pause();
    });
    document.addEventListener('mousemove', event => {
      if (!this.active || (document.pointerLockElement !== this.canvas && !(this.fallback && event.target === this.canvas))) return;
      const scale = 0.00235 * this.sensitivity / (this.aiming ? this.zoom : 1);
      this.look(event.movementX * scale, event.movementY * scale);
    });
    this.canvas.addEventListener('mousedown', event => {
      if (!this.active) return;
      event.preventDefault();
      if (event.button === 0) this.fire++;
      if (event.button === 2) this.mouseAiming = true;
    });
    window.addEventListener('mouseup', event => {
      if (event.button === 2) this.mouseAiming = false;
    });
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('wheel', event => {
      if (!this.active || !this.aiming) return;
      event.preventDefault();
      this.setZoom(-Math.sign(event.deltaY));
    }, { passive: false });
    document.addEventListener('keydown', event => {
      if (!this.active) return;
      if (event.code === 'Escape') { if (!event.repeat) this.pause(); return; }
      if (!GAME_KEYS.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      if (event.repeat || this.keys.has(event.code)) return;
      this.keys.add(event.code);
      if (event.code === 'Tab') this.score = true;
      if (event.code === 'KeyM') this.map = !this.map;
      if (event.code === 'KeyR') this.reload++;
      if (event.code === 'KeyJ') this.fire++;
      if (event.code === 'KeyZ') this.zoom = ZOOMS[(ZOOMS.indexOf(this.zoom) + 1) % ZOOMS.length];
    });
    document.addEventListener('keyup', event => {
      this.keys.delete(event.code);
      if (event.code === 'Tab') this.score = false;
    });
  }

  enable(): void {
    if (this.active) return;
    this.active = true;
    this.fallback = false;
    const attempt = ++this.lockAttempt;
    try {
      const result = this.canvas.requestPointerLock();
      void result?.catch(() => { if (this.active && this.lockAttempt === attempt) this.fallback = true; });
    } catch {
      this.fallback = true;
    }
  }

  disable(): void {
    this.active = false;
    this.lockAttempt++;
    this.fallback = false;
    this.keys.clear();
    this.mouseAiming = this.score = this.map = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  resetSession(): void {
    this.disable();
    this.fire = this.reload = 0;
  }

  orient(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  sample(dt: number): Input {
    const input = { ...neutralInput(this.yaw, this.pitch), fire: this.fire, reload: this.reload };
    if (!this.active) return input;
    const key = (code: string) => Number(this.keys.has(code));
    const arrowSpeed = dt * 1.36 * this.sensitivity / (this.aiming ? this.zoom : 1);
    this.look((key('ArrowRight') - key('ArrowLeft')) * arrowSpeed, (key('ArrowDown') - key('ArrowUp')) * arrowSpeed);
    return { ...input, yaw: this.yaw, pitch: this.pitch, aim: this.aiming,
      forward: key('KeyW') - key('KeyS'), strafe: key('KeyD') - key('KeyA'),
      crouch: this.keys.has('KeyC') || this.keys.has('ControlLeft'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), breath: this.keys.has('Space') };
  }

  private setZoom(delta: number): void {
    this.zoom = ZOOMS[clamp(ZOOMS.indexOf(this.zoom) + delta, 0, ZOOMS.length - 1)];
  }

  private look(yaw: number, pitch: number): void {
    const next = this.yaw - yaw;
    this.yaw = Math.atan2(Math.sin(next), Math.cos(next));
    this.pitch = clamp(this.pitch - pitch, -1.48, 1.48);
  }
}
