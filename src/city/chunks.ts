// LAST CITY — 정적 소품 청크: 도시 전체에 흩어진 인스턴스 메시를 격자 칸으로 쪼개 화면 밖·안개 너머 칸은 그리지 않는다(그림자·반사 패스 포함).
import * as THREE from 'three';

/** 칸 크기: 블록 2개 정도(1120). 너무 작으면 드로우콜이, 너무 크면 컬링 효율이 나빠진다. */
export const CHUNK = 1120;

export interface ChunkRef { mesh: THREE.InstancedMesh; x: number; z: number; r: number }

/** 이미 matrix 가 채워진 InstancedMesh 를 칸별 InstancedMesh 로 바꿔 장면에 넣는다. 원본은 장면에서 뺀다. */
export function chunkInstances(src: THREE.InstancedMesh, scene: THREE.Scene, out: ChunkRef[]): void {
  const n = src.count, arr = src.instanceMatrix.array, cells = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const k = Math.floor(arr[i * 16 + 12] / CHUNK) * 128 + Math.floor(arr[i * 16 + 14] / CHUNK), list = cells.get(k);
    if (list) list.push(i); else cells.set(k, [i]);
  }
  scene.remove(src);
  for (const list of cells.values()) {
    const m = new THREE.InstancedMesh(src.geometry, src.material, list.length);
    m.castShadow = src.castShadow; m.receiveShadow = src.receiveShadow; m.layers.mask = src.layers.mask;
    list.forEach((from, to) => { m.instanceMatrix.array.set(arr.subarray(from * 16, from * 16 + 16), to * 16); });
    m.instanceMatrix.needsUpdate = true; m.frustumCulled = true; m.computeBoundingSphere();
    const s = m.boundingSphere!; scene.add(m); out.push({ mesh: m, x: s.center.x, z: s.center.z, r: s.radius });
  }
  src.dispose();
}

/** 카메라에서 안개 끝보다 먼 칸은 아예 끈다(어차피 안개에 묻혀 보이지 않는다). */
export function cullChunks(list: ChunkRef[], cam: THREE.Vector3, reach: number): void {
  for (const c of list) { const dx = c.x - cam.x, dz = c.z - cam.z; c.mesh.visible = Math.hypot(dx, dz) - c.r < reach; }
}
