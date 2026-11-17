// 공용 캐릭터 — GLB 노드를 재질 이름별(고정색/팀/피부/발광) 정점색 지오메트리로 굽습니다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Baked { fixed: THREE.BufferGeometry | null; team: THREE.BufferGeometry | null; skin: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }
const isGlow = (n: string): boolean => n.startsWith('Glow');
const white = new THREE.Color(1, 1, 1);

/** 노드 안의 모든 메시를 노드 로컬 좌표로 합쳐 재질 이름별(고정색/팀/피부/발광) 지오메트리로 굽습니다. */
export function bake(root: THREE.Object3D): Baked {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const lists: Record<keyof Baked, THREE.BufferGeometry[]> = { fixed: [], team: [], skin: [], glow: [] };
  root.traverse(o => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material], src = mesh.geometry;
    const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const groups = src.groups.length ? src.groups : [{ start: 0, count: src.index ? src.index.count : src.attributes.position.count, materialIndex: 0 }];
    const flat = src.index ? src.toNonIndexed() : src.clone(); const nonIndexedGroups = src.index ? groups.map(g => ({ ...g })) : groups;
    // toNonIndexed 는 그룹 범위를 유지(인덱스 순서가 그대로 펼쳐짐)
    for (const g of nonIndexedGroups) {
      const mat = mats[g.materialIndex ?? 0] as THREE.MeshStandardMaterial, name = mat.name;
      const part = new THREE.BufferGeometry(), pos = flat.attributes.position, nor = flat.attributes.normal;
      const n = g.count, p = new Float32Array(n * 3), nn = new Float32Array(n * 3), c = new Float32Array(n * 3);
      const col = name === 'Team' || name === 'Skin' ? white : (isGlow(name) && mat.emissive ? mat.emissive : mat.color);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, g.start + i).applyMatrix4(m), nv = new THREE.Vector3().fromBufferAttribute(nor, g.start + i).transformDirection(m);
        p.set([v.x, v.y, v.z], i * 3); nn.set([nv.x, nv.y, nv.z], i * 3); c.set([col.r, col.g, col.b], i * 3);
      }
      part.setAttribute('position', new THREE.BufferAttribute(p, 3)); part.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); part.setAttribute('color', new THREE.BufferAttribute(c, 3));
      lists[name === 'Team' ? 'team' : name === 'Skin' ? 'skin' : isGlow(name) ? 'glow' : 'fixed'].push(part);
    }
    flat.dispose();
  });
  const join = (l: THREE.BufferGeometry[]): THREE.BufferGeometry | null => (l.length ? mergeGeometries(l, false) : null);
  return { fixed: join(lists.fixed), team: join(lists.team), skin: join(lists.skin), glow: join(lists.glow) };
}

