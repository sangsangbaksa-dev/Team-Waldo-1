import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../src/ui/input.js';

class Target extends EventTarget {
  captured = new Set();
  style = {};
  dataset = {};
  reads = 0;
  getBoundingClientRect() { this.reads++; return { left: 0, top: 0, width: 100, height: 100 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  emit(type, id, x = 50, y = 50) {
    this.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: id, pointerType: 'touch', clientX: x, clientY: y }));
  }
}
function setup() {
  globalThis.window = new Target();
  globalThis.document = new Target();
  const pad = new Target(), stick = new Target(), block = new Target(), calls = [];
  block.dataset.action = 'block';
  const controls = new Controls({ enabled: () => true, action: a => calls.push(a), escape: () => {}, lighting: new Target() });
  controls.bindTouch(pad, stick, [block]);
  return { controls, pad, stick, block, calls };
}

test('clear releases joystick and ignores stale movement', () => {
  const { controls, pad, stick } = setup();
  pad.emit('pointerdown', 1, 89);
  pad.emit('pointermove', 1, 80);
  assert.equal(pad.reads, 1);
  assert.ok(controls.direction.x > 0);
  controls.clear();
  assert.equal(pad.hasPointerCapture(1), false);
  assert.equal(stick.style.transform, '');
  pad.emit('pointermove', 1, 89);
  assert.equal(controls.direction.x, 0);
  pad.emit('pointerdown', 2, 11);
  assert.equal(controls.direction.x, -1);
});

test('guard stays held until every active pointer releases', () => {
  const { controls, block, calls } = setup();
  block.emit('pointerdown', 1);
  block.emit('pointerdown', 2);
  block.emit('pointercancel', 1);
  assert.equal(controls.guard.size, 1);
  assert.deepEqual(calls, ['block']);
  block.emit('lostpointercapture', 2);
  assert.deepEqual(calls, ['block', 'release']);
  assert.equal(controls.guard.size, 0);
});
