import * as THREE from 'three';
import type { War } from './war';

/**
 * Four visible kingdoms rather than four isolated keeps. Town blocks, outer
 * curtain walls, gatehouses, satellite villages and farms are visual-only:
 * existing deterministic unit paths, outposts and saves remain unchanged.
 * All repeated architecture uses GPU instancing to avoid increasing draw calls.
 */
export function createKingdomScenery(parent: THREE.Group, war: War): void {
  const scenery = new THREE.Group();
  scenery.name = 'Four medieval kingdoms — walled towns and satellite settlements';
  parent.add(scenery);

  const stone = new THREE.MeshStandardMaterial({ color: 0x8c8b79, roughness: .94 });
  const chalk = new THREE.MeshStandardMaterial({ color: 0xc0b49b, roughness: .9 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x584333, roughness: .92 });
  const road = new THREE.MeshStandardMaterial({ color: 0x80745c, roughness: 1 });
  const tilled = new THREE.MeshStandardMaterial({ color: 0x6d593b, roughness: 1 });
  const crops = new THREE.MeshStandardMaterial({ color: 0x9fa56c, roughness: 1 });
  const foliage = new THREE.MeshStandardMaterial({ color: 0x526d44, roughness: 1 });
  const roofMats = [0x31635c, 0x9b5150, 0xc19744, 0x765a97].map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: .9 }));

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const tower = new THREE.CylinderGeometry(.5, .55, 1, 8);
  const roofCone = new THREE.ConeGeometry(.5, 1, 4);
  const treeTop = new THREE.ConeGeometry(.5, 1, 6);
  type Batch = { mesh: THREE.InstancedMesh; used: number; capacity: number };
  const create = (geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number): Batch => {
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false; // Dense towns share the shadow budget with 600 moving troops.
    mesh.receiveShadow = true;
    scenery.add(mesh);
    return { mesh, used: 0, capacity };
  };

  const walls = create(cube, stone, 120), battlements = create(cube, chalk, 300);
  const turrets = create(tower, stone, 80), doors = create(cube, timber, 70);
  const homes = create(cube, chalk, 520), beams = create(cube, timber, 400);
  const roofs = roofMats.map(mat => create(roofCone, mat, 180));
  const towerRoofs = roofMats.map(mat => create(roofCone, mat, 30));
  const avenues = create(cube, road, 110), fields = create(cube, tilled, 260);
  const wheat = create(cube, crops, 380), trees = create(treeTop, foliage, 360);
  const flags = roofMats.map(mat => create(cube, mat, 30));
  const dummy = new THREE.Object3D();
  const stamp = (batch: Batch, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, rotation = 0) => {
    if (batch.used >= batch.capacity) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    batch.mesh.setMatrixAt(batch.used++, dummy.matrix);
  };
  let seed = 946153;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const placeHouse = (owner: number, x: number, z: number, size = 1, rotation = 0) => {
    const height = (3.2 + random() * 2.6) * size;
    const width = (3.6 + random() * 1.5) * size;
    stamp(homes, x, height * .5, z, width, height, width * .87, rotation);
    stamp(roofs[owner], x, height + size * 1.28, z, width * 1.8, size * 3.2, width * 1.65,
      Math.PI / 4 + rotation);
    // Timber shopfronts, doors and first-floor windows.
    if (random() > .22) stamp(doors, x + .6 * size, height * .34, z + width * .43,
      1.25 * size, 2.2 * size, .15, rotation);
    if (random() > .45) stamp(beams, x - width * .36, height * .68, z + width * .43,
      .38, 1.25 * size, .2, rotation);
  };

  for (const faction of war.factions) {
    const { x: fx, z: fz, id } = faction;
    const outwardX = Math.sign(fx), outwardZ = Math.sign(fz);
    // Well-defined medieval city blocks behind a four-gate stone curtain wall.
    // Every gate has a wide, visually open road; military movement is unaffected.
    for (const direction of [-1, 1]) {
      for (const side of [-1, 1]) {
        const center = side * 33.5;
        // Two perimeter segments on each of the four walls, leaving 21m gates.
        stamp(walls, fx + center, 4.7, fz + direction * 57, 46, 9.4, 2.2);
        stamp(walls, fx + direction * 57, 4.7, fz + center, 2.2, 9.4, 46);
        for (let index = 0; index < 7; index++) {
          const offset = center - 20 + index * 6.5;
          stamp(battlements, fx + offset, 9.8, fz + direction * 57, 3, 1.2, 2.8);
          stamp(battlements, fx + direction * 57, 9.8, fz + offset, 2.8, 1.2, 3);
        }
        // Gate approaches and short outer routes to surrounding farmlands.
        stamp(avenues, fx + direction * 67, .03, fz, 40, .12, 6.6);
        stamp(avenues, fx, .03, fz + direction * 67, 6.6, .12, 40);
      }
    }
    for (const dx of [-57, 57]) for (const dz of [-57, 57]) {
      stamp(turrets, fx + dx, 7.3, fz + dz, 10, 14.6, 10);
      stamp(towerRoofs[id], fx + dx, 16.1, fz + dz, 13.5, 5.1, 13.5, Math.PI / 4);
      stamp(flags[id], fx + dx + 4, 21, fz + dz, 6.8, 2.3, .2);
    }
    for (const dx of [-57, 57]) {
      stamp(turrets, fx + dx, 5.5, fz - 11, 5.8, 11, 5.8);
      stamp(turrets, fx + dx, 5.5, fz + 11, 5.8, 11, 5.8);
    }
    // Paved high street and pedestrian squares organize the city into districts.
    stamp(avenues, fx, .04, fz, 12, .12, 104);
    stamp(avenues, fx, .05, fz, 104, .12, 12);
    for (const dx of [-33, 33]) for (const dz of [-33, 33])
      stamp(avenues, fx + dx, .05, fz + dz, 16, .12, 16);

    // Build dense, irregular townhouse neighborhoods while preserving the keep,
    // the 5x5 player construction plaza and the major four-way troop roads.
    for (let row = -4; row <= 4; row++) for (let col = -4; col <= 4; col++) {
      const lx = col * 10.9 + (random() - .5) * 2.5;
      const lz = row * 10.9 + (random() - .5) * 2.5;
      if (Math.abs(lx) < 9 || Math.abs(lz) < 9 || Math.hypot(lx,lz) < 24) continue;
      if (id === 0 && lx > 10 && Math.abs(lz) < 37) continue; // Existing buildable district.
      if (random() < .13) continue; // Small squares and alleyways.
      placeHouse(id, fx + lx, fz + lz, .9 + random() * .3);
    }

    // The realm extends far beyond its capital: three countryside villages,
    // farmlands, orchards and cobbled country roads around each city.
    const hamlets = [
      [fx + outwardX * 92, fz + outwardZ * 5],
      [fx + outwardX * 7, fz + outwardZ * 94],
      [fx + outwardX * 78, fz + outwardZ * 77],
    ] as const;
    for (const [hx, hz] of hamlets) {
      if (Math.abs(hx) > 240 || Math.abs(hz) > 240) continue;
      for (let i = 0; i < 14; i++) {
        const theta = i * 2.399 + random() * .45;
        const r = 6 + Math.floor(i / 4) * 5.2 + random() * 3;
        const x = hx + Math.cos(theta) * r, z = hz + Math.sin(theta) * r;
        if (Math.abs(x) > 245 || Math.abs(z) > 245 ||
            war.outposts.some(post => Math.hypot(post.x-x,post.z-z) < 15)) continue;
        placeHouse(id,x,z,.75 + random() * .28, theta*.25);
      }
      // Golden crops and a planted orchard make the settlement an inhabited village.
      for (let i = 0; i < 16; i++) {
        const dx = (i % 4 - 1.5) * 5.8, dz = (Math.floor(i / 4) - 1.5) * 5.8;
        const x = hx + outwardX * 29 + dx, z = hz + outwardZ * 29 + dz;
        if (Math.abs(x) > 247 || Math.abs(z) > 247) continue;
        stamp(fields,x,.015,z,5.1,.045,5.1);
        stamp(wheat,x,.22,z,4.6,.39,4.55);
      }
      for (let i = 0; i < 12; i++) {
        const x = hx - outwardX * 29 + (i%4 - 1.5)*7;
        const z = hz - outwardZ * 27 + (Math.floor(i/4)-1)*8;
        if(Math.abs(x)>247||Math.abs(z)>247)continue;
        stamp(trees,x,3.6,z,5.1,7.2,5.1);
      }
    }
  }

  for(const batch of [walls,battlements,turrets,doors,homes,beams,...roofs,
    ...towerRoofs,avenues,fields,wheat,trees,...flags]){
    batch.mesh.count=batch.used;
    batch.mesh.instanceMatrix.needsUpdate=true;
  }
}
