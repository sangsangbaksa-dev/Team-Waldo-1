import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shooter/sim';
import { PARTS, PART_IDS, WEAPONS, WEAPON_IDS, adsSpread, canFit, gunStats, magOf, partHandling, partsFor } from '../../src/shooter/config';
import { MOUNTS, partNodeName } from '../../src/shooter/gunbuild';

const duel = (): Match => { const m = new Match({ seed: 3, mode: 'duel', difficulty: 'normal', humans: [{ name: '나' }], fill: 2 }); m.map.boxes = []; m.map.grid.clear(); m.loot.forEach(l => { l.taken = true; }); return m; };

describe('총기 조립 규칙', () => {
  it('파츠는 맞는 무기에만 달린다', () => {
    expect(canFit('pistol', 'scope4')).toBe(false); expect(canFit('pistol', 'suppressor')).toBe(true); expect(canFit('smg', 'cheek')).toBe(false); expect(canFit('sniper', 'cheek')).toBe(true);
    expect(canFit('sniper', 'grip')).toBe(false); expect(canFit('shotgun', 'quickmag')).toBe(false); expect(canFit('shotgun', 'extmag')).toBe(true); expect(canFit('smg', 'scope8')).toBe(false); expect(canFit('rifle', 'scope8')).toBe(true);
    for (const w of WEAPON_IDS) for (const p of PART_IDS) expect(partsFor(w, PARTS[p].slot).some(d => d.id === p)).toBe(canFit(w, p));
  });
  it('파츠는 능력치를 실제로 바꾼다', () => {
    const base = gunStats('rifle', {}), kit = gunStats('rifle', { muzzle: 'comp', grip: 'grip', mag: 'extquick', stock: 'tactical', sight: 'scope4' });
    expect(kit.kick).toBeLessThan(base.kick * 0.5); expect(kit.spread).toBeLessThan(base.spread); expect(kit.mag).toBe(Math.round(30 * 1.25)); expect(kit.reload).toBeCloseTo(2.0 * 0.82, 5); expect(kit.zoom).toBe(4); expect(kit.ads).toBeLessThan(base.ads);
    expect(magOf('rifle', { mag: 'extmag' })).toBe(42); expect(partHandling({ mag: 'quickmag' }).reload).toBeCloseTo(0.7, 5); expect(adsSpread({})).toBeCloseTo(0.4, 5); expect(adsSpread({ sight: 'reddot' })).toBeCloseTo(0.34, 5);
  });
  it('시작 권총은 기본 파츠 없이 맨 총으로 시작한다', () => {
    const m = duel(), p = m.players[0]; expect(p.guns[0]!.att).toEqual({}); expect(p.guns[0]!.mag).toBe(WEAPONS.pistol.mag);
  });
  it('모든 부품에 3D 노드 이름과 자리(mount)가 있다', () => {
    for (const w of WEAPON_IDS) { const m = MOUNTS[w]; expect(m.sight).toHaveLength(2); expect(m.muzzle).toHaveLength(2); expect(m.mag).toHaveLength(2); for (const p of PART_IDS) if (canFit(w, p)) { expect(partNodeName(w, p, PARTS[p].slot)).toMatch(/^p_/); if (PARTS[p].slot === 'stock') expect(m.stock).not.toBeNull(); if (PARTS[p].slot === 'grip') expect(m.grip).not.toBeNull(); } }
  });
});
