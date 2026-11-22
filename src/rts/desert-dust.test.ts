import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DesertProps } from './desert';
import type { RtsMap } from './map';

function dustField() {
  // Build the animated particle field without constructing base scenery
  // or requiring a WebGL renderer.
  const scene = new THREE.Scene();
  const props = Object.create(DesertProps.prototype) as DesertProps;
  Object.assign(props, { scene, map: { size: 64 } as RtsMap, quality: 'low', dust: null });
  props['dustField']();
  const particles = scene.children.find((item): item is THREE.Points => item instanceof THREE.Points)!;
  return { props, particles };
}

describe('FRONTLINE streaming dust vertex positions', () => {
  beforeEach(() => {
    // This visual-only test runs in Vitest's Node environment. A minimal 2D
    // context is enough to build a CanvasTexture; no browser is necessary.
    const gradient = { addColorStop: () => undefined };
    const context = {
      createRadialGradient: () => gradient,
      fillStyle: '',
      fillRect: () => undefined,
    };
    vi.stubGlobal('document', { createElement: () => ({ width: 32, height: 32, getContext: () => context }) });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('uses the GPU upload array directly without static draw usage', () => {
    const { props, particles } = dustField();
    const attribute = particles.geometry.attributes.position as THREE.BufferAttribute;
    expect(attribute.usage).toBe(THREE.DynamicDrawUsage);
    expect(attribute.count).toBe(80);
    props.dispose();
  });

  it('never accumulates base-position drift after moving forward and backward in time', () => {
    const { props, particles } = dustField();
    const attribute = particles.geometry.attributes.position as THREE.BufferAttribute;
    const tick = props['dustTick']!;
    tick(0);
    const base = Float32Array.from(attribute.array);
    tick(11);
    expect(Array.from(attribute.array)).not.toEqual(Array.from(base));
    tick(0);
    expect(Array.from(attribute.array)).toEqual(Array.from(base));
    tick(25);
    tick(0);
    expect(Array.from(attribute.array)).toEqual(Array.from(base));
    props.dispose();
  });
});
