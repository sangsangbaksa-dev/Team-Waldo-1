import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../src/ui/input.js';

class Target {
  handlers = new Map();
  captured = new Set();
  style = {};
  dataset = {};
  addEventListener(type, handler) {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }
  emit(type, data = {}) {
    for (const handler of this.handlers.get(type) ?? []) handler({ button: 0, preventDefault() {}, ...data });
  }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}

function fixture() {
  const commands = [];
  const controls = Object.assign(Object.create(Controls.prototype), {
    keys: new Set(), guard: new Set(), touchDirection: { x: 0, z: 0 },
    enabled: () => true, action: command => commands.push(command),
  });
  const pad = new Target(), stick = new Target(), block = new Target();
  block.dataset.action = 'block';
  controls.bindTouch(pad, stick, [block]);
  return { controls, pad, stick, block, commands };
}

test('two fingers and keyboard guard release independently', () => {
  const { controls, block, commands } = fixture();
  controls.holdGuard('KeyQ');
  block.emit('pointerdown', { pointerId: 1 });
  block.emit('pointerdown', { pointerId: 2 });
  block.emit('pointercancel', { pointerId: 1 });
  controls.releaseGuard('KeyQ');
  assert.deepEqual(commands, ['block']);
  block.emit('lostpointercapture', { pointerId: 2 });
  assert.deepEqual(commands, ['block', 'release']);
});

test('clear resets joystick capture and stale pointer moves cannot reactivate it', () => {
  const { controls, pad, stick } = fixture();
  pad.emit('pointerdown', { pointerId: 1, clientX: 90, clientY: 50 });
  assert.ok(controls.direction.x > 0);
  controls.clear();
  assert.equal(stick.style.transform, '');
  assert.equal(pad.hasPointerCapture(1), false);
  pad.emit('pointermove', { pointerId: 1, clientX: 100, clientY: 50 });
  assert.deepEqual(controls.direction, { x: 0, z: 0 });
  pad.emit('pointerdown', { pointerId: 2, clientX: 10, clientY: 50 });
  assert.ok(controls.direction.x < 0);
});
