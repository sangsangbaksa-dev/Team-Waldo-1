import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCore, SPOTS } from '../../src/tycoon/core';
import { Colliders, buildLayout, WORLD_HALF, recycleFenceSegments } from '../../src/tycoon/scene/layout';
import { Player } from '../../src/tycoon/scene/player';
import { readResumePosition } from '../../src/tycoon/scene/resume';
import { nearestMapSpot } from '../../src/tycoon/ui/minimap';

describe('HUSTLE navigation and resume', () => {
  it('selects opened map places and refuses locked or invalid selections', () => {
    const layout = buildLayout(SPOTS), core = createCore({ seed: 3 });
    const onMap = (id: string) => { const l = layout.spotLots.get(id)!; return [(l.doorX + WORLD_HALF) / (2 * WORLD_HALF), (l.doorZ + WORLD_HALF) / (2 * WORLD_HALF)] as const; };
    expect(nearestMapSpot(layout, core.spots(), 0, ...onMap('bench'))).toBe('bench');
    expect(nearestMapSpot(layout, core.spots(), 0, ...onMap('job_mart'))).not.toBe('job_mart');
    expect(nearestMapSpot(layout, core.spots(), 0, NaN, 0)).toBeNull();
  });
  it('restores valid camera data and falls back for corrupted positions', () => {
    const cols = new Colliders();
    expect(readResumePosition({ v: 1, position: { x: 5, z: 6, yaw: 1, cameraYaw: 2, cameraPitch: 0.5, firstPerson: true } }, cols)).toEqual({ x: 5, z: 6, yaw: 1, cameraYaw: 2, cameraPitch: 0.5, firstPerson: true });
    expect(readResumePosition({ v: 1 }, cols)).toBeNull();
    expect(readResumePosition({ v: 1, position: { x: Infinity, z: 0, yaw: 0 } }, cols)).toBeNull();
    expect(readResumePosition({ v: 1, position: { x: WORLD_HALF + 1, z: 0, yaw: 0 } }, cols)).toBeNull();
    const layout = buildLayout(SPOTS); const block = layout.blocks.find(b => b.i === 0 && b.j === 0)!;
    cols.set(block, [{ x0: -2, x1: 2, z0: -2, z1: 2 }]);
    expect(readResumePosition({ v: 1, position: { x: 0, z: 0, yaw: 0 } }, cols)).toBeNull();
  });
  it('stops all movement immediately on pause or activity lock', () => {
    const p = new Player(new THREE.Scene(), null), cols = new Colliders();
    p.teleport(0, 0, 0); p.update(0.1, { mx: 1, mz: 0, run: true }, cols, false);
    const before = p.pos.clone();
    p.update(0.1, { mx: 1, mz: 0, run: true }, cols, true);
    expect(p.pos.toArray()).toEqual(before.toArray());
    expect(p.speed).toBe(0);
  });
});

describe('HUSTLE collision and camera fixes', () => {
  it('opens the recycle gate in all four orientations without invisible walls', () => {
    for (const [fx,fz] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const fence = recycleFenceSegments({cx:0,cz:0,fx,fz});
      const solid = (x:number,z:number) => fence.some(b=>x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1);
      expect(fence).toHaveLength(5); expect(solid(fx*6.8,fz*6.8)).toBe(false);
      expect(solid(-fx*6.8,-fz*6.8)).toBe(true); expect(solid(fx*6.8+fz*3,fz*6.8+fx*3)).toBe(true);
    }
  });
  it('rejects unsupported saved position versions',()=>{
    expect(readResumePosition({v:99,position:{x:0,z:0,yaw:0}},new Colliders())).toBeNull();
  });
  it('aligns initial view with facing and rejects nonfinite touch deltas',()=>{
    const p=new Player(new THREE.Scene(),null);p.teleport(0,0,0);
    expect(p.camYaw).toBeCloseTo(-Math.PI/2);p.look(Infinity,0);expect(p.camYaw).toBeCloseTo(-Math.PI/2);
    p.update(NaN,{mx:0,mz:1,run:false},new Colliders(),false); expect(p.pos.toArray()).toEqual([0,.18,0]);
  });
  it('stops walking speed when pinned to a solid wall',()=>{
    const p=new Player(new THREE.Scene(),null), cols=new Colliders();const block=buildLayout(SPOTS).blocks.find(b=>b.i===0&&b.j===0)!;
    cols.set(block,[{x0:0,x1:2,z0:-3,z1:3}]);p.teleport(-.45,0,0);
    p.update(.1,{mx:0,mz:1,run:true},cols,false); expect(p.speed).toBeCloseTo(0,5);
  });
});
