import * as THREE from 'three';
import type { BattlefieldFeature, BattlefieldFeatureKind } from './battlefieldLayout';

/**
 * Self-contained, instanced industrial-wasteland scenery.
 * Everything is procedural: no borrowed StarCraft models, sprites or textures.
 * Repeated pieces are grouped into a few instanced draw calls so 600 soldiers
 * can render alongside hundreds of environmental structures.
 */
type GeometryName = 'box' | 'cylinder' | 'cone' | 'sphere' | 'rock';
type Surface = 'foundation' | 'concrete' | 'armor' | 'steel' | 'dark'
  | 'rust' | 'sand' | 'scorch' | 'hazard' | 'lamp' | 'glass'
  | 'vegetation' | 'bark' | 'crystal' | 'blue' | 'dust';
type Stamp = {
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  yaw: number; rx: number; rz: number;
};
type Bucket = { geometry: GeometryName; surface: Surface; stamps: Stamp[] };

export function createBattlefieldEnvironment(
  parent: THREE.Object3D, features: ReadonlyArray<BattlefieldFeature>,
): THREE.Group {
  const world = new THREE.Group();
  world.name = 'Industrial battlefront: structures, cover and wilderness';
  parent.add(world);
  const geometry: Record<GeometryName, THREE.BufferGeometry> = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(.5, .5, 1, 10),
    cone: new THREE.ConeGeometry(.5, 1, 7),
    sphere: new THREE.SphereGeometry(.5, 9, 6),
    rock: new THREE.DodecahedronGeometry(.5, 0),
  };
  const colors: Record<Surface, number> = {
    foundation: 0x333d3e,
    concrete: 0x69756f,
    armor: 0x526d78,
    steel: 0x93a5aa,
    dark: 0x1b252b,
    rust: 0x735747,
    sand: 0x65675c,
    scorch: 0x202628,
    hazard: 0xc58d44,
    lamp: 0xe8ab62,
    glass: 0x364d5b,
    vegetation: 0x3f6249,
    bark: 0x424139,
    crystal: 0x5cc9d0,
    blue: 0x6fbbca,
    dust: 0x565450,
  };
  const surfaces = Object.fromEntries((Object.keys(colors) as Surface[]).map(name => [
    name,
    new THREE.MeshStandardMaterial({
      color: colors[name], roughness: name === 'glass' ? .23 : name === 'steel' ? .52 : .87,
      metalness: name === 'steel' || name === 'armor' ? .51 : name === 'rust' ? .29 : .08,
      emissive: name === 'lamp' ? 0xb05414 : name === 'crystal' ? 0x17637a : name === 'blue' ? 0x24566b : 0,
      emissiveIntensity: name === 'lamp' ? .72 : name === 'crystal' ? .65 : .2,
    }),
  ])) as Record<Surface, THREE.MeshStandardMaterial>;
  const buckets = new Map<string, Bucket>();

  function part(
    feature: BattlefieldFeature,
    geometryName: GeometryName, surface: Surface,
    ox: number, y: number, oz: number,
    sx: number, sy: number, sz: number,
    yaw = 0, rx = 0, rz = 0,
  ): void {
    const s = feature.scale;
    const c = Math.cos(feature.rotation), sn = Math.sin(feature.rotation);
    const key = geometryName + ':' + surface;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { geometry: geometryName, surface, stamps: [] };
      buckets.set(key, bucket);
    }
    bucket.stamps.push({
      x: feature.x + (ox * c - oz * sn) * s,
      y: y * s,
      z: feature.z + (ox * sn + oz * c) * s,
      sx: sx * s, sy: sy * s, sz: sz * s,
      yaw: feature.rotation + yaw, rx, rz,
    });
  }

  // Modular military base foundation: all variants use the same vocabulary.
  function pad(f: BattlefieldFeature, sx: number, sz: number): void {
    part(f, 'box', 'scorch', 0, .018, 0, sx + 3, .075, sz + 3);
    part(f, 'box', 'foundation', 0, .22, 0, sx, .42, sz);
    for (const side of [-1, 1]) {
      part(f, 'box', 'steel', side * (sx * .5 - .5), .46, 0, .34, .06, sz);
      part(f, 'box', 'hazard', side * (sx * .5 + .65), .12, 0, .22, .11, sz * .72);
    }
  }

  function vent(f: BattlefieldFeature, x: number, z: number, h = 2): void {
    part(f, 'box', 'steel', x, h * .48, z, 1.2, h, 1.2);
    part(f, 'box', 'dark', x, h + .08, z, 1.65, .2, 1.65);
    part(f, 'box', 'hazard', x, h + .21, z, 1.1, .08, 1.1);
  }

  function beacon(f: BattlefieldFeature, x: number, y: number, z: number): void {
    part(f, 'cylinder', 'steel', x, y - 1, z, .16, 2, .16);
    part(f, 'sphere', 'lamp', x, y + .18, z, .65, .7, .65);
  }

  function crate(f: BattlefieldFeature, x: number, z: number, y = 1.2,
    sx = 3.4, sy = 2.4, sz = 4.8): void {
    part(f, 'box', 'armor', x, y, z, sx, sy, sz);
    for (const a of [-.35, 0, .35]) {
      part(f, 'box', 'steel', x + sx * a, y, z + sz * .502, .13, sy * .87, .12);
    }
    part(f, 'box', 'rust', x, y + sy * .51, z, sx * .9, .1, sz * .88);
  }

  function draw(f: BattlefieldFeature): void {
    const item: BattlefieldFeatureKind = f.kind;
    switch (item) {
      case 'bunker':
        pad(f, 16, 13);
        part(f, 'box', 'concrete', 0, 2.6, 0, 13, 4.5, 10);
        part(f, 'box', 'armor', 0, 5.2, 0, 15, 1, 11.7);
        part(f, 'box', 'dark', 0, 2.9, 5.1, 9, .75, .18);
        for (const x of [-5.7, -3.4, 3.4, 5.7]) {
          part(f, 'box', 'steel', x, 3, 5.4, .48, 2.1, .32);
        }
        part(f, 'cylinder', 'armor', 0, 6.4, 0, 5, 2.2, 5);
        part(f, 'box', 'steel', 0, 7.1, 3.3, 1.1, .8, 6.5);
        beacon(f, 5.5, 7.7, -3.4);
        break;
      case 'hangar':
        pad(f, 24, 20);
        part(f, 'box', 'concrete', 0, 4.2, 0, 20, 7.6, 16);
        part(f, 'box', 'armor', 0, 8.55, 0, 23, 1.1, 19.2);
        part(f, 'box', 'dark', 0, 3.8, 8.2, 13, 6.2, .25);
        for (const x of [-6, -3, 0, 3, 6]) {
          part(f, 'box', 'steel', x, 3.8, 8.4, .22, 6.1, .3);
        }
        for (const x of [-9.4, 9.4]) {
          part(f, 'box', 'rust', x, 4.2, 8.3, .7, 8.7, .65);
        }
        for (const z of [-6, -2, 2, 6]) {
          part(f, 'box', 'steel', 0, 9.3, z, 21.5, .22, .65);
        }
        vent(f, -6.6, -5.6, 11.4);
        vent(f, 6.8, -5.6, 11.1);
        break;
      case 'refinery':
        pad(f, 18, 16);
        part(f, 'box', 'concrete', -3, 2.1, 0, 7, 3.9, 11);
        for (const [x, z, h] of [[5, -4, 10], [5, 3, 12], [-6, -5, 7]] as const) {
          part(f, 'cylinder', 'armor', x, h * .5 + .6, z, 4, h, 4);
          part(f, 'cylinder', 'steel', x, h + .7, z, 4.4, .6, 4.4);
          part(f, 'cylinder', 'dark', x, h + 1.1, z, 2.8, .23, 2.8);
        }
        part(f, 'box', 'steel', -.6, 5.2, 2.4, 12, .55, 1.1);
        for (const x of [-5, -2, 2, 5]) {
          part(f, 'box', 'steel', x, 3.4, 5.5, .2, 6.2, .2);
        }
        beacon(f, -7, 13.2, 5.3);
        break;
      case 'radar':
        pad(f, 11, 11);
        part(f, 'cylinder', 'concrete', 0, 1.1, 0, 8, 1.9, 8);
        part(f, 'cylinder', 'armor', 0, 5, 0, 3.7, 8, 3.7);
        part(f, 'cylinder', 'steel', 0, 9.5, 0, 5.8, 1.2, 5.8);
        part(f, 'sphere', 'glass', 0, 12.9, .1, 9.6, 4.3, 8.2, 0, -.25);
        part(f, 'box', 'steel', 0, 13.4, -1.8, 7.3, .3, .45);
        part(f, 'box', 'steel', 0, 13.4, 1.8, 7.3, .3, .45);
        beacon(f, 3.7, 7.5, 3.8);
        break;
      case 'tower':
        pad(f, 8, 8);
        for (const x of [-2.7, 2.7]) for (const z of [-2.7, 2.7]) {
          part(f, 'box', 'steel', x, 7, z, .55, 13.7, .55);
        }
        for (const y of [3.4, 7.1, 11]) {
          part(f, 'box', 'rust', 0, y, 0, 6.7, .28, 6.7);
        }
        part(f, 'box', 'armor', 0, 14.4, 0, 9, 3.3, 8.4);
        part(f, 'box', 'glass', 0, 14.8, 4.25, 6.4, 1.25, .16);
        part(f, 'box', 'steel', 0, 16.3, 0, 10, .45, 9.3);
        beacon(f, 0, 20.2, 0);
        break;
      case 'generator':
        pad(f, 14, 14);
        part(f, 'cylinder', 'foundation', 0, 2.2, 0, 11, 3.9, 11);
        part(f, 'cylinder', 'armor', 0, 5.7, 0, 8, 6, 8);
        part(f, 'cylinder', 'crystal', 0, 8.9, 0, 5.3, 8.5, 5.3);
        part(f, 'cylinder', 'dark', 0, 13.4, 0, 8.4, 1.5, 8.4);
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          part(f, 'box', 'steel', Math.cos(a) * 5.7, 8, Math.sin(a) * 5.7, .75, 10, 1.1, a);
          part(f, 'sphere', 'blue', Math.cos(a) * 5.4, 4, Math.sin(a) * 5.4, 1.3, .45, .75);
        }
        break;
      case 'cargo':
        part(f, 'box', 'scorch', 0, .025, 0, 14, .07, 13);
        crate(f, -2.5, -2, 1.65, 4.3, 3.2, 5.2);
        crate(f, 3, -2, 1.65, 4.3, 3.2, 5.2);
        crate(f, .25, 3, 1.5, 5.2, 3, 4.5);
        crate(f, 0, -2, 4.8, 5.3, 2.8, 5.4);
        break;
      case 'barricade':
        part(f, 'box', 'foundation', 0, .15, 0, 10, .3, 3);
        part(f, 'box', 'concrete', 0, 1.55, 0, 9.5, 2.6, 2.4);
        part(f, 'box', 'armor', 0, 3.1, 0, 10, .6, 3);
        for (const x of [-4.1, -1.4, 1.4, 4.1]) {
          part(f, 'box', 'steel', x, 1.55, 1.34, .26, 2.5, .22);
        }
        part(f, 'box', 'hazard', 0, .42, 1.6, 8.8, .16, .16);
        break;
      case 'pylon':
        part(f, 'cylinder', 'concrete', 0, .52, 0, 4.6, 1, 4.6);
        for (const x of [-1.3, 1.3]) {
          part(f, 'box', 'steel', x, 6, 0, .6, 11.8, .6);
        }
        for (const y of [4, 8, 11.6]) {
          part(f, 'box', 'armor', 0, y, 0, 4, .38, 1.5);
        }
        beacon(f, 0, 15.1, 0);
        break;
      case 'pipeline':
        part(f, 'box', 'scorch', 0, .03, 0, 22, .08, 7);
        for (const z of [-2, 2]) {
          part(f, 'cylinder', 'steel', 0, 2.4, z, 1.65, 20, 1.65, 0, 0, Math.PI / 2);
          for (const x of [-8, -3, 3, 8]) {
            part(f, 'box', 'rust', x, 1, z, .65, 2, 1.9);
          }
        }
        break;
      case 'wreck':
        part(f, 'box', 'scorch', 0, .04, 0, 12, .07, 10);
        part(f, 'box', 'rust', 0, 1.35, 0, 8.2, 2.2, 5.1);
        part(f, 'box', 'dark', -1.4, 2.7, -.9, 4, 1.3, 3.3, .12);
        part(f, 'box', 'steel', 3.6, 2.3, 0, 4, .45, .5, -.18);
        for (const x of [-2.5, 2.5]) for (const z of [-2.4, 2.4]) {
          part(f, 'cylinder', 'dark', x, .55, z, 2, .75, 2, 0, 0, Math.PI / 2);
        }
        for (const x of [-4.5, 4.5]) {
          part(f, 'rock', 'dust', x, .25, 3, 1.5, .5, 2.1);
        }
        break;
      case 'outcrop':
        part(f, 'rock', 'concrete', 0, 2.2, 0, 8, 5.5, 7.5, .4);
        part(f, 'rock', 'sand', -3.4, 1.4, -1.7, 4.3, 3, 4.7, -.6);
        part(f, 'rock', 'dark', 2.3, .9, 2.3, 5.3, 2.1, 4.6, .3);
        for (const i of [-1, 1]) {
          part(f, 'rock', 'rust', i * 3, .4, -4, 1.5, .8, 2.2);
        }
        // Exposed strata and rare ore seams give each rock face a useful
        // silhouette, without placing any extra collision obstacles.
        for (let band = 0; band < 3; band++) {
          part(f, 'box', band % 2 ? 'steel' : 'sand', -.6, 1.05 + band * .72,
            2.8 - band * .26, 6.1 - band * .75, .18, .38, .12 * band);
        }
        for (let i = 0; i < 4; i++) {
          const angle = (i * 2.399 + f.id * .4) % (Math.PI * 2);
          part(f, 'cone', i % 2 ? 'crystal' : 'blue',
            Math.cos(angle) * 2.2, .85 + i * .3, Math.sin(angle) * 2.2,
            .4 + .12 * i, 1.45 + .5 * (i % 3), .4 + .12 * i, angle, .16);
        }
        break;
      case 'crater':
        part(f, 'cylinder', 'scorch', 0, .025, 0, 13, .065, 13);
        part(f, 'cylinder', 'dust', 0, .04, 0, 10.5, .07, 10.5);
        // Broken, uneven impact rim; repeated wedges remain instanced.
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI * 2 / 12, r = 5.8 + .45 * Math.sin(i * 2.7);
          part(f, 'rock', i % 3 ? 'sand' : 'rust', Math.cos(a) * r, .36,
            Math.sin(a) * r, 1.55 + i % 3 * .4, .65, 1.65, a);
          if (i % 3 === 0)
            part(f, 'rock', 'dark', Math.cos(a) * 3.55, .16,
              Math.sin(a) * 3.55, 1.4, .35, 1.8, a);
        }
        break;
      case 'trench':
        part(f, 'box', 'scorch', 0, .018, 0, 18, .055, 4.8);
        for (const z of [-2.8, 2.8]) {
          part(f, 'box', 'sand', 0, .46, z, 18, .7, 1.4);
          for (const x of [-7, -3, 1, 5, 8]) {
            part(f, 'box', 'rust', x, .88, z, .24, .24, 1.45);
          }
        }
        break;
      case 'crystal':
        part(f, 'cylinder', 'dark', 0, .2, 0, 8, .35, 8);
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5;
          const h = 3.1 + (i % 3) * 1.8;
          part(f, 'cone', i % 2 ? 'crystal' : 'blue',
            Math.cos(a) * 1.6, h / 2, Math.sin(a) * 1.6, 2, h, 2, a, -.1);
        }
        break;
      case 'pine':
        part(f, 'cylinder', 'bark', 0, 2.4, 0, .8, 4.8, .8);
        for (const [h, width, height] of [[5, 5.5, 6.5], [7.1, 4.3, 5.7],
          [9.1, 3, 4.7]] as const) {
          part(f, 'cone', 'vegetation', 0, h, 0, width, height, width);
        }
        // Exposed roots and shrubs anchor the tree to the ground. These are
        // visual-only, so infantry can still travel through the same routes.
        for (let i = 0; i < 5; i++) {
          const a = i * 2.399, radius = 1.05 + (i % 2) * .48;
          part(f, 'box', 'bark', Math.cos(a) * .65, .22,
            Math.sin(a) * .65, .42, .31, 2.25, a);
          part(f, 'sphere', 'vegetation', Math.cos(a) * radius, .48,
            Math.sin(a) * radius, 1.8, .86, 1.45, a);
        }
        break;
      case 'deadwood':
        part(f, 'cylinder', 'bark', 0, 3.5, 0, 1.05, 7, 1.05);
        for (const [x, y, a] of [[-1.8, 5.3, -.7], [2, 6.2, .7],
          [-1.4, 7.1, -.4]] as const) {
          part(f, 'cylinder', 'bark', x, y, 0, .4, 4.6, .4, 0, 0, a);
        }
        for (let i = 0; i < 4; i++) {
          const a = i * 1.57 + f.id * .32;
          part(f, 'rock', 'sand', Math.cos(a) * 1.8, .23,
            Math.sin(a) * 1.8, 1.5, .55, .95, a);
          part(f, 'cylinder', 'bark', Math.cos(a) * .85, .36,
            Math.sin(a) * .85, .31, 1.9, .31, 0, 0, a);
        }
        break;
      case 'scrap':
        part(f, 'box', 'rust', 0, .5, 0, 4, .9, 2.6, .32);
        part(f, 'box', 'armor', 1.2, 1.05, -.5, 3, .3, 3.6, -.4);
        part(f, 'rock', 'steel', -2.1, .54, 1.1, 2.6, 1.4, 1.8);
        part(f, 'box', 'dark', -1, .5, -1.3, 2.5, 1, 2.3, .7);
        break;
      case 'solar':
        part(f, 'box', 'foundation', 0, .12, 0, 13, .24, 11);
        for (const x of [-4.2, 0, 4.2]) {
          part(f, 'box', 'steel', x, 2.2, 0, .45, 4.2, .55);
          part(f, 'box', 'glass', x, 4.25, 0, 3.7, .2, 8.3, 0, -.33);
          for (const z of [-2.5, 2.5]) {
            part(f, 'box', 'steel', x, 4.3, z, 3.7, .15, .19, 0, -.33);
          }
        }
        break;
      default:
        break;
    }
  }

  for (const feature of features) draw(feature);
  const dummy = new THREE.Object3D();
  for (const bucket of buckets.values()) {
    if (!bucket.stamps.length) continue;
    const mesh = new THREE.InstancedMesh(
      geometry[bucket.geometry], surfaces[bucket.surface], bucket.stamps.length,
    );
    mesh.name = 'Battlefield / ' + bucket.geometry + ' / ' + bucket.surface;
    mesh.count = bucket.stamps.length;
    bucket.stamps.forEach((s, index) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(s.rx, s.yaw, s.rz);
      dummy.scale.set(s.sx, s.sy, s.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false; // hundreds of pieces would overwhelm shadow-map passes
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    world.add(mesh);
  }
  return world;
}
