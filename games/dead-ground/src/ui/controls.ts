import { neutralInput, type Input } from '../domain/combat.js';
import { clamp } from '../domain/math.js';

const ZOOMS = [4, 8, 16];
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC',
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
  private aiming = false;
  readonly touchMode = matchMedia('(pointer: coarse)').matches;
  private movePointer = -1;
  private lookPointer = -1;
  private moveX = 0;
  private moveY = 0;
  private originX = 0;
  private originY = 0;
  private lookX = 0;
  private lookY = 0;
  private touchCrouch = false;
  private touchBreath = false;
  private readonly touchPanel = document.getElementById('touch-controls')!;

  constructor(readonly canvas: HTMLCanvasElement, private readonly pause: () => void) {
    this.bindTouch();
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.active) this.pause(); });
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
    document.addEventListener('mousemove', event => {
      if (!this.active || (document.pointerLockElement !== this.canvas && !(this.fallback && event.target === this.canvas))) return;
      const scale = 0.00235 * this.sensitivity / (this.aiming ? this.zoom : 1);
      this.look(event.movementX * scale, event.movementY * scale);
    });
    this.canvas.addEventListener('mousedown', event => {
      if (!this.active) return;
      event.preventDefault();
      if (event.button === 0) this.fire++;
      if (event.button === 2) this.aiming = true;
    });
    window.addEventListener('mouseup', event => {
      if (event.button === 2) this.aiming = false;
    });
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('wheel', event => {
      if (!this.active || !this.aiming) return;
      event.preventDefault();
      this.setZoom(-Math.sign(event.deltaY));
    }, { passive: false });
    document.addEventListener('keydown', event => {
      if (!this.active) return;
      if (event.code === 'Escape') { this.pause(); return; }
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat) return;
      if (event.code === 'Tab') this.score = true;
      if (event.code === 'KeyM') this.map = !this.map;
      if (event.code === 'KeyR') this.reload++;
      if (event.code === 'KeyZ') this.zoom = ZOOMS[(ZOOMS.indexOf(this.zoom) + 1) % ZOOMS.length];
    });
    document.addEventListener('keyup', event => {
      this.keys.delete(event.code);
      if (event.code === 'Tab') this.score = false;
    });
  }

  enable(): void {
    this.active = true;
    this.fallback = false;
    if (this.touchMode) { this.fallback = true; this.touchPanel.hidden = false; return; }
    try {
      const result = this.canvas.requestPointerLock();
      void result?.catch(() => { if (this.active) this.fallback = true; });
    } catch {
      this.fallback = true;
    }
  }

  disable(): void {
    this.active = false;
    this.fallback = false;
    this.keys.clear();
    this.movePointer = this.lookPointer = -1;
    this.moveX = this.moveY = 0;
    this.touchCrouch = this.touchBreath = false;
    this.touchPanel.hidden = true;
    this.touchPanel.querySelectorAll('[aria-pressed]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    this.aiming = this.score = this.map = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
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
      forward: clamp(key('KeyW') - key('KeyS') + this.moveY, -1, 1), strafe: clamp(key('KeyD') - key('KeyA') + this.moveX, -1, 1),
      crouch: this.touchCrouch || this.keys.has('KeyC') || this.keys.has('ControlLeft'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), breath: this.touchBreath || this.keys.has('Space') };
  }

  private bindTouch(): void {
    this.canvas.addEventListener('pointerdown', e => {
      if (!this.active || e.pointerType !== 'touch') return;
      const left = e.clientX < this.canvas.clientWidth * 0.45;
      if (left && this.movePointer < 0) {
        this.movePointer = e.pointerId; this.originX = e.clientX; this.originY = e.clientY;
      } else if (!left && this.lookPointer < 0) {
        this.lookPointer = e.pointerId; this.lookX = e.clientX; this.lookY = e.clientY;
      } else return;
      e.preventDefault();
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* window release is also handled */ }
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.active || e.pointerType !== 'touch') return;
      if (e.pointerId === this.movePointer) {
        const x = e.clientX - this.originX, y = this.originY - e.clientY;
        const r = Math.max(54, Math.hypot(x, y));
        this.moveX = x / r; this.moveY = y / r;
      } else if (e.pointerId === this.lookPointer) {
        const scale = 0.004 * this.sensitivity / (this.aiming ? this.zoom : 1);
        this.look((e.clientX - this.lookX) * scale, (e.clientY - this.lookY) * scale);
        this.lookX = e.clientX; this.lookY = e.clientY;
      }
    });
    const release = (e: PointerEvent): void => {
      if (e.pointerId === this.movePointer) { this.movePointer = -1; this.moveX = this.moveY = 0; }
      if (e.pointerId === this.lookPointer) this.lookPointer = -1;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    this.canvas.addEventListener('lostpointercapture', release);
    for (const button of this.touchPanel.querySelectorAll<HTMLButtonElement>('button')) {
      const act = button.dataset.touch;
      const activate = (): void => {
        if (!this.active) return;
        if (act === 'fire') this.fire++;
        else if (act === 'reload') this.reload++;
        else if (act === 'aim') { this.aiming = !this.aiming; button.setAttribute('aria-pressed', String(this.aiming)); }
        else if (act === 'crouch') { this.touchCrouch = !this.touchCrouch; button.setAttribute('aria-pressed', String(this.touchCrouch)); }
        else if (act === 'breath') this.touchBreath = true;
        else if (act === 'zoom') this.zoom = ZOOMS[(ZOOMS.indexOf(this.zoom) + 1) % ZOOMS.length];
        else if (act === 'map') this.map = !this.map;
        else if (act === 'score') this.score = !this.score;
        else if (act === 'menu') this.pause();
      };
      button.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (act === 'breath') { try { button.setPointerCapture(e.pointerId); } catch { /* pointerleave releases */ } }
        activate();
      });
      button.addEventListener('click', e => { if (e.detail === 0 && act !== 'breath') activate(); });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) {
        button.addEventListener(type, () => { if (act === 'breath') this.touchBreath = false; });
      }
    }
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
