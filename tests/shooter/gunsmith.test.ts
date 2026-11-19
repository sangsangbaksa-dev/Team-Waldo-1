import { describe, expect, it } from 'vitest';
import { Match, blankInput } from '../../src/shooter/sim';
import { LOADOUT_BUDGET, PARTS, PART_IDS, WEAPONS, WEAPON_IDS, adsSpread, attCost, canFit, cleanLoadout, gunStats, magOf, partHandling, partsFor, type Attachments } from '../../src/shooter/config';
import { MOUNTS, partNodeName } from '../../src/shooter/gunbuild';
import { emptyLoadout, readLoadout, writeLoadout } from '../../src/shooter/loadout';

const run = (m: Match, sec: number): void => { for (let i = 0; i < sec * 60 && !m.over; i++) { m.step(1 / 60); m.drain(); } };
const duel = (loadout?: Record<string, Attachments>): Match => { const m = new Match({ seed: 3, mode: 'duel', difficulty: 'normal', humans: [{ name: '나' }], fill: 2, loadout }); m.map.boxes = []; m.map.grid.clear(); m.loot.forEach(l => { l.taken = true; }); return m; };

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
  it('저장된 구성은 걸러서 읽는다(없는 파츠·안 맞는 파츠·점수 초과)', () => {
    const c = cleanLoadout({ rifle: { sight: 'scope4', muzzle: 'suppressor', grip: 'grip', mag: 'extquick', stock: 'tactical' }, pistol: { sight: 'scope4', muzzle: 'nope', mag: 'extmag' }, bogus: { sight: 'reddot' } });
    expect(attCost(c.rifle)).toBeLessThanOrEqual(LOADOUT_BUDGET); expect(c.pistol).toEqual({ mag: 'extmag' }); expect(Object.keys(c)).not.toContain('bogus'); expect(cleanLoadout(null)).toEqual({}); expect(cleanLoadout('x')).toEqual({});
  });
  it('구성은 브라우저에 저장되고 다시 읽힌다', () => {
    const store = new Map<string, string>(); (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(readLoadout()).toEqual(emptyLoadout()); writeLoadout({ on: false, guns: { smg: { sight: 'holo', stock: 'tactical' } }, last: 'smg' });
    expect(readLoadout()).toEqual({ on: false, guns: { smg: { sight: 'holo', stock: 'tactical' } }, last: 'smg' });
    store.set('waldo.shooter.loadout.v1', '{broken'); expect(readLoadout()).toEqual(emptyLoadout());
  });
  it('내 구성은 시작 권총과 주운 총에 달리고, 장전·탄창에 반영된다', () => {
    const m = duel({ pistol: { mag: 'extquick', muzzle: 'suppressor' }, rifle: { sight: 'holo', mag: 'quickmag' } }), p = m.players[0];
    expect(p.guns[0]!.att).toEqual({ mag: 'extquick', muzzle: 'suppressor' }); expect(p.guns[0]!.mag).toBe(Math.round(WEAPONS.pistol.mag * 1.25));
    m.loot.push({ id: 950, kind: 'weapon', weapon: 'rifle', part: null, x: p.x, z: p.z, taken: false, att: { muzzle: 'comp' } }); p.input = { ...blankInput(), interact: true };
    run(m, 0.3); const g = p.guns.find(x => x?.id === 'rifle')!; expect(g.att).toEqual({ sight: 'holo', mag: 'quickmag', muzzle: 'comp' });
    p.input.interact = false; g.mag = 0; p.input.reload = true; run(m, 0.05); expect(p.reload).toBeCloseTo(WEAPONS.rifle.reload * 0.7, 1);
    expect(m.players[1].guns[0]!.att).toEqual({}); // 상대(AI)는 해당 없음
  });
  it('구성이 없으면 예전과 똑같다', () => {
    const m = duel(), p = m.players[0]; expect(p.guns[0]!.att).toEqual({}); expect(p.guns[0]!.mag).toBe(WEAPONS.pistol.mag);
  });
  it('모든 부품에 3D 노드 이름과 자리(mount)가 있다', () => {
    for (const w of WEAPON_IDS) { const m = MOUNTS[w]; expect(m.sight).toHaveLength(2); expect(m.muzzle).toHaveLength(2); expect(m.mag).toHaveLength(2); for (const p of PART_IDS) if (canFit(w, p)) { expect(partNodeName(w, p, PARTS[p].slot)).toMatch(/^p_/); if (PARTS[p].slot === 'stock') expect(m.stock).not.toBeNull(); if (PARTS[p].slot === 'grip') expect(m.grip).not.toBeNull(); } }
  });
});
