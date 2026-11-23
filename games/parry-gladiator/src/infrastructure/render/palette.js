import * as THREE from 'three';

export const mix = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;
export const smooth = t => t * t * (3 - 2 * t);
export const easeOut = t => 1 - (1 - t) ** 3;
export const color = value => new THREE.Color(value);

export function randomFrom(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(1664525, n) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

export function standard(color, metalness = 0, roughness = 0.75, extras = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extras });
}

export function mesh(parent, geometry, material, x = 0, y = 0, z = 0, casts = true) {
  const body = new THREE.Mesh(geometry, material);
  body.position.set(x, y, z);
  body.castShadow = casts;
  body.receiveShadow = true;
  parent.add(body);
  return body;
}

export function instances(parent, geometry, material, items, casts = false) {
  const group = new THREE.InstancedMesh(geometry, material, items.length);
  const object = new THREE.Object3D();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    object.position.set(item.x, item.y, item.z);
    object.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
    object.scale.set(item.sx || 1, item.sy || 1, item.sz || 1);
    object.updateMatrix();
    group.setMatrixAt(i, object.matrix);
    if (item.color) group.setColorAt(i, item.color);
  }
  group.castShadow = casts;
  group.receiveShadow = true;
  group.computeBoundingSphere();
  parent.add(group);
  return group;
}
