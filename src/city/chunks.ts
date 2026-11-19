// LAST CITY — 정적 소품 칸(ModelLayer.chunkStatics 가 만든 구역별 InstancedMesh)의 안개 거리 컬링. 화면 밖 칸은 three 의 시야 판정이 걸러내고, 안개 끝 너머 칸은 여기서 끈다.
import type * as THREE from 'three';

export interface ChunkRef { mesh: THREE.InstancedMesh; x: number; z: number; r: number }

/** 카메라에서 안개 끝보다 먼 칸은 아예 끈다(어차피 안개에 묻혀 보이지 않는다). 그림자·반사 패스에도 적용된다. */
export function cullChunks(list: ChunkRef[], cam: THREE.Vector3, reach: number): void {
  for (const c of list) { const dx = c.x - cam.x, dz = c.z - cam.z; c.mesh.visible = Math.hypot(dx, dz) - c.r < reach; }
}
