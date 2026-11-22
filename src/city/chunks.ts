// LAST CITY — 정적 소품 칸(ModelLayer.chunkStatics 가 만든 구역별 InstancedMesh)의 안개 거리 컬링. 화면 밖 칸은 three 의 시야 판정이 걸러내고, 안개 끝 너머 칸은 여기서 끈다.
import type * as THREE from 'three';

export interface ChunkRef { mesh: THREE.InstancedMesh; x: number; z: number; r: number; /** 이 종류가 그려지는 최대 거리(작은 소품일수록 짧다). 없으면 안개 끝까지 */ far?: number; /** 멀 때 대신 그리는 네모(박스) 인스턴스와, 이 거리 안에서만 제대로 그린다 */ proxy?: THREE.InstancedMesh; near?: number }

/** 카메라에서 안개 끝(reach)이나 종류별 최대 거리(far)보다 먼 칸은 아예 끈다. scale 은 화질 단계에 따른 배율. 그림자·반사 패스에도 적용된다. */
export function cullChunks(list: ChunkRef[], cam: THREE.Vector3, reach: number, scale = 1): void {
  for (const c of list) { const dx = c.x - cam.x, dz = c.z - cam.z; const d = Math.hypot(dx, dz) - c.r, cut = d < Math.min(reach, c.far ?? Infinity) * scale, near = !c.proxy || d < (c.near ?? 0) * scale;
    c.mesh.visible = cut && near; if (c.proxy) c.proxy.visible = cut && !near; }
}
