import * as THREE from 'three';
import type { UnitKind, War } from './war';

/**
 * Visual-only art direction. Everything here is deterministic, instanced or
 * batched; it never changes collision, navigation, resources or saved games.
 */
export function createVisualDetails() {
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const column = new THREE.CylinderGeometry(.5, .5, 1, 8);
  const cone = new THREE.ConeGeometry(.5, 1, 7);
  const rock = new THREE.DodecahedronGeometry(.5, 0);
  const orb = new THREE.SphereGeometry(.5, 10, 7);
  const ring = new THREE.TorusGeometry(.5, .075, 6, 14);
  const mat = (color: number, metalness = 0, roughness = .9) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const slate = mat(0x23383e), iron = mat(0x2f3e45, .65, .47),
    agedSteel = mat(0x879893, .58, .52), bronze = mat(0xbe9c63, .62, .38),
    limestone = mat(0xa7b0a5), darkStone = mat(0x4d5b5a),
    soot = mat(0x292d2b), timber = mat(0x594232), paleWood = mat(0x8d7253),
    canvas = mat(0xa59a7d), moss = mat(0x3b5244),
    grass = mat(0x40594a), grassLight = mat(0x5d7661),
    bark = mat(0x514133), fir = mat(0x2b493d), firLight = mat(0x3e5f50),
    skin = mat(0xc6a98d), leather = mat(0x5b3e33), horse = mat(0x6d5343);
  const regalia = [0x368c85, 0xb75d5a, 0xba984e, 0x806ca8].map(c => mat(c, .15, .72));
  const cloak = [0x244b48, 0x713b3b, 0x66532a, 0x493b66].map(c => mat(c));
  const geometries = [cube, column, cone, rock, orb, ring];
  const materials = [slate, iron, agedSteel, bronze, limestone, darkStone, soot, timber, paleWood,
    canvas, moss, grass, grassLight, bark, fir, firLight, skin, leather, horse, ...regalia, ...cloak];
  const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
    x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (root: THREE.Object3D, material: THREE.Material,
    x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    add(root, cube, material, x, y, z, sx, sy, sz);
  const rng = (start: number) => {
    let seed = start >>> 0;
    return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  };

  function landscape(parent: THREE.Group, war: War): void {
    const random = rng(8273549), dummy = new THREE.Object3D();
    const clear = (x: number, z: number, radius = 0) => {
      if (Math.abs(x) > 249 || Math.abs(z) > 249) return false;
      if (war.factions.some(f => Math.hypot(x - f.x, z - f.z) < 25 + radius)) return false;
      if (war.outposts.some(p => Math.hypot(x - p.x, z - p.z) < 13 + radius)) return false;
      // Keep the great roads legible and open for armies.
      if (Math.abs(Math.abs(x) - Math.abs(z)) < 4 + radius) return false;
      if (Math.min(Math.abs(x), Math.abs(z)) < 3.6 + radius &&
        Math.max(Math.abs(x), Math.abs(z)) < 120) return false;
      return true;
    };
    const inst = (geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) => {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      parent.add(mesh);
      return mesh;
    };
    const trunks = inst(column, bark, 320), canopies = inst(cone, fir, 320),
      upper = inst(cone, firLight, 320), bushes = inst(orb, moss, 750),
      stones = inst(rock, darkStone, 380),
      tufts = inst(cone, grass, 1600), highlights = inst(cone, grassLight, 1100);
    const set = (mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number,
      sx: number, sy: number, sz: number, angle = 0) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    };
    let pineCount = 0, bushCount = 0, stoneCount = 0, tuftCount = 0, lightCount = 0;
    for (let trial = 0; trial < 3200; trial++) {
      const x = (random() - .5) * 485, z = (random() - .5) * 485;
      if (!clear(x, z)) continue;
      const pocket = .5 + .5 * Math.sin(x * .047 + 1.5) * Math.cos(z * .041);
      if (pineCount < 320 && random() < pocket * .19) {
        const h = 3.5 + random() * 3.1;
        set(trunks, pineCount, x, h * .29, z, .48, h * .6, .48);
        set(canopies, pineCount, x, h * .66, z, h * .42, h * .72, h * .42, random() * 6.28);
        set(upper, pineCount, x, h * 1.02, z, h * .3, h * .54, h * .3, random() * 6.28);
        pineCount++;
      } else if (bushCount < 750 && random() < .43) {
        const s = .55 + random() * 1.6;
        set(bushes, bushCount++, x, s * .34, z, s * 1.5, s * .75, s * 1.2, random() * 6.28);
      } else if (stoneCount < 380 && random() < .28) {
        const s = .32 + random() * 1.1;
        set(stones, stoneCount++, x, s * .25, z, s * 1.2, s * .75, s, random() * 6.28);
      }
    }
    for (let trial = 0; trial < 7400 && (tuftCount < 1600 || lightCount < 1100); trial++) {
      const x = (random() - .5) * 495, z = (random() - .5) * 495;
      if (!clear(x, z)) continue;
      const s = .38 + random() * .95, angle = random() * 6.28;
      if (random() < .58 && tuftCount < 1600)
        set(tufts, tuftCount++, x, s * .39, z, s * .37, s * 1.25, s * .36, angle);
      else if (lightCount < 1100)
        set(highlights, lightCount++, x, s * .3, z, s * .4, s, s * .34, angle);
    }
    [[trunks, pineCount], [canopies, pineCount], [upper, pineCount],
      [bushes, bushCount], [stones, stoneCount], [tufts, tuftCount], [highlights, lightCount]]
      .forEach(([mesh, count]) => {
        (mesh as THREE.InstancedMesh).count = count as number;
        (mesh as THREE.InstancedMesh).instanceMatrix.needsUpdate = true;
      });
  }

  function fortress(root: THREE.Group, buildings: THREE.Group[], owner: number): void {
    // Cut-stone courses, arrow loops and an iron portcullis make the base read
    // as a fortified settlement rather than a collection of plain blocks.
    for (const side of [-1, 1]) {
      for (let i = -3; i <= 3; i++) {
        const z = i * 1.75;
        box(root, darkStone, side * 7.72, 1.75, z, .22, 2.9, 1.15);
        box(root, soot, side * 7.83, 2.6, z + .36, .1, .8, .13);
        box(root, limestone, side * 7.76, .5, z, .5, .4, 1.35);
      }
      for (let i = -3; i <= 3; i++) {
        const x = i * 1.75;
        box(root, darkStone, x, 1.55, -7.78, 1.35, 2.6, .22);
        box(root, limestone, x, .5, -7.76, 1.5, .42, .45);
      }
    }
    // Portcullis, gate rivets, heraldic field standards.
    for (let i = -3; i <= 3; i++) box(root, iron, i * .48, 1.85, 7.99, .11, 3.25, .14);
    for (const y of [.8, 1.9, 3.0]) box(root, iron, 0, y, 8.07, 3.42, .12, .14);
    for (const x of [-2.2, 2.2]) {
      box(root, bronze, x, 3.7, 8.02, .23, .23, .25);
      box(root, iron, x * 1.8, 2.4, 8.01, .12, 4.3, .12);
      box(root, regalia[owner], x * 1.8 + .47, 4.1, 8, .87, 1.65, .1);
    }
    // Deep-set windows and reinforcing buttresses on the central keep.
    for (const y of [5.6, 8.7, 11.45]) {
      for (const x of [-2.8, 0, 2.8]) {
        box(root, soot, x, y, 4.48, .67, 1.3, .17);
        box(root, limestone, x, y + .75, 4.55, 1.12, .22, .34);
        box(root, bronze, x, y - .68, 4.56, .76, .13, .25);
      }
    }
    for (const x of [-4.7, 4.7])
      for (const z of [-4.8, 3.7])
        box(root, darkStone, x, 5.9, z, .73, 11.4, .73);
    // Farms: barn trusses, grain silos and neat rows of crops.
    const farm = buildings[0];
    for (const x of [-2.8, 2.8]) {
      box(farm, paleWood, x, 2, 2.79, .31, 3.1, .2);
      box(farm, darkStone, x, .35, 2.9, .8, .7, .85);
    }
    for (const x of [-5.1, -3.1, -1.1, .9, 2.9, 4.9])
      for (let z = 5; z < 10; z += 1.4)
        add(farm, cone, grassLight, x, .46, z, .56, .92, .56);
    for (const x of [-4.1, 4.1]) {
      add(farm, column, paleWood, x, 2, -3.5, 2.4, 4, 2.4);
      add(farm, cone, slate, x, 4.5, -3.5, 3.2, 2.3, 3.2);
      box(farm, iron, x, 2.6, -2.23, .65, .65, .1);
    }
    // Mine: timber headframe, winding drum and mineral ore stockpile.
    const mine = buildings[1];
    for (const x of [-3.3, 3.3]) {
      box(mine, timber, x, 4.3, 2.7, .5, 8.2, .5);
      const brace = box(mine, paleWood, x * .53, 5.4, 2.7, .3, 6.5, .3);
      brace.rotation.z = x > 0 ? -.42 : .42;
    }
    box(mine, timber, 0, 8.2, 2.7, 7.5, .55, .65);
    add(mine, ring, iron, 0, 6.6, 2.8, 2.8, 2.8, 2.8).rotation.y = Math.PI / 2;
    add(mine, column, bronze, 0, 6.6, 2.8, .45, 2.0, .45).rotation.z = Math.PI / 2;
    for (const x of [-2.9, 2.9])
      for (const z of [6.6, 8.2]) box(mine, timber, x, .24, z, .36, .48, 3.3);
    for (let i = 0; i < 7; i++) {
      const chunk = add(mine, rock, i % 2 ? darkStone : bronze, -4.5 + i * 1.2, .35, 7.9 + (i % 3), 1.6, 1.1, 1.4);
      chunk.rotation.y = i * 1.3;
    }
    // Barracks: armor racks, drill pennants, forge and training yard.
    const barracks = buildings[2];
    for (const x of [-2.9, 2.9]) {
      box(barracks, slate, x, 3.15, 3.48, 1.45, 2.1, .24);
      box(barracks, bronze, x, 4.35, 3.48, 1.62, .18, .28);
      box(barracks, iron, x, 1.9, 3.61, .92, 1.4, .14);
    }
    for (const x of [-5.2, 5.2]) {
      box(barracks, timber, x, 3.15, -2.7, .3, 6.2, .3);
      box(barracks, regalia[owner], x + .57, 5.1, -2.7, 1.05, 1.25, .12);
    }
    for (let i = 0; i < 4; i++) {
      box(barracks, timber, -3 + i * 2, .7, 6.0, .35, 1.1, .35);
      box(barracks, agedSteel, -3 + i * 2, 1.8, 6.0, .1, 1.55, .16);
    }
  }

  function soldier(rider: THREE.Group, mount: THREE.Group, kind: UnitKind, owner: number): void {
    const heavy = kind === 'guardian';
    const cavalry = kind === 'cavalry';
    const color = regalia[owner];
    // Faction colors appear on surcoats and shields, while plate remains steel.
    box(rider, cloak[owner], 0, 1.13, -.47, 1.22, 1.7, .19);
    box(rider, color, 0, 1.35, .51, 1.02, 1.18, .15);
    box(rider, bronze, 0, 1.8, .62, .58, .12, .16);
    box(rider, iron, 0, 1.02, .62, .99, .12, .16);
    for (const x of [-.75, .75]) {
      add(rider, orb, heavy ? agedSteel : leather, x, 1.94, 0,
        heavy ? .98 : .7, .61, .96);
      box(rider, iron, x, .53, .06, heavy ? .48 : .3, .48, .73);
      box(rider, agedSteel, x * .53, .18, .45, .46, .22, .5);
    }
    // Helm brim, nasal guard and a narrow, low military crest.
    add(rider, column, heavy ? agedSteel : slate, 0, 2.83, 0, 1.18, .32, 1.17);
    box(rider, agedSteel, 0, 2.56, .5, .15, .82, .16);
    if (heavy) {
      box(rider, bronze, 0, 3.66, 0, .2, .77, .7);
      box(rider, iron, 0, 2.3, .5, 1.0, .2, .2);
      box(rider, agedSteel, 0, 1.6, .67, 1.12, 1.02, .14);
      box(rider, bronze, 0, 1.6, .77, .2, 1.03, .15);
    } else {
      box(rider, color, 0, 3.52, -.14, .18, .5, .65);
    }
    if (kind === 'infantry' || heavy) {
      // Layered kite shield with raised central boss.
      const shield = box(rider, color, -1.31, 1.45, .67,
        heavy ? .98 : .79, heavy ? 1.9 : 1.48, .23);
      shield.rotation.z = -.12;
      box(rider, agedSteel, -1.31, 1.49, .81, .16, heavy ? 1.6 : 1.2, .14);
      add(rider, orb, bronze, -1.31, 1.45, .89, .31, .31, .18);
      box(rider, iron, 1.12, 2.4, .55, .16, .48, .19);
    }
    if (kind === 'archer') {
      // Quiver, visible arrow shafts, bracer, weathered leather hood.
      box(rider, leather, -.71, 1.53, -.62, .46, 1.2, .53);
      for (let i = 0; i < 4; i++) {
        box(rider, paleWood, -.85 + i * .1, 2.35 + i * .06, -.64, .06, .94, .06);
        add(rider, cone, agedSteel, -.85 + i * .1, 2.88 + i * .06, -.64, .24, .32, .24);
      }
      box(rider, agedSteel, 1.01, 1.17, .15, .45, .58, .45);
      add(rider, cone, cloak[owner], 0, 3.09, -.35, 1.56, .83, 1.55);
    }
    if (cavalry) {
      // Armored horse tack and a distinct raised neck/mane profile.
      box(mount, leather, 0, 1.55, -.45, 1.75, .38, 1.75);
      box(mount, color, 0, .96, -1.08, 2.08, .72, .66);
      box(mount, agedSteel, 0, 1.95, 1.42, .74, .65, .52);
      box(mount, soot, 0, 2.38, .85, .44, .58, .25);
      for (const x of [-.38, .38]) {
        add(mount, orb, soot, x, 2.26, 1.48, .13, .13, .14);
        box(mount, iron, x * 2.2, .83, -.25, .12, 1.05, .2);
      }
      const tail = box(mount, soot, 0, .95, -1.96, .23, 1.18, .23);
      tail.rotation.x = -.4;
    }
  }

  function dispose(): void {
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }

  return { landscape, fortress, soldier, dispose };
}
