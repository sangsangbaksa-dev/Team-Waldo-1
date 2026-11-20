import { test } from "node:test";
import assert from "node:assert/strict";
import { chapters, makeLevel, paths, route, routeFrom, neighbors, lineOpen, normalizeSave } from "../../src/room-tone/levels.mjs";

test("all chapters have distinct, reachable objectives and shortest routes", () => {
  for (let ch = 0; ch < chapters.length; ch++) {
    const l = makeLevel(ch);
    const targets = [l.start, ...l.items, l.exit, l.nest];
    assert.equal(new Set(targets).size, 6);
    const tree = paths(l.map, l.start);
    for (const target of targets.slice(1)) {
      const p = route(l.map, l.start, target);
      assert.equal(p.at(-1), target);
      assert.equal(p.length, tree.dist[target]);
      assert.deepEqual(p, routeFrom(tree, l.start, target));
      let prev = l.start;
      for (const cell of p) {
        assert.ok(neighbors(l.map, prev).includes(cell));
        prev = cell;
      }
    }
  }
});
test("invalid routes terminate, including corrupt predecessors", () => {
  const map = ["..#", "##.", "..."];
  for (const bad of [-1, 9, NaN, Infinity, 1.2, 2]) {
    assert.deepEqual(route(map, 0, bad), []);
    assert.deepEqual(route(map, bad, 0), []);
  }
  assert.deepEqual(route(map, 0, 8), []);
  assert.deepEqual(route([], 0, 1), []);
  const tree = paths(map, 0);
  tree.prev[1] = 1;
  assert.deepEqual(routeFrom(tree, 0, 1), []);
});
test("wall corners block sight; clear corridors work in both directions", () => {
  const a = {x:0,z:0}, b = {x:1,z:1};
  assert.equal(lineOpen([".#","#."], a,b,1), false);
  assert.equal(lineOpen(["..",".."], a,b,1), true);
  assert.equal(lineOpen(["..",".."], b,a,1), true);
  assert.equal(lineOpen([".#."], a,{x:2,z:0},1), false);
  assert.equal(lineOpen(["..."], a,{x:2,z:0},1), true);
  assert.equal(lineOpen(["..."], a,{x:NaN,z:0},1), false);
});
test("save normalization rejects impossible completion and invalid visited cells", () => {
  assert.equal(normalizeSave({v:1,ch:4,found:[true,true,true]}), null);
  const save = normalizeSave({v:1,ch:0,found:[true,false,true],solved:true,seen:[22,22,-1,9999],elapsed:-1});
  assert.deepEqual(save,{v:1,ch:0,found:[true,false,true],solved:false,seen:[22],elapsed:0});
  assert.equal(normalizeSave({v:1,ch:0,found:[true,true,true],solved:true}).solved,true);
});
