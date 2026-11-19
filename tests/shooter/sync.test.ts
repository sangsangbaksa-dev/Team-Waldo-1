import { describe, expect, it } from 'vitest';
import { Match, blankInput, type MatchEvent } from '../../src/shooter/sim';
import { RED } from '../../src/shooter/config';
import { WorldSync, encodeLoot, parseLoot } from '../../src/shooter/sync';
import { parsePose, poseMsg } from '../../src/shooter/net';

// 온라인 방 동기화: 같은 시드의 두 경기(방장 · 손님)를 한 프로세스에서 돌리며 메시지를 직접 넘겨 봅니다.
const room = (authority: boolean, me: number, seed = 11, fill = 30): Match => new Match({
  seed, mode: 'br', difficulty: 'normal', fill, air: true, vehicles: true, bombs: true, authority, lootBase: (me + 1) * 1_000_000,
  humans: [{ name: 'A', remote: me !== 0 }, { name: 'B', remote: me !== 1 }],
});
function pair(seed = 11, fill = 30): { host: Match; guest: Match; hs: WorldSync; gs: WorldSync; run: (sec: number, each?: (ev: MatchEvent[]) => void) => void } {
  const host = room(true, 0, seed, fill), guest = room(false, 1, seed, fill), hs = new WorldSync(host), gs = new WorldSync(guest);
  let clock = 0;
  const run = (sec: number, each?: (ev: MatchEvent[]) => void): void => {
    for (let i = 0; i < sec * 60; i++) {
      clock += 1000 / 60; host.step(1 / 60); const ev = host.drain(); hs.collect(ev, [guest.players[1]]);
      const w = hs.world(clock, [host.players[1]]); if (w) gs.apply(w, clock);
      gs.step(1 / 60); guest.step(1 / 60); const gev = guest.drain(); each?.(gev);
    }
  };
  return { host, guest, hs, gs, run };
}

describe('ZERO ZONE 온라인 방 동기화', () => {
  it('손님 쪽 AI 는 생각하지 않는 꼭두각시이고, 방장은 AI 를 직접 움직인다', () => {
    const { host, guest } = pair();
    expect(host.players.filter(p => p.bot && p.brain && !p.remote)).toHaveLength(28);
    expect(guest.players.filter(p => p.bot).every(p => p.remote && p.brain === null)).toBe(true);
    expect(guest.vehicles.length).toBe(host.vehicles.length); expect(guest.vehicles.every(v => v.remote)).toBe(true);
    expect(guest.players.map(p => p.name)).toEqual(host.players.map(p => p.name));
  });
  it('방장이 보낸 상태를 따라 손님 쪽 AI 가 같은 자리로 내려온다', () => {
    const { host, guest, run } = pair();
    // 손님 두 사람은 비행기에서 내리지 않고, AI 만 강하해 착지할 때까지
    run(75);
    const landed = host.players.filter(p => p.bot && p.alive && p.air === 0); expect(landed.length).toBeGreaterThan(10);
    let off = 0; for (const p of landed) off = Math.max(off, Math.hypot(p.x - guest.players[p.id].x, p.z - guest.players[p.id].z));
    expect(off).toBeLessThan(5.5);
  });
  it('AI 가 쓰러지면 손님 쪽에서도 쓰러지고(처치한 사람 기록 포함), 떨어진 총은 번호 그대로 전해진다', () => {
    const { host, guest, gs } = pair(); const bot = host.players[5]; bot.air = 0; bot.alt = 0;
    const before = host.loot.length; host.kill(bot, 1, 'rifle'); const ev = host.drain();
    const drops = ev.filter((e): e is Extract<MatchEvent, { t: 'loot' }> => e.t === 'loot'); expect(drops.length).toBeGreaterThan(0); expect(host.loot.length).toBe(before + drops.length);
    for (const d of drops) { const l = parseLoot(encodeLoot(d.loot)); expect(l).not.toBeNull(); guest.addLoot(l!); }
    gs.botDead(5, 1, 0); expect(guest.players[5].alive).toBe(false); expect(guest.players[1].kills).toBe(1);
    for (const d of drops) expect(guest.loot.find(l => l.id === d.loot.id)?.weapon).toBe(d.loot.weapon);
    // 손님 쪽에서 원격 선수가 쓰러질 때는 전리품을 만들지 않습니다(그 선수를 계산하는 쪽이 보냅니다)
    const n = guest.loot.length; guest.kill(guest.players[0], -1, 'zone'); expect(guest.loot.length).toBe(n);
  });
  it('참가자마다 새 전리품 번호가 겹치지 않는다', () => {
    const a = room(true, 0), b = room(false, 1);
    for (const m of [a, b]) { const p = m.players[a === m ? 0 : 1]; p.air = 0; m.kill(p, -1, 'zone'); }
    const ia = a.drain().flatMap(e => (e.t === 'loot' ? [e.loot.id] : [])), ib = b.drain().flatMap(e => (e.t === 'loot' ? [e.loot.id] : []));
    expect(ia.length).toBeGreaterThan(0); expect(ib.length).toBeGreaterThan(0); expect(ia.some(i => ib.includes(i))).toBe(false);
  });
  it('AI 의 사격이 손님에게 전해져 손님 쪽에서 맞는다', () => {
    const { host, guest, hs, gs } = pair(); const g = guest.players[1], bot = host.players[6];
    for (const m of [host, guest]) { m.players[1].air = 0; m.players[1].alt = 0; m.players[1].x = 30; m.players[1].z = 30; m.players[6].air = 0; m.players[6].alt = 0; m.players[6].x = 22; m.players[6].z = 30; }
    host.map.boxes.forEach(b => { b.y0 = 999; b.y1 = 1000; }); guest.map.boxes.forEach(b => { b.y0 = 999; b.y1 = 1000; });
    bot.brain = null; bot.yaw = 0; bot.pitch = -0.05; bot.input = { ...blankInput(), yaw: 0, pitch: -0.05, fire: true }; bot.guns[0]!.mag = 5; bot.cd = 0;
    host.step(1 / 60); const ev = host.drain(); expect(ev.some(e => e.t === 'shot' && e.id === 6)).toBe(true);
    hs.collect(ev, [g]); const w = hs.world(1e6, [host.players[1]])!; expect((w.s as unknown[]).length).toBe(1);
    const hp = g.hp; gs.apply(w, 1e6); expect(g.hp).toBeLessThan(hp);
  });
  it('폭격 포탄과 보급 상자 전리품은 두 브라우저에서 같은 자리·같은 번호로 생긴다', () => {
    const a = room(true, 0), b = room(false, 1);
    expect(b.reds.map(r => [r.x, r.z, r.call])).toEqual(a.reds.map(r => [r.x, r.z, r.call]));
    const t = a.reds[0].start + 3; for (const m of [a, b]) { m.players.forEach(p => { p.alive = false; }); m.players[0].alive = m.players[1].alive = true; m.players[0].hp = m.players[1].hp = 1e9; for (let i = 0; i < t * 30; i++) { m.step(1 / 30); m.drain(); } }
    const sa = a.shells.map(s => [s.x.toFixed(2), s.z.toFixed(2)]), sb = b.shells.map(s => [s.x.toFixed(2), s.z.toFixed(2)]);
    expect(sa.length).toBeGreaterThan(3); expect(sb).toEqual(sa); expect(RED.dur).toBeGreaterThan(3);
    for (const m of [a, b]) while (m.t < m.drops[0].at + 1) { m.step(1 / 30); m.drain(); }
    const da = a.loot.filter(l => l.id >= 900000 && l.id < 1_000_000).map(l => [l.id, l.kind, l.weapon]), db = b.loot.filter(l => l.id >= 900000 && l.id < 1_000_000).map(l => [l.id, l.kind, l.weapon]);
    expect(da.length).toBeGreaterThan(0); expect(db).toEqual(da);
  });
  it('방장이 모는 차는 손님 쪽에서 따라 움직이고, 손님 쪽 피해는 방장이 내구도를 정한다', () => {
    const { host, guest, run } = pair(); const v = host.vehicles[0], p = host.players[0];
    p.air = 0; p.alt = 0; host.enterVehicle(p, v); p.input = { ...blankInput(), mz: 1 };
    run(3); const gv = guest.vehicles[0];
    expect(Math.hypot(v.x - gv.x, v.z - gv.z)).toBeLessThan(3); expect(gv.driver).toBe(0); expect(guest.players[0].veh).toBe(0);
    guest.hurtVehicle(gv, 9999, 1); expect(gv.wreck).toBe(false); // 손님은 차를 직접 부수지 못합니다
    host.hurtVehicle(v, 9999, 1); expect(v.wreck).toBe(true); run(0.3); expect(gv.wreck).toBe(true);
  });
  it('손님이 모는 차는 손님이 굴리고, 방장은 받은 위치로 따라간다', () => {
    const { host, guest, hs, gs } = pair(); const v = guest.vehicles[1], me = guest.players[1];
    me.air = 0; me.alt = 0; me.x = v.x + 2; me.z = v.z; me.input = { ...blankInput(), interact: true }; guest.step(1 / 60);
    expect(guest.drain().some(e => e.t === 'vreq' && e.id === 1)).toBe(true); expect(me.veh).toBe(-1); // 허락 전에는 타지 않습니다
    host.enterVehicle(host.players[1], host.vehicles[1]); host.vehicles[1].remote = true; v.remote = false; guest.enterVehicle(me, v); me.input = { ...blankInput(), mz: 1 };
    for (let i = 0; i < 120; i++) { guest.step(1 / 60); guest.drain(); hs.vehicleState(host.vehicles[1], v.x, v.z, v.yaw, v.speed, 1, true, i); hs.step(1 / 60); host.step(1 / 60); host.drain(); }
    expect(Math.hypot(v.x - host.vehicles[1].x, v.z - host.vehicles[1].z)).toBeLessThan(2); expect(host.players[1].x).toBeCloseTo(host.vehicles[1].x, 3);
    void gs;
  });
  it('방장이 나가면 넘겨받은 손님 쪽 AI 가 다시 생각한다', () => {
    const guest = room(false, 1); guest.takeAuthority(); expect(guest.authority).toBe(true);
    expect(guest.players.filter(p => p.bot).every(p => !p.remote && p.brain)).toBe(true); expect(guest.vehicles.every(v => !v.remote)).toBe(true);
  });
  it('위치 메시지에 낙하 상태·차량을 실어 보내고 읽는다', () => {
    const p = parsePose(poseMsg({ x: 1, z: 2, yaw: 0.5, pitch: 0, hp: 90, armor: 0, w: 'rifle', speed: 3, ads: false, reloading: false, air: 3, alt: 120.4, veh: 4, vs: [1, 2, 0.5, 12.3] }))!;
    expect(p.air).toBe(3); expect(p.alt).toBe(120); expect(p.veh).toBe(4); expect(p.vs).toEqual([1, 2, 0.5, 12.3]);
    const q = parsePose(poseMsg({ x: 1, z: 2, yaw: 0, pitch: 0, hp: 90, armor: 0, w: 'rifle', speed: 3, ads: false, reloading: false }))!; expect(q.veh).toBeUndefined(); expect(q.air).toBeUndefined();
  });
  it('이상한 전리품·세계 메시지는 무시한다', () => {
    expect(parseLoot({ t: 'la', i: 5, k: 'nuke', w: null, x: 0, z: 0 })).toBeNull();
    expect(parseLoot({ t: 'la', i: 5, k: 'weapon', w: 'laser', x: 0, z: 0 })).toBeNull();
    expect(parseLoot({ t: 'la', i: 5, k: 'weapon', w: 'rifle', x: 0, z: 0, a: { sight: 'suppressor' } })).toBeNull();
    const guest = room(false, 1), gs = new WorldSync(guest), x = guest.players[4].x;
    gs.apply({ t: 'w', b: [4, 'x', 1], vv: [999, 1, 2, 3, 4, 5, 6], vh: [0, -5], s: [[1, 2]] }, 0); gs.step(0.1); expect(guest.players[4].x).toBe(x);
  });
});
