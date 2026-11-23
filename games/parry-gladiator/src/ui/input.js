const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const actions = new Map([['KeyJ', 'light'], ['KeyK', 'heavy'], ['KeyQ', 'block'], ['KeyF', 'feint'], ['Space', 'dodge']]);

export class Controls {
  constructor({ enabled, action, escape, lighting }) {
    this.keys = new Set();
    this.guard = new Set();
    this.action = action;
    this.enabled = enabled;
    this.escape = escape;
    this.touchDirection = { x: 0, z: 0 };
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape') {
        if (!event.repeat) this.escape();
        return;
      }
      if (!this.enabled() || (!movement.has(event.code) && !actions.has(event.code))) return;
      event.preventDefault();
      if (event.repeat) return;
      this.keys.add(event.code);
      const command = actions.get(event.code);
      if (command === 'block') this.holdGuard(event.code);
      else if (command) this.action(command);
    });
    window.addEventListener('keyup', event => {
      this.keys.delete(event.code);
      if (event.code === 'KeyQ') this.releaseGuard(event.code);
    });
    lighting.addEventListener('pointerdown', event => {
      if (!this.enabled() || event.pointerType === 'touch') return;
      if (event.button === 0) this.action('light');
      if (event.button === 2) this.holdGuard('mouse');
    });
    window.addEventListener('pointerup', event => {
      if (event.button === 2) this.releaseGuard('mouse');
    });
    lighting.addEventListener('contextmenu', event => {
      if (this.enabled()) event.preventDefault();
    });
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('pointercancel', event => {
      if (event.pointerType !== 'touch') this.releaseGuard('mouse');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  holdGuard(source) {
    if (this.guard.size === 0) this.action('block');
    this.guard.add(source);
  }

  releaseGuard(source) {
    if (this.guard.delete(source) && this.guard.size === 0) this.action('release');
  }

  clear() {
    this.keys.clear();
    this.touchDirection.x = this.touchDirection.z = 0;
    if (this.guard.size) {
      this.guard.clear();
      this.action('release');
    }
  }

  get direction() {
    const down = (...keys) => keys.some(key => this.keys.has(key));
    const x = Number(down('KeyD', 'ArrowRight')) - Number(down('KeyA', 'ArrowLeft')) + this.touchDirection.x;
    const z = Number(down('KeyW', 'ArrowUp')) - Number(down('KeyS', 'ArrowDown')) + this.touchDirection.z;
    const norm = Math.max(1, Math.hypot(x, z));
    return { x: x / norm, z: z / norm };
  }

  bindTouch(pad, stick, buttons) {
    let pointer = null;
    const update = event => {
      const box = pad.getBoundingClientRect();
      const radius = box.width * 0.39;
      const x = (event.clientX - box.left - box.width / 2) / radius;
      const y = (event.clientY - box.top - box.height / 2) / radius;
      const scale = Math.max(1, Math.hypot(x, y));
      this.touchDirection = { x: x / scale, z: -y / scale };
      stick.style.transform = `translate(${x / scale * radius}px, ${y / scale * radius}px)`;
    };
    pad.addEventListener('pointerdown', event => {
      if (pointer !== null || !this.enabled()) return;
      pointer = event.pointerId;
      pad.setPointerCapture(pointer);
      update(event);
    });
    pad.addEventListener('pointermove', event => {
      if (event.pointerId === pointer) update(event);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, event => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      this.touchDirection = { x: 0, z: 0 };
      stick.style.transform = '';
    });
    for (const button of buttons) {
      button.addEventListener('pointerdown', event => {
        if (!this.enabled()) return;
        event.preventDefault();
        const command = button.dataset.feint === 'true' ? 'feint' : button.dataset.action;
        if (command === 'block') {
          button.setPointerCapture(event.pointerId);
          this.holdGuard('touch');
        } else this.action(command);
      });
      if (button.dataset.action === 'block') {
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
          button.addEventListener(type, () => this.releaseGuard('touch'));
        }
      }
    }
  }
}
