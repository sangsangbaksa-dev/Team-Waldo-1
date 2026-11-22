import { describe, expect, it } from 'vitest';
import { RtsSim } from './sim';
import { BUILDINGS, UNITS } from './config';

function miner() {
  const s = new RtsSim(), n = s.nodes[0], w = s.units.find(u => u.kind === 'worker' && u.owner === 0)!;
  for (const u of s.units) s.apply(u.owner, { k: 'stop', ids: [u.id] });
  const at = s.pather.nearestFree(n.x + 0.5, n.y + 0.5)!;
  w.x = at.x; w.y = at.y;
  s.apply(0, { k: 'gather', ids: [w.id], node: n.id });
  s['gather'](w);
  expect(w.o.phase).toBe(1);
  return { s, n, w };
}
function site() {
  const s = new RtsSim(), w = s.units.find(u => u.owner === 0 && u.kind === 'worker')!;
  const p = s.findSite('depot', w.x, w.y)!;
  expect(s.apply(0, { k: 'build', id: w.id, b: 'depot', x: p.x, y: p.y })).toBe(true);
  const b = s.building(w.o.target)!;
  const at = s.approach(b, w.x, w.y); w.x = at.x; w.y = at.y;
  return { s, w, b };
}

describe('RTS debugging regressions', () => {
  it('does not accept a destroyed HQ as a live technology prerequisite', () => {
    const s = new RtsSim();
    const hq = s.buildings.find(b => b.kind === 'hq' && b.owner === 0)!;
    expect(s.has(0, 'hq')).toBe(true);
    hq.hp = 0;
    expect(s.has(0, 'hq')).toBe(false);
  });
  it('does not count dead units or buildings toward live supply totals', () => {
    const s = new RtsSim(), hq = s.buildings.find(b => b.kind === 'hq' && b.owner === 0)!;
    const u = s.units.find(u => u.owner === 0)!;
    const beforeCap = s.players[0].cap, beforeUsed = s.players[0].used;
    hq.hp = 0; u.hp = 0; s.recount();
    expect(s.players[0].cap).toBeLessThan(beforeCap);
    expect(s.players[0].used).toBe(beforeUsed - UNITS[u.kind].supply);
  });
  it('rejects a resume order targeting a destroyed construction site', () => {
    const {s,w,b} = site(); b.hp = 0;
    expect(s.apply(0, {k:'resume', b:b.id, ids:[w.id]})).toBe(false);
  });
  it('rejects rally-point commands on a destroyed producer', () => {
    const s = new RtsSim(), hq = s.buildings.find(b => b.kind === 'hq' && b.owner === 0)!;
    hq.hp = 0;
    expect(s.apply(0,{k:'rally',b:hq.id,x:20,y:20,node:0})).toBe(false);
  });
  it('rejects fractional and out-of-range cancellation indices without refunds', () => {
    const { s, b } = site(), original = s.players[0].minerals;
    for (const i of [-3, -2.5, -1.5, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(s.apply(0, { k: 'cancel', b: b.id, i })).toBe(false);
      expect(s.players[0].minerals).toBe(original);
      expect(s.building(b.id)).toBe(b);
    }
  });
  it('does not refund orders from a building already destroyed in the same tick', () => {
    const { s, b } = site(), original = s.players[0].minerals;
    b.hp = 0;
    expect(s.apply(0, { k:'cancel', b:b.id, i:-1 })).toBe(false);
    expect(s.players[0].minerals).toBe(original);
  });
  it('releases the mineral reservation immediately when stopping', () => {
    const { s, n, w } = miner();
    expect(n.miner).toBe(w.id); expect(n.busyUntil).toBeGreaterThan(s.tick);
    s.apply(0, { k: 'stop', ids: [w.id] });
    expect(n.miner).toBeUndefined(); expect(n.busyUntil).toBe(s.tick);
  });
  it('releases reservations on worker death', () => {
    const { s, n, w } = miner(); w.hp = 0; s.step();
    expect(n.miner).toBeUndefined(); expect(n.busyUntil).toBeLessThanOrEqual(s.tick);
  });
  it('cancels mining when pushed away from the mineral', () => {
    const { s, n, w } = miner(); w.x += 10;
    s['gather'](w);
    expect(n.miner).toBeUndefined(); expect(w.o.phase).toBe(0); expect(w.carry).toBe(0);
  });
  it('cannot release a reservation belonging to a different worker', () => {
    const { s, n, w } = miner();
    const other = s.units.find(u => u.id !== w.id)!; n.miner = other.id; const until = n.busyUntil;
    s.apply(0, { k: 'stop', ids: [w.id] });
    expect(n.miner).toBe(other.id); expect(n.busyUntil).toBe(until);
  });
  it('resets mining progress when a depleted node disappears', () => {
    const { s, n, w } = miner();
    s.nodes.splice(s.nodes.indexOf(n), 1); s.index.delete(n.id); w.o.timer = 1;
    s['gather'](w);
    expect(w.carry).toBe(0); expect(w.o.timer).not.toBe(1);
  });
  it('cannot give construction orders to a dead worker', () => {
    const { s, w } = site(); w.hp = 0;
    const p = s.findSite('depot', w.x, w.y)!;
    expect(s.apply(0, { k: 'build', id: w.id, b: 'depot', x: p.x, y: p.y })).toBe(false);
  });
  it('cannot order attacks against an already destroyed enemy', () => {
    const s = new RtsSim(), w = s.spawnAt(0,'marine',20,20), e = s.spawnAt(1,'marine',21,20);
    e.hp = 0; expect(s.apply(0, { k: 'attack', ids: [w.id], target: e.id })).toBe(false);
  });
  it('does not resurrect a site destroyed before construction updates', () => {
    const { s, w, b } = site(); b.hp = 0; s['construct'](w);
    expect(b.hp).toBe(0); expect(b.progress).toBe(0);
  });
  it('preserves damage taken during construction', () => {
    const { s, w, b } = site(); const total = BUILDINGS.depot.time;
    b.progress = Math.floor(total / 2); const expected = Math.round(b.maxhp * (0.1 + 0.9 * b.progress / total));
    b.hp = expected - 30; s['construct'](w);
    expect(b.hp).toBe(Math.round(b.maxhp * (0.1 + 0.9 * b.progress / total)) - 30);
  });
  it('does not overwrite carried resources after completing construction', () => {
    const { s, w, b } = site(); w.carry = 5; b.done = true; s['afterBuild'](w);
    expect(w.o.t).toBe('gather'); expect(w.o.phase).toBe(2);
  });
  it('does not auto-reassign manually stopped workers to abandoned construction', () => {
    const { s, w, b } = site();
    for (const u of s.units) s.apply(u.owner, { k:'stop', ids: [u.id] });
    expect(s.spareWorker(b)).toBeNull(); expect(w.o.phase).toBe(9);
  });
  it('rejects inherited prototype names as building types without spending resources', () => {
    const { s, w } = site(); const before = s.players[0].minerals;
    expect(s.apply(0, { k:'build', id:w.id, b:'constructor' as 'depot', x:20, y:20 })).toBe(false);
    expect(s.players[0].minerals).toBe(before);
  });
});
