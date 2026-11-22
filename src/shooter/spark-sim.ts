// ZERO ZONE visual effects: keep transient spark particles in a compact
// stable array and stream only visible survivors to the GPU.
import type { BufferAttribute } from 'three';

export interface SparkParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; r: number; g: number; b: number;
}

/** Mutates the original list in place while preserving surviving particles'
 * order. One pass replaces per-expiration splice() and a separate forEach().
 */
export function advanceSparks(
  sparks: SparkParticle[], dt: number, positions: BufferAttribute, colors: BufferAttribute,
): number {
  let active = 0;
  for (let i = 0, count = sparks.length; i < count; i++) {
    const spark = sparks[i];
    spark.life -= dt;
    spark.vy -= 9 * dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.z += spark.vz * dt;
    if (spark.y < 0.02) {
      spark.y = 0.02;
      spark.vy *= -0.3;
      spark.vx *= 0.6;
      spark.vz *= 0.6;
    }
    if (spark.life <= 0) continue;
    sparks[active] = spark;
    positions.setXYZ(active, spark.x, spark.y, spark.z);
    const brightness = Math.min(1, spark.life * 2.5);
    colors.setXYZ(active, spark.r * brightness, spark.g * brightness, spark.b * brightness);
    active++;
  }
  sparks.length = active;
  return active;
}
