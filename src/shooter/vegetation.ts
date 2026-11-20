// Local procedural trees; each species has only two merged geometries (bark and foliage).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type TreeBatch = [THREE.BufferGeometry, THREE.MeshLambertMaterial];

export function makeFallbackTree(pine: boolean, low: boolean): TreeBatch[] {
  const bark: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [];
  const add = (list: THREE.BufferGeometry[], geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void => {
    geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z);
    const flat = geo.index ? geo.toNonIndexed() : geo.clone(); geo.dispose(); list.push(flat);
  };
  const trunkH = pine ? 6.0 : 5.2;
  add(bark, new THREE.CylinderGeometry(pine ? 0.12 : 0.18, 0.32, trunkH, low ? 5 : 8), 0, trunkH / 2, 0);
  if (pine) {
    const count = low ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const k = i / (count - 1), height = 3.5 - k * 0.9, radius = 2.05 - k * 1.25;
      add(leaves, new THREE.ConeGeometry(radius, height, low ? 7 : 11), 0, 3.4 + k * 3.7, 0, 0, i * 0.78);
    }
  } else {
    const count = low ? 4 : 7;
    for (let i = 0; i < count; i++) {
      const a = i * Math.PI * 2 / count, radius = i % 2 ? 1.25 : 1.65, x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      const geo = new THREE.IcosahedronGeometry(1, low ? 0 : 1); geo.scale(1.45, 1.36 + (i % 3) * 0.09, 1.40);
      add(leaves, geo, x, 4.9 + (i % 3) * 0.28, z, 0, i * 1.15);
      if (!low) {
        const from = new THREE.Vector3(0, 3.2, 0), to = new THREE.Vector3(x * 0.82, 4.8, z * 0.82), vec = to.clone().sub(from);
        const branch = new THREE.CylinderGeometry(0.065, 0.14, vec.length(), 5);
        branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.normalize()));
        const center = from.add(to).multiplyScalar(0.5); add(bark, branch, center.x, center.y, center.z);
      }
    }
    const top = new THREE.IcosahedronGeometry(1, low ? 0 : 1); top.scale(1.75, 1.55, 1.65); add(leaves, top, 0, 6.0, 0);
  }
  const merge = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    const out = mergeGeometries(parts, false)!; for (const part of parts) part.dispose(); return out;
  };
  return [
    [merge(bark), new THREE.MeshLambertMaterial({ color: 0x69503b, flatShading: true })],
    [merge(leaves), new THREE.MeshLambertMaterial({ color: pine ? 0x31563b : 0x526f42, flatShading: true })],
  ];
}
