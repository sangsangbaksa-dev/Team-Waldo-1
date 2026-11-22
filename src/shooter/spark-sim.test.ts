import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { advanceSparks, type SparkParticle } from './spark-sim';

const buffers = (size: number) => [
  new THREE.BufferAttribute(new Float32Array(size * 3), 3),
  new THREE.BufferAttribute(new Float32Array(size * 3), 3),
] as const;

function oldStep(sparks: SparkParticle[], dt: number): SparkParticle[] {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.vy -= 9 * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    if (s.y < 0.02) {
      s.y = 0.02; s.vy *= -0.3; s.vx *= 0.6; s.vz *= 0.6;
    }
    if (s.life <= 0) sparks.splice(i, 1);
  }
  return sparks;
}

describe('ZERO ZONE spark renderer single-pass compaction', () => {
  it('removes expired particles without creating a new list or changing survivor order', () => {
    const sparks: SparkParticle[] = [
      { x: 0, y: 2, z: 0, vx: 1, vy: 0, vz: 0, life: 0.05, r: 1, g: 0, b: 0 },
      { x: 3, y: 2, z: 0, vx: 2, vy: 0, vz: 0, life: 0.4, r: 0, g: 1, b: 0 },
      { x: 6, y: 2, z: 0, vx: 1, vy: 0, vz: 0, life: 0.02, r: 0, g: 0, b: 1 },
      { x: 9, y: 2, z: 0, vx: 1, vy: 0, vz: 0, life: 0.5, r: 1, g: 1, b: 0 },
    ];
    const reference = sparks, second = sparks[1], fourth = sparks[3];
    const [positions, colors] = buffers(4);
    expect(advanceSparks(sparks, 0.1, positions, colors)).toBe(2);
    expect(sparks).toBe(reference);
    expect(sparks).toEqual([second, fourth]);
    expect(positions.getX(0)).toBeCloseTo(3.2);
    expect(positions.getX(1)).toBeCloseTo(9.1);
    expect(colors.getY(0)).toBeCloseTo(0.75);
    expect(colors.getX(1)).toBeCloseTo(1);
  });

  it('matches the previous spark physics for seeded frames, including floor bounce', () => {
    let state = 0x4818;
    const random = (): number => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
    const initial: SparkParticle[] = Array.from({ length: 240 }, () => ({
      x: random() * 20, y: random() * 3, z: random() * 20,
      vx: random() * 4 - 2, vy: random() * 4 - 2, vz: random() * 4 - 2,
      life: random() * 0.7, r: random(), g: random(), b: random(),
    }));
    const expected = initial.map(p => ({ ...p })), actual = initial.map(p => ({ ...p }));
    const [pos, col] = buffers(initial.length);
    for (const dt of [0.016, 0.033, 0.18, 0.1, 0.16, 0.4]) {
      oldStep(expected, dt);
      expect(advanceSparks(actual, dt, pos, col)).toBe(expected.length);
      expect(actual).toEqual(expected);
      actual.forEach((p, i) => {
        expect(pos.getX(i)).toBeCloseTo(p.x, 4);
        expect(pos.getY(i)).toBeCloseTo(p.y, 4);
        expect(pos.getZ(i)).toBeCloseTo(p.z, 4);
        expect(col.getX(i)).toBeCloseTo(p.r * Math.min(1, p.life * 2.5), 4);
      });
    }
  });

  it('avoids touching GPU attributes after the last spark fades out', () => {
    const [pos, col] = buffers(5);
    const setPos = vi.spyOn(pos, 'setXYZ'), setColor = vi.spyOn(col, 'setXYZ');
    const sparks: SparkParticle[] = [];
    expect(advanceSparks(sparks, 0.016, pos, col)).toBe(0);
    expect(setPos).not.toHaveBeenCalled();
    expect(setColor).not.toHaveBeenCalled();
  });
});
