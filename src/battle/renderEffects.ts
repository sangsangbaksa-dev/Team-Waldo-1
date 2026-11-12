import * as THREE from 'three';

interface Spark {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; duration: number; size: number; color: number;
}

/** A single instanced draw call handles bounded, short-lived combat sparks. */
export function createBattleEffects(parent: THREE.Group) {
  const capacity = 240;
  const geometry = new THREE.OctahedronGeometry(0.5, 0);
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 2;
  parent.add(mesh);
  const sparks: Spark[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let sequence = 0;
  let enabled = true;

  return {
    burst(x: number, y: number, z: number, tint: number, amount = 8, power = 1) {
      if (!enabled) return;
      for (let i = 0; i < amount && sparks.length < capacity; i++) {
        const phase = ++sequence * 2.399963;
        const speed = (2.8 + sequence % 4) * power;
        sparks.push({ x, y, z, vx: Math.cos(phase) * speed, vy: (3 + i % 4) * power,
          vz: Math.sin(phase) * speed, age: 0, duration: 0.3 + (i % 4) * 0.11,
          size: (0.4 + (i % 3) * 0.16) * power, color: tint });
      }
    },
    update(dt: number) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.age += dt;
        if (p.age >= p.duration) { sparks.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= 16 * dt;
      }
      sparks.forEach((p, i) => {
        dummy.position.set(p.x, Math.max(0.1, p.y), p.z);
        dummy.rotation.set(p.age * 5, i * 2.399, p.age * 3);
        dummy.scale.setScalar(p.size * (1 - p.age / p.duration));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, color.setHex(p.color));
      });
      mesh.count = sparks.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) { sparks.length = 0; mesh.count = 0; }
    },
    dispose() {
      sparks.length = 0;
      mesh.removeFromParent();
      geometry.dispose(); material.dispose();
    },
  };
}
