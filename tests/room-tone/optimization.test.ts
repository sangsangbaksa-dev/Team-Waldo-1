import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeLevel, neighbors, paths, route, routeFrom, walkable } from "../../src/room-tone/levels.mjs";
import { buildHidingSpot, createHidingSpotKit } from "../../src/room-tone/environment.js";

describe("ROOM TONE navigation after startup refactoring", () => {
  const map = ["#####", "#...#", "#.#.#", "#...#", "#####"];
  it("treats out-of-bounds and solid walls as blocked", () => {
    for (const invalid of [-1, 0, 1, 5, 100, 2.5, NaN]) {
      expect(walkable(map, invalid)).toBe(false);
      expect(neighbors(map, invalid)).toEqual([]);
      expect(paths(map, invalid).q).toEqual([]);
    }
    expect(walkable(map, 6)).toBe(true);
    expect(neighbors(map, 6)).toEqual([7, 11]);
  });
  it("reuses one BFS for several targets without changing shortest routes", () => {
    const tree = paths(map, 6);
    for (const target of [6, 7, 8, 11, 13, 16, 17, 18]) {
      const fromTree = routeFrom(tree, 6, target);
      expect(fromTree).toEqual(route(map, 6, target));
      expect(fromTree.length).toBe(tree.dist[target]);
    }
    expect(routeFrom(tree, 6, 12)).toEqual([]);
    expect(routeFrom(tree, 6, 999)).toEqual([]);
    expect(routeFrom(tree, 999, 6)).toEqual([]);
    expect(routeFrom(paths(["#####", "#.#.#", "#####"], 6), 6, 8)).toEqual([]);
  });
  for (let chapter = 0; chapter < 4; chapter++) {
    it(`preserves all required paths in chapter ${chapter + 1}`, () => {
      const level = makeLevel(chapter);
      const tree = paths(level.map, level.start);
      for (const id of [...level.items, level.station, level.exit, level.nest]) {
        expect(tree.dist[id]).toBeGreaterThanOrEqual(0);
        expect(routeFrom(tree, level.start, id)).toEqual(route(level.map, level.start, id));
      }
    });
  }
});

describe("ROOM TONE shared hiding-place geometry", () => {
  it("shares one GPU geometry and exactly three materials across all four variants", () => {
    const kit = createHidingSpotKit(THREE);
    const allowed = new Set<THREE.Material>([kit.dark, kit.mid, kit.cloth]);
    const variants: THREE.Group[] = [];
    for (let kind = 0; kind < 4; kind++) {
      const root = new THREE.Group();
      buildHidingSpot(THREE, root, kind, kit);
      variants.push(root);
      expect(root.children.length).toBeGreaterThan(3);
      for (const part of root.children) {
        const mesh = part as THREE.Mesh;
        expect(mesh.geometry).toBe(kit.geometry);
        expect(allowed.has(mesh.material as THREE.Material)).toBe(true);
      }
      expect(new THREE.Box3().setFromObject(root).isEmpty()).toBe(false);
    }
    expect(variants.flatMap((root) => root.children).length).toBeGreaterThanOrEqual(20);
  });
});

describe("ROOM TONE allocation-free BFS compatibility", () => {
  function referencePaths(map: string[], start: number) {
    const width = map[0]?.length ?? 0;
    const prev = new Int32Array(map.length * width).fill(-2);
    const dist = new Int32Array(prev.length).fill(-1);
    const q: number[] = [];
    if (!walkable(map, start)) return {prev,dist,q};
    q.push(start); prev[start] = -1; dist[start] = 0;
    for (let h=0; h<q.length; h++) {
      for (const k of neighbors(map,q[h])) {
        if (prev[k]!==-2) continue;
        prev[k]=q[h]; dist[k]=dist[q[h]]+1; q.push(k);
      }
    }
    return {prev,dist,q};
  }
  it("preserves exact queue order, distance and parent on cyclic maps",()=>{
    const maps=[
      [".......",".......",".......",".......","......."],
      ["#########","#...#...#","#.#...#.#","#...#...#","#########"],
      ["#.#.#","#####","#...#","#####","#.#.#"],
      ["."],
      ["#####","#####","#####"],
    ];
    for(const map of maps) for(let start=0;start<map.length*map[0].length;start++){
      const original=referencePaths(map,start);
      const optimized=paths(map,start);
      expect(optimized.q).toEqual(original.q);
      expect(optimized.dist).toEqual(original.dist);
      expect(optimized.prev).toEqual(original.prev);
    }
  });
  it("preserves exact output for every reachable start in all four chapters",()=>{
    for(let ch=0;ch<4;ch++){
      const level=makeLevel(ch);
      const starts=[level.start, ...level.items, level.exit, level.nest,
        ...level.reachable.filter((_,i)=>i%13===0)];
      for(const start of starts){
        const expected=referencePaths(level.map,start),actual=paths(level.map,start);
        expect(actual.prev).toEqual(expected.prev);
        expect(actual.dist).toEqual(expected.dist);
        expect(actual.q).toEqual(expected.q);
      }
    }
  });
});
