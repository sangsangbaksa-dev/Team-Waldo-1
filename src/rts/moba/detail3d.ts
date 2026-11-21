import * as THREE from 'three';
import { LANE_PTS, LANES, NEXUS } from './config';

// Static details are batched so the additional scenery does not add draw calls per stone.
export function addLaneDetails(scene: THREE.Scene, quality: 'high' | 'standard' | 'low'): void {
  const count = quality === 'low' ? 350 : quality === 'standard' ? 750 : 1100;
  const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd8c8a3, roughness: 0.92 }), count);
  const matrix = new THREE.Matrix4(), rot = new THREE.Quaternion(), scale = new THREE.Vector3(), pos = new THREE.Vector3(), color = new THREE.Color();
  let seed = 491, used = 0;
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (const lane of LANES) {
    const points = LANE_PTS[lane];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.y - a.y, length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
      const angle = -Math.atan2(dz, dx);
      rot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      for (let d = 0.7; d < length && used < count; d += quality === 'low' ? 1.8 : 1.15) {
        for (let row = -2; row <= 2 && used < count; row++) {
          if (random() < 0.14) continue;
          const offset = row * 1.05 + (random() - 0.5) * 0.16;
          const x = a.x + ux * d - uz * offset, z = a.y + uz * d + ux * offset;
          if (NEXUS.some(n => Math.hypot(n.x - x, n.y - z) < 12)) continue;
          pos.set(x, 0.018 + random() * 0.012, z); scale.set(0.87 + random() * 0.2, 0.035, 0.84 + random() * 0.15);
          matrix.compose(pos, rot, scale); slabs.setMatrixAt(used, matrix);
          color.setHSL(0.105, 0.15, 0.57 + random() * 0.15); slabs.setColorAt(used++, color);
        }
      }
    }
  }
  slabs.count = used; slabs.receiveShadow = true; slabs.instanceMatrix.needsUpdate = true;
  if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
  scene.add(slabs);

  const stone = new THREE.MeshStandardMaterial({ color: 0x6e7771, roughness: 0.88 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xbaa77b, metalness: 0.48, roughness: 0.48 });
  const baseGeo = new THREE.CylinderGeometry(1, 1.18, 0.32, 8);
  const columnGeo = new THREE.CylinderGeometry(0.28, 0.36, 2.1, 8);
  const capGeo = new THREE.CylinderGeometry(0.53, 0.4, 0.22, 8);
  const crystalGeo = new THREE.OctahedronGeometry(0.38, 0);
  const ringGeo = new THREE.TorusGeometry(1.5, 0.045, 6, 32);
  for (let team = 0; team < 2; team++) {
    const tint = team === 0 ? 0x5fbaff : 0xff7357;
    const jewel = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.22 });
    const n = NEXUS[team];
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, x = n.x + Math.cos(a) * 12.3, z = n.y + Math.sin(a) * 12.3;
      const pedestal = new THREE.Group(); pedestal.position.set(x, 0.04, z);
      const base = new THREE.Mesh(baseGeo, stone), column = new THREE.Mesh(columnGeo, stone), cap = new THREE.Mesh(capGeo, trim), gem = new THREE.Mesh(crystalGeo, jewel);
      base.position.y = 0.16; column.position.y = 1.25; cap.position.y = 2.4; gem.position.y = 2.86; gem.scale.y = 1.45;
      pedestal.add(base, column, cap, gem); scene.add(pedestal);
    }
    const ornament = new THREE.Mesh(ringGeo, trim); ornament.rotation.x = Math.PI / 2; ornament.position.set(n.x, 0.39, n.y); ornament.scale.setScalar(5.1); scene.add(ornament);
  }
}

export function decorateStructure(root: THREE.Group, team: number, nexus: boolean): void {
  const tint = team === 0 ? 0x5bbcff : 0xff7051;
  const stone = new THREE.MeshStandardMaterial({ color: 0x59636b, metalness: 0.25, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc4a96b, metalness: 0.7, roughness: 0.35 });
  const light = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 1.5, metalness: 0.2, roughness: 0.25 });
  const radius = nexus ? 2.5 : 1.35;
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, 0.22, 8), stone); plinth.position.y = 0.12; plinth.receiveShadow = true; root.add(plinth);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.86, 0.055, 6, 32), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; root.add(ring);
  const pillarGeo = new THREE.CylinderGeometry(0.13, 0.2, nexus ? 1.7 : 1.1, 6), gemGeo = new THREE.OctahedronGeometry(nexus ? 0.23 : 0.16);
  for (let i = 0; i < (nexus ? 8 : 4); i++) {
    const a = i * Math.PI * 2 / (nexus ? 8 : 4), x = Math.cos(a) * radius * 0.8, z = Math.sin(a) * radius * 0.8;
    const pillar = new THREE.Mesh(pillarGeo, gold), gem = new THREE.Mesh(gemGeo, light);
    pillar.position.set(x, nexus ? 1.05 : 0.75, z); gem.position.set(x, nexus ? 2.04 : 1.39, z); gem.scale.y = 1.5; root.add(pillar, gem);
  }
}
