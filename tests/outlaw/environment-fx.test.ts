import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EnvironmentPlumes, plumeBudget, plumeSample, type PlumeEmitter } from '../../src/outlaw/environment-fx';
const emitter: PlumeEmitter = { x: 3, y: 10, z: 7, rise: 8, spread: 2, smoke: true };
describe('environment plumes', () => {
  it('has finite deterministic particles confined to the rising plume', () => {
    for (const t of [-1, 0, 1, 20, 10000]) for (let p = 0; p < 6; p++) {
      const a = plumeSample(emitter, t, p, 6, .5);
      expect(a).toEqual(plumeSample(emitter, t, p, 6, .5)); expect(a.y).toBeGreaterThanOrEqual(10); expect(a.y).toBeLessThan(18);
      expect(a.alpha).toBeGreaterThanOrEqual(0); expect(a.alpha).toBeLessThanOrEqual(.27);
    }
  });
  it('limits particle count and excludes far-away locations', () => {
    const fx = new EnvironmentPlumes('standard');
    fx.setEmitters(Array.from({length:100}, (_,i)=>({...emitter, x: i})));
    fx.update(1, new THREE.Vector3(), 0, 0);
    const count = () => fx.group.children.reduce((n,o)=>n+(o as THREE.Points).geometry.drawRange.count,0);
    expect(count()).toBe(plumeBudget('standard') * 6);
    fx.update(2, new THREE.Vector3(1000,0,1000), 0, 0); expect(count()).toBe(0);
    fx.dispose(); fx.dispose(); expect(fx.group.children).toHaveLength(0);
  });
  it('does not allocate render geometry on low quality', () => {
    const fx = new EnvironmentPlumes('low'); expect(fx.group.children).toHaveLength(0); fx.dispose();
  });
});
