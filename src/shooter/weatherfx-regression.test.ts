import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WeatherFx } from './weatherfx';
import type { GameMap } from './world';

const map = () => ({
  seed: 42, terrain: { forests: [], ponds: [], rivers: [] },
}) as unknown as GameMap;

function rainPositions(weather: WeatherFx): THREE.BufferAttribute {
  const rain = weather.group.children.find(
    (child): child is THREE.LineSegments => child instanceof THREE.LineSegments,
  );
  expect(rain).toBeDefined();
  return rain!.geometry.attributes.position as THREE.BufferAttribute;
}

describe('ZERO ZONE rain camera-follow behavior', () => {
  it('keeps all active rain within the view region far from the map origin', () => {
    const fx = new WeatherFx(map(), new THREE.Texture(), 'standard');
    const camera = new THREE.Vector3(650, 18, -450);
    fx.update(1 / 60, 20, camera);
    const positions = rainPositions(fx);
    expect(positions.count).toBe(1120); // two vertices per streak
    for (let i = 0; i < positions.count; i += 2) {
      expect(Math.abs(positions.getX(i) - camera.x)).toBeLessThanOrEqual(46.01);
      expect(Math.abs(positions.getZ(i) - camera.z)).toBeLessThanOrEqual(46.01);
    }
  });

  it('moves the rain field with the player without drifting during world travel', () => {
    const fx = new WeatherFx(map(), new THREE.Texture(), 'high');
    const p = rainPositions(fx);
    const origin = new THREE.Vector3(8, 14, -15);
    fx.update(0, 0, origin);
    const x = p.getX(0), z = p.getZ(0);
    const moved = new THREE.Vector3(-310, 14, 720);
    fx.update(0, 1, moved);
    expect(p.getX(0) - x).toBeCloseTo(moved.x - origin.x, 4);
    expect(p.getZ(0) - z).toBeCloseTo(moved.z - origin.z, 4);
  });

  it('skips expensive rain geometry in low quality mode', () => {
    const fx = new WeatherFx(map(), new THREE.Texture(), 'low');
    expect(fx.group.children.some(child => child instanceof THREE.LineSegments)).toBe(false);
    expect(() => fx.update(1 / 30, 2, new THREE.Vector3(450, 3, 150))).not.toThrow();
  });
});
